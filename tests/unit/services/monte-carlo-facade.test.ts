/**
 * Monte Carlo Facade Service Tests
 *
 * Tests for the unified facade interface that selects appropriate
 * Monte Carlo engines based on configuration.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  MonteCarloFacade,
  SimulationMode,
  monteCarloFacade,
  runSimulation,
  type FacadeConfig,
} from '../../../server/services/monte-carlo-facade';

describe('MonteCarloFacade', () => {
  let facade: MonteCarloFacade;

  beforeEach(() => {
    facade = new MonteCarloFacade();
  });

  describe('selectMode', () => {
    const baseConfig: Omit<FacadeConfig, 'runCount' | 'expectationMode'> = {
      expectedIRR: 0.15,
      irrStdDev: 0.05,
      fundSize: 100000000,
      fundLife: 10,
      investmentPeriod: 5,
    };

    it('should select EXPECTATION mode when expectationMode is true', () => {
      const config: FacadeConfig = {
        ...baseConfig,
        runCount: 1000,
        expectationMode: true,
      };

      const mode = facade.selectMode(config);

      expect(mode).toBe(SimulationMode.EXPECTATION);
    });

    it('should select STREAMING mode when runCount exceeds threshold (10000)', () => {
      const config: FacadeConfig = {
        ...baseConfig,
        runCount: 15000,
        expectationMode: false,
      };

      const mode = facade.selectMode(config);

      expect(mode).toBe(SimulationMode.STREAMING);
    });

    it('should select ORCHESTRATOR mode for standard run counts', () => {
      const config: FacadeConfig = {
        ...baseConfig,
        runCount: 5000,
        expectationMode: false,
      };

      const mode = facade.selectMode(config);

      expect(mode).toBe(SimulationMode.ORCHESTRATOR);
    });

    it('should respect forceMode override', () => {
      const config: FacadeConfig = {
        ...baseConfig,
        runCount: 50000,
        expectationMode: false,
        forceMode: SimulationMode.ORCHESTRATOR,
      };

      const mode = facade.selectMode(config);

      expect(mode).toBe(SimulationMode.ORCHESTRATOR);
    });

    it('should use custom streaming threshold when provided', () => {
      const config: FacadeConfig = {
        ...baseConfig,
        runCount: 8000,
        expectationMode: false,
        streamingThreshold: 5000,
      };

      const mode = facade.selectMode(config);

      expect(mode).toBe(SimulationMode.STREAMING);
    });

    it('should prioritize expectation mode over streaming threshold', () => {
      const config: FacadeConfig = {
        ...baseConfig,
        runCount: 50000,
        expectationMode: true,
      };

      const mode = facade.selectMode(config);

      expect(mode).toBe(SimulationMode.EXPECTATION);
    });

    it('should handle edge case at exact threshold boundary', () => {
      const config: FacadeConfig = {
        ...baseConfig,
        runCount: 10000,
        expectationMode: false,
      };

      const mode = facade.selectMode(config);

      // At threshold, should use orchestrator (not greater than)
      expect(mode).toBe(SimulationMode.ORCHESTRATOR);
    });

    it('should switch to streaming one above threshold', () => {
      const config: FacadeConfig = {
        ...baseConfig,
        runCount: 10001,
        expectationMode: false,
      };

      const mode = facade.selectMode(config);

      expect(mode).toBe(SimulationMode.STREAMING);
    });
  });

  describe('getSelectedMode', () => {
    it('should return the same result as selectMode', () => {
      const config: FacadeConfig = {
        runCount: 5000,
        expectationMode: false,
        expectedIRR: 0.15,
        irrStdDev: 0.05,
        fundSize: 100000000,
        fundLife: 10,
        investmentPeriod: 5,
      };

      const selectResult = facade.selectMode(config);
      const getResult = facade.getSelectedMode(config);

      expect(selectResult).toBe(getResult);
    });
  });

  describe('run', () => {
    const baseConfig: FacadeConfig = {
      runCount: 1000,
      expectationMode: false,
      expectedIRR: 0.15,
      irrStdDev: 0.05,
      fundSize: 100000000,
      fundLife: 10,
      investmentPeriod: 5,
    };

    it('should execute simulation and return results with modeUsed', async () => {
      const results = await facade.run(baseConfig);

      expect(results.modeUsed).toBe(SimulationMode.ORCHESTRATOR);
      expect(results.summary).toBeDefined();
      expect(results.summary?.irrMean).toBeDefined();
    });

    it('should include validation result when validateDistribution is true', async () => {
      const config: FacadeConfig = {
        ...baseConfig,
        validateDistribution: true,
      };

      const results = await facade.run(config);

      expect(results.validationResult).toBeDefined();
      expect(results.validationResult?.isValid).toBe(true);
    });

    it('should not include validation result when validateDistribution is false', async () => {
      const config: FacadeConfig = {
        ...baseConfig,
        validateDistribution: false,
      };

      const results = await facade.run(config);

      expect(results.validationResult).toBeUndefined();
    });

    it('should use expectation mode when requested', async () => {
      const config: FacadeConfig = {
        ...baseConfig,
        expectationMode: true,
      };

      const results = await facade.run(config);

      expect(results.modeUsed).toBe(SimulationMode.EXPECTATION);
      expect(results.runCount).toBe(1);
    });

    it('should use streaming engine for large run counts', async () => {
      const config: FacadeConfig = {
        ...baseConfig,
        runCount: 50000,
      };

      const results = await facade.run(config);

      expect(results.modeUsed).toBe(SimulationMode.STREAMING);
    });
  });

  describe('singleton instance', () => {
    it('should export a singleton facade instance', () => {
      expect(monteCarloFacade).toBeInstanceOf(MonteCarloFacade);
    });

    it('should provide runSimulation convenience function', async () => {
      const config: FacadeConfig = {
        runCount: 1000,
        expectationMode: false,
        expectedIRR: 0.15,
        irrStdDev: 0.05,
        fundSize: 100000000,
        fundLife: 10,
        investmentPeriod: 5,
      };

      const results = await runSimulation(config);

      expect(results).toBeDefined();
      expect(results.modeUsed).toBeDefined();
    });
  });

  describe('SimulationMode enum', () => {
    it('should have expected values', () => {
      expect(SimulationMode.EXPECTATION).toBe('expectation');
      expect(SimulationMode.ORCHESTRATOR).toBe('orchestrator');
      expect(SimulationMode.STREAMING).toBe('streaming');
    });
  });
});

describe('MonteCarloFacade Integration Scenarios', () => {
  let facade: MonteCarloFacade;

  beforeEach(() => {
    facade = new MonteCarloFacade();
  });

  describe('mode selection decision tree', () => {
    const baseConfig: Omit<FacadeConfig, 'runCount' | 'expectationMode'> = {
      expectedIRR: 0.15,
      irrStdDev: 0.05,
      fundSize: 100000000,
      fundLife: 10,
      investmentPeriod: 5,
    };

    const testCases: Array<{
      name: string;
      runCount: number;
      expectationMode: boolean;
      forceMode?: SimulationMode;
      streamingThreshold?: number;
      expectedMode: SimulationMode;
    }> = [
      {
        name: 'small run count, standard mode',
        runCount: 100,
        expectationMode: false,
        expectedMode: SimulationMode.ORCHESTRATOR,
      },
      {
        name: 'medium run count, standard mode',
        runCount: 5000,
        expectationMode: false,
        expectedMode: SimulationMode.ORCHESTRATOR,
      },
      {
        name: 'large run count triggers streaming',
        runCount: 20000,
        expectationMode: false,
        expectedMode: SimulationMode.STREAMING,
      },
      {
        name: 'expectation mode overrides run count',
        runCount: 50000,
        expectationMode: true,
        expectedMode: SimulationMode.EXPECTATION,
      },
      {
        name: 'forceMode overrides all logic',
        runCount: 50000,
        expectationMode: true,
        forceMode: SimulationMode.STREAMING,
        expectedMode: SimulationMode.STREAMING,
      },
      {
        name: 'custom threshold affects selection',
        runCount: 3000,
        expectationMode: false,
        streamingThreshold: 2000,
        expectedMode: SimulationMode.STREAMING,
      },
    ];

    testCases.forEach(
      ({ name, runCount, expectationMode, forceMode, streamingThreshold, expectedMode }) => {
        it(`should handle: ${name}`, () => {
          const config: FacadeConfig = {
            ...baseConfig,
            runCount,
            expectationMode,
            forceMode,
            streamingThreshold,
          };

          const mode = facade.selectMode(config);

          expect(mode).toBe(expectedMode);
        });
      }
    );
  });
});
