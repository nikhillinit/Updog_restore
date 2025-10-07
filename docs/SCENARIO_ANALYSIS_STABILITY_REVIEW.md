# Scenario Analysis Integration - Multi-AI Stability Review

**Review Date:** 2025-10-07
**Reviewers:** GPT-4o, Gemini 2.5 Pro, DeepSeek
**Total Cost:** $0.0011
**Review Duration:** ~2 minutes

---

## Executive Summary

All three AI models **agreed the integration plan is generally sound** but identified **4 critical blockers** that must be addressed before proceeding. The phased rollout strategy and decimal.js usage were universally praised.

### Consensus Strengths ✅
- Clear separation of concerns (Portfolio vs Deal views)
- Appropriate use of decimal.js for financial precision
- Phased 8-week deployment minimizes risk
- Shared types strategy reduces coupling
- Lazy loading for bundle optimization

### Unanimous Critical Blockers 🔴
1. **Race Conditions** - Missing concurrency control on PUT endpoint
2. **No Authorization** - Security vulnerability in scenario editing
3. **Database Migration Safety** - No rollback scripts
4. **Scalability Issues** - Portfolio analysis won't scale to 100+ companies

---

## Detailed Findings by Model

### GPT-4o Review

**Key Strengths:**
- RESTful and maintainable API design
- Decimal.js prevents floating-point errors
- Lazy loading improves initial load times

**Top Warnings:**
- Probability normalization may drift with many operations
- N+1 query risk in Deal Modeling view
- Validation UX needs user feedback
- Δ(%) calculation misleading when construction = 0

**Critical Recommendations:**
1. Implement optimistic locking with version field
2. Add comprehensive regression tests for schema changes
3. Provide visual indicators for auto-normalization
4. Set up monitoring (New Relic/Grafana)
5. Add role-based access control and audit logs

---

### Gemini 2.5 Pro Review

**Key Strengths:**
- Modern tech stack (TanStack Query, Drizzle, shadcn/ui)
- Type safety with shared types
- Phased rollout de-risks launch

**Top Warnings:**
- API endpoint too coarse (entire array for single change)
- `include=rounds,cases` parameter is N+1 red flag
- Auto-normalize can be disorienting to users
- Unclear migration path from existing scenario builder

**Critical Recommendations:**
1. **Optimistic Locking:** Add `version` column to `scenarios` table
   ```sql
   ALTER TABLE scenarios ADD COLUMN version INTEGER DEFAULT 1;
   ```
2. **Pre-computation Strategy:** Use materialized views or ETL jobs for portfolio analysis
3. **Granular API:** Split into `POST /cases`, `PATCH /cases/:id`, `DELETE /cases/:id`
4. **Audit Logging:** Create `audit_logs` table with JSONB diff column
5. **Serialize as Strings:** Use `"123.456789"` format to prevent precision loss in transit

---

### DeepSeek Review

**Key Strengths:**
- Clear migration path from scenario builder
- Safe division utility prevents runtime errors
- 8-phase rollout allows controlled deployment

**Top Warnings:**
- `safeDiv(0,0)` should return `null` not `0`
- Missing pagination for large datasets
- Complex React Query cache invalidation needed
- No error boundaries for failed chart renders

**Critical Recommendations:**
1. **Race Condition Fix:**
   ```typescript
   PUT /api/companies/:companyId/scenario-analysis?version={timestamp}
   ```
2. **Split API for Scalability:**
   ```typescript
   GET /api/funds/:fundId/portfolio-analysis/summary
   GET /api/funds/:fundId/portfolio-analysis/companies?page=&limit=
   ```
3. **Database Indexing:**
   ```sql
   CREATE INDEX idx_scenarios_company_id ON scenarios(company_id);
   CREATE INDEX idx_scenario_cases_scenario_id ON scenario_cases(scenario_id);
   ```
4. **Precision-Aware Validation:**
   ```typescript
   const validateProbabilities = (cases, epsilon = 0.0001) => {
     const sum = cases.reduce((acc, c) => acc + c.probability, 0);
     return Math.abs(1 - sum) < epsilon;
   };
   ```

---

## Consensus Critical Actions (Before Proceeding)

### 1. Concurrency Control (ALL MODELS)

**Problem:** Two users editing same scenario → last save overwrites changes

**Solution:**
```typescript
// shared/types/scenario.ts
export interface Scenario {
  id: string;
  company_id: string;
  name: string;
  version: number; // Add this
  // ...
}

// API validation
app.put('/companies/:companyId/scenario-analysis', async (req, res) => {
  const { scenario_id, cases, version } = req.body;

  // Check version match
  const current = await db.query.scenarios.findFirst({
    where: eq(scenarios.id, scenario_id)
  });

  if (current.version !== version) {
    return res.status(409).json({
      error: 'Conflict',
      message: 'Scenario was modified by another user. Please refresh.',
      current_version: current.version
    });
  }

  // Update with incremented version
  await db.update(scenarios)
    .set({ version: current.version + 1, cases })
    .where(eq(scenarios.id, scenario_id));
});
```

### 2. Authorization & Security (ALL MODELS)

**Problem:** No access control for scenario editing

**Solution:**
```typescript
// middleware/auth.ts
export const requireFundAccess = (permission: 'read' | 'write') => {
  return async (req, res, next) => {
    const { companyId } = req.params;
    const userId = req.user.id;

    // Check if user has access to company's fund
    const company = await db.query.portfolioCompanies.findFirst({
      where: eq(portfolioCompanies.id, companyId),
      with: { fund: true }
    });

    const hasAccess = await checkUserFundPermission(
      userId,
      company.fund.id,
      permission
    );

    if (!hasAccess) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    next();
  };
};

// Apply to endpoints
app.put('/companies/:companyId/scenario-analysis',
  requireFundAccess('write'),
  async (req, res) => { /* ... */ }
);
```

### 3. Database Migration Safety (ALL MODELS)

**Problem:** No rollback scripts for schema changes

**Solution:**
```sql
-- migrations/YYYYMMDD_add_scenarios.up.sql
CREATE TABLE scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES portfolio_companies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  version INTEGER DEFAULT 1,
  is_default BOOLEAN DEFAULT false,
  locked_at TIMESTAMP,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_scenarios_company_id ON scenarios(company_id);

CREATE TABLE scenario_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id UUID NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  case_name VARCHAR(255) NOT NULL,
  probability DECIMAL(5,4) NOT NULL CHECK (probability >= 0 AND probability <= 1),
  description TEXT,
  investment DECIMAL(15,2),
  follow_ons DECIMAL(15,2),
  exit_proceeds DECIMAL(15,2),
  exit_valuation DECIMAL(15,2),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_scenario_cases_scenario_id ON scenario_cases(scenario_id);

-- migrations/YYYYMMDD_add_scenarios.down.sql
DROP TABLE IF EXISTS scenario_cases CASCADE;
DROP TABLE IF EXISTS scenarios CASCADE;
```

### 4. Scalability & Performance (ALL MODELS)

**Problem:** Portfolio analysis won't scale to 100+ companies

**Solutions (choose one):**

**Option A: Materialized View**
```sql
CREATE MATERIALIZED VIEW portfolio_analysis_summary AS
SELECT
  f.id as fund_id,
  entry_round,
  COUNT(*) FILTER (WHERE type = 'construction') as construction_count,
  COUNT(*) FILTER (WHERE type = 'actual') as actual_count,
  COUNT(*) FILTER (WHERE type = 'current') as current_count,
  SUM(amount) FILTER (WHERE type = 'construction') as construction_capital,
  SUM(amount) FILTER (WHERE type = 'actual') as actual_capital,
  SUM(amount) FILTER (WHERE type = 'current') as current_capital
FROM portfolio_companies pc
JOIN funds f ON pc.fund_id = f.id
GROUP BY f.id, entry_round;

-- Refresh every 15 minutes
CREATE OR REPLACE FUNCTION refresh_portfolio_analysis()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY portfolio_analysis_summary;
END;
$$ LANGUAGE plpgsql;
```

**Option B: Pagination + Server Caching**
```typescript
// Add pagination
app.get('/funds/:fundId/portfolio-analysis', async (req, res) => {
  const { page = 1, limit = 50 } = req.query;

  // Cache for 5 minutes
  res.set('Cache-Control', 'private, max-age=300');

  const cacheKey = `portfolio:${fundId}:${page}:${limit}`;
  const cached = await redis.get(cacheKey);
  if (cached) return res.json(JSON.parse(cached));

  const results = await db.query.portfolioCompanies.findMany({
    where: eq(portfolioCompanies.fundId, fundId),
    limit: Number(limit),
    offset: (Number(page) - 1) * Number(limit)
  });

  await redis.setex(cacheKey, 300, JSON.stringify(results));
  res.json(results);
});
```

---

## Additional High-Priority Recommendations

### Math Precision Enhancements

```typescript
// shared/utils/scenario-math.ts

// Fix division edge case (all models agreed)
export const safeDiv = (n: number, d: number): number | null => {
  if (d === 0) return null; // Not 0!
  return new Decimal(n).div(d).toNumber();
};

// Add epsilon-based validation (DeepSeek)
export const validateProbabilities = (
  cases: ScenarioCase[],
  epsilon = 0.0001
): boolean => {
  const sum = cases.reduce((acc, c) => acc + c.probability, 0);
  return Math.abs(1 - sum) < epsilon;
};

// Serialize as strings to prevent precision loss (Gemini)
export const serializeDecimal = (value: Decimal | number): string => {
  return new Decimal(value).toFixed(10); // Max 10 decimals
};
```

### Audit Logging

```typescript
// shared/types/audit.ts
export interface AuditLog {
  id: string;
  user_id: string;
  entity_type: 'scenario' | 'scenario_case';
  entity_id: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  diff: Record<string, any>; // JSONB
  timestamp: Date;
}

// server/routes/scenario-analysis.ts
app.put('/companies/:companyId/scenario-analysis', async (req, res) => {
  // ... validation ...

  const old = await getScenario(scenario_id);
  const updated = await updateScenario(scenario_id, cases);

  // Log changes
  await db.insert(auditLogs).values({
    user_id: req.user.id,
    entity_type: 'scenario',
    entity_id: scenario_id,
    action: 'UPDATE',
    diff: {
      old: old.cases,
      new: updated.cases
    },
    timestamp: new Date()
  });

  res.json(updated);
});
```

### Monitoring & Observability

```typescript
// server/middleware/metrics.ts
export const scenarioMetrics = (req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;

    metrics.histogram('scenario_api_duration', duration, {
      endpoint: req.path,
      method: req.method,
      status: res.statusCode
    });

    if (duration > 5000) {
      logger.warn('Slow scenario API call', {
        endpoint: req.path,
        duration,
        fund_id: req.params.fundId
      });
    }
  });

  next();
};

// Apply to all scenario endpoints
app.use('/api/*/scenario-analysis', scenarioMetrics);
```

---

## Rollback Strategy (Per Phase)

| Phase | Rollback Action |
|-------|----------------|
| 1-2 (Backend) | Run `migrations/*.down.sql`, restore from backup |
| 3 (Portfolio View) | Feature flag `ENABLE_PORTFOLIO_ANALYSIS=false` |
| 4 (Deal View) | Keep `/scenario-builder` as fallback |
| 5 (Reserves) | Disable drawer, keep existing reserve workflow |
| 6-8 (Polish) | Revert UI commits, restore previous version |

---

## Testing Requirements (All Models Agreed)

### Unit Tests
```typescript
// shared/utils/__tests__/scenario-math.test.ts
describe('safeDiv', () => {
  it('returns null for division by zero', () => {
    expect(safeDiv(10, 0)).toBeNull();
  });

  it('returns null for 0/0', () => {
    expect(safeDiv(0, 0)).toBeNull(); // Not 0!
  });

  it('calculates correctly with decimals', () => {
    expect(safeDiv(1, 3)).toBeCloseTo(0.333333, 6);
  });
});

describe('weighted', () => {
  it('calculates weighted average correctly', () => {
    const cases = [
      { probability: 0.5, moic: 3.0, exit: 100000 },
      { probability: 0.5, moic: 2.0, exit: 50000 }
    ];

    const result = weighted(cases);
    expect(result.moic).toBe(2.5);
    expect(result.exit).toBe(75000);
  });

  it('handles precision with many cases', () => {
    const cases = Array.from({ length: 100 }, (_, i) => ({
      probability: 0.01,
      value: i
    }));

    const result = weighted(cases);
    expect(result.value).toBeCloseTo(49.5, 2);
  });
});
```

### Integration Tests
```typescript
// tests/api/scenario-analysis.test.ts
describe('PUT /scenario-analysis', () => {
  it('rejects update with stale version', async () => {
    const scenario = await createScenario({ version: 1 });

    // Simulate concurrent update
    await updateScenario(scenario.id, { version: 1 }); // Increments to 2

    const res = await request(app)
      .put(`/companies/${companyId}/scenario-analysis`)
      .send({ scenario_id: scenario.id, version: 1, cases: [] });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Conflict');
  });

  it('requires authorization', async () => {
    const res = await request(app)
      .put(`/companies/${companyId}/scenario-analysis`)
      .set('Authorization', `Bearer ${unauthorizedToken}`)
      .send({ cases: [] });

    expect(res.status).toBe(403);
  });
});
```

---

## Conclusion

The Scenario Analysis integration plan is **architecturally sound** with a strong foundation (decimal.js, shared types, phased rollout). However, **proceeding without addressing the 4 critical blockers would be irresponsible** and risks data loss, security vulnerabilities, and performance issues.

### Go/No-Go Decision

**RECOMMENDATION: GO - WITH CONDITIONS**

Proceed to Phase 1 (Backend) **only after**:
1. ✅ Optimistic locking implementation complete
2. ✅ Authorization middleware implemented
3. ✅ Database rollback scripts written and tested
4. ✅ Performance testing confirms scalability to 100+ companies

**Estimated Time to Address Blockers:** 2-3 weeks

---

## Sign-Off

**AI Reviewers:**
- ✅ GPT-4o (OpenAI) - 1,819 tokens, $0.0006
- ✅ Gemini 2.5 Pro (Google) - 5,774 tokens, $0.0000
- ✅ DeepSeek - 2,405 tokens, $0.0005

**Total Review Cost:** $0.0011
**Review Completed:** 2025-10-07
