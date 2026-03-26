import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SimulationInputs } from '@shared/types';

const { runFundModelV2 } = vi.hoisted(() => ({
  runFundModelV2: vi.fn(),
}));

vi.mock('../../../client/src/lib/fund-calc-v2', () => ({
  runFundModelV2,
}));

class MockWorkerScope extends EventTarget {
  postMessage = vi.fn<(message: unknown) => void>();
}

async function flushWorker(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('simulation.worker', () => {
  let workerScope: MockWorkerScope;

  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    runFundModelV2.mockReset();
    workerScope = new MockWorkerScope();
    vi.stubGlobal('self', workerScope);
  });

  it('posts a result message with timing data', async () => {
    const input = { fundSize: 100 } as SimulationInputs;
    const result = { nav: 123 } as unknown;
    runFundModelV2.mockReturnValue(result);
    vi.spyOn(performance, 'now').mockReturnValueOnce(100).mockReturnValueOnce(125);

    await import('../../../client/src/workers/simulation.worker');
    workerScope.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'run', runId: 'run-1', inputs: input },
      })
    );
    await flushWorker();

    expect(runFundModelV2).toHaveBeenCalledWith(input);
    expect(workerScope.postMessage).toHaveBeenCalledWith({
      type: 'result',
      runId: 'run-1',
      result,
      duration: 25,
    });
  });

  it('posts an error message when the simulation throws', async () => {
    runFundModelV2.mockImplementation(() => {
      throw new Error('simulation failed');
    });

    await import('../../../client/src/workers/simulation.worker');
    workerScope.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'run', runId: 'run-2', inputs: {} as SimulationInputs },
      })
    );
    await flushWorker();

    expect(workerScope.postMessage).toHaveBeenCalledWith({
      type: 'error',
      runId: 'run-2',
      error: 'simulation failed',
    });
  });
});
