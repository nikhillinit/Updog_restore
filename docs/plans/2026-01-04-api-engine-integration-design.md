---
status: HISTORICAL
last_updated: 2026-01-19
---

# API-Engine Integration Design

**Date:** 2026-01-04
**Status:** Approved
**Author:** Claude + User collaboration

## Overview

Wire up 4 existing client-side engines to new API endpoints for React frontend consumption.

## Goals & Non-Goals

### Goals
- Create 4 new API endpoints (MOIC, Graduation, Liquidity, Capital Allocation)
- Move engines from `client/src/core/` to `shared/core/` for server access
- Create React hooks for frontend consumption
- Clean architecture that can scale later

### Non-Goals
- Auth middleware (internal tool, trusted users)
- Zod validation (can add later)
- Rate limiting / caching (no performance pain yet)
- Fixing existing routes (reserves, pacing, cohorts)
- Moving shared utilities (array-safety, etc.)

## Design Decisions

### Why move to shared/ instead of importing from client/?
- Avoids adding more ESLint boundary violations
- Enables future server-side caching/workers
- Follows existing pattern (ConstrainedReserveEngine is in shared/)

### Why minimal middleware?
- User confirmed "just make it work" approach
- Internal tool with trusted users
- Can layer on auth/validation later

## Engine Migration

| Engine | Source | Target | Dependencies |
|--------|--------|--------|--------------|
| MOICCalculator | `client/src/core/moic/` | `shared/core/moic/` | `decimal.js` (already available) |
| GraduationRateEngine | `client/src/core/graduation/` | `shared/core/graduation/` | `@shared/utils/prng` (already shared) |
| CapitalAllocationEngine | `client/src/core/capitalAllocation/` | `shared/core/capitalAllocation/` | Internal only (14 files) |
| LiquidityEngine | `client/src/core/LiquidityEngine.ts` | `shared/core/liquidity/` | `isDefined` (inline it) |

## API Endpoints

| Method | Path | Engine Method |
|--------|------|---------------|
| POST | `/api/moic/calculate` | `MOICCalculator.generatePortfolioSummary()` |
| POST | `/api/graduation/project` | `GraduationRateEngine.getSummary()` |
| GET | `/api/liquidity/forecast/:fundId` | `LiquidityEngine.generateLiquidityForecast()` |
| POST | `/api/capital-allocation/calculate` | `calculateCapitalAllocation()` |

## Route Pattern

```typescript
// server/routes/moic.ts
import { Router } from 'express';
import { asyncHandler } from '../middleware/async.js';
import { MOICCalculator } from '@shared/core/moic/MOICCalculator';

const router = Router();

router.post('/calculate', asyncHandler(async (req, res) => {
  const { investments } = req.body;
  const result = MOICCalculator.generatePortfolioSummary(investments);
  res.json(result);
}));

export default router;
```

## Client Hooks

```typescript
// client/src/hooks/use-moic.ts
import { useMutation } from '@tanstack/react-query';

export function useMOICCalculation() {
  return useMutation({
    mutationFn: async (investments: Investment[]) => {
      const res = await fetch('/api/moic/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ investments }),
      });
      if (!res.ok) throw new Error('MOIC calculation failed');
      return res.json();
    },
  });
}
```

## Implementation Order

1. MOICCalculator (simplest, zero external dependencies)
2. GraduationRateEngine (only PRNG dependency, already shared)
3. CapitalAllocationEngine (14 files, but self-contained)
4. LiquidityEngine (inline isDefined, largest file)

## Verification

For each engine:
- `npm run check` passes
- `npm test` passes
- Manual curl test confirms endpoint works

## Future Considerations

When needed, can add:
- `requireAuth()` middleware for authentication
- Zod schemas for request validation
- Redis caching for expensive calculations
- BullMQ workers for long-running operations
- Rate limiting for abuse prevention
