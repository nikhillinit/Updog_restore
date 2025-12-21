/**
 * Core Validation Test for 2024-2025 Market Parameters
 *
 * This test validates just the core logic of our investment strategy builder
 * and power law distribution without requiring full database/server setup.
 */

import { describe, it, expect } from 'vitest';
import {
  buildInvestmentStrategy,
  type StrategyInputs,
} from '../../client/src/selectors/buildInvestmentStrategy';
import {
  PowerLawDistribution,
  createVCPowerLawDistribution,
} from '../../server/services/power-law-distribution';

describe.skip('@flaky Monte Carlo 2024-2025 Market Validation Core Logic', () => {
  // 2024-2025 Market Constants
  const MARKET_2025_CONFIG = {
    SERIES_A_GRADUATION_RATE: 18, // Down from pre-2020 ~40%
    SEED_TO_SERIES_A_MONTHS: 25, // Extended from ~18 months
    SERIES_A_TO_B_MONTHS: 28, // Extended timelines
    FAILURE_RATE: 70, // 70% total failures
    UNICORN_RATE: 1, // 1% unicorns (>50x returns)
    HOME_RUN_RATE: 4, // 4% home runs (10-50x)
    GOOD_OUTCOME_RATE: 10, // 10% good outcomes (3-10x)
    MODEST_RETURN_RATE: 15, // 15% modest returns (1-3x)
  };

  describe('Investment Strategy Defaults for 2024-2025 Market', () => {
    it('should create realistic investment strategy with Series A Chasm parameters', () => {
      const strategyInputs: StrategyInputs = {
        stages: [
          {
            id: 'seed',
            name: 'Seed',
            graduate: MARKET_2025_CONFIG.SERIES_A_GRADUATION_RATE, // 18% - Series A Chasm
            exit: 12, // Early exits due to market conditions
            months: MARKET_2025_CONFIG.SEED_TO_SERIES_A_MONTHS, // 25 months
          },
          {
            id: 'series-a',
            name: 'Series A',
            graduate: 35, // Better survival post-chasm
            exit: 25,
            months: MARKET_2025_CONFIG.SERIES_A_TO_B_MONTHS, // 28 months
          },
          {
            id: 'series-b',
            name: 'Series B',
            graduate: 40,
            exit: 30,
            months: 24,
          },
          {
            id: 'series-c+',
            name: 'Series C+',
            graduate: 0, // Terminal stage
            exit: 60,
            months: 36,
          },
        ],
        sectorProfiles: [
          {
            id: 'fintech',
            name: 'FinTech',
            targetPercentage: 25,
            description: 'Financial technology',
          },
          {
            id: 'healthtech',
            name: 'HealthTech',
            targetPercentage: 20,
            description: 'Healthcare technology',
          },
          {
            id: 'enterprise',
            name: 'Enterprise SaaS',
            targetPercentage: 20,
            description: 'B2B software',
          },
          { id: 'ai', name: 'AI/ML', targetPercentage: 15, description: 'Artificial intelligence' },
          {
            id: 'climate',
            name: 'Climate Tech',
            targetPercentage: 10,
            description: 'Climate solutions',
          },
          {
            id: 'consumer',
            name: 'Consumer',
            targetPercentage: 10,
            description: 'Consumer products',
          },
        ],
        allocations: [
          {
            id: 'new-investments',
            category: 'New Investments',
            percentage: 60,
            description: 'Initial investments',
          },
          {
            id: 'reserves',
            category: 'Reserves',
            percentage: 35,
            description: 'Follow-on reserves',
          }, // Higher reserves in tough market
          {
            id: 'expenses',
            category: 'Operating Expenses',
            percentage: 5,
            description: 'Fund operations',
          },
        ],
      };

      const strategy = buildInvestmentStrategy(strategyInputs);

      // Validate strategy structure
      expect(strategy.validation.allValid).toBe(true);
      expect(strategy.stages).toHaveLength(4);
      expect(strategy.stages[0].graduationRate).toBe(MARKET_2025_CONFIG.SERIES_A_GRADUATION_RATE);

      // Validate graduation + exit rates don't exceed 100%
      strategy.stages.forEach((stage) => {
        const totalRate = stage.graduationRate + stage.exitRate;
        expect(totalRate).toBeLessThanOrEqual(100);
        expect(stage.remainRate).toBe(100 - totalRate);
      });

      // Validate last stage has 0% graduation
      const lastStage = strategy.stages[strategy.stages.length - 1];
      expect(lastStage.graduationRate).toBe(0);

      // Validate total allocations
      expect(strategy.totalAllocation).toBe(100);
      expect(strategy.totalSectorAllocation).toBe(100);
    });

    it('should reject invalid graduation + exit rate combinations', () => {
      const invalidInputs: StrategyInputs = {
        stages: [
          {
            id: 'invalid',
            name: 'Invalid Stage',
            graduate: 70,
            exit: 50, // Total = 120% > 100%
            months: 24,
          },
        ],
        sectorProfiles: [
          { id: 'tech', name: 'Tech', targetPercentage: 100, description: 'Technology' },
        ],
        allocations: [
          { id: 'inv', category: 'Investments', percentage: 100, description: 'Investments' },
        ],
      };

      const strategy = buildInvestmentStrategy(invalidInputs);

      // Should flag validation error
      expect(strategy.validation.allValid).toBe(false);
      expect(strategy.validation.stages[0]).toContain('Graduate + Exit must be ≤ 100%');
    });

    it('should validate Series C+ as terminal stage constraint', () => {
      const strategyInputs: StrategyInputs = {
        stages: [
          { id: 'seed', name: 'Seed', graduate: 20, exit: 15, months: 24 },
          { id: 'series-a', name: 'Series A', graduate: 30, exit: 20, months: 30 },
          { id: 'series-c+', name: 'Series C+', graduate: 0, exit: 70, months: 48 },
        ],
        sectorProfiles: [
          { id: 'tech', name: 'Technology', targetPercentage: 100, description: 'Tech' },
        ],
        allocations: [
          { id: 'inv', category: 'Investments', percentage: 100, description: 'All investments' },
        ],
      };

      const strategy = buildInvestmentStrategy(strategyInputs);

      // Validate Series C+ has 0% graduation (terminal stage)
      const seriesCPlusStage = strategy.stages.find((s) => s.id === 'series-c+');
      expect(seriesCPlusStage?.graduationRate).toBe(0);

      // Validate all constraints are met
      expect(strategy.validation.allValid).toBe(true);
    });
  });

  describe('Power Law Distribution for 2024-2025 Market', () => {
    it('should create power law distribution with realistic 2024-2025 parameters', () => {
      const powerLaw = new PowerLawDistribution({
        failureRate: MARKET_2025_CONFIG.FAILURE_RATE / 100,
        unicornRate: MARKET_2025_CONFIG.UNICORN_RATE / 100,
        homeRunRate: MARKET_2025_CONFIG.HOME_RUN_RATE / 100,
        goodOutcomeRate: MARKET_2025_CONFIG.GOOD_OUTCOME_RATE / 100,
        modestReturnRate: MARKET_2025_CONFIG.MODEST_RETURN_RATE / 100,
      });

      expect(powerLaw).toBeDefined();
    });

    it('should generate returns that reflect 70% failure rate', () => {
      const powerLaw = new PowerLawDistribution(
        {
          failureRate: 0.7,
          unicornRate: 0.01,
          homeRunRate: 0.04,
          goodOutcomeRate: 0.1,
          modestReturnRate: 0.15,
        },
        42
      ); // Fixed seed for reproducibility

      const portfolioReturns = powerLaw.generatePortfolioReturns(
        20, // portfolioSize
        { seed: 1.0 }, // stageDistribution
        5000 // scenarios
      );

      // Count failures (returns ≤ 1x)
      const failures = portfolioReturns.samples.filter((sample) => sample.multiple <= 1.0);
      const failureRate = failures.length / portfolioReturns.samples.length;

      // Should be approximately 70% ± 5% tolerance for statistical variation
      expect(failureRate).toBeGreaterThan(0.65);
      expect(failureRate).toBeLessThan(0.75);
    });

    it('should generate approximately 1% unicorns (>50x returns)', () => {
      const powerLaw = new PowerLawDistribution(
        {
          failureRate: 0.7,
          unicornRate: 0.01,
          homeRunRate: 0.04,
          goodOutcomeRate: 0.1,
          modestReturnRate: 0.15,
        },
        42
      ); // Fixed seed for reproducibility

      const portfolioReturns = powerLaw.generatePortfolioReturns(
        15, // portfolioSize
        { seed: 1.0 }, // stageDistribution
        10000 // scenarios - Large sample for outlier detection
      );

      // Count extreme outliers (>50x returns)
      const unicorns = portfolioReturns.samples.filter((sample) => sample.multiple > 50);
      const unicornRate = unicorns.length / portfolioReturns.samples.length;

      // Should be approximately 1% ± 0.5% tolerance
      expect(unicornRate).toBeGreaterThan(0.005); // 0.5%
      expect(unicornRate).toBeLessThan(0.02); // 2%
    });

    it('should show power law characteristics in return distribution', () => {
      const powerLaw = createVCPowerLawDistribution(42);

      const portfolioReturns = powerLaw.generatePortfolioReturns(
        25, // portfolioSize
        { seed: 0.6, 'series-a': 0.3, 'series-b': 0.1 }, // stageDistribution
        3000 // scenarios
      );

      // Power law should show dramatic increases in higher percentiles
      const p50 = portfolioReturns.percentiles.p50;
      const p90 = portfolioReturns.percentiles.p90;
      const p99 = portfolioReturns.percentiles.p99;

      // 90th percentile should be much higher than median
      expect(p90).toBeGreaterThan(p50 * 3);

      // 99th percentile should be much higher than 90th
      expect(p99).toBeGreaterThan(p90 * 2);

      // Distribution should be highly skewed
      expect(portfolioReturns.statistics.skewness).toBeGreaterThan(2);
    });

    it('should show Series A Chasm effect in stage-specific failure rates', () => {
      const powerLaw = createVCPowerLawDistribution(42);

      // Test seed investments
      const seedReturns = Array.from({ length: 2000 }, () => powerLaw.sampleReturn('seed'));

      // Test series-a investments
      const seriesAReturns = Array.from({ length: 2000 }, () => powerLaw.sampleReturn('series-a'));

      const seedFailureRate =
        seedReturns.filter((r) => r.multiple <= 1.0).length / seedReturns.length;
      const seriesAFailureRate =
        seriesAReturns.filter((r) => r.multiple <= 1.0).length / seriesAReturns.length;

      // Series A should have lower failure rate than seed (survival bias)
      expect(seriesAFailureRate).toBeLessThan(seedFailureRate);
      expect(seedFailureRate).toBeCloseTo(0.7, 1); // ±10%
      expect(seriesAFailureRate).toBeLessThan(0.6); // Should be <60%
    });

    it('should handle Series C+ stage properly', () => {
      const powerLaw = createVCPowerLawDistribution(42);

      // Test series-c+ investments (should have best survival rates)
      const seriesCReturns = Array.from({ length: 1000 }, () => powerLaw.sampleReturn('series-c+'));

      const seriesCFailureRate =
        seriesCReturns.filter((r) => r.multiple <= 1.0).length / seriesCReturns.length;
      const seriesCMeanReturn =
        seriesCReturns.reduce((sum, r) => sum + r.multiple, 0) / seriesCReturns.length;

      // Series C+ should have lowest failure rate and higher mean returns
      expect(seriesCFailureRate).toBeLessThan(0.4); // <40% failure rate
      expect(seriesCMeanReturn).toBeGreaterThan(2.0); // >2x mean return
    });
  });

  describe('Extended Timelines and Market Conditions', () => {
    it('should validate extended funding cycle timelines are captured', () => {
      const strategyInputs: StrategyInputs = {
        stages: [
          {
            id: 'seed',
            name: 'Seed',
            graduate: 18,
            exit: 12,
            months: 25, // Extended timeline
          },
          {
            id: 'series-a',
            name: 'Series A',
            graduate: 35,
            exit: 25,
            months: 28, // Extended timeline
          },
          {
            id: 'series-b+',
            name: 'Series B+',
            graduate: 0,
            exit: 60,
            months: 36,
          },
        ],
        sectorProfiles: [
          {
            id: 'tech',
            name: 'Technology',
            targetPercentage: 100,
            description: 'Technology sector',
          },
        ],
        allocations: [
          {
            id: 'investments',
            category: 'Investments',
            percentage: 95,
            description: 'Investments',
          },
          { id: 'expenses', category: 'Expenses', percentage: 5, description: 'Expenses' },
        ],
      };

      const strategy = buildInvestmentStrategy(strategyInputs);

      // Validate extended timelines are captured in strategy
      expect(strategy.stages[0].graduationRate).toBe(18); // Series A Chasm
      expect(strategy.validation.allValid).toBe(true);

      // Validate that graduation + exit rates are realistic
      strategy.stages.forEach((stage) => {
        expect(stage.graduationRate + stage.exitRate).toBeLessThanOrEqual(100);
      });
    });

    it('should handle higher reserve allocation for current market conditions', () => {
      const strategyInputs: StrategyInputs = {
        stages: [{ id: 'seed', name: 'Seed', graduate: 18, exit: 12, months: 25 }],
        sectorProfiles: [
          { id: 'tech', name: 'Technology', targetPercentage: 100, description: 'Technology' },
        ],
        allocations: [
          {
            id: 'new-investments',
            category: 'New Investments',
            percentage: 60,
            description: 'Initial investments',
          },
          {
            id: 'reserves',
            category: 'Reserves',
            percentage: 35,
            description: 'Follow-on reserves',
          }, // Higher reserves
          {
            id: 'expenses',
            category: 'Operating Expenses',
            percentage: 5,
            description: 'Fund operations',
          },
        ],
      };

      const strategy = buildInvestmentStrategy(strategyInputs);

      // Find reserve allocation
      const reserveAllocation = strategy.allocations.find((a) => a.category === 'Reserves');

      expect(reserveAllocation).toBeDefined();
      expect(reserveAllocation!.percentage).toBe(35); // Higher than historical 20-25%
      expect(strategy.totalAllocation).toBe(100);
      expect(strategy.validation.allValid).toBe(true);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle malformed inputs gracefully', () => {
      const malformedInputs = {
        stages: null,
        sectorProfiles: [],
        allocations: [],
      } as any;

      const strategy = buildInvestmentStrategy(malformedInputs);

      // Should return safe defaults
      expect(strategy.stages).toEqual([]);
      expect(strategy.validation.allValid).toBe(false);
    });

    it('should handle invalid stage names in power law distribution', () => {
      const powerLaw = createVCPowerLawDistribution(42);

      // Should throw on invalid stage (validates stage parameter)
      expect(() => {
        powerLaw.sampleReturn('invalid-stage' as any);
      }).toThrow('Invalid investment stage: invalid-stage');
    });

    it('should maintain reproducibility with fixed seeds', () => {
      const powerLaw1 = createVCPowerLawDistribution(12345);
      const powerLaw2 = createVCPowerLawDistribution(12345);

      const sample1 = powerLaw1.sampleReturn('seed');
      const sample2 = powerLaw2.sampleReturn('seed');

      expect(sample1.multiple).toBe(sample2.multiple);
      expect(sample1.category).toBe(sample2.category);
    });
  });
});
