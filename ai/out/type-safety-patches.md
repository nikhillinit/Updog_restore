# Type Safety Patches - Ready to Apply

## Patch 1: Fix Readonly Array Compatibility in Query Keys

**File:** `client/src/lib/query-keys.ts`

**Lines to modify:** 66, 75, 84

```typescript
// BEFORE
export const invalidationPredicates = {
  fund: (fundId: number) => (query: { queryKey: unknown[] }) => {
    return Array.isArray(query.queryKey) &&
           query.queryKey.includes('funds') &&
           query.queryKey.includes(fundId);
  },

  allFunds: (query: { queryKey: unknown[] }) => {
    return Array.isArray(query.queryKey) &&
           query.queryKey[0] === 'app' &&
           query.queryKey[1] === 'funds';
  },

  allInvestments: (query: { queryKey: unknown[] }) => {
    return Array.isArray(query.queryKey) &&
           query.queryKey[0] === 'app' &&
           query.queryKey[1] === 'investments';
  },
};

// AFTER
export const invalidationPredicates = {
  /**
   * Invalidate all queries for a specific fund
   */
  fund: (fundId: number) => (query: { queryKey: readonly unknown[] }) => {
    return Array.isArray(query.queryKey) &&
           query.queryKey.includes('funds') &&
           query.queryKey.includes(fundId);
  },

  /**
   * Invalidate all fund-related queries
   */
  allFunds: (query: { queryKey: readonly unknown[] }) => {
    return Array.isArray(query.queryKey) &&
           query.queryKey[0] === 'app' &&
           query.queryKey[1] === 'funds';
  },

  /**
   * Invalidate all investment-related queries
   */
  allInvestments: (query: { queryKey: readonly unknown[] }) => {
    return Array.isArray(query.queryKey) &&
           query.queryKey[0] === 'app' &&
           query.queryKey[1] === 'investments';
  },
};
```

**Impact:** Fixes 3 TypeScript errors in useInvalidateQueries.ts

---

## Patch 2: Simplify invalidateMetrics Using Hierarchical Invalidation

**File:** `client/src/hooks/useInvalidateQueries.ts`

**Lines to modify:** 26-34

```typescript
// BEFORE
invalidateMetrics: (fundId: number) => {
  return queryClient.invalidateQueries({
    queryKey: queryKeys.funds.detail(fundId),
    predicate: (query) => {
      return Array.isArray(query.queryKey) &&
             query.queryKey.includes('metrics');
    },
  });
},

// AFTER
/**
 * Invalidate only metrics for a specific fund
 */
invalidateMetrics: (fundId: number) => {
  // Use hierarchical invalidation - matches all queries starting with this prefix
  return queryClient.invalidateQueries({
    queryKey: [...queryKeys.funds.detail(fundId), 'metrics'],
  });
},
```

**Impact:** Simpler, type-safe, leverages TanStack Query's built-in features

---

## Patch 3: Fix Decimal.js Type Inference

**File:** `client/src/lib/decimal-utils.ts`

**Lines to modify:** 122-127, 137-147

```typescript
// BEFORE
export function sum(values: (Decimal | number)[]): Decimal {
  return values.reduce(
    (total, value) => total.plus(value),
    new Decimal(0)
  );
}

export function cumulativeSum(values: (Decimal | number)[]): Decimal[] {
  const result: Decimal[] = [];
  let cumulative = new Decimal(0);

  for (const value of values) {
    cumulative = cumulative.plus(value);
    result.push(cumulative);
  }

  return result;
}

// AFTER
/**
 * Sum an array of Decimal or number values
 *
 * @example
 * sum([1, 2, 3]) // => Decimal(6)
 * sum([new Decimal('0.1'), new Decimal('0.2')]) // => Decimal(0.3)
 */
export function sum(values: readonly (Decimal | number)[]): Decimal {
  return values.reduce(
    (total: Decimal, value: Decimal | number) => total.plus(value),
    new Decimal(0)
  );
}

/**
 * Calculate cumulative sum of array
 *
 * Returns array of same length with cumulative sums
 *
 * @example
 * cumulativeSum([1, 2, 3]) // => [Decimal(1), Decimal(3), Decimal(6)]
 */
export function cumulativeSum(values: readonly (Decimal | number)[]): Decimal[] {
  const result: Decimal[] = [];
  let cumulative = new Decimal(0);

  for (const value of values) {
    cumulative = cumulative.plus(value);
    result.push(cumulative);
  }

  return result;
}
```

**Impact:** Fixes type inference errors, adds readonly array support

---

## Patch 4: Add Index Signatures to Chart Data Interfaces

### 4.1 Investment Breakdown Chart

**File:** `client/src/components/charts/investment-breakdown-chart.tsx`

**Lines to modify:** 13-18, 82, 100

```typescript
// BEFORE
interface SectorData {
  name: string;
  value: number;
  color: string;
  amount?: number;
}

// Line 82
{data.map((entry: any, index: any) => (
  <Cell key={`cell-${index}`} fill={entry.color} />
))}

// Line 100
{data.map((sector: any, index: any) => (

// AFTER
interface SectorData {
  name: string;
  value: number;
  color: string;
  amount?: number;
  [key: string]: unknown;
}

// Line 82
{data.map((entry: SectorData, index: number) => (
  <Cell key={`cell-${index}`} fill={entry.color} />
))}

// Line 100
{data.map((sector: SectorData, index: number) => (
```

### 4.2 Portfolio Concentration

**File:** `client/src/components/dashboard/portfolio-concentration.tsx`

**Lines to modify:** 74-79, 123, 133, 218, 245, 251

```typescript
// BEFORE
interface ConcentrationData {
  name: string;
  value: number;
  companies: number;
  color: string;
}

// AFTER
interface ConcentrationData {
  name: string;
  value: number;
  companies: number;
  color: string;
  [key: string]: unknown;
}

// Line 123
{data.map((entry: any, index: any) => (
// CHANGE TO:
{data.map((entry: ConcentrationData, index: number) => (

// Line 133
{data.map((entry: any, index: any) => (
// CHANGE TO:
{data.map((entry: ConcentrationData, index: number) => (

// Line 218
{['sector', 'stage', 'geography', 'ownership', 'checksize', 'company'].map((tab: any) => (
// CHANGE TO:
{(['sector', 'stage', 'geography', 'ownership', 'checksize', 'company'] as const).map((tab: string) => (

// Line 245
{getTabData(activeTab).reduce((sum: any, item: any) => sum + item.companies, 0)}
// CHANGE TO:
{getTabData(activeTab).reduce((sum: number, item: ConcentrationData) => sum + item.companies, 0)}

// Line 251
{(getTabData(activeTab).slice(0, 3).reduce((sum: any, item: any) => sum + item.value, 0)).toFixed(1)}%
// CHANGE TO:
{(getTabData(activeTab).slice(0, 3).reduce((sum: number, item: ConcentrationData) => sum + item.value, 0)).toFixed(1)}%
```

### 4.3 Portfolio Insights

**File:** `client/src/components/forecasting/portfolio-insights.tsx`

**Lines to modify:** 19-24, 26-29, 85, 118, 128

```typescript
// BEFORE
interface CoInvestorData {
  name: string;
  amount: number;
  deals: number;
  color: string;
}

interface SectorMOIC {
  sector: string;
  moic: number;
}

// AFTER
interface CoInvestorData {
  name: string;
  amount: number;
  deals: number;
  color: string;
  [key: string]: unknown;
}

interface SectorMOIC {
  sector: string;
  moic: number;
  [key: string]: unknown;
}

// Line 85
const totalInvested = coInvestorData.reduce((sum: any, item: any) => sum + item.amount, 0);
// CHANGE TO:
const totalInvested = coInvestorData.reduce((sum: number, item: CoInvestorData) => sum + item.amount, 0);

// Line 118
{coInvestorData.map((entry: any, index: any) => (
// CHANGE TO:
{coInvestorData.map((entry: CoInvestorData, index: number) => (

// Line 128
{coInvestorData.map((investor: any, index: any) => (
// CHANGE TO:
{coInvestorData.map((investor: CoInvestorData, index: number) => (
```

---

## Patch 5: Fix Undefined Arithmetic in Nivo Allocation Pie

**File:** `client/src/components/charts/nivo-allocation-pie.tsx`

**Lines to modify:** 25-40, 48-54, 69-72, 77

```typescript
// BEFORE (Line 25-40)
const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0]!;
    const total = payload[0]!.payload.total || 0;
    const percentage = total > 0 ? ((data.value / total) * 100).toFixed(1) : '0';

// AFTER
interface TooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    payload: {
      name: string;
      value: number;
      total: number;
      fill: string;
    };
  }>;
}

const CustomTooltip = ({ active, payload }: TooltipProps) => {
  if (active && payload && payload.length) {
    const data = payload[0]!;
    const total = payload[0]!.payload.total || 0;
    const value = data.value ?? 0;
    const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0';

// Line 48-54
const total = data.reduce((sum: any, item: any) => sum + item.value, 0);
const chartData = data.map((item: any, index: any) => ({
  name: item.label,
  value: item.value,
  total: total,
  fill: item.color || COLORS[index % COLORS.length]
}));

// CHANGE TO:
const total = data.reduce((sum: number, item: AllocationData) => sum + item.value, 0);
const chartData = data.map((item: AllocationData, index: number) => ({
  name: item.label,
  value: item.value,
  total: total,
  fill: item.color || COLORS[index % COLORS.length]
}));

// Line 69-72
label={({ name, value }) => {
  const percentage = value ? ((value / total) * 100).toFixed(1) : '0';
  return `${name}: ${percentage}%`;
}}

// CHANGE TO:
label={({ name, value = 0 }) => {
  const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
  return `${name}: ${percentage}%`;
}}

// Line 77
{chartData.map((entry: any, index: any) => (
// CHANGE TO:
{chartData.map((entry, index: number) => (
```

---

## Verification Steps

After applying all patches:

1. **Type check:**
   ```bash
   npm run check
   ```
   Should show 0 errors in these files.

2. **Build:**
   ```bash
   npm run build
   ```
   Should complete without type errors.

3. **Runtime test:**
   ```bash
   npm run dev
   ```
   Navigate to pages using these components and verify charts render correctly.

4. **React Query test:**
   Test fund invalidation by creating/editing a fund and verifying cache updates.

---

## Rollback

If any patch causes issues:

```bash
git checkout client/src/lib/query-keys.ts
git checkout client/src/hooks/useInvalidateQueries.ts
git checkout client/src/lib/decimal-utils.ts
git checkout client/src/components/charts/investment-breakdown-chart.tsx
git checkout client/src/components/dashboard/portfolio-concentration.tsx
git checkout client/src/components/forecasting/portfolio-insights.tsx
git checkout client/src/components/charts/nivo-allocation-pie.tsx
```

---

## Estimated Impact

- **Files modified:** 7
- **Lines changed:** ~50
- **TypeScript errors fixed:** 8
- **'any' types removed:** ~15
- **Breaking changes:** 0 (all changes are type-level only)
- **Runtime changes:** 0 (except simplified invalidateMetrics)
