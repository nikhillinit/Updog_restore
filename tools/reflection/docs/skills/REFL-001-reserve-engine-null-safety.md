---
type: reflection
id: REFL-001
title: Reserve Engine Null Safety
status: VERIFIED
date: 2026-01-18
version: 1
severity: medium
wizard_steps:
  - step2-capital-calls
  - step5-reserves
error_codes:
  - E_CTX_UNINITIALIZED
  - E_FIELD_MISSING
  - E_BUSINESS_RULE
components:
  - DeterministicReserveEngine
  - wizard-reserve-bridge
keywords:
  - null safety
  - validation
  - reserve calculation
  - wizard state
test_file: tests/regressions/REFL-001.test.ts
superseded_by: null
---

# Reflection: Reserve Engine Null Safety

## 1. The Anti-Pattern (The Trap)

**Context:** When calculating reserves from wizard state, developers may assume the context is always fully hydrated.

**How to Recognize This Trap:**
1. **Error Signal:** `TypeError: Cannot read property 'X' of null` or `NaN` in financial outputs
2. **Code Pattern:** Direct property access `fundContext.totalCommitted` without validation
3. **Mental Model:** Assuming the wizard auto-hydrates all fund data at every step

**Financial Impact:** If this check is bypassed with `?? 0`, a missing value appears as '$0' in reports, which is indistinguishable from a legitimate empty fund. Silent data corruption in financial calculations.

> **DANGER:** Do NOT implement logic that returns 0 or NaN for null/undefined context.

## 2. The Verified Fix (The Principle)

**Principle:** "Fail Loud in Financial Systems" - Invalid state must throw with actionable error codes, never silently compute incorrect values.

**Implementation Pattern:** Three-layer validation before any calculation:
1. Validate context object exists (not null/undefined)
2. Validate required fields exist (not undefined)
3. Validate business rules (not negative, within bounds)

```typescript
// ✅ VERIFIED IMPLEMENTATION
function calculateReserve(fundContext: FundContext | null): number {
  // Layer 1: Context validation - MUST throw, not return 0
  if (!fundContext) {
    throw new ReserveCalculationError(
      "CRITICAL: FundContext is null. Wizard state may be corrupted.",
      "E_CTX_UNINITIALIZED",
      { source: "calculateReserve" }
    );
  }

  // Layer 2: Field validation - MUST throw with actionable message
  if (fundContext.totalCommitted === undefined) {
    throw new ReserveCalculationError(
      `VALIDATION: totalCommitted not set. Complete Step 2 (Capital Calls) first.`,
      "E_FIELD_MISSING",
      { currentStep: fundContext.currentStep }
    );
  }

  // Layer 3: Business rule validation
  if (fundContext.totalCommitted < 0) {
    throw new ReserveCalculationError(
      `BUSINESS RULE: Committed capital cannot be negative. Got: ${fundContext.totalCommitted}`,
      "E_BUSINESS_RULE",
      { totalCommitted: fundContext.totalCommitted }
    );
  }

  // Now safe to calculate
  return fundContext.totalCommitted * this.reserveRate;
}
```

## 3. Evidence

* **Test Coverage:** `tests/regressions/REFL-001.test.ts` - 9 tests covering all three validation layers
* **Real Implementation:** `shared/core/reserves/DeterministicReserveEngine.ts` uses `ReserveCalculationError`
* **Error Codes:** Enable programmatic handling - UI can redirect to correct wizard step
