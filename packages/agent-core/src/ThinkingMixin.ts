/**
 * ThinkingMixin - Extended Thinking Integration for Autonomous Agents
 *
 * Provides interleaved thinking capabilities to any agent via mixin pattern.
 * Zero breaking changes, opt-in integration, automatic cost tracking.
 *
 * Usage:
 *   class MyAgent extends applyThinkingMixin(BaseAgent) {
 *     async run(input) {
 *       const analysis = await this.think('Analyze this...', { depth: 'deep' });
 *       return this.processThinking(analysis);
 *     }
 *   }
 *
 * @see server/routes/interleaved-thinking.ts for API spec
 */

import { Logger } from './Logger';
import { MetricsCollector } from './MetricsCollector';

// ============================================================================
// Types
// ============================================================================

export interface ThinkingOptions {
  /** Quick (2K tokens) or deep (8K tokens) thinking */
  depth?: 'quick' | 'deep';

  /** Additional context for the thinking process */
  context?: string;

  /** Enable tool use (calculator, database queries) */
  enableTools?: boolean;

  /** Override thinking token budget */
  thinkingBudget?: number;

  /** Override max output tokens */
  maxTokens?: number;

  /** Temperature for response generation (0-1) */
  temperature?: number;
}

export interface ThinkingResult {
  /** Final response from the model */
  response: string;

  /** Array of thinking blocks (extended reasoning process) */
  thinking: string[];

  /** Tool uses during thinking (calculator, database) */
  toolUses?: Array<{
    name: string;
    input: unknown;
    output: unknown;
  }>;

  /** Token usage statistics */
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };

  /** Cost tracking in USD */
  cost?: {
    input_cost_usd: number;
    output_cost_usd: number;
    total_cost_usd: number;
  };

  /** Duration of thinking operation in ms */
  duration: number;
}

export interface CostBudget {
  /** Total budget allocated in USD */
  total: number;

  /** Amount spent so far in USD */
  spent: number;

  /** Remaining budget in USD */
  get remaining(): number;
}

export interface ThinkingCapabilities {
  /** Execute extended thinking query */
  think(query: string, options?: ThinkingOptions): Promise<ThinkingResult>;

  /** Analyze topic with automatic depth selection */
  analyze(topic: string, context?: string): Promise<ThinkingResult>;

  /** Decide optimal thinking depth based on complexity */
  decideThinkingDepth(task: string, budget?: CostBudget): Promise<'quick' | 'deep' | 'skip'>;

  /** Get current cost budget status */
  getThinkingBudget(): CostBudget;

  /** Check if thinking is available and configured */
  isThinkingAvailable(): Promise<boolean>;
}

// ============================================================================
// Cost Budget Implementation
// ============================================================================

class CostBudgetImpl implements CostBudget {
  constructor(
    public total: number,
    public spent: number = 0
  ) {}

  get remaining(): number {
    return Math.max(0, this.total - this.spent);
  }

  canAfford(estimatedCost: number): boolean {
    return this.remaining >= estimatedCost;
  }

  recordSpend(cost: number): void {
    this.spent += cost;
  }
}

// ============================================================================
// Mixin Factory
// ============================================================================

/**
 * Apply thinking capabilities to any BaseAgent class
 *
 * @example
 * class TestRepairAgent extends applyThinkingMixin(BaseAgent) {
 *   async run(input) {
 *     const analysis = await this.think('Analyze failure...', { depth: 'deep' });
 *     return this.repairFromThinking(analysis);
 *   }
 * }
 */
export function applyThinkingMixin<TBase extends new (...args: never[]) => object>(
  Base: TBase
) {
  return class ThinkingEnabled extends Base implements ThinkingCapabilities {
    private thinkingBudget: CostBudgetImpl;
    private thinkingApiUrl: string;
    protected thinkingLogger!: Logger;
    protected thinkingMetrics!: MetricsCollector;

    constructor(...args: never[]) {
      super(...args);

      // Initialize thinking-specific infrastructure
      this.thinkingApiUrl = process.env['API_BASE_URL'] || 'http://localhost:5000';
      this.thinkingBudget = new CostBudgetImpl(
        parseFloat(process.env['AGENT_THINKING_BUDGET'] || '1.0') // $1 default
      );

      // Use existing logger/metrics if available, otherwise create new
      if ('logger' in this && this.logger instanceof Logger) {
        this.thinkingLogger = this.logger as Logger;
      } else {
        this.thinkingLogger = new Logger({
          level: 'info',
          agent: this.constructor.name
        });
      }

      if ('metrics' in this && this.metrics instanceof MetricsCollector) {
        this.thinkingMetrics = this.metrics as MetricsCollector;
      } else {
        this.thinkingMetrics = MetricsCollector.getInstance();
      }
    }

    /**
     * Execute extended thinking query
     * Automatically handles API calls, logging, cost tracking
     */
    async think(
      query: string,
      options: ThinkingOptions = {}
    ): Promise<ThinkingResult> {
      const startTime = Date.now();
      const depth = options.depth || 'quick';

      this.thinkingLogger.debug('Starting extended thinking', {
        depth,
        query_length: query.length,
        budget_remaining: this.thinkingBudget.remaining
      });

      try {
        // Create abort controller for timeout (60 seconds)
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000);

        try {
          // Call interleaved thinking API
          const response = await fetch(
            `${this.thinkingApiUrl}/api/interleaved-thinking/analyze`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                topic: query,
                depth,
                context: options.context || ''
              }),
              signal: controller.signal
            }
          );

          clearTimeout(timeout);

          if (!response.ok) {
            // Provide specific error details for better debugging
            const errorBody = await response.text().catch(() => 'Unable to read error body');
            if (response.status === 429) {
              throw new Error(`Rate limit exceeded. Retry after ${response.headers.get('Retry-After') || 'unknown'} seconds`);
            } else if (response.status === 503) {
              throw new Error(`Thinking API unavailable: ${errorBody}`);
            } else {
              throw new Error(`Thinking API error ${response.status}: ${errorBody}`);
            }
          }

          const result = await response.json();
          const duration = Date.now() - startTime;

          // Validate and track costs - estimate if missing
          let recordedCost = 0;
          if (result.cost?.total_cost_usd) {
            recordedCost = result.cost.total_cost_usd;
            this.thinkingBudget.recordSpend(recordedCost);
          } else if (result.usage) {
            // Estimate cost from tokens if API didn't provide it
            // Input: $3/M tokens, Output: $15/M tokens (Claude Sonnet pricing)
            const estimatedCost =
              (result.usage.input_tokens / 1_000_000) * 3 +
              (result.usage.output_tokens / 1_000_000) * 15;
            recordedCost = estimatedCost;
            this.thinkingBudget.recordSpend(estimatedCost);
            this.thinkingLogger.warn('Missing cost data - estimated from tokens', {
              estimated_cost_usd: estimatedCost
            });
          } else {
            // No cost or usage data - this is a problem
            this.thinkingLogger.error('Missing both cost and usage data - cannot track budget');
          }

          // Log and record metrics
          this.thinkingLogger.info('Extended thinking completed', {
            agent: this.constructor.name,
            depth,
            thinking_blocks: result.thinking?.length || 0,
            tools_used: result.toolUses?.length || 0,
            cost_usd: recordedCost,
            duration_ms: duration,
            budget_remaining: this.thinkingBudget.remaining
          });

          this.thinkingMetrics.recordAgentOperation(
            this.constructor.name,
            'extended_thinking',
            duration
          );

          return {
            response: result.response || '',
            thinking: result.thinking || [],
            toolUses: result.toolUses || [],
            usage: result.usage,
            cost: result.cost,
            duration
          };
        } finally {
          clearTimeout(timeout);
        }

      } catch (error: unknown) {
        const duration = Date.now() - startTime;
        const err = error as Error;

        // Provide specific error context
        if (err.name === 'AbortError') {
          this.thinkingLogger.error('Extended thinking timeout', {
            duration_ms: duration,
            timeout_ms: 60000
          });
          throw new Error(`Extended thinking timed out after 60 seconds`);
        }

        this.thinkingLogger.error('Extended thinking failed', {
          error: err.message,
          error_name: err.name,
          duration_ms: duration
        });

        throw new Error(`Extended thinking failed: ${err.message}`);
      }
    }

    /**
     * Analyze topic with automatic depth selection based on complexity
     */
    async analyze(topic: string, context?: string): Promise<ThinkingResult> {
      const depth = await this.decideThinkingDepth(topic, this.thinkingBudget);

      if (depth === 'skip') {
        // Check if skip is due to budget exhaustion vs. low complexity
        if (this.thinkingBudget.remaining <= 0) {
          this.thinkingLogger.error('Cannot analyze - budget exhausted', {
            total_budget: this.thinkingBudget.total,
            spent: this.thinkingBudget.spent,
            remaining: this.thinkingBudget.remaining
          });
          throw new Error(
            `Thinking budget exhausted: $${this.thinkingBudget.spent.toFixed(4)}/$${this.thinkingBudget.total.toFixed(2)} spent`
          );
        }

        // Low complexity - log and return gracefully
        this.thinkingLogger.info('Skipping extended thinking due to low task complexity', {
          budget_remaining: this.thinkingBudget.remaining
        });
        return {
          response: 'Skipped extended thinking (low complexity task)',
          thinking: [],
          duration: 0
        };
      }

      return this.think(topic, { depth, context });
    }

    /**
     * Decide optimal thinking depth based on task complexity and budget
     *
     * Heuristics:
     * - Complexity score: word count, question marks, technical terms
     * - Cost estimates: Quick ~$0.02, Deep ~$0.08
     * - Budget check: Ensure sufficient remaining funds
     */
    async decideThinkingDepth(
      task: string,
      budget?: CostBudget
    ): Promise<'quick' | 'deep' | 'skip'> {
      const effectiveBudget = budget || this.thinkingBudget;

      // Calculate complexity score (0-1)
      const complexity = this.assessComplexity(task);

      // Cost estimates based on typical usage
      const QUICK_COST = 0.02;  // ~2K thinking tokens + 4K output
      const DEEP_COST = 0.08;   // ~8K thinking tokens + 8K output

      // Decision logic
      if (complexity > 0.8 && effectiveBudget.canAfford(DEEP_COST)) {
        this.thinkingLogger.debug('Selected deep thinking', { complexity, cost: DEEP_COST });
        return 'deep';
      } else if (complexity > 0.4 && effectiveBudget.canAfford(QUICK_COST)) {
        this.thinkingLogger.debug('Selected quick thinking', { complexity, cost: QUICK_COST });
        return 'quick';
      } else {
        this.thinkingLogger.debug('Skipping thinking', {
          complexity,
          budget_remaining: effectiveBudget.remaining
        });
        return 'skip';
      }
    }

    /**
     * Assess task complexity (0-1 scale)
     * Higher score = more complex, likely benefits from deep thinking
     */
    private assessComplexity(task: string): number {
      let score = 0;

      // Length factor (longer = more complex)
      const wordCount = task.split(/\s+/).length;
      score += Math.min(wordCount / 200, 0.3); // Max 0.3 from length

      // Question complexity
      const questionMarks = (task.match(/\?/g) || []).length;
      score += Math.min(questionMarks * 0.1, 0.2); // Max 0.2 from questions

      // Technical keywords
      const technicalTerms = [
        'architecture', 'refactor', 'optimize', 'analyze', 'debug',
        'implement', 'design', 'strategy', 'algorithm', 'performance',
        'security', 'scalability', 'integration', 'migration'
      ];
      const termMatches = technicalTerms.filter(term =>
        task.toLowerCase().includes(term)
      ).length;
      score += Math.min(termMatches * 0.1, 0.3); // Max 0.3 from technical terms

      // Code indicators
      if (task.includes('```') || task.includes('function') || task.includes('class')) {
        score += 0.2;
      }

      return Math.min(score, 1.0);
    }

    /**
     * Get current cost budget status
     */
    getThinkingBudget(): CostBudget {
      return this.thinkingBudget;
    }

    /**
     * Check if thinking API is available and configured
     * Returns diagnostic info for better debugging
     */
    async isThinkingAvailable(): Promise<boolean> {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(
          `${this.thinkingApiUrl}/api/interleaved-thinking/health`,
          { method: 'GET', signal: controller.signal }
        );

        clearTimeout(timeout);

        if (!response.ok) {
          this.thinkingLogger.warn('Thinking API health check returned error', {
            status: response.status,
            statusText: response.statusText
          });
          return false;
        }

        const health = await response.json();
        const isHealthy = health.success && health.status === 'healthy';

        this.thinkingLogger.debug('Thinking API health check result', {
          healthy: isHealthy,
          api_url: this.thinkingApiUrl,
          budget_remaining: this.thinkingBudget.remaining,
          health_status: health
        });

        return isHealthy;
      } catch (error: unknown) {
        const err = error as Error;
        this.thinkingLogger.warn('Thinking API health check failed', {
          error: err.message,
          error_name: err.name,
          api_url: this.thinkingApiUrl
        });
        return false;
      }
    }
  };
}

// ============================================================================
// Convenience Export
// ============================================================================

/**
 * Pre-configured ThinkingAgent base class
 * Ready to use with all thinking capabilities
 */
export { applyThinkingMixin as withThinking };
