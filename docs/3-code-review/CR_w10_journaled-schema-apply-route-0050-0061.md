---
status: HISTORICAL
audience: both
last_updated: 2026-09-27
owner: '@nikhillinit'
---

# Code Review: Journaled Schema Apply Route 0050-0061

**Review Date**: 2026-09-27  
**Version**: 1.6.0 (package unchanged). Reviewed object: the implementation
commits on `feat/f1180-phases-2-4` over the plan merge (`9c8619949..667898a88`
before the rebase onto `origin/main` at `bf0494ad9`; Phase 1 runner plus Phases
2-4). The rebase added only #1587's current-forecast upload line to the reviewed
tree. In-loop Codex code review, one round: APPROVED.  
**Files Reviewed**:

- `.github/path-filters.yml`
- `.github/workflows/current-forecast-neon-rehearsal.yml`
- `.github/workflows/prod-schema-reconcile.yml`
- `CHANGELOG.md`
- `DECISIONS.md`
- `docs/1-plans/F_1.17.0_qa-closure-client-reliability.plan.md`
- `docs/1-plans/F_1.18.0_journaled-schema-apply-route-0050-0061.plan.md`
- `docs/ARCHI.md`
- `docs/governance/solo-internal-change-and-production-policy.md`
- `docs/workflows/PRODUCTION_SCRIPTS.md`
- `scripts/current-forecast-journaled-migration-range.mjs`
- `scripts/release/build-schema-reconcile-receipt.ts`
- `scripts/release/rehearse-current-forecast-neon.mjs`
- `scripts/run-actuals-restatement-journaled-migration.mjs`
- `scripts/run-current-forecast-journaled-migrations.mjs`
- `scripts/run-journaled-0050-0061-migrations.mjs`
- `shared/contracts/release-evidence-fragment-v1.contract.ts`
- `shared/contracts/schema-reconcile-receipt-v1.contract.ts`
- `tests/config/testcontainers-test-paths.mjs`
- `tests/integration/journaled-0050-0061-migration.pg.test.ts`
- `tests/unit/contracts/release-evidence-fragment-v1.contract.test.ts`
- `tests/unit/contracts/release-evidence-manifest-v1.contract.test.ts`
- `tests/unit/contracts/schema-reconcile-receipt-v1.contract.test.ts`
- `tests/unit/docs/production-governance-routing.test.ts`
- `tests/unit/prod-schema-apply-policy.test.ts`
- `tests/unit/scripts/build-schema-reconcile-receipt.test.ts`
- `tests/unit/scripts/current-forecast-neon-rehearsal.test.mjs`
- `tests/unit/scripts/prod-schema-reconcile-workflow.test.mjs`
- `tests/unit/scripts/production-schema-dispatch-block.test.mjs`
- `tests/unit/scripts/run-journaled-0050-0061-migrations.test.mjs`

**Plan**: `docs/1-plans/F_1.18.0_journaled-schema-apply-route-0050-0061.plan.md`

---

## Executive Summary

The change adds one bounded production schema route: the runner
`scripts/run-journaled-0050-0061-migrations.mjs`, the
`prod-schema-reconcile.yml` mode `apply-journaled-0050-0061` with an always-run
read-only ledger readback, the matching rehearsal mode, the result and receipt
contracts, the release evidence binding table, and ADR-103 with the policy
amendment. The review found no defects.

APPROVED

---

## Findings

### Critical Issues

None.

### Major Issues

None.

### Minor Issues

None.

### Suggestions

None.

### Observations

- The runner prints a `Current Forecast migration state baseline:` line through
  the reused ADR-074 baseline check. The review judged it cosmetic: the
  journal-specific readback and failure lines stay unambiguous.
- The plan subsection "Implementation notes (2026-09-27)" records three
  deliberate deviations from the plan text. All are on the fail-closed side: the
  readback step's apply-started scoping and `continue-on-error`, the step-scoped
  fingerprint secret mapping, and the rehearsal's `tsImport` of the result
  schema.
- Production application and every owner-only action stay unverified and are out
  of scope.

---

## Checklist Results

- Functional requirements: pass. Journal classification, fingerprint fencing,
  lock and transaction handling, backfill receipts, readback, and evidence
  contracts match the plan.
- Code quality: pass. The change reuses existing checks, adds no dependency, and
  `git diff --check` is clean.
- Architectural compliance: pass. The three deviations are documented.
  Governance and owner-only boundaries are preserved.
- Error handling: pass. Invalid identity, ledger, catalog, backfill, and
  readback states fail closed before or inside the controlled transaction.
- Security: pass. Exact-SHA workflow gates, minimal permissions, validated
  caller identity, and the audit-only release path are retained.
- Performance: pass. Ledger and catalog work is bounded, and the advisory lock
  covers only schema application.
- Plan conformance: pass. No implementation step is missing.

---

## Verification Gate

- `npm run check`: 0 TypeScript errors.
- `npm run lint`: clean, including guardrails.
- `actionlint`: clean on both workflows.
- Full `TZ=UTC npm test`: 16892 passed, 90 skipped (1206 files).
- `tests/integration/journaled-0050-0061-migration.pg.test.ts` (Testcontainers):
  12 passed.
- `tests/regressions/ci-fail-closed.test.ts`: 253 passed.
- `npm run validate:core`: clean.
- `npm run docs:routing:check`: in sync. `npm run matrix:check`: fresh.
- After the rebase onto `origin/main`: 20 affected suites, 631 tests passed;
  `actionlint` clean.

---

## Verdict

APPROVED. Merge admits source only. The rehearsal, the fingerprint secret, the
restore branch, the production apply, and the release dispatch each remain a
separate repository-owner action.
