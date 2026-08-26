import { describe, expect, it } from 'vitest';
import { Decimal } from '../../../../shared/lib/decimal-utils';
import {
  analyzeCompanyVarianceRows,
  extractBaselineCompanySnapshots,
  getCompanyVarianceRiskLevel,
  sumInvestmentAmounts,
} from '../../../../server/services/variance-tracking/company-variance';

describe('company variance helpers', () => {
  it('sums string and number investment amounts while skipping null amounts', () => {
    const result = sumInvestmentAmounts([
      { amount: '100000.50' },
      { amount: 25000 },
      { amount: null },
      {},
    ]);

    expect(result.toString()).toBe('125000.5');
  });

  it('classifies company variance risk by magnitude thresholds', () => {
    expect(getCompanyVarianceRiskLevel(null)).toBe('medium');
    expect(getCompanyVarianceRiskLevel(new Decimal(0.05))).toBe('low');
    expect(getCompanyVarianceRiskLevel(new Decimal(0.1))).toBe('medium');
    expect(getCompanyVarianceRiskLevel(new Decimal(0.25))).toBe('high');
    expect(getCompanyVarianceRiskLevel(new Decimal(0.5))).toBe('critical');
    expect(getCompanyVarianceRiskLevel(new Decimal(-0.5))).toBe('critical');
  });

  it('prefers full companySnapshots over topPerformers and normalizes Decimal fields', () => {
    const result = extractBaselineCompanySnapshots({
      companySnapshots: [
        {
          companyId: '1',
          companyName: 'AlphaCo',
          sector: 'Technology',
          stage: 'Series A',
          status: 'active',
          currentValuation: '500000.00',
          investedCapital: 200000,
        },
      ],
      topPerformers: [{ id: 2, name: 'LegacyCo', sector: 'Healthcare', valuation: 400000 }],
    });

    expect(result.source).toBe('full_snapshot');
    expect(result.companies).toHaveLength(1);
    expect(result.companies[0]).toMatchObject({
      portfolioCompanyId: 1,
      companyId: 1,
      name: 'AlphaCo',
      sector: 'Technology',
      stage: 'Series A',
      status: 'active',
    });
    expect(result.companies[0].currentValuation).toBeInstanceOf(Decimal);
    expect(result.companies[0].currentValuation?.toString()).toBe('500000');
    expect(result.companies[0].investedCapital).toBeInstanceOf(Decimal);
    expect(result.companies[0].investedCapital?.toString()).toBe('200000');
  });

  it('computes matched rows from legacy topPerformers with aliases and current invested capital', () => {
    const rows = analyzeCompanyVarianceRows(
      [
        {
          id: 1,
          name: 'AlphaCo',
          sector: 'Technology',
          stage: 'Series A',
          status: 'active',
          currentValuation: '600000.00',
          investments: [{ amount: '210000.00' }],
        },
        {
          id: 2,
          name: 'BetaCo',
          sector: 'Healthcare',
          currentValuation: '350000.00',
          investments: [{ amount: 180000 }],
        },
        {
          id: 3,
          name: 'GammaCo',
          sector: 'FinTech',
          currentValuation: '200000.00',
          investments: [],
        },
      ],
      {
        topPerformers: [
          { id: 1, name: 'AlphaCo', sector: 'Technology', currentValuation: '500000.00' },
          { id: 2, name: 'BetaCo', sector: 'Healthcare', currentValuation: '400000.00' },
        ],
      }
    );

    expect(rows).toHaveLength(2);

    const alpha = rows.find((row) => row.companyId === 1);
    expect(alpha).toMatchObject({
      companyName: 'AlphaCo',
      sector: 'Technology',
      stage: 'Series A',
      status: 'active',
      changeType: 'matched',
      baselineValuation: '500000',
      currentValuation: '600000',
      currentInvestedCapital: '210000',
      valuationVariance: '100000',
      valuationVariancePct: '0.2',
      valuationChange: '100000',
      valuationChangePct: '0.2',
      riskLevel: 'medium',
    });

    const beta = rows.find((row) => row.companyId === 2);
    expect(beta).toMatchObject({
      companyName: 'BetaCo',
      changeType: 'matched',
      currentInvestedCapital: '180000',
      valuationVariance: '-50000',
      valuationVariancePct: '-0.125',
      valuationChange: '-50000',
      valuationChangePct: '-0.125',
      riskLevel: 'medium',
    });
  });

  it('classifies added and removed companies when full snapshots are present', () => {
    const rows = analyzeCompanyVarianceRows(
      [
        {
          id: 1,
          name: 'AlphaCo',
          sector: 'Technology',
          stage: 'Series A',
          status: 'active',
          currentValuation: '650000.00',
          investments: [{ amount: '220000.00' }],
        },
        {
          id: 3,
          name: 'GammaCo',
          sector: 'FinTech',
          stage: 'Seed',
          status: 'active',
          currentValuation: '250000.00',
          investments: [{ amount: '90000.00' }],
        },
      ],
      {
        companySnapshots: [
          {
            companyId: 1,
            companyName: 'AlphaCo',
            sector: 'Technology',
            stage: 'Series A',
            status: 'active',
            currentValuation: '500000.00',
            investedCapital: '200000.00',
          },
          {
            companyId: 2,
            companyName: 'BetaCo',
            sector: 'Healthcare',
            stage: 'Series B',
            status: 'active',
            currentValuation: '400000.00',
            investedCapital: '150000.00',
          },
        ],
      }
    );

    expect(rows).toHaveLength(3);

    expect(rows.find((row) => row.companyId === 1)).toMatchObject({
      companyName: 'AlphaCo',
      changeType: 'matched',
      baselineValuation: '500000',
      currentValuation: '650000',
      baselineInvestedCapital: '200000',
      currentInvestedCapital: '220000',
      valuationVariance: '150000',
      riskLevel: 'high',
    });

    expect(rows.find((row) => row.companyId === 3)).toMatchObject({
      companyName: 'GammaCo',
      changeType: 'added',
      baselineValuation: null,
      currentValuation: '250000',
      baselineInvestedCapital: null,
      currentInvestedCapital: '90000',
      valuationVariance: '250000',
      valuationVariancePct: null,
      riskLevel: 'medium',
    });

    expect(rows.find((row) => row.companyId === 2)).toMatchObject({
      companyName: 'BetaCo',
      changeType: 'removed',
      baselineValuation: '400000',
      currentValuation: null,
      baselineInvestedCapital: '150000',
      currentInvestedCapital: null,
      valuationVariance: '-400000',
      valuationVariancePct: '-1',
      riskLevel: 'critical',
    });
  });

  it('skips rows with null current valuation or zero baseline valuation', () => {
    const rows = analyzeCompanyVarianceRows(
      [
        {
          id: 1,
          name: 'NullCo',
          sector: 'Technology',
          currentValuation: null,
          investments: [{ amount: '100000' }],
        },
        {
          id: 2,
          name: 'ZeroCo',
          sector: 'Healthcare',
          currentValuation: '500000',
          investments: [{ amount: '100000' }],
        },
      ],
      {
        topPerformers: [
          { id: 1, name: 'NullCo', sector: 'Technology', currentValuation: '100000' },
          { id: 2, name: 'ZeroCo', sector: 'Healthcare', currentValuation: '0' },
        ],
      }
    );

    expect(rows).toEqual([]);
  });

  it('returns no rows when baseline has no company source', () => {
    expect(analyzeCompanyVarianceRows([], { topPerformers: null })).toEqual([]);
    expect(analyzeCompanyVarianceRows([], {})).toEqual([]);
  });
});
