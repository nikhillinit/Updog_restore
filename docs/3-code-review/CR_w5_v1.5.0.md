# Code Review: Governance Right-Sizing PR1 (CI Hardening)

**Review Date**: 2026-08-22 **Version**: 1.5.0 **Files Reviewed**:

- `.github/workflows/ci-unified.yml`
- `.github/workflows/release-proof.yml`
- `scripts/ci/classify-change-paths.mjs`
- `tests/regressions/ci-fail-closed.test.ts`
- `tests/unit/ci-workflow-regression.test.ts`
- `tests/unit/scripts/build-release-evidence-manifest.test.ts`

**Plan**: `docs/1-plans/F_1.3.1_governance-right-sizing.plan.md`

---

## Executive Summary

Change right-sizes CI and release-proof governance while preserving fail-closed
certification controls. All in-scope findings were addressed or accepted after
scope clarification; lint, typecheck, and affected tests pass with one
acknowledged pre-existing resource-ceiling flake.

**APPROVED with observations**

---

## Changes Overview

Change updates CI path classification, release-proof credential preflight,
workflow regression coverage, and generated skill-routing documentation. It also
adds pinned catch-up evidence coverage for release-manifest construction and
strengthens fail-closed checks around protected release jobs.

---

## Findings

### Critical Issues

None.

### Major Issues

1. **Catch-up receipt path still rejects pinned run** -- Accepted override /
   withdrawn after scope clarification. Builder contract consumes a verified
   schema-fragment payload plus dispatcher inputs, not a raw workflow receipt
   (`scripts/release/build-release-evidence-manifest.ts:575`). Pinned catch-up
   run identity, source SHA, artifact ID, archive hash, and receipt hash are
   exercised through that contract
   (`tests/unit/scripts/build-release-evidence-manifest.test.ts:540`). This
   satisfies the scoped plan requirement
   (`docs/1-plans/F_1.3.1_governance-right-sizing.plan.md:625`).

2. **Certifying boot preflight requires wrong secret** -- Addressed. Protected
   boot preflight now validates `VERCEL_TOKEN`, matching the credential consumed
   by the boot-proof implementation (`.github/workflows/release-proof.yml:218`).
   Fail-closed regression coverage asserts the same credential
   (`tests/regressions/ci-fail-closed.test.ts:7355`).

3. **Verification gate unmet** -- Addressed by requester-supplied testing
   evidence. Gate is defined at
   `docs/1-plans/F_1.3.1_governance-right-sizing.plan.md:627`. Reported
   evidence: lint clean, typecheck clean, 11,628 tests passed including 83 new
   tests, plus two complete 825/825 suite runs. Remaining ETIMEDOUT/Parse Error
   event is an acknowledged pre-existing resource-ceiling flake, not an
   introduced failure.

### Minor Issues

None.

### Suggestions

1. **Workflow-level receipt conversion remains separate from manifest-builder
   coverage** -- Accepted out-of-scope observation. Historical receipt is parsed
   and validated within the reconciliation workflow
   (`.github/workflows/prod-schema-reconcile.yml:357`), while artifact naming
   and publication occur separately
   (`.github/workflows/prod-schema-reconcile.yml:749`). Future workflow-focused
   work may add direct coverage for that conversion boundary; it is not required
   by PR1's manifest-builder test scope.

---

## Checklist

- [x] 1. Functional Requirements -- Passed; pinned catch-up evidence and
      corrected credential preflight satisfy plan scope.
- [x] 2. Code Quality -- Passed.
- [x] 3. Architectural Compliance -- Passed; workflow parsing and manifest
      construction retain existing responsibility boundaries.
- [x] 4. Error Handling -- Passed; protected credential checks fail closed.
- [x] 5. Security -- Passed; certifying preflight validates the credential
      actually consumed.
- [x] 6. Performance -- Passed; no new hot-path or resource-management concern
      found.

---

## Verdict

**APPROVED with observations**

Codex review loop: 3 rounds to convergence. One Major fixed (credential
preflight), two Majors resolved by scope clarification and testing evidence. No
open critical or major findings remain.
