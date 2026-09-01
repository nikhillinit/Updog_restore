import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../server/db', () => ({ db: {} }));

import { recordOutcome } from '../../../../server/services/operating-objects/decision-service';

const captured = {
  loadQueue: [] as unknown[][],
  updateResult: [] as unknown[],
};

const select = vi.fn(() => ({
  from: vi.fn(() => ({
    where: vi.fn(() => ({
      limit: vi.fn(async () => captured.loadQueue.shift() ?? []),
    })),
  })),
}));

const update = vi.fn(() => ({
  set: vi.fn(() => ({
    where: vi.fn(() => ({
      returning: vi.fn(async () => captured.updateResult),
    })),
  })),
}));

const database = { select, update } as never;

const record = (overrides: Record<string, unknown> = {}) => ({
  id: 7,
  fundId: 1,
  title: 'Extend runway',
  recommendation: 'Reduce deployment pace.',
  status: 'accepted',
  supersedesDecisionId: null,
  outcome: null,
  outcomeRecordedAt: null,
  outcomeRecordedBy: null,
  followUpOwnerId: null,
  followUpDate: null,
  idempotencyKey: null,
  requestHash: null,
  createdBy: 3,
  createdAt: new Date('2026-09-01T12:00:00.000Z'),
  updatedAt: new Date('2026-09-01T12:00:00.000Z'),
  rowXmin: '5',
  ...overrides,
});

const input = (overrides: Record<string, unknown> = {}) => ({
  fundId: 1,
  decisionId: 7,
  expectedXmin: '5',
  outcome: 'validated',
  actorId: 11,
  ...overrides,
});

describe('decision-service recordOutcome', () => {
  beforeEach(() => {
    captured.loadQueue = [];
    captured.updateResult = [];
    select.mockClear();
    update.mockClear();
  });

  it('requires an actor before checking for a replay', async () => {
    captured.loadQueue = [
      [
        record({
          outcome: 'validated',
          outcomeRecordedAt: new Date('2026-09-01T12:05:00.000Z'),
          outcomeRecordedBy: 11,
        }),
      ],
    ];

    await expect(recordOutcome(input({ actorId: null }), { database })).rejects.toMatchObject({
      status: 403,
      code: 'ACTOR_REQUIRED',
    });
    expect(select).not.toHaveBeenCalled();
  });

  it('replays an identical outcome by the same actor before checking stale xmin', async () => {
    captured.loadQueue = [
      [
        record({
          rowXmin: '9',
          outcome: 'validated',
          outcomeRecordedAt: new Date('2026-09-01T12:05:00.000Z'),
          outcomeRecordedBy: 11,
        }),
      ],
    ];

    const result = await recordOutcome(input({ expectedXmin: '5' }), { database });

    expect(result.xmin).toBe('9');
    expect(update).not.toHaveBeenCalled();
  });

  it('returns 409 for a different recorded outcome before checking stale xmin', async () => {
    captured.loadQueue = [
      [
        record({
          rowXmin: '9',
          outcome: 'not validated',
          outcomeRecordedAt: new Date('2026-09-01T12:05:00.000Z'),
          outcomeRecordedBy: 11,
        }),
      ],
    ];

    await expect(recordOutcome(input(), { database })).rejects.toMatchObject({
      status: 409,
      code: 'DECISION_OUTCOME_ALREADY_RECORDED',
    });
  });

  it('returns 409 for a different recording actor before checking stale xmin', async () => {
    captured.loadQueue = [
      [
        record({
          rowXmin: '9',
          outcome: 'validated',
          outcomeRecordedAt: new Date('2026-09-01T12:05:00.000Z'),
          outcomeRecordedBy: 12,
        }),
      ],
    ];

    await expect(recordOutcome(input(), { database })).rejects.toMatchObject({
      status: 409,
      code: 'DECISION_OUTCOME_ALREADY_RECORDED',
    });
  });

  it('returns 412 when an untouched decision has stale xmin', async () => {
    captured.loadQueue = [[record({ rowXmin: '9' })]];

    await expect(recordOutcome(input(), { database })).rejects.toMatchObject({
      status: 412,
      code: 'PRECONDITION_FAILED',
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('replays an identical outcome after a zero-row CAS race', async () => {
    captured.updateResult = [];
    captured.loadQueue = [
      [record()],
      [
        record({
          rowXmin: '6',
          outcome: 'validated',
          outcomeRecordedAt: new Date('2026-09-01T12:05:00.000Z'),
          outcomeRecordedBy: 11,
        }),
      ],
    ];

    const result = await recordOutcome(input(), { database });

    expect(result.xmin).toBe('6');
  });

  it('returns 409 for a conflicting outcome after a zero-row CAS race', async () => {
    captured.updateResult = [];
    captured.loadQueue = [
      [record()],
      [
        record({
          rowXmin: '6',
          outcome: 'not validated',
          outcomeRecordedAt: new Date('2026-09-01T12:05:00.000Z'),
          outcomeRecordedBy: 11,
        }),
      ],
    ];

    await expect(recordOutcome(input(), { database })).rejects.toMatchObject({
      status: 409,
      code: 'DECISION_OUTCOME_ALREADY_RECORDED',
    });
  });

  it('returns 409 for a conflicting actor after a zero-row CAS race', async () => {
    captured.updateResult = [];
    captured.loadQueue = [
      [record()],
      [
        record({
          rowXmin: '6',
          outcome: 'validated',
          outcomeRecordedAt: new Date('2026-09-01T12:05:00.000Z'),
          outcomeRecordedBy: 12,
        }),
      ],
    ];

    await expect(recordOutcome(input(), { database })).rejects.toMatchObject({
      status: 409,
      code: 'DECISION_OUTCOME_ALREADY_RECORDED',
    });
  });

  it('returns 412 for an untouched stale row after a zero-row CAS race', async () => {
    captured.updateResult = [];
    captured.loadQueue = [[record()], [record({ rowXmin: '6' })]];

    await expect(recordOutcome(input(), { database })).rejects.toMatchObject({
      status: 412,
      code: 'PRECONDITION_FAILED',
    });
  });
});
