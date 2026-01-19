---
status: ACTIVE
last_updated: 2026-01-19
---

# Array Safety Utilities - Team Adoption Guide

## Overview

We've implemented a centralized array-safety utility to eliminate null/undefined array errors that were causing production issues. This replaces scattered inline patterns like `(array || []).forEach()` with a consistent, well-tested approach.

## Problem Solved

**Before**: Inconsistent null-safety patterns scattered throughout codebase
```typescript
// Inconsistent approaches found in codebase:
(fundStages || []).forEach(stage => { ... })        // Pattern A
fundStages && fundStages.forEach(stage => { ... })  // Pattern B  
fundStages?.forEach(stage => { ... })               // Pattern C
if (fundStages) fundStages.forEach(stage => { ... }) // Pattern D
```

**After**: Centralized, consistent, well-tested approach
```typescript
import { forEach } from '../utils/array-safety';

forEach(fundStages, stage => {
  // Your logic here - automatically handles null/undefined
});
```

## Quick Start

### 1. Import the utilities you need:
```typescript
import { 
  forEach, 
  map, 
  filter, 
  reduce, 
  safe // For chainable operations 
} from '../utils/array-safety';
```

### 2. Replace inline patterns:

#### forEach Operations
```typescript
// ❌ Old approach
(items || []).forEach(item => processItem(item));

// ✅ New approach  
forEach(items, item => processItem(item));
```

#### Map Operations
```typescript
// ❌ Old approach
const results = (items || []).map(item => transform(item));

// ✅ New approach
const results = map(items, item => transform(item));
```

#### Chainable Operations
```typescript
// ❌ Old approach - multiple null checks
const result = (data || [])
  .filter(item => item.status === 'active')
  .map(item => item.value)
  .reduce((sum, value) => sum + value, 0);

// ✅ New approach - single safe wrapper
const result = safe(data)
  .filter(item => item.status === 'active')
  .map(item => item.value)
  .reduce((sum, value) => sum + value, 0);
```

## Complete API Reference

### Basic Operations
- `forEach(array, callback, thisArg?)` - Safe iteration
- `map(array, callback, thisArg?)` - Safe transformation  
- `filter(array, callback, thisArg?)` - Safe filtering
- `reduce(array, callback, initialValue)` - Safe reduction
- `find(array, callback, thisArg?)` - Safe search
- `some(array, callback, thisArg?)` - Safe existence check
- `every(array, callback, thisArg?)` - Safe universal check

### Utility Functions
- `safeArray(array, defaultValue?)` - Get safe array or default
- `length(array)` - Safe length check (returns 0 for null/undefined)
- `at(array, index)` - Safe element access
- `isArray(value)` - Type guard for arrays
- `isSafeArray(value)` - Type guard for non-null arrays

### Chainable Operations
```typescript
safe(array)
  .map(item => transform(item))
  .filter(item => item.isValid)
  .forEach(item => process(item))
  .toArray(); // Get final array
```

### Advanced Operations
- `forEachNested(array, accessor, callback)` - Safe nested iteration
- `forEachAsync(array, asyncCallback)` - Sequential async processing
- `forEachParallel(array, asyncCallback)` - Parallel async processing
- `forEachWithMetrics(array, callback, metricName?)` - Performance tracking

## Migration Examples

### Example 1: Enhanced Fund Model
```typescript
// Before (vulnerable to null errors)
fundStages.forEach(stage => {
  if (stage.investments) {
    stage.investments.forEach(investment => {
      processInvestment(investment);
    });
  }
});

// After (null-safe)
import { forEach } from '../utils/array-safety';

forEach(fundStages, stage => {
  forEach(stage.investments, investment => {
    processInvestment(investment);
  });
});
```

### Example 2: Cohort Engine Update
```typescript
// Before  
(cohorts || []).forEach(cohort => {
  if (cohort && cohort.companies) {
    (cohort.companies || []).forEach(company => {
      processCompany(company);
    });
  }
});

// After
forEach(cohorts, cohort => {
  if (cohort && cohort.companies) {
    forEach(cohort.companies, company => {
      processCompany(company);
    });
  }
});
```

## ESLint Integration

We've added an ESLint rule to catch unsafe patterns:

```json
// .eslintrc.js
{
  "rules": {
    "custom/no-unsafe-array-foreach": "error"
  }
}
```

This will automatically flag patterns like `(array || []).forEach()` and suggest using the centralized utility.

## Performance Benefits

- **Consistent behavior**: All null/undefined arrays handled uniformly
- **Better debugging**: Centralized logging in development mode  
- **TypeScript safety**: Proper generic types and null handling
- **Reduced bundle size**: Single utility vs scattered patterns
- **Performance tracking**: Built-in metrics for development

## Testing

The utility includes 47 comprehensive tests covering:
- ✅ Null/undefined array handling
- ✅ Empty array handling  
- ✅ Valid array operations
- ✅ Context preservation (`this` binding)
- ✅ Async operations (sequential and parallel)
- ✅ Nested operations
- ✅ Chainable operations
- ✅ Performance metrics
- ✅ TypeScript type safety

## Migration Checklist

- [ ] Import array-safety utilities in your file
- [ ] Replace `(array || []).forEach()` with `forEach(array, callback)`
- [ ] Replace `array?.forEach()` with `forEach(array, callback)`  
- [ ] Replace `(array || []).map()` with `map(array, callback)`
- [ ] Replace complex chaining with `safe(array).method().method()`
- [ ] Run tests to ensure functionality preserved
- [ ] Enable ESLint rule to prevent regressions

## Support

For questions or issues with the array-safety utilities:
1. Check the comprehensive test suite for examples
2. Review this documentation
3. Check ESLint warnings for automatic fixes
4. Reach out to the dev team for complex migration scenarios

## Benefits Summary

1. **🛡️ Production Safety**: Eliminates null/undefined array errors
2. **🔄 Consistency**: Single approach across entire codebase  
3. **🧪 Well-Tested**: 47 tests covering edge cases
4. **⚡ Performance**: Optimized with optional metrics tracking
5. **🔧 Developer Experience**: ESLint integration with auto-fixes
6. **📚 Documentation**: Clear examples and migration path
7. **🏗️ Future-Proof**: Extensible for new array operations

---
*This utility transforms a critical bug fix into a robust architectural improvement that will prevent similar issues going forward.*
