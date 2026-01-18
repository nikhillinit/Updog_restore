---
type: reflection
id: REFL-004
title: Schema Format Backward Compatibility
status: DRAFT # VERIFIED | DRAFT | DEPRECATED
date: 2026-01-18
version: 1
severity: medium # critical | high | medium | low
wizard_steps: []
error_codes: []
components: []
keywords: []
test_file: tests/regressions/REFL-004.test.ts
superseded_by: null
---

# Reflection: Schema Format Backward Compatibility

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
// VERIFIED IMPLEMENTATION
// Insert robust, tested, and production-ready code here.
// This code should be a clear and safe example to follow.

function exampleValidation(context: FundContext | null): number {
  // Layer 1: Context validation
  if (!context) {
    throw new EngineError(
      "E_CTX_UNINITIALIZED",
      "CRITICAL: Context is null. State may be corrupted."
    );
  }

  // Layer 2: Field validation
  if (context.requiredField === undefined) {
    throw new EngineError(
      "E_FIELD_MISSING",
      `VALIDATION: requiredField not set.`,
      { currentStep: context.currentStep }
    );
  }

  // Layer 3: Business rules
  if (context.requiredField < 0) {
    throw new EngineError(
      "E_BUSINESS_RULE",
      `BUSINESS RULE: Value cannot be negative. Got: ${context.requiredField}`
    );
  }

  // Now safe to proceed
  return context.requiredField * this.rate;
}
```

## 3. Evidence

*   **Test Coverage:** The regression test linked in the frontmatter (`test_file`) prevents this anti-pattern from being reintroduced.
*   **Related DECISIONS.md Entry:** ADR-XXX (if applicable)
*   **Related CHANGELOG.md Entry:** YYYY-MM-DD (if applicable)
