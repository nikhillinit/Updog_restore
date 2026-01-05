/**
 * Tests for MatrixCompression
 *
 * Validates Float32Array + zlib compression for MOIC scenario matrices
 */

import { describe, it, expect } from 'vitest';
import type { CompressedMatrix } from '@shared/core/optimization/MatrixCompression';
import {
  validateMatrixDimensions,
  validateMOICValues,
  matrixToFloat32,
  float32ToMatrix,
  compressMatrix,
  decompressMatrix,
  compressionRatio,
  formatCompressionStats,
  serializeCompressedMatrix,
  deserializeCompressedMatrix,
} from '@shared/core/optimization/MatrixCompression';

describe('MatrixCompression', () => {
  describe('validateMatrixDimensions', () => {
    it('should accept valid dimensions', () => {
      expect(() => validateMatrixDimensions(1000, 5)).not.toThrow();
      expect(() => validateMatrixDimensions(10000, 10)).not.toThrow();
    });

    it('should reject non-integer scenarios', () => {
      expect(() => validateMatrixDimensions(10.5, 5)).toThrow('must be positive integer');
    });

    it('should reject non-integer buckets', () => {
      expect(() => validateMatrixDimensions(10, 5.5)).toThrow('must be positive integer');
    });

    it('should reject zero scenarios', () => {
      expect(() => validateMatrixDimensions(0, 5)).toThrow('must be positive integer');
    });

    it('should reject negative scenarios', () => {
      expect(() => validateMatrixDimensions(-10, 5)).toThrow('must be positive integer');
    });

    it('should reject absurdly large matrices', () => {
      expect(() => validateMatrixDimensions(100_000, 2000)).toThrow('Matrix too large');
    });
  });

  describe('validateMOICValues', () => {
    it('should accept valid MOIC values', () => {
      const matrix = [
        [0.5, 1.0, 2.5],
        [0.0, 3.5, 10.0],
      ];

      expect(() => validateMOICValues(matrix)).not.toThrow();
    });

    it('should reject non-array scenario', () => {
      const matrix = [null as any, [1.0, 2.0]];

      expect(() => validateMOICValues(matrix)).toThrow('Scenario 0 is not an array');
    });

    it('should reject infinite MOIC', () => {
      const matrix = [
        [1.0, Infinity],
        [2.0, 3.0],
      ];

      expect(() => validateMOICValues(matrix)).toThrow('must be finite');
    });

    it('should reject NaN MOIC', () => {
      const matrix = [
        [1.0, 2.0],
        [NaN, 3.0],
      ];

      expect(() => validateMOICValues(matrix)).toThrow('must be finite');
    });

    it('should reject negative MOIC', () => {
      const matrix = [
        [1.0, 2.0],
        [3.0, -1.5],
      ];

      expect(() => validateMOICValues(matrix)).toThrow('must be non-negative');
    });
  });

  describe('matrixToFloat32', () => {
    it('should convert 2D matrix to Float32Array', () => {
      const matrix = [
        [1.0, 2.0, 3.0],
        [4.0, 5.0, 6.0],
      ];

      const flat = matrixToFloat32(matrix);

      expect(flat).toBeInstanceOf(Float32Array);
      expect(flat.length).toBe(6);
      expect(Array.from(flat)).toEqual([1.0, 2.0, 3.0, 4.0, 5.0, 6.0]);
    });

    it('should handle single scenario', () => {
      const matrix = [[1.5, 2.5, 3.5]];

      const flat = matrixToFloat32(matrix);

      expect(flat.length).toBe(3);
      expect(Array.from(flat)).toEqual([1.5, 2.5, 3.5]);
    });

    it('should handle single bucket', () => {
      const matrix = [[1.0], [2.0], [3.0]];

      const flat = matrixToFloat32(matrix);

      expect(flat.length).toBe(3);
      expect(Array.from(flat)).toEqual([1.0, 2.0, 3.0]);
    });

    it('should reject empty matrix', () => {
      expect(() => matrixToFloat32([])).toThrow('non-empty 2D array');
    });

    it('should reject inconsistent row lengths', () => {
      const matrix = [
        [1.0, 2.0, 3.0],
        [4.0, 5.0], // Wrong length
      ];

      expect(() => matrixToFloat32(matrix)).toThrow('Inconsistent row length');
    });

    it('should preserve Float32 precision', () => {
      const matrix = [[1.123456789, 2.987654321]];

      const flat = matrixToFloat32(matrix);

      // Float32 has ~6-7 decimal digits of precision
      expect(flat[0]).toBeCloseTo(1.123457, 5);
      expect(flat[1]).toBeCloseTo(2.987654, 5);
    });
  });

  describe('float32ToMatrix', () => {
    it('should convert Float32Array back to 2D matrix', () => {
      const flat = new Float32Array([1.0, 2.0, 3.0, 4.0, 5.0, 6.0]);

      const matrix = float32ToMatrix(flat, 2, 3);

      expect(matrix).toEqual([
        [1.0, 2.0, 3.0],
        [4.0, 5.0, 6.0],
      ]);
    });

    it('should handle single scenario', () => {
      const flat = new Float32Array([1.5, 2.5, 3.5]);

      const matrix = float32ToMatrix(flat, 1, 3);

      expect(matrix).toEqual([[1.5, 2.5, 3.5]]);
    });

    it('should handle single bucket', () => {
      const flat = new Float32Array([1.0, 2.0, 3.0]);

      const matrix = float32ToMatrix(flat, 3, 1);

      expect(matrix).toEqual([[1.0], [2.0], [3.0]]);
    });

    it('should reject length mismatch', () => {
      const flat = new Float32Array([1.0, 2.0, 3.0]);

      expect(() => float32ToMatrix(flat, 2, 3)).toThrow('length mismatch');
    });
  });

  describe('Round-trip conversion', () => {
    it('should preserve values through Float32 conversion', () => {
      const original = [
        [0.5, 1.0, 2.5, 5.0],
        [0.0, 3.5, 10.0, 0.1],
        [1.5, 2.0, 3.0, 4.0],
      ];

      const flat = matrixToFloat32(original);
      const restored = float32ToMatrix(flat, 3, 4);

      // Values should match within Float32 precision
      for (let s = 0; s < 3; s++) {
        for (let b = 0; b < 4; b++) {
          expect(restored[s][b]).toBeCloseTo(original[s][b], 5);
        }
      }
    });

    it('should handle large matrices', () => {
      const numScenarios = 1000;
      const numBuckets = 5;

      // Generate large matrix
      const original: number[][] = [];
      for (let s = 0; s < numScenarios; s++) {
        const scenario: number[] = [];
        for (let b = 0; b < numBuckets; b++) {
          scenario.push(Math.random() * 10);
        }
        original.push(scenario);
      }

      const flat = matrixToFloat32(original);
      const restored = float32ToMatrix(flat, numScenarios, numBuckets);

      // Values should match within Float32 precision
      for (let s = 0; s < numScenarios; s++) {
        for (let b = 0; b < numBuckets; b++) {
          expect(restored[s][b]).toBeCloseTo(original[s][b], 5);
        }
      }
    });
  });

  describe('compressMatrix', () => {
    it('should compress small matrix', async () => {
      const matrix = [
        [1.0, 2.0, 3.0],
        [4.0, 5.0, 6.0],
      ];

      const compressed = await compressMatrix(matrix);

      expect(compressed.numScenarios).toBe(2);
      expect(compressed.numBuckets).toBe(3);
      expect(compressed.version).toBe(1);
      expect(compressed.uncompressedSize).toBe(24); // 6 floats × 4 bytes
      expect(compressed.compressedSize).toBeGreaterThan(0);
      // Small matrices may not compress due to zlib overhead
      // Just verify compression ran successfully
    });

    it('should compress realistic VC matrix', async () => {
      // 100 scenarios × 5 buckets
      const numScenarios = 100;
      const numBuckets = 5;

      const matrix: number[][] = [];
      for (let s = 0; s < numScenarios; s++) {
        const scenario: number[] = [];
        for (let b = 0; b < numBuckets; b++) {
          // Realistic MOIC values: 0.5 to 5.0
          scenario.push(Math.random() * 4.5 + 0.5);
        }
        matrix.push(scenario);
      }

      const compressed = await compressMatrix(matrix);

      expect(compressed.numScenarios).toBe(100);
      expect(compressed.numBuckets).toBe(5);
      expect(compressed.uncompressedSize).toBe(2000); // 500 floats × 4 bytes

      // Random data doesn't compress as well as structured data
      // Should still achieve some compression
      expect(compressed.compressedSize).toBeLessThan(compressed.uncompressedSize);
    });

    it('should compress large matrix efficiently', async () => {
      // 10,000 scenarios × 5 buckets = 50,000 floats
      const numScenarios = 10_000;
      const numBuckets = 5;

      const matrix: number[][] = [];
      for (let s = 0; s < numScenarios; s++) {
        const scenario: number[] = [];
        for (let b = 0; b < numBuckets; b++) {
          scenario.push(Math.random() * 10);
        }
        matrix.push(scenario);
      }

      const startTime = Date.now();
      const compressed = await compressMatrix(matrix);
      const duration = Date.now() - startTime;

      expect(compressed.numScenarios).toBe(10_000);
      expect(compressed.numBuckets).toBe(5);
      expect(compressed.uncompressedSize).toBe(200_000); // 50K floats × 4 bytes

      // Performance: should compress in <100ms
      expect(duration).toBeLessThan(100);

      // Random data has high entropy, doesn't compress well
      // But should still achieve some compression
      const ratio = compressed.compressedSize / compressed.uncompressedSize;
      expect(ratio).toBeLessThan(1.0); // Some compression achieved
    });

    it('should reject empty matrix', async () => {
      await expect(compressMatrix([])).rejects.toThrow('non-empty 2D array');
    });
  });

  describe('decompressMatrix', () => {
    it('should decompress matrix correctly', async () => {
      const original = [
        [1.0, 2.0, 3.0],
        [4.0, 5.0, 6.0],
      ];

      const compressed = await compressMatrix(original);
      const restored = await decompressMatrix(compressed);

      expect(restored).toEqual(original);
    });

    it('should handle realistic VC matrix', async () => {
      const numScenarios = 100;
      const numBuckets = 5;

      const original: number[][] = [];
      for (let s = 0; s < numScenarios; s++) {
        const scenario: number[] = [];
        for (let b = 0; b < numBuckets; b++) {
          scenario.push(Math.random() * 4.5 + 0.5);
        }
        original.push(scenario);
      }

      const compressed = await compressMatrix(original);
      const restored = await decompressMatrix(compressed);

      expect(restored.length).toBe(numScenarios);
      expect(restored[0].length).toBe(numBuckets);

      // Values should match within Float32 precision
      for (let s = 0; s < numScenarios; s++) {
        for (let b = 0; b < numBuckets; b++) {
          expect(restored[s][b]).toBeCloseTo(original[s][b], 5);
        }
      }
    });

    it('should decompress large matrix efficiently', async () => {
      const numScenarios = 10_000;
      const numBuckets = 5;

      const original: number[][] = [];
      for (let s = 0; s < numScenarios; s++) {
        const scenario: number[] = [];
        for (let b = 0; b < numBuckets; b++) {
          scenario.push(Math.random() * 10);
        }
        original.push(scenario);
      }

      const compressed = await compressMatrix(original);

      const startTime = Date.now();
      const restored = await decompressMatrix(compressed);
      const duration = Date.now() - startTime;

      expect(restored.length).toBe(numScenarios);

      // Performance: should decompress in <50ms
      expect(duration).toBeLessThan(50);
    });

    it('should reject unsupported version', async () => {
      const compressed: CompressedMatrix = {
        data: new Uint8Array([]),
        numScenarios: 2,
        numBuckets: 3,
        version: 99 as 1,
        uncompressedSize: 24,
        compressedSize: 10,
      };

      await expect(decompressMatrix(compressed)).rejects.toThrow('Unsupported compression version');
    });
  });

  describe('compressionRatio', () => {
    it('should calculate correct ratio', () => {
      const compressed: CompressedMatrix = {
        data: new Uint8Array([]),
        numScenarios: 10,
        numBuckets: 5,
        version: 1,
        uncompressedSize: 1000,
        compressedSize: 120,
      };

      expect(compressionRatio(compressed)).toBeCloseTo(0.12, 2);
    });

    it('should handle zero uncompressed size', () => {
      const compressed: CompressedMatrix = {
        data: new Uint8Array([]),
        numScenarios: 0,
        numBuckets: 0,
        version: 1,
        uncompressedSize: 0,
        compressedSize: 0,
      };

      expect(compressionRatio(compressed)).toBe(0);
    });
  });

  describe('formatCompressionStats', () => {
    it('should format stats correctly', () => {
      const compressed: CompressedMatrix = {
        data: new Uint8Array([]),
        numScenarios: 10_000,
        numBuckets: 5,
        version: 1,
        uncompressedSize: 200_000,
        compressedSize: 24_000,
      };

      const stats = formatCompressionStats(compressed);

      expect(stats).toContain('10000×5');
      expect(stats).toContain('195.3KB');
      expect(stats).toContain('23.4KB');
      expect(stats).toContain('88.0% reduction');
      expect(stats).toContain('ratio 0.120');
    });
  });

  describe('Serialization', () => {
    it('should serialize and deserialize compressed matrix', async () => {
      const original = [
        [1.0, 2.0, 3.0],
        [4.0, 5.0, 6.0],
      ];

      const compressed = await compressMatrix(original);
      const serialized = serializeCompressedMatrix(compressed);
      const deserialized = deserializeCompressedMatrix(serialized);

      expect(deserialized.numScenarios).toBe(compressed.numScenarios);
      expect(deserialized.numBuckets).toBe(compressed.numBuckets);
      expect(deserialized.version).toBe(compressed.version);
      expect(deserialized.data).toEqual(compressed.data);
    });

    it('should survive JSON round-trip', async () => {
      const original = [
        [1.0, 2.0, 3.0],
        [4.0, 5.0, 6.0],
      ];

      const compressed = await compressMatrix(original);
      const serialized = serializeCompressedMatrix(compressed);

      // Simulate JSON round-trip
      const json = JSON.stringify(serialized);
      const parsed = JSON.parse(json);

      const deserialized = deserializeCompressedMatrix(parsed);
      const restored = await decompressMatrix(deserialized);

      expect(restored).toEqual(original);
    });
  });

  describe('Edge cases', () => {
    it('should handle matrix with all zeros', async () => {
      const matrix = [
        [0, 0, 0],
        [0, 0, 0],
      ];

      const compressed = await compressMatrix(matrix);
      const restored = await decompressMatrix(compressed);

      expect(restored).toEqual(matrix);

      // All zeros should compress well, but zlib has overhead for small data
      const ratio = compressionRatio(compressed);
      expect(ratio).toBeLessThan(1.0);
    });

    it('should handle matrix with all same values', async () => {
      const matrix = [
        [2.5, 2.5, 2.5],
        [2.5, 2.5, 2.5],
      ];

      const compressed = await compressMatrix(matrix);
      const restored = await decompressMatrix(compressed);

      expect(restored).toEqual(matrix);

      // Constant values should compress well, but zlib has overhead for small data
      const ratio = compressionRatio(compressed);
      expect(ratio).toBeLessThan(1.0);
    });

    it('should handle very small values', async () => {
      const matrix = [
        [0.000001, 0.000002],
        [0.000003, 0.000004],
      ];

      const compressed = await compressMatrix(matrix);
      const restored = await decompressMatrix(compressed);

      // Values should match within Float32 precision
      for (let s = 0; s < 2; s++) {
        for (let b = 0; b < 2; b++) {
          expect(restored[s][b]).toBeCloseTo(matrix[s][b], 6);
        }
      }
    });

    it('should handle very large values', async () => {
      const matrix = [
        [1e6, 1e7],
        [1e8, 1e9],
      ];

      const compressed = await compressMatrix(matrix);
      const restored = await decompressMatrix(compressed);

      // Large values may lose precision in Float32
      for (let s = 0; s < 2; s++) {
        for (let b = 0; b < 2; b++) {
          // Relative error should be small
          const relativeError = Math.abs((restored[s][b] - matrix[s][b]) / matrix[s][b]);
          expect(relativeError).toBeLessThan(1e-6);
        }
      }
    });
  });
});
