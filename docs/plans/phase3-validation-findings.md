---
status: ACTIVE
last_updated: 2026-01-19
---

# Findings: Phase 3 Migrations & Related Issues

**Last Updated**: 2026-01-16 (Plan Review Session 3) **Local Path**:
`C:\dev\Updog_restore\`

---

## Issue #360: Phase 3 Migrations

### Migration Infrastructure (Explored)

**scripts/run-migrations.ts (264 lines):**

- SHA-256 checksum validation for tamper detection
- Dry-run mode: `--dry-run` flag previews without applying
- Status mode: `--status` flag shows applied/pending/changed
- Transaction safety: Each migration wrapped in BEGIN/COMMIT
- Automatic rollback on failure
- **IMPORTANT**: Does NOT retry on connection failure; needs DB readiness check
  first

**scripts/rollback-migration.ts (274 lines):**

- Down file support: looks for `*.down.sql` files
- Inferred rollback: pattern `create_*` → DROP TABLE IF EXISTS
- Multi-step: `--steps N` rolls back N migrations
- Migration history cleanup after rollback

**SQL Migrations:**

- `0001_create_job_outbox.sql`: Transactional outbox pattern, 4 indexes, **uses
  gen_random_uuid()**
- `0002_create_scenario_matrices.sql`: Cache layer, matrixKey UNIQUE, BYTEA
  storage, **uses gen_random_uuid()**
- `0003_create_optimization_sessions.sql`: Two-pass MILP, matrix_id FK, **uses
  gen_random_uuid()**

### Critical Discovery: pgcrypto Required

**Issue**: All 3 migrations use `gen_random_uuid()` at line 8, which requires
pgcrypto extension.

**Evidence**: `shared/migrations/0001_create_job_outbox.sql:8`, `0002:8`,
`0003:8`

**Solution**: Must run before migrations:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

### Critical Discovery: npm Script Mismatch

| Script              | Command                                      | Use For                     |
| ------------------- | -------------------------------------------- | --------------------------- |
| `db:migrate`        | `drizzle-kit migrate`                        | Standard Drizzle migrations |
| `db:migrate:custom` | `npx tsx scripts/run-migrations.ts`          | Checksum validation testing |
| `db:migrate:status` | `npx tsx scripts/run-migrations.ts --status` | Status check                |
| `db:rollback`       | `npx tsx scripts/rollback-migration.ts`      | Rollback                    |

**Plan must use `db:migrate:custom`, NOT `db:migrate`**

### Critical Discovery: No .down.sql Files

```bash
# Glob result: No files found for shared/migrations/*.down.sql
```

Rollback relies on inferred method from filename pattern
`000N_create_<table>.sql`.

### ScenarioMatrixCache (Explored)

**Architecture:**

- Dual-tier: Redis (24h TTL) + PostgreSQL (durable)
- Lookup order: Redis → PostgreSQL → ScenarioGenerator

**Key Uniqueness:**

- SHA-256 hash of canonicalized config
- 5 decimal precision for floats
- Recycling normalization (disabled → no-op)

**Status Filtering:**

- Only returns rows where status='complete'
- CHECK constraint enforces payload completeness

**Collision Handling:**

- `onConflictDoNothing()` for concurrent inserts
- First INSERT wins, others silently ignored

### Critical Discovery: Integration Tests Use Testcontainers

**File**: `tests/integration/ScenarioMatrixCache.integration.test.ts:88`

```typescript
describe.skipIf(!process.env.CI && process.platform === 'win32')(...)
```

**Implications**:

1. Tests SKIP on Windows unless `CI=true`
2. Tests use Testcontainers (tests/helpers/testcontainers.ts)
3. Manual pg-test/redis-test containers are IGNORED
4. No REDIS_URL needed - Testcontainers provisions both

**Solution**: Set `$env:CI = "true"` only for integration test command

**Requirement**: Docker Desktop must be running for Testcontainers to work.

### Critical Discovery: Test Config Exclusion

**File**: `vitest.config.ts`

Integration tests excluded from main config:

```typescript
// tests/integration/** excluded
```

**File**: `vitest.config.int.ts` - Separate config for integration tests

**File**: `package.json:150`

```json
"test:integration": "vitest -c vitest.config.int.ts"
```

**Plan must use `npm run test:integration`, NOT `npm test`**

---

## Issue #235: FeesExpensesStep

### Error Display (Explored)

**Current State:**

- Validation logic works (rejects invalid data)
- Error messages exist in `errors` object from React Hook Form
- Pattern at lines 109-111 but only for `managementFee.rate`

**Missing Error Displays:**

- Fee basis selection
- Step-down configuration
- Admin expense fields

### QA Status (Explored)

**From QA-RESULTS-FEES-EXPENSES-STEP-2025-12-01.md:**

- 14 test cases planned
- 3 executed, 3 passed
- 11 blocked (need full wizard context)

**Blocked Tests Enumerated:**

| Category           | Test | Description                                           |
| ------------------ | ---- | ----------------------------------------------------- |
| Unmount Protection | 2.1  | Navigate away from step (unmount triggers final save) |
| Unmount Protection | 2.2  | Unmount on step switch; ensure save operation         |
| Unmount Protection | 2.3  | Unmount during form entry; validate persistence       |
| Unmount Protection | 2.4  | Edge case unmount on rapid navigation                 |
| Form Reset         | 3.1  | Trigger form reset; check state clearance             |
| Form Reset         | 3.2  | Confirm reset does not affect unrelated data          |
| Form Reset         | 3.3  | Validate reset propagation to related components      |
| Edge Cases         | 4.1  | Simultaneous updates conflict resolution              |
| Edge Cases         | 4.2  | Cache invalidation timing effects                     |
| Edge Cases         | 4.3  | Persistent storage latency impacts                    |
| Edge Cases         | 4.4  | Error handling on save failures                       |

**Bug Fix Completed:**

- Infinite save loop FIXED (460+ saves/second → 1 per 750ms)
- Root cause: React Hook Form `watch()` unstable references
- Solution: `useDebounceDeep` hook with JSON comparison

---

## Issue #153: ADR-016 Persistence

### Implementation Status (Explored)

**Implemented (70%):**

- Context fields: `persistenceError`, `retryCount`, `lastPersistAttempt`,
  `navigationIntent`, `targetStep`
- `persistDataService` actor with QuotaExceededError handling
- `persisting` state with invoke pattern
- `delaying` state for exponential backoff
- `canRetryPersistence` guard (max 3 retries)

**Pending (30%):**

- 8 RED PHASE tests skipped
- `editing.persistFailed` state integration
- Full wizard navigation integration

### ADR-016 Pattern

**Problem (old pattern):**

```typescript
on: {
  NEXT: {
    actions: ['goToNextStep', 'persistToStorage'];
  }
}
// Navigation FIRST, persistence SECOND = data loss risk
```

**Solution (invoke pattern):**

```typescript
persisting: {
  invoke: {
    src: 'persistDataService',
    onDone: { actions: ['executeNavigationIntent'] },
    onError: { target: 'delaying' }
  }
}
// Persistence FIRST, navigation AFTER = safe
```

### Audit Command

Use ripgrep (not grep) for consistency:

```powershell
rg -n "persistToStorage" client/src/machines
```

---

## Technical Decisions

| Topic               | Decision                       | Source                          |
| ------------------- | ------------------------------ | ------------------------------- |
| Cache key algorithm | SHA-256                        | ScenarioMatrixCache.ts          |
| Float precision     | 5 decimals                     | Eliminates FP noise             |
| Redis TTL           | 24 hours (86400s)              | Balance freshness/hits          |
| Retry backoff       | 1s, 2s, 4s exponential         | ADR-016                         |
| Max retries         | 3 attempts                     | ADR-016                         |
| Integration tests   | Testcontainers                 | tests/helpers/testcontainers.ts |
| Custom migrations   | db:migrate:custom              | package.json                    |
| pgcrypto bootstrap  | Required for gen_random_uuid() | Migration SQL files             |

---

## Environment Corrections

| Original Plan                       | Correction                        | Reason                       |
| ----------------------------------- | --------------------------------- | ---------------------------- |
| `export DATABASE_URL=...`           | `$env:DATABASE_URL = ...`         | Windows PowerShell           |
| `npm run db:migrate`                | `npm run db:migrate:custom`       | Need checksum validation     |
| `npm test -- tests/integration/...` | `npm run test:integration -- ...` | Different vitest config      |
| Manual Redis container              | Not needed                        | Testcontainers provisions it |
| `grep -r`                           | `rg -n`                           | Ripgrep for efficiency       |
| `git checkout --` for restore       | `Copy-Item/Move-Item`             | Non-destructive backup       |
| No DB readiness check               | `pg_isready` loop                 | Connection may fail          |
| No pgcrypto                         | `CREATE EXTENSION pgcrypto`       | Required for UUID            |
