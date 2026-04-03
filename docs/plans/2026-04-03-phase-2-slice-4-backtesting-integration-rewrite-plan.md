---
last_updated: 2026-04-03
---

# Phase 2 Slice 4 Plan: Deterministic Backtesting Contract Integration

## Context

Parent plan:

- `docs/plans/2026-04-02-phase-2-scenario-comparison-consolidation-plan.md`

Slices `0` through `3` decide the product shape. Slice `4` is the verification
cleanup that makes the shipped `/api/backtesting/*` contract testable without
feature flags, stale endpoint expectations, or "200 or 500 is acceptable"
assertions.

The current gap is not lack of unit coverage. It is that the integration story
still reflects a pre-consolidation world.

## Goal

Replace the quarantined, env-gated backtesting API suite with deterministic
contract coverage for the live `/api/backtesting/*` surface.

Concretely, Slice `4` must:

- remove `@quarantine` and `ENABLE_BACKTESTING_TESTS` gating from the
  backtesting integration suite
- stop treating `500` responses as acceptable success for live happy-path
  assertions
- cover the live route set, including async job routes
- assert that result/history responses disclose
  `scenarioComparisonSummary` when present
- clean stale quarantine bookkeeping for removed scenario-comparison suites

## Non-Goals

Slice `4` does not include:

- numerical Monte Carlo correctness validation
- performance benchmarking
- real Redis/BullMQ end-to-end queue throughput testing
- resurrection of deleted scenario-comparison route tests
- dependence on an externally managed dev server or ambient database contents

## Actual Codebase Findings

1. `tests/integration/backtesting-api.test.ts` is still quarantined and gated
   by `ENABLE_BACKTESTING_TESTS`.

2. The same file still accepts `[200, 500]` as success for multiple "valid"
   requests, which makes the contract non-truthful.

3. The current suite mounts a local Express app with `registerRoutes()` and
   `supertest`, but the integration project also runs `tests/integration/global-setup.ts`.
   That means the suite currently mixes two harness models:
   - global external-server boot
   - local in-process route mounting

4. The current suite does not cover the async route family:
   - `POST /api/backtesting/run/async`
   - `GET /api/backtesting/jobs/:jobId`
   - `GET /api/backtesting/jobs/:jobId/stream`

5. `tests/integration/global-setup.ts` forces:
   - `REDIS_URL=memory://`
   - `ENABLE_QUEUES=0`

   That means a "real queue" strategy will not make async routes deterministic
   in the standard integration harness.

6. The live backtesting route module already exposes the contract Slice `4`
   should test:
   - sync run
   - async run/job/stream
   - result fetch
   - fund history
   - scenario compare
   - scenario list

7. Focused unit coverage already exists for the pieces that do not need to be
   re-proven in integration:
   - `tests/unit/services/backtesting-service.test.ts`
   - `tests/unit/queues/backtesting-queue.test.ts`
   - `tests/unit/hooks/useBacktesting.test.tsx`
   - `tests/unit/pages/sensitivity-analysis.test.tsx`

8. `tests/quarantine/REPORT.md` still lists both the current backtesting suite
   and deleted scenario-comparison suites, so quarantine bookkeeping is stale.

9. The async SSE route writes raw frames with `res.write(...)` and ends only
   through subscription callbacks. Slice `4` therefore needs an explicit test
   mechanism for stream capture rather than a vague "SSE smoke test."

10. `BacktestAsyncRunResponse.deduplicated` is part of the shared typed
    contract, but it should only be asserted in the idempotency scenario rather
    than treated as a universal async invariant.

11. `tests/utils/integrationAuth.ts` already matches the required
    issuer/audience/test-only contract and defaults `fundIds` to `[1, 2, 3]`,
    so Slice `4` should keep that helper instead of inventing a second auth
    strategy.

12. Sandbox implementation confirmed the direct-router fallback is the better
    default harness for this suite. Mounting `server/routes/backtesting.ts`
    directly under `/api/backtesting` kept auth, fund-access, validation, and
    route payloads real while avoiding unrelated route-graph startup and
    automation noise from `registerRoutes()`.

## Recommendation

Use a deterministic in-process route-contract harness instead of a real queue or
ambient database harness.

Why:

- the Phase 2 requirement is truthful API-contract coverage
- the standard integration environment disables queues by design
- real Redis/BullMQ would make the slice heavier and less deterministic than it
  needs to be
- the direct backtesting router plus real auth/validation middleware and mocked
  backtesting/queue collaborators is enough to exercise the live contract

Recommended shape:

1. keep the suite under the existing `tests/integration` project
2. mount a local app with `server/routes/backtesting.ts` under
   `/api/backtesting`
3. mock `backtestingService` and `backtesting-queue` at the module boundary
4. use stable fixtures for route responses
5. make every happy-path assertion status-specific and schema-specific
6. keep the rewrite in one file unless a later split is justified by a proven
   maintenance need

## Implementation Validation Update (`2026-04-03`)

Sandbox implementation completed the rewrite with the direct-router harness and
passed the focused validation stack:

- `tests/integration/backtesting-api.test.ts` now runs by default without
  quarantine or env gating
- the suite mounts `server/routes/backtesting.ts` directly with real auth and
  validation middleware behavior
- async queue behavior is mocked at the module boundary with deterministic
  status, enqueue, and SSE callbacks
- `tests/quarantine/REPORT.md` no longer lists the rewritten backtesting suite
  or deleted scenario-comparison suites

## Owned Files

- `tests/integration/backtesting-api.test.ts` (rewrite in place or replace with
  an equivalently named live-contract suite)
- optional shared fixture helper under `tests/fixtures/` or `tests/integration/`
- `tests/quarantine/REPORT.md`
- `tests/quarantine/PROTOCOL.md` only if documentation needs a note update

Conditionally touched only if the chosen harness requires it:

- `vitest.config.int.ts`
- `tests/integration/global-setup.ts`

Do not put route implementation files on the critical path unless the rewrite
uncovers a real contract mismatch.

## Harness Decision

### Use Real Backtesting Route Wiring, Mocked Collaborators

Keep these pieces real:

- `server/routes/backtesting.ts`
- auth middleware
- fund-access middleware
- request validation
- response codes and payload shapes

Mock these pieces deterministically:

- `backtestingService`
- `backtesting-queue` status/enqueue/subscription functions

Mocking rule:

- use module-level `vi.mock(...)` for the queue and service modules before the
  route graph is imported
- do not use late `vi.spyOn(...)` as the primary queue-control mechanism,
  because `tests/integration/global-setup.ts` already forces
  `REDIS_URL=memory://` and `ENABLE_QUEUES=0`

That gives integration value where it matters:

- route wiring
- auth and access control
- Zod validation
- live endpoint shapes

without turning Slice `4` into a Redis/BullMQ infrastructure project.

### Do Not Rely On The Global External Server For This Suite

The current file already uses `supertest` against a locally mounted server.
Keep that model for determinism.

If `global-setup.ts` startup overhead becomes a real problem after the rewrite,
that is a follow-on harness cleanup, not a reason to keep the suite quarantined.

Why not use `registerRoutes()` here:

- the full app graph starts unrelated automation and route modules that do not
  add signal for the backtesting contract
- the integration project already boots an external server in `global-setup.ts`
  for other suites, so a second full route graph inside this file adds cost and
  noise without improving Slice `4` coverage
- direct router mounting preserves the contract boundaries this slice actually
  cares about

## Execution Sequence

### 1. Replace The Current Gated Skeleton

Remove:

- `@quarantine`
- `describeMaybe`
- `ENABLE_BACKTESTING_TESTS`
- "200 or 500 is fine" assertions

Keep:

- authenticated request helpers
- local in-process mounting of `server/routes/backtesting.ts`

Acceptance:

- the suite is runnable by default through the normal integration command
- no happy-path assertion accepts `500`, while legitimate negative-path `503`
  checks remain allowed for queue-unavailable cases

### 2. Introduce Stable Fixtures For Live Route Contracts

Create one deterministic fixture set for:

- `BacktestResult`
- `BacktestJobStatusResponse`
- scenario-comparison summary payloads
- history rows with `scenarioComparisonSummary`

Acceptance:

- route assertions no longer depend on ambient DB state or engine execution

### 3. Rewrite Sync Route Coverage Around Exact Outcomes

Cover these routes with specific expected statuses and payloads:

- `POST /api/backtesting/run`
- `GET /api/backtesting/fund/:fundId/history`
- `GET /api/backtesting/result/:backtestId`
- `POST /api/backtesting/compare-scenarios`
- `GET /api/backtesting/scenarios`

Required assertions:

- `401` for unauthenticated access
- `400` for invalid payloads and invalid IDs
- `403` for fund/job access violations
- `404` for missing result/job IDs
- exact `200` responses for successful sync routes
- correlation ID echo where the contract supports it

Acceptance:

- no happy-path test treats `500` as acceptable

### 4. Add Async Route Coverage With Queue Mocks

Add deterministic tests for:

- `POST /api/backtesting/run/async`
- `GET /api/backtesting/jobs/:jobId`
- `GET /api/backtesting/jobs/:jobId/stream`

Required cases:

- queue unavailable => `503`
- queued job => `202` with `Location` and `Retry-After`
- deduplicated async submission => `202` with `deduplicated: true` in the
  explicit idempotency test only
- unknown job => `404`
- inaccessible job => `403`
- completed job => `200` with `fundId`, `resultRef`, and terminal links

For SSE:

- mock `subscribeToBacktestJob(...)` to synchronously emit a deterministic
  `onStatus(...)` snapshot and a terminal callback such as `onComplete(...)`
- capture the terminated response body through the local test server so the
  stream can be asserted without timing-based reads
- assert the route matches `text/event-stream`
- assert the initial `connected` and `status` frames and, when emitted by the
  mock, the terminal frame
- do not widen the slice into brittle timing-heavy stream tests

Acceptance:

- the live async route family is covered without enabling real queues

### 5. Make Persisted Scenario-Failure Truth Part Of The Contract

Add assertions that:

- `GET /api/backtesting/result/:backtestId` returns
  `scenarioComparisonSummary` when present
- `GET /api/backtesting/fund/:fundId/history` preserves
  `scenarioComparisonSummary` on history rows
- `POST /api/backtesting/compare-scenarios` returns the partial-failure summary
  shape:
  - `requestedScenarios`
  - `scenariosCompared`
  - `failedScenarios`

Important:

- this is the contract-level proof that the Phase 2 surface stays truthful
  after reload and history selection

### 6. Clean Quarantine Bookkeeping

Update `tests/quarantine/REPORT.md` so it no longer lists:

- the rewritten backtesting suite as quarantined
- deleted scenario-comparison integration suites as if they still exist

Optional guard assertion:

- add one lightweight assertion that the retired scenario-comparison route does
  not exist in the chosen harness, but do not make deleted-route coverage the
  primary purpose of Slice `4`

Acceptance:

- quarantine tracking matches the actual repo

## Minimum Test Matrix

The rewritten suite should cover at least:

1. unauthenticated sync route rejection
2. unauthenticated async route rejection
3. sync run validation failures
4. successful sync run response
5. successful scenario-compare response
6. scenario list response
7. invalid result ID rejection
8. successful result fetch including `scenarioComparisonSummary`
9. successful history fetch including `scenarioComparisonSummary`
10. queue-unavailable async response
11. queued async response
12. job status response for completed and inaccessible jobs
13. SSE initial handshake/status frames

## Test Plan

Primary verification:

```bash
npx vitest run tests/integration/backtesting-api.test.ts --config vitest.config.int.ts
```

Recommended supporting runs:

```bash
npx vitest run tests/unit/services/backtesting-service.test.ts tests/unit/queues/backtesting-queue.test.ts
```

## Risks And Tradeoffs

1. Over-mocking would reduce the suite to a unit test. Keep the real
   backtesting router, auth, and validation middleware in the loop to avoid
   that failure mode.

2. Real Redis/BullMQ coverage would be closer to production, but it would also
   reintroduce nondeterminism and infrastructure coupling that this slice does
   not need.

3. SSE tests become brittle if they try to prove timing behavior. Keep them at
   the contract level: headers and deterministic initial/terminal frames only.

4. The integration project still starts `global-setup.ts`. If that becomes a
   runtime bottleneck, treat it as a separate harness improvement, not a reason
   to keep the backtesting suite gated.

5. Direct backtesting-router mounting gives up some whole-app wiring signal, but
   sandbox implementation showed that the lost signal is low-value compared with
   the reduction in unrelated initialization noise.

## Exit Criteria

Slice `4` is complete when:

- `tests/integration/backtesting-api.test.ts` runs by default without
  `ENABLE_BACKTESTING_TESTS`
- the suite is no longer quarantined
- happy-path assertions require exact success statuses instead of allowing
  `500`
- the live backtesting route family is covered, including async job routes
- result/history responses are asserted to expose
  `scenarioComparisonSummary` when present
- stale scenario-comparison quarantine entries are removed
- the standard integration command can exercise the rewritten suite
