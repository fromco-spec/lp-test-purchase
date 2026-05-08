"""LPテスト購入自動化 - ホーム"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import streamlit as st
from lib.auth import require_auth

st.set_page_config(
    page_title="LPテスト購入自動化",
    page_icon="🛒",
    layout="wide",
)

require_auth()

st.title("LPテスト購入自動化")

st.markdown("""
このダッシュボードでは、登録済みLPに対してテスト購入を自動実行できます。

### 使い方
- 左サイドバーの **LP一覧** から、対象LPを選んで実行ボタンを押す
- **実行履歴** で過去の実行結果を確認

### 仕組み
1. ボタン押下 → GitHub Actionsが起動
2. クラウド上でPlaywright + シナリオが実行
3. 結果はNotionの「実行履歴」DBに自動記録
4. このダッシュボードはNotionから読み取り表示

実行マシンは GitHub のクラウド環境なので、ローカルPCの状態に関わらず動きます。
""")

st.divider()

# 設定確認
with st.expander("接続設定の確認", expanded=False):
    required = [
        "NOTION_TOKEN",
        "NOTION_LP_DATABASE_ID",
        "NOTION_RUNS_DATABASE_ID",
        "NOTION_PROFILES_DATABASE_ID",
        "GITHUB_REPO",
        "GITHUB_TOKEN",
    ]
    for k in required:
        try:
            v = st.secrets[k]
            masked = (v[:6] + "..." + v[-4:]) if len(v) > 12 else "***"
            st.success(f"{k}: {masked}")
        except (KeyError, FileNotFoundError):
            st.error(f"{k}: 未設定")
