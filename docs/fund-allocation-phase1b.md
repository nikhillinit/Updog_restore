---
status: ACTIVE
last_updated: 2026-01-19
---

# Fund Allocation Management - Phase 1b: Reallocation Preview/Commit API

**Status:** ✅ Complete
**Date:** 2025-10-07
**Phase:** 1b (Reallocation API)

## Overview

Phase 1b implements the reallocation preview and commit API endpoints for Fund Allocation Management. These endpoints enable users to preview allocation changes with comprehensive validation and warnings, then commit changes atomically with full audit trail support.

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────────┐
│                     Reallocation API                          │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────────────┐      ┌─────────────────────┐       │
│  │  Preview Endpoint   │      │  Commit Endpoint    │       │
│  │  (Read-Only)        │      │  (Transactional)    │       │
│  └──────────┬──────────┘      └──────────┬──────────┘       │
│             │                             │                   │
│             ├─────────────────────────────┤                   │
│             │                             │                   │
│  ┌──────────▼──────────┐      ┌──────────▼──────────┐       │
│  │  Warning Detection  │      │  Audit Trail        │       │
│  │  - Cap exceeded     │      │  - Version tracking │       │
│  │  - Concentration    │      │  - JSONB changes    │       │
│  │  - MOIC             │      │  - User context     │       │
│  └─────────────────────┘      └─────────────────────┘       │
│                                                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  PostgreSQL      │
                    │  - portfoliocomp │
                    │  - reallocation_ │
                    │    audit         │
                    └──────────────────┘
```

### Database Schema

#### `reallocation_audit` Table

```sql
CREATE TABLE reallocation_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id INTEGER NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  baseline_version INTEGER NOT NULL,
  new_version INTEGER NOT NULL,
  changes_json JSONB NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  CONSTRAINT check_version_increment CHECK (new_version > baseline_version),
  CONSTRAINT check_changes_not_empty CHECK (changes_json != '{}'::jsonb)
);
```

**Indexes:**
- `idx_reallocation_audit_fund` - Fund-based queries (most common)
- `idx_reallocation_audit_user` - User-based audit queries
- `idx_reallocation_audit_versions` - Version-based queries
- `idx_reallocation_audit_changes_gin` - GIN index for JSONB search

## API Endpoints

### 1. Preview Endpoint

**POST** `/api/funds/:fundId/reallocation/preview`

Preview reallocation changes without writing to database. Returns deltas, warnings, and validation results.

#### Request Body

```typescript
{
  current_version: number;          // Expected current version (optimistic locking)
  proposed_allocations: Array<{
    company_id: number;             // Company identifier
    planned_reserves_cents: number; // New allocation (in cents)
    allocation_cap_cents?: number;  // Optional allocation cap override
  }>;
}
```

#### Response

```typescript
{
  deltas: Array<{
    company_id: number;
    company_name: string;
    from_cents: number;             // Current allocation
    to_cents: number;               // Proposed allocation
    delta_cents: number;            // Change amount
    delta_pct: number;              // Change percentage
    status: 'increased' | 'decreased' | 'unchanged';
  }>;
  totals: {
    total_allocated_before: number;
    total_allocated_after: number;
    delta_cents: number;
    delta_pct: number;
  };
  warnings: Array<{
    type: 'cap_exceeded' | 'negative_delta' | 'high_concentration' | 'unrealistic_moic';
    company_id?: number;
    message: string;
    severity: 'warning' | 'error';
  }>;
  validation: {
    is_valid: boolean;
    errors: string[];
  };
}
```

#### Example

```bash
curl -X POST http://localhost:5000/api/funds/1/reallocation/preview \
  -H "Content-Type: application/json" \
  -d '{
    "current_version": 1,
    "proposed_allocations": [
      {"company_id": 1, "planned_reserves_cents": 150000000},
      {"company_id": 2, "planned_reserves_cents": 100000000}
    ]
  }'
```

### 2. Commit Endpoint

**POST** `/api/funds/:fundId/reallocation/commit`

Commit reallocation changes to database with transaction safety and audit logging.

#### Request Body

```typescript
{
  current_version: number;          // Expected current version (optimistic locking)
  proposed_allocations: Array<{
    company_id: number;             // Company identifier
    planned_reserves_cents: number; // New allocation (in cents)
    allocation_cap_cents?: number;  // Optional allocation cap override
  }>;
  reason?: string;                  // Optional human-readable reason
  user_id?: number;                 // Optional user ID for audit trail
}
```

#### Response

```typescript
{
  success: boolean;
  new_version: number;              // New allocation version
  updated_count: number;            // Number of companies updated
  audit_id: string;                 // UUID of audit log entry
  timestamp: string;                // ISO 8601 timestamp
}
```

#### Example

```bash
curl -X POST http://localhost:5000/api/funds/1/reallocation/commit \
  -H "Content-Type: application/json" \
  -d '{
    "current_version": 1,
    "proposed_allocations": [
      {"company_id": 1, "planned_reserves_cents": 150000000},
      {"company_id": 2, "planned_reserves_cents": 100000000}
    ],
    "reason": "Q4 2024 rebalancing based on performance metrics",
    "user_id": 1
  }'
```

## Warning Detection

### Cap Exceeded (Error - Blocks Commit)

**Trigger:** `planned_reserves_cents > allocation_cap_cents`

```typescript
{
  type: 'cap_exceeded',
  company_id: 1,
  message: 'Acme Corp: Allocation $15,000,000 exceeds cap of $10,000,000',
  severity: 'error'
}
```

**Action:** Commit is blocked. User must reduce allocation or increase cap.

### High Concentration (Warning - Allows Commit)

**Trigger:** Single company > 30% of total reserves

```typescript
{
  type: 'high_concentration',
  company_id: 1,
  message: 'Acme Corp: High concentration (35.5% of total reserves)',
  severity: 'warning'
}
```

**Action:** User is warned but can proceed with commit.

### Unrealistic MOIC (Warning - Allows Commit)

**Trigger:** Total allocation > 50% of fund size

```typescript
{
  type: 'unrealistic_moic',
  company_id: 1,
  message: 'Acme Corp: Total allocation ($60,000,000) suggests very high conviction (>50% of fund)',
  severity: 'warning'
}
```

**Action:** User is warned but can proceed with commit.

## Optimistic Locking

All endpoints use version-based optimistic locking to prevent concurrent modification conflicts.

### Version Flow

```
Initial State:
  - allocation_version = 1

User A Preview (version 1):
  ✓ Read allocations (no lock)

User B Preview (version 1):
  ✓ Read allocations (no lock)

User A Commit (version 1):
  ✓ Lock rows
  ✓ Verify version = 1
  ✓ Update allocations
  ✓ Increment version to 2
  ✓ Release lock

User B Commit (version 1):
  ✗ Lock rows
  ✗ Verify version = 1 (fails, actual = 2)
  ✗ Return 409 Version Conflict
```

### Handling Version Conflicts

When a 409 conflict occurs, the client should:

1. **Fetch latest state** - Get current allocations with new version
2. **Re-preview** - Show user updated deltas with current data
3. **Retry commit** - Use new version number

```typescript
try {
  await commitReallocation(fundId, version, allocations);
} catch (error) {
  if (error.status === 409) {
    // Version conflict - fetch latest and retry
    const latest = await fetchAllocations(fundId);
    await previewReallocation(fundId, latest.version, allocations);
    // User reviews and retries commit
  }
}
```

## Transaction Safety

The commit endpoint uses PostgreSQL transactions to ensure atomicity:

```sql
BEGIN;

-- 1. Lock rows and verify version
SELECT allocation_version FROM portfoliocompanies
WHERE fund_id = $1 FOR UPDATE;

-- 2. Update allocations (batch)
UPDATE portfoliocompanies SET ...;

-- 3. Insert audit log
INSERT INTO reallocation_audit (...) VALUES (...);

COMMIT;
```

**Guarantees:**
- All updates succeed or all fail (no partial updates)
- Version consistency across all companies
- Audit log matches actual changes
- Rollback on any error (validation, constraint, etc.)

## Performance Characteristics

### Preview Endpoint

- **Target:** < 300ms for 50 companies
- **Strategy:** Read-only queries with no locks
- **Scaling:** Linear with company count

### Commit Endpoint

- **Target:** < 500ms for 50 companies
- **Strategy:** Batch updates in single transaction
- **Scaling:** Linear with company count

### Optimization Techniques

1. **Batch Updates** - Single UPDATE with CASE statements
2. **Selective Locking** - Only lock affected rows
3. **Indexed Queries** - Use `idx_portfoliocompanies_cursor`
4. **JSONB Storage** - Efficient audit log storage

## Testing

### Test Coverage

The implementation includes 15+ comprehensive test cases:

1. ✅ Preview with no changes
2. ✅ Preview with increases/decreases
3. ✅ Preview with warnings
4. ✅ Cap exceeded detection
5. ✅ High concentration detection
6. ✅ Unrealistic MOIC detection
7. ✅ Version conflict detection
8. ✅ Request body validation
9. ✅ Successful commit
10. ✅ Commit rollback on version conflict
11. ✅ Commit rollback on validation error
12. ✅ Concurrent reallocation handling
13. ✅ Audit log verification
14. ✅ Version increment atomicity
15. ✅ Full preview-commit workflow

### Running Tests

```bash
# Run all reallocation tests
npm test tests/unit/reallocation-api.test.ts

# Run with UI
npm run test:ui
```

## Migration

### Apply Migration

```bash
# Apply Phase 1b migration
psql -d updog -f server/migrations/20251007_fund_allocation_phase1b.up.sql
```

### Rollback Migration

```bash
# Rollback Phase 1b migration
psql -d updog -f server/migrations/20251007_fund_allocation_phase1b.down.sql
```

## Error Handling

### 400 Bad Request

**Causes:**
- Invalid request body schema
- Negative allocation amounts
- Missing required fields

**Response:**
```json
{
  "error": "Invalid request body",
  "details": { ... }
}
```

### 404 Not Found

**Causes:**
- Fund ID does not exist
- Fund has no portfolio companies

**Response:**
```json
{
  "error": "Fund has no portfolio companies"
}
```

### 409 Version Conflict

**Causes:**
- Concurrent modification by another user
- Stale version number

**Response:**
```json
{
  "error": "Version conflict",
  "message": "Expected version 1, but found 2",
  "current_versions": [2]
}
```

### 500 Internal Server Error

**Causes:**
- Database connection failure
- Transaction rollback
- Unexpected runtime error

**Response:**
```json
{
  "error": "Internal server error",
  "message": "Transaction failed: ..."
}
```

## Monitoring

### Key Metrics

- **Preview Latency:** p50, p95, p99
- **Commit Latency:** p50, p95, p99
- **Version Conflict Rate:** conflicts/commits
- **Validation Error Rate:** errors/requests
- **Audit Log Size:** GB/month

### Logging

All operations log to structured JSON:

```json
{
  "level": "info",
  "message": "Reallocation committed",
  "fund_id": 1,
  "version": 2,
  "updated_count": 10,
  "audit_id": "550e8400-e29b-41d4-a716-446655440000",
  "duration_ms": 234
}
```

## Future Enhancements

### Phase 2 Candidates

1. **Bulk Reallocation** - Multi-fund reallocation in single transaction
2. **Approval Workflows** - Multi-step approval for large reallocations
3. **Schedule Reallocation** - Scheduled/recurring reallocation
4. **Reallocation Templates** - Save and reuse allocation patterns
5. **ML-Driven Suggestions** - AI-powered allocation recommendations

### Performance Optimizations

1. **Read Replicas** - Route preview to read replicas
2. **Materialized Views** - Pre-compute aggregates
3. **Query Caching** - Cache recent allocation states
4. **Batch Processing** - Process multiple reallocations in parallel

## References

- [Phase 1a Migration](../server/migrations/20251007_fund_allocation_phase1a.up.sql)
- [Phase 1b Migration](../server/migrations/20251007_fund_allocation_phase1b.up.sql)
- [Reallocation Route](../server/routes/reallocation.ts)
- [Unit Tests](../tests/unit/reallocation-api.test.ts)
- [Units Library](../client/src/lib/units.ts)

## Changelog

### 2025-10-07 - Phase 1b Complete

- ✅ Created `reallocation_audit` table with indexes
- ✅ Implemented preview endpoint (read-only)
- ✅ Implemented commit endpoint (transactional)
- ✅ Added warning detection (cap, concentration, MOIC)
- ✅ Added optimistic locking with version checking
- ✅ Created comprehensive unit tests (15+ cases)
- ✅ Added full JSDoc documentation
- ✅ Implemented transaction safety with rollback
- ✅ Added audit trail with JSONB change tracking
