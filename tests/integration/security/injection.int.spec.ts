import { expect, test } from 'vitest';
import { resolveIntegrationUrl } from '../base-url';

test('basic SQLi probe does not expose raw errors', async () => {
  // Integration test - server availability is handled by tests/integration/setup.ts
  const url = resolveIntegrationUrl('/api/search?q=%27%20OR%201%3D1--');

  const r = await fetch(url);

  // Accept various valid responses: 200 (handled), 204 (no content), 400 (bad request),
  // 401 (unauthorized), 403 (forbidden), 404 (endpoint not found),
  // 422 (unprocessable), 501 (not implemented)
  expect([200, 204, 400, 401, 403, 404, 422, 501]).toContain(r.status);

  // Ensure no SQL error details in response
  if (r.status !== 404) {
    const body = await r.text();
    expect(body.toLowerCase()).not.toContain('syntax error');
    expect(body.toLowerCase()).not.toContain('sql');
    expect(body.toLowerCase()).not.toContain('postgresql');
  }
});
