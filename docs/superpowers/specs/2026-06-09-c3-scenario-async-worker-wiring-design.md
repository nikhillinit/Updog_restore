# C3: Scenario Async Worker Persistence — Design Spec

**Date:** 2026-06-09 **Status:** Approved **M8 Item:** C3 — Async worker
persistence for reserve-allocation scenario path

---

## Problem

The `reserve_allocation` scenario calculation path is half-wired. When a user
triggers `POST .../calculate-reserve`, the route enqueues a BullMQ job into the
`fund-scenario-calc` queue. The queue (producer side) and the job handler both
exist. However, no consumer worker ever starts — so jobs sit in the queue
indefinitely and the status endpoint always returns `queued`.

### What exists (no changes required)

| Asset              | Path                                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| Job handler        | `workers/fund-scenario-calc-handler.ts` — calls `runReserveScenarioCalculation`                |
| Standalone worker  | `workers/fund-scenario-calc-worker.ts` — `startFundScenarioCalcWorker` (for Docker/standalone) |
| In-process harness | `workers/fund-scenario-calc-worker-harness.ts` — used by integration tests                     |
| Unit tests         | `tests/unit/workers/fund-scenario-calc-worker.test.ts` — 5/5 passing                           |
| Integration test   | `tests/integration/fund-scenario-reserve-worker.test.ts` — full e2e proof                      |
| Release gate       | `tests/integration/scenarios/scenario-release-gate.integration.test.ts`                        |

### Root cause

`server/providers.ts::buildQueue()` starts the simulation, report, and
backtesting workers but has no entry for the fund-scenario-calc worker. The
queue exists only as a producer.

---

## Deployment decision

The worker runs **in-process with the API** (Railway/Docker, not
Vercel-serverless which cannot host persistent workers). This matches the
pattern of the other embedded workers (`simulation-queue.ts`,
`report-generation-queue.ts`, `backtesting-queue.ts`).

---

## Design

### Option chosen: thin init file + one-line providers wiring

**Rejected alternatives:**

- Inline everything in `providers.ts` — mixes concerns, harder to read
- Consolidate into `server/queues/fund-scenario-calc-queue.ts` — scope creep,
  requires moving tests

### New file: `server/queues/fund-scenario-calc-worker-init.ts`

Exports `initializeFundScenarioCalcWorker(redis: IORedis): Promise<{ close }>`.

Key decisions:

- Uses `getBullMQConnection(redis)` to extract plain connection options from the
  IORedis instance passed in by `providers.ts` (same pattern as all embedded
  workers)
- The handler is **lazy-imported** via
  `await import('../../workers/fund-scenario-calc-handler.js')` inside the
  processor function to avoid a `server → workers → server` circular dependency
  at module load time (workers import from server, so a static import the other
  way creates a cycle)
- `concurrency: 2` — matches the standalone worker default
- `lockDuration: 300_000` — 5-minute timeout, satisfies
  `povc-security/require-bullmq-config`
- Logs `completed` and `failed` worker events
- Returns `{ close: () => worker.close() }` for graceful shutdown via
  `providers.teardown`

### Modified file: `server/providers.ts`

Add `initializeFundScenarioCalcWorker` to the dynamic imports and to the
`Promise.allSettled` call in `buildQueue`. One-line addition in each location.

### Unchanged: queue service, handler, tests, registry

The `fund-scenario-calc-queue-service.ts` continues to create the Queue
(producer side) during route registration (Phase 3 of bootstrap). The Worker
(consumer) starts during `buildQueue` (Phase 2). They interact via Redis — no
direct code reference needed.

The queue registry entry stays `healthMode: 'producer'` for now. The health
endpoint won't show `workerAttached`, but the worker runs and processes jobs
correctly. Updating the health metadata is a follow-up, not required for C3.

---

## Status / failure path (no changes required)

When a job fails:

1. `runReserveScenarioCalculation` catches the error and writes a
   `calculation_failed` event to `fund_scenario_set_events`
2. The handler re-throws, BullMQ marks the job failed after retries
3. The status service reads `calculation_failed` from events → returns
   `status: 'failed'` with `lastError` populated

`markScenarioCalculationRunFailed` is intentionally not called — the status
surface reads events, not the `fund_scenario_calculation_runs` table. YAGNI.

---

## Quality gates

| Gate                  | Command                              | Requirement                             |
| --------------------- | ------------------------------------ | --------------------------------------- |
| TypeScript            | `npm run check`                      | Zero errors                             |
| Lint                  | `npm run lint`                       | Zero warnings                           |
| Unit tests            | `npm test -- --project=server`       | All passing                             |
| Scenario release gate | `npm run test:scenario-release-gate` | Requires WSL2 + Docker (Testcontainers) |

The scenario release gate is the authoritative end-to-end proof: it spins up
real Redis + Postgres via Testcontainers, enqueues a reserve-allocation job, and
asserts `status: 'succeeded'` with a populated `snapshotId`. This test already
exists and must pass before merging.

---

## File change summary

| File                                              | Change                                         |
| ------------------------------------------------- | ---------------------------------------------- |
| `server/queues/fund-scenario-calc-worker-init.ts` | **New** — `initializeFundScenarioCalcWorker`   |
| `server/providers.ts`                             | **Modified** — add worker init to `buildQueue` |
