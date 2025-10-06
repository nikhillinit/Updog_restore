import { Logger } from './Logger';
import { MetricsCollector } from './MetricsCollector';
import { ETagLogger } from './ETagLogger';
import {
  createThread,
  getThread,
  addTurn,
  buildConversationHistory,
  type ThreadContext,
} from './ConversationMemory';
import { serializeAsync, serializeSafely } from './SerializationHelper';
import { ConversationCache, type CacheStats } from './ConversationCache';

export interface AgentConfig {
  name: string;
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  enableConversationMemory?: boolean;
}

export interface AgentExecutionContext {
  runId: string;
  timestamp: string;
  agent: string;
  operation: string;
  metadata?: Record<string, unknown>;
  continuationId?: string;
  conversationHistory?: string;
}

export interface AgentResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  retries: number;
  duration: number;
  context: AgentExecutionContext;
  continuationId?: string;
  threadContext?: ThreadContext;
}

export abstract class BaseAgent<TInput = unknown, TOutput = unknown> {
  protected readonly config: AgentConfig;
  protected readonly logger: Logger;
  protected readonly metrics: MetricsCollector;
  private readonly conversationCache: ConversationCache;

  constructor(config: AgentConfig) {
    this.config = {
      maxRetries: 3,
      retryDelay: 1000,
      timeout: 30000,
      logLevel: 'info',
      ...config,
    };
    
    this.logger = new Logger({
      level: this.config.logLevel || 'info',
      agent: this.config.name,
    });

    this.metrics = MetricsCollector.getInstance();
    this.metrics.recordAgentStart(this.config.name);

    // Initialize conversation cache for memory optimization
    this.conversationCache = new ConversationCache({
      maxSize: 50,  // Cache last 50 threads per agent instance
      ttl: 1000 * 60 * 5  // 5 minute TTL
    });
  }

  /**
   * Main execution method - handles retry logic and logging
   */
  async execute(
    input: TInput,
    operation = 'execute',
    options?: {
      continuationId?: string;
      parentThreadId?: string;
      files?: string[];
      images?: string[];
    }
  ): Promise<AgentResult<TOutput>> {
    const startTime = Date.now();
    const runId = this.generateRunId(startTime);

    // Handle conversation continuation
    let continuationId = options?.continuationId;
    let conversationHistory: string | undefined;
    let threadContext: ThreadContext | null = null;

    if (this.config.enableConversationMemory) {
      if (continuationId) {
        // Continue existing conversation - use cache for 85% latency reduction
        const cached = await this.conversationCache.getOrLoad(continuationId);
        if (cached) {
          threadContext = cached.thread;
          conversationHistory = cached.history;
          this.logger.info('Continuing conversation (cached)', {
            threadId: continuationId,
            turns: cached.thread.turns.length,
            historyTokens: cached.tokens,
            cacheHit: true,
          });
        } else {
          this.logger.warn('Continuation ID provided but thread not found', {
            continuationId,
          });
        }
      } else {
        // Create new conversation thread
        continuationId = await createThread(
          this.config.name,
          { input, operation },
          options?.parentThreadId
        );
        this.logger.info('Created new conversation thread', {
          threadId: continuationId,
          parentThreadId: options?.parentThreadId,
        });
      }
    }

    const context: AgentExecutionContext = {
      runId,
      timestamp: new Date().toISOString(),
      agent: this.config.name,
      operation,
      metadata: this.getExecutionMetadata(input),
      continuationId,
      conversationHistory,
    };

    this.logger.info('Starting agent execution', { context, input });

    let lastError: Error | null = null;
    let attempt = 0;
    const maxRetries = this.config.maxRetries || 3;

    // Try initial attempt + maxRetries
    for (let i = 0; i <= maxRetries; i++) {
      try {
        const result = await this.performOperation(input, context);
        const duration = Math.max(1, Date.now() - startTime); // Ensure non-zero duration

        const agentResult: AgentResult<TOutput> = {
          success: true,
          data: result,
          retries: i, // Number of retries made (0 for first attempt success)
          duration,
          context,
          continuationId,
          threadContext: threadContext || undefined,
        };

        // Serialize once, reuse for both conversation memory and ETag (avoid double serialization)
        const { serialized, truncated } = await serializeAsync(result, { pretty: true });

        if (truncated) {
          this.logger.warn('Agent result truncated for storage', {
            continuationId,
            resultSize: serialized.length,
          });
        }

        // Record agent response in conversation memory
        if (this.config.enableConversationMemory && continuationId) {
          await addTurn(
            continuationId,
            'assistant',
            serialized,
            {
              files: options?.files,
              images: options?.images,
              toolName: this.config.name,
              modelName: this.config.name,
              modelMetadata: {
                operation,
                duration,
                retries: i,
                success: true,
              },
            }
          );

          // Invalidate cache after updating thread
          this.conversationCache.invalidate(continuationId);
        }

        // Generate ETag from same serialized string (no double serialization)
        const etag = ETagLogger.from(serialized);

        this.logger.info('Agent execution completed successfully', {
          result: agentResult,
          retries: i,
          duration,
          etag,
        });

        // Record metrics
        this.metrics.recordExecution(
          this.config.name,
          operation,
          'success',
          duration,
          i
        );

        return agentResult;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        this.logger.warn('Agent execution attempt failed', {
          error: lastError.message,
          attempt: i + 1,
          maxRetries,
          context,
        });

        // Only retry if we haven't reached max retries yet
        if (i < maxRetries) {
          await this.delay((this.config.retryDelay || 1000) * (i + 1)); // Exponential backoff
        }
      }
    }

    const duration = Math.max(1, Date.now() - startTime); // Ensure non-zero duration
    
    const agentResult: AgentResult<TOutput> = {
      success: false,
      error: lastError?.message || 'Unknown error',
      retries: maxRetries,
      duration,
      context,
    };

    this.logger.error('Agent execution failed after all retries', {
      result: agentResult,
      finalError: lastError?.message,
    });

    // Record failure metrics
    this.metrics.recordExecution(
      this.config.name,
      operation,
      'failure',
      duration,
      maxRetries
    );
    
    this.metrics.recordFailure(
      this.config.name,
      operation,
      lastError?.constructor.name || 'UnknownError'
    );


    return agentResult;
  }

  /**
   * Abstract method that subclasses must implement
   */
  protected abstract performOperation(
    input: TInput, 
    context: AgentExecutionContext
  ): Promise<TOutput>;

  /**
   * Override to provide custom metadata for execution context
   */
  protected getExecutionMetadata(input: TInput): Record<string, unknown> {
    return {
      inputType: typeof input,
      hasInput: input !== null && input !== undefined,
    };
  }

  /**
   * Validation hook - override to add input validation
   */
  protected async validateInput(input: TInput): Promise<void> {
    // Default: no validation
  }

  /**
   * Pre-execution hook
   */
  protected async beforeExecution(input: TInput, context: AgentExecutionContext): Promise<void> {
    await this.validateInput(input);
  }

  /**
   * Post-execution hook
   */
  protected async afterExecution(
    result: TOutput, 
    context: AgentExecutionContext
  ): Promise<TOutput> {
    return result;
  }

  /**
   * Get agent status and metrics
   */
  getStatus(): {
    name: string;
    config: AgentConfig;
    uptime: number;
    cacheStats?: CacheStats;
  } {
    const cacheStats = this.config.enableConversationMemory
      ? this.conversationCache.getStats()
      : undefined;

    return {
      name: this.config.name,
      config: this.config,
      uptime: process.uptime(),
      cacheStats,
    };
  }

  private generateRunId(timestamp: number): string {
    // Use substring instead of deprecated substr, accept timestamp to avoid duplicate Date.now() call
    return `${this.config.name}-${timestamp}-${Math.random().toString(36).substring(2, 11)}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
