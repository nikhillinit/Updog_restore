/**
 * Deployment Circuit Breaker
 * Prevents cascade failures in deployment pipeline
 */

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  halfOpenTests: number;
  redisUrl?: string;
  persistenceKey?: string;
}

interface CircuitBreakerState {
  state: 'closed' | 'open' | 'half-open';
  failures: number;
  lastFailureTime: number;
}

export class DeploymentCircuitBreaker {
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private failures = 0;
  private lastFailureTime = 0;
  private readonly config: CircuitBreakerConfig;
  private redis?: any; // Redis client for persistence

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = {
      failureThreshold: 3,
      resetTimeout: 3600000, // 1 hour
      halfOpenTests: 1,
      persistenceKey: 'deployment-circuit-breaker',
      ...config
    };
    
    // Initialize Redis if URL provided
    if (this.config.redisUrl) {
      this.initializeRedis();
    }
  }

  private async initializeRedis() {
    try {
      const Redis = (await import('ioredis')).default;
      this.redis = new Redis(this.config.redisUrl!);
      await this.loadState();
    } catch (error) {
      console.warn('Failed to initialize Redis for circuit breaker persistence:', error);
    }
  }

  private async loadState() {
    if (!this.redis) return;
    
    try {
      const data = await this.redis.get(this.config.persistenceKey);
      if (data) {
        const state: CircuitBreakerState = JSON.parse(data);
        this.state = state.state;
        this.failures = state.failures;
        this.lastFailureTime = state.lastFailureTime;
        console.log(`🔄 Loaded circuit breaker state: ${this.state} (${this.failures} failures)`);
      }
    } catch (error) {
      console.warn('Failed to load circuit breaker state from Redis:', error);
    }
  }

  private async saveState() {
    if (!this.redis) return;
    
    try {
      const state: CircuitBreakerState = {
        state: this.state,
        failures: this.failures,
        lastFailureTime: this.lastFailureTime
      };
      
      // Set TTL to reset timeout so state expires naturally
      const ttlSeconds = Math.ceil(this.config.resetTimeout / 1000);
      await this.redis.setex(this.config.persistenceKey!, ttlSeconds, JSON.stringify(state));
    } catch (error) {
      console.warn('Failed to save circuit breaker state to Redis:', error);
    }
  }

  async executeDeployment<T>(deployFn: () => Promise<T>): Promise<T> {
    // Check circuit state
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.config.resetTimeout) {
        this.state = 'half-open';
        console.log('🔄 Circuit breaker half-open, attempting deployment');
      } else {
        const resetTime = new Date(this.lastFailureTime + this.config.resetTimeout);
        throw new Error(`Circuit breaker OPEN - deployments disabled until ${resetTime.toISOString()}`);
      }
    }

    try {
      const result = await deployFn();

      // Success - reset or close circuit
      if (this.state === 'half-open') {
        this.state = 'closed';
        this.failures = 0;
        console.log('✅ Circuit breaker closed - deployments re-enabled');
        await this.saveState();
      }

      return result;

    } catch (error) {
      this.failures++;
      this.lastFailureTime = Date.now();

      if (this.failures >= this.config.failureThreshold) {
        this.state = 'open';
        console.error(`🚨 Circuit breaker OPEN after ${this.failures} failures`);
        await this.saveState();

        // Alert team
        await this.alertTeam({
          severity: 'P1',
          message: 'Deployment circuit breaker triggered',
          failures: this.failures,
          willResetAt: new Date(this.lastFailureTime + this.config.resetTimeout),
          error: error instanceof Error ? error.message : String(error)
        });
      } else {
        await this.saveState();
      }

      throw error;
    }
  }

  getStatus() {
    return {
      state: this.state,
      failures: this.failures,
      lastFailure: this.lastFailureTime ? new Date(this.lastFailureTime) : null,
      willResetAt: this.state === 'open'
        ? new Date(this.lastFailureTime + this.config.resetTimeout)
        : null,
      healthy: this.state !== 'open'
    };
  }

  // Manual circuit management
  async reset() {
    this.state = 'closed';
    this.failures = 0;
    this.lastFailureTime = 0;
    console.log('🔧 Circuit breaker manually reset');
    await this.saveState();
  }

  async forceOpen() {
    this.state = 'open';
    this.lastFailureTime = Date.now();
    console.log('🚨 Circuit breaker manually opened');
    await this.saveState();
  }

  private async alertTeam(alert: {
    severity: string;
    message: string;
    failures: number;
    willResetAt: Date;
    error: string;
  }) {
    try {
      // In production, integrate with alerting systems
      console.error('🚨 DEPLOYMENT CIRCUIT BREAKER ALERT:', {
        severity: alert.severity,
        message: alert.message,
        failures: alert.failures,
        willResetAt: alert.willResetAt.toISOString(),
        error: alert.error,
        timestamp: new Date().toISOString()
      });

      // Example integrations:
      // - Slack webhook
      // - PagerDuty incident
      // - Email notifications
      // - Datadog events

    } catch (alertError) {
      console.error('Failed to send circuit breaker alert:', alertError);
    }
  }

  // Health check for monitoring
  isHealthy(): boolean {
    return this.state !== 'open';
  }

  // Metrics for observability
  getMetrics() {
    return {
      circuit_breaker_state: this.state,
      circuit_breaker_failures: this.failures,
      circuit_breaker_healthy: this.isHealthy() ? 1 : 0,
      circuit_breaker_last_failure_timestamp: this.lastFailureTime
    };
  }
}