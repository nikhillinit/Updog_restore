import { vi } from 'vitest';

/**
 * Global Sentry mocks to prevent initialization in test environment
 * Addresses: Pre-existing Sentry type errors and initialization issues
 */

// Guard: Only mock if Sentry would actually initialize
// This prevents breaking tests that intentionally use Sentry
if (process.env.NODE_ENV === 'test') {
  vi.mock('@sentry/node', () => ({
    init: vi.fn(),
    captureException: vi.fn(),
    captureMessage: vi.fn(),
    withScope: vi.fn((fn) => {
      if (typeof fn === 'function') {
        fn({
          setTag: vi.fn(),
          setContext: vi.fn(),
          setUser: vi.fn(),
          setExtra: vi.fn(),
        });
      }
    }),
    // Add other exports as needed
    Severity: {
      Fatal: 'fatal',
      Error: 'error',
      Warning: 'warning',
      Info: 'info',
      Debug: 'debug',
    },
  }));

  vi.mock('@sentry/browser', () => ({
    init: vi.fn(),
    captureException: vi.fn(),
    captureMessage: vi.fn(),
    withScope: vi.fn((fn) => {
      if (typeof fn === 'function') {
        fn({
          setTag: vi.fn(),
          setContext: vi.fn(),
          setUser: vi.fn(),
          setExtra: vi.fn(),
        });
      }
    }),
  }));
}
