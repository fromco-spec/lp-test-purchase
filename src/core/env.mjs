import 'dotenv/config';

const required = ['TEST_CARD_NUMBER', 'TEST_CARD_CVC', 'TEST_CARD_HOLDER_NAME', 'TEST_EMAIL_DOMAIN'];

export function loadEnv() {
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(
      `[env] 必須環境変数が未設定です: ${missing.join(', ')}\n` +
        `.env ファイルを作成して設定してください（.env.example を参照）`,
    );
  }

  const now = new Date();
  const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
  const currentYearFull = String(now.getFullYear());
  const currentYearShort = currentYearFull.slice(-2);

  const expiryMonth = process.env.TEST_CARD_EXPIRY_MONTH || currentMonth;
  const expiryYearFull = process.env.TEST_CARD_EXPIRY_YEAR
    ? String(process.env.TEST_CARD_EXPIRY_YEAR).padStart(4, '20')
    : currentYearFull;
  const expiryYearShort = expiryYearFull.slice(-2);

  return {
    card: {
      number: process.env.TEST_CARD_NUMBER,
      expiryMonth,
      expiryYear: expiryYearFull,
      expiryYearShort,
      cvc: process.env.TEST_CARD_CVC,
      holderName: process.env.TEST_CARD_HOLDER_NAME,
    },
    email: {
      domain: process.env.TEST_EMAIL_DOMAIN,
      tag: process.env.TEST_EMAIL_TAG || 'autotest',
    },
    address: {
      postalCode: process.env.TEST_POSTAL_CODE || '1000001',
      prefecture: process.env.TEST_PREFECTURE || '東京都',
      city: process.env.TEST_CITY || '千代田区',
      address1: process.env.TEST_ADDRESS1 || '千代田1-1-1',
      address2: process.env.TEST_ADDRESS2 || 'テストビル999F',
    },
  };
}
