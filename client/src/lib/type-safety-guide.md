# Type Safety Guide

This guide documents the type safety utilities and patterns implemented to prevent common TypeScript errors in the codebase.

## Overview

The type safety system consists of three main modules:

1. **Type Guards** (`type-guards.ts`) - Runtime type checking utilities
2. **Validation Helpers** (`validation-helpers.ts`) - Data validation and transformation
3. **Error Prevention Patterns** - Coding patterns to prevent type errors

## Type Guards

### Basic Type Checking

```typescript
import { isDefined, isNotNull, isNotUndefined } from '@/lib';

// Check if value is defined (not null or undefined)
if (isDefined(user)) {
  console.log(user.name); // Safe to access properties
}

// Check if value is not null
if (isNotNull(value)) {
  // value is guaranteed to not be null
}

// Check if value is not undefined
if (isNotUndefined(value)) {
  // value is guaranteed to not be undefined
}
```

### Specialized Type Guards

```typescript
import { isNonEmptyString, isValidNumber, hasElements } from '@/lib';

// String validation
if (isNonEmptyString(input)) {
  // input is a non-empty string
}

// Number validation
if (isValidNumber(amount)) {
  // amount is a valid number (not NaN, null, or undefined)
}

// Array validation
if (hasElements(items)) {
  // items is an array with at least one element
}
```

### Object Property Checking

```typescript
import { hasProperty, safeObjectAccess } from '@/lib';

// Check if object has property
if (hasProperty(obj, 'name')) {
  console.log(obj.name); // TypeScript knows obj has 'name' property
}

// Safe property access
const name = safeObjectAccess(user, 'name'); // string | undefined
```

## Validation Helpers

### Financial Data Validation

```typescript
import {
  ensureFinancialNumber,
  ensurePercentage,
  ensureRatio,
  formatCurrencySafe,
  formatPercentageSafe
} from '@/lib';

// Safe number conversion for financial calculations
const amount = ensureFinancialNumber(userInput, 0); // Always returns valid number

// Percentage validation (0-100)
const percentage = ensurePercentage(value, 50); // Clamped to 0-100 range

// Ratio validation (0-1)
const ratio = ensureRatio(value, 0.5); // Clamped to 0-1 range

// Safe formatting
const formatted = formatCurrencySafe(amount); // Always returns valid string
const percent = formatPercentageSafe(ratio); // Always returns valid percentage
```

### Array and Object Validation

```typescript
import { ensureValidArray, ensureValidObject, safeArrayAccess } from '@/lib';

// Array validation with type checking
const validItems = ensureValidArray(data, (item): item is Item => {
  return typeof item === 'object' && 'id' in item;
});

// Object validation with required properties
const validUser = ensureValidObject(data, ['id', 'name', 'email']);

// Safe array access
const firstItem = safeArrayAccess(items, 0, defaultItem);
```

### Input Sanitization

```typescript
import { sanitizeUserInput, ensureDisplayString, ensureDateString } from '@/lib';

// Sanitize user input
const clean = sanitizeUserInput(userInput, 500); // Max 500 chars, no dangerous content

// Safe string conversion
const display = ensureDisplayString(value, 'N/A');

// Date validation
const date = ensureDateString(userDate, '2023-01-01');
```

## Error Prevention Patterns

### Array Access

```typescript
// ❌ Unsafe - can throw if array is empty
const first = items[0].name;

// ✅ Safe - with optional chaining
const first = items[0]?.name;

// ✅ Safe - with type guard
if (hasElements(items)) {
  const first = items[0].name; // Safe because array has elements
}

// ✅ Safe - with safe access helper
const first = safeArrayAccess(items, 0, defaultItem).name;
```

### Object Property Access

```typescript
// ❌ Unsafe - can throw if user is undefined
const name = user.name;

// ✅ Safe - with optional chaining
const name = user?.name;

// ✅ Safe - with type guard
if (isDefined(user)) {
  const name = user.name; // Safe because user is defined
}

// ✅ Safe - with safe access helper
const name = safeObjectAccess(user, 'name');
```

### Numerical Operations

```typescript
// ❌ Unsafe - can result in NaN
const result = value1 + value2;

// ✅ Safe - with validation
const result = ensureFinancialNumber(value1) + ensureFinancialNumber(value2);

// ✅ Safe - with range validation
const percentage = ensureRange(userInput, 0, 100, 0.1);
```

### Component Props Handling

```typescript
interface ComponentProps {
  data?: DataType;
  amount?: number;
  title?: string;
}

function Component({ data, amount, title }: ComponentProps) {
  // ❌ Unsafe
  return <div>{data.value}</div>;

  // ✅ Safe - with optional chaining
  return <div>{data?.value}</div>;

  // ✅ Safe - with default values
  return <div>{safeGet(data?.value, 'No data')}</div>;

  // ✅ Safe - with validation helpers
  return (
    <div>
      <h1>{ensureDisplayString(title, 'Untitled')}</h1>
      <p>Amount: {formatCurrencySafe(amount)}</p>
    </div>
  );
}
```

### Event Handler Safety

```typescript
// ❌ Unsafe - value could be undefined
const handleSliderChange = ([value]) => {
  updateState(value);
};

// ✅ Safe - with null coalescing
const handleSliderChange = ([value]) => {
  updateState(value ?? 0);
};

// ✅ Safe - with validation
const handleSliderChange = ([value]) => {
  updateState(ensureFinancialNumber(value, 0));
};
```

## Testing Patterns

### Type Guard Testing

```typescript
import { isDefined, isValidNumber } from '@/lib';

describe('Type Guards', () => {
  test('isDefined correctly identifies defined values', () => {
    expect(isDefined(0)).toBe(true);
    expect(isDefined('')).toBe(true);
    expect(isDefined(null)).toBe(false);
    expect(isDefined(undefined)).toBe(false);
  });

  test('isValidNumber correctly identifies valid numbers', () => {
    expect(isValidNumber(42)).toBe(true);
    expect(isValidNumber(0)).toBe(true);
    expect(isValidNumber(NaN)).toBe(false);
    expect(isValidNumber(Infinity)).toBe(false);
  });
});
```

### Validation Helper Testing

```typescript
import { ensureFinancialNumber, formatCurrencySafe } from '@/lib';

describe('Validation Helpers', () => {
  test('ensureFinancialNumber handles various inputs', () => {
    expect(ensureFinancialNumber(42)).toBe(42);
    expect(ensureFinancialNumber('42')).toBe(42);
    expect(ensureFinancialNumber('$42')).toBe(42);
    expect(ensureFinancialNumber(null, 100)).toBe(100);
    expect(ensureFinancialNumber(NaN, 50)).toBe(50);
  });

  test('formatCurrencySafe never throws', () => {
    expect(() => formatCurrencySafe(null)).not.toThrow();
    expect(() => formatCurrencySafe(undefined)).not.toThrow();
    expect(() => formatCurrencySafe('invalid')).not.toThrow();
  });
});
```

## Migration Guidelines

### Existing Code Migration

1. **Identify Problem Areas**: Look for TypeScript errors related to:
   - `Object is possibly 'undefined'`
   - `Object is possibly 'null'`
   - `Type 'undefined' is not assignable to type 'T'`

2. **Apply Appropriate Fixes**:
   - Use optional chaining (`?.`) for simple cases
   - Use type guards for complex validation
   - Use validation helpers for data processing

3. **Test Thoroughly**: Ensure fixes don't break existing functionality

### New Code Standards

1. **Always use type guards** when dealing with potentially undefined data
2. **Use validation helpers** for user input and external data
3. **Provide fallback values** using the safe access helpers
4. **Test edge cases** including null, undefined, and invalid inputs

## Best Practices

1. **Prefer explicit over implicit**: Be explicit about handling undefined values
2. **Use semantic helpers**: Choose helpers that clearly express intent
3. **Provide meaningful fallbacks**: Don't just default to empty strings or zeros
4. **Document assumptions**: Use JSDoc to document expected data shapes
5. **Fail fast**: Use assertions for conditions that should never be false

## Common Pitfalls

1. **Overusing non-null assertion (`!`)**: Only use when you're absolutely certain
2. **Not handling edge cases**: Always consider what happens with empty/invalid data
3. **Inconsistent error handling**: Use consistent patterns across the codebase
4. **Performance concerns**: Type guards have runtime cost; use judiciously in hot paths

## Performance Considerations

- Type guards and validation helpers have runtime overhead
- Use them judiciously in performance-critical code paths
- Consider caching validation results for frequently accessed data
- Profile code to identify bottlenecks if performance becomes an issue