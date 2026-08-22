# Code Review: Ceremony Retirement and Dispatch-Based Source Provenance (F_1.3.1 PR2)

**Review Date**: 2026-08-22 **Version**: 1.5.1 **Files Reviewed**:

- `.github/workflows/release-production.yml` (-420 lines: policy-ratification
  job, plan-approval steps)
- `.github/workflows/ci-unified.yml` (-33 lines: plan-approval job + gate
  references)
- `.github/workflows/capture-release-baseline.yml` (generic pr_number wiring)
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

## Verdict: APPROVED

No critical or important issues found.

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

### Minor Observation (non-blocking)

`capture-release-recovery-context.mjs:845` — fallback
`prNumber ?? parsed.runtimePrNumber` references a field the context schema never
writes. Dead code since `--pr-number` is always passed; won't cause runtime
failure.

## Testing Gate

```
lint: clean
typecheck: clean (0 new errors; 39 pre-existing in v2/scenarios.tsx quarantine)
tests: 320 passed (14 builder + 21 contract + 50 recovery + 235 ci-fail-closed)
pre-existing: 1 KG local-state failure (unrelated)
```
