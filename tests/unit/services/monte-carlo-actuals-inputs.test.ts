import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import path from 'node:path';

import { FLAG_DEFAULTS, FLAG_DEFINITIONS } from '../../../shared/generated/flag-defaults';

const {
  buildFactsMonteCarloInput,
  buildFundCompanyActualsFacts,
  eventOrder,
  insertedSnapshots,
  isFlagEnabled,
  loggerInfo,
  modeFindFirst,
  portfolioCompaniesFindMany,
  updateReturning,
  updatedSnapshotMetadata,
} = vi.hoisted(() => ({
  buildFactsMonteCarloInput: vi.fn(),
  buildFundCompanyActualsFacts: vi.fn(),
  eventOrder: [] as string[],
  insertedSnapshots: [] as Record<string, unknown>[],
  isFlagEnabled: vi.fn(),
  loggerInfo: vi.fn(),
  modeFindFirst: vi.fn(),
  portfolioCompaniesFindMany: vi.fn(),
  updateReturning: vi.fn(),
  updatedSnapshotMetadata: [] as Record<string, unknown>[],
}));

vi.mock('../../../server/db', () => ({
  db: {
    query: {
      fundBaselines: { findFirst: vi.fn() },
      varianceReports: { findMany: vi.fn() },
      portfolioCompanies: { findMany: portfolioCompaniesFindMany },
      funds: { findFirst: vi.fn() },
      fundCalculationModes: { findFirst: modeFindFirst },
    },
    insert: vi.fn(() => ({
      values: vi.fn((values: Record<string, unknown>) => {
        insertedSnapshots.push(structuredClone(values));
        eventOrder.push('persist');
        return { returning: vi.fn(async () => [{ id: 901 }]) };
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => {
            updatedSnapshotMetadata.push(values);
            eventOrder.push('metadata');
            return updateReturning();
          }),
        })),
      })),
    })),
  },
}));

vi.mock('@shared/flags/getFlag', () => ({ isFlagEnabled }));

vi.mock('../../../server/services/fund-actuals/fund-company-actuals-facts-service', () => ({
  buildFundCompanyActualsFacts,
}));

vi.mock('../../../server/services/monte-carlo/facts-monte-carlo-input-adapter', () => ({
  buildFactsMonteCarloInput,
}));

vi.mock('../../../server/lib/logger', () => ({
  logger: {
    info: loggerInfo,
    child: vi.fn(() => ({ info: loggerInfo, warn: vi.fn(), error: vi.fn() })),
  },
}));

vi.mock('uuid', () => ({ v4: () => 'fixed-monte-carlo-simulation-id' }));

import { db } from '../../../server/db';
import {
  buildActualsMonteCarloCompanyState,
  MonteCarloSimulationService,
  type SimulationParameters,
} from '../../../server/services/monte-carlo-simulation';

const PARAMS: SimulationParameters = {
  fundId: 7,
  scenarios: 8,
  timeHorizonYears: 5,
  confidenceIntervals: [10, 25, 50, 75, 90],
  randomSeed: 42,
};

const LEGACY_COMPANIES = [
  {
    id: 11,
    fundId: 7,
    name: 'Alpha',
    stage: 'Seed',
    sector: 'Fintech',
    investmentAmount: '100.00',
    investments: [{ amount: '100.00' }],
  },
  {
    id: 12,
    fundId: 7,
    name: 'Beta',
    stage: 'Series A',
    sector: 'Healthtech',
    investmentAmount: '50.00',
    investments: [{ amount: '50.00' }],
  },
];

const FACTS_INPUT_HASH = 'a'.repeat(64);
const SOURCE_FACTS_INPUT_HASH = 'b'.repeat(64);
const FACTS_RESPONSE = {
  fundId: 7,
  asOfDate: '2026-07-13',
  facts: [],
  inputHash: SOURCE_FACTS_INPUT_HASH,
  generatedAt: '2026-07-13T12:00:00.000Z',
};
const FACTS_INPUT = {
  contractVersion: 'monte-carlo-facts-input-v1' as const,
  fundId: 7,
  asOfDate: '2026-07-13',
  factsInputHash: FACTS_INPUT_HASH,
  sourceFactsInputHash: SOURCE_FACTS_INPUT_HASH,
  companies: [
    {
      companyId: 11,
      observedInitialInvestment: '100.000000',
      observedFollowOnInvestment: '25.000000',
      planningFmv: null,
      planningFmvStatus: 'none' as const,
      stage: 'Seed',
      sector: 'Fintech',
      trustState: 'LIVE' as const,
      currencyStatus: 'base_currency' as const,
      warnings: [],
    },
    {
      companyId: 12,
      observedInitialInvestment: null,
      observedFollowOnInvestment: null,
      planningFmv: null,
      planningFmvStatus: 'blocked' as const,
      stage: 'Series A',
      sector: 'Healthtech',
      trustState: 'UNAVAILABLE' as const,
      currencyStatus: 'mismatch_blocked' as const,
      warnings: [],
    },
  ],
};

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function simulateLegacy(): Promise<
  Awaited<ReturnType<MonteCarloSimulationService['generateForecast']>>
> {
  isFlagEnabled.mockReturnValue(false);
  return new MonteCarloSimulationService().generateForecast(PARAMS);
}

async function simulate(input: {
  flag: boolean;
}): Promise<Awaited<ReturnType<MonteCarloSimulationService['generateForecast']>>> {
  isFlagEnabled.mockReturnValue(input.flag);
  return new MonteCarloSimulationService().generateForecast(PARAMS);
}

describe('MonteCarloSimulationService actuals-backed company inputs', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-13T12:00:00.000Z'));
    vi.clearAllMocks();
    insertedSnapshots.length = 0;
    updatedSnapshotMetadata.length = 0;
    eventOrder.length = 0;
    isFlagEnabled.mockReturnValue(false);
    modeFindFirst.mockResolvedValue(undefined);
    portfolioCompaniesFindMany.mockResolvedValue(LEGACY_COMPANIES);
    updateReturning.mockReturnValue([{ id: 1 }]);
    buildFundCompanyActualsFacts.mockImplementation(async () => {
      eventOrder.push('facts');
      return FACTS_RESPONSE;
    });
    buildFactsMonteCarloInput.mockReturnValue(FACTS_INPUT);
    loggerInfo.mockImplementation(() => {
      eventOrder.push('log');
    });
    vi.mocked(db.query.fundBaselines.findFirst).mockResolvedValue({
      id: 'baseline-7',
      fundId: 7,
      totalValue: '1000000',
      deployedCapital: '500000',
      irr: '0.12',
      multiple: '1.5',
      dpi: '0.5',
      tvpi: '1.5',
      isDefault: true,
      isActive: true,
    } as never);
    vi.mocked(db.query.varianceReports.findMany).mockResolvedValue([]);
    vi.mocked(db.query.funds.findFirst).mockResolvedValue({ id: 7, size: '2000000' } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps the fixed-seed flag-off return and persisted snapshot byte-identical to legacy', async () => {
    const legacyForecast = await simulateLegacy();
    const flagOffForecast = await simulate({ flag: false });

    expect(flagOffForecast).toEqual(legacyForecast);
    expect(insertedSnapshots).toHaveLength(2);
    expect(insertedSnapshots[1]).toEqual(insertedSnapshots[0]);
    expect(sha256(legacyForecast)).toBe(
      '69a0799ff35b8790f91d22989c9079ab78eee22159f3976f0bc4a5ee765c2c49'
    );
    expect(sha256(insertedSnapshots[0])).toBe(
      '44481fab6a0726bbabc2bdedb4d98bc499792a5725cbdab31b301d226df6b643'
    );
    expect(flagOffForecast).not.toHaveProperty('provenance');
    expect(insertedSnapshots[1]?.metadata).not.toHaveProperty('actualsFacts');
    expect(modeFindFirst).not.toHaveBeenCalled();
    expect(buildFundCompanyActualsFacts).not.toHaveBeenCalled();
    expect(buildFactsMonteCarloInput).not.toHaveBeenCalled();
  });

  it('registers the server-only actuals-input flag off in every environment', () => {
    expect(FLAG_DEFAULTS.enable_monte_carlo_actuals_inputs).toBe(false);
    expect(FLAG_DEFINITIONS.enable_monte_carlo_actuals_inputs).toMatchObject({
      default: false,
      owner: 'analytics',
      risk: 'high',
      exposeToClient: false,
      environments: { development: false, staging: false, production: false },
    });
  });

  it('keeps the legacy path when the enabled flag has no mode row', async () => {
    const legacyForecast = await simulateLegacy();
    isFlagEnabled.mockReturnValue(true);
    modeFindFirst.mockResolvedValue(undefined);

    const modeOffForecast = await new MonteCarloSimulationService().generateForecast(PARAMS);

    expect(modeOffForecast).toEqual(legacyForecast);
    expect(insertedSnapshots[1]).toEqual(insertedSnapshots[0]);
    expect(modeFindFirst).toHaveBeenCalledOnce();
    expect(buildFundCompanyActualsFacts).not.toHaveBeenCalled();
    expect(buildFactsMonteCarloInput).not.toHaveBeenCalled();
  });

  it('restores byte-identical legacy behavior when the kill switch is active', async () => {
    const legacyForecast = await simulateLegacy();
    isFlagEnabled.mockReturnValue(true);
    modeFindFirst.mockResolvedValue({ configuredMode: 'on', killSwitchActive: true });

    const killedForecast = await new MonteCarloSimulationService().generateForecast(PARAMS);

    expect(killedForecast).toEqual(legacyForecast);
    expect(insertedSnapshots[1]).toEqual(insertedSnapshots[0]);
    expect(buildFundCompanyActualsFacts).not.toHaveBeenCalled();
    expect(buildFactsMonteCarloInput).not.toHaveBeenCalled();
  });

  it('maps observed money into aggregates while retaining blocked companies only for counts', () => {
    expect(buildActualsMonteCarloCompanyState(FACTS_INPUT)).toEqual({
      companies: [
        {
          id: 11,
          stage: 'Seed',
          sector: 'Fintech',
          investmentAmount: '125',
          investments: [{ amount: '100.000000' }, { amount: '25.000000' }],
        },
        {
          id: 12,
          stage: 'Series A',
          sector: 'Healthtech',
          investmentAmount: null,
          investments: [],
        },
      ],
      usableMoneyCount: 1,
      blockedCount: 1,
    });
  });

  it('uses adapter-derived company state in on mode and discloses blocked money', async () => {
    isFlagEnabled.mockReturnValue(true);
    modeFindFirst.mockResolvedValue({ configuredMode: 'on', killSwitchActive: false });

    const forecast = await new MonteCarloSimulationService().generateForecast(PARAMS);

    expect(buildFundCompanyActualsFacts).toHaveBeenCalledOnce();
    expect(buildFundCompanyActualsFacts).toHaveBeenCalledWith({
      fundId: 7,
      asOfDate: '2026-07-13',
    });
    expect(buildFactsMonteCarloInput).toHaveBeenCalledOnce();
    const adapterInput = buildFactsMonteCarloInput.mock.calls[0]?.[0] as
      | { companyMetadata: ReadonlyMap<number, { stage: string | null; sector: string | null }> }
      | undefined;
    expect(adapterInput?.companyMetadata.get(11)).toEqual({ stage: 'Seed', sector: 'Fintech' });
    expect(adapterInput?.companyMetadata.get(12)).toEqual({
      stage: 'Series A',
      sector: 'Healthtech',
    });
    expect(portfolioCompaniesFindMany).toHaveBeenCalledOnce();
    expect(Object.keys(forecast.portfolioMetrics.stagePerformance).sort()).toEqual([
      'Seed',
      'Series A',
    ]);
    expect(Object.keys(forecast.portfolioMetrics.sectorPerformance).sort()).toEqual([
      'Fintech',
      'Healthtech',
    ]);
    expect(forecast.provenance).toEqual({
      actualsFacts: {
        factsInputHash: FACTS_INPUT_HASH,
        sourceFactsInputHash: SOURCE_FACTS_INPUT_HASH,
        mode: 'on',
        warnings: [
          {
            code: 'ACTUALS_MONEY_BLOCKED',
            blockedCompanyCount: 1,
            message:
              '1 company retained for count-based analysis and excluded from monetary aggregates',
          },
        ],
      },
    });
    expect(insertedSnapshots[0]?.metadata).toMatchObject({
      actualsFacts: {
        factsInputHash: FACTS_INPUT_HASH,
        sourceFactsInputHash: SOURCE_FACTS_INPUT_HASH,
        mode: 'on',
      },
    });
  });

  it('persists legacy shadow output first, then adds provenance and emits one aggregate event', async () => {
    const legacyForecast = await simulateLegacy();
    isFlagEnabled.mockReturnValue(true);
    modeFindFirst.mockResolvedValue({ configuredMode: 'shadow', killSwitchActive: false });
    eventOrder.length = 0;

    const shadowForecast = await new MonteCarloSimulationService().generateForecast(PARAMS);

    expect(eventOrder).toEqual(['persist', 'facts', 'metadata', 'log']);
    expect(insertedSnapshots[1]?.payload).toEqual(legacyForecast);
    expect(insertedSnapshots[1]?.metadata).toEqual(insertedSnapshots[0]?.metadata);
    expect(updatedSnapshotMetadata).toHaveLength(1);
    expect(updatedSnapshotMetadata[0]?.metadata).toMatchObject({
      actualsFacts: {
        factsInputHash: FACTS_INPUT_HASH,
        sourceFactsInputHash: SOURCE_FACTS_INPUT_HASH,
        mode: 'shadow',
      },
    });
    expect(shadowForecast.provenance).toEqual({
      actualsFacts: {
        factsInputHash: FACTS_INPUT_HASH,
        sourceFactsInputHash: SOURCE_FACTS_INPUT_HASH,
        mode: 'shadow',
      },
    });
    expect(buildFundCompanyActualsFacts).toHaveBeenCalledOnce();
    expect(buildFactsMonteCarloInput).toHaveBeenCalledOnce();
    expect(loggerInfo).toHaveBeenCalledOnce();
    expect(loggerInfo.mock.calls[0]?.[0]).toEqual({
      eventName: 'monte_carlo_actuals_shadow',
      fundId: 7,
      factsInputHash: FACTS_INPUT_HASH.slice(0, 12),
      companyCount: 2,
      usableMoneyCount: 1,
      blockedCount: 1,
      legacyCompanyCount: 2,
      durationMs: expect.any(Number),
    });
    const serializedEvent = JSON.stringify(loggerInfo.mock.calls[0]?.[0]);
    expect(serializedEvent).not.toContain('Alpha');
    expect(serializedEvent).not.toContain('Beta');
    expect(serializedEvent).not.toContain('100.000000');
  });

  it('swallows shadow facts failures after persistence and emits one warning event', async () => {
    isFlagEnabled.mockReturnValue(true);
    modeFindFirst.mockResolvedValue({ configuredMode: 'shadow', killSwitchActive: false });
    buildFundCompanyActualsFacts.mockImplementation(async () => {
      eventOrder.push('facts');
      throw new Error('facts unavailable');
    });

    const forecast = await new MonteCarloSimulationService().generateForecast(PARAMS);

    expect(forecast).not.toHaveProperty('provenance');
    expect(insertedSnapshots).toHaveLength(1);
    expect(updatedSnapshotMetadata).toHaveLength(0);
    expect(loggerInfo).toHaveBeenCalledOnce();
    expect(loggerInfo.mock.calls[0]?.[0]).toEqual({
      eventName: 'monte_carlo_actuals_shadow',
      fundId: 7,
      factsInputHash: null,
      companyCount: 0,
      usableMoneyCount: 0,
      blockedCount: 0,
      legacyCompanyCount: 2,
      durationMs: expect.any(Number),
      warningCode: 'SHADOW_BUILD_FAILED',
    });
  });

  it('keeps serving legacy output when the shadow metadata compare-and-swap misses', async () => {
    isFlagEnabled.mockReturnValue(true);
    modeFindFirst.mockResolvedValue({ configuredMode: 'shadow', killSwitchActive: false });
    updateReturning.mockReturnValue([]);

    const forecast = await new MonteCarloSimulationService().generateForecast(PARAMS);

    expect(forecast).not.toHaveProperty('provenance');
    expect(insertedSnapshots).toHaveLength(1);
    expect(updateReturning).toHaveBeenCalledOnce();
    expect(loggerInfo).toHaveBeenCalledOnce();
    expect(loggerInfo.mock.calls[0]?.[0]).toMatchObject({
      eventName: 'monte_carlo_actuals_shadow',
      fundId: 7,
      warningCode: 'SHADOW_BUILD_FAILED',
    });
  });

  it('pins the legacy distribution rules and calibration constants by value', async () => {
    const actualFs = await vi.importActual<typeof import('node:fs')>('node:fs');
    const source = actualFs.readFileSync(
      path.join(process.cwd(), 'server/services/monte-carlo-simulation.ts'),
      'utf8'
    );

    expect(source).toContain('standardDeviation: 0.15, // 15% default volatility');
    expect(source).toContain("distribution = 'powerlaw'");
    expect(source).toContain("distribution = 'lognormal'");
    expect(source).toContain("distribution = 'triangular'");
    expect(source).toMatch(/generateInvestmentScenario\(\s*'seed',\s*timeHorizonYears\s*\)/);
    expect(source).toContain('const upsideCompression = 0.82');
    expect(source).toContain("baseline.irr?.toString() || '0.12'");
    expect(source).toContain("baseline.dpi?.toString() || '0.5'");
    expect(source).toContain("baseline.tvpi?.toString() || '1.5'");
    expect(source).toContain('eq(fundSnapshots.id, snapshotId)');
    expect(source).toContain('eq(fundSnapshots.metadata, legacyMetadata)');
    expect(source).toContain('.returning({ id: fundSnapshots.id })');
  });
});
