/**
 * Notion APIクライアント
 * - テスト対象LPの検索
 * - 実行履歴(Runs)の作成・更新
 *
 * 必要な環境変数:
 *   NOTION_TOKEN
 *   NOTION_LP_DATABASE_ID
 *   NOTION_RUNS_DATABASE_ID
 */
import 'dotenv/config';

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const LP_DB_ID = process.env.NOTION_LP_DATABASE_ID;
const RUNS_DB_ID = process.env.NOTION_RUNS_DATABASE_ID;
const NOTION_VERSION = '2022-06-28';

export const notionEnabled = !!(NOTION_TOKEN && LP_DB_ID && RUNS_DB_ID);

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
    throw new Error(`Notion API ${res.status}: ${data.message || JSON.stringify(data)}`);
  }
  return data;
}

/** LPページを検索する。id / scenarioId / name のいずれかで指定 */
export async function findLp({ id, scenarioId, name }) {
  if (id) {
    return await api('GET', `/pages/${id}`);
  }
  let filter;
  if (scenarioId) {
    filter = { property: 'シナリオID', rich_text: { equals: scenarioId } };
  } else if (name) {
    filter = { property: 'Name', title: { equals: name } };
  } else {
    throw new Error('findLp: id, scenarioId, or name required');
  }
  const result = await api('POST', `/databases/${LP_DB_ID}/query`, { filter });
  return result.results[0] || null;
}

/** LPページのプロパティを使いやすい形に変換 */
export function extractLpFields(lpPage) {
  const p = lpPage.properties;
  return {
    id: lpPage.id,
    name: p.Name?.title?.[0]?.plain_text || '',
    url: p.URL?.url || '',
    formType: p['フォーム形式']?.select?.name || '',
    scenarioId: p['シナリオID']?.rich_text?.[0]?.plain_text || '',
    status: p['状態']?.select?.name || '',
    memo: p['メモ']?.rich_text?.[0]?.plain_text || '',
    profileId: p['顧客プロファイル']?.relation?.[0]?.id || null,
  };
}

/** プロファイルページを取得 */
export async function fetchProfile(profileId) {
  const page = await api('GET', `/pages/${profileId}`);
  return extractProfileFields(page);
}

/** デフォルトプロファイル（プロファイル名=「デフォルト」）を検索 */
export async function findDefaultProfile() {
  const PROFILES_DB_ID = process.env.NOTION_PROFILES_DATABASE_ID;
  if (!PROFILES_DB_ID) {
    throw new Error('NOTION_PROFILES_DATABASE_ID が未設定');
  }
  const result = await api('POST', `/databases/${PROFILES_DB_ID}/query`, {
    filter: { property: 'プロファイル名', title: { equals: 'デフォルト' } },
  });
  return result.results[0] ? extractProfileFields(result.results[0]) : null;
}

/** プロファイルページのプロパティを使いやすい形に変換 */
export function extractProfileFields(profilePage) {
  const p = profilePage.properties;
  const t = (k) => p[k]?.rich_text?.[0]?.plain_text || '';
  return {
    id: profilePage.id,
    name: p['プロファイル名']?.title?.[0]?.plain_text || '',
    lastName: t('姓'),
    firstName: t('名'),
    lastNameKana: t('姓フリガナ'),
    firstNameKana: t('名フリガナ'),
    phone: t('電話'),
    emailDomain: t('メアドドメイン'),
    postalCode: t('郵便番号'),
    prefecture: t('都道府県'),
    city: t('市区町村'),
    address1: t('番地'),
    address2: t('建物名'),
    cardNumber: t('カード番号'),
    cardHolder: t('カード名義'),
    cvc: t('CVC'),
    memo: t('メモ'),
  };
}

/** 実行履歴ページを作成（status=待機中） */
export async function createRun({ lpId, trigger = '手動' }) {
  const now = new Date();
  const ts = now.toISOString().replace(/[-:T.]/g, '').slice(0, 14);
  const runId = `RUN-${ts}`;
  const page = await api('POST', '/pages', {
    parent: { database_id: RUNS_DB_ID },
    properties: {
      実行ID: { title: [{ text: { content: runId } }] },
      LP: { relation: [{ id: lpId }] },
      ステータス: { select: { name: '待機中' } },
      トリガー: { select: { name: trigger } },
      開始時刻: { date: { start: now.toISOString() } },
    },
  });
  return { id: page.id, runId };
}

/** 実行履歴ページを更新 */
export async function updateRun(runPageId, fields) {
  const props = {};
  if (fields.status) props['ステータス'] = { select: { name: fields.status } };
  if (fields.completedAt) props['完了時刻'] = { date: { start: fields.completedAt } };
  if (fields.customerEmail !== undefined) {
    props['顧客メアド'] = { rich_text: [{ text: { content: fields.customerEmail } }] };
  }
  if (fields.orderNumber) {
    props['注文番号'] = { rich_text: [{ text: { content: fields.orderNumber } }] };
  }
  if (fields.thankYouMatch) {
    props['サンキュー検出'] = { rich_text: [{ text: { content: fields.thankYouMatch } }] };
  }
  if (fields.error) {
    // Notion rich_text は最大2000文字
    props['エラー'] = { rich_text: [{ text: { content: String(fields.error).slice(0, 2000) } }] };
  }
  if (fields.artifactsUrl) {
    props['アーティファクト'] = { url: fields.artifactsUrl };
  }
  if (fields.durationSeconds != null) {
    props['所要時間(秒)'] = { number: fields.durationSeconds };
  }
  return await api('PATCH', `/pages/${runPageId}`, { properties: props });
}
