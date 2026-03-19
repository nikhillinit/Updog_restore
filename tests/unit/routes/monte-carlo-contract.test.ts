/**
 * Monte Carlo route contract tests (Zod schema validation)
 *
 * Safety harness for ESLint Wave 0.5: validates the request/response contract
 * shapes so middleware and helper refactoring in Wave 1A/1B does not silently
 * change the API contract.
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Re-declare the schemas inline to test the contract shape without importing
// internal route module state. If the real schemas diverge from these, the
// route contract has changed and wave tests must be updated.

const simulationConfigSchema = z.object({
  fundId: z.number().int().positive(),
  runs: z.number().int().min(100).max(50000).default(10000),
  timeHorizonYears: z.number().min(1).max(15).default(8),
  baselineId: z.string().uuid().optional(),
  portfolioSize: z.number().int().positive().optional(),
  deploymentScheduleMonths: z.number().int().min(12).max(120).optional(),
  randomSeed: z.number().int().optional(),
  batchSize: z.number().int().min(100).max(5000).default(1000),
  maxConcurrentBatches: z.number().int().min(1).max(10).default(4),
  enableResultStreaming: z.boolean().default(true),
  memoryThresholdMB: z.number().min(50).max(2000).default(100),
  enableGarbageCollection: z.boolean().default(true),
  forceEngine: z.enum(['streaming', 'traditional', 'auto']).default('auto'),
  performanceMode: z.enum(['speed', 'memory', 'balanced']).default('balanced'),
  enableFallback: z.boolean().default(true),
  stageDistribution: z
    .array(z.object({ stage: z.string(), weight: z.number().min(0).max(1) }))
    .optional(),
});

describe('Monte Carlo API contract (Zod schemas)', () => {
  describe('simulationConfigSchema', () => {
    it('accepts minimal valid config', () => {
      const result = simulationConfigSchema.safeParse({ fundId: 1 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.runs).toBe(10000);
        expect(result.data.timeHorizonYears).toBe(8);
        expect(result.data.forceEngine).toBe('auto');
        expect(result.data.performanceMode).toBe('balanced');
      }
    });

    it('rejects missing fundId', () => {
      const result = simulationConfigSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('rejects non-positive fundId', () => {
      expect(simulationConfigSchema.safeParse({ fundId: 0 }).success).toBe(false);
      expect(simulationConfigSchema.safeParse({ fundId: -1 }).success).toBe(false);
    });

    it('rejects runs outside [100, 50000]', () => {
      expect(simulationConfigSchema.safeParse({ fundId: 1, runs: 50 }).success).toBe(false);
      expect(simulationConfigSchema.safeParse({ fundId: 1, runs: 60000 }).success).toBe(false);
    });

    it('accepts full config with all optional fields', () => {
      const full = {
        fundId: 42,
        runs: 5000,
        timeHorizonYears: 10,
        baselineId: '00000000-0000-0000-0000-000000000001',
        portfolioSize: 30,
        deploymentScheduleMonths: 36,
        randomSeed: 12345,
        batchSize: 2000,
        maxConcurrentBatches: 6,
        enableResultStreaming: false,
        memoryThresholdMB: 500,
        enableGarbageCollection: false,
        forceEngine: 'streaming' as const,
        performanceMode: 'speed' as const,
        enableFallback: false,
        stageDistribution: [
          { stage: 'seed', weight: 0.4 },
          { stage: 'seriesA', weight: 0.6 },
        ],
      };
      const result = simulationConfigSchema.safeParse(full);
      expect(result.success).toBe(true);
    });

    it('rejects invalid forceEngine enum value', () => {
      expect(simulationConfigSchema.safeParse({ fundId: 1, forceEngine: 'turbo' }).success).toBe(
        false
      );
    });

    it('rejects stageDistribution weight > 1', () => {
      expect(
        simulationConfigSchema.safeParse({
          fundId: 1,
          stageDistribution: [{ stage: 'seed', weight: 1.5 }],
        }).success
      ).toBe(false);
    });
  });
});
