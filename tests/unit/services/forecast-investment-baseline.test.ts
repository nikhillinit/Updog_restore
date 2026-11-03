import { beforeEach, describe, expect, it, vi } from 'vitest';
import historicalFixture from '../../fixtures/capital-planning/completed-interpretation-1.0.0.json';

const { query, transaction, rawSet, detail } = vi.hoisted(() => ({
  query: vi.fn(),
  transaction: vi.fn(),
  rawSet: vi.fn(),
  detail: vi.fn(),
}));
vi.mock('../../../server/db/pg-circuit.js', () => ({ transaction }));
vi.mock('../../../server/services/fund-scenario-set-service.js', () => ({
  fetchRawScenarioSet: rawSet,
  fetchCapitalScenarioSetDetailFromRaw: detail,
  createHttpError: (status: number, message: string, extras?: Record<string, unknown>) =>
    Object.assign(new Error(message), { status, ...extras }),
}));

import { readForecastInvestmentBaseline } from '../../../server/services/forecast-investment-baseline';

function fixture() {
  return structuredClone(historicalFixture);
}

function month(demandMonth: number, kind = 'initial', demandUsd = '100.000000') {
  return {
    allocationId: 'a1',
    entryMonth: 0,
    demandMonth,
    roundId: kind === 'initial' ? null : 'r1',
    kind,
    countBasis: 'expected',
    companyCount: '0.500000000000',
    demandUsd,
    beyondTerm: false,
  };
}

describe('readForecastInvestmentBaseline', () => {
  let saved: ReturnType<typeof fixture>;

  beforeEach(() => {
    vi.clearAllMocks();
    saved = fixture();
    const payload = saved.snapshot.payload;
    payload.variants[0].result.construction.monthlyDetail = [
      month(0),
      month(1, 'follow_on', '25.000000'),
      month(2, 'initial', '200.000000'),
      month(12, 'follow_on', '50.000000'),
      { ...month(0, 'initial', '999.000000'), countBasis: 'entered' },
    ];
    query.mockImplementation(async () => ({ rows: [saved.snapshot] }));
    transaction.mockImplementation(async (callback) => callback({ query }));
    rawSet.mockResolvedValue(saved);
    detail.mockImplementation(async () => ({
      fundId: payload.fundId,
      id: payload.scenarioSetId,
      name: 'Saved original forecast',
      sourceConfigId: payload.sourceConfigId,
      sourceConfigVersion: payload.sourceConfigVersion,
      sourceBundleHash: payload.sourceBundleHash,
      interpretationVersion: payload.interpretationVersion,
      baselineVariantId: payload.baselineVariantId,
      variants: saved.variants.map((variant: Record<string, unknown>) => ({
        id: variant['id'],
        scenarioSetId: variant['scenario_set_id'],
        sortOrder: variant['sort_order'],
        override: { overrideType: 'capital_plan', payload: variant['override_payload'] },
      })),
    }));
  });

  it('reads the exact fund-scoped saved snapshot without current-source recomputation', async () => {
    const before = JSON.stringify(saved);
    const result = await readForecastInvestmentBaseline(
      101,
      saved.snapshot.id,
      '2024-03',
      '2024-04-30'
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/WHERE id = \$1 AND fund_id = \$2 AND type = 'SCENARIOS'/),
      [saved.snapshot.id, 101]
    );
    expect(detail).toHaveBeenCalledWith({ query }, saved, { readCurrentSource: false });
    expect(result).toMatchObject({
      snapshotId: saved.snapshot.id,
      scenarioName: 'Saved original forecast',
      configVersion: saved.snapshot.config_version,
      inputHash: saved.snapshot.state_hash,
      startMonth: '2024-03',
      committedCapital:
        saved.snapshot.payload.variants[0].result.sourceBundle.fundSize.normalizedValue,
      totals: {
        deployedCapital: '125.000000',
        initialCapital: '100.000000',
        followOnCapital: '25.000000',
        companyCount: '0.500000000000',
      },
      periods: [
        {
          period: '2024-Q1',
          initialCapital: '100.000000',
          followOnCapital: '0.000000',
          deployedCapital: '100.000000',
          newCompanies: '0.500000000000',
          cumulativeCapital: '100.000000',
          cumulativeCompanies: '0.500000000000',
        },
        {
          period: '2024-Q2',
          initialCapital: '200.000000',
          followOnCapital: '25.000000',
          deployedCapital: '225.000000',
          newCompanies: '0.500000000000',
          cumulativeCapital: '325.000000',
          cumulativeCompanies: '1.000000000000',
        },
        {
          period: '2025-Q1',
          initialCapital: '0.000000',
          followOnCapital: '50.000000',
          deployedCapital: '50.000000',
          newCompanies: '0.000000000000',
          cumulativeCapital: '375.000000',
          cumulativeCompanies: '1.000000000000',
        },
      ],
    });
    expect(JSON.stringify(saved)).toBe(before);
  });

  it('counts only completed calendar months while retaining future schedule periods', async () => {
    const result = await readForecastInvestmentBaseline(
      101,
      saved.snapshot.id,
      '2024-02',
      '2024-02-28'
    );
    expect(result?.totals.deployedCapital).toBe('0.000000');
    expect(result?.periods.length).toBe(3);
    const leapDay = await readForecastInvestmentBaseline(
      101,
      saved.snapshot.id,
      '2024-02',
      '2024-02-29'
    );
    expect(leapDay?.totals.deployedCapital).toBe('100.000000');
  });

  it('returns unavailable for a missing selection without trying a latest snapshot', async () => {
    query.mockResolvedValue({ rows: [] });
    expect(await readForecastInvestmentBaseline(101, 999, '2024-03', '2026-09-30')).toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
    expect(rawSet).not.toHaveBeenCalled();
  });

  it('reports an absent expected schedule as unavailable', async () => {
    saved.snapshot.payload.variants[0].result.construction.monthlyDetail = [];
    expect(
      await readForecastInvestmentBaseline(101, saved.snapshot.id, '2024-03', '2026-09-30')
    ).toBeNull();
  });

  it('preserves a recorded zero schedule as available', async () => {
    saved.snapshot.payload.variants[0].result.construction.monthlyDetail = [
      { ...month(0, 'initial', '0.000000'), companyCount: '0.000000000000' },
    ];
    expect(
      (await readForecastInvestmentBaseline(101, saved.snapshot.id, '2024-03', '2026-09-30'))
        ?.totals.deployedCapital
    ).toBe('0.000000');
  });

  it('rejects mismatched stored identities through the existing saved decoder', async () => {
    saved.snapshot.config_version += 1;
    await expect(
      readForecastInvestmentBaseline(101, saved.snapshot.id, '2024-03', '2026-09-30')
    ).rejects.toThrow('Stored capital snapshot identity or payload is invalid');
  });

  it('sums decimal schedule leaves exactly and sorts periods independently of row order', async () => {
    saved.snapshot.payload.variants[0].result.construction.monthlyDetail = [
      month(12, 'follow_on', '0.300000'),
      { ...month(0, 'initial', '0.100000'), companyCount: '0.100000000001' },
      { ...month(1, 'initial', '0.200000'), companyCount: '0.200000000002' },
    ];
    const result = await readForecastInvestmentBaseline(
      101,
      saved.snapshot.id,
      '2024-01',
      '2026-09-30'
    );
    expect(result?.totals).toEqual({
      deployedCapital: '0.600000',
      initialCapital: '0.300000',
      followOnCapital: '0.300000',
      companyCount: '0.300000000003',
    });
    expect(result?.periods.map((period) => period.period)).toEqual(['2024-Q1', '2025-Q1']);
  });

  it('refuses a wrong-fund database row before reading scenario details', async () => {
    saved.snapshot.fund_id = 102;
    await expect(
      readForecastInvestmentBaseline(101, saved.snapshot.id, '2024-03', '2026-09-30')
    ).rejects.toThrow('Stored capital snapshot does not match the selected baseline');
    expect(rawSet).not.toHaveBeenCalled();
  });

  it.each([
    [101, 1, '2024-13', '2026-09-30'],
    [101, 1, '2024-03', '2026-02-30'],
    [101, -1, '2024-03', '2026-09-30'],
    [0, 1, '2024-03', '2026-09-30'],
  ])('rejects invalid inputs before querying', async (fundId, snapshotId, startMonth, asOfDate) => {
    await expect(
      readForecastInvestmentBaseline(
        Number(fundId),
        Number(snapshotId),
        String(startMonth),
        String(asOfDate)
      )
    ).rejects.toThrow('Invalid forecast investment baseline selection');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects out-of-bounds schedule months instead of expanding unbounded periods', async () => {
    saved.snapshot.payload.variants[0].result.construction.monthlyDetail = [month(840)];
    await expect(
      readForecastInvestmentBaseline(101, saved.snapshot.id, '2024-03', '2026-09-30')
    ).rejects.toThrow('Stored capital snapshot identity or payload is invalid');
  });
});
