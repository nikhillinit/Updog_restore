# Requirements — Updog Post-Stabilization Backlog

> **Scope:** This document lists the **active** requirements (the open backlog
> GSD will plan and execute), **validated** requirements (already shipped on
> `main`), and explicit **out of scope** items.
>
> Validated requirements live in `PROJECT.md` for institutional memory. This
> file is the GSD-managed working set, with REQ-IDs that the roadmap maps to
> phases.
>
> Generated 2026-04-07 from `docs/plans/2026-04-*` and
> `docs/STABILIZATION-ROADMAP.md`.

## v1 Requirements (active backlog)

### Variance Automation (1C.3 follow-ons)

Source:
`docs/plans/2026-04-07-phase-1c3-variance-automation-followons-backlog.md`

- [ ] **REQ-VAR-01**: Implement planner-loop leader election so multi-instance
      variance planners do not duplicate work. Currently the
      `job_outbox.dedupe_key` unique index plus atomic claim protocol prevent
      correctness bugs, but multiple processors still wake up and attempt the
      same work — wasteful and visible in logs once instance count grows.
      Acceptance: a single elected leader runs the planner loop per window;
      correctness is preserved across leader crashes; observable
      health/transitions.
- [x] **REQ-VAR-02**: Resolve 1C.2 deferred Item B from the variance automation
      follow-ons backlog (specific scope to be confirmed during
      `/gsd-discuss-phase` for Phase 1 — read parent doc Items B/C before
      planning).
- [x] **REQ-VAR-03**: Resolve 1C.2 deferred Item C from the variance automation
      follow-ons backlog (same — confirm during phase discuss).

### Backtesting Correctness (P1 debt)

Source: `docs/plans/2026-04-07-backtesting-scenario-comparison-correctness.md`

- [ ] **REQ-BCK-01**: Rewrite `BacktestingService.runScenarioComparisons`
      (`server/services/backtesting-service.ts:645-738`) so each scenario
      injects scenario-specific market parameters into the simulation config and
      re-runs the Monte Carlo, instead of running the default simulation once
      and applying `applyMarketAdjustment` post-hoc. The persisted percentiles
      surfaced as `scenarioComparison.simulatedPerformance.{p5,p25,p50,p75,p95}`
      must be **sample percentiles from a scenario-aware run**, not a
      2-parameter analytic approximation. Acceptance: the original P0
      requirement from
      `docs/archive/plans/2026-01-04-monte-carlo-backtesting-integration.md:69`
      is satisfied; truth case for at least one historical market regime passes;
      persisted output is statistically defensible.
- [x] **REQ-BCK-02**: Reclassify the `alphaFinding` severity in
      `.a5c/processes/sensitivity-stress-panel.inputs.json` from `informational`
      to its proper P1 tier so the finding can no longer be triaged into the
      wrong queue.
- [x] **REQ-BCK-03**: Document the rewrite outcome in a new
      `docs/plans/2026-04-XX-backtesting-scenario-comparison-rewrite.md` plan
      doc, with before/after percentile comparisons against historical regimes.

### TODO Report Remediation

Source: `docs/plans/2026-04-05-todo-report-remediation-strategy.md`

- [ ] **REQ-TODO-01**: Workstream A — wire the live `_reportsData` source,
      remove the `mockVarianceData` placeholder, and gate the report-restore UI
      behind the proper feature flag (overlap with the variance 0.P cleanup tail
      noted in `2026-03-31-variance-roadmap-revision.md`). Acceptance: the
      report surface no longer references mock variance data; the restore UI is
      gated; tests for the wired data path exist.
- [ ] **REQ-TODO-02**: Workstream B — confirm and execute against
      `2026-04-05-todo-report-remediation-strategy.md` Workstream B (specific
      scope to be confirmed during phase discuss; read the strategy doc first).

### Sensitivity Surface Polish

Source: in-flight commits `9e134b5f` (stress tab), `bc592b38` (two-way panel),
`7633fb51` (one-way panel), `2772dce9` (OneWayPanel internals refactor),
`e4707353` (REFL-033)

- [ ] **REQ-SENS-01**: Finalize the sensitivity surface trio (one-way / two-way
      / stress) — confirm error status mapping is consistent across the three
      engines, the three panels share polish (loading states, empty states,
      error messaging), and the sensitivity routes are covered by integration
      tests.
- [ ] **REQ-SENS-02**: Surface the new sensitivity tabs in IA/navigation per the
      recent `+ IA cleanup` commit, and verify no orphan pages remain (e.g., the
      deleted `pages/monte-carlo.tsx` wrapper in `35b63a47`).
- [ ] **REQ-SENS-03**: Capture any sensitivity-specific REFL learnings (REFL-033
      already exists for this surface) and ensure new patterns make it into the
      appropriate cheatsheet or REFL.

## v2 Requirements (deferred — known but not committed)

These are real backlog items but explicitly out of v1 scope. They remain visible
so they are not lost.

- **Vite 6 audit sweep**: the `pdfTheme` circular import was the visible
  symptom. A targeted dependency-cruiser sweep across PDF and chart modules
  would surface other latent circulars before they bite at build time. Recent
  commits: `18b93aa8`, `1e4506c3`, `6462ea5d`.
- **Console / eslint-disable ratchet drawdown**: the 374 / 132 baselines exist
  precisely so they can be drawn down. Worth a dedicated phase later, but not
  blocking active work.
- **`any` type drawdown**: ~400 baselined `any` violations. Same shape as the
  console ratchet drawdown.
- **Stale cheatsheet refresh**: `cheatsheets/pr-merge-verification.md`
  references a 2025-11-17 baseline that is ~5 months stale; would mislead any
  PR-merge decision based on it.
- **Re-enable `tests/integration/fund-idempotency.spec.ts`**: still in the
  integration exclude list with the original cascade comment, despite the
  global-setup migration that supposedly removed the cause.
- **Phoenix truth case count reconciliation**: two historical snapshots (118/118
  vs 107/107) disagree; live count comes from `npm run phoenix:truth`. Not a
  bug, but a docs reconciliation that should land before the next
  architecture-level review.
- **LP portal expansion**: explicitly archived per Milestone 1; revisit only if
  the perimeter is re-opened by an explicit decision.
- **KPI manager / KPI submission resurrection**: same.
- **Compass productionization**: experimental, unmounted; revisit only if an
  explicit perimeter decision is made.

## Out of Scope

See `PROJECT.md` § Out of Scope for the canonical list. Highlights:

- LP / KPI / Compass surface expansion (archived, do not reopen without an
  explicit perimeter decision)
- Client-owned publish/recalc orchestration (server owns the lifecycle per
  Milestone 4)
- Removing the `validate:core` or `phoenix:truth` gates
- Greenfield rewrite of any existing engine (`shared/core/*` is authoritative
  per Milestone 3)
- Direct `decimal.js` imports / floating-point in `core/reserves/**` /
  `parseFloat` in P0 paths
- Mocking the database in tests that depend on real schema/migration behavior
- Emoji in any artifact

## Traceability (filled by roadmap)

| REQ-ID      | Phase | Status |
| ----------- | ----- | ------ |
| REQ-VAR-01  | 1     | Active |
| REQ-VAR-02  | 1     | Active |
| REQ-VAR-03  | 1     | Active |
| REQ-BCK-01  | 2     | Active |
| REQ-BCK-02  | 2     | Active |
| REQ-BCK-03  | 2     | Active |
| REQ-TODO-01 | 3     | Active |
| REQ-TODO-02 | 3     | Active |
| REQ-SENS-01 | 4     | Active |
| REQ-SENS-02 | 4     | Active |
| REQ-SENS-03 | 4     | Active |

100% of v1 requirements mapped to a phase.

---

_Generated 2026-04-07 by `/gsd-new-project` (brownfield onboarding mode). Open
`docs/plans/` for full per-item context before running `/gsd-discuss-phase N`._
