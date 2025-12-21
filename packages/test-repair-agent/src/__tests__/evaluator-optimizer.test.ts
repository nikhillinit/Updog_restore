import { describe, it, expect, beforeEach } from 'vitest';
import type { TestFailure, RepairInput } from '../TestRepairAgent';
import { TestRepairAgent } from '../TestRepairAgent';

describe('Evaluator-Optimizer Pattern', () => {
  let agent: TestRepairAgent;
  let mockProjectRoot: string;

  beforeEach(() => {
    agent = new TestRepairAgent();
    mockProjectRoot = process.cwd();
  });

  describe('evaluateFix', () => {
    it('should return PASS for repairs that meet all criteria', async () => {
      const failure: TestFailure = {
        file: 'test.ts',
        testName: 'should handle null values',
        error: 'Cannot read property of null',
        type: 'runtime'
      };

      const goodRepair = 'Add null checks with optional chaining: value?.property';

      // Access private method via any for testing
      const evaluation = await (agent as any).evaluateFix(
        failure,
        goodRepair,
        { projectRoot: mockProjectRoot }
      );

      expect(evaluation.status).toBe('PASS');
      expect(evaluation.criteria.testPasses).toBe(true);
      expect(evaluation.criteria.noRegressions).toBe(true);
      expect(evaluation.criteria.followsConventions).toBe(true);
    });

    it('should return NEEDS_IMPROVEMENT for repairs with regressions', async () => {
      const failure: TestFailure = {
        file: 'test.ts',
        testName: 'type safety test',
        error: 'Type error: expected string',
        type: 'runtime'
      };

      const unsafeRepair = 'Fix type error with any type and @ts-ignore';

      const evaluation = await (agent as any).evaluateFix(
        failure,
        unsafeRepair,
        { projectRoot: mockProjectRoot }
      );

      expect(evaluation.status).toBe('NEEDS_IMPROVEMENT');
      expect(evaluation.criteria.noRegressions).toBe(false);
      expect(evaluation.feedback).toContain('regressions');
    });

    it('should return FAIL when repair does not address the error', async () => {
      const failure: TestFailure = {
        file: 'test.ts',
        testName: 'database connection test',
        error: 'Connection timeout to PostgreSQL',
        type: 'timeout'
      };

      const unrelatedRepair = 'Add semicolon at end of line';

      const evaluation = await (agent as any).evaluateFix(
        failure,
        unrelatedRepair,
        { projectRoot: mockProjectRoot }
      );

      expect(evaluation.status).toBe('FAIL');
      expect(evaluation.criteria.testPasses).toBe(false);
    });
  });

  describe('optimizeWithFeedback', () => {
    it('should improve repairs based on feedback', async () => {
      const failure: TestFailure = {
        file: 'test.ts',
        testName: 'should validate input',
        error: 'Runtime error: undefined is not a function',
        type: 'runtime'
      };

      const initialRepair = 'Fix function call';
      const evaluation = {
        status: 'NEEDS_IMPROVEMENT' as const,
        feedback: 'Repair should follow project conventions (type safety, error handling)',
        criteria: {
          testPasses: true,
          noRegressions: true,
          followsConventions: false
        }
      };

      const optimizedRepair = await (agent as any).optimizeWithFeedback(
        failure,
        initialRepair,
        evaluation,
        [{ repair: initialRepair, feedback: evaluation.feedback }]
      );

      expect(optimizedRepair).toBeTruthy();
      expect(optimizedRepair).not.toBe(initialRepair);
      // Should suggest type safety improvements
      expect(optimizedRepair.toLowerCase()).toMatch(/type|try|catch/);
    });

    it('should try alternative strategies after multiple failures', async () => {
      const failure: TestFailure = {
        file: 'test.ts',
        testName: 'assertion test',
        error: 'Expected true but received false',
        type: 'assertion'
      };

      const previousAttempts = [
        { repair: 'Update assertion', feedback: 'Does not address root cause' },
        { repair: 'Fix comparison logic', feedback: 'Still failing' }
      ];

      const evaluation = {
        status: 'FAIL' as const,
        feedback: 'Repair does not directly address the error message',
        criteria: {
          testPasses: false,
          noRegressions: true,
          followsConventions: true
        }
      };

      const optimizedRepair = await (agent as any).optimizeWithFeedback(
        failure,
        'Fix comparison logic',
        evaluation,
        previousAttempts
      );

      // Should suggest mocking or updating expectations
      expect(optimizedRepair.toLowerCase()).toMatch(/mock|expect/);
    });
  });

  describe('evaluatorOptimizerLoop', () => {
    it('should iterate until PASS or max iterations', async () => {
      const failure: TestFailure = {
        file: 'test.ts',
        testName: 'should handle edge case',
        error: 'Timeout: test exceeded 5000ms',
        type: 'timeout'
      };

      const input: RepairInput = {
        projectRoot: mockProjectRoot
      };

      const result = await (agent as any).evaluatorOptimizerLoop(failure, input);

      expect(result.file).toBe(failure.file);
      expect(result.changes).toBeTruthy();
      expect(result.evaluation).toBeDefined();
      expect(result.iterations).toBeGreaterThan(0);
      expect(result.iterations).toBeLessThanOrEqual(3); // MAX_OPTIMIZATION_ITERATIONS
    });

    it('should stop early on PASS evaluation', async () => {
      const failure: TestFailure = {
        file: 'test.ts',
        testName: 'simple syntax test',
        error: 'Missing semicolon at line 42',
        type: 'syntax'
      };

      const input: RepairInput = {
        projectRoot: mockProjectRoot
      };

      const result = await (agent as any).evaluatorOptimizerLoop(failure, input);

      // Syntax errors often pass quickly
      if (result.success) {
        expect(result.iterations).toBeLessThanOrEqual(3);
        expect(result.evaluation.status).toBe('PASS');
      }
    });
  });

  describe('regression detection', () => {
    it('should detect unsafe TypeScript patterns', () => {
      const unsafeRepairs = [
        'Use any type for flexibility',
        'Add console.log for debugging',
        'Add @ts-ignore to suppress error',
        'Set timeout to 999999ms',
        'TODO: fix this properly later'
      ];

      unsafeRepairs.forEach(repair => {
        const hasRegressions = (agent as any).detectPotentialRegressions(repair);
        expect(hasRegressions).toBe(true);
      });
    });

    it('should allow safe patterns', () => {
      const safeRepairs = [
        'Add proper type annotations with interface',
        'Implement error handling with try-catch',
        'Use optional chaining for null safety',
        'Add unit tests for edge cases'
      ];

      safeRepairs.forEach(repair => {
        const hasRegressions = (agent as any).detectPotentialRegressions(repair);
        expect(hasRegressions).toBe(false);
      });
    });
  });
});
