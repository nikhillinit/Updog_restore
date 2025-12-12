# Phoenix Ground Truth

**Version:** 1.0
**Last Updated:** 2025-12-05
**Status:** Template - To be populated during Phase 0A

---

## 1. Engines & Locations

### Tier A (Audit Now - Phoenix Critical)

| Engine | Location | Status | Test Coverage | Precision | Notes |
|--------|----------|--------|---------------|-----------|-------|
| ReferenceFormulas | `client/src/lib/reference-formulas.ts` | _Pending audit_ | _TBD_ | _TBD_ | MOIC, DPI, TVPI, RVPI |
| FeeCalculations (Client) | `client/src/lib/fee-calculations.ts` | _Pending audit_ | _TBD_ | _TBD_ | MVP - only 'committed' basis |
| FeeCalculations (Server) | `shared/schemas/fee-profile.ts` | _Pending audit_ | _TBD_ | _TBD_ | Full 6 basis methods |
| CapitalAllocation | `client/src/lib/capital-allocation-calculations.ts` | _Pending audit_ | _TBD_ | _TBD_ | |
| Waterfall | `client/src/lib/waterfall.ts` | _Pending audit_ | _TBD_ | _TBD_ | Missing clawback calc |
| XIRR | `client/src/lib/finance/xirr.ts` | _Pending audit_ | _TBD_ | _TBD_ | 25 golden cases exist |

### Tier B (Audit Later - Not Phoenix Critical)

| Engine | Location | Reason for Deferral |
|--------|----------|---------------------|
| LiquidityEngine | `client/src/core/LiquidityEngine.ts` | Cash flow analysis, not core calculation |
| PacingEngine | `client/src/core/PacingEngine.ts` | Pacing analysis, not core calculation |
| CohortEngine | `client/src/core/CohortEngine.ts` | Cohort analysis, not core calculation |
| ReserveEngines | `shared/core/reserves/` | Planning/projection, not realized values |

### Precision Strategy

| Domain | Storage | Calculation | Display | Banned Patterns |
|--------|---------|-------------|---------|-----------------|
| Share counts | BigInt (cents) | Decimal.js | Formatted | parseFloat() |
| MOIC/DPI/TVPI | String (in DB) | Decimal.js | 2-4 decimals | Number(bigint) |
| Percentages | String (in DB) | Decimal.js | X.XX% | Math.round(financial) |
| Dollar amounts | BigInt (cents) | Decimal.js | $X,XXX.XX | value * 100 |

### Precision Violations Found

| Location | Violation | Severity | Resolution |
|----------|-----------|----------|------------|
| _To be populated during Phase 0A audit_ | | | |

---

## 2. Truth Cases & Coverage

### MOIC Truth Cases

| File | Scenarios | Provenance | Last Validated |
|------|-----------|------------|----------------|
| `docs/moic.truth-cases.json` | _TBD (target: 4)_ | _TBD_ | _TBD_ |

#### MOIC Scenario Summary

| ID | Name | Gross MOIC | Net MOIC | Status |
|----|------|------------|----------|--------|
| _To be populated during Pre-Phase 0_ | | | | |

### Capital & Fee Truth Cases

| File | Scenarios | Provenance | Last Validated |
|------|-----------|------------|----------------|
| `docs/fees.truth-cases.json` | _TBD_ | _TBD_ | _TBD_ |
| `docs/capital-allocation.truth-cases.json` | _TBD_ | _TBD_ | _TBD_ |

### Waterfall Truth Cases

| File | Scenarios | Provenance | Last Validated |
|------|-----------|------------|----------------|
| `docs/waterfall.truth-cases.json` | _Existing_ | _TBD_ | _TBD_ |

#### Waterfall Scenario Summary

| ID | Name | Hurdle | Catch-up | Clawback | Status |
|----|------|--------|----------|----------|--------|
| _To be populated during Phase 4_ | | | | | |

### IRR Truth Cases

| File | Scenarios | Provenance | Last Validated |
|------|-----------|------------|----------------|
| `docs/xirr.truth-cases.json` | 25 | Excel + Tactyc | _TBD_ |

---

## 3. Tactyc Alignment Notes

### Where We Match Tactyc

| Calculation | Tactyc Formula | Our Formula | Match? |
|-------------|----------------|-------------|--------|
| Gross MOIC | (Distributions + NAV) / Contributions | Same | _TBD_ |
| Net MOIC | After fees and carry | _TBD_ | _TBD_ |
| IRR | XIRR with daily precision | Same | _TBD_ |

### Where We Differ from Tactyc

| Calculation | Tactyc Approach | Our Approach | Reason | Impact |
|-------------|-----------------|--------------|--------|--------|
| _To be populated during audit_ | | | | |

### Tactyc Alignment Validation

| Scenario | Tactyc Value | Our Value | Delta | Within Tolerance? |
|----------|--------------|-----------|-------|-------------------|
| _To be populated_ | | | | |

---

## 4. Known Deviations vs Legacy

### Accepted Deviations

| Scenario | Legacy Value | Phoenix Value | Delta | Reason | Impact | Decision |
|----------|--------------|---------------|-------|--------|--------|----------|
| _Example: Rounding edge case_ | _$100.005_ | _$100.01_ | _$0.005_ | _Banker's rounding vs truncation_ | _Immaterial_ | _Accepted_ |

### Under Investigation

| Scenario | Legacy Value | Phoenix Value | Delta | Status | Assigned |
|----------|--------------|---------------|-------|--------|----------|
| _To be populated as discovered_ | | | | | |

### Resolution Log

| Date | Scenario | Resolution | Notes |
|------|----------|------------|-------|
| _To be populated_ | | | |

---

## 5. Validation Layer Status

### Layer Implementation by Module

| Module | L1 (Plausibility) | L2 (Fund State) | L3 (Output Contract) | L4 (Instrumentation) |
|--------|-------------------|-----------------|----------------------|----------------------|
| MOIC | _Pending_ | Skip | _Pending_ | _Pending_ |
| Capital | _Pending_ | _Pending_ | Skip | _Pending_ |
| Fees | _Pending_ | Skip | _Pending_ | _Pending_ |
| IRR | _Pending_ | Skip | Later | _Pending_ |
| Waterfall | _Pending_ | _Pending_ | _Pending_ | _Pending_ |

### Validation Schema Locations

| Layer | Schema File | Status |
|-------|-------------|--------|
| L1 | `shared/schemas/phoenix-validation.ts` | _Not created_ |
| L2 | `shared/lib/lifecycle-rules.ts` (existing) | _Leverage existing_ |
| L3 | `shared/schemas/output-contracts.ts` | _Not created_ |
| L4 | `shared/instrumentation/phoenix-logger.ts` | _Not created_ |

---

## 6. Feature Flags

### PHOENIX_FLAGS Status

| Flag | Defined | Tested | Dependencies |
|------|---------|--------|--------------|
| `phoenix.enabled` | _No_ | _No_ | None |
| `phoenix.shadow_mode` | _No_ | _No_ | phoenix.enabled |
| `phoenix.moic` | _No_ | _No_ | phoenix.enabled |
| `phoenix.fees` | _No_ | _No_ | phoenix.moic |
| `phoenix.waterfall` | _No_ | _No_ | phoenix.fees |
| `phoenix.irr` | _No_ | _No_ | phoenix.moic |

### Rollout Status

| Flag | Current % | Target % | Notes |
|------|-----------|----------|-------|
| _To be populated during Phase 6_ | | | |

---

## 7. Test Coverage

### Phoenix-Specific Tests

| Test File | Module | Cases | Passing | Notes |
|-----------|--------|-------|---------|-------|
| _To be populated as tests are written_ | | | | |

### Existing Tests Leveraged

| Test File | Module | Cases | Phoenix-Relevant |
|-----------|--------|-------|------------------|
| `tests/unit/reference-formulas.test.ts` | MOIC | _TBD_ | Yes |
| `tests/unit/fees.test.ts` | Fees | _TBD_ | Yes |
| `tests/unit/xirr-golden-set.test.ts` | IRR | 25 | Yes |
| `client/src/lib/__tests__/waterfall.test.ts` | Waterfall | 19 | Yes |

---

## 8. Phase Completion Log

| Phase | Start Date | End Date | Exit Criteria Met | Notes |
|-------|------------|----------|-------------------|-------|
| Pre-0 (Jest-dom) | _TBD_ | _TBD_ | _TBD_ | |
| Pre-0 (Truth cases) | _TBD_ | _TBD_ | _TBD_ | |
| 0A | _TBD_ | _TBD_ | _TBD_ | |
| 0B | _TBD_ | _TBD_ | _TBD_ | |
| 1 (MOIC) | _TBD_ | _TBD_ | _TBD_ | |
| 2 (Cashflows & Fees) | _TBD_ | _TBD_ | _TBD_ | |
| 4 (Waterfall) | _TBD_ | _TBD_ | _TBD_ | |
| 5 (IRR) | _TBD_ | _TBD_ | _TBD_ | |
| 6 (Shadow) | _TBD_ | _TBD_ | _TBD_ | |

---

## Document Control

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-12-05 | Initial template created |

---

**Note:** This document consolidates what was previously planned as separate files:
- ENGINE_AUDIT.md → Section 1
- TRUTH_CASE_INVENTORY.md → Section 2
- TACTYC_ALIGNMENT.md → Section 3

Update relevant sections as work progresses. Do not create separate files.
