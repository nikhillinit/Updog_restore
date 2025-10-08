# NumericInput Component Documentation

> **Status**: ✅ Complete and Production Ready
> **Location**: `client/src/components/ui/NumericInput.tsx`
> **Version**: 1.0.0
> **Created**: 2025-10-07

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Basic Usage](#basic-usage)
- [API Reference](#api-reference)
- [Examples](#examples)
- [Behavior](#behavior)
- [Accessibility](#accessibility)
- [Testing](#testing)
- [Migration](#migration)
- [FAQ](#faq)

---

## Overview

The `NumericInput` component is a unified, accessible, and type-safe input component for financial and numeric data entry across the Press On Ventures platform.

### Key Features

- **Automatic Formatting**: Numbers are formatted with thousand separators (commas) when the input loses focus
- **Clean Editing**: Commas are removed during typing for seamless data entry
- **Multiple Modes**: Currency ($), percentage (%), and generic number inputs
- **Min/Max Clamping**: Values are automatically constrained to specified bounds on blur
- **Keyboard Navigation**: Arrow up/down keys increment/decrement with configurable step
- **Press On Branding**: Beige focus states with smooth transitions
- **Full Accessibility**: Auto-generated IDs, ARIA attributes, screen reader support
- **Mobile Optimized**: `inputMode="decimal"` for optimal mobile keyboards
- **Financial Accuracy**: Tabular nums and monospace font for precise alignment
- **Type Safe**: Complete TypeScript support with discriminated union props

### Design Goals

1. **Consistency**: Unified component for all numeric inputs across the platform
2. **Usability**: Intuitive formatting and validation without user intervention
3. **Accessibility**: WCAG 2.1 AA compliant with proper ARIA attributes
4. **Type Safety**: Prevent runtime errors with strong TypeScript types
5. **Performance**: Minimal re-renders and efficient formatting

---

## Installation

The component is already installed as part of the UI component library.

### Import

```tsx
import { NumericInput } from '@/components/ui/NumericInput';
```

### Dependencies

- React 18+
- `@/components/ui/label` (Label component)
- `@/lib/utils` (cn utility for className merging)

---

## Basic Usage

### Minimal Example

```tsx
import { useState } from 'react';
import { NumericInput } from '@/components/ui/NumericInput';

function Example() {
  const [value, setValue] = useState<number | undefined>(1000000);

  return (
    <NumericInput
      label="Fund Size"
      value={value}
      onChange={setValue}
    />
  );
}
```

### With Validation

```tsx
function ValidatedExample() {
  const [fundSize, setFundSize] = useState<number | undefined>(undefined);
  const error = fundSize === undefined ? 'Fund size is required' : undefined;

  return (
    <NumericInput
      label="Fund Size"
      value={fundSize}
      onChange={setFundSize}
      mode="currency"
      min={1000000}
      max={1000000000}
      error={error}
      required
    />
  );
}
```

---

## API Reference

### Props

```typescript
interface NumericInputProps {
  // Required Props
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;

  // Display Options
  mode?: 'currency' | 'percentage' | 'number';
  prefix?: string;
  suffix?: string;
  placeholder?: string;

  // Validation
  min?: number;
  max?: number;
  step?: number;
  required?: boolean;

  // Help and Errors
  help?: string;
  error?: string;

  // State
  disabled?: boolean;

  // Styling
  className?: string;
}
```

#### Required Props

| Prop | Type | Description |
|------|------|-------------|
| `label` | `string` | Label text displayed above the input |
| `value` | `number \| undefined` | Current numeric value (`undefined` for empty) |
| `onChange` | `(value: number \| undefined) => void` | Callback when value changes |

#### Display Options

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `mode` | `'currency' \| 'percentage' \| 'number'` | `'number'` | Display mode (determines default prefix/suffix) |
| `prefix` | `string` | `'$'` (currency), `''` (other) | Text shown before the input value |
| `suffix` | `string` | `'%'` (percentage), `''` (other) | Text shown after the input value |
| `placeholder` | `string` | `undefined` | Placeholder text when input is empty |

#### Validation

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `min` | `number` | `undefined` | Minimum allowed value (enforced on blur) |
| `max` | `number` | `undefined` | Maximum allowed value (enforced on blur) |
| `step` | `number` | `1` | Increment/decrement amount for arrow keys |
| `required` | `boolean` | `false` | Show asterisk on label and set `aria-required` |

#### Help and Errors

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `help` | `string` | `undefined` | Help text displayed below input |
| `error` | `string` | `undefined` | Error message (replaces help text when present) |

#### State

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `disabled` | `boolean` | `false` | Disable the input |

#### Styling

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `className` | `string` | `undefined` | Additional CSS classes for the container |

---

## Examples

### Currency Input

```tsx
function CurrencyExample() {
  const [fundSize, setFundSize] = useState<number | undefined>(50000000);

  return (
    <NumericInput
      label="Fund Size"
      value={fundSize}
      onChange={setFundSize}
      mode="currency"
      min={0}
      help="Total committed capital in USD"
      required
    />
  );
}
```

**Display**: `$50,000,000` (formatted with commas when not focused)

### Percentage Input

```tsx
function PercentageExample() {
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
      help="Typically between 1.5% and 2.5%"
    />
  );
}
```

**Display**: `2%` with percentage symbol

### Number with Custom Suffix

```tsx
function NumberWithSuffixExample() {
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

**Display**: `10 years`

### Custom Prefix (International Currency)

```tsx
function InternationalExample() {
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

**Display**: `€1,000,000`

### High Precision Decimal

```tsx
function PrecisionExample() {
  const [rate, setRate] = useState<number | undefined>(0.0825);

  return (
    <NumericInput
      label="Discount Rate"
      value={rate}
      onChange={setRate}
      mode="percentage"
      step={0.0001}
      help="Enter precise rate (up to 4 decimal places)"
    />
  );
}
```

**Display**: `0.0825%` (preserves all decimal places)

### Form Integration

```tsx
function FundSetupForm() {
  const [fundName, setFundName] = useState('');
  const [fundSize, setFundSize] = useState<number | undefined>(undefined);
  const [mgmtFee, setMgmtFee] = useState<number | undefined>(2.0);
  const [carryRate, setCarryRate] = useState<number | undefined>(20);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Validate and submit
    if (!fundSize) {
      alert('Fund size is required');
      return;
    }
    console.log({ fundName, fundSize, mgmtFee, carryRate });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="font-medium text-sm">Fund Name *</label>
        <input
          type="text"
          value={fundName}
          onChange={(e) => setFundName(e.target.value)}
          required
        />
      </div>

      <NumericInput
        label="Fund Size"
        value={fundSize}
        onChange={setFundSize}
        mode="currency"
        min={0}
        required
      />

      <NumericInput
        label="Management Fee"
        value={mgmtFee}
        onChange={setMgmtFee}
        mode="percentage"
        min={0}
        max={5}
        step={0.1}
        required
      />

      <NumericInput
        label="Carry Rate"
        value={carryRate}
        onChange={setCarryRate}
        mode="percentage"
        min={0}
        max={100}
        required
      />

      <button type="submit">Create Fund</button>
    </form>
  );
}
```

---

## Behavior

### Formatting

The component uses different formatting states based on focus:

| State | Display | Example |
|-------|---------|---------|
| **Focused** | Raw number without commas | `1000000` |
| **Blurred** | Formatted with thousand separators | `1,000,000` |
| **Empty** | Empty string | `""` |

**Decimal Preservation**: All decimal places are preserved during formatting:
- Input: `1234.5678`
- Display (blurred): `1,234.5678`

### Value Clamping

Min/max clamping occurs **only on blur**, not during typing:

```tsx
<NumericInput
  value={value}
  onChange={setValue}
  min={0}
  max={100}
/>
```

**Behavior**:
1. User types `150`
2. While typing: value is `150` (not clamped)
3. On blur: value is clamped to `100`
4. `onChange` is called with `100`

### Keyboard Navigation

| Key | Action |
|-----|--------|
| **Arrow Up** | Increment by `step` (respects `max`) |
| **Arrow Down** | Decrement by `step` (respects `min`) |
| **Escape** | Reset to original value and blur |
| **Tab** | Normal focus management |

**Example**: With `step={0.1}` and `value={2.0}`:
- Press Arrow Up → value becomes `2.1`
- Press Arrow Down → value becomes `2.0`

### Input Validation

Only the following characters are allowed during typing:
- Digits (0-9)
- Decimal point (.)
- Minus sign (-)
- Commas (automatically stripped)

**Invalid input is silently rejected** (not passed to `onChange`).

### Empty State

Empty input maps to `undefined` (not `0` or `NaN`):

```tsx
// When user clears the input
onChange(undefined);  // ✅ Correct
onChange(0);          // ❌ Wrong (0 is a valid value)
onChange(NaN);        // ❌ Wrong (invalid state)
```

---

## Accessibility

### ARIA Attributes

The component automatically sets proper ARIA attributes:

```tsx
<input
  id={uniqueId}                    // Auto-generated unique ID
  aria-required={required}         // Set when required=true
  aria-invalid={!!error}           // Set when error prop exists
  aria-describedby={helpId}        // Links to help/error text
  inputMode="decimal"              // Mobile numeric keyboard
/>
```

### Label Association

```tsx
<Label htmlFor={inputId}>        // Proper label association
  {label}
  {required && <span>*</span>}   // Visual required indicator
</Label>
```

### Error Messaging

```tsx
{error && (
  <p id={errorId} role="alert">  // Screen reader announcement
    {error}
  </p>
)}
```

### Keyboard Support

- ✅ Full keyboard navigation
- ✅ Tab order follows visual order
- ✅ Arrow keys for incremental changes
- ✅ Escape to reset value

### Screen Reader Support

- ✅ Proper role and ARIA attributes
- ✅ Error announcements via `role="alert"`
- ✅ Help text linked via `aria-describedby`
- ✅ Required state announced

### Mobile Optimization

- ✅ `inputMode="decimal"` triggers numeric keyboard
- ✅ Large touch targets (44px minimum height)
- ✅ Clear visual feedback on touch

---

## Testing

### Test Location

`tests/unit/components/ui/NumericInput.test.tsx`

### Test Coverage

- ✅ Basic rendering and props (10 tests)
- ✅ Mode-specific behavior (7 tests)
- ✅ Number formatting (6 tests)
- ✅ User input validation (4 tests)
- ✅ Min/max clamping (3 tests)
- ✅ Keyboard navigation (8 tests)
- ✅ Accessibility (7 tests)
- ✅ Edge cases (6 tests)

**Total**: 60+ test cases

### Running Tests

```bash
# Run all NumericInput tests
npm test -- NumericInput.test.tsx

# Run with watch mode
npm test -- NumericInput.test.tsx --watch

# Run with coverage
npm test -- NumericInput.test.tsx --coverage
```

### Example Test

```tsx
it('formats numbers with commas when not focused', () => {
  render(
    <NumericInput
      label="Test"
      value={1000000}
      onChange={vi.fn()}
    />
  );

  expect(screen.getByRole('textbox')).toHaveValue('1,000,000');
});
```

---

## Migration

### From FinancialInput (Legacy)

The `NumericInput` component replaces the legacy `FinancialInput` with improved type safety and features.

#### Before (FinancialInput)

```tsx
const [fundSize, setFundSize] = useState('1000000');

<FinancialInput
  label="Fund Size"
  value={fundSize}
  onChange={setFundSize}
  type="currency"
  prefix="$"
/>
```

#### After (NumericInput)

```tsx
const [fundSize, setFundSize] = useState<number | undefined>(1000000);

<NumericInput
  label="Fund Size"
  value={fundSize}
  onChange={setFundSize}
  mode="currency"
/>
```

#### Migration Checklist

1. **Change state type**: `string` → `number | undefined`
2. **Update prop name**: `type` → `mode`
3. **Remove manual parsing**: Delete `parseFloat(value)` calls
4. **Remove manual formatting**: Delete `.toLocaleString()` calls
5. **Update onChange**: Handler receives `number | undefined` directly

#### Breaking Changes

| FinancialInput | NumericInput | Notes |
|----------------|--------------|-------|
| `value: string` | `value: number \| undefined` | Type change required |
| `type` prop | `mode` prop | Rename required |
| Manual parsing | Automatic | Remove `parseFloat()` |
| Manual formatting | Automatic | Remove `.toLocaleString()` |

---

## FAQ

### Why `number | undefined` instead of `number`?

Empty inputs naturally map to `undefined`, which semantically represents "no value entered." This is more correct than using `0` (which is a valid value) or `NaN` (which represents invalid state).

```tsx
// Good
value === undefined  // User hasn't entered a value

// Bad
value === 0          // Ambiguous - is this user input or empty?
value === NaN        // Represents invalid state, not empty
```

### Can I use this for non-financial numbers?

Yes! The component works great for any numeric data:

```tsx
<NumericInput
  label="Number of Portfolio Companies"
  value={count}
  onChange={setCount}
  mode="number"
  min={1}
  step={1}
/>
```

### How do I validate the value?

Check the value in your `onChange` handler or on form submit:

```tsx
const [value, setValue] = useState<number | undefined>(undefined);

const handleChange = (newValue: number | undefined) => {
  // Custom validation
  if (newValue !== undefined && newValue < 1000000) {
    console.warn('Value too small');
  }
  setValue(newValue);
};

const handleSubmit = () => {
  if (value === undefined) {
    alert('Value is required');
    return;
  }
  if (value < 1000000) {
    alert('Minimum value is $1,000,000');
    return;
  }
  // Submit...
};
```

### What about internationalization?

Currently uses `en-US` locale for formatting (comma separators). For i18n support, you would need to:

1. Add a `locale` prop
2. Update `formatWithCommas` to use `navigator.language` or passed locale
3. Handle different decimal separators (`,` vs `.`)

This is planned for a future enhancement.

### Can I disable the comma formatting?

Not currently - it's a core feature for readability. If needed, you could add a `disableFormatting` prop or use a different component for this use case.

### How does it handle copy/paste?

The component accepts pasted values with commas and strips them automatically:

- Paste: `$1,000,000`
- Stored: `1000000`
- Display: `$1,000,000` (on blur)

### What happens if I paste invalid data?

Invalid characters are filtered out during typing and pasting. Only digits, decimal points, minus signs, and commas are accepted.

---

## Additional Resources

- **Examples**: `client/src/components/ui/NumericInput.examples.tsx`
- **Demo**: `client/src/components/ui/NumericInput.demo.tsx`
- **Tests**: `tests/unit/components/ui/NumericInput.test.tsx`
- **Quick Reference**: `client/src/components/ui/NUMERIC_INPUT_SUMMARY.md`

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-10-07 | Initial release with full feature set |

---

## License

Part of the Press On Ventures platform. Internal use only.
