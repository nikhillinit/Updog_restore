/**
 * Post Calc-Run Trigger Tests
 *
 * Decision 0.1b: Validates the handler registration pattern on
 * markCalcRunCompletedIfReady, ensuring:
 * - .returning() is used for transition detection
 * - Callbacks fire only on actual transition (result.length === 1)
 * - Already-completed runs are intentionally re-driven for recovery
 * - Handler failures are surfaced so callers can retry
 * - resetCompletionHandlers clears handlers for test isolation
 * - Multiple handlers all fire on transition
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb, mockLogError } = vi.hoisted(() => ({
  mockDb: {
    query: {
      fundSnapshots: {
        findMany: vi.fn(),
      },
      calcRuns: {
        findFirst: vi.fn(),
      },
    },
    update: vi.fn(),
  },
  mockLogError: vi.fn(),
}));

vi.mock('../../../server/db', () => ({
  db: mockDb,
}));

vi.mock('../../../server/lib/logger', () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      error: mockLogError,
      warn: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

import {
  markCalcRunCompletedIfReady,
  registerCalcRunCompletedHandler,
  resetCompletionHandlers,
} from '../../../server/services/calc-run-tracking';

const TRANSITION_ROW = { id: 42, fundId: 7, configId: 15, configVersion: 2 };

async function flushAsyncTurns() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function mockFullCoverage() {
  mockDb.query.fundSnapshots.findMany.mockResolvedValue([{ type: 'RESERVE' }, { type: 'PACING' }]);
}

function mockTransitionUpdate(
  rows: Array<{ id: number; fundId: number; configId: number; configVersion: number }> = [
    TRANSITION_ROW,
  ]
) {
  const returning = vi.fn().mockResolvedValue(rows);
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where }));
  mockDb.update.mockReturnValue({ set, where, returning });
  return { set, where, returning };
}

describe('post calc-run trigger (Decision 0.1b)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCompletionHandlers();
  });

  afterEach(() => {
    resetCompletionHandlers();
  });

  describe('transition detection via .returning()', () => {
    it('uses .returning() to detect the transition', async () => {
      mockFullCoverage();
      const chain = mockTransitionUpdate();

      await markCalcRunCompletedIfReady(42);

      expect(chain.returning).toHaveBeenCalledTimes(1);
    });

    it('returns true only when THIS call transitioned the state', async () => {
      mockFullCoverage();
      mockTransitionUpdate([TRANSITION_ROW]);

      const result = await markCalcRunCompletedIfReady(42);

      expect(result).toBe(true);
    });

    it('returns false when another worker already completed it', async () => {
      mockFullCoverage();
      mockTransitionUpdate([]);
      mockDb.query.calcRuns.findFirst.mockResolvedValue({
        ...TRANSITION_ROW,
        completedAt: new Date('2026-04-01T00:00:00Z'),
      });

      const result = await markCalcRunCompletedIfReady(42);

      expect(result).toBe(true);
    });

    it('returns false when snapshot coverage is incomplete', async () => {
      mockDb.query.fundSnapshots.findMany.mockResolvedValue([{ type: 'RESERVE' }]);

      const result = await markCalcRunCompletedIfReady(42);

      expect(result).toBe(false);
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('does not treat cohort snapshots as authoritative pacing coverage', async () => {
      mockDb.query.fundSnapshots.findMany.mockResolvedValue([
        { type: 'RESERVE' },
        { type: 'COHORT' },
      ]);

      const result = await markCalcRunCompletedIfReady(42);

      expect(result).toBe(false);
      expect(mockDb.update).not.toHaveBeenCalled();
    });
  });

  describe('handler invocation', () => {
    it('fires registered handler on actual transition', async () => {
      mockFullCoverage();
      mockTransitionUpdate();

      const handler = vi.fn().mockResolvedValue(undefined);
      registerCalcRunCompletedHandler(handler);

      await markCalcRunCompletedIfReady(42);

      expect(handler).toHaveBeenCalledWith(
        TRANSITION_ROW.id,
        TRANSITION_ROW.fundId,
        TRANSITION_ROW.configId,
        TRANSITION_ROW.configVersion
      );
    });

    it('does NOT fire handler when already completed', async () => {
      mockFullCoverage();
      mockTransitionUpdate([]);
      mockDb.query.calcRuns.findFirst.mockResolvedValue({
        ...TRANSITION_ROW,
        completedAt: new Date('2026-04-01T00:00:00Z'),
      });

      const handler = vi.fn().mockResolvedValue(undefined);
      registerCalcRunCompletedHandler(handler);

      await markCalcRunCompletedIfReady(42);

      expect(handler).toHaveBeenCalledWith(
        TRANSITION_ROW.id,
        TRANSITION_ROW.fundId,
        TRANSITION_ROW.configId,
        TRANSITION_ROW.configVersion
      );
    });

    it('does not fire handler when no completedAt exists after a missed transition', async () => {
      mockFullCoverage();
      mockTransitionUpdate([]);
      mockDb.query.calcRuns.findFirst.mockResolvedValue({
        ...TRANSITION_ROW,
        completedAt: null,
      });

      const handler = vi.fn().mockResolvedValue(undefined);
      registerCalcRunCompletedHandler(handler);

      const result = await markCalcRunCompletedIfReady(42);

      expect(result).toBe(false);
      expect(handler).not.toHaveBeenCalled();
    });

    it('fires multiple handlers on transition', async () => {
      mockFullCoverage();
      mockTransitionUpdate();

      const handler1 = vi.fn().mockResolvedValue(undefined);
      const handler2 = vi.fn().mockResolvedValue(undefined);
      const handler3 = vi.fn().mockResolvedValue(undefined);
      registerCalcRunCompletedHandler(handler1);
      registerCalcRunCompletedHandler(handler2);
      registerCalcRunCompletedHandler(handler3);

      await markCalcRunCompletedIfReady(42);

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
      expect(handler3).toHaveBeenCalledTimes(1);
    });

    it('starts multiple handlers in parallel at the outer registry', async () => {
      mockFullCoverage();
      mockTransitionUpdate();

      let releaseFirstHandler: (() => void) | null = null;
      const firstHandlerPending = new Promise<void>((resolve) => {
        releaseFirstHandler = resolve;
      });
      let secondHandlerStarted = false;

      const firstHandler = vi.fn(async () => {
        await firstHandlerPending;
      });
      const secondHandler = vi.fn(async () => {
        secondHandlerStarted = true;
      });

      registerCalcRunCompletedHandler(firstHandler);
      registerCalcRunCompletedHandler(secondHandler);

      const completion = markCalcRunCompletedIfReady(42);

      await flushAsyncTurns();

      expect(firstHandler).toHaveBeenCalledTimes(1);
      expect(secondHandlerStarted).toBe(true);

      releaseFirstHandler?.();
      await completion;
    });

    it('passes correct arguments from .returning() row to each handler', async () => {
      mockFullCoverage();
      const customRow = { id: 99, fundId: 5, configId: 33, configVersion: 7 };
      mockTransitionUpdate([customRow]);

      const handler = vi.fn().mockResolvedValue(undefined);
      registerCalcRunCompletedHandler(handler);

      await markCalcRunCompletedIfReady(99);

      expect(handler).toHaveBeenCalledWith(99, 5, 33, 7);
    });
  });

  describe('retryable error handling', () => {
    it('handler failure rejects markCalcRunCompletedIfReady so callers can retry', async () => {
      mockFullCoverage();
      mockTransitionUpdate();

      const failingHandler = vi.fn().mockRejectedValue(new Error('handler boom'));
      registerCalcRunCompletedHandler(failingHandler);

      await expect(markCalcRunCompletedIfReady(42)).rejects.toThrow(
        'Calc-run completion handlers failed for run 42'
      );

      expect(failingHandler).toHaveBeenCalledTimes(1);
    });

    it('logs handler failure', async () => {
      mockFullCoverage();
      mockTransitionUpdate();

      const handlerError = new Error('baseline creation failed');
      registerCalcRunCompletedHandler(vi.fn().mockRejectedValue(handlerError));

      await expect(markCalcRunCompletedIfReady(42)).rejects.toThrow(
        'Calc-run completion handlers failed for run 42'
      );

      expect(mockLogError).toHaveBeenCalledWith(
        expect.objectContaining({ runId: 42, err: handlerError }),
        'Calc-run completion handler failed'
      );
    });

    it('subsequent handlers still fire even if earlier one fails', async () => {
      mockFullCoverage();
      mockTransitionUpdate();

      const failingHandler = vi.fn().mockRejectedValue(new Error('first fails'));
      const passingHandler = vi.fn().mockResolvedValue(undefined);
      registerCalcRunCompletedHandler(failingHandler);
      registerCalcRunCompletedHandler(passingHandler);

      await expect(markCalcRunCompletedIfReady(42)).rejects.toThrow(
        'Calc-run completion handlers failed for run 42'
      );

      expect(failingHandler).toHaveBeenCalledTimes(1);
      expect(passingHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('resetCompletionHandlers', () => {
    it('clears all registered handlers', async () => {
      mockFullCoverage();
      mockTransitionUpdate();

      const handler = vi.fn().mockResolvedValue(undefined);
      registerCalcRunCompletedHandler(handler);
      resetCompletionHandlers();

      await markCalcRunCompletedIfReady(42);

      expect(handler).not.toHaveBeenCalled();
    });

    it('allows re-registration after reset', async () => {
      mockFullCoverage();
      mockTransitionUpdate();

      const handler1 = vi.fn().mockResolvedValue(undefined);
      const handler2 = vi.fn().mockResolvedValue(undefined);
      registerCalcRunCompletedHandler(handler1);
      resetCompletionHandlers();
      registerCalcRunCompletedHandler(handler2);

      await markCalcRunCompletedIfReady(42);

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });
});
