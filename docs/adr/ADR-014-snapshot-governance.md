---
status: ACTIVE
last_updated: 2026-05-22
---

# ADR-014: Snapshot Governance

**Date**: 2026-04-05 **Status**: Accepted

## Context

Current `main` contains two different snapshot families with materially
different shapes and lifecycle semantics:

- `fund_snapshots`
  - engine/run-oriented analytical snapshots
  - typed by output (`RESERVE`, `PACING`, `COHORT`, etc.)
  - used by calculation lifecycle, fund-results reads, variance reads, and
    related analytical services
- `fund_state_snapshots`
  - application state captures for time-travel/versioning/restore workflows
  - surrounded by versioning, restore, comparison, and restore-job records
  - used by backtesting/time-travel style state-management flows

The repo has been carrying both tables without one explicit governance record,
which creates recurring confusion in planning and status reports.

## Decision

### 1. `fund_snapshots` is the analytical snapshot store

Use `fund_snapshots` for persisted engine or run-attributed analytical outputs
that are read by:

- fund results
- calculation lifecycle/state derivation
- variance and analytical comparisons
- other read-side consumers that need typed engine output by fund/config/run

Key properties:

- analytical payloads
- type-scoped (`RESERVE`, `PACING`, `COHORT`, etc.)
- config/run attribution where available
- not intended to be a user-restorable full application state record

### 2. `fund_state_snapshots` is the time-travel/state-versioning store

Use `fund_state_snapshots` for user/workflow state captures that support:

- time-travel browsing
- versioning
- restore workflows
- state-to-state comparison
- restore jobs and rollback lineage

Key properties:

- broader application-state payloads
- snapshot versions and lineage
- restore-target semantics
- not the default read source for analytical result sections

### 3. Do not cross the responsibility boundary by default

- Do not use `fund_state_snapshots` to satisfy analytical results/variance reads
  when the service expects typed engine output.
- Do not use `fund_snapshots` as the canonical restore/versioned state source
  for time-travel workflows.
- If a feature truly needs both, the bridge must be explicit in the
  service-level contract and should reference this ADR.

## Consequences

### Positive

- Planning/status docs can stop treating the two tables as ambiguous
  substitutes.
- Read-side analytics and restore/versioning features have distinct canonical
  stores.
- Future remediation work can reference one boundary instead of re-litigating
  table ownership.

### Negative

- Some services or documents may still use fuzzy language and require
  follow-through cleanup.
- Any feature that genuinely spans both stores must document the bridge rather
  than rely on implicit equivalence.

## Follow-Through

The current-main remediation queue should:

1. reference this ADR from docs describing snapshot governance
2. keep restore/time-travel wording aligned to `fund_state_snapshots`
3. keep analytical read-model wording aligned to `fund_snapshots`

## References

- `shared/schema/fund.ts`
- `shared/schema.ts`
- `server/services/fund-results-read-service.ts`
- `server/services/fund-state-read-service.ts`
- `server/services/time-travel-analytics.ts`
- `server/services/backtesting-service.ts`
- `docs/plans/2026-03-31-variance-roadmap-revision.md` (historical sequencing
  framework updated after the April 5 archive tree was pruned)
