/**
 * Deployment Circuit Breaker
 * Prevents cascade failures in deployment pipeline
 */

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  halfOpenTests: number;
}

export class DeploymentCircuitBreaker {
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private failures = 0;
  private lastFailureTime = 0;
  private readonly config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = {
      failureThreshold: 3,
      resetTimeout: 3600000, // 1 hour
      halfOpenTests: 1,
      ...config
    };
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
      }

      return result;

    } catch (error) {
      this.failures++;
      this.lastFailureTime = Date.now();

      if (this.failures >= this.config.failureThreshold) {
        this.state = 'open';
        console.error(`🚨 Circuit breaker OPEN after ${this.failures} failures`);

        // Alert team
        await this.alertTeam({
          severity: 'P1',
          message: 'Deployment circuit breaker triggered',
          failures: this.failures,
          willResetAt: new Date(this.lastFailureTime + this.config.resetTimeout),
          error: error instanceof Error ? error.message : String(error)
        });
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
  reset() {
    this.state = 'closed';
    this.failures = 0;
    this.lastFailureTime = 0;
    console.log('🔧 Circuit breaker manually reset');
  }

  forceOpen() {
    this.state = 'open';
    this.lastFailureTime = Date.now();
    console.log('🚨 Circuit breaker manually opened');
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