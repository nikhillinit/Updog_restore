---
type: reflection
id: REFL-024
title: Integration Test Environment Leakage (5-Layer Defense)
status: DRAFT
date: 2026-02-18
version: 1
severity: high
wizard_steps: []
error_codes:
  [ERR_METRIC_ALREADY_REGISTERED, ECONNREFUSED, EADDRINUSE, ERR_ENV_LEAK]
components: [tests, server, integration, prometheus, express, database, vitest]
keywords:
  [
    integration-test,
    environment-leakage,
    side-effects,
    import-time,
    port-conflict,
    secret-leak,
    env-markers,
    vitest-workers,
    5-layer-defense,
  ]
test_file: tests/regressions/REFL-024.test.ts
superseded_by: null
---

# Reflection: Integration Test Environment Leakage (5-Layer Defense)

## 1. The Anti-Pattern (The Trap)

**Context:** Server modules execute side effects at import time -- registering
Prometheus metrics, binding Express middleware, reading `process.env` for
database credentials, and claiming TCP ports. When Vitest runs integration
tests, multiple test files in the same worker import overlapping server modules.
Each import-time side effect compounds: metrics register twice, ports conflict,
production credentials leak into test env, and database mocks import real DB
modules that attempt connections.

This is a **composite pattern** -- individual symptoms are covered by REFL-001
(dynamic imports), REFL-007 (global vi.mock pollution), and REFL-022 (Prometheus
duplicate registration). But the root cause is a single architectural flaw:
server infrastructure code assumes it runs once in a long-lived process, not
repeatedly in test workers.

**How to Recognize This Trap:**

1. **Error Signal:** Any of these during `npm test -- --project=server`:
   - `Error: A metric with the name X has already been registered`
   - `EADDRINUSE: address already in use :::3333`
   - Tests pass individually but fail when run together
   - Real database credentials appearing in test logs
   - `ECONNREFUSED` to PostgreSQL when tests should use mocks

2. **Code Pattern:** Multiple import-time side effects across server modules:

   ```typescript
   // ANTI-PATTERN -- server/metrics.ts
   // Executes on every import
   export const counter = new promClient.Counter({ name: 'x', help: 'x' });

   // ANTI-PATTERN -- server/app.ts
   // Reads real credentials at import time
   const dbUrl = process.env.DATABASE_URL;

   // ANTI-PATTERN -- server/index.ts
   // Binds port at import time
   app.listen(3333);

   // ANTI-PATTERN -- tests/mocks/database-mock.ts
   // Imports real DB module to mock it, triggering connection attempt
   import { db } from '../../server/db';
   vi.mock('../../server/db', () => ({ db: mockDb }));
   ```

3. **Mental Model:** Assuming test isolation means each test file gets a fresh
   module cache. In reality, Vitest workers share module state within a worker
   thread. `vi.mock()` hoisting and module cache invalidation are partial --
   some modules execute their top-level code before mocks take effect.

**Financial Impact:** Flaky CI blocks all merges. Developers spend hours
debugging "phantom" failures unrelated to their changes. Real database
credentials in test output are a security risk. Port conflicts cause cascading
test timeouts that waste CI minutes.

> **DANGER:** A single import-time side effect in server code can cascade
> through the entire integration test suite. The fix requires defense in depth
> -- no single layer is sufficient.

## 2. The Verified Fix (The Principle)

**Principle:** Defense in depth with 5 layers, each addressing a distinct
failure mode. No single layer is sufficient because the attack surface spans env
vars, ports, metrics, database connections, and module loading order.

### Layer 1: Secret Sanitization

Wipe real credentials before any server module can read them.

```typescript
// VERIFIED -- tests/integration/setup.ts (runs before all tests)

function sanitizeSecrets(): void {
  const sensitiveKeys = [
    'DATABASE_URL',
    'REDIS_URL',
    'SESSION_SECRET',
    'STRIPE_SECRET_KEY',
  ];
  for (const key of sensitiveKeys) {
    if (process.env[key] && !process.env[key]!.includes('test')) {
      process.env[key] = `test-sanitized-${key.toLowerCase()}`;
    }
  }
}

// Call BEFORE any server module import
sanitizeSecrets();
```

### Layer 2: Explicit Environment Markers

Distinguish test-set env vars from leaked production values.

```typescript
// VERIFIED -- tests/integration/setup.ts

// Set BEFORE any server module import
process.env._EXPLICIT_NODE_ENV = 'test';
process.env._EXPLICIT_DATABASE_URL = 'postgresql://test:test@localhost/test';

// Server code checks markers:
// if (process.env._EXPLICIT_DATABASE_URL) use it, else fallback to DATABASE_URL
```

### Layer 3: Ephemeral Ports

Never hardcode ports -- use OS-assigned ephemeral ports.

```typescript
// VERIFIED -- tests/integration/helpers.ts

export async function startTestServer(app: Express): Promise<{
  server: Server;
  port: number;
}> {
  return new Promise((resolve) => {
    // Port 0 = OS assigns an available port
    const server = app.listen(0, () => {
      const addr = server.address() as AddressInfo;
      resolve({ server, port: addr.port });
    });
  });
}
```

### Layer 4: Idempotent Metric Registration

Use `getOrCreate` factories (see REFL-022 for full pattern).

```typescript
// VERIFIED -- server/metrics.ts
function getOrCreateCounter(name: string, help: string, labelNames?: string[]) {
  const existing = register.getSingleMetric(name);
  if (existing) return existing as promClient.Counter<string>;
  return new promClient.Counter({
    name,
    help,
    ...(labelNames && { labelNames }),
  });
}
```

### Layer 5: Mock-Only Database Module

Database mocks must NOT import the real database module.

```typescript
// ANTI-PATTERN -- triggers real DB connection
import { db } from '../../server/db';
vi.mock('../../server/db', () => ({ db: createMockDb() }));

// VERIFIED -- pure mock, no real imports
// tests/mocks/database-mock.ts
export function createMockDb() {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockResolvedValue([{ id: 1 }]),
  };
}

// In test files:
vi.mock('../../server/db', () => ({
  db: createMockDb(),
}));
```

**Key Learnings:**

1. Layer ordering matters: sanitize secrets FIRST (layer 1), set markers SECOND
   (layer 2), then let server modules load
2. Each layer catches what others miss: ephemeral ports don't help with secret
   leaks, metric guards don't help with port conflicts
3. The 5 layers were discovered incrementally across 4 sessions -- each session
   fixed one failure mode only to expose the next
4. `vi.mock()` hoisting does NOT guarantee the mock executes before the module's
   top-level code in all cases

## 3. Evidence

- **Source Sessions:** Phase0 (2026-01-15), P4.5 (2026-02-10), P5 (2026-02-17),
  CI fixes (2026-02-18)
- **Commits:** `ee51ae96` (env markers), `687a9a89` (metrics getOrCreate),
  `3cb593e8` (database mock rewrite), `1cca4add` (RLS pool guard)
- **Files Affected:** `tests/integration/setup.ts`,
  `tests/mocks/database-mock.ts`, `server/metrics.ts`,
  `server/observability/performance-metrics.ts`,
  `server/metrics/variance-metrics.ts`, `server/lib/error-budget.ts`,
  `server/observability/lp-metrics.ts`
- **Related:** REFL-001 (dynamic imports), REFL-007 (global mock pollution),
  REFL-022 (Prometheus duplicate registration)
- **Trend:** Appeared in 4 separate sessions before all 5 layers were in place
