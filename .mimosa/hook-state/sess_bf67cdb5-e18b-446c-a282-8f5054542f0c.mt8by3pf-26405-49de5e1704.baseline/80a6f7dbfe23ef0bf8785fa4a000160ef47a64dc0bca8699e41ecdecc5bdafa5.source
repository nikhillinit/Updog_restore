// Test environment setup - provides stable import.meta.env for all tests
// This avoids per-test stubbing and ensures consistency

(globalThis as any).import = {
  meta: {
    env: {
      MODE: 'test',
      VITE_IDEMPOTENCY_MAX: '200',
      VITE_API_URL: 'http://localhost:5000',
      DEV: false,
      PROD: false,
      SSR: false
    }
  }
};