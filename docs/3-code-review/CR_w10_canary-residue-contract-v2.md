---
status: HISTORICAL
audience: both
last_updated: 2026-09-25
owner: '@nikhillinit'
---

# Code Review: Canary Residue Contract V2

**Review Date**: 2026-09-25  
**Version**: 1.6.0 (package unchanged). Reviewed object: the staged diff on
`feat/f1160-canary-residue-v2` against `origin/main` at `e2a4f172a` (23 files).
In-loop Codex code review, two rounds: REQUEST_CHANGES (one Major, fixed), then
APPROVED.  
**Files Reviewed**:

- `.github/workflows/release-production.yml`
- `.github/workflows/release-proof.yml`
- `docs/1-plans/F_1.16.0_canary-residue-contract-v2.plan.md`
- `scripts/release/assert-canary-residue.mjs`
- `scripts/release/build-release-evidence-manifest.ts`
- `scripts/release/build-release-proof-certification.ts`
- `server/services/canary-residue-service.ts`
- `shared/contracts/release-canary-residue-characterization-v2.contract.ts`
- `shared/contracts/release-evidence-fragment-v1.contract.ts`
- `shared/contracts/release-evidence-manifest-v1.contract.ts`
- `shared/contracts/release-proof-certification-v1.contract.ts`
- `tests/integration/fund-lifecycle-db.test.ts`
- `tests/integration/release-canary-lifecycle.test.ts`
- `tests/regressions/ci-fail-closed.test.ts`
- `tests/unit/contracts/release-canary-residue-characterization-v2.contract.test.ts`
- `tests/unit/contracts/release-evidence-fragment-v1.contract.test.ts`
- `tests/unit/contracts/release-evidence-manifest-v1.contract.test.ts`
- `tests/unit/contracts/release-proof-certification-v1.contract.test.ts`
- `tests/unit/scripts/assert-canary-residue.test.mjs`
- `tests/unit/scripts/build-release-evidence-fragment.test.ts`
- `tests/unit/scripts/build-release-evidence-manifest.test.ts`
- `tests/unit/scripts/build-release-proof-certification.test.ts`
- `tests/unit/services/canary-residue-service.test.ts`

**Plan**: `docs/1-plans/F_1.16.0_canary-residue-contract-v2.plan.md`

---

## Executive Summary

Change introduces strict HTTP-v2 canary residue identity, characterization
evidence, release certification, and fail-closed production policy verification.
Initial staging-policy drift defect was corrected and independently rechecked.

APPROVED

---

## Changes Overview

Implementation preserves frozen service-only v1 characterization while adding
HTTP workflow v2 reservation and composition contracts. Release proof now binds
service and HTTP results into attempt-qualified evidence, propagates it through
certification and manifest construction, and verifies all production residue
caps plus TTL before build and after staged deployment. Recovery remains
aggregate-only.

---

## Findings

### Critical Issues

None.

### Major Issues

- **Mutable post-certification policy drift could bypass staging guard** —
  Initial implementation re-read mutable GitHub and Vercel settings while
  independently pinning only the changed `15/15/132` values. Coordinated drift
  in another cap or TTL could therefore disagree with certified baseline
  evidence while still passing staging. **Disposition: addressed.** Current
  workflow checks all eleven cap keys plus TTL at
  `.github/workflows/release-production.yml:505`, requires GitHub/Vercel
  equality at `.github/workflows/release-production.yml:554`, and requires every
  value to match the certified map at
  `.github/workflows/release-production.yml:561`. Verification runs before build
  at `.github/workflows/release-production.yml:583` and after deploy at
  `.github/workflows/release-production.yml:622`, after deployment identity
  retention at `.github/workflows/release-production.yml:618`. Regression
  derives every expected cap from the v2 reservation at
  `tests/regressions/ci-fail-closed.test.ts:6292` and verifies both check
  positions at `tests/regressions/ci-fail-closed.test.ts:6300`.

### Minor Issues

None.

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

All review findings are addressed; none remain open or overridden. Final
evidence: touched-file lint clean, actionlint clean, `ci-fail-closed` 253
passed, full suite 16,740 passed, affected unit/regression 517 passed,
real-PostgreSQL integration 22 passed, and `git diff --check HEAD` clean. Review
grants no merge, deployment, production, schema, or release authority.
