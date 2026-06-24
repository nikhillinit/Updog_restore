import { beforeEach, describe, expect, it, vi } from 'vitest';

const storageState = vi.hoisted(() => ({ getFund: vi.fn() }));
const readState = vi.hoisted(() => ({ listCompanies: vi.fn() }));

vi.mock('../../../server/storage', () => ({
  storage: { getFund: storageState.getFund },
}));

vi.mock('../../../server/services/portfolio-time-machine-read', () => ({
  portfolioTimeMachineReadService: { listCompanies: readState.listCompanies },
}));

import { getPortfolioOverview } from '../../../server/services/portfolio-overview-service';
import { NotFoundError } from '../../../server/errors';
import { PortfolioOverviewResponseV1Schema } from '../../../shared/contracts/portfolio-overview-v1.contract';

const NOW = new Date('2026-06-24T00:00:00.000Z');

function company(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    fundId: 10,
    name: 'Acme',
    sector: 'SaaS',
    stage: 'Seed',
    currentStage: null,
    investmentAmount: '1000000.00',
    investmentDate: null,
    currentValuation: '3000000.00',
    status: 'active',
    ...overrides,
  };
}

const liveMeta = {
  mode: 'live' as const,
  requestedAsOf: null,
  resolvedAsOf: null,
  source: 'live' as const,
  historicalAvailable: false,
};

function mockFund(baseCurrency = 'USD') {
  storageState.getFund.mockResolvedValue({ id: 10, baseCurrency });
}

function mockCompanies(companies: ReturnType<typeof company>[], meta = liveMeta) {
  readState.listCompanies.mockResolvedValue({ companies, meta });
}

describe('getPortfolioOverview', () => {
  beforeEach(() => {
    storageState.getFund.mockReset();
    readState.listCompanies.mockReset();
  });

  it('computes per-company MOIC and portfolio aggregates server-side with Decimal', async () => {
    mockFund();
    mockCompanies([
      company({ id: 1, investmentAmount: '1000000.00', currentValuation: '3000000.00' }),
      company({ id: 2, investmentAmount: '2000000.00', currentValuation: '1000000.00' }),
    ]);

    const result = await getPortfolioOverview(10, { now: NOW });

    expect(result.metrics.totalInvested).toBe('3000000');
    expect(result.metrics.totalValue).toBe('4000000');
    expect(result.companies[0]?.moic).toBe('3');
    expect(result.companies[1]?.moic).toBe('0.5');
    // Simple average of per-company MOIC: (3 + 0.5) / 2 = 1.75
    expect(result.metrics.averageMOIC).toBe('1.75');
    expect(result.metrics.totalCompanies).toBe(2);
    expect(result.currency).toBe('USD');
    expect(PortfolioOverviewResponseV1Schema.parse(result)).toEqual(result);
  });

  it('matches the former client formulas at display precision (parity)', async () => {
    mockFund();
    const rows = [
      { invested: 1_000_000, currentValue: 3_000_000 },
      { invested: 2_000_000, currentValue: 1_000_000 },
    ];
    mockCompanies(
      rows.map((row, index) =>
        company({
          id: index + 1,
          investmentAmount: row.invested.toFixed(2),
          currentValuation: row.currentValue.toFixed(2),
        })
      )
    );

    const result = await getPortfolioOverview(10, { now: NOW });

    // Old client math (floats).
    const totalInvested = rows.reduce((sum, r) => sum + r.invested, 0);
    const totalValue = rows.reduce((sum, r) => sum + r.currentValue, 0);
    const averageMOIC = rows.reduce((sum, r) => sum + r.currentValue / r.invested, 0) / rows.length;
    const returnPct = ((totalValue - totalInvested) / totalInvested) * 100;

    expect(Number(result.metrics.averageMOIC).toFixed(2)).toBe(averageMOIC.toFixed(2));
    expect(Number(result.metrics.returnPct).toFixed(1)).toBe(returnPct.toFixed(1));
  });

  it('guards MOIC for zero/negative invested and null current valuation', async () => {
    mockFund();
    mockCompanies([
      company({ id: 1, investmentAmount: '0.00', currentValuation: '500000.00' }),
      company({ id: 2, investmentAmount: '1000000.00', currentValuation: null }),
    ]);

    const result = await getPortfolioOverview(10, { now: NOW });

    expect(result.companies[0]?.moic).toBe('0');
    expect(result.companies[1]?.moic).toBe('0');
    expect(result.companies[1]?.currentValue).toBe('0');
  });

  it('handles an empty fund without dividing by zero', async () => {
    mockFund();
    mockCompanies([]);

    const result = await getPortfolioOverview(10, { now: NOW });

    expect(result.metrics.totalCompanies).toBe(0);
    expect(result.metrics.averageMOIC).toBe('0');
    expect(result.metrics.returnPct).toBe('0');
    expect(result.provenance.isFinanciallyActionable).toBe(true);
    expect(PortfolioOverviewResponseV1Schema.parse(result)).toEqual(result);
  });

  it('throws NotFoundError for a non-existent fund before computing anything', async () => {
    storageState.getFund.mockResolvedValue(undefined);

    await expect(getPortfolioOverview(999, { now: NOW })).rejects.toBeInstanceOf(NotFoundError);
    expect(readState.listCompanies).not.toHaveBeenCalled();
  });

  it('counts exited vs active companies via the shared isExitedStatus rule', async () => {
    mockFund();
    mockCompanies([
      company({ id: 1, status: 'active' }),
      company({ id: 2, status: 'Exited' }),
      company({ id: 3, status: 'liquidated' }),
    ]);

    const result = await getPortfolioOverview(10, { now: NOW });

    expect(result.metrics.exitedCompanies).toBe(2);
    expect(result.metrics.activeCompanies).toBe(1);
  });

  it('passes asOf and requestedAsOf through to the time-machine resolver', async () => {
    mockFund();
    mockCompanies([company()]);
    const asOf = new Date('2025-01-31T23:59:59.999Z');

    await getPortfolioOverview(10, { now: NOW, asOf, requestedAsOf: '2025-01' });

    expect(readState.listCompanies).toHaveBeenCalledWith(10, {
      asOf,
      requestedAsOf: '2025-01',
    });
  });

  it('produces a deterministic inputHash invariant to company row order', async () => {
    mockFund();
    const a = company({ id: 1, investmentAmount: '1000000.00', currentValuation: '3000000.00' });
    const b = company({ id: 2, investmentAmount: '2000000.00', currentValuation: '1000000.00' });

    mockCompanies([a, b]);
    const forward = await getPortfolioOverview(10, { now: NOW });

    mockCompanies([b, a]);
    const reversed = await getPortfolioOverview(10, { now: NOW });

    expect(forward.provenance.inputHash).toBe(reversed.provenance.inputHash);
  });

  it('produces different inputHashes for different resolver meta (live vs snapshot)', async () => {
    mockFund();
    mockCompanies([company()], liveMeta);
    const live = await getPortfolioOverview(10, { now: NOW });

    mockCompanies([company()], {
      mode: 'historical',
      requestedAsOf: '2025-01',
      resolvedAsOf: '2025-01-31T23:59:59.999Z',
      source: 'snapshot',
      historicalAvailable: true,
    } as typeof liveMeta);
    const historical = await getPortfolioOverview(10, {
      now: NOW,
      asOf: new Date('2025-01-31T23:59:59.999Z'),
      requestedAsOf: '2025-01',
    });

    expect(live.provenance.inputHash).not.toBe(historical.provenance.inputHash);
  });

  it('stamps response.generatedAt equal to provenance.generatedAt', async () => {
    mockFund();
    mockCompanies([company()]);

    const result = await getPortfolioOverview(10, { now: NOW });

    expect(result.generatedAt).toBe(NOW.toISOString());
    expect(result.provenance.generatedAt).toBe(result.generatedAt);
  });
});
