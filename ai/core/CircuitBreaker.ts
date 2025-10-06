import { CircuitBreakerOpenError } from './errors';

type State = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface BreakerOpts {
  failureThreshold?: number;     // consecutive failures to OPEN
  halfOpenAfterMs?: number;      // cooldown before HALF_OPEN trial
  onStateChange?: (s: State) => void;
}

/**
 * CircuitBreaker: Fault tolerance for external service calls
 *
 * State machine:
 * - CLOSED: Normal operation, all requests pass through
 * - OPEN: Failing too much, immediately reject requests
 * - HALF_OPEN: Trial period, allow one request to test recovery
 *
 * Default: 5 failures → OPEN, 60s cooldown → HALF_OPEN
 */
export class CircuitBreaker {
  private state: State = 'CLOSED';
  private consecutiveFailures = 0;
  private lastOpenedAt = 0;

  constructor(private opts: BreakerOpts = {}) {}

  /**
   * Execute operation with circuit breaker protection
   */
  async run<T>(op: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const failThresh = this.opts.failureThreshold ?? 5;
    const cooldown = this.opts.halfOpenAfterMs ?? 60_000;

    // Check if breaker should transition from OPEN → HALF_OPEN
    if (this.state === 'OPEN') {
      if (now - this.lastOpenedAt >= cooldown) {
        this.setState('HALF_OPEN');
      } else {
        throw new CircuitBreakerOpenError('circuit-breaker');
      }
    }

    try {
      const res = await op();

      // Success: reset failure count and close breaker
      this.consecutiveFailures = 0;
      if (this.state === 'HALF_OPEN') {
        this.setState('CLOSED');
      }

      return res;
    } catch (err) {
      this.consecutiveFailures++;

      // Trip breaker if threshold exceeded
      if (this.state === 'HALF_OPEN' || this.consecutiveFailures >= failThresh) {
        this.lastOpenedAt = now;
        this.setState('OPEN');
      }

      throw err;
    }
  }

  /**
   * Get current breaker state
   */
  getState(): State {
    return this.state;
  }

  /**
   * Manually reset breaker to CLOSED
   */
  reset(): void {
    this.consecutiveFailures = 0;
    this.setState('CLOSED');
  }

  private setState(s: State) {
    this.state = s;
    this.opts.onStateChange?.(s);
  }
}
