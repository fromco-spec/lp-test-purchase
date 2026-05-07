# LPテスト購入自動化

複数のLPに対して、テスト購入を自動実行するツール。

## アーキテクチャ

```
src/
├── core/             # 全LP共通のユーティリティ
│   ├── env.mjs           # .env読込・検証
│   ├── customer.mjs      # テスト顧客データ生成
│   ├── browser.mjs       # Playwrightブラウザ起動
│   └── artifacts.mjs     # ログ・スクショ・トレース
├── scenarios/        # LPごとのシナリオ（1LP=1ファイル）
│   └── _template.mjs     # コピーして使うテンプレ
└── run.mjs           # 実行エントリ
```

## セットアップ

```bash
npm install
npx playwright install chromium

# .env を作成（テストカード情報・メアドドメインを記入）
cp .env.example .env
vi .env
```

## 新規LPの追加方法（3ステップ）

### 1. 操作を録画する

Playwright codegenで実ブラウザを起動し、購入フローを操作すると自動でJSコードが書き出される。

```bash
npm run record -- https://target-lp.com/
```

ブラウザが開くので、テスト購入を最後まで完走する（テストカード番号は .env のものを使う）。
完了したらブラウザを閉じると `recordings/recording.mjs` に操作が保存される。

### 2. シナリオファイルを作る

```bash
cp src/scenarios/_template.mjs src/scenarios/your-lp-name.mjs
```

`recordings/recording.mjs` の中身を参考に、シナリオファイルを編集：
- 直書きされた顧客情報を `customer.fullName` 等に置換
- 直書きされたカード情報を `env.card.number` 等に置換
- `recorder.step(page, 'ラベル')` を要所に挟む
- 最後にサンキューページの判定を入れる

### 3. 実行する

```bash
# ヘッドレスモード（デフォルト）
npm run run -- your-lp-name

# 画面表示モード（デバッグ用）
HEADLESS=0 npm run run -- your-lp-name
```

実行ログ・スクショは `artifacts/<scenario>-<timestamp>/` に保存される。

## セキュリティ原則

- 権限を最小限に：テスト用アカウント・テスト用決済のみ使用
- 顧客個人情報を流さない：すべてダミーデータで完結
- テスト注文と本番注文を区別：氏名「テスト テスト」、メアドに `+autotest-{timestamp}` マーカー

## 既存シナリオ

| LP | シナリオ名 | 備考 |
|---|---|---|
| toesella ホワイトハンドセラム | `toesella-handserum` | Botchanチャットボット型 |
