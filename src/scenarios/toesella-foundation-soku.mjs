/**
 * to esella グラインディングファンデーション（nine/lp/grfoundation/base_soku_cp / 即チャ版）
 *
 * 通常版 (toesella-foundation.mjs) との差分:
 *   - URLが base_soku_cp.html
 *   - LP着地時点でBOTが自動起動するため、CTAクリックフェーズを削除
 *
 * その他の構造は通常版と同じ前提。
 */

const TARGET_URL = 'https://www.toesella.com/nine/lp/grfoundation/base_soku_cp.html';

function toFullWidth(s) {
  if (!s) return s;
  return s
    .replace(/[!-~]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0xfee0))
    .replace(/-/g, '－')
    .replace(/ /g, '　');
}

export async function run({ page, customer, recorder }) {
  await recorder.phase('LP着地', async () => {
    recorder.log(`navigate ${TARGET_URL}`);
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('load', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);
    await recorder.step(page, 'landed');
  });

  // 即版はLP表示時点でBOTが自動起動するため、CTAクリックは不要

  const chat = page.frameLocator('#wc-webchat');

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

  async function clickButtonByName(name, stepLabel, opts = {}) {
    const { timeout = 15000 } = opts;
    const btn = chat.getByRole('button', { name }).last();
    await btn.waitFor({ state: 'visible', timeout });
    await btn.click({ noWaitAfter: true });
    await page.waitForTimeout(1500);
    await recorder.step(page, stepLabel);
  }

  await recorder.phase('商品選択', async () => {
    // メイン商品画像が出るまで待つ
    const productImage = chat.locator('.image_box > img:not([src=""])').first();
    await productImage.waitFor({ state: 'visible', timeout: 60000 });
    await productImage.click();
    await page.waitForTimeout(1500);

    // 商品オプション画像（バリエーション選択）
    const optionImage = chat.locator('.product_image_box > img:not([src=""])').first();
    try {
      await optionImage.waitFor({ state: 'visible', timeout: 10000 });
      await optionImage.click();
      await page.waitForTimeout(1500);
    } catch {
      recorder.log('  no product option image step (skipped)');
    }
    await recorder.step(page, 'product_selected');
  });

  await recorder.phase('お名前入力', async () => {
    await fillByPlaceholder(/山田/, customer.lastName, { timeout: 30000 });
    await fillByPlaceholder(/花子/, customer.firstName);
    // フリガナはこのLPでは録画に出現しなかったが、出るかもしれないので試す
    await fillByPlaceholder(/やまだ/, customer.lastNameKana, { timeout: 1500, optional: true });
    await fillByPlaceholder(/はなこ/, customer.firstNameKana, { timeout: 1500, optional: true });
    await clickButtonByName('連絡先の入力にすすむ', 'name_done');
  });

  await recorder.phase('連絡先入力（電話・メール）', async () => {
    // 電話番号 (placeholder 09012345678)
    const phoneInput = chat.getByRole('textbox', { name: '09012345678' });
    await phoneInput.waitFor({ state: 'visible', timeout: 15000 });
    await phoneInput.click();
    await phoneInput.fill(customer.phone);
    await page.waitForTimeout(300);

    // メールアドレス
    const emailInput = chat.getByRole('textbox', { name: 'example@toesella.com' });
    await emailInput.click();
    await emailInput.fill(customer.email);
    await page.waitForTimeout(300);
    await recorder.step(page, 'contact');

    // 「お届け先の入力にすすむ」1回目: これを押すとパスワード欄が出現する
    await clickButtonByName('お届け先の入力にすすむ', 'contact_proceed');
  });

  await recorder.phase('マイページパスワード入力', async () => {
    const passwordInput = chat.getByRole('textbox', { name: 'nne1234（マイページログイン用）' });
    await passwordInput.waitFor({ state: 'visible', timeout: 15000 });
    await passwordInput.click();
    await passwordInput.fill('0000');
    await page.waitForTimeout(300);
    await recorder.step(page, 'password');

    // 「お届け先の入力にすすむ」2回目: パスワード入力後に住所画面へ進む
    await clickButtonByName('お届け先の入力にすすむ', 'password_done');
  });

  await recorder.phase('住所入力', async () => {
    // 郵便番号 (→ 自動補完)
    const postalInput = chat.getByRole('textbox', { name: '8100022' });
    await postalInput.waitFor({ state: 'visible', timeout: 15000 });
    await postalInput.click();
    await postalInput.fill(customer.postalCode);
    await page.waitForTimeout(1500);

    // 番地（全角必須を想定してtoFullWidth適用）
    const address1Full = toFullWidth(customer.address1);
    const banchiInput = chat.getByRole('textbox', { name: '-5-6' });
    await banchiInput.waitFor({ state: 'visible', timeout: 10000 });
    await banchiInput.click();
    await banchiInput.fill(address1Full);
    recorder.log(`  banchi: "${customer.address1}" → "${address1Full}"`);
    await page.waitForTimeout(300);

    // 建物名（録画には出てなかったがoptionalで試す）
    const address2Full = toFullWidth(customer.address2);
    try {
      const buildingInput = chat.getByRole('textbox', { name: 'ハイヒルズビル7階' });
      await buildingInput.waitFor({ state: 'visible', timeout: 2000 });
      await buildingInput.click();
      await buildingInput.fill(address2Full);
      recorder.log(`  building: "${customer.address2}" → "${address2Full}"`);
      await page.waitForTimeout(300);
    } catch {
      recorder.log('  no building input field (skipped)');
    }
    await recorder.step(page, 'address');

    await clickButtonByName('支払い方法の選択にすすむ', 'address_done');
  });

  await recorder.phase('支払い方法選択（クレジット）', async () => {
    // ファンデは「クレジット」(packは「クレジットカード」)。複数パターン試す
    const paymentPatterns = [
      /クレジット（手数料0円）/,
      /クレジット\s*[（(].*0円.*[）)]/,
      /^クレジット$/,
      /クレジット/,
    ];
    let clicked = false;
    for (const pat of paymentPatterns) {
      try {
        const opt = chat.getByText(pat).first();
        await opt.waitFor({ state: 'visible', timeout: 5000 });
        await opt.click();
        recorder.log(`payment selected: pattern=${pat}`);
        clicked = true;
        break;
      } catch {
        // try next pattern
      }
    }
    if (!clicked) {
      const text = await chat.locator('body').innerText();
      recorder.dump('diag_payment', { visibleText: text.slice(0, 3000) });
      throw new Error('payment option not found. See diag_payment.json');
    }
    await page.waitForTimeout(500);
    await recorder.step(page, 'payment_method');
  });

  await recorder.phase('カード情報入力', async () => {
    const cardNumInput = chat.getByRole('textbox', { name: '例）0000000123456789' });
    await cardNumInput.waitFor({ state: 'visible', timeout: 15000 });
    await cardNumInput.click();
    await cardNumInput.fill(customer.card.number);
    await page.waitForTimeout(300);

    const cardNameInput = chat.getByRole('textbox', { name: '例）HANAKO YAMADA' });
    await cardNameInput.click();
    await cardNameInput.fill(customer.card.holderName);
    await page.waitForTimeout(300);

    await chat.getByTitle('年').click();
    await page.waitForTimeout(500);
    await chat.getByRole('treeitem', { name: customer.card.expiryYearShort }).click();
    await page.waitForTimeout(500);

    await chat.getByTitle('月').click();
    await page.waitForTimeout(500);
    await chat.getByRole('treeitem', { name: customer.card.expiryMonth }).click();
    await page.waitForTimeout(500);

    const cvcInput = chat.locator('#wc-message-group-content input[name="card_cvc"]');
    await cvcInput.click();
    await cvcInput.fill(customer.card.cvc);
    await page.waitForTimeout(300);
    await recorder.step(page, 'card_entered');

    await clickButtonByName('配送種類の選択に進む', 'card_done');
  });

  await recorder.phase('配送種類の選択（協力する）', async () => {
    // 「協力する」テキスト要素クリック
    try {
      await chat.getByText('協力する').first().click({ timeout: 10000 });
      recorder.log('  協力する clicked');
      await page.waitForTimeout(500);
    } catch {
      recorder.log('  協力する not found (skipped)');
    }
    await recorder.step(page, 'shipping_selected');
  });

  let matched = null;
  let orderNumber = null;

  await recorder.phase('注文完了 (今すぐご注文完了する 押下)', async () => {
    await chat
      .getByRole('button', { name: '今すぐご注文完了する' })
      .last()
      .click({ noWaitAfter: true });
    recorder.log('final submit clicked, waiting for completion...');
    await page.waitForTimeout(8000);
    await recorder.step(page, 'after_final_submit');
  });

  await recorder.phase('完了確認 (サンキュー文言検出)', async () => {
    // ファンデは「ご購入ありがとうございました」
    const thankYouPatterns = [
      /ご購入ありがとうございました/,
      /ご購入ありがとうござい/,
      /注文ありがとう/,
      /ありがとうございました/,
    ];
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

    try {
      const bodyText = await chat.locator('body').innerText();
      const m = bodyText.match(/(?:注文番号|オーダー番号|注文ID|お申込番号)[：:\s]*([A-Za-z0-9_-]+)/);
      if (m) orderNumber = m[1];
    } catch {
      // ignore
    }

    await recorder.step(page, 'final_state');
  });

  return {
    ok: !!matched,
    thankYouMatch: matched,
    orderNumber,
    customer: { email: customer.email, marker: customer.marker },
  };
}
