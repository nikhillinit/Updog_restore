---
status: ACTIVE
last_updated: 2026-01-19
---

# Reallocation API Quick Start

**Phase:** 1b
**Date:** 2025-10-07

## 5-Minute Quick Start

### 1. Apply Migration

```bash
psql -d updog -f server/migrations/20251007_fund_allocation_phase1b.up.sql
```

### 2. Test with curl

```bash
# Preview reallocation
curl -X POST http://localhost:5000/api/funds/1/reallocation/preview \
  -H "Content-Type: application/json" \
  -d '{
    "current_version": 1,
    "proposed_allocations": [
      {"company_id": 1, "planned_reserves_cents": 150000000},
      {"company_id": 2, "planned_reserves_cents": 100000000}
    ]
  }'

# Commit reallocation
curl -X POST http://localhost:5000/api/funds/1/reallocation/commit \
  -H "Content-Type: application/json" \
  -d '{
    "current_version": 1,
    "proposed_allocations": [
      {"company_id": 1, "planned_reserves_cents": 150000000},
      {"company_id": 2, "planned_reserves_cents": 100000000}
    ],
    "reason": "Q4 rebalancing",
    "user_id": 1
  }'
```

### 3. Run Tests

```bash
npm test tests/unit/reallocation-api.test.ts
```

## Common Patterns

### Pattern 1: Preview-Commit Workflow

```typescript
import { dollarsToCents } from '@/lib/units';

async function rebalancePortfolio(fundId: number, allocations: Map<number, number>) {
  // Step 1: Fetch current state
  const { version } = await fetchFundAllocations(fundId);

  // Step 2: Preview changes
  const preview = await previewReallocation(fundId, {
    current_version: version,
    proposed_allocations: Array.from(allocations.entries()).map(([id, amount]) => ({
      company_id: id,
      planned_reserves_cents: dollarsToCents(amount),
    })),
  });

  // Step 3: Check for errors
  if (!preview.validation.is_valid) {
    console.error('Validation failed:', preview.validation.errors);
    return;
  }

  // Step 4: Show warnings to user
  if (preview.warnings.length > 0) {
    const proceed = await confirmWarnings(preview.warnings);
    if (!proceed) return;
  }

  // Step 5: Commit changes
  try {
    const result = await commitReallocation(fundId, {
      current_version: version,
      proposed_allocations: Array.from(allocations.entries()).map(([id, amount]) => ({
        company_id: id,
        planned_reserves_cents: dollarsToCents(amount),
      })),
      reason: 'User-initiated rebalancing',
    });

    console.log('Reallocation committed:', result);
  } catch (error) {
    if (error.status === 409) {
      // Version conflict - retry with latest version
      return rebalancePortfolio(fundId, allocations);
    }
    throw error;
  }
}
```

### Pattern 2: Handling Version Conflicts

```typescript
async function commitWithRetry(
  fundId: number,
  allocations: Array<{ company_id: number; planned_reserves_cents: number }>,
  maxRetries = 3
) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const { version } = await fetchFundAllocations(fundId);

      const result = await commitReallocation(fundId, {
        current_version: version,
        proposed_allocations: allocations,
        reason: `Reallocation attempt ${attempt + 1}`,
      });

      return result;
    } catch (error) {
      if (error.status === 409 && attempt < maxRetries - 1) {
        // Version conflict - wait and retry
        await new Promise((resolve) => setTimeout(resolve, 100 * Math.pow(2, attempt)));
        continue;
      }
      throw error;
    }
  }

  throw new Error('Max retries exceeded');
}
```

### Pattern 3: Batch Reallocation

```typescript
async function rebalanceMultipleCompanies(
  fundId: number,
  changes: Map<number, number>
) {
  // Fetch current allocations
  const { version, companies } = await fetchFundAllocations(fundId);

  // Build proposed allocations (only changed companies)
  const proposed = Array.from(changes.entries()).map(([companyId, newAmount]) => ({
    company_id: companyId,
    planned_reserves_cents: dollarsToCents(newAmount),
  }));

  // Preview first
  const preview = await previewReallocation(fundId, {
    current_version: version,
    proposed_allocations: proposed,
  });

  // Check for blocking errors
  const blockingErrors = preview.warnings.filter((w) => w.severity === 'error');
  if (blockingErrors.length > 0) {
    throw new Error(`Cannot commit: ${blockingErrors.map((e) => e.message).join(', ')}`);
  }

  // Commit
  return await commitReallocation(fundId, {
    current_version: version,
    proposed_allocations: proposed,
    reason: 'Batch rebalancing',
  });
}
```

### Pattern 4: Incremental Allocation

```typescript
async function incrementAllocation(
  fundId: number,
  companyId: number,
  additionalAmount: number
) {
  // Fetch current allocation
  const { version, companies } = await fetchFundAllocations(fundId);
  const company = companies.find((c) => c.id === companyId);

  if (!company) {
    throw new Error(`Company ${companyId} not found`);
  }

  const newAmount = company.planned_reserves_cents + dollarsToCents(additionalAmount);

  // Commit
  return await commitReallocation(fundId, {
    current_version: version,
    proposed_allocations: [
      {
        company_id: companyId,
        planned_reserves_cents: newAmount,
      },
    ],
    reason: `Incremental allocation: +$${additionalAmount.toLocaleString()}`,
  });
}
```

## API Client Functions

```typescript
// client/src/api/reallocation.ts

export async function previewReallocation(
  fundId: number,
  request: {
    current_version: number;
    proposed_allocations: Array<{
      company_id: number;
      planned_reserves_cents: number;
      allocation_cap_cents?: number;
    }>;
  }
) {
  const response = await fetch(`/api/funds/${fundId}/reallocation/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Preview failed');
  }

  return await response.json();
}

export async function commitReallocation(
  fundId: number,
  request: {
    current_version: number;
    proposed_allocations: Array<{
      company_id: number;
      planned_reserves_cents: number;
      allocation_cap_cents?: number;
    }>;
    reason?: string;
    user_id?: number;
  }
) {
  const response = await fetch(`/api/funds/${fundId}/reallocation/commit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json();
    const err = new Error(error.message || 'Commit failed');
    (err as any).status = response.status;
    throw err;
  }

  return await response.json();
}

export async function fetchFundAllocations(fundId: number) {
  const response = await fetch(`/api/funds/${fundId}/allocations`);
  if (!response.ok) {
    throw new Error('Failed to fetch allocations');
  }
  return await response.json();
}
```

## React Hook Example

```typescript
// client/src/hooks/useReallocation.ts

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { previewReallocation, commitReallocation, fetchFundAllocations } from '@/api/reallocation';

export function useReallocation(fundId: number) {
  const queryClient = useQueryClient();

  // Fetch current allocations
  const { data: allocations, isLoading } = useQuery({
    queryKey: ['fund-allocations', fundId],
    queryFn: () => fetchFundAllocations(fundId),
  });

  // Preview mutation
  const previewMutation = useMutation({
    mutationFn: (proposed: any) =>
      previewReallocation(fundId, {
        current_version: allocations.version,
        proposed_allocations: proposed,
      }),
  });

  // Commit mutation
  const commitMutation = useMutation({
    mutationFn: (request: any) =>
      commitReallocation(fundId, {
        current_version: allocations.version,
        ...request,
      }),
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: ['fund-allocations', fundId] });
    },
  });

  return {
    allocations,
    isLoading,
    preview: previewMutation.mutateAsync,
    commit: commitMutation.mutateAsync,
    isPreviewLoading: previewMutation.isPending,
    isCommitLoading: commitMutation.isPending,
  };
}
```

## Testing Examples

```typescript
import { describe, it, expect } from 'vitest';
import { dollarsToCents } from '@/lib/units';

describe('Reallocation Workflow', () => {
  it('should preview and commit reallocation', async () => {
    // Preview
    const preview = await previewReallocation(1, {
      current_version: 1,
      proposed_allocations: [
        { company_id: 1, planned_reserves_cents: dollarsToCents(1_500_000) },
      ],
    });

    expect(preview.validation.is_valid).toBe(true);

    // Commit
    const result = await commitReallocation(1, {
      current_version: 1,
      proposed_allocations: [
        { company_id: 1, planned_reserves_cents: dollarsToCents(1_500_000) },
      ],
      reason: 'Test reallocation',
    });

    expect(result.success).toBe(true);
    expect(result.new_version).toBe(2);
  });

  it('should handle version conflicts gracefully', async () => {
    // First commit
    await commitReallocation(1, {
      current_version: 1,
      proposed_allocations: [
        { company_id: 1, planned_reserves_cents: dollarsToCents(1_500_000) },
      ],
    });

    // Second commit with stale version - should fail
    await expect(
      commitReallocation(1, {
        current_version: 1, // Stale version
        proposed_allocations: [
          { company_id: 1, planned_reserves_cents: dollarsToCents(2_000_000) },
        ],
      })
    ).rejects.toThrow('Version conflict');
  });
});
```

## Troubleshooting

### Issue: "Version conflict" on every commit

**Cause:** Multiple users editing simultaneously or stale client state

**Solution:**
```typescript
// Always fetch latest version before commit
const { version } = await fetchFundAllocations(fundId);
await commitReallocation(fundId, { current_version: version, ... });
```

### Issue: "Cap exceeded" error

**Cause:** Proposed allocation exceeds `allocation_cap_cents`

**Solution:**
```typescript
// Option 1: Reduce allocation
planned_reserves_cents = Math.min(planned_reserves_cents, allocation_cap_cents);

// Option 2: Increase cap
allocation_cap_cents = planned_reserves_cents * 1.2; // 20% buffer
```

### Issue: High concentration warnings

**Cause:** Single company > 30% of total reserves

**Solution:**
```typescript
// Calculate current concentration
const totalReserves = companies.reduce((sum, c) => sum + c.planned_reserves_cents, 0);
const maxAllocation = totalReserves * 0.3; // 30% limit

// Apply cap
if (proposedAmount > maxAllocation) {
  console.warn(`Allocation capped at 30% (${centsToDollars(maxAllocation)})`);
  proposedAmount = maxAllocation;
}
```

## Performance Tips

1. **Batch Updates** - Update multiple companies in single commit
2. **Preview Once** - Don't spam preview endpoint
3. **Cache Allocations** - Cache fund allocation state
4. **Debounce Input** - Debounce user input before preview
5. **Optimistic Updates** - Update UI optimistically, rollback on error

## Security Considerations

1. **Authentication** - Require authentication for both endpoints
2. **Authorization** - Verify user has access to fund
3. **Rate Limiting** - Limit requests per user/fund
4. **Audit Logging** - Always log user_id in commits
5. **Input Validation** - Validate all inputs (Zod handles this)

## Monitoring Queries

```sql
-- Recent reallocations
SELECT
  fund_id,
  baseline_version,
  new_version,
  created_at,
  reason
FROM reallocation_audit
ORDER BY created_at DESC
LIMIT 10;

-- Version conflict rate
SELECT
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) FILTER (WHERE new_version - baseline_version > 1) as conflicts,
  COUNT(*) as total
FROM reallocation_audit
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;

-- Most active funds
SELECT
  fund_id,
  COUNT(*) as reallocation_count,
  MAX(created_at) as last_reallocation
FROM reallocation_audit
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY fund_id
ORDER BY reallocation_count DESC;
```

## Next Steps

1. Review [Full Documentation](fund-allocation-phase1b.md)
2. Run unit tests: `npm test tests/unit/reallocation-api.test.ts`
3. Integrate into your application
4. Set up monitoring and alerts
5. Plan for Phase 2 enhancements
