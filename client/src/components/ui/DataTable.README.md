# DataTable Component

A generic, reusable table component with sorting capabilities and Press On Ventures brand styling.

## Features

- **Generic TypeScript** - Works with any data type using type parameter `<T>`
- **Sortable columns** - Click any column header to sort ascending/descending/unsorted
- **Sticky header** - Header stays visible when scrolling
- **Zebra striping** - Alternating white and light gray row backgrounds
- **Numeric formatting** - Auto-detects numeric columns and applies right-align + tabular-nums
- **Responsive** - Overflow scroll for wide tables
- **Brand styling** - Press On Ventures color scheme and typography

## Props

```typescript
interface Column<T> {
  key: keyof T;        // Property key from your data type
  label: string;       // Display name for the column header
  align?: 'left' | 'right';  // Optional text alignment (default: 'left')
}

interface DataTableProps<T> {
  columns: Column<T>[];  // Array of column definitions
  rows: T[];            // Array of data objects
}
```

## Usage

```tsx
import { DataTable } from '@/components/ui/DataTable';

interface Company {
  name: string;
  sector: string;
  revenue: number;
  employees: number;
}

function MyTable() {
  const data: Company[] = [
    { name: 'Acme Corp', sector: 'Tech', revenue: 125.5, employees: 450 },
    { name: 'Beta Inc', sector: 'Healthcare', revenue: 89.2, employees: 320 },
  ];

  return (
    <DataTable
      columns={[
        { key: 'name', label: 'Company Name' },
        { key: 'sector', label: 'Sector' },
        { key: 'revenue', label: 'Revenue ($M)', align: 'right' },
        { key: 'employees', label: 'Employees', align: 'right' },
      ]}
      rows={data}
    />
  );
}
```

## Sorting Behavior

- **First click** - Sort ascending (▲)
- **Second click** - Sort descending (▼)
- **Third click** - Remove sort (return to original order)

Numeric columns are sorted numerically; all other columns are sorted alphabetically using `localeCompare`.

## Styling Details

- **Header background**: `#F2F2F2` (light gray/surfaceSubtle)
- **Even rows**: White
- **Odd rows**: `#F2F2F2` (light gray/surfaceSubtle)
- **Border**: `#E0D8D1` (borderSubtle)
- **Header text**: `#292929` (charcoal), bold, Poppins font
- **Hover state**: Slightly darker background (`#E8E8E8`) on header cells
- **Numeric cells**: `font-mono` with `tabular-nums` for alignment

## Auto-detection

The component automatically:
- Detects numeric columns and applies `font-mono` + `tabular-nums`
- Right-aligns numeric columns (unless you specify `align: 'left'`)
- Handles null/undefined values (displays as "-")
- Sorts null values to the bottom of the list

## Examples

See `DataTable.example.tsx` for complete working examples with different data types.

## File Location

`client/src/components/ui/DataTable.tsx`
