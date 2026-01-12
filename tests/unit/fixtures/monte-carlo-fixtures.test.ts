/**
 * Tests for Monte Carlo Test Fixtures
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createMockFundBaseline,
  createMockVarianceReports,
  createMockFund,
  createMockMonteCarloDataset,
  resetIdCounter,
} from '../../fixtures/monte-carlo-fixtures';

describe('Monte Carlo Test Fixtures', () => {
  beforeEach(() => {
    resetIdCounter();
  });

  describe('createMockFundBaseline', () => {
    it('creates valid fund baseline with expected fields', () => {
      const baseline = createMockFundBaseline();

      expect(baseline).toHaveProperty('id');
      expect(baseline).toHaveProperty('fundId');
      expect(baseline).toHaveProperty('projectedIrr');
      expect(baseline).toHaveProperty('projectedMultiple');
      expect(baseline).toHaveProperty('fundSize');
    });

    it('generates realistic IRR values within -0.5 to 1.0 range', () => {
      for (let i = 0; i < 10; i++) {
        const baseline = createMockFundBaseline();
        expect(baseline.projectedIrr).toBeGreaterThanOrEqual(-0.5);
        expect(baseline.projectedIrr).toBeLessThanOrEqual(1.0);
      }
    });

    it('generates positive multiples', () => {
      for (let i = 0; i < 10; i++) {
        const baseline = createMockFundBaseline();
        expect(baseline.projectedMultiple).toBeGreaterThan(0);
      }
    });

    it('respects custom options', () => {
      const baseline = createMockFundBaseline({
        fundId: 999,
        projectedIrr: 0.25,
        projectedMultiple: 2.5,
      });

      expect(baseline.fundId).toBe(999);
      expect(baseline.projectedIrr).toBe(0.25);
      expect(baseline.projectedMultiple).toBe(2.5);
    });
  });

  describe('createMockVarianceReports', () => {
    it('creates valid variance reports array', () => {
      const reports = createMockVarianceReports();

      expect(Array.isArray(reports)).toBe(true);
      expect(reports.length).toBeGreaterThan(0);
    });

    it('creates reports with expected fields', () => {
      const reports = createMockVarianceReports({ count: 1 });
      const report = reports[0];

      expect(report).toHaveProperty('id');
      expect(report).toHaveProperty('fundId');
      expect(report).toHaveProperty('baselineId');
      expect(report).toHaveProperty('irrVariance');
      expect(report).toHaveProperty('multipleVariance');
    });

    it('creates the specified number of reports', () => {
      const reports = createMockVarianceReports({ count: 3 });
      expect(reports.length).toBe(3);
    });
  });

  describe('createMockFund', () => {
    it('creates valid fund with expected fields', () => {
      const fund = createMockFund();

      expect(fund).toHaveProperty('id');
      expect(fund).toHaveProperty('name');
      expect(fund).toHaveProperty('status');
      expect(fund).toHaveProperty('targetSize');
    });

    it('generates positive target size', () => {
      const fund = createMockFund();
      expect(fund.targetSize).toBeGreaterThan(0);
    });
  });

  describe('createMockMonteCarloDataset', () => {
    it('creates complete dataset with fund, baseline, and variance reports', () => {
      const dataset = createMockMonteCarloDataset();

      expect(dataset).toHaveProperty('fund');
      expect(dataset).toHaveProperty('baseline');
      expect(dataset).toHaveProperty('varianceReports');
    });

    it('maintains referential integrity', () => {
      const dataset = createMockMonteCarloDataset();

      expect(dataset.baseline.fundId).toBe(dataset.fund.id);
      for (const report of dataset.varianceReports) {
        expect(report.fundId).toBe(dataset.fund.id);
        expect(report.baselineId).toBe(dataset.baseline.id);
      }
    });
  });
});
