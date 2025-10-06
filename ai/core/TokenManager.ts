import { Gauge, Histogram } from 'prom-client';
import { logger } from '@/lib/logger';
import { BudgetExceededError } from './errors';

/**
 * TokenManager: Budget enforcement and cost control for AI operations
 *
 * Features:
 * - Hard budget limits with BudgetExceededError
 * - Graceful truncation strategies
 * - Prometheus metrics export
 */

// Prometheus metrics
const tokenBudgetUsed = new Gauge({
  name: 'ai_token_budget_used_total',
  help: 'Total tokens used across all operations',
  labelNames: ['operation'],
});

const tokenBudgetLimit = new Gauge({
  name: 'ai_token_budget_limit',
  help: 'Configured token budget limit',
});

const tokenCostUsd = new Histogram({
  name: 'ai_token_cost_usd',
  help: 'Cost in USD per operation',
  labelNames: ['operation'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1.0, 5.0, 10.0],
});

export interface TokenBudget {
  maxTokens: number;
  maxUsd: number;
  costPerToken: number; // USD per token
}

export class TokenManager {
  private currentSpendUsd = 0;
  private tokensUsed = 0;

  constructor(
    private budget: TokenBudget,
    private operation = 'default'
  ) {
    tokenBudgetLimit.set(budget.maxUsd);
    logger.debug('TokenManager initialized', {
      operation,
      maxUsd: budget.maxUsd,
      maxTokens: budget.maxTokens,
    });
  }

  /**
   * Assert that spending is within budget
   * Throws BudgetExceededError if limit exceeded
   */
  assertWithinBudget(additionalSpendUsd: number): void {
    const projected = this.currentSpendUsd + additionalSpendUsd;

    if (projected > this.budget.maxUsd) {
      logger.warn('Budget exceeded', {
        operation: this.operation,
        current: this.currentSpendUsd,
        additional: additionalSpendUsd,
        limit: this.budget.maxUsd,
      });

      throw new BudgetExceededError(
        projected,
        this.budget.maxUsd,
        this.operation
      );
    }
  }

  /**
   * Record token usage and cost
   */
  recordUsage(tokens: number): void {
    const costUsd = tokens * this.budget.costPerToken;
    this.tokensUsed += tokens;
    this.currentSpendUsd += costUsd;

    // Update Prometheus metrics
    tokenBudgetUsed.set({ operation: this.operation }, this.tokensUsed);
    tokenCostUsd.observe({ operation: this.operation }, costUsd);

    logger.debug('Token usage recorded', {
      operation: this.operation,
      tokens,
      costUsd: costUsd.toFixed(4),
      totalSpend: this.currentSpendUsd.toFixed(4),
    });
  }

  /**
   * Suggest truncation to fit within remaining budget
   * Returns max tokens that can be used without exceeding budget
   */
  suggestTruncation(targetTokens: number): number {
    const remainingBudgetUsd = this.budget.maxUsd - this.currentSpendUsd;
    const maxAffordableTokens = Math.floor(remainingBudgetUsd / this.budget.costPerToken);

    const truncated = Math.max(0, Math.min(targetTokens, maxAffordableTokens));

    if (truncated < targetTokens) {
      logger.info('Token truncation suggested', {
        operation: this.operation,
        targetTokens,
        truncatedTokens: truncated,
        savingsUsd: ((targetTokens - truncated) * this.budget.costPerToken).toFixed(4),
      });
    }

    return truncated;
  }

  /**
   * Get current usage statistics
   */
  getUsage(): {
    tokensUsed: number;
    spendUsd: number;
    remainingUsd: number;
    utilizationPercent: number;
  } {
    return {
      tokensUsed: this.tokensUsed,
      spendUsd: this.currentSpendUsd,
      remainingUsd: this.budget.maxUsd - this.currentSpendUsd,
      utilizationPercent: (this.currentSpendUsd / this.budget.maxUsd) * 100,
    };
  }

  /**
   * Reset usage counters (for new operations)
   */
  reset(): void {
    this.tokensUsed = 0;
    this.currentSpendUsd = 0;
    logger.debug('TokenManager reset', { operation: this.operation });
  }
}
