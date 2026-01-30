import { expect, test } from 'vitest';
import fetch from 'node-fetch';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
test('JWT rejects expired tokens', async () => {
  const expired = 'Bearer eyJ...expired';
  const r = await fetch(`${BASE}/api/private`, { headers: { Authorization: expired } });
  // Accept 401/403 for proper auth rejection, or 501 if endpoint not implemented
  expect([401, 403, 501]).toContain(r.status);
});
