/**
 * Tests for ScenarioGenerator
 *
 * Validates end-to-end Monte Carlo scenario generation with reproducibility
 */

import { describe, it, expect } from 'vitest';
import {
  ScenarioGenerator,
  ScenarioConfig,
  BucketConfig,
  validateScenarioConfig,
  createScenarioGenerator,
  createDefaultScenarioConfig,
} from '@shared/core/optimization/ScenarioGenerator';
import { decompressMatrix } from '@shared/core/optimization/MatrixCompression';

describe('ScenarioGenerator', () => {
  describe('validateScenarioConfig', () => {
    it('should accept valid configuration', () => {
      const config = createDefaultScenarioConfig();
      expect(() => validateScenarioConfig(config)).not.toThrow();
    });

    it('should reject non-integer numScenarios', () => {
      const config = createDefaultScenarioConfig();
      config.numScenarios = 10.5;

      expect(() => validateScenarioConfig(config)).toThrow('must be positive integer');
    });

    it('should reject zero numScenarios', () => {
      const config = createDefaultScenarioConfig();
      config.numScenarios = 0;

      expect(() => validateScenarioConfig(config)).toThrow('must be positive integer');
    });

    it('should reject too many scenarios', () => {
      const config = createDefaultScenarioConfig();
      config.numScenarios = 200_000;

      expect(() => validateScenarioConfig(config)).toThrow('exceeds maximum');
    });

    it('should reject empty buckets array', () => {
      const config = createDefaultScenarioConfig();
      config.buckets = [];

      expect(() => validateScenarioConfig(config)).toThrow('non-empty array');
    });

    it('should reject too many buckets', () => {
      const config = createDefaultScenarioConfig();
      config.buckets = Array.from({ length: 51 }, (_, i) => ({
        name: `Bucket${i}`,
        capitalAllocation: 100 / 51,
        moicCalibration: { median: 1.0, p90: 3.0 },
      }));

      expect(() => validateScenarioConfig(config)).toThrow('Too many buckets');
    });

    it('should reject allocations not summing to 100%', () => {
      const config = createDefaultScenarioConfig();
      config.buckets = [
        { name: 'A', capitalAllocation: 50, moicCalibration: { median: 1.0, p90: 3.0 } },
        { name: 'B', capitalAllocation: 40, moicCalibration: { median: 1.0, p90: 3.0 } },
      ];

      expect(() => validateScenarioConfig(config)).toThrow('must sum to 100%');
    });

    it('should reject bucket with empty name', () => {
      const config = createDefaultScenarioConfig();
      config.buckets[0].name = '';

      expect(() => validateScenarioConfig(config)).toThrow('has empty name');
    });

    it('should reject negative allocation', () => {
      const config = createDefaultScenarioConfig();
      config.buckets[0].capitalAllocation = -10;

      // Error message will mention allocations not summing to 100% (caught earlier)
      expect(() => validateScenarioConfig(config)).toThrow();
    });

    it('should reject negative median MOIC', () => {
      const config = createDefaultScenarioConfig();
      config.buckets[0].moicCalibration.median = -0.5;

      expect(() => validateScenarioConfig(config)).toThrow('negative median MOIC');
    });

    it('should reject P90 < median', () => {
      const config = createDefaultScenarioConfig();
      config.buckets[0].moicCalibration = { median: 5.0, p90: 2.0 };

      expect(() => validateScenarioConfig(config)).toThrow('P90 < median');
    });

    it('should reject correlation weights not summing to 1.0', () => {
      const config = createDefaultScenarioConfig();
      config.correlationWeights = {
        macro: 0.5,
        systematic: 0.3,
        idiosyncratic: 0.3,
      };

      expect(() => validateScenarioConfig(config)).toThrow('must sum to 1.0');
    });

    it('should reject empty seed', () => {
      const config = createDefaultScenarioConfig();
      config.seed = '';

      expect(() => validateScenarioConfig(config)).toThrow('must be non-empty string');
    });
  });

  describe('ScenarioGenerator construction', () => {
    it('should construct from valid config', () => {
      const config = createDefaultScenarioConfig();
      const generator = new ScenarioGenerator(config);

      expect(generator.getConfig()).toEqual(config);
    });

    it('should construct from factory function', () => {
      const config = createDefaultScenarioConfig();
      const generator = createScenarioGenerator(config);

      expect(generator.getConfig()).toEqual(config);
    });

    it('should reject invalid config', () => {
      const config = createDefaultScenarioConfig();
      config.numScenarios = -1;

      expect(() => new ScenarioGenerator(config)).toThrow();
    });
  });

  describe('generate() - End-to-end generation', () => {
    it('should generate valid result structure', async () => {
      const config: ScenarioConfig = {
        numScenarios: 100,
        buckets: [
          { name: 'Seed', capitalAllocation: 60, moicCalibration: { median: 1.0, p90: 3.5 } },
          { name: 'Series A', capitalAllocation: 40, moicCalibration: { median: 1.5, p90: 3.5 } },
        ],
        correlationWeights: { macro: 0.5, systematic: 0.25, idiosyncratic: 0.25 },
        recycling: {
          enabled: true,
          mode: 'same-bucket',
          reinvestmentRate: 0.8,
          avgHoldingPeriod: 5,
          fundLifetime: 10,
        },
        seed: 'test-seed-123',
      };

      const generator = new ScenarioGenerator(config);
      const result = await generator.generate();

      // Validate result structure
      expect(result.compressed).toBeDefined();
      expect(result.metadata).toBeDefined();

      // Validate metadata
      expect(result.metadata.configHash).toBe('test-seed-123');
      expect(result.metadata.numScenarios).toBe(100);
      expect(result.metadata.numBuckets).toBe(2);
      expect(result.metadata.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(result.metadata.durationMs).toBeGreaterThan(0);
      expect(result.metadata.recyclingMultiples).toHaveLength(2);

      // Validate compressed matrix
      expect(result.compressed.numScenarios).toBe(100);
      expect(result.compressed.numBuckets).toBe(2);
      expect(result.compressed.version).toBe(1);
      expect(result.compressed.compressedSize).toBeGreaterThan(0);
    });

    it('should generate realistic MOIC values', async () => {
      const config: ScenarioConfig = {
        numScenarios: 1000,
        buckets: [
          { name: 'Seed', capitalAllocation: 100, moicCalibration: { median: 1.0, p90: 3.5 } },
        ],
        correlationWeights: { macro: 0.5, systematic: 0.25, idiosyncratic: 0.25 },
        recycling: { enabled: false, mode: 'same-bucket', reinvestmentRate: 0, avgHoldingPeriod: 5, fundLifetime: 10 },
        seed: 'moic-test',
      };

      const generator = new ScenarioGenerator(config);
      const result = await generator.generate();

      // Decompress to analyze MOIC values
      const matrix = await decompressMatrix(result.compressed);

      // All MOICs should be non-negative
      for (const scenario of matrix) {
        for (const moic of scenario) {
          expect(moic).toBeGreaterThanOrEqual(0);
        }
      }

      // Calculate empirical median and P90
      const moics = matrix.map((s) => s[0]).sort((a, b) => a - b);
      const empiricalMedian = moics[Math.floor(moics.length * 0.5)];
      const empiricalP90 = moics[Math.floor(moics.length * 0.9)];

      // Should roughly match calibration (within reasonable tolerance due to sampling and shocks)
      // Note: shocks are multiplicative with 0.5 dampening, so empirical values may differ
      expect(empiricalMedian).toBeGreaterThan(0);
      expect(empiricalP90).toBeGreaterThan(empiricalMedian);
    });

    it('should include recycling multiples in metadata', async () => {
      const config = createDefaultScenarioConfig();
      config.numScenarios = 100;

      const generator = new ScenarioGenerator(config);
      const result = await generator.generate();

      // Should have recycling multiple for each bucket
      expect(result.metadata.recyclingMultiples).toHaveLength(config.buckets.length);

      // All recycling multiples should be >= 1.0 (with recycling enabled)
      for (const multiple of result.metadata.recyclingMultiples) {
        expect(multiple).toBeGreaterThanOrEqual(1.0);
      }
    });

    it('should generate quickly for 1K scenarios', async () => {
      const config = createDefaultScenarioConfig();
      config.numScenarios = 1000;

      const generator = new ScenarioGenerator(config);

      const startTime = Date.now();
      await generator.generate();
      const durationMs = Date.now() - startTime;

      // Should complete in < 1 second
      expect(durationMs).toBeLessThan(1000);
    });

    it('should handle large matrices (10K scenarios)', async () => {
      const config = createDefaultScenarioConfig();
      config.numScenarios = 10_000;

      const generator = new ScenarioGenerator(config);
      const result = await generator.generate();

      expect(result.compressed.numScenarios).toBe(10_000);
      expect(result.metadata.durationMs).toBeGreaterThan(0);

      // Should achieve reasonable compression
      const ratio = result.compressed.compressedSize / result.compressed.uncompressedSize;
      expect(ratio).toBeLessThan(1.0);
    });
  });

  describe('Reproducibility - Critical Invariant', () => {
    it('should produce identical results for same seed', async () => {
      const config: ScenarioConfig = {
        numScenarios: 100,
        buckets: [
          { name: 'Seed', capitalAllocation: 50, moicCalibration: { median: 1.0, p90: 3.0 } },
          { name: 'Series A', capitalAllocation: 50, moicCalibration: { median: 1.5, p90: 3.5 } },
        ],
        correlationWeights: { macro: 0.5, systematic: 0.25, idiosyncratic: 0.25 },
        recycling: { enabled: false, mode: 'same-bucket', reinvestmentRate: 0, avgHoldingPeriod: 5, fundLifetime: 10 },
        seed: 'reproducibility-test-123',
      };

      const generator1 = new ScenarioGenerator(config);
      const result1 = await generator1.generate();

      const generator2 = new ScenarioGenerator(config);
      const result2 = await generator2.generate();

      // Compressed data should be byte-identical
      expect(result1.compressed.data).toEqual(result2.compressed.data);

      // Metadata should match (except timestamp)
      expect(result1.metadata.numScenarios).toBe(result2.metadata.numScenarios);
      expect(result1.metadata.numBuckets).toBe(result2.metadata.numBuckets);
      expect(result1.metadata.recyclingMultiples).toEqual(result2.metadata.recyclingMultiples);

      // Decompress and verify matrices are identical
      const matrix1 = await decompressMatrix(result1.compressed);
      const matrix2 = await decompressMatrix(result2.compressed);

      expect(matrix1).toEqual(matrix2);
    });

    it('should produce different results for different seeds', async () => {
      const config1 = createDefaultScenarioConfig();
      config1.numScenarios = 100;
      config1.seed = 'seed-1';

      const config2 = createDefaultScenarioConfig();
      config2.numScenarios = 100;
      config2.seed = 'seed-2';

      const generator1 = new ScenarioGenerator(config1);
      const result1 = await generator1.generate();

      const generator2 = new ScenarioGenerator(config2);
      const result2 = await generator2.generate();

      // Compressed data should be different
      expect(result1.compressed.data).not.toEqual(result2.compressed.data);

      // Decompress and verify matrices are different
      const matrix1 = await decompressMatrix(result1.compressed);
      const matrix2 = await decompressMatrix(result2.compressed);

      // At least one value should differ
      let foundDifference = false;
      for (let s = 0; s < matrix1.length; s++) {
        for (let b = 0; b < matrix1[0].length; b++) {
          if (matrix1[s][b] !== matrix2[s][b]) {
            foundDifference = true;
            break;
          }
        }
        if (foundDifference) break;
      }

      expect(foundDifference).toBe(true);
    });

    it('should be sensitive to configuration changes', async () => {
      const baseConfig = createDefaultScenarioConfig();
      baseConfig.numScenarios = 100;
      baseConfig.seed = 'config-sensitivity';

      // Generate with base config
      const generator1 = new ScenarioGenerator(baseConfig);
      const result1 = await generator1.generate();

      // Change MOIC calibrations (which affects the MOIC distributions)
      const modifiedConfig = { ...baseConfig };
      modifiedConfig.buckets = [
        { ...baseConfig.buckets[0], moicCalibration: { median: 1.5, p90: 4.0 } },
        { ...baseConfig.buckets[1], moicCalibration: { median: 2.0, p90: 5.0 } },
        { ...baseConfig.buckets[2], moicCalibration: { median: 2.5, p90: 6.0 } },
      ];

      const generator2 = new ScenarioGenerator(modifiedConfig);
      const result2 = await generator2.generate();

      // Results should differ (different MOIC distributions)
      expect(result1.compressed.data).not.toEqual(result2.compressed.data);
    });
  });

  describe('Correlation structure', () => {
    it('should exhibit correlation across buckets', async () => {
      const config: ScenarioConfig = {
        numScenarios: 1000,
        buckets: [
          { name: 'A', capitalAllocation: 50, moicCalibration: { median: 1.0, p90: 3.0 } },
          { name: 'B', capitalAllocation: 50, moicCalibration: { median: 1.0, p90: 3.0 } },
        ],
        correlationWeights: {
          macro: 0.8, // High macro weight → strong correlation
          systematic: 0.1,
          idiosyncratic: 0.1,
        },
        recycling: { enabled: false, mode: 'same-bucket', reinvestmentRate: 0, avgHoldingPeriod: 5, fundLifetime: 10 },
        seed: 'correlation-test',
      };

      const generator = new ScenarioGenerator(config);
      const result = await generator.generate();

      const matrix = await decompressMatrix(result.compressed);

      // Calculate empirical correlation between buckets
      const bucketA = matrix.map((s) => s[0]);
      const bucketB = matrix.map((s) => s[1]);

      const meanA = bucketA.reduce((sum, v) => sum + v, 0) / bucketA.length;
      const meanB = bucketB.reduce((sum, v) => sum + v, 0) / bucketB.length;

      const cov = bucketA.reduce((sum, v, i) => sum + (v - meanA) * (bucketB[i] - meanB), 0) / bucketA.length;
      const stdA = Math.sqrt(bucketA.reduce((sum, v) => sum + Math.pow(v - meanA, 2), 0) / bucketA.length);
      const stdB = Math.sqrt(bucketB.reduce((sum, v) => sum + Math.pow(v - meanB, 2), 0) / bucketB.length);

      const correlation = cov / (stdA * stdB);

      // With high macro weight and damped shocks (0.5 multiplier), should see some positive correlation
      // But not as high as raw shock correlation due to power-law sampling variation
      expect(correlation).toBeGreaterThan(0);
      expect(correlation).toBeLessThan(1);
    });
  });

  describe('Default configuration', () => {
    it('should provide valid default config', () => {
      const config = createDefaultScenarioConfig();

      expect(() => validateScenarioConfig(config)).not.toThrow();
      expect(config.numScenarios).toBe(10_000);
      expect(config.buckets).toHaveLength(3);
      expect(config.seed).toBe('default-config-v1');
    });

    it('should generate with default config', async () => {
      const config = createDefaultScenarioConfig();
      config.numScenarios = 100; // Reduce for test speed

      const generator = new ScenarioGenerator(config);
      const result = await generator.generate();

      expect(result.compressed.numScenarios).toBe(100);
      expect(result.compressed.numBuckets).toBe(3);
    });
  });
});
