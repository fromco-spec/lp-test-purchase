/**
 * to esella 炭酸パック（nine/lp/pack/base_cp クーポンLP）通常版
 *
 * 録画ベース: recordings/recording.mjs （codegen録画 → 整備）
 *
 * handserum との差分（メモ）:
 *  - CTAは「特別セール実施中」リンク
 *  - 商品選択ステップ無し（チャット起動直後にお名前入力）
 *  - 電話 + 郵便番号 + 番地 + 建物名 を1画面で連続入力
 *  - 番地・建物名は全角必須バリデーション
 *  - 住所入力後「次へ」を2回押す（確認ステップ）
 *  - カード入力後に メール / マイページパスワード / 性別 の追加ステップ
 *  - 最終ボタンは「ご注文完了へ」（handserum通常版と同じ）
 */

const TARGET_URL = 'https://www.toesella.com/nine/lp/pack/base_cp.html';

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

  await recorder.phase('チャット起動 (CTAクリック)', async () => {
    await page.getByRole('link', { name: '特別セール実施中' }).first().click();
    // pack版はチャット起動とbotメッセージ表示までhandserumより時間がかかる
    await page.waitForTimeout(6000);
    await recorder.step(page, 'cta_clicked');
  });

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

  await recorder.phase('お名前・フリガナ入力', async () => {
    // 最初の入力欄は botchanの初期ダイアログ表示完了を待つので長めに
    await fillByPlaceholder(/山田/, customer.lastName, { timeout: 30000 });
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

  await recorder.phase('連絡先・住所入力（電話・郵便番号・番地・建物名）', async () => {
    // 電話番号
    const phoneInput = chat.getByRole('textbox', { name: '08012345678' });
    await phoneInput.waitFor({ state: 'visible', timeout: 15000 });
    await phoneInput.click();
    await phoneInput.fill(customer.phone);
    await page.waitForTimeout(300);

    // 郵便番号（→ 都道府県/市区町村は自動補完を期待）
    const postalInput = chat.getByRole('textbox', { name: '8100022' });
    await postalInput.click();
    await postalInput.fill(customer.postalCode);
    await page.waitForTimeout(1500);

    // 番地（全角必須）
    const address1Full = toFullWidth(customer.address1);
    const banchiInput = chat.getByRole('textbox', { name: '-5-6' });
    await banchiInput.waitFor({ state: 'visible', timeout: 10000 });
    await banchiInput.click();
    await banchiInput.fill(address1Full);
    recorder.log(`  banchi: "${customer.address1}" → "${address1Full}"`);
    await page.waitForTimeout(300);

    // 建物名（全角必須）
    const address2Full = toFullWidth(customer.address2);
    const buildingInput = chat.getByRole('textbox', { name: 'ハイヒルズビル7階' });
    await buildingInput.click();
    await buildingInput.fill(address2Full);
    recorder.log(`  building: "${customer.address2}" → "${address2Full}"`);
    await page.waitForTimeout(300);
    await recorder.step(page, 'contact_address');

    // 「次へ」を2回（録画通り：1回目で送信、2回目で確認画面通過）
    await clickNext('address_next_1');
    await clickNext('address_next_2');
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

    // 有効期限 年
    await chat.getByTitle('年').click();
    await page.waitForTimeout(500);
    await chat.getByRole('treeitem', { name: customer.card.expiryYearShort }).click();
    await page.waitForTimeout(500);

    // 有効期限 月
    await chat.getByTitle('月').click();
    await page.waitForTimeout(500);
    await chat.getByRole('treeitem', { name: customer.card.expiryMonth }).click();
    await page.waitForTimeout(500);

    // CVC
    const cvcInput = chat.locator('#wc-message-group-content input[name="card_cvc"]');
    await cvcInput.click();
    await cvcInput.fill(customer.card.cvc);
    await page.waitForTimeout(300);
    await recorder.step(page, 'card_entered');
    await clickNext('after_card');
  });

  await recorder.phase('追加情報入力（メール・パスワード・性別）', async () => {
    // メールアドレス
    const emailInput = chat.getByRole('textbox', { name: 'example@toesella.com' });
    await emailInput.waitFor({ state: 'visible', timeout: 15000 });
    await emailInput.click();
    await emailInput.fill(customer.email);
    await page.waitForTimeout(300);

    // マイページパスワード
    const passwordInput = chat.getByRole('textbox', { name: 'nne1234' });
    await passwordInput.click();
    await passwordInput.fill('0000');
    await page.waitForTimeout(300);

    // 性別（女性）
    await chat.getByText('女性').first().click();
    await page.waitForTimeout(500);
    await recorder.step(page, 'extra_info');
    await clickNext('after_extra');
  });

  let matched = null;
  let orderNumber = null;

  await recorder.phase('注文完了 (ご注文完了へ押下)', async () => {
    await chat.getByRole('button', { name: 'ご注文完了へ' }).last().click({ noWaitAfter: true });
    recorder.log('final submit clicked, waiting for completion...');
    await page.waitForTimeout(8000);
    await recorder.step(page, 'after_final_submit');
  });

  await recorder.phase('完了確認 (サンキュー文言検出)', async () => {
    // toesella通常版と同じ文言をまず試す。違っていれば緩いパターンも
    const thankYouPatterns = [
      /最後にコース内容のご確認になります/,
      /コース内容のご確認/,
      /ご注文(?:が完了|ありがとう)/,
      /注文完了/,
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
