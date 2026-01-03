---
description: "Pre-deployment database schema validation"
allowed-tools: Read, Bash, Grep, Glob
---

# DB Validate - Schema Validation Before Push

Comprehensive database schema validation before running `npm run db:push`.
Integrates schema-drift-checker agent with deploy-check Phase 5.

## When to Use

Run this command BEFORE:
- `npm run db:push`
- Any deployment that includes schema changes
- Merging PRs that modify `shared/db/schema/`

## Validation Phases

### Phase 1: Schema File Analysis

```bash
# Check for modified schema files
git diff --name-only main...HEAD | grep -E "shared/db/schema|drizzle"

# List all schema files
ls -la shared/db/schema/
```

**Checks:**
- [ ] Schema files are valid TypeScript
- [ ] No syntax errors in table definitions
- [ ] Export structure is correct

### Phase 2: Layer Alignment Check

Invoke `schema-drift-checker` agent to verify alignment:

```
PostgreSQL (if accessible)
    |
    v
Drizzle Schema (shared/db/schema/*.ts)
    |
    v
Zod Schemas (shared/schemas/*.ts)
    |
    v
TypeScript Types (inferred)
    |
    v
Mock Data (tests/fixtures/*.ts)
```

**For each layer, check:**
- Column names match
- Types are compatible
- Required/optional matches
- Defaults are consistent

### Phase 3: Migration Safety Analysis

**Safe Changes (Auto-approve):**
- Adding nullable columns
- Adding new tables
- Adding indexes
- Widening column types

**Unsafe Changes (Require confirmation):**
- Dropping columns (data loss risk)
- Renaming columns (code breakage)
- Changing NOT NULL constraints
- Narrowing column types

**Blocking Changes (Must fix):**
- Dropping tables with foreign key references
- Type changes that would truncate data
- Removing required columns without default

### Phase 4: Dry Run

```bash
# Show what would change without applying
npm run db:push -- --dry-run
```

**Output analysis:**
- List of CREATE statements
- List of ALTER statements
- List of DROP statements (highlight these)

### Phase 5: Rollback Plan Verification

For each unsafe change, verify:

- [ ] Rollback SQL documented
- [ ] Data backup strategy identified
- [ ] Rollback tested in staging (if applicable)

## Output Format

### On Success (Safe Changes Only)

```
+--------------------------------------------------+
|            DB VALIDATE - SCHEMA CHECK             |
+--------------------------------------------------+
|                                                  |
| [PASS] Phase 1: Schema files valid               |
| [PASS] Phase 2: Layer alignment verified         |
| [PASS] Phase 3: All changes are safe             |
| [PASS] Phase 4: Dry run successful               |
| [PASS] Phase 5: No rollback needed               |
|                                                  |
| Changes to apply:                                |
| + ADD COLUMN funds.status_v2 varchar(50)         |
| + CREATE INDEX idx_funds_vintage ON funds(...)   |
|                                                  |
| Safe to run: npm run db:push                     |
|                                                  |
+--------------------------------------------------+
```

### On Warning (Unsafe Changes)

```
+--------------------------------------------------+
|            DB VALIDATE - SCHEMA CHECK             |
+--------------------------------------------------+
|                                                  |
| [PASS] Phase 1: Schema files valid               |
| [PASS] Phase 2: Layer alignment verified         |
| [WARN] Phase 3: Unsafe changes detected          |
| [PASS] Phase 4: Dry run successful               |
| [WARN] Phase 5: Rollback plan needed             |
|                                                  |
| Unsafe changes requiring review:                 |
|                                                  |
| 1. DROP COLUMN users.legacy_id                   |
|    Risk: Data loss                               |
|    Mitigation: Backup table first                |
|                                                  |
| 2. ALTER COLUMN funds.amount NOT NULL            |
|    Risk: Existing NULL values will fail          |
|    Mitigation: Backfill NULLs before push        |
|                                                  |
| To proceed anyway:                               |
|   npm run db:push --force                        |
|                                                  |
| Recommended: Create rollback script first        |
|                                                  |
+--------------------------------------------------+
```

### On Failure (Blocking Issues)

```
+--------------------------------------------------+
|            DB VALIDATE - SCHEMA CHECK             |
+--------------------------------------------------+
|                                                  |
| [PASS] Phase 1: Schema files valid               |
| [FAIL] Phase 2: Schema drift detected            |
|                                                  |
| Drift found between layers:                      |
|                                                  |
| Drizzle: funds.status varchar(50)                |
| Zod:     funds.status z.enum([...])              |
| Mismatch: Zod uses enum, Drizzle uses varchar    |
|                                                  |
| Fix required before db:push                      |
|                                                  |
| Recommendation:                                  |
| Update Zod schema to match Drizzle:              |
|   status: z.string().max(50)                     |
|                                                  |
+--------------------------------------------------+
```

## Integration with schema-drift-checker Agent

This command delegates detailed analysis to the schema-drift-checker agent:

```
/db-validate
    |
    v
schema-drift-checker agent
    |
    +-- Analyzes: shared/db/schema/*.ts
    +-- Compares: shared/schemas/*.ts
    +-- Checks: tests/fixtures/*.ts
    |
    v
Report back to /db-validate
```

## Quick Mode

For faster validation during development:

```
/db-validate --quick
```

Quick mode:
- Skips Phase 2 (layer alignment)
- Skips Phase 5 (rollback verification)
- Only checks schema syntax and dry run

## Pre-Push Checklist

Before running `npm run db:push`:

- [ ] `/db-validate` passes all phases
- [ ] Unsafe changes reviewed and approved
- [ ] Rollback script ready (if needed)
- [ ] Backup taken (for production)
- [ ] Deployment window scheduled (if production)

## Related Commands and Agents

| Resource | Purpose |
|----------|---------|
| schema-drift-checker agent | Detailed drift analysis |
| db-migration agent | Complex migration planning |
| database-expert agent | Architecture decisions |
| database-schema-evolution skill | Migration patterns |
| /deploy-check | Full deployment validation |

## Automated Triggers

Consider adding to CI/CD:

```yaml
# .github/workflows/schema-check.yml
on:
  pull_request:
    paths:
      - 'shared/db/schema/**'
      - 'shared/schemas/**'

jobs:
  schema-validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run db:validate  # Runs this command
```

## Error Recovery

**If db:push fails after validation passed:**

1. Check for runtime differences (dev vs prod)
2. Verify connection string
3. Check for concurrent schema changes
4. Review PostgreSQL logs

**If schema-drift-checker finds issues:**

1. Update Zod schemas to match Drizzle
2. Update mock data to match new schema
3. Run tests to verify alignment
4. Re-run `/db-validate`
