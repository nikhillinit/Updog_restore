/**
 * Circuit Breaker for Fault Tolerance
 *
 * Implements the circuit breaker pattern to prevent cascade failures
 * when Redis is unavailable or slow.
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Too many failures, reject all requests
 * - HALF_OPEN: Testing recovery, allow probe requests
 *
 * Phase 2 - Issue #2: Redis L2 Cache
 */

export enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open'
}

export interface CircuitBreakerConfig {
  /**
   * Number of failures before tripping to OPEN
   * @default 5
   */
  threshold: number;

  /**
   * Time window for counting failures (ms)
   * @default 60000 (60s)
   */
  timeout: number;

  /**
   * Time to wait before transitioning to HALF_OPEN (ms)
   * @default 120000 (2min)
   */
  resetTimeout: number;

  /**
   * Number of successful probes to close circuit
   * @default 3
   */
  successThreshold?: number;
}

/**
 * Circuit breaker implementation
 *
 * Usage:
 * ```typescript
 * const breaker = new CircuitBreaker({ threshold: 5, timeout: 60000, resetTimeout: 120000 });
 *
 * if (breaker.isOpen()) {
 *   // Skip operation, use fallback
 *   return fallbackValue;
 * }
 *
 * try {
 *   const result = await operation();
 *   breaker.recordSuccess();
 *   return result;
 * } catch (error) {
 *   breaker.recordFailure();
 *   throw error;
 * }
 * ```
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures = 0;
  private lastFailureTime = 0;
  private successCount = 0;
  private openedAt = 0;
  private readonly successThreshold: number;

  constructor(private config: CircuitBreakerConfig) {
    this.successThreshold = config.successThreshold ?? 3;
  }

  /**
   * Record successful operation
   *
   * In HALF_OPEN state, accumulates successes toward closing circuit.
   * In CLOSED state, resets failure counter.
   */
  recordSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;

      // Enough successes to close circuit
      if (this.successCount >= this.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
        this.failures = 0;
        this.successCount = 0;
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure counter on success
      this.failures = 0;
    }
  }

  /**
   * Record failed operation
   *
   * Increments failure counter and may transition to OPEN state.
   */
  recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      // Failure during probe - back to OPEN
      this.transitionTo(CircuitState.OPEN);
      this.successCount = 0;
    } else if (this.state === CircuitState.CLOSED) {
      // Check if we've exceeded threshold
      if (this.failures >= this.config.threshold) {
        this.transitionTo(CircuitState.OPEN);
        this.scheduleReset();
      }
    }
  }

  /**
   * Check if circuit is open (rejecting requests)
   *
   * @returns True if circuit is open
   */
  isOpen(): boolean {
    if (this.state === CircuitState.OPEN) {
      // Check if it's time to transition to HALF_OPEN
      const timeSinceOpened = Date.now() - this.openedAt;

      if (timeSinceOpened >= this.config.resetTimeout) {
        this.transitionTo(CircuitState.HALF_OPEN);
        this.successCount = 0;
        return false; // Allow probe request
      }

      return true; // Still open
    }

    return false;
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    // Update state if needed
    if (this.state === CircuitState.OPEN) {
      this.isOpen(); // May transition to HALF_OPEN
    }

    return this.state;
  }

  /**
   * Get failure count
   */
  getFailureCount(): number {
    return this.failures;
  }

  /**
   * Get success count (during HALF_OPEN)
   */
  getSuccessCount(): number {
    return this.successCount;
  }

  /**
   * Force circuit to CLOSED state (use sparingly, for testing)
   */
  reset(): void {
    this.transitionTo(CircuitState.CLOSED);
    this.failures = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
    this.openedAt = 0;
  }

  /**
   * Force circuit to OPEN state (use sparingly, for maintenance)
   */
  trip(): void {
    this.transitionTo(CircuitState.OPEN);
    this.scheduleReset();
  }

  /**
   * Transition to new state
   */
  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;

    if (oldState === newState) return;

    this.state = newState;

    if (newState === CircuitState.OPEN) {
      this.openedAt = Date.now();
    }

    // Optional: Emit event for monitoring
    // console.log(`[CircuitBreaker] ${oldState} → ${newState}`);
  }

  /**
   * Schedule automatic transition to HALF_OPEN
   */
  private scheduleReset(): void {
    // Note: This is handled dynamically in isOpen()
    // We don't use setTimeout to avoid memory leaks in long-running processes
  }

  /**
   * Get stats for monitoring
   */
  getStats(): {
    state: CircuitState;
    failures: number;
    successCount: number;
    lastFailureTime: number;
    openedAt: number;
  } {
    return {
      state: this.getState(),
      failures: this.failures,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      openedAt: this.openedAt,
    };
  }
}
