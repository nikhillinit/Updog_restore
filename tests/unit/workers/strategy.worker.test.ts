import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InvestmentStrategy, StrategyInputs } from '@/selectors/buildInvestmentStrategy';

const { buildInvestmentStrategy } = vi.hoisted(() => ({
  buildInvestmentStrategy: vi.fn(),
}));

vi.mock('@/selectors/buildInvestmentStrategy', () => ({
  buildInvestmentStrategy,
}));

type StrategyWorkerScope = {
  postMessage: ReturnType<typeof vi.fn<(message: unknown) => void>>;
  onmessage: ((event: MessageEvent<StrategyInputs>) => void) | null;
};

function createWorkerScope(): StrategyWorkerScope {
  return {
    postMessage: vi.fn<(message: unknown) => void>(),
    onmessage: null,
  };
}

describe('strategy.worker', () => {
  let workerScope: StrategyWorkerScope;

  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    buildInvestmentStrategy.mockReset();
    workerScope = createWorkerScope();
    vi.stubGlobal('self', workerScope);
  });

  it('posts the built strategy with timing data', async () => {
    const input = {
      stages: [{ id: 'seed', name: 'Seed', graduate: 60, exit: 10, months: 18 }],
      sectorProfiles: [],
      allocations: [],
    } satisfies StrategyInputs;
    const result = {
      stages: [],
      sectorProfiles: [],
      allocations: [],
      totalSectorAllocation: 0,
      totalAllocation: 0,
      validation: { stages: [], sectors: [], allocations: [], allValid: true },
    } satisfies InvestmentStrategy;

    buildInvestmentStrategy.mockReturnValue(result);
    vi.spyOn(performance, 'now').mockReturnValueOnce(10).mockReturnValueOnce(35);

    await import('../../../client/src/workers/strategy.worker');
    workerScope.onmessage?.(new MessageEvent('message', { data: input }));

    expect(buildInvestmentStrategy).toHaveBeenCalledWith(input);
    expect(workerScope.postMessage).toHaveBeenCalledWith({
      ok: true,
      result,
      timing: 25,
    });
  });

  it('posts an error message when strategy building fails', async () => {
    buildInvestmentStrategy.mockImplementation(() => {
      throw new Error('invalid strategy');
    });

    await import('../../../client/src/workers/strategy.worker');
    workerScope.onmessage?.(
      new MessageEvent('message', {
        data: { stages: [], sectorProfiles: [], allocations: [] } satisfies StrategyInputs,
      })
    );

    expect(workerScope.postMessage).toHaveBeenCalledWith({
      ok: false,
      error: 'invalid strategy',
    });
  });
});
