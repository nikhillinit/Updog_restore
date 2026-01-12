/**
 * Production Monitoring and Observability System
 * Comprehensive monitoring for reserve calculation engine and API
 */

import { register, Counter, Histogram, Gauge, Summary } from 'prom-client';
import { EventEmitter } from 'events';
import { logger } from '../lib/logger';

// Metric definitions
const reserveCalculationDuration = new Histogram({
  name: 'reserve_calculation_duration_seconds',
  help: 'Duration of reserve calculations in seconds',
  labelNames: ['scenario_type', 'portfolio_size_bucket', 'success'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
});

const reserveCalculationTotal = new Counter({
  name: 'reserve_calculations_total',
  help: 'Total number of reserve calculations performed',
  labelNames: ['scenario_type', 'success', 'error_type'],
});

const portfolioMetrics = new Gauge({
  name: 'portfolio_metrics',
  help: 'Current portfolio metrics',
  labelNames: ['metric_type', 'fund_id'],
});

const apiRequestDuration = new Summary({
  name: 'api_request_duration_seconds',
  help: 'Duration of API requests',
  labelNames: ['method', 'route', 'status_code'],
  percentiles: [0.5, 0.9, 0.95, 0.99],
});

const activeCalculations = new Gauge({
  name: 'active_reserve_calculations',
  help: 'Number of currently active reserve calculations',
});

const parityValidationResults = new Gauge({
  name: 'parity_validation_results',
  help: 'Results of Excel parity validations',
  labelNames: ['metric_type', 'status'],
});

const systemHealth = new Gauge({
  name: 'system_health_score',
  help: 'Overall system health score (0-1)',
  labelNames: ['component'],
});

const errorRate = new Counter({
  name: 'error_rate_total',
  help: 'Total number of errors by type',
  labelNames: ['error_type', 'component', 'severity'],
});

// Business metrics
const fundMetrics = new Gauge({
  name: 'fund_metrics',
  help: 'Fund-level metrics',
  labelNames: ['fund_id', 'metric_type'],
});

const allocationMetrics = new Gauge({
  name: 'allocation_metrics',
  help: 'Reserve allocation metrics',
  labelNames: ['fund_id', 'allocation_type'],
});

// Performance budgets and SLOs
interface PerformanceBudget {
  metric: string;
  threshold: number;
  timeWindow: string;
  severity: 'warning' | 'critical';
}

interface SLOTarget {
  name: string;
  target: number;
  timeWindow: string;
  description: string;
}

const PERFORMANCE_BUDGETS: PerformanceBudget[] = [
  {
    metric: 'reserve_calculation_duration_p95',
    threshold: 5.0, // 5 seconds
    timeWindow: '5m',
    severity: 'critical',
  },
  {
    metric: 'api_error_rate',
    threshold: 0.05, // 5%
    timeWindow: '15m',
    severity: 'warning',
  },
  {
    metric: 'parity_validation_pass_rate',
    threshold: 0.95, // 95%
    timeWindow: '1h',
    severity: 'critical',
  },
];

const SLO_TARGETS: SLOTarget[] = [
  {
    name: 'Reserve Calculation Availability',
    target: 0.999, // 99.9%
    timeWindow: '30d',
    description: 'Reserve calculation API should be available 99.9% of the time',
  },
  {
    name: 'Calculation Latency',
    target: 0.95, // 95% under 2s
    timeWindow: '24h',
    description: '95% of reserve calculations should complete within 2 seconds',
  },
  {
    name: 'Excel Parity',
    target: 0.98, // 98% pass rate
    timeWindow: '7d',
    description: '98% of parity validations should pass within tolerance',
  },
];

// Event emitter for real-time monitoring
class MonitoringEventEmitter extends EventEmitter {
  recordCalculationStart(calculationId: string, metadata: Record<string, unknown>) {
    this.emit('calculation:start', { calculationId, metadata, timestamp: Date.now() });
  }

  recordCalculationComplete(calculationId: string, result: Record<string, unknown>) {
    this.emit('calculation:complete', { calculationId, result, timestamp: Date.now() });
  }

  recordCalculationError(calculationId: string, error: Error | unknown) {
    this.emit('calculation:error', { calculationId, error, timestamp: Date.now() });
  }

  recordParityValidation(validationId: string, result: Record<string, unknown>) {
    this.emit('parity:validation', { validationId, result, timestamp: Date.now() });
  }

  recordPerformanceBudgetViolation(budget: PerformanceBudget, currentValue: number) {
    this.emit('performance:budget-violation', { budget, currentValue, timestamp: Date.now() });
  }

  recordSLOViolation(slo: SLOTarget, currentValue: number) {
    this.emit('slo:violation', { slo, currentValue, timestamp: Date.now() });
  }
}

export const monitoringEvents = new MonitoringEventEmitter();

// Main monitoring class
export class ProductionMonitor {
  private calculationTimes = new Map<string, number>();
  private healthChecks = new Map<string, () => Promise<boolean>>();
  private alertingEnabled = true;

  constructor() {
    this.setupEventListeners();
    this.startHealthMonitoring();
    this.startPerformanceMonitoring();
  }

  // Calculation monitoring
  recordCalculationStart(
    calculationId: string,
    scenarioType: string,
    portfolioSize: number,
    metadata: Record<string, unknown> = {}
  ): void {
    this.calculationTimes['set'](calculationId, Date.now());
    activeCalculations.inc();

    monitoringEvents.recordCalculationStart(calculationId, {
      scenarioType,
      portfolioSize,
      ...metadata,
    });

    logger.info({
      calculationId,
      scenarioType,
      portfolioSize,
      metadata,
    }, 'Reserve calculation started');
  }

  recordCalculationComplete(
    calculationId: string,
    scenarioType: string,
    portfolioSize: number,
    result: Record<string, unknown>
  ): void {
    const startTime = this.calculationTimes['get'](calculationId);
    if (!startTime) {
      logger.warn({ calculationId }, 'Calculation completion recorded without start time');
      return;
    }

    const duration = (Date.now() - startTime) / 1000; // Convert to seconds
    const portfolioSizeBucket = this.getPortfolioSizeBucket(portfolioSize);

    // Record metrics
    reserveCalculationDuration
      .labels(scenarioType, portfolioSizeBucket, 'true')
      .observe(duration);

    reserveCalculationTotal
      .labels(scenarioType, 'true', 'none')
      .inc();

    activeCalculations.dec();

    // Record business metrics
    const typedResult = result as {
      portfolioMetrics?: { expectedPortfolioMOIC: number; portfolioDiversification: number };
      metadata?: { fundId?: string };
    };
    if (typedResult.portfolioMetrics) {
      portfolioMetrics
        .labels('expected_moic', typedResult.metadata?.fundId || 'unknown')
        .set(typedResult.portfolioMetrics.expectedPortfolioMOIC);

      portfolioMetrics
        .labels('diversification', typedResult.metadata?.fundId || 'unknown')
        .set(typedResult.portfolioMetrics.portfolioDiversification);
    }

    // Clean up
    this.calculationTimes.delete(calculationId);

    monitoringEvents.recordCalculationComplete(calculationId, result);

    const resultWithAllocations = result as { allocations?: unknown[]; inputSummary?: { totalAllocated?: unknown } };
    logger.info({
      calculationId,
      duration,
      portfolioSize,
      allocationsGenerated: resultWithAllocations.allocations?.length,
      totalAllocated: resultWithAllocations.inputSummary?.totalAllocated,
    }, 'Reserve calculation completed');
  }

  recordCalculationError(
    calculationId: string,
    scenarioType: string,
    portfolioSize: number,
    error: Error | unknown
  ): void {
    const startTime = this.calculationTimes['get'](calculationId);
    const duration = startTime ? (Date.now() - startTime) / 1000 : 0;
    const portfolioSizeBucket = this.getPortfolioSizeBucket(portfolioSize);
    const errorType = this.classifyError(error);

    // Record metrics
    if (startTime) {
      reserveCalculationDuration
        .labels(scenarioType, portfolioSizeBucket, 'false')
        .observe(duration);
    }

    reserveCalculationTotal
      .labels(scenarioType, 'false', errorType)
      .inc();

    errorRate
      .labels(errorType, 'reserve_engine', this.getErrorSeverity(error))
      .inc();

    activeCalculations.dec();

    // Clean up
    this.calculationTimes.delete(calculationId);

    monitoringEvents.recordCalculationError(calculationId, error);

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({
      calculationId,
      duration,
      portfolioSize,
      error: errorMessage,
      errorType,
    }, 'Reserve calculation failed');
  }

  // Parity validation monitoring
  recordParityValidation(
    validationId: string,
    result: {
      overallParity: {
        parityPercentage: number;
        passesParityTest: boolean;
        maxDrift: number;
      };
      detailedBreakdown: Record<string, { drift: number }>;
    }
  ): void {
    // Record parity metrics
    parityValidationResults
      .labels('pass_rate', result.overallParity.passesParityTest ? 'pass' : 'fail')
      .set(result.overallParity.parityPercentage);

    parityValidationResults
      .labels('max_drift', 'actual')
      .set(result.overallParity.maxDrift);

    // Record detailed breakdowns
    Object.entries(result.detailedBreakdown).forEach(([metric, data]) => {
      parityValidationResults
        .labels(`${metric}_drift`, 'actual')
        .set(data.drift);
    });

    monitoringEvents.recordParityValidation(validationId, result);

    logger.info({
      validationId,
      passRate: result.overallParity.parityPercentage,
      passes: result.overallParity.passesParityTest,
      maxDrift: result.overallParity.maxDrift,
    }, 'Parity validation completed');
  }

  // API monitoring
  recordApiRequest(
    method: string,
    route: string,
    statusCode: number,
    duration: number
  ): void {
    apiRequestDuration
      .labels(method, route, statusCode.toString())
      .observe(duration / 1000); // Convert to seconds

    logger.debug({
      method,
      route,
      statusCode,
      duration,
    }, 'API request completed');
  }

  // Fund metrics monitoring
  recordFundMetrics(fundId: string, metrics: {
    totalCommitted?: number;
    totalCalled?: number;
    netAssetValue?: number;
    dpi?: number;
    tvpi?: number;
    irr?: number;
  }): void {
    Object.entries(metrics).forEach(([metricType, value]) => {
      if (value !== undefined) {
        fundMetrics.labels(fundId, metricType)['set'](value);
      }
    });

    logger.debug({ fundId, metrics }, 'Fund metrics recorded');
  }

  // Health monitoring
  registerHealthCheck(component: string, check: () => Promise<boolean>): void {
    this.healthChecks['set'](component, check);
    logger.info({ component }, 'Health check registered');
  }

  async performHealthCheck(): Promise<{ [component: string]: boolean }> {
    const results: { [component: string]: boolean } = {};

    for (const [component, check] of this.healthChecks.entries()) {
      try {
        const isHealthy = await Promise.race([
          check(),
          new Promise<boolean>((_resolve, reject) =>
            setTimeout(() => reject(new Error('Health check timeout')), 5000)
          ),
        ]);
        results[component] = isHealthy;
        systemHealth.labels(component)['set'](isHealthy ? 1 : 0);
      } catch (error) {
        results[component] = false;
        systemHealth.labels(component)['set'](0);
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.warn({ component, error: errorMessage }, 'Health check failed');
      }
    }

    return results;
  }

  // Performance budget monitoring
  checkPerformanceBudgets(): void {
    // This would typically query metrics from Prometheus
    // For now, we'll simulate budget checks
    PERFORMANCE_BUDGETS.forEach(budget => {
      // Simulate getting current metric value
      const currentValue = this.simulateMetricValue(budget.metric);
      
      if (currentValue > budget.threshold) {
        this.recordBudgetViolation(budget, currentValue);
      }
    });
  }

  private recordBudgetViolation(budget: PerformanceBudget, currentValue: number): void {
    monitoringEvents.recordPerformanceBudgetViolation(budget, currentValue);

    logger.warn({
      metric: budget.metric,
      threshold: budget.threshold,
      currentValue,
      severity: budget.severity,
    }, 'Performance budget violation');

    errorRate
      .labels('performance_budget', 'monitoring', budget.severity)
      .inc();
  }

  // SLO monitoring
  checkSLOs(): void {
    SLO_TARGETS.forEach(slo => {
      // Simulate SLO checks
      const currentValue = this.simulateSLOValue(slo.name);
      
      if (currentValue < slo.target) {
        this.recordSLOViolation(slo, currentValue);
      }
    });
  }

  private recordSLOViolation(slo: SLOTarget, currentValue: number): void {
    monitoringEvents.recordSLOViolation(slo, currentValue);

    logger.error({
      slo: slo.name,
      target: slo.target,
      currentValue,
      description: slo.description,
    }, 'SLO violation detected');

    errorRate
      .labels('slo_violation', 'monitoring', 'critical')
      .inc();
  }

  // Utility methods
  private getPortfolioSizeBucket(size: number): string {
    if (size <= 10) return 'small';
    if (size <= 50) return 'medium';
    if (size <= 200) return 'large';
    return 'xlarge';
  }

  private classifyError(error: unknown): string {
    if (error && typeof error === 'object') {
      const err = error as { name?: string; code?: string };
      if (err.name === 'ValidationError') return 'validation';
      if (err.name === 'TimeoutError') return 'timeout';
      if (err.name === 'ReserveCalculationError') return 'calculation';
      if (err.code === 'ECONNREFUSED') return 'connection';
    }
    return 'unknown';
  }

  private getErrorSeverity(error: unknown): string {
    if (error && typeof error === 'object') {
      const err = error as { name?: string; code?: string };
      if (err.name === 'ValidationError') return 'warning';
      if (err.name === 'TimeoutError') return 'critical';
      if (err.code === 'ECONNREFUSED') return 'critical';
    }
    return 'warning';
  }

  private simulateMetricValue(metric: string): number {
    // Simulate different metric types
    switch (metric) {
      case 'reserve_calculation_duration_p95':
        return Math.random() * 10; // 0-10 seconds
      case 'api_error_rate':
        return Math.random() * 0.1; // 0-10%
      case 'parity_validation_pass_rate':
        return 0.9 + Math.random() * 0.1; // 90-100%
      default:
        return Math.random();
    }
  }

  private simulateSLOValue(sloName: string): number {
    switch (sloName) {
      case 'Reserve Calculation Availability':
        return 0.995 + Math.random() * 0.005; // 99.5-100%
      case 'Calculation Latency':
        return 0.92 + Math.random() * 0.08; // 92-100%
      case 'Excel Parity':
        return 0.96 + Math.random() * 0.04; // 96-100%
      default:
        return Math.random();
    }
  }

  private setupEventListeners(): void {
    monitoringEvents['on']('calculation:start', (data: unknown) => {
      logger.debug(data, 'Calculation started event');
    });

    monitoringEvents['on']('calculation:complete', (data: unknown) => {
      logger.debug(data, 'Calculation completed event');
    });

    monitoringEvents['on']('calculation:error', (data: unknown) => {
      logger.warn(data, 'Calculation error event');
    });

    monitoringEvents['on']('performance:budget-violation', (data: unknown) => {
      if (this.alertingEnabled) {
        this.sendAlert('Performance Budget Violation', data);
      }
    });

    monitoringEvents['on']('slo:violation', (data: unknown) => {
      if (this.alertingEnabled) {
        this.sendAlert('SLO Violation', data);
      }
    });
  }

  private startHealthMonitoring(): void {
    setInterval(async () => {
      await this.performHealthCheck();
    }, 30000); // Check health every 30 seconds
  }

  private startPerformanceMonitoring(): void {
    setInterval(() => {
      this.checkPerformanceBudgets();
      this.checkSLOs();
    }, 60000); // Check performance every minute
  }

  private sendAlert(type: string, data: unknown): void {
    // In production, this would send alerts to Slack, PagerDuty, etc.
    logger.error(data, `ALERT: ${type}`);
  }

  // Cleanup
  destroy(): void {
    monitoringEvents.removeAllListeners();
    register.clear();
  }
}

// Export singleton instance
export const productionMonitor = new ProductionMonitor();

// Register default health checks
productionMonitor.registerHealthCheck('database', async () => {
  // Simulate database health check
  return Math.random() > 0.1; // 90% healthy
});

productionMonitor.registerHealthCheck('redis', async () => {
  // Simulate Redis health check
  return Math.random() > 0.05; // 95% healthy
});

productionMonitor.registerHealthCheck('reserve_engine', async () => {
  // Simulate reserve engine health check
  return Math.random() > 0.02; // 98% healthy
});

// Export metrics for Prometheus scraping
export { register as prometheusRegister };

export default productionMonitor;