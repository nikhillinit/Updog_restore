/**
 * Tests for RecyclingEngine
 *
 * Validates capital recycling mechanics for multi-period VC fund modeling
 */

import { describe, it, expect, vi } from 'vitest';
import type { RecyclingConfig } from '@shared/core/optimization/RecyclingEngine';
import {
  RecyclingEngine,
  calculateRecycling,
  calculateMaxRecyclingRounds,
  validateRecyclingConfig,
  createRecyclingEngine,
  DEFAULT_RECYCLING_CONFIG,
} from '@shared/core/optimization/RecyclingEngine';

describe('RecyclingEngine', () => {
  describe('validateRecyclingConfig', () => {
    it('should accept valid configuration', () => {
      const config: RecyclingConfig = {
        enabled: true,
        mode: 'same-bucket',
        reinvestmentRate: 0.8,
        avgHoldingPeriod: 5,
        fundLifetime: 10,
      };

      expect(() => validateRecyclingConfig(config)).not.toThrow();
    });

    it('should reject negative reinvestment rate', () => {
      const config: RecyclingConfig = {
        enabled: true,
        mode: 'same-bucket',
        reinvestmentRate: -0.1,
        avgHoldingPeriod: 5,
        fundLifetime: 10,
      };

      expect(() => validateRecyclingConfig(config)).toThrow('Reinvestment rate must be in [0, 1]');
    });

    it('should reject reinvestment rate > 1', () => {
      const config: RecyclingConfig = {
        enabled: true,
        mode: 'same-bucket',
        reinvestmentRate: 1.5,
        avgHoldingPeriod: 5,
        fundLifetime: 10,
      };

      expect(() => validateRecyclingConfig(config)).toThrow('Reinvestment rate must be in [0, 1]');
    });

    it('should reject negative holding period', () => {
      const config: RecyclingConfig = {
        enabled: true,
        mode: 'same-bucket',
        reinvestmentRate: 0.8,
        avgHoldingPeriod: -1,
        fundLifetime: 10,
      };

      expect(() => validateRecyclingConfig(config)).toThrow(
        'Average holding period must be positive'
      );
    });

    it('should reject negative fund lifetime', () => {
      const config: RecyclingConfig = {
        enabled: true,
        mode: 'same-bucket',
        reinvestmentRate: 0.8,
        avgHoldingPeriod: 5,
        fundLifetime: -1,
      };

      expect(() => validateRecyclingConfig(config)).toThrow('Fund lifetime must be positive');
    });

    it('should warn when holding period >= fund lifetime', () => {
      const config: RecyclingConfig = {
        enabled: true,
        mode: 'same-bucket',
        reinvestmentRate: 0.8,
        avgHoldingPeriod: 10,
        fundLifetime: 10,
      };

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      validateRecyclingConfig(config);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Holding period (10y) >= fund lifetime (10y): limited recycling')
      );

      warnSpy.mockRestore();
    });
  });

  describe('calculateMaxRecyclingRounds', () => {
    it('should return 0 when recycling disabled', () => {
      const config: RecyclingConfig = {
        enabled: false,
        mode: 'same-bucket',
        reinvestmentRate: 0.8,
        avgHoldingPeriod: 5,
        fundLifetime: 10,
      };

      expect(calculateMaxRecyclingRounds(config)).toBe(0);
    });

    it('should calculate correct rounds for standard VC fund', () => {
      const config: RecyclingConfig = {
        enabled: true,
        mode: 'same-bucket',
        reinvestmentRate: 0.8,
        avgHoldingPeriod: 5,
        fundLifetime: 10,
      };

      // 10y / 5y = 2 rounds total, minus 1 for initial = 1 recycling round
      expect(calculateMaxRecyclingRounds(config)).toBe(1);
    });

    it('should calculate correct rounds for fast-paced fund', () => {
      const config: RecyclingConfig = {
        enabled: true,
        mode: 'same-bucket',
        reinvestmentRate: 0.8,
        avgHoldingPeriod: 3,
        fundLifetime: 12,
      };

      // 12y / 3y = 4 rounds total, minus 1 for initial = 3 recycling rounds
      expect(calculateMaxRecyclingRounds(config)).toBe(3);
    });

    it('should return 0 for holding period >= fund lifetime', () => {
      const config: RecyclingConfig = {
        enabled: true,
        mode: 'same-bucket',
        reinvestmentRate: 0.8,
        avgHoldingPeriod: 15,
        fundLifetime: 10,
      };

      expect(calculateMaxRecyclingRounds(config)).toBe(0);
    });
  });

  describe('calculateRecycling', () => {
    it('should return no recycling when disabled', () => {
      const config: RecyclingConfig = {
        enabled: false,
        mode: 'same-bucket',
        reinvestmentRate: 0.8,
        avgHoldingPeriod: 5,
        fundLifetime: 10,
      };

      const result = calculateRecycling(1000000, 3.0, config);

      expect(result.totalDeployed).toBe(1000000);
      expect(result.recyclingMultiple).toBe(1.0);
      expect(result.recyclingRounds).toBe(0);
      expect(result.rounds).toHaveLength(1);
      expect(result.rounds[0]).toEqual({
        round: 0,
        deployed: 1000000,
        expectedProceeds: 3000000,
        availableForNext: 0,
      });
    });

    it('should calculate single recycling round correctly', () => {
      const config: RecyclingConfig = {
        enabled: true,
        mode: 'same-bucket',
        reinvestmentRate: 0.8,
        avgHoldingPeriod: 5,
        fundLifetime: 10,
      };

      const result = calculateRecycling(1000000, 3.0, config);

      // Round 0: Deploy $1M, get $3M proceeds, reinvest 80% = $2.4M
      // Round 1: Deploy $2.4M, get $7.2M proceeds, reinvest 80% = $5.76M
      // Total deployed: $1M + $2.4M = $3.4M

      expect(result.recyclingRounds).toBe(1);
      expect(result.rounds).toHaveLength(2);

      // Round 0
      expect(result.rounds[0].round).toBe(0);
      expect(result.rounds[0].deployed).toBe(1000000);
      expect(result.rounds[0].expectedProceeds).toBe(3000000);
      expect(result.rounds[0].availableForNext).toBe(2400000);

      // Round 1
      expect(result.rounds[1].round).toBe(1);
      expect(result.rounds[1].deployed).toBe(2400000);
      expect(result.rounds[1].expectedProceeds).toBe(7200000);
      expect(result.rounds[1].availableForNext).toBe(5760000);

      // Total deployed
      expect(result.totalDeployed).toBe(3400000);
      expect(result.recyclingMultiple).toBeCloseTo(3.4, 2);
    });

    it('should handle multiple recycling rounds', () => {
      const config: RecyclingConfig = {
        enabled: true,
        mode: 'same-bucket',
        reinvestmentRate: 0.8,
        avgHoldingPeriod: 3,
        fundLifetime: 12,
      };

      const result = calculateRecycling(1000000, 2.0, config);

      // maxRounds = 3 (12y / 3y - 1)
      // Round 0: $1M → $2M proceeds → $1.6M reinvest
      // Round 1: $1.6M → $3.2M proceeds → $2.56M reinvest
      // Round 2: $2.56M → $5.12M proceeds → $4.096M reinvest
      // Round 3: $4.096M → $8.192M proceeds → $6.5536M reinvest

      expect(result.recyclingRounds).toBe(3);
      expect(result.rounds).toHaveLength(4);

      const totalDeployed = result.rounds.reduce((sum, round) => sum + round.deployed, 0);
      expect(result.totalDeployed).toBeCloseTo(totalDeployed, 2);
      expect(result.recyclingMultiple).toBeGreaterThan(1.0);
    });

    it('should stop when recycled capital becomes negligible', () => {
      const config: RecyclingConfig = {
        enabled: true,
        mode: 'same-bucket',
        reinvestmentRate: 0.1, // Low reinvestment rate
        avgHoldingPeriod: 2,
        fundLifetime: 20, // Many potential rounds
      };

      const result = calculateRecycling(1000000, 1.5, config);

      // With 10% reinvestment and 1.5x MOIC:
      // Round 0: $1M → $1.5M proceeds → $150K reinvest
      // Round 1: $150K → $225K proceeds → $22.5K reinvest
      // Round 2: $22.5K → $33.75K proceeds → $3.375K reinvest
      // Stop when < 1% of initial ($10K)

      expect(result.recyclingRounds).toBeLessThan(9); // Should stop early
      expect(result.rounds[result.rounds.length - 1].availableForNext).toBeLessThan(10000);
    });

    it('should handle zero MOIC (total loss)', () => {
      const config: RecyclingConfig = {
        enabled: true,
        mode: 'same-bucket',
        reinvestmentRate: 0.8,
        avgHoldingPeriod: 5,
        fundLifetime: 10,
      };

      const result = calculateRecycling(1000000, 0.0, config);

      // Round 0: $1M deployed, $0 proceeds, $0 available for next
      expect(result.recyclingRounds).toBe(0);
      expect(result.rounds).toHaveLength(1);
      expect(result.totalDeployed).toBe(1000000);
      expect(result.recyclingMultiple).toBe(1.0);
    });

    it('should handle 100% reinvestment rate', () => {
      const config: RecyclingConfig = {
        enabled: true,
        mode: 'same-bucket',
        reinvestmentRate: 1.0,
        avgHoldingPeriod: 5,
        fundLifetime: 10,
      };

      const result = calculateRecycling(1000000, 2.0, config);

      // Round 0: $1M → $2M proceeds → $2M reinvest
      // Round 1: $2M → $4M proceeds → $4M reinvest
      // Total deployed: $1M + $2M = $3M

      expect(result.recyclingRounds).toBe(1);
      expect(result.totalDeployed).toBe(3000000);
      expect(result.recyclingMultiple).toBe(3.0);
    });

    it('should produce deterministic results', () => {
      const config: RecyclingConfig = {
        enabled: true,
        mode: 'same-bucket',
        reinvestmentRate: 0.75,
        avgHoldingPeriod: 4,
        fundLifetime: 12,
      };

      const result1 = calculateRecycling(500000, 2.5, config);
      const result2 = calculateRecycling(500000, 2.5, config);

      expect(result1).toEqual(result2);
    });
  });

  describe('RecyclingEngine class', () => {
    it('should create engine with default config', () => {
      const engine = new RecyclingEngine(DEFAULT_RECYCLING_CONFIG);

      expect(engine.getConfig()).toEqual(DEFAULT_RECYCLING_CONFIG);
    });

    it('should calculate bucket recycling', () => {
      const engine = createRecyclingEngine();

      const result = engine.calculateBucketRecycling(1000000, 3.0);

      expect(result.totalDeployed).toBeGreaterThan(1000000);
      expect(result.recyclingMultiple).toBeGreaterThan(1.0);
    });

    it('should calculate multi-bucket recycling', () => {
      const engine = createRecyclingEngine();

      const bucketCapitals = [500000, 300000, 200000];
      const bucketMOICs = [3.5, 2.8, 2.0];

      const results = engine.calculateMultiBucketRecycling(bucketCapitals, bucketMOICs);

      expect(results).toHaveLength(3);
      expect(results[0].totalDeployed).toBeGreaterThan(500000);
      expect(results[1].totalDeployed).toBeGreaterThan(300000);
      expect(results[2].totalDeployed).toBeGreaterThan(200000);
    });

    it('should throw on mismatched bucket arrays', () => {
      const engine = createRecyclingEngine();

      const bucketCapitals = [500000, 300000];
      const bucketMOICs = [3.5, 2.8, 2.0];

      expect(() => engine.calculateMultiBucketRecycling(bucketCapitals, bucketMOICs)).toThrow(
        'Bucket capitals (2) and MOICs (3) must have same length'
      );
    });

    it('should update configuration', () => {
      const engine = createRecyclingEngine();

      engine.updateConfig({ reinvestmentRate: 0.9 });

      const config = engine.getConfig();
      expect(config.reinvestmentRate).toBe(0.9);
      expect(config.avgHoldingPeriod).toBe(5); // Unchanged
    });

    it('should validate updated configuration', () => {
      const engine = createRecyclingEngine();

      expect(() => engine.updateConfig({ reinvestmentRate: 1.5 })).toThrow(
        'Reinvestment rate must be in [0, 1]'
      );
    });

    it('should return frozen config copy', () => {
      const engine = createRecyclingEngine();

      const config = engine.getConfig();

      // Should be frozen (read-only)
      expect(() => {
        (config as any).reinvestmentRate = 0.5;
      }).toThrow();
    });
  });

  describe('DEFAULT_RECYCLING_CONFIG', () => {
    it('should have valid parameters', () => {
      expect(() => validateRecyclingConfig(DEFAULT_RECYCLING_CONFIG)).not.toThrow();
    });

    it('should enable recycling by default', () => {
      expect(DEFAULT_RECYCLING_CONFIG.enabled).toBe(true);
    });

    it('should use same-bucket mode', () => {
      expect(DEFAULT_RECYCLING_CONFIG.mode).toBe('same-bucket');
    });

    it('should have industry-standard values', () => {
      // 80% reinvestment (20% for reserves/fees)
      expect(DEFAULT_RECYCLING_CONFIG.reinvestmentRate).toBe(0.8);

      // 5-year average holding period
      expect(DEFAULT_RECYCLING_CONFIG.avgHoldingPeriod).toBe(5);

      // 10-year fund lifetime
      expect(DEFAULT_RECYCLING_CONFIG.fundLifetime).toBe(10);
    });

    it('should produce ~1 recycling round', () => {
      const rounds = calculateMaxRecyclingRounds(DEFAULT_RECYCLING_CONFIG);
      expect(rounds).toBe(1);
    });
  });

  describe('Edge cases and boundary conditions', () => {
    it('should handle very small initial capital', () => {
      const config = DEFAULT_RECYCLING_CONFIG;
      const result = calculateRecycling(100, 3.0, config);

      expect(result.totalDeployed).toBeGreaterThan(0);
      expect(result.recyclingMultiple).toBeGreaterThan(1.0);
    });

    it('should handle very large initial capital', () => {
      const config = DEFAULT_RECYCLING_CONFIG;
      const result = calculateRecycling(1e9, 3.0, config);

      expect(result.totalDeployed).toBeGreaterThan(1e9);
      expect(result.recyclingMultiple).toBeGreaterThan(1.0);
    });

    it('should handle extreme MOIC values', () => {
      const config = DEFAULT_RECYCLING_CONFIG;
      const result = calculateRecycling(1000000, 20.0, config);

      // With 20x MOIC and 80% reinvestment:
      // Round 0: $1M → $20M proceeds → $16M reinvest
      expect(result.recyclingRounds).toBe(1);
      expect(result.totalDeployed).toBe(17000000);
      expect(result.recyclingMultiple).toBe(17.0);
    });

    it('should handle MOIC = 1.0 (break-even)', () => {
      const config = DEFAULT_RECYCLING_CONFIG;
      const result = calculateRecycling(1000000, 1.0, config);

      // Round 0: $1M → $1M proceeds → $800K reinvest
      // Round 1: $800K → $800K proceeds → $640K reinvest
      expect(result.recyclingRounds).toBe(1);
      expect(result.totalDeployed).toBe(1800000);
      expect(result.recyclingMultiple).toBe(1.8);
    });

    it('should handle 0% reinvestment rate', () => {
      const config: RecyclingConfig = {
        enabled: true,
        mode: 'same-bucket',
        reinvestmentRate: 0.0,
        avgHoldingPeriod: 5,
        fundLifetime: 10,
      };

      const result = calculateRecycling(1000000, 3.0, config);

      // No recycling occurs
      expect(result.recyclingRounds).toBe(0);
      expect(result.totalDeployed).toBe(1000000);
      expect(result.recyclingMultiple).toBe(1.0);
    });
  });

  describe('Integration tests', () => {
    it('should demonstrate realistic VC fund recycling', () => {
      // Seed fund: $50M initial, 3.5x avg MOIC, 80% reinvestment, 5y holding, 10y life
      const config = DEFAULT_RECYCLING_CONFIG;
      const engine = createRecyclingEngine(config);

      const result = engine.calculateBucketRecycling(50_000_000, 3.5);

      // Round 0: $50M → $175M proceeds → $140M reinvest
      // Round 1: $140M → $490M proceeds
      // Total deployed: $50M + $140M = $190M

      expect(result.recyclingRounds).toBe(1);
      expect(result.totalDeployed).toBe(190_000_000);
      expect(result.recyclingMultiple).toBe(3.8);

      expect(result.rounds[0].deployed).toBe(50_000_000);
      expect(result.rounds[0].expectedProceeds).toBe(175_000_000);
      expect(result.rounds[0].availableForNext).toBe(140_000_000);

      expect(result.rounds[1].deployed).toBe(140_000_000);
      expect(result.rounds[1].expectedProceeds).toBe(490_000_000);
    });

    it('should demonstrate multi-bucket fund allocation', () => {
      // $100M fund: $40M Seed, $35M A, $25M B
      const engine = createRecyclingEngine();

      const bucketCapitals = [40_000_000, 35_000_000, 25_000_000];
      const bucketMOICs = [3.5, 2.8, 2.2]; // Seed has highest returns

      const results = engine.calculateMultiBucketRecycling(bucketCapitals, bucketMOICs);

      // Each bucket recycles independently
      expect(results).toHaveLength(3);

      const totalInitial = bucketCapitals.reduce((sum, cap) => sum + cap, 0);
      const totalDeployed = results.reduce((sum, r) => sum + r.totalDeployed, 0);

      expect(totalDeployed).toBeGreaterThan(totalInitial);

      // Seed bucket should have highest recycling multiple
      expect(results[0].recyclingMultiple).toBeGreaterThan(results[1].recyclingMultiple);
      expect(results[1].recyclingMultiple).toBeGreaterThan(results[2].recyclingMultiple);
    });

    it('should demonstrate disabled recycling for comparison', () => {
      const enabledConfig = DEFAULT_RECYCLING_CONFIG;
      const disabledConfig: RecyclingConfig = {
        ...DEFAULT_RECYCLING_CONFIG,
        enabled: false,
      };

      const enabledEngine = new RecyclingEngine(enabledConfig);
      const disabledEngine = new RecyclingEngine(disabledConfig);

      const enabledResult = enabledEngine.calculateBucketRecycling(50_000_000, 3.5);
      const disabledResult = disabledEngine.calculateBucketRecycling(50_000_000, 3.5);

      expect(enabledResult.totalDeployed).toBeGreaterThan(disabledResult.totalDeployed);
      expect(enabledResult.recyclingMultiple).toBeGreaterThan(1.0);
      expect(disabledResult.recyclingMultiple).toBe(1.0);
    });
  });
});
