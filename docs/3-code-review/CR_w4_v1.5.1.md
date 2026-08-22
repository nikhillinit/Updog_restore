# Code Review: Ceremony-Retirement + Canary-Hardening Slice

**Review Date**: 2026-08-22 **Version**: 1.5.1 **Files Reviewed**:

- `.github/workflows/release-production.yml` (-420 lines: policy-ratification
  job, plan-approval steps)
- `.github/workflows/ci-unified.yml` (-33 lines: plan-approval job + gate
  references)
- `.github/workflows/capture-release-baseline.yml` (generic pr_number wiring)
- `.github/workflows/release-canary-recovery.yml` (exact historical-attempt
  recovery receipt)
- `scripts/release/build-release-evidence-manifest.ts` (-101 lines:
  approval/ratification consumption)
- `scripts/release/capture-release-recovery-context.mjs` (prNumber parameter)
- `scripts/release/verify-plan-approval.mjs` (DELETED, -1409 lines)
- `scripts/release/verify-policy-ratification.mjs` (DELETED, -307 lines)
- `scripts/deploy-production.ps1` (pr_number dispatch input, comment fix)
- `shared/contracts/release-evidence-manifest-v1.contract.ts` (nullable
  superRefine)
- `tests/regressions/ci-fail-closed.test.ts` (-191 lines: ceremony assertions)
- `tests/unit/contracts/release-evidence-manifest-v1.contract.test.ts` (nullable
  fixtures)
- `tests/unit/scripts/build-release-evidence-manifest.test.ts` (-113 lines:
  retired verifier)
- `tests/unit/scripts/capture-release-recovery-context.test.mjs` (prNumber
  helper)
- `tests/unit/scripts/verify-plan-approval.test.mjs` (DELETED, -1341 lines)
- `tests/unit/scripts/verify-policy-ratification.test.mjs` (DELETED, -336 lines)
- `CHANGELOG.md` (entry)
- `DECISIONS.md` (ADR-084)

**Net diff**: -4,303 lines across 17 files.

## Review Method

Subagent code-reviewer (63 tool calls, full diff inspection). Codex dispatch
infrastructure not available in this session.

## Review status: Pending fresh post-revision review

This record does not approve the current revision. Fresh post-revision review is
required.

## Findings

### Correctness

No dangling references to `verify-plan-approval.mjs` or
`verify-policy-ratification.mjs` in the active tree. All workflow jobs, `needs`
dependencies, env vars, step summaries, permission blocks, and output forwarding
removed end-to-end.

### Schema Backward Compatibility

Nullable approach is correct. `ApprovalSchema.nullable()`, fragment lineage
`.nullable()`, and superRefine guard removal all preserve parse-ability of old
manifests carrying non-null values. The backward-compatible cross-validation
block (`if (policy.ratification !== null)`) remains intact.

### Test Coverage

Tests updated consistently: fixture factories emit null, assertions check
`toBeNull()`, deleted test cases correspond exactly to deleted logic.
Fragment-count assertion updated (8 to 7). CI-fail-closed input count updated
(10 to 11).

## Testing Gate

```
lint clean
TypeScript 0 errors
targeted release suite: `339 passed (14 builder + 23 contract + 55 recovery + 236 fail-closed + 11 governance)`
matrix suite: `5 passed`
total: `344 passed across 6 files`
actionlint only known constant-false warnings.
```

## Scope correction (August 22, 2026)

This bounded slice toward F_1.3.1 is limited to ceremony retirement and canary
recovery hardening. It does not claim PR2 completion or schema-apply route
retirement. That retirement remains gated on separately owner-authorized
current-main audit evidence; production authority remains none. Review evidence
remains limited to single repository owner/operator internal Press On Ventures
tooling; it creates no delegated, multi-tenant, or external-customer authority.
