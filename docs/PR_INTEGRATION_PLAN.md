---
status: ACTIVE
last_updated: 2026-01-19
---

# PR Scaffolds Integration Plan (Weeks 1-4)

This document outlines the integration strategy for the PR scaffolds bundle, mapping Fastify-based scaffolds to our Express-based application.

## Bundle Overview
- **Bundle SHA256**: d6eb3ec5a7ba93d86c515393e0f3fcbe9418e09bd3f757fc2c18327ba04dc
- **Unpacked Location**: `/tmp/updog_scaffolds`
- **Total PRs**: 20 incremental improvements
- **Timeline**: Weeks 1-4

## Integration Principles
1. **Small, Focused PRs**: Each PR addresses a single concern with clear acceptance criteria
2. **Feature Flag Gating**: New features behind flags for safe rollout
3. **Express Adaptation**: Convert Fastify middleware to Express equivalents
4. **Leverage Existing**: Use our existing circuit breaker and rate limiting infrastructure
5. **Test Coverage**: Each PR includes comprehensive tests

---

## Week 1 PRs (Foundation)

### PR#1: Rate Limits + Backpressure ✅
**Status**: PARTIALLY IMPLEMENTED
**Existing Infrastructure**:
- ✅ Rate limiting: `server/middleware/rateLimitDetailed.ts` (Express-based)
- ✅ Redis store support for distributed rate limiting
- ⚠️ Need to add: Backpressure handling via `under-pressure` equivalent

**Integration Tasks**:
```typescript
// 1. Enhance existing rate limiter with tiered limits
// server/middleware/rateLimits.ts
export const rateLimiters = {
  api: createRateLimiter({ points: 100, duration: 60 }),      // General API
  simulation: createRateLimiter({ points: 10, duration: 3600 }), // Heavy operations
  auth: createRateLimiter({ points: 5, duration: 300 })        // Auth endpoints
};

// 2. Add backpressure monitoring (Express equivalent of under-pressure)
// server/middleware/backpressure.ts
import * as os from 'os';
export function backpressureMiddleware(threshold = 0.9) {
  return (req, res, next) => {
    const load = os.loadavg()[0] / os.cpus().length;
    if (load > threshold) {
      res.status(503).json({ error: 'Service Under Pressure' });
      return;
    }
    next();
  };
}
```

**Files to Create/Modify**:
- [ ] Enhance `server/middleware/rateLimits.ts` with tiered limits
- [ ] Create `server/middleware/backpressure.ts` for load monitoring
- [ ] Add K6 test: `k6/scenarios/limit-smoke.js`
- [ ] Update `server/index.ts` to register middleware

---

### PR#2: Circuit Breakers Enhancement ✅
**Status**: MOSTLY IMPLEMENTED
**Existing Infrastructure**:
- ✅ Custom circuit breaker: `server/infra/circuit-breaker/CircuitBreaker.ts`
- ✅ Registry pattern: `server/infra/circuit-breaker/breaker-registry.ts`
- ✅ HTTP breaker: `server/infra/circuit-breaker/http-breaker.ts`
- ✅ Cache breaker: `server/infra/circuit-breaker/cache-breaker.ts`
- ⚠️ Need: PostgreSQL integration with circuit breaker

**Integration Tasks**:
```typescript
// Wrap PostgreSQL queries with circuit breaker
// server/db/pg-wrapped.ts
import { CircuitBreaker } from '../infra/circuit-breaker';
import { pgPool } from './pg';

const dbBreaker = new CircuitBreaker('postgres', {
  failureThreshold: 5,
  resetTimeout: 30000,
  operationTimeout: 5000
});

export async function query<T>(text: string, params?: any[]): Promise<T> {
  return dbBreaker.execute(async () => {
    const result = await pgPool.query(text, params);
    return result.rows as T;
  });
}
```

**Files to Create/Modify**:
- [ ] Create `server/db/pg-wrapped.ts` with circuit breaker wrapper
- [ ] Update database queries to use wrapped version
- [ ] Add metrics for database circuit breaker

---

### PR#3: Security Headers (CSP/HSTS) 🔒
**Status**: NOT IMPLEMENTED
**Bundle File**: `server/middleware/security-headers.ts`

**Integration Tasks**:
```typescript
// server/middleware/security-headers.ts
import helmet from 'helmet';

export function securityHeaders() {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", process.env.API_ORIGIN || 'http://localhost:5000']
      }
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  });
}
```

**Files to Create**:
- [ ] Create `server/middleware/security-headers.ts`
- [ ] Add to Express app initialization
- [ ] Test CSP violations don't break functionality

---

### PR#4: Health Endpoint + Graceful Shutdown 🏥
**Status**: PARTIALLY IMPLEMENTED
**Existing Infrastructure**:
- ✅ Basic health: `server/routes/health.ts`
- ✅ Readiness check: `server/routes/readiness.ts`
- ⚠️ Need: Graceful shutdown handling

**Integration Tasks**:
```typescript
// server/graceful-shutdown.ts
export function setupGracefulShutdown(server: Server) {
  let isShuttingDown = false;
  
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    
    console.log(`${signal} received, starting graceful shutdown...`);
    
    // Stop accepting new connections
    server.close(() => {
      console.log('HTTP server closed');
    });
    
    // Close database connections
    await pgPool.end();
    
    // Close Redis connections
    await redis.quit();
    
    process.exit(0);
  };
  
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
```

**Files to Create/Modify**:
- [ ] Create `server/graceful-shutdown.ts`
- [ ] Update `server/index.ts` to register shutdown handlers
- [ ] Add readiness probe that checks shutdown state

---

### PR#5: Idempotency + Request Deduplication 🔄
**Status**: NOT IMPLEMENTED
**Bundle Files**: 
- `server/middleware/idempotency.ts`
- `server/middleware/dedupe.ts`

**Integration Tasks**:
```typescript
// server/middleware/idempotency.ts
import crypto from 'crypto';

export function idempotencyMiddleware(redis: Redis) {
  return async (req, res, next) => {
    const idempotencyKey = req.headers['idempotency-key'];
    if (!idempotencyKey) return next();
    
    const cacheKey = `idempotent:${idempotencyKey}`;
    const cached = await redis.get(cacheKey);
    
    if (cached) {
      const { status, body } = JSON.parse(cached);
      return res.status(status).json(body);
    }
    
    // Capture response
    const originalSend = res.send;
    res.send = function(data) {
      redis.setex(cacheKey, 3600, JSON.stringify({
        status: res.statusCode,
        body: JSON.parse(data)
      }));
      return originalSend.call(this, data);
    };
    
    next();
  };
}
```

**Files to Create**:
- [ ] Create `server/middleware/idempotency.ts`
- [ ] Create `server/middleware/dedupe.ts` for request deduplication
- [ ] Add tests for idempotent operations

---

## Week 2 PRs (Testing & Observability)

### PR#6: Property-Based Testing 🧪
**Bundle Files**:
- `tests/property/monte-carlo.property.test.ts`
- `tests/snapshots/monte-carlo.seeded.test.ts`

**Integration Strategy**:
- Add fast-check for property-based testing
- Create deterministic seed-based snapshot tests
- Integrate with existing Vitest setup

### PR#7: PostgreSQL Pool Tuning 🗄️
**Enhancement Areas**:
- Connection pool sizing based on workload
- Slow query logging and metrics
- Query timeout configuration
- Connection health monitoring

### PR#8: Feature Flags + API Versioning 🚦
**Components**:
- LaunchDarkly or Unleash integration
- API versioning middleware
- OpenAPI documentation per version
- Backward compatibility testing

### PR#9: Visual & Accessibility Testing ♿
**Testing Infrastructure**:
- Playwright for visual regression
- axe-core for accessibility
- Baseline image management
- CI integration for automated checks

### PR#10: Rollback Verification 🔄
**Automation Components**:
- Rollback drill scripts
- Synthetic monitoring via cron
- Version compatibility checks
- Data migration rollback tests

---

## Week 3 PRs (Chaos & Resilience)

### PR#11: Chaos Engineering for PostgreSQL 💥
**Chaos Scenarios**:
- Connection pool exhaustion
- Query latency injection
- Transaction deadlocks
- Replication lag simulation

### PR#12: WASM Fault Injector 🎯
**Advanced Testing**:
- WebAssembly-based fault injection
- Engine guard testing
- Memory corruption simulation
- CPU throttling tests

### PR#13: GDPR Compliance & Audit Trail 📊
**Privacy Components**:
- Data retention policies
- PII scrubbing utilities
- Audit trail middleware
- Right-to-be-forgotten implementation

### PR#14: Security Scanning Pipeline 🔐
**Security Automation**:
- Weekly vulnerability scans
- SBOM generation
- License compliance checks
- Container image scanning

---

## Week 4 PRs (Production Excellence)

### PR#15: Alert Correlation & Dashboards 📈
**Monitoring Enhancement**:
- Alert deduplication rules
- Burn-rate based alerting
- Service dependency mapping
- Custom Grafana dashboards

### PR#16: Rollback Drill Artifacts 📝
**Documentation**:
- Rollback runbooks
- Automated rollback tests
- Version compatibility matrix
- Recovery time objectives

### PR#17: OpenTelemetry Integration 🔍
**Distributed Tracing**:
- Correlation ID propagation
- Span creation for operations
- Trace sampling strategies
- Performance impact analysis

### PR#18: K6 Load Testing Suite 🏃
**Performance Tests**:
- Wizard flow load testing
- Endurance testing (24hr)
- Spike testing scenarios
- Capacity planning tests

### PR#19: Canary Deployment Strategy 🐤
**Progressive Rollout**:
- Canary scripts
- Success criteria definition
- Traffic splitting configuration
- Automated promotion/rollback

### PR#20: API Contract Testing 📜
**Contract Validation**:
- Consumer-driven contracts
- Breaking change detection
- Version compatibility checks
- Documentation generation

---

## Implementation Schedule

### Week 1 (Foundation)
- **Monday**: PR#1 Rate limits + backpressure
- **Tuesday**: PR#2 Circuit breaker enhancements
- **Wednesday**: PR#3 Security headers
- **Thursday**: PR#4 Health + graceful shutdown
- **Friday**: PR#5 Idempotency + deduplication

### Week 2 (Testing & Observability)
- **Monday**: PR#6 Property-based testing
- **Tuesday**: PR#7 PG pool tuning
- **Wednesday**: PR#8 Feature flags + versioning
- **Thursday**: PR#9 Visual & a11y testing
- **Friday**: PR#10 Rollback verification

### Week 3 (Chaos & Resilience)
- **Monday-Tuesday**: PR#11 Chaos for PostgreSQL
- **Tuesday-Wednesday**: PR#12 WASM fault injector
- **Wednesday-Thursday**: PR#13 GDPR & audit
- **Thursday-Friday**: PR#14 Security scanning

### Week 4 (Production Excellence)
- **Monday**: PR#15 Alert correlation
- **Tuesday**: PR#16 Rollback artifacts
- **Wednesday**: PR#17 OpenTelemetry
- **Thursday**: PR#18 K6 load tests
- **Friday**: PR#19-20 Canary + contracts

---

## Success Criteria

Each PR must meet:
1. ✅ All tests passing (unit, integration, e2e)
2. ✅ No performance regression (p95 < 400ms)
3. ✅ Feature flag for gradual rollout
4. ✅ Documentation updated
5. ✅ Monitoring/metrics in place
6. ✅ Rollback plan documented
7. ✅ Code review approved
8. ✅ Security scan passed

---

## Risk Mitigation

### Potential Risks
1. **Framework Mismatch**: Bundle uses Fastify, we use Express
   - **Mitigation**: Adapt middleware patterns to Express equivalents
   
2. **Existing Infrastructure**: We already have circuit breakers
   - **Mitigation**: Enhance rather than replace existing implementation
   
3. **Integration Complexity**: 20 PRs in 4 weeks is aggressive
   - **Mitigation**: Prioritize critical improvements, defer nice-to-haves
   
4. **Testing Overhead**: New test frameworks may slow CI
   - **Mitigation**: Parallelize tests, use test sharding

### Rollback Strategy
- Each PR behind feature flag
- Git revert for urgent rollbacks
- Database migrations with down scripts
- Blue-green deployment for zero-downtime rollback

---

## Next Steps

1. **Immediate Actions**:
   - [ ] Create feature branch for PR#1
   - [ ] Set up integration environment
   - [ ] Configure CI for new test types
   
2. **Team Alignment**:
   - [ ] Review plan with team
   - [ ] Assign PR owners
   - [ ] Schedule daily standups for progress tracking
   
3. **Monitoring Setup**:
   - [ ] Create dashboard for tracking PR metrics
   - [ ] Set up alerts for regression detection
   - [ ] Configure automated rollback triggers

---

*This plan integrates the PR scaffolds bundle with our existing Express-based infrastructure, leveraging our current circuit breaker implementation while adding the missing resilience patterns.*