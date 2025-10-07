/**
 * J-Curve Engine Tests
 *
 * Basic smoke tests for J-curve path computation
 */

import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { computeJCurvePath, type JCurveConfig } from '@shared/lib/jcurve';

describe('J-Curve Engine', () => {
  it('should generate basic J-curve path for 10yr fund targeting 2.5x', () => {
    const config: JCurveConfig = {
      fundSize: new Decimal(100_000_000),
      targetTVPI: 2.5,
      investmentPeriodQuarters: 20, // 5 years
      fundLifeQuarters: 40, // 10 years
      actualTVPIPoints: [],
      navCalculationMode: 'standard',
      finalDistributionCoefficient: 0.7
    };

    const result = computeJCurvePath(config);

    // Should have 40 quarters + 1 (Q0)
    expect(result.mainPath.length).toBe(41);

    // First point should be Q0 with zero metrics
    const firstPoint = result.mainPath[0];
    expect(firstPoint?.quarter).toBe(0);
    expect(firstPoint?.tvpi).toBe(0);
    expect(firstPoint?.dpi).toBe(0);

    // Final point should approach target TVPI
    const finalPoint = result.mainPath[40];
    expect(finalPoint?.quarter).toBe(40);
    expect(finalPoint?.tvpi).toBeGreaterThan(2.0);
    expect(finalPoint?.tvpi).toBeLessThanOrEqual(2.5);
  });

  it('should ensure DPI is monotonically increasing', () => {
    const config: JCurveConfig = {
      fundSize: new Decimal(50_000_000),
      targetTVPI: 3.0,
      investmentPeriodQuarters: 20,
      fundLifeQuarters: 40,
      actualTVPIPoints: [],
      navCalculationMode: 'standard'
    };

    const result = computeJCurvePath(config);

    // DPI should never decrease
    for (let i = 1; i < result.mainPath.length; i++) {
      const current = result.mainPath[i];
      const previous = result.mainPath[i - 1];
      expect(current?.dpi).toBeGreaterThanOrEqual(previous?.dpi ?? 0);
    }
  });

  it('should respect TVPI = DPI + RVPI identity', () => {
    const config: JCurveConfig = {
      fundSize: new Decimal(100_000_000),
      targetTVPI: 2.2,
      investmentPeriodQuarters: 20,
      fundLifeQuarters: 40,
      actualTVPIPoints: []
    };

    const result = computeJCurvePath(config);

    // Check identity for every point
    for (const point of result.mainPath) {
      const calculatedTVPI = point.dpi + point.rvpi;
      expect(Math.abs(calculatedTVPI - point.tvpi)).toBeLessThan(0.01);
    }
  });

  it('should fall back to piecewise linear when curve fitting fails', () => {
    const config: JCurveConfig = {
      fundSize: new Decimal(100_000_000),
      targetTVPI: 2.5,
      investmentPeriodQuarters: 0, // Invalid: zero investment period
      fundLifeQuarters: 40,
      actualTVPIPoints: []
    };

    const result = computeJCurvePath(config);

    // Should still produce valid path (piecewise fallback)
    expect(result.mainPath.length).toBe(41);
    expect(result.mainPath[0]?.tvpi).toBe(0);
  });

  it('should calibrate to actual TVPI points when provided', () => {
    const config: JCurveConfig = {
      fundSize: new Decimal(100_000_000),
      targetTVPI: 2.5,
      investmentPeriodQuarters: 20,
      fundLifeQuarters: 40,
      actualTVPIPoints: [
        { quarter: 4, tvpi: 0.8 },
        { quarter: 8, tvpi: 0.9 },
        { quarter: 12, tvpi: 1.0 }
      ]
    };

    const result = computeJCurvePath(config);

    // Should be close to actual points (within tolerance)
    const q4 = result.mainPath[4];
    const q8 = result.mainPath[8];
    const q12 = result.mainPath[12];

    expect(Math.abs(q4!.tvpi - 0.8)).toBeLessThan(0.2);
    expect(Math.abs(q8!.tvpi - 0.9)).toBeLessThan(0.2);
    expect(Math.abs(q12!.tvpi - 1.0)).toBeLessThan(0.2);
  });

  it('should generate sensitivity bands (upper/lower)', () => {
    const config: JCurveConfig = {
      fundSize: new Decimal(100_000_000),
      targetTVPI: 2.5,
      investmentPeriodQuarters: 20,
      fundLifeQuarters: 40,
      actualTVPIPoints: []
    };

    const result = computeJCurvePath(config);

    // Should have upper and lower bands
    expect(result.upperBand.length).toBe(41);
    expect(result.lowerBand.length).toBe(41);

    // Upper band should be >= main path
    for (let i = 0; i < result.mainPath.length; i++) {
      const main = result.mainPath[i];
      const upper = result.upperBand[i];
      expect(upper?.tvpi).toBeGreaterThanOrEqual(main?.tvpi ?? 0);
    }

    // Lower band should be <= main path
    for (let i = 0; i < result.mainPath.length; i++) {
      const main = result.mainPath[i];
      const lower = result.lowerBand[i];
      expect(lower?.tvpi).toBeLessThanOrEqual(main?.tvpi ?? 0);
    }
  });
});
