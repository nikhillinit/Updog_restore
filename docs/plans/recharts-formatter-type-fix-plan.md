---
status: ACTIVE
last_updated: 2026-01-19
---

# Recharts Formatter Type Fix - Implementation Plan

**Created**: 2026-01-12
**Status**: Ready for Implementation
**Estimated Changes**: 21 files, ~100 line changes
**Risk Level**: Low (type-only changes, no runtime behavior modification)

---

## Executive Summary

This plan addresses 52+ TypeScript errors consisting of:
- **37 Recharts Formatter type mismatches** across 19 client files
- **2 shared polymorphic type errors** in ChartSafe.tsx and polymorphic.ts
- **13 miscellaneous type errors** (stores, workers, vitals, etc.)

The core issue: Recharts' `Formatter` type expects optional parameters (`value: T | undefined`), but our formatter functions assume required parameters (`value: T`). This causes TypeScript strict mode to reject the assignments.

---

## Problem Analysis

### Root Cause: Recharts Formatter Type Signature

```typescript
// Recharts Formatter type (from recharts/types/component/DefaultTooltipContent.d.ts)
export type Formatter<TValue, TName> = (
  value: TValue | undefined,     // <-- Can be undefined
  name: TName | undefined,       // <-- Can be undefined
  item: Payload<TValue, TName>,
  index: number,
  payload: ReadonlyArray<Payload<TValue, TName>>
) => [React.ReactNode, TName] | React.ReactNode;
```

### Current Code Pattern (Problematic)

```typescript
// Pattern 1: Direct value access without null check
<Tooltip formatter={(value: number) => formatCurrency(value)} />

// Pattern 2: Tuple return with typed value
<Tooltip formatter={(value: number) => [formatCurrency(value), 'Label']} />

// Pattern 3: Multi-parameter with name
<Tooltip formatter={(value: number, name: string) => [
  formatCurrency(value),
  name === 'amount' ? 'Amount' : 'Rate'
]} />
```

### Why This Breaks

1. **Parameter type mismatch**: `(value: number)` is not assignable to `(value: number | undefined)`
2. **Strict mode**: TypeScript strictFunctionTypes prevents narrower parameter types
3. **Runtime safe**: The value is almost always defined in practice, but types must reflect possibility

---

## Solution Strategy

### Approach A: Type-Safe Formatter Utility (RECOMMENDED)

Create a utility module that provides type-safe wrapper functions:

```typescript
// client/src/lib/chart-formatters.ts

import type { Formatter, ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent';

/**
 * Creates a type-safe Recharts formatter that handles undefined values
 * @param fn - Formatter function that receives guaranteed non-undefined value
 * @param fallback - Optional fallback for undefined values (default: '')
 */
export function createFormatter<T extends ValueType = number>(
  fn: (value: T) => React.ReactNode,
  fallback: React.ReactNode = ''
): Formatter<T, NameType> {
  return (value) => (value !== undefined ? fn(value) : fallback);
}

/**
 * Creates a tuple-returning formatter [value, label]
 */
export function createTupleFormatter<T extends ValueType = number, N extends NameType = string>(
  fn: (value: T) => React.ReactNode,
  label: N,
  fallback: React.ReactNode = ''
): Formatter<T, N> {
  return (value) => [value !== undefined ? fn(value) : fallback, label];
}

/**
 * Creates a formatter with dynamic label based on name parameter
 */
export function createDynamicFormatter<T extends ValueType = number, N extends NameType = string>(
  fn: (value: T, name: N | undefined) => [React.ReactNode, N],
  fallback: React.ReactNode = ''
): Formatter<T, N> {
  return (value, name) => {
    if (value === undefined) return [fallback, name as N];
    return fn(value, name);
  };
}
```

### Approach B: Inline Type Assertion (Quick Fix)

For rapid fixes without creating a utility:

```typescript
// Before
<Tooltip formatter={(value: number) => formatCurrency(value)} />

// After - Option 1: Accept undefined, handle inline
<Tooltip formatter={(value) => value !== undefined ? formatCurrency(value) : ''} />

// After - Option 2: Accept undefined with default
<Tooltip formatter={(value = 0) => formatCurrency(value)} />
```

### Approach C: Type Cast (Not Recommended)

```typescript
// Avoid this - loses type safety
<Tooltip formatter={((value: number) => formatCurrency(value)) as Formatter<number, string>} />
```

---

## Implementation Plan

### Phase 1: Create Formatter Utility (15 minutes)

**File**: `client/src/lib/chart-formatters.ts`

1. Create formatter utility with three helper functions:
   - `createFormatter` - Simple value formatter
   - `createTupleFormatter` - Returns [formatted, label] tuple
   - `createDynamicFormatter` - Dynamic label based on name

2. Add comprehensive JSDoc documentation

3. Export from client/src/lib/index.ts if it exists

### Phase 2: Fix Shared Polymorphic Types (10 minutes)

**Files**:
- `shared/charting/ChartSafe.tsx`
- `shared/charting/polymorphic.ts`

**Fix Strategy**: Use explicit type assertions with `as unknown as` pattern for forwardRef:

```typescript
// ChartSafe.tsx fix
return React.forwardRef<Element, T>((props, ref) => {
  // implementation
}) as React.ForwardRefExoticComponent<React.PropsWithRef<T>>;
```

```typescript
// polymorphic.ts fix - use double assertion
return forwardRef(render as unknown as ForwardRefRenderFunction<Element, any>) as ...;
```

### Phase 3: Fix Client Formatter Errors (30 minutes)

Fix all 37 formatter instances across 19 files. Group by pattern:

#### Pattern A: Simple Value Formatters (14 instances)
Files: CashflowDashboard.tsx (4), SecondaryMarketAnalysis.tsx (1), lp/performance.tsx (2), portfolio-constructor.tsx (1), etc.

```typescript
// Before
formatter={(value: number) => formatCurrency(value)}

// After - using utility
formatter={createFormatter(formatCurrency)}

// Or inline
formatter={(value) => value !== undefined ? formatCurrency(value) : ''}
```

#### Pattern B: Tuple Formatters with Static Label (15 instances)
Files: portfolio-insights.tsx (2), PerformanceDashboard.tsx (3), exit-analysis.tsx (3), etc.

```typescript
// Before
formatter={(value: number) => [formatCurrency(value), 'Amount']}

// After - using utility
formatter={createTupleFormatter(formatCurrency, 'Amount')}

// Or inline
formatter={(value) => [value !== undefined ? formatCurrency(value) : '', 'Amount']}
```

#### Pattern C: Dynamic Label Formatters (8 instances)
Files: CapitalCallOptimizationChart.tsx (2), portfolio-construction.tsx (4), etc.

```typescript
// Before
formatter={(value: number, name: string) => [
  formatCurrency(value),
  name === 'amount' ? 'Amount' : 'Rate'
]}

// After - using utility
formatter={createDynamicFormatter((value, name) => [
  formatCurrency(value),
  name === 'amount' ? 'Amount' : 'Rate'
])}

// Or inline with null checks
formatter={(value, name) => [
  value !== undefined ? formatCurrency(value) : '',
  name === 'amount' ? 'Amount' : 'Rate'
]}
```

### Phase 4: Fix Remaining Client Errors (15 minutes)

1. **recharts-bundle.tsx** (4 errors) - Chart adapter type issues
2. **modeling-wizard.machine.ts** (2 errors) - XState context types
3. **services/funds.ts** (3 errors) - FundPayload type issues
4. **useFundStore.ts** (2 errors) - Zustand state typing
5. **vitals.ts** (2 errors) - Window type casting
6. **analytics.worker.ts** (2 errors) - CashFlow/config types

### Phase 5: Verification & Commit (10 minutes)

1. Run `npx tsc -p tsconfig.client.json --noEmit` - verify 0 errors
2. Run `npx tsc -p tsconfig.shared.json --noEmit` - verify 0 errors
3. Run `npm test -- --project=client` - verify no regressions
4. Update baseline: `npm run baseline:save`
5. Commit with descriptive message

---

## File Change Matrix

| File | Errors | Fix Pattern | Priority |
|------|--------|-------------|----------|
| shared/charting/ChartSafe.tsx | 1 | Type assertion | P0 |
| shared/charting/polymorphic.ts | 1 | Type assertion | P0 |
| client/src/lib/chart-formatters.ts | NEW | Utility creation | P0 |
| CashflowDashboard.tsx | 4 | createFormatter | P1 |
| PerformanceDashboard.tsx | 3 | createTupleFormatter | P1 |
| portfolio-construction.tsx | 4 | createDynamicFormatter | P1 |
| SecondaryMarketAnalysis.tsx | 3 | Mixed | P1 |
| exit-analysis.tsx | 3 | createTupleFormatter | P1 |
| portfolio-insights.tsx | 2 | createTupleFormatter | P1 |
| CapitalCallOptimizationChart.tsx | 2 | createDynamicFormatter | P1 |
| projected-performance.tsx | 2 | createFormatter | P1 |
| PortfolioSummary.tsx | 2 | createDynamicFormatter | P1 |
| return-the-fund.tsx | 2 | createTupleFormatter | P1 |
| lp/performance.tsx | 2 | createFormatter | P1 |
| Other files (10) | 1 each | Varies | P2 |

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Runtime regression | Low | Medium | All changes are type-only; formatters handle undefined gracefully |
| Missing edge case | Low | Low | Fallback values ensure graceful degradation |
| Breaking changes | Very Low | High | No API changes; internal type fixes only |
| Test failures | Low | Low | Run full test suite before commit |

---

## Success Criteria

1. [ ] `npx tsc -p tsconfig.client.json --noEmit` returns 0 errors
2. [ ] `npx tsc -p tsconfig.shared.json --noEmit` returns 0 errors
3. [ ] `npm test -- --project=client` passes all tests
4. [ ] No runtime behavior changes (verified via test coverage)
5. [ ] Baseline updated to reflect reduction

---

## Rollback Plan

If issues arise post-implementation:

1. Revert commit: `git revert HEAD`
2. Restore baseline: `git checkout HEAD~1 -- .tsc-baseline.json`
3. Document issue in DECISIONS.md for future reference

---

## References

- Recharts TypeScript Types: `node_modules/recharts/types/`
- TypeScript strictFunctionTypes: https://www.typescriptlang.org/tsconfig#strictFunctionTypes
- React forwardRef types: https://react-typescript-cheatsheet.netlify.app/docs/basic/getting-started/forward_and_create_ref

