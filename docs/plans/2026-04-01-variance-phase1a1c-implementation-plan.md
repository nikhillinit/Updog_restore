---
status: IMPLEMENTED
last_updated: 2026-04-02
depends_on:
  - docs/plans/2026-03-31-variance-roadmap-revision.md
validated_by:
  - npx vitest run tests/unit/services/variance-tracking.test.ts
  - npx vitest run tests/unit/api/variance-tracking-api.test.ts
    tests/unit/shared/variance-validation.test.ts
  - npm run build
---

# Phase 1A.1c Detailed Plan: Portfolio Variance Model Completion

## Purpose

Record the `1A.1c` implementation slice that followed the current Phase 0 plus
`1A.2` automation work. This document now serves as both an execution record and
a limit/rollout note for the shipped variance model.

## Current Validated State

Validated from the repository by `2026-04-02`:

- `1A.1a` is complete in the route layer:
  - `POST /api/funds/:id/variance-reports` resolves default baselines when
    omitted
  - report rows are mapped to the client response shape
- `1A.1b` is effectively complete for variance tracking:
  - GET list/detail routes exist
  - the variance page reports tab fetches and renders live report data
- the repository already covered most of `Phase 0` and `1A.2` by the time this
  implementation landed:
  - calc-run completion handlers are registered at startup
  - attributed fund metrics are persisted per run
  - automated baseline creation is idempotent by `sourceRunId`
  - a migrated Postgres integration test proves repeated completion calls do not
    duplicate baselines or attributed KPI rows

## Implementation Result

Implemented by `2026-04-01` and now committed on `main`:

- request and query validation in `server/routes/variance.ts` now use shared
  schemas
- current client-facing report and dashboard response shapes now have explicit
  shared schemas, with `alertsBySeverity` as the canonical field and
  `alertsByseverity` still dual-emitted as a temporary compatibility alias
- `fund_baselines` now persist `companySnapshots`, with aligned SQL migrations
  in both migration streams
- baseline creation now captures full company snapshot rows, and company
  variance analysis prefers those snapshots while preserving the legacy
  `topPerformers` fallback
- reserve and pacing analysis now expose typed `metricDeltas` plus a fallback
  `changes` object for opaque keys
- the variance detail UI now renders company, sector, stage, reserve, and pacing
  analysis instead of only summary counts

Follow-up still intentionally left explicit:

- `valuationChange` remains alongside canonical `valuationVariance` as a
  temporary compatibility alias and should be retired once downstream consumers
  no longer depend on it
- automated calc-run baselines still capture portfolio composition from live
  state when no point-in-time portfolio source is available
- a follow-on on `2026-04-02` closed the top-level `/reports` placeholder debt,
  so the roadmap critical path has now moved to `1C.1` alert evaluation
  architecture

## Historical Sandbox Findings

These findings drove the implementation order. The first group is now resolved
by the shipped `1A.1c` work; the second group remains relevant as rollout or
follow-on limitations.

### Resolved By Implementation

1. Full company variance required a persisted baseline shape beyond
   `topPerformers`. This is now addressed by `companySnapshots`, while legacy
   baselines intentionally fall back to `topPerformers`.

2. Reserve and pacing variance could not stay as only generic JSON diffs if the
   detail UI was expected to surface real drift. This is now addressed for known
   metrics via typed `metricDeltas`, while `changes` remains as an escape hatch
   for opaque keys.

3. Shared validation lagged the live service output and the route layer still
   maintained request/query schemas inline. This is now addressed by shared
   request/query schemas, explicit current-route response schemas, signed
   variance validation, and temporary compatibility aliases where needed.

4. The report detail UI did not surface the richer analysis payload. This is now
   addressed in the variance detail sheet for company, sector, stage, reserve,
   and pacing analysis.

### Still-Relevant Limitations

1. Full company variance is not possible from the persisted baseline shape for
   legacy baselines that only stored `topPerformers`. Those baselines
   intentionally remain degraded and do not support full matched/added/removed
   classification.

2. Automated baselines are KPI-attributed to a calc run, but portfolio
   composition is still read live during baseline creation. Without a linked
   point-in-time portfolio source, full baseline company snapshots can drift
   from the run-attributed metrics they are meant to represent.

3. Sector and stage variance currently compare raw counts only. A normalized
   count-share view is feasible and validated in the sandbox spike, but that is
   still not the same thing as capital-weighted or valuation-weighted allocation
   drift.

4. Historical report generation intentionally omits portfolio, reserve, and
   pacing sub-analysis because point-in-time company and snapshot reads are not
   yet available. This is correct behavior and should remain explicit.

5. The existing API tests mock the variance service. They are useful route
   tests, but they do not prove the real service output is compatible with the
   route mapper or client contract.

6. Added/removed company classification implicitly assumes the identity used at
   baseline capture remains stable across later reads. That assumption must be
   made explicit in the snapshot shape and rollout notes.

7. `alertsBySeverity` is now canonical, but `alertsByseverity` remains
   dual-emitted as a temporary compatibility alias. Treat that alias as debt to
   retire, not a second long-term contract.

## Scope

This plan covers `1A.1c` only:

- current portfolio metrics
- company variances
- sector variances
- stage variances
- reserve variances
- pacing variances

This plan does not include:

- alert scheduling or automatic alert evaluation architecture (`1C.1`)
- Time Machine snapshot ADR work
- broad redesign of the reports page outside the variance surface

## Target Outcome

Ship a richer variance model that:

- preserves the existing report API surface used by the current client
- expands sub-analysis for current-state reports
- remains honest about missing historical point-in-time coverage
- is backward compatible with legacy baselines that only have `topPerformers`
- makes count-based drift versus capital-weighted drift explicit instead of
  collapsing them into one ambiguous "weight" concept
- keeps any compatibility aliases explicitly transitional instead of letting
  duplicated field semantics harden into the contract

## Original Implementation Order

Retained as a historical record of the shipped execution sequence.

### 1. Request And Query Contract Adoption

Files:

- `shared/variance-validation.ts`
- `server/routes/variance.ts`
- `tests/unit/api/variance-tracking-api.test.ts`

Work:

- retire route-local validation/schema duplication in
  `server/routes/variance.ts` for request bodies and query strings so the shared
  validation file becomes the source of truth for inputs first
- use signed decimal validation for variances and thresholds while keeping
  non-negative decimal validation for stored metric fields
- add route coverage for the behavior the shared schemas newly enforce:
  - baseline `periodEnd > periodStart`
  - `between` alert rules require `secondaryThreshold`
  - invalid baseline and alert query parameters fail at the route boundary
- keep the current response shapes unchanged in this slice; do not mix response
  contract extraction into the request/query adoption work

Acceptance:

- route handlers no longer maintain a second, drifting copy of the core request
  and query contracts
- baseline period ordering, `between` operator requirements, and malformed query
  params are validated consistently at the route boundary
- no client breakage for existing summary cards or report-detail rendering

### 2. Current Route Response Contract Extraction

Files:

- `shared/variance-validation.ts`
- `server/routes/variance.ts`
- `client/src/hooks/useVarianceData.ts`
- `tests/unit/api/variance-tracking-api.test.ts`
- `tests/unit/shared/variance-validation.test.ts`

Work:

- add dedicated shared schemas for the current client-facing response contracts
  instead of trying to reuse the db-style `VarianceReportResponseSchema`
- explicitly model the transformed report payload returned by `toClientReport`
- explicitly model the current dashboard payload, including the casing decision
  for `alertsByseverity` versus `alertsBySeverity`
- decide whether dashboard casing is handled by:
  - dual-emitting both names temporarily in the route
  - normalizing to one canonical name in the client hook
  - or introducing a compatibility parser that accepts the legacy field while
    emitting a canonical internal shape
- add mapper or contract tests that prove the route outputs match the new
  current-route shared schemas
- keep the snapshot-dependent company variance response details transitional in
  this slice; do not finalize them before `companySnapshots` is real

Acceptance:

- the current client-facing report and dashboard payloads have explicit shared
  schemas instead of relying on db-row shapes or aspirational placeholders
- dashboard naming drift is resolved or intentionally normalized behind one
  compatibility layer
- route/client response contracts are tested without requiring the full
  snapshot-dependent feature work to land first

### 3. Baseline Snapshot Expansion

Files:

- `shared/schema.ts`
- `schema/src/tables.ts`
- `server/services/variance-tracking.ts`
- `migrations/*`
- `server/migrations/*`

Work:

- add a new baseline field for a full company snapshot, for example
  `companySnapshots`
- make this slice the gate for turning the spike's `full_snapshot` path from
  proof-only logic into a production-reachable path
- decide the baseline snapshot source for automated baselines:
  - prefer a run-linked point-in-time snapshot when available
  - otherwise capture immediately from live portfolio state and document the
    temporary consistency limitation
- persist one row per portfolio company at baseline creation with at least:
  - `portfolioCompanyId`
  - `companyId`
  - `companyName`
  - `sector`
  - `stage`
  - `status`
  - `investedCapital`
  - `currentValuation`
- keep `topPerformers` for summary use and backward compatibility
- do not add a JSONB index for `companySnapshots` by default; accept TOASTed row
  storage unless an actual query pattern justifies more complexity
- treat legacy baselines with null `companySnapshots` as supported but degraded

Acceptance:

- new baselines capture a full company comparison source
- automated baselines have a defined consistency story relative to `sourceRunId`
- the `full_snapshot` company-classification path is now production-reachable
- old baselines still generate reports using the current fallback behavior
- migrations in the authoritative schema stream and runtime stream stay aligned

### 4. Snapshot-Dependent Contract Finalization And Variance Engine Expansion

Files:

- `server/services/variance-tracking.ts`
- `shared/variance-validation.ts`
- `server/routes/variance.ts`
- `tests/unit/services/variance-tracking.test.ts`

Work:

- define the canonical shape for:
  - company variance rows
  - sector and stage distribution variance rows
  - reserve and pacing variance payloads
- refactor company variance analysis to:
  - prefer full `companySnapshots` when present
  - fall back to legacy `topPerformers` when not present
  - classify companies as matched, added, or removed when full baseline data is
    available
  - compare against an explicit persisted identity field instead of relying on
    an unstated matching convention
  - designate a single canonical field name for the long-term contract
    (`valuationVariance` or `valuationChange`)
  - if a compatibility alias is required, keep it explicitly temporary and block
    new consumers from depending on both names indefinitely
- enrich sector and stage variance with both:
  - count delta
  - normalized count-share delta
- do not label count-share fields as allocation weights unless they are derived
  from capital or valuation totals
- either populate `currentInvestedCapital` from live investment reads or remove
  it from the transitional response shape so the field is not permanently null
- replace reserve and pacing generic diffs with typed numeric deltas where the
  underlying payload is known, while preserving an escape hatch for opaque keys
- keep historical report behavior unchanged until point-in-time portfolio
  snapshots exist

Acceptance:

- current-state reports contain materially richer portfolio analysis
- the duplicated `valuationChange` / `valuationVariance` semantics have a clear
  deprecation path instead of remaining open-ended
- legacy baselines do not regress
- historical reports still omit unsupported sub-analysis and remain explicit

### 5. Route And UI Consumption

Files:

- `server/routes/variance.ts`
- `client/src/pages/variance-tracking.tsx`

Work:

- surface the richer company and distribution analysis through the existing
  report detail view
- keep current summary cards intact
- add small UI affordances for:
  - matched versus added versus removed companies
  - count drift versus count-share drift
  - reserve and pacing metric deltas
- render the actual analysis payloads, not just aggregate counts, so users can
  inspect company rows and changed reserve/pacing keys directly
- preserve the historical-coverage notice already shown in the detail sheet

Acceptance:

- the detail sheet renders richer portfolio insight without a breaking redesign
- historical notices remain visible when supplemental analysis is unavailable

### 6. Validation And Rollout

Work:

- add contract-level tests that prove:
  - shared validation accepts the real route response shape
  - route/client naming stays aligned for variance report detail and dashboard
- add focused unit coverage for:
  - legacy baseline fallback
  - full company snapshot comparison
  - added and removed company classification
  - sector and stage count-share drift
  - reserve and pacing typed metric deltas
- add shared-schema validation coverage for negative variance values and the
  richer company variance row shape
- add UI coverage for the report detail sheet once richer payload rendering is
  introduced
- add at least one integration path once the schema work is done:
  - create baseline with full company snapshot
  - mutate portfolio state
  - generate current-state report
  - verify company plus sector plus stage analyses reflect the change
- document two explicit limitations in rollout notes and product copy:
  - automated calc-run baselines may still read live portfolio state until a
    linked point-in-time portfolio source exists
  - historical portfolio/reserve/pacing analysis remains unavailable unless the
    roadmap adopts point-in-time portfolio snapshots for this surface

Acceptance:

- focused unit tests pass
- contract tests cover the real service output or mapper boundary, not only
  mocked service calls
- integration proof covers the new baseline snapshot dependency

## Original Delivery Slices

1. Request and query shared-schema adoption in the route layer.
2. Current route response contract extraction for reports and dashboard
   payloads.
3. Baseline `companySnapshots` schema and capture path.
4. Snapshot-dependent company variance contract finalization and engine
   expansion.
5. Sector and stage count-share expansion.
6. Reserve and pacing typed-delta cleanup.
7. Detail-sheet UI enrichment and contract/UI coverage.
8. Final integration proof plus rollout limitation notes.

## Risks

- the migration stream must stay unified with the new Phase 0 work already in
  flight
- backfilling company snapshots for old baselines is optional, so the code must
  preserve legacy fallback behavior
- automated baseline snapshots can disagree with run-attributed KPIs unless the
  source-of-truth is defined explicitly
- full `companySnapshots` payloads will likely TOAST baseline rows; monitor read
  paths before adding indexing or more storage complexity
- if `portfolioCompanies.id` is ever recreated during imports or reseeds, the
  add/remove classifier will treat the company as changed identity; rollout
  notes must document that limitation unless a stronger key is introduced
- reserve and pacing payloads may not be structurally uniform enough to fully
  type in one pass
- count-share drift can be mistaken for capital-weighted allocation drift if the
  field names and UI copy are sloppy
- historical portfolio variance remains blocked on point-in-time snapshot
  storage and should not be hand-waved into current-state reads; if the roadmap
  does not add that capability, treat the degraded historical view as an
  explicit long-term limitation

## Sandbox Validation Strategy

Validate the plan before the full migration by landing backward-compatible
spikes that prove three key assumptions:

1. Request and query shared-schema adoption can land first without forcing a
   client response rewrite.
2. Company variance can support a future full-snapshot source without breaking
   the current top-performer fallback.
3. Sector and stage variance can expose normalized count-share drift in addition
   to raw count deltas without breaking the current route or client contracts.

This spike does not validate:

- full response-schema alignment for transformed report and dashboard payloads
- migration execution
- client rendering of the richer payloads
- automated baseline consistency versus run-attributed KPIs
- production reachability of the `full_snapshot` company-classification path

## Sandbox Validation Result

Validated by the implementation spike in this working tree:

- route request and query validation now run through the shared variance schemas
  instead of route-local copies
- the request/query slice proved real behavior changes worth keeping:
  - reversed baseline periods are rejected at the route boundary
  - `between` alert rules without `secondaryThreshold` are rejected
  - invalid baseline and alert query params no longer leak through to the
    service layer
- company variance logic now supports a richer baseline snapshot shape while
  preserving the legacy fallback path
- sector and stage variance can be expanded with normalized count-share fields
  without route or client changes
- shared variance validation now accepts negative deltas and richer company
  variance rows
- shared-schema tests now also prove the current report and dashboard response
  schemas are not direct replacements for the live route payloads, so response
  contract extraction needs its own slice
- this remains a proof step, not a claim that full-snapshot company
  classification is live before the schema/capture slice ships
- focused validation passed through:
  - `npx vitest run tests/unit/services/variance-tracking.test.ts`
  - `npx vitest run tests/unit/api/variance-tracking-api.test.ts tests/unit/shared/variance-validation.test.ts`
  - `npm run build`
