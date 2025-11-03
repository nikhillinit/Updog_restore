/**
 * Stage Validation Metrics for Observability
 *
 * Prometheus metrics for monitoring stage normalization and validation.
 * Tracks validation duration, success/failure rates, and unknown stage patterns.
 *
 * Key Metrics:
 * - stageValidationDuration: Histogram of validation timing
 * - stageValidationSuccess: Counter of successful validations
 * - stageValidationFailure: Counter of failed validations
 * - unknownStageCounter: Counter of unknown stage attempts (with labels)
 * - stageDistributionValidations: Counter of distribution validation attempts
 * - activeValidations: Gauge of concurrent validations in progress
 *
 * @module server/observability/stage-metrics
 * @version 3.4.0
 */

import * as client from 'prom-client';

/**
 * Histogram: Stage validation duration in milliseconds
 * Tracks time taken for stage normalization and validation operations
 *
 * Labels:
 * - operation: 'normalize' | 'parse_distribution' | 'validate_distribution'
 * - mode: 'off' | 'warn' | 'enforce' (validation mode)
 *
 * Buckets optimized for fast validation operations (sub-millisecond to 100ms)
 */
export const stageValidationDuration = new client.Histogram({
  name: 'stage_validation_duration_ms',
  help: 'Stage validation duration in milliseconds',
  labelNames: ['operation', 'mode'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 25, 50, 100],
});

/**
 * Counter: Successful stage validations
 * Tracks validation operations that completed without errors
 *
 * Labels:
 * - operation: 'normalize' | 'parse_distribution' | 'validate_distribution'
 * - mode: 'off' | 'warn' | 'enforce'
 */
export const stageValidationSuccess = new client.Counter({
  name: 'stage_validation_success_total',
  help: 'Total successful stage validations',
  labelNames: ['operation', 'mode'],
});

/**
 * Counter: Failed stage validations
 * Tracks validation operations that returned errors
 *
 * Labels:
 * - operation: 'normalize' | 'parse_distribution' | 'validate_distribution'
 * - mode: 'off' | 'warn' | 'enforce'
 * - error_kind: 'UnknownStage' | 'InvalidWeight' | 'InvalidSum' | 'EmptyDistribution'
 */
export const stageValidationFailure = new client.Counter({
  name: 'stage_validation_failure_total',
  help: 'Total failed stage validations',
  labelNames: ['operation', 'mode', 'error_kind'],
});

/**
 * Counter: Unknown stage attempts
 * Tracks attempts to normalize unknown/invalid stage names
 *
 * Labels:
 * - stage: Original unknown stage string (normalized for privacy)
 * - mode: 'off' | 'warn' | 'enforce'
 * - endpoint: API endpoint where unknown stage was encountered
 */
export const unknownStageCounter = new client.Counter({
  name: 'unknown_stage_total',
  help: 'Total unknown stage normalization attempts',
  labelNames: ['stage', 'mode', 'endpoint'],
});

/**
 * Counter: Stage distribution validation attempts
 * Tracks calls to parseStageDistribution and related functions
 *
 * Labels:
 * - outcome: 'success' | 'failure'
 * - mode: 'off' | 'warn' | 'enforce'
 */
export const stageDistributionValidations = new client.Counter({
  name: 'stage_distribution_validations_total',
  help: 'Total stage distribution validation attempts',
  labelNames: ['outcome', 'mode'],
});

/**
 * Gauge: Active concurrent validations
 * Tracks number of validation operations currently in progress
 *
 * Labels:
 * - operation: 'normalize' | 'parse_distribution' | 'validate_distribution'
 */
export const activeValidations = new client.Gauge({
  name: 'stage_validation_active',
  help: 'Number of active stage validation operations',
  labelNames: ['operation'],
});

/**
 * Record validation duration for an operation
 *
 * @param operation Type of validation operation
 * @param durationMs Duration in milliseconds
 * @param mode Validation mode (off | warn | enforce)
 *
 * @example
 * const start = Date.now();
 * const result = normalizeInvestmentStage(stage);
 * recordValidationDuration('normalize', Date.now() - start, 'enforce');
 */
export function recordValidationDuration(
  operation: 'normalize' | 'parse_distribution' | 'validate_distribution',
  durationMs: number,
  mode: 'off' | 'warn' | 'enforce'
): void {
  stageValidationDuration.observe({ operation, mode }, durationMs);
}

/**
 * Record successful validation
 *
 * @param operation Type of validation operation
 * @param mode Validation mode (off | warn | enforce)
 *
 * @example
 * const result = normalizeInvestmentStage(stage);
 * if (result.ok) {
 *   recordValidationSuccess('normalize', 'enforce');
 * }
 */
export function recordValidationSuccess(
  operation: 'normalize' | 'parse_distribution' | 'validate_distribution',
  mode: 'off' | 'warn' | 'enforce'
): void {
  stageValidationSuccess.inc({ operation, mode });
}

/**
 * Record failed validation
 *
 * @param operation Type of validation operation
 * @param mode Validation mode (off | warn | enforce)
 * @param errorKind Type of validation error
 *
 * @example
 * const result = normalizeInvestmentStage(stage);
 * if (!result.ok) {
 *   recordValidationFailure('normalize', 'enforce', result.error.kind);
 * }
 */
export function recordValidationFailure(
  operation: 'normalize' | 'parse_distribution' | 'validate_distribution',
  mode: 'off' | 'warn' | 'enforce',
  errorKind: 'UnknownStage' | 'InvalidWeight' | 'InvalidSum' | 'EmptyDistribution'
): void {
  stageValidationFailure.inc({ operation, mode, error_kind: errorKind });
}

/**
 * Record unknown stage encounter
 *
 * @param stage Original unknown stage string
 * @param mode Validation mode (off | warn | enforce)
 * @param endpoint API endpoint where unknown stage was encountered
 *
 * @example
 * if (!result.ok && result.error.kind === 'UnknownStage') {
 *   recordUnknownStage(stage, 'enforce', req.path);
 * }
 */
export function recordUnknownStage(
  stage: string,
  mode: 'off' | 'warn' | 'enforce',
  endpoint: string
): void {
  // Normalize stage string for privacy (lowercase, truncate at 50 chars)
  const normalizedStage = stage.toLowerCase().slice(0, 50);
  unknownStageCounter.inc({ stage: normalizedStage, mode, endpoint });
}

/**
 * Record stage distribution validation attempt
 *
 * @param outcome Validation outcome (success | failure)
 * @param mode Validation mode (off | warn | enforce)
 *
 * @example
 * const result = parseStageDistribution(entries);
 * recordDistributionValidation(result.ok ? 'success' : 'failure', 'enforce');
 */
export function recordDistributionValidation(
  outcome: 'success' | 'failure',
  mode: 'off' | 'warn' | 'enforce'
): void {
  stageDistributionValidations.inc({ outcome, mode });
}

/**
 * Track active validation (increment gauge)
 *
 * @param operation Type of validation operation
 *
 * @example
 * trackValidationStart('normalize');
 * try {
 *   // ... validation logic
 * } finally {
 *   trackValidationEnd('normalize');
 * }
 */
export function trackValidationStart(
  operation: 'normalize' | 'parse_distribution' | 'validate_distribution'
): void {
  activeValidations.inc({ operation });
}

/**
 * Untrack active validation (decrement gauge)
 *
 * @param operation Type of validation operation
 */
export function trackValidationEnd(
  operation: 'normalize' | 'parse_distribution' | 'validate_distribution'
): void {
  activeValidations.dec({ operation });
}

/**
 * Helper: Wrap validation function with automatic metrics tracking
 *
 * @param operation Type of validation operation
 * @param mode Validation mode
 * @param fn Validation function to wrap
 * @returns Result of validation function
 *
 * @example
 * const result = withMetrics('normalize', mode, () => {
 *   return normalizeInvestmentStage(stage);
 * });
 */
export function withMetrics<T extends { ok: boolean }>(
  operation: 'normalize' | 'parse_distribution' | 'validate_distribution',
  mode: 'off' | 'warn' | 'enforce',
  fn: () => T
): T {
  const start = Date.now();
  trackValidationStart(operation);

  try {
    const result = fn();
    const duration = Date.now() - start;

    recordValidationDuration(operation, duration, mode);

    if (result.ok) {
      recordValidationSuccess(operation, mode);
    } else {
      recordValidationFailure(operation, mode, 'UnknownStage');
    }

    return result;
  } finally {
    trackValidationEnd(operation);
  }
}
