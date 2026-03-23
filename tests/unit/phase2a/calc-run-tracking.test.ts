import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    query: {
      fundSnapshots: {
        findMany: vi.fn(),
      },
    },
    update: vi.fn(),
  },
}));

vi.mock('../../../server/db', () => ({
  db: mockDb,
}));

import {
  isFinalAttempt,
  markCalcRunCompletedIfReady,
  markCalcRunFailed,
} from '../../../server/services/calc-run-tracking';

function updateWhereResolved() {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn(() => ({ where }));
  return { set, where };
}

describe('calc run tracking helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    const updateChain = updateWhereResolved();
    mockDb.query.fundSnapshots.findMany.mockResolvedValue([
      { type: 'RESERVE' },
      { type: 'PACING' },
    ]);
    mockDb.update.mockReturnValue(updateChain);

    await markCalcRunCompletedIfReady(19);

    expect(updateChain.set).toHaveBeenCalledWith({
      completedAt: expect.any(Date),
    });
    expect(updateChain.where).toHaveBeenCalledTimes(1);
  });

  it('treats the last BullMQ attempt as terminal', () => {
    expect(isFinalAttempt({ attemptsMade: 0, opts: {} })).toBe(true);
    expect(isFinalAttempt({ attemptsMade: 1, opts: { attempts: 3 } })).toBe(false);
    expect(isFinalAttempt({ attemptsMade: 2, opts: { attempts: 3 } })).toBe(true);
  });
});
