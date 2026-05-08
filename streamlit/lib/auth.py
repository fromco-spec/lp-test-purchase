"""パスワード認証ゲート（Streamlit用）"""
import streamlit as st


def check_password() -> bool:
    """認証OKならTrue、未認証ならログイン画面を表示してFalse"""
    if st.session_state.get("authenticated"):
        return True

    expected = st.secrets.get("APP_PASSWORD")
    if not expected:
        # APP_PASSWORD未設定（ローカル開発時など）は素通し
        return True

    st.title("🔒 LPテスト購入自動化")
    st.caption("管理者パスワードを入力してください")

    with st.form("login_form"):
        pwd = st.text_input("パスワード", type="password")
        submitted = st.form_submit_button("ログイン", type="primary")
        if submitted:
            if pwd == expected:
                st.session_state.authenticated = True
                st.rerun()
            else:
                st.error("パスワードが違います")
    return False


def require_auth():
    """各ページの先頭で呼ぶ。未認証ならアプリを停止する"""
    if not check_password():
        st.stop()
