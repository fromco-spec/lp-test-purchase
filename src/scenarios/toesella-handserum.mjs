/**
 * to esella ホワイトハンドセラム（base_cpクーポンLP）
 *
 * 購入フォームはBotchan（チャットボット型EFO）で、iframe #wc-webchat 内に展開される。
 * 録画ベース: recordings/recording.mjs
 */

const TARGET_URL = 'https://www.toesella.com/biyoueki/lp/hand/base_cp.html';

export async function run({ page, env, customer, recorder }) {
  recorder.log(`navigate ${TARGET_URL}`);
  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForLoadState('load', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);
  await recorder.step(page, 'landed');

  // ── CTA: チャットボットを開く ──
  await page.getByRole('link', { name: '若見えケアを今すぐ始める' }).first().click();
  await page.waitForTimeout(2000);
  await recorder.step(page, 'cta_clicked');

  const chat = page.frameLocator('#wc-webchat');

  // ── 商品選択（チャット冒頭の画像をクリック） ──
  // Botchanは数秒かけてbotメッセージを順次表示するので、商品画像が出るまで待つ
  recorder.log('waiting for product image to appear in chat...');
  const productImage = chat.locator('.image_box > img:not([src=""])').first();
  await productImage.waitFor({ state: 'visible', timeout: 60000 });
  await recorder.step(page, 'product_image_visible');
  await productImage.click();
  await page.waitForTimeout(800);
  await chat.getByRole('button', { name: '次へ' }).click();
  await page.waitForTimeout(1500);
  await recorder.step(page, 'product_selected');

  // ── 「現在表示中のテキスト入力欄」を順に埋めるヘルパー ──
  // Botchanは過去の入力欄をDOMに残すがdisabledになるので、
  // visible(サイズあり) & enabled な text/tel/email input のみを「現在の入力対象」とみなす
  async function findVisibleTextInputs() {
    const handles = await chat.locator('input').elementHandles();
    const result = [];
    for (const h of handles) {
      const info = await h.evaluate((el) => ({
        isText: ['text', 'tel', 'email', ''].includes(el.type),
        isVisible: el.offsetWidth > 5 && el.offsetHeight > 5 && !!el.offsetParent,
        isEnabled: !el.disabled && !el.readOnly,
        placeholder: el.placeholder,
        type: el.type,
        value: el.value,
      }));
      if (info.isText && info.isVisible && info.isEnabled) {
        result.push({ handle: h, ...info });
      }
    }
    return result;
  }

  async function fillCurrentTextInputs(values, stepLabel) {
    // bot が新メッセージを表示するのを最大20秒待つ
    const start = Date.now();
    let visibleTextInputs = [];
    while (Date.now() - start < 20000) {
      visibleTextInputs = await findVisibleTextInputs();
      if (visibleTextInputs.length >= values.length) break;
      await page.waitForTimeout(500);
    }

    if (visibleTextInputs.length < values.length) {
      const allInputsDiag = await chat.locator('input').evaluateAll((els) =>
        els.filter((el) => el.offsetParent !== null).map((el) => ({
          type: el.type, placeholder: el.placeholder, name: el.name,
          id: el.id, disabled: el.disabled, readonly: el.readOnly,
          width: el.offsetWidth, height: el.offsetHeight,
        })),
      );
      recorder.dump(`diag_${stepLabel}`, allInputsDiag);
      throw new Error(
        `${stepLabel}: 必要な入力欄数(${values.length})が見つからない (見つかった${visibleTextInputs.length}個)。診断: artifacts/.../diag_${stepLabel}.json`,
      );
    }

    for (let i = 0; i < values.length; i++) {
      const { handle, placeholder } = visibleTextInputs[i];
      await handle.click();
      await handle.fill(values[i]);
      recorder.log(`  filled[${i}] "${values[i]}" → placeholder="${placeholder}"`);
      await page.waitForTimeout(200);
    }
  }

  // 「次へ」を押して次のチャットステップに進む
  // - .last() で最新の次へボタン（チャット履歴の旧ボタンを避ける）
  // - noWaitAfter で post-click navigation 待機をスキップ（Botchanのhang対策）
  async function clickNext(stepLabel) {
    await chat.getByRole('button', { name: '次へ' }).last().click({ noWaitAfter: true });
    await page.waitForTimeout(1500); // チャットbotがメッセージを表示する時間
    await recorder.step(page, stepLabel);
  }

  // ── お名前 ──
  // このLPは「漢字2フィールド」だけが最初に表示され、次へ押下後にフリガナ2フィールドが追加表示される。
  // placeholder ごとにピンポイントで埋める（部分マッチで多少のブレに対応）
  async function fillByPlaceholder(re, value, opts = {}) {
    const { timeout = 5000, optional = false } = opts;
    try {
      const input = chat.getByPlaceholder(re).last();
      await input.waitFor({ state: 'visible', timeout });
      await input.click();
      await input.fill(value);
      recorder.log(`  filled "${value}" → placeholder=${re}`);
      await page.waitForTimeout(200);
      return true;
    } catch (e) {
      if (optional) {
        recorder.log(`  skip ${re} (not visible within ${timeout}ms)`);
        return false;
      }
      throw e;
    }
  }

  recorder.log('--- name step ---');
  // ラウンド1: 漢字2フィールド + フリガナがもし既に出ていれば一緒に
  await fillByPlaceholder(/山田/, customer.lastName);
  await fillByPlaceholder(/花子/, customer.firstName);
  let kanaSeiFilled = await fillByPlaceholder(/やまだ/, customer.lastNameKana, { timeout: 1500, optional: true });
  let kanaMeiFilled = await fillByPlaceholder(/はなこ/, customer.firstNameKana, { timeout: 1500, optional: true });
  await clickNext('name_round_1');

  // ラウンド2: ラウンド1でフリガナが入らなければ、検証エラー→フリガナ出現を待って入れる
  if (!kanaSeiFilled || !kanaMeiFilled) {
    recorder.log('furigana not filled in round 1, trying round 2 (waiting for fields to appear)');
    if (!kanaSeiFilled) {
      kanaSeiFilled = await fillByPlaceholder(/やまだ/, customer.lastNameKana, { timeout: 10000, optional: true });
    }
    if (!kanaMeiFilled) {
      kanaMeiFilled = await fillByPlaceholder(/はなこ/, customer.firstNameKana, { timeout: 5000, optional: true });
    }
    if (kanaSeiFilled || kanaMeiFilled) {
      await clickNext('name_round_2');
    }
  }

  // ── 電話番号 ──
  const phoneInput = chat.getByRole('textbox', { name: '08012345678' });
  await phoneInput.click();
  await phoneInput.fill(customer.phone);
  await page.waitForTimeout(300);

  // ── メールアドレス ──
  const emailInput = chat.getByRole('textbox', { name: 'example@toesella.com' });
  await emailInput.click();
  await emailInput.fill(customer.email);
  await page.waitForTimeout(300);
  await chat.getByRole('button', { name: '次へ' }).click();
  await page.waitForTimeout(800);
  await recorder.step(page, 'contact');

  // ── パスワード（マイページ用、4桁） ──
  const passwordInput = chat.getByRole('textbox', { name: 'nne1234' });
  await passwordInput.click();
  await passwordInput.fill('0000');
  await page.waitForTimeout(300);
  await clickNext('password');

  // ── 郵便番号（→ 都道府県/市区町村は自動補完を期待） ──
  const postalInput = chat.getByRole('textbox', { name: '8100022' });
  await postalInput.click();
  await postalInput.fill(customer.postalCode);
  await page.waitForTimeout(1500); // 住所自動補完待ち

  // ── 番地 ──
  const banchiInput = chat.getByRole('textbox', { name: '-5-6' });
  await banchiInput.click();
  await banchiInput.fill(customer.address1);
  await page.waitForTimeout(300);

  // ── 建物名 ──
  const buildingInput = chat.getByRole('textbox', { name: 'ハイヒルズビル7階' });
  await buildingInput.click();
  await buildingInput.fill(customer.address2);
  await page.waitForTimeout(300);
  await recorder.step(page, 'address');

  // ── 住所→支払い方法の間に 次へ が必要 ──
  recorder.log('clicking 次へ after address...');
  await clickNext('after_address_next');

  // ── 支払い方法: クレジットカード（複数テキストパターンを試す） ──
  const paymentPatterns = [
    /クレジットカード（手数料0円）/,
    /クレジットカード\s*[（(].*0円.*[）)]/,
    /^クレジットカード$/,
    /クレジットカード/,
  ];

  let paymentClicked = false;
  for (const pat of paymentPatterns) {
    try {
      const opt = chat.getByText(pat).first();
      await opt.waitFor({ state: 'visible', timeout: 5000 });
      await opt.click();
      recorder.log(`payment selected: pattern=${pat}`);
      paymentClicked = true;
      break;
    } catch {
      // try next pattern
    }
  }

  if (!paymentClicked) {
    const visibleText = await chat.locator('body').innerText();
    recorder.dump('diag_payment', { visibleText: visibleText.slice(0, 3000) });
    throw new Error('payment option not found. See diag_payment.json');
  }

  await page.waitForTimeout(500);
  await clickNext('payment_method');

  // ── カード番号 ──
  const cardNumInput = chat.getByRole('textbox', { name: '例）0000000123456789' });
  await cardNumInput.click();
  await cardNumInput.fill(env.card.number);
  await page.waitForTimeout(300);

  // ── カード名義 ──
  const cardNameInput = chat.getByRole('textbox', { name: '例）HANAKO YAMADA' });
  await cardNameInput.click();
  await cardNameInput.fill(env.card.holderName);
  await page.waitForTimeout(300);

  // ── 有効期限 年（2桁） ──
  await chat.getByTitle('年').click();
  await page.waitForTimeout(500);
  await chat.getByRole('treeitem', { name: env.card.expiryYearShort }).click();
  await page.waitForTimeout(500);

  // ── 有効期限 月（2桁ゼロ埋め） ──
  await chat.getByTitle('月').click();
  await page.waitForTimeout(500);
  await chat.getByRole('treeitem', { name: env.card.expiryMonth }).click();
  await page.waitForTimeout(500);

  // ── CVC ──
  const cvcInput = chat.locator('#wc-message-group-content input[name="card_cvc"]');
  await cvcInput.click();
  await cvcInput.fill(env.card.cvc);
  await page.waitForTimeout(300);
  await recorder.step(page, 'card_entered');

  // ── 確認画面へ ──
  await clickNext('before_final_submit');

  // ── 最終送信: ご注文完了へ ──
  await chat.getByRole('button', { name: 'ご注文完了へ' }).last().click({ noWaitAfter: true });
  recorder.log('final submit clicked, waiting for completion...');
  await page.waitForTimeout(8000);
  await recorder.step(page, 'after_final_submit');

  // ── サンキュー判定（このLP固有の文言） ──
  // toesella の場合、最終送信後にチャットに「最後にコース内容のご確認になります！」が表示される
  const thankYouPatterns = [
    /最後にコース内容のご確認になります/,
    /コース内容のご確認/,
  ];

  let matched = null;
  for (const pat of thankYouPatterns) {
    try {
      await chat.getByText(pat).first().waitFor({ timeout: 8000 });
      matched = pat.toString();
      recorder.log(`thank-you matched: ${matched}`);
      break;
    } catch {
      // try next
    }
  }

  // 注文番号抽出を試行
  let orderNumber = null;
  try {
    const bodyText = await chat.locator('body').innerText();
    const m = bodyText.match(/(?:注文番号|オーダー番号|注文ID|お申込番号)[：:\s]*([A-Za-z0-9_-]+)/);
    if (m) orderNumber = m[1];
  } catch {
    // ignore
  }

  await recorder.step(page, 'final_state');

  return {
    ok: !!matched,
    thankYouMatch: matched,
    orderNumber,
    customer: { email: customer.email, marker: customer.marker },
  };
}
