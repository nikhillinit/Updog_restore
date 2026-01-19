---
status: ACTIVE
last_updated: 2026-01-19
---

# RLS Quick Reference Cheatsheet

One-page reference for multi-tenant RLS development.

## Setup (One Time)

```bash
# Windows PowerShell
npm run rls:quickstart:ps

# Git Bash / Linux / Mac
npm run rls:quickstart
```

## Common Commands

```bash
# Seed test data (2 orgs, 5 funds, 11 companies)
npm run seed:multi-tenant

# Reset and reseed
npm run seed:reset

# Run RLS tests
npm run test:rls

# Apply migrations
npm run db:push

# Open database studio
npm run db:studio
```

## VSCode Quick Access

### Press F5 (Launch Configs)
- **API Server (Tech Ventures Tenant)** - Start with tech-ventures context
- **API Server (Bio Capital Tenant)** - Start with bio-capital context
- **API Server (No Tenant - Admin)** - Bypass RLS (see all data)
- **Seed: Multi-Tenant Data** - Seed test organizations
- **Test: RLS Suite** - Run all RLS isolation tests

### Ctrl+Shift+P → Tasks (Run Task)
- **RLS: Quick Start (Full Setup)** - Automated full setup
- **RLS: Seed Test Data** - Seed organizations
- **RLS: Run Isolation Tests** - Test suite
- **RLS: Start API (Tech Ventures)** - API with tenant context

### Type `rls-` + Tab (Snippets)
- `rls-policy-full` - Complete CRUD policy suite
- `rls-test-isolation` - Isolation test template
- `rls-helper-with-context` - Tenant context wrapper
- `rls-migration-add-orgid` - Add org_id to table

## Code Patterns

### Tenant Switching (Recommended)
```typescript
import { withTenantContext } from '@/lib/tenant-context';

// Auto-cleanup (recommended)
const funds = await withTenantContext(db, 'tech-ventures', async () => {
  return await db.select().from(fundsTable);
});
// Tenant context automatically reset
```

### Manual Control
```typescript
import { switchTenant, resetTenant } from '@/lib/tenant-context';

await switchTenant(db, 'bio-capital');
const companies = await db.select().from(companiesTable);
await resetTenant(db);  // Always reset when done
```

### Check Current Tenant
```typescript
import { getCurrentTenant, getTenantIndicator } from '@/lib/tenant-context';

const context = await getCurrentTenant(db);
console.log(`Org: ${context?.orgSlug}`); // "tech-ventures"

console.log(await getTenantIndicator(db));
// [TENANT: tech-ventures (Tech Ventures LLC)]
```

### Testing Pattern
```typescript
describe('My RLS test', () => {
  beforeEach(async () => await resetTenant(db));
  afterEach(async () => await resetTenant(db));

  it('should isolate data', async () => {
    await switchTenant(db, 'tech-ventures');
    const techData = await db.select().from(myTable);

    await switchTenant(db, 'bio-capital');
    const bioData = await db.select().from(myTable);

    expect(techData).not.toEqual(bioData);
  });
});
```

## SQL Quick Reference

```sql
-- Switch tenant (by slug)
SELECT switch_tenant((SELECT id FROM organizations WHERE slug = 'tech-ventures'));

-- Switch tenant (by ID)
SELECT switch_tenant(42);

-- Get current tenant
SELECT current_org_id();  -- Returns ID or NULL

-- Reset (admin mode)
SELECT reset_tenant();

-- List organizations
SELECT id, slug, name FROM organizations WHERE deleted_at IS NULL;

-- Check RLS enabled
SELECT tablename, relrowsecurity
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
WHERE schemaname = 'public' AND relrowsecurity = true;

-- List policies for a table
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'funds';
```

## Test Organizations

| ID | Slug | Name | Funds | Companies |
|----|------|------|-------|-----------|
| 1 | `tech-ventures` | Tech Ventures LLC | 3 | 6 |
| 2 | `bio-capital` | Bio Capital Partners | 2 | 5 |

**Edge Case:** "Alpha Innovations" exists in both orgs (Fintech vs Biotech)

## Environment Variables

```bash
# Set default tenant
DEFAULT_ORG_SLUG=tech-ventures npm run dev:api

# Bypass RLS (admin mode)
BYPASS_RLS=true npm run dev:api

# Enable RLS debugging
DEBUG=app:rls,app:auth npm run dev:api
```

## Helper Functions

```typescript
// All from '@/lib/tenant-context'

switchTenant(db, slug)           // Switch by slug
switchTenantById(db, id)          // Switch by ID
resetTenant(db)                   // Clear context
getCurrentTenant(db)              // Get context info
withTenantContext(db, slug, fn)  // Auto-cleanup wrapper
listOrganizations(db)             // Get all orgs
verifyRLS(db, tableName)          // Check RLS status
getTenantIndicator(db)            // Terminal display
setTenantFromRequest(db, slug)    // Express middleware helper
```

## Debugging Tips

### No Rows Returned
```typescript
// Check if tenant context is set
const context = await getCurrentTenant(db);
if (!context) {
  console.error('No tenant context! Switch first.');
  await switchTenant(db, 'tech-ventures');
}
```

### Cross-Tenant Data Visible
```sql
-- Verify RLS enabled
SELECT relrowsecurity FROM pg_class WHERE relname = 'funds';
-- Should return: true

-- Check policy count
SELECT COUNT(*) FROM pg_policies WHERE tablename = 'funds';
-- Should return: 4 (SELECT, INSERT, UPDATE, DELETE)
```

### Cannot Insert Records
```typescript
// Ensure org_id matches current tenant
const context = await getCurrentTenant(db);
await db.insert(funds).values({
  orgId: context!.orgId,  // REQUIRED
  name: 'New Fund',
  // ...
});
```

## File Locations

```
c:\dev\Updog_restore\
├── migrations\0002_add_organizations.sql      # RLS schema
├── scripts\seed-multi-tenant.ts                # Seed script
├── server\lib\tenant-context.ts                # Helper library
├── tests\rls\isolation.test.ts                 # Test suite
├── docs\RLS-DEVELOPMENT-GUIDE.md              # Full guide
├── .vscode\rls-snippets.code-snippets         # Snippets
└── .vscode\launch.json                         # F5 configs
```

## Database Access

- **pgAdmin**: http://localhost:8080 (admin@povc.local / admin123)
- **Drizzle Studio**: `npm run db:studio`
- **psql**: `psql postgresql://postgres:postgres@localhost:5432/povc_dev`

## Next Steps

1. Run quick start: `npm run rls:quickstart:ps`
2. Read guide: `docs\RLS-DEVELOPMENT-GUIDE.md`
3. Try snippets: Type `rls-` + Tab in any `.ts` file
4. Start server: Press F5 → Select tenant context
5. Run tests: `npm run test:rls`

## Common Mistakes

- Forgetting to call `resetTenant()` after manual switching
- Not setting `orgId` when inserting records
- Using admin mode in production (`BYPASS_RLS=true`)
- Switching tenant without checking current context first
- Not adding indexes on `org_id` columns

## Performance Tips

- Always add index: `CREATE INDEX idx_table_org_id ON table(org_id)`
- Use composite indexes: `CREATE INDEX idx_table_org_date ON table(org_id, created_at DESC)`
- Prefer `withTenantContext()` over manual switching (automatic cleanup)
- Check RLS policies in query plan: `EXPLAIN ANALYZE SELECT * FROM funds`

---

**Quick Start**: `npm run rls:quickstart:ps`
**Full Guide**: `docs\RLS-DEVELOPMENT-GUIDE.md`
**Support**: Check guide, snippets, test examples, or helper JSDoc
