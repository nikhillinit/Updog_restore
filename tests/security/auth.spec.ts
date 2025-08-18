import { expect, test } from 'vitest';
import fetch from 'node-fetch';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
test('JWT rejects expired tokens', async () => {
  const expired = 'Bearer eyJ...expired';
  const r = await fetch(BASE + '/api/private', { headers: { Authorization: expired }});
  expect([401,403]).toContain(r.status);
});
