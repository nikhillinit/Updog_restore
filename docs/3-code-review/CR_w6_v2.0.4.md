# Code Review: V2 Catch-Up Allocation Parity (F_2.0.4)

**Review Date**: 2026-08-26

**Version**: 2.0.4 (plan F_2.0.4; package version remains 1.6.0)

**Implementation Head Reviewed**: `588c192a6c6f1f3679b346f12644d3faad1cc775`

**Comparison Implementation**: `3d173ffd5`

**Files Reviewed**:

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

Shipping head implements shared V2 GP catch-up allocation, capped integer-unit
tier budgets, jointly quantized GP/LP splits, common partner apportionment, and
whole-fund plus deal-by-deal integration. Binding-cap over-distribution and
unsupported `pari_passu` opening-history classification found during canonical
PR review are fixed. Exact-head Codex delta review found no blocking
regressions.

APPROVED with observations

---

## Review Provenance

The original Codex loop reviewed the separate implementation commit `3d173ffd5`
over three rounds and returned APPROVED. Canonical PR #1428 evolved materially
through `879b36e45`, `1f747d7cd`, and `588c192a6`; the original verdict was
therefore not transplanted unchanged.

A fresh read-only Codex delta review compared `3d173ffd5..588c192a6` across
implementation, tests, plan, architecture, and changelog. It re-checked cap
quantization, opening-history provenance, cumulative-profit behavior, invariant
conservation, and test validity on the exact shipping code. Verdict: APPROVED.
The review explicitly confirmed the binding-cap and `pari_passu` fixes and found
no blocking findings.

---

## Changes Overview

Shared leaf applies the locked cumulative-profit formula and converts the
catch-up request into a physical-availability-capped integer-unit budget. Shared
helpers then split that budget into GP/LP buckets and apportion each bucket
among eligible partners. Both waterfall engines use capped reconstructed totals
for return of capital and preferred return, and use the shared leaf/split path
for catch-up and carry. Whole-fund maintains fund-level cumulative G/L profit;
deal-by-deal maintains clean-opening per-pool accumulators.

---

## Findings

### Critical Issues

None.

### Major Issues

- **[Major — addressed] Binding-cap HALF_UP rounding could over-distribute
  proceeds.** Physical availability is floored at
  `shared/lib/internal-economics/v2/decimal-cents-v2.ts:12-20`; catch-up
  consumes the capped budget at
  `shared/lib/internal-economics/v2/catch-up-allocation-v2.ts:100-107`. Both
  waterfall engines also reconstruct capped return-of-capital and
  preferred-return totals before subtraction at
  `shared/lib/internal-economics/v2/waterfall-whole-fund-v2.ts:145-150`,
  `shared/lib/internal-economics/v2/waterfall-whole-fund-v2.ts:181-194`,
  `shared/lib/internal-economics/v2/waterfall-deal-by-deal-v2.ts:112-137`, and
  `shared/lib/internal-economics/v2/waterfall-deal-by-deal-v2.ts:149-174`.
  Binding and cross-tier half-micro regressions are covered at
  `tests/unit/internal-economics/v2/catch-up-allocation-v2.test.ts:129-143`,
  `tests/unit/internal-economics/v2/waterfall-whole-fund-v2.test.ts:388-423`,
  and
  `tests/unit/internal-economics/v2/waterfall-deal-by-deal-v2.test.ts:447-482`.

- **[Major — addressed] Nonzero `pari_passu` opening preferred history lacked
  GP/LP provenance for whole-fund catch-up.** Shipping head fails closed before
  allocation at
  `shared/lib/internal-economics/v2/waterfall-whole-fund-v2.ts:110-119`;
  regression coverage is at
  `tests/unit/internal-economics/v2/waterfall-whole-fund-v2.test.ts:489-497`.
  Deal-by-deal independently rejects all nonzero scalar opening profit history
  because it cannot map that history to entitlement pools at
  `shared/lib/internal-economics/v2/waterfall-deal-by-deal-v2.ts:229-236`,
  covered at
  `tests/unit/internal-economics/v2/waterfall-deal-by-deal-v2.test.ts:554-562`.

### Minor Issues

- **[Minor — addressed] Earlier release evidence used a noncanonical test
  invocation and understated coverage.** Fresh canonical runs show 330 passing
  tests on shipping head and 300 on clean merge-base `e0ac8ac9d`, a 30-test
  delta. Focused shipping files contain 15 leaf, 16 deal-by-deal, and 15
  whole-fund cases; their merge-base counts were 0, 8, and 8.

### Suggestions

- **[Observation — non-blocking] Historical plan wording still says
  “current-engine” / “current-vs-locked.”** Shipping test nomenclature correctly
  says “legacy pre-F_2.0.4” at
  `tests/unit/internal-economics/v2/catch-up-allocation-v2.test.ts:160`. Plan
  prose at `docs/1-plans/F_2.0.4_v2-catch-up-allocation-parity.plan.md:257-260`
  and `:293-294` records the pre-implementation comparison language. No
  production or test-behavior defect.

---

## Checklist

- [x] Functional requirements — passed
- [x] Financial correctness and conservation — passed
- [x] Architectural compliance — passed
- [x] Error handling and fail-closed invariants — passed
- [x] Security — no new trust boundary or I/O
- [x] Performance — bounded Decimal and integer-unit passes
- [x] Exact shipping-head delta review — APPROVED

---

## Verification Evidence

Executed on `588c192a6c6f1f3679b346f12644d3faad1cc775`:

- Focused affected suites: 46/46 passed.
- `TZ=UTC npm run test:internal-economics-v2`: 330/330 passed across 15 files.
- Same command on clean merge-base `e0ac8ac9d`: 300/300 passed across 14 files;
  net 30 tests.
- `TZ=UTC npm run phoenix:truth`: 353/353 passed.
- Receipt-builder plus corpus-adapter check: 58/58 passed, including the exact
  4206-byte receipt assertion. Frozen V2-S-0100/0101 truth files have no diff
  against merge-base.
- `TZ=UTC npm run calc-gate`: 353 + 231 + 79 passed.
- `TZ=UTC npm run check`: 0 errors across client, server, and shared projects.
- `npm run lint`: passed with all guardrails.
- `git diff --check 3d173ffd5..588c192a6`: clean.
- Exact-head Codex delta review: APPROVED.

Repository-wide `npm test` remains explicitly non-green rather than being waived
or reported as passing. Exact-head plan evidence records 1,049 files and 13,564
tests passing with one unrelated `internal-analysis.contract` failure;
subsequent isolation produced a different timeout, and both unstable tests
passed together by name filter.

---

## Verdict

**APPROVED with observations**

No open Critical or Major production findings. Approval covers exact shipping
implementation head `588c192a6`; release-document and generated-routing
additions require their own formatting, routing, whitespace, commit, push, and
CI checks before merge.

Review approval only; merge authority remains separate.
