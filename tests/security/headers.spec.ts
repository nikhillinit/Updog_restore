import { expect, test } from 'vitest';
import fetch from 'node-fetch';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
test('security headers present', async () => {
  const r = await fetch(BASE + '/');
  expect(r.headers.get('content-security-policy')).toMatch(/script-src.*'nonce-/);
  expect(r.headers.get('strict-transport-security')).toContain('max-age');
  expect(r.headers.get('x-content-type-options')).toBe('nosniff');
  expect(r.headers.get('referrer-policy')).toBeTruthy();
});
