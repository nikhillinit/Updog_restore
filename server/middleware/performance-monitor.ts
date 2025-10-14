/**
 * Advanced Performance Monitoring Middleware
 *
 * Provides comprehensive performance tracking for Monte Carlo simulations,
 * API endpoints, and database operations with intelligent alerting.
 */

import type { Request, Response, NextFunction } from 'express';
import { performance } from 'perf_hooks';
import EventEmitter from 'events';
import { spreadIfDefined } from '@shared/lib/ts/spreadIfDefined';

interface PerformanceMetric {
  operation: string;
  duration: number;
  timestamp: number;
  metadata?: Record<string, any>;
  category: 'monte_carlo' | 'api' | 'database' | 'computation';
  severity: 'normal' | 'slow' | 'critical';
}

interface PerformanceThresholds {
  normal: number;
  slow: number;
  critical: number;
}

class PerformanceMonitor extends EventEmitter {
  private metrics: PerformanceMetric[] = [];
  private thresholds: Map<string, PerformanceThresholds> = new Map();
  private readonly maxMetrics = 10000; // Prevent memory leaks

  constructor() {
    super();
    this.setupDefaultThresholds();
    this.setupCleanupTask();
  }

  private setupDefaultThresholds() {
    // Monte Carlo simulation thresholds
    this.thresholds.set('monte_carlo_simulation', {
      normal: 5000,    // 5 seconds
      slow: 15000,     // 15 seconds
      critical: 30000  // 30 seconds
    });

    // Database operation thresholds
    this.thresholds.set('database_query', {
      normal: 100,     // 100ms
      slow: 500,       // 500ms
      critical: 2000   // 2 seconds
    });

    // API endpoint thresholds
    this.thresholds.set('api_request', {
      normal: 200,     // 200ms
      slow: 1000,      // 1 second
      critical: 5000   // 5 seconds
    });

    // Portfolio calculation thresholds
    this.thresholds.set('portfolio_calculation', {
      normal: 1000,    // 1 second
      slow: 5000,      // 5 seconds
      critical: 15000  // 15 seconds
    });
  }

  private setupCleanupTask() {
    // Clean old metrics every hour
    setInterval(() => {
      this.cleanOldMetrics();
    }, 60 * 60 * 1000);
  }

  private cleanOldMetrics() {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    this.metrics = this.metrics.filter(m => m.timestamp > oneHourAgo);
  }

  /**
   * Track a performance metric
   */
  track(operation: string, duration: number, category: PerformanceMetric['category'], metadata?: Record<string, any>) {
    const threshold = this.thresholds.get(operation) || this.thresholds.get('api_request')!;

    let severity: PerformanceMetric['severity'] = 'normal';
    if (duration > threshold.critical) {
      severity = 'critical';
    } else if (duration > threshold.slow) {
      severity = 'slow';
    }

    const metric: PerformanceMetric = {
      operation,
      duration,
      timestamp: Date.now(),
      ...spreadIfDefined('metadata', metadata),
      category,
      severity
    };

    this.metrics.push(metric);

    // Emit events for real-time monitoring
    if (severity !== 'normal') {
      this.emit('performance_alert', metric);
    }

    this.emit('metric_recorded', metric);

    // Prevent memory leaks
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics * 0.8); // Keep 80%
    }
  }

  /**
   * Get performance statistics for an operation
   */
  getStats(operation?: string, timeWindow?: number): {
    count: number;
    avgDuration: number;
    minDuration: number;
    maxDuration: number;
    p95Duration: number;
    slowCount: number;
    criticalCount: number;
  } {
    const cutoff = timeWindow ? Date.now() - timeWindow : 0;
    let filteredMetrics = this.metrics.filter(m => m.timestamp > cutoff);

    if (operation) {
      filteredMetrics = filteredMetrics.filter(m => m.operation === operation);
    }

    if (filteredMetrics.length === 0) {
      return {
        count: 0,
        avgDuration: 0,
        minDuration: 0,
        maxDuration: 0,
        p95Duration: 0,
        slowCount: 0,
        criticalCount: 0
      };
    }

    const durations = filteredMetrics.map(m => m.duration).sort((a, b) => a - b);
    const count = durations.length;
    const sum = durations.reduce((a, b) => a + b, 0);
    const p95Index = Math.floor(count * 0.95);

    return {
      count,
      avgDuration: sum / count,
      minDuration: durations[0],
      maxDuration: durations[count - 1],
      p95Duration: durations[p95Index] || 0,
      slowCount: filteredMetrics.filter(m => m.severity === 'slow').length,
      criticalCount: filteredMetrics.filter(m => m.severity === 'critical').length
    };
  }

  /**
   * Get recent performance alerts
   */
  getRecentAlerts(limit: number = 50): PerformanceMetric[] {
    return this.metrics
      .filter(m => m.severity !== 'normal')
      .slice(-limit)
      .reverse();
  }

  /**
   * Express middleware for automatic API performance tracking
   */
  middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const startTime = performance.now();
      const originalEnd = res.end;

      res.end = function(this: Response, ...args: any[]) {
        const duration = performance.now() - startTime;
        const operation = `${req["method"]} ${req.route?.path || req.path}`;

        monitor.track(operation, duration, 'api', {
          method: req.method,
          path: req.path,
          statusCode: res["statusCode"],
          userAgent: req["get"]('User-Agent'),
          ip: req.ip
        });

        return originalEnd.apply(this, args);
      };

      next();
    };
  }

  /**
   * Decorator for tracking function performance
   */
  trackFunction<T extends (...args: any[]) => any>(
    operation: string,
    category: PerformanceMetric['category'],
    fn: T
  ): T {
    return ((...args: Parameters<T>) => {
      const startTime = performance.now();

      try {
        const result = fn(...args);

        // Handle both sync and async functions
        if (result && typeof result.then === 'function') {
          return result.finally(() => {
            const duration = performance.now() - startTime;
            this.track(operation, duration, category, { args: args.length });
          });
        } else {
          const duration = performance.now() - startTime;
          this.track(operation, duration, category, { args: args.length });
          return result;
        }
      } catch (error) {
        const duration = performance.now() - startTime;
        this.track(operation, duration, category, {
          args: args.length,
          error: error instanceof Error ? error.message : String(error)
        });
        throw error;
      }
    }) as T;
  }

  /**
   * Manual timing helper
   */
  createTimer(operation: string, category: PerformanceMetric['category']) {
    const startTime = performance.now();

    return {
      end: (metadata?: Record<string, any>) => {
        const duration = performance.now() - startTime;
        this.track(operation, duration, category, metadata);
        return duration;
      }
    };
  }

  /**
   * Export metrics for external monitoring systems
   */
  exportMetrics(): {
    summary: Record<string, any>;
    recentMetrics: PerformanceMetric[];
    alerts: PerformanceMetric[];
  } {
    const operations = [...new Set(this.metrics.map(m => m.operation))];
    const summary: Record<string, any> = {};

    for (const operation of operations) {
      summary[operation] = this.getStats(operation, 60 * 60 * 1000); // Last hour
    }

    return {
      summary,
      recentMetrics: this.metrics.slice(-100),
      alerts: this.getRecentAlerts(20)
    };
  }
}

// Global instance
export const monitor = new PerformanceMonitor();

// Enhanced Monte Carlo performance tracking
export class MonteCarloPerformanceTracker {
  private simulationTimers = new Map<string, number>();

  startSimulation(simulationId: string, config: any) {
    this.simulationTimers.set(simulationId, performance.now());

    monitor.track('monte_carlo_start', 0, 'monte_carlo', {
      simulationId,
      runs: config.runs,
      portfolioSize: config.portfolioSize
    });
  }

  endSimulation(simulationId: string, results: any) {
    const startTime = this.simulationTimers.get(simulationId);
    if (!startTime) return;

    const duration = performance.now() - startTime;
    this.simulationTimers.delete(simulationId);

    monitor.track('monte_carlo_simulation', duration, 'monte_carlo', {
      simulationId,
      duration,
      resultCount: results?.scenarios?.length || 0,
      hasError: !results
    });
  }

  trackBatch(batchId: string, batchSize: number, duration: number) {
    monitor.track('monte_carlo_batch', duration, 'monte_carlo', {
      batchId,
      batchSize,
      throughput: batchSize / (duration / 1000) // scenarios per second
    });
  }

  trackMemoryUsage(operation: string, memoryUsage: NodeJS.MemoryUsage) {
    monitor.track(`memory_${operation}`, memoryUsage.heapUsed, 'computation', {
      heapTotal: memoryUsage.heapTotal,
      heapUsed: memoryUsage.heapUsed,
      external: memoryUsage.external,
      rss: memoryUsage.rss
    });
  }
}

export const monteCarloTracker = new MonteCarloPerformanceTracker();

// Database performance tracking
export function trackDatabaseQuery<T>(
  queryName: string,
  queryFn: () => Promise<T>
): Promise<T> {
  return monitor.trackFunction(queryName, 'database', queryFn)();
}

// Portfolio calculation tracking
export function trackPortfolioCalculation<T>(
  calculationType: string,
  calculationFn: () => T
): T {
  return monitor.trackFunction(calculationType, 'computation', calculationFn)();
}

// Performance alert handlers
monitor.on('performance_alert', (metric: PerformanceMetric) => {
  console.warn(`🐌 Performance Alert: ${metric.operation} took ${metric.duration}ms (${metric.severity})`);

  // Could integrate with external alerting systems here
  if (metric.severity === 'critical') {
    console.error(`🚨 CRITICAL: ${metric.operation} performance degradation detected!`);
  }
});

export default monitor;