/* eslint-disable @typescript-eslint/no-explicit-any */ // Business metrics types
 
 
 
 
/**
 * Business logic performance metrics
 * Tracks fund-specific operations and business KPIs
 */

import { register, Counter, Histogram, Gauge, Summary } from 'prom-client';

// Fund Operations Metrics
export const fundOperations = new Counter({
  name: 'fund_operations_total',
  help: 'Total number of fund operations',
  labelNames: ['operation', 'fund_id', 'user_id', 'result'],
  registers: [register]
});

export const fundOperationDuration = new Histogram({
  name: 'fund_operation_duration_seconds',
  help: 'Duration of fund operations in seconds',
  labelNames: ['operation', 'fund_id'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register]
});

// Reserve Engine Metrics
export const reserveCalculations = new Counter({
  name: 'reserve_calculations_total',
  help: 'Total number of reserve calculations',
  labelNames: ['calculation_type', 'result', 'cache_hit'],
  registers: [register]
});

export const reserveCalculationDuration = new Histogram({
  name: 'reserve_calculation_duration_seconds',
  help: 'Duration of reserve calculations in seconds',
  labelNames: ['calculation_type', 'complexity'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [register]
});

export const reserveDataSize = new Histogram({
  name: 'reserve_data_size_bytes',
  help: 'Size of reserve calculation data in bytes',
  labelNames: ['calculation_type'],
  buckets: [1024, 5120, 25600, 102400, 512000, 2560000], // 1KB to 2.5MB
  registers: [register]
});

// Pacing Engine Metrics
export const pacingAnalysis = new Counter({
  name: 'pacing_analysis_total',
  help: 'Total number of pacing analyses',
  labelNames: ['analysis_type', 'fund_stage', 'result'],
  registers: [register]
});

export const pacingComplexity = new Gauge({
  name: 'pacing_complexity_score',
  help: 'Complexity score of pacing analysis',
  labelNames: ['fund_id', 'analysis_type'],
  registers: [register]
});

// Cohort Engine Metrics
export const cohortProcessing = new Counter({
  name: 'cohort_processing_total',
  help: 'Total number of cohort processing operations',
  labelNames: ['cohort_type', 'operation', 'result'],
  registers: [register]
});

export const cohortSize = new Histogram({
  name: 'cohort_size_count',
  help: 'Number of items in cohort processing',
  labelNames: ['cohort_type'],
  buckets: [10, 50, 100, 500, 1000, 5000, 10000],
  registers: [register]
});

// Idempotency Metrics (Enhanced)
export const idempotencyOperations = new Counter({
  name: 'idempotency_operations_total',
  help: 'Total idempotency operations',
  labelNames: ['operation', 'result', 'cache_layer'],
  registers: [register]
});

export const idempotencyLatency = new Summary({
  name: 'idempotency_latency_seconds',
  help: 'Latency of idempotency operations',
  labelNames: ['operation', 'cache_layer'],
  percentiles: [0.5, 0.9, 0.95, 0.99],
  registers: [register]
});

// Database Performance Metrics
export const databaseOperations = new Counter({
  name: 'database_operations_total',
  help: 'Total database operations',
  labelNames: ['operation', 'table', 'result', 'connection_pool'],
  registers: [register]
});

export const databaseQueryDuration = new Histogram({
  name: 'database_query_duration_seconds',
  help: 'Duration of database queries',
  labelNames: ['operation', 'table', 'complexity'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2],
  registers: [register]
});

export const connectionPoolMetrics = new Gauge({
  name: 'database_connection_pool',
  help: 'Database connection pool metrics',
  labelNames: ['state', 'database'],
  registers: [register]
});

// Business KPI Metrics
export const fundPerformanceScore = new Gauge({
  name: 'fund_performance_score',
  help: 'Performance score of funds',
  labelNames: ['fund_id', 'metric_type'],
  registers: [register]
});

export const userEngagement = new Counter({
  name: 'user_engagement_total',
  help: 'User engagement events',
  labelNames: ['event_type', 'user_segment', 'fund_id'],
  registers: [register]
});

export const systemHealth = new Gauge({
  name: 'system_health_score',
  help: 'Overall system health score',
  labelNames: ['component', 'check_type'],
  registers: [register]
});

// Helper functions for business metrics
export class BusinessMetricsCollector {
  
  // Track fund operation with timing
  trackFundOperation(operation: string, fundId: string, userId: string, fn: () => Promise<any>) {
    const timer = fundOperationDuration.startTimer({ operation, fund_id: fundId });
    
    return fn()
      .then(result => {
        fundOperations.inc({ operation, fund_id: fundId, user_id: userId, result: 'success' });
        timer({ operation, fund_id: fundId });
        return result;
      })
      .catch(error => {
        fundOperations.inc({ operation, fund_id: fundId, user_id: userId, result: 'error' });
        timer({ operation, fund_id: fundId });
        throw error;
      });
  }

  // Track reserve calculation performance
  trackReserveCalculation(
    calculationType: string, 
    complexity: 'low' | 'medium' | 'high',
    dataSize: number,
    cacheHit: boolean,
    fn: () => Promise<any>
  ) {
    const timer = reserveCalculationDuration.startTimer({ 
      calculation_type: calculationType, 
      complexity 
    });
    
    reserveDataSize.observe({ calculation_type: calculationType }, dataSize);
    
    return fn()
      .then(result => {
        reserveCalculations.inc({ 
          calculation_type: calculationType, 
          result: 'success',
          cache_hit: cacheHit ? 'true' : 'false'
        });
        timer({ calculation_type: calculationType, complexity });
        return result;
      })
      .catch(error => {
        reserveCalculations.inc({ 
          calculation_type: calculationType, 
          result: 'error',
          cache_hit: cacheHit ? 'true' : 'false'
        });
        timer({ calculation_type: calculationType, complexity });
        throw error;
      });
  }

  // Track pacing analysis
  trackPacingAnalysis(
    analysisType: string,
    fundStage: string,
    complexityScore: number,
    fundId: string,
    fn: () => Promise<any>
  ) {
    pacingComplexity['set']({ fund_id: fundId, analysis_type: analysisType }, complexityScore);
    
    return fn()
      .then(result => {
        pacingAnalysis.inc({ 
          analysis_type: analysisType, 
          fund_stage: fundStage, 
          result: 'success' 
        });
        return result;
      })
      .catch(error => {
        pacingAnalysis.inc({ 
          analysis_type: analysisType, 
          fund_stage: fundStage, 
          result: 'error' 
        });
        throw error;
      });
  }

  // Cohort size histogram
  cohortSizeHistogram = new Histogram({
    name: 'cohort_size',
    help: 'Size of processed cohorts',
    labelNames: ['cohort_type'],
    buckets: [1, 5, 10, 50, 100, 500, 1000],
    registers: [register]
  });

  // Track cohort processing
  trackCohortProcessing(
    cohortType: string,
    operation: string,
    cohortSize: number,
    fn: () => Promise<any>
  ) {
    // Now we have a proper histogram to observe
    this.cohortSizeHistogram.observe({ cohort_type: cohortType }, cohortSize);
    
    return fn()
      .then(result => {
        cohortProcessing.inc({ 
          cohort_type: cohortType, 
          operation, 
          result: 'success' 
        });
        return result;
      })
      .catch(error => {
        cohortProcessing.inc({ 
          cohort_type: cohortType, 
          operation, 
          result: 'error' 
        });
        throw error;
      });
  }

  // Track idempotency with cache layers
  trackIdempotency(
    operation: string,
    cacheLayer: 'redis' | 'memory' | 'database',
    fn: () => Promise<any>
  ) {
    const timer = idempotencyLatency.startTimer({ operation, cache_layer: cacheLayer });
    
    return fn()
      .then(result => {
        idempotencyOperations.inc({ operation, result: 'success', cache_layer: cacheLayer });
        timer();
        return result;
      })
      .catch(error => {
        idempotencyOperations.inc({ operation, result: 'error', cache_layer: cacheLayer });
        timer();
        throw error;
      });
  }

  // Track database operations
  trackDatabaseOperation(
    operation: string,
    table: string,
    complexity: 'simple' | 'complex' | 'join',
    connectionPool: string,
    fn: () => Promise<any>
  ) {
    const timer = databaseQueryDuration.startTimer({ operation, table, complexity });
    
    return fn()
      .then(result => {
        databaseOperations.inc({ 
          operation, 
          table, 
          result: 'success', 
          connection_pool: connectionPool 
        });
        timer({ operation, table, complexity });
        return result;
      })
      .catch(error => {
        databaseOperations.inc({ 
          operation, 
          table, 
          result: 'error', 
          connection_pool: connectionPool 
        });
        timer({ operation, table, complexity });
        throw error;
      });
  }

  // Update system health metrics
  updateSystemHealth(component: string, checkType: string, score: number) {
    systemHealth['set']({ component, check_type: checkType }, score);
  }

  // Update fund performance metrics
  updateFundPerformance(fundId: string, metricType: string, score: number) {
    fundPerformanceScore['set']({ fund_id: fundId, metric_type: metricType }, score);
  }

  // Track user engagement
  trackUserEngagement(eventType: string, userSegment: string, fundId?: string) {
    userEngagement.inc({ 
      event_type: eventType, 
      user_segment: userSegment,
      fund_id: fundId || 'unknown'
    });
  }
}

// Global instance
export const businessMetrics = new BusinessMetricsCollector();

// Periodic health score calculation
setInterval(() => {
  // Calculate and update system health scores
  const components = ['database', 'redis', 'api', 'workers'];
  components.forEach(component => {
    // In real implementation, calculate actual health scores
    const healthScore = Math.random() * 0.2 + 0.8; // 80-100%
    businessMetrics.updateSystemHealth(component, 'availability', healthScore);
  });
}, 30000); // Every 30 seconds
