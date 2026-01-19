---
status: ACTIVE
last_updated: 2026-01-19
---

# Phase 0.2: Feature Flag & Phased Rollout Plan

**Status:** Complete **Created:** 2025-01-08 **Priority:** P0 - Deployment
Safety

---

## Feature Flag: `enable_lot_level_moic`

### Purpose

Control the rollout of lot-level MOIC calculations and the new portfolio route
APIs to ensure:

- Zero downtime deployment
- Safe progressive rollout
- Easy rollback if issues detected
- A/B testing capability for performance validation

---

## Feature Flag Configuration

### Client-Side Flag (client/src/config/features.ts)

```typescript
export const features = {
  /**
   * Use centralized FundStore vs legacy context
   */
  useFundStore:
    getRuntimeFlag('useFundStore') ??
    getEnvVar('VITE_USE_FUND_STORE') !== 'false',

  /**
   * Enable lot-level MOIC calculations with 7 lenses
   *
   * Controls:
   * - Investment lot creation API
   * - Forecast snapshot API
   * - LotMOICCalculator usage
   * - 7-lens MOIC display in UI
   *
   * Kill switch:
   * - URL: ?ff_enableLotLevelMoic=0
   * - Code: localStorage.setItem('ff_enableLotLevelMoic', '0')
   *
   * Gradual rollout:
   * - Dev: VITE_ENABLE_LOT_LEVEL_MOIC=true (default)
   * - Staging: VITE_ENABLE_LOT_LEVEL_MOIC=true
   * - Production: VITE_ENABLE_LOT_LEVEL_MOIC=false (disabled by default)
   *   → Enable for specific users via URL param
   */
  enableLotLevelMoic:
    getRuntimeFlag('enableLotLevelMoic') ??
    getEnvVar('VITE_ENABLE_LOT_LEVEL_MOIC') === 'true', // default false in prod
};
```

### Server-Side Flag (server/config/index.ts)

```typescript
// server/config/index.ts
export const config = {
  // ... existing config

  features: {
    /**
     * Enable lot-level MOIC API endpoints
     *
     * When disabled:
     * - POST /api/funds/:fundId/portfolio/lots → 503 Service Unavailable
     * - POST /api/funds/:fundId/portfolio/snapshots → 503 Service Unavailable
     * - Existing MOIC calculations continue to work
     *
     * Environment variable: ENABLE_LOT_LEVEL_MOIC
     * Default: false (explicit opt-in)
     */
    enableLotLevelMoic: process.env.ENABLE_LOT_LEVEL_MOIC === 'true',
  },
};
```

### Feature Flag Middleware (server/middleware/feature-flags.ts)

```typescript
// NEW FILE: server/middleware/feature-flags.ts
import type { Request, Response, NextFunction } from 'express';
import { config } from '../config';

/**
 * Middleware to check feature flag before allowing access to route
 *
 * Usage:
 *   router.post('/lots', requireFeature('enableLotLevelMoic'), handler);
 */
export function requireFeature(featureName: keyof typeof config.features) {
  return (req: Request, res: Response, next: NextFunction) => {
    const isEnabled = config.features[featureName];

    if (!isEnabled) {
      return res.status(503).json({
        error: 'feature_disabled',
        message: `The ${featureName} feature is currently disabled`,
        feature: featureName,
      });
    }

    next();
  };
}
```

---

## Phased Rollout Plan

### Phase 1: Development (Week 5, Days 1-5)

**Target:** Internal development team only **Flag State:**
`ENABLE_LOT_LEVEL_MOIC=true` (dev environment) **Duration:** 5 days (concurrent
with implementation)

**Activities:**

- ✅ Enable flag by default in dev environment
- ✅ All API endpoints accessible
- ✅ Full 7-lens MOIC calculations active
- ✅ Test with seed data and mock portfolios
- ✅ Run full test suite (unit + integration)
- ✅ Performance profiling with 200-company portfolio

**Success Criteria:**

- All tests passing (>90% coverage)
- API response times <2 seconds for snapshots
- MOIC calculations match Excel parity (±0.01%)
- No memory leaks in LotMOICCalculator
- Rollback tested successfully

---

### Phase 2: Staging (Week 6, Days 1-2)

**Target:** QA team + select stakeholders **Flag State:**
`ENABLE_LOT_LEVEL_MOIC=true` (staging environment) **Duration:** 2 days

**Activities:**

- Deploy to staging environment
- QA team runs UAT scenarios
- Stakeholder demo with real (anonymized) fund data
- Load testing with production-like data volumes
- Security review of new endpoints

**Success Criteria:**

- UAT scenarios pass 100%
- Performance acceptable under load (P95 <3s)
- No security vulnerabilities identified
- Data migration tested with production snapshot
- Stakeholder approval obtained

**Rollback Trigger:**

- Critical bugs discovered
- Performance degradation >20% vs. baseline
- Data integrity issues in snapshots

---

### Phase 3: Canary (Production, 10% Users) (Week 6, Day 3)

**Target:** 10% of production users (early adopters) **Flag State:**
`ENABLE_LOT_LEVEL_MOIC=false` (default), enabled via URL param **Duration:** 2
days

**Activation Method:**

```
For specific user sessions:
https://app.pressonventures.com/portfolio?ff_enableLotLevelMoic=1

Or persistent for power users:
localStorage.setItem('ff_enableLotLevelMoic', '1')
```

**Monitoring:**

- Error rate for new endpoints
- API latency (P50, P95, P99)
- Database query performance
- Memory usage in background workers
- User feedback (qualitative)

**Success Criteria:**

- Error rate <0.5% (vs. <0.2% baseline)
- P95 latency <3 seconds
- No database deadlocks or connection pool exhaustion
- Positive user feedback from early adopters

**Rollback Trigger:**

- Error rate spikes >1%
- P99 latency >10 seconds
- Database performance degradation
- Critical user-reported bugs

---

### Phase 4: Expanded Rollout (Production, 50% Users) (Week 6, Day 4-5)

**Target:** 50% of production users **Flag State:**
`ENABLE_LOT_LEVEL_MOIC=false` (still requires opt-in) **Duration:** 2 days

**Activation Method:**

- Invite more users via email with opt-in link
- Feature announcement in app banner (optional click-through)

**Monitoring:**

- Same metrics as Canary phase
- Database load (connection count, query volume)
- BullMQ queue depth and processing time
- Cache hit rates for snapshot calculations

**Success Criteria:**

- Error rate remains <0.5%
- Database performance stable
- BullMQ queue processing <5 minutes for snapshots
- No increase in support tickets

---

### Phase 5: General Availability (Production, 100% Users) (Week 7+)

**Target:** All production users **Flag State:** `ENABLE_LOT_LEVEL_MOIC=true`
(default enabled) **Duration:** Permanent

**Activation Method:**

- Set `VITE_ENABLE_LOT_LEVEL_MOIC=true` in production env vars
- Deploy via standard CI/CD pipeline
- Feature announcement blog post

**Post-Launch Monitoring (30 days):**

- Daily error rate reports
- Weekly performance reviews
- Monthly user satisfaction survey
- Quarterly feature adoption metrics

**Kill Switch:**

- URL param: `?ff_enableLotLevelMoic=0` (emergency override)
- Environment variable: Set `ENABLE_LOT_LEVEL_MOIC=false` and redeploy
  (15-minute turnaround)

---

## UI/UX Considerations

### Feature Flag in UI Components

**Portfolio Page (client/src/pages/portfolio.tsx)**

```typescript
import { features } from '@/config/features';

export function PortfolioPage() {
  const showLotLevelMoic = features.enableLotLevelMoic;

  return (
    <div>
      {/* Legacy MOIC display (always shown) */}
      <SimpleMOICCard data={legacyMoic} />

      {/* New 7-lens MOIC (feature-flagged) */}
      {showLotLevelMoic && (
        <SevenLensMOICDashboard data={lotLevelMoic} />
      )}

      {/* Beta badge for early access users */}
      {showLotLevelMoic && (
        <BetaBadge tooltip="You're using the new lot-level MOIC calculations" />
      )}
    </div>
  );
}
```

**Investment Creation Form**

```typescript
function InvestmentForm() {
  const showLotFields = features.enableLotLevelMoic;

  return (
    <form>
      {/* Legacy fields (always shown) */}
      <Input name="amount" label="Investment Amount" />
      <Input name="round" label="Round" />

      {/* New lot-level fields (feature-flagged) */}
      {showLotFields && (
        <>
          <Input
            name="sharePriceCents"
            label="Share Price (per share)"
            required
            helpText="Required for 7-lens MOIC calculations"
          />
          <Input name="sharesAcquired" label="Shares Acquired" />
        </>
      )}
    </form>
  );
}
```

---

## API Endpoint Protection

### Route-Level Feature Gating

```typescript
// server/routes/portfolio.ts
import { requireFeature } from '../middleware/feature-flags';

const router = Router();

// New endpoints - protected by feature flag
router.post(
  '/funds/:fundId/portfolio/lots',
  requireFeature('enableLotLevelMoic'),
  asyncHandler(createInvestmentLot)
);

router.post(
  '/funds/:fundId/portfolio/snapshots',
  requireFeature('enableLotLevelMoic'),
  asyncHandler(createForecastSnapshot)
);

// Legacy endpoints - always available (no flag)
router.get('/funds/:fundId/moic', asyncHandler(getLegacyMoic));

export default router;
```

### Graceful Degradation Response

```json
// When feature disabled (503 Service Unavailable)
{
  "error": "feature_disabled",
  "message": "The lot-level MOIC feature is currently disabled",
  "feature": "enableLotLevelMoic",
  "fallback": {
    "endpoint": "/api/funds/:fundId/moic",
    "description": "Use legacy MOIC endpoint for basic calculations"
  }
}
```

---

## Monitoring & Observability

### Key Metrics to Track

**API Performance:**

```typescript
// Prometheus metrics (server/metrics.ts)
export const lotMoicMetrics = {
  // Endpoint latency
  snapshotCreationDuration: new Histogram({
    name: 'portfolio_snapshot_creation_duration_seconds',
    help: 'Time to create forecast snapshot',
    labelNames: ['status'], // success, error
  }),

  // MOIC calculation performance
  moicCalculationDuration: new Histogram({
    name: 'lot_moic_calculation_duration_seconds',
    help: 'Time to calculate 7-lens MOIC',
    labelNames: ['lens_type'], // current_moic, exit_moic_initial, etc.
  }),

  // Feature flag activation
  featureFlagUsage: new Counter({
    name: 'feature_flag_checks_total',
    help: 'Feature flag checks by flag name',
    labelNames: ['flag_name', 'enabled'],
  }),

  // Error tracking
  lotMoicErrors: new Counter({
    name: 'lot_moic_errors_total',
    help: 'Errors in lot-level MOIC calculations',
    labelNames: ['error_type'], // validation, calculation, database
  }),
};
```

**Dashboard Alerts:**

- 🚨 Error rate >1% for 5 minutes → Page on-call engineer
- ⚠️ P95 latency >5 seconds for 10 minutes → Slack alert
- ⚠️ Queue depth >100 snapshots for 15 minutes → Investigate worker capacity
- ℹ️ Feature flag disabled by user >10 times/hour → Check for usability issues

---

## Rollback Procedures

### Emergency Rollback (< 5 minutes)

**Trigger:** Critical bug, data corruption, or service outage

**Steps:**

1. **Disable client-side feature:**

   ```bash
   # Update environment variable in deployment platform
   VITE_ENABLE_LOT_LEVEL_MOIC=false

   # Redeploy frontend (< 2 minutes via CI/CD)
   npm run build && npm run deploy
   ```

2. **Disable server-side feature:**

   ```bash
   # Update environment variable
   ENABLE_LOT_LEVEL_MOIC=false

   # Restart API servers (rolling restart, zero downtime)
   kubectl rollout restart deployment/api-server
   ```

3. **Verify rollback:**

   ```bash
   # Test endpoint returns 503
   curl https://api.pressonventures.com/api/funds/1/portfolio/lots
   # Expected: {"error": "feature_disabled"}
   ```

4. **Notify users:**
   - In-app banner: "Lot-level MOIC temporarily unavailable"
   - Fallback to legacy MOIC calculations (no data loss)

### Partial Rollback (Reduce Exposure)

**Trigger:** High error rate, but service still functional

**Steps:**

1. Reduce canary percentage (100% → 10%)
2. Contact affected users directly
3. Investigate issues while keeping feature available to subset
4. Apply hotfix and re-expand

---

## Testing the Feature Flag

### Unit Tests (vitest)

```typescript
// tests/unit/feature-flags.test.ts
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { features } from '@/config/features';

describe('Feature Flags', () => {
  beforeEach(() => {
    // Reset environment
    delete (import.meta as any).env.VITE_ENABLE_LOT_LEVEL_MOIC;
    localStorage.clear();
  });

  it('should default to false in production', () => {
    expect(features.enableLotLevelMoic).toBe(false);
  });

  it('should respect environment variable', () => {
    (import.meta as any).env.VITE_ENABLE_LOT_LEVEL_MOIC = 'true';
    expect(features.enableLotLevelMoic).toBe(true);
  });

  it('should allow URL param override', () => {
    window.location.search = '?ff_enableLotLevelMoic=1';
    expect(features.enableLotLevelMoic).toBe(true);
  });

  it('should allow localStorage override', () => {
    localStorage.setItem('ff_enableLotLevelMoic', '1');
    expect(features.enableLotLevelMoic).toBe(true);
  });
});
```

### Integration Tests (API protection)

```typescript
// tests/integration/feature-flag-middleware.test.ts
describe('Feature Flag Middleware', () => {
  it('should return 503 when feature disabled', async () => {
    process.env.ENABLE_LOT_LEVEL_MOIC = 'false';

    const response = await request(server)
      .post('/api/funds/1/portfolio/lots')
      .send({ ... })
      .expect(503);

    expect(response.body.error).toBe('feature_disabled');
  });

  it('should allow access when feature enabled', async () => {
    process.env.ENABLE_LOT_LEVEL_MOIC = 'true';

    const response = await request(server)
      .post('/api/funds/1/portfolio/lots')
      .send({ ... })
      .expect(201);

    expect(response.body).toHaveProperty('id');
  });
});
```

---

## Success Criteria

✅ Feature flag implemented in both client & server ✅ Kill switch tested and
functional (<5 min rollback time) ✅ Phased rollout plan documented with clear
triggers ✅ Monitoring dashboard configured with alerts ✅ Graceful degradation
tested (503 responses) ✅ Unit & integration tests for feature flag behavior ✅
Rollback procedure documented and rehearsed

---

## Next Steps

1. ✅ **Phase 0.2 Complete** → Mark todo as done
2. **Move to Phase 0.3:** Document frontend integration scope
3. **Begin Phase 1:** Implement database schema with TDD

**Feature flag ready for implementation.**
