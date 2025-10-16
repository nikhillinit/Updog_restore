/**
 * AI Service Error Classes
 *
 * Custom error types for AI orchestration with metadata preservation
 * for proper error handling, retry logic, and monitoring.
 */

/**
 * Base error class for all AI service errors
 * Preserves metadata for observability and retry logic
 */
export class AIServiceError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;
  public readonly isRetryable: boolean;
  public readonly metadata?: Record<string, unknown>;

  constructor(
    message: string,
    options: {
      statusCode?: number;
      errorCode?: string;
      isRetryable?: boolean;
      metadata?: Record<string, unknown>;
      cause?: Error;
    } = {}
  ) {
    super(message);
    this.name = 'AIServiceError';
    this.statusCode = options.statusCode ?? 500;
    this.errorCode = options.errorCode ?? 'AI_SERVICE_ERROR';
    this.isRetryable = options.isRetryable ?? false;
    this.metadata = options.metadata;

    // Preserve original error stack if available
    if (options.cause) {
      this.cause = options.cause;
      if (options.cause.stack) {
        this.stack = `${this.stack}\nCaused by: ${options.cause.stack}`;
      }
    }

    // Ensure prototype chain is correct
    Object.setPrototypeOf(this, AIServiceError.prototype);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      errorCode: this.errorCode,
      isRetryable: this.isRetryable,
      metadata: this.metadata,
    };
  }
}

/**
 * Budget exceeded error - thrown when daily/monthly budget limits are hit
 * Not retryable - requires budget increase or waiting for reset
 */
export class BudgetExceededError extends AIServiceError {
  public readonly currentSpend: number;
  public readonly limit: number;
  public readonly budgetType: 'daily' | 'monthly' | 'per-call';

  constructor(
    message: string,
    options: {
      currentSpend: number;
      limit: number;
      budgetType?: 'daily' | 'monthly' | 'per-call';
      metadata?: Record<string, unknown>;
    }
  ) {
    super(message, {
      statusCode: 429,
      errorCode: 'BUDGET_EXCEEDED',
      isRetryable: false,
      metadata: {
        ...options.metadata,
        currentSpend: options.currentSpend,
        limit: options.limit,
        budgetType: options.budgetType ?? 'daily',
      },
    });

    this.name = 'BudgetExceededError';
    this.currentSpend = options.currentSpend;
    this.limit = options.limit;
    this.budgetType = options.budgetType ?? 'daily';

    Object.setPrototypeOf(this, BudgetExceededError.prototype);
  }
}

/**
 * Timeout error - thrown when AI provider call exceeds timeout
 * Retryable - may succeed on retry with different load
 */
export class TimeoutError extends AIServiceError {
  public readonly timeoutMs: number;
  public readonly provider: string;

  constructor(
    message: string,
    options: {
      timeoutMs: number;
      provider: string;
      metadata?: Record<string, unknown>;
    }
  ) {
    super(message, {
      statusCode: 504,
      errorCode: 'AI_TIMEOUT',
      isRetryable: true,
      metadata: {
        ...options.metadata,
        timeoutMs: options.timeoutMs,
        provider: options.provider,
      },
    });

    this.name = 'TimeoutError';
    this.timeoutMs = options.timeoutMs;
    this.provider = options.provider;

    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

/**
 * Circuit breaker open error - thrown when circuit is open due to repeated failures
 * Not immediately retryable - wait for half-open state
 */
export class CircuitBreakerOpenError extends AIServiceError {
  public readonly provider: string;
  public readonly failureCount: number;
  public readonly nextRetryAt: Date;

  constructor(
    message: string,
    options: {
      provider: string;
      failureCount: number;
      nextRetryAt: Date;
      metadata?: Record<string, unknown>;
    }
  ) {
    super(message, {
      statusCode: 503,
      errorCode: 'CIRCUIT_BREAKER_OPEN',
      isRetryable: false,
      metadata: {
        ...options.metadata,
        provider: options.provider,
        failureCount: options.failureCount,
        nextRetryAt: options.nextRetryAt.toISOString(),
      },
    });

    this.name = 'CircuitBreakerOpenError';
    this.provider = options.provider;
    this.failureCount = options.failureCount;
    this.nextRetryAt = options.nextRetryAt;

    Object.setPrototypeOf(this, CircuitBreakerOpenError.prototype);
  }
}

/**
 * Provider error - thrown when AI provider returns an error
 * Retryability depends on the specific error
 */
export class ProviderError extends AIServiceError {
  public readonly provider: string;
  public readonly providerErrorCode?: string;

  constructor(
    message: string,
    options: {
      provider: string;
      providerErrorCode?: string;
      statusCode?: number;
      isRetryable?: boolean;
      metadata?: Record<string, unknown>;
      cause?: Error;
    }
  ) {
    super(message, {
      statusCode: options.statusCode ?? 502,
      errorCode: 'PROVIDER_ERROR',
      isRetryable: options.isRetryable ?? true,
      metadata: {
        ...options.metadata,
        provider: options.provider,
        providerErrorCode: options.providerErrorCode,
      },
      cause: options.cause,
    });

    this.name = 'ProviderError';
    this.provider = options.provider;
    this.providerErrorCode = options.providerErrorCode;

    Object.setPrototypeOf(this, ProviderError.prototype);
  }
}

/**
 * Rate limit error - thrown when provider rate limit is hit
 * Retryable after waiting
 */
export class RateLimitError extends AIServiceError {
  public readonly provider: string;
  public readonly retryAfter?: number;

  constructor(
    message: string,
    options: {
      provider: string;
      retryAfter?: number;
      metadata?: Record<string, unknown>;
    }
  ) {
    super(message, {
      statusCode: 429,
      errorCode: 'RATE_LIMIT_EXCEEDED',
      isRetryable: true,
      metadata: {
        ...options.metadata,
        provider: options.provider,
        retryAfter: options.retryAfter,
      },
    });

    this.name = 'RateLimitError';
    this.provider = options.provider;
    this.retryAfter = options.retryAfter;

    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

/**
 * Ledger error - thrown when budget ledger operations fail
 * Usually not retryable - indicates system issue
 */
export class LedgerError extends AIServiceError {
  public readonly operation: 'reserve' | 'settle' | 'void';
  public readonly ledgerKey: string;

  constructor(
    message: string,
    options: {
      operation: 'reserve' | 'settle' | 'void';
      ledgerKey: string;
      metadata?: Record<string, unknown>;
      cause?: Error;
    }
  ) {
    super(message, {
      statusCode: 500,
      errorCode: 'LEDGER_ERROR',
      isRetryable: false,
      metadata: {
        ...options.metadata,
        operation: options.operation,
        ledgerKey: options.ledgerKey,
      },
      cause: options.cause,
    });

    this.name = 'LedgerError';
    this.operation = options.operation;
    this.ledgerKey = options.ledgerKey;

    Object.setPrototypeOf(this, LedgerError.prototype);
  }
}

/**
 * Helper to determine if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof AIServiceError) {
    return error.isRetryable;
  }

  // Unknown errors are conservatively treated as non-retryable
  return false;
}

/**
 * Helper to extract error metadata for logging
 */
export function extractErrorMetadata(error: unknown): Record<string, unknown> {
  if (error instanceof AIServiceError) {
    return error.toJSON();
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    error: String(error),
  };
}
