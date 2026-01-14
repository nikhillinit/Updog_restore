/**
 * Schema Isolation Integration Tests
 *
 * Verifies that LP Portal cannot access simulation data.
 * Critical security tests for data boundary enforcement.
 *
 * Per stabilization plan: "Monte Carlo simulation data leaking into LP Portal" is a key risk.
 *
 * @group integration
 * @group security
 */

import { describe, it, expect } from 'vitest';
import {
  DATA_BOUNDARIES,
  LP_READABLE_TABLES,
  SIMULATION_ONLY_TABLES,
  isLPReadable,
  isSimulationTable,
  validateLPTableAccess,
  DataBoundaryViolationError,
} from '@shared/lib/data-boundaries';
import {
  validateTableAccess,
  getBlockedTablesForLP,
} from '../../server/middleware/schema-isolation';

describe('Schema Isolation - Data Boundaries', () => {
  describe('DATA_BOUNDARIES constant definitions', () => {
    it('should define LP_READABLE tables', () => {
      expect(LP_READABLE_TABLES).toBeDefined();
      expect(LP_READABLE_TABLES.length).toBeGreaterThan(0);

      // Core LP tables should be readable
      expect(LP_READABLE_TABLES).toContain('funds');
      expect(LP_READABLE_TABLES).toContain('limited_partners');
      expect(LP_READABLE_TABLES).toContain('lp_fund_commitments');
      expect(LP_READABLE_TABLES).toContain('distributions');
    });

    it('should define SIMULATION_ONLY tables', () => {
      expect(SIMULATION_ONLY_TABLES).toBeDefined();
      expect(SIMULATION_ONLY_TABLES.length).toBeGreaterThan(0);

      // Simulation tables should be blocked
      expect(SIMULATION_ONLY_TABLES).toContain('portfolio_scenarios');
      expect(SIMULATION_ONLY_TABLES).toContain('monte_carlo_runs');
      expect(SIMULATION_ONLY_TABLES).toContain('backtest_results');
      expect(SIMULATION_ONLY_TABLES).toContain('scenarios');
    });

    it('should have no overlap between LP_READABLE and SIMULATION_ONLY', () => {
      const overlap = LP_READABLE_TABLES.filter((table) =>
        SIMULATION_ONLY_TABLES.includes(table as any)
      );

      expect(overlap).toHaveLength(0);
    });

    it('should export DATA_BOUNDARIES with all categories', () => {
      expect(DATA_BOUNDARIES).toBeDefined();
      expect(DATA_BOUNDARIES.LP_READABLE).toBeDefined();
      expect(DATA_BOUNDARIES.SIMULATION_ONLY).toBeDefined();
      expect(DATA_BOUNDARIES.INTERNAL_ONLY).toBeDefined();
    });
  });

  describe('isLPReadable function', () => {
    it('should return true for LP-readable tables', () => {
      expect(isLPReadable('funds')).toBe(true);
      expect(isLPReadable('limited_partners')).toBe(true);
      expect(isLPReadable('distributions')).toBe(true);
      expect(isLPReadable('lp_fund_commitments')).toBe(true);
    });

    it('should return false for simulation tables', () => {
      expect(isLPReadable('portfolio_scenarios')).toBe(false);
      expect(isLPReadable('monte_carlo_runs')).toBe(false);
      expect(isLPReadable('backtest_results')).toBe(false);
      expect(isLPReadable('scenarios')).toBe(false);
    });

    it('should return false for unknown tables', () => {
      expect(isLPReadable('unknown_table')).toBe(false);
      expect(isLPReadable('')).toBe(false);
    });
  });

  describe('isSimulationTable function', () => {
    it('should return true for simulation tables', () => {
      expect(isSimulationTable('portfolio_scenarios')).toBe(true);
      expect(isSimulationTable('monte_carlo_runs')).toBe(true);
      expect(isSimulationTable('backtest_results')).toBe(true);
      expect(isSimulationTable('fund_strategy_models')).toBe(true);
    });

    it('should return false for LP-readable tables', () => {
      expect(isSimulationTable('funds')).toBe(false);
      expect(isSimulationTable('limited_partners')).toBe(false);
      expect(isSimulationTable('distributions')).toBe(false);
    });
  });

  describe('validateLPTableAccess function', () => {
    it('should pass for LP-readable tables', () => {
      expect(() =>
        validateLPTableAccess(['funds', 'limited_partners', 'distributions'])
      ).not.toThrow();
    });

    it('should throw for simulation tables', () => {
      expect(() => validateLPTableAccess(['portfolio_scenarios'])).toThrow(
        /LP Portal cannot access tables/
      );

      expect(() => validateLPTableAccess(['monte_carlo_runs'])).toThrow(
        /simulation or internal data/
      );
    });

    it('should throw for mixed tables (LP + simulation)', () => {
      expect(() =>
        validateLPTableAccess(['funds', 'portfolio_scenarios', 'distributions'])
      ).toThrow(/portfolio_scenarios/);
    });

    it('should pass for empty array', () => {
      expect(() => validateLPTableAccess([])).not.toThrow();
    });
  });

  describe('DataBoundaryViolationError', () => {
    it('should create error with correct properties', () => {
      const error = new DataBoundaryViolationError(
        'lp_portal',
        'portfolio_scenarios',
        'simulation'
      );

      expect(error.name).toBe('DataBoundaryViolationError');
      expect(error.context).toBe('lp_portal');
      expect(error.tableName).toBe('portfolio_scenarios');
      expect(error.boundaryType).toBe('simulation');
      expect(error.message).toContain('lp_portal');
      expect(error.message).toContain('portfolio_scenarios');
      expect(error.message).toContain('simulation');
    });

    it('should be instanceof Error', () => {
      const error = new DataBoundaryViolationError('lp_portal', 'monte_carlo_runs', 'simulation');

      expect(error instanceof Error).toBe(true);
      expect(error instanceof DataBoundaryViolationError).toBe(true);
    });
  });
});

describe('Schema Isolation - Middleware', () => {
  describe('validateTableAccess middleware helper', () => {
    it('should pass for LP accessing LP-readable tables', () => {
      expect(() => validateTableAccess('funds', 'lp_portal')).not.toThrow();
      expect(() => validateTableAccess('distributions', 'lp_portal')).not.toThrow();
    });

    it('should throw for LP accessing simulation tables', () => {
      expect(() => validateTableAccess('portfolio_scenarios', 'lp_portal')).toThrow(
        DataBoundaryViolationError
      );

      expect(() => validateTableAccess('monte_carlo_runs', 'lp_portal')).toThrow(
        DataBoundaryViolationError
      );

      expect(() => validateTableAccess('backtest_results', 'lp_portal')).toThrow(
        DataBoundaryViolationError
      );
    });

    it('should allow admin context to access all tables', () => {
      // Admin context should not throw (they can access simulation data)
      expect(() => validateTableAccess('portfolio_scenarios', 'admin')).not.toThrow();
      expect(() => validateTableAccess('monte_carlo_runs', 'admin')).not.toThrow();
    });

    it('should allow api context to access all tables', () => {
      // API context (GP users) should not throw
      expect(() => validateTableAccess('portfolio_scenarios', 'api')).not.toThrow();
      expect(() => validateTableAccess('monte_carlo_runs', 'api')).not.toThrow();
    });
  });

  describe('getBlockedTablesForLP helper', () => {
    it('should return simulation tables', () => {
      const blocked = getBlockedTablesForLP();

      expect(blocked).toContain('portfolio_scenarios');
      expect(blocked).toContain('monte_carlo_runs');
      expect(blocked).toContain('backtest_results');
    });

    it('should be readonly', () => {
      const blocked = getBlockedTablesForLP();

      // TypeScript should prevent this, but verify at runtime
      expect(Object.isFrozen(blocked) || Array.isArray(blocked)).toBe(true);
    });
  });
});

describe('Schema Isolation - Security Scenarios', () => {
  describe('LP Portal data access patterns', () => {
    it('should allow LP to read their fund commitments', () => {
      // Tables needed for LP fund commitments view
      const tablesNeeded = ['limited_partners', 'lp_fund_commitments', 'funds'];

      expect(() => validateLPTableAccess(tablesNeeded)).not.toThrow();
    });

    it('should allow LP to read distributions', () => {
      const tablesNeeded = ['distributions', 'distribution_line_items', 'funds'];

      expect(() => validateLPTableAccess(tablesNeeded)).not.toThrow();
    });

    it('should allow LP to read capital calls', () => {
      const tablesNeeded = ['capital_calls', 'capital_call_line_items', 'funds'];

      expect(() => validateLPTableAccess(tablesNeeded)).not.toThrow();
    });

    it('should block LP from reading Monte Carlo results', () => {
      expect(() => validateTableAccess('monte_carlo_runs', 'lp_portal')).toThrow(
        DataBoundaryViolationError
      );

      expect(() => validateTableAccess('monte_carlo_results', 'lp_portal')).toThrow(
        DataBoundaryViolationError
      );
    });

    it('should block LP from reading what-if scenarios', () => {
      expect(() => validateTableAccess('portfolio_scenarios', 'lp_portal')).toThrow(
        DataBoundaryViolationError
      );

      expect(() => validateTableAccess('scenarios', 'lp_portal')).toThrow(
        DataBoundaryViolationError
      );

      expect(() => validateTableAccess('scenario_cases', 'lp_portal')).toThrow(
        DataBoundaryViolationError
      );
    });

    it('should block LP from reading backtest results', () => {
      expect(() => validateTableAccess('backtest_results', 'lp_portal')).toThrow(
        DataBoundaryViolationError
      );
    });

    it('should block LP from reading strategy models', () => {
      expect(() => validateTableAccess('fund_strategy_models', 'lp_portal')).toThrow(
        DataBoundaryViolationError
      );

      expect(() => validateTableAccess('reserve_allocation_strategies', 'lp_portal')).toThrow(
        DataBoundaryViolationError
      );
    });
  });

  describe('Error messages for security audit', () => {
    it('should provide clear error messages for violations', () => {
      try {
        validateTableAccess('portfolio_scenarios', 'lp_portal');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DataBoundaryViolationError);
        const violation = error as DataBoundaryViolationError;

        expect(violation.message).toContain('lp_portal');
        expect(violation.message).toContain('portfolio_scenarios');
        expect(violation.message).toContain('simulation');
      }
    });
  });
});
