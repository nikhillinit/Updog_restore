# Query Key Factory

Centralized, type-safe query keys for TanStack Query (React Query).

## Why Use This?

**Problem**: Ad-hoc query keys lead to:
- Cache inconsistency (typos, different formats)
- Stale data islands (missed invalidations)
- No autocomplete/type safety
- Manual coordination across components

**Solution**: Centralized factory with hierarchical keys.

## Usage

### Basic Queries

```typescript
import { queryKeys } from '@/lib/query-keys';
import { useQuery } from '@tanstack/react-query';

// Fetch fund metrics
const { data } = useQuery({
  queryKey: queryKeys.funds.metrics(fundId, { skipProjections: false }),
  queryFn: () => fetchMetrics(fundId),
});

// Fetch fund details
const { data } = useQuery({
  queryKey: queryKeys.funds.detail(fundId),
  queryFn: () => fetchFund(fundId),
});
```

### Cache Invalidation

```typescript
import { useInvalidateFund } from '@/hooks/useInvalidateQueries';
import { queryClient } from '@/lib/queryClient';

// Invalidate specific fund
const { invalidateAll, invalidateMetrics } = useInvalidateFund();

// After mutation:
await invalidateAll(fundId); // Invalidates all fund-related queries

// Or target specific data:
await invalidateMetrics(fundId); // Only metrics
```

### Family Invalidation

```typescript
import { invalidationPredicates } from '@/lib/query-keys';

// Invalidate all funds (after global settings change)
queryClient.invalidateQueries({
  predicate: invalidationPredicates.allFunds,
});

// Invalidate everything for a specific fund
queryClient.invalidateQueries({
  predicate: invalidationPredicates.fund(fundId),
});
```

## Key Structure

Keys are hierarchical for easy invalidation:

```
['app', 'funds', fundId, 'metrics', 'v2', 'with-proj']
  │       │        │        │       │       │
  │       │        │        │       │       └─ Projection flag
  │       │        │        │       └───────── Schema version
  │       │        │        └───────────────── Resource type
  │       │        └────────────────────────── Resource ID
  │       └─────────────────────────────────── Entity type
  └─────────────────────────────────────────── App root
```

### Version Management

The `METRICS_SCHEMA_VERSION` constant ensures cache invalidation when the API response structure changes:

```typescript
// Current version
export const METRICS_SCHEMA_VERSION = 2;

// When you change the UnifiedFundMetrics interface:
// 1. Increment METRICS_SCHEMA_VERSION to 3
// 2. Old cached data automatically ignored
// 3. Fresh data fetched with new structure
```

## Examples

### After Creating Investment

```typescript
await createInvestment(data);

// Invalidate affected queries
await invalidateFund.invalidateAll(fundId); // All fund data
await invalidateInvestments(); // Investment lists
```

### After Updating Fund Settings

```typescript
await updateFundSettings(fundId, settings);

// Invalidate metrics only (settings don't affect portfolio)
await invalidateFund.invalidateMetrics(fundId);
```

### Optimistic Updates

```typescript
const { mutate } = useMutation({
  mutationFn: updateCompanyValuation,
  onMutate: async (newData) => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries({
      queryKey: queryKeys.funds.metrics(fundId),
    });

    // Snapshot current value
    const previous = queryClient.getQueryData(
      queryKeys.funds.metrics(fundId)
    );

    // Optimistically update
    queryClient.setQueryData(
      queryKeys.funds.metrics(fundId),
      (old) => ({ ...old, nav: newData.nav })
    );

    return { previous };
  },
  onError: (err, variables, context) => {
    // Rollback on error
    queryClient.setQueryData(
      queryKeys.funds.metrics(fundId),
      context.previous
    );
  },
  onSettled: () => {
    // Refetch after mutation
    queryClient.invalidateQueries({
      queryKey: queryKeys.funds.metrics(fundId),
    });
  },
});
```

## Migration Guide

### Before (Ad-hoc keys)

```typescript
// Component A
const { data } = useQuery({
  queryKey: ['fund-metrics', fundId],
  // ...
});

// Component B (typo!)
const { data } = useQuery({
  queryKey: ['fundMetrics', fundId],
  // ...
});

// Invalidation (misses Component B!)
queryClient.invalidateQueries(['fund-metrics']);
```

### After (Centralized)

```typescript
// Component A
const { data } = useQuery({
  queryKey: queryKeys.funds.metrics(fundId),
  // ...
});

// Component B
const { data } = useQuery({
  queryKey: queryKeys.funds.metrics(fundId),
  // ...
});

// Invalidation (catches both!)
queryClient.invalidateQueries({
  predicate: invalidationPredicates.fund(fundId),
});
```

## Best Practices

1. ✅ **Always use the factory** - Never write raw query keys
2. ✅ **Use invalidation helpers** - Don't manually construct predicates
3. ✅ **Increment schema version** - When API response shape changes
4. ✅ **Invalidate after mutations** - Keep cache in sync
5. ❌ **Don't mix old and new** - Migrate incrementally per feature

## Related Files

- `client/src/lib/query-keys.ts` - Query key definitions
- `client/src/hooks/useInvalidateQueries.ts` - Invalidation hooks
- `server/services/metrics-aggregator.ts` - Cache key versioning (backend)
