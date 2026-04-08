---
phase: 04-sensitivity-surface-polish
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - tests/integration/sensitivity-routes.test.ts
autonomous: true
requirements:
  - REQ-SENS-01
must_haves:
  truths:
    - 'A new integration test file at
      tests/integration/sensitivity-routes.test.ts exercises all three
      sensitivity POST routes (one-way, two-way, stress) end-to-end through a
      mini-Express app'
    - 'Each of the three routes has at least one happy-path (200) test and one
      error-path test that asserts a code from STATUS_BY_CODE other than 500'
    - 'The test mounts server/routes/sensitivity.ts on a fresh express instance
      via supertest — it does NOT spawn a child process or hit the
      globally-managed test server (per REFL-024 and the backtesting-api.test.ts
      template pattern)'
    - 'Services and engines are stubbed via vi.mock against the dynamic import
      resolved specifier — matching the existing unit-layer pattern in
      tests/unit/routes/sensitivity-routes-error-mapping.test.ts'
    - 'The test file lives under tests/integration/ (NOT __tests__/) per
      REFL-036 and the scripts/check-orphan-tests.mjs pre-push gate'
    - 'The test does NOT duplicate the full STATUS_BY_CODE matrix (the one-way
      route unit test already covers that) — it picks ONE distinctive error code
      per route that proves end-to-end wiring'
    - 'Running the file via the integration runner exits 0 with the expected
      test count (at least 6 tests = 3 routes x 2 paths)'
  artifacts:
    - path: 'tests/integration/sensitivity-routes.test.ts'
      provides:
        'End-to-end request->engine->response contract coverage for the
        sensitivity route trio'
      contains: 'one-way'
  key_links:
    - from: 'tests/integration/sensitivity-routes.test.ts'
      to: 'server/routes/sensitivity.ts'
      via: 'default-export router mounted on a fresh express app'
      pattern: "app.use\\('/api', sensitivityRouter\\)"
    - from: 'tests/integration/sensitivity-routes.test.ts'
      to: 'server/services/one-way-sensitivity-engine.ts'
      via:
        "vi.mock of the dynamically imported specifier
        '../../server/services/one-way-sensitivity-engine'"
      pattern: 'vi.mock.*one-way-sensitivity-engine'
    - from: 'tests/integration/sensitivity-routes.test.ts'
      to: 'server/services/two-way-sensitivity-engine.ts'
      via:
        "vi.mock of the dynamically imported specifier
        '../../server/services/two-way-sensitivity-engine'"
      pattern: 'vi.mock.*two-way-sensitivity-engine'
    - from: 'tests/integration/sensitivity-routes.test.ts'
      to: 'server/services/stress-test-engine.ts'
      via:
        "vi.mock of the dynamically imported specifier
        '../../server/services/stress-test-engine'"
      pattern: 'vi.mock.*stress-test-engine'
    - from: 'tests/integration/sensitivity-routes.test.ts'
      to: 'server/services/sensitivity-run-service.ts'
      via:
        "vi.mock of '../../server/services/sensitivity-run-service' capturing
        createPending/markCompleted/markFailed"
      pattern: 'vi.mock.*sensitivity-run-service'
---

<objective>
Close Phase 4 success criterion 3 ("integration tests cover all three sensitivity routes including at least one error path each") by adding a single integration test file that exercises `/api/funds/:id/sensitivity/{one-way,two-way,stress}` end-to-end through a fresh Express instance.

Per CONTEXT.md D-01, this is a **mock-DB integration test via supertest**, NOT a
full server-spawn test. The pattern is copied from
`tests/integration/backtesting-api.test.ts` (which also uses `vi.mock` +
supertest + a locally-mounted router), NOT from
`tests/integration/variance-planner-leader-election.test.ts` (which hits a real
Postgres).

The existing `tests/unit/routes/sensitivity-routes-error-mapping.test.ts`
already covers the full STATUS_BY_CODE matrix at the unit layer for the one-way
route. This integration test's job is different: prove the end-to-end request ->
engine stub -> response shape works for ALL THREE routes, with the service
layer's `createPending`/`markCompleted`/`markFailed` lifecycle running through
the real handler. It picks ONE distinctive error per route to validate the error
branch without duplicating the unit-layer matrix.

Purpose: satisfy Phase 4 success criterion 3 with a single focused file that
Phase 4's verification gates can point at. Also exercises the dynamic-import
seam that Plan 04-02 will capture in REFL-037.

Output: one new file at `tests/integration/sensitivity-routes.test.ts`
containing a minimum of 6 tests (3 routes x 2 paths: happy + error).
</objective>

<execution_context>
@C:/Users/nikhi/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/nikhi/.claude/get-shit-done/templates/summary.md </execution_context>

<context>
@.planning/phases/04-sensitivity-surface-polish/04-CONTEXT.md
@CLAUDE.md

<interfaces>
<!-- Key contracts. Executor should use these directly. -->

From server/routes/sensitivity.ts (the full route surface under test — READ THIS
FIRST):

```typescript
// Error code -> HTTP status table (lines 34-41).
const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  NO_PUBLISHED_CONFIG: 409,
  INVALID_PUBLISHED_CONFIG: 422,
  UNSUPPORTED_VARIABLE_PATH: 400,
  METRIC_PATH_NOT_FOUND: 500,
  METRIC_NOT_NUMBER: 500,
  ENGINE_FAILURE: 500,
};

// Route handlers (all three follow the same shape):
router.post('/funds/:id/sensitivity/one-way', async (req, res) => { ... });
router.post('/funds/:id/sensitivity/two-way', async (req, res) => { ... });
router.post('/funds/:id/sensitivity/stress',  async (req, res) => { ... });

// Services loaded via dynamic import inside each handler:
//   await import('../services/sensitivity-run-service')
//   await import('../services/one-way-sensitivity-engine')
//   await import('../services/two-way-sensitivity-engine')
//   await import('../services/stress-test-engine')

// Each handler lifecycle:
//   1. parse req.params.id as a positive integer (400 INVALID_FUND_ID on failure)
//   2. zod safeParse the body (400 INVALID_PARAMS on failure with issues[])
//   3. sensitivityRunService.createPending(fundId, kind, params, userId) -> run
//   4. engine.run*(fundId, params) -> result OR throws SensitivityEngineError
//   5a. happy: sensitivityRunService.markCompleted(run.id, result, durationMs) -> completedRun
//       res.status(200).json({ run: completedRun, result })
//   5b. error: code = err.code (or 'ENGINE_FAILURE'), status = STATUS_BY_CODE[code] ?? 500
//       sensitivityRunService.markFailed(run.id, code, message, durationMs)
//       res.status(status).json({ code, message })
```

From tests/unit/routes/sensitivity-routes-error-mapping.test.ts (the EXISTING
unit-layer pattern the integration test should copy at the mock-setup level):

```typescript
const {
  createPendingMock,
  markCompletedMock,
  markFailedMock,
  getHistoryByFundMock,
  getByIdMock,
  runOneWaySensitivityMock,
} = vi.hoisted(() => ({
  createPendingMock: vi.fn(),
  markCompletedMock: vi.fn(),
  markFailedMock: vi.fn(),
  getHistoryByFundMock: vi.fn(),
  getByIdMock: vi.fn(),
  runOneWaySensitivityMock: vi.fn(),
}));

vi.mock('../../../server/services/sensitivity-run-service', () => ({
  sensitivityRunService: {
    createPending: createPendingMock,
    markCompleted: markCompletedMock,
    markFailed: markFailedMock,
    getHistoryByFund: getHistoryByFundMock,
    getById: getByIdMock,
  },
}));

vi.mock('../../../server/services/one-way-sensitivity-engine', () => {
  class SensitivityEngineError extends Error {
    public readonly code: string;
    constructor(code: string, message: string) {
      super(message);
      this.name = 'SensitivityEngineError';
      this.code = code;
    }
  }
  return {
    oneWaySensitivityEngine: { runOneWaySensitivity: runOneWaySensitivityMock },
    SensitivityEngineError,
  };
});

import sensitivityRouter from '../../../server/routes/sensitivity';
```

NOTE: the specifier path in the unit test is `'../../../server/...'` because
that file lives at `tests/unit/routes/` (three levels up). The integration test
lives at `tests/integration/` (two levels up from repo root), so the specifiers
in THIS plan's file must use `'../../server/...'` (two ups). Count the slashes
carefully.

From tests/integration/backtesting-api.test.ts (the TEMPLATE for this file's
overall shape — mini-express, vi.mock service layer, supertest):

```typescript
process.env.NODE_ENV = 'test';
process.env.VITEST = 'true';

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// ... vi.hoisted mocks, vi.mock calls ...

let app: express.Express;

beforeAll(async () => {
  const sensitivityRouter = (await import('../../server/routes/sensitivity'))
    .default;
  app = express();
  app.set('trust proxy', false);
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', sensitivityRouter);
});

beforeEach(() => {
  vi.clearAllMocks();
  // re-prime mock returns
});
```

CRITICAL difference from backtesting-api.test.ts: sensitivity routes do NOT use
any authentication middleware. Grep `server/routes.ts` for how
`sensitivityRouter` is mounted to confirm — no `authenticateJWT` wrapper. Do NOT
add `asUser()` / `authToken` / `Bearer` headers to this test.

From shared/contracts/sensitivity-run-v1.contract.ts (the request body shapes —
exact Zod schemas; the executor MUST read this file to confirm the field names
for two-way and stress before running the test):

```typescript
// OneWayAnalysisRequestV1 (verified against the unit test fixture):
{
  variableId: 'reserve_pool_pct',
  range: { min: 0, max: 0.5 },
  steps: 5,
  metricId: 'tvpi',
}

// TwoWayAnalysisRequestV1 (derived from TwoWayPanel + schema — CONFIRM
// against the contract before running):
{
  variableXId: '...',
  rangeX: { min: number, max: number },
  stepsX: number,
  variableYId: '...',
  rangeY: { min: number, max: number },
  stepsY: number,
  metricId: '...',
}

// StressAnalysisRequestV1 (derived from StressPanel — CONFIRM against the
// contract; field may be `scenarioIds` or `scenarios` depending on the schema):
{
  scenarioIds: ['...'],
  metricId: '...',
}
```

IMPORTANT: the executor MUST read
shared/contracts/sensitivity-run-v1.contract.ts and
shared/contracts/sensitivity-variables-v1.ts to get the EXACT minimal valid body
for two-way and stress. Do NOT invent field names — use what Zod requires or the
400 INVALID_PARAMS branch will fire instead of the intended 200 branch.
</interfaces> </context>

<tasks>

<task type="auto">
  <name>Task 1: Create tests/integration/sensitivity-routes.test.ts with 6+ tests covering all three routes</name>
  <files>tests/integration/sensitivity-routes.test.ts</files>
  <read_first>
    - server/routes/sensitivity.ts (full file — confirm the three POST routes, the STATUS_BY_CODE table at lines 34-41, the dynamic-import specifiers inside each handler, and the exact lifecycle createPending -> engine.run* -> markCompleted/markFailed -> res.status)
    - tests/unit/routes/sensitivity-routes-error-mapping.test.ts (FULL file — copy the vi.hoisted + vi.mock pattern verbatim for the one-way route, extend it to cover the two other engines)
    - tests/integration/backtesting-api.test.ts (lines 1-310 — template for the top-of-file shape, `beforeAll` that dynamically imports the router, mini-express mount pattern; IGNORE the auth/JWT bits, sensitivity routes are unauthenticated)
    - shared/contracts/sensitivity-run-v1.contract.ts (confirm the exact Zod shapes for OneWayAnalysisRequestV1, TwoWayAnalysisRequestV1, StressAnalysisRequestV1 — use these to build minimal valid bodies)
    - shared/contracts/sensitivity-variables-v1.ts (confirm SUPPORTED_VARIABLES, SUPPORTED_METRICS, SUPPORTED_STRESS_SCENARIOS enum values to pick valid ids for the request bodies)
    - server/services/one-way-sensitivity-engine.ts (lines 34-41 — confirm SensitivityEngineError class shape so the vi.mock class stub matches)
    - server/services/two-way-sensitivity-engine.ts (lines 34-36 — confirms SensitivityEngineError is RE-EXPORTED from one-way; the vi.mock of two-way must also expose SensitivityEngineError to match what the route handler destructures)
    - server/services/stress-test-engine.ts (confirm the same re-export pattern)
    - server/services/sensitivity-run-service.ts (confirm the exported singleton name `sensitivityRunService` and the method signatures for createPending/markCompleted/markFailed)
    - vitest.config.int.ts (confirm include globs match tests/integration/**/*.test.ts so the new file is picked up)
    - docs/skills/REFL-036-silent-test-discovery-loss-from-tests-dirs.md (the orphan-test gate — the new file MUST live under tests/integration/, never under __tests__/)
    - MEMORY note "Integration Test Server Lifecycle (CI Ceiling)" — the global setup spawns ONE shared server, but this test does NOT touch it; it mounts its own mini-express and never emits an HTTP request beyond supertest's in-process pipe
  </read_first>
  <behavior>
    Integration test file with AT LEAST 6 tests (3 routes x 2 paths). Optional guard tests (INVALID_FUND_ID, INVALID_PARAMS) are permitted but not required — the unit test layer already covers those.

    Suite structure:

    `describe('sensitivity routes (integration)', () => { ... })` containing three child describes:

    1. `describe('POST /api/funds/:id/sensitivity/one-way', ...)`
       - Test 1a (happy): createPending returns a pending run stub, engine.runOneWaySensitivity resolves with a minimal valid OneWayAnalysisResultV1 stub, markCompleted resolves with a completed-run stub. Assert response.status === 200, response.body.run.status === 'completed', response.body.result matches the engine return, AND the lifecycle calls happened in order: createPendingMock called once with (1, 'one_way', validBody, 0), markCompletedMock called once (not markFailedMock).
       - Test 1b (error): engine.runOneWaySensitivity rejects with new SensitivityEngineError('NO_PUBLISHED_CONFIG', ...). Assert response.status === 409, response.body.code === 'NO_PUBLISHED_CONFIG', response.body.message is a non-empty string, markFailedMock called with code 'NO_PUBLISHED_CONFIG', markCompletedMock NOT called. This is the DISTINCTIVE error per D-01 — 409 is the only status unique to NO_PUBLISHED_CONFIG in the table, so it proves the full chain ran.

    2. `describe('POST /api/funds/:id/sensitivity/two-way', ...)`
       - Test 2a (happy): analogous to 1a. Use a minimal valid TwoWayAnalysisRequestV1 body. Engine stub resolves with a minimal valid TwoWayAnalysisResultV1. Assert 200 + lifecycle.
       - Test 2b (error): engine rejects with new SensitivityEngineError('INVALID_PUBLISHED_CONFIG', ...). Assert response.status === 422 (the distinctive two-way error code — 422 is also unique in the STATUS_BY_CODE table), response.body.code === 'INVALID_PUBLISHED_CONFIG', lifecycle markFailed asserted.

    3. `describe('POST /api/funds/:id/sensitivity/stress', ...)`
       - Test 3a (happy): analogous. Minimal valid StressAnalysisRequestV1 body. Stress engine stub resolves with a minimal valid StressAnalysisResultV1. Assert 200 + lifecycle.
       - Test 3b (error): engine rejects with new SensitivityEngineError('UNSUPPORTED_VARIABLE_PATH', ...). Assert response.status === 400 (the distinctive 400 path that is NOT INVALID_FUND_ID/INVALID_PARAMS — it comes from the engine, so it proves the error branch ran end-to-end through the engine stub rather than short-circuiting at the Zod guard), response.body.code === 'UNSUPPORTED_VARIABLE_PATH', lifecycle markFailed asserted.

    Distinctiveness rationale (why these three error codes specifically):
    - one-way -> NO_PUBLISHED_CONFIG -> 409 (unique status)
    - two-way -> INVALID_PUBLISHED_CONFIG -> 422 (unique status)
    - stress  -> UNSUPPORTED_VARIABLE_PATH -> 400 (shared with INVALID_FUND_ID / INVALID_PARAMS but those short-circuit BEFORE the engine is called — asserting markFailedMock was called proves the engine branch ran, distinguishing it from the pre-engine 400 paths)

    Each test verifies the END-TO-END lifecycle, not just the HTTP status, so it
    covers real integration: HTTP -> Zod parse -> createPending -> dynamic engine
    import -> engine call -> markCompleted/markFailed -> HTTP response.

    Cleanup: beforeEach clears all mocks and re-primes default return values.

  </behavior>
  <action>
Create a new file `tests/integration/sensitivity-routes.test.ts`. The file MUST live under `tests/integration/` (NOT `__tests__/`) per REFL-036 and the `scripts/check-orphan-tests.mjs` pre-push gate.

File content — author verbatim, adjusting ONLY the request body field names if
the schema reads reveal a different shape for two-way or stress:

```typescript
/**
 * Sensitivity routes -- integration tests (Phase 4 D-01).
 *
 * End-to-end contract coverage for the three sensitivity POST routes:
 *   POST /api/funds/:id/sensitivity/one-way
 *   POST /api/funds/:id/sensitivity/two-way
 *   POST /api/funds/:id/sensitivity/stress
 *
 * Mounts the real sensitivity router on a fresh Express instance and stubs
 * the service + engine modules via vi.mock. The dynamic await import inside
 * each handler resolves to the mocked specifier, letting this test exercise
 * the full HTTP -> Zod parse -> createPending -> engine -> mark* lifecycle
 * without touching the real database or the real engines.
 *
 * This test deliberately does NOT spawn a child process or hit the shared
 * test server (per REFL-024). It also does NOT duplicate the full
 * STATUS_BY_CODE matrix -- tests/unit/routes/sensitivity-routes-error-mapping.test.ts
 * already owns that at the unit layer. This file picks ONE distinctive error
 * code per route to prove the end-to-end wiring.
 *
 * @group integration
 * @group sensitivity
 */

process.env.NODE_ENV = 'test';
process.env.VITEST = 'true';

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const {
  createPendingMock,
  markCompletedMock,
  markFailedMock,
  getHistoryByFundMock,
  getByIdMock,
  runOneWaySensitivityMock,
  runTwoWaySensitivityMock,
  runStressTestMock,
} = vi.hoisted(() => ({
  createPendingMock: vi.fn(),
  markCompletedMock: vi.fn(),
  markFailedMock: vi.fn(),
  getHistoryByFundMock: vi.fn(),
  getByIdMock: vi.fn(),
  runOneWaySensitivityMock: vi.fn(),
  runTwoWaySensitivityMock: vi.fn(),
  runStressTestMock: vi.fn(),
}));

vi.mock('../../server/services/sensitivity-run-service', () => ({
  sensitivityRunService: {
    createPending: createPendingMock,
    markCompleted: markCompletedMock,
    markFailed: markFailedMock,
    getHistoryByFund: getHistoryByFundMock,
    getById: getByIdMock,
  },
}));

// Shared class stub so all three engine mocks can expose SensitivityEngineError
// with the same prototype the route handler's `err instanceof` check expects.
// The real SensitivityEngineError is defined in one-way-sensitivity-engine.ts
// and re-exported from two-way + stress; the mocks mirror that export shape.
// CRITICAL: declare ONE class at module scope (NOT inside vi.mock factories)
// so all three mocks reference the same prototype. Three separate class
// declarations would give three distinct prototypes and `instanceof` would
// fail for two of the three routes.
class SensitivityEngineError extends Error {
  public readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'SensitivityEngineError';
    this.code = code;
  }
}

vi.mock('../../server/services/one-way-sensitivity-engine', () => ({
  oneWaySensitivityEngine: { runOneWaySensitivity: runOneWaySensitivityMock },
  SensitivityEngineError,
}));

vi.mock('../../server/services/two-way-sensitivity-engine', () => ({
  twoWaySensitivityEngine: { runTwoWaySensitivity: runTwoWaySensitivityMock },
  SensitivityEngineError,
}));

vi.mock('../../server/services/stress-test-engine', () => ({
  stressTestEngine: { runStressTest: runStressTestMock },
  SensitivityEngineError,
}));

let app: express.Express;

const fakePendingRun = (kind: 'one_way' | 'two_way' | 'stress') => ({
  id: 42,
  fundId: 1,
  kind,
  status: 'pending' as const,
  params: {},
  results: null,
  createdBy: 0,
  createdAt: new Date('2026-04-08T12:00:00.000Z'),
  completedAt: null,
  durationMs: null,
  errorCode: null,
  errorMessage: null,
});

const fakeCompletedRun = (kind: 'one_way' | 'two_way' | 'stress') => ({
  ...fakePendingRun(kind),
  status: 'completed' as const,
  completedAt: new Date('2026-04-08T12:00:01.000Z'),
  durationMs: 1000,
});

const fakeFailedRun = (
  kind: 'one_way' | 'two_way' | 'stress',
  code: string
) => ({
  ...fakePendingRun(kind),
  status: 'failed' as const,
  completedAt: new Date('2026-04-08T12:00:01.000Z'),
  durationMs: 1000,
  errorCode: code,
  errorMessage: `simulated ${code}`,
});

// ---------------------------------------------------------------------------
// Minimal valid request bodies. Derived from shared/contracts/sensitivity-run-v1
// and sensitivity-variables-v1. The executor MUST verify these against the
// contracts before running the test -- if any field is missing, the Zod parse
// returns 400 INVALID_PARAMS and short-circuits before the engine mock runs.
// ---------------------------------------------------------------------------

const validOneWayBody = {
  variableId: 'reserve_pool_pct',
  range: { min: 0, max: 0.5 },
  steps: 5,
  metricId: 'tvpi',
};

// TWO-WAY body: confirm field names against TwoWayAnalysisRequestV1Schema in
// shared/contracts/sensitivity-run-v1.contract.ts before running.
const validTwoWayBody = {
  variableXId: 'reserve_pool_pct',
  rangeX: { min: 0, max: 0.5 },
  stepsX: 4,
  variableYId: 'graduation_rate_seed_to_a',
  rangeY: { min: 0, max: 1 },
  stepsY: 4,
  metricId: 'tvpi',
};

// STRESS body: confirm against StressAnalysisRequestV1Schema.
const validStressBody = {
  scenarioIds: ['mild_downturn'],
  metricId: 'tvpi',
};

// Minimal engine-result stubs. Shape does not need to match the Zod schema
// exactly -- the route handler does NOT re-validate the engine output on the
// happy path; it just passes it through to markCompleted and the response body.
const fakeOneWayResult = {
  variableId: 'reserve_pool_pct',
  metricId: 'tvpi',
  baselineValue: 2.5,
  datapoints: [
    { variableValue: 0, metricValue: 2.3 },
    { variableValue: 0.25, metricValue: 2.5 },
    { variableValue: 0.5, metricValue: 2.7 },
  ],
};

const fakeTwoWayResult = {
  variableXId: 'reserve_pool_pct',
  variableYId: 'graduation_rate_seed_to_a',
  metricId: 'tvpi',
  baselineValue: 2.5,
  grid: [],
};

const fakeStressResult = {
  metricId: 'tvpi',
  baselineValue: 2.5,
  scenarios: [],
};

beforeAll(async () => {
  const sensitivityRouter = (await import('../../server/routes/sensitivity'))
    .default;
  app = express();
  app.set('trust proxy', false);
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', sensitivityRouter);
});

beforeEach(() => {
  vi.clearAllMocks();
  createPendingMock.mockResolvedValue(fakePendingRun('one_way'));
  markCompletedMock.mockResolvedValue(fakeCompletedRun('one_way'));
  markFailedMock.mockResolvedValue(fakeFailedRun('one_way', 'ENGINE_FAILURE'));
});

describe('sensitivity routes (integration)', () => {
  describe('POST /api/funds/:id/sensitivity/one-way', () => {
    it('returns 200 with run + result on happy path', async () => {
      createPendingMock.mockResolvedValueOnce(fakePendingRun('one_way'));
      markCompletedMock.mockResolvedValueOnce(fakeCompletedRun('one_way'));
      runOneWaySensitivityMock.mockResolvedValueOnce(fakeOneWayResult);

      const response = await request(app)
        .post('/api/funds/1/sensitivity/one-way')
        .send(validOneWayBody);

      expect(response.status).toBe(200);
      expect(response.body.run.status).toBe('completed');
      expect(response.body.result).toEqual(fakeOneWayResult);

      expect(createPendingMock).toHaveBeenCalledTimes(1);
      expect(createPendingMock).toHaveBeenCalledWith(
        1,
        'one_way',
        validOneWayBody,
        0
      );
      expect(runOneWaySensitivityMock).toHaveBeenCalledTimes(1);
      expect(runOneWaySensitivityMock).toHaveBeenCalledWith(1, validOneWayBody);
      expect(markCompletedMock).toHaveBeenCalledTimes(1);
      expect(markFailedMock).not.toHaveBeenCalled();
    });

    it('returns 409 when engine throws NO_PUBLISHED_CONFIG (end-to-end error lifecycle)', async () => {
      createPendingMock.mockResolvedValueOnce(fakePendingRun('one_way'));
      markFailedMock.mockResolvedValueOnce(
        fakeFailedRun('one_way', 'NO_PUBLISHED_CONFIG')
      );
      runOneWaySensitivityMock.mockRejectedValueOnce(
        new SensitivityEngineError(
          'NO_PUBLISHED_CONFIG',
          'Fund 1 has no published configuration'
        )
      );

      const response = await request(app)
        .post('/api/funds/1/sensitivity/one-way')
        .send(validOneWayBody);

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('NO_PUBLISHED_CONFIG');
      expect(response.body.message).toEqual(expect.any(String));
      expect(response.body.message.length).toBeGreaterThan(0);

      expect(markFailedMock).toHaveBeenCalledTimes(1);
      expect(markFailedMock).toHaveBeenCalledWith(
        42,
        'NO_PUBLISHED_CONFIG',
        expect.any(String),
        expect.any(Number)
      );
      expect(markCompletedMock).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/funds/:id/sensitivity/two-way', () => {
    it('returns 200 with run + result on happy path', async () => {
      createPendingMock.mockResolvedValueOnce(fakePendingRun('two_way'));
      markCompletedMock.mockResolvedValueOnce(fakeCompletedRun('two_way'));
      runTwoWaySensitivityMock.mockResolvedValueOnce(fakeTwoWayResult);

      const response = await request(app)
        .post('/api/funds/1/sensitivity/two-way')
        .send(validTwoWayBody);

      expect(response.status).toBe(200);
      expect(response.body.run.status).toBe('completed');
      expect(response.body.result).toEqual(fakeTwoWayResult);

      expect(createPendingMock).toHaveBeenCalledWith(
        1,
        'two_way',
        validTwoWayBody,
        0
      );
      expect(runTwoWaySensitivityMock).toHaveBeenCalledTimes(1);
      expect(runTwoWaySensitivityMock).toHaveBeenCalledWith(1, validTwoWayBody);
      expect(markCompletedMock).toHaveBeenCalledTimes(1);
      expect(markFailedMock).not.toHaveBeenCalled();
    });

    it('returns 422 when engine throws INVALID_PUBLISHED_CONFIG', async () => {
      createPendingMock.mockResolvedValueOnce(fakePendingRun('two_way'));
      markFailedMock.mockResolvedValueOnce(
        fakeFailedRun('two_way', 'INVALID_PUBLISHED_CONFIG')
      );
      runTwoWaySensitivityMock.mockRejectedValueOnce(
        new SensitivityEngineError(
          'INVALID_PUBLISHED_CONFIG',
          'Published config is unprocessable'
        )
      );

      const response = await request(app)
        .post('/api/funds/1/sensitivity/two-way')
        .send(validTwoWayBody);

      expect(response.status).toBe(422);
      expect(response.body.code).toBe('INVALID_PUBLISHED_CONFIG');
      expect(response.body.message).toEqual(expect.any(String));

      expect(markFailedMock).toHaveBeenCalledWith(
        42,
        'INVALID_PUBLISHED_CONFIG',
        expect.any(String),
        expect.any(Number)
      );
      expect(markCompletedMock).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/funds/:id/sensitivity/stress', () => {
    it('returns 200 with run + result on happy path', async () => {
      createPendingMock.mockResolvedValueOnce(fakePendingRun('stress'));
      markCompletedMock.mockResolvedValueOnce(fakeCompletedRun('stress'));
      runStressTestMock.mockResolvedValueOnce(fakeStressResult);

      const response = await request(app)
        .post('/api/funds/1/sensitivity/stress')
        .send(validStressBody);

      expect(response.status).toBe(200);
      expect(response.body.run.status).toBe('completed');
      expect(response.body.result).toEqual(fakeStressResult);

      expect(createPendingMock).toHaveBeenCalledWith(
        1,
        'stress',
        validStressBody,
        0
      );
      expect(runStressTestMock).toHaveBeenCalledTimes(1);
      expect(runStressTestMock).toHaveBeenCalledWith(1, validStressBody);
      expect(markCompletedMock).toHaveBeenCalledTimes(1);
      expect(markFailedMock).not.toHaveBeenCalled();
    });

    it('returns 400 when engine throws UNSUPPORTED_VARIABLE_PATH (post-zod engine branch)', async () => {
      createPendingMock.mockResolvedValueOnce(fakePendingRun('stress'));
      markFailedMock.mockResolvedValueOnce(
        fakeFailedRun('stress', 'UNSUPPORTED_VARIABLE_PATH')
      );
      runStressTestMock.mockRejectedValueOnce(
        new SensitivityEngineError(
          'UNSUPPORTED_VARIABLE_PATH',
          'Scenario references an unmapped variable path'
        )
      );

      const response = await request(app)
        .post('/api/funds/1/sensitivity/stress')
        .send(validStressBody);

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('UNSUPPORTED_VARIABLE_PATH');
      expect(response.body.message).toEqual(expect.any(String));

      // Distinctive assertion: markFailedMock having been called proves this
      // 400 came from the engine branch, not the pre-engine Zod/fundId guard.
      expect(markFailedMock).toHaveBeenCalledWith(
        42,
        'UNSUPPORTED_VARIABLE_PATH',
        expect.any(String),
        expect.any(Number)
      );
      expect(markCompletedMock).not.toHaveBeenCalled();
    });
  });
});
```

### Execution steps

1. Read the files in `read_first` to confirm the exact field names for
   TwoWayAnalysisRequestV1 and StressAnalysisRequestV1. Adjust `validTwoWayBody`
   and `validStressBody` to match the live contract. If `mild_downturn` is not a
   real stress scenario id, pick the first entry from
   `SUPPORTED_STRESS_SCENARIOS` in
   `shared/contracts/sensitivity-variables-v1.ts`. Same for any variable ids
   that do not exist in `SUPPORTED_VARIABLES`.

2. Write the file to `tests/integration/sensitivity-routes.test.ts`.

3. Run the file standalone via the integration runner (NOT `npm test` — root
   vitest config excludes `tests/integration/**`):

   ```bash
   npx vitest run -c vitest.config.int.ts tests/integration/sensitivity-routes.test.ts
   ```

4. Confirm ALL 6 tests pass and the file reports as discovered.

5. Run `npm run check` to confirm no TypeScript errors.

6. Run the orphan-test gate to confirm the file placement:

   ```bash
   node scripts/check-orphan-tests.mjs
   ```

   Expected exit code 0 (the file is under `tests/integration/`, not
   `__tests__/`).

### Troubleshooting: common failure modes

- **Zod parse rejects the body (400 INVALID_PARAMS returned instead of the happy
  200):** the field names in `validTwoWayBody` or `validStressBody` do not match
  the contract. Re-read `shared/contracts/sensitivity-run-v1.contract.ts` and
  fix.

- **Test hangs or the engine mock is never called:** `vi.mock` specifier path
  does not match what the handler's `await import('../services/...')` resolves
  to. The unit test uses `'../../../server/services/...'` (three up) because it
  lives at `tests/unit/routes/`. This file lives at `tests/integration/` (two
  up) so the specifier is `'../../server/services/...'`. Double-check the slash
  count.

- **`err instanceof SensitivityEngineError` is false in the handler, so `code`
  defaults to `'ENGINE_FAILURE'` and status is always 500:** the three engine
  mocks MUST export the SAME `SensitivityEngineError` class value. Using three
  separate `class SensitivityEngineError` declarations (one per vi.mock factory)
  produces three distinct classes and the `instanceof` fails for two of them.
  Solution: declare ONE class at the top of the test file and reference it from
  each vi.mock factory (the code above already does this).

- **"Cannot find module" for sensitivity router import:** verify
  `tests/integration/` to `server/routes/sensitivity.ts` is
  `../../server/routes/sensitivity`. Adjust if the actual directory depth
  differs. </action> <verify> <automated>npx vitest run -c vitest.config.int.ts
  tests/integration/sensitivity-routes.test.ts</automated> </verify>
  <acceptance_criteria> - File `tests/integration/sensitivity-routes.test.ts`
  exists (NOT under any `__tests__/` directory) -
  `grep -c "describe('sensitivity routes" tests/integration/sensitivity-routes.test.ts`
  returns `1` -
  `grep -c "POST /api/funds/:id/sensitivity/one-way" tests/integration/sensitivity-routes.test.ts`
  returns `1` -
  `grep -c "POST /api/funds/:id/sensitivity/two-way" tests/integration/sensitivity-routes.test.ts`
  returns `1` -
  `grep -c "POST /api/funds/:id/sensitivity/stress" tests/integration/sensitivity-routes.test.ts`
  returns `1` -
  `grep -c "vi.mock.*one-way-sensitivity-engine" tests/integration/sensitivity-routes.test.ts`
  returns `1` -
  `grep -c "vi.mock.*two-way-sensitivity-engine" tests/integration/sensitivity-routes.test.ts`
  returns `1` -
  `grep -c "vi.mock.*stress-test-engine" tests/integration/sensitivity-routes.test.ts`
  returns `1` -
  `grep -c "vi.mock.*sensitivity-run-service" tests/integration/sensitivity-routes.test.ts`
  returns `1` -
  `grep -c "NO_PUBLISHED_CONFIG" tests/integration/sensitivity-routes.test.ts`
  returns at least `1` -
  `grep -c "INVALID_PUBLISHED_CONFIG" tests/integration/sensitivity-routes.test.ts`
  returns at least `1` -
  `grep -c "UNSUPPORTED_VARIABLE_PATH" tests/integration/sensitivity-routes.test.ts`
  returns at least `1` -
  `grep -c "child_process\|spawn\|exec(" tests/integration/sensitivity-routes.test.ts`
  returns `0` (no child process spawning per REFL-024) -
  `grep -c "expect(response.status).toBe(200)" tests/integration/sensitivity-routes.test.ts`
  returns at least `3` (one happy path per route) -
  `npx vitest run -c vitest.config.int.ts tests/integration/sensitivity-routes.test.ts`
  exits 0 with at least 6 tests passing - `npm run check` exits 0 -
  `node scripts/check-orphan-tests.mjs` exits 0 (file is under
  `tests/integration/`) </acceptance_criteria> <done>Integration test file
  exists at `tests/integration/sensitivity-routes.test.ts`, all 6+ tests pass
  under the integration runner, the file is under `tests/integration/` not
  `__tests__/`, no child processes are spawned, and npm run check is
  green.</done> </task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary                               | Description                                                                                                                                    |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| supertest client -> mini-express app   | In-process HTTP pipe. No real network, no auth middleware.                                                                                     |
| route handler -> dynamic engine import | `await import('../services/...')` resolves to the vi.mock factory, not the real engine. The three engines and the run service are ALL stubbed. |
| test -> real database                  | NONE. The test never touches the DB. `sensitivityRunService` is fully mocked.                                                                  |

## STRIDE Threat Register

| Threat ID  | Category                                                                                                 | Component                                                    | Disposition | Mitigation Plan                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-04-01-01 | Tampering — false green from wrong vi.mock specifier path                                                | `vi.mock('../../server/services/...')`                       | mitigate    | The handler uses `await import('../services/...')` relative to `server/routes/sensitivity.ts`. From the test file at `tests/integration/`, the specifier must be `../../server/services/...` (two ups). Acceptance criteria grep for the exact specifier strings. If the specifier is wrong, the engine mock never runs and the real engine fires — hitting real DB code paths and throwing on the first `db.select()` call. That failure mode is LOUD, not silent. |
| T-04-01-02 | Tampering — `instanceof SensitivityEngineError` fails for two-way/stress routes                          | three separate class declarations in three vi.mock factories | mitigate    | The file declares ONE `SensitivityEngineError` class at module scope and all three vi.mock factories reference it. `instanceof` compares by prototype identity, so one class produces consistent behavior across all three mocks. The action and troubleshooting sections document this explicitly.                                                                                                                                                                 |
| T-04-01-03 | DoS — test pollutes the shared integration test server                                                   | global-setup spawns one dev:api server                       | accept      | The test never emits an outbound fetch, never sets BASE_URL. supertest's in-process transport short-circuits before any real network call. The shared server keeps running in the background but this test does not interact with it. Verified by the absence of `fetch(` and `BASE_URL` in the file.                                                                                                                                                               |
| T-04-01-04 | Repudiation — silent discovery loss (REFL-036)                                                           | file placement under `__tests__/`                            | mitigate    | Acceptance criteria check that the file is under `tests/integration/` (not `__tests__/`) and that `scripts/check-orphan-tests.mjs` exits 0. REFL-036 is referenced in the plan header. `vitest.config.int.ts` include globs cover `tests/integration/**/*.test.ts` so the runner discovers the file.                                                                                                                                                                |
| T-04-01-05 | Information disclosure — test leaks real fund data                                                       | mocks isolate from DB                                        | accept      | All service calls return hand-built stubs. No real fund IDs, no real user IDs, no PII.                                                                                                                                                                                                                                                                                                                                                                              |
| T-04-01-06 | Elevation of privilege — auth bypass on sensitivity routes                                               | routes have NO auth middleware                               | accept      | This is the current production state. The routes are mounted without `authenticateJWT` in `server/routes.ts`. If auth is later added, this test file's mini-express needs the middleware too (see backtesting-api.test.ts for the JWT pattern). Documented for future maintainers.                                                                                                                                                                                  |
| T-04-01-07 | False green — Zod parse rejects the body and returns 400 INVALID_PARAMS, masking the intended happy path | request body shape mismatch                                  | mitigate    | `read_first` includes `shared/contracts/sensitivity-run-v1.contract.ts` and `shared/contracts/sensitivity-variables-v1.ts`. The troubleshooting section explicitly calls out this failure mode. Happy-path tests assert `response.status === 200`, so a 400 returns loudly.                                                                                                                                                                                         |
| T-04-01-08 | Test duplication — integration test rewrites the unit-layer STATUS_BY_CODE matrix                        | scope creep                                                  | mitigate    | The plan picks ONE distinctive error code per route (NO_PUBLISHED_CONFIG / INVALID_PUBLISHED_CONFIG / UNSUPPORTED_VARIABLE_PATH). The objective explicitly states the unit test owns the full matrix. The integration test's job is end-to-end wiring proof, not the matrix.                                                                                                                                                                                        |

</threat_model>

<verification>
- File exists at `tests/integration/sensitivity-routes.test.ts`
- 6 tests minimum (3 routes x 2 paths), all passing under the integration runner
- No child process spawning (grep verification)
- Correct file placement (`scripts/check-orphan-tests.mjs` exits 0)
- `npm run check` exits 0 (no TypeScript regressions)
- Lifecycle assertions prove each test ran ALL the way through createPending + engine + markCompleted/markFailed — not just a short-circuit at the Zod guard
</verification>

<success_criteria>

- New file at `tests/integration/sensitivity-routes.test.ts` with 6+ passing
  tests
- Covers all three sensitivity POST routes end-to-end
- Happy path + one distinctive error path per route
- Mocks the service layer and all three engines via `vi.mock` at the
  dynamic-import specifier
- Does NOT spawn child processes or touch the shared integration server
- Does NOT duplicate the unit-layer STATUS_BY_CODE matrix
- Lives under `tests/integration/` per REFL-036
- Phase 4 success criterion 3 is satisfied by this single file

</success_criteria>

<output>
After completion, create `.planning/phases/04-sensitivity-surface-polish/04-01-SUMMARY.md` documenting:

- The exact test names and count (should be 6+)
- The three distinctive error codes chosen per route and why
- Confirmation that no child processes are spawned
- Confirmation that `scripts/check-orphan-tests.mjs` exits 0
- The command used to run the test standalone
- Any contract-shape adjustments made to the request bodies after reading
  `shared/contracts/sensitivity-run-v1.contract.ts`
- A note for Plan 04-02: "The dynamic-import seam across the three engine
  specifiers is now exercised by this integration test; REFL-037 can point at
  `tests/integration/sensitivity-routes.test.ts` as the canonical consumer of
  the pattern." </output>
