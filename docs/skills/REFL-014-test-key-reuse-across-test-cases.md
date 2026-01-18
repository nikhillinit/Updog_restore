---
type: reflection
id: REFL-014
title: Test Key Reuse Across Test Cases
status: DRAFT
date: 2026-01-18
version: 1
severity: medium
wizard_steps: []
error_codes: []
components: [tests, vitest, redis, fixtures]
keywords: [test-isolation, key-reuse, redis, beforeEach, uuid, flaky-tests]
test_file: tests/regressions/REFL-014.test.ts
superseded_by: null
---

# Reflection: Test Key Reuse Across Test Cases

## 1. The Anti-Pattern (The Trap)

**Context:** Tests that use fixed keys (`key-1`, `key-2`) without clearing storage between tests cause cross-test pollution when tests run in different orders.

**How to Recognize This Trap:**
1.  **Error Signal:** Tests pass individually but fail when run together; order-dependent test failures; "key already exists" errors
2.  **Code Pattern:** Hardcoded test keys without cleanup:
    ```typescript
    // ANTI-PATTERN
    describe('IdempotencyMiddleware', () => {
      it('stores response for key-1', async () => {
        await store.set('key-1', response1);
        // No cleanup
      });

      it('retrieves stored response', async () => {
        // Fails if previous test didn't run
        const result = await store.get('key-1');
      });
    });
    ```
3.  **Mental Model:** "Tests are independent, keys don't matter." In reality, without explicit cleanup, state persists between tests.

**Financial Impact:** Flaky test suites erode team confidence in CI. Tests that pass locally but fail in CI (or vice versa) waste debugging time and delay releases.

> **DANGER:** Do NOT reuse fixed keys across tests without explicit cleanup.

## 2. The Verified Fix (The Principle)

**Principle:** Each test must be independent - use unique keys or clear state in beforeEach.

**Implementation Pattern:**
1.  Generate unique keys per test using test name + UUID
2.  Clear all stores in beforeEach
3.  Use test context for automatic cleanup

```typescript
// VERIFIED IMPLEMENTATION

import { randomUUID } from 'crypto';

// Option 1: Unique keys per test (preferred)
describe('IdempotencyMiddleware', () => {
  function testKey(suffix: string): string {
    return `test-${randomUUID()}-${suffix}`;
  }

  it('stores response correctly', async () => {
    const key = testKey('store');
    await store.set(key, response);
    const result = await store.get(key);
    expect(result).toEqual(response);
    // Key is unique, no cleanup needed
  });

  it('handles missing key', async () => {
    const key = testKey('missing');
    const result = await store.get(key);
    expect(result).toBeNull();
  });
});

// Option 2: Clear store in beforeEach
describe('IdempotencyMiddleware', () => {
  beforeEach(async () => {
    await store.clear(); // or redisClient.flushDb()
  });

  it('stores response for key-1', async () => {
    await store.set('key-1', response);
    // Store cleared before next test
  });
});

// Option 3: Test-scoped keys with context
describe('IdempotencyMiddleware', () => {
  let testId: string;

  beforeEach(() => {
    testId = randomUUID();
  });

  const key = (name: string) => `${testId}-${name}`;

  it('example test', async () => {
    await store.set(key('example'), value);
    // testId changes per test
  });
});
```

**Key Learnings:**
1. UUID keys guarantee isolation without cleanup overhead
2. `beforeEach` cleanup is reliable but slower
3. Test name in key helps debugging: `${test.name}-${uuid}`

## 3. Evidence

*   **Test Coverage:** `tests/regressions/REFL-014.test.ts` demonstrates key isolation
*   **Source Session:** Jan 8-18 2026 - Idempotency test failures (Codex analysis)
*   **Related:** REFL-007 (global vi.mock pollution)
