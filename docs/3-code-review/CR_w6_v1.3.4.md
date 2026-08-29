---
status: HISTORICAL
audience: both
last_updated: 2026-08-29
owner: '@nikhillinit'
---

# Code Review: Release Mutation Containment Remediation

**Review Date**: 2026-08-29 **Version**: 1.3.4 (plan F_1.3.4; package version
remains 1.6.0) **Files Reviewed**:

- `.github/workflows/release-production.yml`
- `DECISIONS.md`
- `docs/workflows/PRODUCTION_SCRIPTS.md`
- `docs/workflows/railway-provider-contract-evidence-f132.md`
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
operations, and corresponding release evidence. PR #1452 implementation findings
were addressed; lint, typecheck, and affected tests pass. PR #1453 documentation
admission still requires a fresh external final-head review.

Verdict: **APPROVED with observations for PR #1452 implementation; PR #1453
admission pending**

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
  run** — `isTerminallyInactiveDeployment` at
  `scripts/release/deploy-railway-workers.mjs:896`,
  `assertFailedServiceInactive` at
  `scripts/release/deploy-railway-workers.mjs:1663`, and its pre-recovery call
  at `scripts/release/deploy-railway-workers.mjs:1796`. Failed service now
  receives exact deployment/service/environment readback under the run deadline
  and must be terminally inactive before recovery mutation. Regression at
  `tests/unit/scripts/deploy-railway-workers.test.mjs:2231` verifies `FAILED`
  with a running instance produces `RECOVERY_BLOCKED` and zero rollback/redeploy
  calls. **Disposition: addressed.**

### Minor Issues

- **Documentation incorrectly described rollback reconciliation as
  novel-ID-only** — `docs/workflows/PRODUCTION_SCRIPTS.md:104`,
  `docs/workflows/PRODUCTION_SCRIPTS.md:108`, `DECISIONS.md:11585`, and
  `DECISIONS.md:11590`. Documentation now separates deploy/redeploy novel-only
  reconciliation from rollback’s same-prior transition and novel prior-commit
  proofs, including attempted-deployment inactivity requirements. **Disposition:
  addressed.**

- **Captured Railway schema evidence omitted connection pagination arguments** —
  `docs/workflows/railway-provider-contract-evidence-f132.md` originally listed
  `deployments(input: DeploymentListInput!, first: Int)`. Unauthenticated live
  introspection on 2026-08-29 returns `after`, `before`, `first`, `input`, and
  `last`; Railway's official GraphQL guide shows
  `deployments(input: $input, first: $first, after: $after)`. The evidence
  record now disposes PR #1452's P1 as stale/incomplete evidence without
  changing the runtime query. Production dispatch remains HOLD. **Disposition:
  addressed.**

- **Release-evidence citations became stale after the inactivity guard
  insertion** — the immutable report's `Remediation` and
  `Confirmed Review Corrections` sections begin at
  `.agents/research/2026-08-29-bug-echo-release-mutation-containment.md:220` and
  `.agents/research/2026-08-29-bug-echo-release-mutation-containment.md:236`,
  but retain pre-insertion code anchors. This CR supplies the current exact-head
  locations: `runDeadlineAt` at
  `scripts/release/deploy-railway-workers.mjs:1754`, `canRecoverPreviousService`
  at `scripts/release/deploy-railway-workers.mjs:1695`, and
  `assertFailedServiceInactive` at
  `scripts/release/deploy-railway-workers.mjs:1663`. The plan's
  `Phase 4: WATCH fold-ins + evidence` execution record binds the unchanged
  committed report by SHA-256
  `88312fc33c663e13d5768646d286303903b06170b776981deb219aa453090081`. The
  corrected plan hashes to
  `1e454aae15bdda602ab6c4885a12916d2cab15d1a3e8699a3e5475599d486e5b`.
  **Disposition: addressed.**

### Suggestions

- **WATCH #1: ambiguous staged Vercel deployment discovery** —
  `.agents/research/2026-08-29-bug-echo-release-mutation-containment.md:141`,
  `.agents/research/2026-08-29-bug-echo-release-mutation-containment.md:148`.
  Remains intentionally open because `--skip-domain` contains canonical traffic
  impact. **Disposition: accepted open observation.**

- **WATCH #4: confirmed-true rollback discovery reads the first successful
  deployment** —
  `.agents/research/2026-08-29-bug-echo-release-mutation-containment.md:144`,
  `.agents/research/2026-08-29-bug-echo-release-mutation-containment.md:184`.
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

**APPROVED with observations for PR #1452 implementation**

All PR #1452 implementation findings requiring remediation are addressed. PR
#1453 documentation admission remains pending a fresh external final-head
review. WATCH #1 and WATCH #4 remain explicitly open by accepted plan decision
at `.agents/research/2026-08-29-bug-echo-release-mutation-containment.md:234`;
production dispatch remains HOLD and separately authorized at
`.agents/research/2026-08-29-bug-echo-release-mutation-containment.md:261`.

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

## Final release binding (documentation correction, 2026-08-29)

- Implementation commit: `69de4783ef2adfdbe4344fd802f2ce65687b244f`
- Merged code SHA: `6121367642507ffea28dd0d464748ebd3813f0fb`
- Reviewed patch SHA-256:
  `7219e35f15575743fc8f38ea0512be6833b1a077b29e7b23c8e9882f6b9126a6`
- Implementation SHA-256:
  `465b881994330df88d499685f00752f2bdabadc6f094ba533704a9286af91774`
- Final evidence-report SHA-256:
  `88312fc33c663e13d5768646d286303903b06170b776981deb219aa453090081`
- Corrected admitted-plan SHA-256:
  `1e454aae15bdda602ab6c4885a12916d2cab15d1a3e8699a3e5475599d486e5b`
- PR #1453 submitted head `632fe4fca68d224da9a79949ceb93336165d269c` is
  superseded by this correction and must not be merged.
- Final PR #1453 head SHA, tracked-diff SHA-256, and this code-review file's
  SHA-256 must be recorded externally in PR review history after the
  human-authored files freeze. They are intentionally not embedded here because
  editing this file would invalidate those values.

This binding is evidence, not tag or production authority. Tag creation remains
separately authorized after exact post-merge SHA verification; production
dispatch remains HOLD.
