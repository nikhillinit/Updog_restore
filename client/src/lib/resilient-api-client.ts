/**
 * Resilient API Client with Exponential Backoff and Circuit Breaker
 * Provides reliable communication with the backend API
 */

interface ApiClientConfig {
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  circuitBreakerThreshold?: number;
  circuitBreakerResetMs?: number;
}

interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}

function isRetryableError(error: any): boolean {
  // Network errors
  if (error.name === 'AbortError' || error.name === 'TypeError') return true;
  
  // HTTP status codes that should be retried
  const status = error.status;
  return status >= 500 || status === 429 || status === 408 || status === 0;
}

function calculateBackoffDelay(attempt: number, baseDelay: number, maxDelay: number): number {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 0.1 * exponentialDelay; // 10% jitter
  return Math.min(exponentialDelay + jitter, maxDelay);
}

export class ResilientApiClient {
  private config: Required<ApiClientConfig>;
  private circuitBreaker: CircuitBreakerState = {
    failures: 0,
    lastFailureTime: 0,
    state: 'CLOSED',
  };

  constructor(config: ApiClientConfig = {}) {
    this.config = {
      baseUrl: config.baseUrl || import.meta.env.VITE_API_BASE_URL || '',
      timeoutMs: config.timeoutMs || 15000,
      maxRetries: config.maxRetries || 3,
      baseDelayMs: config.baseDelayMs || 1000,
      maxDelayMs: config.maxDelayMs || 8000,
      circuitBreakerThreshold: config.circuitBreakerThreshold || 5,
      circuitBreakerResetMs: config.circuitBreakerResetMs || 60000, // 1 minute
    };
  }

  /**
   * Make a POST request with retry logic and circuit breaker
   */
  async post<T>(path: string, body: unknown): Promise<T> {
    // Check circuit breaker
    if (this.isCircuitOpen()) {
      throw new Error('Circuit breaker is OPEN - service unavailable');
    }

    let lastError: Error;
    
    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        const response = await this.makeRequest<T>(path, body);
        this.onSuccess();
        return response;
      } catch (error) {
        lastError = error as Error;
        this.onFailure();
        
        // Don't retry if circuit is now open or error is not retryable
        if (this.isCircuitOpen() || !isRetryableError(error)) {
          throw lastError;
        }
        
        // Don't retry on last attempt
        if (attempt === this.config.maxRetries - 1) {
          throw lastError;
        }
        
        // Calculate delay and wait before retry
        const delay = calculateBackoffDelay(
          attempt,
          this.config.baseDelayMs,
          this.config.maxDelayMs
        );
        
        console.log(`Retrying request (attempt ${attempt + 1}/${this.config.maxRetries}) after ${delay}ms`);
        await this.sleep(delay);
      }
    }
    
    throw lastError!;
  }

  /**
   * Make a GET request with retry logic
   */
  async get<T>(path: string): Promise<T> {
    // Check circuit breaker
    if (this.isCircuitOpen()) {
      throw new Error('Circuit breaker is OPEN - service unavailable');
    }

    let lastError: Error;
    
    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        const response = await this.makeGetRequest<T>(path);
        this.onSuccess();
        return response;
      } catch (error) {
        lastError = error as Error;
        this.onFailure();
        
        if (this.isCircuitOpen() || !isRetryableError(error)) {
          throw lastError;
        }
        
        if (attempt === this.config.maxRetries - 1) {
          throw lastError;
        }
        
        const delay = calculateBackoffDelay(
          attempt,
          this.config.baseDelayMs,
          this.config.maxDelayMs
        );
        
        await this.sleep(delay);
      }
    }
    
    throw lastError!;
  }

  /**
   * Make actual HTTP request
   */
  private async makeRequest<T>(path: string, body: unknown): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);
    
    try {
      const response = await fetch(`${this.config.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': crypto.randomUUID(),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        const error = new Error(errorText) as any;
        error.status = response.status;
        throw error;
      }
      
      return await response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Make GET request
   */
  private async makeGetRequest<T>(path: string): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);
    
    try {
      const response = await fetch(`${this.config.baseUrl}${path}`, {
        method: 'GET',
        headers: {
          'X-Request-ID': crypto.randomUUID(),
        },
        signal: controller.signal,
      });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        const error = new Error(errorText) as any;
        error.status = response.status;
        throw error;
      }
      
      return await response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Circuit breaker: check if circuit is open
   */
  private isCircuitOpen(): boolean {
    const now = Date.now();
    
    // Check if we should transition from OPEN to HALF_OPEN
    if (this.circuitBreaker.state === 'OPEN') {
      if (now - this.circuitBreaker.lastFailureTime > this.config.circuitBreakerResetMs) {
        this.circuitBreaker.state = 'HALF_OPEN';
        console.log('Circuit breaker transitioned to HALF_OPEN');
      }
    }
    
    return this.circuitBreaker.state === 'OPEN';
  }

  /**
   * Circuit breaker: record success
   */
  private onSuccess(): void {
    if (this.circuitBreaker.state === 'HALF_OPEN') {
      this.circuitBreaker.state = 'CLOSED';
      this.circuitBreaker.failures = 0;
      console.log('Circuit breaker transitioned to CLOSED');
    }
  }

  /**
   * Circuit breaker: record failure
   */
  private onFailure(): void {
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailureTime = Date.now();
    
    if (this.circuitBreaker.failures >= this.config.circuitBreakerThreshold) {
      if (this.circuitBreaker.state !== 'OPEN') {
        this.circuitBreaker.state = 'OPEN';
        console.error(`Circuit breaker OPENED after ${this.circuitBreaker.failures} failures`);
      }
    }
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Reset circuit breaker (for testing or manual intervention)
   */
  resetCircuitBreaker(): void {
    this.circuitBreaker = {
      failures: 0,
      lastFailureTime: 0,
      state: 'CLOSED',
    };
    console.log('Circuit breaker reset to CLOSED');
  }
}

// Singleton instance with default configuration
export const apiClient = new ResilientApiClient();

// Typed API methods for reserves
export const reservesApi = {
  /**
   * Calculate reserve allocations
   */
  calculate: async (data: {
    companies: any[];
    availableReserves: number;
    policies: any[];
    constraints?: any;
  }) => {
    return apiClient.post<any>('/v1/reserves/calculate', data);
  },

  /**
   * Validate parity with Excel
   */
  validateParity: async (dataset?: any) => {
    return apiClient.post<any>('/v1/reserves/validate-parity', { dataset });
  },

  /**
   * Get API health status
   */
  health: async () => {
    return apiClient.get<any>('/v1/reserves/health');
  },

  /**
   * Get API configuration
   */
  config: async () => {
    return apiClient.get<any>('/v1/reserves/config');
  },
};