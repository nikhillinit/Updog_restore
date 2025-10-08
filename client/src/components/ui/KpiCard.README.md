# KpiCard Component

A financial metric display component built with Press On Ventures brand styling for displaying KPIs with labels, values, deltas, and intent indicators.

## Features

- **Press On Ventures Brand Colors**: Uses charcoal (#292929) and beige (#E0D8D1) from the theme
- **Intent-based Styling**: Positive, negative, and neutral color indicators for deltas
- **Tabular Numbers**: Proper numeric alignment with `tabular-nums` class
- **Responsive Design**: Works seamlessly in grid layouts
- **Hover Effects**: Elevated shadow on hover for better interaction feedback
- **TypeScript Support**: Fully typed with proper props interface
- **Ref Forwarding**: Supports React ref forwarding for advanced use cases

## Installation

The component is located at: `client/src/components/ui/KpiCard.tsx`

## Usage

### Basic Example

```tsx
import { KpiCard } from '@/components/ui/KpiCard';

export function Dashboard() {
  return (
    <KpiCard
      label="Net IRR"
      value="24.5%"
    />
  );
}
```

### With Delta and Intent

```tsx
<KpiCard
  label="Net IRR"
  value="24.5%"
  delta="+2.1%"
  intent="positive"
/>
```

### Grid Layout Example

```tsx
import { KpiCard } from '@/components/ui/KpiCard';

export function MetricsDashboard() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <KpiCard
        label="Total Fund Size"
        value="$100M"
      />
      <KpiCard
        label="Deployed Capital"
        value="$65.2M"
        delta="+$5.5M"
        intent="positive"
      />
      <KpiCard
        label="Portfolio Companies"
        value="30"
        delta="+3"
        intent="positive"
      />
      <KpiCard
        label="Current IRR"
        value="24.5%"
        delta="+2.1%"
        intent="positive"
      />
    </div>
  );
}
```

### With Data Formatting

```tsx
import { KpiCard } from '@/components/ui/KpiCard';

export function FormattedMetrics() {
  const fundSize = 100000000; // $100M
  const deployedCapital = 65200000; // $65.2M

  const formatCurrency = (value: number) => {
    const millions = value / 1000000;
    return `$${millions.toFixed(1)}M`;
  };

  const formatDelta = (current: number, previous: number) => {
    const diff = current - previous;
    const sign = diff >= 0 ? '+' : '';
    return `${sign}${((diff / previous) * 100).toFixed(1)}%`;
  };

  return (
    <div className="grid grid-cols-2 gap-6">
      <KpiCard
        label="Total Fund Size"
        value={formatCurrency(fundSize)}
      />
      <KpiCard
        label="Deployed Capital"
        value={formatCurrency(deployedCapital)}
        delta={formatDelta(deployedCapital, 59700000)}
        intent="positive"
      />
    </div>
  );
}
```

## Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `label` | `string` | Yes | - | The metric label displayed above the value |
| `value` | `string` | Yes | - | The formatted metric value (format externally) |
| `delta` | `string` | No | - | Change indicator (e.g., "+2.3%" or "-5%") |
| `intent` | `'positive' \| 'negative' \| 'neutral'` | No | `'neutral'` | Determines the color of the delta |
| `className` | `string` | No | - | Additional CSS classes for custom styling |

## Intent Colors

The `intent` prop controls the delta color:

- **`positive`**: Green (#10b981) - For positive performance metrics
- **`negative`**: Red (#ef4444) - For negative performance metrics
- **`neutral`**: Charcoal 60% opacity - For stable or informational metrics

## Styling

### Base Styles

The component uses these Press On Ventures brand styles:

- **Card Background**: White (`bg-white`)
- **Border**: Light gray (`border-lightGray` = #F2F2F2)
- **Shadow**: Card shadow (`shadow-card`)
- **Font**: Poppins (`font-poppins`)
- **Text Color**: Charcoal (`text-charcoal` = #292929)
- **Hover Effect**: Elevated shadow (`hover:shadow-elevated`)

### Custom Styling

You can add custom styles via the `className` prop:

```tsx
<KpiCard
  label="Highlighted Metric"
  value="99.9%"
  delta="+10%"
  intent="positive"
  className="ring-2 ring-success"
/>
```

### Responsive Layouts

The component works well in responsive grid layouts:

```tsx
{/* 1 column on mobile, 2 on tablet, 4 on desktop */}
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
  <KpiCard label="Metric 1" value="100" />
  <KpiCard label="Metric 2" value="200" />
  <KpiCard label="Metric 3" value="300" />
  <KpiCard label="Metric 4" value="400" />
</div>
```

## Design System Integration

The KpiCard component follows the Press On Ventures design system:

### Colors (from tailwind.config.ts)

- **Primary Brand**: Charcoal (#292929)
- **Secondary Brand**: Beige (#E0D8D1)
- **Success**: Green (#10b981)
- **Error**: Red (#ef4444)
- **Light Gray**: #F2F2F2

### Typography

- **Font Family**: Poppins (body text)
- **Font Weights**: Medium (500) for labels, Bold (700) for values
- **Number Formatting**: `tabular-nums` for proper alignment

### Shadows

- **Card Shadow**: `0 2px 8px rgba(0, 0, 0, 0.05)`
- **Elevated Shadow**: `0 4px 12px rgba(0, 0, 0, 0.08)`

## Examples

See `KpiCard.example.tsx` for comprehensive usage examples including:

- Basic usage
- Positive/negative/neutral intents
- Real-world dashboard layouts
- Custom styling
- Data formatting helpers

## Ref Forwarding

The component supports ref forwarding for advanced use cases:

```tsx
const cardRef = useRef<HTMLDivElement>(null);

<KpiCard
  ref={cardRef}
  label="Test"
  value="100"
/>
```

## Testing

Test file location: `tests/unit/components/ui/KpiCard.test.tsx`

The test suite covers:
- Basic rendering
- Delta and intent styling
- Brand color compliance
- Custom className support
- Ref forwarding
- Financial metrics examples
- Layout and structure

## Best Practices

1. **Pre-format values**: Format numbers/currency before passing to the component
   ```tsx
   // ✅ Good
   <KpiCard value={formatCurrency(100000000)} />

   // ❌ Bad
   <KpiCard value={100000000} />
   ```

2. **Use semantic intents**: Match intent to the meaning of the metric
   ```tsx
   // ✅ Good - Loss is negative
   <KpiCard label="Unrealized Loss" value="$2M" delta="-5%" intent="negative" />

   // ❌ Bad - Confusing intent
   <KpiCard label="Unrealized Loss" value="$2M" delta="-5%" intent="positive" />
   ```

3. **Keep labels concise**: Short, clear labels work best
   ```tsx
   // ✅ Good
   <KpiCard label="Net IRR" value="24.5%" />

   // ❌ Bad
   <KpiCard label="Net Internal Rate of Return (IRR) Percentage" value="24.5%" />
   ```

4. **Use consistent delta formats**: Keep delta formatting consistent across your app
   ```tsx
   // ✅ Good - Consistent format
   <KpiCard delta="+2.1%" />
   <KpiCard delta="-5.2%" />

   // ❌ Bad - Inconsistent
   <KpiCard delta="up 2.1%" />
   <KpiCard delta="down by 5.2 percent" />
   ```

## Related Components

- `Card` - Base card component from shadcn/ui
- `PremiumCard` - Enhanced card with title/subtitle
- `MetricCards` - Legacy metric display component

## File Locations

- **Component**: `c:\dev\Updog_restore\client\src\components\ui\KpiCard.tsx`
- **Examples**: `c:\dev\Updog_restore\client\src\components\ui\KpiCard.example.tsx`
- **Tests**: `c:\dev\Updog_restore\tests\unit\components\ui\KpiCard.test.tsx`
- **Documentation**: `c:\dev\Updog_restore\client\src\components\ui\KpiCard.README.md`

## License

Internal component for Press On Ventures platform.
