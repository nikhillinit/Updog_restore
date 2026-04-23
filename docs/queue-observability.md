---
last_updated: 2026-04-03
---

# Queue Observability

Queue availability is derived from `getQueueConfig()` in
`server/config/features.ts`.

Environment:

- `ENABLE_QUEUES=1` enables the queue subsystem.
- `QUEUE_REDIS_URL` overrides `REDIS_URL` for BullMQ only.

Runtime surfaces:

- Health: `/api/health/queues`

Coverage:

- Provider-owned queues: simulation, report generation, backtesting
- Route-owned producer queues: reserve, pacing, cohort

Implementation notes:

- Queue runtime registration lives in `server/queues/registry.ts`.
- Health checks preserve the existing `/api/health/queues` contract and report
  disabled, missing, degraded, or ok states per queue.
