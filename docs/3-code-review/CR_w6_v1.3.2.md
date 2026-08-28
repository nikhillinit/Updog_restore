# Code Review: Governed Production Release Path

**Review Date**: 2026-08-28  
**Version**: 1.3.2 (plan F_1.3.2; package version remains 1.6.0)  
**Files Reviewed**:

- `.github/workflows/release-production.yml`
- `CHANGELOG.md`
- `DECISIONS.md`
- `docs/1-plans/F_1.3.2_governed-production-release-path.plan.md`
- `docs/_generated/router-index.json`
- `docs/_generated/staleness-report.md`
- `docs/workflows/PRODUCTION_SCRIPTS.md`
- `docs/workflows/railway-provider-contract-evidence-f132.md`
- `scripts/deploy-production.ps1`
- `scripts/release/collect-provider-evidence.mjs`
- `scripts/release/deploy-railway-workers.mjs`
- `scripts/release/railway-graphql-transport.mjs`
- `scripts/release/verify-provider-identity.mjs`
- `scripts/release/wait-railway-workers.mjs`
- `shared/contracts/release-evidence-manifest-v1.contract.ts`
- `tests/regressions/ci-fail-closed.test.ts`
- `tests/unit/contracts/release-evidence-manifest-v1.contract.test.ts`
- `tests/unit/scripts/deploy-railway-workers.test.mjs`
- `tests/unit/scripts/production-release-dispatch-block.test.mjs`
- `tests/unit/scripts/railway-graphql-transport.test.mjs`
- `tests/unit/scripts/verify-provider-identity.test.mjs`
- `tests/unit/scripts/wait-railway-workers.test.mjs`

**Plan**: `docs/1-plans/F_1.3.2_governed-production-release-path.plan.md`

---

## Executive Summary

Change establishes an owner-dispatched, exact-SHA production-release path with
two-phase Railway worker deployment, provider-identity fencing, and fail-closed
evidence handling. All eight findings raised across the review loop were
addressed or resolved through an accepted role-separation decision. APPROVED.

---

## Changes Overview

Release workflow now supports `railway-workers-only` and full modes, deploying
two Railway worker services through a fixed-purpose GraphQL helper before
exact-ID verification and promotion. Deployment reuse requires exact service,
environment, SHA, success, and running-state proof; ambiguous mutations preserve
recovery handles.

Evidence finalization now distinguishes workers-only runs from full releases,
and the manifest failure-stage contract includes the new deployment job.
Documentation, workflow guardrails, transport helpers, and affected tests were
updated in lockstep.

---

## Findings

### Critical Issues

None.

### Major Issues

- **[HIGH] G4 evidence could not identify deployments created later in the same
  run — addressed.** Two-phase dispatch now deploys and verifies workers first,
  allowing owner evidence capture before a full-mode dispatch reuses the
  unchanged exact-SHA deployments. References:
  `.github/workflows/release-production.yml:10`,
  `.github/workflows/release-production.yml:592`.

- **[HIGH] Deployment helper lacked returned-target and running-state proof;
  reuse initially bypassed those checks — addressed with accepted role
  separation.** Reuse candidates are re-read by exact ID, checked against
  service and environment, and accepted only when successful, exact-SHA, and not
  stopped. Duplicating worker instance-health verification inside this helper
  was overridden because the immediately downstream waiter owns that proof.
  References: `scripts/release/deploy-railway-workers.mjs:448`,
  `scripts/release/deploy-railway-workers.mjs:474`,
  `scripts/release/deploy-railway-workers.mjs:580`,
  `.github/workflows/release-production.yml:700`,
  `.github/workflows/release-production.yml:738`.

- **[HIGH] Returned Railway deployment IDs stopped at the waiter, permitting
  later same-SHA replacement to satisfy downstream proof — addressed.** Exact
  IDs flow from deployment outputs into staged provider-identity verification,
  where health/readiness identity must match the active deployments; subsequent
  provider readback supplies the release-provider evidence fragment. References:
  `.github/workflows/release-production.yml:1208`,
  `.github/workflows/release-production.yml:1238`,
  `scripts/release/verify-provider-identity.mjs:83`,
  `.github/workflows/release-production.yml:1639`,
  `.github/workflows/release-production.yml:1658`.

- **[HIGH] Ambiguous deployment mutation failures could lose possible deployment
  handles; GraphQL resolver failures initially skipped reconciliation —
  addressed.** Every deploy request failure now triggers exact-SHA
  reconciliation, recording discovered deployments as unconfirmed handles before
  returning the original failure. References:
  `scripts/release/deploy-railway-workers.mjs:456`,
  `scripts/release/deploy-railway-workers.mjs:607`.

- **[HIGH] Workflow parser discarded BLOCKED deployment handles — addressed.**
  BLOCKED results retain deployment handles, and every workflow failure path
  emits the token-free raw result to both logs and step summary. References:
  `scripts/release/deploy-railway-workers.mjs:740`,
  `.github/workflows/release-production.yml:640`,
  `.github/workflows/release-production.yml:647`.

- **[HIGH] Workers-only phase attempted full manifest finalization despite its
  intentionally partial DAG — addressed.** Workers-only mode records an explicit
  non-promotion finalization note while artifact download, provenance
  resolution, manifest construction, naming, and upload remain guarded to full
  mode. References: `.github/workflows/release-production.yml:1897`,
  `.github/workflows/release-production.yml:1909`,
  `.github/workflows/release-production.yml:2098`,
  `.github/workflows/release-production.yml:2265`.

- **[HIGH] `railway-workers-deploy` was absent from the release-manifest
  failure-stage contract — addressed.** Deployment stage now appears in DAG
  order before worker verification, with contract coverage. References:
  `shared/contracts/release-evidence-manifest-v1.contract.ts:23`,
  `tests/unit/contracts/release-evidence-manifest-v1.contract.test.ts:358`.

### Minor Issues

- **[MEDIUM] Deployment-job timeout could expire before two serial convergence
  windows completed — addressed.** Job timeout increased to 45 minutes.
  Reference: `.github/workflows/release-production.yml:602`.

### Suggestions

None.

---

## Checklist

- [x] 1. Functional Requirements — passed; two-phase dispatch, exact-SHA
      deployment, identity propagation, evidence finalization, and failure
      reporting conform to plan.
- [x] 2. Code Quality — passed; fixed-purpose helpers, existing contracts, and
      targeted tests used without unnecessary framework expansion.
- [x] 3. Architectural Compliance — passed; tracked provider mutation remains
      workflow-controlled, with deployment, health, identity, and evidence
      responsibilities separated.
- [x] 4. Error Handling — passed; ambiguous mutations reconcile handles, reads
      fail closed, and actionable token-free failure evidence is retained.
- [x] 5. Security — passed; exact target identity, secret handling, action
      pinning, workflow permissions, and protected production boundaries were
      reviewed without open findings.
- [x] 6. Performance — passed; serial provider convergence is explicitly bounded
      by the corrected job budget, with no new application hot-path work.

---

## Verdict

**APPROVED**

All eight findings are closed. Accepted override keeps instance-health
verification in the immediate downstream waiter instead of duplicating it inside
the deployment helper. Required `operator_evidence_b64` in workers-only mode
remains an intentional fail-closed interface decision, not an open issue.

Requester reports clean lint, type-check, actionlint, and diff checks, plus 301
passing affected tests. Approval establishes review and merge eligibility only;
production dispatch remains a separate owner-authorized action.
