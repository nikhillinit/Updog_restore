---
status: ACTIVE
last_updated: 2026-01-19
---

# Async Error Handling and Resilience

## Overview

Use when implementing error handling for async operations, background jobs,
external service calls, or when building resilient systems. This skill covers
retry patterns, circuit breakers, graceful degradation, and BullMQ-specific
patterns used in this codebase.

## Triggers

Activate this skill when you see:
- "BullMQ" OR "job failed" OR "queue timeout"
- "Redis connection" OR "connection refused" OR "ECONNRESET"
- "retry" OR "exponential backoff" OR "circuit breaker"
- "graceful degradation" OR "fallback" OR "resilience"
- External API integration OR webhook handling

## Core Principles

1. **Fail fast, recover gracefully** - Detect failures quickly, have fallback plans
2. **Idempotency is mandatory** - All async operations must be safe to retry
3. **Log everything** - Structured logging for debugging production issues
4. **Timeout everything** - No unbounded waits, ever
5. **Degrade gracefully** - Partial functionality > complete failure

## Retry Patterns

### Exponential Backoff with Jitter

```typescript
// Standard retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000,      // 1 second
  maxDelay: 30000,      // 30 seconds
  jitterFactor: 0.2,    // 20% randomness
};

function calculateDelay(attempt: number): number {
  const exponentialDelay = Math.min(
    RETRY_CONFIG.baseDelay * Math.pow(2, attempt),
    RETRY_CONFIG.maxDelay
  );

  // Add jitter to prevent thundering herd
  const jitter = exponentialDelay * RETRY_CONFIG.jitterFactor * Math.random();
  return exponentialDelay + jitter;
}

async function withRetry<T>(
  operation: () => Promise<T>,
  options = RETRY_CONFIG
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      if (attempt < options.maxRetries) {
        const delay = calculateDelay(attempt);
        await sleep(delay);
        logger.warn('Retry attempt', { attempt: attempt + 1, delay, error: lastError.message });
      }
    }
  }

  throw lastError!;
}
```

### Retryable vs Non-Retryable Errors

```typescript
// Define which errors are safe to retry
const RETRYABLE_ERRORS = [
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'EPIPE',
  'EAI_AGAIN',
];

function isRetryable(error: Error): boolean {
  // Network errors
  if (RETRYABLE_ERRORS.some(code => error.message.includes(code))) {
    return true;
  }

  // HTTP status codes
  if ('statusCode' in error) {
    const status = (error as { statusCode: number }).statusCode;
    // Retry server errors and rate limits, not client errors
    return status >= 500 || status === 429;
  }

  return false;
}

async function withSmartRetry<T>(
  operation: () => Promise<T>,
  options = RETRY_CONFIG
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      if (!isRetryable(lastError)) {
        throw lastError; // Don't retry non-retryable errors
      }

      if (attempt < options.maxRetries) {
        const delay = calculateDelay(attempt);
        await sleep(delay);
      }
    }
  }

  throw lastError!;
}
```

## BullMQ Patterns

### Job Configuration

```typescript
// Job options for resilience
const createJobOptions = (priority: 'high' | 'normal' | 'low'): JobsOptions => ({
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000,
  },
  removeOnComplete: {
    age: 24 * 3600,      // Keep completed jobs for 24 hours
    count: 1000,         // Keep last 1000 completed jobs
  },
  removeOnFail: {
    age: 7 * 24 * 3600,  // Keep failed jobs for 7 days
  },
  timeout: priority === 'high' ? 30000 : 300000, // 30s or 5min
});
```

### Worker Error Handling

```typescript
const worker = new Worker(
  'calculations',
  async (job: Job<CalculationPayload>) => {
    const { fundId, calculationType } = job.data;

    try {
      // Log job start
      logger.info('Job started', { jobId: job.id, fundId, calculationType });

      // Validate input (fail fast)
      if (!fundId) {
        throw new Error('Missing fundId - cannot retry');
      }

      // Perform calculation with timeout
      const result = await withTimeout(
        performCalculation(job.data),
        job.opts.timeout || 300000
      );

      // Log success
      logger.info('Job completed', { jobId: job.id, fundId, duration: Date.now() - job.timestamp });

      return result;

    } catch (error) {
      // Categorize error for retry decision
      const shouldRetry = isRetryable(error as Error);

      logger.error('Job failed', {
        jobId: job.id,
        fundId,
        error: (error as Error).message,
        attempt: job.attemptsMade,
        willRetry: shouldRetry && job.attemptsMade < (job.opts.attempts || 3),
      });

      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 5,
    limiter: {
      max: 100,
      duration: 60000, // 100 jobs per minute
    },
  }
);

// Handle worker-level errors
worker.on('error', (error) => {
  logger.error('Worker error', { error: error.message });
});

worker.on('failed', (job, error) => {
  if (job && job.attemptsMade >= (job.opts.attempts || 3)) {
    // All retries exhausted - alert
    alerting.send('job_permanently_failed', {
      jobId: job.id,
      queue: 'calculations',
      error: error.message,
    });
  }
});
```

## Circuit Breaker Pattern

```typescript
interface CircuitBreakerConfig {
  failureThreshold: number;    // Failures before opening
  resetTimeout: number;        // Time before trying again
  monitorWindow: number;       // Time window for counting failures
}

class CircuitBreaker {
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private failures: number[] = [];
  private lastFailure: number = 0;

  constructor(private config: CircuitBreakerConfig) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === 'open') {
      if (Date.now() - this.lastFailure > this.config.resetTimeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await operation();

      // Success - reset if half-open
      if (this.state === 'half-open') {
        this.state = 'closed';
        this.failures = [];
      }

      return result;

    } catch (error) {
      this.recordFailure();

      if (this.shouldOpen()) {
        this.state = 'open';
        logger.warn('Circuit breaker opened', {
          failures: this.failures.length,
          threshold: this.config.failureThreshold,
        });
      }

      throw error;
    }
  }

  private recordFailure(): void {
    const now = Date.now();
    this.failures.push(now);
    this.lastFailure = now;

    // Remove old failures outside monitoring window
    this.failures = this.failures.filter(
      (time) => now - time < this.config.monitorWindow
    );
  }

  private shouldOpen(): boolean {
    return this.failures.length >= this.config.failureThreshold;
  }
}

// Usage
const externalApiCircuit = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeout: 30000,     // 30 seconds
  monitorWindow: 60000,    // 1 minute
});

async function callExternalApi(data: ApiRequest): Promise<ApiResponse> {
  return externalApiCircuit.execute(() =>
    withRetry(() => fetch('/api/external', { body: JSON.stringify(data) }))
  );
}
```

## Graceful Degradation

### Feature Flags for Degradation

```typescript
// Degrade expensive features under load
async function getPortfolioData(fundId: string): Promise<PortfolioData> {
  const baseData = await fetchBasePortfolio(fundId);

  // Skip expensive calculations under high load
  if (isUnderHighLoad()) {
    return {
      ...baseData,
      projections: null,  // Skip Monte Carlo
      waterfallDetails: null,  // Skip detailed waterfall
      _degraded: true,
    };
  }

  const [projections, waterfallDetails] = await Promise.allSettled([
    calculateProjections(fundId),
    calculateWaterfallDetails(fundId),
  ]);

  return {
    ...baseData,
    projections: projections.status === 'fulfilled' ? projections.value : null,
    waterfallDetails: waterfallDetails.status === 'fulfilled' ? waterfallDetails.value : null,
  };
}
```

### Timeout with Fallback

```typescript
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback?: T
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
  );

  try {
    return await Promise.race([promise, timeoutPromise]);
  } catch (error) {
    if (fallback !== undefined) {
      logger.warn('Using fallback due to timeout', { timeoutMs });
      return fallback;
    }
    throw error;
  }
}

// Usage with fallback
const metrics = await withTimeout(
  fetchLiveMetrics(fundId),
  5000,
  getCachedMetrics(fundId)  // Fallback to cache
);
```

## Redis Connection Resilience

```typescript
// Redis connection with auto-reconnect
const redisConnection = new Redis({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: 3,
  retryStrategy: (times: number) => {
    if (times > 10) {
      logger.error('Redis connection failed permanently');
      return null; // Stop retrying
    }
    return Math.min(times * 100, 3000); // Exponential backoff, max 3s
  },
  reconnectOnError: (err: Error) => {
    const targetErrors = ['READONLY', 'ECONNRESET'];
    return targetErrors.some((e) => err.message.includes(e));
  },
});

redisConnection.on('error', (error) => {
  logger.error('Redis connection error', { error: error.message });
});

redisConnection.on('reconnecting', () => {
  logger.warn('Redis reconnecting...');
});
```

## Error Handling Checklist

Before marking async code complete:

- [ ] All operations have timeouts
- [ ] Retry logic uses exponential backoff with jitter
- [ ] Non-retryable errors are identified and fail fast
- [ ] Logging includes correlation IDs for tracing
- [ ] Circuit breaker protects external dependencies
- [ ] Graceful degradation path exists
- [ ] Idempotency keys used for mutations

## Related Skills

- systematic-debugging - Root cause analysis
- test-pyramid - Testing async code
- baseline-governance - Error rate baselines
