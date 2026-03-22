---
status: ACTIVE
last_updated: 2026-01-19
---

# Phase 0.3: Frontend Integration Scope & UI Components

**Status:** Complete **Created:** 2025-01-08 **Priority:** P1 - User Experience

---

## Executive Summary

This document outlines all frontend components that will consume the new
portfolio route APIs and display lot-level MOIC calculations. The integration is
**feature-flagged** and designed for **progressive enhancement** (graceful
degradation when flag is disabled).

---

## Affected UI Components

### 1. MOIC Analysis Page (`client/src/pages/moic-analysis.tsx`)

**Current State:** Displays hardcoded sample data for 7 MOIC lenses
**Integration Required:** YES (Primary consumer)

**Changes:**

```typescript
// BEFORE (hardcoded)
const sampleMOICData: MOICMetric[] = [
  {
    company: "AlphaTech",
    currentMOIC: 3.5,
    currentMOICOnInitial: 4.2,
    // ... hardcoded values
  }
];

// AFTER (API-driven with feature flag)
import { features } from '@/config/features';
import { useQuery } from '@tanstack/react-query';

export function MOICAnalysisPage() {
  const showLotLevelMoic = features.enableLotLevelMoic;

  // New API hook for lot-level MOIC
  const { data: lotMoicData, isLoading } = useQuery({
    queryKey: ['lot-moic', fundId],
    queryFn: () => fetch(`/api/funds/${fundId}/portfolio/lots/moic`).then(r => r.json()),
    enabled: showLotLevelMoic, // Only fetch if feature enabled
  });

  // Fallback to legacy MOIC
  const { data: legacyMoic } = useQuery({
    queryKey: ['legacy-moic', fundId],
    queryFn: () => fetch(`/api/funds/${fundId}/moic`).then(r => r.json()),
  });

  const moicData = showLotLevelMoic && lotMoicData ? lotMoicData : legacyMoic;

  return (
    <div>
      {showLotLevelMoic && (
        <BetaBadge tooltip="Using new lot-level MOIC calculations" />
      )}

      {/* Existing 7-lens comparison table */}
      <MOICComparisonTable data={moicData} />

      {/* NEW: Lot-level breakdown (feature-flagged) */}
      {showLotLevelMoic && (
        <LotBreakdownSection lots={lotMoicData.lots} />
      )}
    </div>
  );
}
```

**New Components Needed:**

- `LotBreakdownSection` - Displays MOIC by lot (initial vs follow-on)
- `BetaBadge` - Indicates feature is in beta
- `useLotMOIC` hook - Fetches lot-level MOIC from API

---

### 2. Portfolio Page (`client/src/pages/portfolio-modern.tsx`)

**Current State:** Displays portfolio companies with basic metrics **Integration
Required:** YES (Secondary consumer)

**Changes:**

```typescript
// Add lot-level details to company cards
import { features } from '@/config/features';

export function PortfolioModernPage() {
  const showLotDetails = features.enableLotLevelMoic;

  return (
    <div>
      {companies.map(company => (
        <CompanyCard
          key={company.id}
          company={company}
          showLotDetails={showLotDetails} // Pass feature flag down
        />
      ))}
    </div>
  );
}

// Enhanced CompanyCard component
function CompanyCard({ company, showLotDetails }) {
  const { data: lots } = useQuery({
    queryKey: ['company-lots', company.id],
    queryFn: () => fetch(`/api/companies/${company.id}/lots`).then(r => r.json()),
    enabled: showLotDetails,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{company.name}</CardTitle>

        {/* Legacy MOIC (always shown) */}
        <div className="text-sm text-muted-foreground">
          Current MOIC: {company.currentMOIC}x
        </div>

        {/* NEW: Lot-level breakdown (feature-flagged) */}
        {showLotDetails && lots && (
          <LotSummary lots={lots} />
        )}
      </CardHeader>
    </Card>
  );
}
```

**New Components Needed:**

- `LotSummary` - Compact display of lot breakdown (initial + follow-ons)
- `useCompanyLots` hook - Fetches lots for a specific company

---

### 3. Investment Creation Form (`client/src/components/investments/investment-editor.tsx`)

**Current State:** Creates investments with amount/round/ownership **Integration
Required:** YES (Data entry)

**Changes:**

```typescript
import { features } from '@/config/features';
import { z } from 'zod';

// Enhanced schema with lot-level fields
const InvestmentFormSchema = z.object({
  amount: z.string().min(1),
  round: z.string().min(1),
  ownershipPercentage: z.string().optional(),

  // NEW: Lot-level fields (required if feature enabled)
  sharePriceCents: z.string().optional().refine(
    (val) => !features.enableLotLevelMoic || (val && val.length > 0),
    { message: "Share price required for lot-level MOIC" }
  ),
  sharesAcquired: z.string().optional(),
});

export function InvestmentEditor({ companyId, onSave }) {
  const form = useForm({ schema: InvestmentFormSchema });
  const showLotFields = features.enableLotLevelMoic;

  const handleSubmit = async (data) => {
    // POST to new lot API if feature enabled
    const endpoint = showLotFields
      ? `/api/funds/${fundId}/portfolio/lots`
      : `/api/investments`;

    await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': crypto.randomUUID(), // For idempotency
      },
      body: JSON.stringify({
        ...data,
        // Convert to BigInt for API
        sharePriceCents: data.sharePriceCents ? BigInt(data.sharePriceCents) : undefined,
      }),
    });

    onSave();
  };

  return (
    <Form {...form}>
      {/* Legacy fields (always shown) */}
      <FormField
        control={form.control}
        name="amount"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Investment Amount</FormLabel>
            <FormControl>
              <Input {...field} type="number" />
            </FormControl>
          </FormItem>
        )}
      />

      {/* NEW: Lot-level fields (feature-flagged) */}
      {showLotFields && (
        <>
          <FormField
            control={form.control}
            name="sharePriceCents"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Share Price (per share)</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="number"
                    step="0.01"
                    placeholder="1.00"
                  />
                </FormControl>
                <FormDescription>
                  Required for 7-lens MOIC calculations. Price in dollars per share.
                </FormDescription>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="sharesAcquired"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Shares Acquired</FormLabel>
                <FormControl>
                  <Input {...field} type="number" step="0.00000001" />
                </FormControl>
                <FormDescription>
                  Number of shares purchased. Auto-calculated if left blank.
                </FormDescription>
              </FormItem>
            )}
          />
        </>
      )}

      <Button type="submit">Save Investment</Button>
    </Form>
  );
}
```

**New Components Needed:**

- Enhanced `InvestmentEditor` with conditional lot fields
- `SharePriceInput` - Specialized input for per-share pricing (dollars → cents
  conversion)
- Validation logic for share price (must be > 0, reasonable range check)

---

### 4. Forecast Snapshot Management (NEW PAGE)

**Current State:** Does not exist **Integration Required:** YES (New feature)

**New Page:** `client/src/pages/forecast-snapshots.tsx`

```typescript
import { useQuery, useMutation } from '@tanstack/react-query';
import { features } from '@/config/features';

export function ForecastSnapshotsPage() {
  const [cursor, setCursor] = useState<string | null>(null);

  // Fetch snapshots with cursor-based pagination
  const { data, isLoading } = useQuery({
    queryKey: ['snapshots', fundId, cursor],
    queryFn: async () => {
      const url = cursor
        ? `/api/funds/${fundId}/portfolio/snapshots?cursor=${cursor}&limit=20`
        : `/api/funds/${fundId}/portfolio/snapshots?limit=20`;
      return fetch(url).then(r => r.json());
    },
    enabled: features.enableLotLevelMoic,
  });

  // Create new snapshot mutation
  const createSnapshot = useMutation({
    mutationFn: async (snapshotData) => {
      const response = await fetch(`/api/funds/${fundId}/portfolio/snapshots`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify(snapshotData),
      });

      // Handle 202 Accepted (async creation)
      if (response.status === 202) {
        const { snapshotId } = await response.json();
        return { snapshotId, status: 'pending' };
      }

      return response.json();
    },
    onSuccess: (data) => {
      // Poll for completion
      pollSnapshotStatus(data.snapshotId);
    },
  });

  // Poll for snapshot completion (status: pending → calculating → complete)
  const pollSnapshotStatus = (snapshotId: string) => {
    const interval = setInterval(async () => {
      const status = await fetch(`/api/snapshots/${snapshotId}`).then(r => r.json());

      if (status.status === 'complete') {
        clearInterval(interval);
        queryClient.invalidateQueries(['snapshots', fundId]);
        toast.success('Snapshot calculation complete');
      } else if (status.status === 'error') {
        clearInterval(interval);
        toast.error('Snapshot calculation failed');
      }
    }, 2000); // Poll every 2 seconds
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Forecast Snapshots</h1>
        <Button onClick={() => setShowCreateDialog(true)}>
          Create Snapshot
        </Button>
      </div>

      {/* Snapshot list with pagination */}
      <div className="grid gap-4">
        {data?.snapshots?.map(snapshot => (
          <SnapshotCard
            key={snapshot.id}
            snapshot={snapshot}
            onView={() => router.push(`/snapshots/${snapshot.id}`)}
          />
        ))}
      </div>

      {/* Load more (cursor pagination) */}
      {data?.pagination?.hasMore && (
        <Button
          variant="outline"
          onClick={() => setCursor(data.pagination.nextCursor)}
        >
          Load More
        </Button>
      )}

      {/* Create snapshot dialog */}
      <CreateSnapshotDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onSubmit={createSnapshot.mutate}
      />
    </div>
  );
}
```

**New Components Needed:**

- `ForecastSnapshotsPage` - Main page for snapshot management
- `SnapshotCard` - Display snapshot with status indicator
- `CreateSnapshotDialog` - Form to create new snapshot
- `SnapshotStatusBadge` - Visual indicator for
  pending/calculating/complete/error
- `useSnapshotPolling` hook - Handles polling logic for async snapshots

---

### 5. Reserve Allocation Integration (`client/src/components/reserves/`)

**Current State:** Uses DeterministicReserveEngine for recommendations
**Integration Required:** YES (Linkage to snapshots)

**Changes:**

```typescript
// Link reserve allocations to forecast snapshots
import { features } from '@/config/features';

export function ReserveAllocationDashboard({ fundId }) {
  const showSnapshots = features.enableLotLevelMoic;

  // Run reserve engine (existing)
  const { data: allocations } = useDeterministicReserveEngine(fundId);

  // NEW: Save allocations to snapshot
  const saveToSnapshot = async () => {
    if (!showSnapshots) {
      toast.error('Lot-level MOIC feature required for snapshots');
      return;
    }

    const snapshotData = {
      name: `Reserve Allocation - ${new Date().toISOString()}`,
      allocations: allocations.map(a => ({
        companyId: a.companyId,
        plannedReserveCents: BigInt(a.recommendedAllocation * 100),
      })),
      valuations: companies.map(c => ({
        companyId: c.id,
        fairValueCents: BigInt(c.currentValuation * 100),
      })),
    };

    await fetch(`/api/funds/${fundId}/portfolio/snapshots`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify(snapshotData),
    });

    toast.success('Reserve allocation saved to snapshot');
  };

  return (
    <div>
      {/* Existing reserve recommendations */}
      <ReserveTable allocations={allocations} />

      {/* NEW: Save to snapshot button (feature-flagged) */}
      {showSnapshots && (
        <Button onClick={saveToSnapshot}>
          Save as Forecast Snapshot
        </Button>
      )}
    </div>
  );
}
```

---

## New Shared Components

### `LotBreakdownSection`

**Purpose:** Display lot-level MOIC breakdown (initial vs follow-on)

```typescript
export function LotBreakdownSection({ lots }: { lots: InvestmentLot[] }) {
  const initialLots = lots.filter(l => l.lotType === 'initial');
  const followOnLots = lots.filter(l => l.lotType === 'follow_on');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Investment Lot Breakdown</CardTitle>
        <CardDescription>
          MOIC calculated separately for initial investment vs. follow-on rounds
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="initial">
          <TabsList>
            <TabsTrigger value="initial">
              Initial Investment ({initialLots.length})
            </TabsTrigger>
            <TabsTrigger value="follow-on">
              Follow-Ons ({followOnLots.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="initial">
            <LotTable lots={initialLots} />
          </TabsContent>

          <TabsContent value="follow-on">
            <LotTable lots={followOnLots} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
```

### `LotTable`

**Purpose:** Tabular display of lots with key metrics

```typescript
export function LotTable({ lots }: { lots: InvestmentLot[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Round</TableHead>
          <TableHead>Share Price</TableHead>
          <TableHead>Shares</TableHead>
          <TableHead>Cost Basis</TableHead>
          <TableHead>Current MOIC</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lots.map(lot => (
          <TableRow key={lot.id}>
            <TableCell>{formatDate(lot.createdAt)}</TableCell>
            <TableCell>{lot.round}</TableCell>
            <TableCell>${(lot.sharePriceCents / 100).toFixed(2)}</TableCell>
            <TableCell>{lot.sharesAcquired.toLocaleString()}</TableCell>
            <TableCell>${(lot.costBasisCents / 100).toLocaleString()}</TableCell>
            <TableCell>{lot.currentMOIC}x</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

### `SnapshotStatusBadge`

**Purpose:** Visual indicator for snapshot status

```typescript
export function SnapshotStatusBadge({ status }: { status: string }) {
  const variants = {
    pending: { label: 'Pending', variant: 'secondary', icon: Clock },
    calculating: { label: 'Calculating', variant: 'default', icon: Loader },
    complete: { label: 'Complete', variant: 'success', icon: CheckCircle },
    error: { label: 'Error', variant: 'destructive', icon: XCircle },
  };

  const config = variants[status] || variants.pending;
  const Icon = config.icon;

  return (
    <Badge variant={config.variant}>
      <Icon className="w-3 h-3 mr-1" />
      {config.label}
    </Badge>
  );
}
```

---

## TanStack Query Hooks

### `useLotMOIC`

**Purpose:** Fetch lot-level MOIC for a fund

```typescript
export function useLotMOIC(fundId: number) {
  return useQuery({
    queryKey: ['lot-moic', fundId],
    queryFn: async () => {
      const response = await fetch(`/api/funds/${fundId}/portfolio/lots/moic`);
      if (!response.ok) throw new Error('Failed to fetch lot MOIC');
      return response.json();
    },
    enabled: features.enableLotLevelMoic,
  });
}
```

### `useForecastSnapshots`

**Purpose:** Fetch forecast snapshots with cursor pagination

```typescript
export function useForecastSnapshots(fundId: number, cursor?: string) {
  return useQuery({
    queryKey: ['snapshots', fundId, cursor],
    queryFn: async () => {
      const url = cursor
        ? `/api/funds/${fundId}/portfolio/snapshots?cursor=${cursor}&limit=20`
        : `/api/funds/${fundId}/portfolio/snapshots?limit=20`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch snapshots');
      return response.json();
    },
    enabled: features.enableLotLevelMoic,
  });
}
```

### `useCreateSnapshot`

**Purpose:** Create new forecast snapshot with async polling

```typescript
export function useCreateSnapshot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (snapshotData: CreateSnapshotRequest) => {
      const response = await fetch(
        `/api/funds/${snapshotData.fundId}/portfolio/snapshots`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': crypto.randomUUID(),
          },
          body: JSON.stringify(snapshotData),
        }
      );

      if (response.status === 202) {
        return response.json(); // { snapshotId, status: 'pending' }
      }

      throw new Error('Unexpected response');
    },
    onSuccess: async (data) => {
      // Poll for completion
      await pollSnapshotUntilComplete(data.snapshotId);
      queryClient.invalidateQueries(['snapshots']);
    },
  });
}

async function pollSnapshotUntilComplete(snapshotId: string, maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(`/api/snapshots/${snapshotId}`);
    const snapshot = await response.json();

    if (snapshot.status === 'complete') {
      return snapshot;
    } else if (snapshot.status === 'error') {
      throw new Error('Snapshot calculation failed');
    }

    await new Promise((resolve) => setTimeout(resolve, 2000)); // 2 second delay
  }

  throw new Error('Snapshot calculation timeout');
}
```

---

## Loading & Error States

### Loading State (Async Snapshot Creation)

```typescript
{isCreatingSnapshot && (
  <div className="flex items-center gap-2">
    <Loader className="w-4 h-4 animate-spin" />
    <span>Creating forecast snapshot...</span>
  </div>
)}
```

### Error State (503 Feature Disabled)

```typescript
{error?.status === 503 && (
  <Alert variant="destructive">
    <AlertCircle className="h-4 w-4" />
    <AlertTitle>Feature Unavailable</AlertTitle>
    <AlertDescription>
      Lot-level MOIC calculations are currently disabled. Contact your
      administrator to enable this feature.
    </AlertDescription>
  </Alert>
)}
```

### Empty State (No Lots)

```typescript
{lots.length === 0 && (
  <EmptyState
    icon={Package}
    title="No investment lots"
    description="Create your first investment lot to enable 7-lens MOIC analysis"
    action={
      <Button onClick={() => router.push('/investments/new')}>
        Add Investment
      </Button>
    }
  />
)}
```

---

## Routing & Navigation

### New Routes

```typescript
// client/src/config/routes.ts
export const routes = {
  // ... existing routes

  // NEW: Forecast snapshots
  forecastSnapshots: (fundId: number) => `/funds/${fundId}/snapshots`,
  snapshotDetail: (snapshotId: string) => `/snapshots/${snapshotId}`,

  // NEW: Lot management
  investmentLots: (fundId: number) => `/funds/${fundId}/lots`,
  lotDetail: (lotId: string) => `/lots/${lotId}`,
};
```

### Sidebar Navigation (Feature-Flagged)

```typescript
// client/src/components/layout/sidebar.tsx
import { features } from '@/config/features';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: Home },
  { name: 'Portfolio', href: '/portfolio', icon: Briefcase },
  { name: 'MOIC Analysis', href: '/moic-analysis', icon: TrendingUp },

  // NEW: Conditional navigation item
  ...(features.enableLotLevelMoic
    ? [
        {
          name: 'Forecast Snapshots',
          href: '/snapshots',
          icon: Camera,
          badge: 'Beta',
        },
      ]
    : []),
];
```

---

## Success Criteria

✅ All 5 affected pages identified and scoped ✅ 8 new shared components
designed ✅ 3 TanStack Query hooks specified ✅ Loading/error/empty states
documented ✅ Feature flag integration planned for all components ✅ Graceful
degradation strategy defined ✅ New routes and navigation items specified

---

## Implementation Timeline

**Week 5 (Concurrent with Backend):**

- Day 1-2: Stub out new components with mock data
- Day 3-4: Integrate with backend APIs (as they become available)
- Day 5: Polish loading states, error handling

**Week 6:**

- Day 1-2: UAT with real data
- Day 3-5: Bug fixes and refinements

**Total Frontend Work:** ~12-15 hours (can run in parallel with backend
development)

---

## Next Steps

1. ✅ **Phase 0.3 Complete** → Mark todo as done
2. **Begin Phase 1:** Database schema implementation with TDD
3. Frontend team can start stubbing components with feature flag scaffolding

**Frontend integration scope documented and ready.**
