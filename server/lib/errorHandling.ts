/**
 * Consolidated error handling patterns
 * Unified approach to error management across the application
 */

import type { Request, Response, NextFunction } from 'express';
import {
  isDeploymentError,
  isHealthCheckError,
  isDatabaseError,
  isIdempotencyError,
  isRateLimitError,
  isValidationError,
} from '../types/errors.js';
import { createErrorBody, type ApiErrorBody } from './apiError.js';
import { tracer } from './tracing.js';
import { logger } from './logger.js';
import { isObject } from '@shared/utils/type-guards';

// Error severity levels
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

// Error handling configuration
interface ErrorHandlingConfig {
  captureAsync: boolean;
  notifyOnSeverity: ErrorSeverity[];
  retryableErrors: string[];
  sensitiveFields: string[];
}

const defaultConfig: ErrorHandlingConfig = {
  captureAsync: true,
  notifyOnSeverity: [ErrorSeverity.HIGH, ErrorSeverity.CRITICAL],
  retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'],
  sensitiveFields: ['password', 'token', 'secret', 'key', 'authorization'],
};

const severityRanks: Record<ErrorSeverity, number> = {
  [ErrorSeverity.LOW]: 0,
  [ErrorSeverity.MEDIUM]: 1,
  [ErrorSeverity.HIGH]: 2,
  [ErrorSeverity.CRITICAL]: 3,
};

type ErrorAction = 'retry' | 'escalate' | 'ignore';
type ErrorMetadata = Record<string, unknown>;

interface ErrorHandlingResult {
  statusCode: number;
  response: ApiErrorBody;
  severity: ErrorSeverity;
  action: ErrorAction;
}

interface ErrorWithHandlingResult extends Error {
  handlingResult?: ErrorHandlingResult;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function stringifyErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getErrorMessage(error: unknown): string {
  return stringifyErrorMessage(error);
}

export function isErrorWithMessage(error: unknown): error is { message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  );
}

export function getRouteErrorMessage(error: unknown): string {
  return isErrorWithMessage(error) ? error.message : 'Unknown error';
}

function determineTypedSeverity(error: Error): ErrorSeverity | undefined {
  if (isDeploymentError(error)) {
    return error.stage === 'production' ? ErrorSeverity.CRITICAL : ErrorSeverity.HIGH;
  }

  if (isDatabaseError(error)) {
    return error.message.includes('connection') ? ErrorSeverity.CRITICAL : ErrorSeverity.HIGH;
  }

  if (isHealthCheckError(error)) {
    return error.checkType === 'connectivity' ? ErrorSeverity.HIGH : ErrorSeverity.MEDIUM;
  }

  if (isRateLimitError(error)) {
    return ErrorSeverity.LOW;
  }

  if (isValidationError(error)) {
    return ErrorSeverity.LOW;
  }

  if (isIdempotencyError(error)) {
    return error.conflictType === 'storage_error' ? ErrorSeverity.HIGH : ErrorSeverity.MEDIUM;
  }

  return undefined;
}

function inferSeverityFromMessage(message: string): ErrorSeverity {
  if (message.includes('timeout')) return ErrorSeverity.MEDIUM;
  if (message.includes('connection')) return ErrorSeverity.HIGH;
  if (message.includes('permission')) return ErrorSeverity.MEDIUM;
  if (message.includes('not found')) return ErrorSeverity.LOW;

  return ErrorSeverity.MEDIUM;
}

// Enhanced error context
interface ErrorContext {
  requestId?: string;
  userId?: string;
  operation?: string;
  component?: string;
  metadata?: ErrorMetadata;
  timestamp: number;
  severity: ErrorSeverity;
  retryable: boolean;
}

// Unified error handler class
export class UnifiedErrorHandler {
  private config: ErrorHandlingConfig;

  constructor(config: Partial<ErrorHandlingConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  // Main error handling method
  async handleError(
    error: Error,
    context: Partial<ErrorContext> = {}
  ): Promise<ErrorHandlingResult> {
    // Enrich context
    const enrichedContext: ErrorContext = {
      timestamp: Date.now(),
      severity: this.determineSeverity(error),
      retryable: this.isRetryable(error),
      ...context,
    };

    // Sanitize sensitive data
    this.sanitizeContext(enrichedContext);

    // Track metrics
    this.trackErrorMetrics(error, enrichedContext);

    // Determine response based on error type
    const errorResponse = this.createErrorResponse(error, enrichedContext);

    // Async capture if configured
    if (this.config.captureAsync) {
      this.captureErrorAsync(error, enrichedContext);
    }

    // Determine action
    const action = this.determineAction(enrichedContext);

    return {
      statusCode: errorResponse.statusCode,
      response: errorResponse.body,
      severity: enrichedContext.severity,
      action,
    };
  }

  // Express middleware wrapper
  middleware() {
    return async (err: unknown, req: Request, res: Response, _next: NextFunction) => {
      const context: Partial<ErrorContext> = {
        ...(req.requestId != null && { requestId: req.requestId }),
        ...(req.user?.id != null && { userId: req.user.id }),
        operation: `${req.method} ${req.path}`,
        component: 'api',
        metadata: {
          method: req.method,
          path: req.path,
          query: req.query,
          ip: req.ip,
          userAgent: req['get']('user-agent'),
        },
      };

      try {
        const result = await this.handleError(toError(err), context);

        if (!res.headersSent) {
          res.status(result.statusCode).json(result.response);
        }
      } catch (handlingError) {
        logger.error(
          { error: getErrorMessage(handlingError), requestId: context.requestId },
          'Error in error handler'
        );

        if (!res.headersSent) {
          res.status(500).json({
            error: 'Internal Server Error',
            code: 'INTERNAL_ERROR',
            requestId: context.requestId,
          });
        }
      }
    };
  }

  // Determine error severity
  private determineSeverity(error: Error): ErrorSeverity {
    return determineTypedSeverity(error) ?? inferSeverityFromMessage(error.message);
  }

  // Check if error is retryable
  private isRetryable(error: Error): boolean {
    // Check against configured retryable errors
    if (this.config.retryableErrors.some((code) => error.message.includes(code))) {
      return true;
    }

    // Type-specific retry logic
    if (isDatabaseError(error)) {
      return error.message.includes('connection') || error.message.includes('timeout');
    }

    if (isHealthCheckError(error)) {
      return error.checkType === 'connectivity';
    }

    if (isIdempotencyError(error)) {
      return error.conflictType === 'timeout';
    }

    return false;
  }

  // Create appropriate error response
  private createErrorResponse(
    error: Error,
    context: ErrorContext
  ): { statusCode: number; body: ApiErrorBody } {
    let statusCode = 500;
    let message = 'Internal Server Error';
    let code = 'INTERNAL_ERROR';

    if (isValidationError(error)) {
      statusCode = 400;
      message = error.message;
      code = 'VALIDATION_ERROR';
    } else if (isRateLimitError(error)) {
      statusCode = 429;
      message = 'Too Many Requests';
      code = 'RATE_LIMITED';
    } else if (isIdempotencyError(error)) {
      statusCode = 409;
      message = 'Idempotency Conflict';
      code = 'IDEMPOTENCY_CONFLICT';
    } else if (isDatabaseError(error)) {
      statusCode = 503;
      message = 'Service Temporarily Unavailable';
      code = 'DATABASE_ERROR';
    } else if (isHealthCheckError(error)) {
      statusCode = 503;
      message = 'Service Unhealthy';
      code = 'HEALTH_CHECK_FAILED';
    } else if (isDeploymentError(error)) {
      statusCode = 503;
      message = 'Deployment In Progress';
      code = 'DEPLOYMENT_ERROR';
    }

    return {
      statusCode,
      body: createErrorBody(message, context.requestId, code),
    };
  }

  // Determine action to take
  private determineAction(context: ErrorContext): ErrorAction {
    const severityRank = severityRanks[context.severity];

    if (context.retryable && severityRank <= severityRanks[ErrorSeverity.MEDIUM]) {
      return 'retry';
    }

    if (severityRank >= severityRanks[ErrorSeverity.HIGH]) {
      return 'escalate';
    }

    return 'ignore';
  }

  // Track error metrics
  private trackErrorMetrics(error: Error, context: ErrorContext) {
    void import('../metrics/businessMetrics.js')
      .then(({ businessMetrics }) => {
        // Track general error metrics
        businessMetrics.trackUserEngagement('error', context.severity, 'system');

        // Track specific error type metrics
        if (isDatabaseError(error)) {
          businessMetrics
            .trackDatabaseOperation('error', 'unknown', 'simple', 'default', async () => {
              throw error;
            })
            .catch((metricErr) => {
              logger.warn(
                { error: getErrorMessage(metricErr) },
                '[ErrorHandler] Failed to track database error metric'
              );
            });
        }

        if (isIdempotencyError(error)) {
          businessMetrics
            .trackIdempotency('conflict', error.cacheHit ? 'redis' : 'database', async () => {
              throw error;
            })
            .catch((metricErr) => {
              logger.warn(
                { error: getErrorMessage(metricErr) },
                '[ErrorHandler] Failed to track idempotency error metric'
              );
            });
        }
      })
      .catch((metricErr) => {
        logger.warn(
          { error: getErrorMessage(metricErr) },
          '[ErrorHandler] Failed to load business metrics'
        );
      });
  }

  // Async error capture
  private captureErrorAsync(error: Error, context: ErrorContext) {
    setImmediate(() => {
      try {
        // Create trace span for error
        const errorSpan = tracer.startSpan('error.capture', undefined, {
          error_type: error.constructor.name,
          severity: context.severity,
          component: context.component || 'unknown',
          operation: context.operation || 'unknown',
        });

        tracer.log(errorSpan.id, 'error', error.message, {
          stack: error.stack,
          context: this.sanitizeForLogging(context),
        });

        tracer.finishSpan(errorSpan.id, 'completed', {
          captured: true,
          severity: context.severity,
        });

        // In production, send to external error tracking (Sentry, etc.)
        this.sendToExternalTracking(error, context);
      } catch (captureError) {
        logger.error(
          { error: getErrorMessage(captureError) },
          'Failed to capture error asynchronously'
        );
      }
    });
  }

  // Send to external error tracking
  private sendToExternalTracking(error: Error, context: ErrorContext) {
    // Implementation would integrate with Sentry, Bugsnag, etc.
    // For now, send through the shared logger for visibility.
    if (this.config.notifyOnSeverity.includes(context.severity)) {
      logger.error(
        {
          severity: context.severity.toUpperCase(),
          errorName: error.name,
          errorMessage: error.message,
          context: this.sanitizeForLogging(context),
          stack: error.stack,
        },
        'External error tracking placeholder'
      );
    }
  }

  // Sanitize context for logging
  private sanitizeForLogging(context: ErrorContext): ErrorContext {
    const sanitized = { ...context };

    if (sanitized.metadata) {
      sanitized.metadata = this.sanitizeMetadata(sanitized.metadata);
    }

    return sanitized;
  }

  // Remove sensitive fields
  private removeSensitiveFields(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((entry) => this.removeSensitiveFields(entry));
    }

    if (!isObject(value)) {
      return value;
    }

    const sanitized: Record<string, unknown> = {};

    for (const [key, entry] of Object.entries(value)) {
      sanitized[key] = this.config.sensitiveFields.includes(key)
        ? '[REDACTED]'
        : this.removeSensitiveFields(entry);
    }

    return sanitized;
  }

  private sanitizeMetadata(metadata: ErrorMetadata): ErrorMetadata {
    const sanitized = this.removeSensitiveFields(metadata);
    return isObject(sanitized) ? sanitized : {};
  }

  // Sanitize context in place
  private sanitizeContext(context: ErrorContext) {
    if (context.metadata) {
      context.metadata = this.sanitizeMetadata(context.metadata);
    }
  }
}

// Global error handler instance
export const globalErrorHandler = new UnifiedErrorHandler();

// Convenience function for handling errors in async contexts
export async function handleAsyncError<T>(
  operation: () => Promise<T>,
  context: Partial<ErrorContext> = {}
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const handlingResult = await globalErrorHandler.handleError(toError(error), context);

    // Re-throw with enhanced context
    const enhancedError: ErrorWithHandlingResult = toError(error);
    enhancedError.handlingResult = handlingResult;
    throw enhancedError;
  }
}

// Circuit breaker pattern for retryable operations
export class ErrorCircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private threshold = 5,
    private timeout = 60000,
    private monitor = globalErrorHandler
  ) {}

  async execute<T>(operation: () => Promise<T>, context: Partial<ErrorContext> = {}): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime < this.timeout) {
        throw new Error('Circuit breaker is open');
      } else {
        this.state = 'half-open';
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();

      const handlingResult = await this.monitor.handleError(toError(error), {
        ...context,
        component: 'circuit-breaker',
      });

      if (
        handlingResult.action === 'retry' &&
        (this.state === 'closed' || this.state === 'half-open')
      ) {
        // Could implement retry logic here
      }

      throw error;
    }
  }

  private onSuccess() {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.threshold) {
      this.state = 'open';
    }
  }

  getState() {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
    };
  }
}
