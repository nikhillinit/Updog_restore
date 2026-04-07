# Phase 1: Variance Automation 1C.3 Follow-Ons - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution
> agents. Decisions are captured in CONTEXT.md — this log preserves the
> alternatives considered.

**Date:** 2026-04-07 **Phase:** 01-variance-automation-1c3-followons **Areas
discussed:** Leader election primitive, Leader gate scope, Items B and C fate

---

## Gray Area Selection

| Option                    | Description                                                                            | Selected |
| ------------------------- | -------------------------------------------------------------------------------------- | -------- |
| Leader election primitive | How to elect the planner leader (advisory lock / heartbeat table / Redis)              | yes      |
| Leader gate scope         | What the leader gate actually gates (planner / +processor / +recovery)                 | yes      |
| Observability surface     | Signals on leader transitions (log+health / +Prometheus / +dedicated metrics endpoint) | no       |
| Items B and C fate        | Success criterion 4 decision (re-defer / split / bundle)                               | yes      |

**Observability surface** was not selected by the user and was resolved as
Claude's Discretion in CONTEXT.md (Pino log + `getHealth()` extension,
Prometheus optional).

---

## Leader Election Primitive

### Q1: Which primitive should the variance planner use to elect a leader?

| Option                                        | Description                                                                                                                                                                                                                        | Selected |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Heartbeat table row                           | New `variance_planner_leader` table, atomic `UPDATE` takeover. PgBouncer-safe, SQL-debuggable, explicit lease semantics. One migration + renewal loop.                                                                             | yes      |
| Postgres advisory lock with pinned connection | Reuse `server/lib/locks.ts` `DistributedLock`. Requires dedicated non-pooled connection because Neon PgBouncer in transaction mode drops session locks between queries. Zero migrations but violates pooled-connection assumption. |          |
| Redis lock (Redlock / SET NX EX)              | Use ioredis from `server/queues/redis-connection.ts`. Introduces Redis as a correctness dependency for a Postgres-native scheduler; split-brain risk; degrades silently on `memory://` fallback in dev/test.                       |          |
| Something else                                | Freeform alternative.                                                                                                                                                                                                              |          |

**User's choice:** Heartbeat table row **Notes:** Rationale captured in
CONTEXT.md D-01. The PgBouncer gotcha (session-scoped `pg_try_advisory_lock`
does not survive across queries in transaction mode) was surfaced during the
scout and directly eliminated the advisory-lock path.

### Q2: Lease duration and renewal cadence

| Option                      | Description                                                               | Selected |
| --------------------------- | ------------------------------------------------------------------------- | -------- |
| Lease 10 min, renew 2.5 min | 2× planner interval. Worst-case takeover ≈ 10 min.                        | yes      |
| Lease 15 min, renew 5 min   | 3× planner interval, renewal piggybacks on planner tick. Longer takeover. |          |
| Lease 2 min, renew 30 sec   | Fast takeover but tight renewal timer risks event-loop lag under MC load. |          |
| Configurable via env        | `VARIANCE_PLANNER_LEASE_MS` + `VARIANCE_PLANNER_RENEWAL_MS`.              |          |

**User's choice:** Lease 10 min, renew every 2.5 min **Notes:** The env-tunable
pattern is still adopted as an implementation detail (see D-02) — the user
picked the default values.

### Q3: Leader scope

| Option               | Description                                                                     | Selected |
| -------------------- | ------------------------------------------------------------------------------- | -------- |
| Single global leader | One elected leader owns the full planner loop across all frequencies and funds. | yes      |
| Per-frequency leader | Three independent locks (hourly/daily/weekly).                                  |          |

**User's choice:** Single global leader **Notes:** Per-frequency is deferred to
the "Deferred Ideas" section. Not needed at current scale.

---

## Leader Gate Scope

### Q1: What does the leader gate actually gate in variance-alert-automation.ts?

| Option                               | Description                                                                                                                      | Selected |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Planner only                         | Only `runPlannerCycle()` checks `isLeader()`. Processor and recovery stay on every instance. Minimum viable, maximum resilience. | yes      |
| Planner + processor                  | Both loops gate. Processor is already safe via atomic claim — pure waste-reduction bonus.                                        |          |
| Planner + processor + recovery sweep | All three timers gate. Longer stale-row recovery delay on leader crash (~15 min worst case).                                     |          |

**User's choice:** Planner only **Notes:** Matches the acceptance criterion
literally and keeps processor/recovery running on all instances so work drains
continuously even during a leader handoff.

---

## Items B and C Fate

### Q1: What should happen to Items B and C from the 1C.3 backlog?

| Option                                 | Description                                                                                         | Selected |
| -------------------------------------- | --------------------------------------------------------------------------------------------------- | -------- |
| Re-defer both with updated rationale   | Phase 1 ships Item A only. Backlog doc's `Trigger to act` lines restated with 2026-04-07 rationale. | yes      |
| Split Item B into sibling Phase 1.1    | Add Phase 1.1 for baseline-incident supersede lifecycle. Re-defer C.                                |          |
| Split both B and C into sibling phases | Add Phase 1.1 (B) and Phase 1.2 (C). Grows M8 from 4 to 6 phases.                                   |          |
| Ship Item B alongside A in Phase 1     | Violates "do not bundle" constraint from the backlog doc.                                           |          |

**User's choice:** Re-defer both with updated rationale **Notes:** Respects the
"do not bundle" constraint. Triggers restated in D-05 and D-06. The backlog doc
update is the only documentation change that rides in the Phase 1 PR (D-07).

---

## Final Checkpoint

### Q: Ready for CONTEXT.md, or one more area?

| Option                            | Description                                                    | Selected |
| --------------------------------- | -------------------------------------------------------------- | -------- |
| Ready for context                 | Write CONTEXT.md + DISCUSSION-LOG.md, commit, update STATE.md. | yes      |
| One more area: crash-test harness | Discuss integration test design for leader takeover.           |          |
| One more area: observability      | Revisit Pino + health vs Prometheus.                           |          |

**User's choice:** Ready for context **Notes:** Crash-test harness shape and
observability detail resolved as Claude's Discretion in CONTEXT.md. Crash test
defaults to lease-expiry simulation (no process spawning, per REFL-024 lesson).
Observability defaults to Pino log + `getHealth()` extension, with Prometheus as
optional nice-to-have.

---

## Claude's Discretion

- Instance identity shape (`leader_id` column value)
- Migration file naming and exact column types/indexes
- Exact takeover SQL shape (`UPDATE ... RETURNING` vs
  `SELECT FOR UPDATE + UPDATE` vs `INSERT ... ON CONFLICT DO UPDATE`)
- Observability surface beyond Pino log + `getHealth()` extension (Prometheus
  gauge is optional)
- Crash integration test harness (recommended: lease-expiry simulation in test
  DB)
- Renewal timer lifecycle (dedicated `NodeJS.Timeout` vs piggyback on existing
  planner interval)
- DB-unavailability-during-renewal behavior (recommended: fail-safe, drop
  leadership)

## Deferred Ideas

- Item B (auto-resolve superseded baseline-scoped incidents) — remains in 1C.3
  backlog, trigger restated
- Item C (dedicated scheduler worker process) — remains in 1C.3 backlog, trigger
  restated
- Per-frequency leader locks — future optimization if one tick becomes slow
- Prometheus gauge `variance_planner_is_leader{instance}` — candidate for a
  later observability polish
- Applying the same `*_leader` table pattern to other in-process schedulers —
  pattern note for future authors
