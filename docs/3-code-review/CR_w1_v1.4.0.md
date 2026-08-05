# Code Review: Activation Blockers & Runtime Completion (Pre-Soak)

**Review Date**: 2026-08-04  
**Version**: 1.4.0  
**Files Reviewed**:

- `CHANGELOG.md`
- `DECISIONS.md`
- `config/calculation-migration-manifest.json`
- `docs/1-plans/F_1.0.0_activation-blockers-runtime.plan.md`
- `docs/_generated/router-fast.json`
- `docs/_generated/router-index.json`
- `docs/_generated/staleness-report.md`
- `docs/runbooks/current-forecast-shadow-soak.md`
- `flags/registry.yaml`
- `server/lib/transaction-support.ts`
- `server/route-policy/api-route-policy-registry.ts`
- `server/routes/current-forecast.ts`
- `server/routes/dual-forecast.ts`
- `server/routes/financial-facts.ts`
- `server/routes/fund-metrics.ts`
- `server/services/current-forecast-reference-service.ts`
- `server/services/current-forecast-resume-command.ts`
- `server/services/current-forecast-serving-seam.ts`
- `server/services/current-forecast-shadow-service.ts`
- `server/services/current-forecast-shadow-trigger.ts`
- `server/services/current-forecast-v2-service.ts`
- `server/services/fund-calculation-mode-service.ts`
- `server/services/h9-artifact-invalidation-service.ts`
- `server/services/internal-analysis/analysis-checkpoint-service.ts`
- `tests/integration/current-forecast-reference.pg.test.ts`
- `tests/unit/routes/current-forecast-resume.behavior.test.ts`
- `tests/unit/routes/financial-facts.contract.test.ts`
- `tests/unit/scripts/legacy-calculation-consumers.test.ts`
- `tests/unit/services/current-forecast-activation-gate.test.ts`
- `tests/unit/services/current-forecast-reference-service.test.ts`
- `tests/unit/services/current-forecast-resume-command.test.ts`
- `tests/unit/services/current-forecast-shadow-service.test.ts`
- `tests/unit/services/current-forecast-shadow-trigger.test.ts`
- `tests/unit/services/current-forecast-v2-service.test.ts`
- `tests/unit/services/fund-calculation-mode-service.current-forecast.test.ts`
- `tests/unit/services/fund-calculation-mode-service.test.ts`
- `tests/unit/services/internal-analysis/analysis-checkpoint-shadow-trigger.test.ts`

**Plan**: `docs/1-plans/F_1.0.0_activation-blockers-runtime.plan.md`

---

## Executive Summary

Change completes pre-soak Current-Forecast V2 runtime: shadow reachability and
execution, deterministic evidence, resume/re-arm recovery, legacy facade
isolation, and inert flag retirement. Iterative review found nine Major issues;
all were addressed. Two bounded runtime trade-offs remain as accepted
observations.

**APPROVED with observations**

---

## Changes Overview

Change introduces production shadow triggers at both facts-commit call sites,
exact-basis baseline/replay handling, latest-decisive-observation activation
gating, and deterministic soak evidence reconstruction. It adds authenticated
resume/re-arm recovery, bounded Neon HTTP transaction fallback, route policy
coverage, and real-PostgreSQL verification. It also centralizes remaining legacy
metric consumers behind a serving seam and removes the inert Current-Forecast
feature flag.

---

## Findings

### Critical Issues

None.

### Major Issues

1. **Neon HTTP rejected callback transactions**  
   **Location**: `server/lib/transaction-support.ts:13-35`,
   `server/services/current-forecast-v2-service.ts:377-419`,
   `server/services/current-forecast-reference-service.ts:173-229`,
   `server/services/current-forecast-resume-command.ts:103-212`  
   Production Vercel uses `drizzle-orm/neon-http`, which does not support
   callback transactions. Newly introduced baseline and resume paths would
   therefore fail before performing runtime work.  
   **Disposition**: Addressed. Exact Neon unsupported-transaction errors now
   fall back to the plain autocommit executor; other errors remain fatal.

2. **Failure dedupe omitted plan and snapshot identity**  
   **Location**: `server/services/current-forecast-shadow-trigger.ts:67-91`,
   `server/services/current-forecast-shadow-service.ts:109-127`  
   Initial failure hashes used only facts identity and clock, allowing failures
   from different plan or baseline-snapshot bases to conflict.  
   **Disposition**: Addressed. Failure identity and durable markers now include
   facts, plan, fund snapshot, and clock.

3. **Pre-receipt failures still collapsed distinct plan bases**  
   **Location**: `server/services/current-forecast-shadow-trigger.ts:351-364`,
   `server/services/current-forecast-v2-service.ts:195-212`,
   `server/services/internal-analysis/analysis-checkpoint-service.ts:1417-1475`  
   Receipt-backed
   identity was corrected first, but failures occurring before receipt creation
   still lacked a resolved plan identity.  
   **Disposition**: Addressed for known plans. Both runtime paths resolve plan
   identity before fallible forecast work; positive plan IDs are carried into
   execution and failure persistence.

4. **Shadow timeout did not cover full request lifecycle**  
   **Location**: `server/services/current-forecast-shadow-trigger.ts:182-284`,
   `server/services/current-forecast-shadow-trigger.ts:327-368`  
   Mode resolution, facts lookup, receipt creation, and failure persistence
   originally occurred outside the timeout boundary, permitting facts responses
   to hang indefinitely.  
   **Disposition**: Addressed. One bounded execution race covers mode, facts,
   plan, receipt, and replay work. Failure persistence has its own five-second
   cap with late-settlement logging.

5. **Required soak evidence was not durably reconstructable**  
   **Location**: `server/services/current-forecast-shadow-service.ts:117-127`,
   `server/services/current-forecast-shadow-service.ts:193-205`,
   `server/services/current-forecast-shadow-service.ts:234-252`,
   `docs/runbooks/current-forecast-shadow-soak.md:276-347`  
   Runtime triggers returned no outcomes, and initial ledger rows did not retain
   enough basis information to reconstruct every evaluator input.  
   **Disposition**: Addressed. Failed rows carry deterministic basis markers,
   while value-producing rows can be reconstructed from persisted snapshots.

6. **Initial reconstruction SQL selected ambiguous or incomplete bases**  
   **Location**: `docs/runbooks/current-forecast-shadow-soak.md:278-327`  
   First reconstruction query joined every matching snapshot, omitted pinned
   expected hashes and clock, and excluded unavailable outcomes included by the
   evaluator.  
   **Disposition**: Addressed. Query uses a lowest-ID lateral join, exposes
   pinned and replay hashes plus clock, computes replay consistency, includes
   unavailable outcomes, and documents evaluator outcome construction.

7. **Required transaction helper was absent from the reviewable patch**  
   **Location**: `server/lib/transaction-support.ts:1-36`  
   Runtime services imported a new helper that remained untracked and absent
   from `git diff HEAD`, which would have produced a broken commit.  
   **Disposition**: Addressed. Helper is staged and included in the final change
   set.

8. **Plan lookup failure persisted `facts=0` despite a resolved facts row**  
   **Location**: `server/services/current-forecast-shadow-trigger.ts:335-364`  
   Facts identity was initially assigned only after plan resolution. A plan
   lookup failure therefore discarded the already-resolved facts ID and
   broadened failure dedupe collisions.  
   **Disposition**: Addressed. Facts identity is pinned immediately after
   hash-based lookup and before plan resolution.

9. **Checkpoint execution and failure persistence could identify different
   plans**  
   **Location**: `server/services/internal-analysis/analysis-checkpoint-service.ts:1417-1442`,
   `server/services/internal-analysis/analysis-checkpoint-service.ts:1466-1475`  
   Checkpoint
   pre-resolved plan A for failure identity but allowed forecast execution to
   independently read the latest plan. Concurrent replacement could execute plan
   B while persisting failure as plan A.  
   **Disposition**: Addressed. Positive resolved plan IDs are passed into
   forecast execution and reused for failure persistence.

### Minor Issues

1. **Autocommit resume can leave a pending idempotency claim**  
   **Location**: `server/services/current-forecast-resume-command.ts:108-165`,
   `server/services/current-forecast-resume-command.ts:196-200`  
   Neon fallback cannot atomically combine claim, validation, mutation, and
   ledger completion. Interrupted or pre-completion requests can leave a pending
   claim, making same-key replay report in-progress.  
   **Disposition**: Accepted with override. Atomic claim and version-guarded
   update preserve mutation safety; documented recovery uses a fresh key after
   refetching current version.

2. **No-plan and failed-plan-lookup paths intentionally omit an explicit
   execution pin**  
   **Location**: `server/services/current-forecast-shadow-trigger.ts:72-78`,
   `server/services/current-forecast-shadow-trigger.ts:128-140`,
   `server/services/current-forecast-shadow-trigger.ts:355-364`,
   `server/services/internal-analysis/analysis-checkpoint-service.ts:1438-1440`  
   Sentinel
   `0` renders as `plan=none`; omitted identity renders as `plan=unknown`. These
   branches allow execution's own plan resolution rather than passing a
   nonexistent or unresolved plan ID.  
   **Disposition**: Accepted with override. Requester explicitly designated this
   sentinel behavior as intentional; positive plan identities remain fully
   pinned.

### Suggestions

1. **Activation-time transaction paths remain deferred**  
   **Location**: `server/services/current-forecast-reference-service.ts:342`,
   `server/services/current-forecast-reference-service.ts:607`,
   `server/services/fund-calculation-mode-service.ts:869`  
   Pointer advance, activation, and generic calculation-mode update still use
   callback transactions unsupported by Neon HTTP.  
   **Disposition**: Accepted scope deferral. These Phase-2 activation-time
   commands are tracked for `F_1.2.0` and are outside this release's pre-soak
   runtime path.

---

## Checklist

- [x] 1. Functional Requirements — passed; all planned pre-soak runtime behavior
      implemented.
- [x] 2. Code Quality — passed.
- [ ] 3. Architectural Compliance — passed with accepted Neon autocommit and
      Phase-2 transaction deferral observations.
- [ ] 4. API & Backend Best Practices — passed with accepted fresh-key recovery
      behavior for interrupted Neon resume operations.
- [x] 5. Calculation Correctness (Phoenix) — passed; `phoenix:truth` reported
      336 passing cases and real-PostgreSQL integration passed.
- [x] 6. Frontend & React Conventions — not applicable; no frontend logic
      changed.
- [ ] 7. Error Handling — passed with accepted `plan=none`/`plan=unknown`
      sentinel and pending-claim recovery observations.
- [x] 8. Security — passed; authenticated, fund-scoped, admin-only mutation
      routes and policy verification preserved.
- [x] 9. Performance — passed; shadow execution and failure persistence are
      bounded.

---

## Verdict

**APPROVED with observations**

No Critical or Major findings remain open. Accepted observations are limited to
explicit Neon autocommit recovery semantics, no-plan/unknown sentinel handling,
and Phase-2 activation-command transaction work deferred to `F_1.2.0`.
Validation evidence: lint and three-project typecheck clean; 89 targeted tests
passed; full suite reported 11,844 passes with one unrelated resource-ceiling
tail flake green in isolation; `phoenix:truth` 336; `policy:verify` 140;
documentation checks and real-PostgreSQL integration passed.
