# Portfolio Tabs - Allocations Tab

## Overview

The Allocations Tab is a comprehensive UI component for Fund Allocation Management (Phase 1c). It provides a data table interface for viewing and editing allocation state across all portfolio companies.

## Features

### 1. Company List Table
- **Columns:**
  - Company Name (sortable)
  - Sector (sortable, filterable)
  - Stage
  - Status (filterable with color coding)
  - Invested Amount (formatted as compact currency)
  - Deployed Reserves (formatted as compact currency)
  - Planned Reserves (sortable, formatted as compact currency)
  - Allocation Cap (formatted or "No cap")
  - Last Updated (relative time formatting)
  - Actions (Edit button)

### 2. Interactive Features
- **Search:** Real-time search by company name
- **Filters:**
  - Sector dropdown (dynamically populated)
  - Status dropdown (active, exited, written_off, on_hold)
- **Sorting:** Click column headers to sort ascending/descending
- **Edit Dialog:** In-place editing with validation

### 3. Summary Cards
- Total Planned Reserves
- Total Deployed Reserves
- Remaining to Deploy (calculated)

### 4. State Management
- **Loading State:** Skeleton loaders during data fetch
- **Empty State:** Friendly message when no companies exist
- **Error State:** Error display with retry button
- **Optimistic Updates:** UI updates immediately on edit

## File Structure

```
client/src/components/portfolio/tabs/
├── AllocationsTab.tsx              # Main component
├── EditAllocationDialog.tsx        # Edit modal
├── allocations-table-columns.tsx   # Column definitions
├── types.ts                        # TypeScript types
├── index.ts                        # Exports
├── hooks/
│   ├── useLatestAllocations.ts     # Data fetching hook
│   ├── useUpdateAllocations.ts     # Update mutation hook
│   └── __tests__/
│       └── useLatestAllocations.test.ts
└── __tests__/
    ├── AllocationsTab.test.tsx
    └── EditAllocationDialog.test.tsx
```

## API Integration

### GET /api/funds/:fundId/allocations/latest

**Response:**
```typescript
{
  companies: AllocationCompany[];
  metadata: AllocationMetadata;
}
```

### POST /api/funds/:fundId/allocations

**Request:**
```typescript
{
  company_id: number;
  planned_reserves_cents: number;
  allocation_cap_cents: number | null;
  allocation_reason: string | null;
  allocation_version: number; // For optimistic locking
}
```

**Response:**
```typescript
{
  success: boolean;
  company: AllocationCompany;
}
```

**Error Handling:**
- **409 Conflict:** Optimistic locking failure (version mismatch)
- **400 Bad Request:** Validation errors
- **404 Not Found:** Company or fund not found
- **500 Server Error:** Internal server error

## Usage

### Basic Usage

```tsx
import { AllocationsTab } from '@/components/portfolio/tabs';

function PortfolioPage() {
  return (
    <FundProvider>
      <AllocationsTab />
    </FundProvider>
  );
}
```

### With Custom Styling

```tsx
<div className="p-6">
  <AllocationsTab />
</div>
```

## TypeScript Types

### AllocationCompany

```typescript
interface AllocationCompany {
  company_id: number;
  company_name: string;
  sector: string;
  stage: string;
  status: string;
  invested_amount_cents: number;
  deployed_reserves_cents: number;
  planned_reserves_cents: number;
  allocation_cap_cents: number | null;
  allocation_reason: string | null;
  allocation_version: number;
  last_allocation_at: string | null;
}
```

### AllocationMetadata

```typescript
interface AllocationMetadata {
  total_planned_cents: number;
  total_deployed_cents: number;
  companies_count: number;
  last_updated_at: string | null;
}
```

## Validation Rules

### Edit Allocation Dialog

1. **Planned Reserves:**
   - Required field
   - Must be non-negative
   - No maximum limit

2. **Allocation Cap:**
   - Optional field
   - Must be non-negative if provided
   - Must be >= Planned Reserves
   - Can be cleared (set to null)

3. **Allocation Reason:**
   - Optional field
   - Max 500 characters
   - Character counter displayed

## Currency Formatting

All monetary values use centralized formatting from `@/lib/units`:

```typescript
import { formatCents } from '@/lib/units';

// Compact format (e.g., "$1.5M")
formatCents(150000000, { compact: true })

// Full format (e.g., "$1,500,000.00")
formatCents(150000000, { decimals: 2 })
```

## Testing

### Run Tests

```bash
npm test -- AllocationsTab
npm test -- EditAllocationDialog
npm test -- useLatestAllocations
```

### Test Coverage

- **AllocationsTab:** 10 test cases
  - Loading, error, and empty states
  - Data rendering
  - Search and filtering
  - Sorting
  - Edit dialog interaction
  - Refresh functionality

- **EditAllocationDialog:** 8 test cases
  - Dialog open/close
  - Form pre-filling
  - Validation (planned reserves, allocation cap)
  - Submission
  - Optimistic locking conflict handling
  - Character counting

- **useLatestAllocations:** 4 test cases
  - Successful fetch
  - Error handling
  - Retry logic
  - Conditional fetching

## Performance Optimizations

1. **Memoization:**
   - Column definitions memoized with `useMemo`
   - Filtered/sorted data memoized
   - Sector/status lists memoized

2. **Query Caching:**
   - TanStack Query caches for 5 minutes
   - Automatic cache invalidation on updates
   - Retry failed requests up to 2 times

3. **Conditional Rendering:**
   - Only renders active filters when needed
   - Lazy loading of edit dialog content

## Accessibility

- Semantic HTML (table elements)
- ARIA labels on interactive elements
- Keyboard navigation support
- Focus management in dialogs
- Screen reader friendly status badges

## Future Enhancements

1. **Pagination:** Server-side pagination for large datasets
2. **Bulk Edit:** Multi-select and bulk update
3. **Export:** CSV/Excel export functionality
4. **History:** View allocation history timeline
5. **Charts:** Visual allocation distribution charts
6. **Notifications:** Real-time updates via WebSocket

## Dependencies

- React 18+
- TanStack Query v4+
- shadcn/ui components
- date-fns (for relative time)
- lucide-react (for icons)

## License

Internal tool for Press On Ventures - Proprietary
