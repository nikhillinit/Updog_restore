/**
 * Tests for PowerLawMOIC - Power-law distribution for VC returns
 * Critical invariants:
 * - Calibrated median/P90 match empirical percentiles
 * - Same seed produces identical MOIC sequences
 * - Power-law parameters satisfy alpha > 1 (finite mean)
 * - Heavy tails produce realistic winner-take-most outcomes
 */

import { describe, it, expect } from 'vitest';
import {
  PowerLawMOIC,
  createMOICGenerator,
  calibratePowerLaw,
  samplePowerLaw,
  calculatePercentile,
  calculateMean,
  validatePowerLawParams,
  validateMOICCalibration,
  DEFAULT_SEED_CALIBRATION,
  DEFAULT_LATE_CALIBRATION,
  type MOICCalibration,
  type PowerLawParams,
} from '../../../shared/core/optimization/PowerLawMOIC';
import { SeededRNG } from '../../../shared/core/optimization/SeededRNG';

describe('PowerLawMOIC', () => {
  describe('Validation', () => {
    it('should accept valid MOIC calibration', () => {
      const calibration: MOICCalibration = {
        median: 0.5,
        p90: 5.0,
      };

      expect(() => validateMOICCalibration(calibration)).not.toThrow();
    });

    it('should reject negative median', () => {
      const calibration: MOICCalibration = {
        median: -0.5,
        p90: 5.0,
      };

      expect(() => validateMOICCalibration(calibration)).toThrow(
        'Median MOIC must be non-negative'
      );
    });

    it('should reject negative P90', () => {
      const calibration: MOICCalibration = {
        median: 0.5,
        p90: -1.0,
      };

      expect(() => validateMOICCalibration(calibration)).toThrow('P90 MOIC must be non-negative');
    });

    it('should reject P90 < median', () => {
      const calibration: MOICCalibration = {
        median: 5.0,
        p90: 2.0,
      };

      expect(() => validateMOICCalibration(calibration)).toThrow('P90');
    });

    it('should accept valid power-law parameters', () => {
      const params: PowerLawParams = {
        alpha: 2.5,
        xMin: 0.1,
      };

      expect(() => validatePowerLawParams(params)).not.toThrow();
    });

    it('should reject alpha <= 1', () => {
      const params: PowerLawParams = {
        alpha: 0.9,
        xMin: 0.1,
      };

      expect(() => validatePowerLawParams(params)).toThrow('alpha must be > 1');
    });

    it('should reject negative xMin', () => {
      const params: PowerLawParams = {
        alpha: 2.0,
        xMin: -0.5,
      };

      expect(() => validatePowerLawParams(params)).toThrow('xMin must be non-negative');
    });

    it('should validate default calibrations', () => {
      expect(() => validateMOICCalibration(DEFAULT_SEED_CALIBRATION)).not.toThrow();
      expect(() => validateMOICCalibration(DEFAULT_LATE_CALIBRATION)).not.toThrow();
    });
  });

  describe('calibratePowerLaw()', () => {
    it('should derive alpha and xMin from median/P90', () => {
      const calibration: MOICCalibration = {
        median: 1.0,
        p90: 3.0, // More realistic 3x ratio
      };

      const params = calibratePowerLaw(calibration);

      expect(params.alpha).toBeGreaterThan(1);
      expect(params.xMin).toBeGreaterThan(0);
    });

    it('should produce params that recover calibration targets', () => {
      const calibration: MOICCalibration = {
        median: 1.0,
        p90: 3.0, // Realistic 3x ratio for alpha > 1
      };

      const params = calibratePowerLaw(calibration);

      // Verify median
      const empiricalMedian = calculatePercentile(params, 0.5);
      expect(empiricalMedian).toBeCloseTo(calibration.median, 2);

      // Verify P90
      const empiricalP90 = calculatePercentile(params, 0.9);
      expect(empiricalP90).toBeCloseTo(calibration.p90, 2);
    });

    it('should handle degenerate case (median = P90)', () => {
      const calibration: MOICCalibration = {
        median: 2.0,
        p90: 2.0,
      };

      const params = calibratePowerLaw(calibration);

      expect(params.alpha).toBeGreaterThan(10); // Very high alpha
      expect(params.xMin).toBeCloseTo(2.0, 1);
    });

    it('should produce different alpha for different tail behaviors', () => {
      const lightTail: MOICCalibration = { median: 1.0, p90: 2.0 };
      const heavyTail: MOICCalibration = { median: 1.0, p90: 4.0 };

      const lightParams = calibratePowerLaw(lightTail);
      const heavyParams = calibratePowerLaw(heavyTail);

      // Heavy tail has lower alpha
      expect(heavyParams.alpha).toBeLessThan(lightParams.alpha);
    });
  });

  describe('samplePowerLaw()', () => {
    it('should generate values >= xMin', () => {
      const params: PowerLawParams = { alpha: 2.0, xMin: 0.1 };
      const rng = new SeededRNG(12345);

      const samples = Array.from({ length: 1000 }, () => samplePowerLaw(params, rng));

      samples.forEach((moic) => {
        expect(moic).toBeGreaterThanOrEqual(params.xMin);
      });
    });

    it('should produce reproducible samples with same seed', () => {
      const params: PowerLawParams = { alpha: 2.5, xMin: 0.2 };

      const rng1 = new SeededRNG(999);
      const samples1 = Array.from({ length: 100 }, () => samplePowerLaw(params, rng1));

      const rng2 = new SeededRNG(999);
      const samples2 = Array.from({ length: 100 }, () => samplePowerLaw(params, rng2));

      expect(samples1).toEqual(samples2);
    });

    it('should produce different samples with different seeds', () => {
      const params: PowerLawParams = { alpha: 2.0, xMin: 0.5 };

      const rng1 = new SeededRNG(111);
      const samples1 = Array.from({ length: 100 }, () => samplePowerLaw(params, rng1));

      const rng2 = new SeededRNG(222);
      const samples2 = Array.from({ length: 100 }, () => samplePowerLaw(params, rng2));

      expect(samples1).not.toEqual(samples2);
    });

    it('should exhibit heavy tail (rare large values)', () => {
      const params: PowerLawParams = { alpha: 1.5, xMin: 0.1 }; // Heavy tail
      const rng = new SeededRNG(777);

      const samples = Array.from({ length: 10000 }, () => samplePowerLaw(params, rng));

      // At least one value should be > 100x median
      const median = calculatePercentile(params, 0.5);
      const extremeValues = samples.filter((s) => s > 100 * median);

      expect(extremeValues.length).toBeGreaterThan(0);
    });
  });

  describe('calculatePercentile()', () => {
    it('should return xMin at 0th percentile', () => {
      const params: PowerLawParams = { alpha: 2.0, xMin: 0.5 };

      const p0 = calculatePercentile(params, 0);

      expect(p0).toBeCloseTo(params.xMin, 2);
    });

    it('should calculate median (50th percentile)', () => {
      const params: PowerLawParams = { alpha: 2.0, xMin: 1.0 };

      const median = calculatePercentile(params, 0.5);

      // For alpha=2, median = xMin * 2^(1/2) = xMin * sqrt(2)
      expect(median).toBeCloseTo(1.0 * Math.pow(2, 1 / 2.0), 2);
    });

    it('should calculate P90 (90th percentile)', () => {
      const params: PowerLawParams = { alpha: 3.0, xMin: 0.5 };

      const p90 = calculatePercentile(params, 0.9);

      // P90 = xMin * 10^(1/alpha)
      expect(p90).toBeCloseTo(0.5 * Math.pow(10, 1 / 3.0), 2);
    });

    it('should reject percentile out of bounds', () => {
      const params: PowerLawParams = { alpha: 2.0, xMin: 1.0 };

      expect(() => calculatePercentile(params, -0.1)).toThrow('Percentile must be in [0, 1]');
      expect(() => calculatePercentile(params, 1.5)).toThrow('Percentile must be in [0, 1]');
    });

    it('should produce increasing values for increasing percentiles', () => {
      const params: PowerLawParams = { alpha: 2.5, xMin: 0.3 };

      const p25 = calculatePercentile(params, 0.25);
      const p50 = calculatePercentile(params, 0.5);
      const p75 = calculatePercentile(params, 0.75);
      const p90 = calculatePercentile(params, 0.9);

      expect(p50).toBeGreaterThan(p25);
      expect(p75).toBeGreaterThan(p50);
      expect(p90).toBeGreaterThan(p75);
    });
  });

  describe('calculateMean()', () => {
    it('should calculate mean from power-law formula', () => {
      const params: PowerLawParams = { alpha: 2.0, xMin: 1.0 };

      const mean = calculateMean(params);

      // Mean = alpha * xMin / (alpha - 1) = 2 * 1 / 1 = 2
      expect(mean).toBeCloseTo(2.0, 2);
    });

    it('should have higher mean for higher xMin', () => {
      const params1: PowerLawParams = { alpha: 2.0, xMin: 1.0 };
      const params2: PowerLawParams = { alpha: 2.0, xMin: 2.0 };

      const mean1 = calculateMean(params1);
      const mean2 = calculateMean(params2);

      expect(mean2).toBeGreaterThan(mean1);
    });

    it('should have higher mean for lower alpha (heavier tail)', () => {
      const params1: PowerLawParams = { alpha: 3.0, xMin: 1.0 };
      const params2: PowerLawParams = { alpha: 1.5, xMin: 1.0 };

      const mean1 = calculateMean(params1);
      const mean2 = calculateMean(params2);

      // Lower alpha → heavier tail → higher mean
      expect(mean2).toBeGreaterThan(mean1);
    });
  });

  describe('PowerLawMOIC class', () => {
    it('should construct from calibration', () => {
      const calibration: MOICCalibration = { median: 0.8, p90: 4.0 };

      const generator = new PowerLawMOIC(calibration);

      expect(generator.getCalibration()).toEqual(calibration);
      expect(generator.getParams().alpha).toBeGreaterThan(1);
    });

    it('should construct from factory function', () => {
      const calibration: MOICCalibration = { median: 1.0, p90: 3.0 };

      const generator = createMOICGenerator(calibration);

      expect(generator.getCalibration()).toEqual(calibration);
    });

    it('should construct from raw parameters', () => {
      const params: PowerLawParams = { alpha: 2.5, xMin: 0.5 };

      const generator = PowerLawMOIC.fromParams(params);

      expect(generator.getParams()).toEqual(params);
    });

    it('should sample with reproducibility', () => {
      const generator = createMOICGenerator({ median: 0.8, p90: 4.0 });

      const rng1 = new SeededRNG(123);
      const samples1 = Array.from({ length: 100 }, () => generator.sample(rng1));

      const rng2 = new SeededRNG(123);
      const samples2 = Array.from({ length: 100 }, () => generator.sample(rng2));

      expect(samples1).toEqual(samples2);
    });

    it('should provide percentile calculations', () => {
      const generator = createMOICGenerator({ median: 1.0, p90: 3.0 });

      const median = generator.percentile(0.5);
      const p90 = generator.percentile(0.9);

      expect(median).toBeCloseTo(1.0, 1);
      expect(p90).toBeCloseTo(10.0, 1);
    });

    it('should calculate mean', () => {
      const generator = createMOICGenerator({ median: 0.8, p90: 4.0 });

      const mean = generator.mean();

      expect(mean).toBeGreaterThan(0);
      expect(mean).toBeGreaterThan(generator.getCalibration().median); // Mean > median for right-skewed
    });
  });

  describe('Empirical Calibration - Critical Invariant', () => {
    it('should match calibrated median empirically', () => {
      const calibration: MOICCalibration = { median: 1.0, p90: 3.0 };
      const generator = createMOICGenerator(calibration);
      const rng = new SeededRNG(999);

      const numSamples = 10000;
      const samples = Array.from({ length: numSamples }, () => generator.sample(rng));

      // Sort to find empirical median
      samples.sort((a, b) => a - b);
      const empiricalMedian = samples[Math.floor(numSamples * 0.5)];

      // Should match calibration within 10%
      const relativeError = Math.abs(empiricalMedian - calibration.median) / calibration.median;
      expect(relativeError).toBeLessThan(0.1);
    });

    it('should match calibrated P90 empirically', () => {
      const calibration: MOICCalibration = { median: 0.8, p90: 4.0 };
      const generator = createMOICGenerator(calibration);
      const rng = new SeededRNG(777);

      const numSamples = 10000;
      const samples = Array.from({ length: numSamples }, () => generator.sample(rng));

      // Sort to find empirical P90
      samples.sort((a, b) => a - b);
      const empiricalP90 = samples[Math.floor(numSamples * 0.9)];

      // Should match calibration within 10%
      const relativeError = Math.abs(empiricalP90 - calibration.p90) / calibration.p90;
      expect(relativeError).toBeLessThan(0.1);
    });

    it('should produce right-skewed distribution (mean > median)', () => {
      const calibration: MOICCalibration = { median: 1.0, p90: 3.0 };
      const generator = createMOICGenerator(calibration);
      const rng = new SeededRNG(555);

      const numSamples = 10000;
      const samples = Array.from({ length: numSamples }, () => generator.sample(rng));

      const empiricalMean = samples.reduce((sum, s) => sum + s, 0) / samples.length;

      // Mean > median for right-skewed distribution
      expect(empiricalMean).toBeGreaterThan(calibration.median);
    });
  });

  describe('Realistic VC Returns - Design Validation', () => {
    it('should produce winner-take-most outcomes', () => {
      const calibration: MOICCalibration = { median: 0.8, p90: 4.0 }; // Seed-stage
      const generator = createMOICGenerator(calibration);
      const rng = new SeededRNG(12345);

      const numInvestments = 100;
      const returns = Array.from({ length: numInvestments }, () => generator.sample(rng));

      // Sort descending
      returns.sort((a, b) => b - a);

      // Top 10% should contribute disproportionate share of total returns
      const top10Returns = returns.slice(0, 10).reduce((sum, r) => sum + r, 0);
      const totalReturns = returns.reduce((sum, r) => sum + r, 0);
      const top10Share = top10Returns / totalReturns;

      // Top 10% should contribute > 50% of returns (power law)
      expect(top10Share).toBeGreaterThan(0.5);
    });

    it('should show seed-stage has heavier tail than late-stage', () => {
      const seedGenerator = createMOICGenerator(DEFAULT_SEED_CALIBRATION);
      const lateGenerator = createMOICGenerator(DEFAULT_LATE_CALIBRATION);

      // Seed should have lower alpha (heavier tail)
      const seedAlpha = seedGenerator.getParams().alpha;
      const lateAlpha = lateGenerator.getParams().alpha;

      expect(seedAlpha).toBeLessThan(lateAlpha);
    });

    it('should produce realistic failure rates (MOIC < 1x)', () => {
      const calibration: MOICCalibration = { median: 0.8, p90: 4.0 };
      const generator = createMOICGenerator(calibration);
      const rng = new SeededRNG(666);

      const numInvestments = 10000;
      const returns = Array.from({ length: numInvestments }, () => generator.sample(rng));

      const failures = returns.filter((r) => r < 1.0).length;
      const failureRate = failures / numInvestments;

      // With median = 0.5, failure rate should be ~50%
      expect(failureRate).toBeGreaterThan(0.4);
      expect(failureRate).toBeLessThan(0.6);
    });

    it('should produce rare unicorns (MOIC > 20x)', () => {
      const calibration: MOICCalibration = { median: 0.8, p90: 4.0 };
      const generator = createMOICGenerator(calibration);
      const rng = new SeededRNG(888);

      const numInvestments = 10000;
      const returns = Array.from({ length: numInvestments }, () => generator.sample(rng));

      const unicorns = returns.filter((r) => r > 20).length;

      // Should see at least a few unicorns (rare but not impossible)
      expect(unicorns).toBeGreaterThan(0);
      expect(unicorns).toBeLessThan(numInvestments * 0.02); // < 2%
    });
  });

  describe('Default Calibrations', () => {
    it('should have seed-stage median < late-stage median', () => {
      expect(DEFAULT_SEED_CALIBRATION.median).toBeLessThan(DEFAULT_LATE_CALIBRATION.median);
    });

    it('should have seed-stage P90 > late-stage P90 (higher upside)', () => {
      expect(DEFAULT_SEED_CALIBRATION.p90).toBeGreaterThan(DEFAULT_LATE_CALIBRATION.p90);
    });

    it('should produce valid generators from defaults', () => {
      expect(() => createMOICGenerator(DEFAULT_SEED_CALIBRATION)).not.toThrow();
      expect(() => createMOICGenerator(DEFAULT_LATE_CALIBRATION)).not.toThrow();
    });
  });

  describe('Performance', () => {
    it('should generate 10k samples quickly', () => {
      const generator = createMOICGenerator({ median: 1.0, p90: 3.0 });
      const rng = new SeededRNG(12345);

      const start = Date.now();
      for (let i = 0; i < 10000; i++) {
        generator.sample(rng);
      }
      const elapsed = Date.now() - start;

      // Should complete in < 100ms
      expect(elapsed).toBeLessThan(100);
    });
  });
});
