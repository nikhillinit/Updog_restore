# Code Review: Daily Decision Workspace Implementation Plan (F_1.7.0)

**Review Date**: 2026-08-28  
**Version**: n/a — F_1.7.0 family releases ride PRs without a version bump
(package version remains 1.6.0) **Files Reviewed**:

- `.github/path-filters.yml`
- `audit/surface-contract-matrix/MATRIX.md`
- `audit/surface-contract-matrix/boot-proofs.json`
- `audit/surface-contract-matrix/dormant-candidates.json`
- `audit/surface-contract-matrix/g1-review.json`
- `audit/surface-contract-matrix/listener-dispositions.json`
- `audit/surface-contract-matrix/matrix.json`
- `audit/surface-contract-matrix/orphans.json`
- `audit/surface-contract-matrix/requirements.json`
- `audit/surface-contract-matrix/runtime-exclusions.json`
- `audit/surface-contract-matrix/source-inventory.json`
- `client/src/hooks/useVarianceData.ts`
- `client/src/pages/variance-tracking.tsx`
- `docs/1-plans/F_1.7.0_daily-decision-workspace.plan.md`
- `server/route-policy/api-route-policy-registry.ts`
- `server/routes/construction-reconciliation.ts`
- `server/routes/mount-common-routes.ts`
- `server/services/construction-reconciliation-service.ts`
- `shared/contracts/construction-reconciliation-v1.contract.ts`
- `shared/routes/api-route-manifest.ts`
- `shared/schema/fund.ts`
- `tests/config/testcontainers-test-paths.mjs`
- `tests/integration/construction-reconciliation.pg.test.ts`
- `tests/unit/pages/variance-tracking-construction-reconciliation.test.tsx`
- `tests/unit/pages/variance-tracking.test.tsx`
- `tests/unit/server/common-route-manifest.test.ts`
- `tests/unit/services/construction-reconciliation-service.test.ts`
- `tests/unit/services/time-travel-current-forecast-v2-invisibility.test.ts`

**Plan**: `docs/1-plans/F_1.7.0_daily-decision-workspace.plan.md`

---

## Executive Summary

Change implements C1A deployable-capital reconciliation with deterministic
persisted snapshots, idempotent advisory-locked writes, server-resolved
financial-facts heads, strict replay validation, and explicit UI freshness
states. All fixable findings were addressed; one concurrency concern was
accepted as an intentional design boundary after demonstrating immutable input
pinning and truthful labeling.

APPROVED

---

## Changes Overview

Change adds strict shared contracts, POST-run and GET-latest routes,
reconciliation computation and persistence, route-policy and manifest
registration, non-timeline snapshot isolation, generated surface-contract
evidence, and real-PostgreSQL concurrency tests. Variance workspace now loads
persisted reconciliation data, explicitly generates or refreshes snapshots,
displays source IDs and warnings, and surfaces readback or stale-cache failures
without presenting cached data as current.

---

## Findings

### Critical Issues

None.

### Major Issues

- **Cross-service facts publication could advance after head validation** —
  `server/services/construction-reconciliation-service.ts:685-720`,
  `docs/1-plans/F_1.7.0_daily-decision-workspace.plan.md:308-339`.
  **Disposition: accepted override.** Reconciliation remains deterministic over
  immutable plan/facts rows and persists both source IDs and `asOfDate`;
  purpose-scoped advisory lock intentionally serializes C1A writers rather than
  unrelated facts publishers. A concurrent publication can make result
  immediately stale, but not incorrect or unlabeled.

- **Structured warnings were lost after persistence and replay** —
  `server/services/construction-reconciliation-service.ts:92-105`,
  `server/services/construction-reconciliation-service.ts:753-760`.
  **Disposition: addressed.** Compute-time warnings now persist in strict
  metadata and are returned by replay and GET-latest. Regression proof covers
  `NON_EQUITY_AMOUNT_ONLY` at
  `tests/unit/services/construction-reconciliation-service.test.ts:381-396`.

- **Client-pinned facts snapshot could reject otherwise valid refreshes after
  facts advanced** —
  `shared/contracts/construction-reconciliation-v1.contract.ts:35-44`,
  `server/services/construction-reconciliation-service.ts:707-720`.
  **Disposition: addressed.** Facts ID is optional; server resolves current
  non-superseded head inside locked transaction while `requestedFactsSnapshotId`
  preserves exact request-hash reconstruction. Replay-after-advance proof:
  `tests/integration/construction-reconciliation.pg.test.ts:476-522`; UI
  omission proof:
  `tests/unit/pages/variance-tracking-construction-reconciliation.test.tsx:269-276`.

- **Successful POST did not await GET-latest readback, allowing stale cached
  data to appear current after reload failure** —
  `client/src/pages/variance-tracking.tsx:789-810`,
  `client/src/pages/variance-tracking.tsx:1067-1072`,
  `client/src/pages/variance-tracking.tsx:1140-1149`. **Disposition:
  addressed.** Persisted runs await readback, render explicit failure state, and
  warn when cached labeled data remains visible. Regression proof:
  `tests/unit/pages/variance-tracking-construction-reconciliation.test.tsx:284-346`.

### Minor Issues

- **GET-latest matrix personas omitted valid readers** —
  `audit/surface-contract-matrix/MATRIX.md:155-160`. **Disposition: addressed.**
  Generated row now records `admin`, `analyst`, and `gp`, matching read-route
  authorization at `server/routes/construction-reconciliation.ts:109`.

- **New files contained trailing EOF whitespace** —
  `server/routes/construction-reconciliation.ts:158`,
  `server/services/construction-reconciliation-service.ts:817`,
  `shared/contracts/construction-reconciliation-v1.contract.ts:163`.
  **Disposition: addressed.** Extra blank lines removed; final staged and
  unstaged diff checks are clean.

- **Plan no longer described implemented request, metadata, and UI readback
  behavior** — `docs/1-plans/F_1.7.0_daily-decision-workspace.plan.md:187-193`,
  `docs/1-plans/F_1.7.0_daily-decision-workspace.plan.md:346-354`,
  `docs/1-plans/F_1.7.0_daily-decision-workspace.plan.md:383-395`.
  **Disposition: addressed.** Plan now documents optional facts ID, server head
  resolution, `requestedFactsSnapshotId`, persisted warnings, awaited readback,
  and stale-cache disclosure.

- **Refresh button re-enabled while GET-latest readback remained in flight** —
  `client/src/pages/variance-tracking.tsx:785-810`,
  `client/src/pages/variance-tracking.tsx:1002-1018`. **Disposition:
  addressed.** Dedicated busy state spans mutation and readback, preventing
  duplicate-key POSTs. Regression proof:
  `tests/unit/pages/variance-tracking-construction-reconciliation.test.tsx:284-317`.

- **Readback-error and cached-stale warning branches lacked complete regression
  coverage** — `client/src/pages/variance-tracking.tsx:1067-1072`,
  `client/src/pages/variance-tracking.tsx:1140-1149`. **Disposition:
  addressed.** Initial remediation covered explicit readback failure and busy
  lifecycle; final test also seeds cached persisted data, fails refetch, and
  verifies retained plan/facts/as-of labels plus stale warning at
  `tests/unit/pages/variance-tracking-construction-reconciliation.test.tsx:320-346`.

### Suggestions

None.

---

## Checklist

- [x] 1. Functional Requirements — passed
- [x] 2. Code Quality — passed
- [x] 3. Architectural Compliance — passed
- [x] 4. Error Handling — passed
- [x] 5. Security — passed
- [x] 6. Performance — passed

---

## Verdict

**APPROVED**

All fixable findings are resolved, documentation matches final behavior, and
supplied lint, three-project typecheck, targeted UI/service tests,
real-PostgreSQL concurrency tests, and diff checks are green. Accepted
lock-scope override preserves deterministic correctness and explicit provenance;
downstream matrix owner approval remains a separate governance action.
