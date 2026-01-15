# ML Service Restoration Guide

**Date Archived:** 2026-01-14 **Reason:** ML service is scaffolding for future
capabilities but not currently deployed or used in production **Last Modified:**
2025-10-13 (commit 1f17503c)

## Restoration Complexity: LOW (1-2 hours)

The ML service has **excellent architectural isolation**. Restoration requires
minimal code changes because:

- Type imports only (`type { MlClient }`) - no runtime dependencies
- Adapter pattern with constructor injection (no hard coupling)
- No production code instantiates ML infrastructure
- No build/bundle configuration references ml-service

---

## Current Architecture (Dormant but Complete)

### Production Status

**INACTIVE:** Production uses `ConstrainedReserveEngine` directly in
`server/routes/v1/reserves.ts:8`

**NO PRODUCTION CODE:**

- Instantiates `MlClient`
- Instantiates `FeatureFlaggedReserveEngine`
- Calls ML prediction endpoints
- Configures ML environment variables

### Integration Points (All Dormant)

**1. HTTP Client:** `server/core/reserves/mlClient.ts` (237 lines)

- Fully implemented, production-ready
- No runtime usage - only type imports elsewhere
- Endpoints: `/health`, `/train`, `/predict`
- Features: Retry logic, timeout handling, SHAP explanations

**2. Feature-Flagged Adapter:** `server/core/reserves/adapter.ts` (300+ lines)

- Orchestrates ML + rules engines
- Requires `MlClient` via constructor (dependency injection)
- No production instantiation - only used in `scripts/backtest.ts`

**3. Backtest Script:** `scripts/backtest.ts`

- Research/testing script, not production code
- Only location that instantiates ML infrastructure
- Demonstrates intended integration pattern

---

## ML Service Technical Stack

**Python Service:**

- Base: python:3.11-slim
- Framework: FastAPI 0.115.0, Uvicorn 0.30.3
- ML: scikit-learn 1.4.2, Gradient Boosting Regressor
- Data: pandas 2.2.2, numpy, joblib

**Endpoints:**

- `GET /health` - Service health + model loaded status
- `POST /train` - Train model with historical data
- `POST /predict` - Reserve prediction with confidence intervals
- `GET /model/info` - Model metadata

**Docker:**

- Port: 8088
- Resource limits: 1.0 CPU / 512MB memory
- Volume mount: `./models:/app/models`

---

## Restoration Steps

### Phase 1: Deploy ML Service (15 minutes)

1. **Restore ml-service directory:**

   ```bash
   cp -r _archive/2026-01-obsolete/ml-service ./
   ```

2. **Add environment variables to `.env.example` and `.env`:**

   ```bash
   # ML Reserve Prediction Service
   ML_RESERVE_URL=http://localhost:8088
   ML_TIMEOUT_MS=1200
   ```

3. **Integrate into docker-compose.dev.yml:**

   ```yaml
   ml-reserve-service:
     build:
       context: ./ml-service
       dockerfile: Dockerfile
     ports:
       - '8088:8088'
     volumes:
       - ./ml-service/models:/app/models
     environment:
       - ENV=development
       - CORS_ORIGINS=http://localhost:5173,http://localhost:5000
     healthcheck:
       test: ['CMD', 'curl', '-f', 'http://localhost:8088/health']
       interval: 10s
       timeout: 5s
       retries: 3
   ```

4. **Add npm scripts to `package.json`:**

   ```json
   {
     "dev:ml": "docker compose -f docker-compose.dev.yml up ml-reserve-service -d",
     "ml:train": "curl -X POST http://localhost:8088/train -H 'Content-Type: application/json' -d @ml-service/training-data.json",
     "ml:health": "curl http://localhost:8088/health"
   }
   ```

5. **Start service and verify:**
   ```bash
   npm run dev:ml
   npm run ml:health  # Should return {"status":"ok","modelLoaded":false}
   ```

---

### Phase 2: Train Initial Model (30 minutes)

1. **Prepare training data:**
   - Export historical reserve decisions from database
   - Format as `MLTrainingRow[]` (see `mlClient.ts:17-22`)
   - Include: company data, market conditions, realized reserve usage, outcomes

2. **Create training dataset file:**

   ```json
   {
     "rows": [
       {
         "company": {
           "id": "comp-001",
           "stage": "Series A",
           "sector": "SaaS",
           "totalRaised": 5000000,
           "burnRate": 200000
         },
         "market": {
           "marketScore": 0.65,
           "timestamp": "2024-01-15T00:00:00Z"
         },
         "realizedReserveUsed": 1500000,
         "actualOutcome": "success"
       }
     ],
     "modelVersion": "v1.0-bootstrap",
     "hyperparameters": {
       "n_estimators": 100,
       "max_depth": 5,
       "learning_rate": 0.1
     }
   }
   ```

3. **Train model:**

   ```bash
   curl -X POST http://localhost:8088/train \
     -H 'Content-Type: application/json' \
     -d @ml-service/training-data.json
   ```

4. **Verify model loaded:**
   ```bash
   npm run ml:health  # Should now show "modelLoaded":true
   ```

---

### Phase 3: Enable ML in Production (15 minutes)

1. **No code changes required** - integration already exists

2. **Configure feature flags (gradual rollout):**

   ```typescript
   // In route/service initialization (e.g., server/providers.ts)
   import { MlClient } from './core/reserves/mlClient.js';
   import { FeatureFlaggedReserveEngine } from './core/reserves/adapter.js';

   const mlClient = new MlClient({
     baseUrl: process.env.ML_RESERVE_URL || 'http://localhost:8088',
     timeoutMs: parseInt(process.env.ML_TIMEOUT_MS || '1200'),
     retries: 2,
     backoffMs: 100,
   });

   const reserveEngine = new FeatureFlaggedReserveEngine(
     deterministicEngine,
     constrainedEngine,
     mlClient,
     {
       useMl: true,
       mode: 'hybrid', // Blend ML + rules
       mlWeight: 0.3, // 30% ML, 70% rules initially
       enableABTest: true,
       abTestPercentage: 5, // Only 5% of requests use ML
       fallbackOnError: true, // Always fall back to rules on error
       logAllDecisions: true,
     }
   );
   ```

3. **Update reserves route to use adapter:**

   ```typescript
   // server/routes/v1/reserves.ts
   - const engine = new ConstrainedReserveEngine();
   + const engine = reserveEngine; // Injected from providers
   ```

4. **Monitor and tune:**
   - Check `reserveDecisions` table for logged predictions
   - Monitor `fallbackCount` metric
   - Compare ML vs rules performance
   - Gradually increase `mlWeight` and `abTestPercentage`

---

### Phase 4: Production Deployment (Ongoing)

**Week 1-2: Shadow Mode (0% traffic)**

- ML service deployed, model trained
- `useMl: false` or `abTestPercentage: 0`
- Monitor service health and latency

**Week 3-4: A/B Test (5% traffic)**

- `abTestPercentage: 5`
- Compare ML vs rules decisions
- Validate prediction quality

**Week 5-8: Gradual Rollout (10% → 25% → 50%)**

- Increase `abTestPercentage` if metrics look good
- Monitor `fallbackCount` - should be < 1%
- Adjust `mlWeight` in hybrid mode

**Week 9+: Full Rollout**

- `mode: 'ml'` or `mlWeight: 0.8+`
- Rules as fallback only
- Continuous model retraining

---

## Production Checklist

**Before enabling in production:**

- [ ] ML service deployed with health checks
- [ ] Initial model trained with ≥100 historical data points
- [ ] Model accuracy validated (R² > 0.7)
- [ ] Fallback to rules engine tested
- [ ] Monitoring/alerting configured for ML service
- [ ] A/B test logging confirmed working
- [ ] Prediction latency < 500ms p95
- [ ] Error rate < 0.1%

**Monitoring metrics:**

- ML service uptime and health
- Prediction latency (p50, p95, p99)
- Fallback rate (should be < 1%)
- Prediction accuracy vs actual outcomes
- Model staleness (days since last training)

---

## Zero Breaking Changes

**Why restoration is so easy:**

1. **Type imports only:** `adapter.ts:18` uses `type { MlClient }` - compiled
   away, no runtime dependency
2. **Constructor injection:** `MlClient` passed into adapter, not instantiated
   inside
3. **No production instantiation:** Only `scripts/backtest.ts` creates ML
   infrastructure
4. **Clean separation:** Production routes use `ConstrainedReserveEngine`
   directly
5. **No build config:** TypeScript, Vite, ESLint have no ml-service references

**Archiving ml-service/ will NOT break:**

- TypeScript compilation
- Vite build
- ESLint checks
- Production runtime
- Any tests (ml-service not imported by test files)

**Only backtest.ts will fail** - which is expected since it's a research script.

---

## Cost Estimate

**Development time:** 1-2 hours for basic restoration **Training data prep:**
2-4 hours (depends on data availability) **Initial training:** 30 minutes **A/B
testing period:** 2-4 weeks recommended **Full rollout:** 8-12 weeks safe
timeline

**Infrastructure cost:**

- Development: $0 (runs locally)
- Staging: ~$20/month (single container)
- Production: ~$100-200/month (HA setup with 2-3 replicas)

**Risk:** Very low - fallback to rules engine is battle-tested

---

## When to Restore

**Good reasons:**

- Historical data shows clear patterns ML could learn
- Reserve predictions need to adapt to market conditions
- Experimentation with A/B testing desired
- ML expertise available on team

**Bad reasons:**

- Rules engine is working fine
- No historical data for training
- No capacity for model maintenance
- ML accuracy not validated

---

## Support

**Original implementation:** Oct 2025 (commit 1f17503c) **Integration files
(preserved in codebase):**

- `server/core/reserves/mlClient.ts`
- `server/core/reserves/adapter.ts`
- `scripts/backtest.ts`

**Questions?** See backtest.ts for example usage patterns.
