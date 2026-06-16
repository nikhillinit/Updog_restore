import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CashFlowEvent } from '../../../../shared/schema/lp-reporting-evidence';

const captured = vi.hoisted(() => ({
  setValues: undefined as unknown,
  returnRows: [] as unknown[],
  selectRows: [] as unknown[],
}));
const dbMock = vi.hoisted(() => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({ returning: vi.fn(async () => captured.selectRows) })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => captured.selectRows),
          orderBy: vi.fn(async () => captured.selectRows),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((v: unknown) => {
        captured.setValues = v;
        return { where: vi.fn(() => ({ returning: vi.fn(async () => captured.returnRows) })) };
      }),
    })),
  },
}));
vi.mock('../../../../server/db', () => dbMock);

import {
  createLpCapitalCallEvent,
  loadCashFlowEvent,
  updateLpCapitalCallDraft,
} from '../../../../server/services/lp-reporting/cash-flow-event-service';

const record = (o: Record<string, unknown> = {}) => ({
  id: 10,
  fundId: 1,
  vehicleId: null,
  companyId: null,
  lpId: null,
  eventType: 'lp_capital_call',
  amount: '5.000000',
  currency: 'USD',
  eventDate: new Date('2026-06-15T00:00:00.000Z'),
  perspective: 'lp_net',
  description: null,
  payload: { callNumber: 1 },
  status: 'draft',
  lockedAt: null,
  lockedBy: null,
  supersedesEventId: null,
  reversalOfEventId: null,
  importedFrom: null,
  importBatchId: null,
  sourceHash: null,
  createdBy: null,
  createdAt: new Date('2026-06-15T00:00:00.000Z'),
  updatedAt: new Date('2026-06-15T00:00:00.000Z'),
  rowXmin: '5',
  ...o,
});

function serviceRow(overrides: Record<string, unknown> = {}): CashFlowEvent {
  const { rowXmin, ...row } = record(overrides);
  void rowXmin;
  return row as CashFlowEvent;
}

describe('cash-flow-event-service', () => {
  beforeEach(() => {
    captured.setValues = undefined;
    captured.returnRows = [];
    captured.selectRows = [];
    dbMock.db.insert.mockClear();
    dbMock.db.select.mockClear();
    dbMock.db.update.mockClear();
  });

  it('createLpCapitalCallEvent splits xmin from the inserted row', async () => {
    captured.selectRows = [record()];
    const out = await createLpCapitalCallEvent({
      eventType: 'lp_capital_call',
      fundId: 1,
      amount: '5',
      eventDate: '2026-06-15T00:00:00.000Z',
      perspective: 'lp_net',
      payload: { callNumber: 1 },
    });
    expect(out?.xmin).toBe('5');
    expect(out?.row).not.toHaveProperty('rowXmin');
    expect(out?.row.id).toBe(10);
  });

  it('loadCashFlowEvent splits xmin from the row', async () => {
    captured.selectRows = [record()];
    const out = await loadCashFlowEvent(1, 10);
    expect(out?.xmin).toBe('5');
    expect(out?.row).not.toHaveProperty('rowXmin');
    expect(out?.row.id).toBe(10);
  });

  it('updateLpCapitalCallDraft never writes sourceHash', async () => {
    captured.returnRows = [{ id: 10 }];
    captured.selectRows = [record({ rowXmin: '6' })];
    const out = await updateLpCapitalCallDraft({
      fundId: 1,
      eventId: 10,
      expectedXmin: '5',
      currentRow: serviceRow(),
      patch: { amount: '7' },
    });
    expect(out?.xmin).toBe('6');
    expect(Object.keys(captured.setValues as object)).not.toContain('sourceHash');
    expect(captured.setValues).toMatchObject({ amount: '7' });
  });

  it('returns undefined (no reload) when the atomic update touches zero rows', async () => {
    captured.returnRows = [];
    const out = await updateLpCapitalCallDraft({
      fundId: 1,
      eventId: 10,
      expectedXmin: '5',
      currentRow: serviceRow(),
      patch: { amount: '7' },
    });
    expect(out).toBeUndefined();
    expect(dbMock.db.select).not.toHaveBeenCalled();
  });
});
