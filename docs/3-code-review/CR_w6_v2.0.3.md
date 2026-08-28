# Code Review: F3a Cumulative Allocation Validation and Refusal Propagation

**Review Date**: 2026-08-25  
**Version**: 2.0.3 (plan F_2.0.3; package version remains 1.6.0)  
**Files Reviewed**:

- `shared/lib/internal-economics/v2/derive-composite-v2.ts`
- `shared/lib/internal-economics/v2/event-stream-engine-v2.ts`
- `tests/unit/internal-economics/v2/event-stream-engine-v2.test.ts`

**Plan**: `docs/1-plans/F_2.0.3_v2-f3a-cumulative-allocation-validation.plan.md`

---

## Executive Summary

Change closes the F3a repeated-row and ignored-refusal defects in the V2
internal economics event-stream engine: cumulative per-lot aggregate validation
for repeated cash-source allocation and investment-lot relief rows, exact
event-total validation against `amountUsd`, row-level negative-amount rejection,
and propagation of refusal-capable processor results through the existing
chronology switch (exposed as `processEventsV2ForTest`). F2 public event
admission remains refused; no contract, receipt, or public behavior changes.

APPROVED

---

## Changes Overview

Validators (`validateCashSourceAllocations`, `validateReliefRows`) now run three
deterministic passes: all reference lookups first (missing reference wins), then
row-level negative-amount rejection, then per-lot aggregate comparison against
remaining balance/basis. Processors (`processDeployment`, `processFundExpense`,
`processRealization`) compare the row sum against event `amountUsd` after
validation and before any apply, refusing with the plan-pinned literal message
and byte-exact `contextDetails` JSON. The chronology loop is exported unchanged
in order as `processEventsV2ForTest`, captures each refusal-capable processor
result, and returns the first refusal; `runLane` calls it.

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

**APPROVED** (Codex loop, 1 round; reviewer: gpt-5.6-sol at xhigh)

No findings. Severity count: Critical 0, Major 0, Minor 0, Suggestion 0.
Reviewer confirmed: cumulative validation, exact totals, precedence, and
refusal-before-mutation correct; no new trust boundary, I/O, or unsafe failure
path; exact three-file scope with F2 admission closed and no contract, receipt,
persistence, queue, or public-capability expansion; linear bounded passes with
actionable deterministic diagnostics. Reported gates accepted by the reviewer:
lint clean (eslint `--max-warnings 0` on the three touched files), typecheck
clean (`npm run check`, 0 errors across client/server/shared), 34/34 targeted
event-stream tests (16 new: 5 baseline-green plus 11 expected-red turned green),
300/300 `test:internal-economics-v2`, 353/353 `phoenix:truth`, classifier
`valid=true` and `financial_calc_relevant=true`, exact three-path diff against
`eecdc6d6766d67dd8be3743fb1a688c34ced3d1c`, `git diff --check` clean.

---

## Post-review addendum (2026-08-25, independent second review)

An independent read-only review (orchestrated Claude worker, run
`run_a14998be4d46`, report `/tmp/f3a-trip-review-findings.md` at review time)
returned APPROVED with 3 Minor test-strength findings on the original candidate
`24d1a1c7299fc75ec995e04f615811923bd685de`:

1. Precedence missing-beats-negative cases listed the missing-reference row
   first, so a wrong single-pass implementation would also pass — fixed by
   listing the negative row first in both branches.
2. The chronology test's refusing event was last, so continue-after-refusal
   would pass undetected — fixed by appending a trailing valid event and
   asserting its zero effect.
3. Precedence winners were asserted by regex rather than the plan-required
   literal winning-branch message — fixed with full literal `toBe` assertions.

Fixes were test-file-only; the candidate was amended to
`eaac83a5ce6ef193aa11271db8e142ccbb70b81d` and the complete verification block
re-ran green on it (34/34 targeted, 300/300 V2 suite, 353/353 Phoenix truth,
ESLint clean, typecheck clean, exact three-path assertion, classifier
`valid=true`/`financial_calc_relevant=true`).

Review approval only; merge authority remains separate.
