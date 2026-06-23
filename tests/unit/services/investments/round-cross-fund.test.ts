import { beforeEach, describe, expect, it, vi } from 'vitest';

const captured = vi.hoisted(() => ({
  limitQueue: [] as unknown[][],
}));

const dbMock = vi.hoisted(() => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => captured.limitQueue.shift() ?? []),
        })),
      })),
    })),
  },
}));

vi.mock('../../../../server/db', () => dbMock);

import {
  loadRound,
  supersedeRoundPreflight,
} from '../../../../server/services/investments/investment-round-service';

type LoadRoundOptions = NonNullable<Parameters<typeof loadRound>[3]>;
type SupersedeRoundPreflightOptions = NonNullable<Parameters<typeof supersedeRoundPreflight>[1]>;

function loadRoundOptions(): LoadRoundOptions {
  return { database: dbMock.db as LoadRoundOptions['database'] };
}

function preflightOptions(): SupersedeRoundPreflightOptions {
  return { database: dbMock.db as SupersedeRoundPreflightOptions['database'] };
}

function roundRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 20,
    investmentId: 11,
    fundId: 1,
    roundName: 'Series A',
    securityType: 'equity',
    roundDate: '2026-06-21',
    currency: 'USD',
    investmentAmount: '1250000.000000',
    roundSize: null,
    preMoneyValuation: null,
    idempotencyKey: 'idem-target',
    requestHash: 'a'.repeat(64),
    supersedesRoundId: null,
    createdBy: 7,
    createdAt: new Date('2026-06-21T12:00:00.000Z'),
    updatedAt: new Date('2026-06-21T12:00:00.000Z'),
    rowXmin: '5',
    ...overrides,
  };
}

describe('investment-round-service cross-fund round guards', () => {
  beforeEach(() => {
    captured.limitQueue = [];
    dbMock.db.select.mockClear();
  });

  it('rejects supersede preflight when the target round belongs to another fund', async () => {
    captured.limitQueue = [[roundRecord({ id: 20, investmentId: 11, fundId: 2 })]];

    await expect(
      supersedeRoundPreflight(
        {
          investmentId: 11,
          fundId: 1,
          supersedesRoundId: 20,
        },
        preflightOptions()
      )
    ).resolves.toEqual({ kind: 'supersede_target_other_fund' });
  });

  it('denies loading a fund-B round while scoped to fund-A', async () => {
    captured.limitQueue = [[roundRecord({ id: 20, investmentId: 11, fundId: 2 })]];

    await expect(loadRound(1, 11, 20, loadRoundOptions())).resolves.toBeUndefined();
  });
});
