---
status: HISTORICAL
audience: both
last_updated: 2026-09-26
owner: '@nikhillinit'
---

# Code Review: Durable Create Receipts

**Review Date**: 2026-09-26  
**Version**: 1.6.0 (package unchanged). Reviewed object: the committed diff on
`feat/f1170-pr1b-durable-create-receipts` against `origin/main` at `ecc61bd4e`
(F_1.17.0 PR 1b: C2). In-loop Codex code review, two rounds: REQUEST_CHANGES
(two Major, one Minor), then APPROVED.  
**Plan**: `docs/1-plans/F_1.17.0_qa-closure-client-reliability.plan.md`  
**Files Reviewed**:

- `.github/path-filters.yml`
- `.gitleaks.toml`
- `audit/surface-contract-matrix/boot-proofs.json`
- `audit/surface-contract-matrix/f1170-pr1b-scoped-review.json`
- `audit/surface-contract-matrix/listener-dispositions.json`
- `audit/surface-contract-matrix/matrix.json`
- `audit/surface-contract-matrix/runtime-exclusions.json`
- `audit/surface-contract-matrix/source-inventory.json`
- `client/src/app/app-layout.tsx`
- `client/src/components/pipeline/AddDealModal.tsx`
- `client/src/components/pipeline/ImportDealsModal.tsx`
- `client/src/components/portfolio/tabs/AddCompanyDialog.tsx`
- `client/src/hooks/useIdempotencyKey.ts`
- `docs/1-plans/F_1.17.0_qa-closure-client-reliability.plan.md`
- `migrations/0061_durable_create_receipts.sql`
- `migrations/meta/_journal.json`
- `scripts/prod-schema-manifests/38-durable-create-receipts.json`
- `scripts/release/purge-canary-runs.mjs`
- `server/lib/auth/creator-identity.ts`
- `server/lib/database-backed-idempotency-routes.ts`
- `server/lib/idempotent-command.ts`
- `server/middleware/idempotency.ts`
- `server/routes/deal-pipeline.ts`
- `server/routes/portfolio-companies.ts`
- `server/services/canary-residue-service.ts`
- `server/services/deal-pipeline-service.ts`
- `server/services/fund-workflow-service.ts`
- `server/services/portfolio-time-machine-read.ts`
- `server/storage.ts`
- `shared/schema.ts`
- `shared/schema/portfolio.ts`
- `tests/config/testcontainers-test-paths.mjs`
- `tests/integration/deal-import-savepoints.pg.test.ts`
- `tests/integration/pipeline-create-commands.pg.test.ts`
- `tests/integration/prod-schema-clone.test.ts`
- `tests/unit/components/pipeline/add-deal-modal.test.tsx`
- `tests/unit/components/pipeline/import-deals-modal.test.tsx`
- `tests/unit/components/portfolio/add-company-dialog.test.tsx`
- `tests/unit/hooks/use-idempotency-key.test.tsx`
- `tests/unit/migration-ledger.test.ts`
- `tests/unit/prod-schema-manifest-sentinels.test.ts`
- `tests/unit/routes/deal-pipeline.contract.test.ts`
- `tests/unit/routes/portfolio-companies-idempotency.test.ts`
- `tests/unit/services/canary-residue-service.test.ts`
- `tests/unit/services/deal-pipeline-service.test.ts`

## Executive Summary

Deal create, deal import confirm, and portfolio-company create now persist a
durable receipt in the request transaction. Round 1 found that memory-mode
company creates bypassed the memory store and that non-numeric actors collapsed
into one hashed identity; both were fixed with regression tests. A Minor finding
about discarding restored client entries was withdrawn after clarification.
Round 2 approved with no new findings.

## Findings

### Critical Issues

None.

### Major Issues

1. **Memory-mode company create wrote to the wrong store** - fixed. The route
   keeps `storage.createPortfolioCompany` when `storage.kind === 'memory'`
   (`tests/unit/routes/portfolio-companies-idempotency.test.ts`).
2. **Non-numeric actors shared one receipt identity** - fixed. The hash binds
   `actorSubjectFromRequest`; `created_by` stays nullable numeric
   (`tests/unit/routes/deal-pipeline.contract.test.ts`).

### Minor Issues

1. **Restored entries had no discard control** - withdrawn. A restored entry
   never freezes input; identical input replays or creates once, other input
   rotates the key.

### Suggestions

None.

## Checklist

Functional requirements, code quality, architecture, error handling, security,
and performance pass in round 2. Evidence at review time: full `npm test` green
except the expected matrix source-hash mismatch before reseed; Testcontainers
receipt suite 12/12; `prod-schema-clone`, G3, canary 40/4/2 and 44/5/5 green;
`phoenix:truth` 363/363; internal-economics V2 429/429.

## Verdict

**APPROVED.** Hosted exact-head CI, owner matrix reapproval, and the production
schema apply remain separate gates.
