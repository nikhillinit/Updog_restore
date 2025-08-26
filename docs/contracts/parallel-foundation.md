# Parallel Foundation Contract

**Version**: 1.0.0  
**Last Updated**: 2024-12-26  
**Status**: LOCKED - Changes require team consensus

## Purpose

This document defines the immutable contracts for parallel development of Steps 2-6. All teams must adhere to these specifications to ensure successful integration.

## Database Schema Contracts

### Migration Order & Dependencies

1. **0002_concurrency_safety.sql** - No dependencies
2. **0003_multi_tenancy.sql** - Depends on 0002 (for fund_configs)
3. **0004_versioning_encryption.sql** - Depends on 0003 (for organizations)
4. **0005_audit_pipeline.sql** - Depends on 0003, 0004 (for partners, organizations)

### Rollback Procedures

Each migration includes a DOWN section. To rollback:

```sql
-- Example for 0002
psql $DATABASE_URL -f migrations/rollback/0002_concurrency_safety_down.sql
```

### Critical Tables & Columns

#### Organizations (0003)
```sql
organizations
├── id: UUID (PK)
├── slug: VARCHAR(100) UNIQUE NOT NULL
└── settings: JSONB DEFAULT '{}'
```

#### Partners (0003) 
```sql
partners
├── id: UUID (PK)
├── organization_id: UUID (FK) NOT NULL
├── partner_id: VARCHAR(100) UNIQUE NOT NULL  -- Canonical ID
├── email: VARCHAR(255) UNIQUE NOT NULL
├── can_approve: BOOLEAN DEFAULT true
└── totp_secret: VARCHAR(255) NULLABLE
```

#### Fund Configs (0002)
```sql
fund_configs (EXISTING + modifications)
├── row_version: UUID DEFAULT gen_random_uuid()
├── locked_by: UUID NULLABLE
├── locked_at: TIMESTAMPTZ NULLABLE
└── lock_reason: TEXT NULLABLE
```

#### Idempotency Keys (0002)
```sql
idempotency_keys
├── key: VARCHAR(255) (PK with fund_id)
├── fund_id: INTEGER (PK with key)
├── params_hash: VARCHAR(64) NOT NULL
├── status: VARCHAR(20) NOT NULL
├── response: JSONB NULLABLE
└── expires_at: TIMESTAMPTZ NOT NULL
```

#### Feature Flags (0003)
```sql
feature_flags
├── key: VARCHAR(100) NOT NULL
├── scope: VARCHAR(20) CHECK IN ('global','org','fund','user')
├── scope_id: UUID NULLABLE
├── value: JSONB NOT NULL
└── UNIQUE(key, scope, scope_id)
```

#### Calc Versions (0004)
```sql
calc_versions
├── version: VARCHAR(20) (PK)
├── engine_type: VARCHAR(50) NOT NULL
├── sunset_at: TIMESTAMPTZ NULLABLE
└── migration_function: TEXT NULLABLE
```

#### Calc Audit (0005)
```sql
calc_audit
├── id: UUID (PK)
├── fund_id: INTEGER (FK) NOT NULL
├── actor_sub: VARCHAR(255) -- JWT subject
├── inputs_hash: VARCHAR(64) NOT NULL
├── flags_hash: VARCHAR(64) NOT NULL
├── calc_version: VARCHAR(20) NOT NULL
└── seed: BIGINT NULLABLE
```

### RLS Policy Contracts

All RLS policies use session variables:
- `app.current_org` - Organization UUID
- `app.current_fund` - Fund ID (optional)
- `app.current_user` - User ID from JWT
- `app.current_partner` - Partner ID (optional)

## API Contracts

### Headers

#### Security Headers (ALL endpoints)
- `Authorization: Bearer <JWT>` - REQUIRED
- Never trust: `X-User-Id`, `X-Org-Id`, `X-Fund-Id`

#### Concurrency Headers
- `If-Match: <row_version>` - For optimistic locking
- `Idempotency-Key: <key>` - For idempotent operations

#### Cache Headers (Flags endpoint)
```
Cache-Control: private, max-age=15, must-revalidate
Vary: Authorization
Surrogate-Control: no-store
```

### Response Codes

- `200` - Success
- `304` - Not Modified (ETag match)
- `409` - Conflict (version mismatch, fund busy, rate limited)
- `428` - Precondition Required (approval needed)

### Error Response Format

```json
{
  "error": "ERROR_CODE",
  "message": "Human readable message",
  "details": {
    "field": "Additional context"
  }
}
```

## TypeScript Interface Contracts

### UserContext (from JWT only)
```typescript
interface UserContext {
  userId: string;      // JWT 'sub'
  orgId: string;       // JWT 'org_id'
  fundId?: string;     // From route param
  email: string;       // JWT 'email'
  role: string;        // JWT 'role'
  partnerId?: string;  // JWT 'partner_id'
}
```

### RateLimitResult
```typescript
interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;     // Unix timestamp
  retryAfter?: number; // Seconds
}
```

### ApprovalSignature
```typescript
interface ApprovalSignature {
  partner_id: UUID;    // FK to partners.id
  signature: string;
  totp_verified: boolean;
}
```

## Integration Points

### Advisory Locks

Use transaction-scoped locks:
```sql
BEGIN;
SELECT pg_try_advisory_xact_lock(hashtextextended(:fund_id::text, 0));
-- Work
COMMIT; -- Lock auto-released
```

### Idempotency

1. Check key exists
2. Return cached if found
3. Acquire lock if not found
4. Execute operation
5. Store result with TTL

### Flag Resolution Order

```
user > fund > org > global
```

### Audit Requirements

Every calculation MUST write to `calc_audit`:
- Before execution: status='started'
- After completion: status='completed' or 'failed'
- Include: inputs_hash, flags_hash, seed, version

## Migration System Standard

**Decision**: Use raw SQL migrations with explicit UP/DOWN sections

- Migrations in `server/db/migrations/`
- Naming: `NNNN_description.sql`
- Each must be reversible
- Test rollback before marking complete

## Testing Requirements

Each team must provide:
1. Unit tests for their module
2. Integration test proving RLS works
3. Acceptance test from `tests/parallel/acceptance-tests.ts`

## Change Management

Changes to this contract require:
1. PR with justification
2. Review by all team leads
3. Update version number
4. Migration plan for existing code

## Compliance Notes

- PII fields MUST use envelope encryption
- All LP data access MUST be logged
- Approvals MUST verify distinct partner IDs
- Calculations MUST be deterministic (same seed = same result)

---

**Teams may proceed with implementation using these contracts as the source of truth.**