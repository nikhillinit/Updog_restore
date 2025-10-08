# LP Management Components

Specialized components for Limited Partner (LP) management and waterfall calculations.

## Components

### LPCard

Display LP commitment and distribution metrics with Press On Ventures branding.

**Features:**
- Card layout with border-borderSubtle, shadow-card
- Header: LP name (font-heading) + commitment (right-aligned, tabular-nums, font-mono)
- Progress bar showing capital called % (h-2 rounded, bg-surfaceSubtle, fill with bg-text)
- DPI calculation and display: distributed/commitment (format to 2 decimals with 'x' suffix)
- Responsive padding (p-4)

**Usage:**
```tsx
import { LPCard } from '@/components/lps';

<LPCard
  name="Acme Ventures"
  commitment={10000000}
  called={7500000}
  distributed={12000000}
/>
```

**Props:**
- `name` (string): LP name
- `commitment` (number): Total commitment in dollars
- `called` (number): Capital called in dollars
- `distributed` (number): Distributions received in dollars
- `className?` (string): Optional CSS classes

### WaterfallEditor

Edit waterfall tier structure for carry calculations.

**Features:**
- Grid layout for each tier: 3 columns (label, value input, description)
- Background bg-surfaceSubtle for each tier row
- Rounded-md with p-3
- NumericInput for tier value (step 0.01)
- Type-specific description text:
  - 'carry': "% of excess"
  - Others: "% / IRR target"
- Press On brand styling throughout

**Usage:**
```tsx
import { WaterfallEditor, type Tier } from '@/components/lps';
import { useState } from 'react';

const [tiers, setTiers] = useState<Tier[]>([
  { type: 'return', value: 1.0, label: 'Return of Capital' },
  { type: 'pref', value: 0.08, label: 'Preferred Return (8%)' },
  { type: 'catchup', value: 0.5, label: 'GP Catch-Up (50%)' },
  { type: 'carry', value: 0.20, label: 'Carried Interest' }
]);

<WaterfallEditor tiers={tiers} onChange={setTiers} />
```

**Props:**
- `tiers` (Tier[]): Array of waterfall tiers
- `onChange` ((tiers: Tier[]) => void): Callback when tiers change

**Tier Interface:**
```ts
interface Tier {
  type: 'return' | 'pref' | 'catchup' | 'carry';
  value: number;
  label: string;
}
```

## Press On Ventures Branding

Both components follow Press On Ventures design system:

- **Colors:** charcoal (#292929), beige (#E0D8D1), lightGray (#F2F2F2)
- **Typography:** font-heading (Inter), font-poppins (Poppins), font-mono (Roboto Mono)
- **Shadows:** shadow-card, shadow-elevated
- **Spacing:** Consistent padding and margins with responsive design
- **Transitions:** Smooth hover effects (duration-200)

## Related

See waterfall utilities in `client/src/lib/waterfall.ts` for advanced waterfall type handling and validation.
