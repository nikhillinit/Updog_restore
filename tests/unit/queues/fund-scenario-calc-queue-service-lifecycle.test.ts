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

const lineageIdentity = {
  fundId: 1,
  scenarioSetId: '11111111-1111-4111-8111-111111111111',
  sourceConfigId: 5,
  sourceConfigVersion: 3,
  currentPublishedConfigVersion: 3,
  inputHash: 'f'.repeat(64),
  inputLineage: {
    hashKind: 'scenario-input-hash-v2' as const,
    modelInputsAsOfDate: '2026-06-30',
    comparisonLineageVersion: 'comparison-lineage-v1' as const,
  },
  variantCount: 1,
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

  it('builds a deterministic job identity carrying fund, set, config, lineage, hash, and run id', async () => {
    const runService = await import(
      '../../../server/services/fund-scenario-calculation-run-service.js'
    );
    const service = await import('../../../server/services/fund-scenario-calc-queue-service.js');
    const runId = '33333333-3333-4333-8333-333333333333';
    vi.mocked(runService.acquireScenarioCalculationRunWithCreation).mockResolvedValueOnce({
      inserted: true,
      run: {
        id: runId,
        jobId: null,
        correlationId: input.correlationId,
        status: 'queued',
      },
    } as never);
    vi.mocked(runService.bindQueuedScenarioCalculationRunJobId).mockResolvedValueOnce(1 as never);

    const context = await service.acquireReserveCalculationRun({
      identity: lineageIdentity as never,
      correlationId: input.correlationId,
    });

    const identityKey = [
      'reserve-scenario',
      '1',
      lineageIdentity.scenarioSetId,
      'cfg5',
      'v3',
      'scenario-input-hash-v2',
      'f'.repeat(64),
      '2026-06-30',
      'comparison-lineage-v1',
    ].join('-');
    expect(context.jobId).toBe(`${identityKey}__run__${runId}`);
  });

  it('uses fixed tokens for undated legacy lineage in the job identity', async () => {
    const runService = await import(
      '../../../server/services/fund-scenario-calculation-run-service.js'
    );
    const service = await import('../../../server/services/fund-scenario-calc-queue-service.js');
    const runId = '44444444-4444-4444-8444-444444444444';
    vi.mocked(runService.acquireScenarioCalculationRunWithCreation).mockResolvedValueOnce({
      inserted: true,
      run: { id: runId, jobId: null, correlationId: input.correlationId, status: 'queued' },
    } as never);
    vi.mocked(runService.bindQueuedScenarioCalculationRunJobId).mockResolvedValueOnce(1 as never);

    const context = await service.acquireReserveCalculationRun({
      identity: {
        ...lineageIdentity,
        inputLineage: {
          hashKind: 'scenario-input-hash-v1',
          modelInputsAsOfDate: null,
          comparisonLineageVersion: null,
        },
      } as never,
      correlationId: input.correlationId,
    });

    expect(context.jobId).toContain('-scenario-input-hash-v1-');
    expect(context.jobId).toContain('-undated-no-lineage__run__');
  });

  it('never lets a prior failed same-input BullMQ job satisfy a newer command identity', async () => {
    const runService = await import(
      '../../../server/services/fund-scenario-calculation-run-service.js'
    );
    const service = await import('../../../server/services/fund-scenario-calc-queue-service.js');
    const newerRunId = '55555555-5555-4555-8555-555555555555';
    vi.mocked(runService.acquireScenarioCalculationRunWithCreation).mockResolvedValueOnce({
      inserted: true,
      run: { id: newerRunId, jobId: null, correlationId: input.correlationId, status: 'queued' },
    } as never);
    vi.mocked(runService.bindQueuedScenarioCalculationRunJobId).mockResolvedValueOnce(1 as never);

    const context = await service.acquireReserveCalculationRun({
      identity: lineageIdentity as never,
      correlationId: input.correlationId,
    });
    // The newer run mints a run-suffixed job id; an older failed run's job id
    // (different __run__ suffix) is a different identity entirely.
    expect(context.jobId.endsWith(`__run__${newerRunId}`)).toBe(true);

    const getJob = vi.fn().mockResolvedValue(null);
    const add = vi.fn().mockResolvedValue({ id: context.jobId });
    const ensuredJobId = await service.ensureReserveCalculationJob({
      queue: { getJob, add } as never,
      context,
      actor: { userId: 1 },
    });

    expect(ensuredJobId).toBe(context.jobId);
    // The queue is consulted ONLY under the newer run's job id.
    expect(getJob).toHaveBeenCalledTimes(1);
    expect(getJob).toHaveBeenCalledWith(context.jobId);
    expect(add).toHaveBeenCalledWith(
      'async_reserve_allocation',
      expect.objectContaining({
        fundId: lineageIdentity.fundId,
        scenarioSetId: lineageIdentity.scenarioSetId,
        correlationId: input.correlationId,
        inputHash: lineageIdentity.inputHash,
        runId: newerRunId,
      }),
      expect.objectContaining({ jobId: context.jobId, attempts: 2 })
    );
  });
});
