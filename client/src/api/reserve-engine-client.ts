/**
 * Reserve Engine API Client
 *
 * Type-safe client for the deterministic capital reserve allocation engine API.
 * Provides methods for calculating optimal reserve allocations, running optimizations,
 * and managing scenarios.
 *
 * Features:
 * - Full TypeScript type safety
 * - Automatic retry with exponential backoff
 * - Rate limit handling
 * - Request correlation IDs
 * - Error handling with detailed error types
 * - AbortController support for request cancellation
 */

import type {
  ReserveCalculationRequest,
  ReserveCalculationResponse,
  OptimizationRequest,
  OptimizationResponse,
  ScenarioResponse,
  ErrorResponse,
  ValidationErrorResponse,
  RateLimitResponse,
  HealthCheckResponse,
  ReserveEngineClientConfig,
  RequestOptions,
  ApiResponse,
} from '../../../shared/types/reserve-engine';

import {
  isErrorResponse,
  isValidationErrorResponse,
  isRateLimitResponse,
  assertSuccessResponse,
} from '../../../shared/types/reserve-engine';

// ============================================================================
// Error Classes
// ============================================================================

export class ReserveEngineError extends Error {
  constructor(
    message: string,
    public readonly response: ErrorResponse
  ) {
    super(message);
    this.name = 'ReserveEngineError';
  }
}

export class ValidationError extends ReserveEngineError {
  constructor(public readonly response: ValidationErrorResponse) {
    super('Validation failed', response);
    this.name = 'ValidationError';
  }
}

export class RateLimitError extends ReserveEngineError {
  constructor(public readonly response: RateLimitResponse) {
    super(`Rate limit exceeded. Retry after ${response.retryAfter}s`, response);
    this.name = 'RateLimitError';
  }
}

export class AuthenticationError extends ReserveEngineError {
  constructor(response: ErrorResponse) {
    super('Authentication failed', response);
    this.name = 'AuthenticationError';
  }
}

export class NotFoundError extends ReserveEngineError {
  constructor(response: ErrorResponse) {
    super('Resource not found', response);
    this.name = 'NotFoundError';
  }
}

// ============================================================================
// Client Implementation
// ============================================================================

export class ReserveEngineClient {
  private readonly config: Required<
    Omit<ReserveEngineClientConfig, 'apiKey' | 'onError' | 'onRateLimit'>
  > & {
    apiKey?: string;
    onError?: (error: ErrorResponse) => void;
    onRateLimit?: (response: RateLimitResponse) => void;
  };

  constructor(config: ReserveEngineClientConfig) {
    this.config = {
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      timeout: config.timeout ?? 30000,
      retryAttempts: config.retryAttempts ?? 3,
      retryDelay: config.retryDelay ?? 1000,
      onError: config.onError,
      onRateLimit: config.onRateLimit,
    };
  }

  // ==========================================================================
  // Public API Methods
  // ==========================================================================

  /**
   * Calculate optimal reserve allocation
   *
   * @param request - Reserve calculation request parameters
   * @param options - Request options (timeout, signal, headers)
   * @returns Allocation result with initial deals, capital breakdown, and stage details
   * @throws {ValidationError} If request validation fails
   * @throws {RateLimitError} If rate limit is exceeded
   * @throws {ReserveEngineError} For other API errors
   */
  async calculateReserveAllocation(
    request: ReserveCalculationRequest,
    options?: RequestOptions
  ): Promise<ReserveCalculationResponse> {
    const response = await this.post<ReserveCalculationResponse>(
      '/reserve/calculate',
      request,
      options
    );

    assertSuccessResponse(response);
    return response;
  }

  /**
   * Optimize portfolio allocation across multiple scenarios
   *
   * @param request - Optimization request with constraints and goals
   * @param options - Request options
   * @returns Optimal scenario and comparison of all scenarios
   * @throws {ValidationError} If request validation fails
   * @throws {RateLimitError} If rate limit is exceeded
   * @throws {ReserveEngineError} For other API errors
   */
  async optimizeReserveAllocation(
    request: OptimizationRequest,
    options?: RequestOptions
  ): Promise<OptimizationResponse> {
    const response = await this.post<OptimizationResponse>(
      '/reserve/optimize',
      request,
      options
    );

    assertSuccessResponse(response);
    return response;
  }

  /**
   * Get scenario results by ID
   *
   * @param scenarioId - Unique scenario identifier
   * @param options - Request options
   * @returns Scenario calculation results
   * @throws {NotFoundError} If scenario is not found
   * @throws {ReserveEngineError} For other API errors
   */
  async getScenario(
    scenarioId: string,
    options?: RequestOptions
  ): Promise<ScenarioResponse> {
    const response = await this.get<ScenarioResponse>(
      `/reserve/scenarios/${scenarioId}`,
      options
    );

    assertSuccessResponse(response);
    return response;
  }

  /**
   * Health check endpoint
   *
   * @returns Service health status
   */
  async healthCheck(): Promise<HealthCheckResponse> {
    const url = `${this.config.baseUrl}/reserve/health`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.buildHeaders(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  // ==========================================================================
  // Private HTTP Methods
  // ==========================================================================

  private async get<T>(
    path: string,
    options?: RequestOptions
  ): Promise<ApiResponse<T>> {
    return this.request<T>('GET', path, undefined, options);
  }

  private async post<T>(
    path: string,
    body: unknown,
    options?: RequestOptions
  ): Promise<ApiResponse<T>> {
    return this.request<T>('POST', path, body, options);
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<ApiResponse<T>> {
    const url = `${this.config.baseUrl}${path}`;
    const timeout = options?.timeout ?? this.config.timeout;

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const signal = options?.signal ?? controller.signal;

        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          method,
          headers: this.buildHeaders(options?.headers),
          body: body ? JSON.stringify(body) : undefined,
          signal,
        });

        clearTimeout(timeoutId);

        const data = await response.json();

        // Handle error responses
        if (!response.ok) {
          return this.handleErrorResponse(response.status, data);
        }

        return data as ApiResponse<T>;
      } catch (error) {
        lastError = error as Error;

        // Don't retry on abort
        if ((error as Error).name === 'AbortError') {
          throw error;
        }

        // Don't retry on last attempt
        if (attempt === this.config.retryAttempts) {
          break;
        }

        // Exponential backoff
        const delay = this.config.retryDelay * Math.pow(2, attempt);
        await this.sleep(delay);
      }
    }

    throw lastError ?? new Error('Request failed after all retry attempts');
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private buildHeaders(customHeaders?: Record<string, string>): HeadersInit {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Client-Version': '1.0.0',
      ...customHeaders,
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    return headers;
  }

  private handleErrorResponse(status: number, data: unknown): ErrorResponse {
    if (!isErrorResponse(data)) {
      // Construct error response from non-standard error
      const errorResponse: ErrorResponse = {
        success: false,
        error: 'Unknown error',
        code: 'UNKNOWN_ERROR',
        correlationId: 'unknown',
        timestamp: new Date().toISOString(),
      };

      this.config.onError?.(errorResponse);
      return errorResponse;
    }

    // Handle specific error types
    if (isValidationErrorResponse(data)) {
      const error = new ValidationError(data);
      this.config.onError?.(data);
      throw error;
    }

    if (isRateLimitResponse(data)) {
      const error = new RateLimitError(data);
      this.config.onRateLimit?.(data);
      throw error;
    }

    if (status === 401) {
      const error = new AuthenticationError(data);
      this.config.onError?.(data);
      throw error;
    }

    if (status === 404) {
      const error = new NotFoundError(data);
      this.config.onError?.(data);
      throw error;
    }

    // Generic error response
    const error = new ReserveEngineError(data.error, data);
    this.config.onError?.(data);
    throw error;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a Reserve Engine API client
 *
 * @param config - Client configuration
 * @returns Configured client instance
 */
export function createReserveEngineClient(
  config: ReserveEngineClientConfig
): ReserveEngineClient {
  return new ReserveEngineClient(config);
}

/**
 * Create a Reserve Engine API client with default configuration
 *
 * @param apiKey - API authentication key
 * @param baseUrl - Optional base URL (defaults to current host)
 * @returns Configured client instance
 */
export function createDefaultClient(
  apiKey: string,
  baseUrl?: string
): ReserveEngineClient {
  return new ReserveEngineClient({
    baseUrl: baseUrl ?? `${window.location.origin}/api/v1`,
    apiKey,
    timeout: 30000,
    retryAttempts: 3,
    retryDelay: 1000,
  });
}

// ============================================================================
// React Hook (Optional)
// ============================================================================

/**
 * React hook for using the Reserve Engine client
 *
 * Usage:
 * ```tsx
 * const client = useReserveEngineClient(apiKey);
 * const result = await client.calculateReserveAllocation(request);
 * ```
 */
export function useReserveEngineClient(
  apiKey: string,
  baseUrl?: string
): ReserveEngineClient {
  // In a real implementation, use useMemo to prevent recreation on every render
  return createDefaultClient(apiKey, baseUrl);
}

// ============================================================================
// Re-exports from shared types
// ============================================================================

export type * from '../../../shared/types/reserve-engine';
