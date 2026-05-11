"""LP一覧ページ - 登録LPの表示と実行トリガー"""
from __future__ import annotations

import re
import sys
import time
from collections import OrderedDict
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import streamlit as st
from lib.auth import require_auth
from lib.notion_client import NotionClient
from lib.github_client import GitHubClient

st.set_page_config(page_title="LP一覧", layout="wide")
require_auth()
st.title("LP一覧")


@st.cache_data(ttl=30)
def fetch_lps():
    notion = NotionClient(
        token=st.secrets["NOTION_TOKEN"],
        lp_db=st.secrets["NOTION_LP_DATABASE_ID"],
        runs_db=st.secrets["NOTION_RUNS_DATABASE_ID"],
        profiles_db=st.secrets["NOTION_PROFILES_DATABASE_ID"],
    )
    return notion.list_lps()


def get_github():
    return GitHubClient(
        repo=st.secrets["GITHUB_REPO"],
        token=st.secrets["GITHUB_TOKEN"],
    )


def find_my_run(github, max_wait: int = 20) -> dict | None:
    """直近で起動した repository_dispatch の run を見つける"""
    start = time.time()
    while time.time() - start < max_wait:
        runs = github.list_recent_runs(limit=5, event="repository_dispatch")
        for r in runs:
            created = datetime.fromisoformat(r["created_at"].replace("Z", "+00:00"))
            if (datetime.now(timezone.utc) - created).total_seconds() < 60:
                return r
        time.sleep(2)
    return None


def watch_run(github, run_id: int, lp_name: str):
    """ランの進捗を監視して表示"""
    progress_placeholder = st.empty()
    status_placeholder = st.empty()
    steps_placeholder = st.empty()

    start = time.time()
    estimated_total = 180  # 約3分

    while True:
        elapsed = time.time() - start
        progress_value = min(elapsed / estimated_total, 0.97)

        try:
            run = github.get_run(run_id)
            jobs = github.get_run_jobs(run_id)
        except Exception as e:
            status_placeholder.error(f"状態取得失敗: {e}")
            time.sleep(5)
            continue

        status = run["status"]  # queued / in_progress / completed
        conclusion = run.get("conclusion")  # success / failure / etc.

        # ステータス別表示
        if status == "queued":
            status_text = "⏳ キュー待機中（GitHubのランナー起動待ち）"
        elif status == "in_progress":
            current_step = "..."
            for job in jobs:
                for step in job.get("steps", []):
                    if step["status"] == "in_progress":
                        current_step = step["name"]
                        break
            status_text = f"🔄 実行中: {current_step}"
        elif status == "completed":
            if conclusion == "success":
                progress_placeholder.progress(1.0, text=f"✅ 完了！ ({int(elapsed)}秒)")
                status_placeholder.success(f"テスト購入が成功しました 🎉")
                break
            else:
                progress_placeholder.progress(1.0, text=f"❌ 失敗 ({int(elapsed)}秒)")
                status_placeholder.error(f"テスト購入が失敗しました（{conclusion}）")
                break
        else:
            status_text = f"({status})"

        progress_placeholder.progress(progress_value, text=f"⏱ 経過: {int(elapsed)}秒 / 想定: {estimated_total}秒")
        status_placeholder.info(status_text)

        # ステップ詳細
        if jobs:
            steps_md = "**実行ステップ**:\n"
            for job in jobs:
                for step in job.get("steps", []):
                    icon = {
                        "completed": "✅" if step.get("conclusion") == "success" else "❌",
                        "in_progress": "🔄",
                        "queued": "⏳",
                    }.get(step["status"], "⏸")
                    steps_md += f"- {icon} {step['name']}\n"
            steps_placeholder.markdown(steps_md)

        time.sleep(4)

    st.markdown(f"📋 [GitHub Actionsで詳細を見る]({run['html_url']})")
    st.markdown(f"📊 [Notionの実行履歴を見る](/2_実行履歴)")


col_left, col_right = st.columns([4, 1])
with col_left:
    st.caption("Notion「テスト対象LP」DBから読み取り")
with col_right:
    if st.button("再読み込み", use_container_width=True):
        fetch_lps.clear()
        st.rerun()

try:
    lps = fetch_lps()
except Exception as e:
    st.error(f"Notionから取得できませんでした: {e}")
    st.stop()

if not lps:
    st.info("LPが1件も登録されていません。Notionの「テスト対象LP」DBに追加してください。")
    st.stop()

status_filter = st.selectbox(
    "状態フィルター",
    options=["すべて", "有効", "一時停止", "下書き"],
    index=1,
)
filtered = lps if status_filter == "すべて" else [lp for lp in lps if lp["status"] == status_filter]

st.write(f"{len(filtered)} 件 / 全 {len(lps)} 件")
st.divider()

# 実行中のランを管理
if "running_lp" not in st.session_state:
    st.session_state.running_lp = None


def _brand_key(lp) -> str:
    """商材グループのキー。シナリオID末尾の -soku を取り除いたもの。"""
    sid = lp.get("scenario_id") or ""
    if sid:
        return sid[: -len("-soku")] if sid.endswith("-soku") else sid
    return lp.get("name", "")


def _brand_label(lp_name: str) -> str:
    """LP名から商材名部分を抜き出す。"toesella <商材> (variant)" → <商材>。"""
    m = re.match(r"^\s*toesella\s+(.+?)\s*[（(]", lp_name)
    return m.group(1).strip() if m else lp_name


# 商材ごとにグルーピング（順序は最初に登場した順）
groups: "OrderedDict[str, list]" = OrderedDict()
for lp in filtered:
    groups.setdefault(_brand_key(lp), []).append(lp)

# 各グループ内は 通常版 → 即版 の順に並べる
for key in groups:
    groups[key].sort(key=lambda lp: (lp.get("scenario_id") or "").endswith("-soku"))

if not groups:
    st.info("条件に合うLPがありません")
    st.stop()


def render_lp_card(lp):
    """1件のLPカード描画。実行ボタン押下時はsession_stateに記録して進捗監視に入る。"""
    with st.container():
        c1, c2, c3 = st.columns([4, 1.5, 1.5])

        with c1:
            st.markdown(f"### {lp['name']}")
            if lp["url"]:
                st.markdown(f"🔗 [{lp['url']}]({lp['url']})")
            cap = []
            if lp["form_type"]:
                cap.append(f"形式: {lp['form_type']}")
            if lp["scenario_id"]:
                cap.append(f"シナリオ: `{lp['scenario_id']}`")
            if lp["status"]:
                cap.append(f"状態: {lp['status']}")
            st.caption(" / ".join(cap))
            if lp["memo"]:
                st.caption(lp["memo"])

        with c2:
            st.write("")
            if not lp["scenario_id"]:
                st.warning("シナリオ未設定")
            elif lp["status"] != "有効":
                st.info(f"状態: {lp['status']}")

        with c3:
            st.write("")
            run_disabled = (lp["status"] != "有効") or (not lp["scenario_id"])
            if st.button(
                "▶ 実行",
                key=f"run_{lp['id']}",
                disabled=run_disabled,
                use_container_width=True,
                type="primary",
            ):
                st.session_state.running_lp = lp["id"]
                try:
                    github = get_github()
                    github.trigger_workflow(lp_scenario=lp["scenario_id"], trigger="API")
                    st.toast(f"「{lp['name']}」を起動しました", icon="🚀")
                except Exception as e:
                    st.error(f"起動失敗: {e}")
                    st.session_state.running_lp = None

        if st.session_state.running_lp == lp["id"]:
            st.markdown("---")
            st.markdown(f"### 🔄 「{lp['name']}」 実行中...")
            try:
                github = get_github()
                with st.spinner("ワークフロー検出中..."):
                    target = find_my_run(github)
                if target:
                    watch_run(github, target["id"], lp["name"])
                else:
                    st.warning(
                        "ワークフロー起動を確認できませんでした。"
                        f"[GitHub Actionsで確認 →]({get_github().actions_url()})"
                    )
            except Exception as e:
                st.error(f"監視中エラー: {e}")
            finally:
                st.session_state.running_lp = None

        st.divider()


tab_labels = [_brand_label(lps[0]["name"]) for lps in groups.values()]
tabs = st.tabs(tab_labels)

for tab, lps_in_group in zip(tabs, groups.values()):
    with tab:
        for lp in lps_in_group:
            render_lp_card(lp)
