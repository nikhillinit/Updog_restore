/**
 * Global test setup for core test suite
 *
 * Purpose: Stub heavy dependencies that aren't needed for unit tests
 * This keeps the test suite fast and focused on business logic.
 *
 * Guidelines:
 * - Mock expensive imports (xlsx, recharts, large UI libs)
 * - Stub Node.js globals if needed (fetch, crypto)
 * - Keep this file minimal - test-specific mocks belong in test files
 */

import { vi } from 'vitest';

// Stub xlsx (large dependency, not needed for unit tests)
vi.mock('xlsx', () => ({
  default: {
    utils: {},
    writeFile: () => {},
    read: () => ({ SheetNames: [], Sheets: {} }),
  },
  utils: {},
  writeFile: () => {},
  read: () => ({ SheetNames: [], Sheets: {} }),
}));

// Stub recharts components (heavy rendering lib, not needed for logic tests)
// Uncomment if recharts imports are slowing down tests:
// vi.mock('recharts', () => new Proxy({}, {
//   get: () => () => null,
// }));

// Global test utilities (optional)
// Example: Add custom matchers, configure timers, etc.
// beforeEach(() => {
//   vi.useFakeTimers();
// });
//
// afterEach(() => {
//   vi.restoreAllMocks();
//   vi.useRealTimers();
// });
