import { describe, it, expect, expectTypeOf } from 'vitest';
import type {
  JobOutbox,
  InsertJobOutbox,
  ScenarioMatrix,
  InsertScenarioMatrix,
  OptimizationSession,
  InsertOptimizationSession,
} from '../../shared/schema';
import {
  jobOutboxStatusSchema,
  insertJobOutboxSchema,
  updateJobOutboxSchema,
  scenarioMatrixStatusSchema,
  matrixTypeSchema,
  insertScenarioMatrixSchema,
  optimizationSessionStatusSchema,
  insertOptimizationSessionSchema,
  updateOptimizationSessionSchema,
  validateJobOutboxInput,
  validateScenarioMatrixInput,
  validateOptimizationSessionInput,
  validateCompleteMatrix,
} from '../../shared/schemas/portfolio-optimization';

describe('Portfolio Optimization Schema Types', () => {
  describe('JobOutbox Types', () => {
    it('should export correct select types', () => {
      expectTypeOf<JobOutbox>().toHaveProperty('id');
      expectTypeOf<JobOutbox>().toHaveProperty('jobType');
      expectTypeOf<JobOutbox>().toHaveProperty('payload');
      expectTypeOf<JobOutbox>().toHaveProperty('status');
      expectTypeOf<JobOutbox>().toHaveProperty('priority');
      expectTypeOf<JobOutbox>().toHaveProperty('maxAttempts');
      expectTypeOf<JobOutbox>().toHaveProperty('attemptCount');
      expectTypeOf<JobOutbox>().toHaveProperty('scheduledFor');
      expectTypeOf<JobOutbox>().toHaveProperty('createdAt');
      expectTypeOf<JobOutbox>().toHaveProperty('updatedAt');
    });

    it('should export correct insert types', () => {
      expectTypeOf<InsertJobOutbox>().toHaveProperty('jobType');
      expectTypeOf<InsertJobOutbox>().toHaveProperty('payload');
    });
  });

  describe('ScenarioMatrix Types', () => {
    it('should export correct select types', () => {
      expectTypeOf<ScenarioMatrix>().toHaveProperty('id');
      expectTypeOf<ScenarioMatrix>().toHaveProperty('scenarioId');
      expectTypeOf<ScenarioMatrix>().toHaveProperty('matrixType');
      expectTypeOf<ScenarioMatrix>().toHaveProperty('moicMatrix');
      expectTypeOf<ScenarioMatrix>().toHaveProperty('scenarioStates');
      expectTypeOf<ScenarioMatrix>().toHaveProperty('bucketParams');
      expectTypeOf<ScenarioMatrix>().toHaveProperty('compressionCodec');
      expectTypeOf<ScenarioMatrix>().toHaveProperty('matrixLayout');
      expectTypeOf<ScenarioMatrix>().toHaveProperty('bucketCount');
      expectTypeOf<ScenarioMatrix>().toHaveProperty('sOpt');
      expectTypeOf<ScenarioMatrix>().toHaveProperty('status');
      expectTypeOf<ScenarioMatrix>().toHaveProperty('createdAt');
      expectTypeOf<ScenarioMatrix>().toHaveProperty('updatedAt');
    });

    it('should export correct insert types', () => {
      expectTypeOf<InsertScenarioMatrix>().toHaveProperty('scenarioId');
      expectTypeOf<InsertScenarioMatrix>().toHaveProperty('matrixType');
    });
  });

  describe('OptimizationSession Types', () => {
    it('should export correct select types', () => {
      expectTypeOf<OptimizationSession>().toHaveProperty('id');
      expectTypeOf<OptimizationSession>().toHaveProperty('matrixId');
      expectTypeOf<OptimizationSession>().toHaveProperty('optimizationConfig');
      expectTypeOf<OptimizationSession>().toHaveProperty('pass1EStar');
      expectTypeOf<OptimizationSession>().toHaveProperty('primaryLockEpsilon');
      expectTypeOf<OptimizationSession>().toHaveProperty('resultWeights');
      expectTypeOf<OptimizationSession>().toHaveProperty('resultMetrics');
      expectTypeOf<OptimizationSession>().toHaveProperty('status');
      expectTypeOf<OptimizationSession>().toHaveProperty('errorMessage');
      expectTypeOf<OptimizationSession>().toHaveProperty('currentIteration');
      expectTypeOf<OptimizationSession>().toHaveProperty('totalIterations');
      expectTypeOf<OptimizationSession>().toHaveProperty('startedAt');
      expectTypeOf<OptimizationSession>().toHaveProperty('completedAt');
      expectTypeOf<OptimizationSession>().toHaveProperty('createdAt');
      expectTypeOf<OptimizationSession>().toHaveProperty('updatedAt');
    });

    it('should export correct insert types', () => {
      expectTypeOf<InsertOptimizationSession>().toHaveProperty('matrixId');
      expectTypeOf<InsertOptimizationSession>().toHaveProperty('optimizationConfig');
    });
  });
});

describe('Portfolio Optimization Zod Schemas', () => {
  describe('jobOutboxStatusSchema', () => {
    it('should accept valid status values', () => {
      const validStatuses = ['pending', 'processing', 'completed', 'failed', 'cancelled'];
      validStatuses.forEach((status) => {
        expect(() => jobOutboxStatusSchema.parse(status)).not.toThrow();
      });
    });

    it('should reject invalid status values', () => {
      expect(() => jobOutboxStatusSchema.parse('invalid')).toThrow();
      expect(() => jobOutboxStatusSchema.parse('')).toThrow();
      expect(() => jobOutboxStatusSchema.parse(null)).toThrow();
    });
  });

  describe('insertJobOutboxSchema', () => {
    it('should validate valid job outbox insert', () => {
      const valid = {
        jobType: 'calculate-reserves',
        payload: { fundId: 'fund-123', scenarioId: 'scenario-456' },
        priority: 5,
        maxAttempts: 3,
      };

      expect(() => insertJobOutboxSchema.parse(valid)).not.toThrow();
    });

    it('should accept minimal required fields', () => {
      const minimal = {
        jobType: 'calculate-pacing',
        payload: { fundId: 'fund-789' },
      };

      const result = insertJobOutboxSchema.parse(minimal);
      expect(result.jobType).toBe('calculate-pacing');
      expect(result.payload).toEqual({ fundId: 'fund-789' });
      expect(result.priority).toBe(0); // default
      expect(result.maxAttempts).toBe(3); // default
    });

    it('should accept optional scheduledFor date', () => {
      const withScheduled = {
        jobType: 'monte-carlo-simulation',
        payload: { scenarioId: 'scenario-999' },
        scheduledFor: new Date('2026-01-05T00:00:00Z'),
      };

      const result = insertJobOutboxSchema.parse(withScheduled);
      expect(result.scheduledFor).toBeInstanceOf(Date);
    });

    it('should reject missing required fields', () => {
      expect(() => insertJobOutboxSchema.parse({ jobType: 'test' })).toThrow();
      expect(() => insertJobOutboxSchema.parse({ payload: {} })).toThrow();
      expect(() => insertJobOutboxSchema.parse({})).toThrow();
    });

    it('should reject empty job type', () => {
      const invalid = {
        jobType: '',
        payload: { test: true },
      };

      expect(() => insertJobOutboxSchema.parse(invalid)).toThrow();
    });

    it('should reject negative priority values', () => {
      const invalid = {
        jobType: 'test-job',
        payload: { test: true },
        priority: -5,
      };

      expect(() => insertJobOutboxSchema.parse(invalid)).toThrow();
    });

    it('should reject invalid maxAttempts values', () => {
      const invalid = {
        jobType: 'test-job',
        payload: { test: true },
        maxAttempts: 0,
      };

      expect(() => insertJobOutboxSchema.parse(invalid)).toThrow();
    });
  });

  describe('updateJobOutboxSchema', () => {
    it('should allow partial updates', () => {
      const partial = {
        status: 'processing' as const,
        attemptCount: 1,
      };

      const result = updateJobOutboxSchema.parse(partial);
      expect(result.status).toBe('processing');
      expect(result.attemptCount).toBe(1);
    });

    it('should allow updating only status', () => {
      const statusOnly = { status: 'completed' as const };
      const result = updateJobOutboxSchema.parse(statusOnly);
      expect(result.status).toBe('completed');
    });

    it('should accept empty update object', () => {
      expect(() => updateJobOutboxSchema.parse({})).not.toThrow();
    });

    it('should reject invalid status in update', () => {
      expect(() => updateJobOutboxSchema.parse({ status: 'invalid' })).toThrow();
    });
  });

  describe('scenarioMatrixStatusSchema', () => {
    it('should accept valid status values', () => {
      const validStatuses = ['pending', 'processing', 'complete', 'failed'];
      validStatuses.forEach((status) => {
        expect(() => scenarioMatrixStatusSchema.parse(status)).not.toThrow();
      });
    });

    it('should reject invalid status values', () => {
      expect(() => scenarioMatrixStatusSchema.parse('completed')).toThrow(); // Note: 'complete' not 'completed'
      expect(() => scenarioMatrixStatusSchema.parse('invalid')).toThrow();
    });
  });

  describe('matrixTypeSchema', () => {
    it('should accept valid matrix types', () => {
      const validTypes = ['moic', 'tvpi', 'dpi', 'irr'];
      validTypes.forEach((type) => {
        expect(() => matrixTypeSchema.parse(type)).not.toThrow();
      });
    });

    it('should reject invalid matrix types', () => {
      expect(() => matrixTypeSchema.parse('invalid')).toThrow();
      expect(() => matrixTypeSchema.parse('MOIC')).toThrow(); // case sensitive
    });
  });

  describe('insertScenarioMatrixSchema', () => {
    it('should validate minimal scenario matrix insert', () => {
      const valid = {
        scenarioId: '123e4567-e89b-12d3-a456-426614174000',
        matrixType: 'moic' as const,
      };

      expect(() => insertScenarioMatrixSchema.parse(valid)).not.toThrow();
    });

    it('should validate complete scenario matrix insert', () => {
      const valid = {
        scenarioId: '123e4567-e89b-12d3-a456-426614174000',
        matrixType: 'moic' as const,
        moicMatrix: 'base64encodeddata',
        scenarioStates: { scenarios: [{ id: 1, params: { test: true } }] },
        bucketParams: { min: 0, max: 10, count: 100, distribution: 'normal' },
        compressionCodec: 'zstd' as const,
        matrixLayout: 'row-major' as const,
        bucketCount: 100,
        sOpt: { algorithm: 'gradient', params: {}, convergence: {} },
        status: 'complete' as const,
      };

      expect(() => insertScenarioMatrixSchema.parse(valid)).not.toThrow();
    });

    it('should reject invalid UUID for scenarioId', () => {
      const invalid = {
        scenarioId: 'not-a-uuid',
        matrixType: 'moic' as const,
      };

      expect(() => insertScenarioMatrixSchema.parse(invalid)).toThrow();
    });

    it('should reject invalid matrix type', () => {
      const invalid = {
        scenarioId: '123e4567-e89b-12d3-a456-426614174000',
        matrixType: 'invalid',
      };

      expect(() => insertScenarioMatrixSchema.parse(invalid)).toThrow();
    });
  });

  describe('optimizationSessionStatusSchema', () => {
    it('should accept valid status values', () => {
      const validStatuses = ['pending', 'running', 'completed', 'failed', 'cancelled'];
      validStatuses.forEach((status) => {
        expect(() => optimizationSessionStatusSchema.parse(status)).not.toThrow();
      });
    });
  });

  describe('insertOptimizationSessionSchema', () => {
    it('should validate valid optimization session insert', () => {
      const valid = {
        matrixId: '123e4567-e89b-12d3-a456-426614174000',
        optimizationConfig: {
          objective: 'maximize_return' as const,
          constraints: { maxRisk: 0.2 },
          algorithm: 'gradient-descent',
        },
      };

      expect(() => insertOptimizationSessionSchema.parse(valid)).not.toThrow();
    });

    it('should accept optional tie-break parameters', () => {
      const valid = {
        matrixId: '123e4567-e89b-12d3-a456-426614174000',
        optimizationConfig: {
          objective: 'risk_adjusted' as const,
          constraints: {},
          algorithm: 'monte-carlo',
          maxIterations: 10000,
          convergenceTolerance: 0.0001,
        },
        pass1EStar: '0.1234567890',
        primaryLockEpsilon: '0.0000000001',
      };

      const result = insertOptimizationSessionSchema.parse(valid);
      expect(result.pass1EStar).toBe('0.1234567890');
      expect(result.primaryLockEpsilon).toBe('0.0000000001');
    });

    it('should reject invalid UUID for matrixId', () => {
      const invalid = {
        matrixId: 'not-a-uuid',
        optimizationConfig: {
          objective: 'maximize_return' as const,
          constraints: {},
          algorithm: 'test',
        },
      };

      expect(() => insertOptimizationSessionSchema.parse(invalid)).toThrow();
    });

    it('should reject invalid optimization objective', () => {
      const invalid = {
        matrixId: '123e4567-e89b-12d3-a456-426614174000',
        optimizationConfig: {
          objective: 'invalid_objective',
          constraints: {},
          algorithm: 'test',
        },
      };

      expect(() => insertOptimizationSessionSchema.parse(invalid)).toThrow();
    });
  });

  describe('updateOptimizationSessionSchema', () => {
    it('should allow updating status', () => {
      const update = { status: 'running' as const };
      const result = updateOptimizationSessionSchema.parse(update);
      expect(result.status).toBe('running');
    });

    it('should allow updating result metrics', () => {
      const update = {
        resultMetrics: {
          expectedReturn: 0.15,
          risk: 0.12,
          sharpeRatio: 1.25,
        },
      };

      const result = updateOptimizationSessionSchema.parse(update);
      expect(result.resultMetrics?.expectedReturn).toBe(0.15);
    });

    it('should allow updating iteration tracking', () => {
      const update = {
        currentIteration: 500,
        totalIterations: 1000,
      };

      const result = updateOptimizationSessionSchema.parse(update);
      expect(result.currentIteration).toBe(500);
      expect(result.totalIterations).toBe(1000);
    });
  });
});

describe('Validation Helpers', () => {
  describe('validateJobOutboxInput', () => {
    it('should return ok for valid input', () => {
      const result = validateJobOutboxInput({
        jobType: 'test-job',
        payload: { data: 'value' },
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.jobType).toBe('test-job');
      }
    });

    it('should return errors for invalid input', () => {
      const result = validateJobOutboxInput({
        jobType: '', // empty
        payload: null, // invalid
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(400);
        expect(result.issues.length).toBeGreaterThan(0);
      }
    });
  });

  describe('validateCompleteMatrix', () => {
    it('should return true for non-complete matrices', () => {
      const matrix = {
        scenarioId: '123e4567-e89b-12d3-a456-426614174000',
        matrixType: 'moic' as const,
        status: 'pending' as const,
      };

      expect(validateCompleteMatrix(matrix)).toBe(true);
    });

    it('should return true for complete matrices with all fields', () => {
      const matrix = {
        scenarioId: '123e4567-e89b-12d3-a456-426614174000',
        matrixType: 'moic' as const,
        moicMatrix: 'data',
        scenarioStates: { scenarios: [] },
        bucketParams: { min: 0, max: 10, count: 100, distribution: 'normal' },
        compressionCodec: 'zstd' as const,
        matrixLayout: 'row-major' as const,
        bucketCount: 100,
        sOpt: { algorithm: 'test', params: {}, convergence: {} },
        status: 'complete' as const,
      };

      expect(validateCompleteMatrix(matrix)).toBe(true);
    });

    it('should return false for complete matrices missing fields', () => {
      const matrix = {
        scenarioId: '123e4567-e89b-12d3-a456-426614174000',
        matrixType: 'moic' as const,
        status: 'complete' as const,
        // missing all payload fields
      };

      expect(validateCompleteMatrix(matrix)).toBe(false);
    });
  });

  describe('validateScenarioMatrixInput', () => {
    it('should return ok for valid input', () => {
      const result = validateScenarioMatrixInput({
        scenarioId: '123e4567-e89b-12d3-a456-426614174000',
        matrixType: 'moic',
      });

      expect(result.ok).toBe(true);
    });

    it('should return 422 for incomplete complete matrix', () => {
      const result = validateScenarioMatrixInput({
        scenarioId: '123e4567-e89b-12d3-a456-426614174000',
        matrixType: 'moic',
        status: 'complete',
        // missing required payload fields
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(422);
        expect(result.issues[0].code).toBe('missing_fields');
      }
    });
  });

  describe('validateOptimizationSessionInput', () => {
    it('should return ok for valid input', () => {
      const result = validateOptimizationSessionInput({
        matrixId: '123e4567-e89b-12d3-a456-426614174000',
        optimizationConfig: {
          objective: 'maximize_return',
          constraints: {},
          algorithm: 'gradient',
        },
      });

      expect(result.ok).toBe(true);
    });

    it('should return errors for invalid input', () => {
      const result = validateOptimizationSessionInput({
        matrixId: 'not-a-uuid',
        optimizationConfig: {
          objective: 'invalid',
          constraints: {},
          algorithm: 'test',
        },
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(400);
      }
    });
  });
});
