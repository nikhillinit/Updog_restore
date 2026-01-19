---
status: ACTIVE
last_updated: 2026-01-19
---

# Information Architecture Consolidation Strategy

**Status**: Foundation Phase (Week 1-6)
**Goal**: Consolidate from 9+ fragmented routes to 5 cohesive top-level routes
**Principle**: "Strangler Fig" migration - new IA wraps old functionality, progressive cutover

---

## Executive Summary

The current IA suffers from **route fragmentation** (separate items for Investments/Investment Table/Portfolio, Financial Modeling/Forecasting/Cash Management) that diffuses UX focus. This strategy consolidates to **5 top-level routes** matching industry patterns (Tactyc, Carta) while maintaining demo-ability throughout migration.

**Target IA (5 Routes)**:
1. **Overview** — KPI cards, trend charts, fund health at-a-glance
2. **Portfolio** — Companies, unified investments table, Cap Table in Company tabs
3. **Model** — Single wizard (7 steps: General → Waterfall), no separate pages
4. **Operate** — Capital calls, distributions, fees workflows
5. **Report** — LP statements, exports, dashboard sharing

---

## Current State Analysis

### Existing Routes (Audit)
```
/fund                    → Overview (Fund cards, but mock data)
/investments             → Investment list view
/investment-table        → Dense table view (duplicate)
/portfolio               → Company portfolio (overlaps with investments)
/cap-table               → Top-level cap table (should be per-company)
/financial-modeling      → Modeling tools
/forecasting             → Forecast scenarios (overlaps with modeling)
/cash-management         → Cash flow planning (should be in Operate)
/secondary-market        → LP transfers (low priority)
/fund-setup              → Fund creation wizard
```

**Problems Identified** (per executive feedback):
- 3 routes for essentially one concept (Investments/Investment Table/Portfolio)
- Modeling fragmented across 3 routes (Financial Modeling/Forecasting/Cash Management)
- Cap Table at top-level instead of Company context
- Fund cards display mock data (no selector binding)

---

## Target State Design

### Route 1: Overview (`/overview`)
**Purpose**: Executive dashboard - fund health at-a-glance
**Components**:
- Fund summary cards (committed, called, NAV, DPI, TVPI, IRR) **bound to KPI selectors**
- Trend charts (capital deployment over time, portfolio valuation)
- Recent activity feed (calls, distributions, valuations)
- Quick actions (new capital call, update valuation)

**Migration**:
- Enhance existing `/fund` route
- Bind Fund cards at `client/src/pages/fund.tsx:85` to real KPI selectors
- Add skeletons during loading
- Feature flag: `enable_new_ia`

**Files Affected**:
```
client/src/pages/fund.tsx              → Enhance with KPI selector binding
client/src/components/FundCards.tsx    → Replace mock data
client/src/hooks/useFundKPIs.ts        → NEW: TanStack Query hook
shared/contracts/kpi-selector.contract.ts → Import types
```

---

### Route 2: Portfolio (`/portfolio`)
**Purpose**: Company-centric view with unified investments table
**Components**:
- Unified investments table (TanStack Table v8, virtualized)
  - Column presets: Comfortable/Compact
  - Persist column visibility, filters, sorts
  - Replaces `/investments`, `/investment-table`, `/portfolio`
- Company detail modal/page with tabs:
  - **Overview**: Valuation, ownership, key metrics
  - **Cap Table**: Move from top-level nav (executive feedback)
  - **Notes**: Investment thesis, board notes
  - **Documents**: Term sheets, board decks

**Migration**:
- Create new `/portfolio` as primary route
- Redirect `/investments` → `/portfolio?view=table`
- Redirect `/investment-table` → `/portfolio?view=table&density=compact`
- Redirect `/cap-table/:companyId` → `/portfolio/:companyId?tab=cap-table`
- Deprecation timeline: 3 months with banners, then hard redirect
- Feature flag: `enable_portfolio_table_v2`, `enable_cap_table_tabs`

**Files Affected**:
```
client/src/pages/portfolio.tsx               → NEW: Unified portfolio page
client/src/components/PortfolioTable.tsx     → NEW: TanStack Table v8
client/src/components/CompanyDetail.tsx      → NEW: Tabbed detail view
client/src/components/CapTable.tsx           → Move from standalone page
client/src/pages/investments.tsx             → Deprecate (redirect)
client/src/pages/investment-table.tsx        → Deprecate (redirect)
```

---

### Route 3: Model (`/model`)
**Purpose**: Unified modeling wizard - replace 3 fragmented routes
**Components**:
- **Single stepper wizard** (7 steps):
  1. **General Info**: Fund structure, size, duration
  2. **Sector Profiles**: Sector allocation, graduation matrix
  3. **Capital Allocations**: Investment pacing, reserve strategy
  4. **Fees & Expenses**: Tiered fee bases, step-downs, recycling toggles
  5. **Exit Recycling**: Recycling provisions, capital redeployment
  6. **Waterfall**: Distribution waterfall, carry, hurdle rates
  7. **Results**: Model outputs, scenario comparison

**Implementation**:
- XState for wizard state machine
- Zod validation per step
- Shallow routing: `/model?step=allocations`
- Guarded navigation (can't skip if previous step invalid)
- Persistence: `POST /api/modeling/sessions` with step key
- Feature flag per step: `enable_wizard_step_general`, etc.

**Migration**:
- Consolidate logic from `/financial-modeling`, `/forecasting`, `/cash-management`
- Phase in step-by-step (Weeks 7-15)
- Deprecate old routes once wizard complete
- Feature flag: `enable_modeling_wizard`

**Files Affected**:
```
client/src/pages/model/index.tsx                    → NEW: Wizard container
client/src/pages/model/steps/GeneralInfo.tsx        → NEW: Step 1
client/src/pages/model/steps/SectorProfiles.tsx     → NEW: Step 2
client/src/pages/model/steps/Allocations.tsx        → NEW: Step 3
client/src/pages/model/steps/FeesExpenses.tsx       → NEW: Step 4
client/src/pages/model/steps/ExitRecycling.tsx      → NEW: Step 5
client/src/pages/model/steps/Waterfall.tsx          → NEW: Step 6
client/src/pages/model/steps/Results.tsx            → NEW: Step 7
client/src/state/modelingWizard.machine.ts          → NEW: XState machine
client/src/pages/financial-modeling.tsx             → Deprecate
client/src/pages/forecasting.tsx                    → Deprecate
client/src/pages/cash-management.tsx                → Deprecate
```

---

### Route 4: Operate (`/operate`)
**Purpose**: Operational workflows - capital calls, distributions, fees
**Components**:
- Capital calls workflow (create, send, track responses)
- Distributions workflow (calculate, approve, execute)
- Fee management (accrue, reconcile, pay)
- Cash ledger (all fund-level cash movements)

**Migration**:
- Extract cash management from modeling
- Build idempotent create operations
- Add basic reconciliation
- CSV export for accounting integration
- Feature flag: `enable_operations_hub`

**Files Affected**:
```
client/src/pages/operate/index.tsx              → NEW: Operations hub
client/src/pages/operate/CapitalCalls.tsx       → NEW: Capital calls
client/src/pages/operate/Distributions.tsx      → NEW: Distributions
client/src/pages/operate/Fees.tsx               → NEW: Fee management
server/routes/operations.ts                     → NEW: Operations API
```

---

### Route 5: Report (`/report`)
**Purpose**: LP reporting and data export
**Components**:
- LP statement generator (PDF/CSV templates)
- Custom report builder (select KPIs, date ranges)
- Dashboard sharing toggle (generate public link)
- Audit log (who accessed what, when)

**Migration**:
- Reuse KPI selectors for data source
- Add PDF generation (puppeteer/react-pdf)
- Simple template system
- Feature flag: `enable_lp_reporting`

**Files Affected**:
```
client/src/pages/report/index.tsx               → NEW: Reporting hub
client/src/components/LPStatementBuilder.tsx    → NEW: Statement generator
server/routes/reports.ts                        → NEW: Report API
server/utils/pdfGenerator.ts                    → NEW: PDF generation
```

---

## Migration Timeline & Rollout

### Week 1-2: Foundation Setup
- [x] Create feature flag infrastructure (`enable_new_ia`)
- [ ] Add new route stubs with "Coming Soon" placeholders
- [ ] Implement redirect middleware with deprecation banners
- [ ] Update navigation component with feature flag checks

### Week 3-4: Overview Enhancement
- [ ] Bind Fund cards to KPI selectors (fix mock data)
- [ ] Add trend charts with real data
- [ ] Implement loading skeletons
- [ ] Demo-ready Overview page

### Week 5-6: Portfolio Consolidation
- [ ] Build unified PortfolioTable with TanStack Table v8
- [ ] Create CompanyDetail with tabs (move Cap Table)
- [ ] Set up redirects from `/investments`, `/investment-table`, `/cap-table`
- [ ] Demo-ready Portfolio page

### Week 7-15: Modeling Wizard (Phase 2)
- [ ] Implement wizard steps 1-7 progressively
- [ ] Deprecate `/financial-modeling`, `/forecasting`, `/cash-management`
- [ ] Demo each step as completed

### Week 16-17: Operations Hub (Phase 2)
- [ ] Build capital calls and distributions workflows
- [ ] Extract cash management logic

### Week 18-19: Reporting (Phase 3)
- [ ] LP statement generation
- [ ] PDF export

### Week 20-21: Final Cutover (Phase 3)
- [ ] Enable hard redirects (`enable_route_redirects`)
- [ ] Remove deprecated routes
- [ ] Update all documentation

---

## Redirect Strategy

### Soft Redirects (Weeks 1-12)
```tsx
// Example: /investments route during deprecation
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { DeprecationBanner } from '@/components/DeprecationBanner';

export function InvestmentsPage() {
  const newIAEnabled = useFeatureFlag('enable_new_ia');

  if (newIAEnabled) {
    return (
      <>
        <DeprecationBanner
          message="This page has moved to Portfolio"
          newRoute="/portfolio"
          dismissible
        />
        {/* Existing investments page content */}
      </>
    );
  }

  return {/* Existing investments page content */};
}
```

### Hard Redirects (Week 20+)
```tsx
// server/middleware/routeRedirects.ts
export const ROUTE_REDIRECTS = {
  '/investments': '/portfolio?view=table',
  '/investment-table': '/portfolio?view=table&density=compact',
  '/cap-table/:companyId': '/portfolio/:companyId?tab=cap-table',
  '/financial-modeling': '/model?step=general',
  '/forecasting': '/model?step=allocations',
  '/cash-management': '/operate',
} as const;
```

---

## State Management Boundaries

Per executive feedback: avoid "God context" bloat

**URL State** (search params):
- Current wizard step: `/model?step=allocations`
- Table view mode: `/portfolio?view=table&density=compact`
- Company detail tab: `/portfolio/:id?tab=cap-table`

**TanStack Query** (server state):
- KPI data: `useFundKPIs(fundId, asOf)`
- Portfolio companies: `usePortfolioCompanies(fundId)`
- Modeling session: `useModelingSession(sessionId)`

**Zustand** (complex client state):
- Wizard state machine: `useModelingWizardStore()`
- Table preferences: `useTablePreferencesStore()`
- UI state: `useUIStore()` (modals, toasts, selection)

**Context** (cross-cutting config only):
- Theme: `ThemeProvider`
- User/auth: `AuthProvider`
- Feature flags: `FeatureFlagProvider`

**NOT Context**:
- ❌ Fund data (use TanStack Query)
- ❌ Wizard state (use Zustand)
- ❌ Form state (use React Hook Form)

---

## Testing Strategy

### Navigation Tests
```typescript
describe('IA Consolidation', () => {
  it('redirects /investments to /portfolio when flag enabled', async () => {
    enableFlag('enable_new_ia');
    await navigate('/investments');
    expect(currentPath()).toBe('/portfolio');
  });

  it('shows deprecation banner when soft redirect active', async () => {
    enableFlag('enable_new_ia');
    disableFlag('enable_route_redirects');
    await navigate('/investments');
    expect(screen.getByText(/moved to Portfolio/i)).toBeInTheDocument();
  });
});
```

### KPI Selector Binding Tests
```typescript
describe('Overview Page', () => {
  it('binds Fund cards to real KPI selectors', async () => {
    mockKPIResponse({ dpi: 1.43, tvpi: 2.15 });
    render(<OverviewPage />);

    await waitFor(() => {
      expect(screen.getByText('DPI')).toBeInTheDocument();
      expect(screen.getByText('1.43x')).toBeInTheDocument();
    });
  });
});
```

---

## Rollback Plan

**Instant Rollback** (via feature flags):
```typescript
// Emergency: disable new IA entirely
disableFlag('enable_new_ia'); // Removes all new routes, restores old nav
```

**Partial Rollback** (disable specific features):
```typescript
// Problem with Portfolio table? Keep old routes
disableFlag('enable_portfolio_table_v2');
// Users see old /investments page, new Overview still works
```

**Database Rollback** (N/A for IA changes):
- No schema changes in Phase 1
- Route consolidation is purely client-side

---

## Demo Script Evolution

### Week 2 Demo
- "New 5-route navigation structure"
- Show Overview with placeholder cards
- Explain consolidation rationale

### Week 4 Demo
- "Fund cards now show real KPIs"
- Live data from KPI selectors
- Trend charts with historical data

### Week 6 Demo
- "Unified Portfolio table replaces 3 pages"
- Show company detail with Cap Table tab
- Demonstrate column preferences

### Week 12 Demo
- "Complete Modeling wizard (Steps 1-4)"
- Walk through fund construction flow
- Show validation and persistence

---

## Success Metrics

**Quantitative**:
- Reduce route count: 9+ → 5 (✅ 44% reduction)
- Navigation depth: 3 clicks → 2 clicks to any function
- KPI data accuracy: 0% real → 100% real (bind selectors)
- Table consolidation: 3 tables → 1 unified table

**Qualitative**:
- User feedback: "Where do I go?" confusion eliminated
- Demo clarity: Flows match industry patterns (Tactyc, Carta)
- Stakeholder confidence: Real data + clear IA = credible product

---

## Acceptance Criteria

**Phase 1 Complete (Week 6)**:
- [ ] 5 top-level routes visible in navigation
- [ ] Overview Fund cards bound to KPI selectors (no mocks)
- [ ] Portfolio table consolidates Investments/Investment Table
- [ ] Cap Table moved to Company detail tabs
- [ ] Deprecation banners on old routes
- [ ] All routes feature-flagged for instant rollback

**Phase 2 Complete (Week 17)**:
- [ ] Modeling wizard Steps 1-7 functional
- [ ] Old modeling routes hard-redirect
- [ ] Operations hub MVP (capital calls, distributions)

**Phase 3 Complete (Week 21)**:
- [ ] LP reporting functional
- [ ] All old routes removed from codebase
- [ ] 90%+ test coverage on critical flows

---

## References

- **Executive Feedback**: "Consolidate to 5 routes, move Cap Table to tabs, single Model wizard"
- **Industry Patterns**: Tactyc (wizard steps), Carta (company-centric tabs)
- **Feature Flags**: `shared/feature-flags/flag-definitions.ts`
- **Contracts**: KPI Selector (`shared/contracts/kpi-selector.contract.ts`)
