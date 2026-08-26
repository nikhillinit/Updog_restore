/**
 * J-Curve Golden Dataset Tests
 *
 * Validates J-curve against reference dataset (10yr, 2.5x fund)
 */

import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { computeJCurvePath, type JCurveConfig } from '@shared/lib/jcurve';

describe('J-Curve Golden Dataset', () => {
  /**
   * Golden reference: 10-year, $100M fund, 2.5x target
   *
   * Key checkpoints (approximations from typical VC fund):
   * - Q0: TVPI 0.00, DPI 0.00, RVPI 0.00
   * - Q12 (Year 3): TVPI ~0.95, DPI ~0.05, RVPI ~0.90
   * - Q28 (Year 7): TVPI ~1.80, DPI ~0.70, RVPI ~1.10
   * - Q40 (Year 10): TVPI ~2.50, DPI ~2.20, RVPI ~0.30
   */

  const GOLDEN_CONFIG: JCurveConfig = {
    fundSize: new Decimal(100_000_000),
    targetTVPI: 2.5,
    investmentPeriodQuarters: 20,
    fundLifeQuarters: 40,
    actualTVPIPoints: [],
    navCalculationMode: 'standard',
    finalDistributionCoefficient: 0.7
  };

  it('should match golden checkpoint at Q0', () => {
    const result = computeJCurvePath(GOLDEN_CONFIG);
    const q0 = result.mainPath[0];

    expect(q0?.quarter).toBe(0);
    expect(q0?.tvpi).toBe(0);
    expect(q0?.dpi).toBe(0);
    expect(q0?.rvpi).toBe(0);
  });

  it('should match golden checkpoint at Q12 (Year 3)', () => {
    const result = computeJCurvePath(GOLDEN_CONFIG);
    const q12 = result.mainPath[12];

    expect(q12?.quarter).toBe(12);

    // Year 3: Post-investment, minimal exits
    // Expected: TVPI ~0.95 (below cost due to fees/markdowns)
    expect(q12?.tvpi).toBeGreaterThan(0.7);
    expect(q12?.tvpi).toBeLessThan(1.2);

    // DPI should be very low (few exits)
    expect(q12?.dpi).toBeGreaterThanOrEqual(0);
    expect(q12?.dpi).toBeLessThan(0.2);

    // RVPI should be dominant
    expect(q12?.rvpi).toBeGreaterThan(0.6);
  });

  it('should match golden checkpoint at Q28 (Year 7)', () => {
    const result = computeJCurvePath(GOLDEN_CONFIG);
    const q28 = result.mainPath[28];

    expect(q28?.quarter).toBe(28);

    // Year 7: Harvest phase, significant distributions
    // Expected: TVPI ~1.80, DPI ~0.70
    expect(q28?.tvpi).toBeGreaterThan(1.4);
    expect(q28?.tvpi).toBeLessThan(2.2);

    // DPI should be ramping up
    expect(q28?.dpi).toBeGreaterThan(0.4);
    expect(q28?.dpi).toBeLessThan(1.2);

    // RVPI still substantial
    expect(q28?.rvpi).toBeGreaterThan(0.6);
  });

  it('should match golden checkpoint at Q40 (Year 10)', () => {
    const result = computeJCurvePath(GOLDEN_CONFIG);
    const q40 = result.mainPath[40];

    expect(q40?.quarter).toBe(40);

    // Year 10: Near full liquidation
    // Expected: TVPI ~2.50, DPI ~2.20
    expect(q40?.tvpi).toBeGreaterThan(2.0);
    expect(q40?.tvpi).toBeLessThanOrEqual(2.5);

    // DPI should dominate (most exits complete)
    expect(q40?.dpi).toBeGreaterThan(1.5);

    // RVPI should be small (residual NAV)
    expect(q40?.rvpi).toBeLessThan(1.0);
  });

  it('should handle edge case: zero investment period', () => {
    const config: JCurveConfig = {
      ...GOLDEN_CONFIG,
      investmentPeriodQuarters: 0 // Invalid
    };

    const result = computeJCurvePath(config);

    // Should gracefully fall back to piecewise
    expect(result.mainPath.length).toBe(41);
    expect(result.mainPath[0]?.tvpi).toBe(0);
  });

  it('should handle edge case: zero fund size', () => {
    const config: JCurveConfig = {
      ...GOLDEN_CONFIG,
      fundSize: new Decimal(0)
    };

    const result = computeJCurvePath(config);

    // Should produce valid path with all zeros
    expect(result.mainPath.length).toBe(41);
    for (const point of result.mainPath) {
      expect(point.tvpi).toBe(0);
      expect(point.dpi).toBe(0);
      expect(point.rvpi).toBe(0);
    }
  });

  it('should validate NAV calculation modes', () => {
    // Standard NAV
    const standardResult = computeJCurvePath({
      ...GOLDEN_CONFIG,
      navCalculationMode: 'standard'
    });

    // Fee-adjusted NAV
    const feeAdjustedResult = computeJCurvePath({
      ...GOLDEN_CONFIG,
      navCalculationMode: 'fee-adjusted'
    });

    // Both should produce valid paths
    expect(standardResult.mainPath.length).toBe(41);
    expect(feeAdjustedResult.mainPath.length).toBe(41);

    // Fee-adjusted should have slightly different NAV values
    // (can't test exact values without fee profile)
  });

  it('should validate finalDistributionCoefficient impact', () => {
    // High coefficient (70% distributed)
    const highCoeff = computeJCurvePath({
      ...GOLDEN_CONFIG,
      finalDistributionCoefficient: 0.9
    });

    // Low coefficient (50% distributed)
    const lowCoeff = computeJCurvePath({
      ...GOLDEN_CONFIG,
      finalDistributionCoefficient: 0.5
    });

    const highFinal = highCoeff.mainPath[40];
    const lowFinal = lowCoeff.mainPath[40];

    // Higher coefficient should have more DPI
    expect(highFinal?.dpi).toBeGreaterThan(lowFinal?.dpi ?? 0);

    // Lower coefficient should have more RVPI
    expect(lowFinal?.rvpi).toBeGreaterThan(highFinal?.rvpi ?? 0);
  });
});
