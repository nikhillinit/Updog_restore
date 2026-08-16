# Code Review: 0053 Schema-Apply Enablement (Task 2, PR-Backlog Release Sequencing)

**Review Date**: 2026-08-15
**Version**: 1.6.0
**Files Reviewed**:

- `scripts/reconcile-prod-schema.mjs`
- `.github/workflows/prod-schema-reconcile.yml`
- `tests/unit/reconcile-prod-schema.test.ts`
- `tests/unit/scripts/production-schema-dispatch-block.test.mjs`
- `tests/unit/scripts/prod-schema-reconcile-workflow.test.mjs`
- `tests/integration/prod-schema-reconcile-0053-capability.test.ts`

**Plan**: `.omx/plans/pr-backlog-release-sequencing-solo-scope-2026-08-15-revision-8.md`
(plan SHA-256 `8e299c5f82a48cc5c4ce7bda0e16bd2cb9064dcf86e74f0c6ead31b68950ffa9`)

---

## Executive Summary

Enables exactly one governed local apply path for production-schema migration
`0053` (`g3-release-gate-hardening`) while preserving generic production apply
blocking: advisory-lock-scoped fresh audit vector, exact target-only selector,
deterministic lock-time authority marker (`PROD_SCHEMA_LOCK_TIME_VECTOR_V1`),
and fail-closed rejection of every ambiguous, repeated, drifted, or destructive
state. Reviewed by Codex (gpt-5.6-sol, xhigh) over two rounds. APPROVED.

---

## Changes Overview

Change set is 8 commits on `codex/schema-apply-enablement-20260815`
(`a472f4626..8476294a9`). `scripts/reconcile-prod-schema.mjs` gains the 0053
capability binding (byte-pinned manifest and migration hashes), the
target-only selector, the lock-time vector builder/parser, and a pinned
30-entry canonical manifest identity vector. The workflow gains the exact
capability token path plus lock-time vector validation and report upload.
Tests add unit, workflow-contract, and real-PostgreSQL coverage for binding,
selector, lock lifecycle, drift, unlock cardinality, and marker semantics.

---

## Findings

### Critical Issues

None.

### Major Issues

- **V1 authority vector accepts manifest-inventory drift** —
  `scripts/reconcile-prod-schema.mjs` (round 1). Preparation and parser
  derived the canonical audit vector from directory contents, so a 31st
  manifest widened mutation authority past the revision-8 exact-30 contract;
  read-only reproduction accepted a 31st manifest decision. **Addressed** in
  `8476294a9`: frozen `CANONICAL_MANIFEST_IDENTITIES` (30 ordered
  `{name, manifestPath, order}` identities); preparation rejects inventory
  drift before client construction; lock-time parser independently validates
  its input against the same pinned vector; workflow covered because its
  validate step invokes preparation first. Drift-rejection tests added
  (added manifest, removed manifest, foreign and truncated parser inventory).

### Minor Issues

None.

### Suggestions

None.

---

## Checklist

- [x] 1. Functional Requirements — passed
- [x] 2. Code Quality — passed
- [x] 3. Architectural Compliance — passed
- [x] 4. Error Handling — passed; drift and rejection paths fail closed with exact unlock cardinality
- [x] 5. Security — passed; generic apply remains blocked, mutation path uses pinned-validated manifests, marker excludes secrets
- [x] 6. Performance — passed; bounded double audit, fixed 30-entry comparisons

---

## Verdict

**APPROVED**

Round 2 (commit `8476294a9`) returned APPROVED with no new findings. Accepted
evidence: 302/302 unit and regression tests, 3/3 real-PostgreSQL integration
tests re-run post-fix, clean ESLint, fresh syntax/diff/hash and exact
30-entry identity verification. Known pre-existing `release:check` stage-3
baseline failure (41/176, Zustand/localStorage) is unrelated to this change
set and excluded from the gate. Open owner decision (out of review scope):
register `tests/integration/prod-schema-reconcile-0053-capability.test.ts`
in `tests/config/testcontainers-test-paths.mjs` and `.github/path-filters.yml`
so CI runs it, or accept local-only PostgreSQL proof. No push, dispatch,
schema apply, deployment, or promotion was performed as part of this review.
