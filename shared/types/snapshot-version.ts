/**
 * Snapshot Version Types
 *
 * Types for snapshot version history and comparison features.
 */

// ============================================================================
// Version Summary Types
// ============================================================================

/**
 * Lightweight version summary for listings
 */
export interface VersionSummary {
  id: string;
  snapshotId: string;
  versionNumber: number;
  versionName?: string | null;
  description?: string | null;
  isCurrent: boolean;
  isPinned: boolean;
  createdAt: string;
  expiresAt?: string | null;
}

/**
 * Full version details including state
 */
export interface VersionDetails extends VersionSummary {
  parentVersionId?: string | null;
  stateSnapshot: Record<string, unknown>;
  calculatedMetrics?: Record<string, unknown> | null;
  sourceHash: string;
  createdBy?: string | null;
  tags?: string[] | null;
}

// ============================================================================
// Version Diff Types
// ============================================================================

/**
 * Change type for diff entries
 */
export type ChangeType = 'added' | 'removed' | 'modified';

/**
 * Individual diff entry
 */
export interface DiffEntry {
  path: string;
  changeType: ChangeType;
  baseValue?: unknown;
  comparisonValue?: unknown;
}

/**
 * Summary of differences between two versions
 */
export interface VersionDiff {
  baseVersion: VersionSummary;
  comparisonVersion: VersionSummary;
  addedKeys: string[];
  removedKeys: string[];
  modifiedKeys: string[];
  details: DiffEntry[];
}

/**
 * Metric delta for comparison
 */
export interface MetricDelta {
  metricName: string;
  baseValue: number;
  comparisonValue: number;
  absoluteDelta: number;
  percentageDelta: number | null;
  isBetter: boolean;
}

/**
 * Complete version comparison result
 */
export interface VersionComparisonResult {
  id: string;
  baseVersion: VersionSummary;
  comparisonVersion: VersionSummary;
  stateDiff: VersionDiff;
  metricDeltas: MetricDelta[];
  computedAt: string;
  expiresAt: string;
}

// ============================================================================
// Pagination Types
// ============================================================================

/**
 * Paginated versions result
 */
export interface PaginatedVersions {
  versions: VersionSummary[];
  nextCursor?: string;
  hasMore: boolean;
}

// ============================================================================
// Request/Response Types
// ============================================================================

/**
 * Create version request
 */
export interface CreateVersionRequest {
  versionName?: string;
  description?: string;
  tags?: string[];
  isPinned?: boolean;
}

/**
 * List versions query parameters
 */
export interface ListVersionsQuery {
  cursor?: string;
  limit?: number;
  includeExpired?: boolean;
}

/**
 * Restore version request
 */
export interface RestoreVersionRequest {
  description?: string;
}

/**
 * Compare versions request
 */
export interface CompareVersionsRequest {
  baseVersionId: string;
  comparisonVersionId: string;
  metrics?: string[];
}

/**
 * Version history query
 */
export interface HistoryQuery {
  limit?: number;
}
