import { MetricsCollector } from './MetricsCollector';
import { Logger } from './Logger';
import { ETagLogger } from './ETagLogger';

export interface HealthCheckConfig {
  checkInterval?: number; // milliseconds
  failureThreshold?: number;
  recoveryThreshold?: number;
  alertCooldown?: number; // milliseconds
}

export interface AgentHealth {
  agentName: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastSeen: number;
  consecutiveFailures: number;
  lastAlert: number;
  metrics: {
    successRate: number;
    avgDuration: number;
    errorRate: number;
  };
}

export class HealthMonitor {
  private config: HealthCheckConfig;
  private agentHealth: Map<string, AgentHealth> = new Map();
  private metrics: MetricsCollector;
  private logger: Logger;
  private intervalId?: NodeJS.Timeout;

  constructor(config: HealthCheckConfig = {}) {
    this.config = {
      checkInterval: 60000, // 1 minute
      failureThreshold: 3,
      recoveryThreshold: 2,
      alertCooldown: 300000, // 5 minutes
      ...config,
    };

    this.metrics = MetricsCollector.getInstance();
    this.logger = new Logger({
      level: 'info',
      agent: 'health-monitor',
    });
  }

  start(): void {
    if (this.intervalId) {
      this.logger.warn('Health monitor already running');
      return;
    }

    this.logger.info('Starting health monitor', { 
      checkInterval: this.config.checkInterval,
      failureThreshold: this.config.failureThreshold,
    });

    this.intervalId = setInterval(() => {
      this.performHealthCheck();
    }, this.config.checkInterval!);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
      this.logger.info('Health monitor stopped');
    }
  }

  registerAgent(agentName: string): void {
    if (!this.agentHealth.has(agentName)) {
      this.agentHealth.set(agentName, {
        agentName,
        status: 'healthy',
        lastSeen: Date.now(),
        consecutiveFailures: 0,
        lastAlert: 0,
        metrics: {
          successRate: 100,
          avgDuration: 0,
          errorRate: 0,
        },
      });
      
      this.logger.info('Registered agent for health monitoring', { agentName });
    }
  }

  updateAgentHealth(agentName: string, success: boolean, duration: number): void {
    const health = this.agentHealth.get(agentName);
    if (!health) {
      this.registerAgent(agentName);
      return this.updateAgentHealth(agentName, success, duration);
    }

    health.lastSeen = Date.now();

    if (success) {
      health.consecutiveFailures = 0;
    } else {
      health.consecutiveFailures++;
    }

    // Update status based on consecutive failures
    const previousStatus = health.status;
    if (health.consecutiveFailures >= this.config.failureThreshold!) {
      health.status = 'unhealthy';
    } else if (health.consecutiveFailures > 0) {
      health.status = 'degraded';
    } else {
      health.status = 'healthy';
    }

    // Send alerts for status changes
    this.handleStatusChange(health, previousStatus);
  }

  private async performHealthCheck(): Promise<void> {
    const now = Date.now();
    
    for (const health of this.agentHealth.values()) {
      // Check if agent has been inactive
      const timeSinceLastSeen = now - health.lastSeen;
      const isStale = timeSinceLastSeen > this.config.checkInterval! * 2;

      if (isStale && health.status !== 'unhealthy') {
        const previousStatus = health.status;
        health.status = 'unhealthy';
        health.consecutiveFailures = this.config.failureThreshold!;
        
        this.logger.warn('Agent appears inactive', {
          agentName: health.agentName,
          timeSinceLastSeen,
        });

        this.handleStatusChange(health, previousStatus);
      }

      // Update metrics from Prometheus if available
      try {
        await this.updateMetricsFromPrometheus(health);
      } catch (error: unknown) {
        this.logger.warn('Failed to update metrics from Prometheus', {
          agentName: health.agentName,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async updateMetricsFromPrometheus(health: AgentHealth): Promise<void> {
    // In a real implementation, this would query Prometheus
    // For now, we'll use mock data or skip
    const mockMetrics = {
      successRate: Math.random() * 100,
      avgDuration: Math.random() * 5000,
      errorRate: Math.random() * 10,
    };

    health.metrics = mockMetrics;
  }

  private async handleStatusChange(
    health: AgentHealth, 
    previousStatus: AgentHealth['status']
  ): Promise<void> {
    const now = Date.now();
    
    // Check if we should send an alert (respect cooldown)
    const shouldAlert = now - health.lastAlert > this.config.alertCooldown!;
    
    if (health.status !== previousStatus && shouldAlert) {
      this.logger.info('Agent status changed', {
        agentName: health.agentName,
        previousStatus,
        newStatus: health.status,
        consecutiveFailures: health.consecutiveFailures,
      });

      health.lastAlert = now;
    }
  }

  getAgentHealth(agentName?: string): AgentHealth[] {
    if (agentName) {
      const health = this.agentHealth.get(agentName);
      return health ? [health] : [];
    }
    
    return Array.from(this.agentHealth.values());
  }

  getOverallHealth(): {
    healthy: number;
    degraded: number;
    unhealthy: number;
    total: number;
  } {
    const stats = { healthy: 0, degraded: 0, unhealthy: 0, total: 0 };
    
    for (const health of this.agentHealth.values()) {
      stats[health.status]++;
      stats.total++;
    }
    
    // Generate ETag for health status caching
    const etag = ETagLogger.from(JSON.stringify(stats));
    this.logger.debug('Generated health status cache key', { stats, etag });
    
    return stats;
  }
}
