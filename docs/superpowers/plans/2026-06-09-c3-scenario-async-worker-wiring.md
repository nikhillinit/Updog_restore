# C3: Scenario Async Worker Persistence — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the fund-scenario-calc BullMQ worker in-process so
reserve-allocation scenario jobs are consumed, calculated, and persisted —
ending the infinite `queued` state.

**Architecture:** The handler (`workers/fund-scenario-calc-handler.ts`) and
worker module (`workers/fund-scenario-calc-worker.ts`) already exist and are
unit-tested. The gap is a single missing init function in `server/queues/` that
creates the BullMQ Worker using the IORedis connection supplied by
`providers.ts`, and a one-line call to that function in
`providers.ts::buildQueue()`. No other files change.

**Tech Stack:** BullMQ, Node.js, TypeScript, Vitest

---

## File Map

| File                                                       | Action     | Responsibility                                                                       |
| ---------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------ |
| `server/queues/fund-scenario-calc-worker-init.ts`          | **Create** | `initializeFundScenarioCalcWorker(redis)` — creates Worker, returns `{close}`        |
| `server/providers.ts`                                      | **Modify** | Call `initializeFundScenarioCalcWorker(redis)` in `buildQueue()::Promise.allSettled` |
| `tests/unit/queues/fund-scenario-calc-worker-init.test.ts` | **Create** | Unit tests for the init function                                                     |

---

## Task 1: Unit tests for `initializeFundScenarioCalcWorker`

**Files:**

- Create: `tests/unit/queues/fund-scenario-calc-worker-init.test.ts`

These tests verify the init function creates a Worker with the correct queue
name and settings, and that the returned `close()` function delegates to
`worker.close()`. Write them first — they'll fail with an import error until
Task 2 creates the implementation.

- [ ] **Step 1: Create the test file**

```typescript
// tests/unit/queues/fund-scenario-calc-worker-init.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  workerConstructorMock,
  workerOnMock,
  workerCloseMock,
  loggerInfoMock,
  loggerErrorMock,
} = vi.hoisted(() => ({
  workerConstructorMock: vi.fn(),
  workerOnMock: vi.fn(),
  workerCloseMock: vi.fn().mockResolvedValue(undefined),
  loggerInfoMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock('bullmq', () => ({
  Worker: function MockWorker(...args: unknown[]) {
    workerConstructorMock(...args);
    return { on: workerOnMock, close: workerCloseMock };
  },
}));

vi.mock('../../../server/queues/redis-connection', () => ({
  getBullMQConnection: vi
    .fn()
    .mockReturnValue({ host: 'localhost', port: 6379 }),
}));

vi.mock('../../../server/logger', () => ({
  logger: { info: loggerInfoMock, error: loggerErrorMock },
}));

describe('initializeFundScenarioCalcWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a BullMQ Worker on the fund-scenario-calc queue with correct settings', async () => {
    const { initializeFundScenarioCalcWorker } =
      await import('../../../server/queues/fund-scenario-calc-worker-init');
    const mockRedis = {} as import('ioredis').default;

    await initializeFundScenarioCalcWorker(mockRedis);

    expect(workerConstructorMock).toHaveBeenCalledWith(
      'fund-scenario-calc',
      expect.any(Function),
      expect.objectContaining({ concurrency: 2, lockDuration: 300_000 })
    );
  });

  it('returns a close function that calls worker.close()', async () => {
    const { initializeFundScenarioCalcWorker } =
      await import('../../../server/queues/fund-scenario-calc-worker-init');
    const mockRedis = {} as import('ioredis').default;

    const { close } = await initializeFundScenarioCalcWorker(mockRedis);
    await close();

    expect(workerCloseMock).toHaveBeenCalledTimes(1);
  });

  it('logs startup on initialization', async () => {
    const { initializeFundScenarioCalcWorker } =
      await import('../../../server/queues/fund-scenario-calc-worker-init');
    const mockRedis = {} as import('ioredis').default;

    await initializeFundScenarioCalcWorker(mockRedis);

    expect(loggerInfoMock).toHaveBeenCalledWith(
      expect.stringContaining('[fund-scenario-calc]')
    );
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail with import error**

```
npx cross-env TZ=UTC vitest run tests/unit/queues/fund-scenario-calc-worker-init.test.ts --project=server
```

Expected: 3 tests FAIL with
`Cannot find module '../../../server/queues/fund-scenario-calc-worker-init'`

---

## Task 2: Create `server/queues/fund-scenario-calc-worker-init.ts`

**Files:**

- Create: `server/queues/fund-scenario-calc-worker-init.ts`

The handler is lazy-imported (`await import(...)`) **inside** the processor
callback to break the `server → workers → server` circular dependency that would
occur with a static import.

- [ ] **Step 1: Create the implementation file**

```typescript
// server/queues/fund-scenario-calc-worker-init.ts
import type IORedis from 'ioredis';
import { Worker, type Job } from 'bullmq';
import { getBullMQConnection } from './redis-connection.js';
import { logger } from '../logger.js';

interface FundScenarioCalcJobData {
  fundId: number;
  scenarioSetId: string;
  correlationId: string;
  calculationMode: string;
  actor: { userId: number | null; label: string | null } | null;
}

export async function initializeFundScenarioCalcWorker(
  redis: IORedis
): Promise<{ close: () => Promise<void> }> {
  const connection = getBullMQConnection(redis);

  // eslint-disable-next-line povc-security/require-bullmq-config -- lockDuration serves as timeout
  const worker = new Worker<FundScenarioCalcJobData>(
    'fund-scenario-calc',
    async (job: Job<FundScenarioCalcJobData>) => {
      const { handleFundScenarioCalcJob } =
        await import('../../workers/fund-scenario-calc-handler.js');
      return handleFundScenarioCalcJob(job);
    },
    {
      connection,
      concurrency: 2,
      lockDuration: 300_000,
    }
  );

  worker.on('completed', (job: Job<FundScenarioCalcJobData>) => {
    logger.info('[fund-scenario-calc] Worker completed job', { jobId: job.id });
  });

  worker.on(
    'failed',
    (job: Job<FundScenarioCalcJobData> | undefined, error: Error) => {
      logger.error('[fund-scenario-calc] Worker failed job', error, {
        jobId: job?.id,
      });
    }
  );

  logger.info('[fund-scenario-calc] In-process worker started');

  return {
    close: async () => {
      await worker.close();
      logger.info('[fund-scenario-calc] In-process worker stopped');
    },
  };
}
```

- [ ] **Step 2: Run the unit tests — expect all 3 to pass**

```
npx cross-env TZ=UTC vitest run tests/unit/queues/fund-scenario-calc-worker-init.test.ts --project=server
```

Expected output:

```
Test Files  1 passed (1)
     Tests  3 passed (3)
```

- [ ] **Step 3: Type-check**

```
npm run check
```

Expected: zero TypeScript errors. If there are type errors in the new file, fix
them before continuing.

- [ ] **Step 4: Lint**

```
npm run lint
```

Expected: zero warnings. Common issues to watch for:

- Missing `eslint-disable-next-line povc-security/require-bullmq-config` comment
  on the `new Worker(...)` line (already included in the template above)
- Unused import warnings

- [ ] **Step 5: Commit**

```
git add server/queues/fund-scenario-calc-worker-init.ts tests/unit/queues/fund-scenario-calc-worker-init.test.ts
git commit -m "feat(scenarios): in-process fund-scenario-calc worker init"
```

---

## Task 3: Wire `initializeFundScenarioCalcWorker` into `providers.ts`

**Files:**

- Modify: `server/providers.ts` lines 216–235 (the `buildQueue` function body)

Two changes needed: add a dynamic import and add the call to
`Promise.allSettled`.

- [ ] **Step 1: Add the import and call to `buildQueue`**

In `server/providers.ts`, locate the `buildQueue` function. Find the block that
looks like:

```typescript
const { initializeSimulationQueue } =
  await import('./queues/simulation-queue.js');
const { initializeReportQueue } =
  await import('./queues/report-generation-queue.js');
const { initializeBacktestingQueue } =
  await import('./queues/backtesting-queue.js');
```

Add one line immediately after:

```typescript
const { initializeFundScenarioCalcWorker } =
  await import('./queues/fund-scenario-calc-worker-init.js');
```

Then locate the `Promise.allSettled` block:

```typescript
const initResults = await Promise.allSettled([
  initializeSimulationQueue(redis),
  initializeReportQueue(redis),
  initializeBacktestingQueue(redis),
]);
```

Add `initializeFundScenarioCalcWorker(redis),` as the fourth entry:

```typescript
const initResults = await Promise.allSettled([
  initializeSimulationQueue(redis),
  initializeReportQueue(redis),
  initializeBacktestingQueue(redis),
  initializeFundScenarioCalcWorker(redis),
]);
```

- [ ] **Step 2: Type-check**

```
npm run check
```

Expected: zero errors.

- [ ] **Step 3: Run server unit tests**

```
npx cross-env TZ=UTC npm test -- --project=server
```

Expected: all server tests pass. The suite for the queue init file (3 tests)
should continue to pass.

- [ ] **Step 4: Commit**

```
git add server/providers.ts
git commit -m "feat(scenarios): wire fund-scenario-calc worker into providers buildQueue"
```

---

## Task 4: Quality gate — lint, typecheck, full unit suite

- [ ] **Step 1: Full lint pass**

```
npm run lint
```

Expected: zero warnings.

- [ ] **Step 2: Full type check**

```
npm run check
```

Expected: zero errors.

- [ ] **Step 3: Full server unit test suite**

```
npx cross-env TZ=UTC npm test -- --project=server
```

Expected: all tests pass. Confirm the 3 new tests in
`tests/unit/queues/fund-scenario-calc-worker-init.test.ts` appear in the output.

---

## Task 5: Integration gate (WSL2 required on Windows)

The scenario release gate is the authoritative end-to-end proof. It spins up
real Redis + Postgres via Testcontainers, enqueues a `reserve_allocation` job,
waits for the worker to complete it, and asserts `status: 'succeeded'` with a
non-null `snapshotId`.

**This gate requires WSL2 with Docker on Windows.** Run it from WSL2:

```bash
# In WSL2 Ubuntu terminal (not PowerShell)
cd /path/to/Updog_restore
CI=true NODE_OPTIONS=--max-old-space-size=4096 npm run test:scenario-release-gate
```

Expected: all tests in `scenario-release-gate.integration.test.ts` pass.

If the gate passes, the implementation is complete and ready to ship.

> **Note:** The integration test starts its own in-process worker via
> `startInProcessFundScenarioCalcWorkerHarness()`, so it does NOT directly
> exercise the `providers.ts` wiring. What it proves is that the handler +
> reserve calculation + snapshot persistence chain works end-to-end. The
> `providers.ts` wiring is covered by the unit tests in Task 2 + the smoke that
> the app boots without error.

---

## Self-Review Notes

**Spec coverage check:**

- [x] New file `server/queues/fund-scenario-calc-worker-init.ts` — covered by
      Task 2
- [x] `server/providers.ts` wiring — covered by Task 3
- [x] `lockDuration: 300_000` + eslint disable — in Task 2 Step 1 code
- [x] Lazy-import circular dep avoidance — in Task 2 Step 1 code
- [x] `concurrency: 2` — in Task 2 Step 1 code
- [x] Graceful `close()` — in Task 2 Step 1 code and tested in Task 1
- [x] Quality gates — covered by Tasks 4 and 5

**No other files change.** The handler, standalone worker, harness, tests, queue
service, and registry are all untouched.
