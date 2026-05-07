/**
 * 「テスト顧客情報」DBを作成し、LP DBにrelation列を追加する移行スクリプト
 *
 * 実行前提:
 *   - setup-notion.mjs 実行済み
 *   - .env に NOTION_TOKEN, NOTION_PARENT_PAGE_ID, NOTION_LP_DATABASE_ID あり
 *
 * このスクリプトでやること:
 *   1. 「テスト顧客情報」DBを作成
 *   2. デフォルトプロファイル行を追加（.envの既存値から移行）
 *   3. LP DBに「顧客プロファイル」relation列を追加
 *   4. toesella既存行をデフォルトプロファイルにリンク
 */
import 'dotenv/config';

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const PARENT_PAGE_ID = process.env.NOTION_PARENT_PAGE_ID;
const LP_DB_ID = process.env.NOTION_LP_DATABASE_ID;
const NOTION_VERSION = '2022-06-28';

if (!NOTION_TOKEN || !PARENT_PAGE_ID || !LP_DB_ID) {
  console.error('✗ NOTION_TOKEN / NOTION_PARENT_PAGE_ID / NOTION_LP_DATABASE_ID が .env に必要');
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
    console.error(`✗ Notion API ${res.status}: ${JSON.stringify(data, null, 2)}`);
    throw new Error(data.message);
  }
  return data;
}

console.log('→ 「テスト顧客情報」DBを作成中...');
const profilesDb = await api('POST', '/databases', {
  parent: { type: 'page_id', page_id: PARENT_PAGE_ID },
  title: [{ type: 'text', text: { content: 'テスト顧客情報' } }],
  properties: {
    プロファイル名: { title: {} },
    姓: { rich_text: {} },
    名: { rich_text: {} },
    姓フリガナ: { rich_text: {} },
    名フリガナ: { rich_text: {} },
    電話: { rich_text: {} },
    メアドドメイン: { rich_text: {} },
    郵便番号: { rich_text: {} },
    都道府県: { rich_text: {} },
    市区町村: { rich_text: {} },
    番地: { rich_text: {} },
    建物名: { rich_text: {} },
    カード番号: { rich_text: {} },
    カード名義: { rich_text: {} },
    CVC: { rich_text: {} },
    メモ: { rich_text: {} },
  },
});
console.log(`  ✓ ${profilesDb.id}`);

console.log('→ デフォルトプロファイルを登録中（.envから移行）...');
const t = (v) => ({ rich_text: [{ text: { content: v || '' } }] });
const defaultProfile = await api('POST', '/pages', {
  parent: { database_id: profilesDb.id },
  properties: {
    プロファイル名: { title: [{ text: { content: 'デフォルト' } }] },
    姓: t('テスト'),
    名: t('テスト'),
    姓フリガナ: t('てすと'),
    名フリガナ: t('てすと'),
    電話: t('08000000000'),
    メアドドメイン: t(process.env.TEST_EMAIL_DOMAIN || 'example.com'),
    郵便番号: t(process.env.TEST_POSTAL_CODE || '1000001'),
    都道府県: t(process.env.TEST_PREFECTURE || '東京都'),
    市区町村: t(process.env.TEST_CITY || '千代田区'),
    番地: t(process.env.TEST_ADDRESS1 || '千代田1-1-1'),
    建物名: t(process.env.TEST_ADDRESS2 || 'テストビル999F'),
    カード番号: t(process.env.TEST_CARD_NUMBER || ''),
    カード名義: t(process.env.TEST_CARD_HOLDER_NAME || ''),
    CVC: t(process.env.TEST_CARD_CVC || ''),
    メモ: t('共通デフォルト。新規LPで上書き不要なら、このプロファイルを参照する'),
  },
});
console.log(`  ✓ ${defaultProfile.id}`);

console.log('→ LP DBに「顧客プロファイル」relation列を追加中...');
await api('PATCH', `/databases/${LP_DB_ID}`, {
  properties: {
    顧客プロファイル: {
      relation: {
        database_id: profilesDb.id,
        single_property: {},
      },
    },
  },
});
console.log('  ✓');

console.log('→ toesellaの既存行をデフォルトプロファイルとリンク中...');
const lps = await api('POST', `/databases/${LP_DB_ID}/query`, {
  filter: { property: 'シナリオID', rich_text: { equals: 'toesella-handserum' } },
});
if (lps.results.length > 0) {
  await api('PATCH', `/pages/${lps.results[0].id}`, {
    properties: {
      顧客プロファイル: { relation: [{ id: defaultProfile.id }] },
    },
  });
  console.log(`  ✓ ${lps.results[0].id}`);
} else {
  console.log('  - toesellaの行が見つかりませんでした（手動でリンクしてください）');
}

console.log('\n✅ 完了！\n');
console.log('以下を .env に追記してください:');
console.log('────────────────────────────────────');
console.log(`NOTION_PROFILES_DATABASE_ID=${profilesDb.id}`);
console.log('────────────────────────────────────');
console.log('\n以下の項目は .env / GitHub Secrets から削除してOK:');
console.log('  TEST_CARD_NUMBER, TEST_CARD_CVC, TEST_CARD_HOLDER_NAME');
console.log('  TEST_EMAIL_DOMAIN');
console.log('  TEST_POSTAL_CODE 〜 TEST_ADDRESS2');
console.log('  TEST_CARD_EXPIRY_MONTH, TEST_CARD_EXPIRY_YEAR (もとから空でも可)');
