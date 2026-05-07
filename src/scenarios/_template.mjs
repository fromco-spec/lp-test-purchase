/**
 * シナリオテンプレート。新しいLPを追加するときは、このファイルをコピーして
 * src/scenarios/<lp-name>.mjs にリネームし、TARGET_URLとrun()内を実装する。
 *
 * 引数:
 *   page      Playwrightのpage（メインフレーム）
 *   context   Playwrightのcontext
 *   env       .env を読み込んだ設定（テストカード等）
 *   customer  テスト顧客データ（毎回ユニーク生成）
 *   recorder  { log, step, dump } ログ・スクショ・JSONダンプ用
 *
 * 戻り値: { ok: true, orderNumber?: string, ... } / { ok: false, error: '...' }
 */

const TARGET_URL = 'https://example.com/lp';

export async function run({ page, env, customer, recorder }) {
  recorder.log(`navigate ${TARGET_URL}`);
  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await recorder.step(page, 'landed');

  // TODO: codegenで記録した操作をここに整理して書く
  // await page.getByRole('link', { name: '購入' }).click();
  // await page.getByLabel('お名前').fill(customer.fullName);
  // ...

  // TODO: サンキューページ判定
  // await page.waitForURL(/thank/);
  // const orderNumber = await page.locator('.order-number').textContent();

  return { ok: false, error: 'not implemented' };
}
