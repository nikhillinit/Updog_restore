# Portfolio Components - Phase 1c

Fund Allocation Management with Tab Navigation System

## Overview

This directory contains the Portfolio tab-based interface for managing fund allocations, portfolio companies, and reallocation scenarios. The implementation follows the architecture defined in Phase 1c, with three main tabs integrated into the existing Portfolio page.

## Architecture

### Navigation Strategy
- **Three tabs INSIDE existing Portfolio page**: Overview | Allocations | Reallocation
- **NO new sidebar item** (avoids collision with NEW_IA architecture)
- **URL state management**: Active tab synced with query parameter (`?tab=allocations`)
- **Integrates with FundProvider context** for fund data access

### Typography & Styling
- **Headings**: Inter font family (`font-inter`)
- **Body text**: Poppins font family (`font-poppins`)
- **Color palette**: POV brand colors (charcoal, beige, success, error, warning)
- **Component library**: shadcn/ui with Tailwind CSS

## File Structure

```
portfolio/
├── PortfolioTabs.tsx              # Main tab container component
├── index.ts                       # Public exports
├── types.ts                       # TypeScript type definitions
├── README.md                      # This file
└── tabs/                          # Individual tab components
    ├── OverviewTab.tsx            # Portfolio companies overview
    ├── AllocationsTab.tsx         # Fund allocation breakdown
    ├── ReallocationTab.tsx        # Reallocation modeling
    ├── hooks/                     # Tab-specific React hooks
    ├── EditAllocationDialog.tsx   # Allocation editing interface
    └── allocations-table-columns.tsx  # Table column definitions
```

## Components

### PortfolioTabs (Main Container)

**File**: `PortfolioTabs.tsx`

Main tab navigation component with URL state management.

**Props**:
```typescript
interface PortfolioTabsProps {
  defaultTab?: PortfolioTabValue;    // 'overview' | 'allocations' | 'reallocation'
  onTabChange?: (tab: PortfolioTabValue) => void;
  syncWithUrl?: boolean;             // Default: true
}
```

**Features**:
- URL query parameter synchronization (`?tab=allocations`)
- Callback for tab change events
- Accessible keyboard navigation
- POV brand styling with Inter font headings

**Usage**:
```tsx
import { PortfolioTabs } from '@/components/portfolio';

export default function PortfolioPage() {
  return (
    <div className="container">
      <PortfolioTabs
        defaultTab="overview"
        syncWithUrl={true}
        onTabChange={(tab) => console.log('Tab changed:', tab)}
      />
    </div>
  );
}
```

### OverviewTab

**File**: `tabs/OverviewTab.tsx`

Portfolio companies overview with metrics, filtering, and search.

**Features**:
- Portfolio metrics cards (total companies, invested capital, MOIC)
- Company search and filtering (status, sector)
- Sortable table with company details
- Interactive status badges
- Export functionality

**Data displayed**:
- Company name and stage
- Investment amount and ownership %
- Current valuation and MOIC
- Funding history
- Action buttons (view, export, more)

### AllocationsTab

**File**: `tabs/AllocationsTab.tsx`

Fund allocation breakdown with real-time data fetching.

**Features**:
- Summary metrics (planned reserves, deployed, remaining)
- Interactive allocation table
- Search and filter by sector/status
- Sortable columns
- Edit allocation dialog
- Real-time data sync with API

**Data displayed**:
- Planned reserves per company
- Deployed amounts
- Remaining allocation capacity
- Allocation percentage of fund
- Status indicators

### ReallocationTab

**File**: `tabs/ReallocationTab.tsx`

Portfolio reallocation scenario modeling interface.

**Features**:
- Scenario management (draft, pending, completed)
- Impact metrics (MOIC improvement, risk reduction)
- Available capital calculation
- Scenario preview and execution
- Historical scenario tracking

**Planned features** (Phase 1c full release):
- AI-powered reallocation recommendations
- Interactive scenario builder
- What-if analysis tools
- Impact modeling
- Automated execution workflows

## Type Definitions

**File**: `types.ts`

```typescript
// Tab navigation
export type PortfolioTabValue = 'overview' | 'allocations' | 'reallocation';

// Portfolio company
export interface PortfolioCompany {
  id: string;
  company: string;
  sector: string;
  stage: string;
  investmentDate: string;
  initialInvestment: number;
  currentValue: number;
  ownershipPercent: number;
  moic: number;
  status: 'active' | 'exited' | 'written-off';
  lastFunding: string;
  lastFundingAmount: number;
}

// Allocation data
export interface AllocationData {
  category: string;
  allocated: number;
  percentage: number;
  companies: number;
  avgCheck: number;
}

// Reallocation scenario
export interface ReallocationScenario {
  id: string;
  name: string;
  status: 'draft' | 'pending' | 'completed';
  created: string;
  description: string;
  impact: string;
  projectedMOIC?: number;
  riskReduction?: number;
  capitalRequired?: number;
}
```

## Integration with Portfolio Page

**File**: `pages/portfolio-modern.tsx`

```tsx
import { POVBrandHeader } from "@/components/ui/POVLogo";
import { PortfolioTabs } from "@/components/portfolio/PortfolioTabs";

export default function ModernPortfolio() {
  return (
    <div className="min-h-screen bg-slate-100">
      <POVBrandHeader
        title="Portfolio"
        subtitle="Monitor and manage your portfolio companies and allocations"
        variant="light"
      />

      <div className="max-w-7xl mx-auto px-6 py-8">
        <PortfolioTabs defaultTab="overview" syncWithUrl={true} />
      </div>
    </div>
  );
}
```

## URL State Management

The tab system uses React Router's `useSearchParams` hook for URL state synchronization:

- Navigate to Overview: `/portfolio` or `/portfolio?tab=overview`
- Navigate to Allocations: `/portfolio?tab=allocations`
- Navigate to Reallocation: `/portfolio?tab=reallocation`

**Benefits**:
- Shareable URLs (can link directly to specific tabs)
- Browser history support (back/forward buttons work)
- Bookmark-friendly
- Deep linking capability

## Styling

### Tab Navigation
```css
/* TabsList */
- Background: white
- Border: pov-beige
- Height: 48px (h-12)
- Rounded corners: lg

/* TabsTrigger (inactive) */
- Font: Inter medium
- Color: inherit
- Transition: all 200ms

/* TabsTrigger (active) */
- Background: pov-charcoal (#292929)
- Text color: pov-white
- Font: Inter medium
```

### Tab Content
```css
/* TabsContent */
- Margin top: 24px (mt-6)
- Font: Poppins (body text)
```

### Color Palette
```
pov-charcoal: #292929
pov-white: #FFFFFF
pov-gray: #F2F2F2
pov-beige: #E0D8D1
pov-success: #10B981
pov-error: #EF4444
pov-warning: #F59E0B
```

## Data Flow

```
FundProvider (Context)
    ↓
PortfolioTabs (Container)
    ↓
┌───────────────┬──────────────────┬──────────────────┐
│ OverviewTab   │ AllocationsTab   │ ReallocationTab  │
│               │                  │                  │
│ - useFund     │ - useAllocations │ - useScenarios   │
│ - useCompanies│ - usePreview     │ - useCommit      │
└───────────────┴──────────────────┴──────────────────┘
```

## API Integration

### OverviewTab
- No direct API calls (uses FundProvider context)
- Sample data for Phase 1c preview

### AllocationsTab
- `GET /api/funds/:fundId/allocations/latest` - Fetch allocation data
- `PATCH /api/funds/:fundId/allocations/:companyId` - Update allocations
- Real-time data refresh

### ReallocationTab
- `POST /api/funds/:fundId/reallocation/preview` - Preview scenario
- `POST /api/funds/:fundId/reallocation/commit` - Execute scenario
- `GET /api/funds/:fundId/scenarios` - List scenarios

## Development Guidelines

### Adding a New Tab

1. Create tab component in `tabs/` directory
2. Add tab value to `PortfolioTabValue` type
3. Import and add to `PortfolioTabs.tsx`:
   ```tsx
   <TabsTrigger value="newtab">New Tab</TabsTrigger>
   <TabsContent value="newtab">
     <NewTab />
   </TabsContent>
   ```
4. Update types.ts with any new interfaces
5. Export from index.ts

### Styling Conventions

- Use `font-inter` for headings and labels
- Use `font-poppins` for body text and descriptions
- Use `font-mono` for numeric values (MOIC, currency)
- Follow POV color palette for consistency
- Use PremiumCard component for card layouts
- Apply hover states with `transition-colors`

### Testing

**Unit tests** (to be added):
```bash
npm test -- portfolio
```

**Manual testing checklist**:
- [ ] Tab switching updates URL
- [ ] Browser back/forward buttons work
- [ ] Direct URL navigation works
- [ ] Tab content loads correctly
- [ ] Responsive design on mobile
- [ ] Keyboard navigation accessible

## Performance Considerations

### Lazy Loading
Future enhancement to lazy-load tab content:
```tsx
const AllocationsTab = React.lazy(() => import('./tabs/AllocationsTab'));
const ReallocationTab = React.lazy(() => import('./tabs/ReallocationTab'));
```

### Memo Optimization
Consider memoizing tab components if performance issues arise:
```tsx
const MemoizedOverviewTab = React.memo(OverviewTab);
```

## Accessibility

- Keyboard navigation fully supported
- ARIA labels on interactive elements
- Focus management on tab change
- Screen reader friendly
- High contrast mode compatible

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- React Router v6 required

## Known Limitations

1. **AllocationsTab**: Currently shows real API data - may need fallback for demo mode
2. **ReallocationTab**: Placeholder UI - full functionality in Phase 1c final release
3. **OverviewTab**: Sample data hardcoded - needs FundProvider integration

## Future Enhancements (Roadmap)

### Phase 1c Final Release
- [ ] AI-powered allocation recommendations
- [ ] Interactive reallocation scenario builder
- [ ] Real-time what-if analysis
- [ ] Portfolio optimization algorithms
- [ ] Historical scenario comparison
- [ ] Export to Excel/PDF

### Phase 2
- [ ] Multi-fund comparison view
- [ ] Benchmark overlay
- [ ] Custom metric builder
- [ ] Advanced filtering (saved filters)
- [ ] Drag-and-drop allocation editor

## Dependencies

```json
{
  "react": "^18.0.0",
  "react-router-dom": "^6.0.0",
  "@radix-ui/react-tabs": "^1.0.0",
  "lucide-react": "^0.263.0"
}
```

## Contributing

When modifying portfolio components:

1. Maintain TypeScript type safety
2. Follow existing naming conventions
3. Use POV brand colors and fonts
4. Add JSDoc comments for complex logic
5. Update this README for significant changes
6. Test URL state management
7. Ensure mobile responsiveness

## Questions / Support

For questions about the Portfolio tab system, contact:
- Architecture: See DECISIONS.md
- Styling: See tailwind.config.ts
- Context: See client/src/contexts/FundContext.tsx
- API: See server/routes/funds.ts
