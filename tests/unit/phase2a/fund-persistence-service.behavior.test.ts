import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb, mockRunReserveCalculation, mockRunPacingCalculation, mockRunEconomicsCalculation } =
  vi.hoisted(() => ({
    mockDb: {
      query: {
        fundConfigs: {
          findFirst: vi.fn(),
        },
        calcRuns: {
          findFirst: vi.fn(),
        },
        fundSnapshots: {
          findMany: vi.fn(),
        },
      },
      transaction: vi.fn(),
      update: vi.fn(),
    },
    mockRunReserveCalculation: vi.fn(),
    mockRunPacingCalculation: vi.fn(),
    mockRunEconomicsCalculation: vi.fn(),
  }));

vi.mock('../../../server/db', () => ({
  db: mockDb,
}));

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'new-correlation-id'),
}));

vi.mock('../../../server/services/reserve-calculation-service', () => ({
  runReserveCalculation: mockRunReserveCalculation,
}));

vi.mock('../../../server/services/pacing-calculation-service', () => ({
  runPacingCalculation: mockRunPacingCalculation,
}));

vi.mock('../../../server/services/economics-calculation-service', () => ({
  runEconomicsCalculation: mockRunEconomicsCalculation,
}));

import {
  FundPersistenceService,
  ModelInputsAsOfDateRequiredError,
  ReleaseCanaryExecutionIdentityForbiddenError,
  ReleaseCanaryExecutionIdentityInvalidError,
} from '../../../server/services/fund-persistence-service';

function whereResolved(value: unknown) {
  const where = vi.fn().mockResolvedValue(value);
  return {
    set: vi.fn(() => ({ where })),
  };
}

function whereReturning(value: unknown) {
  const returning = vi.fn().mockResolvedValue(value);
  const where = vi.fn(() => ({ returning }));
  return {
    set: vi.fn(() => ({ where })),
  };
}

function valuesResolved(value: unknown) {
  return {
    values: vi.fn().mockResolvedValue(value),
  };
}

function valuesReturning(value: unknown) {
  const returning = vi.fn().mockResolvedValue(value);
  return {
    values: vi.fn(() => ({ returning })),
  };
}

describe('FundPersistenceService creator grant transaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts creator grant between fund creation and draft creation in same transaction', async () => {
    const service = new FundPersistenceService();
    const fund = {
      id: 77,
      name: 'Creator Grant Fund',
      size: '10000000',
      managementFee: '0.02',
      carryPercentage: '0.2',
      vintageYear: 2026,
    };
    const draft = {
      id: 78,
      fundId: 77,
      version: 1,
      config: {},
      isDraft: true,
      isPublished: false,
    };
    const tx = {
      query: {
        users: {
          findFirst: vi.fn().mockResolvedValue({ isReleaseCanaryPrincipal: false }),
        },
      },
      insert: vi
        .fn()
        .mockReturnValueOnce(valuesReturning([fund]))
        .mockReturnValueOnce(valuesResolved(undefined))
        .mockReturnValueOnce(valuesReturning([draft]))
        .mockReturnValueOnce(valuesResolved(undefined)),
    };

    mockDb.transaction.mockImplementation(async (callback: (tx: typeof tx) => Promise<unknown>) =>
      callback(tx)
    );

    const result = await service.createFundWithInitialDraft({
      name: fund.name,
      size: fund.size,
      managementFee: fund.managementFee,
      carryPercentage: fund.carryPercentage,
      vintageYear: fund.vintageYear,
      creatorUserId: 12,
    });

    expect(result.fund.id).toBe(77);
    expect(tx.insert).toHaveBeenCalledTimes(4);
    expect(tx.insert.mock.results[0]?.value.values).toHaveBeenCalledWith(
      expect.objectContaining({ dataOrigin: 'production', canaryRunId: null })
    );
    expect(tx.insert.mock.results[1]?.value.values).toHaveBeenCalledWith({
      userId: 12,
      fundId: 77,
    });
  });

  it('creates a release canary run and marks fund only for canary principals', async () => {
    for (const name of [
      'RELEASE_CANARY_MAX_PORTFOLIO_COMPANY_RESIDUE',
      'RELEASE_CANARY_MAX_FUND_RESIDUE',
      'RELEASE_CANARY_MAX_FUND_CONFIG_RESIDUE',
      'RELEASE_CANARY_MAX_FUND_EVENT_RESIDUE',
      'RELEASE_CANARY_MAX_NOTIFICATION_RESIDUE',
      'RELEASE_CANARY_MAX_GRANT_RESIDUE',
      'RELEASE_CANARY_MAX_CALCULATION_RESIDUE',
      'RELEASE_CANARY_MAX_MUTATION_RECEIPT_RESIDUE',
      'RELEASE_CANARY_MAX_SCENARIO_RESIDUE',
      'RELEASE_CANARY_MAX_REPORTING_RESIDUE',
    ]) {
      vi.stubEnv(name, '15');
    }
    vi.stubEnv('RELEASE_CANARY_MAX_TOTAL_RESIDUE', '150');
    vi.stubEnv('RELEASE_CANARY_TTL_HOURS', '24');

    try {
      const service = new FundPersistenceService();
      const fund = {
        id: 88,
        name: 'Canary Fund',
        size: '1000000',
        managementFee: '0.02',
        carryPercentage: '0.2',
        vintageYear: 2026,
      };
      const draft = {
        id: 89,
        fundId: 88,
        version: 1,
        config: {},
        isDraft: true,
        isPublished: false,
      };
      const tx = {
        execute: vi
          .fn()
          .mockResolvedValueOnce({ rows: [], rowCount: 1 })
          .mockResolvedValueOnce({ rows: [{ count: 0 }], rowCount: 1 })
          .mockResolvedValueOnce({ rows: [], rowCount: 0 })
          .mockResolvedValueOnce({
            rows: [
              {
                portfolioCompany: 0,
                fund: 0,
                fundConfig: 0,
                fundEvent: 0,
                notification: 0,
                grant: 0,
                calculation: 0,
                mutationReceipt: 0,
                scenario: 0,
                reporting: 0,
              },
            ],
            rowCount: 1,
          })
          .mockResolvedValueOnce({
            rows: [
              {
                portfolioCompany: 0,
                fund: 1,
                fundConfig: 1,
                fundEvent: 1,
                notification: 0,
                grant: 1,
                calculation: 0,
                mutationReceipt: 0,
                scenario: 0,
                reporting: 0,
              },
            ],
            rowCount: 1,
          })
          .mockResolvedValueOnce({ rows: [], rowCount: 1 }),
        query: {
          users: {
            findFirst: vi.fn().mockResolvedValue({ isReleaseCanaryPrincipal: true }),
          },
        },
        insert: vi
          .fn()
      .mockReturnValueOnce(valuesReturning([{ id: 'canary-run-id', version: 1 }]))
          .mockReturnValueOnce(valuesReturning([fund]))
          .mockReturnValueOnce(valuesResolved(undefined))
          .mockReturnValueOnce(valuesReturning([draft]))
          .mockReturnValueOnce(valuesResolved(undefined)),
      };

      mockDb.transaction.mockImplementation(async (callback: (tx: typeof tx) => Promise<unknown>) =>
        callback(tx)
      );

      const result = await service.createFundWithInitialDraft({
        name: fund.name,
        size: fund.size,
        managementFee: fund.managementFee,
        carryPercentage: fund.carryPercentage,
        vintageYear: fund.vintageYear,
        creatorUserId: 19,
      });

      expect(result.fund.id).toBe(88);
      expect(tx.insert).toHaveBeenCalledTimes(5);
      expect(tx.insert.mock.results[0]?.value.values).toHaveBeenCalledWith(
        expect.objectContaining({
          principalUserId: 19,
          status: 'created',
          releaseVersion: expect.any(String),
          releaseSha: expect.any(String),
          expiresAt: expect.any(Date),
          workflowRunId: null,
          workflowRunAttempt: null,
        })
      );
      expect(tx.insert.mock.results[1]?.value.values).toHaveBeenCalledWith(
        expect.objectContaining({ dataOrigin: 'release_canary', canaryRunId: 'canary-run-id' })
      );
    expect(tx.execute).toHaveBeenCalledTimes(5);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe('FundPersistenceService canary workflow execution identity', () => {
  const CANARY_POLICY_ENV: Record<string, string> = {
    RELEASE_CANARY_MAX_PORTFOLIO_COMPANY_RESIDUE: '15',
    RELEASE_CANARY_MAX_FUND_RESIDUE: '15',
    RELEASE_CANARY_MAX_FUND_CONFIG_RESIDUE: '15',
    RELEASE_CANARY_MAX_FUND_EVENT_RESIDUE: '15',
    RELEASE_CANARY_MAX_NOTIFICATION_RESIDUE: '15',
    RELEASE_CANARY_MAX_GRANT_RESIDUE: '15',
    RELEASE_CANARY_MAX_CALCULATION_RESIDUE: '15',
    RELEASE_CANARY_MAX_MUTATION_RECEIPT_RESIDUE: '15',
    RELEASE_CANARY_MAX_SCENARIO_RESIDUE: '15',
    RELEASE_CANARY_MAX_REPORTING_RESIDUE: '15',
    RELEASE_CANARY_MAX_TOTAL_RESIDUE: '150',
    RELEASE_CANARY_TTL_HOURS: '24',
  };

  function stubCanaryPolicyEnv(): void {
    for (const [name, value] of Object.entries(CANARY_POLICY_ENV)) {
      vi.stubEnv(name, value);
    }
  }

  const emptyResidueRow = {
    portfolioCompany: 0,
    fund: 0,
    fundConfig: 0,
    fundEvent: 0,
    notification: 0,
    grant: 0,
    calculation: 0,
    mutationReceipt: 0,
    scenario: 0,
    reporting: 0,
  };

  function canaryTx(isReleaseCanaryPrincipal: boolean) {
    return {
      execute: vi
        .fn()
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ count: 0 }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [emptyResidueRow], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [{ ...emptyResidueRow, fund: 1, fundConfig: 1, fundEvent: 1, grant: 1 }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }),
      query: {
        users: {
          findFirst: vi.fn().mockResolvedValue({ isReleaseCanaryPrincipal }),
        },
      },
      insert: vi
        .fn()
        .mockReturnValueOnce(valuesReturning([{ id: 'canary-run-id', version: 1 }]))
        .mockReturnValueOnce(
          valuesReturning([
            {
              id: 88,
              name: 'Canary Fund',
              size: '1000000',
              managementFee: '0.02',
              carryPercentage: '0.2',
              vintageYear: 2026,
            },
          ])
        )
        .mockReturnValueOnce(valuesResolved(undefined))
        .mockReturnValueOnce(
          valuesReturning([
            { id: 89, fundId: 88, version: 1, config: {}, isDraft: true, isPublished: false },
          ])
        )
        .mockReturnValueOnce(valuesResolved(undefined)),
    };
  }

  function createWithIdentity(
    tx: ReturnType<typeof canaryTx>,
    canaryExecutionIdentity?: { workflowRunId?: string; workflowRunAttempt?: string }
  ) {
    mockDb.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(tx)
    );
    const service = new FundPersistenceService();
    return service.createFundWithInitialDraft({
      name: 'Canary Fund',
      size: '1000000',
      managementFee: '0.02',
      carryPercentage: '0.2',
      vintageYear: 2026,
      creatorUserId: 19,
      ...(canaryExecutionIdentity !== undefined && { canaryExecutionIdentity }),
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    stubCanaryPolicyEnv();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects either identity header from an ordinary principal before any write', async () => {
    for (const identity of [
      { workflowRunId: '123456' },
      { workflowRunAttempt: '1' },
      { workflowRunId: '123456', workflowRunAttempt: '1' },
      // 403 precedence holds even for a fully malformed pair.
      { workflowRunId: 'abc', workflowRunAttempt: '0' },
    ]) {
      const tx = canaryTx(false);
      await expect(createWithIdentity(tx, identity)).rejects.toBeInstanceOf(
        ReleaseCanaryExecutionIdentityForbiddenError
      );
      expect(tx.insert).not.toHaveBeenCalled();
      expect(tx.execute).not.toHaveBeenCalled();
    }
  });

  it('rejects a half-provided or malformed identity pair before any write', async () => {
    for (const identity of [
      { workflowRunId: '123456' },
      { workflowRunAttempt: '1' },
      { workflowRunId: '0123', workflowRunAttempt: '1' },
      { workflowRunId: 'abc', workflowRunAttempt: '1' },
      { workflowRunId: '123456', workflowRunAttempt: '0' },
      { workflowRunId: '123456', workflowRunAttempt: '-1' },
      { workflowRunId: '123456', workflowRunAttempt: '1.5' },
      { workflowRunId: '', workflowRunAttempt: '1' },
    ]) {
      const tx = canaryTx(true);
      await expect(createWithIdentity(tx, identity)).rejects.toBeInstanceOf(
        ReleaseCanaryExecutionIdentityInvalidError
      );
      expect(tx.insert).not.toHaveBeenCalled();
      expect(tx.execute).not.toHaveBeenCalled();
    }
  });

  it('requires the exact pair for canary creation in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const tx = canaryTx(true);
    await expect(createWithIdentity(tx)).rejects.toBeInstanceOf(
      ReleaseCanaryExecutionIdentityInvalidError
    );
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.execute).not.toHaveBeenCalled();
  });

  it('persists the exact workflow execution pair on the canary run insert', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const tx = canaryTx(true);
    const result = await createWithIdentity(tx, {
      workflowRunId: '17178572726',
      workflowRunAttempt: '3',
    });

    expect(result.fund.id).toBe(88);
    expect(tx.insert.mock.results[0]?.value.values).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowRunId: '17178572726',
        workflowRunAttempt: 3,
        principalUserId: 19,
        status: 'created',
      })
    );
  });

  it('accepts an omitted pair outside production and stores a null identity', async () => {
    const tx = canaryTx(true);
    await createWithIdentity(tx);
    expect(tx.insert.mock.results[0]?.value.values).toHaveBeenCalledWith(
      expect.objectContaining({ workflowRunId: null, workflowRunAttempt: null })
    );
  });

  it('persists a valid pair supplied outside production', async () => {
    const tx = canaryTx(true);
    await createWithIdentity(tx, { workflowRunId: '424242', workflowRunAttempt: '2' });
    expect(tx.insert.mock.results[0]?.value.values).toHaveBeenCalledWith(
      expect.objectContaining({ workflowRunId: '424242', workflowRunAttempt: 2 })
    );
  });
});

describe('FundPersistenceService publishDraft behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunReserveCalculation.mockResolvedValue({ snapshotId: 501 });
    mockRunPacingCalculation.mockResolvedValue({ snapshotId: 502 });
    mockRunEconomicsCalculation.mockResolvedValue({ snapshotId: 503 });
  });

  afterEach(() => {
    delete process.env['ENABLE_GP_ECONOMICS_ENGINE'];
  });

  it('rejects a direct publish before mutation when the owner date is absent', async () => {
    const service = new FundPersistenceService();
    const tx = {
      query: {
        fundConfigs: {
          findFirst: vi.fn().mockResolvedValue({
            id: 10,
            fundId: 1,
            version: 2,
            config: { fundSize: 50_000_000 },
          }),
        },
      },
      update: vi.fn(),
      insert: vi.fn(),
    };
    mockDb.transaction.mockImplementation(async (callback: (tx: typeof tx) => Promise<unknown>) =>
      callback(tx)
    );

    await expect(
      service.publishDraft(1, { reserve: null, pacing: null, cohort: null }, 99)
    ).rejects.toBeInstanceOf(ModelInputsAsOfDateRequiredError);
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('runs reserve and pacing inline without claiming experimental cohort work', async () => {
    const service = new FundPersistenceService();
    const draft = {
      id: 11,
      fundId: 1,
      version: 3,
      config: { fundSize: 125_000_000, modelInputsAsOfDate: '2026-06-30' },
    };
    const published = {
      id: 11,
      fundId: 1,
      version: 3,
      config: { fundSize: 125_000_000, modelInputsAsOfDate: '2026-06-30' },
      isDraft: false,
      isPublished: true,
    };
    const pendingRun = {
      id: 44,
      fundId: 1,
      configId: 11,
      configVersion: 3,
      correlationId: 'new-correlation-id',
      engines: ['reserve', 'pacing'],
      dispatchState: 'pending',
      requestedAt: new Date('2026-03-22T10:00:00.000Z'),
      lastError: null,
    };
    const dispatchedRun = {
      ...pendingRun,
      dispatchState: 'dispatched',
      dispatchedAt: new Date('2026-03-22T10:00:01.000Z'),
      lastError: null,
    };

    const tx = {
      query: {
        fundConfigs: {
          findFirst: vi.fn().mockResolvedValue(draft),
        },
      },
      update: vi
        .fn()
        .mockReturnValueOnce(whereResolved(undefined))
        .mockReturnValueOnce(whereReturning([published])),
      insert: vi
        .fn()
        .mockReturnValueOnce(valuesReturning([pendingRun]))
        .mockReturnValueOnce(valuesResolved(undefined))
        .mockReturnValueOnce(valuesResolved(undefined)),
    };

    mockDb.transaction.mockImplementation(async (callback: (tx: typeof tx) => Promise<unknown>) =>
      callback(tx)
    );
    mockDb.update.mockReturnValue(whereReturning([dispatchedRun]));

    const result = await service.publishDraft(1, { reserve: null, pacing: null, cohort: null }, 99);

    expect(result.run.dispatchState).toBe('dispatched');
    expect(result.run.lastError).toBeNull();
    expect(mockRunReserveCalculation).toHaveBeenCalledTimes(1);
    expect(mockRunPacingCalculation).toHaveBeenCalledTimes(1);
    const runValues = tx.insert.mock.results[0]?.value.values.mock.calls[0]?.[0];
    expect(runValues).toMatchObject({
      modelInputsAsOfDate: '2026-06-30',
      comparisonLineageVersion: 'comparison-lineage-v1',
      engines: ['reserve', 'pacing'],
    });
  });

  it('runs experimental economics inline when the flag and assumptions are present', async () => {
    process.env['ENABLE_GP_ECONOMICS_ENGINE'] = 'true';
    const service = new FundPersistenceService();
    const config = {
      fundName: 'Economics Fund',
      fundSize: 125_000_000,
      modelInputsAsOfDate: '2026-06-30',
      economicsAssumptions: { version: 'v1' },
    };
    const draft = {
      id: 12,
      fundId: 1,
      version: 4,
      config,
    };
    const published = {
      id: 12,
      fundId: 1,
      version: 4,
      config,
      isDraft: false,
      isPublished: true,
    };
    const pendingRun = {
      id: 45,
      fundId: 1,
      configId: 12,
      configVersion: 4,
      correlationId: 'new-correlation-id',
      engines: ['reserve', 'pacing', 'economics'],
      dispatchState: 'pending',
      requestedAt: new Date('2026-03-22T10:00:00.000Z'),
      lastError: null,
    };
    const dispatchedRun = {
      ...pendingRun,
      dispatchState: 'dispatched',
      dispatchedAt: new Date('2026-03-22T10:00:01.000Z'),
      lastError: null,
    };

    const tx = {
      query: {
        fundConfigs: {
          findFirst: vi.fn().mockResolvedValue(draft),
        },
      },
      update: vi
        .fn()
        .mockReturnValueOnce(whereResolved(undefined))
        .mockReturnValueOnce(whereReturning([published])),
      insert: vi
        .fn()
        .mockReturnValueOnce(valuesReturning([pendingRun]))
        .mockReturnValueOnce(valuesResolved(undefined))
        .mockReturnValueOnce(valuesResolved(undefined)),
    };

    mockDb.transaction.mockImplementation(async (callback: (tx: typeof tx) => Promise<unknown>) =>
      callback(tx)
    );
    mockDb.update.mockReturnValue(whereReturning([dispatchedRun]));

    const result = await service.publishDraft(
      1,
      { reserve: null, pacing: null, cohort: null, economics: null },
      99
    );

    expect(result.run.dispatchState).toBe('dispatched');
    expect(mockRunReserveCalculation).toHaveBeenCalledTimes(1);
    expect(mockRunPacingCalculation).toHaveBeenCalledTimes(1);
    expect(mockRunEconomicsCalculation).toHaveBeenCalledTimes(1);
    expect(mockRunEconomicsCalculation).toHaveBeenCalledWith(
      expect.objectContaining({
        fundId: 1,
        runId: 45,
        configId: 12,
        configVersion: 4,
      })
    );
  });

  it('re-dispatches partial runs using only missing authoritative engines', async () => {
    const service = new FundPersistenceService();
    const published = {
      id: 21,
      fundId: 1,
      version: 4,
      config: { fundSize: 90_000_000, modelInputsAsOfDate: '2026-06-30' },
      isDraft: false,
      isPublished: true,
    };
    const partialRun = {
      id: 77,
      fundId: 1,
      configId: 21,
      configVersion: 4,
      correlationId: 'existing-correlation-id',
      engines: ['reserve', 'pacing', 'cohort'],
      dispatchState: 'partial',
      requestedAt: new Date('2026-03-22T10:15:00.000Z'),
      lastError: 'Inline pacing calculation failed: timeout',
    };
    const redispatchedRun = {
      ...partialRun,
      dispatchState: 'dispatched',
      dispatchedAt: new Date('2026-03-22T10:15:10.000Z'),
      lastError: null,
    };

    const tx = {
      query: {
        fundConfigs: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
    };

    const pacingQueue = {
      add: vi.fn().mockResolvedValue({ id: 'run:77:pacing' }),
    };
    const reserveQueue = {
      add: vi.fn(),
    };
    const cohortQueue = {
      add: vi.fn(),
    };

    mockDb.transaction.mockImplementation(async (callback: (tx: typeof tx) => Promise<unknown>) =>
      callback(tx)
    );
    mockDb.query.fundConfigs.findFirst.mockResolvedValue(published);
    mockDb.query.calcRuns.findFirst.mockResolvedValue(partialRun);
    mockDb.query.fundSnapshots.findMany.mockResolvedValue([{ type: 'RESERVE' }]);
    mockDb.update.mockReturnValue(whereReturning([redispatchedRun]));

    const result = await service.publishDraft(
      1,
      {
        reserve: reserveQueue as any,
        pacing: pacingQueue as any,
        cohort: cohortQueue as any,
      },
      99
    );

    expect(result.correlationId).toBe('existing-correlation-id');
    expect(pacingQueue.add).toHaveBeenCalledTimes(1);
    expect(reserveQueue.add).not.toHaveBeenCalled();
    expect(cohortQueue.add).not.toHaveBeenCalled();
    expect(mockRunReserveCalculation).not.toHaveBeenCalled();
    expect(mockRunPacingCalculation).not.toHaveBeenCalled();
  });

  it('reuses the published run when a concurrent request already consumed the draft', async () => {
    const service = new FundPersistenceService();
    const draft = {
      id: 31,
      fundId: 1,
      version: 5,
      config: { fundSize: 110_000_000, modelInputsAsOfDate: '2026-06-30' },
    };
    const published = {
      id: 31,
      fundId: 1,
      version: 5,
      config: { fundSize: 110_000_000, modelInputsAsOfDate: '2026-06-30' },
      isDraft: false,
      isPublished: true,
    };
    const existingRun = {
      id: 88,
      fundId: 1,
      configId: 31,
      configVersion: 5,
      correlationId: 'winner-correlation-id',
      engines: ['reserve', 'pacing', 'cohort'],
      dispatchState: 'dispatched',
      requestedAt: new Date('2026-03-22T10:30:00.000Z'),
      lastError: null,
    };

    const txInsert = vi.fn();
    const tx = {
      query: {
        fundConfigs: {
          findFirst: vi.fn().mockResolvedValue(draft),
        },
      },
      update: vi
        .fn()
        .mockReturnValueOnce(whereResolved(undefined))
        .mockReturnValueOnce(whereReturning([])),
      insert: txInsert,
    };

    mockDb.transaction.mockImplementation(async (callback: (tx: typeof tx) => Promise<unknown>) =>
      callback(tx)
    );
    mockDb.query.fundConfigs.findFirst.mockResolvedValue(published);
    mockDb.query.calcRuns.findFirst.mockResolvedValue(existingRun);

    const result = await service.publishDraft(1, { reserve: null, pacing: null, cohort: null }, 99);

    expect(result.correlationId).toBe('winner-correlation-id');
    expect(result.run.id).toBe(existingRun.id);
    expect(txInsert).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(mockRunReserveCalculation).not.toHaveBeenCalled();
    expect(mockRunPacingCalculation).not.toHaveBeenCalled();
  });
});
