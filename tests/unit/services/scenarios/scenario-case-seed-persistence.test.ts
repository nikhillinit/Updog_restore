import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ScenarioCaseSeedV1 } from '../../../../shared/contracts/scenarios/scenario-case-seed-v1.contract';

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    transaction: vi.fn(),
    select: vi.fn(),
  },
}));

vi.mock('../../../../server/db', () => ({ db: mockDb }));

import type { ScenarioCaseSeedPersistenceError } from '../../../../server/services/scenarios/scenario-case-seed-persistence-service';
import { createScenarioCaseFromSeed } from '../../../../server/services/scenarios/scenario-case-seed-persistence-service';

const seed: ScenarioCaseSeedV1 = {
  contractVersion: 'scenario-case-seed-v1',
  fundId: 7,
  companyId: 11,
  asOfDate: '2026-07-13',
  factsInputHash: 'a'.repeat(64),
  trustState: 'LIVE',
  currencyStatus: 'base_currency',
  fields: {
    investment: {
      status: 'seeded',
      value: '125000.123456',
      source: 'facts.initialInvestmentAmount',
    },
    followOns: {
      status: 'seeded',
      value: '50000.654321',
      source: 'facts.followOnInvestmentAmount',
    },
    fmv: {
      status: 'seeded',
      value: '900000.111111',
      source: 'facts.latestPlanningFmvValue',
    },
    exitValuation: {
      status: 'user_required',
      value: null,
      marketReference: '1500000.000000',
    },
    probability: { status: 'user_required', value: null },
    ownershipAtExit: { status: 'user_required', value: null },
  },
  warnings: [],
};

function makeSelectQueue(...rowsByCall: unknown[][]) {
  const pendingRows = [...rowsByCall];
  const select = vi.fn(() => {
    const rows = pendingRows.shift() ?? [];
    const result = Object.assign(Promise.resolve(rows), {
      for: vi.fn().mockResolvedValue(rows),
    });
    const limit = vi.fn(() => result);
    const where = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where }));
    return { from };
  });
  return { select };
}

function makeInsertQueue(...returnRowsByCall: unknown[][]) {
  const pendingRows = [...returnRowsByCall];
  const insertedValues: unknown[] = [];
  const insert = vi.fn(() => ({
    values: vi.fn((values: unknown) => {
      insertedValues.push(values);
      return {
        returning: vi.fn().mockResolvedValue(pendingRows.shift() ?? []),
      };
    }),
  }));
  return { insert, insertedValues };
}

function makeUpdate() {
  const updatedValues: unknown[] = [];
  const where = vi.fn().mockResolvedValue(undefined);
  const update = vi.fn(() => ({
    set: vi.fn((values: unknown) => {
      updatedValues.push(values);
      return { where };
    }),
  }));
  return { update, updatedValues };
}

describe('createScenarioCaseFromSeed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a locked parent before any write', async () => {
    const parentSelect = makeSelectQueue([
      {
        id: '00000000-0000-4000-8000-000000000001',
        companyId: seed.companyId,
        version: 3,
        lockedAt: new Date('2026-07-13T12:00:00.000Z'),
      },
    ]);
    const tx = {
      select: parentSelect.select,
      insert: vi.fn(),
      update: vi.fn(),
    };
    mockDb.transaction.mockImplementation(
      async (operation: (transaction: typeof tx) => Promise<unknown>) => operation(tx)
    );

    const result = createScenarioCaseFromSeed({
      scenarioId: '00000000-0000-4000-8000-000000000001',
      expectedScenarioVersion: 3,
      seed,
      overrides: { caseName: 'Base case', probability: '0.50000000' },
      actor: { userId: 'user-17' },
      idempotencyKey: 'seed-case-1',
    });

    await expect(result).rejects.toMatchObject<Partial<ScenarioCaseSeedPersistenceError>>({
      code: 'scenario_locked',
    });
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });

  it('rejects a stale expected scenario version before any write', async () => {
    const parentSelect = makeSelectQueue([
      {
        id: '00000000-0000-4000-8000-000000000001',
        companyId: seed.companyId,
        version: 4,
        lockedAt: null,
      },
    ]);
    const tx = {
      select: parentSelect.select,
      insert: vi.fn(),
      update: vi.fn(),
    };
    mockDb.transaction.mockImplementation(
      async (operation: (transaction: typeof tx) => Promise<unknown>) => operation(tx)
    );

    const result = createScenarioCaseFromSeed({
      scenarioId: '00000000-0000-4000-8000-000000000001',
      expectedScenarioVersion: 3,
      seed,
      overrides: { caseName: 'Base case', probability: '0.50000000' },
      actor: { userId: 'user-17' },
      idempotencyKey: 'seed-case-1',
    });

    await expect(result).rejects.toMatchObject<Partial<ScenarioCaseSeedPersistenceError>>({
      code: 'version_conflict',
    });
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });

  it('rejects a seed for a different portfolio company before any write', async () => {
    const parentSelect = makeSelectQueue([
      {
        id: '00000000-0000-4000-8000-000000000001',
        companyId: 99,
        version: 3,
        lockedAt: null,
      },
    ]);
    const tx = {
      select: parentSelect.select,
      insert: vi.fn(),
      update: vi.fn(),
    };
    mockDb.transaction.mockImplementation(
      async (operation: (transaction: typeof tx) => Promise<unknown>) => operation(tx)
    );

    const result = createScenarioCaseFromSeed({
      scenarioId: '00000000-0000-4000-8000-000000000001',
      expectedScenarioVersion: 3,
      seed,
      overrides: { caseName: 'Base case', probability: '0.50000000' },
      actor: { userId: 'user-17' },
      idempotencyKey: 'seed-case-1',
    });

    await expect(result).rejects.toMatchObject<Partial<ScenarioCaseSeedPersistenceError>>({
      code: 'company_mismatch',
    });
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });

  it('rejects an unavailable required seed field without a user override', async () => {
    const unavailableInvestmentSeed: ScenarioCaseSeedV1 = {
      ...seed,
      fields: {
        ...seed.fields,
        investment: {
          status: 'unavailable',
          value: null,
          reason: 'source_missing',
        },
      },
    };
    const selectQueue = makeSelectQueue(
      [
        {
          id: '00000000-0000-4000-8000-000000000001',
          companyId: seed.companyId,
          version: 3,
          lockedAt: null,
        },
      ],
      []
    );
    const tx = {
      select: selectQueue.select,
      insert: vi.fn(),
      update: vi.fn(),
    };
    mockDb.transaction.mockImplementation(
      async (operation: (transaction: typeof tx) => Promise<unknown>) => operation(tx)
    );

    const result = createScenarioCaseFromSeed({
      scenarioId: '00000000-0000-4000-8000-000000000001',
      expectedScenarioVersion: 3,
      seed: unavailableInvestmentSeed,
      overrides: { caseName: 'Base case', probability: '0.50000000' },
      actor: { userId: 'user-17' },
      idempotencyKey: 'seed-case-1',
    });

    await expect(result).rejects.toMatchObject<Partial<ScenarioCaseSeedPersistenceError>>({
      code: 'missing_required_override',
    });
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });

  it('returns the existing case for an idempotent retry without writing or bumping version', async () => {
    const existingCase = {
      id: '00000000-0000-4000-8000-000000000010',
      scenarioId: '00000000-0000-4000-8000-000000000001',
      caseName: 'Base case',
      description: null,
      probability: '0.50000000',
      investment: '125000.12',
      followOns: '50000.65',
      exitProceeds: '0.00',
      exitValuation: '0.00',
      monthsToExit: null,
      ownershipAtExit: null,
      fmv: '900000.11',
      createdAt: new Date('2026-07-13T12:00:00.000Z'),
      updatedAt: new Date('2026-07-13T12:00:00.000Z'),
    };
    const existingProvenance = {
      scenarioCaseId: existingCase.id,
      fundId: seed.fundId,
      companyId: seed.companyId,
      idempotencyKey: 'seed-case-1',
      factsInputHash: seed.factsInputHash,
      factsAsOfDate: seed.asOfDate,
      seededAt: new Date('2026-07-13T12:00:00.000Z'),
      trustState: seed.trustState,
      currencyStatus: seed.currencyStatus,
      seededInvestment: '125000.123456',
      seededFollowOns: '50000.654321',
      seededFmv: '900000.111111',
      investmentSource: 'facts.initialInvestmentAmount',
      followOnsSource: 'facts.followOnInvestmentAmount',
      fmvSource: 'facts.latestPlanningFmvValue',
      latestRoundValuationReference: '1500000.000000',
      latestRoundDateReference: null,
    };
    const selectQueue = makeSelectQueue(
      [
        {
          id: existingCase.scenarioId,
          companyId: seed.companyId,
          version: 4,
          lockedAt: null,
        },
      ],
      [existingProvenance],
      [existingCase]
    );
    const tx = {
      select: selectQueue.select,
      insert: vi.fn(),
      update: vi.fn(),
    };
    mockDb.transaction.mockImplementation(
      async (operation: (transaction: typeof tx) => Promise<unknown>) => operation(tx)
    );

    const result = await createScenarioCaseFromSeed({
      scenarioId: existingCase.scenarioId,
      expectedScenarioVersion: 3,
      seed,
      overrides: { caseName: 'Ignored retry body', probability: '0.25000000' },
      actor: { userId: 'user-17' },
      idempotencyKey: 'seed-case-1',
    });

    expect(result).toEqual({
      case: existingCase,
      provenance: existingProvenance,
      replayed: true,
    });
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });

  it('maps seeded, overridden, and user-required values into the case and immutable provenance', async () => {
    const createdCase = {
      id: '00000000-0000-4000-8000-000000000010',
      scenarioId: '00000000-0000-4000-8000-000000000001',
      caseName: 'Upside case',
      description: null,
      probability: '0.30000000',
      investment: '125000.12',
      followOns: '75000.00',
      exitProceeds: '0.00',
      exitValuation: '2000000.00',
      monthsToExit: 36,
      ownershipAtExit: '0.1000',
      fmv: '900000.11',
      createdAt: new Date('2026-07-13T12:00:00.000Z'),
      updatedAt: new Date('2026-07-13T12:00:00.000Z'),
    };
    const createdProvenance = {
      scenarioCaseId: createdCase.id,
      fundId: seed.fundId,
      companyId: seed.companyId,
      idempotencyKey: 'seed-case-2',
      factsInputHash: seed.factsInputHash,
      factsAsOfDate: seed.asOfDate,
      seededAt: new Date('2026-07-13T12:00:00.000Z'),
      trustState: seed.trustState,
      currencyStatus: seed.currencyStatus,
      seededInvestment:
        seed.fields.investment.status === 'seeded' ? seed.fields.investment.value : '',
      seededFollowOns: '75000.000000',
      seededFmv: seed.fields.fmv.status === 'seeded' ? seed.fields.fmv.value : null,
      investmentSource:
        seed.fields.investment.status === 'seeded' ? seed.fields.investment.source : '',
      followOnsSource: 'user_override',
      fmvSource: seed.fields.fmv.status === 'seeded' ? seed.fields.fmv.source : null,
      latestRoundValuationReference: seed.fields.exitValuation.marketReference,
      latestRoundDateReference: null,
    };
    const selectQueue = makeSelectQueue(
      [
        {
          id: createdCase.scenarioId,
          companyId: seed.companyId,
          version: 3,
          lockedAt: null,
        },
      ],
      []
    );
    const insertQueue = makeInsertQueue([createdCase], [createdProvenance], []);
    const update = makeUpdate();
    const tx = {
      select: selectQueue.select,
      insert: insertQueue.insert,
      update: update.update,
    };
    mockDb.transaction.mockImplementation(
      async (operation: (transaction: typeof tx) => Promise<unknown>) => operation(tx)
    );

    const result = await createScenarioCaseFromSeed({
      scenarioId: createdCase.scenarioId,
      expectedScenarioVersion: 3,
      seed,
      overrides: {
        caseName: '  Upside case  ',
        probability: '0.30000000',
        followOns: '75000.000000',
        exitValuation: '2000000.000000',
        monthsToExit: 36,
        ownershipAtExit: '0.1000',
      },
      actor: { userId: 'user-17' },
      idempotencyKey: 'seed-case-2',
    });

    expect(result).toEqual({ case: createdCase, provenance: createdProvenance, replayed: false });
    expect(insertQueue.insertedValues[0]).toMatchObject({
      scenarioId: createdCase.scenarioId,
      caseName: 'Upside case',
      probability: '0.30000000',
      investment: '125000.123456',
      followOns: '75000.000000',
      exitProceeds: '0',
      exitValuation: '2000000.000000',
      monthsToExit: 36,
      ownershipAtExit: '0.1000',
      fmv: '900000.111111',
    });
    expect(insertQueue.insertedValues[1]).toEqual({
      scenarioCaseId: createdCase.id,
      fundId: seed.fundId,
      companyId: seed.companyId,
      idempotencyKey: 'seed-case-2',
      factsInputHash: seed.factsInputHash,
      factsAsOfDate: seed.asOfDate,
      trustState: seed.trustState,
      currencyStatus: seed.currencyStatus,
      seededInvestment: '125000.123456',
      seededFollowOns: '75000.000000',
      seededFmv: '900000.111111',
      investmentSource: 'facts.initialInvestmentAmount',
      followOnsSource: 'user_override',
      fmvSource: 'facts.latestPlanningFmvValue',
      latestRoundValuationReference: '1500000.000000',
      latestRoundDateReference: null,
    });
    expect(update.update).toHaveBeenCalledTimes(1);
    expect(update.updatedValues).toEqual([
      expect.objectContaining({ version: 4, updatedAt: expect.any(Date) }),
    ]);
    expect(insertQueue.insertedValues[2]).toMatchObject({
      userId: 'user-17',
      entityType: 'scenario_case',
      entityId: createdCase.id,
      action: 'CREATE',
    });
  });

  it('re-reads the winning case after a provenance idempotency race', async () => {
    const existingCase = {
      id: '00000000-0000-4000-8000-000000000010',
      scenarioId: '00000000-0000-4000-8000-000000000001',
      caseName: 'Base case',
      description: null,
      probability: '0.50000000',
      investment: '125000.12',
      followOns: '50000.65',
      exitProceeds: '0.00',
      exitValuation: '0.00',
      monthsToExit: null,
      ownershipAtExit: null,
      fmv: '900000.11',
      createdAt: new Date('2026-07-13T12:00:00.000Z'),
      updatedAt: new Date('2026-07-13T12:00:00.000Z'),
    };
    const existingProvenance = {
      scenarioCaseId: existingCase.id,
      fundId: seed.fundId,
      companyId: seed.companyId,
      idempotencyKey: 'seed-case-race',
      factsInputHash: seed.factsInputHash,
      factsAsOfDate: seed.asOfDate,
      seededAt: new Date('2026-07-13T12:00:00.000Z'),
      trustState: seed.trustState,
      currencyStatus: seed.currencyStatus,
      seededInvestment: '125000.123456',
      seededFollowOns: '50000.654321',
      seededFmv: '900000.111111',
      investmentSource: 'facts.initialInvestmentAmount',
      followOnsSource: 'facts.followOnInvestmentAmount',
      fmvSource: 'facts.latestPlanningFmvValue',
      latestRoundValuationReference: '1500000.000000',
      latestRoundDateReference: null,
    };
    const selectQueue = makeSelectQueue([existingProvenance], [existingCase]);
    mockDb.select.mockImplementation(selectQueue.select);
    mockDb.transaction.mockRejectedValue({
      code: '23505',
      constraint: 'scenario_case_seed_provenance_fund_idempotency_key_unique',
    });

    const result = await createScenarioCaseFromSeed({
      scenarioId: existingCase.scenarioId,
      expectedScenarioVersion: 3,
      seed,
      overrides: { caseName: 'Base case', probability: '0.50000000' },
      actor: { userId: 'user-17' },
      idempotencyKey: 'seed-case-race',
    });

    expect(result).toEqual({
      case: existingCase,
      provenance: existingProvenance,
      replayed: true,
    });
  });

  it('rejects an idempotency key that belongs to a different scenario', async () => {
    const existingProvenance = {
      scenarioCaseId: '00000000-0000-4000-8000-000000000099',
      fundId: seed.fundId,
      companyId: seed.companyId,
      idempotencyKey: 'seed-case-cross-scenario',
    };
    const selectQueue = makeSelectQueue(
      [
        {
          id: '00000000-0000-4000-8000-000000000001',
          companyId: seed.companyId,
          version: 4,
          lockedAt: null,
        },
      ],
      [existingProvenance],
      [
        {
          id: existingProvenance.scenarioCaseId,
          scenarioId: '00000000-0000-4000-8000-000000000002',
        },
      ]
    );
    const tx = {
      select: selectQueue.select,
      insert: vi.fn(),
      update: vi.fn(),
    };
    mockDb.transaction.mockImplementation(
      async (operation: (transaction: typeof tx) => Promise<unknown>) => operation(tx)
    );

    const result = createScenarioCaseFromSeed({
      scenarioId: '00000000-0000-4000-8000-000000000001',
      expectedScenarioVersion: 3,
      seed,
      overrides: { caseName: 'Base case', probability: '0.50000000' },
      actor: { userId: 'user-17' },
      idempotencyKey: 'seed-case-cross-scenario',
    });

    await expect(result).rejects.toMatchObject<Partial<ScenarioCaseSeedPersistenceError>>({
      code: 'idempotency_conflict',
    });
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });
});
