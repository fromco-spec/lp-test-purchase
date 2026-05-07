import { randomBytes } from 'node:crypto';

function randomString(len) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += chars[bytes[i] % chars.length];
  return s;
}

export function makeTestCustomer(env) {
  const ts = new Date()
    .toISOString()
    .replace(/[-:T.Z]/g, '')
    .slice(0, 14);
  const localPart = randomString(20);
  return {
    lastName: 'テスト',
    firstName: 'テスト',
    lastNameKana: 'てすと',
    firstNameKana: 'てすと',
    fullName: 'テスト テスト',
    email: `${localPart}+${env.email.tag}-${ts}@${env.email.domain}`,
    phone: '08000000000',
    phoneFormatted: '080-0000-0000',
    postalCode: env.address.postalCode,
    prefecture: env.address.prefecture,
    city: env.address.city,
    address1: env.address.address1,
    address2: env.address.address2,
    fullAddress: `${env.address.prefecture}${env.address.city}${env.address.address1} ${env.address.address2}`,
    marker: ts,
  };
}
