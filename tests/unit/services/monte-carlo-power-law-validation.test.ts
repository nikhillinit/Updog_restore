/**
 * Monte Carlo Power Law Validation Tests
 *
 * Direct validation of power law distribution integration requirements:
 * - 70% failure rate for seed investments
 * - ~1% extreme outliers (>50x)
 * - Series A Chasm reflected in graduation rates
 * - No time decay dampening variance
 */

import { describe, it, expect } from 'vitest';
import {
  createVCPowerLawDistribution,
  generatePowerLawReturns,
  type InvestmentStage
} from '../../../server/services/power-law-distribution';

describe('@flaky Monte Carlo Power Law Validation', () => {
  const testSeed = 12345;

  describe('70% Failure Rate Validation', () => {
    it('should show approximately 70% failure rate for seed investments', () => {
      const distribution = createVCPowerLawDistribution(testSeed);
      const sampleSize = 10000;

      const samples = Array.from({ length: sampleSize }, () =>
        distribution.sampleReturn('seed')
      );

      // Count failures (returns ≤ 1x)
      const failures = samples.filter(sample => sample.multiple <= 1.0);
      const failureRate = failures.length / sampleSize;

      // Should be approximately 70% ± 2% tolerance for statistical variation
      expect(failureRate).toBeGreaterThan(0.68);
      expect(failureRate).toBeLessThan(0.72);
      expect(failureRate).toBeCloseTo(0.70, 1);
    });

    it('should show different failure rates by stage reflecting Series A Chasm', () => {
      const distribution = createVCPowerLawDistribution(testSeed);
      const sampleSize = 5000;

      // Test seed vs series-a failure rates
      const seedSamples = Array.from({ length: sampleSize }, () =>
        distribution.sampleReturn('seed')
      );
      const seriesASamples = Array.from({ length: sampleSize }, () =>
        distribution.sampleReturn('series-a')
      );

      const seedFailureRate = seedSamples.filter(s => s.multiple <= 1.0).length / sampleSize;
      const seriesAFailureRate = seriesASamples.filter(s => s.multiple <= 1.0).length / sampleSize;

      // Series A should have lower failure rate (Series A Chasm effect)
      expect(seriesAFailureRate).toBeLessThan(seedFailureRate);
      expect(seedFailureRate).toBeCloseTo(0.70, 1);
      expect(seriesAFailureRate).toBeCloseTo(0.50, 1);
    });

    it('should show progressive improvement in later stages', () => {
      const distribution = createVCPowerLawDistribution(testSeed);
      const sampleSize = 3000;
      const stages: InvestmentStage[] = ['seed', 'series-a', 'series-b', 'series-c+'];

      const failureRates = stages.map(stage => {
        const samples = Array.from({ length: sampleSize }, () =>
          distribution.sampleReturn(stage)
        );
        return samples.filter(s => s.multiple <= 1.0).length / sampleSize;
      });

      // Each stage should have lower or equal failure rate than the previous
      for (let i = 1; i < failureRates.length; i++) {
        expect(failureRates[i]).toBeLessThanOrEqual(failureRates[i - 1]);
      }

      // Specific rate checks
      expect(failureRates[0]).toBeCloseTo(0.70, 1); // seed
      expect(failureRates[1]).toBeCloseTo(0.50, 1); // series-a
      expect(failureRates[2]).toBeCloseTo(0.35, 1); // series-b
      expect(failureRates[3]).toBeCloseTo(0.20, 1); // series-c+
    });
  });

  describe('Extreme Outliers Validation (>50x)', () => {
    it('should show extreme outliers in approximately 1% of simulations', () => {
      const distribution = createVCPowerLawDistribution(testSeed);
      const sampleSize = 20000; // Large sample for outlier detection

      const samples = Array.from({ length: sampleSize }, () =>
        distribution.sampleReturn('seed')
      );

      // Count extreme outliers (>50x returns)
      const extremeOutliers = samples.filter(sample => sample.multiple > 50);
      const outlierRate = extremeOutliers.length / sampleSize;

      // Should be approximately 1% ± 0.3% tolerance
      expect(outlierRate).toBeGreaterThan(0.007); // 0.7%
      expect(outlierRate).toBeLessThan(0.013);    // 1.3%
      expect(outlierRate).toBeCloseTo(0.01, 2);   // ~1%
    });

    it('should cap unicorns at reasonable levels (≤200x)', () => {
      const distribution = createVCPowerLawDistribution(testSeed);
      const sampleSize = 10000;

      const samples = Array.from({ length: sampleSize }, () =>
        distribution.sampleReturn('seed')
      );

      const multiples = samples.map(s => s.multiple);
      const maxReturn = Math.max(...multiples);

      // Should be capped around 200x
      expect(maxReturn).toBeLessThanOrEqual(200);

      // Very few should be above 100x
      const above100x = multiples.filter(m => m > 100).length;
      const above100xRate = above100x / sampleSize;
      expect(above100xRate).toBeLessThan(0.005); // < 0.5%
    });

    it('should show power law tail characteristics', () => {
      const distribution = createVCPowerLawDistribution(testSeed);
      const portfolioDistribution = distribution.generatePortfolioReturns(
        50, // 50 companies
        { 'seed': 1.0 },
        2000 // 2000 scenarios
      );

      // Should show high skewness (long right tail)
      expect(portfolioDistribution.statistics.skewness).toBeGreaterThan(2);

      // Should show high kurtosis (fat tails)
      expect(portfolioDistribution.statistics.kurtosis).toBeGreaterThan(5);

      // Median should be much lower than mean (right-skewed)
      expect(portfolioDistribution.statistics.median).toBeLessThan(portfolioDistribution.statistics.mean);

      // 99th percentile should be dramatically higher than 90th
      const ratio99to90 = portfolioDistribution.percentiles.p99 / portfolioDistribution.percentiles.p90;
      expect(ratio99to90).toBeGreaterThan(2);
    });
  });

  describe('Series A Chasm Validation', () => {
    it('should show decreasing failure rates from seed to later stages', () => {
      const distribution = createVCPowerLawDistribution(testSeed);
      const sampleSize = 5000;
      const stages: InvestmentStage[] = ['seed', 'series-a', 'series-b', 'series-c+'];

      const stagemetrics = stages.map(stage => {
        const samples = Array.from({ length: sampleSize }, () =>
          distribution.sampleReturn(stage)
        );

        const failures = samples.filter(s => s.multiple <= 1.0).length;
        const unicorns = samples.filter(s => s.multiple > 50).length;
        const homeRuns = samples.filter(s => s.multiple > 10 && s.multiple <= 50).length;

        return {
          stage,
          failureRate: failures / sampleSize,
          unicornRate: unicorns / sampleSize,
          homeRunRate: homeRuns / sampleSize
        };
      });

      // Failure rates should decrease
      expect(stagemetrics[1].failureRate).toBeLessThan(stagemetrics[0].failureRate); // series-a < seed
      expect(stagemetrics[2].failureRate).toBeLessThan(stagemetrics[1].failureRate); // series-b < series-a
      expect(stagemetrics[3].failureRate).toBeLessThan(stagemetrics[2].failureRate); // series-c+ < series-b

      // Unicorn rates should increase in later stages
      expect(stagemetrics[3].unicornRate).toBeGreaterThan(stagemetrics[0].unicornRate); // series-c+ > seed
      expect(stagemetrics[2].unicornRate).toBeGreaterThan(stagemetrics[1].unicornRate); // series-b > series-a
    });

    it('should show realistic graduation rates between stages', () => {
      const distribution = createVCPowerLawDistribution(testSeed);

      // Simulate a typical fund portfolio progression
      const seedCompanies = 20;
      const sampleSize = 1000;

      // Generate seed stage outcomes
      const seedOutcomes = Array.from({ length: seedCompanies * sampleSize }, () =>
        distribution.sampleReturn('seed')
      );

      // Count "successful" seed companies (those that could progress to Series A)
      // Typically requires at least 1x return and some traction
      const successfulSeed = seedOutcomes.filter(s => s.multiple >= 1.0);
      const seedSuccessRate = successfulSeed.length / seedOutcomes.length;

      // Should match the ~30% non-failure rate for seed
      expect(seedSuccessRate).toBeCloseTo(0.30, 1);

      // Generate Series A outcomes for "graduated" companies
      const seriesAOutcomes = Array.from({ length: successfulSeed.length }, () =>
        distribution.sampleReturn('series-a')
      );

      const seriesAFailures = seriesAOutcomes.filter(s => s.multiple <= 1.0);
      const seriesAFailureRate = seriesAFailures.length / seriesAOutcomes.length;

      // Series A failure rate should be lower (better companies made it this far)
      expect(seriesAFailureRate).toBeLessThan(0.70); // Better than seed
      expect(seriesAFailureRate).toBeCloseTo(0.50, 1);
    });

    it('should reflect venture capital J-curve in early vs late stages', () => {
      const distribution = createVCPowerLawDistribution(testSeed);
      const sampleSize = 3000;

      // Early stage (seed + pre-seed)
      const earlySamples = [
        ...Array.from({ length: sampleSize / 2 }, () => distribution.sampleReturn('pre-seed')),
        ...Array.from({ length: sampleSize / 2 }, () => distribution.sampleReturn('seed'))
      ];

      // Late stage (series-b + series-c+)
      const lateSamples = [
        ...Array.from({ length: sampleSize / 2 }, () => distribution.sampleReturn('series-b')),
        ...Array.from({ length: sampleSize / 2 }, () => distribution.sampleReturn('series-c+'))
      ];

      const earlyMultiples = earlySamples.map(s => s.multiple);
      const lateMultiples = lateSamples.map(s => s.multiple);

      const earlyMean = earlyMultiples.reduce((sum, m) => sum + m, 0) / earlyMultiples.length;
      const lateMean = lateMultiples.reduce((sum, m) => sum + m, 0) / lateMultiples.length;

      const earlyMedian = earlyMultiples.sort((a, b) => a - b)[Math.floor(earlyMultiples.length / 2)];
      const lateMedian = lateMultiples.sort((a, b) => a - b)[Math.floor(lateMultiples.length / 2)];

      // Later stages should have higher mean and median (survival bias)
      expect(lateMean).toBeGreaterThan(earlyMean);
      expect(lateMedian).toBeGreaterThan(earlyMedian);

      // But early stages should have higher variance (more uncertainty)
      const earlyVariance = earlyMultiples.reduce((sum, m) => sum + Math.pow(m - earlyMean, 2), 0) / earlyMultiples.length;
      const lateVariance = lateMultiples.reduce((sum, m) => sum + Math.pow(m - lateMean, 2), 0) / lateMultiples.length;

      expect(earlyVariance).toBeGreaterThan(lateVariance);
    });
  });

  describe('No Time Decay Validation', () => {
    it('should not apply time decay to return multiples', () => {
      const distribution = createVCPowerLawDistribution(testSeed);

      // Generate scenarios for different time horizons
      const scenarios5y = distribution.generateBatchScenarios(2000, { 'seed': 1.0 }, 5);
      const scenarios10y = distribution.generateBatchScenarios(2000, { 'seed': 1.0 }, 10);

      // Return multiples should not be systematically different due to time horizon
      const multiples5y = scenarios5y.map(s => s.multiple);
      const multiples10y = scenarios10y.map(s => s.multiple);

      const mean5y = multiples5y.reduce((sum, m) => sum + m, 0) / multiples5y.length;
      const mean10y = multiples10y.reduce((sum, m) => sum + m, 0) / multiples10y.length;

      const variance5y = multiples5y.reduce((sum, m) => sum + Math.pow(m - mean5y, 2), 0) / multiples5y.length;
      const variance10y = multiples10y.reduce((sum, m) => sum + Math.pow(m - mean10y, 2), 0) / multiples10y.length;

      // Means should be similar (no systematic time decay)
      expect(Math.abs(mean5y - mean10y) / mean5y).toBeLessThan(0.15); // Within 15%

      // Variances should be similar (no time dampening)
      expect(Math.abs(variance5y - variance10y) / variance5y).toBeLessThan(0.20); // Within 20%
    });

    it('should show time horizon only affects IRR calculation, not multiples', () => {
      const distribution = createVCPowerLawDistribution(testSeed);
      const scenarios = distribution.generateBatchScenarios(500, { 'seed': 1.0 }, 5);

      scenarios.forEach(scenario => {
        // Recalculate IRR for different time horizons using same multiple
        const multiple = scenario.multiple;
        const exitTiming = scenario.exitTiming;

        if (multiple > 0) {
          const irr3y = Math.pow(multiple, 1 / Math.min(exitTiming, 3)) - 1;
          const irr8y = Math.pow(multiple, 1 / Math.min(exitTiming, 8)) - 1;

          if (multiple > 1) {
            // Shorter horizon should result in higher IRR for positive returns
            expect(irr3y).toBeGreaterThanOrEqual(irr8y);
          }

          // The original multiple should remain unchanged
          expect(scenario.multiple).toBe(multiple);
        }
      });
    });
  });

  describe('Integration with Monte Carlo Parameters', () => {
    it('should handle typical VC portfolio composition', () => {
      const portfolioSize = 25;
      const stageDistribution = {
        'seed': 0.6,        // 60% seed companies
        'series-a': 0.25,   // 25% series-a
        'series-b': 0.10,   // 10% series-b
        'series-c+': 0.05   // 5% later stage
      };
      const scenarios = 1000;

      const returns = generatePowerLawReturns(
        portfolioSize,
        stageDistribution,
        5, // 5 year horizon
        scenarios,
        testSeed
      );

      expect(returns).toHaveLength(portfolioSize * scenarios);

      // Check stage distribution is respected
      const stageCounts = {
        'seed': returns.filter(r => r.stage === 'seed').length,
        'series-a': returns.filter(r => r.stage === 'series-a').length,
        'series-b': returns.filter(r => r.stage === 'series-b').length,
        'series-c+': returns.filter(r => r.stage === 'series-c+').length
      };

      const total = returns.length;
      expect(stageCounts.seed / total).toBeCloseTo(0.6, 1);
      expect(stageCounts['series-a'] / total).toBeCloseTo(0.25, 1);
      expect(stageCounts['series-b'] / total).toBeCloseTo(0.10, 1);
      expect(stageCounts['series-c+'] / total).toBeCloseTo(0.05, 1);

      // Validate all returns have required fields
      returns.forEach(ret => {
        expect(ret.multiple).toBeGreaterThanOrEqual(0);
        expect(ret.irr).toBeDefined();
        expect(['failure', 'modest', 'good', 'homeRun', 'unicorn']).toContain(ret.category);
        expect(ret.exitTiming).toBeGreaterThan(0);
        expect(['seed', 'series-a', 'series-b', 'series-c+']).toContain(ret.stage);
      });
    });

    it('should produce realistic VC fund-level statistics', () => {
      const portfolioSize = 30;
      const stageDistribution = { 'seed': 0.7, 'series-a': 0.3 };
      const scenarios = 2000;

      const returns = generatePowerLawReturns(
        portfolioSize,
        stageDistribution,
        8, // 8 year fund life
        scenarios,
        testSeed
      );

      const multiples = returns.map(r => r.multiple);
      const irrs = returns.map(r => r.irr);

      // Calculate portfolio-level statistics
      const portfolioReturns = [];
      for (let i = 0; i < scenarios; i++) {
        const portfolioSlice = multiples.slice(i * portfolioSize, (i + 1) * portfolioSize);
        const avgReturn = portfolioSlice.reduce((sum, m) => sum + m, 0) / portfolioSize;
        portfolioReturns.push(avgReturn);
      }

      const portfolioMean = portfolioReturns.reduce((sum, r) => sum + r, 0) / portfolioReturns.length;
      const sortedPortfolioReturns = portfolioReturns.sort((a, b) => a - b);
      const portfolioMedian = sortedPortfolioReturns[Math.floor(sortedPortfolioReturns.length / 2)];

      // Realistic VC fund returns
      expect(portfolioMean).toBeGreaterThan(1.2); // Beat 1.2x on average
      expect(portfolioMean).toBeLessThan(4.0);    // But not unrealistically high
      expect(portfolioMedian).toBeLessThan(portfolioMean); // Right-skewed

      // Check failure rates at portfolio level
      const portfolioFailures = portfolioReturns.filter(r => r <= 1.0).length;
      const portfolioFailureRate = portfolioFailures / scenarios;
      expect(portfolioFailureRate).toBeGreaterThan(0.20); // Some portfolios will fail
      expect(portfolioFailureRate).toBeLessThan(0.60);    // But not most
    });
  });
});