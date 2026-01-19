---
status: ACTIVE
last_updated: 2026-01-19
---

# Snapshot Service Versioning Implementation Plan

**Feature**: Model versioning and scenario comparison for forecast snapshots
**Author**: Claude Code Planning Agent
**Date**: 2026-01-04
**Status**: APPROVED - Ready for Implementation

---

## Design Decisions (Approved)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Version semantics | **Simple named-versions** | No git-like branching complexity |
| Retention policy | **Auto-prune after 90 days** | Balance storage vs audit needs |
| Merge support | **Deferred to Phase 2** | Focus on core versioning first |

---

## Executive Summary

This plan extends the existing `SnapshotService` to support **model versioning** and **scenario comparison**, enabling GPs to:

1. Track version history of fund/portfolio snapshots
2. Create named versions for "what-if" analysis
3. Compare versions side-by-side with delta metrics
4. Restore or roll back to previous versions
5. Auto-prune old versions after 90 days

The design builds on existing patterns (`forecastSnapshots`, `ComparisonService`) and follows anti-pattern prevention guidelines.

---

## Architecture Overview

```
+------------------+     +---------------------+     +--------------------+
|  Snapshot        |     |  SnapshotVersion    |     |  VersionComparison |
|  Service         |---->|  Service            |---->|  Service           |
|  (existing)      |     |  (new)              |     |  (new)             |
+------------------+     +---------------------+     +--------------------+
        |                         |                           |
        v                         v                           v
+------------------+     +---------------------+     +--------------------+
| forecast_        |     | snapshot_versions   |     | Redis Cache        |
| snapshots        |     | (new table)         |     | (ephemeral)        |
+------------------+     +---------------------+     +--------------------+
                                  |
                                  v
                         +--------------------+
                         | Auto-prune job     |
                         | (90-day retention) |
                         +--------------------+
```

---

## Phase 1: Database Schema (Migration 0007)

### 1.1 New Table: `snapshot_versions`

```sql
-- Migration: 0007_snapshot_versioning.sql

CREATE TABLE snapshot_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL REFERENCES forecast_snapshots(id) ON DELETE CASCADE,

  -- Version tracking (simple sequential numbering)
  version_number INTEGER NOT NULL,
  parent_version_id UUID REFERENCES snapshot_versions(id),

  -- Named version support (optional label for what-if scenarios)
  version_name VARCHAR(100),
  is_current BOOLEAN DEFAULT false,

  -- State capture (immutable after creation)
  state_snapshot JSONB NOT NULL,
  calculated_metrics JSONB,
  source_hash VARCHAR(64) NOT NULL,

  -- Metadata
  description TEXT,
  created_by UUID,
  tags TEXT[],

  -- Retention policy
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '90 days'),
  is_pinned BOOLEAN DEFAULT false,  -- Pinned versions are not auto-pruned

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT snapshot_versions_unique_version
    UNIQUE (snapshot_id, version_number)
);

-- Indexes for efficient queries
CREATE INDEX idx_snapshot_versions_snapshot_id
  ON snapshot_versions(snapshot_id, version_number DESC);

CREATE INDEX idx_snapshot_versions_current
  ON snapshot_versions(snapshot_id)
  WHERE is_current = true;

CREATE INDEX idx_snapshot_versions_parent
  ON snapshot_versions(parent_version_id);

CREATE INDEX idx_snapshot_versions_source_hash
  ON snapshot_versions(source_hash);

CREATE INDEX idx_snapshot_versions_expires
  ON snapshot_versions(expires_at)
  WHERE is_pinned = false;

-- Function to ensure only one current version per snapshot
CREATE OR REPLACE FUNCTION ensure_single_current()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_current = true THEN
    UPDATE snapshot_versions
    SET is_current = false
    WHERE snapshot_id = NEW.snapshot_id
      AND id != NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER snapshot_versions_current_trigger
BEFORE INSERT OR UPDATE ON snapshot_versions
FOR EACH ROW EXECUTE FUNCTION ensure_single_current();

-- Function to auto-prune expired versions (run via cron/scheduler)
CREATE OR REPLACE FUNCTION prune_expired_versions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM snapshot_versions
  WHERE expires_at < NOW()
    AND is_pinned = false;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
```

### 1.2 Drizzle Schema Definition

**File**: `shared/schema.ts` (additions)

```typescript
// ============================================================================
// SNAPSHOT VERSIONS - Simple version history with auto-pruning
// ============================================================================
export const snapshotVersions = pgTable(
  'snapshot_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    snapshotId: uuid('snapshot_id')
      .notNull()
      .references(() => forecastSnapshots.id, { onDelete: 'cascade' }),

    // Version tracking (simple sequential)
    versionNumber: integer('version_number').notNull(),
    parentVersionId: uuid('parent_version_id')
      .references((): AnyPgColumn => snapshotVersions.id),

    // Named versions for what-if scenarios
    versionName: varchar('version_name', { length: 100 }),
    isCurrent: boolean('is_current').default(false).notNull(),

    // Immutable state capture
    stateSnapshot: jsonb('state_snapshot').notNull(),
    calculatedMetrics: jsonb('calculated_metrics'),
    sourceHash: varchar('source_hash', { length: 64 }).notNull(),

    // Metadata
    description: text('description'),
    createdBy: uuid('created_by'),
    tags: text('tags').array(),

    // Retention policy (90 days default)
    expiresAt: timestamp('expires_at', { withTimezone: true })
      .default(sql`NOW() + INTERVAL '90 days'`),
    isPinned: boolean('is_pinned').default(false).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueVersion: unique().on(table.snapshotId, table.versionNumber),
    snapshotVersionIdx: index('idx_snapshot_versions_snapshot_id').on(
      table.snapshotId,
      table.versionNumber.desc()
    ),
    currentIdx: index('idx_snapshot_versions_current')
      .on(table.snapshotId)
      .where(sql`${table.isCurrent} = true`),
    parentIdx: index('idx_snapshot_versions_parent').on(table.parentVersionId),
    sourceHashIdx: index('idx_snapshot_versions_source_hash').on(table.sourceHash),
    expiresIdx: index('idx_snapshot_versions_expires')
      .on(table.expiresAt)
      .where(sql`${table.isPinned} = false`),
  })
);

export type SnapshotVersion = typeof snapshotVersions.$inferSelect;
export type InsertSnapshotVersion = typeof snapshotVersions.$inferInsert;
```

---

## Phase 2: Service Layer

### 2.1 SnapshotVersionService

**File**: `server/services/snapshot-version-service.ts`

```typescript
/**
 * Snapshot Version Service
 *
 * Manages version history for forecast snapshots with simple named versions.
 * Supports 90-day auto-pruning with pin capability.
 */

export interface CreateVersionData {
  snapshotId: string;
  stateSnapshot: Record<string, unknown>;
  calculatedMetrics?: Record<string, unknown>;
  versionName?: string;      // Optional label (e.g., "Q4 Forecast", "What-if: High Growth")
  description?: string;
  createdBy?: string;
  tags?: string[];
  isPinned?: boolean;        // Pinned = never auto-pruned
}

export interface ListVersionsFilter {
  snapshotId: string;
  cursor?: string;
  limit?: number;
  includeExpired?: boolean;  // Default: false (hide expired)
}

export interface PaginatedVersions {
  versions: SnapshotVersion[];
  nextCursor?: string;
  hasMore: boolean;
}

export class SnapshotVersionService {
  /**
   * Create a new version
   *
   * Automatically increments version number, sets parent reference,
   * and marks as current version. Expires in 90 days unless pinned.
   */
  async createVersion(data: CreateVersionData): Promise<SnapshotVersion>;

  /**
   * List versions for a snapshot with pagination
   *
   * Returns versions ordered by version_number DESC.
   */
  async listVersions(filter: ListVersionsFilter): Promise<PaginatedVersions>;

  /**
   * Get a specific version by ID
   */
  async getVersion(versionId: string): Promise<SnapshotVersion>;

  /**
   * Get current (latest) version for a snapshot
   */
  async getCurrent(snapshotId: string): Promise<SnapshotVersion>;

  /**
   * Get version by number
   */
  async getVersionByNumber(snapshotId: string, versionNumber: number): Promise<SnapshotVersion>;

  /**
   * Get version history (ancestry chain from a version)
   */
  async getHistory(versionId: string, limit?: number): Promise<SnapshotVersion[]>;

  /**
   * Restore snapshot to a previous version
   *
   * Creates a new version with the state from the target version.
   */
  async restore(
    snapshotId: string,
    targetVersionId: string,
    description?: string
  ): Promise<SnapshotVersion>;

  /**
   * Pin a version (prevent auto-pruning)
   */
  async pinVersion(versionId: string): Promise<SnapshotVersion>;

  /**
   * Unpin a version (allow auto-pruning)
   */
  async unpinVersion(versionId: string): Promise<SnapshotVersion>;

  /**
   * Manually prune expired versions (called by scheduler)
   */
  async pruneExpired(): Promise<number>;

  // Private helpers
  private computeSourceHash(state: Record<string, unknown>): string;
  private getNextVersionNumber(snapshotId: string): Promise<number>;
  private verifySnapshotExists(snapshotId: string): Promise<void>;
}
```

### 2.2 VersionComparisonService

**File**: `server/services/version-comparison-service.ts`

```typescript
/**
 * Version Comparison Service
 *
 * Computes diffs between snapshot versions with metric deltas.
 * Extends existing ComparisonService patterns.
 */

export interface VersionDiffRequest {
  baseVersionId: string;
  comparisonVersionId: string;
  metrics?: ComparisonMetric[];
}

export interface VersionDiffResult {
  id: string;
  baseVersion: VersionSummary;
  comparisonVersion: VersionSummary;
  stateDiff: StateDiff;
  metricDeltas: DeltaMetric[];
  computedAt: string;
  expiresAt: string;
}

export interface StateDiff {
  added: string[];      // Keys added in comparison
  removed: string[];    // Keys removed in comparison
  modified: string[];   // Keys with changed values
  unchanged: string[];  // Keys with same values
  details: DiffDetail[];
}

export interface DiffDetail {
  path: string;         // JSON path (e.g., "fundState.size")
  baseValue: unknown;
  comparisonValue: unknown;
  changeType: 'added' | 'removed' | 'modified';
}

export class VersionComparisonService {
  private redis: RedisClientType | null;
  private readonly CACHE_TTL = 300; // 5 minutes

  constructor(redis: RedisClientType | null);

  /**
   * Compare two versions and return diff with metric deltas
   */
  async compareVersions(request: VersionDiffRequest): Promise<VersionDiffResult>;

  /**
   * Get cached comparison result
   */
  async getCachedComparison(comparisonId: string): Promise<VersionDiffResult | null>;

  /**
   * Compare version to its parent (delta from last commit)
   */
  async compareToParent(versionId: string): Promise<VersionDiffResult | null>;

  /**
   * Get timeline of changes across versions
   */
  async getChangeTimeline(
    snapshotId: string,
    fromVersion?: number,
    toVersion?: number
  ): Promise<ChangeTimelineEntry[]>;

  // Private helpers
  private computeStateDiff(base: unknown, comparison: unknown): StateDiff;
  private computeMetricDeltas(base: unknown, comparison: unknown): DeltaMetric[];
}
```

---

## Phase 3: API Endpoints

### 3.1 Version Management Routes

**File**: `server/routes/portfolio/versions.ts`

```typescript
// Base path: /api/snapshots/:snapshotId/versions

/**
 * POST /api/snapshots/:snapshotId/versions
 * Create a new version (saves current state)
 *
 * Request: { versionName?, description?, tags?, isPinned? }
 * Response: 201 { data: SnapshotVersion }
 */

/**
 * GET /api/snapshots/:snapshotId/versions
 * List versions with pagination
 *
 * Query: { cursor?, limit?, includeExpired? }
 * Response: 200 { data: SnapshotVersion[], pagination: { hasMore, nextCursor } }
 */

/**
 * GET /api/snapshots/:snapshotId/versions/current
 * Get current (latest) version
 *
 * Response: 200 { data: SnapshotVersion }
 */

/**
 * GET /api/snapshots/:snapshotId/versions/:versionId
 * Get specific version by ID
 *
 * Response: 200 { data: SnapshotVersion }
 */

/**
 * GET /api/snapshots/:snapshotId/versions/number/:versionNumber
 * Get specific version by number
 *
 * Response: 200 { data: SnapshotVersion }
 */

/**
 * POST /api/snapshots/:snapshotId/versions/:versionId/restore
 * Restore to this version (creates new version with old state)
 *
 * Request: { description? }
 * Response: 201 { data: SnapshotVersion }
 */

/**
 * POST /api/snapshots/:snapshotId/versions/:versionId/pin
 * Pin version (prevent auto-pruning)
 *
 * Response: 200 { data: SnapshotVersion }
 */

/**
 * DELETE /api/snapshots/:snapshotId/versions/:versionId/pin
 * Unpin version (allow auto-pruning)
 *
 * Response: 200 { data: SnapshotVersion }
 */

/**
 * GET /api/snapshots/:snapshotId/versions/:versionId/history
 * Get ancestry chain for a version
 *
 * Query: { limit? }
 * Response: 200 { data: SnapshotVersion[] }
 */
```

### 3.2 Comparison Routes

**File**: `server/routes/portfolio/comparisons.ts`

```typescript
// Base path: /api/versions

/**
 * POST /api/versions/compare
 * Compare two versions
 *
 * Request: { baseVersionId, comparisonVersionId, metrics? }
 * Response: 200 { data: VersionDiffResult }
 */

/**
 * GET /api/versions/:versionId/diff
 * Get diff from parent version
 *
 * Response: 200 { data: VersionDiffResult }
 */

/**
 * GET /api/snapshots/:snapshotId/timeline
 * Get change timeline
 *
 * Query: { fromVersion?, toVersion?, limit? }
 * Response: 200 { data: ChangeTimelineEntry[] }
 */
```

---

## Phase 4: Zod Validation Schemas

**File**: `shared/schemas/version-schemas.ts`

```typescript
import { z } from 'zod';

export const CreateVersionRequestSchema = z.object({
  versionName: z.string().max(100).optional(),
  description: z.string().max(500).optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
  isPinned: z.boolean().optional(),
});

export const ListVersionsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  includeExpired: z.coerce.boolean().default(false),
});

export const VersionIdParamSchema = z.object({
  snapshotId: z.string().uuid(),
  versionId: z.string().uuid(),
});

export const VersionNumberParamSchema = z.object({
  snapshotId: z.string().uuid(),
  versionNumber: z.coerce.number().int().positive(),
});

export const CompareVersionsRequestSchema = z.object({
  baseVersionId: z.string().uuid(),
  comparisonVersionId: z.string().uuid(),
  metrics: z.array(z.enum([
    'moic', 'irr', 'tvpi', 'dpi', 'total_investment',
    'follow_ons', 'exit_proceeds', 'exit_valuation'
  ])).optional(),
});

export const RestoreVersionRequestSchema = z.object({
  description: z.string().max(500).optional(),
});

export const HistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
```

---

## Phase 5: Testing Strategy

### 5.1 Unit Tests

**File**: `tests/unit/services/snapshot-version-service.test.ts`

```typescript
describe('SnapshotVersionService', () => {
  describe('createVersion', () => {
    it('creates first version with version_number = 1');
    it('increments version_number for subsequent versions');
    it('sets parent_version_id to previous current');
    it('marks new version as current');
    it('unmarks previous current version');
    it('computes source_hash from state');
    it('handles concurrent version creation gracefully');
    it('sets expires_at to 90 days from now');
    it('does not set expires_at when isPinned is true');
  });

  describe('pinVersion/unpinVersion', () => {
    it('sets isPinned to true');
    it('clears expires_at when pinned');
    it('sets expires_at to 90 days when unpinned');
    it('throws VersionNotFoundError for invalid ID');
  });

  describe('restore', () => {
    it('creates new version with restored state');
    it('preserves version history');
    it('sets appropriate description');
    it('marks restored version as current');
  });

  describe('listVersions', () => {
    it('returns versions in descending order');
    it('supports cursor pagination');
    it('excludes expired versions by default');
    it('includes expired versions when includeExpired is true');
  });

  describe('pruneExpired', () => {
    it('deletes versions past expires_at');
    it('preserves pinned versions');
    it('returns count of deleted versions');
  });
});
```

### 5.2 Integration Tests

**File**: `tests/integration/version-comparison.test.ts`

```typescript
describe('Version Comparison API', () => {
  describe('POST /api/versions/compare', () => {
    it('computes diff between two versions');
    it('returns metric deltas');
    it('caches result in Redis');
    it('returns 404 for non-existent versions');
  });

  describe('GET /api/versions/:versionId/diff', () => {
    it('returns diff from parent');
    it('returns null for root version');
  });

  describe('GET /api/snapshots/:id/timeline', () => {
    it('returns chronological change entries');
    it('supports version range filtering');
  });
});
```

---

## Phase 6: Implementation Tasks

### Sprint 1: Foundation (2-3 days)

| Task | Description | Files |
|------|-------------|-------|
| 1.1 | Create migration 0007_snapshot_versioning.sql | `server/db/migrations/` |
| 1.2 | Add Drizzle schema for snapshot_versions | `shared/schema.ts` |
| 1.3 | Create SnapshotVersionService class | `server/services/` |
| 1.4 | Add Zod validation schemas | `shared/schemas/` |
| 1.5 | Unit tests for SnapshotVersionService | `tests/unit/services/` |

### Sprint 2: API Layer (2 days)

| Task | Description | Files |
|------|-------------|-------|
| 2.1 | Implement version CRUD routes | `server/routes/portfolio/versions.ts` |
| 2.2 | Add pin/unpin endpoints | `server/routes/portfolio/versions.ts` |
| 2.3 | Integration tests for version routes | `tests/integration/` |
| 2.4 | Register routes in app | `server/routes/index.ts` |

### Sprint 3: Comparison & Pruning (2 days)

| Task | Description | Files |
|------|-------------|-------|
| 3.1 | Create VersionComparisonService | `server/services/` |
| 3.2 | Implement diff computation | `shared/utils/diff.ts` |
| 3.3 | Add comparison routes | `server/routes/portfolio/comparisons.ts` |
| 3.4 | Add pruning scheduler job | `server/jobs/` |
| 3.5 | Integration tests for comparison | `tests/integration/` |

### Sprint 4: Polish (1 day)

| Task | Description | Files |
|------|-------------|-------|
| 4.1 | Add audit logging for version operations | `server/middleware/` |
| 4.2 | Documentation update | `CHANGELOG.md`, `DECISIONS.md` |
| 4.3 | Final review and cleanup | various |

**Total estimated time: 7-8 days** (reduced from 8-12 days due to simpler design)

---

## Detailed Implementation Tasks (Superpowers Format)

Each task is 2-5 minutes, with exact file paths, complete code, and verification steps.

### Task 1.1: Create Migration File

**File**: `server/db/migrations/0007_snapshot_versioning.sql`

**Action**: Create new file with SQL from Phase 1.1 section above.

**Verification**:
```bash
# File exists and has correct structure
head -20 server/db/migrations/0007_snapshot_versioning.sql
# Should show: CREATE TABLE snapshot_versions (
```

---

### Task 1.2: Add Drizzle Schema

**File**: `shared/schema.ts`

**Action**: Add `snapshotVersions` table definition after `forecastSnapshots` (around line 275).

**Verification**:
```bash
# Check schema compiles
npm run check
# Should pass with no errors
```

---

### Task 1.3: Create Version Types

**File**: `shared/types/snapshot-version.ts` (new file)

**Code**:
```typescript
/**
 * Snapshot Version Types
 */

export interface VersionSummary {
  id: string;
  versionNumber: number;
  versionName?: string;
  isCurrent: boolean;
  isPinned: boolean;
  createdAt: string;
}

export interface VersionDiff {
  baseVersion: VersionSummary;
  comparisonVersion: VersionSummary;
  addedKeys: string[];
  removedKeys: string[];
  modifiedKeys: string[];
}

export interface PaginatedVersions {
  versions: VersionSummary[];
  nextCursor?: string;
  hasMore: boolean;
}
```

**Verification**:
```bash
npm run check
# No type errors
```

---

### Task 1.4: Create Zod Schemas

**File**: `shared/schemas/version-schemas.ts` (new file)

**Action**: Add schemas from Phase 4 section above.

**Verification**:
```bash
npm run check
# Types compile correctly
```

---

### Task 1.5: Create SnapshotVersionService Skeleton

**File**: `server/services/snapshot-version-service.ts` (new file)

**Code**:
```typescript
/**
 * Snapshot Version Service
 *
 * Manages version history for forecast snapshots.
 * Supports 90-day auto-pruning with pin capability.
 */

import { db } from '../db';
import { snapshotVersions, forecastSnapshots } from '@shared/schema';
import type { SnapshotVersion, InsertSnapshotVersion } from '@shared/schema';
import { eq, and, desc, lt, sql } from 'drizzle-orm';
import { createHash } from 'crypto';

// Error classes
export class VersionNotFoundError extends Error {
  constructor(versionId: string) {
    super(`Version not found: ${versionId}`);
    this.name = 'VersionNotFoundError';
  }
}

export class SnapshotNotFoundError extends Error {
  constructor(snapshotId: string) {
    super(`Snapshot not found: ${snapshotId}`);
    this.name = 'SnapshotNotFoundError';
  }
}

// Service class (methods to be implemented)
export class SnapshotVersionService {
  // TODO: Implement methods
}
```

**Verification**:
```bash
npm run check
# Compiles without errors
```

---

### Task 1.6: Implement createVersion Method

**File**: `server/services/snapshot-version-service.ts`

**Test First** (RED):
```typescript
// tests/unit/services/snapshot-version-service.test.ts
describe('createVersion', () => {
  it('creates first version with version_number = 1', async () => {
    const version = await service.createVersion({
      snapshotId: testSnapshotId,
      stateSnapshot: { fund: { size: 100000000 } },
    });
    expect(version.versionNumber).toBe(1);
    expect(version.isCurrent).toBe(true);
  });
});
```

**Verification**:
```bash
npm test -- --grep "creates first version"
# Should FAIL initially (RED), then PASS after implementation (GREEN)
```

---

### Task 2.1: Create Version Routes File

**File**: `server/routes/portfolio/versions.ts` (new file)

**Skeleton**:
```typescript
import { Router } from 'express';
import { SnapshotVersionService } from '../../services/snapshot-version-service';

const router = Router({ mergeParams: true });
const versionService = new SnapshotVersionService();

// POST /api/snapshots/:snapshotId/versions
router.post('/', async (req, res, next) => {
  // TODO: Implement
});

// GET /api/snapshots/:snapshotId/versions
router.get('/', async (req, res, next) => {
  // TODO: Implement
});

export default router;
```

**Verification**:
```bash
npm run check
# Compiles
```

---

### Task 2.2: Register Routes

**File**: `server/routes/index.ts`

**Action**: Import and mount version routes.

```typescript
import versionRoutes from './portfolio/versions';

// Mount under /api/snapshots/:snapshotId/versions
router.use('/snapshots/:snapshotId/versions', versionRoutes);
```

**Verification**:
```bash
npm run dev:api
# Server starts without errors
curl http://localhost:5000/api/snapshots/test/versions
# Should return 404 or 400 (route exists but validation fails)
```

---

## Anti-Pattern Compliance Checklist

| Pattern | Implementation |
|---------|----------------|
| AP-CURSOR-01 | Composite index on (snapshotId, versionNumber DESC) |
| AP-CURSOR-02 | Zod validation for cursor parameter |
| AP-CURSOR-03 | UUID-based version IDs |
| AP-CURSOR-04 | Limit clamped to max 100 |
| AP-IDEM-01 | Unique constraint on (snapshotId, branchName, versionNumber) |
| AP-LOCK-01 | No pessimistic locking used |
| AP-LOCK-02 | Version tracking via version_number (integer) |
| AP-AUDIT-01 | Audit log entries for all mutations |

---

## Design Decisions (Finalized)

| # | Decision | Choice | Status |
|---|----------|--------|--------|
| 1 | **Version semantics** | Simple named-versions (no git-like branching) | APPROVED |
| 2 | **State storage** | Full state snapshots (no incremental diffs) | APPROVED |
| 3 | **Retention policy** | Auto-prune after 90 days (with pin capability) | APPROVED |
| 4 | **Merge support** | Deferred to Phase 2 | APPROVED |

### Rationale

1. **Named versions**: Simpler mental model for GPs who aren't developers. A version is just a named checkpoint, not a branch.

2. **Full snapshots**: Simpler implementation, easier debugging, no complexity around diff reconstruction. Storage is cheap.

3. **90-day retention**: Balances storage costs with reasonable audit window. Pinned versions (marked important) are never pruned. Can extend to 7 years for compliance if needed.

4. **No merge**: Fork-and-compare is sufficient for what-if analysis. True merging adds complexity without clear use case.

---

## Success Criteria

1. Users can create named versions of snapshots with descriptions
2. Users can view version history with pagination
3. Users can compare any two versions with metric deltas
4. Users can restore to any previous version
5. Users can pin important versions to prevent auto-pruning
6. Expired versions (>90 days, unpinned) are automatically pruned
7. All operations follow anti-pattern prevention guidelines
8. Test coverage >= 80% for new code

---

## References

- Existing SnapshotService: `server/services/snapshot-service.ts`
- ComparisonService patterns: `server/services/comparison-service.ts`
- Anti-pattern guide: `cheatsheets/anti-pattern-prevention.md`
- Schema patterns: `shared/schema.ts:220-300`
