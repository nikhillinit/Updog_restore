# Roadmap — Updog Post-Stabilization (Milestone M8: Post-Stabilization Cleanup)

> **4 phases** | **11 requirements mapped** | All v1 requirements covered ✓
>
> Generated 2026-04-07 from `REQUIREMENTS.md`. Coarse granularity per
> `.planning/config.json`. The seven historical stabilization milestones
> (`M0A`-`M7`) are COMPLETE and tracked in `docs/STABILIZATION-ROADMAP.md`; this
> roadmap covers the next milestone (`M8`).

## Milestone Context

**Milestone M8 — Post-Stabilization Cleanup**

Goal: clear the four open backlog streams from `docs/plans/2026-04-*` while
staying inside the stabilized perimeter. No new product surfaces. No reopening
of LP/KPI/Compass. Each phase ends with `npm run validate:core` green and
`npm run phoenix:truth` green where calc paths are touched.

Exit gate: all 11 v1 REQs validated (moved to `PROJECT.md` § Validated), all
four phase verifiers passing, no regression in the 374/132 ratchet baselines, no
new orphan tests under disallowed `__tests__/` paths (per the new pre-push
`scripts/check-orphan-tests.mjs` hook).

## Phase Overview

| #   | Phase                                        | Goal                                                                                                                            | Requirements                          | Success Criteria | Touched code paths                                                        |
| --- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ---------------- | ------------------------------------------------------------------------- |
| 1   | Variance Automation 1C.3 Follow-Ons          | Execute the three deferred items from the 1C.2 known-tradeoffs list, starting with planner-loop leader election                 | REQ-VAR-01, REQ-VAR-02, REQ-VAR-03    | 4                | `server/services/variance-*`, `server/queues/`, `server/workers/`         |
| 2   | Backtesting Scenario Comparison Rewrite (P1) | Replace the post-hoc analytic rescaling in `runScenarioComparisons` with a true scenario-aware Monte Carlo re-run               | REQ-BCK-01, REQ-BCK-02, REQ-BCK-03    | 5                | `server/services/backtesting-service.ts`, `.a5c/processes/sensitivity-*`  |
| 3   | TODO Report Remediation                      | Wire live `_reportsData`, remove `mockVarianceData`, gate the report-restore UI, and execute Workstream B from the strategy doc | REQ-TODO-01, REQ-TODO-02              | 4                | `client/src/pages/reports*`, related variance components                  |
| 4   | Sensitivity Surface Polish                   | Finish the in-flight one-way / two-way / stress trio: consistent error mapping, integration tests, IA cleanup, REFL capture     | REQ-SENS-01, REQ-SENS-02, REQ-SENS-03 | 4                | `client/src/pages/sensitivity-analysis*`, `server/services/*sensitivity*` |

## Phase Details

### Phase 1: Variance Automation 1C.3 Follow-Ons

**Goal:** Execute the three deferred items from `1C.2`'s Known Tradeoffs list as
captured in
`docs/plans/2026-04-07-phase-1c3-variance-automation-followons-backlog.md`.
Start with the leader-election item (Item A) — it's the most concrete and most
operationally visible.

**Requirements:**

- REQ-VAR-01 — Planner-loop leader election (Item A)
- REQ-VAR-02 — Item B (confirm scope during `/gsd-discuss-phase 1`)
- REQ-VAR-03 — Item C (confirm scope during `/gsd-discuss-phase 1`)

**Background:** `1C.2` shipped in `5c002e3c` (2026-04-02) with hardening
follow-ups `b8d3bd60`, `c554ddca`, `3e9a360c`. The three deferred items are
independent and should not be bundled into one PR. Item A is the most likely
entry point because the trigger condition (multi-instance planner churn) is
already starting to be visible in the operational signal.

**Touchpoints:**

- `server/services/variance-tracking.ts`, `variance-alert-evaluation.ts`,
  `variance-alert-automation.ts`
- `server/queues/` (planner enqueue dedupe)
- `server/workers/` (planner loop entry)
- New: leader-election primitive (advisory locks vs dedicated table row vs
  external coordinator — decided in `/gsd-discuss-phase 1`)
- Tests: `tests/unit/services/variance-*.test.ts`, `tests/integration/`
  (multi-instance scenarios)

**Success criteria (4):**

1. A single elected leader runs the variance planner loop per window; the
   elected leader is observable via metrics and logs.
2. Correctness is preserved across leader crash mid-window (verified by an
   integration test that crashes the leader and asserts the next election picks
   up cleanly).
3. `npm run phoenix:truth` and `npm run validate:core` are green.
4. Items B and C from the 1C.3 backlog are either shipped, explicitly
   re-deferred to a later milestone with rationale, or split into a follow-on
   phase.

**UI hint:** no

**Plans:** 5 plans

Plans:

- [x] 01-01-leader-table-schema-PLAN.md — Drizzle table, hand-written migration,
      and db:push for variance_planner_leader
- [x] 01-02-leader-lease-manager-PLAN.md — Lease manager, planner gate, renewal
      timer, release-on-stop, getHealth extension, Pino events
- [x] 01-03-leader-unit-tests-PLAN.md — Unit tests for acquisition, renewal,
      takeover, demotion, release, D-04 processor regression guard
- [x] 01-04-leader-integration-test-PLAN.md — Crash-takeover integration test
      against real Postgres (no child process)
- [x] 01-05-backlog-doc-and-verification-PLAN.md — Update 1C.3 backlog doc per
      D-05/D-06/D-07 and run validate:core + phoenix:truth

---

### Phase 2: Backtesting Scenario Comparison Rewrite (P1)

**Goal:** Replace the post-hoc analytic rescaling in
`BacktestingService.runScenarioComparisons` with a true scenario-aware Monte
Carlo re-run, satisfying the original P0 requirement that was missed in the
2026-01 integration plan.

**Requirements:**

- REQ-BCK-01 — Inject scenario-specific market parameters into the simulation
  config and re-run the Monte Carlo
- REQ-BCK-02 — Reclassify `alphaFinding` severity from `informational` to P1 in
  `.a5c/processes/sensitivity-stress-panel.inputs.json`
- REQ-BCK-03 — Document the rewrite outcome in a new
  `docs/plans/2026-04-XX-backtesting-scenario-comparison-rewrite.md`

**Background:** Per
`docs/plans/2026-04-07-backtesting-scenario-comparison-correctness.md`, the
current implementation at `server/services/backtesting-service.ts:645-738` runs
the **default** simulation once and applies a fixed-function
`applyMarketAdjustment` (rescaled mean + hardcoded volatility coefficient). The
percentiles surfaced as
`scenarioComparison.simulatedPerformance.{p5,p25,p50,p75,p95}` are NOT sample
percentiles — they're an analytic 2-parameter approximation. This is
statistically incorrect and user-visible (persisted to `backtest_results`,
served through the API, surfaced in scenario comparison UI).

**Touchpoints:**

- `server/services/backtesting-service.ts:645-738` — `runScenarioComparisons`
  and `applyMarketAdjustment`
- `server/services/backtesting-service.ts:240-246` — public
  `compareScenariosDetailed` wrapper
- `server/services/monte-carlo-service-unified.ts` — must accept
  scenario-specific market parameter overrides
- `convertToBacktestResult` and `/api/backtesting/*` route surface
- `.a5c/processes/sensitivity-stress-panel.inputs.json` — severity
  reclassification
- Tests: new truth case for at least one historical market regime; existing
  `tests/integration/backtesting-api.test.ts`

**Success criteria (5):**

1. `runScenarioComparisons` injects scenario-specific market parameters into the
   simulation config and re-runs the Monte Carlo for each scenario (no
   `applyMarketAdjustment` post-hoc rescaling).
2. The persisted `scenarioComparison.simulatedPerformance.{p5,p25,p50,p75,p95}`
   values are sample percentiles from the scenario-aware run.
3. A new truth case under `tests/unit/truth-cases/` covers at least one
   historical market regime end-to-end and passes.
4. `alphaFinding` severity in
   `.a5c/processes/sensitivity-stress-panel.inputs.json` is reclassified to P1.
5. A new plan doc
   `docs/plans/2026-04-XX-backtesting-scenario-comparison-rewrite.md` exists
   with before/after percentile comparisons and a clear "this satisfies the
   2026-01 P0 requirement" note. `npm run phoenix:truth` and
   `npm run validate:core` are green.

**UI hint:** no (server-side correctness only; the scenario comparison UI should
re-render automatically with corrected data)

**Phoenix-specific:** Phoenix truth cases must pass before merging. Spawn
`phoenix-precision-guardian` for review of the rewrite. Spawn
`phoenix-truth-case-runner` to validate.

**Plans:** 6 plans

Plans:

- [x] 02-01-baseline-capture-PLAN.md — Capture analytic-rescale baseline
      percentiles for the GFC scenario before the rewrite removes the analytic
      code path
- [x] 02-02-engine-market-params-override-PLAN.md — Add
      SimulationConfig.marketParameters override and wire calibrateDistributions
      consumption in both Monte Carlo engines
- [ ] 02-03-runscenariocomparisons-rewrite-PLAN.md — Rewrite
      runScenarioComparisons to inject per-scenario marketParameters, delete
      applyMarketAdjustment, replace console.error with Pino structured logs
- [ ] 02-04-severity-reclassification-PLAN.md — Reclassify alphaFinding severity
      from informational to P1 in
      .a5c/processes/sensitivity-stress-panel.inputs.json
- [ ] 02-05-phoenix-truth-case-PLAN.md — Add Phoenix truth case for 2008 GFC
      scenario with fixed randomSeed and snapshot-locked sample percentiles
- [ ] 02-06-plan-doc-and-verification-PLAN.md — Author
      docs/plans/2026-04-XX-backtesting-scenario-comparison-rewrite.md with
      before/after table and live verification gate counts

---

### Phase 3: TODO Report Remediation

**Goal:** Execute Workstreams A and B from
`docs/plans/2026-04-05-todo-report-remediation-strategy.md` — wire the live
report data source, remove the variance mock, gate the restore UI, and complete
Workstream B.

**Requirements:**

- REQ-TODO-01 — Workstream A: wire `_reportsData`, remove `mockVarianceData`,
  gate restore UI behind a proper feature flag
- REQ-TODO-02 — Workstream B: confirm scope during `/gsd-discuss-phase 3` and
  execute

**Background:** Workstream A overlaps with the variance 0.P cleanup tail noted
in `2026-03-31-variance-roadmap-revision.md` lines 27-37. Workstream B's exact
scope must be re-derived from the 2026-04-05 strategy doc during phase discuss
because the strategy doc defines two parallel workstreams that may have evolved
since.

**Touchpoints:**

- `client/src/pages/reports.tsx` and any sub-pages
- Variance components that consume `mockVarianceData` (grep in `client/src/`)
- Feature flag wiring in `client/src/core/flags/unifiedClientFlags.ts`
- Tests: `tests/unit/pages/reports*.test.tsx`, plus any new tests for the wired
  data path

**Success criteria (4):**

1. `mockVarianceData` is removed from `client/src/`; grep returns zero hits.
2. The report surface consumes `_reportsData` end-to-end (with appropriate
   loading/empty/error states).
3. The report-restore UI is gated behind a proper feature flag (defaulting to
   off in production).
4. Workstream B is executed or explicitly closed with a status note in
   `STATE.md`. `npm run validate:core` is green.

**UI hint:** yes (report surface changes; consider running `/gsd-ui-phase 3` if
visual contract review is needed)

---

### Phase 4: Sensitivity Surface Polish

**Goal:** Finalize the sensitivity analysis surface trio (one-way / two-way /
stress) that landed across the recent commit burst (`9e134b5f`, `bc592b38`,
`7633fb51`, `2772dce9`, `e4707353`, `3a6fe301`). Make the three panels
consistent, add integration test coverage, and capture any new patterns into a
REFL.

**Requirements:**

- REQ-SENS-01 — Consistent error status mapping across the three engines;
  consistent loading/empty/error UI across the three panels; integration tests
  for the routes
- REQ-SENS-02 — IA/navigation cleanup verified; no orphan pages
- REQ-SENS-03 — Capture new patterns as a REFL or cheatsheet update (REFL-033 is
  already this surface — extend or add a sibling)

**Background:** This work is already in flight via direct commits over the last
week. This phase formalizes what's left: polish, tests, and learnings capture.
Phase 4 is intentionally last because it depends on the other three having
validated the planning workflow first; it's also the lowest-risk phase, so if
anything goes wrong with the workflow, this is where we get the cheapest signal.

**Touchpoints:**

- `client/src/pages/sensitivity-analysis.tsx` and panel components
  (`OneWayPanel`, `TwoWayPanel`, `StressPanel`)
- `server/services/{one-way-sensitivity-engine,two-way-sensitivity-engine,stress-test-engine,sensitivity-run-service}.ts`
- `server/routes/sensitivity.ts`
- Tests: new `tests/integration/sensitivity-routes.test.ts` if missing; new
  component tests under `tests/unit/components/sensitivity*`
- `docs/skills/REFL-033-*.md` and possibly REFL-036+ if new patterns emerge

**Success criteria (4):**

1. The three sensitivity engines map errors to HTTP status codes consistently
   (verified by a single shared mapping helper or three duplicate-but-aligned
   blocks).
2. The three panels share polish: consistent loading skeletons, consistent empty
   states, consistent error messaging copy.
3. Integration tests cover all three sensitivity routes (one-way, two-way,
   stress) including at least one error path each.
4. Any new pattern from the surface (e.g., engine error remap, panel state
   machine) is captured in a REFL or extends REFL-033. `npm run validate:core`
   is green and no new orphan tests are added under disallowed `__tests__/`
   paths (per the `scripts/check-orphan-tests.mjs` pre-push hook).

**UI hint:** yes (sensitivity panels; `/gsd-ui-phase 4` may be useful if the
polish work needs a visual contract)

---

## Coverage Validation

| REQ-ID      | Phase | Validated |
| ----------- | ----- | --------- |
| REQ-VAR-01  | 1     | ✓         |
| REQ-VAR-02  | 1     | ✓         |
| REQ-VAR-03  | 1     | ✓         |
| REQ-BCK-01  | 2     | ✓         |
| REQ-BCK-02  | 2     | ✓         |
| REQ-BCK-03  | 2     | ✓         |
| REQ-TODO-01 | 3     | ✓         |
| REQ-TODO-02 | 3     | ✓         |
| REQ-SENS-01 | 4     | ✓         |
| REQ-SENS-02 | 4     | ✓         |
| REQ-SENS-03 | 4     | ✓         |

**Coverage: 11/11 v1 requirements mapped to a phase.**

## Phase Sequencing Rationale

1. **Phase 1 first (Variance):** Operationally visible, well-scoped, and the
   deferred items have clear acceptance criteria from the 1C.2 plan. Gives GSD a
   clean win on a familiar surface.
2. **Phase 2 second (Backtesting P1):** Highest-impact correctness fix. Phoenix
   truth cases provide a strong gate. Doing this second (not first) lets Phase 1
   prove the GSD workflow on a less-risky change before the calc-path rewrite.
3. **Phase 3 third (TODO Reports):** Frontend cleanup with light backend
   touchpoints. Lower risk. Workstream B's scope ambiguity benefits from running
   after the workflow is proven.
4. **Phase 4 last (Sensitivity Polish):** Already in-flight; this phase
   formalizes the tail. Lowest risk. If GSD itself has bugs, we discover them on
   the safest phase.

Each phase ends with `npm run validate:core` and (where applicable)
`npm run phoenix:truth` green. No phase reopens an archived surface.

---

_Generated 2026-04-07 by `/gsd-new-project` brownfield onboarding. Run
`/gsd-discuss-phase 1` to begin Phase 1, or `/gsd-plan-phase 1` to skip
discussion._
