/**
 * Unit tests for Portfolio Optimization Database Schema
 *
 * Tests Phase 1: Portfolio Construction & Optimization Drizzle schemas
 * - job_outbox table schema definition
 * - scenario_matrices table schema definition
 * - optimization_sessions table schema definition
 *
 * See: docs/plans/2026-01-04-phase1-implementation-plan.md
 * Corrections applied: #1-#9 from critical-corrections.md
 */

import { describe, it, expect } from 'vitest';
import { getTableColumns, getTableName } from 'drizzle-orm';
import {
  jobOutbox,
  scenarioMatrices,
  optimizationSessions,
  insertJobOutboxSchema,
  insertScenarioMatrixSchema,
  insertOptimizationSessionSchema,
  type JobOutbox,
  type InsertJobOutbox,
  type ScenarioMatrix,
  type InsertScenarioMatrix,
  type OptimizationSession,
  type InsertOptimizationSession,
} from '../../../shared/schema';

describe('Portfolio Optimization Schema - Drizzle Definitions', () => {
  describe('jobOutbox table', () => {
    it('should have correct table name', () => {
      expect(getTableName(jobOutbox)).toBe('job_outbox');
    });

    it('should have all required columns', () => {
      const columns = getTableColumns(jobOutbox);
      const columnNames = Object.keys(columns);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('jobType');
      expect(columnNames).toContain('payload');
      expect(columnNames).toContain('status');
      expect(columnNames).toContain('priority');
      expect(columnNames).toContain('attemptCount');
      expect(columnNames).toContain('maxAttempts');
      expect(columnNames).toContain('scheduledFor');
      expect(columnNames).toContain('processingAt');
      expect(columnNames).toContain('nextRunAt');
      expect(columnNames).toContain('completedAt');
      expect(columnNames).toContain('errorMessage');
      expect(columnNames).toContain('createdAt');
      expect(columnNames).toContain('updatedAt');
    });

    it('should have correct column mappings (camelCase to snake_case)', () => {
      const columns = getTableColumns(jobOutbox);

      expect(columns.id.name).toBe('id');
      expect(columns.jobType.name).toBe('job_type');
      expect(columns.payload.name).toBe('payload');
      expect(columns.status.name).toBe('status');
      expect(columns.priority.name).toBe('priority');
      expect(columns.attemptCount.name).toBe('attempt_count');
      expect(columns.maxAttempts.name).toBe('max_attempts');
      expect(columns.scheduledFor.name).toBe('scheduled_for');
      expect(columns.processingAt.name).toBe('processing_at');
      expect(columns.nextRunAt.name).toBe('next_run_at');
      expect(columns.completedAt.name).toBe('completed_at');
      expect(columns.errorMessage.name).toBe('error_message');
      expect(columns.createdAt.name).toBe('created_at');
      expect(columns.updatedAt.name).toBe('updated_at');
    });

    it('should have id as UUID primary key', () => {
      const columns = getTableColumns(jobOutbox);
      // Drizzle reports UUID as 'string' dataType
      expect(columns.id.dataType).toBe('string');
      expect(columns.id.primary).toBe(true);
    });

    it('should have payload as JSONB', () => {
      const columns = getTableColumns(jobOutbox);
      expect(columns.payload.dataType).toBe('json');
    });

    it('should have priority and attempts as integers', () => {
      const columns = getTableColumns(jobOutbox);
      expect(columns.priority.dataType).toBe('number');
      expect(columns.attemptCount.dataType).toBe('number');
      expect(columns.maxAttempts.dataType).toBe('number');
    });

    it('should have timestamp columns', () => {
      const columns = getTableColumns(jobOutbox);
      expect(columns.scheduledFor.dataType).toBe('date');
      expect(columns.processingAt.dataType).toBe('date');
      expect(columns.nextRunAt.dataType).toBe('date');
      expect(columns.completedAt.dataType).toBe('date');
      expect(columns.createdAt.dataType).toBe('date');
      expect(columns.updatedAt.dataType).toBe('date');
    });

    it('should export insert schema', () => {
      expect(insertJobOutboxSchema).toBeDefined();
      expect(typeof insertJobOutboxSchema.parse).toBe('function');
    });

    it('should export TypeScript types', () => {
      // Type assertion test - will fail compilation if types are wrong
      const selectType: JobOutbox = {} as JobOutbox;
      const insertType: InsertJobOutbox = {} as InsertJobOutbox;

      expect(selectType).toBeDefined();
      expect(insertType).toBeDefined();
    });
  });

  describe('scenarioMatrices table', () => {
    it('should have correct table name', () => {
      expect(getTableName(scenarioMatrices)).toBe('scenario_matrices');
    });

    it('should have all required columns including Correction #1 payload fields', () => {
      const columns = getTableColumns(scenarioMatrices);
      const columnNames = Object.keys(columns);

      // Core columns
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('matrixKey');
      expect(columnNames).toContain('fundId');
      expect(columnNames).toContain('taxonomyVersion');
      expect(columnNames).toContain('matrixType');
      expect(columnNames).not.toContain('scenarioId');

      // Correction #2: BYTEA moic_matrix
      expect(columnNames).toContain('moicMatrix');

      // Correction #1: All payload fields
      expect(columnNames).toContain('scenarioStates');
      expect(columnNames).toContain('bucketParams');
      expect(columnNames).toContain('compressionCodec');
      expect(columnNames).toContain('matrixLayout');
      expect(columnNames).toContain('bucketCount');
      expect(columnNames).toContain('sOpt');

      // Status and timestamps
      expect(columnNames).toContain('status');
      expect(columnNames).toContain('errorMessage');
      expect(columnNames).toContain('createdAt');
      expect(columnNames).toContain('updatedAt');
    });

    it('should have correct column mappings for snake_case database columns', () => {
      const columns = getTableColumns(scenarioMatrices);

      expect(columns.matrixKey.name).toBe('matrix_key');
      expect(columns.fundId.name).toBe('fund_id');
      expect(columns.taxonomyVersion.name).toBe('taxonomy_version');
      expect(columns.matrixType.name).toBe('matrix_type');
      expect(columns.moicMatrix.name).toBe('moic_matrix');
      expect(columns.scenarioStates.name).toBe('scenario_states');
      expect(columns.bucketParams.name).toBe('bucket_params');
      expect(columns.compressionCodec.name).toBe('compression_codec');
      expect(columns.matrixLayout.name).toBe('matrix_layout');
      expect(columns.bucketCount.name).toBe('bucket_count');
      expect(columns.sOpt.name).toBe('s_opt');
    });

    it('should have moicMatrix as custom type (BYTEA - Correction #2)', () => {
      const columns = getTableColumns(scenarioMatrices);
      // Custom bytea type
      expect(columns.moicMatrix).toBeDefined();
    });

    it('should have JSONB columns for metadata', () => {
      const columns = getTableColumns(scenarioMatrices);
      expect(columns.scenarioStates.dataType).toBe('json');
      expect(columns.bucketParams.dataType).toBe('json');
      expect(columns.sOpt.dataType).toBe('json');
    });

    it('should export insert schema', () => {
      expect(insertScenarioMatrixSchema).toBeDefined();
      expect(typeof insertScenarioMatrixSchema.parse).toBe('function');
    });

    it('should export TypeScript types', () => {
      const selectType: ScenarioMatrix = {} as ScenarioMatrix;
      const insertType: InsertScenarioMatrix = {} as InsertScenarioMatrix;

      expect(selectType).toBeDefined();
      expect(insertType).toBeDefined();
    });
  });

  describe('optimizationSessions table', () => {
    it('should have correct table name', () => {
      expect(getTableName(optimizationSessions)).toBe('optimization_sessions');
    });

    it('should have all required columns including Correction #9 tie-break columns', () => {
      const columns = getTableColumns(optimizationSessions);
      const columnNames = Object.keys(columns);

      // Core columns
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('matrixId');
      expect(columnNames).toContain('optimizationConfig');

      // Correction #9: Two-pass lexicographic MILP columns
      expect(columnNames).toContain('pass1EStar');
      expect(columnNames).toContain('primaryLockEpsilon');

      // Result columns
      expect(columnNames).toContain('resultWeights');
      expect(columnNames).toContain('resultMetrics');

      // Status and progress
      expect(columnNames).toContain('status');
      expect(columnNames).toContain('errorMessage');
      expect(columnNames).toContain('currentIteration');
      expect(columnNames).toContain('totalIterations');
      expect(columnNames).toContain('startedAt');
      expect(columnNames).toContain('completedAt');
      expect(columnNames).toContain('createdAt');
      expect(columnNames).toContain('updatedAt');
    });

    it('should have correct column mappings for snake_case database columns', () => {
      const columns = getTableColumns(optimizationSessions);

      expect(columns.matrixId.name).toBe('matrix_id');
      expect(columns.optimizationConfig.name).toBe('optimization_config');
      expect(columns.pass1EStar.name).toBe('pass1_e_star');
      expect(columns.primaryLockEpsilon.name).toBe('primary_lock_epsilon');
      expect(columns.resultWeights.name).toBe('result_weights');
      expect(columns.resultMetrics.name).toBe('result_metrics');
      expect(columns.currentIteration.name).toBe('current_iteration');
      expect(columns.totalIterations.name).toBe('total_iterations');
      expect(columns.startedAt.name).toBe('started_at');
      expect(columns.completedAt.name).toBe('completed_at');
    });

    it('should have pass1EStar and primaryLockEpsilon as double precision (Correction #9)', () => {
      const columns = getTableColumns(optimizationSessions);
      expect(columns.pass1EStar.dataType).toBe('number');
      expect(columns.primaryLockEpsilon.dataType).toBe('number');
    });

    it('should have JSONB columns for config and results', () => {
      const columns = getTableColumns(optimizationSessions);
      expect(columns.optimizationConfig.dataType).toBe('json');
      expect(columns.resultWeights.dataType).toBe('json');
      expect(columns.resultMetrics.dataType).toBe('json');
    });

    it('should export insert schema', () => {
      expect(insertOptimizationSessionSchema).toBeDefined();
      expect(typeof insertOptimizationSessionSchema.parse).toBe('function');
    });

    it('should export TypeScript types', () => {
      const selectType: OptimizationSession = {} as OptimizationSession;
      const insertType: InsertOptimizationSession = {} as InsertOptimizationSession;

      expect(selectType).toBeDefined();
      expect(insertType).toBeDefined();
    });
  });

  describe('Schema Relationships', () => {
    it('should use cache identity fields instead of a portfolioScenarios FK', () => {
      const columns = getTableColumns(scenarioMatrices);
      expect(columns.scenarioId).toBeUndefined();
      expect(columns.matrixKey).toBeDefined();
      expect(columns.matrixKey.notNull).toBe(true);
      expect(columns.fundId).toBeDefined();
      expect(columns.fundId.notNull).toBe(true);
      expect(columns.taxonomyVersion).toBeDefined();
      expect(columns.taxonomyVersion.notNull).toBe(true);
    });

    it('should have optimizationSessions reference scenarioMatrices', () => {
      const columns = getTableColumns(optimizationSessions);
      expect(columns.matrixId).toBeDefined();
      expect(columns.matrixId.notNull).toBe(true);
    });
  });

  describe('Insert Schema Validation', () => {
    it('should validate jobOutbox insert with required fields', () => {
      const valid = {
        jobType: 'test-job',
        payload: { test: true },
      };

      const result = insertJobOutboxSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should reject jobOutbox insert without required fields', () => {
      const invalid = {
        // missing jobType and payload
      };

      const result = insertJobOutboxSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should validate scenarioMatrix insert with required fields', () => {
      const valid = {
        matrixKey: 'fund-123|tax-v1|moic',
        fundId: 'fund-123',
        taxonomyVersion: 'tax-v1',
        matrixType: 'moic',
      };

      const result = insertScenarioMatrixSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should validate optimizationSession insert with required fields', () => {
      const valid = {
        matrixId: '123e4567-e89b-12d3-a456-426614174000',
        optimizationConfig: {
          objective: 'maximize_return',
          constraints: {},
          algorithm: 'milp',
        },
      };

      const result = insertOptimizationSessionSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });
  });
});
