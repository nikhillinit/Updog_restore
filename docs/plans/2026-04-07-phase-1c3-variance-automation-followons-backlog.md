---
last_updated: 2026-04-07
status: BACKLOG
---

# Phase 1C.3 Variance Automation Follow-Ons Backlog

## Context

Parent planning document:

- `docs/plans/2026-04-02-phase-1c2-alert-scheduling-and-remaining-capital-plan.md`

`1C.2` shipped in `5c002e3c` (2026-04-02) with hardening follow-ups `b8d3bd60`,
`c554ddca`, and `3e9a360c`. The `1C.2` plan explicitly listed three Known
Tradeoffs that were deferred. This document captures them as a backlog so they
do not get lost when the next variance work begins.

This is a backlog stub, not an implementation plan. Each item should be turned
into a focused plan document before any code lands.

## Goal

Track the three deferred items from `1C.2` so a future planner can prioritize
them against new variance work without re-deriving context from main + git log.

## Non-Goals

`1C.3` does not pre-commit to:

- a delivery date for any of the items below
- any specific architecture for the deferred items (deferred for a reason)
- bundling all three into one PR (each is independent)
- expanding scope beyond what `1C.2` explicitly named as deferred

## Deferred Items

### Item A: Planner Loop Leader Election

**Source:** `1C.2` plan, Known Tradeoffs §1

**Current state in main:**

- enqueue dedupe via `job_outbox.dedupe_key` unique index handles duplicate
  planner wakeups across app instances
- atomic claim protocol prevents two processors picking up the same row
- duplicate planner work is correct but wasteful

**Trigger to act:** multi-instance planner churn becomes operationally
meaningful (visible in logs, measurable scheduler latency, or operator
complaints). Until then, accepted as cost.

**Approximate scope when acted on:**

- pick a leader election primitive (advisory locks, dedicated table row, or
  external coordinator)
- gate planner loop entry on leader status
- add health/observability for leader transitions
- prove correctness when the leader process crashes mid-window

### Item B: Auto-Resolve Superseded Baseline-Scoped Incidents

**Source:** `1C.2` plan, Known Tradeoffs §2

**Current state in main:**

- baseline rotation accumulates older open incidents
- partial mitigation already shipped in `b8d3bd60` (alerts filter to current
  baseline by default)
- no automatic resolution of the older-baseline incidents themselves

**Trigger to act:** operators report stale-incident clutter, or LP-facing
reports surface the older baselines, or the alert filter UX proves insufficient.

**Approximate scope when acted on:**

- decide whether old-baseline incidents are manually filtered, automatically
  superseded, or explicitly resolved
- if auto-supersede, define the lifecycle event that triggers it (baseline
  rotation, default change, or explicit retire action)
- preserve audit trail so a resolved incident can still be investigated
- avoid double-firing the original alert if the same condition recurs against
  the new baseline

### Item C: Move Scheduler To Dedicated Worker Process

**Source:** `1C.2` plan, Known Tradeoffs §3

**Current state in main:**

- planner and processor loops run in-process inside the web app
- `job_outbox` is the durable boundary, so this is acceptable today
- bounded by current workload and deployment topology

**Trigger to act:** background workload grows materially, deployment topology
gains a worker tier for other reasons, or web-app restarts become a scheduler
correctness liability.

**Approximate scope when acted on:**

- factor planner and processor into a standalone entrypoint
- decide health/observability surface for the new process (separate health
  endpoint, separate metrics labels, or shared)
- decide deploy/release coupling with the web app
- add an integration test that runs the worker process end-to-end against a
  migrated Postgres harness

## Promotion Criteria

An item leaves this backlog and gets its own plan document when at least one of
the following is true:

- the trigger condition above has fired
- a related milestone makes the work cheaper to bundle than to defer
- a security or correctness issue elevates it from optimization to bug
- the operator team explicitly requests it

Until then, this document is the only place the items live.

## Out Of Scope For This Backlog Doc

This file does not contain:

- implementation strategy
- file lists or service shapes
- test plans
- exit criteria

Those belong in a focused plan document created at promotion time, in the same
shape as the `1C.2` plan.

## References

- `docs/plans/2026-04-02-phase-1c2-alert-scheduling-and-remaining-capital-plan.md`
- `docs/plans/2026-04-02-phase-1c1-alert-evaluation-implementation-strategy.md`
- `docs/plans/2026-03-31-variance-roadmap-revision.md`
- commit `5c002e3c` (1C.2 implementation)
- commit `b8d3bd60` (current-baseline alert filter; partial Item B mitigation)
- commit `c554ddca` (baseline creation hardening)
- commit `3e9a360c` (variance automation proof trustworthiness)
