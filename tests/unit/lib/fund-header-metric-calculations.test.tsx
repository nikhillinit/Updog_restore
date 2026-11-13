import { describe, expect, it } from 'vitest';
import type { PublishedFundActuals } from '@shared/contracts/dual-forecast/investment-comparison.contract';
import type { UnifiedFundMetrics } from '@shared/types/metrics';
import {
  buildCompactHeaderViewModel,
  buildFundHeaderViewModel,
  headerMetricsBasis,
  PORTFOLIO_METRICS_BASIS,
  resolveCommittedCapital,
} from '@/lib/fund-header-metric-calculations';

const unsupportedReason = 'Published investments do not support this metric.';
const publishedActuals = (status: 'available' | 'unavailable'): PublishedFundActuals => ({
  contractVersion: 'published-fund-actuals/1.0.0',
  status,
  asOfDate: '2026-11-03',
  basis: null,
  vehicleScope: 'main_fund',
  investments:
    status === 'available'
      ? {
          deployedCapital: '8000000',
          initialCapital: '6000000',
          followOnCapital: '2000000',
          transactionCount: 5,
          companyCount: 4,
        }
      : null,
  reason: status === 'unavailable' ? 'Published investment facts unavailable.' : null,
  unsupportedReason,
  disclosures: [],
});

function metricsWithPublishedActuals(actuals?: PublishedFundActuals): UnifiedFundMetrics {
  return {
    actual: {
      totalCommitted: 50_000_000,
      totalCalled: 20_000_000,
      totalDeployed: 12_000_000,
      currentNAV: 40_000_000,
      totalValue: 46_000_000,
      irr: 0.2,
      tvpi: 2.3,
      dpi: 0.8,
      activeCompanies: 3,
      exitedCompanies: 1,
      writtenOffCompanies: 0,
      averageCheckSize: 4_000_000,
      deploymentRate: 24,
    },
    lastUpdated: '2026-11-03T12:00:00.000Z',
    ...(actuals ? { publishedActuals: actuals } : {}),
  } as UnifiedFundMetrics;
}

const headerFund = { size: 50_000_000 };

describe('resolveCommittedCapital - committed-capital provenance', () => {
  it('prefers the server-computed actual.totalCommitted when present', () => {
    expect(resolveCommittedCapital(50_000_000, { totalCommitted: 48_000_000 })).toBe(48_000_000);
  });

  it('falls back to the fund config size when actual metrics are absent', () => {
    expect(resolveCommittedCapital(50_000_000)).toBe(50_000_000);
  });

  it('falls back to the fund config size when actual.totalCommitted is undefined, so committed is always available', () => {
    expect(resolveCommittedCapital(50_000_000, { totalCommitted: undefined })).toBe(50_000_000);
  });
});

describe('published actuals in fund header view models', () => {
  it('labels the header source with the publication basis or the legacy estimate basis', () => {
    expect(headerMetricsBasis(undefined)).toBe(PORTFOLIO_METRICS_BASIS);
    expect(headerMetricsBasis(publishedActuals('available'))).toBe(unsupportedReason);
    const withBasis: PublishedFundActuals = {
      ...publishedActuals('available'),
      basis: {
        snapshotId: 9,
        snapshotInputHash: 'synthetic-hash',
        snapshotAsOfDate: '2026-10-31',
        knowledgeCutoff: '2026-11-01T00:00:00.000Z',
      },
    };
    expect(headerMetricsBasis(withBasis)).toBe(
      `Published facts snapshot #9, data through 2026-10-31. ${unsupportedReason}`
    );
  });

  it('uses published deployment and cash-invested company count when available', () => {
    const metrics = metricsWithPublishedActuals(publishedActuals('available'));
    const header = buildFundHeaderViewModel(headerFund, metrics, false, false);
    const deployed = header.cards.find((card) => card.key === 'deployed');
    const invested = header.cards.find((card) => card.key === 'totalInvested');
    const active = header.cards.find((card) => card.key === 'activeInvestments');
    const currentValue = header.cards.find((card) => card.key === 'totalValue');
    const irr = header.cards.find((card) => card.key === 'irr');
    const dpi = header.cards.find((card) => card.key === 'dpi');
    const tvpi = header.cards.find((card) => card.key === 'tvpi');
    const remaining = header.cards.find((card) => card.key === 'remainingCapital');

    expect(deployed?.displayValue).toBe('16.0%');
    expect(invested?.displayValue).toBe('$8M');
    expect(active).toMatchObject({ title: 'Cash-invested companies', displayValue: '4' });
    expect(currentValue?.displayValue).toBe('—');
    expect(currentValue?.titleText).toBe(unsupportedReason);
    expect(irr).toMatchObject({ displayValue: '—', titleText: unsupportedReason });
    expect(dpi).toMatchObject({ displayValue: '—', titleText: unsupportedReason });
    expect(tvpi?.displayValue).toBe('N/A');
    expect(remaining?.displayValue).toBe('N/A');

    const compact = buildCompactHeaderViewModel(
      'Synthetic Fund',
      50_000_000,
      metrics.actual,
      'deployed',
      false,
      false,
      metrics.publishedActuals
    );
    expect(compact.items.find((item) => item.key === 'deployed')?.displayValue).toBe('16.0%');
    expect(compact.items.find((item) => item.key === 'remaining')?.displayValue).toBe('N/A');

    const zeroCommitment = {
      ...metrics,
      actual: { ...metrics.actual, totalCommitted: 0 },
    } as UnifiedFundMetrics;
    const zeroCommitmentHeader = buildFundHeaderViewModel(headerFund, zeroCommitment, false, false);
    expect(zeroCommitmentHeader.cards.find((card) => card.key === 'deployed')?.displayValue).toBe(
      'N/A'
    );
  });

  it('does not fall back to legacy deployment values when published investments are unavailable', () => {
    const metrics = metricsWithPublishedActuals(publishedActuals('unavailable'));
    const header = buildFundHeaderViewModel(headerFund, metrics, false, false);

    expect(header.cards.find((card) => card.key === 'deployed')?.displayValue).toBe('N/A');
    expect(header.cards.find((card) => card.key === 'totalInvested')?.displayValue).toBe('N/A');
    expect(header.cards.find((card) => card.key === 'activeInvestments')).toMatchObject({
      title: 'Cash-invested companies',
      displayValue: 'N/A',
    });
    expect(header.cards.find((card) => card.key === 'irr')?.titleText).toBe(unsupportedReason);

    const compact = buildCompactHeaderViewModel(
      'Synthetic Fund',
      50_000_000,
      metrics.actual,
      'deployed',
      false,
      false,
      metrics.publishedActuals
    );
    expect(compact.items.find((item) => item.key === 'deployed')?.displayValue).toBe('N/A');
    expect(compact.items.find((item) => item.key === 'nav')?.explanation).toBe(unsupportedReason);
  });

  it('keeps legacy header values and labels when published actuals are absent', () => {
    const metrics = metricsWithPublishedActuals();
    const header = buildFundHeaderViewModel(headerFund, metrics, false, false);

    expect(header.cards.find((card) => card.key === 'deployed')?.displayValue).toBe('24.0%');
    expect(header.cards.find((card) => card.key === 'totalInvested')?.displayValue).toBe('$12M');
    expect(header.cards.find((card) => card.key === 'activeInvestments')).toMatchObject({
      title: 'Active',
      displayValue: '3',
    });

    const compact = buildCompactHeaderViewModel(
      'Synthetic Fund',
      50_000_000,
      metrics.actual,
      'deployed',
      false,
      false
    );
    expect(compact.items.find((item) => item.key === 'deployed')?.displayValue).toBe('24.0%');
  });
});
