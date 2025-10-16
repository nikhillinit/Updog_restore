# AI Usage Ledger Migration Guide

**Migration:** `0001_ai_usage_ledger.sql`
**Date:** 2025-10-15
**Status:** Ready for Review
**Stream:** Schema Agent (Multi-Agent Workflow)

## Overview

This migration implements a reserve→settle→void ledger pattern for tracking AI API calls with full idempotency support and JSONB storage for responses.

## What This Migration Does

### 1. AI Usage Ledger Table

Creates `ai_usage_ledger` table with the following features:

- **Idempotency**: UNIQUE constraint on `idempotency_key` prevents duplicate AI calls
- **Ledger States**:
  - `reserved`: Initial state when request starts
  - `settled`: Successfully completed
  - `void`: Cancelled or failed
- **JSONB Storage**: Stores responses, models, tags, and metadata as JSON
- **Request Tracking**: Links via `request_id` and `correlation_id`
- **Usage Metrics**: Tracks tokens, cost, timing, success/failure counts

### 2. State Transition Management

Implements PostgreSQL triggers to enforce valid state transitions:

```
reserved → settled (success)
reserved → void (cancelled/error)
settled → void (rare correction)
```

Invalid transitions are blocked by trigger validation.

### 3. Materialized View for Analytics

Creates `ai_usage_daily_stats` for aggregated daily statistics:

- Request counts per user/day
- Token usage and cost rollups
- Success/failure rates
- Average response times
- Models and tags used

### 4. Indexes

Comprehensive indexing strategy:

- **B-tree indexes**: State, dates, user lookups
- **GIN indexes**: JSONB column queries (models, tags, responses)
- **Partial indexes**: Conditional indexes for settled/voided records

## Schema Design Decisions

### Why JSONB Instead of Separate Tables?

1. **Flexibility**: AI response structure varies by provider
2. **Performance**: Single table access vs multiple JOINs
3. **Query Power**: PostgreSQL's JSONB operators enable complex queries
4. **Schema Evolution**: Add new fields without ALTER TABLE

### Why Ledger Pattern?

The reserve→settle→void pattern provides:

1. **Idempotency**: Unique constraint prevents duplicate calls
2. **Audit Trail**: Track full lifecycle of each request
3. **Error Recovery**: Void failed attempts without data loss
4. **Budget Control**: Reserve quota before making expensive API calls

### Generated Columns for proposal_workflows

The migration includes a placeholder pattern for migrating text columns to JSONB with generated columns:

```sql
ALTER TABLE proposal_workflows
  ADD COLUMN proposal_data jsonb;

-- Backward-compatible generated TEXT column
ALTER TABLE proposal_workflows
  ADD COLUMN final_proposal_text text
  GENERATED ALWAYS AS (proposal_data->>'final_proposal') STORED;

-- Computed column for analytics
ALTER TABLE proposal_workflows
  ADD COLUMN iteration_count integer
  GENERATED ALWAYS AS (jsonb_array_length(proposal_data->'iterations')) STORED;
```

**Benefits:**
- Full-text search on generated columns
- Backward compatibility with existing queries
- Zero application code changes needed
- Automatic index updates

## Running the Migration

### Prerequisites

```bash
# Ensure PostgreSQL version supports JSONB (9.4+)
psql --version

# Backup database first
pg_dump -U username -d updog_db > backup_$(date +%Y%m%d).sql
```

### Apply Migration

```bash
# Dry run (review SQL)
cat migrations/0001_ai_usage_ledger.sql

# Apply to database
psql -U username -d updog_db -f migrations/0001_ai_usage_ledger.sql

# Or use Drizzle Kit
npm run db:push
```

### Verify Migration

```sql
-- Check table exists
SELECT tablename FROM pg_tables WHERE tablename = 'ai_usage_ledger';

-- Check indexes
SELECT indexname FROM pg_indexes WHERE tablename = 'ai_usage_ledger';

-- Check enum type
SELECT enumlabel FROM pg_enum WHERE enumtypid = 'ai_ledger_state'::regtype;

-- Check triggers
SELECT trigger_name FROM information_schema.triggers
WHERE event_object_table = 'ai_usage_ledger';

-- Check materialized view
SELECT * FROM ai_usage_daily_stats LIMIT 1;
```

## Integration with Existing Code

### 1. AI Orchestrator Integration

Update `server/services/ai-orchestrator.ts`:

```typescript
import { db } from '../db/drizzle';
import { aiUsageLedger } from '@shared/schema';
import { eq } from 'drizzle-orm';

export async function askAllAIs({ prompt, tags, models }: AskArgs) {
  const idempotencyKey = generateIdempotencyKey(prompt);

  // Reserve entry in ledger
  const [ledgerEntry] = await db.insert(aiUsageLedger).values({
    idempotencyKey,
    promptHash: sha256(prompt),
    models,
    tags,
    state: 'reserved',
  }).returning();

  try {
    // Make API calls...
    const results = await Promise.all(tasks);

    // Settle ledger entry
    await db.update(aiUsageLedger)
      .set({
        state: 'settled',
        responses: results,
        successfulCalls: results.filter(r => !r.error).length,
        failedCalls: results.filter(r => r.error).length,
        totalTokens: calculateTotalTokens(results),
        costUsd: calculateTotalCost(results),
        completedAt: new Date(),
      })
      .where(eq(aiUsageLedger.id, ledgerEntry.id));

    return results;
  } catch (error) {
    // Void ledger entry on failure
    await db.update(aiUsageLedger)
      .set({
        state: 'void',
        errorMessage: error.message,
        errorDetails: { stack: error.stack },
      })
      .where(eq(aiUsageLedger.id, ledgerEntry.id));

    throw error;
  }
}
```

### 2. Idempotency Middleware Integration

The ledger provides natural idempotency via unique constraint:

```typescript
// Check for existing settled request
const existing = await db.query.aiUsageLedger.findFirst({
  where: and(
    eq(aiUsageLedger.idempotencyKey, key),
    eq(aiUsageLedger.state, 'settled')
  ),
});

if (existing) {
  return existing.responses; // Return cached response
}
```

### 3. Usage Reporting

Query the materialized view for analytics:

```typescript
// Daily usage by user
const dailyUsage = await db.select()
  .from(aiUsageDailyStats)
  .where(
    and(
      eq(aiUsageDailyStats.userId, userId),
      gte(aiUsageDailyStats.usageDate, startDate)
    )
  )
  .orderBy(desc(aiUsageDailyStats.usageDate));
```

## Performance Considerations

### Index Usage

- **State queries**: Use `idx_ai_usage_ledger_state`
- **User history**: Use `idx_ai_usage_ledger_user_date`
- **Deduplication**: Use `idx_ai_usage_ledger_prompt_hash`
- **JSONB queries**: GIN indexes support containment queries

### Materialized View Refresh

```sql
-- Manual refresh
REFRESH MATERIALIZED VIEW CONCURRENTLY ai_usage_daily_stats;

-- Or set up scheduled refresh (in cron/scheduler)
-- Recommended: Every hour or daily depending on traffic
```

### Table Size Estimates

Assuming 10,000 AI requests/day:

- **Row size**: ~2KB (with JSONB responses)
- **Daily growth**: ~20MB
- **Monthly growth**: ~600MB
- **Yearly growth**: ~7GB

Consider implementing retention policy:

```sql
-- Archive records older than 90 days
DELETE FROM ai_usage_ledger
WHERE created_at < now() - interval '90 days'
  AND state IN ('settled', 'void');
```

## Rollback Plan

If issues arise, rollback using:

```sql
-- Drop materialized view
DROP MATERIALIZED VIEW IF EXISTS ai_usage_daily_stats;

-- Drop triggers
DROP TRIGGER IF EXISTS trg_ai_usage_ledger_updated_at ON ai_usage_ledger;
DROP TRIGGER IF EXISTS trg_validate_ai_ledger_state ON ai_usage_ledger;

-- Drop functions
DROP FUNCTION IF EXISTS update_ai_usage_ledger_updated_at();
DROP FUNCTION IF EXISTS validate_ai_ledger_state_transition();

-- Drop table
DROP TABLE IF EXISTS ai_usage_ledger;

-- Drop enum
DROP TYPE IF EXISTS ai_ledger_state;
```

**Note:** This will destroy all AI usage tracking data. Ensure backup exists before rollback.

## Testing Checklist

- [ ] Migration runs without errors
- [ ] All indexes created successfully
- [ ] Triggers enforce state transitions correctly
- [ ] UNIQUE constraint prevents duplicate idempotency keys
- [ ] Materialized view populates correctly
- [ ] Foreign key to users table works
- [ ] JSONB queries perform well with GIN indexes
- [ ] Generated columns (if using proposal_workflows pattern) update automatically
- [ ] Updated_at timestamp auto-updates on row changes
- [ ] Idempotency check returns cached responses

## Monitoring and Alerts

Set up monitoring for:

1. **Table growth rate**: Alert if > 100MB/day
2. **Failed call rate**: Alert if > 10% failures
3. **Cost anomalies**: Alert if daily cost spikes > 50%
4. **Materialized view staleness**: Refresh at least daily
5. **Index bloat**: Monitor with `pg_stat_user_indexes`

## Next Steps

After this migration:

1. **Stream B (Engine)**: Update `ai-orchestrator.ts` to use ledger
2. **Stream C (Provider)**: Implement idempotency checks
3. **Monitoring**: Set up Grafana dashboard for AI usage metrics
4. **Cleanup**: Migrate from file-based budget tracking to DB
5. **Documentation**: Update API docs with idempotency headers

## References

- [PostgreSQL JSONB Documentation](https://www.postgresql.org/docs/current/datatype-json.html)
- [Idempotency Best Practices](https://stripe.com/docs/api/idempotent_requests)
- [Materialized Views in PostgreSQL](https://www.postgresql.org/docs/current/sql-creatematerializedview.html)
- [Drizzle ORM JSONB Support](https://orm.drizzle.team/docs/column-types/pg#jsonb)

## Contact

**Questions?** Reach out to the Schema Agent team or open an issue in the repo.

**Migration Status:** ✅ Ready for review and testing
