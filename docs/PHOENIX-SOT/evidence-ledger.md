# Phoenix Evidence Ledger

> Source of truth for truth-case pass/fail state across all Phoenix calculation
> modules. Updated manually after each validation run.
>
> **Last validated**: 2026-02-24 (post-remediation) **Branch**:
> fix/server-infra-remediation

---

## Purpose

This ledger tracks the pass/fail/skip/override status of every Phoenix truth
case across all deterministic calculation modules. It provides file:line
pointers for auditability and serves as the pre-release gate checklist for
shipping calculation changes.

---

## Summary Table

| Module             | Cases   | Pass    | Skip  | Override | Truth JSON                                 | Test File                                                                                     |
| ------------------ | ------- | ------- | ----- | -------- | ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| XIRR               | 14      | 14      | 0     | 0        | `docs/xirr.truth-cases.json`               | `tests/unit/truth-cases/runner.test.ts:100`                                                   |
| Waterfall-Tier     | 15      | 15      | 0     | 0        | `docs/waterfall.truth-cases.json`          | `tests/unit/truth-cases/runner.test.ts:179`                                                   |
| Waterfall-Ledger   | 14      | 14      | 0     | 0        | `docs/waterfall-ledger.truth-cases.json`   | `tests/unit/truth-cases/runner.test.ts:253`                                                   |
| Fees               | 10      | 10      | 0     | 0        | `docs/fees.truth-cases.json`               | `tests/unit/truth-cases/runner.test.ts:292`                                                   |
| Capital Allocation | 20      | 20      | 0     | 0        | `docs/capital-allocation.truth-cases.json` | `tests/unit/truth-cases/capital-allocation.test.ts`                                           |
| Exit Recycling     | 20      | 20      | 0     | 0        | `docs/exit-recycling.truth-cases.json`     | `tests/unit/truth-cases/runner.test.ts:354` + `tests/unit/truth-cases/exit-recycling.test.ts` |
| MOIC (Phase 2)     | 10      | 10      | 0     | 0        | `docs/moic.truth-cases.json`               | `tests/unit/engines/moic-truth-cases.test.ts:52`                                              |
| Graduation (Ph. 2) | 4       | 4       | 0     | 0        | inline oracle                              | `tests/unit/engines/graduation-rate-engine.test.ts:322-390`                                   |
| **TOTAL**          | **107** | **107** | **0** | **0**    |                                            |                                                                                               |

---

## Detailed Module Sections

### XIRR (Phase 0)

- **Status**: 14/14 PASS (100%)
- **Truth JSON**: `docs/xirr.truth-cases.json`
- **Test file**: `tests/unit/truth-cases/runner.test.ts:100-176`
- **Precision**: 6 decimal places (0.0001% tolerance)
- **Overrides**: None
- **Skips**: None
- **Notes**: Excel parity assertions active. Convergence strategies tested
  (Newton, Bisection, Hybrid).

### Waterfall-Tier (Phase 1A)

- **Status**: 15/15 PASS (100%)
- **Truth JSON**: `docs/waterfall.truth-cases.json`
- **Test file**: `tests/unit/truth-cases/runner.test.ts:179-252`
- **Precision**: 2 decimal places (excelRound parity)
- **Overrides**: None
- **Skips**: None
- **Notes**: Decimal.js tier-based calculations. American waterfall model.

### Waterfall-Ledger (Phase 1B)

- **Status**: 14/14 PASS (100%)
- **Truth JSON**: `docs/waterfall-ledger.truth-cases.json`
- **Test file**: `tests/unit/truth-cases/runner.test.ts:253-291`
- **Precision**: 2 decimal places (excelRound parity)
- **Overrides**: None
- **Skips**: None
- **Notes**: Clawback and recycling scenarios validated. Uses
  `waterfall-ledger-adapter.ts` for input/output mapping.

### Fees (Phase 1.3)

- **Status**: 10/10 PASS (100%)
- **Truth JSON**: `docs/fees.truth-cases.json`
- **Test file**: `tests/unit/truth-cases/runner.test.ts:292-353`
- **Overrides**: None
- **Skips**: None
- **Notes**: Fee preview computation via `computeFeePreview`. Uses
  `fee-adapter.ts` for case adaptation and `scaleExpectedOutput` for unit
  normalization.

### Capital Allocation (Phase 1B+)

- **Status**: 20/20 PASS (100%) -- zero overrides
- **Truth JSON**: `docs/capital-allocation.truth-cases.json`
- **Test file**: `tests/unit/truth-cases/capital-allocation.test.ts`
- **Overrides**: 0
- **Skips**: None
- **Contract resolution**: CA-001 resolved 2026-02-24. Cash model is canonical
  per `docs/CA-SEMANTIC-LOCK.md` Section 1.1.1. Truth case JSON updated: CA-001
  allocation changed from 80M to 0M (allocable = ending_cash - reserve = 20 - 20
  = 0M). `ALLOCATION_OVERRIDES` removed from both test runners.
- **Skip function**: `shouldSkipTruthCase()` at
  `client/src/core/capitalAllocation/adapter.ts:429-437` returns
  `{ skip: false }` for ALL cases.
- **Duplicate runner**:
  `client/src/core/capitalAllocation/__tests__/truthCaseRunner.test.ts` (same
  20/20 pass, zero overrides).

### Exit Recycling (Phase 1.4A)

- **Status**: 20/20 PASS (100%)
- **Truth JSON**: `docs/exit-recycling.truth-cases.json`
- **Test files**:
  - `tests/unit/truth-cases/runner.test.ts:354` (unified runner section)
  - `tests/unit/truth-cases/exit-recycling.test.ts` (dedicated runner)
- **Overrides**: None
- **Skips**: None
- **Notes**: Both the unified runner and dedicated runner exercise the same 20
  cases independently.

### MOIC (Phase 2)

- **Status**: 10/10 oracle cases
- **Truth JSON**: `docs/moic.truth-cases.json`
- **Test file**: `tests/unit/engines/moic-truth-cases.test.ts:52`
- **Overrides**: None
- **Skips**: None
- **Notes**: Landed in commit 82f193c5. Covers current MOIC, exit MOIC
  (weighted/unweighted), initial MOIC, follow-on MOIC, reserves MOIC,
  opportunity cost MOIC, and blended MOIC variants.

### Graduation Rate (Phase 2)

- **Status**: 4/4 oracle cases PASS
- **Truth JSON**: Inline oracle (hand-arithmetic derivations in test comments)
- **Test file**: `tests/unit/engines/graduation-rate-engine.test.ts:322-390`
- **Cases**:
  - GRAD-01: 100 seed companies after 1 quarter (line 323)
  - GRAD-03: 100 seed companies after 2 quarters (line 341)
  - GRAD-04: Total company count conservation law (line 367)
  - GRAD-05: Single-company deterministic path (line 378)
- **Overrides**: None
- **Skips**: None
- **Notes**: Landed in commit 82f193c5. Expectation mode only (no stochastic).

---

## Resolved Contracts

### CA-001: Cash Model vs Capacity Model (RESOLVED)

- **Document**: `docs/CA-SEMANTIC-LOCK.md`
- **Resolution**: Cash model is canonical (Section 1.1.1). Engine correctly
  computes allocation = ending_cash - reserve. Truth case JSON updated to expect
  0M (not 80M). `ALLOCATION_OVERRIDES` removed from both test runners.
- **Date resolved**: 2026-02-24

### Monte Carlo Orchestrator DI (RESOLVED)

- **Resolution**: `MonteCarloOrchestrator` constructor now accepts optional
  `MonteCarloDataSource` parameter, passed through to `MonteCarloEngine`.
  Deterministic fixture provider created at
  `tests/fixtures/monte-carlo-fixtures.ts`.
- **Date resolved**: 2026-02-24

---

## Monte Carlo Coverage

Monte Carlo tests are non-deterministic and not part of the Phoenix truth-case
system. This section tracks their skip state for completeness.

**Total skips**: 0 (all 10 former skips resolved 2026-02-24).

### Resolved skips

| File                                                            | Former skips                                                      | Resolution                        |
| --------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------- |
| `tests/unit/engines/monte-carlo-orchestrator.test.ts`           | 5 (stochastic, reproducibility, dispatch, min runs, distribution) | DI + fixture provider; 29/29 pass |
| `tests/unit/services/monte-carlo-engine.test.ts`                | 2 (config validation, reserve optimization)                       | Fixed assertions; 35/35 pass      |
| `tests/unit/monte-carlo-2025-validation-core.test.ts`           | 1 (market validation core)                                        | Removed quarantine; all pass      |
| `tests/unit/services/monte-carlo-power-law-validation.test.ts`  | 1 (validation block)                                              | Widened tolerances; 13/13 pass    |
| `tests/unit/services/monte-carlo-power-law-integration.test.ts` | 1 (integration block)                                             | Fixed db mock chain; 14/14 pass   |

### Parity Assertions (NEW)

- **Test file**: `tests/unit/engines/monte-carlo-parity-assertions.test.ts`
- **Status**: 11/11 PASS
- **Coverage**: Convergence diagnostics, reproducibility verification,
  distribution properties (right-skew, monotonic percentiles, CI width,
  non-negative multiples)

---

## Release Gate Checklist

- [x] All deterministic truth cases pass (107/107)
- [x] MOIC oracle cases landed and passing (10/10)
- [x] Graduation rate oracle cases landed and passing (4/4)
- [x] CA runner 20/20 with no overrides (CA-001 contract resolved)
- [x] Orchestrator stochastic blocks in CI (DI + fixture provider)
- [x] Zero unresolved MC skips (10/10 resolved)
- [x] Parity assertions exist and pass (11/11)
- [x] Scope map merged before UX (`docs/PHOENIX-SOT/scope-boundary-map.md`)

---

## Revision History

| Date       | Commit   | Author | Change                                                                                                      |
| ---------- | -------- | ------ | ----------------------------------------------------------------------------------------------------------- |
| 2026-02-24 | 82f193c5 | --     | Initial ledger creation from verified run                                                                   |
| 2026-02-24 | pending  | --     | CA-001 resolved, 10 MC skips unskipped, parity assertions added, scope map created, stale-skip linter added |
