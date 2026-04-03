---
last_updated: 2026-04-03
---

# Phase 2B Execution Spec: Lifecycle And Authoritative Read Fields

## Context

Phase 2A is already in place on the authoritative `registerRoutes()` runtime.

Authoritative parent plan:

- `docs/plans/2026-03-20-contract-integrity-final-counterproposal.md`

Phase 2A assets already present:

- `shared/schema/fund.ts` now defines `fundConfigs`, `calcRuns`, and attributed
  `fundSnapshots`
- `server/services/fund-persistence-service.ts` publishes drafts and creates
  `calc_runs`
- `server/routes/fund-config.ts` exposes draft, publish, and reserve-snapshot
  routes
- `tests/unit/phase2a/config-invariants.test.ts`
- `tests/unit/phase2a/calc-runs-publish.test.ts`
- existing route-harness patterns already live in `tests/unit/contract/*` and
  `tests/integration/fund-draft-round-trip.test.ts`

This batch is the read-side follow-through for that write model. It must make
state ownership explicit before Phase 3 introduces the canonical server-backed
results endpoint.

## Goal

Define truthful lifecycle fields and an authoritative read-state contract
without collapsing config publication state into calculation state and without
widening into the full Phase 3 results read model.

Concretely, this batch must:

- keep config lifecycle sourced from `fundConfigs`
- keep calculation lifecycle derived by default from `calc_runs` plus
  authoritative snapshots
- expose one explicit lifecycle/read-state contract for API and UI consumers
- demote `funds.engineResults` to legacy compatibility only
- avoid any fake "ready" signal that is not backed by persisted state

## Current Repo Facts That Must Shape The Batch

1. `fundConfigs` already persists `version`, `isDraft`, `isPublished`,
   `publishedAt`, `createdAt`, and `updatedAt`.
2. `calcRuns` currently tracks dispatch evidence, not full completion truth:
   `dispatchState`, `requestedAt`, `dispatchedAt`, `completedAt`, `failedAt`,
   and `lastError`.
3. Workers currently write `fundSnapshots` with `runId`, `configId`, and
   `configVersion`, but they do not currently mark `calc_runs.completedAt`.
4. `reserve-worker.ts` fetches the published config head but does not yet use
   the full draft config as the effective engine input. `pacing-worker.ts`
   currently derives from the legacy fund row, and `cohort-worker.ts` is still
   mock-only and does not write authoritative snapshots.
5. `server/routes/fund-config.ts` still returns raw draft rows and raw reserve
   snapshot payloads; it does not expose a consolidated lifecycle/read-state
   view.
6. Inline `GET /api/funds` and `GET /api/funds/:id` still ride the legacy
   `server/storage.ts` CRUD surface.
7. `client/src/pages/fund-model-results.tsx` still reads `sessionStorage` and
   fabricates fallback outputs. That is Phase 3, not this batch.
8. `server/routes/funds.ts` and `server/storage.ts` still expose `engineResults`
   on older contracts. Those contracts may remain for compatibility during this
   batch, but they are not allowed to become the new authoritative read source.
9. The default server-test database mock currently exposes `fundSnapshots`, but
   not `fundConfigs` or `calcRuns`, so new route tests cannot assume the
   existing mock supports lifecycle derivation without explicit extension.

## Owned Files

- `shared/schema/fund.ts`
- `server/routes/fund-config.ts`
- `shared/contracts/fund-state-read-v1.contract.ts` (new)
- `server/services/fund-state-read-service.ts` (new)
- `tests/unit/phase2b/lifecycle-derivation.test.ts` (new)
- `tests/unit/phase2b/fund-state-contract.test.ts` (new)
- `tests/unit/contract/fund-state-route.test.ts` (new)
- `tests/integration/fund-state-readback.test.ts` (new or equivalent focused
  integration test)

Conditionally touched only if a chosen harness requires it:

- `tests/helpers/database-mock.ts`

Do not put `server/storage.ts` on the critical path for this batch unless a new
finding proves it unavoidable.

## Out Of Scope

- `client/src/pages/fund-model-results.tsx`
- `server/routes.ts` route-topology changes
- `server/routes/funds.ts` create-contract redesign
- removing the `funds.engineResults` column
- inventing a dedicated results projection before Phase 3 proves it is needed
- Vercel parity or `server/app.ts` parity
- worker refactors unrelated to lifecycle truth

If the batch appears to require those changes, stop and amend the parent plan
instead of widening Phase 2B.

## Core Decisions For Phase 2B

### 1. Preserve Two Explicit Axes

Do not flatten lifecycle into one enum.

Use:

- config lifecycle from persisted config state
- calculation lifecycle from run and snapshot evidence

`funds.status` remains a separate legacy fund-row field and must not be reused
as either config lifecycle or calculation lifecycle.

### 2. Treat `calcRuns.dispatchState` As Dispatch Evidence, Not Completion Truth

For this batch:

- `pending` means submitted but not dispatched
- `dispatched` and `partial` mean work has been handed off but completion must
  still be proven by authoritative snapshot evidence
- `failed` may contribute to derived calculation failure state

Do not use `calcRuns.completedAt` as an authoritative field in this batch unless
workers are updated in the same batch to own it truthfully.

### 3. Derive `lastCalculatedAt` From Snapshots

`lastCalculatedAt` must come from the latest authoritative
`fund_snapshots.snapshot_time` for the active config version, with `created_at`
only as a legacy fallback if needed.

Do not derive it from:

- `funds.engineResults`
- `calcRuns.requestedAt`
- `calcRuns.dispatchedAt`
- `calcRuns.completedAt` unless worker ownership is added and proven

### 4. Demote `funds.engineResults` To Legacy Compatibility Only

Rules for this batch:

- it may remain present on old response shapes
- it may remain as transitional write-through data if still needed by older
  create flows
- it is forbidden as the source of any new lifecycle/read-state field
- new tests must prove the new read contract can be computed without reading it

### 5. Add One Explicit Read-State Contract

Introduce one boundary-specific contract for state reads rather than spreading
derived lifecycle logic across route handlers.

Recommended new module:

- `shared/contracts/fund-state-read-v1.contract.ts`

Recommended route surface:

- `GET /api/funds/:id/state`

This endpoint is intentionally narrower than Phase 3 results. It exists to make
state truthful before the richer results DTO is added.

### 6. Ready Must Be Based On Current Snapshot Coverage, Not Blind Engine Dispatch

Do not derive `ready` from `calcRuns.engines` alone.

For this batch, the service should define an explicit `expectedSnapshotTypes`
set for the currently authoritative snapshot-producing engines. Based on the
current implementation, that set should default to:

- `RESERVE`
- `PACING`

Do not require `COHORT` for `ready` until the cohort path produces authoritative
snapshot rows.

### 7. Ready Is Orchestration Truth, Not Full Model-Fidelity Truth

Because current workers do not yet consume the full published config uniformly,
Phase 2B must not use `ready` to claim that every wizard field has influenced
every engine output.

In this batch, `ready` means:

- authoritative snapshot evidence exists for the currently supported snapshot
  coverage set
- the snapshots are attributed to the published config version
- there is no newer in-flight or failed run that invalidates that evidence

It does not yet mean:

- all draft fields are consumed end to end by all engines
- cohort outputs are authoritative
- the Phase 3 results model is complete

## Canonical Read-State Shape

The exact TypeScript shape may vary, but the contract should follow this
structure closely:

```ts
{
  fundId: number;
  configState: {
    latestVersion: number | null;
    draftVersion: number | null;
    publishedVersion: number | null;
    hasDraft: boolean;
    hasPublished: boolean;
    publishedAt: string | null;
    draftUpdatedAt: string | null;
    publishedUpdatedAt: string | null;
  };
  calculationState: {
    status: 'not_requested' | 'submitted' | 'calculating' | 'ready' | 'failed';
    configVersion: number | null;
    runId: number | null;
    correlationId: string | null;
    dispatchState: 'pending' | 'dispatched' | 'partial' | 'failed' | null;
    availableSnapshotTypes: string[];
    expectedSnapshotTypes: string[];
    lastCalculatedAt: string | null;
    lastError: string | null;
  };
  legacy: {
    engineResultsPresent: boolean;
  };
}
```

Important rules:

- keep config and calculation objects separate
- keep evidence fields visible enough to debug status derivation
- do not return `engineResults` as a first-class state field
- do not claim results completeness that the repo cannot prove yet

## Derivation Contract

Phase 2B should default to a derived calculation lifecycle using the published
config head plus matching `calc_runs` and `fund_snapshots` evidence.

Recommended derivation rules for the published config version:

1. No published config:
   - `configState.hasPublished = false`
   - `calculationState.status = 'not_requested'`

2. Published config exists, but no `calc_runs` row exists for that published
   version:
   - `calculationState.status = 'not_requested'`

3. Latest matching run has `dispatchState = 'pending'`:
   - `calculationState.status = 'submitted'`

4. Latest matching run has `dispatchState = 'dispatched'` or `partial`, and no
   authoritative snapshot evidence exists yet for that config version:
   - `calculationState.status = 'calculating'`

5. Define the current authoritative snapshot coverage set explicitly:
   - default `expectedSnapshotTypes = ['RESERVE', 'PACING']`
   - do not derive this set from `calcRuns.engines`
   - do not include `COHORT` until cohort writes authoritative snapshots

6. Authoritative snapshots exist for that config version:
   - treat snapshots with `configVersion = null` as legacy evidence only
   - do not let null-attribution snapshots satisfy `ready` for a published
     config version
   - populate `availableSnapshotTypes`
   - populate `expectedSnapshotTypes`
   - populate `lastCalculatedAt`
   - if the expected snapshot coverage set is satisfied and there is no newer
     failed/pending/dispatched run for the same published version that would
     invalidate the snapshot evidence, set `calculationState.status = 'ready'`

7. Latest matching run has `dispatchState = 'failed'` and there is no newer
   authoritative snapshot for the same published version:
   - `calculationState.status = 'failed'`

8. If evidence is mixed, coverage is partial, or snapshot attribution exists but
   does not satisfy the expected snapshot set, prefer truthful partial progress
   over a false-ready signal:
   - keep `status = 'calculating'`
   - expose `availableSnapshotTypes`
   - expose `expectedSnapshotTypes`
   - expose `dispatchState`

This batch should not add a persisted calculation-lifecycle column unless the
derived model proves insufficient during implementation and that insufficiency
is documented with a concrete failing case.

## Field Ownership Table

The implementation batch should add this as a committed artifact, either in the
Phase 2B doc itself or in a dedicated evidence file.

Minimum table:

| Field or concept                    | Owner           | Authority                       | Notes                                                                  |
| ----------------------------------- | --------------- | ------------------------------- | ---------------------------------------------------------------------- |
| `funds.status`                      | base fund row   | legacy only                     | not config lifecycle, not calculation lifecycle                        |
| `fundConfigs.version`               | config store    | authoritative                   | version identity for draft/published config                            |
| `fundConfigs.isDraft`               | config store    | authoritative                   | draft axis only                                                        |
| `fundConfigs.isPublished`           | config store    | authoritative                   | published head only                                                    |
| `fundConfigs.publishedAt`           | config store    | authoritative                   | publish timestamp only                                                 |
| `calcRuns.dispatchState`            | calc run store  | authoritative dispatch evidence | not full completion truth                                              |
| `calcRuns.engines`                  | calc run store  | intended dispatch set only      | do not use as the ready coverage set while cohort is non-authoritative |
| `calcRuns.requestedAt`              | calc run store  | authoritative dispatch evidence | supports submitted state                                               |
| `calcRuns.failedAt` and `lastError` | calc run store  | authoritative failure evidence  | supports failed state                                                  |
| `fundSnapshots.type`                | snapshot store  | authoritative read evidence     | identifies available outputs                                           |
| `fundSnapshots.configVersion`       | snapshot store  | authoritative read evidence     | binds outputs to config version                                        |
| `fundSnapshots.snapshotTime`        | snapshot store  | authoritative read evidence     | primary source of `lastCalculatedAt`                                   |
| `fundSnapshots.createdAt`           | snapshot store  | legacy fallback evidence        | fallback only if `snapshotTime` is unusable                            |
| `funds.engineResults`               | legacy fund row | compatibility only              | forbidden for new authoritative reads                                  |

## Task 1: Add The Read-State Contract

Create `shared/contracts/fund-state-read-v1.contract.ts`.

Required work:

- define the v1 response DTO
- keep it boundary-specific; do not overload generic shared types
- encode the two-axis model explicitly
- mark legacy compatibility fields clearly

Do not:

- merge config state, run state, and results payload into one universal type
- expose `engineResults` as authoritative output

## Task 2: Add A Dedicated Read-Service

Create `server/services/fund-state-read-service.ts`.

Responsibilities:

- load the latest draft and published config heads
- load the latest matching calc run for the published config version
- load matching authoritative snapshots for that config version
- derive `configState`
- derive `calculationState`
- return one DTO-shaped object for route use

Rules:

- centralize derivation logic here instead of repeating it in routes
- ignore `funds.engineResults` for status derivation
- prefer a DB-backed implementation over reusing `server/storage.ts`
- define `expectedSnapshotTypes` explicitly from current authoritative
  snapshot-producing engines instead of reusing `calcRuns.engines`
- order matching runs deterministically, for example by `requestedAt DESC`, then
  `id DESC`, so retry and republish behavior is stable

## Task 3: Expose One Narrow Read Endpoint

In `server/routes/fund-config.ts`, add:

- `GET /api/funds/:id/state`

Behavior:

- `200` with `FundStateReadV1` when the fund exists
- `404` when the fund does not exist
- `400` for invalid fund ID
- `500` for unexpected failures

Keep existing route behavior stable:

- `GET /api/funds/:id/draft` remains a draft route, not the new lifecycle route
- `GET /api/funds/:id/reserves` remains a reserve payload route for now

Optional additive change only if it is low-risk and clearly useful:

- include a nested `state` object in publish responses

Do not break the current publish response contract to do this.

## Task 4: Use The Right Test Split For Current Repo Constraints

Default approach:

- keep lifecycle derivation logic unit-testable as a pure function or narrowly
  mocked service
- keep the route contract test in the server unit project by mocking the new
  read-service, not by depending on the default DB delegate
- keep one focused DB-backed integration test for end-to-end readback evidence

Reason:

- the existing server-test database mock does not currently model `fundConfigs`
  or `calcRuns`
- forcing `server/storage.ts` parity would widen the batch in the wrong layer

If route-level unit tests need DB-style behavior:

- extend `tests/helpers/database-mock.ts` explicitly with `fundConfigs` and
  `calcRuns`
- keep that extension minimal and local to the lifecycle path
- do not use `server/storage.ts` as an adapter layer for lifecycle state

## Task 5: Add A Focused Test Matrix

Required tests:

1. Unit: lifecycle derivation matrix
   - no published config -> `not_requested`
   - published config, no run -> `not_requested`
   - pending run -> `submitted`
   - dispatched run, no snapshot -> `calculating`
   - snapshot present for active config -> `ready`
   - failed run, no newer snapshot -> `failed`
   - mixed/partial evidence -> stays `calculating`

2. Unit: contract shape
   - `FundStateReadV1` validates expected output
   - unknown keys rejected if the schema is strict

3. Route contract test
   - `GET /api/funds/:id/state` returns the two-axis structure
   - invalid ID and missing fund behavior is explicit
   - prefer mocking `fund-state-read-service` in this test unless the DB mock is
     explicitly extended

4. Focused integration test
   - publish draft
   - simulate or seed attributed snapshots for the published version
   - confirm state readback changes from submitted/calculating to ready only
     when the expected snapshot coverage set is satisfied
   - confirm `lastCalculatedAt` comes from snapshot timestamps, not
     `engineResults`

5. Regression proof
   - new state derivation still passes when `funds.engineResults` is null
   - new state derivation ignores stale `engineResults` when snapshots disagree
   - new state derivation does not wait on `COHORT` while cohort remains
     non-authoritative

## Validation

### Per-Batch Gates

1. Targeted tests:

```bash
npx vitest run tests/unit/phase2b/lifecycle-derivation.test.ts tests/unit/phase2b/fund-state-contract.test.ts tests/unit/contract/fund-state-route.test.ts --project=server
```

2. Focused integration readback:

```bash
npx vitest run -c vitest.config.int.ts tests/integration/fund-state-readback.test.ts
```

3. Touched-file no-cache ESLint:

```bash
npx eslint shared/contracts/fund-state-read-v1.contract.ts server/services/fund-state-read-service.ts server/routes/fund-config.ts tests/unit/phase2b/lifecycle-derivation.test.ts tests/unit/phase2b/fund-state-contract.test.ts tests/unit/contract/fund-state-route.test.ts tests/integration/fund-state-readback.test.ts --no-cache
```

4. Guardrails:

```bash
npm run guardrails:check
```

### Integration Checkpoint

Run after the batch is green:

```bash
npm run test:unit --changed
npm run baseline:progress
npm run lint:eslint
```

### Schema Guard

Before sign-off, run the same schema-drift review discipline the parent plan
called for at Phase 2B exit. In particular:

- keep `shared/schema/fund.ts`, any migration changes, fixtures, and new read
  contracts aligned
- do not add lifecycle persistence fields without a matching ownership note and
  migration plan

## Exit Criteria

- config lifecycle and calculation lifecycle are explicit and non-conflated
- one explicit `FundStateReadV1` contract exists
- `GET /api/funds/:id/state` exposes truthful lifecycle/read-state data
- `expectedSnapshotTypes` is explicit and reflects current authoritative
  snapshot-producing engines
- `lastCalculatedAt` is derived from authoritative snapshot timestamps
- `funds.engineResults` is not used as the source of any new authoritative
  lifecycle/read field
- field ownership is documented explicitly
- mixed snapshot/run evidence or partial snapshot coverage yields truthful
  in-progress or failed state rather than a fabricated ready state

## Rollback Rule

Revert the batch if any of the following happen:

- lifecycle state still conflates config publication with calculation status
- the new state endpoint depends on `funds.engineResults` for truth
- `ready` can be returned without matching persisted snapshot evidence
- the batch requires Phase 3 results-page or route-topology work to function
- `server/storage.ts` has to absorb broad new lifecycle responsibilities to make
  the batch pass

## Deferred Follow-On

Do not fold these into Phase 2B:

- server-backed `GET /api/funds/:id/results` response modeling
- removal of session-storage truth from
  `client/src/pages/fund-model-results.tsx`
- deletion of legacy `engineResults` from old contracts
- route normalization for inline `GET /api/funds` and `GET /api/funds/:id`
- worker completion-state refactors unless they are proven necessary to keep the
  derived lifecycle truthful
- engine-input fidelity cleanup so reserve/pacing/cohort all derive directly and
  uniformly from the published config
