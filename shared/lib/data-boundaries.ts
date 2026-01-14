/**
 * Data Boundaries for Schema Isolation
 *
 * Defines which database tables can be accessed by different system contexts.
 * Critical for preventing simulation data (Monte Carlo, what-if scenarios)
 * from leaking into LP Portal views.
 *
 * @module shared/lib/data-boundaries
 */

/**
 * Tables that LPs are allowed to read.
 * These contain real fund data, not simulations.
 */
export const LP_READABLE_TABLES = [
  // Core fund data
  'funds',
  'fund_configs',
  'fund_snapshots',
  'fund_events',

  // Portfolio (real investments only)
  'portfoliocompanies',
  'investments',

  // LP-specific tables
  'limited_partners',
  'lp_fund_commitments',
  'lp_capital_activities',
  'lp_capital_account_balances',
  'lp_performance_snapshots',
  'lp_report_generations',
  'lp_notification_preferences',
  'lp_document_access_logs',

  // Distributions (real)
  'distributions',
  'distribution_line_items',

  // Capital calls (real)
  'capital_calls',
  'capital_call_line_items',

  // User management
  'users',
] as const;

/**
 * Tables containing simulation/hypothetical data.
 * LP Portal MUST NOT access these tables.
 */
export const SIMULATION_ONLY_TABLES = [
  // Monte Carlo & probabilistic
  'monte_carlo_runs',
  'monte_carlo_results',
  'backtest_results',

  // What-if scenarios
  'portfolio_scenarios',
  'scenarios',
  'scenario_cases',
  'scenario_audit_logs',

  // Strategy modeling
  'fund_strategy_models',
  'reserve_allocation_strategies',
  'performance_forecasts',

  // Comparison tools
  'scenario_comparison_configs',
  'scenario_comparisons',
] as const;

/**
 * Tables that are internal/admin only.
 * Neither LP Portal nor regular users should access.
 */
export const INTERNAL_ONLY_TABLES = [
  'admin_audit_logs',
  'system_configs',
  'feature_flags',
  'api_keys',
  'sessions',
] as const;

// Type exports for compile-time safety
export type LPReadableTable = (typeof LP_READABLE_TABLES)[number];
export type SimulationOnlyTable = (typeof SIMULATION_ONLY_TABLES)[number];
export type InternalOnlyTable = (typeof INTERNAL_ONLY_TABLES)[number];

/**
 * Combined data boundaries object for runtime checks.
 */
export const DATA_BOUNDARIES = {
  LP_READABLE: LP_READABLE_TABLES,
  SIMULATION_ONLY: SIMULATION_ONLY_TABLES,
  INTERNAL_ONLY: INTERNAL_ONLY_TABLES,
} as const;

/**
 * Check if a table is accessible by LP Portal.
 *
 * @param tableName - Name of the table to check
 * @returns true if LP Portal can access this table
 */
export function isLPReadable(tableName: string): boolean {
  return LP_READABLE_TABLES.includes(tableName as LPReadableTable);
}

/**
 * Check if a table contains simulation data.
 *
 * @param tableName - Name of the table to check
 * @returns true if table contains simulation/hypothetical data
 */
export function isSimulationTable(tableName: string): boolean {
  return SIMULATION_ONLY_TABLES.includes(tableName as SimulationOnlyTable);
}

/**
 * Validate that a list of tables are all LP-accessible.
 * Throws an error if any table is not allowed.
 *
 * @param tableNames - Array of table names to validate
 * @throws Error if any table is not LP-readable
 */
export function validateLPTableAccess(tableNames: string[]): void {
  const violations = tableNames.filter((table) => !isLPReadable(table) || isSimulationTable(table));

  if (violations.length > 0) {
    throw new Error(
      `LP Portal cannot access tables: ${violations.join(', ')}. ` +
        `These tables contain simulation or internal data.`
    );
  }
}

/**
 * Error class for data boundary violations.
 */
export class DataBoundaryViolationError extends Error {
  constructor(
    public readonly context: 'lp_portal' | 'admin' | 'api',
    public readonly tableName: string,
    public readonly boundaryType: 'simulation' | 'internal'
  ) {
    super(
      `Data boundary violation: ${context} attempted to access ${boundaryType} table '${tableName}'`
    );
    this.name = 'DataBoundaryViolationError';
  }
}
