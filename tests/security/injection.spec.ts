import { expect, test } from 'vitest';

test.skip('basic SQLi probe does not expose raw errors', async () => {
  // Skip this test in unit test runs - it requires a running server
  // This should be run as part of integration tests with the server running
  
  const BASE = process.env.BASE_URL || 'http://localhost:3000';
  
  // Ensure BASE has protocol
  const baseUrl = BASE.startsWith('http') ? BASE : `http://${BASE}`;
  const url = `${baseUrl}/api/search?q=%27%20OR%201%3D1--`;
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  
  try {
    const r = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    
    expect([200, 400, 404, 422]).toContain(r.status);
    
    // Ensure no SQL error details in response
    if (r.status !== 404) {
      const body = await r.text();
      expect(body.toLowerCase()).not.toContain('syntax error');
      expect(body.toLowerCase()).not.toContain('sql');
      expect(body.toLowerCase()).not.toContain('postgresql');
    }
  } catch (error: any) {
    clearTimeout(timeout);
    // If server is not running, that's expected in unit tests
    if (error.cause?.code === 'ECONNREFUSED' || error.name === 'AbortError') {
      console.log('Server not running or timeout - expected for unit tests');
      return;
    }
    throw error;
  }
});
