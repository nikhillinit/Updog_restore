---
status: ACTIVE
last_updated: 2026-05-08
---

# ADR-010: XIRR Day-Count and Bounds Reconciliation

**Date:** 2026-05-08 **Status:** Accepted **Decision Makers:** LP Reporting
Phase 0 working group **Tags:** #xirr #day-count #bounds #lp-reporting #policy

**Related:** [ADR-005 (XIRR Excel Parity)](./ADR-005-xirr-excel-parity.md),
[ADR-015 (XIRR Bounded Rates)](./ADR-015-XIRR-BOUNDED-RATES.md)

---

## Context

The LP Reporting & Evidence Pack module (Phase 0) requires a single locked XIRR
policy across the canonical solver and the new diagnostic wrapper. The revised
LP Reporting design (`LP_Reporting_Evidence_Pack_Revised_Design.md` section 6.8)
standardizes on `Actual/365` day-count and a default `+10,000%` upper rate
bound. The repository's canonical implementation in `shared/lib/finance/xirr.ts`
does not match either claim:

- `shared/lib/finance/xirr.ts:71` divides day-diff by `365.25`, not `365`. The
  accompanying comment (line 65) records the empirical rationale: Excel
  documentation says `365` but Excel's actual output matches `365.25`. ADR-005
  (`docs/adr/ADR-005-xirr-excel-parity.md`) cites `Actual/365` in prose but the
  validated code uses `365.25`.
- `shared/lib/finance/xirr.ts:52` declares `MAX_RATE = 200` (i.e. +20,000%).
  ADR-015 documents `MAX_RATE = 9.0` (+900%) and the LP Reporting design
  documents +10,000% (`MAX_RATE = 100`). All three numbers disagree.
- `MIN_RATE = -0.999999` (-99.9999%) is consistent across the repository and
  design, modulo the design's coarser "-99%" rounding.
- The clamp-on-bound behavior is implicit: `clampRate()` is applied in every
  solver (`solveNewton`, `solveBrent`, `solveBisection`) but the contract for
  callers ("did this hit a bound?") is not surfaced; ADR-015 marks clamped truth
  cases with `excelParity: false` but the runtime result has no `outOfBounds`
  flag.

Phase 1 of LP Reporting will introduce
`server/services/lp-reporting/xirr-diagnostic-service.ts`, a wrapper that must
report a structured `failureReason`. Without a single policy locked before Phase
1, the wrapper either has to reverse-engineer the canonical solver's bounds at
runtime, or branch on the design's stricter cap, which would diverge from the
truth cases.

---

## Decision

### 1. Day-count: Actual/365.25 (preserve current behavior)

The canonical solver continues to use `Actual/365.25` in `yearFraction()`. The
LP Reporting design's `Actual/365` claim is treated as a documentation error in
the design document; this ADR is the authoritative policy.

Rationale: the existing implementation is validated against Excel by the
golden-set tests (`tests/unit/xirr-golden-set.test.ts`,
`server/services/__tests__/xirr-golden-set.test.ts`) and the truth-case suite
(`docs/xirr.truth-cases.json`, 262 truth cases as of 2026-05-08). Migrating the
denominator to `365` would re-baseline the golden set against a known-divergent
denominator and break the Excel parity claim that drives the entire ADR-005
contract.

This ADR does **not** supersede ADR-005 on day-count. ADR-005 documents both the
prose claim (`Actual/365`) and the code citation
(`365.25 * 24 * 60 * 60 * 1000`); the code is authoritative and remains
unchanged.

### 2. Rate bounds: -99.9999% min, +20,000% max (preserve current behavior)

The canonical solver continues to use:

- `MIN_RATE = -0.999999` (-99.9999%)
- `MAX_RATE = 200` (+20,000%)

This ADR amends ADR-015's documented `MAX_RATE = 9.0` to reflect the
implementation's actual `200`. The bound was widened from `9.0` to handle
extreme short-term returns observed in the truth-case suite (notably penny-stock
and short-hold cases that produce >+900% IRRs); the documentation in ADR-015 was
not updated when the code changed.

The LP Reporting design's `+10,000%` default is preserved as a **soft warning
threshold** in the LP Reporting `xirr-diagnostic-service` (Phase 1) but is not a
hard solver cap.

### 3. OUT_OF_BOUNDS policy: clamp + structured signal

The canonical solver continues to clamp out-of-bounds rates via `clampRate()`.
Truth cases that hit a bound are marked `excelParity: false`.

Phase 1 wrapper contract: the LP Reporting `xirr-diagnostic-service` inspects
the canonical result and returns a structured `failureReason` when the IRR
equals exactly `MIN_RATE` or `MAX_RATE`. The set of reasons is:

- `OUT_OF_BOUNDS_HIGH` (irr === MAX_RATE)
- `OUT_OF_BOUNDS_LOW` (irr === MIN_RATE)
- `INSUFFICIENT_CASH_FLOWS` (irr === null, &lt; 2 cashflows)
- `NO_SIGN_CHANGE` (irr === null, all positive or all negative)
- `MULTIPLE_ROOTS` (irr !== null, but solver flagged ambiguity — Phase 1 may add
  this; canonical solver does not currently signal it)
- `DID_NOT_CONVERGE` (irr === null, all three solver tiers exhausted)

The canonical solver itself adds **no** new return fields. The wrapper performs
the classification.

### 4. Solver wrapping: one implementation, one policy

The LP Reporting `xirr-diagnostic-service` wraps the canonical
`xirrNewtonBisection` (or `safeXIRR`). It does **not** maintain a parallel
solver. All callers — fund analytics, fee calculations, LP Reporting metric runs
— produce the same numeric result for the same input.

---

## Consequences

### Positive

- No code-behavior change. Truth cases pass unchanged. The Phase 0.5 integration
  verifier compares Phoenix truth count to the captured baseline (262) without
  re-baseline.
- The LP Reporting wrapper has a single source of truth for bounds and failure
  classification.
- ADR-015's stale `MAX_RATE` documentation is acknowledged and corrected in this
  ADR; no edits to ADR-015 are required (it remains historically accurate as of
  its `last_updated` date).
- The design doc's `Actual/365` and `+10,000%` claims are explicitly reconciled
  against the implementation; future readers do not have to re-discover the
  conflict.

### Negative

- The design doc retains incorrect numbers in section 6.8. A future revision
  should cite this ADR. The Phase 0 process does not edit the external design
  doc.
- The wrapper's `+10,000%` warning threshold and the solver's `+20,000%` hard
  bound are different numbers. Operators reading raw solver output will see
  clamped rates above `+10,000%`; operators reading wrapper output will see
  warnings starting at `+10,000%` and `failureReason = OUT_OF_BOUNDS_HIGH` only
  at `+20,000%`. This is documented in the wrapper contract.

### Truth-case impact

None. The day-count, bounds, and clamp behavior all match current code.
`npm run phoenix:truth` returned 262 passing tests at the captured baseline
(2026-05-08, SHA `d66d51b4`).

### Excel-parity impact

None. ADR-005's golden-set contract is unchanged.

---

## Code references

- `shared/lib/finance/xirr.ts` (`yearFraction`, `MIN_RATE`, `MAX_RATE`,
  `clampRate`)
- `shared/lib/finance/brent-solver.ts`
- `tests/unit/truth-cases/xirr.test.ts`
- `tests/unit/xirr-golden-set.test.ts`
- `docs/xirr.truth-cases.json`
- `server/services/lp-reporting/xirr-diagnostic-service.ts` (Phase 1, not yet
  created)

---

## Supersedes

This ADR does **not** supersede ADR-005 or ADR-015. It amends ADR-015's
documented `MAX_RATE = 9.0` to acknowledge the implementation's actual
`MAX_RATE = 200`, and it reconciles the LP Reporting design's `Actual/365` and
`+10,000%` claims against the code without changing either.

---

## Changelog

| Date       | Change                                                         |
| ---------- | -------------------------------------------------------------- |
| 2026-05-08 | Initial ADR — locks XIRR day-count and bounds for LP Reporting |
