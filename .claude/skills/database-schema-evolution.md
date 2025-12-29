# Database Schema Evolution

## Overview

Use when making database schema changes with Drizzle ORM. This skill covers
migration patterns, zero-downtime strategies, rollback procedures, and schema
drift detection specific to this codebase's PostgreSQL + Drizzle setup.

## Triggers

Activate this skill when you see:
- "drizzle" OR "migration" OR "schema change"
- "npm run db:push" OR "db:studio"
- "add column" OR "drop table" OR "alter table"
- "zero downtime" OR "backwards compatible"
- "schema drift" OR "type mismatch"

## Core Principles

1. **Never break production** - All changes must be backwards compatible
2. **Validate before push** - Always run schema-drift-checker first
3. **Additive first** - Add new, migrate data, then remove old
4. **Types follow schema** - Zod schemas must match Drizzle schemas

## Schema Change Categories

### Safe Changes (Can push directly)

- Adding nullable columns
- Adding tables
- Adding indexes (be mindful of table size)
- Widening column types (int → bigint, varchar(50) → varchar(100))

### Unsafe Changes (Require migration strategy)

- Dropping columns
- Renaming columns
- Changing column types (narrowing)
- Adding NOT NULL constraints
- Dropping tables

## Zero-Downtime Migration Pattern

### Phase 1: Expand

Add new structure without removing old:

```typescript
// shared/db/schema/funds.ts

// BEFORE
export const funds = pgTable('funds', {
  id: uuid('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  status: varchar('status', { length: 50 }).notNull(),
});

// AFTER - Add new column, keep old
export const funds = pgTable('funds', {
  id: uuid('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  status: varchar('status', { length: 50 }).notNull(),
  // NEW: More granular status
  statusV2: varchar('status_v2', { length: 50 }),  // Nullable initially
});
```

### Phase 2: Migrate

Backfill data in new column:

```typescript
// scripts/migrations/backfill-status-v2.ts
import { db } from '@/db';
import { funds } from '@shared/db/schema';
import { eq, isNull } from 'drizzle-orm';

async function backfillStatusV2() {
  const STATUS_MAPPING = {
    'active': 'investing',
    'closed': 'harvesting',
    'liquidating': 'liquidating',
  };

  const fundsToUpdate = await db
    .select()
    .from(funds)
    .where(isNull(funds.statusV2));

  for (const fund of fundsToUpdate) {
    await db
      .update(funds)
      .set({ statusV2: STATUS_MAPPING[fund.status] || 'unknown' })
      .where(eq(funds.id, fund.id));
  }
}
```

### Phase 3: Cutover

Update application code to use new column:

```typescript
// Update all queries to read from statusV2
// Update all writes to write to both status AND statusV2
// Deploy and verify

// server/routes/funds.ts
app.get('/api/funds/:id', async (req, res) => {
  const fund = await db.query.funds.findFirst({
    where: eq(funds.id, req.params.id),
  });

  // Return new field, fall back to old
  return {
    ...fund,
    status: fund.statusV2 || fund.status,  // Prefer new
  };
});
```

### Phase 4: Contract

Remove old column after verification period:

```typescript
// Only after confirming:
// 1. No queries use old column
// 2. All data migrated
// 3. Rollback window passed (1-2 weeks)

export const funds = pgTable('funds', {
  id: uuid('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  // status REMOVED
  statusV2: varchar('status_v2', { length: 50 }).notNull(),  // Now required
});
```

## Drizzle-Specific Patterns

### Schema Definition

```typescript
// shared/db/schema/funds.ts
import { pgTable, uuid, varchar, timestamp, numeric, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const funds = pgTable('funds', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  vintageYear: numeric('vintage_year', { precision: 4 }).notNull(),
  targetSize: numeric('target_size', { precision: 15, scale: 2 }),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Define relations
export const fundsRelations = relations(funds, ({ many }) => ({
  investments: many(investments),
  cashFlows: many(cashFlows),
}));
```

### Type Inference

```typescript
// Infer types from schema
import { InferSelectModel, InferInsertModel } from 'drizzle-orm';

export type Fund = InferSelectModel<typeof funds>;
export type NewFund = InferInsertModel<typeof funds>;

// Use in API routes
app.post('/api/funds', async (req, res) => {
  const newFund: NewFund = req.body;
  const fund = await db.insert(funds).values(newFund).returning();
  return fund[0];
});
```

### Schema Push Workflow

```bash
# 1. Validate schema alignment FIRST
npm run validate:schema  # or invoke schema-drift-checker agent

# 2. Review what will change
npm run db:push -- --dry-run

# 3. Push changes
npm run db:push

# 4. Verify in Drizzle Studio
npm run db:studio
```

## Schema Drift Detection

### Layer Alignment

Ensure all layers match:

```
PostgreSQL (source of truth)
    ↓
Drizzle Schema (shared/db/schema/*.ts)
    ↓
Zod Schemas (shared/schemas/*.ts)
    ↓
TypeScript Types (inferred from above)
    ↓
Mock Data (tests/fixtures/*.ts)
```

### Validation Script

```typescript
// scripts/validate-schema-alignment.ts
import { z } from 'zod';
import { funds } from '@shared/db/schema';
import { fundSchema } from '@shared/schemas/fund';

// Ensure Zod schema matches Drizzle columns
function validateSchemaAlignment() {
  const drizzleColumns = Object.keys(funds);
  const zodFields = Object.keys(fundSchema.shape);

  const missingInZod = drizzleColumns.filter(c => !zodFields.includes(c));
  const extraInZod = zodFields.filter(f => !drizzleColumns.includes(f));

  if (missingInZod.length || extraInZod.length) {
    console.error('Schema drift detected!');
    console.error('Missing in Zod:', missingInZod);
    console.error('Extra in Zod:', extraInZod);
    process.exit(1);
  }
}
```

## Rollback Strategies

### Soft Rollback (Preferred)

Keep both old and new, switch via feature flag:

```typescript
// Use feature flag to control which schema version is active
const USE_NEW_STATUS = process.env.FEATURE_STATUS_V2 === 'true';

function getFundStatus(fund: Fund): string {
  return USE_NEW_STATUS ? fund.statusV2 : fund.status;
}
```

### Hard Rollback (Emergency)

Restore from backup or reverse migration:

```sql
-- Emergency rollback script
-- Only use if soft rollback not possible

-- 1. Copy data back to old column
UPDATE funds SET status = status_v2 WHERE status IS NULL;

-- 2. Drop new column
ALTER TABLE funds DROP COLUMN status_v2;

-- 3. Restore NOT NULL if needed
ALTER TABLE funds ALTER COLUMN status SET NOT NULL;
```

## Pre-Push Checklist

Before running `npm run db:push`:

- [ ] Ran schema-drift-checker agent
- [ ] All Zod schemas updated to match
- [ ] Mock data updated for new columns
- [ ] Migrations are backwards compatible
- [ ] Rollback plan documented
- [ ] db-migration agent consulted for complex changes

## Common Pitfalls

### 1. Adding NOT NULL without default

**Bad:**
```typescript
newColumn: varchar('new_column', { length: 50 }).notNull(),
```

**Good:**
```typescript
newColumn: varchar('new_column', { length: 50 }).notNull().default('pending'),
```

### 2. Dropping columns with active queries

Always search codebase first:
```bash
grep -r "oldColumnName" server/ client/ shared/
```

### 3. Changing precision on numeric columns

Can cause data truncation - always check:
```sql
SELECT MAX(LENGTH(amount::text)) FROM transactions;
```

## Related Agents and Skills

- **schema-drift-checker** agent - Diagnoses alignment issues
- **db-migration** agent - Complex migration planning
- **database-expert** agent - Architecture decisions

## Related Documentation

- [Drizzle ORM docs](https://orm.drizzle.team/)
- [DECISIONS.md](DECISIONS.md) - Schema ADRs
- [shared/db/schema/](shared/db/schema/) - Schema definitions
