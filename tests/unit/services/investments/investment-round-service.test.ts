import { beforeEach, describe, expect, it, vi } from 'vitest';

const captured = vi.hoisted(() => ({
  insertedValues: undefined as Record<string, unknown> | undefined,
  conflictConfig: undefined as unknown,
  insertRows: [] as unknown[],
  insertError: undefined as unknown,
  limitQueue: [] as unknown[][],
}));

const dbMock = vi.hoisted(() => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn((values: Record<string, unknown>) => {
        captured.insertedValues = values;
        return {
          onConflictDoNothing: vi.fn((config: unknown) => {
            captured.conflictConfig = config;
            return {
              returning: vi.fn(async () => {
                if (captured.insertError) throw captured.insertError;
                return captured.insertRows;
              }),
            };
          }),
        };
      }),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () =>
            captured.limitQueue.length > 0 ? captured.limitQueue.shift() : []
          ),
          orderBy: vi.fn(async () =>
            captured.limitQueue.length > 0 ? captured.limitQueue.shift() : []
          ),
        })),
      })),
    })),
  },
}));

vi.mock('../../../../server/db', () => dbMock);

import { canonicalSha256 } from '@shared/lib/canonical-hash';
import { createRound } from '../../../../server/services/investments/investment-round-service';

type CreateRoundInput = Parameters<typeof createRound>[0];
type CreateRoundOptions = NonNullable<Parameters<typeof createRound>[1]>;

function serviceOptions(): CreateRoundOptions {
  return { database: dbMock.db as CreateRoundOptions['database'] };
}

function baseInput(overrides: Partial<CreateRoundInput> = {}): CreateRoundInput {
  return {
    investmentId: 11,
    fundId: 1,
    roundName: 'Series A',
    securityType: 'equity',
    roundDate: '2026-06-21',
    currency: 'USD',
    investmentAmount: '1250000.000000',
    idempotencyKey: 'idem-1',
    createdBy: 7,
    ...overrides,
  };
}

function expectedRequestHash(input: CreateRoundInput): string {
  return canonicalSha256({
    investmentId: input.investmentId,
    fundId: input.fundId,
    roundName: input.roundName,
    securityType: input.securityType,
    roundDate: input.roundDate,
    currency: input.currency,
    investmentAmount: input.investmentAmount,
    roundSize: input.roundSize,
    preMoneyValuation: input.preMoneyValuation,
    supersedesRoundId: input.supersedesRoundId,
  });
}

function roundRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const input = baseInput();
  return {
    id: 10,
    investmentId: input.investmentId,
    fundId: input.fundId,
    roundName: input.roundName,
    securityType: input.securityType,
    roundDate: input.roundDate,
    currency: input.currency,
    investmentAmount: input.investmentAmount,
    roundSize: null,
    preMoneyValuation: null,
    idempotencyKey: input.idempotencyKey,
    requestHash: expectedRequestHash(input),
    supersedesRoundId: null,
    createdBy: input.createdBy,
    createdAt: new Date('2026-06-21T12:00:00.000Z'),
    updatedAt: new Date('2026-06-21T12:00:00.000Z'),
    rowXmin: '5',
    ...overrides,
  };
}

describe('investment-round-service', () => {
  beforeEach(() => {
    captured.insertedValues = undefined;
    captured.conflictConfig = undefined;
    captured.insertRows = [];
    captured.insertError = undefined;
    captured.limitQueue = [];
    dbMock.db.insert.mockClear();
    dbMock.db.select.mockClear();
  });

  it('returns created with row/xmin and writes the canonical request hash', async () => {
    const input = baseInput();
    const requestHash = expectedRequestHash(input);
    captured.insertRows = [roundRecord({ requestHash })];

    const out = await createRound(input, serviceOptions());

    expect(out.kind).toBe('created');
    if (out.kind !== 'created') throw new Error('Expected created result');
    expect(out.xmin).toBe('5');
    expect(out.row).not.toHaveProperty('rowXmin');
    expect(captured.insertedValues).toMatchObject({
      investmentId: 11,
      fundId: 1,
      idempotencyKey: 'idem-1',
      requestHash,
      roundSize: null,
      preMoneyValuation: null,
      supersedesRoundId: null,
      createdBy: 7,
    });
    expect(captured.conflictConfig).toBeDefined();
  });

  it('returns replayed when an idempotency conflict has the same request hash', async () => {
    const input = baseInput();
    captured.insertRows = [];
    captured.limitQueue = [
      [roundRecord({ requestHash: expectedRequestHash(input), rowXmin: '9' })],
    ];

    const out = await createRound(input, serviceOptions());

    expect(out.kind).toBe('replayed');
    if (out.kind !== 'replayed') throw new Error('Expected replayed result');
    expect(out.xmin).toBe('9');
    expect(out.row.id).toBe(10);
  });

  it('returns key_reused when an idempotency conflict has a different request hash', async () => {
    captured.insertRows = [];
    captured.limitQueue = [[roundRecord({ requestHash: '0'.repeat(64) })]];

    await expect(createRound(baseInput(), serviceOptions())).resolves.toEqual({
      kind: 'key_reused',
    });
  });

  it('creates a superseding round when the target exists and is current', async () => {
    const input = baseInput({ idempotencyKey: 'idem-2', supersedesRoundId: 20 });
    captured.limitQueue = [[roundRecord({ id: 20 })], []];
    captured.insertRows = [
      roundRecord({
        id: 21,
        idempotencyKey: 'idem-2',
        requestHash: expectedRequestHash(input),
        supersedesRoundId: 20,
      }),
    ];

    const out = await createRound(input, serviceOptions());

    expect(out.kind).toBe('created');
    if (out.kind !== 'created') throw new Error('Expected created result');
    expect(out.row.id).toBe(21);
    expect(captured.insertedValues).toMatchObject({ supersedesRoundId: 20 });
  });

  it('returns already_superseded when a row already references the target', async () => {
    captured.limitQueue = [
      [roundRecord({ id: 20 })],
      [roundRecord({ id: 21, supersedesRoundId: 20 })],
    ];

    await expect(
      createRound(baseInput({ supersedesRoundId: 20 }), serviceOptions())
    ).resolves.toEqual({
      kind: 'already_superseded',
    });
    expect(dbMock.db.insert).not.toHaveBeenCalled();
  });

  it('returns already_superseded for the concurrent supersedes unique violation', async () => {
    captured.limitQueue = [[roundRecord({ id: 20 })], []];
    captured.insertError = Object.assign(
      new Error('duplicate key value violates unique constraint "investment_rounds_supersedes_uq"'),
      { code: '23505', constraint: 'investment_rounds_supersedes_uq' }
    );

    await expect(
      createRound(baseInput({ supersedesRoundId: 20 }), serviceOptions())
    ).resolves.toEqual({
      kind: 'already_superseded',
    });
  });

  it('returns supersede_target_missing when the target row is absent', async () => {
    captured.limitQueue = [[]];

    await expect(
      createRound(baseInput({ supersedesRoundId: 999 }), serviceOptions())
    ).resolves.toEqual({
      kind: 'supersede_target_missing',
    });
    expect(dbMock.db.insert).not.toHaveBeenCalled();
  });

  it('returns supersede_target_other_investment when the target belongs elsewhere', async () => {
    captured.limitQueue = [[roundRecord({ id: 20, investmentId: 999 })]];

    await expect(
      createRound(baseInput({ supersedesRoundId: 20 }), serviceOptions())
    ).resolves.toEqual({
      kind: 'supersede_target_other_investment',
    });
    expect(dbMock.db.insert).not.toHaveBeenCalled();
  });
});
