/**
 * Golden snapshot tests for computeJCurvePath refactoring
 * Captures current output to ensure parity after refactor
 */
import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { computeJCurvePath, type JCurveConfig } from '@shared/lib/jcurve';

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
