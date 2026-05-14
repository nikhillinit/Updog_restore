---
status: ACTIVE
last_updated: 2026-05-14
owner: Core Team
review_cadence: P14D
---

# T4/T5 Follow-Up Tranches

Purpose: track known post-review gaps from the T4 fund-scope work and T5
accessibility gate reduction. These are not complete until each checklist item
has either a code fix, a regression test, or an explicit deletion rationale.

## Tranche A: Fund-Scope Route Rollout

Current state: `enforceProvidedFundScope` protects only the first route slice.
The remaining fund-scoped surfaces below must be migrated or explicitly proven
covered by a stronger existing auth/RLS boundary. Do not describe T4 as "fund
scoping complete" until this checklist is closed.

- [ ] `server/routes/backtesting.ts`
- [ ] `server/routes/performance-api.ts`
- [ ] `server/routes/performance-metrics.ts`
- [ ] `server/routes/scenario-analysis.ts`
- [ ] `server/routes/sensitivity.ts`
- [ ] `server/routes/cashflow.ts`
- [ ] `server/routes/monte-carlo.ts`
- [ ] `server/routes/reallocation.ts`
- [ ] `server/routes/cohort-analysis.ts`
- [ ] `server/routes/portfolio/snapshots.ts`
- [ ] `server/routes/portfolio/versions.ts`
- [ ] `server/routes/dashboard-summary.ts`
- [ ] `server/routes/timeline.ts`
- [ ] `server/routes/sse-events.ts`
- [ ] `server/routes/liquidity.ts`
- [ ] `server/routes/engine-summaries.ts`
- [ ] `server/routes/lp-api.ts`
- [ ] `server/routes/lp-reporting/*`
- [ ] `server/routes/portfolio-intelligence.ts`
- [ ] `server/routes/allocation-scenarios.ts`
- [ ] `server/routes/activities.ts`
- [ ] `server/routes/shares.ts`

Minimum acceptance criteria:

- Each route with a fund ID from params, query, body, or derived records checks
  the authenticated fund scope before returning fund-specific data.
- Negative-control tests cover wrong fund, empty unrestricted scope, expired
  token, and wrong-secret token where JWT validation is involved.
- Scope checks run before route logic leaks fund existence or validity beyond
  the intended auth boundary.

## Tranche B: Accessibility Coverage Restoration

Current state: `tests/e2e/accessibility.spec.ts` is a critical-only gate.
Restore or replace the deleted broader checks before treating T5 as the final
accessibility coverage posture.

- [ ] Heading hierarchy coverage.
- [ ] Image and icon text alternative coverage.
- [ ] Form label/name coverage.
- [ ] Color contrast coverage.
- [ ] Modal focus-trap coverage.
- [ ] High-contrast mode coverage.

Minimum acceptance criteria:

- The restored checks are either active, or skipped with a linked implementation
  issue and a concrete owner/date.
- The critical-only smoke remains as a fast deployment gate, but no longer reads
  as the whole accessibility contract.

## Tranche C: Truthfulness Regression Tests

Current state: several T2/T3/T6 tests assert that honest pending/empty copy is
present, but not that old misleading content is absent.

- [ ] Add absence assertions for prior "Live Data" and "Real-time" phrasing
      anywhere T3 renamed projected scenario content.
- [ ] Add absence assertions for synthesized KPI cards and fake actuals in new
      pending/empty states.
- [ ] Add absence assertions for deferred-ledger labels so missing server data
      cannot silently render as actuals.

Minimum acceptance criteria:

- Each truthful empty/pending state test asserts both presence of the new honest
  state and absence of the old misleading state.

## Tranche D: Silent Fallback Audit

Current state: fallback paths can mix canonical server data with stale client or
direct database data.

- [ ] Remove or feature-flag the T2 `totalCommitted` client fallback.
- [ ] Remove or feature-flag the T4 `getFund` direct DB fallback in actual
      metrics calculation paths.
- [ ] Remove or feature-flag the T4 allocations DB-to-memory fallback, or make
      cursor pagination behavior identical across both branches.

Minimum acceptance criteria:

- Fallback behavior is either deleted, gated by an explicit flag, or proven to
  preserve the same authorization and pagination contract as the primary path.
