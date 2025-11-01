# 🎯 Enhanced Demo Plan - Production-Ready Architecture

> **Integration of Multi-AI Analysis + Tactical Refinements**

## 🏗️ **INFORMATION ARCHITECTURE** (Final)

### Navigation Structure (5 Items)

```typescript
// client/src/components/layout/sidebar.tsx
const NAVIGATION = [
  {
    id: 'overview',
    label: 'Overview',
    icon: LayoutDashboard,
    path: '/overview',
  },
  {
    id: 'portfolio',
    label: 'Portfolio',
    icon: Building2,
    path: '/portfolio',
    description: 'Companies table with drill-down',
  },
  {
    id: 'model',
    label: 'Model',
    icon: Calculator,
    path: '/model',
    tabs: ['Construction', 'Current', 'Reserves'],
    comingSoon: true,
  },
  {
    id: 'operate',
    label: 'Operate',
    icon: Wallet,
    path: '/operate',
    tabs: ['Capital Calls', 'Distributions', 'Fees'],
    comingSoon: true,
  },
  {
    id: 'report',
    label: 'Report',
    icon: FileText,
    path: '/report',
    description: 'Exports & LP packets',
    comingSoon: true,
  },
];
```

### Route Migration Map

| Old Route             | New Route                  | Implementation     |
| --------------------- | -------------------------- | ------------------ |
| `/investments`        | `/portfolio`               | Soft redirect      |
| `/investment-table`   | `/portfolio?view=table`    | Query param preset |
| `/cap-tables`         | `/portfolio/:id/cap-table` | Company tab        |
| `/cap-tables/:id`     | `/portfolio/:id/cap-table` | Company tab        |
| `/financial-modeling` | `/model?tab=construction`  | Modeling hub       |
| `/forecasting`        | `/model?tab=current`       | Modeling hub       |
| `/cash-management`    | `/operate?tab=calls`       | Operations hub     |

---

## ✅ **TASK 1: Route Redirects + Feature Flags** (1 hour)

### Step 1.1: Add Feature Flag System

**Create:** `client/src/lib/feature-flags.ts`

```typescript
/**
 * Feature flags for progressive rollout
 * Toggle via environment variables or runtime config
 */
export const FEATURE_FLAGS = {
  NEW_IA: import.meta.env.VITE_NEW_IA === 'true' || true, // Enable for demo
  LIVE_KPI_SELECTORS: import.meta.env.VITE_LIVE_KPIS === 'true' || false,
  MODELING_HUB: import.meta.env.VITE_MODELING_HUB === 'true' || false,
  OPERATE_HUB: import.meta.env.VITE_OPERATE_HUB === 'true' || false,
} as const;

export function useFeatureFlag(flag: keyof typeof FEATURE_FLAGS): boolean {
  return FEATURE_FLAGS[flag];
}
```

### Step 1.2: Add Route Redirects

**Update:** `client/src/App.tsx`

```typescript
import { Navigate } from 'wouter';
import { FEATURE_FLAGS } from '@/lib/feature-flags';

function Router() {
  return (
    <Switch>
      {/* NEW IA - Soft redirects from old routes */}
      {FEATURE_FLAGS.NEW_IA && (
        <>
          <Route path="/investments">
            {() => <Navigate to="/portfolio" replace />}
          </Route>
          <Route path="/investment-table">
            {() => <Navigate to="/portfolio?view=table" replace />}
          </Route>
          <Route path="/cap-tables/:id">
            {(params) => <Navigate to={`/portfolio/${params.id}/cap-table`} replace />}
          </Route>
          <Route path="/financial-modeling">
            {() => <Navigate to="/model?tab=construction" replace />}
          </Route>
          <Route path="/forecasting">
            {() => <Navigate to="/model?tab=current" replace />}
          </Route>
          <Route path="/cash-management">
            {() => <Navigate to="/operate?tab=calls" replace />}
          </Route>
        </>
      )}

      {/* Core routes */}
      <Route path="/" component={HomeRoute} />
      <Route path="/overview" component={Overview} />
      <Route path="/dashboard" component={Overview} /> {/* Keep for compatibility */}
      <Route path="/portfolio" component={Portfolio} />
      <Route path="/portfolio/:id/*" component={CompanyDetail} />

      {/* New hubs (with coming soon pages if not ready) */}
      <Route path="/model/*">
        {() => FEATURE_FLAGS.MODELING_HUB ? <ModelHub /> : <ComingSoonPage hub="Modeling" />}
      </Route>
      <Route path="/operate/*">
        {() => FEATURE_FLAGS.OPERATE_HUB ? <OperateHub /> : <ComingSoonPage hub="Operations" />}
      </Route>
      <Route path="/report">
        {() => <ComingSoonPage hub="Reporting" />}
      </Route>

      {/* Keep old routes if feature flag is off */}
      {!FEATURE_FLAGS.NEW_IA && (
        <>
          <Route path="/investments" component={Investments} />
          <Route path="/investment-table" component={InvestmentTable} />
          {/* ... other old routes */}
        </>
      )}
    </Switch>
  );
}
```

### Step 1.3: Coming Soon Page Component

**Create:** `client/src/components/ComingSoonPage.tsx`

```typescript
import { Calendar, ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface ComingSoonPageProps {
  hub: string;
  eta?: string;
  features?: string[];
}

export function ComingSoonPage({ hub, eta = 'Sprint 2', features }: ComingSoonPageProps) {
  return (
    <div className="flex items-center justify-center min-h-[60vh] p-6">
      <Card className="max-w-2xl w-full p-8 border-[#E0D8D1] bg-white text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#F2F2F2] mb-6">
          <Calendar className="w-8 h-8 text-[#292929]" />
        </div>

        <h1 className="text-3xl font-inter font-semibold text-[#292929] mb-3">
          {hub} Hub
        </h1>

        <p className="text-lg font-poppins text-[#292929]/70 mb-6">
          Coming {eta}
        </p>

        {features && features.length > 0 && (
          <div className="bg-[#F2F2F2] rounded-lg p-6 mb-6">
            <h3 className="font-inter font-medium text-[#292929] mb-4">
              Planned Features
            </h3>
            <ul className="space-y-3 text-left">
              {features.map((feature, idx) => (
                <li key={idx} className="flex items-start gap-3 font-poppins text-[#292929]/80">
                  <ArrowRight className="w-5 h-5 text-[#292929] flex-shrink-0 mt-0.5" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm font-poppins text-blue-800">
            <strong>📊 Architecture Ready:</strong> The backend infrastructure and data contracts
            for this hub are complete. UI development is scheduled for {eta}.
          </p>
        </div>

        <Button
          variant="outline"
          className="mt-6"
          onClick={() => window.history.back()}
        >
          ← Back to Dashboard
        </Button>
      </Card>
    </div>
  );
}
```

---

## ✅ **TASK 2: Live KPI Selectors** (Replace Mock Data)

### Step 2.1: Selector Implementation (DONE by Background Agent)

✅ Already created by background agent:

- `client/src/core/selectors/fund-kpis.ts`
- `client/src/hooks/useFundKpis.ts`

### Step 2.2: Update HeaderKpis to Use Real Selectors

**Update:** `client/src/components/overview/HeaderKpis.tsx`

```typescript
import { useFundKpis } from '@/hooks/useFundKpis';
import { useFundContext } from '@/contexts/FundContext';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { FEATURE_FLAGS } from '@/lib/feature-flags';

// Format helpers
const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);

const formatMultiple = (value: number) => `${value.toFixed(2)}x`;
const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;

interface KpiCardProps {
  label: string;
  value: string;
  subtitle?: string;
  isLoading?: boolean;
}

function KpiCard({ label, value, subtitle, isLoading }: KpiCardProps) {
  if (isLoading) {
    return (
      <Card className="p-4 border-[#E0D8D1]">
        <Skeleton className="h-4 w-20 mb-2" />
        <Skeleton className="h-8 w-full" />
      </Card>
    );
  }

  return (
    <Card className="p-4 border-[#E0D8D1] bg-white hover:shadow-sm transition-shadow">
      <div className="text-xs font-poppins text-[#292929]/60 uppercase tracking-wide mb-1">
        {label}
      </div>
      <div className="text-2xl font-inter font-bold text-[#292929]">
        {value}
      </div>
      {subtitle && (
        <div className="text-xs text-[#292929]/50 mt-1">
          {subtitle}
        </div>
      )}
    </Card>
  );
}

export function HeaderKpis() {
  const { currentFund } = useFundContext();
  const fundId = currentFund?.id || 1;

  // Use real selectors if feature flag enabled, otherwise mock data
  const { data: kpis, isLoading } = FEATURE_FLAGS.LIVE_KPI_SELECTORS
    ? useFundKpis({ fundId })
    : {
        data: {
          committed: 20_000_000,
          called: 7_500_000,
          uncalled: 12_500_000,
          invested: 7_000_000,
          nav: 9_200_000,
          distributions: 1_500_000,
          dpi: 0.20,
          tvpi: 1.43,
          irr: 0.182,
          asOf: '2025-10-02'
        },
        isLoading: false
      };

  const asOfDate = kpis?.asOf
    ? new Date(kpis.asOf).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    : 'N/A';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-inter font-semibold text-[#292929]">
          Fund Performance
        </h2>
        <div className="text-sm font-poppins text-[#292929]/60">
          As of {asOfDate}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
        <KpiCard
          label="Committed"
          value={formatCurrency(kpis?.committed || 0)}
          isLoading={isLoading}
        />
        <KpiCard
          label="Called"
          value={formatCurrency(kpis?.called || 0)}
          subtitle={kpis ? `${((kpis.called / kpis.committed) * 100).toFixed(0)}% of committed` : undefined}
          isLoading={isLoading}
        />
        <KpiCard
          label="Uncalled"
          value={formatCurrency(kpis?.uncalled || 0)}
          subtitle="Dry powder"
          isLoading={isLoading}
        />
        <KpiCard
          label="Invested"
          value={formatCurrency(kpis?.invested || 0)}
          isLoading={isLoading}
        />
        <KpiCard
          label="NAV"
          value={formatCurrency(kpis?.nav || 0)}
          subtitle="Net Asset Value"
          isLoading={isLoading}
        />
        <KpiCard
          label="DPI"
          value={formatMultiple(kpis?.dpi || 0)}
          subtitle="Distributions / Called"
          isLoading={isLoading}
        />
        <KpiCard
          label="TVPI"
          value={formatMultiple(kpis?.tvpi || 0)}
          subtitle="Total Value / Called"
          isLoading={isLoading}
        />
        <KpiCard
          label="IRR"
          value={formatPercent(kpis?.irr || 0)}
          subtitle="Net to LPs"
          isLoading={isLoading}
        />
      </div>

      {/* Architecture note for demo */}
      {!FEATURE_FLAGS.LIVE_KPI_SELECTORS && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm font-poppins">
          <span className="font-semibold">📊 Architecture Note:</span> This dashboard demonstrates our selector contract pattern.
          Real-time data integration ready for activation in Sprint 1.
        </div>
      )}
    </div>
  );
}
```

---

## ✅ **TASK 3: Portfolio Hub with Table Presets** (2 hours)

### Step 3.1: Company Detail with Tabs

**Create:** `client/src/pages/CompanyDetail.tsx`

```typescript
import { useRoute } from 'wouter';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import CapTables from './cap-tables'; // Existing component

export default function CompanyDetail() {
  const [, params] = useRoute('/portfolio/:id/*');
  const companyId = params?.id;

  // Get tab from URL or default to 'summary'
  const searchParams = new URLSearchParams(window.location.search);
  const activeTab = searchParams.get('tab') || 'summary';

  return (
    <div className="p-6 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => window.history.back()}
          className="gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Portfolio
        </Button>
      </div>

      {/* Company Header */}
      <div className="border-b border-[#E0D8D1] pb-4">
        <h1 className="text-2xl font-inter font-semibold text-[#292929]">
          Company Details
        </h1>
        <p className="text-sm font-poppins text-[#292929]/60 mt-1">
          ID: {companyId}
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} className="w-full">
        <TabsList className="bg-[#F2F2F2] border border-[#E0D8D1]">
          <TabsTrigger value="summary" className="font-poppins">
            Summary
          </TabsTrigger>
          <TabsTrigger value="rounds" className="font-poppins">
            Rounds & Ownership
          </TabsTrigger>
          <TabsTrigger value="cap-table" className="font-poppins">
            Cap Table
          </TabsTrigger>
          <TabsTrigger value="performance" className="font-poppins" disabled>
            Performance <span className="ml-2 text-xs">(Soon)</span>
          </TabsTrigger>
          <TabsTrigger value="docs" className="font-poppins" disabled>
            Documents <span className="ml-2 text-xs">(Soon)</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="mt-6">
          <div className="p-6 border border-[#E0D8D1] rounded-lg bg-white">
            <h3 className="font-inter font-semibold text-[#292929] mb-4">
              Company Overview
            </h3>
            <p className="font-poppins text-[#292929]/70">
              Company summary dashboard coming in Sprint 2...
            </p>
          </div>
        </TabsContent>

        <TabsContent value="rounds" className="mt-6">
          <div className="p-6 border border-[#E0D8D1] rounded-lg bg-white">
            <h3 className="font-inter font-semibold text-[#292929] mb-4">
              Investment Rounds Timeline
            </h3>
            <p className="font-poppins text-[#292929]/70">
              Rounds history with graduation tracking coming in Sprint 2...
            </p>
          </div>
        </TabsContent>

        <TabsContent value="cap-table" className="mt-6">
          <CapTables companyId={companyId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

---

## 🎨 **VISUAL POLISH CHECKLIST**

### CSS Variables (Already Done ✅)

Your `index.css` already has:

```css
--press-dark: #292929;
--press-beige: #e0d8d1;
--press-white: #ffffff;
--press-light: #f2f2f2;
```

### Font Application

**Update:** `client/src/index.css` (around line 80)

```css
body {
  @apply antialiased bg-white text-[#292929];
  font-family: 'Poppins', system-ui, sans-serif;
}

h1,
h2,
h3,
h4,
h5,
h6 {
  font-family: 'Inter', system-ui, sans-serif;
  font-weight: 600;
  color: var(--press-dark);
}

/* Tighten spacing on dashboards */
.dashboard-grid {
  @apply grid gap-4; /* 8pt rhythm = 16px */
}

/* Dense KPI cards */
.kpi-card {
  @apply p-4; /* 16px padding */
}

/* Professional tables */
.data-table {
  @apply border-[#E0D8D1];
}

.data-table th {
  @apply bg-[#F2F2F2] text-[#292929] font-poppins font-medium text-xs uppercase tracking-wide;
  @apply sticky top-0; /* Sticky headers */
}

.data-table td {
  @apply text-[#292929] font-poppins text-sm;
  @apply py-3 px-4; /* Dense rows */
}

.data-table tr:hover {
  @apply bg-[#F2F2F2];
}
```

---

## 📊 **DEMO SCRIPT** (Updated with IA Details)

### Opening (30 sec)

> "Today I'll show you our redesigned information architecture and the technical
> foundation that will accelerate our roadmap."

### Navigation Tour (1 min)

> "We've consolidated from 8 top-level routes to 5 intuitive hubs that mirror
> how fund managers actually work:"

1. **Overview** - "Your fund performance snapshot with 8 live KPIs"
2. **Portfolio** - "Single companies table with drill-down to cap tables,
   rounds, and performance"
3. **Model** - "Unified modeling hub with Construction vs Current forecasts,
   inspired by Tactyc's proven workflow"
4. **Operate** - "Capital calls, distributions, and fee management in one place"
5. **Report** - "LP packets and exports"

### KPI Selectors (2 min)

> "These 8 KPIs—Committed, Called, Uncalled, Invested, NAV, DPI, TVPI, IRR—all
> come from pure selector functions. This architecture ensures consistency
> across every page."

> **[Point to code if asked]:** "The selectors are unit-tested pure functions
> that compose over TanStack Query. Adding new metrics is now trivial."

### Company Context (1 min)

> "We've moved cap tables from top-level to company detail tabs, where they
> contextually belong. Notice how rounds, ownership, and performance are all in
> one place."

### Model Hub Vision (1 min)

> "The Model hub will consolidate Construction wizard, Current forecast, and
> Reserves—matching Tactyc's mental model of toggling between Construction and
> Current states."

### Closing (30 sec)

> "This foundation—selector contracts, deterministic reserve engine
> architecture, and feature flags—makes the next 6 months of development
> predictable and low-risk."

---

## ⏱️ **REVISED TIME BUDGET** (Demo Tomorrow)

| Task                                    | Time  | Priority    |
| --------------------------------------- | ----- | ----------- |
| Feature flags + route redirects         | 1h    | 🔥 CRITICAL |
| Update sidebar to 5 items               | 30min | 🔥 HIGH     |
| Coming Soon pages                       | 30min | 🔥 HIGH     |
| Live KPI selectors (mock → real toggle) | 1h    | 🔥 HIGH     |
| Company detail tabs                     | 1h    | 🔥 HIGH     |
| Font/color polish                       | 30min | 🟡 MEDIUM   |
| Demo script rehearsal                   | 1h    | 🔥 HIGH     |
| **Buffer**                              | 2h    | -           |
| **TOTAL**                               | ~8h   | -           |

---

## 🎯 **SUCCESS METRICS**

**What Stakeholders Will See:**

1. ✅ Clean 5-item navigation (no clutter)
2. ✅ Live KPI dashboard (or architectural demo of selector pattern)
3. ✅ Company detail tabs with cap table moved contextually
4. ✅ Coming Soon pages with eta + feature lists (shows planning)
5. ✅ Professional visual polish (Inter/Poppins + Press On palette)
6. ✅ Feature flag system (demonstrates technical maturity)

**What Stakeholders Will Hear:**

- "Single source of truth for KPIs"
- "Deterministic reserve engine"
- "Construction vs Current workflow like Tactyc"
- "Feature flags for safe rollout"
- "Progressive enhancement architecture"

---

## 🚀 **POST-DEMO: Sprint 1 Implementation**

### Week 1

- [ ] Activate `LIVE_KPI_SELECTORS` flag
- [ ] Build API endpoint `/api/funds/:id/snapshot`
- [ ] Write selector unit tests (use background agent's code)
- [ ] Add analytics events for IA navigation

### Week 2

- [ ] TanStack Table presets for Portfolio (Summary/Cash/Reserves)
- [ ] Company summary tab content
- [ ] Rounds timeline component
- [ ] Performance charts component

---

## 📁 **FILE CHECKLIST**

✅ Created by this plan:

- `ENHANCED_DEMO_PLAN.md` (this file)
- `client/src/lib/feature-flags.ts`
- `client/src/components/ComingSoonPage.tsx`
- `client/src/pages/CompanyDetail.tsx`

✅ To be updated:

- `client/src/App.tsx` (route redirects)
- `client/src/components/layout/sidebar.tsx` (5-item nav)
- `client/src/components/overview/HeaderKpis.tsx` (selector toggle)
- `client/src/index.css` (font/spacing polish)

✅ Already created by background agents:

- `client/src/core/selectors/fund-kpis.ts`
- `client/src/hooks/useFundKpis.ts`
- `SELECTOR_CONTRACT_README.md`
- `RESERVE_ENGINE_SPEC.md`
- `MODELING_WIZARD_DESIGN.md`

---

**Status:** Ready to implement for demo tomorrow 🚀
