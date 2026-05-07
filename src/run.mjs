import 'dotenv/config';
import { makeTestCustomer } from './core/customer.mjs';
import { launchBrowser, closeBrowser } from './core/browser.mjs';
import { makeRecorder } from './core/artifacts.mjs';
import {
  notionEnabled,
  findLp,
  extractLpFields,
  fetchProfile,
  findDefaultProfile,
  createRun,
  updateRun,
} from './core/notion.mjs';

// 引数パース
//   node src/run.mjs --lp-id <pageId>      Notion LPページIDで実行
//   node src/run.mjs --lp-name "<name>"    名前検索
//   node src/run.mjs --lp-scenario <id>    シナリオIDで検索
//   オプション: --trigger <手動|スケジュール|API>
const args = process.argv.slice(2);
let lpRef = null;
let trigger = '手動';

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--lp-id') lpRef = { type: 'id', value: args[++i] };
  else if (a === '--lp-name') lpRef = { type: 'name', value: args[++i] };
  else if (a === '--lp-scenario') lpRef = { type: 'scenario', value: args[++i] };
  else if (a === '--trigger') trigger = args[++i];
}

if (!lpRef) {
  console.error(
    [
      '使い方:',
      '  node src/run.mjs --lp-id <notion_page_id>',
      '  node src/run.mjs --lp-name "<LP名>"',
      '  node src/run.mjs --lp-scenario <scenarioId>',
      'オプション:',
      '  --trigger <手動|スケジュール|API>',
      '  HEADLESS=0 (環境変数) でブラウザ表示',
    ].join('\n'),
  );
  process.exit(1);
}

if (!notionEnabled) {
  console.error('✗ Notion未設定（NOTION_TOKEN, NOTION_LP_DATABASE_ID, NOTION_RUNS_DATABASE_ID, NOTION_PROFILES_DATABASE_ID）');
  process.exit(1);
}

console.log(`Notion LP検索中: ${lpRef.type}=${lpRef.value}`);
const lookup =
  lpRef.type === 'id' ? { id: lpRef.value } :
  lpRef.type === 'name' ? { name: lpRef.value } :
  { scenarioId: lpRef.value };
const lp = await findLp(lookup);
if (!lp) {
  console.error(`✗ LPが見つかりません: ${lpRef.type}=${lpRef.value}`);
  process.exit(1);
}
const lpFields = extractLpFields(lp);
console.log(`Notion LP: ${lpFields.name} → scenario=${lpFields.scenarioId}`);

// プロファイル取得（LP個別 or デフォルト）
let profile;
if (lpFields.profileId) {
  console.log(`プロファイル取得中: ${lpFields.profileId}`);
  profile = await fetchProfile(lpFields.profileId);
} else {
  console.log('LPに顧客プロファイル未設定 → デフォルトを使用');
  profile = await findDefaultProfile();
  if (!profile) {
    console.error('✗ デフォルトプロファイルが見つかりません');
    process.exit(1);
  }
}
console.log(`プロファイル: ${profile.name} (${profile.lastName} ${profile.firstName})`);

const headless = process.env.HEADLESS !== '0';
const scenarioName = lpFields.scenarioId;
const scenario = await import(`./scenarios/${scenarioName}.mjs`);
const customer = makeTestCustomer(profile);

const ctx = await launchBrowser({ scenarioName, headless });
const recorder = makeRecorder(ctx.runDir);

recorder.log(`=== scenario: ${scenarioName} ===`);
recorder.log(`LP: ${lpFields.name} (${lpFields.url})`);
recorder.log(`profile: ${profile.name}`);
recorder.log(`customer: ${customer.fullName} <${customer.email}>`);
recorder.dump('customer', { ...customer, card: { ...customer.card, number: '***', cvc: '***' } });

let notionRun = null;
const startTime = Date.now();
try {
  notionRun = await createRun({ lpId: lpFields.id, trigger });
  recorder.log(`Notion run created: ${notionRun.runId} (${notionRun.id})`);
  await updateRun(notionRun.id, {
    status: '実行中',
    customerEmail: customer.email,
  });
} catch (e) {
  recorder.log(`Notion run create/update failed: ${e.message}`);
}

let result = { ok: false };
try {
  result = await scenario.run({ ...ctx, customer, recorder });
  recorder.log(`=== result: ${JSON.stringify(result)} ===`);
} catch (e) {
  const failedPhase = e.failedAtPhase || recorder.getCurrentPhase() || '不明';
  recorder.log(`!!! error at phase "${failedPhase}": ${e.message}\n${e.stack}`);
  await ctx.page.screenshot({ path: `${ctx.runDir}/_error.png`, fullPage: true }).catch(() => {});
  result = { ok: false, error: e.message, failedPhase };
}

const duration = Math.round((Date.now() - startTime) / 1000);

if (notionRun) {
  try {
    // 失敗時はエラーメッセージの先頭にフェーズ名を入れる
    const errorWithPhase = result.error
      ? (result.failedPhase ? `[失敗フェーズ: ${result.failedPhase}]\n${result.error}` : result.error)
      : undefined;
    await updateRun(notionRun.id, {
      status: result.ok ? '成功' : '失敗',
      completedAt: new Date().toISOString(),
      customerEmail: customer.email,
      orderNumber: result.orderNumber || undefined,
      thankYouMatch: result.thankYouMatch || undefined,
      error: errorWithPhase,
      durationSeconds: duration,
    });
    recorder.log(`Notion run updated: status=${result.ok ? '成功' : '失敗'} duration=${duration}s`);
  } catch (e) {
    recorder.log(`Notion run update failed: ${e.message}`);
  }
}

recorder.dump('result', result);
await closeBrowser(ctx);

process.exit(result.ok ? 0 : 1);
