# Code Review: Release Mutation Containment Remediation

**Review Date**: 2026-08-29 **Version**: 1.3.4 (plan F_1.3.4; package version
remains 1.6.0) **Files Reviewed**:

- `.github/workflows/release-production.yml`
- `DECISIONS.md`
- `docs/workflows/PRODUCTION_SCRIPTS.md`
- `scripts/release/capture-release-recovery-context.mjs`
- `scripts/release/collect-provider-evidence.mjs`
- `scripts/release/deploy-railway-workers.mjs`
- `scripts/release/railway-graphql-transport.mjs`
- `scripts/release/wait-railway-workers.mjs`
- `tests/regressions/ci-fail-closed.test.ts`
- `tests/unit/scripts/capture-release-recovery-context.test.mjs`
- `tests/unit/scripts/collect-provider-evidence.test.mjs`
- `tests/unit/scripts/deploy-railway-workers.test.mjs`
- `tests/unit/scripts/production-release-dispatch-block.test.mjs`
- `tests/unit/scripts/railway-graphql-transport.test.mjs`
- `tests/unit/scripts/wait-railway-workers.test.mjs`

**Plan**:
`docs/1-plans/F_1.3.4_release-mutation-containment-remediation.plan.md`

---

## Executive Summary

Change adds one run-level deployment deadline, fail-closed novel-identity
reconciliation, attempted-deployment inactivity proofs, bounded provider and Git
operations, and corresponding release evidence. All blocking findings were
addressed; lint, typecheck, and affected tests pass.

Verdict: **APPROVED with observations**

---

## Changes Overview

Railway deployment and recovery operations now share one absolute deadline and
reject ambiguous, pre-existing, or multiple deployment identities. Recovery
cannot mutate service A until service B’s attempted deployment is proven
terminally inactive. Provider evidence and network Git operations gain bounded
deadlines, while production documentation and ADR-089 record the revised
contracts.

---

## Findings

### Critical Issues

None.

### Major Issues

- **Service-A recovery permitted while failed service deployment could still
  run** — `scripts/release/deploy-railway-workers.mjs:870`,
  `scripts/release/deploy-railway-workers.mjs:1589`,
  `scripts/release/deploy-railway-workers.mjs:1716`. Failed service now receives
  exact deployment/service/environment readback under the run deadline and must
  be terminally inactive before recovery mutation. Regression at
  `tests/unit/scripts/deploy-railway-workers.test.mjs:1973` verifies `FAILED`
  with a running instance produces `RECOVERY_BLOCKED` and zero rollback/redeploy
  calls. **Disposition: addressed.**

### Minor Issues

- **Documentation incorrectly described rollback reconciliation as
  novel-ID-only** — `docs/workflows/PRODUCTION_SCRIPTS.md:107`,
  `docs/workflows/PRODUCTION_SCRIPTS.md:110`, `DECISIONS.md:11585`,
  `DECISIONS.md:11590`. Documentation now separates deploy/redeploy novel-only
  reconciliation from rollback’s same-prior transition and novel prior-commit
  proofs, including attempted-deployment inactivity requirements. **Disposition:
  addressed.**

- **Release-evidence citations became stale after the inactivity guard
  insertion** —
  `.agents/research/2026-08-29-bug-echo-release-mutation-containment.md:221`,
  `.agents/research/2026-08-29-bug-echo-release-mutation-containment.md:226`.
  Citations now correctly reference `runDeadlineAt` at
  `scripts/release/deploy-railway-workers.mjs:1674`, `canRecoverPreviousService`
  at `scripts/release/deploy-railway-workers.mjs:1621`, and
  `assertFailedServiceInactive` at
  `scripts/release/deploy-railway-workers.mjs:1589`. Superseding report hash
  recorded at
  `docs/1-plans/F_1.3.4_release-mutation-containment-remediation.plan.md:441`.
  **Disposition: addressed.**

### Suggestions

- **WATCH #1: ambiguous staged Vercel deployment discovery** —
  `.agents/research/2026-08-29-bug-echo-release-mutation-containment.md:138`,
  `.agents/research/2026-08-29-bug-echo-release-mutation-containment.md:145`.
  Remains intentionally open because `--skip-domain` contains canonical traffic
  impact. **Disposition: accepted open observation.**

- **WATCH #4: confirmed-true rollback discovery reads the first successful
  deployment** —
  `.agents/research/2026-08-29-bug-echo-release-mutation-containment.md:141`,
  `.agents/research/2026-08-29-bug-echo-release-mutation-containment.md:181`.
  Remains intentionally open as a fail-closed false-negative risk, not
  demonstrated unsafe success. **Disposition: accepted open observation.**

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

**APPROVED with observations**

All review findings requiring remediation are addressed. WATCH #1 and WATCH #4
remain explicitly open by accepted plan decision at
`.agents/research/2026-08-29-bug-echo-release-mutation-containment.md:229`;
production dispatch remains HOLD and separately authorized at
`.agents/research/2026-08-29-bug-echo-release-mutation-containment.md:235`.

---

## Promotion Note (recorded at release time, 2026-08-29)

This review was pinned to the pre-merge working tree (tracked-diff SHA-256
`dcc86597e8a4bf5eebf7526bab76b0fa8fc8e0b21a32540fc017ec9757f64472`, plan SHA-256
`6d7b0f8ef9d8dc767de8f0d66225063f19324448ba23fce65bfc46d4dd28fa22`). The
committed copy of the plan hashes to
`33f5d5e57849dce60c0589f975d4cd1cffd8d11812f86477b4b7cd41d59ed6d1`: the
pre-commit hook's `prettier --write` reflowed prose line wrapping only, and
running repo-config prettier on the pinned bytes reproduces the committed bytes
exactly (verified at release time). Before merge, a further review-driven
hardening round landed in PR #1452 (merge SHA
`6121367642507ffea28dd0d464748ebd3813f0fb`): instance-level terminal-inactivity
proof (`TERMINAL_INACTIVE_INSTANCE_STATUSES`, stopped `SUCCESS` requirement),
novel-deployment observation threaded through pagination, preserved causal
reconciliation errors, a `timeout-minutes` guard on `validate-target`, expanded
regression coverage, and updated evidence-report citations. Those corrections
are enumerated in the PR #1452 description ("Confirmed review corrections") and
supersede the exact line references above where they drifted. Production
dispatch remains HOLD; any future dispatch must target the merge SHA or a
descendant.
