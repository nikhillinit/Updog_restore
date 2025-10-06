/**
 * Typed error taxonomy for AI agent operations
 * Enables intelligent retry and fallback strategies
 */

export class RetryableExternalError extends Error {
  name = 'RetryableExternalError';

  constructor(message: string, public cause?: Error) {
    super(message);
  }
}

export class NonRetryableInputError extends Error {
  name = 'NonRetryableInputError';

  constructor(message: string, public validationErrors?: unknown) {
    super(message);
  }
}

export class BudgetExceededError extends Error {
  name = 'BudgetExceededError';

  constructor(
    public spendUsd: number,
    public limitUsd: number,
    public operation: string,
    message?: string
  ) {
    super(message ?? `Budget exceeded for ${operation}: $${spendUsd.toFixed(2)} > $${limitUsd.toFixed(2)}`);
  }
}

export class CircuitBreakerOpenError extends Error {
  name = 'CircuitBreakerOpenError';

  constructor(public service: string, message?: string) {
    super(message ?? `Circuit breaker open for ${service}`);
  }
}
