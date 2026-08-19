import { beforeEach, describe, expect, it, vi } from 'vitest';

const queueState = vi.hoisted(() => ({
  instances: [] as Array<{
    add: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    getJob: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock('bullmq', () => ({
  Queue: function QueueMock() {
    const queue = {
      add: vi.fn().mockResolvedValue({ id: 'job-1' }),
      close: vi.fn().mockResolvedValue(undefined),
      getJob: vi.fn().mockResolvedValue(null),
    };
    queueState.instances.push(queue);
    return queue;
  },
}));

vi.mock('../../../server/config/features.js', () => ({
  getQueueRuntimePolicy: () => ({ enabled: true, reason: 'ok' }),
  getQueueConnectionOptions: () => ({ host: '127.0.0.1', port: 6379 }),
}));

vi.mock('../../../server/db/pg-circuit.js', () => ({
  transaction: async (callback: (client: object) => Promise<unknown>) =>
    callback({
      query: async () => ({ rows: [{ id: 'run-1' }], rowCount: 1 }),
    }),
}));

vi.mock('../../../server/services/fund-scenario-reserve-calculation-service.js', () => ({
  getReserveScenarioCalculationIdentity: vi.fn().mockResolvedValue({
    fundId: 1,
    scenarioSetId: '11111111-1111-4111-8111-111111111111',
    sourceConfigId: 1,
    sourceConfigVersion: 1,
    inputHash: 'input-hash',
    variantCount: 1,
    inputLineage: {
      hashKind: 'scenario_set_v1',
      modelInputsAsOfDate: '2026-08-09',
      comparisonLineageVersion: 'v1',
    },
  }),
}));

vi.mock('../../../server/services/fund-scenario-set-service.js', () => ({
  createHttpError: (_status: number, message: string) => new Error(message),
  insertScenarioSetEvent: vi.fn().mockResolvedValue(undefined),
  normalizeActor: (actor: unknown) => actor,
}));

vi.mock('../../../server/services/fund-scenario-calculation-run-service.js', () => ({
  acquireScenarioCalculationRunWithCreation: vi.fn().mockResolvedValue({
    inserted: false,
    run: {
      id: '33333333-3333-4333-8333-333333333333',
      jobId: 'job-1',
      correlationId: '22222222-2222-4222-8222-222222222222',
      status: 'queued',
    },
  }),
  bindQueuedScenarioCalculationRunJobId: vi.fn(),
}));

const input = {
  fundId: 1,
  scenarioSetId: '11111111-1111-4111-8111-111111111111',
  correlationId: '22222222-2222-4222-8222-222222222222',
  actor: { userId: 1 },
};

describe('fund scenario producer lifecycle identity', () => {
  beforeEach(() => {
    vi.resetModules();
    queueState.instances.splice(0, queueState.instances.length);
  });

  it('does not let a stale close handle close or unregister a replacement producer', async () => {
    const service = await import('../../../server/services/fund-scenario-calc-queue-service.js');
    const registry = await import('../../../server/queues/registry.js');

    await service.enqueueReserveScenarioCalculation(input);
    const staleRuntime = registry.getRegisteredQueueRuntime('fund-scenario-calc');
    await staleRuntime?.close?.();
    expect(queueState.instances[0]?.close).toHaveBeenCalledTimes(1);

    await service.enqueueReserveScenarioCalculation(input);
    const replacementQueue = queueState.instances[1];
    expect(replacementQueue).toBeDefined();

    await staleRuntime?.close?.();

    expect(replacementQueue?.close).not.toHaveBeenCalled();
    expect(registry.getRegisteredQueueRuntime('fund-scenario-calc')?.getQueue()).toBe(
      replacementQueue
    );
  });
});
