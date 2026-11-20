---
status: HISTORICAL
audience: both
last_updated: 2026-11-20
owner: '@nikhillinit'
---

# Code Review: F_1.3.9 SSO posture gate and import write guards

**Review Date**: 2026-11-20

**Version**: 1.6.0 (package unchanged). Reviewed object: `8430bfcf9..HEAD` on
`feat/f139-sso-posture-gate-import-write-guards`. The review ran over five
branch commits (`2d3935d26`, `33353c8e7`, `e5e88a71e`, `060196518`,
`bd9b2e19f`). They were later squashed into one commit with two post-review
additions: a wording trim in the plan file and an exact-path, literal-digest
`.gitleaks.toml` allowlist for the new scoped review, which mirrors the PR 1708
block.

**Plan**:
`docs/1-plans/F_1.3.9_sso-posture-gate-and-import-write-guards.plan.md`

**Review loop**: Codex code review, 3 rounds -> APPROVED, then a synthesis pass.

---

## Executive Summary

The change adds a production SSO posture gate and write guards for the import
and reconciliation routes. Review findings were addressed during the loop. The
owner-only matrix approval remains a separate pending gate.

APPROVED with observations

---

## Changes Overview

Release evidence collection and identity verification now check the access
posture, and the release workflow enforces the gate. Ten import and
reconciliation POST routes use explicit write-role and fund-scope guards in
`server/routes/lp-reporting/imports.ts`. Route tests and PostgreSQL HTTP tests
exercise the authorization behavior. The matrix inventory was reseeded. Its
scoped review records decisions for the 24 demoted route rows and the legacy
Railway listener.

---

## Findings

### Critical Issues

None.

### Major Issues

- **Initial matrix source-hash failure (addressed).** The test gate compared
  source bytes with the inventory at
  `tests/unit/audit/surface-contract-matrix.test.ts:201`. The reseed updated the
  `imports.ts` hash in `audit/surface-contract-matrix/source-inventory.json`.
  The remaining matrix failure concerns owner approval of proposed decisions,
  not the source hash.
- **Integration proof overstated across ten write rows (addressed).** Earlier
  scoped-review text attributed PostgreSQL denial and cross-fund results to
  routes the cited test did not call. The current evidence attributes
  integration proof only to the five routes that
  `tests/integration/valuation-mark-commit-http.pg.test.ts` calls. The other
  five write rows cite the unit role matrix only.

### Minor Issues

None.

### Suggestions

- **Malformed fund-ID test attribution (addressed).** The unit test sends a
  malformed ID to the ledger dry-run route only. The scoped review now describes
  that as a check of the shared `parseWriteFundId` guard rather than a per-route
  test result.

---

## Checklist

- [ ] 1. Functional Requirements: passed with a caveat. Proposed matrix
      decisions still await owner approval.
- [x] 2. Code Quality: passed.
- [x] 3. Architectural Compliance: passed.
- [x] 4. Error Handling: passed.
- [x] 5. Security: passed.
- [x] 6. Performance: passed.

---

## Verdict

**APPROVED with observations**

The review relied on requester-reported clean lint, typecheck and policy
verification, 17,812 passing unit tests and 64 passing Testcontainers tests. The
matrix test stays red until the owner-authorized `approve-matrix` mutation
(`audit/surface-contract-matrix/README.md`, maintenance sequence). The
vendored-skills failure is limited to untracked local skill directories.
