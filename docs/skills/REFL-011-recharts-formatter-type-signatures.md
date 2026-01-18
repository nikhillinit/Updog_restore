---
type: reflection
id: REFL-011
title: Recharts Formatter Type Signatures
status: DRAFT
date: 2026-01-18
version: 1
severity: medium
wizard_steps: []
error_codes: [TS2345, TS2322]
components: [client, charts, recharts]
keywords: [recharts, tooltip, formatter, typescript, undefined, callback]
test_file: tests/regressions/REFL-011.test.ts
superseded_by: null
---

# Reflection: Recharts Formatter Type Signatures

## 1. The Anti-Pattern (The Trap)

**Context:** Recharts Tooltip and Legend components accept formatter callbacks where the `name` parameter can be `undefined` in certain edge cases, but TypeScript defaults suggest it's always a string.

**How to Recognize This Trap:**
1.  **Error Signal:** `TS2345: Argument of type '(name: string) => string' is not assignable to parameter of type '(name: string | undefined) => string'`
2.  **Code Pattern:** Using strict `(name: string)` signature for Recharts formatter callbacks:
    ```typescript
    // ANTI-PATTERN
    <Tooltip formatter={(value, name: string) => formatLabel(name)} />
    ```
3.  **Mental Model:** Assuming Recharts always provides defined values for all callback parameters. In reality, `name` can be `undefined` when data series lack explicit names.

**Financial Impact:** TypeScript errors block builds, causing CI failures and delaying deployments of otherwise valid code changes.

> **DANGER:** Do NOT assume Recharts callback parameters are always defined.

## 2. The Verified Fix (The Principle)

**Principle:** Match callback signatures to actual Recharts types - always account for optional parameters.

**Implementation Pattern:**
1.  Use `string | undefined` for `name` parameter in formatters
2.  Provide fallback value when `name` is undefined
3.  Consider using type assertions only as last resort

```typescript
// VERIFIED IMPLEMENTATION

// Option 1: Handle undefined explicitly (preferred)
<Tooltip
  formatter={(value, name: string | undefined) => {
    const displayName = name ?? 'Unknown';
    return `${displayName}: ${formatCurrency(value)}`;
  }}
/>

// Option 2: Use Recharts' built-in types
import type { TooltipProps } from 'recharts';

const CustomTooltip: TooltipProps['formatter'] = (value, name) => {
  // TypeScript now knows name can be undefined
  return name ? `${name}: ${value}` : String(value);
};

// Option 3: For Legend formatters
<Legend
  formatter={(value: string | undefined, entry) => {
    return value ?? entry?.dataKey ?? 'Series';
  }}
/>
```

## 3. Evidence

*   **Test Coverage:** `tests/regressions/REFL-011.test.ts` validates formatter type signatures
*   **Source Session:** Jan 8-18 2026 - TypeScript error reduction campaign (119 → 21 errors)
*   **Files Affected:** Multiple chart components using Recharts Tooltip/Legend formatters
