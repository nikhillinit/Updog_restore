---
status: ACTIVE
last_updated: 2026-01-19
---

# Test Fix Patterns

Reference for common test remediation patterns.

---

## 1. Redis Mocking with ioredis-mock

Use `ioredis-mock` to eliminate Redis dependency in tests.

### Setup

```bash
npm install -D ioredis-mock
```

### Pattern: Conditional Mock in Test Setup

```typescript
// tests/setup/node-setup-redis.ts
import RedisMock from 'ioredis-mock';
import Redis from 'ioredis';

const redis = process.env.NODE_ENV === 'test' || process.env.DEMO_CI
  ? new RedisMock()
  : new Redis(process.env.REDIS_URL);

export { redis };
```

### Pattern: Per-Test Mock

```typescript
import RedisMock from 'ioredis-mock';

describe('Cache Operations', () => {
  let redis: RedisMock;

  beforeEach(() => {
    redis = new RedisMock();
  });

  afterEach(async () => {
    await redis.flushall();
  });

  it('should cache and retrieve value', async () => {
    await redis.set('key', 'value');
    const result = await redis.get('key');
    expect(result).toBe('value');
  });
});
```

### Limitations

- Does not support all Redis commands (check ioredis-mock docs)
- No Lua scripting support
- Cluster mode not fully supported

---

## 2. E2E Auth Fixture with Playwright

Authenticate once, reuse across tests via storage state.

### Pattern: Auth Setup Fixture

```typescript
// tests/e2e/fixtures/auth.ts
import { test as base, expect } from '@playwright/test';
import path from 'path';

const STORAGE_STATE = path.join(__dirname, '../.auth/user.json');

export const test = base.extend({
  authenticatedPage: async ({ browser }, use) => {
    const context = await browser.newContext({ storageState: STORAGE_STATE });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});

// Setup project in playwright.config.ts
export default {
  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: 'e2e',
      dependencies: ['setup'],
      use: { storageState: STORAGE_STATE },
    },
  ],
};
```

### Pattern: Global Auth Setup

```typescript
// tests/e2e/global.setup.ts
import { chromium, FullConfig } from '@playwright/test';
import path from 'path';

const STORAGE_STATE = path.join(__dirname, '.auth/user.json');

async function globalSetup(config: FullConfig) {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // Perform login
  await page.goto('/login');
  await page.fill('[data-testid="email"]', process.env.TEST_USER_EMAIL!);
  await page.fill('[data-testid="password"]', process.env.TEST_USER_PASSWORD!);
  await page.click('[data-testid="submit"]');

  // Wait for auth to complete
  await page.waitForURL('/dashboard');

  // Save storage state
  await context.storageState({ path: STORAGE_STATE });
  await browser.close();
}

export default globalSetup;
```

---

## 3. Anti-Flake Patterns

### Pattern: Condition-Based Waiting

Replace arbitrary timeouts with condition polling.

```typescript
// BAD: Arbitrary timeout
await new Promise(resolve => setTimeout(resolve, 2000));
expect(element).toBeVisible();

// GOOD: Condition-based waiting
await expect(element).toBeVisible({ timeout: 5000 });
```

### Pattern: Retry with Exponential Backoff

```typescript
async function waitForCondition<T>(
  fn: () => Promise<T>,
  predicate: (result: T) => boolean,
  options: { maxAttempts?: number; baseDelay?: number } = {}
): Promise<T> {
  const { maxAttempts = 5, baseDelay = 100 } = options;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = await fn();
    if (predicate(result)) return result;
    await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, attempt)));
  }

  throw new Error(`Condition not met after ${maxAttempts} attempts`);
}

// Usage
const user = await waitForCondition(
  () => api.getUser(id),
  (user) => user.status === 'active'
);
```

### Pattern: Seeded PRNG for Monte Carlo

```typescript
// Use seeded random for deterministic tests
import seedrandom from 'seedrandom';

describe('Monte Carlo Simulation', () => {
  it('should produce consistent results with seed', () => {
    const rng = seedrandom('test-seed-123');

    // Replace Math.random in simulation
    const results = runSimulation({ random: () => rng() });

    // Results are now deterministic
    expect(results.mean).toBeCloseTo(0.5, 2);
  });
});
```

### Pattern: Test Isolation

```typescript
describe('Database Tests', () => {
  let testId: string;

  beforeEach(() => {
    // Use unique identifier per test
    testId = `test_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  });

  afterEach(async () => {
    // Clean up test data
    await db.delete(records).where(eq(records.testId, testId));
  });

  it('should create record', async () => {
    await service.create({ testId, name: 'test' });
    // Test is isolated from other concurrent tests
  });
});
```

---

## 4. @quarantine JSDoc Template

Document tests that cannot be fixed immediately.

### Template

```typescript
/**
 * @quarantine
 * @owner @team-name
 * @reason Brief explanation of why test is skipped
 * @exitCriteria Specific conditions for re-enabling
 * @addedDate YYYY-MM-DD
 *
 * Additional context or notes about the issue.
 */
it.skip('should do something', async () => {
  // Test implementation
});
```

### Example: Infrastructure Dependency

```typescript
/**
 * @quarantine
 * @owner @devops-team
 * @reason Test infrastructure does not support rate limiting verification
 * @exitCriteria Mock time control, request isolation, and dedicated Redis instance
 * @addedDate 2026-01-17
 *
 * Note: Security middleware IS applied (server/routes/portfolio-intelligence.ts:91)
 * Rate limiting requires dedicated test infrastructure to verify.
 */
it.skip('should enforce rate limiting', async () => {
  // Requires real Redis with TTL support
});
```

### Example: External Service Dependency

```typescript
/**
 * @quarantine
 * @owner @integrations-team
 * @reason Requires live Stripe sandbox which is rate-limited
 * @exitCriteria Stripe test fixtures or VCR-style recording
 * @addedDate 2026-01-15
 */
it.skip('should process webhook from Stripe', async () => {
  // External dependency
});
```

### Example: Known Bug

```typescript
/**
 * @quarantine
 * @owner @core-team
 * @reason Intermittent failure due to race condition in event loop
 * @exitCriteria Fix applied in issue #1234
 * @addedDate 2026-01-10
 *
 * Tracked: https://github.com/org/repo/issues/1234
 */
it.skip('should handle concurrent updates', async () => {
  // Known race condition
});
```

---

## 5. Quick Reference

| Pattern | When to Use |
|---------|-------------|
| ioredis-mock | Redis-dependent tests in CI |
| Auth fixture | E2E tests requiring authentication |
| Condition waiting | Async operations with variable timing |
| Seeded PRNG | Monte Carlo or random-based tests |
| Test isolation | Database tests running in parallel |
| @quarantine | Tests that need infrastructure changes |

---

## Related

- [service-testing-patterns.md](service-testing-patterns.md) - Service and API layer testing
- [testing.md](testing.md) - General testing guidelines
- [anti-pattern-prevention.md](anti-pattern-prevention.md) - What to avoid
