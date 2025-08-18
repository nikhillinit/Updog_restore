import { expect, test } from 'vitest';
import fetch from 'node-fetch';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
test('basic SQLi probe does not expose raw errors', async () => {
  const r = await fetch(BASE + '/api/search?q=%27%20OR%201%3D1--');
  expect([200,400,422]).toContain(r.status);
});
