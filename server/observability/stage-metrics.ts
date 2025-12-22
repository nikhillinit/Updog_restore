/**
 * Stage Validation Metrics
 *
 * Prometheus-style metrics for monitoring stage validation behavior.
 * Tracks validation durations, success rates, and unknown stage occurrences.
 */

// In-memory metrics for development (replace with Prometheus client in production)
const metrics = {
  validationDurationHistogram: new Map<string, number[]>(),
  validationSuccessCounter: new Map<string, number>(),
  unknownStageCounter: new Map<string, Map<string, number>>(),
};

/**
 * Record the duration of a stage validation operation
 * @param route - The API route where validation occurred
 * @param durationSeconds - Duration in seconds
 */
export function recordValidationDuration(route: string, durationSeconds: number): void {
  if (!metrics.validationDurationHistogram.has(route)) {
    metrics.validationDurationHistogram.set(route, []);
  }
  metrics.validationDurationHistogram.get(route)!.push(durationSeconds);
}

/**
 * Record a successful stage validation
 * @param route - The API route where validation succeeded
 */
export function recordValidationSuccess(route: string): void {
  const current = metrics.validationSuccessCounter.get(route) || 0;
  metrics.validationSuccessCounter.set(route, current + 1);
}

/**
 * Record an unknown stage occurrence
 * @param route - The API route where unknown stage was encountered
 * @param mode - The validation mode at time of occurrence ('off', 'warn', 'enforce')
 */
export function recordUnknownStage(route: string, mode: string): void {
  if (!metrics.unknownStageCounter.has(route)) {
    metrics.unknownStageCounter.set(route, new Map());
  }
  const routeMetrics = metrics.unknownStageCounter.get(route)!;
  const current = routeMetrics.get(mode) || 0;
  routeMetrics.set(mode, current + 1);
}

/**
 * Get current metrics (for testing/debugging)
 */
export function getMetrics() {
  return {
    validationDurationHistogram: Object.fromEntries(metrics.validationDurationHistogram),
    validationSuccessCounter: Object.fromEntries(metrics.validationSuccessCounter),
    unknownStageCounter: Object.fromEntries(
      Array.from(metrics.unknownStageCounter.entries()).map(([route, modes]) => [
        route,
        Object.fromEntries(modes),
      ])
    ),
  };
}

/**
 * Reset all metrics (for testing)
 */
export function resetMetrics(): void {
  metrics.validationDurationHistogram.clear();
  metrics.validationSuccessCounter.clear();
  metrics.unknownStageCounter.clear();
}
