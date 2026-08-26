# Code Review: V2 Catch-Up Allocation Parity (F_2.0.4)

**Review Date**: 2026-08-26 **Version**: 2.0.4 (plan F_2.0.4; package version
remains 1.6.0) **Files Reviewed**:

- `CHANGELOG.md`
- `docs/1-plans/F_2.0.4_v2-catch-up-allocation-parity.plan.md`
- `docs/ARCHI.md`
- `shared/lib/internal-economics/v2/catch-up-allocation-v2.ts`
- `shared/lib/internal-economics/v2/decimal-cents-v2.ts`
- `shared/lib/internal-economics/v2/waterfall-deal-by-deal-v2.ts`
- `shared/lib/internal-economics/v2/waterfall-whole-fund-v2.ts`
- `tests/unit/internal-economics/v2/catch-up-allocation-v2.test.ts`
- `tests/unit/internal-economics/v2/waterfall-deal-by-deal-v2.test.ts`
- `tests/unit/internal-economics/v2/waterfall-whole-fund-v2.test.ts`

**Plan**: `docs/1-plans/F_2.0.4_v2-catch-up-allocation-parity.plan.md`

---

## Executive Summary

Change implements shared V2 GP catch-up allocation, jointly quantized GP/LP
splits, and whole-fund plus deal-by-deal integration. All actionable findings
were addressed; supplied gates report zero failures attributable to this change.

APPROVED with observations

---

## Changes Overview

New shared allocation leaf applies locked cumulative-profit catch-up formula and
largest-remainder GP/LP apportionment. Both waterfall engines now use shared
catch-up and carry splitting with binding-availability caps. Architecture,
changelog, plan evidence, and 20 new tests document and validate behavior.

---

## Findings

### Critical Issues

None.

### Major Issues

- **[Major — addressed] Binding-cap HALF_UP rounding could over-distribute
  proceeds.** Floor conversion added at
  `shared/lib/internal-economics/v2/decimal-cents-v2.ts:12`; shared split clamps
  quantized allocation to floored availability at
  `shared/lib/internal-economics/v2/catch-up-allocation-v2.ts:35`; catch-up
  supplies cap at
  `shared/lib/internal-economics/v2/catch-up-allocation-v2.ts:76`; carry callers
  supply remaining availability at
  `shared/lib/internal-economics/v2/waterfall-whole-fund-v2.ts:270` and
  `shared/lib/internal-economics/v2/waterfall-deal-by-deal-v2.ts:262`.
  Binding-cap and capped-versus-uncapped regressions added at
  `tests/unit/internal-economics/v2/catch-up-allocation-v2.test.ts:163 and :179`.

### Minor Issues

- **[Minor — addressed] Full-gate checkbox claimed completion without
  attributable-failure evidence.** Plan now records exact baseline SHA, failure
  reproduction, flaky-file isolation, and zero attributable failures at
  `docs/1-plans/F_2.0.4_v2-catch-up-allocation-parity.plan.md:283`.

- **[Minor — addressed] Baseline evidence count was internally inconsistent
  (“41” versus “40 + 2”).** Revised wording separates 41 failing tests across 10
  files from deterministic and tail-order per-file attribution classes at
  `docs/1-plans/F_2.0.4_v2-catch-up-allocation-parity.plan.md:285`.

### Suggestions

- **[Observation — accepted override] Test helpers access `normalizeResult.code`
  rather than `normalizeResult.refusal.code`.** Occurrences:
  `tests/unit/internal-economics/v2/waterfall-deal-by-deal-v2.test.ts:97`,
  `tests/unit/internal-economics/v2/waterfall-deal-by-deal-v2.test.ts:492`, and
  `tests/unit/internal-economics/v2/waterfall-whole-fund-v2.test.ts:93`.
  Test-quality review was explicitly excluded, and requester-provided
  three-project typecheck is clean; no change required.

- **[Environment observation — accepted override] Repository-local checklist
  path is not tracked.** Expected absence of
  `.claude/skills/TRIP-review/checklist.md` was explicitly accepted; review used
  installed canonical criteria at
  `/Users/nikhil/.agents/skills/TRIP-review/checklist.md:1`. No implementation
  defect.

---

## Checklist

- [x] 1. Functional Requirements — passed
- [x] 2. Code Quality — passed
- [x] 3. Architectural Compliance — passed
- [x] 4. Error Handling — passed
- [x] 5. Security — not applicable; deterministic internal calculation path
      introduces no trust boundary
- [x] 6. Performance — passed

---

## Verdict

**APPROVED with observations**

All critical and major approval-gate conditions are met, with no open production
findings. Supplied evidence reports clean lint, clean three-project typecheck,
320 passing internal-economics-v2 tests including 20 new tests, 353 passing
Phoenix truth cases with frozen surfaces unchanged, passing calculation gate,
clean diff check, and zero full-suite failures attributable to this change.
Test-only diagnostic access and absent repository-local checklist remain
recorded as explicitly accepted non-blocking observations.
