import { Logger } from './Logger';

/**
 * Evaluation result from the evaluator
 */
export interface EvaluationResult {
  /** Evaluation status: PASS, NEEDS_IMPROVEMENT, or FAIL */
  status: 'PASS' | 'NEEDS_IMPROVEMENT' | 'FAIL';
  /** Detailed feedback on what needs improvement */
  feedback: string;
}

/**
 * Generation result from the generator
 */
export interface GenerationResult<T = string> {
  /** The thoughts/reasoning behind the solution */
  thoughts: string;
  /** The generated solution */
  result: T;
}

/**
 * A step in the evaluation-optimization loop
 */
export interface LoopStep<T = string> {
  /** The iteration number (0-indexed) */
  iteration: number;
  /** The generation result for this step */
  generation: GenerationResult<T>;
  /** The evaluation result (undefined for final step if passed) */
  evaluation?: EvaluationResult;
}

/**
 * Final result from the evaluator-optimizer loop
 */
export interface LoopResult<T = string> {
  /** Whether the loop succeeded in generating a passing solution */
  success: boolean;
  /** The final solution that passed evaluation */
  finalSolution?: T;
  /** The final thoughts/reasoning */
  finalThoughts?: string;
  /** All steps taken during the loop */
  steps: LoopStep<T>[];
  /** Total number of iterations */
  iterations: number;
  /** Total duration in milliseconds */
  duration: number;
  /** Error message if loop failed */
  error?: string;
}

/**
 * Configuration for the evaluator-optimizer workflow
 */
export interface EvaluatorOptimizerConfig {
  /** Maximum number of iterations before giving up */
  maxIterations?: number;
  /** Whether to log detailed progress */
  verbose?: boolean;
  /** Logger instance (optional) */
  logger?: Logger;
}

/**
 * Function type for generating solutions
 * @param task - The task description
 * @param context - Additional context (previous attempts, feedback)
 * @returns Generation result with thoughts and solution
 */
export type GeneratorFunction<T = string> = (
  task: string,
  context?: string
) => Promise<GenerationResult<T>>;

/**
 * Function type for evaluating solutions
 * @param content - The content to evaluate
 * @param task - The original task description
 * @returns Evaluation result with status and feedback
 */
export type EvaluatorFunction<T = string> = (
  content: T,
  task: string
) => Promise<EvaluationResult>;

/**
 * Evaluator-Optimizer Workflow
 *
 * This workflow implements an iterative refinement pattern where one function generates
 * a response and another evaluates it in a loop until the requirements are met.
 *
 * @example
 * ```typescript
 * const workflow = new EvaluatorOptimizer({ maxIterations: 5, verbose: true });
 *
 * const generator = async (task: string, context?: string) => ({
 *   thoughts: "My reasoning...",
 *   result: "Generated solution..."
 * });
 *
 * const evaluator = async (content: string, task: string) => ({
 *   status: "PASS",
 *   feedback: "Looks good!"
 * });
 *
 * const result = await workflow.run(
 *   "Implement a binary search function",
 *   generator,
 *   evaluator
 * );
 * ```
 */
export class EvaluatorOptimizer<T = string> {
  private readonly config: Required<EvaluatorOptimizerConfig>;
  private readonly logger: Logger;

  constructor(config: EvaluatorOptimizerConfig = {}) {
    this.config = {
      maxIterations: config.maxIterations ?? 10,
      verbose: config.verbose ?? true,
      logger: config.logger ?? new Logger({ level: 'info', agent: 'EvaluatorOptimizer' }),
    };
    this.logger = this.config.logger;
  }

  /**
   * Run the evaluator-optimizer loop
   *
   * @param task - The task description
   * @param generator - Function to generate solutions
   * @param evaluator - Function to evaluate solutions
   * @returns Loop result with final solution and complete history
   */
  async run(
    task: string,
    generator: GeneratorFunction<T>,
    evaluator: EvaluatorFunction<T>
  ): Promise<LoopResult<T>> {
    const startTime = Date.now();
    const steps: LoopStep<T>[] = [];
    const memory: T[] = [];
    const feedbackHistory: string[] = [];

    this.logger.info('Starting evaluator-optimizer loop', { task });

    try {
      for (let iteration = 0; iteration < this.config.maxIterations; iteration++) {
        // Build context from previous attempts
        const context = this.buildContext(memory, feedbackHistory);

        // Generate solution
        this.logVerbose(`\n=== ITERATION ${iteration + 1} - GENERATION START ===`);
        const generation = await generator(task, context || undefined);
        this.logVerbose(`Thoughts: ${generation.thoughts}`);
        this.logVerbose(`Generated: ${this.formatResult(generation.result)}`);
        this.logVerbose('=== GENERATION END ===\n');

        memory.push(generation.result);

        // Evaluate solution
        this.logVerbose('=== EVALUATION START ===');
        const evaluation = await evaluator(generation.result, task);
        this.logVerbose(`Status: ${evaluation.status}`);
        this.logVerbose(`Feedback: ${evaluation.feedback}`);
        this.logVerbose('=== EVALUATION END ===\n');

        // Record step
        steps.push({ iteration, generation, evaluation });

        // Check if we're done
        if (evaluation.status === 'PASS') {
          const duration = Date.now() - startTime;
          this.logger.info('Loop completed successfully', {
            iterations: iteration + 1,
            duration,
          });

          return {
            success: true,
            finalSolution: generation.result,
            finalThoughts: generation.thoughts,
            steps,
            iterations: iteration + 1,
            duration,
          };
        }

        if (evaluation.status === 'FAIL') {
          const duration = Date.now() - startTime;
          this.logger.warn('Loop failed - evaluation returned FAIL', {
            iteration: iteration + 1,
            feedback: evaluation.feedback,
          });

          return {
            success: false,
            steps,
            iterations: iteration + 1,
            duration,
            error: `Evaluation failed: ${evaluation.feedback}`,
          };
        }

        // Continue with feedback
        feedbackHistory.push(evaluation.feedback);
      }

      // Max iterations reached
      const duration = Date.now() - startTime;
      this.logger.warn('Loop terminated - max iterations reached', {
        maxIterations: this.config.maxIterations,
        duration,
      });

      return {
        success: false,
        steps,
        iterations: this.config.maxIterations,
        duration,
        error: `Max iterations (${this.config.maxIterations}) reached without passing evaluation`,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error('Loop failed with error', {
        error: errorMessage,
        duration,
        steps: steps.length,
      });

      return {
        success: false,
        steps,
        iterations: steps.length,
        duration,
        error: errorMessage,
      };
    }
  }

  /**
   * Build context string from memory and feedback
   */
  private buildContext(memory: T[], feedbackHistory: string[]): string {
    if (memory.length === 0) {
      return '';
    }

    const contextParts: string[] = ['Previous attempts:'];

    for (let i = 0; i < memory.length; i++) {
      contextParts.push(`- Attempt ${i + 1}: ${this.formatResult(memory[i])}`);
    }

    if (feedbackHistory.length > 0) {
      const latestFeedback = feedbackHistory[feedbackHistory.length - 1];
      contextParts.push(`\nLatest feedback: ${latestFeedback}`);
    }

    return contextParts.join('\n');
  }

  /**
   * Format result for display (truncate if too long)
   */
  private formatResult(result: T): string {
    const str = typeof result === 'string' ? result : JSON.stringify(result);
    const maxLength = 200;

    if (str.length <= maxLength) {
      return str;
    }

    return str.substring(0, maxLength) + '... (truncated)';
  }

  /**
   * Log verbose message if verbose mode is enabled
   */
  private logVerbose(message: string): void {
    if (this.config.verbose) {
      this.logger.info(message);
    }
  }
}

/**
 * Utility function to extract content from XML-like tags
 * Useful for parsing structured LLM responses
 *
 * @param text - The text containing XML-like tags
 * @param tag - The tag name to extract
 * @returns The content within the tags, or empty string if not found
 *
 * @example
 * ```typescript
 * const response = "<thoughts>My reasoning</thoughts><result>Final answer</result>";
 * const thoughts = extractXml(response, "thoughts"); // "My reasoning"
 * const result = extractXml(response, "result"); // "Final answer"
 * ```
 */
export function extractXml(text: string, tag: string): string {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i');
  const match = text.match(regex);
  return match ? match[1].trim() : '';
}

/**
 * Helper to create a simple LLM-based generator function
 * This is a template that can be customized for specific use cases
 *
 * @param systemPrompt - The system prompt for the generator
 * @param llmCall - Function to call the LLM
 * @returns A generator function
 */
export function createGenerator<T = string>(
  systemPrompt: string,
  llmCall: (prompt: string) => Promise<string>,
  parser?: (response: string) => GenerationResult<T>
): GeneratorFunction<T> {
  const defaultParser = (response: string): GenerationResult<T> => {
    const thoughts = extractXml(response, 'thoughts');
    const result = extractXml(response, 'response') || extractXml(response, 'result');
    return {
      thoughts,
      result: result as T,
    };
  };

  const parseResponse = parser || defaultParser;

  return async (task: string, context?: string): Promise<GenerationResult<T>> => {
    const fullPrompt = context
      ? `${systemPrompt}\n${context}\nTask: ${task}`
      : `${systemPrompt}\nTask: ${task}`;

    const response = await llmCall(fullPrompt);
    return parseResponse(response);
  };
}

/**
 * Helper to create a simple LLM-based evaluator function
 * This is a template that can be customized for specific use cases
 *
 * @param systemPrompt - The system prompt for the evaluator
 * @param llmCall - Function to call the LLM
 * @returns An evaluator function
 */
export function createEvaluator<T = string>(
  systemPrompt: string,
  llmCall: (prompt: string) => Promise<string>,
  parser?: (response: string) => EvaluationResult
): EvaluatorFunction<T> {
  const defaultParser = (response: string): EvaluationResult => {
    const statusText = extractXml(response, 'evaluation').toUpperCase();
    const status = ['PASS', 'NEEDS_IMPROVEMENT', 'FAIL'].includes(statusText)
      ? (statusText as 'PASS' | 'NEEDS_IMPROVEMENT' | 'FAIL')
      : 'NEEDS_IMPROVEMENT';
    const feedback = extractXml(response, 'feedback');

    return { status, feedback };
  };

  const parseResponse = parser || defaultParser;

  return async (content: T, task: string): Promise<EvaluationResult> => {
    const contentStr = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    const fullPrompt = `${systemPrompt}\n\nOriginal task: ${task}\n\nContent to evaluate:\n${contentStr}`;

    const response = await llmCall(fullPrompt);
    return parseResponse(response);
  };
}
