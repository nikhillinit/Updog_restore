# Schema Alignment Guide

**Purpose**: How to keep schema layers synchronized
**Audience**: Developers, Agents
**Last Updated**: 2025-12-16

---

## Schema Layers

This project uses four schema layers that must stay aligned:

```
+-------------------+
| Migration SQL     |  Source of truth for database structure
+-------------------+
         |
         v
+-------------------+
| Drizzle Schema    |  TypeScript ORM representation
+-------------------+
         |
         v
+-------------------+
| Zod Schema        |  Runtime validation layer
+-------------------+
         |
         v
+-------------------+
| Mock Data         |  Test fixtures and seed data
+-------------------+
```

---

## Layer Responsibilities

### Migration SQL (Ground Truth)

**Location**: `drizzle/migrations/`

**Role**: Defines the actual database structure

```sql
CREATE TABLE funds (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  vintage_year INTEGER NOT NULL,
  target_size DECIMAL(15,2),
  created_at TIMESTAMP DEFAULT NOW()
);
```

**When to Modify**: Database schema changes

---

### Drizzle Schema (ORM Layer)

**Location**: `shared/schema.ts`

**Role**: TypeScript types for database operations

```typescript
export const funds = pgTable('funds', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  vintageYear: integer('vintage_year').notNull(),
  targetSize: decimal('target_size', { precision: 15, scale: 2 }),
  createdAt: timestamp('created_at').defaultNow(),
});
```

**When to Modify**: After migration, before Zod

---

### Zod Schema (Validation Layer)

**Location**: `shared/schemas/`

**Role**: Runtime validation and type inference

```typescript
export const FundSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(255),
  vintageYear: z.number().int().min(1990).max(2100),
  targetSize: z.number().positive().optional(),
  createdAt: z.date(),
});

export type Fund = z.infer<typeof FundSchema>;
```

**When to Modify**: After Drizzle, before mocks

---

### Mock Data (Test Layer)

**Location**: `tests/fixtures/` or inline in tests

**Role**: Realistic test data that validates against schema

```typescript
export const mockFund: Fund = {
  id: 1,
  name: 'Acme Ventures I',
  vintageYear: 2023,
  targetSize: 100000000,
  createdAt: new Date('2023-01-01'),
};

// Always validate mocks against schema
FundSchema.parse(mockFund);
```

**When to Modify**: After Zod schema changes

---

## Schema Drift Types

### 1. Missing Column

**Symptom**: Column exists in migration but not in Drizzle

```sql
-- Migration has:
ALTER TABLE funds ADD COLUMN status VARCHAR(50);

-- Drizzle missing:
// No 'status' field defined
```

**Detection**: `validate-schema-drift.sh` exits with code 1

**Fix**: Add field to Drizzle schema

---

### 2. Type Mismatch

**Symptom**: Types don't match between layers

```typescript
// Drizzle:
vintageYear: integer('vintage_year')

// Zod (incorrect):
vintageYear: z.string()  // Should be z.number()
```

**Detection**: Runtime validation failures

**Fix**: Align Zod type with Drizzle type

---

### 3. Orphaned Mock Field

**Symptom**: Mock has field that doesn't exist in schema

```typescript
// Mock:
const mockFund = {
  id: 1,
  name: 'Test',
  deprecatedField: 'oops',  // Doesn't exist in schema
};
```

**Detection**: `FundSchema.parse(mockFund)` throws

**Fix**: Remove orphaned field from mock

---

### 4. Missing Validation

**Symptom**: Zod schema less strict than database constraints

```sql
-- Database:
name VARCHAR(255) NOT NULL

-- Zod (incomplete):
name: z.string()  // Missing .min(1).max(255)
```

**Detection**: Database rejects valid Zod data

**Fix**: Add appropriate Zod constraints

---

## Alignment Workflow

### Adding a New Field

```
1. Write migration
   ALTER TABLE funds ADD COLUMN status VARCHAR(50) DEFAULT 'active';

2. Update Drizzle schema
   status: varchar('status', { length: 50 }).default('active'),

3. Update Zod schema
   status: z.enum(['active', 'closed', 'liquidating']).default('active'),

4. Update mocks
   status: 'active',

5. Run validator
   ./scripts/validate-schema-drift.sh
```

### Removing a Field

```
1. Update mocks (remove field)
2. Update Zod schema (remove field)
3. Update Drizzle schema (remove field)
4. Write migration (DROP COLUMN)
5. Run validator
```

### Changing a Type

```
1. Write migration (ALTER COLUMN)
2. Update Drizzle schema
3. Update Zod schema
4. Update mocks
5. Run validator
```

---

## Validation Script

`validate-schema-drift.sh` checks:

1. **Migration -> Drizzle**: All columns in migrations exist in Drizzle
2. **Drizzle -> Zod**: All Drizzle fields have Zod validators
3. **Zod -> Mocks**: All mocks pass Zod validation

```bash
./scripts/validate-schema-drift.sh
```

**Exit Codes**:
- `0`: All layers aligned
- `1`: Drift detected (see output for details)

---

## Agent Delegation

When `validate-schema-drift.sh` fails:

```
code-reviewer detects schema drift failure
    |
    v
Delegate to schema-drift-checker agent
    |
    v
Agent analyzes:
- Which layers are misaligned?
- What field(s) are affected?
- What order to fix?
    |
    v
Returns alignment report with fix steps
```

---

## Best Practices

1. **Migrate first**: Database is always the source of truth
2. **Top-down updates**: Migration -> Drizzle -> Zod -> Mocks
3. **Validate early**: Run drift check before committing
4. **Single responsibility**: Each layer has one job
5. **No shortcuts**: Don't skip layers when adding fields

---

## Common Mistakes

| Mistake | Consequence | Prevention |
|---------|-------------|------------|
| Skipping Drizzle | ORM queries fail | Always update Drizzle after migration |
| Loose Zod constraints | Invalid data passes validation | Match database constraints |
| Stale mocks | Tests pass but prod fails | Validate mocks against schema |
| Manual type casts | Type safety lost | Use Zod inference |

---

## Related Documentation

- [ci-validator-guide.md](ci-validator-guide.md)
- [../shared/schema.ts](../shared/schema.ts) - Drizzle schema
- [../shared/schemas/](../shared/schemas/) - Zod schemas
- [CLAUDE-INFRA-V4-INTEGRATION-PLAN.md](../docs/CLAUDE-INFRA-V4-INTEGRATION-PLAN.md)
