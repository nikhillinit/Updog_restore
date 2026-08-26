/**
 * Golden snapshot tests for computeJCurvePath refactoring
 * Captures current output to ensure parity after refactor
 */
import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { computeJCurvePath, sanitizeMonotonicCurve, calibrateToActualCalls, buildFittedTVPICurve, type JCurveConfig } from '@shared/lib/jcurve';

describe('computeJCurvePath golden snapshots', () => {
  const baseConfig: JCurveConfig = {
    kind: 'gompertz',
    horizonYears: 10,
    investYears: 5,
    targetTVPI: new Decimal(2.5),
    startTVPI: new Decimal(0.95),
    step: 'quarter',
    pacingStrategy: 'flat',
    distributionLag: 7,
    finalDistributionCoefficient: 0.7,
    navCalculationMode: 'standard',
  };

  const feeTimeline = Array.from({ length: 40 }, () => new Decimal(0.005));

  it('should match snapshot for gompertz curve', () => {
    const result = computeJCurvePath(baseConfig, feeTimeline);

    const snapshot = {
      tvpi: result.tvpi.map(d => d.toNumber()),
      nav: result.nav.map(d => d.toNumber()),
      dpi: result.dpi.map(d => d.toNumber()),
      calls: result.calls.map(d => d.toNumber()),
      params: Object.fromEntries(
        Object.entries(result.params).map(([k, v]) =>
          [k, v instanceof Decimal ? v.toNumber() : v]
        )
      ),
      fitRMSE: result.fitRMSE,
    };

    expect(snapshot).toMatchSnapshot();
  });

  it('should match snapshot for logistic curve', () => {
    const logisticConfig: JCurveConfig = { ...baseConfig, kind: 'logistic' };
    const result = computeJCurvePath(logisticConfig, feeTimeline);

    const snapshot = {
      tvpi: result.tvpi.map(d => d.toNumber()),
      nav: result.nav.map(d => d.toNumber()),
      dpi: result.dpi.map(d => d.toNumber()),
      params: Object.fromEntries(
        Object.entries(result.params).map(([k, v]) =>
          [k, v instanceof Decimal ? v.toNumber() : v]
        )
      ),
      fitRMSE: result.fitRMSE,
    };

    expect(snapshot).toMatchSnapshot();
  });

  it('should match snapshot for piecewise curve', () => {
    const piecewiseConfig: JCurveConfig = { ...baseConfig, kind: 'piecewise' };
    const result = computeJCurvePath(piecewiseConfig, feeTimeline);

    const snapshot = {
      tvpi: result.tvpi.map(d => d.toNumber()),
      nav: result.nav.map(d => d.toNumber()),
      dpi: result.dpi.map(d => d.toNumber()),
    };

    expect(snapshot).toMatchSnapshot();
  });

  it('should match snapshot with calledSoFar calibration', () => {
    const calledSoFar = Array.from({ length: 8 }, (_, i) => new Decimal(0.1 + i * 0.02));
    const dpiSoFar = Array.from({ length: 8 }, () => new Decimal(0));

    const result = computeJCurvePath(baseConfig, feeTimeline, calledSoFar, dpiSoFar);

    const snapshot = {
      tvpi: result.tvpi.map(d => d.toNumber()),
      dpi: result.dpi.map(d => d.toNumber()),
      fitRMSE: result.fitRMSE,
    };

    expect(snapshot).toMatchSnapshot();
  });

  it('should match snapshot for fee-adjusted NAV mode', () => {
    const feeAdjustedConfig: JCurveConfig = {
      ...baseConfig,
      navCalculationMode: 'fee-adjusted'
    };
    const result = computeJCurvePath(feeAdjustedConfig, feeTimeline);

    const snapshot = {
      nav: result.nav.map(d => d.toNumber()),
    };

    expect(snapshot).toMatchSnapshot();
  });
});

describe('sanitizeMonotonicCurve', () => {
  it('should enforce monotonically non-decreasing values', () => {
    const input = [
      new Decimal(1.0),
      new Decimal(1.2),
      new Decimal(1.1), // dip - should be corrected
      new Decimal(1.5),
    ];
    const result = sanitizeMonotonicCurve(input, new Decimal(0.9), new Decimal(1.5));

    expect(result.map(d => d.toNumber())).toEqual([1.0, 1.2, 1.2, 1.5]);
  });

  it('should clamp start value to minimum', () => {
    const input = [new Decimal(0.5), new Decimal(1.0)];
    const result = sanitizeMonotonicCurve(input, new Decimal(0.9), new Decimal(1.0));

    expect(result[0].toNumber()).toBe(0.9);
  });

  it('should set end value exactly', () => {
    const input = [new Decimal(1.0), new Decimal(2.0)];
    const result = sanitizeMonotonicCurve(input, new Decimal(0.9), new Decimal(2.5));

    expect(result[result.length - 1].toNumber()).toBe(2.5);
  });

  it('should handle empty array', () => {
    const result = sanitizeMonotonicCurve([], new Decimal(0.9), new Decimal(2.5));
    expect(result).toEqual([]);
  });
});

describe('calibrateToActualCalls', () => {
  it('should adjust seed values based on actual calls', () => {
    const ysSeed = [1.0, 0.95, 0.92, 0.90];
    const calledSoFar = [
      new Decimal(0.25),
      new Decimal(0.25),
    ];
    const dpiSoFar = [
      new Decimal(0),
      new Decimal(0.05),
    ];

    const result = calibrateToActualCalls(ysSeed, calledSoFar, dpiSoFar);

    // Should modify first 2 values based on observed TVPI
    expect(result.length).toBe(4);
    expect(typeof result[0]).toBe('number');
  });

  it('should handle empty calledSoFar', () => {
    const ysSeed = [1.0, 0.95];
    const calledSoFar: Decimal[] = [];

    const result = calibrateToActualCalls(ysSeed, calledSoFar);

    expect(result).toEqual(ysSeed);
  });

  it('should handle undefined dpiSoFar', () => {
    const ysSeed = [1.0, 0.95, 0.92];
    const calledSoFar = [new Decimal(0.3)];

    const result = calibrateToActualCalls(ysSeed, calledSoFar, undefined);

    expect(result.length).toBe(3);
  });
});

describe('buildFittedTVPICurve', () => {
  const baseConfig: JCurveConfig = {
    kind: 'gompertz',
    horizonYears: 10,
    investYears: 5,
    targetTVPI: new Decimal(2.5),
    startTVPI: new Decimal(0.95),
    step: 'quarter',
  };

  it('should build gompertz curve with correct structure', () => {
    const xs = Array.from({ length: 41 }, (_, i) => i / 4);
    const result = buildFittedTVPICurve(baseConfig, xs, 2.5, 0.95);

    expect(result.tvpi.length).toBe(41);
    expect(result.params).toHaveProperty('b');
    expect(result.params).toHaveProperty('c');
    expect(typeof result.rmse).toBe('number');
  });

  it('should build logistic curve with correct params', () => {
    const logisticConfig: JCurveConfig = { ...baseConfig, kind: 'logistic' };
    const xs = Array.from({ length: 41 }, (_, i) => i / 4);
    const result = buildFittedTVPICurve(logisticConfig, xs, 2.5, 0.95);

    expect(result.params).toHaveProperty('r');
    expect(result.params).toHaveProperty('t0');
  });

  it('should handle calibration with actuals', () => {
    const xs = Array.from({ length: 41 }, (_, i) => i / 4);
    const calledSoFar = [new Decimal(0.2), new Decimal(0.2)];
    const dpiSoFar = [new Decimal(0), new Decimal(0)];

    const result = buildFittedTVPICurve(
      baseConfig, xs, 2.5, 0.95, calledSoFar, dpiSoFar
    );

    expect(result.tvpi.length).toBe(41);
    expect(result.rmse).toBeDefined();
  });
});
