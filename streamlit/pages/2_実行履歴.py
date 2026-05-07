"""実行履歴ページ - Notion 実行履歴DBから読み取り表示"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from datetime import datetime
import streamlit as st
from lib.notion_client import NotionClient

st.set_page_config(page_title="実行履歴", layout="wide")
st.title("実行履歴")


@st.cache_data(ttl=15)
def fetch_runs(limit: int):
    notion = NotionClient(
        token=st.secrets["NOTION_TOKEN"],
        lp_db=st.secrets["NOTION_LP_DATABASE_ID"],
        runs_db=st.secrets["NOTION_RUNS_DATABASE_ID"],
        profiles_db=st.secrets["NOTION_PROFILES_DATABASE_ID"],
    )
    return notion.list_runs(limit=limit), notion.list_lps()


col_left, col_right = st.columns([4, 1])
with col_left:
    st.caption("Notion「実行履歴」DBから読み取り（最新順）")
with col_right:
    if st.button("再読み込み", use_container_width=True):
        fetch_runs.clear()
        st.rerun()

limit = st.slider("表示件数", 5, 100, 30, step=5)

try:
    runs, lps = fetch_runs(limit)
except Exception as e:
    st.error(f"Notionから取得できませんでした: {e}")
    st.stop()

if not runs:
    st.info("実行履歴がまだありません。LP一覧から実行してください。")
    st.stop()

# LPフィルター
lp_dict = {lp["id"]: lp["name"] for lp in lps}
lp_options = ["すべて"] + sorted({lp_dict.get(r["lp_id"], "(不明)") for r in runs})
lp_filter = st.selectbox("LPフィルター", options=lp_options)

# サマリー
status_counts = {}
for r in runs:
    status_counts[r["status"]] = status_counts.get(r["status"], 0) + 1

cols = st.columns(4)
cols[0].metric("総実行数", len(runs))
cols[1].metric("成功", status_counts.get("成功", 0))
cols[2].metric("失敗", status_counts.get("失敗", 0))
cols[3].metric("待機中/実行中", status_counts.get("待機中", 0) + status_counts.get("実行中", 0))

st.divider()


def fmt_dt(s: str) -> str:
    if not s:
        return ""
    try:
        # Notion is ISO with timezone
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        return dt.strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return s


def status_emoji(s: str) -> str:
    return {"成功": "✅", "失敗": "❌", "実行中": "🔄", "待機中": "⏳"}.get(s, "❓")


for r in runs:
    lp_name = lp_dict.get(r["lp_id"], "(不明なLP)")
    if lp_filter != "すべて" and lp_name != lp_filter:
        continue

    with st.container():
        c1, c2 = st.columns([3, 1])
        with c1:
            st.markdown(f"### {status_emoji(r['status'])} {r['run_id']}")
            st.caption(f"LP: {lp_name} / トリガー: {r['trigger'] or '-'}")
        with c2:
            st.markdown(f"[Notionで開く]({r['url']})")

        c1, c2, c3, c4 = st.columns(4)
        c1.write(f"**ステータス**: {r['status']}")
        c2.write(f"**所要**: {r['duration_seconds'] or '-'} 秒")
        c3.write(f"**開始**: {fmt_dt(r['started_at'])}")
        c4.write(f"**完了**: {fmt_dt(r['completed_at'])}")

        if r["customer_email"]:
            st.caption(f"顧客メアド: `{r['customer_email']}`")
        if r["thank_you_match"]:
            st.caption(f"サンキュー検出: {r['thank_you_match']}")
        if r["error"]:
            # 失敗フェーズを抽出して目立たせる
            err = r["error"]
            failed_phase = None
            if err.startswith("[失敗フェーズ: "):
                end = err.find("]")
                if end > 0:
                    failed_phase = err[len("[失敗フェーズ: "):end]
                    err = err[end + 1:].lstrip("\n")
            if failed_phase:
                st.error(f"❌ **失敗ステップ: {failed_phase}**")
            with st.expander("エラー詳細"):
                st.code(err)

        st.divider()
