# Fund KPI Selector Contract System

Production-ready TypeScript implementation for calculating VC fund Key
Performance Indicators (KPIs) using pure selector functions and TanStack Query
integration.

## Overview

This system provides a clean, testable, and performant way to calculate fund
metrics:

- **8 Core KPIs**: Committed, Called, Uncalled, Invested, NAV, DPI, TVPI, IRR
- **Pure Functions**: All selectors are side-effect free and composable
- **Type-Safe**: Full TypeScript support with strict mode
- **Historical Snapshots**: "as of" date support for point-in-time analysis
- **TanStack Query**: Automatic caching, refetching, and state management
- **Comprehensive Tests**: 40+ test cases covering edge cases and scenarios

## Architecture

```
client/src/core/
├── types/
│   └── fund-domain.ts          # Domain type definitions
├── selectors/
│   ├── fund-kpis.ts            # Pure KPI selector functions
│   ├── xirr.ts                 # XIRR calculation (Newton-Raphson)
│   └── __tests__/
│       └── fund-kpis.test.ts   # Comprehensive test suite
└── hooks/
    └── useFundKpis.ts          # TanStack Query integration
```

## Quick Start

### Basic Usage

```typescript
import { useFundKpis } from '@/hooks/useFundKpis';

function FundDashboard({ fundId }: { fundId: number }) {
  const { data: kpis, isLoading, error } = useFundKpis({ fundId });

  if (isLoading) return <Spinner />;
  if (error) return <Error message={error.message} />;

  return (
    <div className="grid grid-cols-4 gap-4">
      <MetricCard
        label="Total Value"
        value={`${kpis.tvpi.toFixed(2)}x`}
        description={`$${(kpis.nav / 1e6).toFixed(1)}M NAV`}
      />
      <MetricCard
        label="Realized Returns"
        value={`${kpis.dpi.toFixed(2)}x`}
        description={`$${(kpis.distributions / 1e6).toFixed(1)}M distributed`}
      />
      <MetricCard
        label="IRR"
        value={`${(kpis.irr * 100).toFixed(1)}%`}
        description="Annualized return"
      />
      <MetricCard
        label="Deployment"
        value={`${((kpis.invested / kpis.committed) * 100).toFixed(1)}%`}
        description={`$${(kpis.uncalled / 1e6).toFixed(1)}M dry powder`}
      />
    </div>
  );
}
```

### Individual KPI Selectors

Use individual hooks for better performance when you only need specific KPIs:

```typescript
import { useTVPI, useDPI, useIRR } from '@/hooks/useFundKpis';

function KpiSummary({ fundId }: { fundId: number }) {
  const { data: tvpi } = useTVPI(fundId);
  const { data: dpi } = useDPI(fundId);
  const { data: irr } = useIRR(fundId);

  return (
    <div>
      <div>TVPI: {tvpi?.toFixed(2)}x</div>
      <div>DPI: {dpi?.toFixed(2)}x</div>
      <div>IRR: {(irr * 100)?.toFixed(1)}%</div>
    </div>
  );
}
```

### Historical Snapshots

Calculate KPIs as of a specific date:

```typescript
function QuarterlyPerformance({ fundId }: { fundId: number }) {
  const q1 = useFundKpis({ fundId, asOf: '2023-03-31' });
  const q2 = useFundKpis({ fundId, asOf: '2023-06-30' });
  const q3 = useFundKpis({ fundId, asOf: '2023-09-30' });
  const q4 = useFundKpis({ fundId, asOf: '2023-12-31' });

  const quarters = [q1, q2, q3, q4];

  return (
    <table>
      <thead>
        <tr>
          <th>Quarter</th>
          <th>TVPI</th>
          <th>DPI</th>
          <th>IRR</th>
        </tr>
      </thead>
      <tbody>
        {quarters.map((q, idx) => (
          <tr key={idx}>
            <td>Q{idx + 1}</td>
            <td>{q.data?.tvpi.toFixed(2)}x</td>
            <td>{q.data?.dpi.toFixed(2)}x</td>
            <td>{(q.data?.irr * 100).toFixed(1)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

### Direct Selector Usage (without hooks)

For server-side calculations or unit tests:

```typescript
import { selectAllKPIs } from '@/core/selectors/fund-kpis';
import type { FundData } from '@/core/types/fund-domain';

async function calculateFundMetrics(fundId: number): Promise<FundKPIs> {
  const fundData: FundData = await fetchFundData(fundId);
  return selectAllKPIs(fundData);
}

// Historical snapshot
async function getHistoricalKPIs(fundId: number, date: string) {
  const fundData = await fetchFundData(fundId);
  return selectAllKPIs(fundData, date);
}
```

## KPI Definitions

### 1. Committed Capital

Total capital commitments from LPs (fund size).

```typescript
const committed = selectCommitted(fundData);
// Example: $100,000,000
```

### 2. Called Capital

Capital drawn from LPs via capital calls.

```typescript
const called = selectCalled(fundData);
// Example: $65,000,000 (65% of commitments called)
```

### 3. Uncalled Capital (Dry Powder)

Remaining callable capital.

```typescript
const uncalled = selectUncalled(fundData);
// Formula: Committed - Called
// Example: $35,000,000 remaining
```

### 4. Invested Capital

Capital deployed into portfolio companies.

```typescript
const invested = selectInvested(fundData);
// Example: $50,000,000 (includes initial + follow-ons)
```

### 5. NAV (Net Asset Value)

Current portfolio value + cash - liabilities.

```typescript
const nav = selectNAV(fundData);
// Formula: Portfolio Value + (Called - Invested - Distributions - Fees)
// Example: $75,000,000
```

### 6. DPI (Distributions to Paid-In)

Cash-on-cash returns to LPs.

```typescript
const dpi = selectDPI(fundData);
// Formula: Total Distributions / Called Capital
// Example: 0.45x (45% of called capital returned)
```

### 7. TVPI (Total Value to Paid-In)

Total value creation (realized + unrealized).

```typescript
const tvpi = selectTVPI(fundData);
// Formula: (Distributions + NAV) / Called Capital
// Example: 1.75x (fund has created 1.75x value)
```

### 8. IRR (Internal Rate of Return)

Annualized time-weighted return.

```typescript
const irr = selectIRR(fundData);
// Uses XIRR with Newton-Raphson method
// Example: 0.285 (28.5% annualized return)
```

## XIRR Calculation

The IRR calculation uses the Newton-Raphson method to find the discount rate
that makes NPV = 0:

```typescript
import { calculateXIRR } from '@/core/selectors/xirr';

const cashFlows: CashFlowEvent[] = [
  { date: '2020-01-01', amount: -10_000_000, type: 'capital_call' },
  { date: '2021-06-15', amount: 2_000_000, type: 'distribution' },
  { date: '2023-12-31', amount: 15_000_000, type: 'distribution' },
];

const result = calculateXIRR(cashFlows);
console.log(`IRR: ${(result.rate * 100).toFixed(2)}%`);
console.log(`Converged in ${result.iterations} iterations`);
```

### XIRR Features

- **Newton-Raphson Method**: Fast convergence (typically < 10 iterations)
- **Excel Compatible**: Matches Excel's XIRR function
- **Configurable**: Max iterations, tolerance, initial guess
- **Error Handling**: Clear error messages for invalid inputs
- **Date Handling**: Supports irregular cash flow timing

## Advanced Usage

### Memoized Calculations

Use `useMemo` for expensive calculations in components:

```typescript
import { useMemo } from 'react';
import { useFundKpis } from '@/hooks/useFundKpis';

function PerformanceChart({ fundId }: { fundId: number }) {
  const { data: kpis } = useFundKpis({ fundId });

  // Memoize derived calculations
  const performanceMetrics = useMemo(() => {
    if (!kpis) return null;

    return {
      unrealizedGain: kpis.nav - kpis.invested,
      realizedGain: kpis.distributions - kpis.invested,
      totalGain: kpis.distributions + kpis.nav - kpis.invested,
      deploymentRate: kpis.invested / kpis.committed,
      cashEfficiency: kpis.invested / kpis.called,
    };
  }, [kpis]);

  if (!performanceMetrics) return null;

  return <Chart data={performanceMetrics} />;
}
```

### Custom Selectors

Build your own selectors by composing existing ones:

```typescript
import { selectNAV, selectInvested } from '@/core/selectors/fund-kpis';
import type { FundData } from '@/core/types/fund-domain';

// Custom selector: Unrealized MOIC
export function selectUnrealizedMOIC(data: FundData, asOf?: string): number {
  const nav = selectNAV(data, asOf);
  const invested = selectInvested(data, asOf);

  if (invested === 0) return 0;
  return nav / invested;
}

// Custom selector: Cash-on-Cash with fees
export function selectNetDPI(data: FundData, asOf?: string): number {
  const distributions = selectDistributions(data, asOf);
  const called = selectCalled(data, asOf);
  const fees = data.feeExpenses
    .filter(
      (f) => f.isPaid && (!asOf || new Date(f.expenseDate) <= new Date(asOf))
    )
    .reduce((sum, f) => sum + f.amount, 0);

  if (called === 0) return 0;
  return (distributions - fees) / called;
}
```

### Batch Processing

Calculate KPIs for multiple funds efficiently:

```typescript
import { selectAllKPIs } from '@/core/selectors/fund-kpis';

async function calculatePortfolioKPIs(fundIds: number[]) {
  const fundDataArray = await Promise.all(
    fundIds.map((id) => fetchFundData(id))
  );

  return fundDataArray.map((data, idx) => ({
    fundId: fundIds[idx],
    kpis: selectAllKPIs(data),
  }));
}
```

### Real-time Updates

Auto-refresh KPIs at regular intervals:

```typescript
function LiveKPIs({ fundId }: { fundId: number }) {
  const { data: kpis } = useFundKpis({
    fundId,
    refetchInterval: 60_000, // Refresh every minute
  });

  return (
    <div>
      <div>NAV: ${(kpis?.nav / 1e6).toFixed(2)}M</div>
      <div className="text-xs text-gray-500">
        Updated: {new Date(kpis?.calculatedAt).toLocaleTimeString()}
      </div>
    </div>
  );
}
```

### Conditional Fetching

Control when KPIs are calculated:

```typescript
function ConditionalKPIs({ fundId, enabled }: Props) {
  const { data: kpis, isLoading } = useFundKpis({
    fundId,
    enabled, // Only fetch when enabled is true
  });

  // Query won't run until enabled becomes true
  return isLoading ? <Skeleton /> : <KPIDisplay kpis={kpis} />;
}
```

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run with UI
npm run test:ui

# Run in watch mode
npm test -- --watch

# Run specific test file
npm test fund-kpis.test.ts
```

### Test Coverage

The test suite includes:

- ✅ Basic calculations for all 8 KPIs
- ✅ Historical snapshots with "as of" dates
- ✅ Edge cases (empty data, zero values, negative flows)
- ✅ Data validation and error handling
- ✅ XIRR convergence and accuracy
- ✅ Formatting utilities
- ✅ Integration scenarios

### Example Test

```typescript
import { describe, it, expect } from 'vitest';
import { selectTVPI } from '../fund-kpis';

describe('selectTVPI', () => {
  it('should calculate TVPI correctly', () => {
    const data = createFundData({
      capitalCalls: [{ amount: 10_000_000, status: 'received' }],
      distributions: [{ amount: 3_000_000 }],
      // ... NAV components that sum to 12_000_000
    });

    const tvpi = selectTVPI(data);
    // (3M distributions + 12M NAV) / 10M called = 1.5x
    expect(tvpi).toBe(1.5);
  });
});
```

## Performance Optimization

### 1. Selector Memoization

Selectors are pure functions - memoize them in React:

```typescript
const kpis = useMemo(() => selectAllKPIs(fundData, asOf), [fundData, asOf]);
```

### 2. Partial KPIs

Only calculate what you need:

```typescript
// ❌ Bad - calculates all KPIs
const { tvpi, dpi } = selectAllKPIs(data);

// ✅ Good - only calculates what's needed
const tvpi = selectTVPI(data);
const dpi = selectDPI(data);
```

### 3. Query Optimization

Configure TanStack Query for your use case:

```typescript
useFundKpis({
  fundId,
  staleTime: 5 * 60 * 1000, // 5 min before considering stale
  gcTime: 10 * 60 * 1000, // 10 min garbage collection
  refetchOnWindowFocus: false, // Don't refetch on focus
  refetchOnMount: false, // Don't refetch on mount if cached
});
```

### 4. Background Calculation

For expensive calculations, use Web Workers:

```typescript
// workers/kpi-worker.ts
import { selectAllKPIs } from '@/core/selectors/fund-kpis';

self.onmessage = (e) => {
  const { fundData, asOf } = e.data;
  const kpis = selectAllKPIs(fundData, asOf);
  self.postMessage(kpis);
};
```

## Error Handling

### Selector Errors

Selectors handle edge cases gracefully:

```typescript
// Returns 0 for division by zero
const dpi = selectDPI(data); // 0 if called capital is 0

// Returns 0 for insufficient data
const irr = selectIRR(data); // 0 if < 2 cash flows

// Uses cost basis when valuations missing
const nav = selectNAV(data); // Falls back to totalInvested
```

### XIRR Errors

XIRR throws specific errors:

```typescript
import { calculateXIRR, XIRRCalculationError } from '@/core/selectors/xirr';

try {
  const result = calculateXIRR(cashFlows);
} catch (error) {
  if (error instanceof XIRRCalculationError) {
    console.error('XIRR failed:', error.message);
    console.error('Cash flows:', error.cashFlows);
    console.error('Iterations:', error.iterations);
  }
}
```

### Query Errors

Handle query errors in components:

```typescript
function KPIDisplay({ fundId }: Props) {
  const { data: kpis, error, isError } = useFundKpis({ fundId });

  if (isError) {
    return (
      <Alert variant="error">
        Failed to load KPIs: {error.message}
      </Alert>
    );
  }

  return <div>{/* Display KPIs */}</div>;
}
```

## Type Safety

All types are exported for use in your application:

```typescript
import type {
  Fund,
  FundData,
  Investment,
  Valuation,
  CapitalCall,
  Distribution,
  FeeExpense,
  FundKPIs,
  CashFlowEvent,
} from '@/core/types/fund-domain';

import type {
  UseFundKpisOptions,
  UseKpiSelectorOptions,
} from '@/hooks/useFundKpis';
```

## API Integration

### Backend Endpoint

Create an endpoint that returns FundData:

```typescript
// server/routes/funds.ts
app.get('/api/funds/:fundId/data', async (req, res) => {
  const { fundId } = req.params;

  const [
    fund,
    investments,
    valuations,
    capitalCalls,
    distributions,
    feeExpenses,
  ] = await Promise.all([
    db.funds.findById(fundId),
    db.investments.findByFundId(fundId),
    db.valuations.findByFundId(fundId),
    db.capitalCalls.findByFundId(fundId),
    db.distributions.findByFundId(fundId),
    db.feeExpenses.findByFundId(fundId),
  ]);

  const fundData: FundData = {
    fund,
    investments,
    valuations,
    capitalCalls,
    distributions,
    feeExpenses,
  };

  res.json(fundData);
});
```

### Batch Endpoint

For multiple funds:

```typescript
app.post('/api/funds/batch', async (req, res) => {
  const { fundIds } = req.body;

  const fundDataArray = await Promise.all(
    fundIds.map((id) => fetchFundData(id))
  );

  res.json(fundDataArray);
});
```

## Migration Guide

### From Direct Calculations

**Before:**

```typescript
function calculateTVPI(fund: Fund) {
  const distributions = fund.distributions.reduce(
    (sum, d) => sum + d.amount,
    0
  );
  const nav = calculateNAV(fund);
  const called = fund.capitalCalls.reduce((sum, c) => sum + c.amount, 0);
  return (distributions + nav) / called;
}
```

**After:**

```typescript
import { selectTVPI } from '@/core/selectors/fund-kpis';

const tvpi = selectTVPI(fundData);
```

### From Redux Selectors

**Before:**

```typescript
const selectTVPI = createSelector(
  [selectFund, selectDistributions, selectNAV, selectCalled],
  (fund, distributions, nav, called) => {
    return (distributions + nav) / called;
  }
);
```

**After:**

```typescript
import { useTVPI } from '@/hooks/useFundKpis';

const { data: tvpi } = useTVPI(fundId);
```

## Best Practices

1. **Use Hooks in Components**: Always use `useFundKpis` or individual hooks in
   React components
2. **Direct Selectors for SSR**: Use `selectAllKPIs` directly in server-side
   code
3. **Memoize Derived State**: Wrap expensive calculations in `useMemo`
4. **Handle Loading States**: Always check `isLoading` before rendering
5. **Type Everything**: Use TypeScript types for better DX
6. **Test Edge Cases**: Include empty data, zero values in tests
7. **Document Assumptions**: Add comments for business logic
8. **Cache Appropriately**: Configure `staleTime` based on data freshness needs

## Troubleshooting

### "Division by zero" warnings

- Check that `selectCalled` returns > 0 before calculating multiples
- Selectors return 0 by default for invalid inputs

### XIRR not converging

- Verify cash flows have both positive and negative values
- Check dates are valid and in chronological order
- Adjust `maxIterations` or `tolerance` in config

### Stale data in UI

- Lower `staleTime` in query config
- Enable `refetchOnWindowFocus` for fresher data
- Use `refetchInterval` for real-time updates

### TypeScript errors

- Ensure all imports use correct paths (`@/core/...`)
- Check that FundData structure matches type definitions
- Update types if schema changes

## License

MIT

## Support

For questions or issues, please open a GitHub issue or contact the development
team.

---

**Version**: 1.0.0 **Last Updated**: 2024-01-15 **Maintainer**: VC Platform Team
