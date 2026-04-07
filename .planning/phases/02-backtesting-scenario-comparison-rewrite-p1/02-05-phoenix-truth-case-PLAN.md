---
phase: 02-backtesting-scenario-comparison-rewrite-p1
plan: 05
type: execute
wave: 3
depends_on:
  - 02
  - 03
files_modified:
  - docs/backtesting-scenario.truth-cases.json
  - tests/unit/truth-cases/backtesting-scenario.test.ts
autonomous: true
requirements:
  - REQ-BCK-01
must_haves:
  truths:
    - 'A new Phoenix truth case JSON file at
      docs/backtesting-scenario.truth-cases.json defines the GFC scenario with a
      fixed randomSeed and snapshot-locked expected percentiles'
    - 'A new test file at tests/unit/truth-cases/backtesting-scenario.test.ts
      loads the JSON, calls compareScenarios(fundId, [GFC], runs, { randomSeed
      }) on a real BacktestingService instance with mocked DB but UNMOCKED Monte
      Carlo engine, and asserts mean/p5/p25/p50/p75/p95 against the snapshot'
    - 'The truth case pins forceEngine: traditional via the rewrite path to
      avoid the streaming engine Math.random global patch (RESEARCH Pitfall #1)'
    - 'The truth case asserts mean(GFC) < mean(default-scenario) per D-09 — runs
      the default scenario in the same test for the comparison'
    - 'npm run phoenix:truth count goes from 258 to at least 259 (the new case
      is added to the truth-case suite)'
    - 'The test runs in under 5 seconds (uses the traditional engine with a
      small simulationRuns count to keep CI fast)'
  artifacts:
    - path: 'docs/backtesting-scenario.truth-cases.json'
      provides: 'Snapshot-locked GFC truth case input + expected output'
      contains: 'financial_crisis_2008'
    - path: 'tests/unit/truth-cases/backtesting-scenario.test.ts'
      provides:
        'Phoenix truth-case test that exercises the real Monte Carlo engine
        end-to-end with the rewritten runScenarioComparisons'
      contains: 'forceEngine'
  key_links:
    - from: 'tests/unit/truth-cases/backtesting-scenario.test.ts'
      to: 'docs/backtesting-scenario.truth-cases.json'
      via: 'JSON.parse + describe.each loop'
      pattern: 'backtesting-scenario.truth-cases.json'
    - from: 'tests/unit/truth-cases/backtesting-scenario.test.ts'
      to: 'BacktestingService.compareScenarios'
      via: 'real service instance + mocked db only (engine NOT mocked)'
      pattern: 'service.compareScenarios'
    - from: 'truth case'
      to: 'forceEngine: traditional'
      via: 'engine override prevents streaming Math.random patch'
      pattern: 'forceEngine.*traditional'
---

<objective>
Add ONE new Phoenix truth case under `tests/unit/truth-cases/` that validates the rewritten `runScenarioComparisons` (Plan 02-03) against the 2008 Global Financial Crisis (GFC) scenario end-to-end, with a fixed `randomSeed` for determinism and SAMPLE percentiles snapshot-locked on first green run. This is D-09 + D-10 from CONTEXT.md and the third REQ-BCK-01 acceptance gate.

Implements the Phoenix gate that lets Phase 2 declare REQ-BCK-01 as complete:
"truth case for at least one historical market regime passes". Without this, the
rewrite is unverified at the calc-path level — only the existing unit test
(which mocks the engine) and the engine-override test from Plan 02-02 cover the
new code, and neither runs the full per-scenario MC pipeline end-to-end.

Purpose: provide a deterministic regression gate for any future change to the
per-scenario MC injection path. If a future plan accidentally re-introduces an
analytic rescale (or breaks the marketParameters override branch), this truth
case fails LOUDLY with a snapshot mismatch.

Output:

- New JSON file `docs/backtesting-scenario.truth-cases.json` with one GFC truth
  case entry containing `seed`, `simulationRuns`, `forceEngine: 'traditional'`,
  and snapshot-locked expected values for `mean`, `p5`, `p25`, `p50`, `p75`,
  `p95`
- New test file `tests/unit/truth-cases/backtesting-scenario.test.ts` that loads
  the JSON and asserts against the snapshot
- `npm run phoenix:truth` count goes from 258 to at least 259 (verified
  post-plan)

## Phoenix gate impact

This plan IS a Phoenix truth case addition. The verify automation explicitly
runs `npm run phoenix:truth` and the acceptance criteria require the count to be
at least 259. After the snapshot is locked on first green run, ANY future change
that breaks the determinism (e.g., a different translation function for
`failureRate`, or a different default in `getDefaultDistributions()`) will fail
this test.

## Streaming engine determinism caveat (RESEARCH Pitfall #1)

The streaming engine's `setRandomSeed` patches `Math.random` globally
(`server/services/streaming-monte-carlo-engine.ts:1106-1112`). The reservoir
sampling at `streaming-monte-carlo-engine.ts:225-240` ALSO uses `Math.random()`.
Either of these makes the streaming engine non-deterministic across test runs.

The truth case MUST pin `forceEngine: 'traditional'` so the simulation runs
through the proper local PRNG instance (`monte-carlo-engine.ts:259-264`). The
traditional engine is the default for tests anyway
(`UnifiedMonteCarloService.selectEngine` gates streaming on
`process.env.NODE_ENV === 'production'` per RESEARCH Q1), but the explicit
override makes the contract obvious.

The new third parameter on `compareScenarios` added by Plan 02-03
(`options?: { randomSeed?: number }`) plumbs the seed through to
`unifiedMonteCarloService.runSimulation`. This plan consumes that plumbing.
</objective>

<execution_context>
@C:/Users/nikhi/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/nikhi/.claude/get-shit-done/templates/summary.md </execution_context>

<context>
@.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-CONTEXT.md
@.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-RESEARCH.md
@.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-02-engine-market-params-override-PLAN.md
@.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-03-runscenariocomparisons-rewrite-PLAN.md
@CLAUDE.md

<interfaces>
<!-- Existing truth-case file shape (verified at docs/xirr.truth-cases.json) and the test pattern (verified at tests/unit/truth-cases/runner.test.ts and helpers.ts). -->

From docs/xirr.truth-cases.json (canonical truth-case JSON shape):

```json
{
  "id": "xirr-01-simple-positive-return",
  "scenario": "01-simple-positive-return",
  "tags": ["baseline", "basic"],
  "notes": "Canonical 2-cashflow case with a known IRR.",
  "input": { "cashflows": [...], "config": {...} },
  "expected": { "irr": 0.20103407784113647, "converged": true },
  "category": "basic"
}
```

The file is a top-level JSON ARRAY of truth case objects. Each object has `id`,
`scenario`, `tags`, `notes`, `input`, `expected`, `category`.

From tests/unit/truth-cases/helpers.ts (the assertion helper):

```typescript
import { expect } from 'vitest';

export function assertNumericField(
  actual: unknown,
  expected: number,
  decimals: number,
  fieldName: string
): void {
  if (typeof actual !== 'number') {
    throw new Error(`${fieldName} must be a number, got ${typeof actual}`);
  }
  expect(actual).toBeCloseTo(expected, decimals);
}
```

(The exact signature may differ — read `helpers.ts` to confirm before authoring
the test.)

From tests/unit/truth-cases/xirr.test.ts (the canonical truth-case test
pattern):

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertNumericField } from './helpers';

const cases = JSON.parse(
  readFileSync(join(process.cwd(), 'docs/xirr.truth-cases.json'), 'utf-8')
) as Array<{ id: string; input: ...; expected: ... }>;

describe('XIRR truth cases', () => {
  for (const truthCase of cases) {
    it(truthCase.id, () => {
      // ... call the function under test, assert via assertNumericField ...
    });
  }
});
```

From server/services/backtesting-service.ts (post Plan 02-03 — the new public
surface):

```typescript
async compareScenarios(
  fundId: number,
  scenarios: HistoricalScenarioName[],
  simulationRuns: number = 5000,
  options?: { randomSeed?: number }
): Promise<ScenarioComparison[]>;
```

From server/services/historical-scenarios.ts (lines 196-220 — the GFC params
source):

```typescript
export function getScenarioMarketParameters(
  name: HistoricalScenarioName
): MarketParameters {
  // returns { exitMultiplierMean, exitMultiplierVolatility, failureRate, followOnProbability, holdPeriodYears }
  // for the named scenario
}
```

The GFC scenario params (verified at server/data/historical-scenarios.ts:59-83
area) are committed numbers — they will stay stable because Plan 02 does NOT
modify historical-scenarios.ts. </interfaces> </context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Author the GFC truth-case JSON and the test file, run once to capture snapshot, paste captured numbers back into the JSON, re-run for green</name>
  <files>docs/backtesting-scenario.truth-cases.json, tests/unit/truth-cases/backtesting-scenario.test.ts</files>
  <read_first>
    - tests/unit/truth-cases/helpers.ts (FULL file 1-101 — confirm assertNumericField signature, decimal tolerances)
    - tests/unit/truth-cases/xirr.test.ts (FULL file — canonical truth-case test pattern; copy structure)
    - tests/unit/truth-cases/runner.test.ts (lines 107-405 — multi-suite truth-case loader pattern)
    - docs/xirr.truth-cases.json (lines 1-50 — canonical JSON shape)
    - server/services/backtesting-service.ts (post Plan 02-03 — confirm compareScenarios accepts options.randomSeed)
    - server/services/historical-scenarios.ts (lines 1-294 — confirm GFC params shape, confirm function signatures)
    - server/services/monte-carlo-engine.ts (lines 259-264 PRNG seam, 636-688 calibrateDistributions post Plan 02-02)
    - server/services/monte-carlo-service-unified.ts (lines 28-33, 92-130, 502-507 engine selection logic)
    - tests/unit/services/backtesting-service.test.ts (lines 1-37 — db mock pattern to copy; lines 105-158 mockSimulationResult — DO NOT use this for the truth case because it BYPASSES the real engine, the whole point is to call the real engine)
    - .planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-CONTEXT.md (D-09, D-10 — the truth-case design decisions)
    - .planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-RESEARCH.md (Q12 — the truth case harness shape; Pitfalls 1, 2, 4 — Math.random patch, reservoir sampling, engine selection)
  </read_first>
  <behavior>
    Specification (TDD-driven). The test file is authored FIRST with placeholder expected values, run to capture the actual numbers, then the JSON snapshot is updated with the real values, then the test re-runs green.

    Tests:

    **Test 1: "GFC scenario produces deterministic sample percentiles with fixed seed"**
    - Constructs a real `BacktestingService` instance (NOT mocked)
    - Mocks ONLY `db` (varianceReports.findMany returns empty so calibrateDistributions falls through to getDefaultDistributions; fundBaselines.findFirst returns null)
    - Calls `service.compareScenarios(1, ['financial_crisis_2008'], 1000, { randomSeed: 12345 })`
    - Asserts `result[0].simulatedPerformance.mean` is close to expected.mean (4 decimals)
    - Asserts `result[0].simulatedPerformance.{p5, p25, p50, p75, p95}` are close to expected (4 decimals each)
    - Re-runs with the SAME seed and asserts the result is byte-identical (proves determinism — no Math.random leakage)

    **Test 2: "GFC scenario mean is lower than default scenario mean (D-09 hard requirement)"**
    - Calls `service.compareScenarios(1, ['financial_crisis_2008'], 1000, { randomSeed: 12345 })` -> gfcResult
    - Calls `service.compareScenarios(1, ['bull_market_2021'], 1000, { randomSeed: 12345 })` -> bullResult (use bull_market_2021 as the "default" comparison since it has the most favorable parameters)
    - Asserts `gfcResult[0].simulatedPerformance.mean < bullResult[0].simulatedPerformance.mean`
    - This proves the override flows through and the math is directionally correct (GFC has higher failureRate and lower exitMultiplierMean, so its IRR mean must be lower)

    Tolerances: 4 decimals (matches the recommendation in RESEARCH Q12). The engine is deterministic with a fixed seed, so 4 decimals is the right tradeoff between strict regression detection and avoiding flake from minor floating-point reordering across Node versions.

  </behavior>
  <action>
This task is iterative — author the test with placeholder values, capture actual values, snapshot-lock. Steps:

### Step 1 — Pre-edit verification

Confirm Plan 02-03 has landed by running:

```bash
grep -n "options?: { randomSeed?: number }" server/services/backtesting-service.ts
```

Expected: at least 3 hits (compareScenariosDetailed, compareScenarios,
runScenarioComparisons signatures). If 0 hits, STOP — Plan 02-03 has not landed
and this plan cannot proceed.

```bash
grep -n "marketParameters: marketParams" server/services/backtesting-service.ts
```

Expected: at least 1 hit. If 0, Plan 02-03 has not yet replaced the analytic
rescale.

### Step 2 — Author the JSON file with placeholder expected values

Create `docs/backtesting-scenario.truth-cases.json` with exactly one truth case
entry. Use placeholder zeros for the expected values — they will be replaced
after the first green run.

```json
[
  {
    "id": "backtesting-scenario-01-financial-crisis-2008",
    "scenario": "financial_crisis_2008",
    "tags": ["backtesting", "monte-carlo", "scenario-comparison", "phase-2"],
    "notes": "Phase 2 D-09 truth case: 2008 Global Financial Crisis scenario validation. Pins forceEngine to traditional (RESEARCH Pitfall #1 — streaming engine patches Math.random globally) and uses randomSeed 12345 for determinism. Snapshot-locked on first green run. Tolerances are 4 decimals (RESEARCH Q12 recommendation). The expected values below are PLACEHOLDERS — they MUST be replaced with the actual values from the first green run before this case can pass.",
    "input": {
      "fundId": 1,
      "scenarios": ["financial_crisis_2008"],
      "simulationRuns": 1000,
      "options": { "randomSeed": 12345 }
    },
    "expected": {
      "scenario": "financial_crisis_2008",
      "simulatedPerformance": {
        "mean": 0.0,
        "p5": 0.0,
        "p25": 0.0,
        "p50": 0.0,
        "p75": 0.0,
        "p95": 0.0
      }
    },
    "category": "scenario-aware-monte-carlo"
  }
]
```

### Step 3 — Author the test file

Create `tests/unit/truth-cases/backtesting-scenario.test.ts`:

```typescript
/**
 * Phoenix truth case: rewritten runScenarioComparisons end-to-end (Phase 2 D-09 + D-10).
 *
 * Validates the post-rewrite runScenarioComparisons against the 2008 Global
 * Financial Crisis scenario with a fixed randomSeed. Uses the REAL Monte Carlo
 * engine (NOT mocked — that is the whole point) and pins forceEngine to
 * 'traditional' to avoid the streaming engine's Math.random global patch
 * (RESEARCH Pitfall #1).
 *
 * Tolerances: 4 decimals per RESEARCH Q12 recommendation.
 *
 * Snapshot lock procedure (first green run):
 * 1. Run this test once with placeholder zeros in the JSON file.
 * 2. The first assertion will fail with the actual values in the diff output.
 * 3. Copy the actual values into docs/backtesting-scenario.truth-cases.json.
 * 4. Re-run — the test should pass on the second attempt.
 * 5. Commit the updated JSON file.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Mock db: varianceReports returns empty so calibrateDistributions falls through
// to getDefaultDistributions (the override target). fundBaselines returns null.
// NOTE: this mock MUST be set up via vi.hoisted before any imports of code that
// touches db, or the import resolves the real module.
const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    query: {
      backtestResults: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      fundBaselines: { findFirst: vi.fn().mockResolvedValue(null) },
      fundStateSnapshots: { findFirst: vi.fn().mockResolvedValue(null) },
      varianceReports: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    },
    insert: vi.fn().mockReturnValue({ values: vi.fn() }),
  },
}));

vi.mock('../../../server/db', () => ({ db: mockDb }));

// IMPORTANT: do NOT mock unifiedMonteCarloService here. The whole point of this
// truth case is to exercise the real engine end-to-end. Plan 02-02 verified
// that the override flows through to the real engine and Plan 02-03 verified
// that runScenarioComparisons injects the override per scenario. This test
// closes the loop by running both layers together.

import { BacktestingService } from '../../../server/services/backtesting-service';

interface BacktestingTruthCase {
  id: string;
  scenario: string;
  tags: string[];
  notes: string;
  input: {
    fundId: number;
    scenarios: string[];
    simulationRuns: number;
    options: { randomSeed: number };
  };
  expected: {
    scenario: string;
    simulatedPerformance: {
      mean: number;
      p5: number;
      p25: number;
      p50: number;
      p75: number;
      p95: number;
    };
  };
  category: string;
}

const truthCases = JSON.parse(
  readFileSync(
    join(process.cwd(), 'docs/backtesting-scenario.truth-cases.json'),
    'utf-8'
  )
) as BacktestingTruthCase[];

describe('Backtesting scenario truth cases (Phase 2 D-09)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-prime the mock returns after clear (vi.fn().mockResolvedValue is
    // wiped by clearAllMocks even when set in vi.hoisted — see MEMORY note
    // "Vitest restoreAllMocks Gotcha").
    mockDb.query.varianceReports.findMany.mockResolvedValue([]);
    mockDb.query.fundBaselines.findFirst.mockResolvedValue(null);
    mockDb.query.fundStateSnapshots.findFirst.mockResolvedValue(null);
  });

  for (const truthCase of truthCases) {
    it(`${truthCase.id} — sample percentiles match snapshot with fixed seed`, async () => {
      const service = new BacktestingService();
      const result = await service.compareScenarios(
        truthCase.input.fundId,
        truthCase.input.scenarios as Parameters<
          typeof service.compareScenarios
        >[1],
        truthCase.input.simulationRuns,
        truthCase.input.options
      );

      expect(result).toHaveLength(1);
      const scenario = result[0]!;
      expect(scenario.scenario).toBe(truthCase.expected.scenario);

      const perf = scenario.simulatedPerformance;
      const expected = truthCase.expected.simulatedPerformance;

      // 4-decimal tolerance per RESEARCH Q12. If you see this assertion fail
      // on first run, copy the ACTUAL values from the diff into
      // docs/backtesting-scenario.truth-cases.json and re-run.
      expect(perf.mean).toBeCloseTo(expected.mean, 4);
      expect(perf.p5).toBeCloseTo(expected.p5, 4);
      expect(perf.p25).toBeCloseTo(expected.p25, 4);
      expect(perf.p50).toBeCloseTo(expected.p50, 4);
      expect(perf.p75).toBeCloseTo(expected.p75, 4);
      expect(perf.p95).toBeCloseTo(expected.p95, 4);
    });

    it(`${truthCase.id} — re-running with same seed produces byte-identical sample percentiles (determinism check)`, async () => {
      const service = new BacktestingService();
      const result1 = await service.compareScenarios(
        truthCase.input.fundId,
        truthCase.input.scenarios as Parameters<
          typeof service.compareScenarios
        >[1],
        truthCase.input.simulationRuns,
        truthCase.input.options
      );
      const result2 = await service.compareScenarios(
        truthCase.input.fundId,
        truthCase.input.scenarios as Parameters<
          typeof service.compareScenarios
        >[1],
        truthCase.input.simulationRuns,
        truthCase.input.options
      );

      // Byte-identical means EVERY field is equal — we use toEqual not toBeCloseTo.
      // If Math.random has leaked into the engine (e.g., reservoir sampling
      // path on the streaming engine — but we are forcing traditional, so
      // this should be impossible), the second run differs from the first
      // and this test fails LOUDLY.
      expect(result1[0]!.simulatedPerformance).toEqual(
        result2[0]!.simulatedPerformance
      );
    });
  }

  it('D-09 hard requirement: GFC scenario mean is lower than bull market scenario mean', async () => {
    const service = new BacktestingService();

    const gfc = await service.compareScenarios(
      1,
      ['financial_crisis_2008'] as Parameters<
        typeof service.compareScenarios
      >[1],
      1000,
      { randomSeed: 12345 }
    );
    const bull = await service.compareScenarios(
      1,
      ['bull_market_2021'] as Parameters<typeof service.compareScenarios>[1],
      1000,
      { randomSeed: 12345 }
    );

    expect(gfc).toHaveLength(1);
    expect(bull).toHaveLength(1);
    expect(gfc[0]!.simulatedPerformance.mean).toBeLessThan(
      bull[0]!.simulatedPerformance.mean
    );
  });
});
```

### Step 4 — Run the test, capture the actual values, snapshot-lock

Run the test:

```bash
npm test -- backtesting-scenario
```

The first assertion will FAIL with the actual percentile values in the diff
output (e.g., `expected 0, got 0.0823`). Copy each actual value from the diff
into the corresponding field of the JSON file.

After updating the JSON, re-run:

```bash
npm test -- backtesting-scenario
```

Both tests in the loop should now pass. The "determinism check" test should pass
on the first run (it does not depend on the snapshot).

The "GFC < bull" test should also pass on the first run as long as the
failureRate translation in Plan 02-02 is directionally correct (GFC has
failureRate 0.6 vs bull 0.05 per the historical-scenarios.ts file).

If the determinism check fails, the engine has a hidden Math.random call that
bypasses the PRNG. Investigate by running with `forceEngine: 'traditional'`
explicitly in the test (the rewrite uses 'auto' by default — Plan 02-03 allows
the test to override) and re-checking.

If the GFC < bull check fails, the failureRate translation in Plan 02-02 chose
option (c) (no math impact) — re-coordinate with Plan 02-02's executor to switch
to option (a) or (b) so the directional ordering holds.

### Step 5 — Override forceEngine to traditional (defense in depth)

If the test runs on a CI runner where the streaming engine is enabled (despite
NODE_ENV=test), the determinism check could fail. To be safe, modify the truth
case to also include `forceEngine: 'traditional'` in the input. This requires
extending Plan 02-03's `options` parameter to also accept `forceEngine` — OR the
test can call the lower-level `unifiedMonteCarloService.runSimulation` directly
through a new test-only seam.

Recommendation: keep the test simple and rely on `NODE_ENV=test` setting
`streamingEnabled = false` in `monte-carlo-service-unified.ts`. Add a
precondition assertion at the top of each test:

```typescript
// Precondition: this truth case requires the traditional engine for
// determinism. RESEARCH Pitfall #1: the streaming engine patches Math.random
// globally and is non-deterministic.
expect(process.env.NODE_ENV).toBe('test');
```

If the test runs in a non-test environment, this assertion catches the misuse
before the determinism check runs and produces a clearer error message.

### Step 6 — Run phoenix:truth and verify count

```bash
npm run phoenix:truth
```

Expected output: at least 259 tests passing across at least 6 test files (the
original 5 plus the new backtesting-scenario.test.ts). If the runner.test.ts
SUMMARY block at line 407 needs the new file registered, register it (RESEARCH
Q12 — optional but recommended for the SUMMARY count to be accurate).

### Step 7 — Run the full validate gate

```bash
npm run check && npm run phoenix:truth && npm run validate:core
```

All three MUST pass. Phase 2 success criterion 5 requires both
`npm run phoenix:truth` and `npm run validate:core` to be green. </action>
<verify> <automated>npm run check && npm test -- backtesting-scenario && npm run
phoenix:truth</automated> </verify> <acceptance_criteria> - File
`docs/backtesting-scenario.truth-cases.json` exists and parses as valid JSON -
The JSON file contains exactly 1 truth case with `id` starting with
`backtesting-scenario-01-financial-crisis-2008` - The JSON file's
`expected.simulatedPerformance` block contains 6 numeric fields (mean, p5, p25,
p50, p75, p95) with NON-ZERO values (the placeholders have been replaced with
snapshot-locked actuals) - File
`tests/unit/truth-cases/backtesting-scenario.test.ts` exists -
`grep -c "forceEngine\|NODE_ENV" tests/unit/truth-cases/backtesting-scenario.test.ts`
returns at least `1` (defense in depth against streaming engine determinism) -
`grep -c "vi.mock.*unifiedMonteCarloService" tests/unit/truth-cases/backtesting-scenario.test.ts`
returns `0` (the engine MUST NOT be mocked — that is the whole point) -
`grep -c "BacktestingService" tests/unit/truth-cases/backtesting-scenario.test.ts`
returns at least `1` -
`grep -c "compareScenarios" tests/unit/truth-cases/backtesting-scenario.test.ts`
returns at least `2` (GFC test + GFC < bull test) -
`grep -c "randomSeed" tests/unit/truth-cases/backtesting-scenario.test.ts`
returns at least `1` -
`grep -c "12345" docs/backtesting-scenario.truth-cases.json` returns `1` -
`npm run check` exits 0 - `npm test -- backtesting-scenario` exits 0 with all 3
tests passing (the snapshot test, the determinism test, and the GFC < bull
test) - `npm run phoenix:truth` exits 0 with at least 259 truth cases passing
across at least 6 test files - `npm run validate:core` exits 0
</acceptance_criteria> <done>The new truth case file exists with snapshot-locked
expected values, the test file loads it and passes all three tests (snapshot
match, determinism check, GFC < bull comparison), the engine is NOT mocked (real
per-scenario MC runs), phoenix:truth count is at least 259, and validate:core is
green.</done> </task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary                          | Description                                                                                                                                                                                                                                          |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| test runner -> filesystem         | The test reads `docs/backtesting-scenario.truth-cases.json` from the repo. Read-only — no writes.                                                                                                                                                    |
| test runner -> Monte Carlo engine | The test calls the real `BacktestingService.compareScenarios` which calls the real `unifiedMonteCarloService.runSimulation`. Mocks ONLY `db` queries to return empty so the engine falls through to `getDefaultDistributions` (the override target). |

## STRIDE Threat Register

| Threat ID  | Category                      | Component                                         | Disposition | Mitigation Plan                                                                                                                                                                                                                                      |
| ---------- | ----------------------------- | ------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-02-05-01 | Tampering                     | snapshot-locked expected values                   | accept      | The JSON file is committed to the repo. Tampering would either fail the snapshot test (if the values are wrong) or pass with stale numbers (if the test code is also tampered). The git commit history records who locked the snapshot.              |
| T-02-05-02 | Information Disclosure        | n/a                                               | accept      | The truth case exercises a fund with `fundId: 1` against an empty `varianceReports` query — no real fund data, no PII, no secrets.                                                                                                                   |
| T-02-05-03 | Denial of Service             | non-deterministic test causes infinite retry loop | mitigate    | The truth case pins `randomSeed: 12345` and the precondition assertion checks `NODE_ENV === 'test'` to ensure the traditional engine path is selected. The determinism check test catches non-determinism on first run with a clear failure message. |
| T-02-05-04 | Engine drift                  | future Plan 02-02 change breaks the snapshot      | mitigate    | This is the WHOLE POINT of the snapshot — any change to the failureRate translation, the override branch, or the default distributions will cause the snapshot test to fail loudly. The failure is the regression signal.                            |
| T-02-05-05 | False-green from mock leakage | test accidentally mocks the engine                | mitigate    | The acceptance criteria explicitly require `grep -c "vi.mock.*unifiedMonteCarloService"` to return 0. If a future PR adds an engine mock to this test, the gate fails.                                                                               |
| T-02-05-06 | Phoenix gate count regression | new truth case is excluded from the runner        | mitigate    | The acceptance criteria require `npm run phoenix:truth` to report at least 259 tests across at least 6 test files. If the new file is excluded by a vitest config glob, this fails.                                                                  |

</threat_model>

<verification>
- `npm test -- backtesting-scenario` passes all 3 tests (snapshot match, determinism, GFC < bull)
- `npm run phoenix:truth` reports at least 259 tests across at least 6 test files
- `npm run validate:core` exits 0
- `npm run check` exits 0
- The JSON file's expected values are non-zero (snapshot has been locked, not left as placeholders)
- The test file does NOT mock unifiedMonteCarloService (engine must run for real)
- The test file references randomSeed 12345 (matches the JSON input)
</verification>

<success_criteria>

- New JSON truth case file at `docs/backtesting-scenario.truth-cases.json` with
  one snapshot-locked GFC entry (D-09)
- New test file at `tests/unit/truth-cases/backtesting-scenario.test.ts` that
  loads the JSON and asserts against the snapshot using `toBeCloseTo` with
  4-decimal tolerance
- The test exercises the REAL Monte Carlo engine end-to-end —
  `unifiedMonteCarloService` is NOT mocked
- The test pins determinism via the `randomSeed: 12345` plumbing added by Plan
  02-03
- The test verifies D-09's hard requirement
  (`mean(GFC) < mean(bull_market_2021)`)
- The test verifies determinism
  (`re-running with same seed -> byte-identical sample percentiles`)
- `npm run phoenix:truth` count goes from 258 to at least 259 across at least 6
  test files
- `npm run validate:core` is green
- REQ-BCK-01's "truth case for at least one historical market regime passes"
  gate is closed

</success_criteria>

<output>
After completion, create `.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-05-SUMMARY.md` documenting:

- The exact snapshot-locked values for `mean`, `p5`, `p25`, `p50`, `p75`, `p95`
  (paste them so Plan 02-06's plan doc can reference them as the "after" numbers
  in the before/after table)
- The corresponding "before" values from `_baselines/before-percentiles.json`
  (the file Plan 02-01 committed) for the GFC scenario only — paste these too
  for direct comparison
- The exact phoenix:truth count post-plan (target: at least 259)
- The chosen failureRate translation option (echoed from Plan 02-02's SUMMARY) —
  the snapshot is locked to whichever option Plan 02-02 chose
- Confirmation that the determinism check passed (re-running produces
  byte-identical results)
- A note for Plan 02-06: "The before/after table can be populated from the GFC
  entry in \_baselines/before-percentiles.json (Plan 02-01) and the snapshot in
  docs/backtesting-scenario.truth-cases.json (this plan). The failureRate
  translation choice is documented in 02-02-SUMMARY.md." </output>
