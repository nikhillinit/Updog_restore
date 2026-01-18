---
type: reflection
id: REFL-000
title: Short Descriptive Title
status: DRAFT # VERIFIED | DRAFT | DEPRECATED
date: 2026-01-18
version: 1
severity: medium # critical | high | medium | low
wizard_steps: []
error_codes: []
components: []
keywords: []
test_file: tests/regressions/REFL-000.test.ts
superseded_by: null
---

# Reflection: [Title matches frontmatter]

## 1. The Anti-Pattern (The Trap)

**Context:** Describe the specific scenario or mental model that leads to this mistake.

**How to Recognize This Trap:**
1.  **Error Signal:** What error message (e.g., `TS2532`) or runtime behavior occurs?
2.  **Code Pattern:** Describe the abstract shape of the problematic code (e.g., "Direct property access `obj.prop` without validation"). Avoid repo-specific identifiers.
3.  **Mental Model:** What incorrect assumption leads a developer to write this code? (e.g., "Assuming the wizard auto-hydrates all fund data at every step").

**Financial Impact:** What is the negative consequence if this anti-pattern is implemented? (e.g., "If this check is bypassed with `?? 0`, a missing value appears as '$0' in reports, which is indistinguishable from a legitimate empty fund.")

> **DANGER:** Do NOT implement logic that matches the symptoms above.

## 2. The Verified Fix (The Principle)

**Principle:** State the guiding principle for the fix (e.g., "Fail Loud in Financial Systems" or "Validate at the Boundary").

**Implementation Pattern:** Describe the correct sequence of operations.
1.  Validate context exists.
2.  Validate required fields exist.
3.  Validate business rules.
4.  Only then, perform the calculation.

```typescript
// ✅ VERIFIED IMPLEMENTATION
// Insert robust, tested, and production-ready code here.
// This code should be a clear and safe example to follow.

function calculateReserve(fundContext: FundContext | null): number {
  // Layer 1: Context validation
  if (!fundContext) {
    throw new EngineError(
      "E_CTX_UNINITIALIZED",
      "CRITICAL: FundContext is null. Wizard state may be corrupted."
    );
  }

  // Layer 2: Field validation
  if (fundContext.totalCommitted === undefined) {
    throw new EngineError(
      "E_FIELD_MISSING",
      `VALIDATION: totalCommitted not set. Complete Step 2 (Capital Calls) first.`,
      { currentStep: fundContext.currentStep }
    );
  }

  // Layer 3: Business rules
  if (fundContext.totalCommitted < 0) {
    throw new EngineError(
      "E_BUSINESS_RULE",
      `BUSINESS RULE: Committed capital cannot be negative. Got: ${fundContext.totalCommitted}`
    );
  }

  // Now safe to calculate
  return fundContext.totalCommitted * this.reserveRate;
}
```

## 3. Evidence

*   **Test Coverage:** The regression test linked in the frontmatter (`test_file`) prevents this anti-pattern from being reintroduced.
*   **Peer Review:** This reflection has been reviewed and verified by the team.
