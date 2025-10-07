# Wizard Component Integration Guide

Complete guide for integrating the wizard component system with Zod validation, inline errors, and live totals.

## Overview

The wizard system provides a complete form infrastructure with:
- **Type-safe validation** using Zod schemas
- **Inline error display** with scoped error messages
- **Live validation** with real-time feedback
- **Accessibility** with ARIA attributes
- **Format-specific inputs** (USD, percent, number, date, select)

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Wizard Step Page (PortfolioDynamicsStep.tsx)            │
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ State        │  │ Validation   │  │ Error Scoping│  │
│  │ Management   │→ │ (Zod)        │→ │ (pickErrors) │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│         │                                      │         │
│         ▼                                      ▼         │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Card Components (with scoped errors)              │  │
│  │  • StageAllocationCard                            │  │
│  │  • GraduationMatrixCard                          │  │
│  │  • ExitTimingCard                                │  │
│  │  • ExitValuesCard                                │  │
│  └──────────────────────────────────────────────────┘  │
│         │                                               │
│         ▼                                               │
│  ┌──────────────────────────────────────────────────┐  │
│  │ LiveTotalsAside (sticky summary + error nav)      │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Validation Layer

**Files:**
- `client/src/lib/wizard-schemas.ts` - Zod validation schemas
- `client/src/lib/wizard-types.ts` - TypeScript types + defaults
- `client/src/lib/validation.ts` - Error mapping utilities

**Key Schemas:**
```typescript
import { stageAllocationSchema, graduationRatesSchema } from '@/lib/wizard-schemas';

// Validate data
const result = stageAllocationSchema.safeParse(data);
if (!result.success) {
  const errors = zodErrorsToMap(result.error);
  // errors = { 'reserves': ['Allocations must sum to 100%'] }
}
```

### 2. Card Components

**Location:** `client/src/components/wizard/cards/`

All cards accept:
- `value` - Current data
- `onChange` - Update callback
- `errors` - Scoped FieldErrors (keys without prefix)
- `disabled` - Disabled state
- `className` - Additional classes

**Example:**
```tsx
<StageAllocationCard
  value={state.stageAllocation}
  onChange={(next) => setState({ ...state, stageAllocation: next })}
  errors={allocErrors} // Scoped: { 'reserves': ['Must sum to 100%'] }
  committedCapitalUSD={20_000_000}
/>
```

### 3. Base Components

**EnhancedField** - Format-specific input with inline errors
```tsx
<EnhancedField
  id="field-id"
  label="Field Label"
  format="usd" | "percent" | "number" | "date" | "select"
  value={value}
  onChange={onChange}
  error={errorMessage} // Single error string
  contextChip="Helpful hint"
  helpText="Longer explanation"
/>
```

**CollapsibleCard** - Expandable card container
```tsx
<CollapsibleCard
  title="Card Title"
  summary={<div>Summary when collapsed</div>}
  defaultExpanded={true}
>
  {/* Card content */}
</CollapsibleCard>
```

**LiveTotalsAside** - Sticky right rail with live validation
```tsx
<LiveTotalsAside
  committedCapitalUSD={20_000_000}
  allocationTotalPct={totalPct}
  reservesPct={reservesPct}
  estimatedAnnualFeesUSD={feeAmount}
  firstErrorLabel={firstError?.message}
  onFixFirstError={() => focusFirstError(firstError.field)}
/>
```

## Step-by-Step Integration

### Step 1: Define State and Schemas

```typescript
// 1. Import schemas and types
import {
  stageAllocationSchema,
  graduationRatesSchema,
} from '@/lib/wizard-schemas';

import {
  DEFAULT_STAGE_ALLOCATION,
  DEFAULT_GRADUATION_RATES,
  type StageAllocation,
  type GraduationRates,
} from '@/lib/wizard-types';

// 2. Define state interface
interface WizardState {
  stageAllocation: StageAllocation;
  graduationRates: GraduationRates;
}

// 3. Initialize state
const [state, setState] = useState<WizardState>({
  stageAllocation: DEFAULT_STAGE_ALLOCATION,
  graduationRates: DEFAULT_GRADUATION_RATES,
});

const [errors, setErrors] = useState<FieldErrors>({});
```

### Step 2: Implement Validation

```typescript
import { zodErrorsToMap, type FieldErrors } from '@/lib/validation';

const validate = (): boolean => {
  const validationErrors: FieldErrors = {};

  // Validate stage allocation
  const allocResult = stageAllocationSchema.safeParse(state.stageAllocation);
  if (!allocResult.success) {
    const allocErrors = zodErrorsToMap(allocResult.error);
    Object.entries(allocErrors).forEach(([k, v]) => {
      validationErrors[`stageAllocation.${k}`] = v;
    });
  }

  // Validate graduation rates
  const gradResult = graduationRatesSchema.safeParse(state.graduationRates);
  if (!gradResult.success) {
    const gradErrors = zodErrorsToMap(gradResult.error);
    Object.entries(gradErrors).forEach(([k, v]) => {
      validationErrors[`graduationRates.${k}`] = v;
    });
  }

  setErrors(validationErrors);
  return Object.keys(validationErrors).length === 0;
};
```

### Step 3: Scope Errors to Cards

```typescript
import { pickErrors } from '@/lib/validation';

// Extract scoped errors for each card
const allocErrors = pickErrors(errors, 'stageAllocation');
const gradErrors = pickErrors(errors, 'graduationRates');

// allocErrors = { 'reserves': ['Must sum to 100%'] }
// (prefix 'stageAllocation.' is stripped)
```

### Step 4: Render Cards with Errors

```tsx
<div className="space-y-6">
  <StageAllocationCard
    value={state.stageAllocation}
    onChange={(next) => setState({ ...state, stageAllocation: next })}
    errors={allocErrors}
    committedCapitalUSD={20_000_000}
  />

  <GraduationMatrixCard
    value={state.graduationRates}
    onChange={(next) => setState({ ...state, graduationRates: next })}
    errors={gradErrors}
  />
</div>
```

### Step 5: Add LiveTotalsAside

```tsx
import { getFirstError, focusFirstError } from '@/lib/validation';

// Get first error for navigation
const firstError = getFirstError(errors);

<LiveTotalsAside
  committedCapitalUSD={20_000_000}
  allocationTotalPct={totalPct}
  reservesPct={state.stageAllocation.reserves}
  estimatedAnnualFeesUSD={estimatedFees}
  firstErrorLabel={firstError?.message}
  onFixFirstError={() => firstError && focusFirstError(firstError.field)}
/>
```

## Validation Patterns

### Cross-Field Validation

Zod schemas automatically handle cross-field rules:

```typescript
// Sum must equal 100%
stageAllocationSchema.superRefine((s, ctx) => {
  const sum = s.preSeed + s.seed + ... + s.reserves;
  if (Math.abs(sum - 100) > 0.1) {
    ctx.addIssue({
      code: 'custom',
      message: 'Allocations must sum to 100%',
      path: ['reserves'], // Error shown on reserves field
    });
  }
});
```

### Ordering Validation

```typescript
// Low ≤ Median ≤ High
stageExitValueSchema.superRefine((v, ctx) => {
  if (v.low && v.low > v.median) {
    ctx.addIssue({
      code: 'custom',
      message: `Low (${v.low}) must be ≤ Median (${v.median})`,
      path: ['low'],
    });
  }
});
```

### Nested Errors

For nested objects like `exitValues.preSeed.median`:

```typescript
// Errors are automatically nested
const exitValErrors = pickErrors(errors, 'exitValues');
// exitValErrors = {
//   'preSeed.median': ['Must be ≥ 0'],
//   'seed.low': ['Low must be ≤ Median']
// }

// Card extracts with helper
const err = firstError(exitValErrors, 'preSeed.median');
```

## Error Display Patterns

### Inline Field Errors

```tsx
<EnhancedField
  id="field-id"
  value={value}
  onChange={onChange}
  error={firstError(scopedErrors, 'fieldName')} // Single string
  aria-invalid={!!firstError(scopedErrors, 'fieldName')}
/>
```

### Card-Level Errors

```tsx
const rootError = firstError(scopedErrors, '_root');

{rootError && (
  <div className="rounded-lg bg-red-50 border border-red-200 p-3">
    <p className="text-sm text-red-700">{rootError}</p>
  </div>
)}
```

### Global Error Navigation

```tsx
<LiveTotalsAside
  firstErrorLabel="Allocations must sum to 100%"
  onFixFirstError={() => {
    // Scroll and focus first invalid field
    focusFirstError('stageAllocation.reserves');
  }}
/>
```

## Common Patterns

### Auto-Clear Errors on Edit

```typescript
const setField = <K extends keyof State>(key: K, value: State[K]) => {
  setState((prev) => ({ ...prev, [key]: value }));

  // Clear errors for edited section
  setErrors((prev) => {
    const next = { ...prev };
    Object.keys(next)
      .filter(k => k.startsWith(`${key}.`))
      .forEach(k => delete next[k]);
    return next;
  });
};
```

### Debounced Validation

```typescript
import { useDebounce } from '@/hooks/useDebounce';

const debouncedValue = useDebounce(state, 500);

useEffect(() => {
  validate(); // Run validation after user stops typing
}, [debouncedValue]);
```

### Conditional Validation

```typescript
// Only validate if section is complete
if (state.stageAllocation.reserves > 0) {
  const result = stageAllocationSchema.safeParse(state.stageAllocation);
  // ...
}
```

## Testing

### Unit Tests

```typescript
import { stageAllocationSchema } from '@/lib/wizard-schemas';
import { zodErrorsToMap } from '@/lib/validation';

describe('stageAllocationSchema', () => {
  it('validates sum equals 100%', () => {
    const result = stageAllocationSchema.safeParse({
      preSeed: 10,
      seed: 30,
      seriesA: 20,
      seriesB: 0,
      seriesC: 0,
      seriesD: 0,
      reserves: 50, // Total = 110%
    });

    expect(result.success).toBe(false);
    const errors = zodErrorsToMap(result.error!);
    expect(errors['reserves']).toContain('Allocations must sum to 100%');
  });
});
```

### Integration Tests

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { StageAllocationCard } from './StageAllocationCard';

test('displays inline error when sum != 100%', () => {
  const onChange = vi.fn();

  render(
    <StageAllocationCard
      value={{ preSeed: 10, seed: 20, /* ... */, reserves: 50 }} // 80% total
      onChange={onChange}
      committedCapitalUSD={20_000_000}
      errors={{ reserves: ['Allocations must sum to 100%'] }}
    />
  );

  expect(screen.getByText('Allocations must sum to 100%')).toBeInTheDocument();
});
```

## Performance Considerations

### Memoization

```typescript
const allocErrors = useMemo(
  () => pickErrors(errors, 'stageAllocation'),
  [errors]
);

const totalPct = useMemo(
  () => Object.values(allocation).reduce((sum, v) => sum + v, 0),
  [allocation]
);
```

### Lazy Validation

```typescript
// Validate on blur instead of every keystroke
const handleBlur = () => {
  validate();
};

<EnhancedField
  value={value}
  onChange={onChange}
  onBlur={handleBlur}
/>
```

## Accessibility

All components follow ARIA best practices:

- **Labels:** All fields have associated labels
- **Error Messages:** Linked via `aria-describedby`
- **Invalid State:** `aria-invalid` set on errors
- **Keyboard Navigation:** Full keyboard support
- **Focus Management:** Auto-focus on error navigation

```tsx
<EnhancedField
  id="field-id"
  label="Field Label" // Associated <label>
  aria-label="Accessible label"
  aria-invalid={!!error}
  aria-describedby={error ? 'field-id-error' : undefined}
  error={error} // Renders with id="field-id-error"
/>
```

## Troubleshooting

### Errors Not Showing

1. Check error key matches field path
2. Verify `pickErrors()` prefix is correct
3. Ensure `firstError()` key matches field

```typescript
// ✅ Correct
const errors = { 'stageAllocation.reserves': ['Error'] };
const scoped = pickErrors(errors, 'stageAllocation');
const err = firstError(scoped, 'reserves'); // Found!

// ❌ Wrong
const err = firstError(scoped, 'stageAllocation.reserves'); // Not found
```

### Validation Not Triggering

1. Ensure schema is imported
2. Check `safeParse()` is called
3. Verify errors are set in state

```typescript
// Missing validation
const result = schema.safeParse(data);
setErrors({}); // ❌ Errors cleared but not set

// Correct
if (!result.success) {
  setErrors(zodErrorsToMap(result.error)); // ✅
}
```

### Focus Not Working

1. Check field `id` matches focus path
2. Verify element is rendered
3. Ensure focus happens after scroll

```typescript
// Element must exist and be visible
const element = document.getElementById(fieldId);
if (element) {
  element.scrollIntoView({ behavior: 'smooth' });
  setTimeout(() => element.focus(), 300); // ✅ Wait for scroll
}
```

## Complete Example

See [PortfolioDynamicsStep.tsx](../../client/src/pages/wizard/PortfolioDynamicsStep.tsx) for a complete, working example demonstrating all integration patterns.

## Next Steps

1. **Add to existing wizard flow** - Wire cards into multi-step wizard
2. **Extend with new schemas** - Add more validation rules
3. **Customize error display** - Adjust error UI to match design system
4. **Add analytics** - Track validation errors and user corrections

---

**Last Updated:** 2025-10-07
**Maintained By:** Engineering Team
**Related Docs:** [Wizard Types](../../client/src/lib/wizard-types.ts), [Validation Utilities](../../client/src/lib/validation.ts)
