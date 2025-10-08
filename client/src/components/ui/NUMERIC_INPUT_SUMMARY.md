# NumericInput Component - Quick Reference

## Location
`client/src/components/ui/NumericInput.tsx`

## Import
```tsx
import { NumericInput } from '@/components/ui/NumericInput';
```

## Quick Start

```tsx
const [value, setValue] = useState<number | undefined>(1000000);

<NumericInput
  label="Fund Size"
  value={value}
  onChange={setValue}
  mode="currency"
  min={0}
  required
/>
```

## Three Modes

### 1. Currency (prefix: $)
```tsx
<NumericInput
  label="Amount"
  value={amount}
  onChange={setAmount}
  mode="currency"
/>
```
Displays: `$1,000,000`

### 2. Percentage (suffix: %)
```tsx
<NumericInput
  label="Fee"
  value={fee}
  onChange={setFee}
  mode="percentage"
  step={0.1}
/>
```
Displays: `2.5%`

### 3. Number (custom suffix)
```tsx
<NumericInput
  label="Term"
  value={term}
  onChange={setTerm}
  mode="number"
  suffix="years"
/>
```
Displays: `10 years`

## Key Features

✅ Auto-formats with commas on blur
✅ Clean editing (no commas while typing)
✅ Min/max clamping
✅ Arrow key navigation
✅ Full accessibility (ARIA)
✅ Mobile-optimized keyboard
✅ Press On brand styling
✅ Type-safe (TypeScript)

## Common Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `string` | required | Label text |
| `value` | `number \| undefined` | required | Current value |
| `onChange` | `function` | required | Change handler |
| `mode` | `'currency' \| 'percentage' \| 'number'` | `'number'` | Display mode |
| `min` | `number` | - | Minimum value |
| `max` | `number` | - | Maximum value |
| `step` | `number` | `1` | Arrow key increment |
| `help` | `string` | - | Help text |
| `error` | `string` | - | Error message |
| `required` | `boolean` | `false` | Show asterisk |
| `disabled` | `boolean` | `false` | Disable input |

## Examples

See `NumericInput.examples.tsx` for 10 comprehensive examples
See `NumericInput.demo.tsx` for interactive demo
See `NumericInput.README.md` for full documentation

## Tests

Location: `tests/unit/components/ui/NumericInput.test.tsx`
Coverage: 60+ test cases covering all features

## Migration from FinancialInput

```tsx
// OLD
const [value, setValue] = useState('1000000');
<FinancialInput
  label="Amount"
  value={value}
  onChange={setValue}
  type="currency"
/>

// NEW
const [value, setValue] = useState<number | undefined>(1000000);
<NumericInput
  label="Amount"
  value={value}
  onChange={setValue}
  mode="currency"
/>
```

## Behavior Notes

- **Formatting**: Only happens on blur (not while typing)
- **Clamping**: Applied on blur if value exceeds min/max
- **Keyboard**: Arrow up/down respects step and min/max
- **Empty**: Maps to `undefined` (not 0 or NaN)
- **Decimals**: Fully preserved in formatting

## Accessibility

- Auto-generated unique IDs
- Proper label association
- ARIA required/invalid/describedby
- Error messages with role="alert"
- Mobile inputMode="decimal"
