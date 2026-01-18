---
type: reflection
id: REFL-007
title: Global vi.mock Pollutes All Tests
status: VERIFIED
date: 2026-01-18
version: 1
severity: high
wizard_steps: []
error_codes: []
components: [tests, vitest, mocking]
keywords: [vi.mock, global-mock, test-pollution, vitest, mock-factory]
test_file: tests/regressions/REFL-007.test.ts
superseded_by: null
---

# Reflection: Global vi.mock Pollutes All Tests

## 1. The Anti-Pattern (The Trap)

**Context:** Shared test utility files that call `vi.mock()` at the top level pollute the mock state for ALL tests in the test run, even tests that don't import the utility.

**How to Recognize This Trap:**
1.  **Error Signal:** Tests fail with "cannot read property of undefined" or unexpected mock behavior when run in full suite, but pass when run individually
2.  **Code Pattern:** Global `vi.mock()` calls in shared utility files:
    ```typescript
    // tests/helpers/database-mock.ts
    // ANTI-PATTERN - This pollutes ALL tests!
    vi.mock('../../server/db', () => ({
      db: { query: vi.fn() }
    }));

    export const mockDb = { query: vi.fn() };
    ```
3.  **Mental Model:** Assuming `vi.mock()` is scoped to files that import it. In reality, Vitest hoists all `vi.mock()` calls globally.

**Financial Impact:** Flaky test suites cause engineers to distrust CI. Real bugs slip through when tests are ignored as "just flaky."

> **DANGER:** Do NOT use `vi.mock()` at the top level of shared utility files.

## 2. The Verified Fix (The Principle)

**Principle:** Use factory functions to create mocks on-demand, keeping mock scope explicit.

**Implementation Pattern:**
1.  Never call `vi.mock()` in shared utility files
2.  Export factory functions that return mock implementations
3.  Let each test file call `vi.mock()` explicitly

```typescript
// VERIFIED IMPLEMENTATION

// tests/helpers/database-mock.ts
// Export factory function, NOT a global mock
export function createMockDb() {
  return {
    query: vi.fn(),
    transaction: vi.fn(),
    // ... other methods
  };
}

export function createMockPool() {
  return {
    connect: vi.fn(),
    end: vi.fn(),
  };
}

// tests/unit/my-service.test.ts
// Each test file explicitly sets up its mocks
import { createMockDb } from '../helpers/database-mock';

const mockDb = createMockDb();

vi.mock('../../server/db', () => ({
  db: mockDb
}));

describe('MyService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should query database', async () => {
    mockDb.query.mockResolvedValueOnce([{ id: 1 }]);
    // test logic
  });
});
```

**Key Learnings:**
1. `vi.mock()` is hoisted and applied globally by Vitest
2. Only 4 files might import a utility, but ALL tests get polluted
3. Factory functions make mock scope explicit and testable
4. Use `vi.clearAllMocks()` in beforeEach for isolation

## 3. Evidence

*   **Test Coverage:** `tests/regressions/REFL-007.test.ts` demonstrates the pollution pattern
*   **Source Session:** Jan 1-7 2026 conversation analysis - database-mock.ts refactoring
*   **Files Affected:** `tests/helpers/database-mock.ts` and all consumers
