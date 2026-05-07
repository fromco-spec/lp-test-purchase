import { randomBytes } from 'node:crypto';

function randomString(len) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += chars[bytes[i] % chars.length];
  return s;
}

/**
 * Notion由来のプロファイル + 自動生成項目（メアド・有効期限）を合わせて
 * シナリオで使う customer オブジェクトを作る。
 */
export function makeTestCustomer(profile) {
  const now = new Date();
  const ts = now
    .toISOString()
    .replace(/[-:T.Z]/g, '')
    .slice(0, 14);
  const localPart = randomString(20);

  // 有効期限: 実行時の今月・今年
  const expiryMonth = String(now.getMonth() + 1).padStart(2, '0');
  const expiryYear = String(now.getFullYear());
  const expiryYearShort = expiryYear.slice(-2);

  return {
    lastName: profile.lastName,
    firstName: profile.firstName,
    lastNameKana: profile.lastNameKana,
    firstNameKana: profile.firstNameKana,
    fullName: `${profile.lastName} ${profile.firstName}`,
    email: `${localPart}+autotest-${ts}@${profile.emailDomain}`,
    phone: profile.phone,
    postalCode: profile.postalCode,
    prefecture: profile.prefecture,
    city: profile.city,
    address1: profile.address1,
    address2: profile.address2,
    fullAddress: `${profile.prefecture}${profile.city}${profile.address1} ${profile.address2}`,
    marker: ts,
    profileName: profile.name,
    card: {
      number: profile.cardNumber,
      holderName: profile.cardHolder,
      cvc: profile.cvc,
      expiryMonth,
      expiryYear,
      expiryYearShort,
    },
  };
}
