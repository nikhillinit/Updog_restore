/**
 * Production-grade metrics for Reserves v1.1
 * Essential counters and histograms for monitoring safety features
 */

import client from 'prom-client';

// Initialize default metrics
const register = new client.Registry();

// Add default Node.js metrics
client.collectDefaultMetrics({ 
  register,
  prefix: 'reserves_'
});

// ============================================================
// APPROVAL METRICS
// ============================================================

export const approvalMetrics = {
  // Total approval creation requests
  creationRequests: new client.Counter({
    name: 'reserves_approvals_creation_requests_total',
    help: 'Total number of approval creation requests',
    labelNames: ['strategy_id', 'risk_level', 'result'],
    registers: [register]
  }),

  // Approval creation rate limited
  rateLimited: new client.Counter({
    name: 'reserves_approvals_rate_limited_total',
    help: 'Total number of rate-limited approval requests',
    labelNames: ['strategy_id'],
    registers: [register]
  }),

  // Approval verification duration
  verifyDuration: new client.Histogram({
    name: 'reserves_approval_verify_seconds',
    help: 'Time spent verifying approvals',
    labelNames: ['result'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1.0, 2.0, 5.0],
    registers: [register]
  }),

  // Approval denials
  denied: new client.Counter({
    name: 'reserves_approval_denied_total',
    help: 'Total number of denied approvals',
    labelNames: ['reason'],
    registers: [register]
  }),

  // Required approvals (for compliance tracking)
  required: new client.Counter({
    name: 'reserves_approval_required_total',
    help: 'Total number of operations requiring approval',
    labelNames: ['action', 'risk_level'],
    registers: [register]
  })
};

// ============================================================
// CALCULATION ENGINE METRICS
// ============================================================

export const engineMetrics = {
  // Calculation duration
  runDuration: new client.Histogram({
    name: 'reserves_engine_run_seconds',
    help: 'Time spent running calculation engines',
    labelNames: ['engine_type', 'version', 'fund_id'],
    buckets: [0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0],
    registers: [register]
  }),

  // Engine timeouts
  timeouts: new client.Counter({
    name: 'reserves_engine_timeouts_total',
    help: 'Total number of engine timeouts',
    labelNames: ['engine_type', 'version'],
    registers: [register]
  }),

  // Non-finite number detections
  nonFinite: new client.Counter({
    name: 'reserves_engine_nonfinite_total',
    help: 'Total number of non-finite numbers detected',
    labelNames: ['engine_type', 'field'],
    registers: [register]
  }),

  // Memory usage (gauge for current usage)
  memoryUsage: new client.Gauge({
    name: 'reserves_engine_memory_mb',
    help: 'Current memory usage of engine in MB',
    labelNames: ['engine_type'],
    registers: [register]
  }),

  // WASM execution errors
  wasmErrors: new client.Counter({
    name: 'reserves_wasm_errors_total',
    help: 'Total WASM execution errors',
    labelNames: ['error_type', 'version'],
    registers: [register]
  })
};

// ============================================================
// CONCURRENCY METRICS
// ============================================================

export const concurrencyMetrics = {
  // Fund lock conflicts
  lockConflicts: new client.Counter({
    name: 'reserves_fund_lock_conflicts_total',
    help: 'Total number of fund lock conflicts',
    labelNames: ['fund_id'],
    registers: [register]
  }),

  // Idempotency hits (cached responses)
  idempotencyHits: new client.Counter({
    name: 'reserves_idempotency_hits_total',
    help: 'Total number of idempotency cache hits',
    labelNames: ['fund_id'],
    registers: [register]
  }),

  // Version conflicts (optimistic locking)
  versionConflicts: new client.Counter({
    name: 'reserves_version_conflicts_total',
    help: 'Total number of version conflicts (409 responses)',
    labelNames: ['entity_type'],
    registers: [register]
  }),

  // Lock wait time
  lockWaitDuration: new client.Histogram({
    name: 'reserves_lock_wait_seconds',
    help: 'Time spent waiting for locks',
    labelNames: ['lock_type'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1.0, 2.0, 5.0],
    registers: [register]
  })
};

// ============================================================
// FEATURE FLAGS METRICS
// ============================================================

export const flagMetrics = {
  // Flag exposures (sampled)
  exposures: new client.Counter({
    name: 'reserves_flag_exposures_total',
    help: 'Total flag exposures (sampled)',
    labelNames: ['key', 'value', 'scope'],
    registers: [register]
  }),

  // Flag provider cache hits/misses
  cacheHits: new client.Counter({
    name: 'reserves_flag_provider_cache_hits_total',
    help: 'Total flag cache hits',
    registers: [register]
  }),

  cacheMisses: new client.Counter({
    name: 'reserves_flag_provider_cache_misses_total',
    help: 'Total flag cache misses',
    registers: [register]
  }),

  // Kill switch state
  killSwitchState: new client.Gauge({
    name: 'reserves_flag_killswitch_state',
    help: 'Kill switch state (1 = active, 0 = inactive)',
    labelNames: ['feature'],
    registers: [register]
  }),

  // Flag propagation time
  propagationDuration: new client.Histogram({
    name: 'reserves_flag_propagation_seconds',
    help: 'Time for flag changes to propagate',
    buckets: [1, 5, 10, 15, 30, 60, 120, 300],
    registers: [register]
  })
};

// ============================================================
// REDIS METRICS
// ============================================================

export const redisMetrics = {
  // Redis errors
  errors: new client.Counter({
    name: 'reserves_redis_errors_total',
    help: 'Total Redis errors',
    labelNames: ['operation', 'error_type'],
    registers: [register]
  }),

  // Redis command duration
  commandDuration: new client.Histogram({
    name: 'reserves_redis_command_seconds',
    help: 'Redis command execution time',
    labelNames: ['command'],
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1.0],
    registers: [register]
  }),

  // Connection state
  connectionState: new client.Gauge({
    name: 'reserves_redis_connected',
    help: 'Redis connection state (1 = connected)',
    registers: [register]
  })
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Record approval creation with automatic labeling
 */
export function recordApprovalCreation(
  strategyId: string,
  riskLevel: 'low' | 'medium' | 'high',
  result: 'created' | 'rate_limited' | 'error'
): void {
  approvalMetrics.creationRequests.inc({
    strategy_id: strategyId.substring(0, 10), // Limit cardinality
    risk_level: riskLevel,
    result
  });

  if (result === 'rate_limited') {
    approvalMetrics.rateLimited.inc({ strategy_id: strategyId.substring(0, 10) });
  }
}

/**
 * Record calculation with timing
 */
export function recordCalculation(
  engineType: string,
  version: string,
  fundId: string,
  durationSeconds: number,
  memoryMB?: number
): void {
  engineMetrics.runDuration.observe({
    engine_type: engineType,
    version,
    fund_id: fundId.substring(0, 8) // Limit cardinality
  }, durationSeconds);

  if (memoryMB) {
    engineMetrics.memoryUsage['set']({ engine_type: engineType }, memoryMB);
  }
}

/**
 * Record lock conflict
 */
export function recordLockConflict(fundId: string, waitSeconds?: number): void {
  concurrencyMetrics.lockConflicts.inc({
    fund_id: fundId.substring(0, 8)
  });

  if (waitSeconds) {
    concurrencyMetrics.lockWaitDuration.observe({
      lock_type: 'advisory'
    }, waitSeconds);
  }
}

/**
 * Get all metrics in Prometheus format
 */
export async function getMetrics(): Promise<string> {
  return await register.metrics();
}

/**
 * Get content type for metrics endpoint
 */
export function getContentType(): string {
  return register.contentType;
}

// Export the registry for custom metrics
export { register };