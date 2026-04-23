import { TypedEmitter, CircuitEvents } from './typed-events';
import { Mutex } from './mutex';
import { TokenBucket } from './token-bucket';
import type { CircuitState, CircuitBreakerOptions, StateChangeEvent } from './types';
import { isSystemError } from './error-classifier';
import { Ring } from './ring';

export class CircuitBreaker<T=unknown> {
  private state: CircuitState = 'CLOSED';
  private stateLock = new Mutex();
  private emitter = new TypedEmitter<CircuitEvents>();

  private failures = 0;
  private failureTimes: number[] = [];
  private openedAt = 0;
  private currentOpenInterval = 0;
  private resetBackoffMs: number;
  private maxResetBackoffMs: number;

  private halfOpenRequests = 0;
  private halfOpenSuccesses = 0;
  private halfOpenBucket?: TokenBucket;

  private totalRequests = 0;
  private successCount = 0;
  private fallbackCount = 0;
  private latencies = new Ring(1000);

  private effectiveFailureThreshold: number;

  constructor(
    private options: CircuitBreakerOptions,
    private operation: () => Promise<T>,
    private fallback: () => Promise<T>
  ) {
    this.resetBackoffMs = options.resetTimeout;
    this.maxResetBackoffMs = options.resetTimeout * 32;
    this.effectiveFailureThreshold = options.failureThreshold;
    if (options.halfOpenRateLimit) {
      this.halfOpenBucket = new TokenBucket(options.halfOpenRateLimit.capacity, options.halfOpenRateLimit.refillPerSecond);
    }
  }

  onStateChange(listener: (event: StateChangeEvent) => void) { this.emitter.on('stateChange', listener); }
  getState(): CircuitState { return this.state; }

  getMetrics() {
    const successRate = this.totalRequests > 0 ? this.successCount / this.totalRequests : 1;
    return {
      state: this.state,
      totalRequests: this.totalRequests,
      successCount: this.successCount,
      fallbackCount: this.fallbackCount,
      successRate,
      effectiveThreshold: this.effectiveFailureThreshold,
      currentBackoffMs: this.resetBackoffMs,
      isHealthy: this.state === 'CLOSED' && successRate > 0.95
    };
  }

  async execute(): Promise<T> { return this.executeWithCircuitBreaker(this.operation, this.fallback); }

  async run<R>(op: () => Promise<R>, fb: () => Promise<R>): Promise<R> { return this.executeWithCircuitBreaker(op, fb); }

  private async executeWithCircuitBreaker<R>(operation: () => Promise<R>, fallback: () => Promise<R>): Promise<R> {
    const start = Date.now();
    this.totalRequests++;

    if (this.state === 'OPEN') {
      if (Date.now() - this.openedAt > this.currentOpenInterval) {
        await this.transitionState('OPEN', 'HALF_OPEN', 'backoff interval elapsed');
      } else {
        this.fallbackCount++;
        this.emitter.emit('circuitOpen', { timestamp: Date.now() });
        return fallback();
      }
    }

    let isHalfOpenProbe = false;
    if (this.state === 'HALF_OPEN') {
      const rateOk = !this.halfOpenBucket || this.halfOpenBucket.tryConsume();
      const concOk = this.halfOpenRequests < (this.options.maxHalfOpenRequests ?? 3);
      if (!rateOk || !concOk) {
        this.fallbackCount++;
        this.emitter.emit('probeDenied', { rateLimited: !rateOk, concurrencyLimited: !concOk, timestamp: Date.now() });
        return fallback();
      }
      isHalfOpenProbe = true;
      this.halfOpenRequests++;
    }

    try {
      const result = await this.withTimeout(operation(), this.options.operationTimeout ?? 5000, 'circuit breaker operation');
      this.successCount++;
      this.latencies.push(Date.now() - start);
      await this.handleSuccess();
      return result;
    } catch (error) {
      this.latencies.push(Date.now() - start);
      if (isSystemError(error)) {
        await this.handleFailure(error as Error);
      }
      this.fallbackCount++;
      return fallback();
    } finally {
      if (isHalfOpenProbe) this.halfOpenRequests--;
    }
  }

  private async handleSuccess() {
    if (this.state === 'HALF_OPEN') {
      this.halfOpenSuccesses++;
      const need = this.options.successesToClose ?? 2;
      if (this.halfOpenSuccesses >= need) {
        await this.transitionState('HALF_OPEN', 'CLOSED', `${need} consecutive successes`);
      }
    } else if (this.state === 'CLOSED') {
      this.failures = 0;
      this.failureTimes = [];
    }
    if (this.options.adaptiveThreshold?.enabled) this.maybeAdaptThreshold();
  }

  private async handleFailure(error: Error) {
    if (this.options.monitoringPeriod) {
      this.recordFailureTime(Date.now());
    } else {
      this.failures++;
    }
    if (this.state === 'HALF_OPEN') this.halfOpenSuccesses = 0;
    const shouldOpen = this.options.monitoringPeriod ? this.tooManyRecentFailures() : this.failures >= this.effectiveFailureThreshold;
    if (shouldOpen) {
      const from: CircuitState[] = ['CLOSED', 'HALF_OPEN'];
      if (from.includes(this.state)) {
        await this.transitionState(from, 'OPEN', `failure threshold reached: ${error.message}`);
      }
    }
  }

  private async transitionState(from: CircuitState | CircuitState[], to: CircuitState, reason: string): Promise<boolean> {
    return this.stateLock.runExclusive(async () => {
      const validFrom = Array.isArray(from) ? from : [from];
      if (!validFrom.includes(this.state)) return false;
      const prev = this.state;
      this.state = to;
      switch (to) {
        case 'HALF_OPEN':
          this.halfOpenRequests = 0;
          this.halfOpenSuccesses = 0;
          this.halfOpenBucket?.reset();
          break;
        case 'CLOSED':
          this.failures = 0;
          this.failureTimes = [];
          this.halfOpenSuccesses = 0;
          this.resetBackoffMs = this.options.resetTimeout;
          break;
        case 'OPEN':
          this.openedAt = Date.now();
          this.currentOpenInterval = this.nextResetInterval();
          break;
      }
      const event = { from: prev, to, reason, timestamp: Date.now() };
      this.emitter.emit('stateChange', event);
      return true;
    });
  }

  private nextResetInterval(): number {
    const jitter = 0.7 + Math.random() * 0.6;
    const interval = Math.min(this.resetBackoffMs * jitter, this.maxResetBackoffMs);
    this.resetBackoffMs = Math.min(this.resetBackoffMs * 2, this.maxResetBackoffMs);
    return interval;
  }

  private async withTimeout<R>(p: Promise<R>, ms: number, label: string): Promise<R> {
    let to: any;
    const timeout = new Promise<never>((_, reject) => { to = setTimeout(() => reject(new Error(`Timeout (${label}) after ${ms}ms`)), ms); });
    try { return await Promise.race([p, timeout]); } finally { clearTimeout(to); }
  }

  private recordFailureTime(now: number) {
    const cutoff = now - (this.options.monitoringPeriod ?? 60_000);
    this.failureTimes.push(now);
    while (this.failureTimes.length && this.failureTimes[0] < cutoff) this.failureTimes.shift();
  }

  private tooManyRecentFailures(): boolean {
    return this.failureTimes.length >= this.effectiveFailureThreshold;
  }

  private maybeAdaptThreshold() {
    const cfg = this.options.adaptiveThreshold;
    if (!cfg?.enabled) return;
    const recentSuccessRate = this.successCount / Math.max(this.totalRequests, 1);
    if (recentSuccessRate > 0.95) {
      this.effectiveFailureThreshold = Math.min(cfg.max, Math.round(this.effectiveFailureThreshold * (1 + cfg.rate)));
    } else if (recentSuccessRate < 0.8) {
      this.effectiveFailureThreshold = Math.max(cfg.min, Math.round(this.effectiveFailureThreshold * (1 - cfg.rate)));
    }
  }
}
