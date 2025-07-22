import { Logger } from './Logger';

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
  metadata?: Record<string, any>;
}

export interface AgentResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  retries: number;
  duration: number;
  context: AgentExecutionContext;
}

export abstract class BaseAgent<TInput = any, TOutput = any> {
  protected readonly config: Required<AgentConfig>;
  protected readonly logger: Logger;

  constructor(config: AgentConfig) {
    this.config = {
      maxRetries: 3,
      retryDelay: 1000,
      timeout: 30000,
      logLevel: 'info',
      ...config,
    };
    
    this.logger = new Logger({
      level: this.config.logLevel,
      agent: this.config.name,
    });
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
    let retries = 0;

    while (retries <= this.config.maxRetries) {
      try {
        const result = await this.performOperation(input, context);
        const duration = Date.now() - startTime;

        const agentResult: AgentResult<TOutput> = {
          success: true,
          data: result,
          retries,
          duration,
          context,
        };

        this.logger.info('Agent execution completed successfully', {
          result: agentResult,
          retries,
          duration,
        });

        return agentResult;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        retries++;

        this.logger.warn('Agent execution attempt failed', {
          error: lastError.message,
          attempt: retries,
          maxRetries: this.config.maxRetries,
          context,
        });

        if (retries <= this.config.maxRetries) {
          await this.delay(this.config.retryDelay * retries); // Exponential backoff
        }
      }
    }

    const duration = Date.now() - startTime;
    const agentResult: AgentResult<TOutput> = {
      success: false,
      error: lastError?.message || 'Unknown error',
      retries: retries - 1,
      duration,
      context,
    };

    this.logger.error('Agent execution failed after all retries', {
      result: agentResult,
      finalError: lastError?.message,
    });

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
  protected getExecutionMetadata(input: TInput): Record<string, any> {
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