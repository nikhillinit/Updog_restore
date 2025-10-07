# Portfolio Tabs Architecture

## Component Hierarchy

```
portfolio-modern.tsx (Page)
│
└── PortfolioTabs (Container)
    │
    ├── TabsList
    │   ├── TabsTrigger: "Overview"
    │   ├── TabsTrigger: "Allocations"
    │   └── TabsTrigger: "Reallocation"
    │
    ├── TabsContent: "overview"
    │   └── OverviewTab
    │       ├── PremiumCard × 4 (Metrics)
    │       ├── PremiumCard (Filters & Controls)
    │       │   ├── Input (Search)
    │       │   ├── Select (Status Filter)
    │       │   ├── Select (Sector Filter)
    │       │   ├── Button (Export)
    │       │   └── Button (Add Company)
    │       └── PremiumCard (Portfolio Table)
    │           └── table
    │               ├── thead
    │               └── tbody
    │
    ├── TabsContent: "allocations"
    │   └── AllocationsTab
    │       ├── Header (Title + Refresh Button)
    │       ├── Card × 3 (Summary Metrics)
    │       │   ├── Total Planned Reserves
    │       │   ├── Total Deployed Reserves
    │       │   └── Remaining to Deploy
    │       ├── Filters
    │       │   ├── Input (Search)
    │       │   ├── select (Sector Filter)
    │       │   └── select (Status Filter)
    │       ├── Card (Allocation Table)
    │       │   └── Table
    │       │       ├── TableHeader
    │       │       └── TableBody
    │       └── EditAllocationDialog
    │           ├── Input (Planned Reserves)
    │           └── Input (Allocation Cap)
    │
    └── TabsContent: "reallocation"
        └── ReallocationTab
            ├── Header (Title + New Scenario Button)
            ├── Left Column
            │   └── Card (Company Selection)
            │       ├── CompanySelectionTable
            │       │   ├── Checkbox (Select)
            │       │   ├── Input (New Allocation)
            │       │   └── Input (Cap)
            │       └── Button (Preview Changes)
            │
            └── Right Column
                └── Card (Preview & Commit)
                    ├── DeltaSummary
                    │   └── List of allocation changes
                    ├── TotalsSummary
                    │   └── Fund-level totals
                    ├── WarningsPanel
                    │   └── Validation errors/warnings
                    ├── Textarea (Commit Reason)
                    └── Buttons
                        ├── Cancel
                        └── Commit Changes
```

## Data Flow

```
┌─────────────────────────────────────────────────┐
│            FundProvider (Context)                │
│  - currentFund                                   │
│  - fundId                                        │
│  - isLoading                                     │
└─────────────────┬───────────────────────────────┘
                  │
                  ↓
┌─────────────────────────────────────────────────┐
│         PortfolioTabs (Container)                │
│  - URL state (useSearchParams)                   │
│  - activeTab: PortfolioTabValue                  │
│  - handleTabChange()                             │
└─────────────────┬───────────────────────────────┘
                  │
         ┌────────┼────────┐
         ↓        ↓        ↓
    ┌────────┐ ┌──────────┐ ┌──────────────┐
    │Overview│ │Allocations│ │Reallocation │
    │  Tab   │ │    Tab    │ │     Tab      │
    └────┬───┘ └─────┬─────┘ └──────┬───────┘
         │           │               │
         │           ↓               ↓
         │      useLatest      useReallocation
         │      Allocations    Preview/Commit
         │           │               │
         │           ↓               ↓
         │      GET /api/       POST /api/
         │      allocations/    reallocation/
         │      latest          preview|commit
         │
         ↓
    Sample Data
    (Phase 1c Preview)
```

## State Management

### URL State (React Router)
```typescript
// URL Query Parameter
?tab=overview      → OverviewTab
?tab=allocations   → AllocationsTab
?tab=reallocation  → ReallocationTab

// Managed by
const [searchParams, setSearchParams] = useSearchParams();
const activeTab = searchParams.get('tab') || 'overview';
```

### Component State

#### OverviewTab
```typescript
const [searchTerm, setSearchTerm] = useState('');
const [filterStatus, setFilterStatus] = useState('all');
const [filterSector, setFilterSector] = useState('all');

// Derived state
const filteredCompanies = useMemo(() =>
  portfolioCompanies.filter(company =>
    matchesSearch && matchesStatus && matchesSector
  ),
  [searchTerm, filterStatus, filterSector]
);
```

#### AllocationsTab
```typescript
const { data, isLoading, error, refetch } = useLatestAllocations();
const [selectedCompany, setSelectedCompany] = useState<AllocationCompany | null>(null);
const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
const [searchQuery, setSearchQuery] = useState('');
const [sectorFilter, setSectorFilter] = useState<string>('all');
const [statusFilter, setStatusFilter] = useState<string>('all');
const [sortConfig, setSortConfig] = useState<{
  key: keyof AllocationCompany;
  direction: 'asc' | 'desc';
} | null>(null);
```

#### ReallocationTab
```typescript
const [selectedCompanies, setSelectedCompanies] = useState<SelectedCompany[]>([]);
const [previewData, setPreviewData] = useState<ReallocationPreviewResponse | null>(null);
const [commitReason, setCommitReason] = useState('');

const { portfolioCompanies, isLoading } = usePortfolioCompanies(fundId);
const previewMutation = useReallocationPreview(fundId);
const commitMutation = useReallocationCommit(fundId);
```

## API Endpoints

### Allocations Tab
```
GET /api/funds/:fundId/allocations/latest
├── Response: {
│   metadata: {
│     total_planned_cents: number,
│     total_deployed_cents: number,
│     companies_count: number
│   },
│   companies: AllocationCompany[]
│ }
└── Hook: useLatestAllocations()

PATCH /api/funds/:fundId/allocations/:companyId
├── Request: {
│   planned_reserves_cents: number,
│   allocation_cap_cents: number | null
│ }
└── Hook: useMutation in EditAllocationDialog
```

### Reallocation Tab
```
POST /api/funds/:fundId/reallocation/preview
├── Request: {
│   current_version: number,
│   proposed_allocations: ProposedAllocation[]
│ }
├── Response: {
│   deltas: AllocationDelta[],
│   totals: TotalsSummary,
│   warnings: Warning[],
│   validation: ValidationResult
│ }
└── Hook: useReallocationPreview(fundId)

POST /api/funds/:fundId/reallocation/commit
├── Request: {
│   current_version: number,
│   proposed_allocations: ProposedAllocation[],
│   reason: string
│ }
├── Response: {
│   success: boolean,
│   message: string,
│   timestamp: string,
│   new_version: number
│ }
└── Hook: useReallocationCommit(fundId)
```

## Styling System

### Typography Scale
```
Headings (Inter):
  - h1: font-inter font-bold text-2xl (Portfolio Tabs)
  - h2: font-inter font-bold text-3xl (Metric values)
  - h3: font-inter font-semibold text-lg (Card titles)
  - h4: font-inter font-bold text-sm (Table headers)

Body Text (Poppins):
  - p: font-poppins text-sm (Descriptions)
  - span: font-poppins text-xs (Metadata)

Numeric Values (Roboto Mono):
  - font-mono font-medium (Currency, MOIC)
  - font-mono font-bold (Large metrics)
```

### Color Usage Matrix
```
┌──────────────────┬──────────────┬─────────────────┐
│ Element          │ Color        │ Hex             │
├──────────────────┼──────────────┼─────────────────┤
│ Active Tab       │ pov-charcoal │ #292929         │
│ Active Tab Text  │ pov-white    │ #FFFFFF         │
│ Borders          │ pov-beige    │ #E0D8D1         │
│ Backgrounds      │ pov-gray     │ #F2F2F2         │
│ Success (Active) │ pov-success  │ #10B981         │
│ Error (Written)  │ pov-error    │ #EF4444         │
│ Warning (Pending)│ pov-warning  │ #F59E0B         │
│ Info (Exited)    │ blue-600     │ #2563EB         │
└──────────────────┴──────────────┴─────────────────┘
```

### Responsive Breakpoints
```css
/* Mobile First */
sm: 640px   → grid-cols-1
md: 768px   → grid-cols-2, flex-row
lg: 1024px  → grid-cols-3, grid-cols-4
xl: 1280px  → max-w-7xl container
```

## Event Flow

### Tab Navigation
```
User clicks "Allocations" tab
    ↓
handleTabChange('allocations')
    ↓
setSearchParams({ tab: 'allocations' })
    ↓
URL updates: ?tab=allocations
    ↓
activeTab state updates
    ↓
TabsContent renders AllocationsTab
    ↓
useLatestAllocations() hook fires
    ↓
API call: GET /allocations/latest
    ↓
Data renders in table
```

### Allocation Edit
```
User clicks "Edit" button
    ↓
setSelectedCompany(company)
setIsEditDialogOpen(true)
    ↓
EditAllocationDialog renders
    ↓
User modifies values
    ↓
handleSubmit()
    ↓
PATCH /api/allocations/:companyId
    ↓
Success: refetch() + toast
    ↓
Table updates with new data
```

### Reallocation Preview & Commit
```
User selects companies
    ↓
setSelectedCompanies([...])
    ↓
User clicks "Preview Changes"
    ↓
previewMutation.mutate(request)
    ↓
POST /api/reallocation/preview
    ↓
setPreviewData(response)
    ↓
DeltaSummary + TotalsSummary + WarningsPanel render
    ↓
User enters commit reason
    ↓
User clicks "Commit Changes"
    ↓
commitMutation.mutate(request)
    ↓
POST /api/reallocation/commit
    ↓
Success: resetForm() + toast
    ↓
Allocations updated (new version)
```

## Error Handling

### Allocations Tab
```typescript
// Loading State
if (isLoading) return <Skeleton />;

// Error State
if (error) return (
  <Alert variant="destructive">
    <AlertCircle />
    <AlertDescription>{error.message}</AlertDescription>
    <Button onClick={refetch}>Retry</Button>
  </Alert>
);

// Empty State
if (companies.length === 0) return (
  <EmptyState message="No companies found" />
);
```

### Reallocation Tab
```typescript
// Version Conflict (409)
if (error.status === 409) {
  toast({
    title: 'Version conflict',
    description: 'Data was modified by another user. Please refresh.',
    variant: 'destructive'
  });
}

// Validation Errors
const blockingErrors = getBlockingErrors(previewData);
if (blockingErrors.length > 0) {
  // Disable commit button
  // Show errors in WarningsPanel
}
```

## Performance Optimizations

### Current
- Small component sizes (< 15KB each)
- Minimal re-renders
- Memoized filtered data
- Conditional rendering

### Future
```typescript
// Lazy loading tabs
const AllocationsTab = React.lazy(() =>
  import('./tabs/AllocationsTab')
);

// Memoized components
const MemoizedOverviewTab = React.memo(OverviewTab);

// Virtual scrolling (if table > 1000 rows)
import { useVirtualizer } from '@tanstack/react-virtual';
```

## Testing Strategy

### Unit Tests
```typescript
// PortfolioTabs.test.tsx
describe('PortfolioTabs', () => {
  it('renders three tabs', () => {});
  it('updates URL on tab change', () => {});
  it('loads correct tab from URL', () => {});
  it('calls onTabChange callback', () => {});
});

// OverviewTab.test.tsx
describe('OverviewTab', () => {
  it('renders portfolio metrics', () => {});
  it('filters companies by search', () => {});
  it('filters companies by status', () => {});
  it('filters companies by sector', () => {});
});
```

### Integration Tests
```typescript
// portfolio-integration.test.tsx
describe('Portfolio Integration', () => {
  it('navigates between tabs', () => {});
  it('preserves tab state on refresh', () => {});
  it('shares URLs correctly', () => {});
});
```

### E2E Tests (Playwright)
```typescript
// portfolio.spec.ts
test('portfolio tab navigation', async ({ page }) => {
  await page.goto('/portfolio');
  await page.click('text=Allocations');
  await expect(page).toHaveURL(/tab=allocations/);
});
```

## Accessibility

### Keyboard Navigation
```
Tab       → Move to next tab trigger
Shift+Tab → Move to previous tab trigger
Enter     → Activate focused tab
Space     → Activate focused tab
Arrow →   → Next tab (optional enhancement)
Arrow ←   → Previous tab (optional enhancement)
```

### ARIA Attributes
```html
<TabsList role="tablist">
  <TabsTrigger
    role="tab"
    aria-selected="true"
    aria-controls="overview-panel"
    id="overview-tab">
    Overview
  </TabsTrigger>
</TabsList>

<TabsContent
  role="tabpanel"
  aria-labelledby="overview-tab"
  id="overview-panel">
  <OverviewTab />
</TabsContent>
```

### Screen Reader Support
- Tab changes announce: "Overview tab, selected"
- Table headers: `<th scope="col">`
- Form labels: `<label htmlFor="...">`
- Status badges: `<span aria-label="Status: Active">`

## Security Considerations

### Input Validation
```typescript
// Allocation amounts
const validateAllocation = (value: number) => {
  if (value < 0) throw new Error('Must be non-negative');
  if (value > MAX_ALLOCATION) throw new Error('Exceeds limit');
  return value;
};

// Commit reason
const validateReason = (reason: string) => {
  if (reason.trim().length < 10) {
    throw new Error('Reason too short');
  }
  return reason.trim();
};
```

### API Security
- All endpoints require authentication
- CORS configured for allowed origins
- Rate limiting on mutations
- Input sanitization on server side
- Optimistic locking (version conflict detection)

## Future Enhancements

### Phase 1c Final
- [ ] AI-powered allocation recommendations
- [ ] Interactive charts (Recharts/Nivo)
- [ ] Scenario comparison view
- [ ] Export to Excel/PDF
- [ ] Advanced filtering (saved filters)

### Phase 2
- [ ] Multi-fund comparison
- [ ] Benchmark overlays
- [ ] Custom metric builder
- [ ] Drag-and-drop allocation editor
- [ ] Real-time collaboration (WebSockets)

## Monitoring & Analytics

### Performance Metrics
```typescript
// Track tab switching performance
useEffect(() => {
  const startTime = performance.now();
  return () => {
    const duration = performance.now() - startTime;
    analytics.track('TabRenderTime', {
      tab: activeTab,
      duration
    });
  };
}, [activeTab]);
```

### User Analytics
```typescript
// Track tab usage
analytics.track('PortfolioTabView', {
  tab: activeTab,
  timestamp: new Date().toISOString()
});

// Track allocation edits
analytics.track('AllocationEdited', {
  companyId,
  oldValue,
  newValue
});
```

## Conclusion

This architecture provides:
- ✅ Clean separation of concerns
- ✅ Type-safe data flow
- ✅ Excellent UX with URL state
- ✅ Comprehensive error handling
- ✅ Performance optimizations
- ✅ Accessibility support
- ✅ Extensible for future features

The tab-based structure allows each feature to evolve independently while maintaining a cohesive user experience.
