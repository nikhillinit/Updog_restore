import type { BreakerLike } from './typed-breaker';

/**
 * Central registry for all circuit breakers in the application
 * Provides a single source of truth for monitoring and admin access
 */
export class BreakerRegistry {
  private static instance: BreakerRegistry;
  private breakers = new Map<string, BreakerLike>();

  private constructor() {}

  static getInstance(): BreakerRegistry {
    if (!BreakerRegistry.instance) {
      BreakerRegistry.instance = new BreakerRegistry();
    }
    return BreakerRegistry.instance;
  }

  register(name: string, breaker: BreakerLike): void {
    this.breakers['set'](name, breaker);
    console.log(`[breaker-registry] Registered breaker: ${name}`);
  }

  get(name: string): BreakerLike | undefined {
    return this.breakers['get'](name);
  }

  getAll(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    this.breakers.forEach((breaker, name) => {
      result[name] = {
        state: breaker.getState(),
        stats: breaker.getMetrics?.() || {}
      };
    });
    return result;
  }

  // Get critical breakers for readiness checks
  getCritical(): Array<{ name: string; breaker: BreakerLike }> {
    const critical: Array<{ name: string; breaker: BreakerLike }> = [];

    // Add cache and database breakers as critical
    this.breakers.forEach((breaker, name) => {
      if (name.includes('cache') || name.includes('db') || name.includes('database')) {
        critical.push({ name, breaker });
      }
    });

    return critical;
  }

  // Health check: are any critical breakers open?
  isHealthy(): boolean {
    const critical = this.getCritical();
    return !critical.some(({ breaker }) => breaker.getState() === 'OPEN');
  }

  // Get degraded services (half-open or recently recovered)
  getDegraded(): string[] {
    const degraded: string[] = [];
    this.breakers.forEach((breaker, name) => {
      const state = breaker.getState();
      if (state === 'HALF_OPEN' || state === 'OPEN') {
        degraded.push(name);
      }
    });
    return degraded;
  }
}

// Singleton export
export const breakerRegistry = BreakerRegistry.getInstance();