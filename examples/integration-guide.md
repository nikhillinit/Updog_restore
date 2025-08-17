# Circuit Breaker Integration Guide

This guide shows how to wire circuit breakers into your existing application with minimal risk.

## 1. Quick Start (Low Risk)

### Step 1: Protect Cache Operations

Replace your existing cache usage with circuit breaker protection:

```typescript
// Before: Direct cache usage
import { getCache } from './server/cache/index';
const cache = await getCache();
const value = await cache.get('key');

// After: Circuit breaker protected
import { createProtectedCacheService } from './examples/cache-integration-example';
const protectedCache = await createProtectedCacheService();
const value = await protectedCache.get('key'); // Auto-fallback if Redis fails
```

### Step 2: Protect HTTP Calls

Wrap external API calls with circuit breaker protection:

```typescript
// Before: Direct HTTP calls
const response = await fetch('/external/api');

// After: Circuit breaker protected
import { PartnerApiService } from './examples/http-integration-example';
const partnerApi = new PartnerApiService('https://external-api.com');
const result = await partnerApi.getCompanyData('123');
// Auto-fallback to stale data if API fails
```

## 2. Environment Setup

Add these variables to your `.env` file:

```bash
# Cache circuit breaker (Redis protection)
CB_CACHE_ENABLED=true
CB_CACHE_FAILURE_THRESHOLD=5
CB_CACHE_RESET_TIMEOUT_MS=30000
CB_CACHE_OP_TIMEOUT_MS=2000
CB_CACHE_SUCCESS_TO_CLOSE=3
CB_CACHE_HALF_OPEN_MAX_CONC=2

# HTTP circuit breaker (external APIs)
CB_HTTP_ENABLED=true
CB_HTTP_FAILURE_THRESHOLD=3
CB_HTTP_RESET_TIMEOUT_MS=60000
CB_HTTP_OP_TIMEOUT_MS=5000
CB_HTTP_SUCCESS_TO_CLOSE=2
CB_HTTP_HALF_OPEN_MAX_CONC=1

# Database circuit breaker (if needed)
CB_DB_ENABLED=false
CB_DB_FAILURE_THRESHOLD=3
CB_DB_RESET_TIMEOUT_MS=30000
CB_DB_OP_TIMEOUT_MS=10000
CB_DB_SUCCESS_TO_CLOSE=2
CB_DB_HALF_OPEN_MAX_CONC=1
```

## 3. Wire into Express App

```typescript
// In your server setup (e.g., server/index.ts)
import { circuitAdmin } from './server/routes/admin/circuit-admin';
import { readinessHandler } from './server/routes/readiness';
import { createProtectedCacheService } from './examples/cache-integration-example';

async function setupServer() {
  const app = express();
  
  // Set up protected cache
  const protectedCache = await createProtectedCacheService();
  
  // Admin endpoints (add auth before production!)
  app.use('/admin/circuit', circuitAdmin());
  
  // Enhanced readiness check
  app.get('/readinessz', readinessHandler());
  
  // Your existing routes...
}
```

## 4. Monitor Circuit Breaker State

### Admin Dashboard
```bash
# Check all breaker states
curl localhost:3000/admin/circuit/state

# Check health status  
curl localhost:3000/admin/circuit/health
```

### Readiness Checks
```bash
# Enhanced readiness with circuit breaker awareness
curl localhost:3000/readinessz
```

### Response Headers
Circuit breaker state is automatically included in HTTP responses:

```bash
X-Circuit-State: CLOSED|HALF_OPEN|OPEN
X-Data-Source: live-api|stale-cache|fallback
```

## 5. Gradual Rollout Strategy

### Phase 1: Cache Protection (Safest)
- Start with cache circuit breakers only
- Redis already has good fallback patterns
- Monitor for 1-2 weeks

### Phase 2: External HTTP APIs
- Add circuit breakers to partner/external APIs
- Use stale data fallbacks
- Monitor API failure rates

### Phase 3: Internal Services  
- Add circuit breakers to internal service calls
- Use cached responses as fallbacks
- Monitor internal service reliability

### Phase 4: Database Operations (Highest Risk)
- Only add to read replicas initially
- Never add to write operations without careful consideration
- Use cached/stale data as fallbacks

## 6. Metrics and Observability

The circuit breakers automatically emit metrics and logs:

```typescript
// Check breaker stats programmatically
import { breakerRegistry } from './server/infra/circuit-breaker/breaker-registry';

const allStates = breakerRegistry.getAll();
const isHealthy = breakerRegistry.isHealthy();
const degradedServices = breakerRegistry.getDegraded();
```

## 7. Best Practices

### ✅ Do:
- Start with idempotent read operations
- Use stale data fallbacks where possible
- Monitor failure rates and adjust thresholds
- Test circuit breaker behavior in staging
- Add proper logging and metrics

### ❌ Don't:
- Add circuit breakers to write operations initially
- Set thresholds too low (causes false trips)
- Skip fallback implementations
- Ignore degraded state indicators
- Forget to add authentication to admin endpoints

## 8. Testing Circuit Breaker Behavior

```typescript
// Simulate Redis failure
docker stop redis

// Verify cache fallback works
curl localhost:3000/api/portfolios/123
# Should work with memory cache fallback

// Check circuit breaker state
curl localhost:3000/admin/circuit/state
# Should show cache breaker in OPEN state

// Restore Redis
docker start redis

// Verify recovery
curl localhost:3000/admin/circuit/state
# Should show cache breaker transitioning to HALF_OPEN then CLOSED
```

## 9. Production Deployment

1. **Enable feature flags** in environment
2. **Add authentication** to admin endpoints  
3. **Set up monitoring** alerts for circuit breaker state changes
4. **Document runbook** for when breakers trip
5. **Train team** on circuit breaker behavior and troubleshooting

## 10. Troubleshooting

### Circuit Breaker Stuck OPEN
- Check logs for underlying service failures
- Verify fallback data is available
- Consider manual reset via admin endpoint (when implemented)

### False Positive Trips
- Increase failure threshold
- Adjust operation timeout
- Check for network latency issues

### Performance Impact
- Monitor p95 latencies with k6 regression guard
- Verify fallback operations are fast
- Tune half-open rate limits