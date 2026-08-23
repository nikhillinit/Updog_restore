# Code Review: Ceremony Retirement + Canary-Hardening Slice

**Review Date**: 2026-08-22 **Version**: 1.5.1 **Files Reviewed**:

- `.github/workflows/release-production.yml` (-420 lines: policy-ratification
  job, plan-approval steps, expression injection fix, node-spawn consolidation)
- `.github/workflows/ci-unified.yml` (-33 lines: plan-approval job + gate
  references)
- `.github/workflows/capture-release-baseline.yml` (generic pr_number/plan_path
  wiring)
- `.github/workflows/release-canary-recovery.yml` (historical-run identity
  validation, sanitized receipt builder)
- `scripts/release/build-release-evidence-manifest.ts` (-101 lines:
  approval/ratification consumption, ponytail rollback placeholders)
- `scripts/release/capture-release-recovery-context.mjs` (prNumber parameter,
  hoisted PR_NUMBER regex, ADR-084 rollback-mode comment)
- `scripts/release/verify-plan-approval.mjs` (DELETED, -1,409 lines)
- `scripts/release/verify-policy-ratification.mjs` (DELETED, -307 lines)
- `scripts/deploy-production.ps1` (pr_number dispatch input, mode-conditional
  validation)
- `scripts/DEPLOYMENT_AUTOMATION_README.md` (-PrNumber parameter documentation)
- `shared/contracts/release-evidence-manifest-v1.contract.ts` (nullable
  superRefine backward-compatible cross-validation)
- `tests/regressions/ci-fail-closed.test.ts` (updated assertions: SHA validation
  string, canaryRunId sourcing, partial receipt null guard)
- `tests/unit/contracts/release-evidence-manifest-v1.contract.test.ts` (nullable
  fixtures, superRefine branch coverage)
- `tests/unit/docs/production-governance-routing.test.ts` (4 untracked plan docs
  added to legacyPlanDocs)
- `tests/unit/scripts/build-release-evidence-manifest.test.ts` (-113 lines:
  retired verifier assertions)
- `tests/unit/scripts/capture-release-recovery-context.test.mjs` (prNumber
  explicit-undefined helper, fail-closed primary-mode tests)
- `tests/unit/scripts/verify-plan-approval.test.mjs` (DELETED, -1,341 lines)
- `tests/unit/scripts/verify-policy-ratification.test.mjs` (DELETED, -336 lines)
- `CHANGELOG.md` (entry)
- `DECISIONS.md` (ADR-084)
- `docs/2-changelog/w4_v1.5.1.md` (changelog entry)
- `docs/2-changelog/changelog_table.md` (table entry)
- `audit/surface-contract-matrix/*.json` (hash regen from prior commit)

**Plan**: `docs/1-plans/F_1.3.1_governance-right-sizing.plan.md` (PR2 of 2)

---

## Executive Summary

Retires two multi-actor governance ceremonies (plan-approval,
policy-ratification) that never had a second actor, replaces approval-derived PR
identity with an explicit `pr_number` dispatch input, and hardens canary
recovery with historical-run identity validation and a sanitized receipt
builder. Net -3,569 lines across 27 files (+874/-4,443). **APPROVED**.

---

## Changes Overview

Three commits: (1) ceremony retirement and provenance restructuring, (2)
provenance compatibility revisions for rollback-mode and baseline consumption,
(3) 15 code-review findings (F1-F15) from the pre-revision review.

Key behavior: `release-production.yml` gains `pr_number` as 11th dispatch input
with mode-conditional validation (required for primary, optional for rollback).
`release-canary-recovery.yml` gains GitHub API identity validation of the
historical run and a sanitized receipt replacing raw JSON artifact upload.
Contract schema retains nullable fields with superRefine cross-validation for
backward-compatible parsing of old manifests.

---

## Findings

### Critical Issues

None.

### Major Issues

None.

### Minor Issues

1. **deploy-production.ps1 indentation shift**
   (`scripts/deploy-production.ps1:44`): PrNumber parameter block used 2-space
   indent while surrounding parameters use 4-space. Cosmetic in PowerShell, does
   not affect execution. **Disposition: addressed** (fixed in review commit).

### Suggestions

1. **Inline heredoc receipt builder** (`release-canary-recovery.yml:194`):
   Marked with ponytail tech-debt comment. Factor to standalone Node script when
   recovery grows a second consumer.

2. **Rollback placeholder values**
   (`build-release-evidence-manifest.ts:322,326`): Marked with ponytail
   tech-debt comments. Rollback evidence uses a different path; placeholders are
   correct for the current single-consumer design.

---

## Checklist

Criteria per `.claude/skills/TRIP-review/checklist.md`.

- [x] 1. Functional Requirements -- passed. Implementation matches F_1.3.1 PR2
      scope. pr_number dispatch input with mode-conditional validation. Nullable
      backward-compat preserves old manifest parsing. Zero dangling references
      to deleted scripts.
- [x] 2. Code Quality -- passed. Net -3,569 lines (+874/-4,443). F11
      consolidated 3 node/bash spawns to 1. PR_NUMBER regex hoisted (F9).
      Ponytail tech-debt markers on deliberate simplifications (F10, F14).
      ADR-084 reference comment (F15).
- [x] 3. Architectural Compliance -- passed. Contract-schema nullable approach
      matches the fragment/manifest layering in ARCHI.md. Workflow changes
      follow existing patterns (env-var passthrough, set -euo pipefail, node -e
      blocks). Retained controls (exact-SHA, CI Gate Status, environment:
      Production, main-ref fence) are proportional per ADR-084.
- [x] 4. Error Handling -- passed. Partial receipt tolerance via try/catch null
      return (F1). Mode-conditional prNumber validation in
      deploy-production.ps1. Fail-closed identity validation on canary recovery
      (repo, path, name, event, status, conclusion, attempt, SHA). Receipt
      builder validates all fields with process.exit(1) on mismatch.
- [x] 5. Security -- passed. Expression injection removed (F2: deleted duplicate
      `${{ inputs.expected_sha }}` assignment). All dispatch inputs validated
      via regex. Sanitized receipt replaces raw JSON upload. Historical run
      identity validated via GitHub API before any DB state transition.
- [x] 6. Performance -- not applicable. CI/release workflows only, no hot paths.
      Net deletion.

---

## Review Method

Post-revision review of PR #1414 (3 commits, 27 files, +874/-4,443). Full PR
diff inspected across all changed files. Dangling reference verification via
`grep -r` for deleted script names and retired ceremony identifiers. Contract
superRefine branch coverage verified by reading test fixtures.

**Self-review disclosure**: Commit `865db8927` ("fix(release): complete
provenance compatibility revisions") implements findings F1-F15 from the
pre-revision review recorded in this same file. That commit is self-reviewed,
not independently reviewed. Evidence supporting that commit: 13,208 tests
passing (full suite), 236/236 fail-closed regression assertions, actionlint
clean, baseline:check 0 errors across client/server/shared.

---

## Solo-Developer Alignment Assessment

This change right-sizes governance for a ~5-user internal fund management tool.
The retired ceremonies (plan-approval, policy-ratification) were multi-actor
workflows that never had a second actor -- the sole repository owner/operator
was both the approval requestor and the approval grantor. Removing them
eliminates ~2,100 lines of ceremony infrastructure without reducing the
production-safety controls that actually gate deployments.

Retained controls per ADR-084:

- Exact-SHA validation (commit identity)
- CI Gate Status (all quality gates green)
- `environment: Production` (GitHub environment protection)
- Main-ref fence (branch protection)
- `pr_number` explicit dispatch provenance (replaces approval-derived identity)

The canary recovery hardening _adds_ validation (historical run identity check
via GitHub API, sanitized receipt with field-level validation) in a ceremony
_removal_ PR. This is proportional: the recovery workflow is a production-DB
state-transition surface, and the added validation is fail-closed machine
enforcement, not a human gate. No authority boundary is created or delegated.

---

## Scope Boundary

This bounded slice toward F_1.3.1 is limited to ceremony retirement and canary
recovery hardening. It does not claim PR2 completion or schema-apply route
retirement. That retirement remains gated on separately owner-authorized
current-main audit evidence; production authority remains none. Review evidence
remains limited to single repository owner/operator internal Press On Ventures
tooling; it creates no delegated, multi-tenant, or external-customer authority.

---

## Verdict

**APPROVED**

Approval gate per `checklist.md`: all functional requirements met, no
critical/major findings, build green, 13,208 tests passing, new logic covered
(F5/F6 fail-closed + superRefine branch tests), docs updated (ADR-084,
changelog, DECISIONS.md). One cosmetic minor (PowerShell indentation, addressed)
and two ponytail-marked tech-debt suggestions, all appropriate for the current
single-consumer design. The self-reviewed commit (F1-F15 findings fix) carries
full-suite test evidence but lacks independent review -- this is disclosed above
and acceptable for an internal tool with a single operator. ADR-084 documents
the decision rationale. Ceremony retirement is proportional to the solo-dev
context with no reduction in machine-enforced production safety controls.
