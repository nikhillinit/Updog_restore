// ── Auto-loaded test helpers ───────────────────────────────────────────
import './helpers/test-helpers';
export * from './helpers/test-helpers';

// Mock @upstash/redis module to prevent import errors in tests
if (typeof globalThis !== 'undefined' && !globalThis.__vitest_mocked_upstash) {
  globalThis.__vitest_mocked_upstash = true;
}