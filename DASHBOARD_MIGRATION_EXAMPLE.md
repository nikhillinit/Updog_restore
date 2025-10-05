# Dashboard Migration Example

This document shows exactly how to migrate `dashboard-modern.tsx` from hardcoded metrics to the Unified Metrics Layer.

## Before (Hardcoded Metrics) ❌

```tsx
// client/src/pages/dashboard-modern.tsx (OLD - Lines 84-94)

export default function ModernDashboard() {
  const { currentFund, isLoading } = useFundContext();
  const [timeframe, setTimeframe] = useState('12m');
  const [activeView, setActiveView] = useState('overview');

  // ❌ HARDCODED MOCK DATA - Different values in every component!
  const fundMetrics = {
    totalCommitted: currentFund.size || 125000000,  // Inconsistent source
    totalInvested: 85000000,                        // Hardcoded
    totalValue: 240000000,                          // Hardcoded
    irr: 28.5,                                      // Hardcoded
    moic: 2.82,                                     // Hardcoded
    dpi: 0.85,                                      // Hardcoded
    activeInvestments: 24,                          // Hardcoded
    exitedInvestments: 8,                           // Hardcoded
    deploymentRate: 68                              // Hardcoded
  };

  // Later in component...
  <p className="text-3xl">${(fundMetrics.totalValue / 1000000).toFixed(1)}M</p>
  <p className="text-3xl">{fundMetrics.irr}%</p>
  <p className="text-3xl">{fundMetrics.moic.toFixed(2)}x MOIC</p>
}
```

## After (Unified Metrics) ✅

```tsx
// client/src/pages/dashboard-modern.tsx (NEW)

import { useFundMetrics } from '@/hooks/useFundMetrics';
import { MetricsCard } from '@/components/metrics';
import { DollarSign, TrendingUp, Target, Users } from 'lucide-react';

export default function ModernDashboard() {
  const { currentFund } = useFundContext();
  const [timeframe, setTimeframe] = useState('12m');
  const [activeView, setActiveView] = useState('overview');

  // ✅ UNIFIED METRICS - Single source of truth
  const { data: metrics, isLoading, error } = useFundMetrics();

  // Handle loading state
  if (isLoading || !currentFund) {
    return (
      <div className="min-h-screen bg-pov-gray">
        <POVBrandHeader
          title="Dashboard"
          subtitle="Real-time fund performance and portfolio analytics"
          variant="light"
        />
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="animate-pulse space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-32 bg-pov-white rounded-lg shadow-card"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Handle error state
  if (error) {
    return (
      <div className="min-h-screen bg-pov-gray p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Failed to load metrics: {error.message}</p>
        </div>
      </div>
    );
  }

  // Handle no data
  if (!metrics) return null;

  // ✅ Destructure metrics for easy access
  const { actual, projected, target, variance } = metrics;

  return (
    <div className="min-h-screen bg-slate-100">
      <POVBrandHeader
        title="Dashboard"
        subtitle="Real-time fund performance and portfolio analytics"
        variant="light"
      />

      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* Top Controls */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          {/* ... existing tabs and controls ... */}
        </div>

        <Tabs value={activeView} className="space-y-8">

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-8">

            {/* ✅ NEW: Key Metrics Cards with Unified Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

              {/* Total Value Card */}
              <MetricsCard
                title="Total Value"
                description="Current portfolio valuation"
                actual={actual.totalValue}
                projected={projected.expectedTVPI * actual.totalCalled}
                target={target.targetTVPI * target.targetFundSize}
                format="currency"
                showVariance={true}
                icon={<DollarSign className="h-5 w-5 text-pov-charcoal" />}
                asOfDate={actual.asOfDate}
                status={variance.tvpiVariance.varianceVsTarget > 0 ? 'above' :
                        variance.tvpiVariance.varianceVsTarget < 0 ? 'below' : 'on-track'}
              />

              {/* IRR Card */}
              <MetricsCard
                title="Net IRR"
                description="Internal Rate of Return to LPs"
                actual={actual.irr}
                projected={projected.expectedIRR}
                target={target.targetIRR}
                format="percentage"
                showVariance={true}
                icon={<TrendingUp className="h-5 w-5 text-pov-success" />}
                asOfDate={actual.asOfDate}
                status={variance.performanceVariance.status}
              />

              {/* Deployment Card */}
              <MetricsCard
                title="Capital Deployed"
                description={`${actual.deploymentRate.toFixed(0)}% of fund deployed`}
                actual={actual.totalDeployed}
                target={target.targetFundSize}
                format="currency"
                showVariance={true}
                icon={<Target className="h-5 w-5 text-pov-charcoal" />}
                asOfDate={actual.asOfDate}
                status={variance.deploymentVariance.status}
              />

              {/* Portfolio Card */}
              <MetricsCard
                title="Active Companies"
                description={`${actual.exitedCompanies} exited`}
                actual={actual.activeCompanies}
                target={target.targetCompanyCount}
                format="number"
                showVariance={true}
                icon={<Users className="h-5 w-5 text-pov-charcoal" />}
                asOfDate={actual.asOfDate}
                status={variance.portfolioVariance.onTrack ? 'on-track' : 'behind'}
              />
            </div>

            {/* Charts Section - Using Real Data */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

              {/* Portfolio Value Trend */}
              <PremiumCard
                title="Portfolio Value Trend"
                subtitle="Actual vs Projected NAV progression"
                className="lg:col-span-2"
              >
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={buildChartData(projected.projectedNAV, actual)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E0D8D1" opacity={0.3} />
                      <XAxis dataKey="quarter" stroke="#666" fontSize={12} />
                      <YAxis stroke="#666" fontSize={12} tickFormatter={(value) => `$${value/1000000}M`} />
                      <Tooltip
                        formatter={(value) => [`$${(value/1000000).toFixed(1)}M`, 'Portfolio Value']}
                        contentStyle={{
                          backgroundColor: '#FFFFFF',
                          border: '1px solid #E0D8D1',
                          borderRadius: '8px',
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="#292929"
                        fill="url(#gradient)"
                        strokeWidth={3}
                      />
                      <defs>
                        <linearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#292929" stopOpacity={0.2}/>
                          <stop offset="100%" stopColor="#E0D8D1" stopOpacity={0.1}/>
                        </linearGradient>
                      </defs>
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </PremiumCard>

              {/* Sector Allocation - Keep existing chart */}
              {/* ... */}
            </div>
          </TabsContent>

          {/* Other tabs remain largely the same but use metrics.actual values */}
        </Tabs>
      </div>
    </div>
  );
}

// ✅ Helper function to build chart data from projections
function buildChartData(projectedNAV: number[], actual: any) {
  // Combine historical actuals with future projections
  return projectedNAV.map((value, index) => ({
    quarter: `Q${index + 1}`,
    value,
    isProjection: index > 0, // First quarter is actual
  }));
}
```

## Key Changes Summary

### 1. Imports
```tsx
// Added
import { useFundMetrics } from '@/hooks/useFundMetrics';
import { MetricsCard } from '@/components/metrics';
```

### 2. Hook Usage
```tsx
// Replaced hardcoded object with hook
const { data: metrics, isLoading, error } = useFundMetrics();
const { actual, projected, target, variance } = metrics || {};
```

### 3. Loading States
```tsx
// Added proper loading state (was missing)
if (isLoading || !currentFund) {
  return <SkeletonDashboard />;
}

// Added error state (was missing)
if (error) {
  return <ErrorMessage error={error} />;
}
```

### 4. Components
```tsx
// Replaced custom cards with MetricsCard
<PremiumCard>
  <p className="text-3xl">${(fundMetrics.totalValue / 1000000).toFixed(1)}M</p>
  <p className="text-xs">{fundMetrics.moic.toFixed(2)}x MOIC</p>
</PremiumCard>

// Became:
<MetricsCard
  title="Total Value"
  actual={actual.totalValue}
  projected={projected.expectedTVPI * actual.totalCalled}
  format="currency"
  showVariance={true}
  icon={<DollarSign />}
  asOfDate={actual.asOfDate}
/>
```

### 5. Variance Indicators
```tsx
// Before: Just showed the number
<Badge>+15.2%</Badge>

// After: Shows actual vs target with context
<MetricsCard
  showVariance={true}
  status={variance.performanceVariance.status}
/>
// Automatically displays: "↑ 15.2% vs target"
```

## Benefits of Migration

✅ **No more hardcoded values** - ESLint will prevent this
✅ **Consistent across views** - Same API used by Portfolio, Cash Management
✅ **Type safety** - TypeScript catches errors
✅ **Variance visibility** - Users see if they're ahead/behind targets
✅ **Source transparency** - Tooltip shows "Source: Database, As of: 2025-10-04"
✅ **Loading states** - Proper UX during data fetch
✅ **Error handling** - Graceful degradation

## Testing Checklist

After migration, verify:

- [ ] Dashboard loads without errors
- [ ] Metrics display correctly (not NaN or undefined)
- [ ] Loading skeleton appears during fetch
- [ ] Error message appears if API fails
- [ ] Variance badges show correct colors/directions
- [ ] Values match Portfolio page (consistency check)
- [ ] Performance: Dashboard loads in < 2 seconds
- [ ] No ESLint errors about hardcoded metrics

## Next: Portfolio Migration

The Portfolio page (`portfolio-modern.tsx`) follows the same pattern:

1. Remove hardcoded `portfolioCompanies` array
2. Fetch real data from `/api/portfolio-companies?fundId=${fundId}`
3. Use `useFundMetrics()` for summary cards
4. Replace mock metrics with `actual.*` values

See `UNIFIED_METRICS_IMPLEMENTATION.md` for full guide.
