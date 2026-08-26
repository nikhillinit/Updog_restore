import { isDeepStrictEqual } from 'node:util';

export interface MetricDelta {
  current: number;
  baseline: number;
  delta: number;
  deltaPct: number | null;
}

export interface StructuredMetricChanges {
  metricDeltas: Record<string, MetricDelta>;
  changes: Record<string, { current: unknown; baseline: unknown }>;
}

export interface ReserveVarianceResult extends StructuredMetricChanges {
  hasData: boolean;
  currentReserves: Record<string, unknown>;
  baselineReserves: Record<string, unknown>;
}

export interface PacingVarianceResult extends StructuredMetricChanges {
  hasData: boolean;
  currentPacing: Record<string, unknown>;
  baselinePacing: Record<string, unknown>;
}

export function coerceFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function buildStructuredMetricChanges(
  currentValues: Record<string, unknown>,
  baselineValues: Record<string, unknown>
): StructuredMetricChanges {
  const metricDeltas: Record<string, MetricDelta> = {};
  const changes: Record<string, { current: unknown; baseline: unknown }> = {};
  const allKeys = new Set([...Object.keys(currentValues), ...Object.keys(baselineValues)]);

  for (const key of allKeys) {
    const cur = currentValues[key];
    const base = baselineValues[key];
    if (isDeepStrictEqual(cur, base)) {
      continue;
    }

    const curNumber = coerceFiniteNumber(cur);
    const baseNumber = coerceFiniteNumber(base);
    if (curNumber !== null && baseNumber !== null) {
      const delta = curNumber - baseNumber;
      metricDeltas[key] = {
        current: curNumber,
        baseline: baseNumber,
        delta,
        deltaPct: baseNumber !== 0 ? delta / baseNumber : null,
      };
      continue;
    }

    changes[key] = { current: cur ?? null, baseline: base ?? null };
  }

  return { metricDeltas, changes };
}

export function buildReserveVarianceResult(
  currentReserves: Record<string, unknown>,
  baselineReserves: Record<string, unknown>
): ReserveVarianceResult {
  const hasData =
    Object.keys(currentReserves).length > 0 && Object.keys(baselineReserves).length > 0;

  if (!hasData) {
    return {
      hasData: false,
      currentReserves: {},
      baselineReserves: {},
      metricDeltas: {},
      changes: {},
    };
  }

  const { metricDeltas, changes } = buildStructuredMetricChanges(currentReserves, baselineReserves);

  return {
    hasData: true,
    currentReserves,
    baselineReserves,
    metricDeltas,
    changes,
  };
}

export function buildPacingVarianceResult(
  currentPacing: Record<string, unknown>,
  baselinePacing: Record<string, unknown>
): PacingVarianceResult {
  const hasData = Object.keys(currentPacing).length > 0 && Object.keys(baselinePacing).length > 0;

  if (!hasData) {
    return {
      hasData: false,
      currentPacing: {},
      baselinePacing: {},
      metricDeltas: {},
      changes: {},
    };
  }

  const { metricDeltas, changes } = buildStructuredMetricChanges(currentPacing, baselinePacing);

  return {
    hasData: true,
    currentPacing,
    baselinePacing,
    metricDeltas,
    changes,
  };
}
