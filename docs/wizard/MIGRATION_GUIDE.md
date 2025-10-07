# Wizard Cards Migration Guide

Guide for migrating from legacy wizard cards to the new enhanced versions with inline validation.

## Overview

The new wizard card system provides:
- ✅ **Inline error display** - Validation errors show directly on fields
- ✅ **Scoped error handling** - Automatic error mapping by section
- ✅ **Enhanced accessibility** - Full ARIA support
- ✅ **Format-specific inputs** - USD, percent, number with built-in validation
- ✅ **Collapsible UI** - Better mobile experience

## What Changed

### File Structure

**Old Structure:**
```
client/src/components/wizard/
├── StageAllocationCard.tsx      # Used Card + Slider
├── ReservesCard.tsx              # Used Card + Slider
├── ExitTimingCard.tsx            # Used Card + Slider
└── ExitValuesCard.tsx            # Used Card + Input
```

**New Structure:**
```
client/src/components/wizard/
├── EnhancedField.tsx             # NEW: Format-specific input
├── CollapsibleCard.tsx           # NEW: Collapsible container
├── LiveTotalsAside.tsx           # NEW: Sticky summary rail
├── legacy/                       # OLD: Moved here for reference
│   ├── StageAllocationCard.tsx
│   ├── ReservesCard.tsx
│   ├── ExitTimingCard.tsx
│   └── ExitValuesCard.tsx
└── cards/                        # NEW: Enhanced versions
    ├── _types.ts                 # Shared types
    ├── StageAllocationCard.tsx   # Enhanced with errors
    ├── ReservesCard.tsx          # Enhanced with errors
    ├── GraduationMatrixCard.tsx  # Enhanced with errors
    ├── ExitTimingCard.tsx        # Enhanced with errors
    └── ExitValuesCard.tsx        # Enhanced with errors
```

### Component API Changes

#### StageAllocationCard

**Old API:**
```tsx
<StageAllocationCard
  allocation={allocation}          // Old prop name
  onChange={onChange}
  committedCapital={20_000_000}    // Old prop name
  disabled={false}
/>
```

**New API:**
```tsx
<StageAllocationCard
  value={allocation}               // ✅ Renamed to 'value'
  onChange={onChange}
  committedCapitalUSD={20_000_000} // ✅ Renamed for clarity
  errors={scopedErrors}            // ✅ NEW: Inline error display
  disabled={false}
/>
```

#### ReservesCard

**Old API:**
```tsx
<ReservesCard
  config={reserveSettings}         // Old prop name
  onChange={onChange}
  committedCapital={20_000_000}
/>
```

**New API:**
```tsx
<ReservesCard
  value={reserveSettings}          // ✅ Renamed to 'value'
  onChange={onChange}
  committedCapitalUSD={20_000_000} // ✅ Renamed for clarity
  errors={scopedErrors}            // ✅ NEW: Inline error display
/>
```

#### ExitTimingCard

**Old API:**
```tsx
<ExitTimingCard
  timing={exitTiming}              // Old prop name
  onChange={onChange}
/>
```

**New API:**
```tsx
<ExitTimingCard
  value={exitTiming}               // ✅ Renamed to 'value'
  onChange={onChange}
  errors={scopedErrors}            // ✅ NEW: Inline error display
/>
```

#### ExitValuesCard

**Old API:**
```tsx
<ExitValuesCard
  exitValues={values}              // Old prop name
  onChange={onChange}
  checkSizes={checkSizes}          // Old prop name
/>
```

**New API:**
```tsx
<ExitValuesCard
  value={values}                   // ✅ Renamed to 'value'
  onChange={onChange}
  costBasisAtStageUSD={costBasis}  // ✅ Renamed for clarity
  errors={scopedErrors}            // ✅ NEW: Inline error display
  showWeights={false}              // ✅ NEW: Optional weight inputs
/>
```

## Migration Steps

### Step 1: Update Imports

**Before:**
```tsx
import { StageAllocationCard } from '@/components/wizard/StageAllocationCard';
import { ReservesCard } from '@/components/wizard/ReservesCard';
import { ExitTimingCard } from '@/components/wizard/ExitTimingCard';
import { ExitValuesCard } from '@/components/wizard/ExitValuesCard';
```

**After:**
```tsx
import { StageAllocationCard } from '@/components/wizard/cards/StageAllocationCard';
import { ReservesCard } from '@/components/wizard/cards/ReservesCard';
import { GraduationMatrixCard } from '@/components/wizard/cards/GraduationMatrixCard';
import { ExitTimingCard } from '@/components/wizard/cards/ExitTimingCard';
import { ExitValuesCard } from '@/components/wizard/cards/ExitValuesCard';
```

### Step 2: Add Validation Infrastructure

```tsx
// 1. Import validation utilities
import { zodErrorsToMap, pickErrors, getFirstError } from '@/lib/validation';
import { stageAllocationSchema } from '@/lib/wizard-schemas';

// 2. Add error state
const [errors, setErrors] = useState<FieldErrors>({});

// 3. Add validation function
const validate = () => {
  const validationErrors: FieldErrors = {};

  const result = stageAllocationSchema.safeParse(state.stageAllocation);
  if (!result.success) {
    const allocErrors = zodErrorsToMap(result.error);
    Object.entries(allocErrors).forEach(([k, v]) => {
      validationErrors[`stageAllocation.${k}`] = v;
    });
  }

  setErrors(validationErrors);
  return Object.keys(validationErrors).length === 0;
};

// 4. Scope errors for cards
const allocErrors = pickErrors(errors, 'stageAllocation');
```

### Step 3: Update Component Props

**Before:**
```tsx
<StageAllocationCard
  allocation={state.stageAllocation}
  onChange={(next) => setState({ ...state, stageAllocation: next })}
  committedCapital={committedCapitalUSD}
/>
```

**After:**
```tsx
<StageAllocationCard
  value={state.stageAllocation}                           // ✅ Renamed prop
  onChange={(next) => setState({ ...state, stageAllocation: next })}
  committedCapitalUSD={committedCapitalUSD}               // ✅ Renamed prop
  errors={allocErrors}                                     // ✅ Added errors
/>
```

### Step 4: Add LiveTotalsAside (Optional)

```tsx
import { LiveTotalsAside } from '@/components/wizard/LiveTotalsAside';
import { focusFirstError } from '@/lib/validation';

// Get first error
const firstError = getFirstError(errors);

// Render aside
<LiveTotalsAside
  committedCapitalUSD={committedCapitalUSD}
  allocationTotalPct={allocationTotalPct}
  reservesPct={state.stageAllocation.reserves}
  estimatedAnnualFeesUSD={estimatedAnnualFeesUSD}
  firstErrorLabel={firstError?.message}
  onFixFirstError={() => firstError && focusFirstError(firstError.field)}
/>
```

## Complete Example

### Before (Legacy)

```tsx
import { StageAllocationCard } from '@/components/wizard/StageAllocationCard';

export function WizardStep() {
  const [state, setState] = useState({
    stageAllocation: DEFAULT_STAGE_ALLOCATION,
  });

  return (
    <div>
      <StageAllocationCard
        allocation={state.stageAllocation}
        onChange={(next) => setState({ ...state, stageAllocation: next })}
        committedCapital={20_000_000}
      />
    </div>
  );
}
```

### After (Enhanced)

```tsx
import { StageAllocationCard } from '@/components/wizard/cards/StageAllocationCard';
import { LiveTotalsAside } from '@/components/wizard/LiveTotalsAside';
import { zodErrorsToMap, pickErrors, getFirstError, focusFirstError } from '@/lib/validation';
import { stageAllocationSchema } from '@/lib/wizard-schemas';
import type { FieldErrors } from '@/lib/validation';

export function WizardStep() {
  const [state, setState] = useState({
    stageAllocation: DEFAULT_STAGE_ALLOCATION,
  });
  const [errors, setErrors] = useState<FieldErrors>({});

  const validate = () => {
    const validationErrors: FieldErrors = {};
    const result = stageAllocationSchema.safeParse(state.stageAllocation);

    if (!result.success) {
      const allocErrors = zodErrorsToMap(result.error);
      Object.entries(allocErrors).forEach(([k, v]) => {
        validationErrors[`stageAllocation.${k}`] = v;
      });
    }

    setErrors(validationErrors);
    return Object.keys(validationErrors).length === 0;
  };

  const allocErrors = pickErrors(errors, 'stageAllocation');
  const firstError = getFirstError(errors);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr,320px]">
      <div>
        <StageAllocationCard
          value={state.stageAllocation}
          onChange={(next) => setState({ ...state, stageAllocation: next })}
          committedCapitalUSD={20_000_000}
          errors={allocErrors}
        />
      </div>

      <LiveTotalsAside
        committedCapitalUSD={20_000_000}
        allocationTotalPct={100}
        reservesPct={state.stageAllocation.reserves}
        estimatedAnnualFeesUSD={400_000}
        firstErrorLabel={firstError?.message}
        onFixFirstError={() => firstError && focusFirstError(firstError.field)}
      />
    </div>
  );
}
```

## Breaking Changes Checklist

- [ ] Update import paths from `/wizard/` to `/wizard/cards/`
- [ ] Rename `allocation` prop to `value`
- [ ] Rename `config` prop to `value`
- [ ] Rename `timing` prop to `value`
- [ ] Rename `exitValues` prop to `value`
- [ ] Rename `committedCapital` to `committedCapitalUSD`
- [ ] Rename `checkSizes` to `costBasisAtStageUSD`
- [ ] Add validation infrastructure (schemas, error state)
- [ ] Add `errors` prop to all cards
- [ ] Scope errors using `pickErrors()`
- [ ] Update validation to use Zod schemas
- [ ] Add LiveTotalsAside (optional but recommended)

## Validation Schema Reference

All cards now work with Zod schemas:

```tsx
// Available schemas
import {
  stageAllocationSchema,      // For StageAllocationCard
  graduationRatesSchema,       // For GraduationMatrixCard
  exitTimingSchema,            // For ExitTimingCard
  exitValuesByStageSchema,     // For ExitValuesCard
} from '@/lib/wizard-schemas';
```

## Error Handling Patterns

### Basic Pattern
```tsx
// 1. Validate
const result = schema.safeParse(data);

// 2. Convert to map
const errors = result.success ? {} : zodErrorsToMap(result.error);

// 3. Scope to section
const scopedErrors = pickErrors(errors, 'sectionName');

// 4. Pass to card
<Card errors={scopedErrors} />
```

### Auto-Clear on Edit
```tsx
const setField = (key: string, value: any) => {
  setState({ ...state, [key]: value });

  // Clear errors for this section
  setErrors((prev) => {
    const next = { ...prev };
    Object.keys(next)
      .filter(k => k.startsWith(`${key}.`))
      .forEach(k => delete next[k]);
    return next;
  });
};
```

## Rollback Plan

If issues arise, you can rollback to legacy components:

```tsx
// Import from legacy folder
import { StageAllocationCard } from '@/components/wizard/legacy/StageAllocationCard';

// Use with old API
<StageAllocationCard
  allocation={state.stageAllocation}
  onChange={onChange}
  committedCapital={20_000_000}
/>
```

Legacy components remain fully functional and unchanged.

## Testing Migration

1. **Visual regression**: Compare old vs new rendering
2. **Functional testing**: Verify all user interactions work
3. **Validation testing**: Ensure error messages display correctly
4. **Accessibility**: Run axe or similar a11y testing
5. **Performance**: Check for any rendering slowdowns

## Support

- **Full Example**: See [PortfolioDynamicsStep.tsx](../../client/src/pages/wizard/PortfolioDynamicsStep.tsx)
- **Integration Guide**: See [WIZARD_INTEGRATION.md](./WIZARD_INTEGRATION.md)
- **Legacy Code**: Reference implementations in `client/src/components/wizard/legacy/`

---

**Migration Status:** In Progress
**Target Completion:** Current Sprint
**Breaking Changes:** Yes (prop renames, error handling required)
**Backward Compatibility:** Legacy components available in `/legacy/` folder
