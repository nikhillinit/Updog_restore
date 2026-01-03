/**
 * Centralized Mock Utility for @shared/schema
 *
 * Provides consistent, reusable mocks for Drizzle ORM schema exports.
 * Uses `importOriginal` pattern to preserve actual exports while allowing selective overrides.
 *
 * Usage:
 * ```typescript
 * import { vi } from 'vitest';
 * import { createSharedSchemaMock } from '../utils/mock-shared-schema';
 *
 * vi.mock('@shared/schema', () => createSharedSchemaMock());
 * ```
 */

import { vi } from 'vitest';

/**
 * Creates a mock for @shared/schema with all actual exports preserved
 * and table exports replaced with mock functions for testing.
 *
 * This pattern ensures:
 * 1. No "export not defined" errors
 * 2. Type safety via actual module imports
 * 3. Flexibility to override specific exports in individual tests
 */
export async function createSharedSchemaMock() {
  // Import the actual module to preserve all exports
  const actual = await vi.importActual<typeof import('@shared/schema')>('@shared/schema');

  return {
    ...actual, // Preserve all actual exports (types, schemas, etc.)

    // Override table exports with mock functions for testing
    // These are the most commonly mocked tables in tests
    funds: vi.fn(),
    fundConfigs: vi.fn(),
    fundSnapshots: vi.fn(),
    fundEvents: vi.fn(),
    portfolioCompanies: vi.fn(),
    investments: vi.fn(),
    scenarios: vi.fn(),
    scenarioCases: vi.fn(),
    scenarioAuditLogs: vi.fn(),
    fundMetrics: vi.fn(),
    activities: vi.fn(),
    dealOpportunities: vi.fn(),
    pipelineStages: vi.fn(),
    dueDiligenceItems: vi.fn(),
    scoringModels: vi.fn(),
    pipelineActivities: vi.fn(),
    marketResearch: vi.fn(),
    financialProjections: vi.fn(),
    users: vi.fn(),

    // Performance prediction tables (fixes the "performanceForecasts" error)
    performancePredictions: vi.fn(),
    performanceForecasts: vi.fn(),

    // Time-travel analytics tables
    fundStateSnapshots: vi.fn(),
    snapshotComparisons: vi.fn(),
    timelineEvents: vi.fn(),
    stateRestorationLogs: vi.fn(),

    // Variance tracking tables
    fundBaselines: vi.fn(),
    varianceReports: vi.fn(),
    alertConfigurations: vi.fn(),
    varianceAlerts: vi.fn(),

    // Portfolio construction & reserve strategy tables
    reserveStrategies: vi.fn(),
    pacingHistory: vi.fn(),
    fundStrategyModels: vi.fn(),
    portfolioScenarios: vi.fn(),
    reserveAllocationStrategies: vi.fn(),
    scenarioComparisons: vi.fn(),
    monteCarloSimulations: vi.fn(),
    reserveDecisions: vi.fn(),
    reallocationAudit: vi.fn(),
    customFields: vi.fn(),
    customFieldValues: vi.fn(),
    auditLog: vi.fn(),
    snapshotMetadata: vi.fn(),
  };
}

/**
 * Creates a minimal mock with only the most essential table exports.
 * Use this for tests that don't need the full schema.
 */
export function createMinimalSchemaMock() {
  return {
    funds: vi.fn(),
    fundMetrics: vi.fn(),
    portfolioCompanies: vi.fn(),
    investments: vi.fn(),
  };
}

/**
 * Creates a mock that throws errors for unmocked tables.
 * Useful for ensuring tests only access expected schema elements.
 */
export async function createStrictSchemaMock(allowedTables: string[] = []) {
  const actual = await vi.importActual<typeof import('@shared/schema')>('@shared/schema');

  const strictMock: any = { ...actual };

  // Create proxies that throw for unmocked table access
  const allTables = [
    'funds',
    'fundConfigs',
    'fundSnapshots',
    'fundEvents',
    'portfolioCompanies',
    'investments',
    'scenarios',
    'scenarioCases',
    'fundMetrics',
    'activities',
    'users',
    'performanceForecasts',
    'performancePredictions',
    'fundStateSnapshots',
    'snapshotComparisons',
  ];

  allTables.forEach((table) => {
    if (allowedTables.includes(table)) {
      strictMock[table] = vi.fn();
    } else {
      strictMock[table] = () => {
        throw new Error(
          `Unmocked schema access: ${table}. Add to allowedTables or use createSharedSchemaMock().`
        );
      };
    }
  });

  return strictMock;
}
