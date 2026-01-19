---
status: ACTIVE
last_updated: 2026-01-19
---

# Task 3 Validation - Discovery Findings

**Date**: 2026-01-16
**Phase**: Discovery Pass

## Test Infrastructure Requirements

### Critical Discovery: Server Auto-Startup

**Key Finding**: Integration tests have automatic server startup built-in!

From `tests/integration/setup.ts`:
```typescript
beforeAll(async () => {
  // Check if server already running
  const healthUrl = `${baseUrl}/healthz`;
  const response = await fetch(healthUrl);

  if (response.ok) {
    console.log('Server already running, using existing instance');
    return;
  }

  // Server not running, start it automatically
  serverProcess = spawn('npm', ['run', 'dev:quick'], { ... });

  // Wait for server to be ready
  const isReady = await waitForServer(healthUrl, 30000);
});
```

**Implication**: We don't need to manually start the server! The test setup does it automatically.

---

## Environment Variables

### Auto-Configured in setup.ts

The following env vars are set automatically by the test setup:
```typescript
process.env.TZ = 'UTC';
process.env.NODE_ENV = 'test';
process.env.PORT = '3333';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/povc_test';
process.env.REDIS_URL = 'memory://';
process.env.ENABLE_QUEUES = '0';
```

### Required (Must Be Set)

**DATABASE_URL** - If not set, defaults to:
```
postgresql://postgres:postgres@localhost:5432/povc_test
```

**Analysis**:
- Redis uses memory mode (no external Redis needed)
- Queues are disabled
- Port 3333 is auto-set
- DATABASE_URL has fallback but requires PostgreSQL server

---

## Server Startup Process

### What `npm run dev:quick` Does

From package.json:
```json
"dev:quick": "cross-env NODE_ENV=development REDIS_URL=memory:// ENABLE_QUEUES=0 npx tsx server/bootstrap.ts"
```

**Requirements**:
- Node.js runtime (tsx)
- `server/bootstrap.ts` exists and is valid
- No external Redis (memory mode)
- No queue workers

**Startup Timeout**: 30 seconds (configurable)

---

## Test Execution Command

### Primary Command

```bash
npm run test:integration
```

Expands to:
```bash
cross-env TZ=UTC vitest -c vitest.config.int.ts run
```

### Config Details (`vitest.config.int.ts`)

- **Environment**: Node.js
- **Setup File**: `tests/integration/setup.ts` (runs before all tests)
- **Pool**: Forks with `singleFork: true` (prevents parallel execution)
- **Timeouts**:
  - Test: 30s
  - Hook: 30s
  - Teardown: 10s

---

## Database Requirement Analysis

### The Only Real Blocker

**PostgreSQL Server Required**:
- Default: `localhost:5432`
- Database: `povc_test`
- User: `postgres`
- Password: `postgres`

**Options**:
1. **Have PostgreSQL running locally** (ideal)
2. **Use Docker**: `docker run -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=povc_test postgres`
3. **Skip DB-dependent tests**: Not possible - setup.ts spawns server which requires DB

---

## What Happens Without PostgreSQL?

### Server Startup Will Fail

From setup.ts error handling:
```typescript
serverProcess.stderr?.on('data', (data) => {
  const error = data.toString();
  if (!error.includes('DATABASE_URL not set')) {
    console.error('Server error:', error);
  }
});
```

**Expected Behavior**:
- Server tries to start
- Fails to connect to database
- Waits 30 seconds
- Throws: "Server failed to start within 30 seconds"

---

## Our 3 Enabled Tests

### Test 1: `interleaved-thinking.test.ts`

**Dependencies**:
- Express app with routes
- Mock Anthropic SDK (already configured)
- Mock database pool (already configured)
- **Status**: Should work if server starts

### Test 2: `reserves-integration.test.ts`

**Dependencies**:
- Client-side calculation functions only
- No server required
- No database required
- **Status**: Should work immediately (pure functions)

### Test 3: `dev-memory-mode.test.ts`

**Dependencies**:
- Server startup (loadEnv, buildProviders, createServer)
- Memory-only Redis (no external Redis needed)
- In-memory database providers
- **Status**: Should work if server starts, may not need PostgreSQL

---

## Decision Point Data

### Option A: Try Without PostgreSQL

**Likelihood of Success**: 33%
- Test 2 (reserves-integration): Will definitely work (pure functions)
- Test 1 (interleaved-thinking): Will fail (server won't start)
- Test 3 (dev-memory-mode): Will fail (server won't start)

**Time Investment**: 5 minutes
**Learning Value**: Confirm test 2 works, see actual errors for tests 1 & 3

### Option B: Set Up PostgreSQL + Run All Tests

**Likelihood of Success**: 90%
- All infrastructure in place
- Server can start successfully
- Tests can execute

**Time Investment**: 15-30 minutes
- Docker: 5 min to start container
- Local PostgreSQL: 10-15 min to install (if not already present)
- Test execution: 1-2 min

**Learning Value**: Full validation, actual pass/fail results

---

## Recommendation

**Try Hybrid Approach**:

1. **Quick check** (2 min): Run test 2 alone (reserves-integration)
   - This test doesn't need server
   - Proves at least one test works
   - Validates our dynamic import work

2. **If reserves test passes** → Proceed with PostgreSQL setup for tests 1 & 3
3. **If reserves test fails** → Investigate why (unexpected issue)

**Command for Test 2 Only**:
```bash
npm run test:integration -- tests/integration/reserves-integration.test.ts
```

Note: This will still try to start the server (setup.ts runs), but test itself doesn't use it.

---

## Next Steps

Based on this discovery:

1. ✅ **Decision Made**: PostgreSQL is required for full validation
2. ⏭️ **Next**: Decide whether to invest in PostgreSQL setup (Option B)
3. 🔄 **Alternative**: Run reserves test only, defer others

**Question**: Do we have PostgreSQL installed locally, or should we use Docker?
