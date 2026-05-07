# Streamlit UI

LPテスト購入自動化のダッシュボード。

## 構成

```
streamlit/
├── app.py                  # ホーム
├── pages/
│   ├── 1_LP一覧.py        # LP一覧 + 実行ボタン
│   └── 2_実行履歴.py       # 直近の実行履歴
├── lib/
│   ├── notion_client.py    # Notion API
│   └── github_client.py    # GitHub API（Actions起動）
├── requirements.txt
└── .streamlit/
    └── secrets.toml.example
```

## ローカルで動かす

1. Python依存をインストール
   ```bash
   cd streamlit
   pip install -r requirements.txt
   ```

2. Secrets ファイルを用意
   ```bash
   cp .streamlit/secrets.toml.example .streamlit/secrets.toml
   # secrets.toml を編集して値を入れる
   ```

3. 起動
   ```bash
   streamlit run app.py
   ```

## Streamlit Cloud にデプロイ

1. https://share.streamlit.io にログイン（GitHub連携）
2. 「New app」
3. 設定：
   - Repository: `fromco-spec/lp-test-purchase`
   - Branch: `main`
   - Main file path: `streamlit/app.py`
4. 「Advanced settings」→「Secrets」に `secrets.toml.example` の中身をコピペし、値を入れる
5. 「Deploy」
