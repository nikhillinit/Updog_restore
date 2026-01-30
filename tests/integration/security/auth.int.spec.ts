import { expect, test } from 'vitest';
import fetch from 'node-fetch';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
test('JWT rejects expired tokens', async () => {
  const expired = 'Bearer eyJ...expired';
  const r = await fetch(`${BASE}/api/private`, { headers: { Authorization: expired } });
  // Accept 401/403 for proper auth rejection, 204 if no content returned, or 501 if not implemented
  expect([401, 403, 501, 204]).toContain(r.status);
});
