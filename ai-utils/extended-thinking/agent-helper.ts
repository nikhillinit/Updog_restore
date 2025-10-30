/**
 * Extended Thinking Agent Helper
 *
 * Specialized utilities for integrating extended thinking into autonomous AI agents.
 * Designed for use in the packages/agent-core framework.
 *
 * @module ai-utils/extended-thinking/agent-helper
 */

import { ExtendedThinkingAgent, ThinkingResult, MODELS } from './index';
import type Anthropic from '@anthropic-ai/sdk';

export interface AgentThinkingContext {
  taskName: string;
  complexity: 'simple' | 'moderate' | 'complex' | 'very-complex';
  maxThinkingBudget?: number;
  retryOnError?: boolean;
}

export interface AgentThinkingMetrics {
  taskName: string;
  modelUsed: string;
  thinkingBudget: number;
  thinkingChars: number;
  answerChars: number;
  durationMs: number;
  tokensEstimate: number;
  success: boolean;
  error?: string;
}

export interface StepResult {
  step: number;
  description: string;
  result: ThinkingResult;
  metrics: AgentThinkingMetrics;
}

/**
 * Recommended thinking budgets by complexity
 */
export const COMPLEXITY_BUDGETS: Record<AgentThinkingContext['complexity'], number> = {
  simple: 1024,
  moderate: 2000,
  complex: 4000,
  'very-complex': 8000,
};

/**
 * Agent-specific Extended Thinking Helper
 *
 * Provides enhanced capabilities for autonomous agents:
 * - Auto-scaling thinking budgets based on task complexity
 * - Metrics collection and logging
 * - Error recovery with budget adjustment
 * - Multi-step reasoning chains
 *
 * @example
 * ```typescript
 * const helper = new AgentThinkingHelper('sonnet-4.5');
 *
 * const result = await helper.agentThink(
 *   'Analyze waterfall distribution for $100M fund with 20% carry',
 *   {
 *     taskName: 'waterfall-analysis',
 *     complexity: 'complex'
 *   }
 * );
 *
 * console.log(result.metrics);
 * ```
 */
export class AgentThinkingHelper {
  private agent: ExtendedThinkingAgent;
  private metrics: AgentThinkingMetrics[] = [];

  constructor(
    modelKey: string = 'sonnet-4.5',
    options?: {
      apiKey?: string;
      defaultMaxTokens?: number;
    }
  ) {
    this.agent = new ExtendedThinkingAgent(modelKey, {
      apiKey: options?.apiKey,
      maxTokens: options?.defaultMaxTokens || 8000,
    });
  }

  /**
   * Execute thinking task with agent-specific enhancements
   */
  async agentThink(
    prompt: string,
    context: AgentThinkingContext
  ): Promise<{ result: ThinkingResult; metrics: AgentThinkingMetrics }> {
    const startTime = Date.now();
    const thinkingBudget = context.maxThinkingBudget || COMPLEXITY_BUDGETS[context.complexity];

    try {
      const result = await this.agent.think(prompt, {
        thinkingBudget,
      });

      const metrics: AgentThinkingMetrics = {
        taskName: context.taskName,
        modelUsed: this.agent.getModelConfig().id,
        thinkingBudget,
        thinkingChars: result.thinkingChars,
        answerChars: result.answerChars,
        durationMs: Date.now() - startTime,
        tokensEstimate: this.estimateTokens(result),
        success: true,
      };

      this.metrics.push(metrics);

      return { result, metrics };
    } catch (error) {
      const metrics: AgentThinkingMetrics = {
        taskName: context.taskName,
        modelUsed: this.agent.getModelConfig().id,
        thinkingBudget,
        thinkingChars: 0,
        answerChars: 0,
        durationMs: Date.now() - startTime,
        tokensEstimate: 0,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };

      this.metrics.push(metrics);

      // Retry with reduced budget if enabled
      if (context.retryOnError && error instanceof Error) {
        if (error.message.includes('context window') || error.message.includes('too long')) {
          const reducedBudget = Math.floor(thinkingBudget * 0.5);
          if (reducedBudget >= MODELS[this.agent.getModelConfig().id]?.minThinkingTokens || 1024) {
            console.warn(
              `[AgentThinkingHelper] Retrying ${context.taskName} with reduced budget: ${reducedBudget}`
            );
            return this.agentThink(prompt, {
              ...context,
              maxThinkingBudget: reducedBudget,
              retryOnError: false, // Prevent infinite retry
            });
          }
        }
      }

      throw error;
    }
  }

  /**
   * Execute multi-step reasoning chain with progress tracking
   */
  async reasoningChain(
    steps: Array<{
      description: string;
      prompt: string;
      complexity?: AgentThinkingContext['complexity'];
    }>,
    context: { taskName: string }
  ): Promise<StepResult[]> {
    const results: StepResult[] = [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepNumber = i + 1;

      console.log(`[AgentThinkingHelper] Step ${stepNumber}/${steps.length}: ${step.description}`);

      const { result, metrics } = await this.agentThink(step.prompt, {
        taskName: `${context.taskName}-step${stepNumber}`,
        complexity: step.complexity || 'moderate',
      });

      results.push({
        step: stepNumber,
        description: step.description,
        result,
        metrics,
      });

      console.log(
        `[AgentThinkingHelper] ✓ Step ${stepNumber} complete (${metrics.durationMs}ms, ~${metrics.tokensEstimate} tokens)`
      );
    }

    return results;
  }

  /**
   * Stream thinking with progress callbacks
   */
  async streamWithProgress(
    prompt: string,
    context: AgentThinkingContext,
    callbacks: {
      onThinking?: (chunk: string) => void;
      onText?: (chunk: string) => void;
      onComplete?: (metrics: AgentThinkingMetrics) => void;
    }
  ): Promise<{ thinking: string; answer: string; metrics: AgentThinkingMetrics }> {
    const startTime = Date.now();
    const thinkingBudget = context.maxThinkingBudget || COMPLEXITY_BUDGETS[context.complexity];

    let thinking = '';
    let answer = '';

    try {
      const stream = this.agent.thinkStream(prompt, { thinkingBudget });

      for await (const chunk of stream) {
        if (chunk.type === 'thinking') {
          thinking += chunk.content;
          callbacks.onThinking?.(chunk.content);
        } else if (chunk.type === 'text') {
          answer += chunk.content;
          callbacks.onText?.(chunk.content);
        }
      }

      const metrics: AgentThinkingMetrics = {
        taskName: context.taskName,
        modelUsed: this.agent.getModelConfig().id,
        thinkingBudget,
        thinkingChars: thinking.length,
        answerChars: answer.length,
        durationMs: Date.now() - startTime,
        tokensEstimate: Math.ceil((thinking.length + answer.length) / 4),
        success: true,
      };

      this.metrics.push(metrics);
      callbacks.onComplete?.(metrics);

      return { thinking, answer, metrics };
    } catch (error) {
      const metrics: AgentThinkingMetrics = {
        taskName: context.taskName,
        modelUsed: this.agent.getModelConfig().id,
        thinkingBudget,
        thinkingChars: thinking.length,
        answerChars: answer.length,
        durationMs: Date.now() - startTime,
        tokensEstimate: 0,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };

      this.metrics.push(metrics);
      throw error;
    }
  }

  /**
   * Analyze thinking patterns for optimization
   */
  analyzeMetrics(): {
    totalTasks: number;
    successRate: number;
    avgThinkingChars: number;
    avgDurationMs: number;
    totalEstimatedTokens: number;
    byComplexity: Record<string, { count: number; avgDuration: number }>;
  } {
    if (this.metrics.length === 0) {
      return {
        totalTasks: 0,
        successRate: 0,
        avgThinkingChars: 0,
        avgDurationMs: 0,
        totalEstimatedTokens: 0,
        byComplexity: {},
      };
    }

    const successful = this.metrics.filter((m) => m.success);
    const successRate = successful.length / this.metrics.length;

    const avgThinkingChars =
      successful.reduce((sum, m) => sum + m.thinkingChars, 0) / successful.length || 0;

    const avgDurationMs =
      successful.reduce((sum, m) => sum + m.durationMs, 0) / successful.length || 0;

    const totalEstimatedTokens = this.metrics.reduce((sum, m) => sum + m.tokensEstimate, 0);

    // Group by complexity (inferred from budget)
    const byComplexity: Record<string, { count: number; avgDuration: number }> = {};

    for (const metric of this.metrics) {
      const complexity = this.inferComplexity(metric.thinkingBudget);
      if (!byComplexity[complexity]) {
        byComplexity[complexity] = { count: 0, avgDuration: 0 };
      }
      byComplexity[complexity].count++;
      byComplexity[complexity].avgDuration += metric.durationMs;
    }

    // Calculate averages
    for (const complexity in byComplexity) {
      byComplexity[complexity].avgDuration /= byComplexity[complexity].count;
    }

    return {
      totalTasks: this.metrics.length,
      successRate,
      avgThinkingChars,
      avgDurationMs,
      totalEstimatedTokens,
      byComplexity,
    };
  }

  /**
   * Get all collected metrics
   */
  getMetrics(): AgentThinkingMetrics[] {
    return [...this.metrics];
  }

  /**
   * Clear metrics history
   */
  clearMetrics(): void {
    this.metrics = [];
  }

  /**
   * Export metrics as JSON
   */
  exportMetrics(): string {
    return JSON.stringify(
      {
        collectedAt: new Date().toISOString(),
        metrics: this.metrics,
        analysis: this.analyzeMetrics(),
      },
      null,
      2
    );
  }

  /**
   * Estimate tokens from result (rough approximation)
   */
  private estimateTokens(result: ThinkingResult): number {
    // Rough estimate: ~4 chars per token
    const totalChars = result.thinkingChars + result.answerChars;
    return Math.ceil(totalChars / 4);
  }

  /**
   * Infer complexity from thinking budget
   */
  private inferComplexity(budget: number): string {
    if (budget <= 1024) return 'simple';
    if (budget <= 2000) return 'moderate';
    if (budget <= 4000) return 'complex';
    return 'very-complex';
  }
}

/**
 * Quick helper for agent tasks
 */
export async function agentThink(
  prompt: string,
  taskName: string,
  complexity: AgentThinkingContext['complexity'] = 'moderate'
): Promise<ThinkingResult> {
  const helper = new AgentThinkingHelper();
  const { result } = await helper.agentThink(prompt, { taskName, complexity });
  return result;
}

/**
 * Helper for waterfall-specific thinking tasks
 */
export async function waterfallThink(
  prompt: string,
  options?: { complexity?: AgentThinkingContext['complexity'] }
): Promise<ThinkingResult> {
  return agentThink(prompt, 'waterfall-calculation', options?.complexity || 'complex');
}

/**
 * Helper for pacing analysis thinking tasks
 */
export async function pacingThink(
  prompt: string,
  options?: { complexity?: AgentThinkingContext['complexity'] }
): Promise<ThinkingResult> {
  return agentThink(prompt, 'pacing-analysis', options?.complexity || 'complex');
}

/**
 * Helper for reserve calculation thinking tasks
 */
export async function reserveThink(
  prompt: string,
  options?: { complexity?: AgentThinkingContext['complexity'] }
): Promise<ThinkingResult> {
  return agentThink(prompt, 'reserve-calculation', options?.complexity || 'complex');
}

/**
 * Helper for Monte Carlo simulation thinking tasks
 */
export async function monteCarloThink(
  prompt: string,
  options?: { complexity?: AgentThinkingContext['complexity'] }
): Promise<ThinkingResult> {
  return agentThink(prompt, 'monte-carlo-simulation', options?.complexity || 'very-complex');
}
