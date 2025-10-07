# Scenario Analysis - Deployment Guide

**Version:** 1.0
**Date:** 2025-10-07
**Status:** Backend Ready for Deployment

---

## Prerequisites Checklist

- [ ] PostgreSQL database accessible
- [ ] Node.js 20+ installed
- [ ] Access to run database migrations
- [ ] Redis available (or memory:// for dev)
- [ ] Environment variables configured

---

## Phase 1: Database Migration (15 minutes)

### Step 1: Test Migration in Development

```bash
# Navigate to project root
cd /path/to/Updog_restore

# Test the UP migration
psql -U postgres -d updog_dev -f server/migrations/20251007_add_scenarios.up.sql

# Verify tables were created
psql -U postgres -d updog_dev -c "\d scenarios"
psql -U postgres -d updog_dev -c "\d scenario_cases"
psql -U postgres -d updog_dev -c "\d scenario_audit_logs"

# Expected output: Table definitions with indexes
```

### Step 2: Test Rollback

```bash
# Test the DOWN migration (rollback)
psql -U postgres -d updog_dev -f server/migrations/20251007_add_scenarios.down.sql

# Verify tables were dropped
psql -U postgres -d updog_dev -c "\d scenarios"
# Expected output: "Did not find any relation named 'scenarios'"

# Test idempotency (run again)
psql -U postgres -d updog_dev -f server/migrations/20251007_add_scenarios.down.sql
# Should not error (DROP IF EXISTS)
```

### Step 3: Re-apply Migration

```bash
# Re-run the UP migration
psql -U postgres -d updog_dev -f server/migrations/20251007_add_scenarios.up.sql

# Verify success message
# Expected: "Migration 20251007_add_scenarios completed successfully"
```

---

## Phase 2: Add Drizzle Schema Definitions

The backend API requires Drizzle ORM schema definitions. Add these to your existing schema file:

```typescript
// server/db/schema.ts (or wherever your schemas are defined)

import { pgTable, uuid, varchar, text, integer, boolean, timestamp, decimal, check } from 'drizzle-orm/pg-core';

export const scenarios = pgTable('scenarios', {
  id: uuid('id').primaryKey().defaultRandom(),
  company_id: uuid('company_id').notNull().references(() => portfolioCompanies.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  version: integer('version').notNull().default(1),
  is_default: boolean('is_default').notNull().default(false),
  locked_at: timestamp('locked_at'),
  created_by: uuid('created_by'),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
});

export const scenarioCases = pgTable('scenario_cases', {
  id: uuid('id').primaryKey().defaultRandom(),
  scenario_id: uuid('scenario_id').notNull().references(() => scenarios.id, { onDelete: 'cascade' }),
  case_name: varchar('case_name', { length: 255 }).notNull(),
  description: text('description'),
  probability: decimal('probability', { precision: 10, scale: 8 }).notNull(),
  investment: decimal('investment', { precision: 15, scale: 2 }).notNull().default('0'),
  follow_ons: decimal('follow_ons', { precision: 15, scale: 2 }).notNull().default('0'),
  exit_proceeds: decimal('exit_proceeds', { precision: 15, scale: 2 }).notNull().default('0'),
  exit_valuation: decimal('exit_valuation', { precision: 15, scale: 2 }).notNull().default('0'),
  months_to_exit: integer('months_to_exit'),
  ownership_at_exit: decimal('ownership_at_exit', { precision: 5, scale: 4 }),
  fmv: decimal('fmv', { precision: 15, scale: 2 }),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
});

export const scenarioAuditLogs = pgTable('scenario_audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: varchar('user_id', { length: 255 }),
  entity_type: varchar('entity_type', { length: 50 }).notNull(),
  entity_id: uuid('entity_id').notNull(),
  action: varchar('action', { length: 20 }).notNull(),
  diff: jsonb('diff'),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
});
```

---

## Phase 3: Update Backend Route Imports

Fix the imports in `server/routes/scenario-analysis.ts`:

```typescript
// Add to top of file (line 11)
import { db } from '../db';
import { scenarios, scenarioCases, scenarioAuditLogs, portfolioCompanies } from '../db/schema';
import { eq, and, sql } from 'drizzle-orm';
```

---

## Phase 4: Register API Route

Add the scenario analysis route to your Express app:

```typescript
// server/index.ts (or wherever routes are registered)

import scenarioAnalysisRoutes from './routes/scenario-analysis';

// Register route
app.use('/api', scenarioAnalysisRoutes);
```

---

## Phase 5: Build & Test

### TypeScript Compilation

```bash
# Run type checking
npm run check

# Expected: No errors in shared/utils/scenario-math.ts or shared/types/scenario.ts
# Note: server/routes/scenario-analysis.ts errors will resolve after schema is added
```

### Unit Tests (Optional but Recommended)

```bash
# Create test file
# tests/unit/scenario-math.test.ts

import { describe, it, expect } from 'vitest';
import { safeDiv, weighted, validateProbabilities, normalizeProbabilities } from '@shared/utils/scenario-math';

describe('scenario-math', () => {
  describe('safeDiv', () => {
    it('returns null for division by zero', () => {
      expect(safeDiv(10, 0)).toBeNull();
      expect(safeDiv(0, 0)).toBeNull();
    });

    it('calculates correctly', () => {
      expect(safeDiv(10, 2)).toBe(5);
      expect(safeDiv(1, 3)).toBeCloseTo(0.333333, 5);
    });
  });

  describe('validateProbabilities', () => {
    it('accepts valid sum', () => {
      const result = validateProbabilities([
        { probability: 0.3, case_name: 'A', investment: 0, follow_ons: 0, exit_proceeds: 0, exit_valuation: 0 },
        { probability: 0.7, case_name: 'B', investment: 0, follow_ons: 0, exit_proceeds: 0, exit_valuation: 0 },
      ]);
      expect(result.is_valid).toBe(true);
    });

    it('rejects invalid sum', () => {
      const result = validateProbabilities([
        { probability: 0.5, case_name: 'A', investment: 0, follow_ons: 0, exit_proceeds: 0, exit_valuation: 0 },
        { probability: 0.4, case_name: 'B', investment: 0, follow_ons: 0, exit_proceeds: 0, exit_valuation: 0 },
      ]);
      expect(result.is_valid).toBe(false);
      expect(result.sum).toBe(0.9);
    });
  });
});

# Run tests
npm test
```

---

## Phase 6: Production Deployment

### Pre-Deployment Checklist

- [ ] All TypeScript errors resolved
- [ ] Database migration tested (up + down + up)
- [ ] Drizzle schema definitions added
- [ ] API routes registered
- [ ] Unit tests passing
- [ ] Build succeeds (`npm run build`)

### Deployment Steps

```bash
# 1. Build application
npm run build

# 2. Run database migration on production
psql -U $DB_USER -d $DB_NAME -f server/migrations/20251007_add_scenarios.up.sql

# 3. Deploy application
# (Your standard deployment process - PM2, Docker, etc.)

# 4. Verify deployment
curl http://your-domain/api/health
```

### Post-Deployment Validation

```bash
# Test API endpoints
curl -X GET "http://localhost:5000/api/funds/FUND_ID/portfolio-analysis?metric=num_investments&view=construction&page=1&limit=50"

# Expected: 200 OK with pagination metadata

# Test scenario creation
curl -X POST "http://localhost:5000/api/companies/COMPANY_ID/scenarios" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Scenario", "description": "Testing deployment"}'

# Expected: 201 Created with scenario object
```

---

## Phase 7: Monitoring & Observability

### Metrics to Track

```typescript
// Add to your monitoring dashboard
{
  "scenario_api_duration": "Histogram of API response times",
  "scenario_409_conflicts": "Counter of version conflicts",
  "scenario_probability_validation_failures": "Counter of probability validation errors",
  "scenario_audit_log_writes": "Counter of audit logs written"
}
```

### Alerts to Configure

1. **Slow Queries:** Alert if `/portfolio-analysis` > 2 seconds
2. **High Conflict Rate:** Alert if 409 responses > 5% of total requests
3. **Failed Writes:** Alert on 500 errors in scenario PATCH/POST

### Log Queries

```sql
-- Check recent scenario changes
SELECT
  sal.timestamp,
  sal.user_id,
  sal.action,
  sal.entity_type,
  s.name as scenario_name
FROM scenario_audit_logs sal
LEFT JOIN scenarios s ON sal.entity_id = s.id::text
ORDER BY sal.timestamp DESC
LIMIT 20;

-- Check probability validation patterns
SELECT
  case_name,
  probability,
  scenario_id
FROM scenario_cases
WHERE probability > 1.0 OR probability < 0;
-- Expected: Empty result (constraint prevents invalid values)

-- Check weighted sums per scenario
SELECT
  scenario_id,
  SUM(probability) as total_probability
FROM scenario_cases
GROUP BY scenario_id
HAVING ABS(SUM(probability) - 1.0) > 0.01;
-- Shows scenarios with invalid probability sums
```

---

## Rollback Plan

### If Deployment Fails

```bash
# 1. Stop application
pm2 stop updog-api  # Or your process manager

# 2. Rollback database
psql -U $DB_USER -d $DB_NAME -f server/migrations/20251007_add_scenarios.down.sql

# 3. Revert code deployment
git revert HEAD  # Or restore previous version

# 4. Restart application
pm2 start updog-api
```

### If Partial Failure (API works, some features broken)

```bash
# Option 1: Disable scenario routes temporarily
# Comment out route registration in server/index.ts
# app.use('/api', scenarioAnalysisRoutes);

# Option 2: Add feature flag
# Set ENABLE_SCENARIO_ANALYSIS=false in environment
```

---

## Troubleshooting

### Issue: "Cannot find name 'scenarios'"

**Cause:** Drizzle schema not imported

**Fix:**
```typescript
// server/routes/scenario-analysis.ts
import { scenarios, scenarioCases, scenarioAuditLogs } from '../db/schema';
```

### Issue: "Migration failed: scenarios table was not created"

**Cause:** SQL syntax error or permission issue

**Fix:**
```bash
# Check PostgreSQL version (requires 12+)
psql --version

# Check user permissions
psql -U $DB_USER -d $DB_NAME -c "\du"

# Run migration with verbose output
psql -U $DB_USER -d $DB_NAME -f server/migrations/20251007_add_scenarios.up.sql -v ON_ERROR_STOP=1
```

### Issue: 409 Conflict on every save

**Cause:** Frontend not sending version field

**Fix:** (Frontend implementation - Phase 2)
```typescript
// Ensure version is included in PATCH request
const { version } = scenario;
await updateScenario({ scenario_id, cases, version });
```

### Issue: Probability validation always fails

**Cause:** Floating-point precision drift

**Solution:** Already handled by epsilon-based validation (±0.01%)

---

## Performance Benchmarks

### Expected Performance (5-person team, 20 companies)

| Endpoint | Expected Time | Acceptable | Alert Threshold |
|----------|--------------|------------|-----------------|
| GET portfolio-analysis | ~200ms | <500ms | >2s |
| GET scenario/:id | ~100ms | <300ms | >1s |
| PATCH scenario/:id | ~150ms | <400ms | >1s |
| POST reserves/optimize | ~500ms | <2s | >5s |

### Load Testing (Optional)

```bash
# Install autocannon
npm install -g autocannon

# Test portfolio analysis endpoint
autocannon -c 10 -d 30 http://localhost:5000/api/funds/FUND_ID/portfolio-analysis

# Expected:
# - Latency p95 < 500ms
# - No 500 errors
# - Throughput > 100 req/sec (likely much higher for 5 users)
```

---

## Success Criteria

✅ **Deployment is successful when:**

1. Database migration runs without errors
2. All TypeScript compiles without errors
3. API endpoints return expected responses
4. Audit logs are written for scenario changes
5. Optimistic locking prevents data loss (409 on conflict)
6. Performance meets benchmarks (<500ms for reads)

---

## Next Steps

After backend deployment is stable:

1. **Week 2:** Build frontend React components
2. **Week 3:** User acceptance testing with 5-person team
3. **Week 4:** Production deployment + monitoring
4. **Month 2:** Iterate based on feedback

---

**Questions or Issues?**

Contact: [Your team's support channel]

**Documentation:**
- API Spec: `docs/SCENARIO_ANALYSIS_IMPLEMENTATION_STATUS.md`
- Stability Review: `docs/SCENARIO_ANALYSIS_STABILITY_REVIEW.md`
- Math Utilities: `shared/utils/scenario-math.ts`
- Types: `shared/types/scenario.ts`
