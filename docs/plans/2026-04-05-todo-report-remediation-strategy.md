# To-Do Report Remediation Strategy (Updated Main)

Date: 2026-04-05 Status: actionable

## Objective

Convert the corrected accuracy review into an execution strategy that can be
implemented against current `main` without repeating stale assumptions.

## Scope based on validated findings

### Keep as active backlog (confirmed gaps)

1. Construction-vs-actual detailed breakdown remains deferred.
2. One-way/two-way/stress sensitivity tabs remain unimplemented.
3. IRR unification to canonical shared XIRR is still needed.
4. LP benchmark endpoint still returns placeholder data.
5. Snapshot-table governance/ADR decision still needed.

### Remove or reword (stale claims)

1. Drift logic does **not** need to be built from scratch.
2. Backtesting tests are **not** quarantined.
3. Restore path mismatch is stale framing for active UX (restore currently
   disabled in UI while route exists).
4. Concentration analysis code exists (do not claim “no code exists”).

## Implementation strategy

## Track A — Correct planning source of truth (Day 0)

- Replace stale statements in planning artifacts with validated wording.
- Add “evidence command” lines beside each claim to prevent future drift.

### Definition of done

- No planning doc claims drift-from-scratch, quarantined backtesting, or missing
  concentration code.
- Each retained claim has at least one reproducible command.

## Track B — Deliver low-risk product truthfulness updates (Days 1-3)

### B1. Sensitivity tab messaging hardening

- Keep disabled tabs, but add explicit expected API contract names and data
  requirements in UI copy to reduce ambiguity for implementation handoff.

### B2. Restore UX alignment

- Keep restore disabled until end-to-end wiring is confirmed.
- Add explicit pointer to versioned restore route contract in developer-facing
  docs to avoid “route mismatch” regression in future status reports.

### Definition of done

- UI text consistently reflects current behavior and implementation gates.
- Documentation uses route-accurate wording.

## Track C — Backend execution slices (Days 3-10)

### C1. IRR unification slice

- Migrate `ActualMetricsCalculator` and `PerformanceCalculator` IRR paths to
  canonical shared XIRR helpers where feasible.
- Keep adapter wrappers if return-type semantics differ; avoid behavior changes
  without explicit truth-case coverage.

### C2. Benchmark endpoint hardening slice

- Replace LP benchmark placeholder payload with a real data source path
  (initially minimal but non-static).
- Keep fallback semantics explicit when no benchmark dataset is available.

### Definition of done

- No production endpoint returns hardcoded benchmark example values.
- IRR code paths document canonical source and avoid duplicate local algorithms.

## Track D — Governance closure (parallel)

### D1. Snapshot-table ADR

- Decide canonical responsibility boundaries for `fund_snapshots` vs
  `fund_state_snapshots` (analytics-read snapshots vs time-travel state
  snapshots), including provenance and FK expectations.

### Definition of done

- ADR accepted and referenced by read/write services touching either table.

## Sandbox validation protocol (required per slice)

Use these commands as mandatory validation gates before claiming completion:

1. Drift implementation evidence:
   - `rg -n "toMetricDelta|driftCapable|driftReason" server/services/fund-results-comparison-service.ts`
2. Deferred construction-vs-actual evidence:
   - `rg -n "Construction vs\. actual comparison remains deferred|valuation-tier breakdowns stay deferred" client/src/components/forecasting/construction-actual-comparison.tsx`
3. Sensitivity status evidence:
   - `rg -n "COMING_SOON_TABS|planned but not yet wired" client/src/pages/sensitivity-analysis.tsx`
4. Backtesting integration health:
   - `npm run test:integration -- tests/integration/backtesting-api.test.ts`
5. Restore route/UI alignment:
   - `rg -n "Restore Unavailable|server route is wired" client/src/pages/time-travel.tsx`
   - `rg -n "POST /api/snapshots/:snapshotId/versions/:versionId/restore|/:versionId/restore" server/routes/portfolio/versions.ts`
6. Benchmark placeholder check:
   - `rg -n "Benchmark data placeholder|Placeholder for benchmark comparison logic" server/routes/lp-api.ts`
7. Concentration-code presence check:
   - `rg -n "identifyConcentrationRisks|Sector concentration|Stage concentration" server/services/portfolio-performance-predictor.ts`

## Exit criteria for “strategy complete”

- Planning artifacts updated with corrected statuses and reproducible evidence.
- At least one backend slice (IRR unification or benchmark hardening) lands with
  tests.
- Snapshot-table ADR accepted or explicitly timeboxed with owner and due date.

## Notes

This strategy intentionally avoids re-litigating already-implemented
capabilities and focuses implementation effort on validated remaining gaps.
