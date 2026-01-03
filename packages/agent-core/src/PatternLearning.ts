/**
 * Pattern Learning Engine
 *
 * Enables cross-conversation pattern learning by recording successful/failed
 * approaches and applying learned insights to future tasks.
 *
 * Features:
 * - Pattern extraction from agent execution results
 * - Confidence scoring based on occurrence frequency
 * - Relevance ranking for context matching
 * - Prompt augmentation with learned patterns
 *
 * @example
 * ```typescript
 * const engine = new PatternLearningEngine(storage, 'user:project');
 *
 * // Record a pattern after execution
 * await engine.recordPattern(result, context);
 *
 * // Retrieve relevant patterns for new task
 * const patterns = await engine.getRelevantPatterns({
 *   operation: 'test-repair',
 *   fileTypes: ['.ts', '.tsx'],
 * });
 *
 * // Build context for prompt
 * const context = await engine.buildPatternContext('test-repair', ['.ts']);
 * ```
 */

import { v4 as uuidv4 } from 'uuid';
import type { ConversationStorage } from './ConversationMemory.js';
import { CacheKeySchema } from './cache/KeySchema.js';
import type { MemoryEventBus} from './MemoryEventBus.js';
import { getEventBus } from './MemoryEventBus.js';
import { logger } from './Logger.js';
import type { AgentResult, AgentExecutionContext } from './BaseAgent.js';

/**
 * Pattern types
 */
export type PatternType = 'success' | 'failure' | 'optimization' | 'user_preference';

/**
 * Conversation pattern
 */
export interface ConversationPattern {
  /** Unique pattern ID */
  id: string;

  /** Tenant ID for isolation */
  tenantId: string;

  /** Pattern type */
  patternType: PatternType;

  /** Context in which pattern was observed */
  context: {
    /** Operation type (e.g., 'test-repair', 'code-review') */
    operation: string;

    /** Hash of input pattern */
    inputSignature: string;

    /** File types involved */
    fileTypes: string[];

    /** Tags for searchability */
    tags?: string[];
  };

  /** Observation details */
  observation: {
    /** Approach that was tried */
    approach: string;

    /** Result of the approach */
    result: 'success' | 'failure';

    /** Performance metrics */
    metrics?: {
      duration: number;
      retries: number;
      cost?: number;
    };
  };

  /** Natural language lesson learned */
  learnedInsight: string;

  /** Confidence score (0-1) based on occurrences */
  confidence: number;

  /** Number of times pattern observed */
  occurrences: number;

  /** First observed timestamp */
  firstSeen: string;

  /** Last observed timestamp */
  lastSeen: string;

  /** Searchable tags */
  tags: string[];
}

/**
 * Pattern retrieval context
 */
export interface PatternContext {
  /** Operation type */
  operation: string;

  /** File types */
  fileTypes: string[];

  /** Optional tags */
  tags?: string[];

  /** Maximum patterns to retrieve */
  limit?: number;
}

/**
 * Pattern Learning Engine
 */
export class PatternLearningEngine {
  private readonly storage: ConversationStorage;
  private readonly tenantId: string;
  private readonly eventBus: MemoryEventBus;

  constructor(storage: ConversationStorage, tenantId: string, eventBus?: MemoryEventBus) {
    this.storage = storage;
    this.tenantId = tenantId;
    this.eventBus = eventBus ?? getEventBus();
  }

  /**
   * Record a pattern from agent execution
   *
   * @param result - Agent execution result
   * @param context - Execution context
   */
  async recordPattern(
    result: AgentResult<unknown>,
    context: AgentExecutionContext
  ): Promise<void> {
    try {
      const pattern = this.extractPattern(result, context);

      // Check if similar pattern exists
      const existingPattern = await this.findSimilarPattern(pattern);

      if (existingPattern) {
        // Update existing pattern (increment occurrences, update confidence)
        await this.updatePattern(existingPattern, pattern);
      } else {
        // Create new pattern
        await this.createPattern(pattern);
      }

      // Emit event
      await this.eventBus.emit({
        type: 'pattern_learned',
        patternId: pattern.id,
        tenantId: this.tenantId,
        operation: pattern.context.operation,
        confidence: pattern.confidence,
      });

      logger.info('Pattern recorded', {patternId: pattern.id,
        operation: pattern.context.operation,
        patternType: pattern.patternType,
        confidence: pattern.confidence,
      });
    } catch (error: unknown) {
      logger.error('Failed to record pattern', {error: error instanceof Error ? error.message : String(error),
        tenantId: this.tenantId,
      });
    }
  }

  /**
   * Retrieve relevant patterns for current context
   *
   * @param context - Pattern retrieval context
   * @returns Array of relevant patterns, sorted by relevance
   */
  async getRelevantPatterns(context: PatternContext): Promise<ConversationPattern[]> {
    try {
      // Get all patterns for tenant + operation
      const patterns = await this.getAllPatterns(context.operation);

      // Filter by file types and tags
      const filtered = patterns.filter(pattern =>
        this.matchesContext(pattern, context)
      );

      // Sort by relevance (confidence * recency)
      const sorted = this.sortByRelevance(filtered);

      // Limit results
      const limit = context.limit ?? 5;
      return sorted.slice(0, limit);
    } catch (error: unknown) {
      logger.error('Failed to retrieve patterns', {error: error instanceof Error ? error.message : String(error),
        operation: context.operation,
      });
      return [];
    }
  }

  /**
   * Build prompt augmentation from learned patterns
   *
   * @param operation - Operation type
   * @param fileTypes - File types involved
   * @returns Formatted pattern context for prompt
   */
  async buildPatternContext(
    operation: string,
    fileTypes: string[]
  ): Promise<string> {
    const patterns = await this.getRelevantPatterns({
      operation,
      fileTypes,
      limit: 3, // Top 3 patterns
    });

    if (patterns.length === 0) {
      return '';
    }

    const formatted = patterns
      .map((p, i) => {
        const resultEmoji = p.observation.result === 'success' ? '✅' : '❌';
        return `
${i + 1}. ${resultEmoji} **${p.observation.approach}** → ${p.observation.result}
   **Insight**: ${p.learnedInsight}
   **Confidence**: ${(p.confidence * 100).toFixed(0)}% (observed ${p.occurrences} time${p.occurrences > 1 ? 's' : ''})
   **Performance**: ${p.observation.metrics?.duration ?? 'N/A'}ms${p.observation.metrics?.retries ? `, ${p.observation.metrics.retries} retries` : ''}
`.trim();
      })
      .join('\n\n');

    return `
<learned_patterns>
Based on previous similar ${operation} tasks, here are relevant insights:

${formatted}

Consider these patterns when approaching this task. Apply successful patterns and avoid approaches that previously failed.
</learned_patterns>
`.trim();
  }

  /**
   * Extract pattern from agent result and context
   */
  private extractPattern(
    result: AgentResult<unknown>,
    context: AgentExecutionContext
  ): ConversationPattern {
    const patternType: PatternType = result.success ? 'success' : 'failure';
    const fileTypes = this.extractFileTypes(context);
    const inputSignature = this.hashInput(context.input);

    // Extract learned insight from result
    const learnedInsight = this.extractInsight(result, context);

    // Extract approach description
    const approach = this.extractApproach(result, context);

    return {
      id: uuidv4(),
      tenantId: this.tenantId,
      patternType,
      context: {
        operation: context.operation ?? 'unknown',
        inputSignature,
        fileTypes,
        tags: context.tags ?? [],
      },
      observation: {
        approach,
        result: result.success ? 'success' : 'failure',
        metrics: {
          duration: result.duration ?? 0,
          retries: result.retries ?? 0,
          cost: context.cost,
        },
      },
      learnedInsight,
      confidence: 0.5, // Initial confidence (will be adjusted based on occurrences)
      occurrences: 1,
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      tags: [...(context.tags ?? []), ...fileTypes, context.operation ?? 'unknown'],
    };
  }

  /**
   * Find similar existing pattern
   */
  private async findSimilarPattern(
    pattern: ConversationPattern
  ): Promise<ConversationPattern | null> {
    // Get all patterns for same operation
    const patterns = await this.getAllPatterns(pattern.context.operation);

    // Find pattern with matching signature and approach
    return patterns.find(
      p =>
        p.context.inputSignature === pattern.context.inputSignature &&
        p.observation.approach === pattern.observation.approach
    ) ?? null;
  }

  /**
   * Update existing pattern with new observation
   */
  private async updatePattern(
    existing: ConversationPattern,
    newObservation: ConversationPattern
  ): Promise<void> {
    const updated: ConversationPattern = {
      ...existing,
      occurrences: existing.occurrences + 1,
      lastSeen: new Date().toISOString(),
      // Increase confidence based on occurrences (max 0.95)
      confidence: Math.min(0.95, 0.5 + (existing.occurrences * 0.05)),
      // Update metrics (running average)
      observation: {
        ...existing.observation,
        metrics: existing.observation.metrics ? {
          duration: Math.round(
            (existing.observation.metrics.duration * existing.occurrences +
              (newObservation.observation.metrics?.duration ?? 0)) /
            (existing.occurrences + 1)
          ),
          retries: Math.round(
            (existing.observation.metrics.retries * existing.occurrences +
              (newObservation.observation.metrics?.retries ?? 0)) /
            (existing.occurrences + 1)
          ),
        } : newObservation.observation.metrics,
      },
    };

    const { key } = CacheKeySchema.pattern(
      updated.id,
      this.tenantId,
      updated.context.operation
    );

    await this.storage.set(key, JSON.stringify(updated));

    logger.debug('Pattern updated', {patternId: updated.id,
      occurrences: updated.occurrences,
      confidence: updated.confidence,
    });
  }

  /**
   * Create new pattern
   */
  private async createPattern(pattern: ConversationPattern): Promise<void> {
    const { key } = CacheKeySchema.pattern(
      pattern.id,
      this.tenantId,
      pattern.context.operation
    );

    await this.storage.set(key, JSON.stringify(pattern));

    logger.debug('Pattern created', {patternId: pattern.id,
      operation: pattern.context.operation,
    });
  }

  /**
   * Get all patterns for operation (placeholder - needs Redis SCAN)
   */
  private async getAllPatterns(operation: string): Promise<ConversationPattern[]> {
    // TODO: Implement with Redis SCAN or dedicated index
    // For now, return empty array
    // Full implementation would scan keys matching:
    // app:prod:pattern:{operation}:{tenantId}:*:v1

    logger.debug('getAllPatterns not fully implemented', {operation,
      note: 'Requires Redis SCAN implementation',
    });

    return [];
  }

  /**
   * Check if pattern matches context
   */
  private matchesContext(
    pattern: ConversationPattern,
    context: PatternContext
  ): boolean {
    // Match operation
    if (pattern.context.operation !== context.operation) {
      return false;
    }

    // Match file types (at least one overlap)
    const hasFileTypeOverlap = context.fileTypes.some(ft =>
      pattern.context.fileTypes.includes(ft)
    );

    if (!hasFileTypeOverlap && context.fileTypes.length > 0) {
      return false;
    }

    // Match tags (optional)
    if (context.tags && context.tags.length > 0) {
      const hasTagOverlap = context.tags.some(tag =>
        pattern.tags.includes(tag)
      );

      if (!hasTagOverlap) {
        return false;
      }
    }

    return true;
  }

  /**
   * Sort patterns by relevance
   *
   * Relevance = confidence * recency_weight
   * Recency weight decays over time (more recent = higher weight)
   */
  private sortByRelevance(patterns: ConversationPattern[]): ConversationPattern[] {
    const now = Date.now();

    return patterns.sort((a, b) => {
      const aRecency = this.calculateRecencyWeight(a.lastSeen, now);
      const bRecency = this.calculateRecencyWeight(b.lastSeen, now);

      const aRelevance = a.confidence * aRecency;
      const bRelevance = b.confidence * bRecency;

      return bRelevance - aRelevance; // Descending order
    });
  }

  /**
   * Calculate recency weight (exponential decay)
   *
   * Weight = e^(-days_old / 30)
   * - Recent (< 7 days): ~0.8-1.0
   * - Medium (7-30 days): ~0.4-0.8
   * - Old (> 30 days): < 0.4
   */
  private calculateRecencyWeight(lastSeen: string, now: number): number {
    const lastSeenMs = new Date(lastSeen).getTime();
    const ageMs = now - lastSeenMs;
    const ageDays = ageMs / (1000 * 60 * 60 * 24);

    return Math.exp(-ageDays / 30);
  }

  /**
   * Extract file types from context
   */
  private extractFileTypes(context: AgentExecutionContext): string[] {
    // Try to extract from input if it's a string or has file paths
    const input = context.input;

    if (typeof input === 'string') {
      // Extract file extensions from paths
      const matches = input.match(/\.\w+/g);
      return matches ? [...new Set(matches)] : [];
    }

    if (typeof input === 'object' && input !== null) {
      // Look for common file-related properties
      const fileProps = ['files', 'filePaths', 'path', 'file'];
      for (const prop of fileProps) {
        if (prop in input) {
          const value = (input as Record<string, unknown>)[prop];
          if (typeof value === 'string') {
            const ext = value.match(/\.(\w+)$/)?.[0];
            return ext ? [ext] : [];
          }
        }
      }
    }

    return [];
  }

  /**
   * Hash input for signature matching
   */
  private hashInput(input: unknown): string {
    const str = typeof input === 'string' ? input : JSON.stringify(input);
    // Simple hash (for demo - use crypto.createHash in production)
    return str.slice(0, 100); // First 100 chars
  }

  /**
   * Extract learned insight from result
   */
  private extractInsight(result: AgentResult<unknown>, context: AgentExecutionContext): string {
    if (result.success) {
      return `Successful approach for ${context.operation ?? 'operation'} with ${result.retries ?? 0} retries`;
    } else {
      return `Failed approach for ${context.operation ?? 'operation'}: ${result.error ?? 'unknown error'}`;
    }
  }

  /**
   * Extract approach description from result
   */
  private extractApproach(result: AgentResult<unknown>, context: AgentExecutionContext): string {
    // Try to extract from result output
    if (result.output && typeof result.output === 'string') {
      // Take first sentence as approach
      const firstSentence = result.output.split('.')[0];
      return firstSentence.slice(0, 200); // Truncate to 200 chars
    }

    return `${context.operation ?? 'operation'} execution`;
  }
}
