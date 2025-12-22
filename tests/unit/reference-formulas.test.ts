import { describe, it, expect } from 'vitest';
import { ReferenceFormulas, computeReferenceMetrics, validateInvariants } from '@/lib/reference-formulas';
import Decimal from 'decimal.js';
import type { FundModelOutputs } from '@shared/schemas/fund-model';

describe('Reference Formulas', () => {
  describe('DPI (Distributions to Paid-In)', () => {
    it('should calculate DPI correctly', () => {
      const dpi = ReferenceFormulas.DPI(
        new Decimal(50_000_000),  // $50M distributions
        new Decimal(100_000_000)  // $100M called
      );
      expect(dpi.toNumber()).toBe(0.5);
    });

    it('should return 0 when called capital is 0', () => {
      const dpi = ReferenceFormulas.DPI(
        new Decimal(50_000_000),
        new Decimal(0)
      );
      expect(dpi.toNumber()).toBe(0);
    });

    it('should handle decimal precision', () => {
      const dpi = ReferenceFormulas.DPI(
        new Decimal('33333333.33'),
        new Decimal('100000000')
      );
      // Should maintain precision
      expect(dpi.toFixed(10)).toBe('0.3333333333');
    });
  });

  describe('TVPI (Total Value to Paid-In)', () => {
    it('should calculate TVPI correctly', () => {
      const tvpi = ReferenceFormulas.TVPI(
        new Decimal(50_000_000),   // $50M distributions
        new Decimal(80_000_000),   // $80M NAV
        new Decimal(100_000_000)   // $100M called
      );
      expect(tvpi.toNumber()).toBe(1.3); // (50 + 80) / 100
    });

    it('should return 0 when called capital is 0', () => {
      const tvpi = ReferenceFormulas.TVPI(
        new Decimal(50_000_000),
        new Decimal(80_000_000),
        new Decimal(0)
      );
      expect(tvpi.toNumber()).toBe(0);
    });

    it('should satisfy TVPI ≥ DPI invariant', () => {
      const distributions = new Decimal(50_000_000);
      const nav = new Decimal(80_000_000);
      const called = new Decimal(100_000_000);

      const dpi = ReferenceFormulas.DPI(distributions, called);
      const tvpi = ReferenceFormulas.TVPI(distributions, nav, called);

      expect(tvpi.gte(dpi)).toBe(true);
    });
  });

  describe('Gross MOIC (Money-on-Invested-Capital before fees)', () => {
    it('should calculate Gross MOIC correctly', () => {
      const moic = ReferenceFormulas.GrossMOIC(
        new Decimal(300_000_000),  // $300M exit value
        new Decimal(100_000_000)   // $100M invested
      );
      expect(moic.toNumber()).toBe(3.0);
    });

    it('should return 0 when invested capital is 0', () => {
      const moic = ReferenceFormulas.GrossMOIC(
        new Decimal(300_000_000),
        new Decimal(0)
      );
      expect(moic.toNumber()).toBe(0);
    });
  });

  describe('Net MOIC (Money-on-Invested-Capital after fees)', () => {
    it('should calculate Net MOIC correctly', () => {
      const moic = ReferenceFormulas.NetMOIC(
        new Decimal(150_000_000),  // $150M distributions
        new Decimal(100_000_000),  // $100M NAV
        new Decimal(100_000_000),  // $100M invested
        new Decimal(20_000_000)    // $20M fees
      );
      // (150 + 100 - 20) / 100 = 2.3
      expect(moic.toNumber()).toBe(2.3);
    });

    it('should return 0 when invested capital is 0', () => {
      const moic = ReferenceFormulas.NetMOIC(
        new Decimal(150_000_000),
        new Decimal(100_000_000),
        new Decimal(0),
        new Decimal(20_000_000)
      );
      expect(moic.toNumber()).toBe(0);
    });

    it('should satisfy Net MOIC ≤ Gross MOIC invariant', () => {
      const distributions = new Decimal(150_000_000);
      const nav = new Decimal(100_000_000);
      const invested = new Decimal(100_000_000);
      const fees = new Decimal(20_000_000);

      const totalValue = distributions.plus(nav);
      const grossMOIC = ReferenceFormulas.GrossMOIC(totalValue, invested);
      const netMOIC = ReferenceFormulas.NetMOIC(distributions, nav, invested, fees);

      expect(netMOIC.lte(grossMOIC)).toBe(true);
    });
  });

  describe('computeReferenceMetrics', () => {
    it('should compute all metrics from fund outputs', () => {
      const mockOutputs: FundModelOutputs = {
        periodResults: [
          {
            periodIndex: 0,
            contributions: 25_000_000,
            distributions: 0,
            managementFees: 500_000,
            investments: 24_500_000,
            nav: 24_500_000,
          } as any,
          {
            periodIndex: 1,
            contributions: 25_000_000,
            distributions: 10_000_000,
            managementFees: 500_000,
            investments: 24_500_000,
            nav: 60_000_000,
          } as any,
        ],
        companyLedger: [],
        kpis: {
          tvpi: 1.4,
          dpi: 0.2,
          irrAnnualized: 15.5,
        },
      };

      const metrics = computeReferenceMetrics(mockOutputs);

      // DPI = 10M / 50M = 0.2
      expect(metrics.DPI.toNumber()).toBeCloseTo(0.2, 4);

      // TVPI = (10M + 60M) / 50M = 1.4
      expect(metrics.TVPI.toNumber()).toBeCloseTo(1.4, 4);

      // NAV = 60M
      expect(metrics.NAV.toNumber()).toBe(60_000_000);

      // IRR from kpis
      expect(metrics.IRR.toNumber()).toBe(15.5);
    });

    it('should throw error if no periods', () => {
      const mockOutputs: FundModelOutputs = {
        periodResults: [],
        companyLedger: [],
        kpis: { tvpi: 0, dpi: 0, irrAnnualized: null },
      };

      expect(() => computeReferenceMetrics(mockOutputs)).toThrow(
        'Fund model outputs must contain at least one period'
      );
    });
  });

  describe('validateInvariants', () => {
    it('should pass when all invariants hold', () => {
      const metrics = {
        DPI: new Decimal(0.5),
        TVPI: new Decimal(1.3),      // TVPI > DPI ✓
        GrossMOIC: new Decimal(3.0),
        NetMOIC: new Decimal(2.5),   // Net < Gross ✓
        IRR: new Decimal(0.15),
        NAV: new Decimal(80_000_000), // NAV > 0 ✓
      };

      const violations = validateInvariants(metrics);
      expect(violations).toEqual([]);
    });

    it('should detect TVPI < DPI violation', () => {
      const metrics = {
        DPI: new Decimal(1.5),
        TVPI: new Decimal(1.0),  // VIOLATION: TVPI < DPI
        GrossMOIC: new Decimal(3.0),
        NetMOIC: new Decimal(2.5),
        IRR: new Decimal(0.15),
        NAV: new Decimal(80_000_000),
      };

      const violations = validateInvariants(metrics);
      expect(violations.length).toBe(1);
      expect(violations[0]).toContain('TVPI');
      expect(violations[0]).toContain('DPI');
    });

    it('should detect Gross MOIC < Net MOIC violation', () => {
      const metrics = {
        DPI: new Decimal(0.5),
        TVPI: new Decimal(1.3),
        GrossMOIC: new Decimal(2.0),
        NetMOIC: new Decimal(2.5),  // VIOLATION: Net > Gross
        IRR: new Decimal(0.15),
        NAV: new Decimal(80_000_000),
      };

      const violations = validateInvariants(metrics);
      expect(violations.length).toBe(1);
      expect(violations[0]).toContain('Gross MOIC');
      expect(violations[0]).toContain('Net MOIC');
    });

    it('should detect negative NAV violation', () => {
      const metrics = {
        DPI: new Decimal(0.5),
        TVPI: new Decimal(1.3),
        GrossMOIC: new Decimal(3.0),
        NetMOIC: new Decimal(2.5),
        IRR: new Decimal(0.15),
        NAV: new Decimal(-10_000),  // VIOLATION: Negative NAV
      };

      const violations = validateInvariants(metrics);
      expect(violations.length).toBe(1);
      expect(violations[0]).toContain('NAV');
    });

    it('should detect multiple violations', () => {
      const metrics = {
        DPI: new Decimal(1.5),
        TVPI: new Decimal(1.0),      // VIOLATION 1
        GrossMOIC: new Decimal(2.0),
        NetMOIC: new Decimal(2.5),   // VIOLATION 2
        IRR: new Decimal(0.15),
        NAV: new Decimal(-10_000),   // VIOLATION 3
      };

      const violations = validateInvariants(metrics);
      expect(violations.length).toBe(3);
    });
  });

  describe('Property tests - Mathematical invariants', () => {
    it('should satisfy TVPI = DPI when NAV = 0', () => {
      const distributions = new Decimal(50_000_000);
      const called = new Decimal(100_000_000);
      const nav = new Decimal(0);

      const dpi = ReferenceFormulas.DPI(distributions, called);
      const tvpi = ReferenceFormulas.TVPI(distributions, nav, called);

      expect(tvpi.toNumber()).toBe(dpi.toNumber());
    });

    it('should satisfy TVPI > DPI when NAV > 0', () => {
      const distributions = new Decimal(50_000_000);
      const called = new Decimal(100_000_000);
      const nav = new Decimal(30_000_000);

      const dpi = ReferenceFormulas.DPI(distributions, called);
      const tvpi = ReferenceFormulas.TVPI(distributions, nav, called);

      expect(tvpi.gt(dpi)).toBe(true);
    });

    it('should satisfy Net MOIC = Gross MOIC when fees = 0', () => {
      const distributions = new Decimal(150_000_000);
      const nav = new Decimal(100_000_000);
      const invested = new Decimal(100_000_000);
      const fees = new Decimal(0);

      const totalValue = distributions.plus(nav);
      const grossMOIC = ReferenceFormulas.GrossMOIC(totalValue, invested);
      const netMOIC = ReferenceFormulas.NetMOIC(distributions, nav, invested, fees);

      expect(netMOIC.toNumber()).toBe(grossMOIC.toNumber());
    });
  });

  describe('Edge cases and precision', () => {
    it('should handle very small numbers without rounding errors', () => {
      const dpi = ReferenceFormulas.DPI(
        new Decimal('0.00000001'),
        new Decimal('0.00000003')
      );
      expect(dpi.toFixed(20)).toBe('0.33333333333333333333');
    });

    it('should handle very large numbers', () => {
      const dpi = ReferenceFormulas.DPI(
        new Decimal('999999999999999'),
        new Decimal('1000000000000000')
      );
      expect(dpi.toNumber()).toBeCloseTo(0.999999999999999, 15);
    });

    it('should handle zero distributions (fund still deploying)', () => {
      const tvpi = ReferenceFormulas.TVPI(
        new Decimal(0),            // No distributions yet
        new Decimal(50_000_000),   // NAV from deployed capital
        new Decimal(50_000_000)    // Called capital
      );
      expect(tvpi.toNumber()).toBe(1.0);
    });
  });
});
