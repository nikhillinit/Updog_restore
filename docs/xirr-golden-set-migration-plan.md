# XIRR Golden Set Migration Plan

**Date**: 2025-12-09 **Phoenix Phase**: 0.2 (Truth Case Runner Setup)
**Status**: Ready for execution

---

## Objective

Migrate 14 Excel-validated XIRR scenarios from
`tests/unit/xirr-golden-set.test.ts` to `docs/xirr.truth-cases.json`, increasing
coverage from 25 → 39 scenarios.

---

## Rationale

### Why This Belongs in Phase 0.2

1. **Pre-existing validation**: All 14 cases already have Excel-verified IRR
   values
2. **Zero new work**: No Excel validation required; just format migration
3. **Fills gap**: Current JSON lacks "golden-set" tag coverage
4. **Aligns with Phase 0**: Validating existing behavior (not creating new
   cases)

### Why NOT the Business Patterns (Yet)

**The 11 "Business Pattern" cases should be DEFERRED to Phase 1A Step 1A.4:**

- All have `"irr": null` (unvalidated placeholders)
- Violates "truth cases define correctness" principle
- Would cause immediate test failures
- Belongs in "Truth Case Coverage Expansion" phase

---

## Migration Checklist

### Pre-Migration Validation

- [ ] Read `tests/unit/xirr-golden-set.test.ts` completely
- [ ] Extract exact IRR values from test assertions
- [ ] Verify Excel parity claims in test comments
- [ ] Check for precision inconsistencies

### Format Conversion

For each of the 14 golden set cases:

1. **Extract from test**:

   ```typescript
   // Example from test file
   expect(Math.abs(result.irr! - 0.148698355)).toBeLessThan(EXCEL_TOLERANCE);
   ```

2. **Convert to JSON**:

   ```json
   {
     "scenario": "Golden Case 1: Standard 2-flow",
     "tags": ["baseline", "golden-set"],
     "notes": "Simple 5-year doubling, ~14.87%",
     "input": {
       "cashflows": [
         { "date": "2020-01-01", "amount": -100000 },
         { "date": "2025-01-01", "amount": 200000 }
       ],
       "config": { "tolerance": 1e-7, "strategy": "newton" }
     },
     "expected": {
       "irr": 0.148698355, // Use EXACT value from test
       "converged": true,
       "algorithm": "newton",
       "excelParity": true
     },
     "category": "golden-set",
     "excelFormula": "=XIRR({-100000, 200000}, {DATE(2020,1,1), DATE(2025,1,1)})"
   }
   ```

3. **Validate**:
   - IRR matches test file exactly
   - All required fields present
   - Cashflow dates/amounts match test
   - Tags include "golden-set"

### Post-Migration Verification

- [ ] Run truth case runner:
      `npm test -- tests/truth-cases/runner.test.ts --run`
- [ ] Verify 39/39 pass (25 existing + 14 new)
- [ ] Check for precision failures (should use `toBeCloseTo`)
- [ ] Confirm "golden-set" tag searchable

---

## Critical Precision Notes

### Known Discrepancy in Proposal

The user-provided JSON has **inconsistent precision**:

| Case   | Proposal IRR | Test File IRR | Action                                  |
| ------ | ------------ | ------------- | --------------------------------------- |
| Case 1 | 0.148698     | 0.148698355   | Use test file value (more precise)      |
| Case 2 | 0.298764     | 0.298764      | ✅ Match                                |
| Case 4 | 1.723456     | ?             | **VERIFY** - seems too precise for test |
| Case 9 | 17.544347    | ?             | **VERIFY** - check test file            |

**Action Required**: Cross-reference ALL IRR values against test file before
adding.

---

## Implementation Steps

### 1. Extract Golden Set Cases

```bash
# Read the test file
cat tests/unit/xirr-golden-set.test.ts

# Identify all 14 test cases
# Extract exact IRR values from expect() statements
```

### 2. Append to xirr.truth-cases.json

```bash
# Current count
grep -c '"scenario":' docs/xirr.truth-cases.json
# Output: 25

# After migration
# Expected: 39
```

### 3. Update Phoenix Plan Reference

Update `PHOENIX-EXECUTION-PLAN-v2.31.md` Step 0.2:

```markdown
**XIRR Truth Cases:**

- Current: 25 scenarios (basic + edge cases)
- Golden Set Migration: +14 scenarios (Excel-validated)
- **New Total**: 39/50 scenarios
- Remaining: 11 business pattern scenarios (Phase 1A Step 1A.4)
```

### 4. Run Validation

```bash
npm test -- tests/truth-cases/runner.test.ts --run
# Expected: 39/39 XIRR scenarios pass
```

---

## Business Pattern Cases (DEFERRED)

The following 11 cases should be created in **Phase 1A Step 1A.4** using the
`/test` command:

1. Standard J-Curve
2. Lemon Fund (Low Exit)
3. Dividend Recap
4. Bridge Loan (Short Term)
5. Unicorn Exit
6. Secondary Purchase
7. Alternating Signs (Storm)
8. Massive Scale Diff
9. Real Estate Rental
10. Distressed Debt
11. Management Fee Heavy

**Phase 1A Step 1A.4 Process:**

```bash
/test --module="xirr" --count=11 \
  --specialists="edge-case-expert,boundary-validator,statistical-analyst,regression-detector" \
  --focus="VC/PE business patterns: J-Curve, recaps, bridge loans, unicorn exits"
# Each specialist proposes scenarios → validate in Excel → add to JSON
```

This ensures:

- All new cases are validated BEFORE addition
- Business logic is vetted by domain experts
- No placeholders with `"irr": null` in production truth cases

---

## Success Criteria

- [ ] 14 golden set cases added to xirr.truth-cases.json
- [ ] All IRR values match test file exactly
- [ ] Truth case runner passes: 39/39 XIRR scenarios
- [ ] Phoenix plan updated with new count (39/50)
- [ ] Business patterns documented for Phase 1A Step 1A.4

---

## Phoenix v2.32 Integration

**Phase 0.2 Enhancement:**

Add this migration as a sub-step:

````markdown
### Step 0.2b: Migrate Golden Set (30 min)

**Objective:** Add 14 Excel-validated scenarios from unit tests to truth case
JSON.

**RECOMMENDED COMMANDS:**

- Use standard text editor (no automation needed)
- Cross-reference: `tests/unit/xirr-golden-set.test.ts` →
  `docs/xirr.truth-cases.json`

**Process:**

1. Extract 14 scenarios from test file
2. Convert to JSON format (match existing structure)
3. Verify IRR precision matches test expectations
4. Append to xirr.truth-cases.json
5. Run truth case runner to confirm 39/39 pass

**Verification:**

```bash
npm test -- tests/truth-cases/runner.test.ts --run
# Expected: 39/39 XIRR scenarios pass
```
````

**Deliverable:** xirr.truth-cases.json with 39 scenarios (25 + 14 golden set)

```

---

**Status**: Ready for execution after IRR precision verification
```
