import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockDb = vi.hoisted(() => ({
  query: {
    fundSnapshots: {
      findMany: vi.fn(),
    },
    calcRuns: {
      findFirst: vi.fn(),
    },
  },
  update: vi.fn(),
}));

vi.mock('../../../server/db', () => ({
  db: mockDb,
}));

vi.mock('../../../server/lib/logger', () => ({
  logger: {
    child: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
  },
}));

import {
  isFinalAttempt,
  markCalcRunCompletedIfReady,
  markCalcRunFailed,
  registerCalcRunCompletedHandler,
  resetCompletionHandlers,
} from '../../../server/services/calc-run-tracking';

function updateWhereResolved() {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn(() => ({ where }));
  return { set, where };
}

function updateWhereReturningResolved(
  rows: Array<{ id: number; fundId: number; configId: number; configVersion: number }> = [
    { id: 1, fundId: 10, configId: 20, configVersion: 3 },
  ]
) {
  const returning = vi.fn().mockResolvedValue(rows);
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where }));
  return { set, where, returning };
}

describe('calc run tracking helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCompletionHandlers();
  });

  afterEach(() => {
    resetCompletionHandlers();
  });

  it('marks calc runs failed with the terminal error', async () => {
    const updateChain = updateWhereResolved();
    mockDb.update.mockReturnValue(updateChain);

    await markCalcRunFailed(17, 'Worker crashed');

    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        dispatchState: 'failed',
        lastError: 'Worker crashed',
        failedAt: expect.any(Date),
      })
    );
    expect(updateChain.where).toHaveBeenCalledTimes(1);
  });

  it('does not mark calc runs completed without full authoritative coverage', async () => {
    mockDb.query.fundSnapshots.findMany.mockResolvedValue([{ type: 'RESERVE' }]);

    await markCalcRunCompletedIfReady(18);

    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it('marks calc runs completed when both authoritative snapshots exist', async () => {
    const updateChain = updateWhereReturningResolved();
    mockDb.query.fundSnapshots.findMany.mockResolvedValue([
      { type: 'RESERVE' },
      { type: 'PACING' },
    ]);
    mockDb.update.mockReturnValue(updateChain);

    const handler = vi.fn().mockResolvedValue(undefined);
    registerCalcRunCompletedHandler(handler);

    const result = await markCalcRunCompletedIfReady(19);

    expect(result).toBe(true);
    expect(updateChain.set).toHaveBeenCalledWith({
      completedAt: expect.any(Date),
    });
    expect(updateChain.where).toHaveBeenCalledTimes(1);
    expect(updateChain.returning).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(1, 10, 20, 3);
  });

  it('re-drives downstream automation when calc run was already completed', async () => {
    const updateChain = updateWhereReturningResolved([]);
    mockDb.query.fundSnapshots.findMany.mockResolvedValue([
      { type: 'RESERVE' },
      { type: 'PACING' },
    ]);
    mockDb.update.mockReturnValue(updateChain);
    mockDb.query.calcRuns.findFirst.mockResolvedValue({
      id: 20,
      fundId: 30,
      configId: 40,
      configVersion: 5,
      completedAt: new Date('2026-04-01T00:00:00Z'),
    });

    const handler = vi.fn().mockResolvedValue(undefined);
    registerCalcRunCompletedHandler(handler);

    const result = await markCalcRunCompletedIfReady(20);

    expect(result).toBe(true);
    expect(handler).toHaveBeenCalledWith(20, 30, 40, 5);
  });

  it('returns false when calc run is still incomplete after a missed transition', async () => {
    const updateChain = updateWhereReturningResolved([]);
    mockDb.query.fundSnapshots.findMany.mockResolvedValue([
      { type: 'RESERVE' },
      { type: 'PACING' },
    ]);
    mockDb.update.mockReturnValue(updateChain);
    mockDb.query.calcRuns.findFirst.mockResolvedValue({
      id: 21,
      fundId: 30,
      configId: 40,
      configVersion: 5,
      completedAt: null,
    });

    const handler = vi.fn().mockResolvedValue(undefined);
    registerCalcRunCompletedHandler(handler);

    const result = await markCalcRunCompletedIfReady(21);

    expect(result).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it('throws when a completion handler fails so callers can retry', async () => {
    const updateChain = updateWhereReturningResolved();
    mockDb.query.fundSnapshots.findMany.mockResolvedValue([
      { type: 'RESERVE' },
      { type: 'PACING' },
    ]);
    mockDb.update.mockReturnValue(updateChain);

    const handler = vi.fn().mockRejectedValue(new Error('retry me'));
    registerCalcRunCompletedHandler(handler);

    const completion = markCalcRunCompletedIfReady(22);

    await expect(completion).rejects.toThrow('Calc-run completion handlers failed for run 1');
    await expect(completion).rejects.toThrow('retry me');
  });

  it('treats the last BullMQ attempt as terminal', () => {
    expect(isFinalAttempt({ attemptsMade: 0, opts: {} })).toBe(true);
    expect(isFinalAttempt({ attemptsMade: 1, opts: { attempts: 3 } })).toBe(false);
    expect(isFinalAttempt({ attemptsMade: 2, opts: { attempts: 3 } })).toBe(true);
  });
});
