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
  recordCalculationStart(calculationId: string, metadata: any) {
    this.emit('calculation:start', { calculationId, metadata, timestamp: Date.now() });
  }

  recordCalculationComplete(calculationId: string, result: any) {
    this.emit('calculation:complete', { calculationId, result, timestamp: Date.now() });
  }

  recordCalculationError(calculationId: string, error: any) {
    this.emit('calculation:error', { calculationId, error, timestamp: Date.now() });
  }

  recordParityValidation(validationId: string, result: any) {
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
    metadata: any = {}
  ): void {
    this.calculationTimes['set'](calculationId, Date.now());
    activeCalculations.inc();

    monitoringEvents.recordCalculationStart(calculationId, {
      scenarioType,
      portfolioSize,
      ...metadata,
    });

    (logger as any).info('Reserve calculation started', {
      calculationId,
      scenarioType,
      portfolioSize,
      metadata,
    });
  }

  recordCalculationComplete(
    calculationId: string,
    scenarioType: string,
    portfolioSize: number,
    result: any
  ): void {
    const startTime = this.calculationTimes['get'](calculationId);
    if (!startTime) {
      (logger as any).warn('Calculation completion recorded without start time', { calculationId });
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
    if (result.portfolioMetrics) {
      portfolioMetrics
        .labels('expected_moic', result.metadata?.fundId || 'unknown')
        ['set'](result.portfolioMetrics.expectedPortfolioMOIC);

      portfolioMetrics
        .labels('diversification', result.metadata?.fundId || 'unknown')
        ['set'](result.portfolioMetrics.portfolioDiversification);
    }

    // Clean up
    this.calculationTimes.delete(calculationId);

    monitoringEvents.recordCalculationComplete(calculationId, result);

    (logger as any).info('Reserve calculation completed', {
      calculationId,
      duration,
      portfolioSize,
      allocationsGenerated: result.allocations?.length,
      totalAllocated: result.inputSummary?.totalAllocated,
    });
  }

  recordCalculationError(
    calculationId: string,
    scenarioType: string,
    portfolioSize: number,
    error: any
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

    (logger as any).error('Reserve calculation failed', {
      calculationId,
      duration,
      portfolioSize,
      error: error.message,
      errorType,
    });
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
      detailedBreakdown: any;
    }
  ): void {
    // Record parity metrics
    parityValidationResults
      .labels('pass_rate', result.overallParity.passesParityTest ? 'pass' : 'fail')
      ['set'](result.overallParity.parityPercentage);

    parityValidationResults
      .labels('max_drift', 'actual')
      ['set'](result.overallParity.maxDrift);

    // Record detailed breakdowns
    Object.entries(result.detailedBreakdown).forEach(([metric, data]: [string, any]) => {
      parityValidationResults
        .labels(`${metric}_drift`, 'actual')
        ['set'](data.drift);
    });

    monitoringEvents.recordParityValidation(validationId, result);

    (logger as any).info('Parity validation completed', {
      validationId,
      passRate: result.overallParity.parityPercentage,
      passes: result.overallParity.passesParityTest,
      maxDrift: result.overallParity.maxDrift,
    });
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

    (logger as any).debug('API request completed', {
      method,
      route,
      statusCode,
      duration,
    });
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

    (logger as any).debug('Fund metrics recorded', { fundId, metrics });
  }

  // Health monitoring
  registerHealthCheck(component: string, check: () => Promise<boolean>): void {
    this.healthChecks['set'](component, check);
    (logger as any).info('Health check registered', { component });
  }

  async performHealthCheck(): Promise<{ [component: string]: boolean }> {
    const results: { [component: string]: boolean } = {};

    for (const [component, check] of this.healthChecks.entries()) {
      try {
        const isHealthy = await Promise.race([
          check(),
          new Promise<boolean>((_: any, reject: any) => 
            setTimeout(() => reject(new Error('Health check timeout')), 5000)
          ),
        ]);
        results[component] = isHealthy;
        systemHealth.labels(component)['set'](isHealthy ? 1 : 0);
      } catch (error) {
        results[component] = false;
        systemHealth.labels(component)['set'](0);
        const errorMessage = error instanceof Error ? error.message : String(error);
        (logger as any).warn('Health check failed', { component, error: errorMessage });
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

    (logger as any).warn('Performance budget violation', {
      metric: budget.metric,
      threshold: budget.threshold,
      currentValue,
      severity: budget.severity,
    });

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

    (logger as any).error('SLO violation detected', {
      slo: slo.name,
      target: slo.target,
      currentValue,
      description: slo.description,
    });

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

  private classifyError(error: any): string {
    if (error.name === 'ValidationError') return 'validation';
    if (error.name === 'TimeoutError') return 'timeout';
    if (error.name === 'ReserveCalculationError') return 'calculation';
    if (error.code === 'ECONNREFUSED') return 'connection';
    return 'unknown';
  }

  private getErrorSeverity(error: any): string {
    if (error.name === 'ValidationError') return 'warning';
    if (error.name === 'TimeoutError') return 'critical';
    if (error.code === 'ECONNREFUSED') return 'critical';
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
    monitoringEvents['on']('calculation:start', (data: any) => {
      (logger as any).debug('Calculation started event', data);
    });

    monitoringEvents['on']('calculation:complete', (data: any) => {
      (logger as any).debug('Calculation completed event', data);
    });

    monitoringEvents['on']('calculation:error', (data: any) => {
      (logger as any).warn('Calculation error event', data);
    });

    monitoringEvents['on']('performance:budget-violation', (data: any) => {
      if (this.alertingEnabled) {
        this.sendAlert('Performance Budget Violation', data);
      }
    });

    monitoringEvents['on']('slo:violation', (data: any) => {
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

  private sendAlert(type: string, data: any): void {
    // In production, this would send alerts to Slack, PagerDuty, etc.
    (logger as any).error(`ALERT: ${type}`, data);
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