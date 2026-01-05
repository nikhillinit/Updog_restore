# Phase 3 Session 2 Kickoff: ScenarioMatrixCache Implementation

**Date**: 2026-01-05 **Branch**: `claude/phase3-scenario-matrix-cache`
**Status**: IN PROGRESS (40% complete) **Duration Target**: 120 minutes total
(80 minutes remaining)

---

## Session Context

This is a **continuation of Phase 3 Session 2** which began implementing the
ScenarioMatrixCache dual-tier caching system (PostgreSQL + Redis) for Monte
Carlo scenario matrices.

**Critical Discovery**: Session 1 (PR #350) was merged with incomplete schema
changes. The schema corrections were documented but never committed. This
session began by fixing that gap (commit 0a89c1be), then started implementing
the cache class.

---

## Current Status Summary

### [DONE] Completed (Tasks 1-4)

1. **Schema Corrections (CRITICAL FIX)** - Commit: 0a89c1be
   - Fixed missing Session 1 changes that were documented but never committed
   - Updated `shared/schema.ts`: Removed `scenarioId` FK, added `matrixKey`,
     `fundId`, `taxonomyVersion`
   - Updated `shared/migrations/0002_create_scenario_matrices.sql`: Aligned SQL
     with schema
   - Updated `tests/unit/schema/portfolio-optimization-schema.test.ts`: Fixed 4
     failing tests
   - **Result**: 29/29 schema tests passing, 0 TypeScript errors

2. **ScenarioMatrixCache Class Foundation** - File:
   `shared/core/optimization/ScenarioMatrixCache.ts`
   - Created class with dual-tier cache architecture
   - Implemented canonical SHA-256 key generation v1.2
   - Added recycling normalization in key generation
   - Cache lookup order: Redis -> PostgreSQL -> ScenarioGenerator
   - **Result**: 296 lines, core architecture complete

3. **Canonical Key Hashing v1.2** - Method: `generateCanonicalKey()`
   - SHA-256 hash of canonical JSON configuration
   - Includes: fundId, taxonomyVersion, numScenarios, buckets,
     correlationWeights, recycling
   - 5 decimal precision for floats (eliminates noise)
   - Sorted keys for deterministic ordering
   - Recycling normalization: `enabled=false` -> no-op config

4. **Cache Miss Integration** - Method: `getOrGenerate()`
   - Checks Redis -> PostgreSQL -> calls ScenarioGenerator on miss
   - Stores results in both caches after generation
   - Returns metadata with cache source tracking

### [IN PROGRESS] Tasks 5-10 TODO

5. **PostgreSQL Storage Layer** - Methods: `checkPostgres()`, `storePostgres()`
   - **Status**: Stub implementation with TODO comments
   - **Needs**:
     - Drizzle ORM queries using `scenarioMatrices` table
     - INSERT with ON CONFLICT (matrix_key) DO NOTHING
     - SELECT with status='complete' filter
     - Proper type annotations for `db` parameter
   - **Files to reference**:
     - `shared/schema.ts` lines 2973-3032 (scenarioMatrices table definition)
     - `server/db.ts` (database instance)
     - `shared/types/database.ts` (ScenarioMatrixRow, ScenarioMatrixInsert
       types)

6. **Redis Cache Layer** - Methods: `checkRedis()`, `storeRedis()`
   - **Status**: Stub implementation with serialization logic
   - **Needs**:
     - Proper Redis client type annotation
     - Error handling for Redis unavailability
     - Verify 24-hour TTL (86400 seconds)
     - Test Buffer <-> base64 serialization

7. **Integration with ScenarioGenerator**
   - **Status**: Basic integration in `getOrGenerate()` method
   - **Needs**:
     - Verify ScenarioConfig <-> ScenarioConfigWithMeta mapping
     - Test with Phase 2 ScenarioGenerator
     - Handle compressed matrix metadata correctly

8. **Comprehensive Tests** - File: `tests/unit/core/ScenarioMatrixCache.test.ts`
   (create)
   - Cache miss -> generation -> storage (both caches)
   - Cache hit from Redis (hot path)
   - Cache hit from PostgreSQL (Redis evicted, warm-up)
   - Canonical key collision detection
   - Reproducibility tests (same config -> same key)
   - Redis unavailability graceful fallback
   - PostgreSQL error handling

9. **Quality Checks and Agent Reviews**
   - Run full test suite (expect 1896+ passing)
   - TypeScript type checking (maintain 492/492 baseline)
   - Lint checks (0 errors target)
   - code-reviewer agent validation
   - type-design-analyzer for cache class

10. **Create PR and Merge**
    - Commit remaining work with conventional commit message
    - Push branch to origin
    - Create PR with comprehensive description
    - Link to Issue #360 for follow-up integration tests
    - Merge after CI validation

---

## Files Modified So Far

1. [DONE] **shared/schema.ts** (lines 2973-3019)
   - Schema corrections: matrixKey, fundId, taxonomyVersion
   - Index updates: fund_tax_status, matrix_key, status

2. [DONE] **shared/migrations/0002_create_scenario_matrices.sql**
   - SQL migration aligned with Drizzle schema
   - Indexes: idx_scenario_matrices_fund_tax_status,
     idx_scenario_matrices_matrix_key

3. [DONE] **tests/unit/schema/portfolio-optimization-schema.test.ts**
   - Updated 4 tests for new schema structure
   - 29/29 tests passing

4. [DONE] **shared/core/optimization/ScenarioMatrixCache.ts** (NEW - 296 lines)
   - Dual-tier cache class with SHA-256 key generation
   - Redis + PostgreSQL integration stubs

---

## Key Design Decisions

### 1. Cache-Layer Architecture (Session 1 Fix)

- **Decision**: Remove FK to `portfolio_scenarios`, use `matrix_key` for cache
  identity
- **Rationale**: Cache layer should be loosely coupled for flexible invalidation
- **Trade-off**: No referential integrity (acceptable for cache)

### 2. Canonical Key Generation v1.2

- **Factors**: fundId, taxonomyVersion, numScenarios, buckets,
  correlationWeights, recycling
- **Normalization**: 5 decimal precision, sorted keys, recycling enabled=false
  -> no-op
- **Hash**: SHA-256 for collision resistance

### 3. Dual-Tier Caching Strategy

- **Hot cache**: Redis with 24-hour TTL for frequently accessed matrices
- **Durable storage**: PostgreSQL as source of truth
- **Warm-up**: Redis miss -> check PostgreSQL -> warm Redis for next access

---

## Implementation Guide for Next Session

### Step 1: Complete PostgreSQL Integration (~20 min)

**Task**: Implement `checkPostgres()` and `storePostgres()` methods

**Required imports**:

```typescript
import { eq, and } from 'drizzle-orm';
import { scenarioMatrices } from '@shared/schema';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
```

**Type annotation for constructor**:

```typescript
constructor(
  private readonly db: NodePgDatabase<typeof import('@shared/schema')>,
  private readonly redis?: RedisClientType
) {}
```

**checkPostgres() implementation**:

```typescript
private async checkPostgres(matrixKey: string): Promise<CompressedMatrix | null> {
  try {
    const result = await this.db
      .select({
        moicMatrix: scenarioMatrices.moicMatrix,
        compressionCodec: scenarioMatrices.compressionCodec,
        matrixLayout: scenarioMatrices.matrixLayout,
        bucketCount: scenarioMatrices.bucketCount,
        scenarioStates: scenarioMatrices.scenarioStates,
      })
      .from(scenarioMatrices)
      .where(
        and(
          eq(scenarioMatrices.matrixKey, matrixKey),
          eq(scenarioMatrices.status, 'complete')
        )
      )
      .limit(1);

    if (!result[0] || !result[0].moicMatrix) return null;

    return {
      data: result[0].moicMatrix as Buffer,
      codec: result[0].compressionCodec as 'zstd' | 'lz4' | 'none',
      layout: result[0].matrixLayout as 'row-major' | 'column-major',
      dimensions: {
        scenarios: (result[0].scenarioStates as any).scenarios.length,
        buckets: result[0].bucketCount!,
      },
    };
  } catch (error) {
    console.error('PostgreSQL cache read error:', error);
    return null;
  }
}
```

**storePostgres() implementation**:

```typescript
private async storePostgres(
  matrixKey: string,
  config: ScenarioConfigWithMeta,
  matrix: CompressedMatrix
): Promise<void> {
  try {
    await this.db
      .insert(scenarioMatrices)
      .values({
        matrixKey,
        fundId: config.fundId,
        taxonomyVersion: config.taxonomyVersion,
        matrixType: 'moic',
        moicMatrix: matrix.data,
        compressionCodec: matrix.codec,
        matrixLayout: matrix.layout,
        bucketCount: matrix.dimensions.buckets,
        scenarioStates: {
          scenarios: Array.from({ length: matrix.dimensions.scenarios }, (_, i) => ({
            id: i,
            params: {},
          })),
        },
        bucketParams: {
          min: 0,
          max: 1,
          count: matrix.dimensions.buckets,
          distribution: 'power-law',
        },
        sOpt: {
          algorithm: 'correlation-structure-v1',
          params: config.correlationWeights,
          convergence: {},
        },
        status: 'complete',
      })
      .onConflictDoNothing();
  } catch (error) {
    console.error('PostgreSQL cache write error:', error);
    throw error; // Fatal - PostgreSQL is source of truth
  }
}
```

### Step 2: Complete Redis Integration (~10 min)

**Type annotation**:

```typescript
import type { RedisClientType } from 'redis';
```

**Verify methods**:

- `checkRedis()`: Already implemented, verify Buffer serialization
- `storeRedis()`: Already implemented, verify 24-hour TTL

### Step 3: Write Comprehensive Tests (~30 min)

**Create**: `tests/unit/core/ScenarioMatrixCache.test.ts`

**Test structure**:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScenarioMatrixCache } from '@shared/core/optimization/ScenarioMatrixCache';

describe('ScenarioMatrixCache', () => {
  describe('Canonical Key Generation', () => {
    it('should generate same key for identical configs', () => {
      // Test reproducibility
    });

    it('should generate different keys for different configs', () => {
      // Test collision avoidance
    });

    it('should normalize recycling disabled to no-op', () => {
      // Test recycling normalization
    });
  });

  describe('Cache Miss -> Generation -> Storage', () => {
    it('should generate matrix and store in both caches on miss', async () => {
      // Mock db, redis, test full flow
    });
  });

  describe('Cache Hit from Redis', () => {
    it('should return cached matrix from Redis', async () => {
      // Mock redis hit
    });
  });

  describe('Cache Hit from PostgreSQL', () => {
    it('should return cached matrix from PostgreSQL and warm Redis', async () => {
      // Mock pg hit, redis miss
    });
  });

  describe('Error Handling', () => {
    it('should handle Redis unavailability gracefully', async () => {
      // Test without redis client
    });

    it('should throw on PostgreSQL storage failure', async () => {
      // Test fatal error
    });
  });
});
```

### Step 4: Quality Checks (~10 min)

```bash
# Run all tests
npm test

# Type checking
npm run check

# Lint
npm run lint

# Run schema tests specifically
npm test -- tests/unit/schema/portfolio-optimization-schema.test.ts
```

### Step 5: Commit and PR (~10 min)

**Commit message format**:

```
feat(phase3): implement ScenarioMatrixCache with dual-tier caching

Session 2 implementation: Dual-tier caching (PostgreSQL + Redis) for scenario matrices.

Key Features:
- Canonical SHA-256 key generation v1.2 with recycling normalization
- PostgreSQL durable storage with Drizzle ORM
- Redis hot cache with 24-hour TTL
- Graceful fallback on Redis unavailability
- Automatic cache warming from PostgreSQL

Architecture:
- Cache lookup order: Redis -> PostgreSQL -> ScenarioGenerator
- Cache miss triggers generation and dual storage
- Deterministic key: same config -> same key -> same matrix

Testing:
- XX/XX cache tests passing (cache miss, hit, reproducibility)
- 29/29 schema tests passing
- 1896+/1896+ total tests passing
- 0 new TypeScript errors

See: docs/plans/PHASE3-SESSION2-KICKOFF.md for session context

Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

**PR creation**:

```bash
git push -u origin claude/phase3-scenario-matrix-cache
gh pr create --title "feat(phase3): Session 2 - ScenarioMatrixCache dual-tier caching" \
  --body "$(cat <<'EOF'
## Summary

Implements ScenarioMatrixCache for Phase 3 Portfolio Optimization with dual-tier caching architecture.

**Session 2 Deliverables:**
- [x] Critical fix: Complete missing Session 1 schema corrections (commit 0a89c1be)
- [x] ScenarioMatrixCache class with dual-tier caching
- [x] Canonical SHA-256 key generation v1.2
- [x] PostgreSQL storage layer with Drizzle ORM
- [x] Redis cache layer with 24-hour TTL
- [x] Integration with ScenarioGenerator
- [x] Comprehensive tests (cache miss/hit/reproducibility)

## Architecture

**Dual-Tier Caching:**
- **Redis**: Hot cache for frequently accessed matrices (24-hour TTL)
- **PostgreSQL**: Durable storage, source of truth
- **Lookup order**: Redis -> PostgreSQL -> ScenarioGenerator

**Canonical Key v1.2:**
- SHA-256 hash of normalized configuration
- Includes: fundId, taxonomyVersion, numScenarios, buckets, correlationWeights, recycling
- Deterministic: same config -> same key

## Files Changed

### Critical Fix (Session 1 gap)
- `shared/schema.ts`: Schema corrections (matrixKey, fundId, taxonomyVersion)
- `shared/migrations/0002_create_scenario_matrices.sql`: SQL migration alignment
- `tests/unit/schema/portfolio-optimization-schema.test.ts`: 4 tests fixed (29/29 passing)

### Session 2 Implementation
- `shared/core/optimization/ScenarioMatrixCache.ts`: Cache class (296+ lines)
- `tests/unit/core/ScenarioMatrixCache.test.ts`: Comprehensive tests

## Test Results

- Schema tests: 29/29 passing
- Cache tests: XX/XX passing
- Total tests: 1896+/1896+ passing
- TypeScript: 492/492 baseline (0 new errors)
- Lint: 0 errors

## Next Steps

- Issue #360: Integration tests with real PostgreSQL database
- Session 3: MILP Optimizer implementation

## References

- Session Plan: [PHASE3-SESSION-PLAN.md](docs/plans/PHASE3-SESSION-PLAN.md)
- Session 1 Summary: [PHASE3-SESSION1-SUMMARY.md](docs/plans/PHASE3-SESSION1-SUMMARY.md)
- Session 2 Kickoff: [PHASE3-SESSION2-KICKOFF.md](docs/plans/PHASE3-SESSION2-KICKOFF.md)
EOF
)"
```

---

## Quick Reference Commands

### Check Current State

```bash
git status
git log --oneline -5
git diff main..HEAD --stat
```

### Run Tests

```bash
# All tests
npm test

# Schema tests only
npm test -- tests/unit/schema/portfolio-optimization-schema.test.ts

# Cache tests only (after creating)
npm test -- tests/unit/core/ScenarioMatrixCache.test.ts

# With coverage
npm test -- --coverage
```

### Type Checking

```bash
npm run check
```

### View Schema

```bash
# Drizzle schema
cat shared/schema.ts | sed -n '2973,3032p'

# SQL migration
cat shared/migrations/0002_create_scenario_matrices.sql
```

---

## Important Files Reference

### Schema & Types

- `shared/schema.ts`: Lines 2973-3032 (scenarioMatrices table)
- `shared/types/database.ts`: ScenarioMatrixRow, ScenarioMatrixInsert types
- `shared/migrations/0002_create_scenario_matrices.sql`: SQL migration

### Cache Implementation

- `shared/core/optimization/ScenarioMatrixCache.ts`: Cache class
- `shared/core/optimization/ScenarioGenerator.ts`: Generator integration
- `shared/core/optimization/MatrixCompression.ts`: Compression utilities

### Database

- `server/db.ts`: Database instance
- `drizzle.config.ts`: Drizzle ORM configuration

### Tests

- `tests/unit/schema/portfolio-optimization-schema.test.ts`: 29 schema tests
- `tests/unit/core/ScenarioGenerator.test.ts`: Generator tests (reference)

---

## Session Metrics Target

| Metric            | Target      | Current         |
| ----------------- | ----------- | --------------- |
| Duration          | 120 min     | 40 min (33%)    |
| Tasks Complete    | 8/8         | 4/8 (50%)       |
| Tests Passing     | 1896+       | 1896 (baseline) |
| New Tests         | 20+         | 0 (pending)     |
| TypeScript Errors | 0 new       | 0 [DONE]        |
| Lint Errors       | 0           | 0 [DONE]        |
| Code Review       | No critical | Pending         |

---

## Kickoff Prompt for New Chat

```
Continue Phase 3 Session 2: ScenarioMatrixCache implementation

Context: Working on c:\dev\Updog_restore, branch claude/phase3-scenario-matrix-cache

Session 2 is 40% complete (4/8 tasks done). Critical schema fix completed (commit 0a89c1be), ScenarioMatrixCache class foundation created.

**Current Status:**
- [DONE] Schema corrections (missing from Session 1)
- [DONE] ScenarioMatrixCache class foundation (296 lines)
- [DONE] Canonical SHA-256 key generation v1.2
- [DONE] Cache miss integration with ScenarioGenerator
- [WIP] PostgreSQL storage (stubs with TODOs)
- [WIP] Redis cache layer (stubs implemented)
- TODO: Comprehensive tests
- TODO: Quality checks and PR

**Next Tasks (80 min remaining):**
1. Complete PostgreSQL integration (checkPostgres, storePostgres methods)
2. Verify Redis cache layer
3. Write comprehensive tests (cache miss/hit/reproducibility)
4. Run quality checks (tests, typecheck, lint)
5. Commit and create PR

**Reference:** Read docs/plans/PHASE3-SESSION2-KICKOFF.md for full context and implementation guide.

Please proceed with Step 1: Complete PostgreSQL integration using the implementation guide in the kickoff document.
```

---

**Session 2 Status**: 40% complete, 80 minutes remaining **Ready to continue**:
PostgreSQL implementation -> Redis verification -> Tests -> PR
