# Task Plan: Validate Phase 3 Migrations & Related Issues

**Goal**: Validate Phase 3 migrations against real PostgreSQL, complete
ScenarioMatrixCache integration, finish FeesExpensesStep UX fixes, and complete
ADR-016 persistence refactor.

**Phases**: 9 total (Env Setup → Migration → Checksum → Rollback → Cache → Cleanup → Persistence → UX → QA)

**Branch**: `claude/validate-phase3-migrations-RnKRq`

**Environment**: Windows PowerShell (no Git Bash per
docs/archive/2025-q4/ai-optimization/AGENTS.md)

**Local Path**: `C:\dev\Updog_restore\`

---

## Phase 1: Environment Setup (Custom Migrations) [pending]

**Objective**: Provision test database for custom migration runner validation

**(Optional - only if running lint checks)**

```powershell
npm install @eslint/js
```

**Commands**:

```powershell
# 1. Start PostgreSQL for custom migration runner
docker run -d --name pg-test -e POSTGRES_PASSWORD=test -p 5432:5432 postgres:15

# 2. Wait until DB is ready (retry up to 10x)
$ready = $false
for ($i=0; $i -lt 10; $i++) {
  docker exec pg-test pg_isready -U postgres 2>&1 | Out-Null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "PostgreSQL ready after $($i+1) attempts"
    $ready = $true
    break
  }
  Start-Sleep -Seconds 2
}
if (-not $ready) {
  Write-Error "PostgreSQL failed to start after 10 attempts"
  exit 1
}

# 3. Create test database
docker exec pg-test psql -U postgres -c "CREATE DATABASE updog_test;"

# 4. Enable pgcrypto for gen_random_uuid()
docker exec pg-test psql -U postgres -d updog_test -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"

# 5. Set DATABASE_URL for custom migration runner
$env:DATABASE_URL = "postgresql://postgres:test@localhost:5432/updog_test"
```

**Checklist**:

- [ ] Docker container started
- [ ] pg_isready returns success (within 10 retries)
- [ ] Database `updog_test` created
- [ ] pgcrypto extension enabled
- [ ] DATABASE_URL set

**Status**: pending **Errors**: None yet

**Notes**:

- pgcrypto required because migrations use `gen_random_uuid()` (lines 8 of 0001,
  0002, 0003 SQL files)
- Manual Redis container NOT needed - integration tests use Testcontainers
- Phases 2-4 validate the custom migration runner against the manual pg-test DB
- Phase 5 uses Testcontainers and will NOT use pg-test or the custom runner
- **If pre-commit lint hook fails:**
  - Option A: Install dependency: `npm install @eslint/js`
  - Option B: Bypass hook: `git commit --no-verify`

---

## Phase 2: Migration Validation (Issue #360) [pending]

**Objective**: Validate custom migration scripts work correctly

**Commands** (use `db:migrate:custom`, NOT `db:migrate`):

```powershell
npm run db:migrate:status              # Check initial state
npm run db:migrate:custom -- --dry-run # Preview without applying
npm run db:migrate:custom              # Apply all migrations
npm run db:migrate:custom              # Re-run for idempotency (should skip all)
```

**Checklist**:

- [ ] Status shows 3 pending migrations
- [ ] Dry-run previews without applying
- [ ] Apply succeeds for all 3 migrations
- [ ] Re-run skips all (idempotent)

**Status**: pending **Errors**: None yet

**Notes**:

- `db:migrate` uses drizzle-kit (standard)
- `db:migrate:custom` uses scripts/run-migrations.ts (checksum validation)
- This phase validates the custom runner against manual pg-test DB (NOT
  Testcontainers)

---

## Phase 3: Checksum Validation (Issue #360) [pending]

**Objective**: Verify checksum mismatch detection

**Commands**:

```powershell
# Backup migration file
Copy-Item shared/migrations/0002_create_scenario_matrices.sql shared/migrations/0002_create_scenario_matrices.sql.bak

# Add comment to trigger checksum change
Add-Content shared/migrations/0002_create_scenario_matrices.sql "-- checksum test"

# Verify checksum mismatch detected
npm run db:migrate:status

# Restore original (IMPORTANT: restore immediately after test)
Move-Item -Force shared/migrations/0002_create_scenario_matrices.sql.bak shared/migrations/0002_create_scenario_matrices.sql
```

**Checklist**:

- [ ] Backup created successfully
- [ ] Comment added to migration file
- [ ] Status detects checksum mismatch
- [ ] Original file restored

**Status**: pending **Errors**: None yet

---

## Phase 4: Rollback Validation (Issue #360) [pending]

**Objective**: Validate rollback functionality

**Commands**:

```powershell
npm run db:rollback -- --dry-run  # Preview rollback
npm run db:rollback               # Execute rollback (latest migration)

# Verify table dropped
docker exec pg-test psql -U postgres -d updog_test -c "\dt"

npm run db:migrate:custom         # Re-apply migration
```

**Checklist**:

- [ ] Dry-run shows what will be rolled back
- [ ] Rollback succeeds (uses inferred DROP TABLE)
- [ ] Table verified dropped via `\dt`
- [ ] Re-apply succeeds

**Status**: pending **Errors**: None yet

**Notes**:

- No .down.sql files exist; rollback uses inferred method
- Inference works because migrations follow `000N_create_<table>.sql` pattern:
  - 0001_create_job_outbox.sql
  - 0002_create_scenario_matrices.sql
  - 0003_create_optimization_sessions.sql

---

## Phase 5: ScenarioMatrixCache Integration (Issue #360) [pending]

**Objective**: Validate cache integration via Testcontainers

**Commands**:

```powershell
# Set CI=true ONLY for this command (bypasses Windows skip)
$originalCI = $env:CI
$env:CI = "true"
npm run test:integration -- tests/integration/ScenarioMatrixCache.integration.test.ts
if ($originalCI) { $env:CI = $originalCI } else { Remove-Item Env:CI }
```

**Checklist**:

- [ ] Integration tests run (not skipped)
- [ ] matrixKey uniqueness validated
- [ ] status=complete filtering validated
- [ ] Collision handling (onConflictDoNothing) validated
- [ ] All tests pass

**Status**: pending **Errors**: None yet

**Notes**:

- Tests use Testcontainers (tests/helpers/testcontainers.ts) - ignores manual
  pg-test/redis-test containers
- No REDIS_URL needed - Testcontainers provisions Redis automatically
- vitest.config.ts excludes tests/integration/\*\*; must use test:integration
  script
- CI=true scoped to this command only to avoid affecting other test behavior
  (retries/threads)
- **Requires Docker Desktop running** for Testcontainers
- This phase does NOT use the manual pg-test container from Phases 1-4

---

## Phase 6: Cleanup (Issue #360) [pending]

**Objective**: Remove test containers

**Commands**:

```powershell
docker rm -f pg-test
```

**Checklist**:

- [ ] Container removed

**Status**: pending **Errors**: None yet

---

## Phase 7: ADR-016 Persistence Refactor (Issue #153) [pending]

**Objective**: Complete invoke-based persistence implementation

**Commands**:

```powershell
# Audit synchronous persistToStorage usage
rg -n "persistToStorage" client/src/machines

# Run persistence tests
npm test -- --project=client tests/unit/modeling-wizard-persistence.test.tsx
```

**Checklist**:

- [ ] No sync persistToStorage for manual navigation
- [ ] Enable first RED PHASE test: "persist BEFORE navigating"
- [ ] Enable remaining RED PHASE tests incrementally (8 total)
- [ ] Verify exponential backoff timing (1s, 2s, 4s)
- [ ] Verify max 3 retries before persistFailed state
- [ ] Verify navigation waits for persistence success
- [ ] All ADR-016 tests pass

**Status**: pending **Errors**: None yet

---

## Phase 8: FeesExpensesStep Error Display (Issue #235) [pending]

**Objective**: Add missing error message UI

**Checklist**:

- [ ] Verify existing error displays in FeesExpensesStep.tsx
- [ ] Add error display for fee basis selection (if missing)
- [ ] Add error display for step-down configuration (if missing)
- [ ] Add error display for admin expense fields (if missing)
- [ ] Test with invalid inputs to verify visibility
- [ ] Follow existing pattern:
      `{errors.field && <p className="text-sm text-error mt-1">...</p>}`

**Status**: pending **Errors**: None yet

---

## Phase 9: Integration QA (Issue #235) [pending]

**Objective**: Execute blocked integration tests

**Blocked Tests (11 total from QA-RESULTS-FEES-EXPENSES-STEP-2025-12-01.md)**:

**Unmount Protection Tests**:

- [ ] 2.1 Navigate away from step (unmount triggers final save)
- [ ] 2.2 Unmount on step switch; ensure save operation
- [ ] 2.3 Unmount during form entry; validate persistence
- [ ] 2.4 Edge case unmount on rapid navigation

**Form Reset Tests**:

- [ ] 3.1 Trigger form reset; check state clearance
- [ ] 3.2 Confirm reset does not affect unrelated data
- [ ] 3.3 Validate reset propagation to related components

**Edge Case Tests**:

- [ ] 4.1 Simultaneous updates conflict resolution
- [ ] 4.2 Cache invalidation timing effects
- [ ] 4.3 Persistent storage latency impacts
- [ ] 4.4 Error handling on save failures

**Final**:

- [ ] Update QA-RESULTS-FEES-EXPENSES-STEP-2025-12-01.md with outcomes

**Status**: pending **Errors**: None yet

---

## Major Decisions

| Decision                           | Rationale                                          | Date       |
| ---------------------------------- | -------------------------------------------------- | ---------- |
| Local Docker PostgreSQL            | Isolated for custom migration testing (Phases 2-4) | 2026-01-16 |
| Testcontainers for integration     | Tests already configured, dynamic ports (Phase 5)  | 2026-01-16 |
| pgcrypto bootstrap step            | Migrations use gen_random_uuid()                   | 2026-01-16 |
| db:migrate:custom not db:migrate   | Custom runner has checksum validation              | 2026-01-16 |
| CI=true scoped to integration test | Avoid affecting other test behavior                | 2026-01-16 |
| Issue #360 first                   | Database foundation for other features             | 2026-01-16 |
| Both scopes for #235               | Comprehensive UX + validation                      | 2026-01-16 |

---

## Critical Files

**Issue #360:**

- `scripts/run-migrations.ts` - Custom migration runner with checksums
- `scripts/rollback-migration.ts` - Rollback with inferred DROP TABLE
- `shared/migrations/0001_create_job_outbox.sql` - Uses gen_random_uuid()
- `shared/migrations/0002_create_scenario_matrices.sql` - Uses gen_random_uuid()
- `shared/migrations/0003_create_optimization_sessions.sql` - Uses
  gen_random_uuid()
- `shared/core/optimization/ScenarioMatrixCache.ts`
- `tests/integration/ScenarioMatrixCache.integration.test.ts`
- `tests/helpers/testcontainers.ts` - Provisions PostgreSQL + Redis
- `vitest.config.int.ts` - Integration test config
- `package.json:150` - test:integration script

**Issue #153:**

- `client/src/machines/modeling-wizard.machine.ts`
- `tests/unit/modeling-wizard-persistence.test.tsx`
- `DECISIONS.md` (ADR-016)

**Issue #235:**

- `client/src/components/modeling-wizard/steps/FeesExpensesStep.tsx`
- `QA-RESULTS-FEES-EXPENSES-STEP-2025-12-01.md`
