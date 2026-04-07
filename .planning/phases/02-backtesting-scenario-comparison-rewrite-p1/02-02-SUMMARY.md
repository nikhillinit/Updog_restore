---
phase: 02-backtesting-scenario-comparison-rewrite-p1
plan: 02
subsystem: monte-carlo-engine
tags: [monte-carlo, backtesting, engine-seam, distribution-override, tdd]

# Dependency graph
requires:
  - 02-01-baseline-capture (analytic-rescale fixture is locked in git so Plan 02-03
    can diff before/after percentiles after the rewrite lands)
provides:
  - "SimulationConfig.marketParameters optional field, auto-inherited up
    through StreamingConfig and UnifiedSimulationConfig via the existing
    extends chain (no new fields needed at the intermediate layers)"
  - "MonteCarloEngine.calibrateDistributions honors the override via a shared
    applyMarketParametersOverride helper that translates MarketParameters ->
    DistributionParameters (multiple.{mean,volatility}, exitTiming.mean,
    irr.mean scale by 1 - failureRate)"
  - "StreamingMonteCarloEngine.calibrateDistributions honors the same override
    via the same helper so engine selection cannot silently change scenario
    semantics"
  - "server/services/lib/distribution-overrides.ts — single source of truth
    for the MarketParameters -> DistributionParameters translation, imported
    by both engines"
  - "tests/unit/services/monte-carlo-engine-marketparams.test.ts — 2-test
    unit suite proving the override produces measurably different output
    for bull vs bear params and is a no-op when absent"
affects:
  - 02-03-runscenariocomparisons-rewrite (will inject
    marketParameters: getScenarioMarketParameters(scenarioName) per scenario
    into unifiedMonteCarloService.runSimulation — the seam this plan created)
  - 02-05-phoenix-truth-case (will lock the GFC truth case against whichever
    translation choice this plan made — option (a) failureRate scaling)
  - 02-06-plan-doc-and-verification (will reference the translation choice
    documented in this SUMMARY as a "can be revisited in a future phase"
    note)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared helper extraction for byte-identical engine contracts: when
      two engines must honor the same translation rules, extract the logic
      to a shared file (server/services/lib/distribution-overrides.ts) and
      import it from both rather than inline-duplicating. This enforces the
      byte-identical contract via module identity instead of copy-paste
      vigilance. RESEARCH Pitfall #4 (engine selection memory-pressure
      fallback could silently produce divergent scenario semantics) is the
      motivating threat."
    - "Opt-in optional-field override: the new marketParameters field on
      SimulationConfig is optional; when absent, the override branch is
      skipped and the code path is byte-identical to prior behavior. This
      preserves existing tests (71/71 monte-carlo tests still passing) and
      the Phoenix truth gate (258/258 unchanged) without requiring any
      modifications to existing callers."
    - "Type-chain extension via extends: adding marketParameters? to
      SimulationConfig auto-propagated up through StreamingConfig (which
      extends SimulationConfig) and UnifiedSimulationConfig (which extends
      StreamingConfig). No new fields needed at the intermediate layers —
      the existing extends chain does the work."
    - "Linter Edit Hook workaround for cross-reference import ordering:
      when adding an import for a symbol not yet referenced in the file,
      the post-edit ESLint hook strips the import. Workaround: add the
      consuming code (method body referencing the symbol) FIRST, then add
      the import. Documented in MEMORY.md under 'Linter Edit Hook --
      Import Ordering'. Two import additions in this plan were retried
      after the hook stripped them the first time; adding the body edit
      before the import edit succeeded on retry."

key-files:
  created:
    - server/services/lib/distribution-overrides.ts
    - tests/unit/services/monte-carlo-engine-marketparams.test.ts
    - .planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-02-SUMMARY.md
  modified:
    - server/services/monte-carlo-engine.ts
    - server/services/streaming-monte-carlo-engine.ts

key-decisions:
  - "failureRate translation option (a): scale irr.mean by
    (1 - failureRate). Chose option (a) per plan Q2 because it is the
    minimum-viable change that is fully encapsulated inside
    calibrateDistributions — no changes to generateSingleScenario or the
    per-scenario loop, no binomial gate, no new random draw. Option (b)
    (binomial gate inside generateSingleScenario) is statistically more
    defensible but requires deeper engine surgery and a second truth-case
    iteration. Option (a) can be upgraded to option (b) in a future phase
    if the Plan 02-05 GFC truth case shows systematic bias against the
    historical record."
  - "Extract the translation helper to a shared file rather than
    inline-duplicating. server/services/lib/distribution-overrides.ts is
    the single source of truth so both engines cannot silently diverge
    (RESEARCH Pitfall #4). Imported from both monte-carlo-engine.ts and
    streaming-monte-carlo-engine.ts via relative path './lib/...'."
  - "Thread config through as an optional parameter on
    calibrateDistributions rather than stashing it on the engine instance.
    Optional parameter preserves backward compatibility — any internal
    caller that does not pass config still gets the unchanged default
    behavior. The only call site inside each engine
    (runPortfolioSimulation / runStreamingSimulation) updates to pass
    config through."
  - "Lock the new unit test to forceEngine: 'traditional' to avoid the
    Math.random global patch in streaming-monte-carlo-engine.ts:1106-1112
    (RESEARCH Pitfall #1). The streaming engine's reservoir sampling at
    line 235 uses raw Math.random() which the setRandomSeed patch
    overrides globally — determinism is only reliable through the
    traditional engine's local PRNG. Both engines still implement the
    same override path so Plan 02-03 and Plan 02-05 can choose either
    engine depending on their determinism needs."

patterns-established:
  - "Engine seam pattern: when two engine implementations must honor the
    same new optional config field, (1) add the field to the base
    SimulationConfig only (inherits via extends), (2) thread the config
    through both engines' calibrateDistributions, (3) extract the
    translation logic to a shared helper, (4) import and call the helper
    from both engines. The new helper lives at
    server/services/lib/distribution-overrides.ts."

requirements-contributed: [REQ-BCK-01]
# REQ-BCK-01 is NOT marked complete by this plan — it spans Plans 02-02
# (engine seam), 02-03 (runScenarioComparisons rewrite), and 02-05 (GFC
# truth case). Plan 02-05 is responsible for the final mark-complete.

# Metrics
duration: ~14min
completed: 2026-04-07
---

# Phase 02 Plan 02: Engine MarketParameters Override Summary

**Wired the marketParameters override from SimulationConfig through BOTH the
traditional and streaming Monte Carlo engines' calibrateDistributions via a
shared distribution-overrides helper, so Plan 02-03's per-scenario
runScenarioComparisons rewrite has a real engine seam to inject
scenario-specific market parameters into.**

## Performance

- **Duration:** ~14 min
- **Started:** 2026-04-07T23:23:55Z
- **Completed:** 2026-04-07T23:37:30Z
- **Tasks:** 1 (single task with 7 embedded steps: RED test, add field, edit
  traditional engine, edit streaming engine, re-run test GREEN, run full gates,
  write SUMMARY)
- **Files modified:** 2
- **Files created:** 3 (1 source helper, 1 test file, 1 summary doc)

## Accomplishments

- **Shared translation helper** created at
  `server/services/lib/distribution-overrides.ts` (76 lines). Exposes
  `applyMarketParametersOverride(base, params)` which is the single source of
  truth for translating `MarketParameters` ->`DistributionParameters`. Returns a
  fresh object (no mutation). Clamps `failureRateScale` to `[0, 1]` via
  `Math.max(0, 1 - params.failureRate)` to guard pathological inputs.
- **SimulationConfig extended** with `marketParameters?: MarketParameters` at
  `server/services/monte-carlo-engine.ts:48-68`. Auto-inherits up through
  `StreamingConfig` (line 40) and `UnifiedSimulationConfig` (line 28) via the
  existing `extends` chain -- no edits needed at the intermediate layers.
- **Traditional engine override** applied in
  `MonteCarloEngine.calibrateDistributions` at
  `server/services/monte-carlo-engine.ts:649-716`. Added optional
  `config?: SimulationConfig` parameter, restructured the method body to compute
  `distributions` then apply the override at the end (only when
  `config?.marketParameters` is truthy). Default behavior preserved
  byte-for-byte when the field is absent. Call site updated at line 299.
- **Streaming engine override** mirrored in
  `StreamingMonteCarloEngine.calibrateDistributions` at
  `server/services/streaming-monte-carlo-engine.ts:926-996`. Same structure,
  same helper import, same trailing override branch. Call site updated at lines
  373-377. The `Math.random` patch at lines 1106-1112 is **UNCHANGED** (out of
  scope for this plan).
- **Unit test** created at
  `tests/unit/services/monte-carlo-engine-marketparams.test.ts` (169 lines, 2
  tests). Proves the override produces measurably different
  `irr.statistics.mean` values for bull vs bear params with the same
  `randomSeed: 12345`, and proves default behavior is unchanged when the field
  is absent.
- **TDD cycle complete.** RED commit (`27640933`) locked the failing test first
  (`expected 0 to be greater than 0.000001` — both calls produced identical
  output because the override path did not exist). GREEN commit (`e75c159f`)
  wired the override and the test now passes both assertions plus an
  engine-sanity check that `performance.engineUsed === 'traditional'`.

## failureRate Translation Choice: Option (a)

**Chose option (a): scale `irr.mean` by `(1 - failureRate)`.**

Rationale (one-line for Plan 02-06's plan doc):

> The rewrite chose option (a) for failureRate translation (scale irr.mean by
> `1 - failureRate`) as the minimum-viable approach that is fully encapsulated
> inside `calibrateDistributions`. This can be upgraded to option (b) (binomial
> gate inside `generateSingleScenario`) in a future phase if the Plan 02-05 GFC
> truth case shows systematic bias.

Why not option (b) or (c):

- **Option (b)** (binomial gate inside `generateSingleScenario` that zeroes out
  a fraction of scenarios matching `failureRate`) is more statistically
  defensible — it models the VC power-law reality that most investments return
  zero and a few return everything. But it requires modifying
  `generateSingleScenario` in both engines (which is tight with the PRNG seam)
  and adds a second random draw per scenario. Defer unless the truth case
  demands it.
- **Option (c)** (leave `failureRate` consumed only by the existing
  `generateScenarioInsights` text generator) is a no-op on the math and would
  leave the override incomplete. Rejected.

## Task Commits

1. **Task 1 RED: failing test for marketParameters override** — `27640933`
   (test)
2. **Task 1 GREEN: wire marketParameters override through both MC engines** —
   `e75c159f` (feat)

## Files Created/Modified

- **`server/services/lib/distribution-overrides.ts`** — NEW (76 lines). The
  shared `applyMarketParametersOverride` helper. Single source of truth for the
  MarketParameters -> DistributionParameters translation, imported by both
  engines.
- **`tests/unit/services/monte-carlo-engine-marketparams.test.ts`** — NEW (169
  lines, 2 tests). The TDD RED test that locked the override path in place.
- **`.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-02-SUMMARY.md`**
  — NEW (this file). Closes Plan 02-02.
- **`server/services/monte-carlo-engine.ts`** — MODIFIED. Added 2 imports
  (`MarketParameters` type, `applyMarketParametersOverride` helper), added
  `marketParameters?: MarketParameters` to `SimulationConfig` with 20-line
  JSDoc, restructured `calibrateDistributions` from a single-return method to a
  let-distributions-then-override shape, threaded `config` through the call site
  at line 299. Net: ~40 insertions, ~5 deletions.
- **`server/services/streaming-monte-carlo-engine.ts`** — MODIFIED. Added 1
  import (`applyMarketParametersOverride` helper), restructured
  `calibrateDistributions` the same way as the traditional engine, threaded
  `streamingConfig` through the call site at lines 373-377. Net: ~30 insertions,
  ~5 deletions. Math.random patch at lines 1106-1112 UNCHANGED.

## Decisions Made

See `key-decisions` in frontmatter. Most consequential: choosing option (a) for
the failureRate translation and extracting the translation helper to a shared
file rather than inline-duplicating.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Linter Edit Hook stripped imports on first pass**

- **Found during:** Task 1 Step 3 (adding `applyMarketParametersOverride` import
  to `monte-carlo-engine.ts`) and again on Step 4 (same issue in
  `streaming-monte-carlo-engine.ts`)
- **Issue:** The post-edit ESLint auto-fix hook strips unused imports
  immediately. When I tried to add the helper import BEFORE the method body
  referenced the symbol, the import was silently removed between the Edit tool
  call and the next read. This is documented in MEMORY.md under "Linter Edit
  Hook -- Import Ordering".
- **Fix:** Invert the edit order — add the method body (which references the
  symbol) FIRST, then add the import. The body's reference keeps the import from
  being stripped on the second pass. Applied this workaround in both engine
  files successfully on the retry.
- **Files modified:** `server/services/monte-carlo-engine.ts`,
  `server/services/streaming-monte-carlo-engine.ts`
- **Verification:** `grep -c "applyMarketParametersOverride"` on both files
  confirms the import and call survived, and `npm run check` reports 0 new
  TypeScript errors (would be non-zero if the import were still missing while
  the body referenced it).
- **Committed in:** `e75c159f` (the GREEN commit includes the surviving imports
  and bodies together)

**2. [Rule 2 - Defensive guard] Added failureRateScale clamp to [0, 1]**

- **Found during:** Task 1 Step 1 (writing the shared helper)
- **Issue:** The plan spec wrote `const failureRateScale = 1 - failureRate`
  which produces a negative scale if `failureRate > 1`. The `MarketParameters`
  interface does not currently enforce a numeric range, and a future
  misconfigured historical scenario fixture (or a custom user-supplied override
  via Plan 02-03) could pass an out-of-range value and produce a negative
  `irr.mean`, which would silently break downstream assertions.
- **Fix:** Wrap in `Math.max(0, 1 - params.failureRate)` so the clamp floors
  at 0. This matches the STRIDE mitigation T-02-02-03 in the plan's threat_model
  ("If a future caller passes `failureRate > 1`, the `Math.max(0, ...)` clamp
  returns 0 — IRR mean becomes 0, simulation still runs to completion, no
  DoS.").
- **Files modified:** `server/services/lib/distribution-overrides.ts`
- **Verification:** Documented in the helper's JSDoc and explicitly matches the
  threat model mitigation. No test asserts this specific clamp (it is a
  defensive guard, not a behavior contract) but the existing test would catch
  any regression that produced `NaN` or negative `mean` values.
- **Committed in:** `e75c159f`

---

**3. [Rule 3 - Process] Rolled back premature REQ-BCK-01 completion mark**

- **Found during:** Post-plan state update via
  `gsd-tools requirements mark-complete REQ-BCK-01`
- **Issue:** The executor instructions say "Mark completed requirements from
  PLAN.md frontmatter" and plan 02-02's frontmatter lists
  `requirements: [REQ-BCK-01]`. Running the tool flipped the `- [ ] REQ-BCK-01`
  checkbox to `- [x]`. However, REQ-BCK-01's full acceptance language ("original
  P0 requirement ... is satisfied; truth case for at least one historical market
  regime passes; persisted output is statistically defensible") spans Plans
  02-02 (engine seam), 02-03 (runScenarioComparisons rewrite + sample
  percentiles + delete applyMarketAdjustment), and 02-05 (GFC truth case). Plans
  02-03 and 02-05 also list REQ-BCK-01 in their frontmatter. Marking the
  requirement complete at Plan 02-02's close is premature — it should only be
  marked complete at Plan 02-05's close.
- **Fix:** Manually reverted the `REQ-BCK-01` checkbox from `[x]` back to `[ ]`
  via Edit. The `Status: Active` traceability table at REQUIREMENTS.md:145 was
  not touched by `mark-complete` so no further rollback needed there.
- **Files modified:** `.planning/REQUIREMENTS.md`
- **Verification:** `grep "REQ-BCK-01" .planning/REQUIREMENTS.md` shows
  `- [ ] **REQ-BCK-01**` (unchecked).
- **Recommendation for Plan 02-05:** When Plan 02-05 closes, the executor should
  run `mark-complete REQ-BCK-01` as the final act of closing the REQ-BCK-01 gate
  chain. Plans 02-03 and 02-05 should NOT individually mark it complete for the
  same reason.
- **Committed in:** to be included in the next (SUMMARY + state) metadata
  commit.

---

**Total deviations:** 3 auto-fixed (1 blocking infrastructure retry, 1 defensive
guard that matches the threat model, 1 rollback of premature requirement
completion). **Impact on plan:** All three stayed inside the planned scope — the
linter workaround was process, the defensive clamp was the plan's own threat
model, and the REQ-BCK-01 rollback is a requirement-tracking correctness fix. No
source files outside the plan's `files_modified` were touched.

## Issues Encountered

- **Linter Edit Hook retry cost:** Each engine file needed two Edit calls (body
  first, then import) instead of one, which added ~2 minutes to the execution
  time. This is a known hazard (documented in MEMORY.md) but always catches me
  off-guard when I forget to do the body edit first. No mitigation possible at
  the plan level — it is a tool-level quirk.
- **Pre-existing drift:** `docs/PHASE-STATUS.json` and `.planning/config.json`
  are in the working tree from previous sessions. I left them untouched and only
  staged task-owned files for the commits (same approach as Plan 02-01's summary
  noted).

## Verification Gate Results

- **`npm run check`** — 0 new TypeScript errors (baseline clean, 0/0)
- **`npm test -- monte-carlo-engine-marketparams`** — 2/2 passing
- **`npm test -- monte-carlo` (all monte-carlo service tests)** — 71/71 passing
  across 5 test files (monte-carlo-engine, marketparams, power-law-validation,
  statistical-assertions, power-law-integration)
- **`npm run phoenix:truth`** — 258/258 passing (identical to pre-plan baseline;
  override is opt-in and does not affect existing truth cases)
- **`grep -c "console\."`** — monte-carlo-engine.ts=0,
  streaming-monte-carlo-engine.ts=1, monte-carlo-service-unified.ts=7 —
  **unchanged from pre-plan baseline**. No new `console.*` introduced.
- **`git diff HEAD server/services/backtesting-service.ts`** — empty (Plan 02-03
  owns that file; untouched here)
- **`grep -c "Math\.random" server/services/streaming-monte-carlo-engine.ts`** —
  unchanged at 3 occurrences (patch at line 1106-1112 intact)

## Note for Plan 02-03

The `marketParameters` override is now wired and ready to consume. To inject
scenario-specific params per scenario inside `runScenarioComparisons`, pass
`marketParameters: getScenarioMarketParameters(scenarioName)` to
`unifiedMonteCarloService.runSimulation`. Use the spread pattern
`{ ...(marketParams && { marketParameters: marketParams }) }` to satisfy
`exactOptionalPropertyTypes` (REFL-021 in MEMORY.md).

Example call shape for Plan 02-03:

```typescript
const marketParams = getScenarioMarketParameters(scenarioName);
const result = await unifiedMonteCarloService.runSimulation({
  fundId,
  runs: runsPerScenario,
  timeHorizonYears,
  randomSeed: config.randomSeed,
  ...(marketParams && { marketParameters: marketParams }),
});
```

The traditional engine (via `forceEngine: 'traditional'`) gives deterministic
output via the local PRNG; the streaming engine does NOT because of the
`Math.random` global patch at `streaming-monte-carlo-engine.ts:1106-1112`
(RESEARCH Pitfall #1). Plan 02-05's GFC truth case should lock to
`forceEngine: 'traditional'` for deterministic snapshot-lock.

## Self-Check: PASSED

- [x] Commit `27640933` (RED) exists in git log
- [x] Commit `e75c159f` (GREEN) exists in git log
- [x] `server/services/lib/distribution-overrides.ts` exists on disk (verified
      via `git ls-files`)
- [x] `tests/unit/services/monte-carlo-engine-marketparams.test.ts` exists on
      disk
- [x] `grep -c "marketParameters?: MarketParameters" server/services/monte-carlo-engine.ts`
      returns 1 (plan acceptance criterion)
- [x] `grep -c "applyMarketParametersOverride" server/services/monte-carlo-engine.ts`
      returns 3 (import + JSDoc ref + call — exceeds plan criterion of >=2)
- [x] `grep -c "applyMarketParametersOverride" server/services/streaming-monte-carlo-engine.ts`
      returns 2 (import + call — meets plan criterion of >=2)
- [x] `grep -c "applyMarketParametersOverride" server/services/lib/distribution-overrides.ts`
      returns 1 (definition)
- [x] `grep -c "config.marketParameters" server/services/monte-carlo-engine.ts`
      returns 2 (check + pass-through)
- [x] `grep -c "config.marketParameters" server/services/streaming-monte-carlo-engine.ts`
      returns 2 (check + pass-through)
- [x] `npm run check` exits 0 (TypeScript baseline clean, 0 new errors)
- [x] `npm test -- monte-carlo-engine-marketparams` exits 0 (2/2 passing)
- [x] `npm run phoenix:truth` exits 0 with 258 truth cases passing (unchanged
      from pre-plan baseline)
- [x] `git diff HEAD server/services/backtesting-service.ts` is empty (Plan
      02-03's file untouched)
- [x] Math.random patch at streaming-monte-carlo-engine.ts:1106-1112 UNCHANGED
      (out of scope)
- [x] No new `console.*` added (counts 0/1/7 unchanged from baseline)
- [x] No `any` type usage in new code (CLAUDE.md zero-tolerance)
- [x] failureRate translation choice documented (option (a) with rationale)

## Next Phase Readiness

- **Plan 02-03 is unblocked.** The engine seam exists. Plan 02-03 can now
  replace the `applyMarketAdjustment` analytic rescale in
  `runScenarioComparisons` with per-scenario
  `unifiedMonteCarloService.runSimulation` calls that pass
  `marketParameters: getScenarioMarketParameters(scenarioName)`.
- **Plan 02-05 is unblocked.** The GFC truth case can lock against the
  deterministic output of the traditional engine with a fixed seed plus the
  `financial_crisis_2008` MarketParameters injected via this plan's override.
- **Plan 02-06 has the failureRate translation decision to reference.** The plan
  doc should call out: "Plan 02-02 chose option (a) (scale irr.mean by 1 -
  failureRate) as minimum-viable; can be revisited in a future phase if
  statistical defensibility becomes a P1 concern."

---

_Phase: 02-backtesting-scenario-comparison-rewrite-p1_ _Plan:
02-02-engine-market-params-override_ _Completed: 2026-04-07_
