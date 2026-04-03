---
status: ACTIVE
last_updated: 2026-04-03
---

# ADR-013: Scenario Comparison Tool Activation

**Status:** Superseded
**Date:** 2025-12-28
**Superseded On:** 2026-04-03
**Superseded By:** Phase 2 scenario-comparison consolidation decision in
`docs/plans/2026-04-02-phase-2-scenario-comparison-consolidation-plan.md`
**Decision Makers:** Product Team, Technical Team
**Tags:** #scenario-comparison #feature-activation #superseded

---

## Context

This ADR proposed activating a standalone scenario-comparison runtime backed by:

- `server/routes/scenario-comparison.ts`
- an ephemeral `/api/portfolio/comparisons` API
- a future saved-comparison persistence family

That product path did not ship. Phase 2 consolidation removed the retired route
surface and standardized scenario analysis around the live Monte Carlo
backtesting workflow under `/api/backtesting/*`.

The consolidation also retired the dormant saved-comparison persistence family:

- `scenario_comparisons`
- `comparison_configurations`
- `comparison_access_history`

Comparative historical-scenario output now lives on the backtesting result
contract instead:

- `backtest_results.scenario_comparisons`
- `backtest_results.scenario_comparison_summary`

## Superseding Decision

Do not activate the old standalone scenario-comparison runtime.

Instead:

1. Keep `/sensitivity-analysis` and `/api/backtesting/*` as the live scenario
   analysis surface.
2. Persist comparison disclosure on `backtest_results`, not a separate saved
   comparison backend.
3. Treat the old activation proposal as historical context only.

## Consequences

### Positive

- The repo has one live comparison story instead of parallel dormant and active
  models.
- Historical-scenario comparison remains available through the shipped
  backtesting workflow.
- Schema, docs, and tests can align around a single contract.

### Negative

- The standalone scenario-comparison route and planned saved-comparison product
  path are intentionally abandoned.
- Future saved comparison work would need a new ADR and a new runtime design
  rather than reviving this record.

## Historical Note

The original activation proposal was reasonable when the repo still carried the
route and persistence scaffolding. It is superseded because the shipped product
shape moved in a different direction.

## References

- Parent consolidation plan:
  `docs/plans/2026-04-02-phase-2-scenario-comparison-consolidation-plan.md`
- Slice 3 retirement plan:
  `docs/plans/2026-04-03-phase-2-slice-3-saved-comparison-retirement-plan.md`

