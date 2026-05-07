import { loadEnv } from './core/env.mjs';
import { makeTestCustomer } from './core/customer.mjs';
import { launchBrowser, closeBrowser } from './core/browser.mjs';
import { makeRecorder } from './core/artifacts.mjs';
import { notionEnabled, findLp, extractLpFields, createRun, updateRun } from './core/notion.mjs';

// 引数パース
//   node src/run.mjs <scenario>            ローカル実行のみ
//   node src/run.mjs --lp-id <pageId>      Notionから検索→実行→結果書き戻し
//   node src/run.mjs --lp-name "<name>"    同上、名前で検索
//   node src/run.mjs --lp-scenario <id>    同上、シナリオIDで検索
//   オプション: --trigger <手動|スケジュール|API>
const args = process.argv.slice(2);
let scenarioName = null;
let lpRef = null;
let trigger = '手動';

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--lp-id') lpRef = { type: 'id', value: args[++i] };
  else if (a === '--lp-name') lpRef = { type: 'name', value: args[++i] };
  else if (a === '--lp-scenario') lpRef = { type: 'scenario', value: args[++i] };
  else if (a === '--trigger') trigger = args[++i];
  else if (a === '--scenario') scenarioName = args[++i];
  else if (!a.startsWith('--')) scenarioName = a;
}

let lpFields = null;

// LP参照があればNotionから引いてくる
if (lpRef) {
  if (!notionEnabled) {
    console.error('✗ Notionが未設定です（NOTION_TOKEN, NOTION_LP_DATABASE_ID, NOTION_RUNS_DATABASE_ID を .env に設定してください）');
    process.exit(1);
  }
  console.log(`Notion LP検索中: ${lpRef.type}=${lpRef.value}`);
  const lookup =
    lpRef.type === 'id' ? { id: lpRef.value } :
    lpRef.type === 'name' ? { name: lpRef.value } :
    { scenarioId: lpRef.value };
  const lp = await findLp(lookup);
  if (!lp) {
    console.error(`LP not found: ${lpRef.type}=${lpRef.value}`);
    process.exit(1);
  }
  lpFields = extractLpFields(lp);
  scenarioName = lpFields.scenarioId;
  console.log(`Notion LP: ${lpFields.name} → scenario=${scenarioName}`);
}

if (!scenarioName) {
  console.error(
    [
      '使い方:',
      '  node src/run.mjs <scenario>                  # ローカル実行のみ',
      '  node src/run.mjs --lp-id <notion_page_id>    # Notion経由（結果も書き戻し）',
      '  node src/run.mjs --lp-name "<LP名>"          # 同上（名前検索）',
      '  node src/run.mjs --lp-scenario <scenarioId>  # 同上（シナリオID検索）',
      'オプション:',
      '  --trigger <手動|スケジュール|API>',
      '  HEADLESS=0 (環境変数) でブラウザ表示',
    ].join('\n'),
  );
  process.exit(1);
}

const headless = process.env.HEADLESS !== '0';

const scenario = await import(`./scenarios/${scenarioName}.mjs`);
const env = loadEnv();
const customer = makeTestCustomer(env);

const ctx = await launchBrowser({ scenarioName, headless });
const recorder = makeRecorder(ctx.runDir);

recorder.log(`=== scenario: ${scenarioName} ===`);
if (lpFields) recorder.log(`LP: ${lpFields.name} (${lpFields.url})`);
recorder.log(`customer: ${customer.fullName} <${customer.email}>`);
recorder.dump('customer', customer);

// Notion 実行履歴: 待機中→実行中で作成
let notionRun = null;
const startTime = Date.now();
if (lpFields) {
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
}

let result = { ok: false };
try {
  result = await scenario.run({ ...ctx, env, customer, recorder });
  recorder.log(`=== result: ${JSON.stringify(result)} ===`);
} catch (e) {
  recorder.log(`!!! error: ${e.message}\n${e.stack}`);
  await ctx.page.screenshot({ path: `${ctx.runDir}/_error.png`, fullPage: true }).catch(() => {});
  result = { ok: false, error: e.message };
}

const duration = Math.round((Date.now() - startTime) / 1000);

// Notion 実行履歴: 結果を書き戻し
if (notionRun) {
  try {
    await updateRun(notionRun.id, {
      status: result.ok ? '成功' : '失敗',
      completedAt: new Date().toISOString(),
      customerEmail: customer.email,
      orderNumber: result.orderNumber || undefined,
      thankYouMatch: result.thankYouMatch || undefined,
      error: result.error || undefined,
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
