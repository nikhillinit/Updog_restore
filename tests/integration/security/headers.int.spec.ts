import { expect, test } from 'vitest';
const getBaseUrl = () => process.env.BASE_URL || 'http://localhost:3000';
test('security headers present', async () => {
  const r = await fetch(`${getBaseUrl()}/`);
  expect(r.headers.get('content-security-policy')).toMatch(/script-src.*'nonce-/);
  expect(r.headers.get('strict-transport-security')).toContain('max-age');
  expect(r.headers.get('x-content-type-options')).toBe('nosniff');
  expect(r.headers.get('referrer-policy')).toBeTruthy();
});
