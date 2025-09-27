import { EventEmitter } from 'events';
import { Mutex } from './mutex';
import { TokenBucket } from './token-bucket';
import { classifyError } from './error-classifier';
import type { CircuitBreakerOptions, CircuitState } from './types';
import type { StateChangeEvent, ProbeDeniedEvent } from './typed-events';

export class CircuitBreaker<T> {
  private state: CircuitState = 'CLOSED';
  private stateLock = new Mutex();
  private emitter = new EventEmitter();

  // Failure tracking
  private failures = 0;
  private failureTimes: number[] = [];

  // State timestamps/backoff
  private openedAt = 0;
  private currentOpenInterval = 0;
  private resetBackoffMs: number;
  private readonly maxResetBackoffMs: number;

  // Half-open
  private halfOpenRequests = 0;
  private halfOpenSuccesses = 0;
  private halfOpenBucket?: TokenBucket;

  // Metrics
  private totalRequests = 0;
  private successCount = 0;
  private fallbackCount = 0;
  private latencies: number[] = [];

  // Adaptive
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
      this.halfOpenBucket = new TokenBucket(
        options.halfOpenRateLimit.capacity,
        options.halfOpenRateLimit.refillPerSecond
      );
    }
  }

  async execute(): Promise<T> {
    return this.executeWithCircuitBreaker(this.operation, this.fallback);
  }

  async run<R>(op: () => Promise<R>, fb: () => Promise<R>): Promise<R> {
    return this.executeWithCircuitBreaker(op, fb);
  }

  private async executeWithCircuitBreaker<R>(operation: () => Promise<R>, fallback: () => Promise<R>): Promise<R> {
    const start = Date.now();
    this.totalRequests++;

    if (this.state === 'OPEN') {
      if (Date.now() - this.openedAt > this.currentOpenInterval) {
        await this.transitionState(['OPEN'], 'HALF_OPEN', 'backoff interval elapsed');
      } else {
        this.fallbackCount++;
        this.emitter.emit('circuitOpen', { timestamp: Date.now() });
        return fallback();
      }
    }

    let isProbe = false;
    if (this.state === 'HALF_OPEN') {
      const rateOK = !this.halfOpenBucket || this.halfOpenBucket.tryConsume();
      const concOK = this.halfOpenRequests < (this.options.maxHalfOpenRequests ?? 3);
      if (!rateOK || !concOK) {
        this.fallbackCount++;
        const ev: ProbeDeniedEvent = { rateLimited: !rateOK, concurrencyLimited: !concOK, timestamp: Date.now() };
        this.emitter.emit('probeDenied', ev);
        return fallback();
      }
      isProbe = true;
      this.halfOpenRequests++;
    }

    try {
      const result = await this.withTimeout(operation(), this.options.operationTimeout ?? 5000, 'operation');
      this.successCount++;
      this.recordLatency(Date.now() - start);
      await this.handleSuccess();
      return result;
    } catch (err) {
      this.recordLatency(Date.now() - start);
      if (classifyError(err) === 'system') {
        await this.handleFailure(err as Error);
      }
      this.fallbackCount++;
      return fallback();
    } finally {
      if (isProbe) this.halfOpenRequests--;
    }
  }

  private async handleSuccess() {
    if (this.state === 'HALF_OPEN') {
      this.halfOpenSuccesses++;
      const need = this.options.successesToClose ?? 2;
      if (this.halfOpenSuccesses >= need) {
        await this.transitionState(['HALF_OPEN'], 'CLOSED', `${need} consecutive successes`);
      }
    } else {
      // CLOSED
      this.failures = 0;
      this.failureTimes = [];
    }
    this.maybeAdaptThreshold();
  }

  private async handleFailure(_error: Error) {
    if (this.options.monitoringPeriod) {
      const now = Date.now();
      const cutoff = now - this.options.monitoringPeriod;
      this.failureTimes.push(now);
      while (this.failureTimes.length && this.failureTimes[0] < cutoff) this.failureTimes.shift();
    } else {
      this.failures++;
    }

    if (this.state === 'HALF_OPEN') this.halfOpenSuccesses = 0;

    const shouldOpen = this.options.monitoringPeriod
      ? this.failureTimes.length >= this.effectiveFailureThreshold
      : this.failures >= this.effectiveFailureThreshold;

    if (shouldOpen && (this.state === 'CLOSED' || this.state === 'HALF_OPEN')) {
      await this.transitionState(['CLOSED', 'HALF_OPEN'], 'OPEN', 'failure threshold reached');
    }
  }

  private async transitionState(from: CircuitState[] | CircuitState, to: CircuitState, reason: string): Promise<boolean> {
    return this.stateLock.runExclusive(async () => {
      const allow = Array.isArray(from) ? from : [from];
      if (!allow.includes(this.state)) return false;
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

      const ev: StateChangeEvent = { from: prev, to, reason, timestamp: Date.now() };
      this.emitter.emit('stateChange', ev);
      return true;
    });
  }

  private nextResetInterval(): number {
    const jitter = 0.7 + Math.random() * 0.6; // 70–130%
    const interval = Math.min(this.resetBackoffMs * jitter, this.maxResetBackoffMs);
    this.resetBackoffMs = Math.min(this.resetBackoffMs * 2, this.maxResetBackoffMs);
    return interval;
  }

  private async withTimeout<R>(p: Promise<R>, ms: number, label: string): Promise<R> {
    let to: NodeJS.Timeout;
    const timeout = new Promise<never>((_: any, reject: any) => {
      to = setTimeout(() => reject(new Error(`Timeout (${label}) after ${ms}ms`)), ms);
    });
    try {
      return await Promise.race([p, timeout]);
    } finally {
      clearTimeout(to!);
    }
  }

  private maybeAdaptThreshold() {
    const a = this.options.adaptiveThreshold;
    if (!a?.enabled) return;
    const successRate = this.totalRequests > 0 ? this.successCount / this.totalRequests : 1;
    if (successRate > 0.95) {
      this.effectiveFailureThreshold = Math.min(a.max, Math.round(this.effectiveFailureThreshold * (1 + a.rate)));
    } else if (successRate < 0.8) {
      this.effectiveFailureThreshold = Math.max(a.min, Math.round(this.effectiveFailureThreshold * (1 - a.rate)));
    }
  }

  private recordLatency(ms: number) {
    this.latencies.push(ms);
    if (this.latencies.length > 1000) this.latencies.shift();
  }

  // Public API
  onStateChange(listener: (_e: StateChangeEvent) => void) { this.emitter['on']('stateChange', listener); }
  getState(): CircuitState { return this.state; }
  getMetrics() {
    const successRate = this.totalRequests ? this.successCount / this.totalRequests : 0;
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
}
