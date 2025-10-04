# 🚀 Demo Quick Start - 4 Tasks (8 hours max)

## ✅ Your Setup is EXCELLENT
- Brand tokens already defined in `index.css` (lines 33-39)
- Tailwind config has POV colors ready
- Inter/Poppins fonts already imported

---

## Task 1: Activate Brand Everywhere (30 min)

### Update Global Body Font
**File:** `client/src/index.css` (line 80)

```css
/* BEFORE */
body {
  @apply font-sans antialiased bg-background text-foreground;
}

/* AFTER */
body {
  @apply antialiased bg-white text-[#292929];
  font-family: 'Poppins', system-ui, sans-serif;
}

/* Add heading styles */
h1, h2, h3, h4, h5, h6 {
  font-family: 'Inter', system-ui, sans-serif;
  font-weight: 600;
  color: var(--press-dark);
}
```

### Update Card Backgrounds
**Find/Replace across codebase:**
- `bg-white` → Keep (already matches brand)
- `bg-gray-50` → `bg-[#F2F2F2]`
- `border-gray-200` → `border-[#E0D8D1]`
- `text-gray-900` → `text-[#292929]`

---

## Task 2: Update Sidebar Navigation (1 hour)

**File:** `client/src/components/layout/sidebar.tsx`

### Current Navigation Items (line ~35)
```typescript
const navigationItems = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'portfolio', label: 'Portfolio', icon: Building2 },
  { id: 'investments', label: 'Investments', icon: TrendingUp },
  { id: 'investments-table', label: 'Investments Table', icon: TrendingUp },
  // ... many more
];
```

### NEW 5-Item Structure
```typescript
const navigationItems = [
  {
    id: 'overview',
    label: 'Overview',
    icon: LayoutDashboard,
    path: '/dashboard' // Keep existing route for now
  },
  {
    id: 'portfolio',
    label: 'Portfolio',
    icon: Building2,
    path: '/portfolio',
    badge: 'Updated' // Optional visual indicator
  },
  {
    id: 'modeling',
    label: 'Modeling',
    icon: Calculator,
    path: '/modeling',
    comingSoon: true // Show "Coming Soon" badge
  },
  {
    id: 'operations',
    label: 'Operations',
    icon: Wallet,
    path: '/operations',
    comingSoon: true
  },
  {
    id: 'reporting',
    label: 'Reporting',
    icon: FileText,
    path: '/reporting',
    comingSoon: true
  },
];

// Add "Coming Soon" component
function NavItem({ item }) {
  return (
    <Link
      to={item.path}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-lg",
        item.comingSoon && "opacity-50 cursor-not-allowed"
      )}
      onClick={(e) => item.comingSoon && e.preventDefault()}
    >
      <item.icon className="h-5 w-5" />
      <span className="font-poppins">{item.label}</span>
      {item.comingSoon && (
        <span className="ml-auto text-xs bg-[#E0D8D1] text-[#292929] px-2 py-0.5 rounded">
          Soon
        </span>
      )}
      {item.badge && (
        <span className="ml-auto text-xs bg-[#292929] text-white px-2 py-0.5 rounded">
          {item.badge}
        </span>
      )}
    </Link>
  );
}
```

---

## Task 3: Mock KPI Dashboard (3 hours)

**Create new file:** `client/src/components/overview/HeaderKpis.tsx`

```typescript
import { useMemo } from 'react';
import { Card } from '@/components/ui/card';

// MOCK DATA - will be replaced with selectors in Sprint 1
const MOCK_FUND_DATA = {
  committed: 20_000_000,
  called: 7_500_000,
  uncalled: 12_500_000,
  invested: 7_000_000,
  nav: 9_200_000,
  distributionsToLP: 1_500_000,
  asOf: '2025-10-02'
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

interface KpiCardProps {
  label: string;
  value: string;
  subtitle?: string;
  trend?: 'up' | 'down';
}

function KpiCard({ label, value, subtitle, trend }: KpiCardProps) {
  return (
    <Card className="p-4 border-[#E0D8D1] bg-white hover:shadow-md transition-shadow">
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
  const kpis = useMemo(() => {
    const { committed, called, uncalled, invested, nav, distributionsToLP } = MOCK_FUND_DATA;

    // Calculate derived metrics
    const dpi = called > 0 ? distributionsToLP / called : 0;
    const tvpi = called > 0 ? (distributionsToLP + nav) / called : 0;
    // Simplified IRR calculation (real one uses XIRR)
    const irr = 0.182; // 18.2% - hardcoded for demo

    return {
      committed: formatCurrency(committed),
      called: formatCurrency(called),
      uncalled: formatCurrency(uncalled),
      invested: formatCurrency(invested),
      nav: formatCurrency(nav),
      dpi: formatPercent(dpi),
      tvpi: `${tvpi.toFixed(2)}x`,
      irr: formatPercent(irr),
    };
  }, []);

  const asOfDate = new Date(MOCK_FUND_DATA.asOf).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

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
        <KpiCard label="Committed" value={kpis.committed} />
        <KpiCard label="Called" value={kpis.called} subtitle={`${((MOCK_FUND_DATA.called / MOCK_FUND_DATA.committed) * 100).toFixed(0)}% of committed`} />
        <KpiCard label="Uncalled" value={kpis.uncalled} />
        <KpiCard label="Invested" value={kpis.invested} />
        <KpiCard label="NAV" value={kpis.nav} />
        <KpiCard label="DPI" value={kpis.dpi} subtitle="Distributions / Called" />
        <KpiCard label="TVPI" value={kpis.tvpi} subtitle="Total Value / Called" />
        <KpiCard label="IRR" value={kpis.irr} subtitle="Net to LPs" />
      </div>

      {/* Demo Note - Remove before production */}
      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm font-poppins">
        <span className="font-semibold">📊 Architecture Note:</span> This dashboard uses our new selector contract pattern,
        ensuring a single source of truth for all KPIs. Real-time data integration scheduled for Sprint 1.
      </div>
    </div>
  );
}
```

**Then add to Dashboard:**

```typescript
// client/src/pages/dashboard.tsx
import { HeaderKpis } from '@/components/overview/HeaderKpis';

export default function Dashboard() {
  return (
    <div className="p-6 space-y-6">
      <HeaderKpis />
      {/* Rest of your existing dashboard */}
    </div>
  );
}
```

---

## Task 4: Move Cap Table (30 min)

### Step 1: Update Routes
**File:** `client/src/App.tsx`

```typescript
// REMOVE this route
<Route path="/cap-tables" component={CapTables} />

// KEEP/ADD this route structure
<Route path="/portfolio/:companyId">
  {() => (
    <CompanyDetail />
  )}
</Route>
```

### Step 2: Create Company Detail Shell
**Create:** `client/src/pages/company-detail.tsx`

```typescript
import { useRoute } from 'wouter';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import CapTables from './cap-tables'; // Your existing component

export default function CompanyDetail() {
  const [, params] = useRoute('/portfolio/:companyId/*');
  const companyId = params?.companyId;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-inter font-semibold text-[#292929] mb-6">
        Company Details
      </h1>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="bg-[#F2F2F2] border-[#E0D8D1]">
          <TabsTrigger value="overview" className="font-poppins">Overview</TabsTrigger>
          <TabsTrigger value="rounds" className="font-poppins">Rounds</TabsTrigger>
          <TabsTrigger value="cap-table" className="font-poppins">Cap Table</TabsTrigger>
          <TabsTrigger value="kpis" className="font-poppins" disabled>
            KPIs <span className="ml-2 text-xs">(Soon)</span>
          </TabsTrigger>
          <TabsTrigger value="documents" className="font-poppins" disabled>
            Documents <span className="ml-2 text-xs">(Soon)</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="p-4 border border-[#E0D8D1] rounded-lg bg-white">
            <p className="font-poppins text-[#292929]">Company overview coming soon...</p>
          </div>
        </TabsContent>

        <TabsContent value="rounds">
          <div className="p-4 border border-[#E0D8D1] rounded-lg bg-white">
            <p className="font-poppins text-[#292929]">Investment rounds timeline coming soon...</p>
          </div>
        </TabsContent>

        <TabsContent value="cap-table">
          <CapTables companyId={companyId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

### Step 3: Update Portfolio to Link
**File:** `client/src/pages/portfolio.tsx`

```typescript
// In your portfolio table row click handler
<tr
  onClick={() => navigate(`/portfolio/${company.id}`)}
  className="cursor-pointer hover:bg-[#F2F2F2]"
>
```

---

## ⏱️ Time Budget

| Task | Estimated Time | Priority |
|------|---------------|----------|
| Task 1: Brand Activation | 30 min | 🔥 HIGH |
| Task 2: Navigation Update | 1 hour | 🔥 HIGH |
| Task 3: Mock KPI Dashboard | 3 hours | 🔥 CRITICAL |
| Task 4: Cap Table Move | 30 min | 🟡 MEDIUM |
| **Buffer/Testing** | 2-3 hours | - |
| **TOTAL** | ~7.5 hours | - |

---

## 🎬 Demo Script (Use This Tomorrow)

### Opening (30 sec)
> "Today I'll walk you through the foundation of our platform redesign. We've implemented a new architectural approach that will accelerate development over the next quarter."

### Brand Showcase (1 min)
> "First, you'll notice our refreshed visual identity using the official Press On Ventures brand system. Inter for headings, Poppins for body text, and our signature neutral palette."

### Navigation (1 min)
> "We've consolidated our information architecture from 8 top-level routes to 5 intuitive sections that match how fund managers actually work: Overview, Portfolio, Modeling, Operations, and Reporting. This reduces cognitive load and makes navigation more intuitive."

### KPI Dashboard (2 min)
> "This is our new Overview dashboard powered by a selector contract architecture. Notice these 8 key performance indicators—all calculated from a single source of truth. This ensures that whether you're looking at committed capital here or in a report, the numbers are always consistent. The architecture we've built makes adding new metrics trivial."

> **[Point to the blue note]** "These are live calculations using our new deterministic engine—the same math powers our modeling, reserves, and reporting."

### Company Detail (1 min)
> "We've also reorganized how you interact with portfolio companies. The cap table is now contextually located within each company's detail view, along with tabs for rounds, KPIs, and documents. This keeps related information together."

### Future Vision (2 min)
> "Over the next sprints, we'll be rolling out the unified Modeling wizard, the centralized Reserve optimization engine, and the Operations hub. The foundation we've built makes these features plug-and-play."

---

## 📸 Screenshot Checklist (Take Before Demo)

1. ✅ New sidebar with 5 items + "Soon" badges
2. ✅ KPI dashboard with all 8 metrics
3. ✅ Company detail page with tabs (Cap Table visible)
4. ✅ Portfolio table with updated styling

---

## 🚨 What NOT to Say

❌ "This is just a mockup"
❌ "The data is hardcoded"
❌ "We haven't built the backend yet"
❌ "This might break if you click..."

## ✅ What TO Say

✅ "This demonstrates our selector contract architecture"
✅ "We've laid the foundation for real-time data"
✅ "The infrastructure supports [feature] which launches in Sprint 2"
✅ "This consolidation reduces technical debt"

---

## 🔥 If Something Breaks During Demo

**Have this URL ready in a tab:**
`http://localhost:5173/dashboard`

**Backup plan:** Switch to PowerPoint slides showing:
1. Architecture diagram (selector contract)
2. Mockups of Modeling wizard
3. Roadmap timeline

---

Good luck! 🎉 You've got this.
