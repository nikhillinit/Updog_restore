/**
 * Centralized Schema Specification
 *
 * Single source of truth for database schema definitions used across:
 * - Database migrations (DDL generation)
 * - Database mock (test fixtures)
 * - Test assertions (property-based validation)
 *
 * This prevents drift between migrations, mocks, and tests.
 */

export interface IndexDefinition {
  name: string;
  cols: string[];
  method: 'btree' | 'gin' | 'hash' | 'gist';
  unique?: boolean;
  desc?: boolean;
  where?: string;
}

/**
 * Index specifications for all time-travel analytics tables
 *
 * Usage in tests:
 * ```typescript
 * import { INDEX_SPEC } from '../helpers/schema-spec';
 *
 * expect(indexes).toEqual(
 *   expect.arrayContaining([
 *     expect.objectContaining({
 *       name: INDEX_SPEC.fund_state_snapshots[0].name,
 *       columns: INDEX_SPEC.fund_state_snapshots[0].cols,
 *     }),
 *   ])
 * );
 * ```
 */
export const INDEX_SPEC: Record<string, IndexDefinition[]> = {
  fund_state_snapshots: [
    { name: 'fund_state_snapshots_fund_idx', cols: ['fund_id'], method: 'btree' },
    { name: 'fund_state_snapshots_captured_idx', cols: ['captured_at'], method: 'btree', desc: true },
    { name: 'fund_state_snapshots_type_idx', cols: ['snapshot_type'], method: 'btree' },
    { name: 'fund_state_snapshots_status_idx', cols: ['status'], method: 'btree' },
    { name: 'fund_state_snapshots_portfolio_state_gin', cols: ['portfolio_state'], method: 'gin' },
    { name: 'fund_state_snapshots_fund_metrics_gin', cols: ['fund_metrics'], method: 'gin' },
    { name: 'fund_state_snapshots_metadata_gin', cols: ['metadata'], method: 'gin' },
    { name: 'fund_state_snapshots_tags_gin', cols: ['tags'], method: 'gin' },
  ],

  snapshot_comparisons: [
    { name: 'snapshot_comparisons_base_idx', cols: ['base_snapshot_id'], method: 'btree' },
    { name: 'snapshot_comparisons_compare_idx', cols: ['compare_snapshot_id'], method: 'btree' },
    { name: 'snapshot_comparisons_type_idx', cols: ['comparison_type'], method: 'btree' },
    { name: 'snapshot_comparisons_value_changes_gin', cols: ['value_changes'], method: 'gin' },
    { name: 'snapshot_comparisons_insights_gin', cols: ['insights'], method: 'gin' },
    {
      name: 'snapshot_comparisons_unique_pair',
      cols: ['base_snapshot_id', 'compare_snapshot_id'],
      method: 'btree',
      unique: true
    },
  ],

  timeline_events: [
    { name: 'timeline_events_fund_idx', cols: ['fund_id', 'event_date'], method: 'btree', desc: true },
    { name: 'timeline_events_snapshot_idx', cols: ['snapshot_id'], method: 'btree' },
    { name: 'timeline_events_date_idx', cols: ['event_date'], method: 'btree', desc: true },
    { name: 'timeline_events_type_idx', cols: ['event_type'], method: 'btree' },
    { name: 'timeline_events_severity_idx', cols: ['severity'], method: 'btree' },
    { name: 'timeline_events_event_data_gin', cols: ['event_data'], method: 'gin' },
    { name: 'timeline_events_impact_metrics_gin', cols: ['impact_metrics'], method: 'gin' },
  ],

  state_restoration_logs: [
    { name: 'state_restoration_logs_fund_idx', cols: ['fund_id', 'started_at'], method: 'btree', desc: true },
    { name: 'state_restoration_logs_snapshot_idx', cols: ['snapshot_id'], method: 'btree' },
    { name: 'state_restoration_logs_status_idx', cols: ['status'], method: 'btree' },
    { name: 'state_restoration_logs_type_idx', cols: ['restoration_type'], method: 'btree' },
    { name: 'state_restoration_logs_changes_gin', cols: ['changes_applied'], method: 'gin' },
    { name: 'state_restoration_logs_affected_gin', cols: ['affected_entities'], method: 'gin' },
  ],
};

/**
 * JSONB column mappings for all tables
 *
 * Used by database mock to determine which columns should be handled as JSONB
 */
export const JSONB_COLUMNS: Record<string, Set<string>> = {
  fund_state_snapshots: new Set([
    'portfolio_state',
    'fund_metrics',
    'metadata',
    'fund_state',
    'metrics_state',
    'reserve_state',
    'pacing_state',
  ]),
  snapshot_comparisons: new Set([
    'value_changes',
    'portfolio_changes',
    'insights',
    'differences',
    'summary',
    'metrics_comparison',
  ]),
  timeline_events: new Set([
    'event_data',
    'impact_metrics',
  ]),
  state_restoration_logs: new Set([
    'changes_applied',
    'before_state',
    'after_state',
    'affected_entities',
  ]),
};

/**
 * Check if a column is a JSONB column
 */
export function isJsonbColumn(tableName: string, columnName: string): boolean {
  return JSONB_COLUMNS[tableName]?.has(columnName) ?? false;
}

/**
 * Get all index definitions for a table
 */
export function getTableIndexes(tableName: string): IndexDefinition[] {
  return INDEX_SPEC[tableName] || [];
}

/**
 * Get all JSONB columns for a table
 */
export function getJsonbColumns(tableName: string): string[] {
  return Array.from(JSONB_COLUMNS[tableName] || []);
}
