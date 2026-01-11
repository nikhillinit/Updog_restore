/**
 * Real-time performance monitoring and alerting system
 * Provides comprehensive metrics collection, threshold monitoring, and automated alerts
 */

import { metrics } from '@/metrics/reserves-metrics';

export interface PerformanceThresholds {
  calculationTime: {
    warning: number; // ms
    critical: number; // ms
  };
  memoryUsage: {
    warning: number; // MB
    critical: number; // MB
  };
  cacheHitRate: {
    warning: number; // percentage (0-100)
    critical: number; // percentage (0-100)
  };
  errorRate: {
    warning: number; // percentage (0-100)
    critical: number; // percentage (0-100)
  };
}

export interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: Date;
  threshold?: 'normal' | 'warning' | 'critical';
  context?: Record<string, unknown>;
}

export interface PerformanceAlert {
  id: string;
  level: 'warning' | 'critical';
  metric: string;
  value: number;
  threshold: number;
  message: string;
  timestamp: Date;
  resolved?: Date;
  context?: Record<string, unknown>;
}

export class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private alerts: PerformanceAlert[] = [];
  private activeAlerts = new Map<string, PerformanceAlert>();

  private readonly thresholds: PerformanceThresholds = {
    calculationTime: {
      warning: 500, // 500ms
      critical: 2000, // 2s
    },
    memoryUsage: {
      warning: 100, // 100MB
      critical: 250, // 250MB
    },
    cacheHitRate: {
      warning: 70, // Below 70%
      critical: 50, // Below 50%
    },
    errorRate: {
      warning: 1, // Above 1%
      critical: 5, // Above 5%
    },
  };

  private readonly MAX_METRICS = 1000;
  private readonly METRIC_RETENTION = 60 * 60 * 1000; // 1 hour
  private cleanupTimer: number | null = null;

  constructor() {
    this.startCleanupTimer();
    this.initializePerformanceObserver();
  }

  /**
   * Record a performance measurement with automatic threshold checking
   */
  recordMetric(name: string, value: number, unit: string, context?: Record<string, unknown>): void {
    const metric: PerformanceMetric = {
      name,
      value,
      unit,
      timestamp: new Date(),
      ...(context !== undefined ? { context } : {}),
    };

    // Determine threshold level
    metric.threshold = this.evaluateThreshold(name, value);

    // Store metric
    this.metrics.push(metric);

    // Trim metrics if needed
    if (this.metrics.length > this.MAX_METRICS) {
      this.metrics = this.metrics.slice(-this.MAX_METRICS);
    }

    // Check for alerts
    this.checkThresholds(metric);

    // Report to external metrics system (only 3 params supported)
    metrics.recordPerformanceMetric(name, value, unit);
  }

  /**
   * Record calculation performance with comprehensive context
   */
  recordCalculationPerformance(
    duration: number,
    companyCount: number,
    success: boolean,
    cacheHit: boolean = false
  ): void {
    this.recordMetric('calculation_duration', duration, 'ms', {
      companyCount,
      success,
      cacheHit,
      throughput: companyCount / (duration / 1000), // companies per second
    });

    // Record memory usage if available
    if (typeof performance !== 'undefined' && 'memory' in performance) {
      const memory = (
        performance as {
          memory: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
        }
      ).memory;
      this.recordMetric('memory_used', memory.usedJSHeapSize / 1024 / 1024, 'MB', {
        total: memory.totalJSHeapSize / 1024 / 1024,
        limit: memory.jsHeapSizeLimit / 1024 / 1024,
      });
    }
  }

  /**
   * Record cache performance metrics
   */
  recordCachePerformance(hits: number, misses: number, totalSize: number): void {
    const total = hits + misses;
    const hitRate = total > 0 ? (hits / total) * 100 : 100;

    this.recordMetric('cache_hit_rate', hitRate, '%', {
      hits,
      misses,
      total,
      cacheSize: totalSize,
    });

    this.recordMetric('cache_size', totalSize, 'entries');
  }

  /**
   * Record error rate over time window
   */
  recordErrorRate(errors: number, total: number, windowMs: number): void {
    const errorRate = total > 0 ? (errors / total) * 100 : 0;

    this.recordMetric('error_rate', errorRate, '%', {
      errors,
      total,
      windowMs,
      errorCount: errors,
    });
  }

  /**
   * Get current performance summary
   */
  getPerformanceSummary(windowMs: number = 5 * 60 * 1000): {
    averages: Record<string, number>;
    peaks: Record<string, number>;
    alerts: PerformanceAlert[];
    health: 'good' | 'warning' | 'critical';
  } {
    const cutoff = Date.now() - windowMs;
    const recentMetrics = this.metrics.filter((m) => m.timestamp.getTime() > cutoff);

    // Calculate averages and peaks
    const averages: Record<string, number> = {};
    const peaks: Record<string, number> = {};

    const metricGroups = recentMetrics.reduce(
      (acc, metric) => {
        if (!acc[metric.name]) acc[metric.name] = [];
        acc[metric.name]!.push(metric.value);
        return acc;
      },
      {} as Record<string, number[]>
    );

    for (const [name, values] of Object.entries(metricGroups)) {
      const numberArray = values as number[];
      averages[name] = numberArray.reduce((sum, val) => sum + val, 0) / numberArray.length;
      peaks[name] = Math.max(...numberArray);
    }

    // Get recent alerts
    const recentAlerts = this.alerts.filter((a) => a.timestamp.getTime() > cutoff);

    // Determine overall health
    const criticalAlerts = recentAlerts.filter((a) => a.level === 'critical' && !a.resolved);
    const warningAlerts = recentAlerts.filter((a) => a.level === 'warning' && !a.resolved);

    let health: 'good' | 'warning' | 'critical' = 'good';
    if (criticalAlerts.length > 0) health = 'critical';
    else if (warningAlerts.length > 0) health = 'warning';

    return {
      averages,
      peaks,
      alerts: recentAlerts,
      health,
    };
  }

  /**
   * Get detailed performance report
   */
  generatePerformanceReport(): {
    summary: unknown;
    trends: Record<string, number[]>;
    recommendations: string[];
    alerts: PerformanceAlert[];
  } {
    const summary = this.getPerformanceSummary();

    // Calculate trends (last hour vs previous hour)
    const hourMs = 60 * 60 * 1000;
    const now = Date.now();

    const trends: Record<string, number[]> = {};
    const recommendations: string[] = [];

    // Generate hourly buckets for trends
    for (let i = 23; i >= 0; i--) {
      const bucketStart = now - (i + 1) * hourMs;
      const bucketEnd = now - i * hourMs;

      const bucketMetrics = this.metrics.filter(
        (m) => m.timestamp.getTime() >= bucketStart && m.timestamp.getTime() < bucketEnd
      );

      const bucketAverages = this.calculateAverages(bucketMetrics);

      for (const [metric, value] of Object.entries(bucketAverages)) {
        if (!trends[metric]) trends[metric] = [];
        trends[metric]!.push(value);
      }
    }

    // Generate recommendations
    if ((summary.averages['calculation_duration'] ?? 0) > this.thresholds.calculationTime.warning) {
      recommendations.push(
        'Consider optimizing calculation algorithms or implementing better caching'
      );
    }

    if ((summary.averages['cache_hit_rate'] ?? 1) < this.thresholds.cacheHitRate.warning) {
      recommendations.push('Review cache strategy - hit rate is below optimal levels');
    }

    if ((summary.averages['error_rate'] ?? 0) > this.thresholds.errorRate.warning) {
      recommendations.push('Investigate error patterns and improve error handling');
    }

    if ((summary.averages['memory_used'] ?? 0) > this.thresholds.memoryUsage.warning) {
      recommendations.push('Monitor memory usage - consider implementing memory optimization');
    }

    return {
      summary,
      trends,
      recommendations,
      alerts: this.alerts.slice(-50), // Last 50 alerts
    };
  }

  private evaluateThreshold(metricName: string, value: number): 'normal' | 'warning' | 'critical' {
    const thresholdKey = this.getThresholdKey(metricName);
    if (!thresholdKey) return 'normal';

    const threshold = this.thresholds[thresholdKey];
    if (!threshold) return 'normal';

    // For cache hit rate, lower is worse
    if (metricName.includes('cache_hit_rate')) {
      if (value < threshold.critical) return 'critical';
      if (value < threshold.warning) return 'warning';
      return 'normal';
    }

    // For most other metrics, higher is worse
    if (value > threshold.critical) return 'critical';
    if (value > threshold.warning) return 'warning';
    return 'normal';
  }

  private getThresholdKey(metricName: string): keyof PerformanceThresholds | null {
    if (metricName.includes('duration') || metricName.includes('time')) return 'calculationTime';
    if (metricName.includes('memory')) return 'memoryUsage';
    if (metricName.includes('cache')) return 'cacheHitRate';
    if (metricName.includes('error')) return 'errorRate';
    return null;
  }

  private checkThresholds(metric: PerformanceMetric): void {
    if (metric.threshold === 'warning' || metric.threshold === 'critical') {
      const alertId = `${metric.name}_${metric.threshold}`;

      // Check if we already have an active alert for this
      if (!this.activeAlerts.has(alertId)) {
        const alert: PerformanceAlert = {
          id: alertId,
          level: metric.threshold,
          metric: metric.name,
          value: metric.value,
          threshold: this.getThresholdValue(metric.name, metric.threshold),
          message: this.generateAlertMessage(metric),
          timestamp: new Date(),
          ...(metric.context !== undefined ? { context: metric.context } : {}),
        };

        this.alerts.push(alert);
        this.activeAlerts.set(alertId, alert);

        // Send to external alerting system
        this.sendAlert(alert);
      }
    } else {
      // Check if we can resolve any active alerts
      const alertsToResolve = Array.from(this.activeAlerts.keys()).filter((id) =>
        id.startsWith(metric.name)
      );

      alertsToResolve.forEach((alertId) => {
        const alert = this.activeAlerts.get(alertId);
        if (alert) {
          alert.resolved = new Date();
          this.activeAlerts.delete(alertId);
        }
      });
    }
  }

  private getThresholdValue(metricName: string, level: 'warning' | 'critical'): number {
    const thresholdKey = this.getThresholdKey(metricName);
    if (!thresholdKey) return 0;
    return this.thresholds[thresholdKey][level];
  }

  private generateAlertMessage(metric: PerformanceMetric): string {
    const threshold = this.getThresholdValue(
      metric.name,
      metric.threshold as 'warning' | 'critical'
    );

    return `${metric.name} ${metric.threshold}: ${metric.value}${metric.unit} (threshold: ${threshold}${metric.unit})`;
  }

  private sendAlert(alert: PerformanceAlert): void {
    // Send to console for development
    console.warn(`Performance Alert [${alert.level.toUpperCase()}]:`, alert.message);

    // Send to external alerting system (webhook, monitoring service, etc.)
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const alertData = {
        type: 'performance_alert',
        ...alert,
        timestamp: alert.timestamp.toISOString(),
      };

      const alertUrl = document
        .querySelector('meta[name="alert-endpoint"]')
        ?.getAttribute('content');
      if (alertUrl) {
        navigator.sendBeacon(alertUrl, JSON.stringify(alertData));
      }
    }
  }

  private calculateAverages(metrics: PerformanceMetric[]): Record<string, number> {
    const groups = metrics.reduce(
      (acc, metric) => {
        if (!acc[metric.name]) acc[metric.name] = [];
        acc[metric.name]!.push(metric.value);
        return acc;
      },
      {} as Record<string, number[]>
    );

    const averages: Record<string, number> = {};
    for (const [name, values] of Object.entries(groups)) {
      const numberArray = values as number[];
      if (numberArray.length > 0) {
        averages[name] = numberArray.reduce((sum, val) => sum + val, 0) / numberArray.length;
      }
    }

    return averages;
  }

  private initializePerformanceObserver(): void {
    if (typeof PerformanceObserver !== 'undefined') {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (entry.entryType === 'measure') {
            this.recordMetric(entry.name, entry.duration, 'ms', {
              entryType: entry.entryType,
              startTime: entry.startTime,
            });
          }
        });
      });

      observer.observe({ entryTypes: ['measure'] });
    }
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = window.setInterval(
      () => {
        this.cleanup();
      },
      5 * 60 * 1000
    ); // Cleanup every 5 minutes
  }

  private cleanup(): void {
    const cutoff = Date.now() - this.METRIC_RETENTION;

    // Remove old metrics
    this.metrics = this.metrics.filter((m) => m.timestamp.getTime() > cutoff);

    // Remove old resolved alerts
    this.alerts = this.alerts.filter(
      (a) => a.timestamp.getTime() > cutoff || !a.resolved || a.resolved.getTime() > cutoff
    );
  }

  // Cleanup on destruction
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }
}

// Export singleton
export const performanceMonitor = new PerformanceMonitor();
