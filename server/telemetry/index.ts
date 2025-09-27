/**
 * Telemetry and metrics collection
 * Stub implementation - replace with Prometheus/OpenTelemetry
 */

export const authMetrics = {
  jwtMissingToken: { inc: () => {} },
  jwtVerificationFailed: { inc: () => {} },
};

export const engineMetrics = {
  nonFinite422: { inc: () => {} },
};

export const cspMetrics = {
  violations: { inc: () => {} },
};

export const rateLimitMetrics = {
  limitHit: { inc: () => {} },
  sweepCount: { inc: () => {} },
};