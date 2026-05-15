import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeterministicReserveEngine } from '../../../../../shared/core/reserves/DeterministicReserveEngine';
import { ConstrainedReserveEngine } from '../../../../../shared/core/reserves/ConstrainedReserveEngine';
import { FeatureFlaggedReserveEngine } from '../../../../../server/core/reserves/adapter';
import type { MlClient } from '../../../../../server/core/reserves/mlClient';
import type { MarketConditions, PortfolioCompany } from '../../../../../server/core/reserves/ports';

const market: MarketConditions = {
  asOfDate: '2026-05-15',
  marketScore: 0.5,
};

function createCompany(overrides: Partial<PortfolioCompany> = {}): PortfolioCompany {
  return {
    id: 'company-1',
    fundId: 'fund-1',
    name: 'Guarded Co',
    stage: 'seed',
    sector: 'software',
    checkSize: 1_000_000,
    invested: 1_000_000,
    ownership: 0.1,
    entryDate: '2024-01-01',
    ...overrides,
  };
}

function createEngine() {
  const deterministicEngine = new DeterministicReserveEngine();
  const calculateSpy = vi.spyOn(deterministicEngine, 'calculateOptimalReserveAllocation');

  const engine = new FeatureFlaggedReserveEngine(
    deterministicEngine,
    new ConstrainedReserveEngine(),
    { predict: vi.fn() } as unknown as MlClient,
    {
      useMl: false,
      mode: 'rules',
      mlWeight: 0,
      enableABTest: false,
      abTestPercentage: 0,
      fallbackOnError: false,
      logAllDecisions: false,
    }
  );

  return { engine, calculateSpy };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('FeatureFlaggedReserveEngine unit guard', () => {
  it('rejects negative invested amounts before invoking the rules engine', async () => {
    const { engine, calculateSpy } = createEngine();

    await expect(engine.compute(createCompany({ invested: -1 }), market)).rejects.toThrow(
      /finite non-negative dollar amount/
    );
    expect(calculateSpy).not.toHaveBeenCalled();
  });

  it('rejects non-finite invested amounts before invoking the rules engine', async () => {
    const { engine, calculateSpy } = createEngine();

    await expect(engine.compute(createCompany({ invested: Number.NaN }), market)).rejects.toThrow(
      /finite non-negative dollar amount/
    );
    expect(calculateSpy).not.toHaveBeenCalled();
  });

  it('rejects cent-scaled invested amounts before invoking the rules engine', async () => {
    const { engine, calculateSpy } = createEngine();

    await expect(
      engine.compute(createCompany({ invested: 100_000_000_001 }), market)
    ).rejects.toThrow(/expected dollars, not cents/);
    expect(calculateSpy).not.toHaveBeenCalled();
  });
});
