# Issue #360 Implementation Plan

## Status: REFINED (High Confidence)

## Executive Summary
After Codex analysis and critical review, the original issue scope is PARTIALLY feasible:
- **Task 1.5 (matrixKey)**: Fully feasible, 40-60 LOC addition to existing file
- **Task 1.4 (migration)**: Partially feasible - happy path only, rollback deferred

**Estimated Total Effort**: 160-210 LOC, 8-12 tests

---

## Phase 1: Task 1.5 - MatrixKey Integration Tests [P1] - COMPLETE
**Estimated**: 40-60 LOC, 3-5 tests
**Actual**: 74 LOC, 5 tests
**File**: `tests/integration/ScenarioMatrixCache.integration.test.ts` (lines 314-388)
**Confidence**: 95%

### Tests Added
- [x] **Bucket order normalization**: Same buckets in different order → identical key
- [x] **Rounding tolerance**: Values differing only at 6th decimal → same key
- [x] **Rounding boundary**: Change at 5th decimal → different key
- [x] **Persistence verification**: Stored `matrix_key` column matches generated hash
- [x] **Redis key format**: Verify `scenario-matrix:<hash>` prefix

### Implementation Pattern
```typescript
describe('Canonical Key Edge Cases', () => {
  it('normalizes bucket order', async () => {
    const config1 = createTestConfig(); // buckets: [A, B]
    const config2 = { ...config1, buckets: [B, A] }; // reversed
    // Assert same key
  });

  it('rounds within tolerance', async () => {
    const config1 = { ...base, capitalAllocation: 0.60000001 };
    const config2 = { ...base, capitalAllocation: 0.60000002 };
    // Assert same key (beyond 5 decimals)
  });
});
```

### CI Configuration
- [x] Verify test runs in `testcontainers-ci.yml` (existing file, no changes needed)
- [x] No changes needed to exclude lists (existing file)

### Verification
- [x] TypeScript compiles without errors
- [x] ESLint passes
- [ ] Tests pass in testcontainers environment (requires Docker)

**Status:** COMPLETE

---

## Phase 2: Task 1.4 - Migration Happy Path Tests [P2]
**Estimated**: 120-150 LOC, 5-7 tests
**File**: Create `tests/integration/migration-runner.test.ts`
**Confidence**: 80%

### Tests to Implement
- [ ] **Fresh state**: Before migrations → applied=[], current=null, pending=all
- [ ] **Apply to latest**: runMigrationsToVersion → pending=[], current=last tag
- [ ] **Apply to target**: Partial migration → current=target, pending=remaining
- [ ] **Seed history**: seedMigrationHistory → getMigrationState reflects seeded
- [ ] **Reset database**: resetDatabase → state returns to clean
- [ ] **Invalid target error**: Non-existent tag → throws

### Prerequisites
- [ ] Add `CREATE EXTENSION IF NOT EXISTS pgcrypto;` to test setup
- [ ] Use raw PostgreSqlContainer (not setupTestDB)

### Implementation Pattern
```typescript
describe('Migration Runner', () => {
  let container: StartedPostgreSqlContainer;

  beforeAll(async () => {
    container = await new PostgreSqlContainer().start();
    await execSQL(container, 'CREATE EXTENSION IF NOT EXISTS pgcrypto;');
  });

  it('reports fresh state correctly', async () => {
    const state = await getMigrationState(container);
    expect(state.applied).toHaveLength(0);
    expect(state.current).toBeNull();
    expect(state.pending.length).toBeGreaterThan(0);
  });
});
```

### CI Configuration
- [ ] Add to `vitest.config.int.ts` exclude list
- [ ] Ensure runs in `testcontainers-ci.yml`

**Status:** pending

---

## Phase 3: Documentation & Closure
- [ ] Update progress.md with implementation details
- [ ] Update findings.md with any discoveries
- [ ] Add to test documentation if needed
- [ ] Close issue #360 with summary of scope reduction

**Status:** pending

---

## DEFERRED (Out of Scope)

### Task 1.4 - Rollback Testing
**Reason**: No down.sql files exist, rollback uses inferred DROP TABLE
**Risk**: High - data loss potential, undefined behavior
**Action**: Create follow-up issue for rollback infrastructure

### Task 1.4 - Checksum Validation
**Reason**: Requires mocking file checksums, complex setup
**Risk**: Medium - test isolation challenges
**Action**: Defer to future session

### Task 1.4 - Inferred Table Drop
**Reason**: Dangerous operation, edge case only
**Risk**: High - could corrupt test databases
**Action**: Defer indefinitely

---

## Decision Log

| Decision | Rationale | Date |
|----------|-----------|------|
| Fold Task 1.5 into existing file | Reduces duplication, follows existing patterns | 2026-01-17 |
| Defer rollback testing | No down files, high risk, unclear requirements | 2026-01-17 |
| Focus on happy path only | Validates core functionality without edge case risks | 2026-01-17 |
| Use raw container for migrations | Avoids setupTestDB side effects | 2026-01-17 |

---

## Acceptance Criteria (Revised)

- [x] ~~Migration runner tests with real database~~ → Happy path only
- [ ] ~~Rollback mechanism verified~~ → DEFERRED
- [ ] MatrixKey generation tests (added to existing file)
- [ ] All tests passing in CI
- [ ] Integration tests documented

---

## Files to Create/Modify

| File | Action | LOC |
|------|--------|-----|
| `tests/integration/ScenarioMatrixCache.integration.test.ts` | MODIFY | +40-60 |
| `tests/integration/migration-runner.test.ts` | CREATE | 120-150 |
| `vitest.config.int.ts` | MODIFY | +1 (exclude entry) |
