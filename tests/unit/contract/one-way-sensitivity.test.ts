/**
 * Contract tests for the one-way sensitivity analysis schemas and the
 * supporting variable/metric library. Asserts strict-mode rejection of
 * unknown keys, enum boundaries on variable/metric ids, range refinement,
 * and the lookup helpers.
 */

import { describe, it, expect } from 'vitest';
import {
  OneWayAnalysisRequestV1Schema,
  OneWayAnalysisDatapointSchema,
  OneWayAnalysisResultV1Schema,
} from '../../../shared/contracts/sensitivity-run-v1.contract';
import {
  SUPPORTED_VARIABLES,
  SUPPORTED_METRICS,
  getVariableDefinition,
  getMetricDefinition,
} from '../../../shared/contracts/sensitivity-variables-v1';

const validRequest = {
  variableId: 'reserve_pool_pct' as const,
  range: { min: 0.1, max: 0.4 },
  steps: 10,
  metricId: 'tvpi' as const,
};

const validResult = {
  variableId: 'reserve_pool_pct' as const,
  metricId: 'tvpi' as const,
  baselineValue: 1.85,
  datapoints: [
    { variableValue: 0.1, metricValue: 1.8 },
    { variableValue: 0.2, metricValue: 1.85 },
    { variableValue: 0.3, metricValue: 1.9 },
    { variableValue: 0.4, metricValue: 1.95 },
  ],
  summary: { minMetric: 1.8, maxMetric: 1.95, range: 0.15 },
  computedAt: '2026-04-06T12:00:00.000Z',
};

describe('OneWayAnalysisRequestV1Schema', () => {
  it('accepts a fully valid request', () => {
    const parsed = OneWayAnalysisRequestV1Schema.parse(validRequest);
    expect(parsed).toEqual(validRequest);
  });

  it('rejects steps < 2', () => {
    const result = OneWayAnalysisRequestV1Schema.safeParse({ ...validRequest, steps: 1 });
    expect(result.success).toBe(false);
  });

  it('rejects steps > 50', () => {
    const result = OneWayAnalysisRequestV1Schema.safeParse({ ...validRequest, steps: 51 });
    expect(result.success).toBe(false);
  });

  it('rejects unknown variableId', () => {
    const result = OneWayAnalysisRequestV1Schema.safeParse({
      ...validRequest,
      variableId: 'fake_var',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown metricId', () => {
    const result = OneWayAnalysisRequestV1Schema.safeParse({
      ...validRequest,
      metricId: 'fake_metric',
    });
    expect(result.success).toBe(false);
  });

  it('rejects min >= max via range refine', () => {
    const result = OneWayAnalysisRequestV1Schema.safeParse({
      ...validRequest,
      range: { min: 0.4, max: 0.4 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects extra unknown keys (.strict())', () => {
    const result = OneWayAnalysisRequestV1Schema.safeParse({
      ...validRequest,
      sneaky: 'should-not-pass',
    });
    expect(result.success).toBe(false);
  });
});

describe('OneWayAnalysisDatapointSchema', () => {
  it('rejects extra fields (.strict())', () => {
    const result = OneWayAnalysisDatapointSchema.safeParse({
      variableValue: 0.1,
      metricValue: 1.5,
      extra: 'nope',
    });
    expect(result.success).toBe(false);
  });
});

describe('OneWayAnalysisResultV1Schema', () => {
  it('round-trips a complete result', () => {
    const parsed = OneWayAnalysisResultV1Schema.parse(validResult);
    expect(parsed).toEqual(validResult);
  });

  it('rejects results with non-ISO computedAt', () => {
    const result = OneWayAnalysisResultV1Schema.safeParse({
      ...validResult,
      computedAt: 'not-a-date',
    });
    expect(result.success).toBe(false);
  });
});

describe('SUPPORTED_VARIABLES', () => {
  it('has at least 3 entries with valid id/min/max bounds', () => {
    expect(SUPPORTED_VARIABLES.length).toBeGreaterThanOrEqual(3);
    for (const v of SUPPORTED_VARIABLES) {
      expect(v.id).toBeTruthy();
      expect(typeof v.id).toBe('string');
      expect(v.min).toBeLessThan(v.max);
      expect(v.defaultSteps).toBeGreaterThanOrEqual(2);
      expect(v.fundConfigPath).toBeTruthy();
    }
  });
});

describe('SUPPORTED_METRICS', () => {
  it('has at least 3 entries with valid metric paths', () => {
    expect(SUPPORTED_METRICS.length).toBeGreaterThanOrEqual(3);
    for (const m of SUPPORTED_METRICS) {
      expect(m.id).toBeTruthy();
      expect(m.fundMetricPath).toBeTruthy();
      expect(m.fundMetricPath).toMatch(/^kpis\./);
    }
  });
});

describe('getVariableDefinition', () => {
  it('returns the correct entry by id', () => {
    const def = getVariableDefinition('reserve_pool_pct');
    expect(def.fundConfigPath).toBe('reservePoolPct');
    expect(def.unit).toBe('ratio');
  });

  it('throws on an unknown id', () => {
    // Cast through unknown to bypass the compile-time enum guard.
    expect(() => getVariableDefinition('not_a_real_var' as unknown as 'reserve_pool_pct')).toThrow(
      /unknown sensitivity variable id/i
    );
  });
});

describe('getMetricDefinition', () => {
  it('returns the correct entry by id', () => {
    const def = getMetricDefinition('tvpi');
    expect(def.fundMetricPath).toBe('kpis.tvpi');
  });

  it('throws on an unknown id', () => {
    expect(() => getMetricDefinition('not_a_real_metric' as unknown as 'tvpi')).toThrow(
      /unknown sensitivity metric id/i
    );
  });
});
