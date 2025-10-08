# NumericInput Component

A unified, accessible, and type-safe numeric input component for financial data entry.

## Location

`client/src/components/ui/NumericInput.tsx`

## Overview

The `NumericInput` component consolidates financial input patterns across the application, providing a consistent experience for currency, percentage, and numeric data entry with automatic formatting, validation, and accessibility features.

## Features

- **Automatic Formatting**: Formats numbers with commas (e.g., 1,000,000) when not focused
- **Clean Editing**: Removes commas during typing for seamless input
- **Multiple Modes**: Currency ($), percentage (%), and generic number inputs
- **Min/Max Clamping**: Automatically enforces value bounds on blur
- **Keyboard Navigation**: Arrow up/down with configurable step increments
- **Press On Branding**: Beige focus states with proper transition animations
- **Accessibility**: Auto-generated IDs, ARIA attributes, proper label associations
- **Mobile Optimized**: Uses `inputMode="decimal"` for optimal mobile keyboards
- **Financial Accuracy**: Tabular nums and monospace font for precise alignment
- **Type Safe**: Full TypeScript support with discriminated union props

## Props

```typescript
interface NumericInputProps {
  label: string;                          // Label text above input (required)
  value: number | undefined;              // Current numeric value
  onChange: (value: number | undefined) => void; // Value change callback

  // Display options
  mode?: 'currency' | 'percentage' | 'number'; // Display mode (default: 'number')
  prefix?: string;                        // Custom prefix (mode overrides)
  suffix?: string;                        // Custom suffix (mode overrides)
  placeholder?: string;                   // Placeholder text

  // Validation
  min?: number;                           // Minimum value (clamped on blur)
  max?: number;                           // Maximum value (clamped on blur)
  step?: number;                          // Arrow key increment (default: 1)
  required?: boolean;                     // Show asterisk, set aria-required

  // Help and errors
  help?: string;                          // Help text below input
  error?: string;                         // Error message (replaces help)

  // State
  disabled?: boolean;                     // Disable the input

  // Styling
  className?: string;                     // Additional container classes
}
```

## Usage Examples

### Currency Input

```tsx
import { NumericInput } from '@/components/ui/NumericInput';

function FundSetup() {
  const [fundSize, setFundSize] = useState<number | undefined>(50000000);

  return (
    <NumericInput
      label="Fund Size"
      value={fundSize}
      onChange={setFundSize}
      mode="currency"
      min={0}
      help="Total committed capital"
      required
    />
  );
}
```

**Display**: Shows `$50,000,000` when blurred, `50000000` when focused

### Percentage Input

```tsx
function FeeConfiguration() {
  const [mgmtFee, setMgmtFee] = useState<number | undefined>(2.0);

  return (
    <NumericInput
      label="Management Fee"
      value={mgmtFee}
      onChange={setMgmtFee}
      mode="percentage"
      min={0}
      max={5}
      step={0.1}
      help="Typically 1.5% - 2.5%"
    />
  );
}
```

**Display**: Shows `2%` with percentage suffix

### Number Input with Custom Suffix

```tsx
function TermSetup() {
  const [fundTerm, setFundTerm] = useState<number | undefined>(10);

  return (
    <NumericInput
      label="Fund Term"
      value={fundTerm}
      onChange={setFundTerm}
      mode="number"
      suffix="years"
      min={1}
      max={15}
      step={1}
    />
  );
}
```

### Custom Prefix (International Currency)

```tsx
function InternationalFund() {
  const [euroAmount, setEuroAmount] = useState<number | undefined>(1000000);

  return (
    <NumericInput
      label="Fund Size (EUR)"
      value={euroAmount}
      onChange={setEuroAmount}
      prefix="€"
      min={0}
    />
  );
}
```

### Error State

```tsx
function ValidatedInput() {
  const [value, setValue] = useState<number | undefined>(undefined);
  const error = value === undefined ? 'This field is required' : undefined;

  return (
    <NumericInput
      label="Required Amount"
      value={value}
      onChange={setValue}
      mode="currency"
      error={error}
      required
    />
  );
}
```

### Decimal Precision

```tsx
function PreciseRate() {
  const [discountRate, setDiscountRate] = useState<number | undefined>(0.0825);

  return (
    <NumericInput
      label="Discount Rate"
      value={discountRate}
      onChange={setDiscountRate}
      mode="percentage"
      step={0.0001}
      help="Enter precise rate (4 decimal places)"
    />
  );
}
```

**Display**: Shows `0.0825%` preserving all decimal places

## Behavior Details

### Formatting

- **While Focused**: Shows raw number without commas (e.g., `1000000`)
- **While Blurred**: Formats with thousand separators (e.g., `1,000,000`)
- **Decimal Preservation**: All decimal places are preserved during formatting

### Value Clamping

- Clamping occurs **on blur only**, not during typing
- If typed value exceeds `max`, it's automatically clamped to `max`
- If typed value is below `min`, it's automatically clamped to `min`
- Parent component receives clamped value via `onChange`

### Keyboard Navigation

- **Arrow Up**: Increment by `step` (respects `max`)
- **Arrow Down**: Decrement by `step` (respects `min`)
- **Escape**: Reset to original value and blur
- **Tab**: Normal focus management

### Input Validation

- Only allows: digits, decimal point, minus sign, commas
- Commas are automatically stripped from the parsed value
- Empty string maps to `undefined`
- Invalid input is rejected during typing

## Accessibility

### ARIA Attributes

```tsx
<input
  id={uniqueId}
  aria-required={required}
  aria-invalid={!!error}
  aria-describedby={error ? errorId : help ? helpId : undefined}
/>
```

### Label Association

- Auto-generated unique IDs using React's `useId()`
- Proper `<Label htmlFor={inputId}>` association
- Required fields show visual asterisk and set `aria-required`

### Error Messaging

- Error text has `role="alert"` for screen reader announcement
- Replaces help text when present (prevents confusion)
- Linked via `aria-describedby`

### Mobile Optimization

- `inputMode="decimal"` triggers numeric keyboard with decimal point
- Large touch targets (h-11 = 44px minimum)
- Clear visual feedback on focus/error states

## Styling

### Focus States

```css
/* Press On brand focus */
focus:ring-2 focus:ring-beige focus:border-beige
```

### Error States

```css
/* Error variant */
border-pov-error focus:ring-pov-error/20
```

### Typography

- **Font**: `font-mono` for numeric display (monospace)
- **Feature**: `tabular-nums` for column alignment
- **Labels**: `font-poppins` for Press On brand consistency

### Color Palette

| Element | Normal | Error | Disabled |
|---------|--------|-------|----------|
| Border | `border-lightGray` | `border-pov-error` | `border-lightGray` |
| Background | `bg-white` | `bg-white` | `bg-lightGray` |
| Focus Ring | `ring-beige` | `ring-pov-error/20` | None |
| Text | `text-charcoal` | `text-charcoal` | `text-charcoal` (60% opacity) |

## Comparison with FinancialInput

| Feature | NumericInput | FinancialInput (Legacy) |
|---------|--------------|-------------------------|
| Type Safety | `number \| undefined` | `string` (less safe) |
| Value Handling | Controlled numeric state | String-based (requires parsing) |
| Min/Max Clamping | Built-in with auto-clamping | Manual validation required |
| Accessibility | Full ARIA + auto IDs | Basic label support |
| Keyboard Nav | Arrow keys with step | None |
| Mode System | Explicit modes | Implicit via type prop |
| Focus States | Press On brand (beige) | Generic |
| Error States | Proper ARIA + alert role | Basic styling only |

## Migration Guide

### From FinancialInput

```tsx
// Before (FinancialInput)
const [value, setValue] = useState('1000000');

<FinancialInput
  label="Fund Size"
  value={value}
  onChange={setValue}
  type="currency"
/>

// After (NumericInput)
const [value, setValue] = useState<number | undefined>(1000000);

<NumericInput
  label="Fund Size"
  value={value}
  onChange={setValue}
  mode="currency"
/>
```

### Key Changes

1. **State Type**: Change from `string` to `number | undefined`
2. **Prop Name**: `type` → `mode`
3. **Parsing**: Remove manual `parseFloat()` - component handles it
4. **Formatting**: Remove manual `.toLocaleString()` - automatic on blur

## Testing

Comprehensive test coverage in `tests/unit/components/ui/NumericInput.test.tsx`:

- ✅ Basic rendering and props
- ✅ Mode-specific behavior (currency, percentage, number)
- ✅ Number formatting (commas, decimals, large numbers)
- ✅ User input validation
- ✅ Min/max clamping
- ✅ Keyboard navigation
- ✅ Accessibility (ARIA, labels, error states)
- ✅ Edge cases (undefined, zero, negative numbers)

## Examples

Live examples in `client/src/components/ui/NumericInput.examples.tsx`:

1. Currency Input
2. Percentage Input
3. Number Input with Suffix
4. Error State
5. Custom Prefix/Suffix
6. Min/Max Validation
7. Disabled State
8. Decimal Precision
9. Large Numbers
10. Form Integration

## Performance

- **Re-renders**: Minimal - only on value or focus state changes
- **Formatting**: Computed only on blur (not during typing)
- **Refs**: No-op returns same reference when value unchanged
- **Bundle Size**: ~2KB gzipped (including Label component)

## Browser Support

- ✅ Chrome/Edge (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Mobile Safari (iOS 12+)
- ✅ Chrome Mobile (Android)

## Related Components

- `Label` - Used internally for accessible labels
- `Input` - Base shadcn input (NumericInput is specialized)
- `FinancialInput` - Legacy component (consider migrating)

## FAQs

### Why `number | undefined` instead of `number`?

Empty inputs naturally map to `undefined`, representing "no value entered." This is more semantically correct than using `0` or `NaN`.

### Can I use this for non-financial numbers?

Yes! Use `mode="number"` for counts, years, multipliers, etc. The comma formatting and monospace font work well for any numeric data.

### How do I validate the value?

Check the value in your `onChange` handler or on form submit. The component handles min/max clamping, but you may want additional business logic validation.

### What about internationalization?

Currently uses `en-US` locale for formatting (comma separators). For i18n, you'd need to customize the `formatWithCommas` function to use `navigator.language` or a locale prop.

### Can I disable the comma formatting?

Not currently - it's a core feature. If needed, you could add a `disableFormatting` prop to bypass the blur formatting.

## Future Enhancements

- [ ] Internationalization (i18n) support for different locale formats
- [ ] Optional `formatLocale` prop for custom number formatting
- [ ] Currency code integration (e.g., USD, EUR, GBP)
- [ ] Copy/paste handling for formatted values
- [ ] Undo/redo support
- [ ] Integration with React Hook Form
- [ ] Storybook stories for visual testing

## License

Part of the Press On Ventures platform. Internal use only.
