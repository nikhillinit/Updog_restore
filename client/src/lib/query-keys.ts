/**
 * Centralized Query Key Factory
 *
 * Provides type-safe, hierarchical query keys for TanStack Query
 * Enables family-based cache invalidation and prevents stale data islands
 */

export const queryKeys = {
  // Root key for all application queries
  all: ['app'] as const,

  // Fund-related queries
  funds: {
    all: ['app', 'funds'] as const,
    lists: () => [...queryKeys.funds.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.funds.lists(), filters] as const,
    details: () => [...queryKeys.funds.all, 'detail'] as const,
    detail: (id: number) => [...queryKeys.funds.details(), id] as const,

    // Metrics with versioning and projection flags
    metrics: (id: number, options?: { skipProjections?: boolean }) =>
      [...queryKeys.funds.detail(id), 'metrics', 'v2', options?.skipProjections ? 'no-proj' : 'with-proj'] as const,

    baselines: (id: number, options?: Record<string, unknown>) =>
      [...queryKeys.funds.detail(id), 'baselines', options] as const,

    variance: (id: number) =>
      [...queryKeys.funds.detail(id), 'variance'] as const,

    companies: (id: number) =>
      [...queryKeys.funds.detail(id), 'companies'] as const,

    portfolio: (id: number) =>
      [...queryKeys.funds.detail(id), 'portfolio'] as const,
  },

  // Investment-related queries
  investments: {
    all: ['app', 'investments'] as const,
    lists: () => [...queryKeys.investments.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.investments.lists(), filters] as const,
    detail: (id: number) => [...queryKeys.investments.all, id] as const,
  },

  // Company-related queries
  companies: {
    all: ['app', 'companies'] as const,
    lists: () => [...queryKeys.companies.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.companies.lists(), filters] as const,
    detail: (id: number) => [...queryKeys.companies.all, id] as const,
  },
} as const;

/**
 * Predicate-based invalidation helpers
 *
 * Use these to invalidate entire query families
 */
export const invalidationPredicates = {
  /**
   * Invalidate all queries for a specific fund
   */
  fund: (fundId: number) => (query: { queryKey: readonly unknown[] }) => {
    return Array.isArray(query.queryKey) &&
           query.queryKey.includes('funds') &&
           query.queryKey.includes(fundId);
  },

  /**
   * Invalidate all fund-related queries
   */
  allFunds: (query: { queryKey: readonly unknown[] }) => {
    return Array.isArray(query.queryKey) &&
           query.queryKey[0] === 'app' &&
           query.queryKey[1] === 'funds';
  },

  /**
   * Invalidate all investment-related queries
   */
  allInvestments: (query: { queryKey: readonly unknown[] }) => {
    return Array.isArray(query.queryKey) &&
           query.queryKey[0] === 'app' &&
           query.queryKey[1] === 'investments';
  },
};

/**
 * Cache versioning constant
 *
 * Increment this when metrics schema changes to force cache invalidation
 */
export const METRICS_SCHEMA_VERSION = 2;
