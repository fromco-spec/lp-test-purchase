/**
 * to esella クリスタブライトセラム（cbserum/base_soku_cp / 即チャ版）
 *
 * 通常版 (toesella-cbserum.mjs) との差分:
 *   - URLが base_soku_cp.html
 *   - LP着地時点でBOTが自動起動するため、CTAクリックフェーズを削除
 *
 * その他の構造（オファー確認スキップ・お名前・連絡先・住所・支払い・カード・完了）は通常版と同じ前提。
 */

const TARGET_URL = 'https://www.toesella.com/cbserum/base_soku_cp.html';

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

  async function clickNext(stepLabel) {
    await chat.getByRole('button', { name: '次へ' }).last().click({ noWaitAfter: true });
    await page.waitForTimeout(1500);
    await recorder.step(page, stepLabel);
  }

  await recorder.phase('オファー確認スキップ (次へ)', async () => {
    // チャット起動直後に表示されるオファー確認画面の「次へ」を1回押す
    await chat
      .getByRole('button', { name: '次へ' })
      .last()
      .waitFor({ state: 'visible', timeout: 30000 });
    await clickNext('offer_skipped');
  });

  await recorder.phase('お名前・フリガナ入力', async () => {
    await fillByPlaceholder(/山田/, customer.lastName, { timeout: 15000 });
    await fillByPlaceholder(/花子/, customer.firstName);
    let kanaSeiFilled = await fillByPlaceholder(/やまだ/, customer.lastNameKana, { timeout: 1500, optional: true });
    let kanaMeiFilled = await fillByPlaceholder(/はなこ/, customer.firstNameKana, { timeout: 1500, optional: true });
    await clickNext('name_round_1');

    if (!kanaSeiFilled || !kanaMeiFilled) {
      recorder.log('furigana not filled in round 1, trying round 2');
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
  });

  await recorder.phase('連絡先入力（電話・メール）', async () => {
    const phoneInput = chat.getByRole('textbox', { name: '08012345678' });
    await phoneInput.waitFor({ state: 'visible', timeout: 15000 });
    await phoneInput.click();
    await phoneInput.fill(customer.phone);
    await page.waitForTimeout(300);

    const emailInput = chat.getByRole('textbox', { name: 'example@toesella.com' });
    await emailInput.click();
    await emailInput.fill(customer.email);
    await page.waitForTimeout(300);
    await recorder.step(page, 'contact');

    await clickNext('contact_done');
  });

  await recorder.phase('マイページパスワード入力', async () => {
    const passwordInput = chat.getByRole('textbox', { name: 'nne1234' });
    await passwordInput.waitFor({ state: 'visible', timeout: 15000 });
    await passwordInput.click();
    await passwordInput.fill('0000');
    await page.waitForTimeout(300);
    await clickNext('password_done');
  });

  await recorder.phase('住所入力', async () => {
    const postalInput = chat.getByRole('textbox', { name: '8100022' });
    await postalInput.waitFor({ state: 'visible', timeout: 15000 });
    await postalInput.click();
    await postalInput.fill(customer.postalCode);
    await page.waitForTimeout(1500);

    const address1Full = toFullWidth(customer.address1);
    const banchiInput = chat.getByRole('textbox', { name: '-5-6' });
    await banchiInput.waitFor({ state: 'visible', timeout: 10000 });
    await banchiInput.click();
    await banchiInput.fill(address1Full);
    recorder.log(`  banchi: "${customer.address1}" → "${address1Full}"`);
    await page.waitForTimeout(300);

    // 建物名（録画には無いがoptionalで試す）
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
    await clickNext('address_done');
  });

  await recorder.phase('支払い方法選択（クレジットカード）', async () => {
    const paymentPatterns = [
      /クレジットカード（手数料0円）/,
      /クレジットカード\s*[（(].*0円.*[）)]/,
      /^クレジットカード$/,
      /クレジットカード/,
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
        // try next
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

    await clickNext('card_done');
  });

  let matched = null;
  let orderNumber = null;

  await recorder.phase('注文完了 (ご注文完了へ押下)', async () => {
    await chat
      .getByRole('button', { name: 'ご注文完了へ' })
      .last()
      .click({ noWaitAfter: true });
    recorder.log('final submit clicked, waiting for completion...');
    await page.waitForTimeout(8000);
    await recorder.step(page, 'after_final_submit');
  });

  await recorder.phase('完了確認 (サンキュー文言検出)', async () => {
    // pack/handserumと同じ想定だが、念のため広めにフォールバック
    const thankYouPatterns = [
      /最後にコース内容のご確認になります/,
      /コース内容のご確認/,
      /ご注文ありがとうございました/,
      /ご購入ありがとうございました/,
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
