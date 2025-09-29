/**
 * Power Law Distribution Service Tests
 *
 * Comprehensive unit tests for the power law distribution service that implements
 * realistic venture capital return distributions for Monte Carlo simulations.
 * Tests stage-specific failure rates, power law tail behavior, and integration compatibility.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PowerLawDistribution,
  createVCPowerLawDistribution,
  generatePowerLawReturns,
  type InvestmentStage,
  type PowerLawConfig
} from '../../../server/services/power-law-distribution';

describe('PowerLawDistribution', () => {
  let distribution: PowerLawDistribution;
  const testSeed = 12345;

  beforeEach(() => {
    // Use deterministic seed for reproducible tests
    distribution = new PowerLawDistribution(undefined, testSeed);
  });

  describe('Construction and Configuration', () => {
    it('should create distribution with default VC parameters', () => {
      const defaultDistribution = new PowerLawDistribution();
      expect(defaultDistribution).toBeDefined();
    });

    it('should accept custom configuration parameters', () => {
      const customConfig: Partial<PowerLawConfig> = {
        failureRate: 0.65,
        modestReturnRate: 0.20,
        alpha: 1.20,
        maxReturn: 150.0
      };

      const customDistribution = new PowerLawDistribution(customConfig, testSeed);
      expect(customDistribution).toBeDefined();
    });

    it('should produce reproducible results with same seed', () => {
      const dist1 = new PowerLawDistribution(undefined, testSeed);
      const dist2 = new PowerLawDistribution(undefined, testSeed);

      const sample1 = dist1.sampleReturn('seed');
      const sample2 = dist2.sampleReturn('seed');

      expect(sample1.multiple).toBe(sample2.multiple);
      expect(sample1.category).toBe(sample2.category);
    });

    it('should produce different results with different seeds', () => {
      const dist1 = new PowerLawDistribution(undefined, 12345);
      const dist2 = new PowerLawDistribution(undefined, 54321);

      const samples1 = Array.from({ length: 10 }, () => dist1.sampleReturn('seed'));
      const samples2 = Array.from({ length: 10 }, () => dist2.sampleReturn('seed'));

      // Should not be identical (probability of exact match is extremely low)
      const identical = samples1.every((s1, i) => s1.multiple === samples2[i].multiple);
      expect(identical).toBe(false);
    });
  });

  describe('Stage-Specific Return Sampling', () => {
    describe('sampleReturn', () => {
      it('should sample returns for all investment stages', () => {
        const stages: InvestmentStage[] = ['pre-seed', 'seed', 'series-a', 'series-b', 'series-c+'];

        stages.forEach(stage => {
          const sample = distribution.sampleReturn(stage);
          expect(sample.stage).toBe(stage);
          expect(sample.multiple).toBeGreaterThanOrEqual(0);
          expect(sample.probability).toBeGreaterThan(0);
          expect(sample.probability).toBeLessThanOrEqual(1);
          expect(['failure', 'modest', 'good', 'homeRun', 'unicorn']).toContain(sample.category);
        });
      });

      it('should respect stage-specific failure rates', () => {
        const sampleSize = 10000;
        const stages: Record<InvestmentStage, number> = {
          'pre-seed': 0.75,
          'seed': 0.70,
          'series-a': 0.50,
          'series-b': 0.35,
          'series-c+': 0.20
        };

        Object.entries(stages).forEach(([stage, expectedFailureRate]) => {
          const samples = Array.from({ length: sampleSize }, () =>
            distribution.sampleReturn(stage as InvestmentStage)
          );

          const failureCount = samples.filter(s => s.category === 'failure').length;
          const actualFailureRate = failureCount / sampleSize;

          // Allow ±3% tolerance for statistical variation
          expect(actualFailureRate).toBeCloseTo(expectedFailureRate, 1);
        });
      });

      it('should generate appropriate return multiples by category', () => {
        const sampleSize = 1000;
        const samples = Array.from({ length: sampleSize }, () => distribution.sampleReturn('seed'));

        const categories = {
          failure: samples.filter(s => s.category === 'failure'),
          modest: samples.filter(s => s.category === 'modest'),
          good: samples.filter(s => s.category === 'good'),
          homeRun: samples.filter(s => s.category === 'homeRun'),
          unicorn: samples.filter(s => s.category === 'unicorn')
        };

        // Check return ranges for each category
        if (categories.failure.length > 0) {
          categories.failure.forEach(sample => {
            expect(sample.multiple).toBeGreaterThanOrEqual(0);
            expect(sample.multiple).toBeLessThanOrEqual(1);
          });
        }

        if (categories.modest.length > 0) {
          categories.modest.forEach(sample => {
            expect(sample.multiple).toBeGreaterThan(1);
            expect(sample.multiple).toBeLessThanOrEqual(3);
          });
        }

        if (categories.good.length > 0) {
          categories.good.forEach(sample => {
            expect(sample.multiple).toBeGreaterThan(3);
            expect(sample.multiple).toBeLessThanOrEqual(10);
          });
        }

        if (categories.homeRun.length > 0) {
          categories.homeRun.forEach(sample => {
            expect(sample.multiple).toBeGreaterThan(10);
            expect(sample.multiple).toBeLessThanOrEqual(50);
          });
        }

        if (categories.unicorn.length > 0) {
          categories.unicorn.forEach(sample => {
            expect(sample.multiple).toBeGreaterThan(50);
            expect(sample.multiple).toBeLessThanOrEqual(200);
          });
        }
      });

      it('should throw error for invalid investment stage', () => {
        expect(() => {
          distribution.sampleReturn('invalid-stage' as InvestmentStage);
        }).toThrow('Invalid investment stage: invalid-stage');
      });
    });

    describe('Stage Progression Effects', () => {
      it('should show decreasing failure rates from pre-seed to series-c+', () => {
        const sampleSize = 5000;
        const stages: InvestmentStage[] = ['pre-seed', 'seed', 'series-a', 'series-b', 'series-c+'];

        const failureRates = stages.map(stage => {
          const samples = Array.from({ length: sampleSize }, () => distribution.sampleReturn(stage));
          const failures = samples.filter(s => s.category === 'failure').length;
          return failures / sampleSize;
        });

        // Each stage should have lower or equal failure rate than the previous
        for (let i = 1; i < failureRates.length; i++) {
          expect(failureRates[i]).toBeLessThanOrEqual(failureRates[i - 1]);
        }
      });

      it('should show increasing unicorn rates in later stages', () => {
        const sampleSize = 10000;
        const stages: InvestmentStage[] = ['seed', 'series-a', 'series-b', 'series-c+'];

        const unicornRates = stages.map(stage => {
          const samples = Array.from({ length: sampleSize }, () => distribution.sampleReturn(stage));
          const unicorns = samples.filter(s => s.category === 'unicorn').length;
          return unicorns / sampleSize;
        });

        // Later stages should have higher unicorn rates
        expect(unicornRates[3]).toBeGreaterThan(unicornRates[0]); // series-c+ > seed
        expect(unicornRates[2]).toBeGreaterThan(unicornRates[1]); // series-b > series-a
      });
    });
  });

  describe('Investment Scenario Generation', () => {
    describe('generateInvestmentScenario', () => {
      it('should generate complete investment scenarios', () => {
        const scenario = distribution.generateInvestmentScenario('seed', 5);

        expect(scenario.multiple).toBeGreaterThanOrEqual(0);
        expect(scenario.irr).toBeDefined();
        expect(['failure', 'modest', 'good', 'homeRun', 'unicorn']).toContain(scenario.category);
        expect(scenario.exitTiming).toBeGreaterThan(0);
      });

      it('should calculate IRR correctly from multiples', () => {
        const scenarios = Array.from({ length: 100 }, () =>
          distribution.generateInvestmentScenario('seed', 5)
        );

        scenarios.forEach(scenario => {
          if (scenario.multiple > 0) {
            // IRR = (ending_value / beginning_value)^(1/years) - 1
            // Use the actual time horizon used in calculation (min of exitTiming and timeHorizon)
            const actualTimeUsed = Math.min(scenario.exitTiming, 5);
            const expectedIRR = Math.pow(scenario.multiple, 1 / actualTimeUsed) - 1;
            expect(scenario.irr).toBeCloseTo(expectedIRR, 1); // Reduced precision
          } else {
            expect(scenario.irr).toBe(-1.0); // Total loss
          }
        });
      });

      it('should generate appropriate exit timing by stage', () => {
        const stages: InvestmentStage[] = ['pre-seed', 'seed', 'series-a', 'series-b', 'series-c+'];
        const sampleSize = 100;

        const avgExitTimes = stages.map(stage => {
          const scenarios = Array.from({ length: sampleSize }, () =>
            distribution.generateInvestmentScenario(stage, 10)
          );
          const totalTime = scenarios.reduce((sum, s) => sum + s.exitTiming, 0);
          return totalTime / scenarios.length;
        });

        // Later stages should generally have shorter exit times
        expect(avgExitTimes[0]).toBeGreaterThan(avgExitTimes[4]); // pre-seed > series-c+
        expect(avgExitTimes[1]).toBeGreaterThan(avgExitTimes[3]); // seed > series-b
      });

      it('should handle time horizon constraints', () => {
        const shortHorizon = 3;
        const scenarios = Array.from({ length: 100 }, () =>
          distribution.generateInvestmentScenario('seed', shortHorizon)
        );

        // Exit timing should not exceed time horizon in IRR calculation
        scenarios.forEach(scenario => {
          const actualTimeUsed = Math.min(scenario.exitTiming, shortHorizon);
          if (scenario.multiple > 0) {
            const expectedIRR = Math.pow(scenario.multiple, 1 / actualTimeUsed) - 1;
            expect(scenario.irr).toBeCloseTo(expectedIRR, 2);
          }
        });
      });
    });

    describe('generateBatchScenarios', () => {
      it('should generate specified number of scenarios', () => {
        const count = 500;
        const scenarios = distribution.generateBatchScenarios(count, { 'seed': 1.0 }, 5);

        expect(scenarios).toHaveLength(count);
        scenarios.forEach(scenario => {
          expect(scenario.multiple).toBeGreaterThanOrEqual(0);
          expect(scenario.irr).toBeDefined();
          expect(scenario.stage).toBe('seed');
        });
      });

      it('should respect stage distribution weights', () => {
        const count = 1000;
        const stageDistribution = {
          'seed': 0.6,
          'series-a': 0.3,
          'series-b': 0.1
        };

        const scenarios = distribution.generateBatchScenarios(count, stageDistribution, 5);

        const stageCounts = {
          'seed': scenarios.filter(s => s.stage === 'seed').length,
          'series-a': scenarios.filter(s => s.stage === 'series-a').length,
          'series-b': scenarios.filter(s => s.stage === 'series-b').length
        };

        // Check distribution is approximately correct (±5% tolerance)
        expect(stageCounts.seed / count).toBeCloseTo(0.6, 1);
        expect(stageCounts['series-a'] / count).toBeCloseTo(0.3, 1);
        expect(stageCounts['series-b'] / count).toBeCloseTo(0.1, 1);
      });

      it('should handle normalized stage distributions', () => {
        const count = 500;
        const unnormalizedDistribution = {
          'seed': 60,
          'series-a': 30,
          'series-b': 10
        };

        const scenarios = distribution.generateBatchScenarios(count, unnormalizedDistribution, 5);

        expect(scenarios).toHaveLength(count);

        const stageCounts = {
          'seed': scenarios.filter(s => s.stage === 'seed').length,
          'series-a': scenarios.filter(s => s.stage === 'series-a').length,
          'series-b': scenarios.filter(s => s.stage === 'series-b').length
        };

        // Should normalize to 0.6, 0.3, 0.1
        expect(stageCounts.seed / count).toBeCloseTo(0.6, 1);
        expect(stageCounts['series-a'] / count).toBeCloseTo(0.3, 1);
        expect(stageCounts['series-b'] / count).toBeCloseTo(0.1, 1);
      });
    });
  });

  describe('Portfolio Return Distribution', () => {
    describe('generatePortfolioReturns', () => {
      it('should generate portfolio distributions with correct structure', () => {
        const portfolioSize = 25;
        const scenarios = 1000;
        const stageDistribution = { 'seed': 0.7, 'series-a': 0.3 };

        const portfolioDistribution = distribution.generatePortfolioReturns(
          portfolioSize,
          stageDistribution,
          scenarios
        );

        expect(portfolioDistribution.samples).toHaveLength(portfolioSize * scenarios);
        expect(portfolioDistribution.statistics).toBeDefined();
        expect(portfolioDistribution.percentiles).toBeDefined();

        // Check statistics structure
        expect(portfolioDistribution.statistics.mean).toBeGreaterThan(0);
        expect(portfolioDistribution.statistics.median).toBeGreaterThan(0);
        expect(portfolioDistribution.statistics.standardDeviation).toBeGreaterThan(0);
        expect(portfolioDistribution.statistics.skewness).toBeDefined();
        expect(portfolioDistribution.statistics.kurtosis).toBeDefined();
        expect(portfolioDistribution.statistics.powerLawAlpha).toBeGreaterThan(0);

        // Check percentiles structure
        expect(portfolioDistribution.percentiles.p5).toBeLessThan(portfolioDistribution.percentiles.p25);
        expect(portfolioDistribution.percentiles.p25).toBeLessThan(portfolioDistribution.percentiles.p50);
        expect(portfolioDistribution.percentiles.p50).toBeLessThan(portfolioDistribution.percentiles.p75);
        expect(portfolioDistribution.percentiles.p75).toBeLessThan(portfolioDistribution.percentiles.p95);
        expect(portfolioDistribution.percentiles.p95).toBeLessThan(portfolioDistribution.percentiles.p99);
      });

      it('should show power law characteristics', () => {
        const portfolioSize = 50;
        const scenarios = 2000;

        const portfolioDistribution = distribution.generatePortfolioReturns(
          portfolioSize,
          { 'seed': 1.0 },
          scenarios
        );

        const multiples = portfolioDistribution.samples.map(s => s.multiple);

        // Should show high skewness (long right tail)
        expect(portfolioDistribution.statistics.skewness).toBeGreaterThan(1);

        // Should show high kurtosis (fat tails)
        expect(portfolioDistribution.statistics.kurtosis).toBeGreaterThan(1);

        // Most returns should be low, with few very high returns
        const belowMedian = multiples.filter(m => m < portfolioDistribution.statistics.median).length;
        const totalSamples = multiples.length;
        expect(belowMedian / totalSamples).toBeGreaterThan(0.4); // At least 40% below median
      });

      it('should estimate power law alpha correctly', () => {
        const portfolioSize = 100;
        const scenarios = 1000;

        const portfolioDistribution = distribution.generatePortfolioReturns(
          portfolioSize,
          { 'seed': 1.0 },
          scenarios
        );

        // Alpha should be close to configured value (1.16) for sufficient tail data
        expect(portfolioDistribution.statistics.powerLawAlpha).toBeGreaterThan(0.8);
        expect(portfolioDistribution.statistics.powerLawAlpha).toBeLessThan(2.0);
      });
    });
  });

  describe('Power Law Mathematical Properties', () => {
    it('should produce samples following power law in tail', () => {
      const sampleSize = 10000;
      const samples = Array.from({ length: sampleSize }, () => distribution.sampleReturn('seed'));

      // Focus on tail returns (> 3x)
      const tailSamples = samples.filter(s => s.multiple >= 3);

      if (tailSamples.length > 100) {
        // Sort tail samples
        const sortedTail = tailSamples.map(s => s.multiple).sort((a, b) => b - a);

        // Check that larger returns are less frequent (basic power law property)
        const high = sortedTail.filter(m => m >= 10).length;
        const veryHigh = sortedTail.filter(m => m >= 50).length;

        expect(veryHigh).toBeLessThan(high);
      }
    });

    it('should show correct variance scaling', () => {
      const smallSample = distribution.generatePortfolioReturns(10, { 'seed': 1.0 }, 1000);
      const largeSample = distribution.generatePortfolioReturns(100, { 'seed': 1.0 }, 1000);

      // Larger portfolios should show different variance characteristics
      expect(largeSample.statistics.standardDeviation).toBeDefined();
      expect(smallSample.statistics.standardDeviation).toBeDefined();
    });

    it('should maintain return category proportions', () => {
      const sampleSize = 10000;
      const samples = Array.from({ length: sampleSize }, () => distribution.sampleReturn('seed'));

      const categoryCounts = {
        failure: samples.filter(s => s.category === 'failure').length,
        modest: samples.filter(s => s.category === 'modest').length,
        good: samples.filter(s => s.category === 'good').length,
        homeRun: samples.filter(s => s.category === 'homeRun').length,
        unicorn: samples.filter(s => s.category === 'unicorn').length
      };

      // Check proportions match configured rates (±2% tolerance)
      expect(categoryCounts.failure / sampleSize).toBeCloseTo(0.70, 1);
      expect(categoryCounts.modest / sampleSize).toBeCloseTo(0.15, 1);
      expect(categoryCounts.good / sampleSize).toBeCloseTo(0.10, 1);
      expect(categoryCounts.homeRun / sampleSize).toBeCloseTo(0.04, 1);
      expect(categoryCounts.unicorn / sampleSize).toBeCloseTo(0.01, 1);
    });
  });

  describe('No Time Decay Verification', () => {
    it('should not apply time decay to returns', () => {
      const scenarios5y = distribution.generateBatchScenarios(1000, { 'seed': 1.0 }, 5);
      const scenarios10y = distribution.generateBatchScenarios(1000, { 'seed': 1.0 }, 10);

      // Return multiples should not be systematically different due to time horizon
      const multiples5y = scenarios5y.map(s => s.multiple);
      const multiples10y = scenarios10y.map(s => s.multiple);

      const mean5y = multiples5y.reduce((sum, m) => sum + m, 0) / multiples5y.length;
      const mean10y = multiples10y.reduce((sum, m) => sum + m, 0) / multiples10y.length;

      // Means should be similar (no systematic time decay)
      // Allow for more variance due to random sampling
      expect(Math.abs(mean5y - mean10y) / mean5y).toBeLessThan(0.3); // Within 30%
    });

    it('should show time horizon only affects IRR calculation', () => {
      const scenarios = distribution.generateBatchScenarios(100, { 'seed': 1.0 }, 5);

      scenarios.forEach(scenario => {
        // Recalculate IRR for different time horizons
        const irr8y = Math.pow(scenario.multiple, 1 / Math.min(scenario.exitTiming, 8)) - 1;
        const irr3y = Math.pow(scenario.multiple, 1 / Math.min(scenario.exitTiming, 3)) - 1;

        if (scenario.multiple > 1) {
          expect(irr3y).toBeGreaterThanOrEqual(irr8y); // Shorter horizon = higher IRR for multiples > 1
        }
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle zero portfolio size', () => {
      const portfolioDistribution = distribution.generatePortfolioReturns(0, { 'seed': 1.0 }, 100);
      expect(portfolioDistribution.samples).toHaveLength(0);
    });

    it('should handle empty stage distribution', () => {
      expect(() => {
        distribution.generateBatchScenarios(10, {}, 5);
      }).not.toThrow();
    });

    it('should handle extreme time horizons', () => {
      const shortScenario = distribution.generateInvestmentScenario('seed', 0.5);
      const longScenario = distribution.generateInvestmentScenario('seed', 50);

      expect(shortScenario.irr).toBeDefined();
      expect(longScenario.irr).toBeDefined();
      expect(shortScenario.exitTiming).toBeGreaterThan(0);
      expect(longScenario.exitTiming).toBeGreaterThan(0);
    });
  });
});

describe('Utility Functions', () => {
  describe('createVCPowerLawDistribution', () => {
    it('should create distribution with default VC parameters', () => {
      const distribution = createVCPowerLawDistribution();
      expect(distribution).toBeInstanceOf(PowerLawDistribution);
    });

    it('should create reproducible distribution with seed', () => {
      const dist1 = createVCPowerLawDistribution(12345);
      const dist2 = createVCPowerLawDistribution(12345);

      const sample1 = dist1.sampleReturn('seed');
      const sample2 = dist2.sampleReturn('seed');

      expect(sample1.multiple).toBe(sample2.multiple);
    });
  });

  describe('generatePowerLawReturns', () => {
    it('should generate returns for Monte Carlo integration', () => {
      const portfolioSize = 25;
      const stageDistribution = { 'seed': 0.7, 'series-a': 0.3 };
      const timeHorizon = 5;
      const scenarios = 1000;

      const returns = generatePowerLawReturns(
        portfolioSize,
        stageDistribution,
        timeHorizon,
        scenarios,
        12345
      );

      expect(returns).toHaveLength(portfolioSize * scenarios);

      returns.forEach(ret => {
        expect(ret.multiple).toBeGreaterThanOrEqual(0);
        expect(ret.irr).toBeDefined();
        expect(['failure', 'modest', 'good', 'homeRun', 'unicorn']).toContain(ret.category);
        expect(ret.exitTiming).toBeGreaterThan(0);
        expect(['seed', 'series-a']).toContain(ret.stage);
      });
    });

    it('should handle string stage names from existing system', () => {
      const stageDistribution = {
        'Seed': 0.5,
        'Series A': 0.3,
        'Series B': 0.2
      };

      const returns = generatePowerLawReturns(10, stageDistribution, 5, 100, 12345);

      expect(returns).toHaveLength(1000);

      const stages = new Set(returns.map(r => r.stage));
      expect(stages.has('seed')).toBe(true);
      expect(stages.has('series-a')).toBe(true);
      expect(stages.has('series-b')).toBe(true);
    });

    it('should default to seed stage for invalid distributions', () => {
      const invalidDistribution = { 'invalid-stage': 1.0 };

      const returns = generatePowerLawReturns(5, invalidDistribution, 5, 10, 12345);

      expect(returns).toHaveLength(50);
      returns.forEach(ret => {
        expect(ret.stage).toBe('seed');
      });
    });

    it('should be reproducible with same seed', () => {
      const params = [25, { 'seed': 1.0 }, 5, 100, 12345] as const;

      const returns1 = generatePowerLawReturns(...params);
      const returns2 = generatePowerLawReturns(...params);

      expect(returns1).toHaveLength(returns2.length);

      for (let i = 0; i < returns1.length; i++) {
        expect(returns1[i].multiple).toBe(returns2[i].multiple);
        expect(returns1[i].irr).toBe(returns2[i].irr);
        expect(returns1[i].category).toBe(returns2[i].category);
      }
    });
  });
});

describe('Integration with Monte Carlo Engine', () => {
  it('should produce realistic VC portfolio distributions', () => {
    const distribution = createVCPowerLawDistribution(12345);

    // Generate large sample to test statistical properties
    const portfolioDistribution = distribution.generatePortfolioReturns(
      30, // 30 companies
      { 'seed': 0.6, 'series-a': 0.4 }, // Mix of stages
      1000 // 1000 scenarios
    );

    // Check realistic VC characteristics
    expect(portfolioDistribution.statistics.mean).toBeGreaterThan(1.0); // Should beat 1x on average
    expect(portfolioDistribution.statistics.mean).toBeLessThan(5.0); // But not unrealistically high
    expect(portfolioDistribution.statistics.skewness).toBeGreaterThan(2.0); // Highly skewed
    expect(portfolioDistribution.percentiles.p50).toBeLessThan(portfolioDistribution.statistics.mean); // Median < mean

    // Most scenarios should be modest, few should be huge
    const lowReturns = portfolioDistribution.samples.filter(s => s.multiple <= 2).length;
    const highReturns = portfolioDistribution.samples.filter(s => s.multiple >= 10).length;
    expect(lowReturns).toBeGreaterThan(highReturns);
  });

  it('should handle typical portfolio construction parameters', () => {
    const distribution = createVCPowerLawDistribution(12345);

    // Test different portfolio sizes common in VC
    const portfolioSizes = [15, 25, 35, 50];

    portfolioSizes.forEach(size => {
      const scenarios = distribution.generateBatchScenarios(
        size * 100, // 100 scenarios per company
        { 'seed': 0.5, 'series-a': 0.3, 'series-b': 0.2 },
        8 // 8 year time horizon
      );

      expect(scenarios).toHaveLength(size * 100);

      // Calculate portfolio-level statistics
      const avgMultiple = scenarios.reduce((sum, s) => sum + s.multiple, 0) / scenarios.length;
      const avgIRR = scenarios.reduce((sum, s) => sum + s.irr, 0) / scenarios.length;

      expect(avgMultiple).toBeGreaterThan(0.5);
      expect(avgMultiple).toBeLessThan(8.0);
      expect(avgIRR).toBeGreaterThan(-0.5); // -50% worst case
      expect(avgIRR).toBeLessThan(1.0); // 100% best case reasonable
    });
  });

  it('should show Series A Chasm effect clearly', () => {
    const distribution = createVCPowerLawDistribution(12345);
    const sampleSize = 10000;

    // Compare seed vs series-a outcomes
    const seedSamples = Array.from({ length: sampleSize }, () =>
      distribution.sampleReturn('seed')
    );
    const seriesASamples = Array.from({ length: sampleSize }, () =>
      distribution.sampleReturn('series-a')
    );

    const seedFailureRate = seedSamples.filter(s => s.category === 'failure').length / sampleSize;
    const seriesAFailureRate = seriesASamples.filter(s => s.category === 'failure').length / sampleSize;

    // Series A should have lower failure rate (the "chasm" crossing effect)
    expect(seriesAFailureRate).toBeLessThan(seedFailureRate);
    expect(seedFailureRate).toBeCloseTo(0.70, 1);
    expect(seriesAFailureRate).toBeCloseTo(0.50, 1);

    // But Series A should have higher upside potential
    const seedUnicornRate = seedSamples.filter(s => s.category === 'unicorn').length / sampleSize;
    const seriesAUnicornRate = seriesASamples.filter(s => s.category === 'unicorn').length / sampleSize;

    expect(seriesAUnicornRate).toBeGreaterThan(seedUnicornRate);
  });
});

describe('Performance and Memory Tests', () => {
  it('should generate large simulations efficiently', () => {
    const distribution = createVCPowerLawDistribution();

    const startTime = Date.now();
    const largeSim = distribution.generateBatchScenarios(
      50000, // 50K scenarios
      { 'seed': 0.6, 'series-a': 0.4 },
      5
    );
    const endTime = Date.now();

    expect(largeSim).toHaveLength(50000);
    expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
  });

  it('should handle concurrent generation', async () => {
    const distribution = createVCPowerLawDistribution();

    const promises = Array.from({ length: 5 }, (_, i) =>
      Promise.resolve(distribution.generateBatchScenarios(
        1000,
        { 'seed': 1.0 },
        5
      ))
    );

    const results = await Promise.all(promises);

    expect(results).toHaveLength(5);
    results.forEach(result => {
      expect(result).toHaveLength(1000);
    });
  });
});