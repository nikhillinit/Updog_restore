---
status: ACTIVE
last_updated: 2026-01-19
---

# React Performance Optimization

## Overview

Use when encountering slow renders, excessive re-renders, bundle size issues, or
when building performance-critical React components. This skill provides
patterns for memoization, code splitting, and TanStack Query optimization
specific to this codebase.

## Triggers

Activate this skill when you see:
- "slow render" OR "re-render" OR "performance issue"
- "React.memo" OR "useMemo" OR "useCallback"
- "bundle size" OR "code splitting" OR "lazy load"
- "TanStack Query" OR "stale time" OR "cache"
- Component render counts > expected

## Core Principles

1. **Measure before optimizing** - Use React DevTools Profiler first
2. **Optimize the right thing** - Don't memoize cheap operations
3. **Prefer structural solutions** - Component composition over memoization
4. **Cache at boundaries** - TanStack Query for server state, React state for UI

## Memoization Patterns

### When to Use React.memo

**DO use React.memo when:**
```tsx
// Heavy child with stable parent
const ExpensiveChart = React.memo(({ data }: { data: ChartData }) => {
  // Complex rendering logic
  return <ResponsiveContainer>...</ResponsiveContainer>;
});

// List items that re-render frequently
const FundRow = React.memo(({ fund }: { fund: Fund }) => (
  <TableRow>...</TableRow>
));
```

**DON'T use React.memo when:**
- Component always receives new props (defeats purpose)
- Component is already fast (<1ms render)
- Props contain callbacks without useCallback

### useMemo Patterns

**Good use cases:**
```tsx
// Expensive computation
const sortedFunds = useMemo(() =>
  funds.sort((a, b) => b.tvpi - a.tvpi),
  [funds]
);

// Derived data from multiple sources
const portfolioMetrics = useMemo(() => ({
  totalNav: funds.reduce((sum, f) => sum + f.nav, 0),
  avgMoic: funds.reduce((sum, f) => sum + f.moic, 0) / funds.length,
}), [funds]);

// Reference stability for child components
const chartConfig = useMemo(() => ({
  xAxis: { dataKey: 'date' },
  yAxis: { domain: [0, 'auto'] },
}), []);
```

**Anti-patterns to avoid:**
```tsx
// BAD: Memoizing primitives
const name = useMemo(() => user.name, [user.name]); // Pointless

// BAD: Memoizing cheap operations
const doubled = useMemo(() => value * 2, [value]); // Overkill
```

### useCallback Patterns

**Required when passing to memoized children:**
```tsx
const handleFundSelect = useCallback((fundId: string) => {
  setSelectedFund(fundId);
  trackAnalytics('fund_selected', { fundId });
}, [trackAnalytics]);

// Pass to memoized list
<FundList onSelect={handleFundSelect} />
```

## Code Splitting Strategies

### Route-Level Splitting

```tsx
// pages/index.tsx - Lazy load heavy pages
const PortfolioPage = lazy(() => import('./PortfolioPage'));
const WaterfallPage = lazy(() => import('./WaterfallPage'));
const MonteCarloPage = lazy(() => import('./MonteCarloPage'));

// Wrap with Suspense
<Suspense fallback={<PageSkeleton />}>
  <Routes>
    <Route path="/portfolio" element={<PortfolioPage />} />
    <Route path="/waterfall" element={<WaterfallPage />} />
  </Routes>
</Suspense>
```

### Component-Level Splitting

```tsx
// Heavy components that aren't always visible
const ChartEditor = lazy(() => import('./ChartEditor'));
const ExportModal = lazy(() => import('./ExportModal'));

// Load on demand
{showEditor && (
  <Suspense fallback={<Spinner />}>
    <ChartEditor />
  </Suspense>
)}
```

### Library Splitting

```tsx
// Dynamic import for heavy libraries
const exportToExcel = async (data: ExportData) => {
  const xlsx = await import('xlsx');
  const workbook = xlsx.utils.book_new();
  // ...
};
```

## TanStack Query Optimization

### Stale Time Configuration

```tsx
// Static reference data - long stale time
const { data: fundTypes } = useQuery({
  queryKey: ['fund-types'],
  queryFn: fetchFundTypes,
  staleTime: 24 * 60 * 60 * 1000, // 24 hours
});

// Frequently changing data - short stale time
const { data: positions } = useQuery({
  queryKey: ['positions', fundId],
  queryFn: () => fetchPositions(fundId),
  staleTime: 30 * 1000, // 30 seconds
});

// Real-time data - always refetch
const { data: marketData } = useQuery({
  queryKey: ['market-data'],
  queryFn: fetchMarketData,
  staleTime: 0,
  refetchInterval: 5000,
});
```

### Query Key Patterns

```tsx
// Hierarchical keys for granular invalidation
const queryKeys = {
  funds: ['funds'] as const,
  fund: (id: string) => ['funds', id] as const,
  fundMetrics: (id: string) => ['funds', id, 'metrics'] as const,
  fundWaterfall: (id: string) => ['funds', id, 'waterfall'] as const,
};

// Invalidate all fund data
queryClient.invalidateQueries({ queryKey: queryKeys.funds });

// Invalidate specific fund only
queryClient.invalidateQueries({ queryKey: queryKeys.fund(fundId) });
```

### Prefetching Patterns

```tsx
// Prefetch on hover
const prefetchFund = (fundId: string) => {
  queryClient.prefetchQuery({
    queryKey: queryKeys.fund(fundId),
    queryFn: () => fetchFund(fundId),
    staleTime: 60 * 1000,
  });
};

<FundRow
  onMouseEnter={() => prefetchFund(fund.id)}
  onClick={() => navigate(`/funds/${fund.id}`)}
/>
```

## Performance Checklist

Before marking performance work complete:

- [ ] Measured with React DevTools Profiler
- [ ] Identified actual bottleneck (not guessing)
- [ ] Applied minimal fix (not over-optimizing)
- [ ] Verified improvement with profiler
- [ ] No regressions in other areas
- [ ] Bundle size impact checked (if code splitting)

## Project-Specific Patterns

### Waterfall Table Optimization

The waterfall table can have 100+ rows. Use:
```tsx
// Virtualized rendering for large tables
import { useVirtualizer } from '@tanstack/react-virtual';

const rowVirtualizer = useVirtualizer({
  count: waterfallRows.length,
  getScrollElement: () => tableRef.current,
  estimateSize: () => 48,
});
```

### Monte Carlo Chart Optimization

Monte Carlo simulations generate large datasets:
```tsx
// Downsample for display, full data for calculations
const displayData = useMemo(() =>
  simulationResults.length > 1000
    ? downsample(simulationResults, 1000)
    : simulationResults,
  [simulationResults]
);
```

## Related Skills

- test-pyramid - Performance test strategies
- react-hook-form-stability - Form performance
- baseline-governance - Bundle size baselines
