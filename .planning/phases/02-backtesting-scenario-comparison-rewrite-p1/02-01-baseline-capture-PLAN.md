---
phase: 02-backtesting-scenario-comparison-rewrite-p1
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - tests/unit/services/backtesting-service.test.ts
  - .planning/phases/02-backtesting-scenario-comparison-rewrite-p1/_baselines/before-percentiles.json
autonomous: true
requirements:
  - REQ-BCK-03
must_haves:
  truths:
    - 'A new opt-in describe block in
      tests/unit/services/backtesting-service.test.ts captures the
      analytic-rescale percentiles produced by the CURRENT
      runScenarioComparisons code path'
    - 'When CAPTURE_BASELINE=1 is set, running the test writes a deterministic
      JSON file under _baselines/ containing simulatedPerformance for all five
      historical scenarios'
    - 'When CAPTURE_BASELINE is unset, the new describe block is a no-op
      (skipped) so it does not bloat normal CI runs or create flake'
    - 'The committed _baselines/before-percentiles.json file contains the
      analytic-rescale "before" numbers that Plan 02-06 will diff against
      post-rewrite values'
  artifacts:
    - path: 'tests/unit/services/backtesting-service.test.ts'
      provides:
        'Phase 2 baseline capture describe block (additive only — no existing
        tests modified)'
      contains: "describe('Phase 2 baseline capture'"
    - path: '.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/_baselines/before-percentiles.json'
      provides:
        'Snapshot of the analytic-rescale "before" percentiles from the current
        runScenarioComparisons code path, captured before Plan 02-03 lands'
      contains: 'financial_crisis_2008'
  key_links:
    - from: 'CAPTURE_BASELINE=1 npm test -- backtesting-service'
      to: '_baselines/before-percentiles.json'
      via: 'fs.writeFileSync inside the new describe block'
      pattern: 'CAPTURE_BASELINE'
    - from: '02-06-plan-doc-and-verification-PLAN.md'
      to: '_baselines/before-percentiles.json'
      via:
        'plan doc reads the JSON file to populate the before/after comparison
        table'
      pattern: 'before-percentiles.json'
---

<objective>
Capture the "before" half of D-12's before/after percentile comparison table by running the CURRENT (analytic-rescale) `runScenarioComparisons` code against all five historical scenarios and persisting the resulting `simulatedPerformance` blocks to a committed JSON fixture. This is REQ-BCK-03 prep work — the plan doc in 02-06 cannot show a meaningful before/after comparison without this baseline being captured BEFORE the rewrite in 02-03 lands.

Note on plan structure (planner's reasoning): the researcher's recommended Wave
0 made 02-01 a hard blocker for all subsequent plans. After re-reading the
dependency graph, the only plan that consumes the baseline JSON file is 02-06
(the plan doc). Plans 02-02 (engine plumbing), 02-03 (rewrite), 02-04 (severity
reclass), and 02-05 (truth case) do not read this file. So 02-01 only blocks
02-06, not the entire phase. This is reflected in the wave assignments below:
02-01 is wave 1, 02-02 and 02-04 are wave 2 (parallel after 02-01, though they
don't strictly need 02-01 they can't share files with it either), and 02-06 is
wave 5 — the last gate that consumes the baseline JSON.

Purpose: lock the analytic-rescale numbers to a JSON file BEFORE the rewrite
removes the analytic code path forever. After 02-03 deletes
`applyMarketAdjustment`, the "before" numbers can never be re-captured — this
plan must run on the unmodified code path or the comparison is meaningless.

Output:

- A new opt-in describe block in
  `tests/unit/services/backtesting-service.test.ts` (additive only — no existing
  test bodies modified)
- A new committed JSON file at
  `.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/_baselines/before-percentiles.json`
  containing the captured analytic-rescale percentiles for all five historical
  scenarios

## Preconditions (read before running any task)

The new describe block writes a file via `fs.writeFileSync` ONLY when
`process.env.CAPTURE_BASELINE === '1'`. This is a deliberate gate so:

1. Normal CI runs of `npm test -- backtesting-service` are unaffected (zero new
   file IO, zero new assertions)
2. The operator explicitly opts in via
   `CAPTURE_BASELINE=1 npm test -- backtesting-service` to capture the baseline
3. After the file is committed in the same task, subsequent runs of the gated
   test confirm the file is still being produced (idempotent — overwrites are
   fine)

The capture MUST run against the analytic-rescale code path. If
`runScenarioComparisons` has already been rewritten when this task runs, the
baseline numbers will be SAMPLE percentiles (the rewrite output) instead of
analytic-rescale percentiles, and the comparison in 02-06 will be meaningless.
Verify by running
`grep -n "applyMarketAdjustment" server/services/backtesting-service.ts` BEFORE
running the capture — if the function is gone, STOP and re-coordinate plan
ordering. </objective>

<execution_context>
@C:/Users/nikhi/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/nikhi/.claude/get-shit-done/templates/summary.md </execution_context>

<context>
@.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-CONTEXT.md
@.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-RESEARCH.md
@CLAUDE.md

<interfaces>
<!-- The existing harness in tests/unit/services/backtesting-service.test.ts that the new describe block reuses verbatim. -->

From tests/unit/services/backtesting-service.test.ts (lines 9-98 — existing
mocks the new block depends on):

```typescript
const { mockDb } = vi.hoisted(() => {
  const mockDb = {
    query: {
      backtestResults: { findMany: vi.fn(), findFirst: vi.fn() },
      fundBaselines: { findFirst: vi.fn() },
      fundStateSnapshots: { findFirst: vi.fn() },
      varianceReports: { findMany: vi.fn(), findFirst: vi.fn() },
    },
    insert: vi.fn().mockReturnValue({ values: vi.fn() }),
  };
  return { mockDb };
});

vi.mock('../../../server/db', () => ({ db: mockDb }));

vi.mock('../../../server/services/monte-carlo-service-unified', () => ({
  unifiedMonteCarloService: {
    runSimulation: vi.fn().mockResolvedValue({
      simulationId: 'sim-123',
      // ...
      irr: {
        statistics: {
          mean: 0.18,
          standardDeviation: 0.08,
          min: -0.1,
          max: 0.5,
        },
        percentiles: { p5: 0.05, p25: 0.12, p50: 0.18, p75: 0.25, p95: 0.35 },
        // ...
      },
      // ... full mockSimulationResult shape (lines 105-158)
    }),
  },
}));

import { BacktestingService } from '../../../server/services/backtesting-service';
```

The five scenario names available (verified at
server/data/historical-scenarios.ts lines 59, 84, 109, 134, 159):

```typescript
type HistoricalScenarioName =
  | 'financial_crisis_2008'
  | 'dotcom_bust_2000'
  | 'covid_2020'
  | 'bull_market_2021'
  | 'rate_hikes_2022'
  | 'custom';
```

The current public surface that produces the analytic-rescale numbers
(server/services/backtesting-service.ts:251-258):

```typescript
async compareScenarios(
  fundId: number,
  scenarios: HistoricalScenarioName[],
  simulationRuns: number = 5000
): Promise<ScenarioComparison[]> {
  const outcome = await this.compareScenariosDetailed(fundId, scenarios, simulationRuns);
  return outcome.comparisons;
}
```

`ScenarioComparison.simulatedPerformance` shape (shared/types/backtesting.ts:147
area):

```typescript
type DistributionSummary = {
  mean: number;
  median: number;
  p5: number;
  p25: number;
  p75: number;
  p95: number;
  min: number;
  max: number;
  standardDeviation: number;
};
```

</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Add opt-in baseline-capture describe block to tests/unit/services/backtesting-service.test.ts and commit the captured JSON fixture</name>
  <files>tests/unit/services/backtesting-service.test.ts, .planning/phases/02-backtesting-scenario-comparison-rewrite-p1/_baselines/before-percentiles.json</files>
  <read_first>
    - tests/unit/services/backtesting-service.test.ts (FULL file 1-560 — confirms the existing mock shape, locates the bottom of the existing describe block, confirms which imports already exist)
    - server/services/backtesting-service.ts (lines 645-738 — confirm the analytic-rescale code path is still in place; if applyMarketAdjustment is gone, STOP and re-coordinate plan ordering)
    - server/data/historical-scenarios.ts (lines 1-294 — confirm the five scenario name strings are still 'financial_crisis_2008', 'dotcom_bust_2000', 'covid_2020', 'bull_market_2021', 'rate_hikes_2022')
    - .planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-CONTEXT.md (D-12 — the plan doc requirement that consumes this fixture)
    - .planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-RESEARCH.md (Q11 — the canonical Wave 0 baseline-capture pattern)
    - CLAUDE.md § Mandatory Pre-Action Checks (run grep before changing shared mocks)
  </read_first>
  <action>
This task does THREE things in sequence:

1. Add a new opt-in describe block at the END of
   `tests/unit/services/backtesting-service.test.ts` (after the closing `});` of
   the outermost `describe('BacktestingService', ...)`. The block is gated
   behind `process.env.CAPTURE_BASELINE === '1'` so it is a no-op in normal CI
   runs.
2. Run the gated test once locally with
   `CAPTURE_BASELINE=1 npm test -- backtesting-service` to produce the JSON
   file.
3. Commit BOTH the test file modification AND the captured JSON file in the same
   task.

### Step 1 — Add the describe block

Append this block AT THE END of
`tests/unit/services/backtesting-service.test.ts`, AFTER the final `});` of the
outermost describe and BEFORE the trailing newline. Do NOT insert it inside an
existing describe — it must be a sibling so the existing tests are unaffected.

```typescript
// ============================================================================
// Phase 2 baseline capture (opt-in only)
//
// This describe block runs ONLY when CAPTURE_BASELINE=1 is set in the env.
// It captures the analytic-rescale percentiles produced by the CURRENT
// runScenarioComparisons code path (BEFORE the Plan 02-03 rewrite removes
// applyMarketAdjustment) and writes them to a committed JSON file under
// .planning/phases/02-backtesting-scenario-comparison-rewrite-p1/_baselines/.
//
// The committed JSON is consumed by Plan 02-06's plan doc to populate the
// before/after percentile comparison table required by D-12.
//
// Why opt-in: this describe writes a file via fs.writeFileSync, which is a
// side effect we do not want in normal CI runs. The gate keeps normal runs
// pure and lets the operator opt in explicitly via:
//
//   CAPTURE_BASELINE=1 npm test -- backtesting-service
//
// IMPORTANT: this block MUST be removed (or kept as a permanent capture
// fixture) only after Plan 02-06 has consumed the JSON. Once the rewrite in
// Plan 02-03 lands, re-running this with CAPTURE_BASELINE=1 will OVERWRITE
// the file with the post-rewrite SAMPLE percentiles instead of the analytic
// rescales — losing the "before" half of the comparison forever.
// ============================================================================

if (process.env['CAPTURE_BASELINE'] === '1') {
  describe('Phase 2 baseline capture (opt-in)', () => {
    it('captures simulatedPerformance for all five historical scenarios into _baselines/before-percentiles.json', async () => {
      // Lazy imports so the gate is the only branch that pulls fs/path into
      // the module graph during normal runs.
      const fs = await import('node:fs');
      const path = await import('node:path');

      const service = new BacktestingService();

      // Re-stub the engine mock to a fixed deterministic shape so the captured
      // numbers are stable across reruns. Use the same mockSimulationResult
      // already defined at the top of this file (lines 105-158).
      vi.mocked(unifiedMonteCarloService.runSimulation).mockResolvedValue(
        mockSimulationResult as Awaited<
          ReturnType<typeof unifiedMonteCarloService.runSimulation>
        >
      );

      const scenarios = [
        'financial_crisis_2008',
        'dotcom_bust_2000',
        'covid_2020',
        'bull_market_2021',
        'rate_hikes_2022',
      ] as const;

      const result = await service.compareScenarios(
        1,
        scenarios as unknown as Parameters<typeof service.compareScenarios>[1],
        5000
      );

      // Expect all five scenarios captured (none should land in failedScenarios
      // because the engine is mocked to a successful result).
      expect(result).toHaveLength(5);

      const baselineRecord = {
        capturedAt: new Date().toISOString(),
        codePath: 'analytic-rescale (pre Plan 02-03 rewrite)',
        notes:
          'These percentiles are produced by applyMarketAdjustment in server/services/backtesting-service.ts (lines 704-738). Plan 02-03 will delete that method and replace with sample percentiles from per-scenario MC runs. Plan 02-06 reads this file to populate the before/after comparison table required by D-12.',
        engineMock: {
          irr: {
            statistics: mockSimulationResult.irr.statistics,
            percentiles: mockSimulationResult.irr.percentiles,
          },
        },
        scenarios: result.map((scenario) => ({
          scenario: scenario.scenario,
          simulatedPerformance: scenario.simulatedPerformance,
          marketParameters: scenario.marketParameters,
        })),
      };

      const outDir = path.resolve(
        process.cwd(),
        '.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/_baselines'
      );
      fs.mkdirSync(outDir, { recursive: true });
      const outPath = path.join(outDir, 'before-percentiles.json');
      fs.writeFileSync(outPath, JSON.stringify(baselineRecord, null, 2) + '\n');

      // Sanity check: the file is non-empty and parses.
      const written = fs.readFileSync(outPath, 'utf-8');
      const parsed = JSON.parse(written);
      expect(parsed.scenarios).toHaveLength(5);
      expect(parsed.scenarios[0].scenario).toBe('financial_crisis_2008');
    });
  });
}
```

Notes on the design (do NOT alter):

- The gate is `process.env['CAPTURE_BASELINE'] === '1'` (bracket access —
  required by `noPropertyAccessFromIndexSignature` per the project tsconfig).
- Lazy `await import('node:fs')` keeps fs out of the module graph in normal runs
  (defense in depth — the gate already prevents the test from running, but lazy
  import is one fewer side effect at file-load time).
- The mock is RE-STUBBED inside the test using
  `vi.mocked(...).mockResolvedValue(...)` because the top-level `vi.mock`
  factory uses `vi.fn().mockResolvedValue(...)` which `vi.restoreAllMocks()`
  (called in afterEach if present) can wipe — see MEMORY note "Vitest
  restoreAllMocks Gotcha".
- The output JSON includes `capturedAt`, `codePath` (string label so the reader
  knows which code path produced these numbers), `notes`, `engineMock` (the
  input distribution that drove the capture), and `scenarios` (the full output
  array). All five scenarios are captured in one shot.
- The describe block contains exactly ONE `it(...)` — it is a fixture-producer,
  not a test suite.
- The new describe block is OUTSIDE the existing
  `describe('BacktestingService', ...)` block. It must be a sibling at the top
  level of the file. Insert it as the LAST block in the file, AFTER the final
  `});` of the outermost describe.

### Step 2 — Run the gated test to produce the JSON file

After saving the test file, run:

```bash
CAPTURE_BASELINE=1 npm test -- backtesting-service
```

Verify the file
`.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/_baselines/before-percentiles.json`
was created and contains five scenario entries. The capture only takes a few
seconds because the engine is mocked.

If the test runner reports the new describe block was skipped (no
`Phase 2 baseline capture` line in the output), the gate is misfiring — the env
var is not being passed through. On Windows with PowerShell, prefer
`$env:CAPTURE_BASELINE='1'; npm test -- backtesting-service` (per CLAUDE.md §
windows_environment).

### Step 3 — Commit BOTH files together

Stage and commit both `tests/unit/services/backtesting-service.test.ts` and
`.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/_baselines/before-percentiles.json`
in the same git commit. The describe block stays in the test file as a permanent
fixture-producer for future re-captures (e.g., if the engine mock shape changes
and the baseline needs to be re-captured pre-rewrite — a remote possibility but
worth keeping the seam alive).

Do NOT modify any existing test body in the file. Do NOT modify the existing
mocks. Do NOT bump versions. The only diff to
`tests/unit/services/backtesting-service.test.ts` is the new describe block
appended at the bottom. </action> <verify> <automated>node -e "const fs =
require('fs'); const p =
'.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/\_baselines/before-percentiles.json';
if (!fs.existsSync(p)) { console.error('FAIL: ' + p + ' not present');
process.exit(1); } const data = JSON.parse(fs.readFileSync(p, 'utf-8')); if
(!Array.isArray(data.scenarios) || data.scenarios.length !== 5) {
console.error('FAIL: scenarios length is not 5'); process.exit(1); }
console.log('OK: baseline JSON has', data.scenarios.length,
'scenarios');"</automated> </verify> <acceptance_criteria> - File
`.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/_baselines/before-percentiles.json`
exists - The JSON file contains a `scenarios` array of length 5 -
`grep -c "Phase 2 baseline capture" tests/unit/services/backtesting-service.test.ts`
returns at least `1` -
`grep -c "CAPTURE_BASELINE" tests/unit/services/backtesting-service.test.ts`
returns at least `1` -
`grep -c "before-percentiles.json" tests/unit/services/backtesting-service.test.ts`
returns `1` -
`grep -c "financial_crisis_2008" .planning/phases/02-backtesting-scenario-comparison-rewrite-p1/_baselines/before-percentiles.json`
returns at least `1` -
`grep -c "covid_2020" .planning/phases/02-backtesting-scenario-comparison-rewrite-p1/_baselines/before-percentiles.json`
returns at least `1` -
`grep -c "rate_hikes_2022" .planning/phases/02-backtesting-scenario-comparison-rewrite-p1/_baselines/before-percentiles.json`
returns at least `1` - `npm run check` exits 0 (the new test code is
type-clean) - `npm test -- backtesting-service` (without CAPTURE_BASELINE) still
passes — the gate prevents the new block from running in normal runs -
`git diff tests/unit/services/backtesting-service.test.ts` shows additions only
(no edits to existing tests) - The captured JSON file contains the string
`analytic-rescale` in the `codePath` field — proves the capture ran against the
pre-rewrite code path </acceptance_criteria> <done>The opt-in describe block is
committed, the operator has run it once with `CAPTURE_BASELINE=1`, the captured
JSON file exists with five scenario entries and an `analytic-rescale` codePath
label, and `npm test -- backtesting-service` (no env var) still passes. The
"before" half of the D-12 comparison table is locked.</done> </task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary                  | Description                                                                                                                                                                                        |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| test runner -> filesystem | The new opt-in describe block writes a file via `fs.writeFileSync` to a path under `.planning/`. Only triggered when `CAPTURE_BASELINE=1` is set in the env, so normal CI runs do not write files. |

## STRIDE Threat Register

| Threat ID  | Category                 | Component                                                         | Disposition | Mitigation Plan                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------- | ------------------------ | ----------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-02-01-01 | Tampering                | committed `_baselines/before-percentiles.json`                    | accept      | The file is a fixture, not user data. Its only consumer is the plan doc in 02-06 (operator-readable). Tampering would degrade the comparison table but cannot affect runtime correctness.                                                                                                                                                                                                                                                                            |
| T-02-01-02 | Information Disclosure   | the captured JSON file contents                                   | accept      | The mock simulation results contain no PII, no secrets, no real fund data — they are deterministic constants from `mockSimulationResult` at lines 105-158 of the test file.                                                                                                                                                                                                                                                                                          |
| T-02-01-03 | Denial of Service        | infinite loop or huge file write inside the gated block           | mitigate    | The capture writes exactly one JSON file (~5KB) per opt-in run. The gate `process.env['CAPTURE_BASELINE'] === '1'` defaults to false in CI, so the file write never happens in normal runs.                                                                                                                                                                                                                                                                          |
| T-02-01-04 | False-green verification | the gated block silently failing to write the file                | mitigate    | The acceptance criteria include a `node -e` script that verifies the file exists AND parses AND has exactly 5 scenarios. Failing any of these halts the task.                                                                                                                                                                                                                                                                                                        |
| T-02-01-05 | Tampering                | accidentally re-running CAPTURE_BASELINE=1 AFTER Plan 02-03 lands | mitigate    | The describe block's notes string explicitly warns "re-running this with CAPTURE_BASELINE=1 will OVERWRITE the file with the post-rewrite SAMPLE percentiles instead of the analytic rescales — losing the 'before' half of the comparison forever." The committed JSON's `codePath` field labels which path produced the numbers; if Plan 02-06 sees `sample-percentile` instead of `analytic-rescale` in this field, it can refuse to render the comparison table. |

</threat_model>

<verification>
- `node -e` script in the task `<verify>` block confirms the JSON file exists, parses, and contains exactly 5 scenarios
- `npm test -- backtesting-service` (no env var) still passes — the new describe block is skipped
- `npm run check` exits 0 — the new test code is type-clean (no `any`, no untyped fs imports)
- `git diff tests/unit/services/backtesting-service.test.ts` shows additions only — no existing tests touched
- The committed JSON file's `codePath` field reads `analytic-rescale (pre Plan 02-03 rewrite)` proving the capture ran on the pre-rewrite code path
</verification>

<success_criteria>

- Opt-in `describe('Phase 2 baseline capture (opt-in)', ...)` block is appended
  to `tests/unit/services/backtesting-service.test.ts` as a sibling of the
  existing top-level describe
- The block is gated behind `process.env['CAPTURE_BASELINE'] === '1'` and is a
  no-op in normal CI runs
- File
  `.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/_baselines/before-percentiles.json`
  exists, contains the analytic-rescale percentiles for all five historical
  scenarios, and is labelled with
  `codePath: 'analytic-rescale (pre Plan 02-03 rewrite)'`
- No existing tests in `backtesting-service.test.ts` are modified — additions
  only
- `npm run check` and `npm test -- backtesting-service` (no env var) both pass
- Plan 02-06 has a stable file to read for its before/after comparison table
- D-12's "before/after" requirement now has the "before" half locked

</success_criteria>

<output>
After completion, create `.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-01-SUMMARY.md` documenting:

- Exact location (line range) of the new describe block in the test file
- The path of the committed JSON fixture
- The captured percentiles for `financial_crisis_2008` (paste the
  simulatedPerformance block as a sanity check the operator can compare against
  the post-rewrite numbers in 02-06)
- Confirmation that `npm test -- backtesting-service` without the env var still
  passes
- Note: Plan 02-06 will read this JSON file to populate the before/after
  comparison table </output>
