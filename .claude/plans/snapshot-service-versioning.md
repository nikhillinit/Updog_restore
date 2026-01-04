# Snapshot Service Versioning Implementation Plan

**Feature**: Model versioning and scenario comparison for forecast snapshots
**Author**: Claude Code Planning Agent
**Date**: 2026-01-04
**Status**: Ready for Review

---

## Executive Summary

This plan extends the existing `SnapshotService` to support **model versioning** and **scenario comparison**, enabling GPs to:

1. Track version history of fund/portfolio snapshots
2. Branch/fork snapshots for "what-if" analysis
3. Compare versions side-by-side with delta metrics
4. Restore or roll back to previous versions

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
```

---

## Phase 1: Database Schema (Migration 0007)

### 1.1 New Table: `snapshot_versions`

```sql
-- Migration: 0007_snapshot_versioning.sql

CREATE TABLE snapshot_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL REFERENCES forecast_snapshots(id) ON DELETE CASCADE,

  -- Version tracking
  version_number INTEGER NOT NULL,
  parent_version_id UUID REFERENCES snapshot_versions(id),

  -- Fork/branch support
  branch_name VARCHAR(100) DEFAULT 'main',
  is_head BOOLEAN DEFAULT false,

  -- State capture (immutable after creation)
  state_snapshot JSONB NOT NULL,
  calculated_metrics JSONB,
  source_hash VARCHAR(64) NOT NULL,

  -- Metadata
  commit_message TEXT,
  created_by UUID,
  tags TEXT[],

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT snapshot_versions_unique_version
    UNIQUE (snapshot_id, branch_name, version_number)
);

-- Indexes for efficient queries
CREATE INDEX idx_snapshot_versions_snapshot_id
  ON snapshot_versions(snapshot_id, version_number DESC);

CREATE INDEX idx_snapshot_versions_branch_head
  ON snapshot_versions(snapshot_id, branch_name)
  WHERE is_head = true;

CREATE INDEX idx_snapshot_versions_parent
  ON snapshot_versions(parent_version_id);

CREATE INDEX idx_snapshot_versions_source_hash
  ON snapshot_versions(source_hash);

-- Function to ensure only one head per branch
CREATE OR REPLACE FUNCTION ensure_single_head()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_head = true THEN
    UPDATE snapshot_versions
    SET is_head = false
    WHERE snapshot_id = NEW.snapshot_id
      AND branch_name = NEW.branch_name
      AND id != NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER snapshot_versions_head_trigger
BEFORE INSERT OR UPDATE ON snapshot_versions
FOR EACH ROW EXECUTE FUNCTION ensure_single_head();
```

### 1.2 Drizzle Schema Definition

**File**: `shared/schema.ts` (additions)

```typescript
// ============================================================================
// SNAPSHOT VERSIONS - Version history with branching support
// ============================================================================
export const snapshotVersions = pgTable(
  'snapshot_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    snapshotId: uuid('snapshot_id')
      .notNull()
      .references(() => forecastSnapshots.id, { onDelete: 'cascade' }),

    // Version tracking
    versionNumber: integer('version_number').notNull(),
    parentVersionId: uuid('parent_version_id')
      .references((): AnyPgColumn => snapshotVersions.id),

    // Branch support
    branchName: varchar('branch_name', { length: 100 }).default('main').notNull(),
    isHead: boolean('is_head').default(false).notNull(),

    // Immutable state capture
    stateSnapshot: jsonb('state_snapshot').notNull(),
    calculatedMetrics: jsonb('calculated_metrics'),
    sourceHash: varchar('source_hash', { length: 64 }).notNull(),

    // Metadata
    commitMessage: text('commit_message'),
    createdBy: uuid('created_by'),
    tags: text('tags').array(),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueVersion: unique().on(table.snapshotId, table.branchName, table.versionNumber),
    snapshotVersionIdx: index('idx_snapshot_versions_snapshot_id').on(
      table.snapshotId,
      table.versionNumber.desc()
    ),
    branchHeadIdx: index('idx_snapshot_versions_branch_head')
      .on(table.snapshotId, table.branchName)
      .where(sql`${table.isHead} = true`),
    parentIdx: index('idx_snapshot_versions_parent').on(table.parentVersionId),
    sourceHashIdx: index('idx_snapshot_versions_source_hash').on(table.sourceHash),
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
 * Manages version history for forecast snapshots with branching support.
 * Implements git-like semantics: commit, branch, checkout, diff.
 */

export interface CreateVersionData {
  snapshotId: string;
  stateSnapshot: Record<string, unknown>;
  calculatedMetrics?: Record<string, unknown>;
  commitMessage?: string;
  createdBy?: string;
  tags?: string[];
  branchName?: string; // defaults to 'main'
}

export interface ListVersionsFilter {
  snapshotId: string;
  branchName?: string;
  cursor?: string;
  limit?: number;
}

export interface BranchData {
  snapshotId: string;
  sourceBranchName: string;
  sourceVersionNumber?: number; // defaults to head
  newBranchName: string;
}

export class SnapshotVersionService {
  /**
   * Create a new version (commit)
   *
   * Automatically increments version number, sets parent reference,
   * and marks as new head of branch.
   */
  async createVersion(data: CreateVersionData): Promise<SnapshotVersion>;

  /**
   * List versions for a snapshot with pagination
   *
   * Returns versions ordered by version_number DESC.
   */
  async listVersions(filter: ListVersionsFilter): Promise<PaginatedVersions>;

  /**
   * Get a specific version
   */
  async getVersion(versionId: string): Promise<SnapshotVersion>;

  /**
   * Get head version of a branch
   */
  async getHead(snapshotId: string, branchName?: string): Promise<SnapshotVersion>;

  /**
   * Create a new branch from existing version
   */
  async createBranch(data: BranchData): Promise<SnapshotVersion>;

  /**
   * List all branches for a snapshot
   */
  async listBranches(snapshotId: string): Promise<BranchInfo[]>;

  /**
   * Get version history (ancestry chain)
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
    commitMessage?: string
  ): Promise<SnapshotVersion>;

  // Private helpers
  private computeSourceHash(state: Record<string, unknown>): string;
  private getNextVersionNumber(snapshotId: string, branchName: string): Promise<number>;
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
 * Create a new version (commit current state)
 *
 * Request: { commitMessage?, tags?, branchName? }
 * Response: 201 { data: SnapshotVersion }
 */

/**
 * GET /api/snapshots/:snapshotId/versions
 * List versions with pagination
 *
 * Query: { branch?, cursor?, limit? }
 * Response: 200 { data: SnapshotVersion[], pagination }
 */

/**
 * GET /api/snapshots/:snapshotId/versions/:versionId
 * Get specific version
 *
 * Response: 200 { data: SnapshotVersion }
 */

/**
 * GET /api/snapshots/:snapshotId/versions/head
 * Get head version of branch
 *
 * Query: { branch? }
 * Response: 200 { data: SnapshotVersion }
 */

/**
 * POST /api/snapshots/:snapshotId/versions/:versionId/restore
 * Restore to this version (creates new version with old state)
 *
 * Request: { commitMessage? }
 * Response: 201 { data: SnapshotVersion }
 */
```

### 3.2 Branch Management Routes

**File**: `server/routes/portfolio/branches.ts`

```typescript
// Base path: /api/snapshots/:snapshotId/branches

/**
 * GET /api/snapshots/:snapshotId/branches
 * List all branches
 *
 * Response: 200 { data: BranchInfo[] }
 */

/**
 * POST /api/snapshots/:snapshotId/branches
 * Create new branch
 *
 * Request: { name, sourceVersion? }
 * Response: 201 { data: BranchInfo }
 */

/**
 * DELETE /api/snapshots/:snapshotId/branches/:branchName
 * Delete branch (preserves versions in history)
 *
 * Response: 204
 */
```

### 3.3 Comparison Routes

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
  commitMessage: z.string().max(500).optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
  branchName: z.string().max(100).regex(/^[a-z0-9-_]+$/).optional(),
});

export const ListVersionsQuerySchema = z.object({
  branch: z.string().max(100).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const CreateBranchRequestSchema = z.object({
  name: z.string().max(100).regex(/^[a-z0-9-_]+$/),
  sourceVersion: z.number().int().positive().optional(),
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
  commitMessage: z.string().max(500).optional(),
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
    it('sets parent_version_id to previous head');
    it('marks new version as head');
    it('unmarks previous head');
    it('computes source_hash from state');
    it('handles concurrent version creation gracefully');
  });

  describe('createBranch', () => {
    it('creates branch from head by default');
    it('creates branch from specific version');
    it('prevents duplicate branch names');
    it('copies state from source version');
  });

  describe('restore', () => {
    it('creates new version with restored state');
    it('preserves version history');
    it('sets appropriate commit message');
  });

  describe('listVersions', () => {
    it('returns versions in descending order');
    it('supports cursor pagination');
    it('filters by branch name');
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

### Sprint 1: Foundation (3-4 days)

| Task | Description | Files |
|------|-------------|-------|
| 1.1 | Create migration 0007_snapshot_versioning.sql | `server/db/migrations/` |
| 1.2 | Add Drizzle schema for snapshot_versions | `shared/schema.ts` |
| 1.3 | Create SnapshotVersionService class | `server/services/` |
| 1.4 | Add Zod validation schemas | `shared/schemas/` |
| 1.5 | Unit tests for SnapshotVersionService | `tests/unit/services/` |

### Sprint 2: API Layer (2-3 days)

| Task | Description | Files |
|------|-------------|-------|
| 2.1 | Implement version CRUD routes | `server/routes/portfolio/versions.ts` |
| 2.2 | Implement branch routes | `server/routes/portfolio/branches.ts` |
| 2.3 | Integration tests for version routes | `tests/integration/` |
| 2.4 | Register routes in app | `server/routes/index.ts` |

### Sprint 3: Comparison (2-3 days)

| Task | Description | Files |
|------|-------------|-------|
| 3.1 | Create VersionComparisonService | `server/services/` |
| 3.2 | Implement diff computation | `shared/utils/diff.ts` |
| 3.3 | Add comparison routes | `server/routes/portfolio/comparisons.ts` |
| 3.4 | Integration tests for comparison | `tests/integration/` |

### Sprint 4: Polish (1-2 days)

| Task | Description | Files |
|------|-------------|-------|
| 4.1 | Add audit logging for version operations | `server/middleware/` |
| 4.2 | Performance optimization (indexes, caching) | various |
| 4.3 | Documentation update | `CHANGELOG.md`, `DECISIONS.md` |
| 4.4 | End-to-end testing | `tests/e2e/` |

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

## Decision Points for Review

1. **Branch semantics**: Git-like branching or simpler named-versions?
   - Recommendation: Start with branches, can simplify later

2. **State storage**: Full state snapshot vs incremental diffs?
   - Recommendation: Full snapshots for simplicity, add compression if needed

3. **Retention policy**: Keep all versions or auto-prune?
   - Recommendation: Keep all, add archival in Phase 2

4. **Merge support**: Allow merging branches?
   - Recommendation: Defer to Phase 2, focus on fork/compare first

---

## Success Criteria

1. Users can create versions of snapshots with commit messages
2. Users can view version history with pagination
3. Users can compare any two versions with metric deltas
4. Users can restore to any previous version
5. Users can create branches for what-if analysis
6. All operations follow anti-pattern prevention guidelines
7. Test coverage >= 80% for new code

---

## References

- Existing SnapshotService: `server/services/snapshot-service.ts`
- ComparisonService patterns: `server/services/comparison-service.ts`
- Anti-pattern guide: `cheatsheets/anti-pattern-prevention.md`
- Schema patterns: `shared/schema.ts:220-300`
