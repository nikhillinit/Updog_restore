---
status: ACTIVE
last_updated: 2026-01-19
---

# Row-Level Security (RLS) Development Guide

Complete guide for developing and testing multi-tenant features with PostgreSQL Row-Level Security.

## Quick Start (5 Minutes)

```bash
# 1. Start local infrastructure
docker compose up -d

# 2. Run migrations to add RLS tables
npm run db:push

# 3. Seed multi-tenant test data
npm run seed:multi-tenant

# 4. Verify setup
psql $DATABASE_URL -c "SELECT * FROM organizations;"
```

You now have:
- 2 test organizations: `tech-ventures`, `bio-capital`
- 5 funds total (3 + 2)
- 11 companies total (6 + 5)
- ~25 investments with realistic data
- Full RLS isolation enabled

## Architecture Overview

### Tenant Isolation Model

```
organizations (id, slug, name)
     |
     +-- funds (org_id FK)
     +-- portfoliocompanies (org_id FK)
     +-- investments (org_id FK)
     +-- fundconfigs (org_id FK)
```

All queries are filtered by `org_id = current_org_id()` via RLS policies.

### Session-Based Context

PostgreSQL session variables store the current tenant:

```sql
-- Set context
SELECT switch_tenant(42);  -- By ID
SELECT switch_tenant((SELECT id FROM organizations WHERE slug = 'tech-ventures'));

-- Get context
SELECT current_org_id();  -- Returns 42 or NULL

-- Reset (admin mode)
SELECT reset_tenant();  -- See all records
```

## Development Workflows

### 1. Start Server with Tenant Context

**VSCode Launch Configurations** (F5 key):

- **API Server (Tech Ventures Tenant)** - Default to tech-ventures
- **API Server (Bio Capital Tenant)** - Default to bio-capital
- **API Server (No Tenant - Admin)** - Bypass RLS (see all records)

Or via CLI:

```bash
# Set default tenant via environment variable
DEFAULT_ORG_SLUG=tech-ventures npm run dev:api

# Admin mode (bypass RLS)
BYPASS_RLS=true npm run dev:api
```

### 2. Test RLS Isolation

Use VSCode snippets (type `rls-` and press Tab):

```typescript
// rls-test-switch - Switch tenant in tests
await db.execute(sql`SELECT switch_tenant((SELECT id FROM organizations WHERE slug = 'tech-ventures'))`);

// Your test code here
const funds = await db.select().from(fundsTable);

// Reset tenant context
await db.execute(sql`SELECT reset_tenant()`);
```

**Complete Test Example:**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db';
import { withTenantContext, switchTenant, resetTenant } from '@/lib/tenant-context';
import { funds } from '@shared/schema';

describe('Funds RLS isolation', () => {
  beforeEach(async () => {
    await resetTenant(db);
  });

  it('should isolate funds by organization', async () => {
    // Tech Ventures context
    const techFunds = await withTenantContext(db, 'tech-ventures', async () => {
      return await db.select().from(funds);
    });

    // Bio Capital context
    const bioFunds = await withTenantContext(db, 'bio-capital', async () => {
      return await db.select().from(funds);
    });

    // Verify isolation
    expect(techFunds).toHaveLength(3);
    expect(bioFunds).toHaveLength(2);
    expect(techFunds[0].orgId).not.toBe(bioFunds[0].orgId);
  });

  it('should prevent cross-tenant updates', async () => {
    // Create fund in tech-ventures
    await switchTenant(db, 'tech-ventures');
    const [fund] = await db.insert(funds).values({
      name: 'Test Fund',
      size: '10000000',
      // ... other fields
    }).returning();

    // Try to update from bio-capital (should fail)
    await switchTenant(db, 'bio-capital');
    const result = await db.update(funds)
      .set({ size: '20000000' })
      .where(eq(funds.id, fund.id));

    expect(result.rowCount).toBe(0); // No rows updated

    await resetTenant(db);
  });
});
```

### 3. Helper Library Usage

Import from `@/lib/tenant-context`:

```typescript
import {
  switchTenant,          // Switch by slug
  switchTenantById,      // Switch by ID
  resetTenant,           // Clear context
  getCurrentTenant,      // Get current context
  withTenantContext,     // Execute with auto-reset
  listOrganizations,     // Get all orgs
  verifyRLS,             // Check RLS status
  getTenantIndicator,    // Visual terminal indicator
} from '@/lib/tenant-context';

// Auto-cleanup pattern (RECOMMENDED)
const funds = await withTenantContext(db, 'tech-ventures', async () => {
  return await db.select().from(fundsTable);
});
// Context automatically reset

// Manual control
await switchTenant(db, 'bio-capital');
const companies = await db.select().from(companiesTable);
await resetTenant(db);

// Check current context
const context = await getCurrentTenant(db);
console.log(`Current tenant: ${context?.orgName}`);

// Visual indicator for logging
console.log(await getTenantIndicator(db));
// Output: [TENANT: tech-ventures (Tech Ventures LLC)]
```

### 4. Middleware Pattern (Express)

```typescript
import { setTenantFromRequest } from '@/lib/tenant-context';

// Extract tenant from JWT claims
app.use(async (req, res, next) => {
  const orgSlug = req.user?.orgSlug; // From JWT
  if (orgSlug) {
    await setTenantFromRequest(db, orgSlug);
  }
  next();
});

// Or from header
app.use(async (req, res, next) => {
  const orgSlug = req.headers['x-org-slug'] as string;
  if (orgSlug) {
    await switchTenant(db, orgSlug);
  }
  next();
});
```

## VSCode Snippets Reference

Type prefix and press Tab to expand:

| Prefix | Description |
|--------|-------------|
| `rls-policy-select` | SELECT policy with tenant isolation |
| `rls-policy-insert` | INSERT policy with tenant check |
| `rls-policy-update` | UPDATE policy with tenant isolation |
| `rls-policy-delete` | DELETE policy with tenant check |
| `rls-policy-full` | Complete CRUD policy suite |
| `rls-test-switch` | Switch tenant in tests |
| `rls-test-isolation` | Complete isolation test suite |
| `rls-helper-current` | Get current tenant ID |
| `rls-helper-with-context` | Execute with tenant context |
| `rls-migration-add-orgid` | Add org_id to table |
| `rls-check-policies` | SQL to check policies |
| `rls-debug-context` | Debug current context |

## Common Patterns

### Pattern 1: Create RLS-Enabled Table

```sql
-- 1. Create table with org_id
CREATE TABLE my_table (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_my_table_org_id ON my_table(org_id);

-- 2. Enable RLS
ALTER TABLE my_table ENABLE ROW LEVEL SECURITY;

-- 3. Create policies (use snippet: rls-policy-full)
CREATE POLICY my_table_select_policy ON my_table
  FOR SELECT USING (org_id = current_org_id());

CREATE POLICY my_table_insert_policy ON my_table
  FOR INSERT WITH CHECK (org_id = current_org_id());

CREATE POLICY my_table_update_policy ON my_table
  FOR UPDATE
  USING (org_id = current_org_id())
  WITH CHECK (org_id = current_org_id());

CREATE POLICY my_table_delete_policy ON my_table
  FOR DELETE USING (org_id = current_org_id());
```

### Pattern 2: Test Cross-Tenant Isolation

```typescript
it('should prevent data leakage between tenants', async () => {
  // Setup: Create record in org1
  await switchTenant(db, 'tech-ventures');
  const [record] = await db.insert(myTable).values({
    orgId: (await getCurrentTenant(db))!.orgId,
    name: 'Secret Data',
  }).returning();

  // Attempt: Try to read from org2
  await switchTenant(db, 'bio-capital');
  const leaked = await db.select().from(myTable).where(eq(myTable.id, record.id));

  // Verify: Should not see the record
  expect(leaked).toHaveLength(0);

  await resetTenant(db);
});
```

### Pattern 3: Verify RLS Health

```typescript
import { verifyRLS } from '@/lib/tenant-context';

describe('RLS health check', () => {
  it('should have RLS enabled on all tenant tables', async () => {
    const tables = ['funds', 'portfoliocompanies', 'investments', 'fundconfigs'];

    for (const table of tables) {
      const status = await verifyRLS(db, table);

      expect(status.enabled, `RLS should be enabled on ${table}`).toBe(true);
      expect(status.policyCount, `${table} should have policies`).toBeGreaterThan(0);

      console.log(`[CHECK] ${table}: ${status.policyCount} policies`);
    }
  });
});
```

## Debugging

### Check Current Tenant

```sql
-- SQL
SELECT current_org_id() AS tenant_id,
       (SELECT name FROM organizations WHERE id = current_org_id()) AS tenant_name;

-- TypeScript
const context = await getCurrentTenant(db);
console.log('Current tenant:', context);
```

### Verify RLS Policies

```sql
-- List all policies for a table
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'funds';

-- Check if RLS is enabled
SELECT tablename, relrowsecurity
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
WHERE schemaname = 'public'
  AND relrowsecurity = true;
```

### Common Issues

**Issue: "No rows returned" when expecting data**

```typescript
// Check if tenant context is set
const context = await getCurrentTenant(db);
if (!context) {
  console.error('No tenant context set!');
  await switchTenant(db, 'tech-ventures');
}
```

**Issue: Cross-tenant data visible**

```sql
-- Verify RLS is enabled
SELECT relrowsecurity FROM pg_class WHERE relname = 'funds';
-- Should return: true

-- Check policies exist
SELECT count(*) FROM pg_policies WHERE tablename = 'funds';
-- Should return: 4 (SELECT, INSERT, UPDATE, DELETE)
```

**Issue: Cannot insert records**

```typescript
// Ensure org_id matches current tenant
const context = await getCurrentTenant(db);
await db.insert(funds).values({
  orgId: context!.orgId,  // REQUIRED
  name: 'New Fund',
  // ...
});
```

## Seed Data Reference

### Organizations

| ID | Slug | Name |
|----|------|------|
| 1 | `tech-ventures` | Tech Ventures LLC |
| 2 | `bio-capital` | Bio Capital Partners |

### Funds

**Tech Ventures (3 funds):**
- Tech Ventures Fund I ($50M, 2020)
- Tech Ventures Fund II ($100M, 2022)
- Tech Ventures Opportunity Fund ($25M, 2023)

**Bio Capital (2 funds):**
- Bio Capital Fund I ($75M, 2019)
- Bio Capital Growth Fund ($150M, 2021)

### Companies

Each org has 5-6 companies including edge case:
- **Alpha Innovations** exists in BOTH orgs with different sectors (Fintech vs Biotech)

## Integration with CI/CD

### GitHub Actions

```yaml
name: RLS Tests

on: [push, pull_request]

jobs:
  rls:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s

    steps:
      - uses: actions/checkout@v3
      - name: Setup Node
        uses: actions/setup-node@v3
      - name: Install deps
        run: npm ci
      - name: Run migrations
        run: npm run db:push
      - name: Seed test data
        run: npm run seed:multi-tenant
      - name: Run RLS tests
        run: npm run test:rls
```

## Security Checklist

Before deploying RLS to production:

- [ ] All tenant-scoped tables have `org_id` column
- [ ] All tables have RLS enabled (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`)
- [ ] All tables have SELECT, INSERT, UPDATE, DELETE policies
- [ ] Policies use `current_org_id()` function
- [ ] Indexes exist on all `org_id` columns
- [ ] Foreign key constraints use `ON DELETE CASCADE`
- [ ] Middleware sets tenant context from JWT/session
- [ ] Admin bypass is disabled in production (`BYPASS_RLS=false`)
- [ ] RLS health checks run in CI/CD
- [ ] Cross-tenant tests cover all critical paths

## Performance Tips

1. **Always index org_id**: `CREATE INDEX idx_table_org_id ON table(org_id)`
2. **Use WITH CHECK for inserts**: Prevents accidental cross-tenant writes
3. **Composite indexes**: `CREATE INDEX idx_table_org_date ON table(org_id, created_at DESC)`
4. **Connection pooling**: One pool per tenant for high-traffic apps
5. **Materialized views**: Pre-compute tenant-scoped aggregations

## Additional Resources

- [PostgreSQL RLS Documentation](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Multi-Tenancy Patterns](https://www.citusdata.com/blog/2017/03/09/multi-tenant-sharding-tutorial/)
- Project files:
  - Migration: `c:\dev\Updog_restore\migrations\0002_add_organizations.sql`
  - Helpers: `c:\dev\Updog_restore\server\lib\tenant-context.ts`
  - Seed script: `c:\dev\Updog_restore\scripts\seed-multi-tenant.ts`
  - Snippets: `c:\dev\Updog_restore\.vscode\rls-snippets.code-snippets`

## Support

Questions? Check:
1. This guide
2. VSCode snippets (`rls-*`)
3. Helper library JSDoc comments
4. Existing tests in `tests/rls/`
