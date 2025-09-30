import { Logger } from './Logger';
import { MetricsCollector } from './MetricsCollector';
import { ETagLogger } from './ETagLogger';

export interface AgentConfig {
  name: string;
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

export interface AgentExecutionContext {
  runId: string;
  timestamp: string;
  agent: string;
  operation: string;
  metadata?: Record<string, unknown>;
}

export interface AgentResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  retries: number;
  duration: number;
  context: AgentExecutionContext;
}

export abstract class BaseAgent<TInput = unknown, TOutput = unknown> {
  protected readonly config: AgentConfig;
  protected readonly logger: Logger;
  protected readonly metrics: MetricsCollector;

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
  }

  /**
   * Main execution method - handles retry logic and logging
   */
  async execute(input: TInput, operation = 'execute'): Promise<AgentResult<TOutput>> {
    const runId = this.generateRunId();
    const startTime = Date.now();
    
    const context: AgentExecutionContext = {
      runId,
      timestamp: new Date().toISOString(),
      agent: this.config.name,
      operation,
      metadata: this.getExecutionMetadata(input),
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
        };

        // Generate ETag for caching
        const etag = ETagLogger.from(JSON.stringify(result));
        
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
  } {
    return {
      name: this.config.name,
      config: this.config,
      uptime: process.uptime(),
    };
  }

  private generateRunId(): string {
    return `${this.config.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
