# Phase 3 Execution Spec: Results Read Model And Truthfulness

## Context

Authoritative parent plan:

- `docs/plans/2026-03-20-contract-integrity-final-counterproposal.md`

Phase 2B read-side groundwork already present:

- `shared/contracts/fund-state-read-v1.contract.ts`
- `server/services/fund-state-read-service.ts`
- `server/services/fund-state-derivation.ts`
- `server/routes/fund-config.ts` exposes `GET /api/funds/:id/state`
- `tests/unit/contract/fund-state-route.test.ts`
- `tests/integration/fund-state-readback.test.ts`

This spec expands only Phase 3. It does not reopen Phase 0-2 decisions and it
does not pull Phase 4 normalization forward.

## Goal

Cut the results page over from session-backed reconstruction to one truthful,
server-backed read model at `GET /api/funds/:id/results`, using persisted fund
state plus authoritative `fund_snapshots` by default.

The phase is complete only when:

- results reload from persisted state, not `sessionStorage`
- page sections render only data the server can prove
- unavailable sections render explicit incomplete state instead of placeholders
- the wizard redirects to a concrete fund results route, not `/latest`
- sandboxed tests prove refresh/readback behavior and guard against regression

## Current Repo Facts That Must Shape Phase 3

1. `client/src/pages/fund-model-results.tsx` currently reads:
   - `sessionStorage.getItem(\`engine-results-\${fundId}\`)`
   - `sessionStorage.getItem('wizard-completion-data')` and then fabricates
     fallback scorecard, reserve allocation, and scenario values.
2. `client/src/components/modeling-wizard/ModelingWizard.tsx` currently stores
   `wizard-completion-data` in session storage and redirects to
   `/fund-model-results/latest` instead of a persisted fund ID.
3. `client/src/machines/modeling-wizard.machine.ts` submits directly to
   `POST /api/funds`, which already returns `data.id` on success.
4. There is no `server/routes/fund-results.ts` yet, and no
   `GET /api/funds/:id/results` route mounted anywhere.
5. `fundSnapshots` currently has authoritative writers for:
   - `RESERVE` via `workers/reserve-worker.ts`
   - `PACING` via `workers/pacing-worker.ts`
6. `workers/cohort-worker.ts` is still mock-only and does not persist
   authoritative cohort snapshots.
7. Current authoritative snapshot payloads do not contain enough fields to
   truthfully reconstruct the existing UI sections:
   - no authoritative MOIC scorecard field
   - no authoritative reserve-ratio percentage in results-page shape
   - no authoritative optimistic/pessimistic scenario table
   - no authoritative waterfall distribution block
8. `server/services/projected-metrics-calculator.ts` can derive richer metrics,
   but today it still depends on client engine imports and non-snapshot
   calculation paths. That makes it an optional projection candidate only after
   the gap is explicitly recorded, not the default Phase 3 source.
9. Existing validation primitives are already available and should be reused:
   - `createSandbox()` in `tests/setup/test-infrastructure.ts`
   - inline Express + `supertest` contract harnesses
   - `createWouterWrapper()` in `tests/utils/withWouter.tsx`
10. The XState machine's `submitting.onDone` transition
    (`modeling-wizard.machine.ts:1256`) discards the `POST /api/funds` response.
    Actions `['clearProgress', 'clearSubmissionError']` run but neither captures
    `event.output.data.id` into context. The `onComplete` callback
    (`useModelingWizard.ts:135`) passes full `ModelingWizardContext` -- so
    adding `createdFundId` to context is sufficient for the wizard component to
    read it. The hook surface does not need changing.
11. The existing snapshot query in `fund-config.ts:297` does NOT filter by
    `configVersion`. It fetches the latest snapshot by `createdAt` regardless of
    which config version produced it. After a republish, this would serve a
    stale snapshot from the prior config version.

## Out Of Scope

- removing `funds.engineResults`
- Phase 4 route dedupe and boundary-cleanup work
- making cohort or waterfall authoritative if no persisted source exists yet
- inventing client-only scenario math to preserve the current cards
- broad worker refactors unless a narrow snapshot gap is proven and approved

If Phase 3 appears to require broad worker normalization, stop and amend the
parent plan instead of silently widening this batch.

## Phase 3 Decisions

### 1. Canonical results route

Phase 3 owns one new canonical read path:

- `GET /api/funds/:id/results`

Mount it on the current authoritative runtime alongside the other fund-config
read routes first. Extraction to `server/routes/fund-results.ts` is allowed in
this phase only if it stays read-only and does not become route-normalization
work.

### 2. Concrete fund ID handoff is mandatory

`/fund-model-results/latest` is not an acceptable authoritative read path.

The client must redirect to `/fund-model-results/:fundId` using the persisted ID
returned by `POST /api/funds`. This requires an XState machine schema change
(see Repo Fact #10):

1. Add `createdFundId: number | null` to `ModelingWizardContext`
2. Add `assignCreatedFundId` action:
   `assign({ createdFundId: ({ event }) => event.output.data.id })`
3. Add action to `submitting.onDone.actions` array
4. In `ModelingWizard.tsx`, read `data.context.createdFundId` (the hook already
   forwards context via `onComplete`) and navigate to
   `/fund-model-results/${createdFundId}`
5. Remove the `sessionStorage.setItem('wizard-completion-data', ...)` write
6. If `fundId === 'latest'` on the results page, show an error state directing
   the user back to `/fund-setup` (no server-side "latest fund" resolution
   exists)

Session storage may still carry transient UX state if needed, but not routing
truth and not results truth.

### 3. Response contract must support truthful incompleteness

Use one versioned contract file consistent with existing repo naming:

- `shared/contracts/fund-results-v1.contract.ts`

The contract must be a discriminated union with at least:

- `status: 'pending' | 'calculating' | 'ready' | 'failed'`
- stable fund identity block
- lifecycle/readback evidence block
- per-section availability so the UI can show what is present and what is not

Do not make every section required in the `ready` state unless the repo can
prove those sections from persisted authoritative data.

### 4. Default source is persisted state plus snapshots

Phase 3 should compose:

- fund identity from `funds`
- lifecycle truth from `fund-state-read-service` or an equivalent shared reader
- reserve section from latest attributed `RESERVE` snapshot for the published
  config version (filtered by `configVersion` -- see Decision 9)
- pacing section from latest attributed `PACING` snapshot for the published
  config version (filtered by `configVersion` -- see Decision 9)

Snapshot payloads (`ReserveSummary`, `PacingSummary`) have different shapes from
the results-page section types. Batch 3A1 must define explicit mapper functions:

- `ReserveSummary` -> `ReserveResultsSection`: map
  `allocations[].{allocation, confidence, rationale}` to a stage-grouped shape;
  derive `reserveRatio` from `totalAllocation / fundSize`
- `PacingSummary` -> `PacingResultsSection`: map `totalQuarters` to
  `yearsToFullDeploy` (quarters / 4); map `avgQuarterlyDeployment` to
  `deploymentRate`

These mappers must be pure functions with unit tests. If a snapshot field cannot
map cleanly to the section type, the section should be `unavailable` with a
reason, not filled with a default.

`funds.engineResults` may be surfaced only as legacy evidence metadata if useful
for diagnosis. It cannot populate the new DTO.

### 5. Missing-data gap must be recorded explicitly

Current snapshot coverage does not support the existing scorecard/scenario UI.

That means Phase 3 must choose one of two truthful paths:

1. Narrow the page so it only renders sections backed by current authoritative
   data, with explicit unavailable states for scorecard/scenario/waterfall.
2. Record a proven gap and add a narrowly scoped server projection that derives
   extra fields from persisted inputs without falling back to session data.

Option 1 is the default. Option 2 requires a written gap note in the PR or batch
doc because it overrides the parent plan's "no new projection without proven
need" rule.

### 6. Section-level truth beats page-level completeness

The old page assumes four rich sections are always present. Phase 3 should not.

Preferred rendering model:

- page shell always renders
- each section advertises one of:
  - `available`
  - `pending`
  - `unavailable`
  - `failed`
- section copy explains the evidence gap in plain language

This avoids fake optimism while preserving a usable results route.

### 7. Top-level status is derived from lifecycle, not sections

The `status` field on `FundResultsReadV1` is derived purely from the lifecycle
calculation state returned by `fundStateReadService`:

- `failed` if `lifecycle.calculationState.status === 'failed'`
- `pending` if no calcRun exists (`calculationState.status === 'not_requested'`)
- `calculating` if calcRun exists but not yet complete
  (`calculationState.status` in `['submitted', 'calculating']`)
- `ready` if `calculationState.status === 'ready'`

`ready` does NOT require any section to be `available`. Sections speak for
themselves. This decouples page-level status from snapshot availability and
avoids false "pending" states when lifecycle says calculations are done but an
individual snapshot hasn't landed.

### 8. sessionStorage reads are a hard constraint, not a rollback trigger

The results page MUST NOT read results truth from `sessionStorage`. This is a
hard constraint for Phase 3, not merely a rollback trigger.

Specifically:

- `sessionStorage.getItem('engine-results-${fundId}')` must be deleted
- `sessionStorage.getItem('wizard-completion-data')` must be deleted
- `loadFromWizardData()` fabrication function must be deleted
- `loadEngineResults()` function must be deleted

Session storage may still be used for transient UX state (e.g., scroll position,
collapsed panels) but not for any data that appears in rendered section content.

Tests must assert that `sessionStorage.getItem` is never called with results
keys during page render.

### 9. Snapshot queries must filter by published config version

The existing snapshot query pattern in `fund-config.ts:297` fetches the latest
snapshot by `createdAt` without filtering by `configVersion`:

```ts
// EXISTING (unattributed):
findFirst({
  where: and(
    eq(fundSnapshots.fundId, fundId),
    eq(fundSnapshots.type, 'RESERVE')
  ),
  orderBy: desc(fundSnapshots.createdAt),
});
```

Phase 3's read service must prefer attributed snapshots but gracefully handle
legacy unattributed data (where `configVersion` is NULL for all funds created
before Phase 2A).

Two-tier query strategy:

```ts
// Tier 1: attributed snapshot for published config version
const attributed = await db.query.fundSnapshots.findFirst({
  where: and(
    eq(fundSnapshots.fundId, fundId),
    eq(fundSnapshots.type, 'RESERVE'),
    eq(fundSnapshots.configVersion, publishedConfigVersion)
  ),
  orderBy: desc(fundSnapshots.createdAt),
});

// Tier 2: legacy fallback (unattributed, latest by createdAt)
if (!attributed) {
  const legacy = await db.query.fundSnapshots.findFirst({
    where: and(
      eq(fundSnapshots.fundId, fundId),
      eq(fundSnapshots.type, 'RESERVE')
    ),
    orderBy: desc(fundSnapshots.createdAt),
  });
  // If legacy exists, use it but mark legacyEvidence: true
}
```

When using the legacy fallback, the section should include
`legacyEvidence: true` in its metadata (consistent with Phase 2B's
`legacyEvidence` pattern in `FundStateReadV1`). If neither tier returns a
snapshot, the section is `unavailable` with reason
`'No calculation results available'`.

### 10. Route host file is fund-config.ts

Mount `GET /api/funds/:id/results` in `server/routes/fund-config.ts` alongside
the existing Phase 2B read endpoints (`GET /api/funds/:id/state`,
`GET /api/funds/:id/reserves`). This maintains the read-only route grouping
pattern.

Extraction to a separate `server/routes/fund-results.ts` is permitted only if it
stays read-only. If extraction is used, `server/routes.ts` must also be updated
to register the new route file.

## Proposed DTO Shape

The contract uses a single shape -- no discriminated union at the top level.
Top-level `status` is derived purely from lifecycle state (see Decision 7). Each
section is an independent discriminated union so `ready` does not force any
section to be `available`.

```ts
// Per-section discriminated union (reused by every section)
type SectionUnavailable = {
  status: 'pending' | 'unavailable' | 'failed';
  reason: string;
};

type SectionAvailable<T> = {
  status: 'available';
  calculatedAt: string | null;
  source: 'fund_snapshots';
  legacyEvidence: boolean; // true if snapshot lacks configVersion attribution
  payload: T;
};

// Section payload types -- explicit transforms of snapshot payloads,
// NOT raw snapshot passthroughs. Defined in Batch 3A1 alongside mappers.
//
// ReserveResultsSection: derived from ReserveSummary snapshot payload.
//   Exposes the snapshot's native shape (allocations with confidence and
//   rationale), NOT the old fabricated stage-grouped shape. The old page's
//   {stage, engineAmount, userAmount} format required data the snapshot
//   doesn't contain (stage comes from portfolio company input, not engine
//   output). The mapper transforms TO a new truthful shape, not BACK to the
//   old fabricated shape. fundSize from funds table is passed in to derive
//   reserveRatio (totalAllocation / fundSize).
//
// PacingResultsSection: derived from PacingSummary snapshot payload.
//   Maps totalQuarters to yearsToFullDeploy (quarters / 4),
//   avgQuarterlyDeployment to deploymentRate. Exposes deployments[] in
//   the snapshot's native quarterly format.

type FundResultsReadV1 = {
  status: 'pending' | 'calculating' | 'ready' | 'failed';
  fundId: number;
  fund: {
    name: string;
    vintageYear: number;
    size: number;
  };
  lifecycle: FundStateReadV1;
  sections: {
    reserve: SectionAvailable<ReserveResultsSection> | SectionUnavailable;
    pacing: SectionAvailable<PacingResultsSection> | SectionUnavailable;
    // Phase 3 default: unavailable. Batch 3C may add available variant.
    scorecard: SectionUnavailable;
    scenarios: SectionUnavailable;
    waterfall: SectionUnavailable;
  };
};
```

Important constraints:

- `status` is derived from lifecycle calculation state (Decision 7), not from
  section availability
- `ready` means the lifecycle says calculations completed; individual sections
  may still be `unavailable` if no attributed snapshot exists
- every non-available section must carry a `reason`
- no zero-filled placeholders
- scorecard, scenarios, and waterfall are typed as `SectionUnavailable` only in
  Phase 3; Batch 3C may widen them if a proven gap justifies it

## Batch Plan

**Deployment ordering:** Batches must land in order (3A1 -> 3A2 -> 3B1 -> 3B2).
3B2 (page cutover) depends on 3A2 (route exists) and 3B1 (fund ID handoff).
Since this is a solo developer pushing to main, ordering is naturally
sequential. As a safety guard, the results page (3B2) must handle 404 from
`GET /api/funds/:id/results` gracefully (show error state, not crash).

### Batch 3A1: Contract, Section Types, And Snapshot Mappers

Owned files:

- `shared/contracts/fund-results-v1.contract.ts` (new)
- `server/services/fund-results-mappers.ts` (new)
- `tests/unit/phase3/fund-results-contract.test.ts` (new)
- `tests/unit/phase3/fund-results-mappers.test.ts` (new)

Required work:

1. Create the versioned Zod contract with `SectionAvailable<T>` and
   `SectionUnavailable` discriminated union types.
2. Define `ReserveResultsSection` and `PacingResultsSection` types as explicit
   transforms of `ReserveSummary` and `PacingSummary` snapshot payloads.
3. Implement pure mapper functions:
   - `mapReserveSnapshot(snapshot, fundSize) -> ReserveResultsSection`
   - `mapPacingSnapshot(snapshot) -> PacingResultsSection`
4. Scorecard, scenarios, and waterfall sections typed as `SectionUnavailable`
   only.

Validation:

- contract shape tests (Zod parse round-trip)
- mapper unit tests covering: normal payload, missing fields, edge cases
- every test case wrapped with `createSandbox()` for cleanup isolation
- no I/O in this batch -- pure types and functions only

Rollback trigger:

- stop if snapshot payloads cannot map to a meaningful section shape without
  fabricating fields

### Batch 3A2: Read Service And Route

Owned files:

- `server/services/fund-results-read-service.ts` (new)
- `server/routes/fund-config.ts` (add GET handler)
- `tests/unit/contract/fund-results-route.test.ts` (new)

Required work:

1. Implement a read service that:
   - loads fund identity from `funds` table
   - reuses `fundStateReadService` for lifecycle truth
   - loads latest attributed `RESERVE` and `PACING` snapshots filtered by
     `configVersion` matching the published config (Decision 9)
   - calls mappers from 3A1 to convert payloads to section types
   - emits `SectionUnavailable` with reason when no attributed snapshot exists
   - derives top-level `status` from lifecycle (Decision 7)
2. Mount `GET /api/funds/:id/results` in `fund-config.ts` (Decision 10).
3. Return:
   - `400` for invalid fund ID (non-numeric or negative)
   - `404` for missing fund
   - `200` with `FundResultsReadV1` body
4. Use direct `db` import consistent with `fund-state-read-service.ts`.

Validation:

- route contract test mounted with inline Express + `supertest`
- mock the read service at module level (same pattern as fund-state-route tests)
- every test case wrapped with `createSandbox()` for cleanup isolation
- no extension of `tests/helpers/database-mock.ts` unless truly needed

Rollback trigger:

- stop if the route cannot express truthful incomplete sections without sneaking
  in placeholder values

### Batch 3B1: Fund ID Handoff (XState Machine + Wizard)

Owned files:

- `client/src/machines/modeling-wizard.machine.ts`
- `client/src/components/modeling-wizard/ModelingWizard.tsx`
- `tests/unit/machines/modeling-wizard-fundid.test.ts` (new)

Required work:

1. Add `createdFundId: number | null` to `ModelingWizardContext` type definition
   (initialized as `null`).
2. Add `assignCreatedFundId` action that parses `event.output` with a Zod schema
   (`z.object({ data: z.object({ id: z.number() }) })`) before assigning. Fall
   back to `null` on parse failure. Do not cast `unknown`.
3. Add action to `submitting.onDone.actions` array (before `clearProgress`).
4. In `ModelingWizard.tsx`:
   - Read `data.context.createdFundId` in the `onComplete` callback (the hook
     already passes full context via `onComplete?.(context)`)
   - Navigate to `/fund-model-results/${createdFundId}` instead of `/latest`
   - Remove the `sessionStorage.setItem('wizard-completion-data', ...)` write
5. Note: `useModelingWizard` hook does NOT need changing -- it already forwards
   full context.

Validation:

- machine unit test: submit -> completed transition captures fund ID in context
- machine unit test: createdFundId is null initially, populated after onDone
- component test: verify navigation to `/fund-model-results/:id` not `/latest`

Rollback trigger:

- revert if the machine change breaks existing wizard navigation flow

### Batch 3B2: Results Page Cutover

Owned files:

- `client/src/pages/fund-model-results.tsx`
- `tests/unit/pages/fund-model-results.test.tsx` (new)

Required work:

1. Delete `loadEngineResults()` function entirely.
2. Delete `loadFromWizardData()` fabrication function entirely.
3. Replace page bootstrapping with fetch from `GET /api/funds/:id/results`.
   Implementer may use raw `fetch` or TanStack Query -- both patterns exist in
   the codebase. If raw fetch, add a `useEffect` timer for polling when status
   is `pending` or `calculating`.
4. Update page rendering:
   - available sections render their payload data
   - unavailable/pending/failed sections show explicit copy with the `reason`
     from the DTO
   - no fabricated MOIC, reserve ratio, or scenario values
5. Handle `/latest` gracefully: if `fundId === 'latest'`, show an error state
   directing user to `/fund-setup`.
6. Handle loading state (skeleton or spinner while fetch is in-flight).
7. Handle 404 (fund not found) and network errors.

Validation:

- component test rendered with `createWouterWrapper('/fund-model-results/123')`
- mock `fetch` to drive pending, ready, failed, and partially available states
- spy on `sessionStorage.getItem` and assert it is NEVER called with
  `engine-results-*` or `wizard-completion-data` keys
- test `/latest` route shows error state, not fabricated results
- use `createSandbox()` per test to clean abort handlers, globals, and timers

Rollback trigger:

- revert if the page still reads from sessionStorage for results truth, or if
  any unavailable section is silently backfilled with fake data

**Post-3B2 product checkpoint:** After 3B2 ships, evaluate with product whether
3 permanently "unavailable" sections (scorecard, scenarios, waterfall) is
acceptable. If the page looks broken to GPs, that is the trigger for Batch 3C.

### Batch 3C: Proven-Gap Review For Rich Metrics

This batch is conditional.

Trigger it only if product insists on preserving scorecard/scenario/waterfall
cards that current snapshot payloads cannot support.

Required work:

1. Record the concrete gap:
   - which UI field is missing
   - why `RESERVE`/`PACING` snapshots cannot populate it
   - why section removal is not acceptable
2. Evaluate whether the smallest truthful answer is:
   - a new snapshot writer
   - a persisted projection
   - a narrower section redesign
3. If a projection is added, mark every field with explicit source ownership.

Validation:

- add unit tests for projection derivation from persisted inputs only
- prove no session fallback and no `funds.engineResults` dependency

Rollback trigger:

- revert if the projection reads client-only code paths, unpersisted wizard
  state, or broadens into general engine refactoring

### Batch 3D: Wizard-To-Results Acceptance Flow

Owned files:

- `tests/integration/wizard-to-results-e2e.test.ts` (new)

Required work:

1. Submit the wizard or equivalent create flow.
2. Navigate to `/fund-model-results/:fundId`.
3. Reload the route.
4. Assert the same persisted state reads back.
5. Assert the page shows either:
   - authoritative available sections
   - or truthful pending/unavailable sections
6. Assert no rendered output depends on session-backed results truth.

Validation approach:

- reuse existing inline Express + `supertest` patterns for server behavior
- use jsdom + memory-router harness for client readback behavior
- isolate global mutations with `createSandbox()`

Rollback trigger:

- revert the cutover if initial render and reload disagree on section truth, or
  if the acceptance test requires session seeding to pass

## Sandbox Validation Strategy

Phase 3 should explicitly reuse the repo's current sandbox/testing primitives
instead of inventing new infrastructure.

### 1. Route sandbox

Pattern already proven by:

- `tests/unit/contract/fund-state-route.test.ts`
- `tests/integration/fund-state-readback.test.ts`

Use the same approach for `GET /api/funds/:id/results`:

- mount a small Express app
- register only the read route owner
- mock the read service at module level
- verify HTTP contract through `supertest`

### 2. Global isolation sandbox

Pattern already available in:

- `tests/setup/test-infrastructure.ts`

Use `createSandbox()` in new Phase 3 tests to:

- isolate abort signals
- register cleanup callbacks for mocked globals
- prevent leaked timers/listeners between result-page tests

### 3. Client routing sandbox

Pattern already available in:

- `tests/utils/withWouter.tsx`

Use it to validate:

- results page loads by concrete fund ID
- route refresh/rerender preserves server truth
- `/latest` is no longer required for correctness

### 4. Minimal proof commands

When implementing Phase 3, the minimum useful validation sweep should be:

1. `npx vitest run tests/unit/phase3/fund-results-contract.test.ts tests/unit/phase3/fund-results-mappers.test.ts`
   (3A1)
2. `npx vitest run tests/unit/contract/fund-results-route.test.ts` (3A2)
3. `npx vitest run tests/unit/machines/modeling-wizard-fundid.test.ts` (3B1)
4. `npx vitest run tests/unit/pages/fund-model-results.test.tsx` (3B2)
5. `npx vitest run tests/integration/wizard-to-results-e2e.test.ts` (3D)

Broader checkpoint (verify Phase 2B not regressed):

6. `npx vitest run tests/unit/contract/fund-state-route.test.ts tests/integration/fund-state-readback.test.ts`

## Business Acceptance Check

On the authoritative runtime path:

1. create a fund through the wizard flow
2. land on `/fund-model-results/:fundId`
3. reload the page
4. observe the same persisted fund identity and lifecycle state
5. observe only authoritative sections or explicit incomplete sections
6. verify there are no fabricated MOIC, reserve ratio, or optimistic/
   pessimistic scenario values

## Open Risks To Resolve Before Coding

1. The existing results UI shape overclaims what current snapshot writers can
   support. This is the main Phase 3 design constraint. The DTO shape now
   handles this by making all sections independently available/unavailable.
2. `pacing-worker.ts` still derives from the legacy fund row rather than the
   full published config, so "ready" remains orchestration truth, not full
   wizard-fidelity truth.
3. If product requires the existing rich scorecard without UI narrowing, that
   requirement itself is the evidence needed to justify a small projection or
   new snapshot source. It should be called out explicitly, not smuggled in.
4. The calculating-to-ready transition needs a refetch mechanism. Batch 3B2
   should implement conditional polling (e.g., refetch every 5 seconds when
   status is `pending` or `calculating`, stop when `ready` or `failed`).
   WebSocket push is out of scope for Phase 3.
5. Snapshot-to-section mappers (Batch 3A1) are the critical design decision. If
   `ReserveSummary` cannot map to a useful `ReserveResultsSection` without
   fabricating fields, the reserve section must stay `unavailable` until the
   snapshot payload is enriched -- which is a worker change and may require
   parent plan amendment.
