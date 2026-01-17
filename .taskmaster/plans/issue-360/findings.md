# Issue #360 Findings

## Initial Research (2026-01-17)

### Issue Summary
- **Title**: Phase 3 Session 1: Complete remaining integration tests
- **Tasks**:
  - Task 1.4: Migration Execution Integration Tests
  - Task 1.5: MatrixKey Generation Integration Tests

### Existing Infrastructure Discovered

#### Testcontainers Setup
- `tests/helpers/testcontainers.ts` - Main container orchestration
- `tests/helpers/testcontainers-db.ts` - Database helpers
- `tests/helpers/testcontainers-migration.ts` - Migration utilities (extensive, 80+ lines)
- `tests/helpers/testcontainers-seeder.ts` - Data seeding
- `tests/integration/testcontainers-smoke.test.ts` - Smoke test

#### Existing Integration Tests Using Testcontainers
- `tests/integration/ScenarioMatrixCache.integration.test.ts` - Already tests dual-tier caching
- `tests/integration/cache-monitoring.integration.test.ts`
- `tests/integration/scenarioGeneratorWorker.test.ts`

#### MatrixKey Implementation Files
- `shared/core/optimization/ScenarioMatrixCache.ts` - Main implementation
- `server/workers/scenarioGeneratorWorker.ts` - Worker using cache
- `server/services/CacheInvalidationService.ts`
- `server/services/CacheStatsService.ts`

### Blocker Analysis

#### Task 1.4 Blockers
- **Stated**: Requires deployed PostgreSQL database
- **Reality**: Testcontainers infrastructure ALREADY EXISTS
- **Assessment**: Blocker is resolved - can proceed

#### Task 1.5 Blockers
- **Stated**: Requires ScenarioMatrixCache implementation (Session 2)
- **Reality**: ScenarioMatrixCache.ts EXISTS and is being tested
- **Assessment**: Blocker appears resolved - need to verify matrixKey implementation

### Questions for Codex Analysis
1. Does migration-runner.test.ts already exist?
2. What specific migration tests are missing from existing coverage?
3. Is matrixKey generation fully implemented in ScenarioMatrixCache?
4. What specific keying tests are missing?

---

## Codex Analysis Session 1 (019bcd44-2b8f-7213-94fa-abdc5e870e90)

### Q1: migration-runner.test.ts
**Does NOT exist.** No file at `tests/integration/migration-runner.test.ts`.

### Q2: Migration Test Gaps (NOT covered)
1. No automated execution coverage for custom runner in `scripts/run-migrations.ts`
2. No rollback coverage for `scripts/rollback-migration.ts` (down file vs inferred drop)
3. No "from scratch" run using testcontainers (apply all migrations on clean DB)
4. No partial migration + resume path
5. No validation of migration-state helpers in `tests/helpers/testcontainers-migration.ts`

**Specific Test Scenarios Needed:**
- Apply latest migrations: clean container → runMigrationsToVersion → assert pending=0
- Apply to target version: assert current=target, pending contains remaining
- Pre-migration state: fresh container → getMigrationState → applied=empty, current=null
- Seed history: seedMigrationHistory with subset → validate state
- Reset flow: resetDatabase → assert data/tables gone
- Error paths: invalid target tag, missing _journal.json

### Q3: MatrixKey Implementation
**YES, implemented** in `shared/core/optimization/ScenarioMatrixCache.ts` as `generateCanonicalKey`:
- Creates canonical object with sorted buckets, rounded values (5 decimals)
- Uses SHA-256 hash of JSON.stringify(canonical)
- Handles recycling normalization

### Q4: MatrixKey Test Coverage
**Existing tests** (in ScenarioMatrixCache.integration.test.ts):
- Identical configs → identical keys
- Different fundId → different keys
- Recycling disabled normalization
- SHA-256 hex format validation

**Missing tests:**
- Bucket order normalization (swapped order → same key)
- Rounding tolerance (1e-5 boundary behavior)
- taxonomyVersion change → different key
- numScenarios change → different key
- correlationWeights change → different key
- Recycling enabled differences (mode/rate changes)

### Q5: Blocker Assessment
**BLOCKERS ARE RESOLVED:**
- PostgreSQL: Testcontainers infrastructure fully exists
- Session 2 dependency: ScenarioMatrixCache already implemented and tested
- Only requirement: Docker runtime + CI=true for Windows

---

## Claude Assessment (Critical Review)

### Feasibility: HIGH
The issue's stated blockers are actually resolved. Both tasks can proceed immediately.

### Risk Analysis

**Task 1.4 Risks:**
1. **Migration script complexity** - `scripts/run-migrations.ts` may have undocumented behaviors
2. **Rollback testing** - Down files may not exist for all migrations
3. **CI environment** - Docker-in-Docker or service containers needed

**Task 1.5 Risks:**
1. **Unit vs Integration overlap** - Some tests may already exist in unit tests
2. **Rounding edge cases** - Testing 1e-5 boundaries requires precision
3. **Performance** - Full integration tests with containers are slow

### Concerns

1. **Scope Creep Risk**: The "rollback mechanism" testing could become complex if down files are missing or inconsistent
2. **Test Isolation**: Migration tests need careful setup/teardown to avoid state pollution
3. **CI Time Impact**: Adding more testcontainer tests increases CI runtime

### Recommendations

1. **Start with Task 1.5** (matrixKey tests) - Lower risk, clearer scope, faster feedback
2. **Task 1.4 Phase 1**: Focus on happy-path migration tests first, defer rollback
3. **Verify unit test coverage** before duplicating in integration tests
4. **Use beforeEach container reset** to ensure isolation

---

## Codex Analysis Session 2 (resumed 019bcd44-2b8f-7213-94fa-abdc5e870e90)

### Rollback Feasibility: LIMITED
- **No down.sql files exist** in shared/migrations
- Rollback uses inferred DROP TABLE (risky, data loss)
- Scripts use `migration_history` table, NOT `drizzle_migrations`
- `*_ROLLBACK.sql` files exist in migrations/ but NOT referenced by rollback script

**Assessment**: Rollback testing is HIGH RISK. Recommend deferring or limiting scope.

### Unit Test Overlap: SIGNIFICANT
Existing unit tests in `tests/unit/core/ScenarioMatrixCache.test.ts` already cover:
- Identical configs → same key
- fundId diff, taxonomyVersion diff, numScenarios diff
- bucket config diff, correlationWeights diff
- recycling disabled normalization, recycling enabled diff

**Integration tests should ONLY add:**
- Bucket order normalization (same key regardless of order)
- Rounding tolerance edge cases (1e-5 boundary)
- Persistence verification (stored matrix_key matches configHash)
- Redis key prefix format

### CI Configuration
- Testcontainers: `.github/workflows/testcontainers-ci.yml` (separate workflow)
- Standard CI: `vitest.config.int.ts` excludes testcontainers tests
- New tests need to be added to exclude list in `vitest.config.int.ts`

### Estimated Effort
| Task | LOC | Tests | Approach |
|------|-----|-------|----------|
| migration-runner.test.ts | 180-240 | 5-7 | New file, use testcontainers-migration.ts helpers |
| scenario-matrix-cache-keying.test.ts | 40-60 | 3-5 | Fold into existing ScenarioMatrixCache.integration.test.ts |

### Implementation Notes
- Need `CREATE EXTENSION IF NOT EXISTS pgcrypto;` before migrations
- Only 2 migrations in _journal.json (0000, 0001)
- Skip Windows without CI=true (existing pattern)

---

## Final Critical Assessment

### REVISED RISK MATRIX

| Task | Feasibility | Risk | Effort | Priority |
|------|-------------|------|--------|----------|
| Task 1.5 (matrixKey) | HIGH | LOW | 40-60 LOC | P1 - Do first |
| Task 1.4 (happy path) | HIGH | MEDIUM | 120-150 LOC | P2 - Subset only |
| Task 1.4 (rollback) | LOW | HIGH | Undefined | P3 - DEFER |

### SCOPE RECOMMENDATION

**DO implement:**
1. Task 1.5: Add 3-5 keying tests to existing integration file
2. Task 1.4 (partial): Migration state helpers + happy-path apply

**DEFER:**
- Rollback mechanism testing (no down files, high risk)
- Checksum tampering tests (requires mock injection)
- Inferred table drop fallback (dangerous, edge case)

### CONFIDENCE LEVEL
- Task 1.5: 95% confidence - clear scope, existing patterns
- Task 1.4 (happy path): 80% confidence - helpers exist, may need pgcrypto setup
- Task 1.4 (rollback): 30% confidence - missing infrastructure, high risk

---

## Codex Analysis Session 3 - Final Validation (resumed 019bcd44-2b8f-7213-94fa-abdc5e870e90)

### Task 1.5 Implementation Details CONFIRMED
- `createTestConfig(fundId?: string): ScenarioConfigWithMeta` exists
- Add new describe block after existing "Canonical Key Generation"
- Access private method: `(cache as any).generateCanonicalKey(config)`

### Task 1.4 Implementation Details CONFIRMED
- Import: `import { runMigrationsToVersion, getMigrationState, resetDatabase, seedMigrationHistory } from '../helpers/testcontainers-migration';`
- Use `pg.Pool` directly for SQL (no execSQL helper)
- Container image: `pgvector/pgvector:pg16`
- Must run: `CREATE EXTENSION IF NOT EXISTS pgcrypto;`

### Vitest Config Exclude List
```ts
exclude: [
  'tests/unit/**/*',
  'tests/synthetics/**/*',
  'tests/integration/testcontainers-smoke.test.ts',
  'tests/integration/ScenarioMatrixCache.integration.test.ts',
  'tests/integration/cache-monitoring.integration.test.ts',
  'tests/integration/scenarioGeneratorWorker.test.ts',
  // ADD: 'tests/integration/migration-runner.test.ts',
],
```

---

## FINAL CONFIDENCE: HIGH (90%+)

All implementation details validated. Ready for execution.
