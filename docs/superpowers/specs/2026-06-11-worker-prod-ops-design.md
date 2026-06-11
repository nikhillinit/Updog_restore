# Worker Prod Ops: Dedicated fund-scenario-calc Worker Service — Design

**Date:** 2026-06-11
**Status:** Approved direction (lane, scope, and topology confirmed by product owner)
**Predecessor:** PR #823 (`fix(worker): build and run the fund-scenario-calc worker image`)

## Problem

M8 C3 wired the `fund-scenario-calc` BullMQ worker, and PR #823 made
`Dockerfile.worker` actually buildable and runnable. But prod still cannot
compute async reserve-allocation scenarios:

- Prod API is Vercel serverless (`vercel.json`, `api/**/*.ts`) — request-scoped,
  cannot host a persistent BullMQ worker.
- The former Railway deployment is gone: `updog-fund-platform.up.railway.app`
  returns 404 "Application not found" (verified 2026-06-11). `railway.toml`
  defines only a `web` service from `Dockerfile.railway`; no worker service
  config exists.
- The producer is also gated off: `enqueueReserveScenarioCalculation`
  (`server/services/fund-scenario-calc-queue-service.ts:44`) throws 503
  `scenario_calculation_queue_unavailable` unless `getQueueConfig()`
  (`server/config/features.ts`) sees `ENABLE_QUEUES=1` and a non-`memory://`
  `QUEUE_REDIS_URL`/`REDIS_URL` — which Vercel prod presumably does not set.

Net effect: `POST /api/funds/:fundId/scenario-sets/:scenarioSetId/calculate-reserve`
either 503s or (if queues were enabled without a worker) enqueues jobs that sit
`queued` forever.

## Decision

**Topology B — dedicated worker service.** Run the `Dockerfile.worker` image as
its own Railway service. Vercel remains the only API surface (producer);
the Railway service runs only the worker process and its health server.

Rejected alternatives:

- **A: full server on Railway** (`Dockerfile.railway`, in-process worker) —
  zero new wiring but stands up a duplicate prod API surface solely to drain a
  queue.
- **C: feature-gate reserve scenarios in Vercel** — ships nothing; fallback
  only if Railway proves unusable.

## Components

### 1. Repo: Railway worker service config (code change, Hermes-dispatched)

Add `railway.worker.toml` next to the existing `railway.toml`:

- `[build]` `dockerfilePath = "Dockerfile.worker"`
- `[deploy]` `healthcheckPath = "/health"`, `healthcheckTimeout = 300`
  (matching the existing `railway.toml`), `restartPolicyType = "always"`
- Comments documenting required dashboard env vars (below) and that the
  service's "config file path" must be pointed at this file in the Railway
  dashboard (Railway resolves one config file per service).

No application code changes. The worker health server already exposes
`/health`, `/live`, `/ready`, `/metrics` (`workers/health-server.ts`), and the
image already sets `WORKER_HEALTH_PORT=9000`.

Health-port note: Railway healthchecks target the port the service listens on.
The Railway service variable `WORKER_HEALTH_PORT=${{PORT}}` maps Railway's
injected `PORT` onto the worker's health server
(`workers/fund-scenario-calc-worker.ts:getHealthPort()` reads
`WORKER_HEALTH_PORT` first). This is a dashboard variable, not a code change.

### 2. Prod config: Railway service (manual, owner-confirmed per step)

Create a Railway project/service from the GitHub repo:

- Config file path: `railway.worker.toml`
- Variables: `NODE_ENV=production`, `ENABLE_QUEUES=1`,
  `REDIS_URL=<prod Redis, same as Vercel>`, `DATABASE_URL=<prod Postgres,
  same as Vercel>`, `WORKER_HEALTH_PORT=${{PORT}}`
- The worker connects outbound to the existing prod Redis and Postgres; no
  Railway-managed datastores are created.

### 3. Prod config: Vercel producer (manual, owner-confirmed)

Set `ENABLE_QUEUES=1` in the Vercel project env (production). Verify
`REDIS_URL` is already a real, network-reachable Redis (memory
`project_b3_deploy_topology` says it is; re-verify, do not assume).

### 4. Verification (acceptance)

1. Railway deploy goes healthy: worker `/health` returns 200 with
   `fund-scenario-calc` status `healthy`.
2. A real prod `calculate-reserve` request returns 202 and the scenario set
   transitions `queued → calculating → succeeded`, with results visible in the
   workspace.
3. Vercel `/api/health` is unchanged (no `degraded` regression — the
   `healthMode: 'producer'` registry entry stays as-is; the `worker` flip
   remains deferred per #823).

## Execution protocol

- **Hermes orchestration** for the repo change: dispatch via
  `npm run hermes:production -- --task "..."`. Dry-run the exact task string
  first (`node orchestrate.js --dry-run --phase production --task "..."`) to
  confirm it routes plain (no financial-specialist promotion). Hermes
  postflight runs only `npm run check`; lint and targeted tests run separately
  after the dispatch.
- **Prod mutations** (Railway service creation, Vercel env var) are proposed
  one at a time and applied only after owner confirmation, per the agreed
  scope. Railway dashboard actions may need to be performed by the owner if no
  authenticated CLI is available.

## Risks

- **Redis reachability/TLS:** prod Redis may require `rediss://`; the parser in
  `server/config/features.ts` handles TLS URLs, but connectivity from Railway
  egress to the Redis provider must be proven with a live job, not assumed.
- **Railway account state:** the old project 404s; if the account/plan is not
  usable, fall back to topology A (full server) on another host or gate the
  feature (C) and surface to product.
- **Producer flip ordering:** enable the worker first, Vercel
  `ENABLE_QUEUES=1` second, so no window exists where jobs enqueue with no
  worker to drain them.

## Non-goals

- No `healthMode` `'producer'` → `'worker'` flip (needs per-host health
  semantics; deferred from #823).
- No calculation, queue-logic, or schema changes.
- No forecast-drift UX work (separate plan:
  `docs/superpowers/plans/2026-06-07-forecast-drift-ux-completion.md`).
- No migration off Vercel.
