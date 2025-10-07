# Waterfall Step Implementation

This directory contains the Waterfall wizard step (Step 6/7) implementation
using **existing waterfall helpers** from `client/src/lib/waterfall.ts`.

## Architecture

### Component Hierarchy

```
WaterfallStep (main component)
├── WaterfallConfig (configuration form)
└── WaterfallSummaryCard (distribution preview)
    └── useWaterfallCalculations (hook)
```

### Key Features

1. **Type-Safe Updates**: Uses `applyWaterfallChange()` and
   `changeWaterfallType()` helpers
2. **Schema Validation**: Leverages `WaterfallSchema` from `@shared/types`
3. **Auto-Clamping**: Field values automatically clamped to valid ranges
4. **Auto-Save**: Valid changes trigger `onSave` callback immediately
5. **Type Switching**: Seamless American ↔ European conversion with schema
   defaults

## File Structure

### WaterfallStep.tsx (Main Component)

**Responsibilities:**

- Form state management with React Hook Form
- Type switching orchestration
- Field update delegation
- Auto-save coordination

**Key Patterns:**

```typescript
// Type switching (uses schema-backed helper)
const handleTypeChange = (newType: Waterfall['type']) => {
  const updated = changeWaterfallType(waterfall, newType);
  // Apply all fields from updated schema
};

// Field updates (uses validation helper)
const handleFieldChange = (field, value) => {
  const updated = applyWaterfallChange(waterfall, field, value);
  // Automatically clamped and validated
};
```

### WaterfallConfig.tsx (Configuration Form)

**Responsibilities:**

- Waterfall type selection (American/European radio)
- European-specific fields (hurdle, catch-up)
- Carry vesting inputs (cliff, vesting years)
- Error display and validation feedback

**Key Features:**

- Conditional rendering: European fields only shown for European type
- Percentage conversion: UI shows percentages (0-100), stores decimals (0-1)
- Input bounds: HTML min/max attributes prevent invalid entry

### WaterfallSummaryCard.tsx (Distribution Preview)

**Responsibilities:**

- Display current waterfall configuration
- Show example distribution (2.5x MOIC)
- Visualize LP vs GP allocation

**Example Calculation:**

- $100M fund → $250M exit (2.5x MOIC)
- European: Applies hurdle + catch-up logic
- American: Simple 20% carry split

### useWaterfallCalculations.ts (Hook)

**Responsibilities:**

- Calculate example distributions
- Support both American and European models
- Memoize calculations for performance

**Calculation Logic:**

**European Waterfall:**

1. Return of capital to LPs
2. Preferred return (hurdle) to LPs
3. Catch-up to GP
4. Split remaining profits (20/80)

**American Waterfall:**

1. Return of capital to LPs
2. Split profits (20% GP, 80% LP)

## Integration with Existing Helpers

### From `client/src/lib/waterfall.ts`

```typescript
import {
  changeWaterfallType, // Type switching with schema defaults
  applyWaterfallChange, // Field updates with validation
  isEuropean, // Type guard for European waterfall
  isAmerican, // Type guard for American waterfall
} from '@/lib/waterfall';
```

### Helper Features Used

1. **Discriminated Union Handling**: Type guards ensure type safety
2. **Schema-Validated Defaults**: Type switching adds correct default values
3. **Value Clamping**: Hurdle/catch-up → [0,1], vesting years → [1,10]
4. **Immutable Updates**: Returns new object, preserves referential equality
   when no-op
5. **Field Validation**: Prevents setting European fields on American waterfall

## Testing

### Test Coverage (tests/unit/waterfall-step.test.tsx)

- **Rendering**: Default states, initial data, conditional fields
- **Type Switching**: American ↔ European with defaults, field preservation
- **Field Updates**: Hurdle, catch-up, vesting with clamping validation
- **Auto-Save**: Valid changes trigger save, invalid blocked
- **Summary Display**: Badge, metrics, distribution preview

### Test Patterns

```typescript
// Test type switching
fireEvent.click(screen.getByLabelText(/European/i));
await waitFor(() => {
  expect(mockOnSave).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'EUROPEAN',
      hurdle: 0.08, // Schema default
      catchUp: 0.08, // Schema default
    })
  );
});

// Test field clamping
fireEvent.change(hurdleInput, { target: { value: '150' } });
await waitFor(() => {
  expect(mockOnSave).toHaveBeenCalledWith(
    expect.objectContaining({ hurdle: 1.0 }) // Clamped to max
  );
});
```

## Usage Example

```typescript
import { WaterfallStep } from '@/components/modeling-wizard/steps';

function WizardPage() {
  const [waterfall, setWaterfall] = useState<Waterfall>({
    type: 'AMERICAN',
    carryVesting: { cliffYears: 0, vestingYears: 4 }
  });

  return (
    <WaterfallStep
      initialData={waterfall}
      onSave={(data) => {
        setWaterfall(data);
        // Save to backend/localStorage
      }}
    />
  );
}
```

## Dependencies

### UI Components (shadcn/ui)

- `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`
- `Input`, `Label`
- `RadioGroup`, `RadioGroupItem`
- `Badge`

### External Libraries

- `react-hook-form` - Form state management
- `@hookform/resolvers/zod` - Zod schema validation
- `lucide-react` - Icons

### Internal Dependencies

- `@shared/types` - Waterfall type and schema
- `@/lib/waterfall` - Helper functions (REUSED, not reimplemented)
- `@/hooks/useWaterfallCalculations` - Distribution calculations

## Performance Optimizations

1. **Memoized Calculations**: `useWaterfallCalculations` uses `useMemo`
2. **Referential Equality**: Helpers return same reference for no-ops
3. **Controlled Re-renders**: Form state isolated to minimize cascading updates
4. **Auto-save Debouncing**: React Hook Form handles validation debouncing

## Schema Alignment

**Note:** This implementation uses `Waterfall` from `@shared/types`, NOT
`WaterfallInput` from `modeling-wizard.schemas.ts`.

### Type Differences

**shared/types.ts (USED):**

```typescript
type Waterfall =
  | { type: 'AMERICAN'; carryVesting: CarryVesting }
  | {
      type: 'EUROPEAN';
      carryVesting: CarryVesting;
      hurdle: number;
      catchUp: number;
    };
```

**modeling-wizard.schemas.ts (NOT USED):**

```typescript
type WaterfallInput = {
  type: 'american' | 'european' | 'hybrid';
  preferredReturn: number;
  catchUp: number;
  carriedInterest: number;
  tiers?: Array<...>;
};
```

The shared type is the **production schema** used by fund calculations. The
wizard schema was legacy and has been replaced.

## Future Enhancements

1. **Tiered Waterfall Support**: Add multi-tier waterfall configuration
2. **Carry Rate Customization**: Allow non-standard carry percentages (current:
   20%)
3. **Interactive Visualization**: Chart showing distribution across MOIC ranges
4. **Scenario Comparison**: Compare American vs European side-by-side
5. **GP Commitment Integration**: Factor GP commitment into carry calculations

## References

- **Helper Tests**: `client/src/lib/__tests__/waterfall.test.ts` (19 test cases)
- **Schema Definition**: `shared/types.ts` lines 319-333
- **Business Logic**: `WINNING_PLAN.md` waterfall section
- **Handoff Doc**: `HANDOFF_WIZARD_IMPLEMENTATION.md` Step 6 requirements
