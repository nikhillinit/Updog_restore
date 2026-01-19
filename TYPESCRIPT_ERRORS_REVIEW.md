---
status: ACTIVE
last_updated: 2026-01-19
---

# TypeScript Errors - Manual Review Guide

## Summary
**Total Errors:** 23 (reduced from 27)  
**Status:** 4 errors fixed, 23 require manual review  
**Last Updated:** 2025-08-29

---

## Critical Errors (High Priority)

### 1. Generic Type Constraint Issue
**File:** `client/src/components/wizard/TestIdProvider.tsx`  
**Line:** 65  
**Error:** TS2322 - Type 'PropsWithoutRef<P> & { "data-testid": string; ref: ForwardedRef<any>; }' is not assignable to type 'IntrinsicAttributes & P'

**Context:**
```typescript
return <Component {...props} ref={ref} />
```

**Suggested Fix:**
```typescript
return <Component {...(props as P)} ref={ref} />
```

**Impact:** Affects test ID injection throughout the application

---

### 2. Missing Properties in Type Definitions
**File:** `client/src/lib/error-boundary.ts`  
**Lines:** 250, 258  

**Error 1 (Line 250):** TS2322 - Type '{ company_id: string; planned_cents: number; iteration: number; }[]' missing properties: reason, cap_cents

**Suggested Fix:**
```typescript
// Add missing properties to the allocation objects
allocations: companies.map(c => ({
  company_id: c.id,
  planned_cents: 0,
  iteration: 1,
  reason: 'Recovery fallback',
  cap_cents: 0
}))
```

**Error 2 (Line 258):** TS2353 - 'audit_trail' does not exist in metadata type

**Suggested Fix:**
```typescript
// Remove audit_trail or add it to the type definition
// Option 1: Remove the property
// Option 2: Extend the metadata type
```

---

## Function Signature Mismatches

### 3. Cache.set() Parameter Count
**File:** `client/src/lib/predictive-cache.ts`  
**Lines:** 70, 82  
**Error:** TS2554 - Expected 1 argument, but got 2

**Context:**
```typescript
this.cache.set(key, result, ttl)  // ttl parameter not accepted
```

**Suggested Fix:**
```typescript
// Option 1: Remove ttl parameter
this.cache.set(key, result)

// Option 2: Use a cache implementation that supports TTL
// Consider using a Map with manual TTL management
```

---

### 4. Function Parameter Mismatches
**File:** `client/src/lib/rollout-orchestrator.ts`  
**Line:** 300  
**Error:** TS2554 - Expected 3 arguments, but got 2

**Context:**
```typescript
this.notifyChange(flag, value)  // Missing third parameter
```

**Suggested Fix:**
```typescript
this.notifyChange(flag, value, 'system')  // Add source parameter
```

**Line:** 309  
**Error:** TS2345 - Argument of type 'number' is not assignable to parameter of type 'string'

**Suggested Fix:**
```typescript
localStorage.setItem(key, String(value))
```

---

## Type Definition Issues

### 5. Missing Type Declarations
**File:** `client/src/lib/excel-parity-validator.ts`  
**Line:** 225  
**Error:** TS2353 - 'maxPerStage' does not exist in type 'ParityConstraints'

**Suggested Fix:**
```typescript
// Add to ParityConstraints interface:
interface ParityConstraints {
  // ... existing properties
  maxPerStage?: number;
}
```

**Line:** 301  
**Error:** TS7006 - Parameter 'a' implicitly has an 'any' type

**Suggested Fix:**
```typescript
// Add explicit type annotation
.sort((a: any, b: any) => { /* ... */ })
// Or better: define proper types
```

---

### 6. Error Object Properties
**File:** `client/src/lib/excel-parity.ts`  
**Line:** 128  
**Error:** TS2353 - 'error' does not exist in type 'Error'  
**Error:** TS18046 - 'error' is of type 'unknown'

**Context:**
```typescript
throw Object.assign(new Error(message), { error })
```

**Suggested Fix:**
```typescript
// Create custom error class
class ExcelParityError extends Error {
  constructor(message: string, public originalError: unknown) {
    super(message);
  }
}
throw new ExcelParityError(message, error);
```

---

### 7. Index Signature Access
**File:** `client/src/pages/admin/telemetry.tsx`  
**Line:** 86  
**Error:** TS4111 - Property 'category' comes from an index signature

**Context:**
```typescript
metric.category  // Should use bracket notation
```

**Suggested Fix:**
```typescript
metric['category']
```

---

### 8. Type Conversion Issue
**File:** `client/src/vitals.ts`  
**Line:** 134  
**Error:** TS2352 - Conversion may be a mistake, property 'delta' is missing

**Context:**
```typescript
} as VitalMetric
```

**Suggested Fix:**
```typescript
} as unknown as VitalMetric
// Or add missing delta property
```

---

## Recommended Resolution Strategy

### Phase 1: Quick Fixes (1-2 hours)
1. Add type assertions where safe
2. Fix index signature access patterns
3. Add missing function parameters

### Phase 2: Type Definition Updates (2-3 hours)
1. Extend interfaces with missing properties
2. Create custom error classes
3. Update function signatures

### Phase 3: Refactoring (3-4 hours)
1. Review generic type constraints
2. Implement proper cache with TTL support
3. Standardize error handling patterns

---

## Testing Strategy

After fixes:
```bash
# Type check
npm run check:client

# Verify no runtime issues
npm run dev

# Run tests
npm run test:unit
```

---

## Notes

- Many errors stem from incomplete type definitions
- Some are due to library API mismatches (cache.set)
- Consider enabling `strictNullChecks` after fixing these
- Review if `@ts-ignore` comments are masking other issues

---

## File Priority Order

1. **error-boundary.ts** - Core error handling
2. **predictive-cache.ts** - Performance critical
3. **rollout-orchestrator.ts** - Feature flag system
4. **TestIdProvider.tsx** - Testing infrastructure
5. **excel-parity*.ts** - Validation logic
6. **telemetry.tsx** - Monitoring
7. **vitals.ts** - Performance metrics

---

## Command Reference

```bash
# Check specific file
npx tsc --noEmit client/src/lib/error-boundary.ts

# Check all client files
npm run check:client

# See all errors with context
npm run check:client 2>&1 | less

# Count remaining errors
npm run check:client 2>&1 | grep "error TS" | wc -l
```