---
status: Implemented
last_updated: 2026-05-29
---

# ADR-022: Fund-Results Scenario Architecture

## Status

Implemented (2026-05-29)

This ADR records the current implementation on `main` at `55985b44`
(`Keep cohort out of authoritative readiness until evidence exists (#735)`). It
is no longer a future implementation proposal.

## Context

Fund-results scenarios are a fund-scoped, published-config-derived scenario
surface. They are distinct from the repo's older scenario concepts:

| Surface                       | Scope                                 | Current disposition                                                                                                                                               |
| ----------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Company/deal scenarios        | `company_id`-scoped                   | Separate cap-table/deal workflow in `shared/schema/scenario.ts`, `server/routes/scenario-analysis.ts`, and related client components.                             |
| Reserve allocation scenarios  | `fund_id`-scoped, allocation-specific | Separate durable reserve planning lane in `server/routes/allocation-scenarios.ts` and `server/services/allocation-scenario-service.ts`.                           |
| Monte Carlo scenario matrices | Cache / simulation layer              | Separate matrix cache and Monte Carlo path; `server/workers/scenarioGeneratorWorker.ts` is not reused for fund-results scenario calculations.                     |
| Fund-results scenarios        | `fund_id`-scoped analytical outputs   | Implemented through `fund_scenario_sets`, `fund_scenario_variants`, `fund_scenario_set_events`, `fund_scenario_calculation_runs`, and `fund_snapshots.SCENARIOS`. |

ADR-014 still governs the storage boundary: `fund_snapshots` is the analytical
snapshot store, while `fund_state_snapshots` is for time-travel / restore state.

## Decision

### 1. Fund-scenario persistence is the dedicated abstraction

Fund-results scenarios use dedicated persistence:

- `fund_scenario_sets` pins each set to the current published config at create
  time (`source_config_id`, `source_config_version`).
- `fund_scenario_variants` stores homogeneous variants for a set. The current
  supported override types are `fee_profile`, `reserve_allocation`,
  `allocation`, and `sector_profile`.
- `fund_scenario_set_events` records create, archive, calculation queued,
  calculation started, calculation failed, and calculated events.
- `fund_scenario_calculation_runs` deduplicates active calculation attempts by
  scenario set, source config, source config version, and input hash.

Current limits enforced by the shared contract / services:

| Limit                      | Current implementation                                                      |
| -------------------------- | --------------------------------------------------------------------------- |
| Active scenario sets       | Max 10 active sets per fund.                                                |
| Variants per set           | 1 to 5 variants.                                                            |
| Variant override mixing    | Not allowed; all variants in a set must share the same `overrideType`.      |
| Reserve override item list | 1 to 500 reserve allocation override items.                                 |
| Idempotency                | Scenario-set creation accepts an idempotency key and rejects payload reuse. |

No apply-to-live-config route is implemented today. Scenario outputs remain
analytical results, not draft mutations.

### 2. Snapshot attribution is implemented on `fund_snapshots`

`fund_snapshots` has nullable `scenario_set_id`:

- authoritative snapshots keep `scenario_set_id IS NULL`;
- scenario snapshots use `type = 'SCENARIOS'` and non-null `scenario_set_id`;
- scenario snapshots are deduplicated by `fund_id`, `scenario_set_id`,
  `config_id`, `config_version`, and `state_hash`;
- authoritative readers filter `scenario_set_id IS NULL`;
- authoritative writers either omit `scenario_set_id` intentionally or are
  tested as authoritative-only writers.

The implemented isolation proof is source-backed by
`tests/unit/phase3/fund-snapshots-scenario-isolation.test.ts`.

`GET /api/funds/:fundId/results` now includes `sections.scenarios` through
`shared/contracts/fund-results-v1.contract.ts`:

- `unavailable` when no active scenario sets exist;
- `pending` when sets exist but none have calculated scenario snapshots;
- `available` when latest calculated scenario summaries exist;
- `failed` when scenario result loading fails closed.

The results read model summarizes active scenario sets only. It reads the latest
scenario snapshot per set and emits summary payloads, not full engine payloads.

### 3. Calculation modes are split by override type

`POST /api/funds/:fundId/scenario-sets/:scenarioSetId/calculate` handles sync
economics calculations for:

- `fee_profile` as `sync_fee_profile`;
- `allocation` as `sync_allocation`;
- `sector_profile` as `sync_sector_profile`.

The sync path loads the pinned source config, applies the variant override to
engine input, runs the economics model, enforces a 10s request deadline, writes
a `fund_snapshots.SCENARIOS` row, and records a `calculated` event.

`reserve_allocation` is async:

- `POST /api/funds/:fundId/scenario-sets/reserve-optimization` creates a
  reserve-allocation scenario set from current reserve engine recommendations.
- `POST /api/funds/:fundId/scenario-sets/:scenarioSetId/calculate-reserve`
  enqueues an `async_reserve_allocation` job on `fund-scenario-calc`.
- `workers/fund-scenario-calc-worker.ts` processes the job through
  `runReserveScenarioCalculation`.
- The reserve path builds reserve portfolio inputs, applies reserve allocation
  overrides, writes a `fund_snapshots.SCENARIOS` row, and records lifecycle
  events.

`server/workers/scenarioGeneratorWorker.ts` remains unrelated; it is not the
fund-results scenario calculator.

### 4. Calculation status is currently reserve-async focused

`GET /api/funds/:fundId/scenario-sets/:scenarioSetId/calculation-status` derives
async reserve calculation status from the latest matching scenario snapshot and
`fund_scenario_set_events`.

Current status values are:

- `not_requested`;
- `queued`;
- `calculating`;
- `succeeded`;
- `failed`.

The current service computes the reserve scenario input identity first, so it is
the status surface for `async_reserve_allocation`. Sync economics scenario sets
use `calculate`, `results`, and `comparison` rather than this status endpoint as
their primary completion surface.

### 5. Scenario comparison is a separate fee-profile comparison surface

Scenario comparison is implemented as a separate contract:
`shared/contracts/fund-scenario-comparison-v1.contract.ts`.

The comparison endpoint is:

`GET /api/funds/:fundId/scenario-sets/:scenarioSetId/comparison`

Current behavior:

- loads the latest `SCENARIOS` snapshot for the scenario set;
- supports `fee_profile` variants only;
- loads the authoritative `ECONOMICS` baseline for the scenario set's source
  config using `scenario_set_id IS NULL`;
- compares economics metrics such as LP IRR, GP IRR, management fees, carry,
  DPI, TVPI, and clawback;
- returns `unsupported_override_type` for `reserve_allocation`, `allocation`,
  and `sector_profile` scenario sets;
- returns `baseline_unavailable` when the authoritative economics baseline is
  missing.

The original publish-comparison contract remains scope-limited and is not
extended for scenario comparison.

### 6. Staleness vocabulary exists, but current producers are narrower

The scenario evidence vocabulary is:

| State           | Current implementation                                                                  |
| --------------- | --------------------------------------------------------------------------------------- |
| `CURRENT`       | Produced when scenario output matches the current published config version.             |
| `STALE_PUBLISH` | Produced or patched at read time when a newer published config exists.                  |
| `STALE_CONFIG`  | Preserved and ordered as higher priority, but no current producer proves entity checks. |
| `CALCULATING`   | Represented by async reserve calculation status/events.                                 |
| `FAILED`        | Represented by async reserve calculation failure events/status.                         |
| `UNAVAILABLE`   | Used for empty or unavailable scenario evidence states.                                 |

Do not document entity-reference validation as implemented until code exists
that checks current published config contents against scenario override
references.

### 7. Auth and audit are route-local

All fund-scenario routes in `server/routes/fund-scenario-sets.ts` attach
`requireAuth()` and `requireFundAccess` at the route. Scenario mutations also
record audit events through `fund_scenario_set_events`.

This corrects the original guardrail: the fund-results scenario surface does not
depend on mount-point-only authorization.

### 8. Forecast actuals are not scenario overrides

Forecast actuals are implemented on the dual-forecast surface, not on ADR-022
scenario overrides:

- `GET /api/funds/:fundId/dual-forecast` returns
  `sources.actual = 'actual_metrics_calculator'`;
- each dual-forecast point includes `actual` and `currentMode`;
- the as-of point is `currentMode: 'actual'` with actual metrics populated;
- future points use `currentMode: 'forecast'` with `actual: null`;
- the dashboard renders Actuals separately from the forward-looking Current
  Forecast series.

Scenario contracts should not be widened with forecast-mode or actuals fields
without a separate decision.

### 9. Cohort remains outside authoritative readiness

Current authoritative readiness is intentionally limited to reserve and pacing:

- `shared/contracts/fund-authoritative-calculations.contract.ts` marks `reserve`
  and `pacing` as `authoritative`;
- `cohort` is present in the catalog as `experimental`;
- `EXPECTED_SNAPSHOT_TYPES` is derived from authoritative snapshot types only;
- `COHORT` snapshots are visible as available snapshot types but do not make a
  fund `ready`;
- calc-run completion also filters to authoritative snapshot types and
  `scenario_set_id IS NULL`.

Do not add `COHORT` to authoritative readiness until there is evidence, backfill
planning, and result-contract support for that boundary.

## Consequences

### Positive

- Fund-results scenarios have a dedicated, fund-scoped abstraction rather than
  overloading company scenarios, allocation scenarios, or Monte Carlo matrices.
- Scenario outputs share the analytical snapshot store while preserving
  authoritative-read isolation.
- Scenario comparisons use their own contract and do not widen the
  publish-comparison contract.
- Reserve scenario calculation is asynchronous and observable through queue,
  event, snapshot, and status surfaces.
- Forecast actuals are represented explicitly on the dual-forecast surface
  without contaminating scenario contracts.
- Cohort remains experimental and cannot accidentally satisfy authoritative
  readiness.

### Current limitations

- Scenario comparison is fee-profile only.
- The calculation-status endpoint is reserve-async focused.
- `STALE_CONFIG` is contract-supported and preserved, but current calculation
  code does not prove override-entity reference validation.
- No apply-to-live-config route exists.
- Scenario results expose summaries in fund results; full payloads are available
  through scenario result endpoints.

## Alternatives Considered

### A. Separate `scenario_snapshots` table

Rejected. It would duplicate the analytical snapshot read pattern and split
scenario outputs away from ADR-014's `fund_snapshots` governance.

### B. Extend existing `scenarios` table with optional `fund_id`

Rejected. Existing scenarios are company/deal scoped. Adding optional fund scope
would overload semantics and contaminate query paths.

### C. Treat reserve allocation scenarios as the only scenario abstraction

Rejected. The existing allocation scenario lane models reserve planning,
drift/apply/sync, and IC decisions. Fund-results scenarios need published
config-derived analytical outputs across economics and reserve views.

### D. Extend `fund-results-comparison-v1.contract.ts`

Rejected. Scenario comparison now has its own contract and endpoint because the
publish-comparison contract is intentionally limited to current-vs-previous
published comparisons.

## References

- ADR-014: Snapshot Governance (`docs/adr/ADR-014-snapshot-governance.md`)
- ADR-020: Analysis Cohort Boundary
  (`docs/adr/ADR-020-analysis-cohort-boundary.md`)
- ADR-021: Runtime Authority (`docs/adr/ADR-021-runtime-authority.md`)
- ADR-013: Scenario Comparison Activation (Superseded)
- `shared/contracts/fund-scenario-sets-v1.contract.ts`
- `shared/contracts/fund-scenario-comparison-v1.contract.ts`
- `shared/contracts/fund-authoritative-calculations.contract.ts`
- `server/routes/fund-scenario-sets.ts`
- `server/services/fund-scenario-calculation-service.ts`
- `server/services/fund-scenario-reserve-calculation-service.ts`
- `server/services/fund-scenario-calculation-status-service.ts`
- `server/services/fund-scenario-comparison-service.ts`
- `server/services/fund-results-read-service.ts`
- `server/services/metrics-aggregator.ts`
- `client/src/components/fund-results/ScenarioSetsSummary.tsx`
- `client/src/components/fund-results/ScenarioComparisonTable.tsx`
