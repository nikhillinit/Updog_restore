/**
 * Token Budget Manager
 *
 * Manages token allocation across different components of agent execution:
 * - Conversation history
 * - Memory retrieval
 * - Pattern context
 * - Response generation
 *
 * Prevents token exhaustion and ensures balanced resource usage.
 *
 * @example
 * ```typescript
 * const manager = new TokenBudgetManager(8192);
 * const budget = manager.allocate();
 *
 * // Use budget for different components
 * const history = truncateToTokens(fullHistory, budget.conversationHistory);
 * const memories = truncateToTokens(allMemories, budget.memoryRetrieval);
 * ```
 */

import { logger } from './Logger.js';

/**
 * Token budget allocation across components
 */
export interface TokenBudget {
  /** Total available tokens */
  total: number;

  /** Allocated tokens per component */
  allocated: {
    /** Conversation history (messages, files) */
    conversationHistory: number;

    /** Memory retrieval results */
    memoryRetrieval: number;

    /** Pattern learning context */
    patternContext: number;

    /** Response generation (max_tokens) */
    response: number;

    /** System prompt (fixed) */
    systemPrompt: number;
  };

  /** Remaining unallocated tokens (buffer) */
  buffer: number;
}

/**
 * Token usage tracking
 */
export interface TokenUsage {
  component: keyof TokenBudget['allocated'];
  estimated: number;
  actual?: number;
}

/**
 * Budget allocation strategy
 */
export interface AllocationStrategy {
  /** Percentage for conversation history (0-1) */
  conversationHistoryPercent: number;

  /** Percentage for memory retrieval (0-1) */
  memoryRetrievalPercent: number;

  /** Percentage for pattern context (0-1) */
  patternContextPercent: number;

  /** Percentage for response (0-1) */
  responsePercent: number;

  /** Fixed tokens for system prompt */
  systemPromptTokens: number;

  /** Buffer percentage (0-1) */
  bufferPercent: number;
}

/**
 * Default allocation strategy
 *
 * Based on typical agent workload:
 * - History: 30% (context from previous turns)
 * - Memory: 15% (retrieved memories)
 * - Patterns: 10% (learned insights)
 * - Response: 40% (Claude's output)
 * - Buffer: 5% (safety margin)
 */
const DEFAULT_STRATEGY: AllocationStrategy = {
  conversationHistoryPercent: 0.30,
  memoryRetrievalPercent: 0.15,
  patternContextPercent: 0.10,
  responsePercent: 0.40,
  systemPromptTokens: 500, // Fixed estimate for system prompt
  bufferPercent: 0.05,
};

/**
 * Token Budget Manager
 *
 * Intelligently allocates tokens across agent execution components.
 */
export class TokenBudgetManager {
  private readonly totalTokens: number;
  private readonly strategy: AllocationStrategy;
  private usageTracking: TokenUsage[] = [];

  constructor(
    totalTokens: number = 8192,
    strategy: Partial<AllocationStrategy> = {}
  ) {
    this.totalTokens = totalTokens;
    this.strategy = { ...DEFAULT_STRATEGY, ...strategy };

    // Validate strategy
    this.validateStrategy();
  }

  /**
   * Allocate tokens according to strategy
   *
   * @returns Token budget with allocations per component
   */
  allocate(): TokenBudget {
    const availableForAllocation = this.totalTokens - this.strategy.systemPromptTokens;

    const conversationHistory = Math.floor(
      availableForAllocation * this.strategy.conversationHistoryPercent
    );
    const memoryRetrieval = Math.floor(
      availableForAllocation * this.strategy.memoryRetrievalPercent
    );
    const patternContext = Math.floor(
      availableForAllocation * this.strategy.patternContextPercent
    );
    const response = Math.floor(
      availableForAllocation * this.strategy.responsePercent
    );
    const buffer = Math.floor(
      availableForAllocation * this.strategy.bufferPercent
    );

    const budget: TokenBudget = {
      total: this.totalTokens,
      allocated: {
        conversationHistory,
        memoryRetrieval,
        patternContext,
        response,
        systemPrompt: this.strategy.systemPromptTokens,
      },
      buffer,
    };

    logger.debug({
      msg: 'Token budget allocated',
      budget,
    });

    return budget;
  }

  /**
   * Track actual token usage for a component
   *
   * @param component - Component that used tokens
   * @param estimated - Estimated tokens (from allocation)
   * @param actual - Actual tokens used (from API response)
   */
  trackUsage(
    component: keyof TokenBudget['allocated'],
    estimated: number,
    actual?: number
  ): void {
    this.usageTracking.push({ component, estimated, actual });

    if (actual && actual > estimated) {
      logger.warn({
        msg: 'Component exceeded token budget',
        component,
        estimated,
        actual,
        overage: actual - estimated,
      });
    }
  }

  /**
   * Get usage statistics
   *
   * @returns Summary of token usage vs budget
   */
  getUsageStats(): {
    totalEstimated: number;
    totalActual: number;
    byComponent: Record<string, { estimated: number; actual: number; efficiency: number }>;
  } {
    const byComponent: Record<string, { estimated: number; actual: number; efficiency: number }> = {};

    let totalEstimated = 0;
    let totalActual = 0;

    for (const usage of this.usageTracking) {
      if (!byComponent[usage.component]) {
        byComponent[usage.component] = { estimated: 0, actual: 0, efficiency: 0 };
      }

      byComponent[usage.component].estimated += usage.estimated;
      if (usage.actual) {
        byComponent[usage.component].actual += usage.actual;
      }

      totalEstimated += usage.estimated;
      if (usage.actual) {
        totalActual += usage.actual;
      }
    }

    // Calculate efficiency (actual / estimated)
    for (const component in byComponent) {
      const stats = byComponent[component];
      stats.efficiency = stats.actual > 0 ? stats.actual / stats.estimated : 0;
    }

    return {
      totalEstimated,
      totalActual,
      byComponent,
    };
  }

  /**
   * Clear usage tracking
   */
  clearUsageTracking(): void {
    this.usageTracking = [];
  }

  /**
   * Validate allocation strategy percentages sum to ≤ 1.0
   */
  private validateStrategy(): void {
    const sum =
      this.strategy.conversationHistoryPercent +
      this.strategy.memoryRetrievalPercent +
      this.strategy.patternContextPercent +
      this.strategy.responsePercent +
      this.strategy.bufferPercent;

    if (sum > 1.0) {
      throw new Error(
        `Invalid allocation strategy: percentages sum to ${sum.toFixed(2)} (must be ≤ 1.0)`
      );
    }

    // Warn if sum is much less than 1.0 (wasted tokens)
    if (sum < 0.90) {
      logger.warn({
        msg: 'Token allocation strategy may be inefficient',
        totalAllocated: `${(sum * 100).toFixed(0)}%`,
        wasted: `${((1 - sum) * 100).toFixed(0)}%`,
      });
    }
  }

  /**
   * Suggest reallocation based on actual usage patterns
   *
   * Analyzes historical usage to recommend strategy adjustments.
   *
   * @returns Suggested strategy adjustments
   */
  suggestReallocation(): Partial<AllocationStrategy> {
    const stats = this.getUsageStats();

    const suggestions: Partial<AllocationStrategy> = {};

    for (const [component, data] of Object.entries(stats.byComponent)) {
      // If actual usage is consistently < 70% of estimated, reduce allocation
      if (data.efficiency < 0.70 && data.actual > 0) {
        const key = `${component}Percent` as keyof AllocationStrategy;
        const current = this.strategy[key] as number;
        suggestions[key] = current * 0.85 as any; // Reduce by 15%

        logger.info({
          msg: 'Suggesting token reallocation',
          component,
          currentAllocation: `${(current * 100).toFixed(0)}%`,
          suggestedAllocation: `${(suggestions[key] as number * 100).toFixed(0)}%`,
          reason: `Low utilization (${(data.efficiency * 100).toFixed(0)}%)`,
        });
      }

      // If actual usage is consistently > 90% of estimated, increase allocation
      if (data.efficiency > 0.90 && data.actual > 0) {
        const key = `${component}Percent` as keyof AllocationStrategy;
        const current = this.strategy[key] as number;
        suggestions[key] = current * 1.15 as any; // Increase by 15%

        logger.info({
          msg: 'Suggesting token reallocation',
          component,
          currentAllocation: `${(current * 100).toFixed(0)}%`,
          suggestedAllocation: `${(suggestions[key] as number * 100).toFixed(0)}%`,
          reason: `High utilization (${(data.efficiency * 100).toFixed(0)}%)`,
        });
      }
    }

    return suggestions;
  }
}

/**
 * Estimate tokens in text (rough approximation)
 *
 * Uses a simple heuristic: ~4 characters per token on average.
 * For more accurate estimates, use a proper tokenizer like tiktoken.
 *
 * @param text - Text to estimate
 * @returns Estimated token count
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Truncate text to fit within token budget
 *
 * @param text - Text to truncate
 * @param maxTokens - Maximum tokens allowed
 * @param strategy - 'start' | 'end' | 'middle' (default: 'end')
 * @returns Truncated text
 */
export function truncateToTokens(
  text: string,
  maxTokens: number,
  strategy: 'start' | 'end' | 'middle' = 'end'
): string {
  const estimated = estimateTokens(text);

  if (estimated <= maxTokens) {
    return text;
  }

  const maxChars = maxTokens * 4; // Approximate characters

  switch (strategy) {
    case 'start':
      return `${text.slice(0, maxChars)  }\n\n[... truncated ...]`;

    case 'end':
      return `[... truncated ...]\n\n${  text.slice(-maxChars)}`;

    case 'middle':
      const halfChars = Math.floor(maxChars / 2);
      return (
        `${text.slice(0, halfChars) 
        }\n\n[... truncated ...]\n\n${ 
        text.slice(-halfChars)}`
      );
  }
}
