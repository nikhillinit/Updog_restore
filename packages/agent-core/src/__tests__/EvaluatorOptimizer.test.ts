import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  EvaluatorOptimizer,
  extractXml,
  createGenerator,
  createEvaluator,
  type GeneratorFunction,
  type EvaluatorFunction,
  type EvaluationResult,
  type GenerationResult,
} from '../EvaluatorOptimizer';

describe('EvaluatorOptimizer', () => {
  describe('extractXml', () => {
    it('should extract content from XML-like tags', () => {
      const text = '<thoughts>My reasoning</thoughts><result>Final answer</result>';
      expect(extractXml(text, 'thoughts')).toBe('My reasoning');
      expect(extractXml(text, 'result')).toBe('Final answer');
    });

    it('should handle multiline content', () => {
      const text = `<thoughts>
        Line 1
        Line 2
      </thoughts>`;
      const extracted = extractXml(text, 'thoughts');
      expect(extracted).toContain('Line 1');
      expect(extracted).toContain('Line 2');
    });

    it('should return empty string for non-existent tags', () => {
      const text = '<thoughts>Content</thoughts>';
      expect(extractXml(text, 'nonexistent')).toBe('');
    });

    it('should be case-insensitive', () => {
      const text = '<THOUGHTS>Content</THOUGHTS>';
      expect(extractXml(text, 'thoughts')).toBe('Content');
    });
  });

  describe('Basic loop functionality', () => {
    let mockGenerator: GeneratorFunction;
    let mockEvaluator: EvaluatorFunction;

    beforeEach(() => {
      mockGenerator = vi.fn();
      mockEvaluator = vi.fn();
    });

    it('should pass on first iteration if evaluation passes', async () => {
      const workflow = new EvaluatorOptimizer({ verbose: false });

      mockGenerator.mockResolvedValue({
        thoughts: 'Initial thoughts',
        result: 'Perfect solution',
      });

      mockEvaluator.mockResolvedValue({
        status: 'PASS',
        feedback: 'Looks good!',
      });

      const result = await workflow.run('test task', mockGenerator, mockEvaluator);

      expect(result.success).toBe(true);
      expect(result.finalSolution).toBe('Perfect solution');
      expect(result.finalThoughts).toBe('Initial thoughts');
      expect(result.iterations).toBe(1);
      expect(result.steps).toHaveLength(1);
      expect(mockGenerator).toHaveBeenCalledTimes(1);
      expect(mockEvaluator).toHaveBeenCalledTimes(1);
    });

    it('should iterate until evaluation passes', async () => {
      const workflow = new EvaluatorOptimizer({ verbose: false, maxIterations: 5 });

      let callCount = 0;
      mockGenerator.mockImplementation(async (task: string, context?: string) => {
        callCount++;
        return {
          thoughts: `Attempt ${callCount}`,
          result: `Solution ${callCount}`,
        };
      });

      mockEvaluator
        .mockResolvedValueOnce({
          status: 'NEEDS_IMPROVEMENT',
          feedback: 'Needs work',
        })
        .mockResolvedValueOnce({
          status: 'NEEDS_IMPROVEMENT',
          feedback: 'Better but not there yet',
        })
        .mockResolvedValueOnce({
          status: 'PASS',
          feedback: 'Perfect!',
        });

      const result = await workflow.run('test task', mockGenerator, mockEvaluator);

      expect(result.success).toBe(true);
      expect(result.finalSolution).toBe('Solution 3');
      expect(result.iterations).toBe(3);
      expect(result.steps).toHaveLength(3);
      expect(mockGenerator).toHaveBeenCalledTimes(3);
      expect(mockEvaluator).toHaveBeenCalledTimes(3);
    });

    it('should fail when evaluator returns FAIL', async () => {
      const workflow = new EvaluatorOptimizer({ verbose: false });

      mockGenerator.mockResolvedValue({
        thoughts: 'My thoughts',
        result: 'Bad solution',
      });

      mockEvaluator.mockResolvedValue({
        status: 'FAIL',
        feedback: 'This is fundamentally wrong',
      });

      const result = await workflow.run('test task', mockGenerator, mockEvaluator);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Evaluation failed');
      expect(result.iterations).toBe(1);
      expect(result.finalSolution).toBeUndefined();
    });

    it('should fail when max iterations reached', async () => {
      const workflow = new EvaluatorOptimizer({ verbose: false, maxIterations: 3 });

      mockGenerator.mockResolvedValue({
        thoughts: 'Trying again',
        result: 'Still not good enough',
      });

      mockEvaluator.mockResolvedValue({
        status: 'NEEDS_IMPROVEMENT',
        feedback: 'Keep trying',
      });

      const result = await workflow.run('test task', mockGenerator, mockEvaluator);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Max iterations');
      expect(result.iterations).toBe(3);
      expect(result.steps).toHaveLength(3);
    });

    it('should handle errors gracefully', async () => {
      const workflow = new EvaluatorOptimizer({ verbose: false });

      mockGenerator.mockRejectedValue(new Error('Generator failed'));

      const result = await workflow.run('test task', mockGenerator, mockEvaluator);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Generator failed');
      expect(result.steps).toHaveLength(0);
    });
  });

  describe('Context building', () => {
    it('should pass context to generator after first iteration', async () => {
      const workflow = new EvaluatorOptimizer({ verbose: false });

      const mockGenerator = vi.fn<[string, string?], Promise<GenerationResult>>();
      mockGenerator
        .mockResolvedValueOnce({
          thoughts: 'First try',
          result: 'Solution 1',
        })
        .mockResolvedValueOnce({
          thoughts: 'Second try',
          result: 'Solution 2',
        });

      const mockEvaluator = vi.fn<[string, string], Promise<EvaluationResult>>();
      mockEvaluator
        .mockResolvedValueOnce({
          status: 'NEEDS_IMPROVEMENT',
          feedback: 'Try again',
        })
        .mockResolvedValueOnce({
          status: 'PASS',
          feedback: 'Good!',
        });

      await workflow.run('test task', mockGenerator, mockEvaluator);

      // First call should have no context
      expect(mockGenerator).toHaveBeenNthCalledWith(1, 'test task', undefined);

      // Second call should have context with previous attempt and feedback
      const secondCallContext = mockGenerator.mock.calls[1][1];
      expect(secondCallContext).toContain('Previous attempts');
      expect(secondCallContext).toContain('Solution 1');
      expect(secondCallContext).toContain('Try again');
    });
  });

  describe('createGenerator', () => {
    it('should create a generator function that parses LLM response', async () => {
      const mockLlmCall = vi.fn<[string], Promise<string>>();
      mockLlmCall.mockResolvedValue(
        '<thoughts>My reasoning</thoughts><response>Generated code</response>'
      );

      const generator = createGenerator('You are a code generator', mockLlmCall);

      const result = await generator('Write a function');

      expect(result.thoughts).toBe('My reasoning');
      expect(result.result).toBe('Generated code');
      expect(mockLlmCall).toHaveBeenCalledWith(
        expect.stringContaining('You are a code generator')
      );
      expect(mockLlmCall).toHaveBeenCalledWith(expect.stringContaining('Write a function'));
    });

    it('should include context in prompt when provided', async () => {
      const mockLlmCall = vi.fn<[string], Promise<string>>();
      mockLlmCall.mockResolvedValue(
        '<thoughts>Improved reasoning</thoughts><response>Better code</response>'
      );

      const generator = createGenerator('You are a code generator', mockLlmCall);

      const context = 'Previous attempt failed because...';
      await generator('Write a function', context);

      expect(mockLlmCall).toHaveBeenCalledWith(expect.stringContaining(context));
    });

    it('should support custom parser', async () => {
      const mockLlmCall = vi.fn<[string], Promise<string>>();
      mockLlmCall.mockResolvedValue('{"thoughts": "Custom", "result": "Parsed"}');

      const customParser = (response: string) => JSON.parse(response);
      const generator = createGenerator('System prompt', mockLlmCall, customParser);

      const result = await generator('Task');

      expect(result.thoughts).toBe('Custom');
      expect(result.result).toBe('Parsed');
    });
  });

  describe('createEvaluator', () => {
    it('should create an evaluator function that parses LLM response', async () => {
      const mockLlmCall = vi.fn<[string], Promise<string>>();
      mockLlmCall.mockResolvedValue(
        '<evaluation>PASS</evaluation><feedback>Looks great!</feedback>'
      );

      const evaluator = createEvaluator('You are a code reviewer', mockLlmCall);

      const result = await evaluator('Some code', 'Original task');

      expect(result.status).toBe('PASS');
      expect(result.feedback).toBe('Looks great!');
      expect(mockLlmCall).toHaveBeenCalledWith(
        expect.stringContaining('You are a code reviewer')
      );
      expect(mockLlmCall).toHaveBeenCalledWith(expect.stringContaining('Original task'));
      expect(mockLlmCall).toHaveBeenCalledWith(expect.stringContaining('Some code'));
    });

    it('should handle NEEDS_IMPROVEMENT status', async () => {
      const mockLlmCall = vi.fn<[string], Promise<string>>();
      mockLlmCall.mockResolvedValue(
        '<evaluation>NEEDS_IMPROVEMENT</evaluation><feedback>Missing edge cases</feedback>'
      );

      const evaluator = createEvaluator('You are a code reviewer', mockLlmCall);

      const result = await evaluator('Some code', 'Task');

      expect(result.status).toBe('NEEDS_IMPROVEMENT');
      expect(result.feedback).toBe('Missing edge cases');
    });

    it('should handle FAIL status', async () => {
      const mockLlmCall = vi.fn<[string], Promise<string>>();
      mockLlmCall.mockResolvedValue(
        '<evaluation>FAIL</evaluation><feedback>Completely wrong</feedback>'
      );

      const evaluator = createEvaluator('You are a code reviewer', mockLlmCall);

      const result = await evaluator('Some code', 'Task');

      expect(result.status).toBe('FAIL');
      expect(result.feedback).toBe('Completely wrong');
    });

    it('should default to NEEDS_IMPROVEMENT for invalid status', async () => {
      const mockLlmCall = vi.fn<[string], Promise<string>>();
      mockLlmCall.mockResolvedValue(
        '<evaluation>INVALID</evaluation><feedback>Unknown status</feedback>'
      );

      const evaluator = createEvaluator('You are a code reviewer', mockLlmCall);

      const result = await evaluator('Some code', 'Task');

      expect(result.status).toBe('NEEDS_IMPROVEMENT');
      expect(result.feedback).toBe('Unknown status');
    });

    it('should support custom parser', async () => {
      const mockLlmCall = vi.fn<[string], Promise<string>>();
      mockLlmCall.mockResolvedValue('{"status": "PASS", "feedback": "Custom parsed"}');

      const customParser = (response: string) => JSON.parse(response);
      const evaluator = createEvaluator('System prompt', mockLlmCall, customParser);

      const result = await evaluator('Content', 'Task');

      expect(result.status).toBe('PASS');
      expect(result.feedback).toBe('Custom parsed');
    });

    it('should handle non-string content by stringifying', async () => {
      const mockLlmCall = vi.fn<[string], Promise<string>>();
      mockLlmCall.mockResolvedValue(
        '<evaluation>PASS</evaluation><feedback>Good object</feedback>'
      );

      const evaluator = createEvaluator<{ code: string }>('You are a reviewer', mockLlmCall);

      await evaluator({ code: 'function test() {}' }, 'Task');

      const prompt = mockLlmCall.mock.calls[0][0];
      expect(prompt).toContain('"code"');
      expect(prompt).toContain('function test() {}');
    });
  });

  describe('Integration test', () => {
    it('should complete a full workflow with mock LLM', async () => {
      // Mock LLM that simulates iterative improvement
      const mockLlmCall = vi.fn<[string], Promise<string>>();

      // First generation
      mockLlmCall.mockResolvedValueOnce(
        '<thoughts>Simple implementation</thoughts><response>function test() { return 1; }</response>'
      );

      // First evaluation - needs improvement
      mockLlmCall.mockResolvedValueOnce(
        '<evaluation>NEEDS_IMPROVEMENT</evaluation><feedback>Missing parameter validation</feedback>'
      );

      // Second generation - improved
      mockLlmCall.mockResolvedValueOnce(
        '<thoughts>Added validation</thoughts><response>function test(x) { if (!x) throw new Error(); return x + 1; }</response>'
      );

      // Second evaluation - pass
      mockLlmCall.mockResolvedValueOnce(
        '<evaluation>PASS</evaluation><feedback>Looks good now!</feedback>'
      );

      const workflow = new EvaluatorOptimizer({ verbose: false, maxIterations: 5 });

      const generator = createGenerator('Generate a function', mockLlmCall);
      const evaluator = createEvaluator('Evaluate the function', mockLlmCall);

      const result = await workflow.run('Create a test function', generator, evaluator);

      expect(result.success).toBe(true);
      expect(result.iterations).toBe(2);
      expect(result.finalSolution).toContain('if (!x)');
      expect(result.steps).toHaveLength(2);
      expect(mockLlmCall).toHaveBeenCalledTimes(4); // 2 generations + 2 evaluations
    });
  });

  describe('Loop result structure', () => {
    it('should provide complete step history', async () => {
      const workflow = new EvaluatorOptimizer({ verbose: false });

      const mockGenerator = vi.fn<[string, string?], Promise<GenerationResult>>();
      mockGenerator
        .mockResolvedValueOnce({
          thoughts: 'First',
          result: 'Result 1',
        })
        .mockResolvedValueOnce({
          thoughts: 'Second',
          result: 'Result 2',
        });

      const mockEvaluator = vi.fn<[string, string], Promise<EvaluationResult>>();
      mockEvaluator
        .mockResolvedValueOnce({
          status: 'NEEDS_IMPROVEMENT',
          feedback: 'Feedback 1',
        })
        .mockResolvedValueOnce({
          status: 'PASS',
          feedback: 'Feedback 2',
        });

      const result = await workflow.run('test', mockGenerator, mockEvaluator);

      expect(result.steps).toHaveLength(2);
      expect(result.steps[0].iteration).toBe(0);
      expect(result.steps[0].generation.thoughts).toBe('First');
      expect(result.steps[0].generation.result).toBe('Result 1');
      expect(result.steps[0].evaluation?.status).toBe('NEEDS_IMPROVEMENT');
      expect(result.steps[1].iteration).toBe(1);
      expect(result.steps[1].generation.thoughts).toBe('Second');
      expect(result.steps[1].evaluation?.status).toBe('PASS');
    });

    it('should track duration', async () => {
      const workflow = new EvaluatorOptimizer({ verbose: false });

      const mockGenerator = vi.fn<[string, string?], Promise<GenerationResult>>();
      mockGenerator.mockResolvedValue({
        thoughts: 'Test',
        result: 'Result',
      });

      const mockEvaluator = vi.fn<[string, string], Promise<EvaluationResult>>();
      mockEvaluator.mockResolvedValue({
        status: 'PASS',
        feedback: 'Good',
      });

      const result = await workflow.run('test', mockGenerator, mockEvaluator);

      expect(result.duration).toBeGreaterThan(0);
      expect(typeof result.duration).toBe('number');
    });
  });
});
