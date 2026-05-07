/**
 * Notion DB セットアップスクリプト（一回だけ実行）
 *
 * 作成するもの:
 *   1. 「テスト対象LP」データベース
 *   2. 「実行履歴」データベース（テスト対象LPへのリレーション付き）
 *   3. toesellaサンプル行 + 子ページに購入手順
 *
 * 必要な環境変数（.env）:
 *   NOTION_TOKEN              内部インテグレーションのシークレット (secret_xxx...)
 *   NOTION_PARENT_PAGE_ID     2つのDBを置く親ページのID（URL末尾の32文字）
 */
import 'dotenv/config';

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const PARENT_PAGE_ID = process.env.NOTION_PARENT_PAGE_ID;
const NOTION_VERSION = '2022-06-28';

if (!NOTION_TOKEN || !PARENT_PAGE_ID) {
  console.error(
    '✗ NOTION_TOKEN または NOTION_PARENT_PAGE_ID が .env に設定されていません',
  );
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${NOTION_TOKEN}`,
  'Notion-Version': NOTION_VERSION,
  'Content-Type': 'application/json',
};

async function api(method, endpoint, body) {
  const res = await fetch(`https://api.notion.com/v1${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    console.error(`\n✗ Notion API error: ${res.status}`);
    console.error(JSON.stringify(data, null, 2));
    throw new Error(data.message || 'API error');
  }
  return data;
}

console.log('→ 「テスト対象LP」DBを作成中...');
const lpDb = await api('POST', '/databases', {
  parent: { type: 'page_id', page_id: PARENT_PAGE_ID },
  title: [{ type: 'text', text: { content: 'テスト対象LP' } }],
  properties: {
    Name: { title: {} },
    URL: { url: {} },
    フォーム形式: {
      select: {
        options: [
          { name: 'Botchan', color: 'blue' },
          { name: 'HTMLフォーム', color: 'green' },
          { name: 'その他', color: 'gray' },
        ],
      },
    },
    シナリオID: { rich_text: {} },
    状態: {
      select: {
        options: [
          { name: '有効', color: 'green' },
          { name: '一時停止', color: 'yellow' },
          { name: '下書き', color: 'gray' },
        ],
      },
    },
    メモ: { rich_text: {} },
  },
});
console.log(`  ✓ ${lpDb.id}`);

console.log('→ 「実行履歴」DBを作成中...');
const runsDb = await api('POST', '/databases', {
  parent: { type: 'page_id', page_id: PARENT_PAGE_ID },
  title: [{ type: 'text', text: { content: '実行履歴' } }],
  properties: {
    実行ID: { title: {} },
    LP: { relation: { database_id: lpDb.id, single_property: {} } },
    ステータス: {
      select: {
        options: [
          { name: '待機中', color: 'gray' },
          { name: '実行中', color: 'blue' },
          { name: '成功', color: 'green' },
          { name: '失敗', color: 'red' },
        ],
      },
    },
    トリガー: {
      select: {
        options: [
          { name: '手動', color: 'blue' },
          { name: 'スケジュール', color: 'purple' },
          { name: 'API', color: 'orange' },
        ],
      },
    },
    開始時刻: { date: {} },
    完了時刻: { date: {} },
    顧客メアド: { rich_text: {} },
    注文番号: { rich_text: {} },
    サンキュー検出: { rich_text: {} },
    エラー: { rich_text: {} },
    アーティファクト: { url: {} },
    '所要時間(秒)': { number: {} },
  },
});
console.log(`  ✓ ${runsDb.id}`);

console.log('→ toesellaサンプル行 + 購入手順ページを作成中...');
const procedureBlocks = [
  { object: 'block', type: 'heading_2', heading_2: { rich_text: [{ text: { content: '購入手順' } }] } },
  { object: 'block', type: 'numbered_list_item', numbered_list_item: { rich_text: [{ text: { content: 'LPトップを開く' } }] } },
  { object: 'block', type: 'numbered_list_item', numbered_list_item: { rich_text: [{ text: { content: 'CTA「若見えケアを今すぐ始める」をクリック' } }] } },
  { object: 'block', type: 'numbered_list_item', numbered_list_item: { rich_text: [{ text: { content: 'チャット内の商品画像をクリック → 「次へ」' } }] } },
  { object: 'block', type: 'numbered_list_item', numbered_list_item: { rich_text: [{ text: { content: '姓・名・フリガナ姓・フリガナ名を入力 → 「次へ」（フリガナはひらがな）' } }] } },
  { object: 'block', type: 'numbered_list_item', numbered_list_item: { rich_text: [{ text: { content: '電話番号・メアドを入力 → 「次へ」' } }] } },
  { object: 'block', type: 'numbered_list_item', numbered_list_item: { rich_text: [{ text: { content: 'パスワード(4桁: 0000)を入力 → 「次へ」' } }] } },
  { object: 'block', type: 'numbered_list_item', numbered_list_item: { rich_text: [{ text: { content: '郵便番号・番地・建物名を入力 → 「次へ」' } }] } },
  { object: 'block', type: 'numbered_list_item', numbered_list_item: { rich_text: [{ text: { content: '「クレジットカード」を選択 → 「次へ」' } }] } },
  { object: 'block', type: 'numbered_list_item', numbered_list_item: { rich_text: [{ text: { content: 'カード番号・名義・有効期限・CVCを入力 → 「次へ」' } }] } },
  { object: 'block', type: 'numbered_list_item', numbered_list_item: { rich_text: [{ text: { content: '「ご注文完了へ」をクリック' } }] } },
  { object: 'block', type: 'heading_3', heading_3: { rich_text: [{ text: { content: '成功判定' } }] } },
  { object: 'block', type: 'paragraph', paragraph: { rich_text: [{ text: { content: 'チャット末尾に「最後にコース内容のご確認になります」が表示されればOK' } }] } },
];

const sampleLp = await api('POST', '/pages', {
  parent: { database_id: lpDb.id },
  properties: {
    Name: { title: [{ text: { content: 'toesella ホワイトハンドセラム (base_cp)' } }] },
    URL: { url: 'https://www.toesella.com/biyoueki/lp/hand/base_cp.html' },
    フォーム形式: { select: { name: 'Botchan' } },
    シナリオID: { rich_text: [{ text: { content: 'toesella-handserum' } }] },
    状態: { select: { name: '有効' } },
    メモ: { rich_text: [{ text: { content: 'クーポンLP（初回1980円・定期便のみ）。チャットボットはBotchan EFO。' } }] },
  },
  children: procedureBlocks,
});
console.log(`  ✓ ${sampleLp.id}`);

console.log('\n✅ Notion DB作成完了！\n');
console.log('以下を .env に追記してください:');
console.log('────────────────────────────────────');
console.log(`NOTION_LP_DATABASE_ID=${lpDb.id}`);
console.log(`NOTION_RUNS_DATABASE_ID=${runsDb.id}`);
console.log('────────────────────────────────────');
