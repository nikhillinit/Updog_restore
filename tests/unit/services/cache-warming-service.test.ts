import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CacheWarmingService,
  type WarmingParams,
} from '../../../server/services/CacheWarmingService';

const { mockQueue, QueueMock, mockLogger } = vi.hoisted(() => {
  const mockQueue = {
    add: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  };

  const QueueMock = vi.fn(function () {
    return mockQueue;
  });
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };

  return { mockQueue, QueueMock, mockLogger };
});

vi.mock('bullmq', () => ({
  Queue: QueueMock,
}));

vi.mock('../../../server/lib/logger', () => ({
  logger: mockLogger,
}));

function createConfig(seed: string): WarmingParams['configs'][number] {
  return {
    numScenarios: 1_000,
    buckets: [
      {
        name: 'Seed',
        capitalAllocation: 100,
        moicCalibration: { median: 1.2, p90: 4.0 },
      },
    ],
    correlationWeights: {
      macro: 0.5,
      systematic: 0.25,
      idiosyncratic: 0.25,
    },
    recycling: {
      enabled: true,
      reinvestmentRate: 0.5,
      reserveRatio: 0.1,
      distributionTimingQuarters: 4,
    },
    seed,
  };
}

describe('CacheWarmingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-24T00:00:00.000Z'));
    mockQueue.add.mockImplementation(async () => ({
      id: `job-${mockQueue.add.mock.calls.length}`,
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('schedules a warming job for each fund/config combination and closes the queue', async () => {
    const result = await CacheWarmingService.warm({
      fundIds: ['fund-1', 'fund-2'],
      taxonomyVersion: 'v1',
      priority: 'high',
      configs: [createConfig('seed-1'), createConfig('seed-2')],
    });

    expect(QueueMock).toHaveBeenCalledWith('scenario-generation', {
      connection: { host: 'localhost', port: 6379 },
    });
    expect(mockQueue.add).toHaveBeenCalledTimes(4);
    expect(mockQueue.add).toHaveBeenNthCalledWith(
      1,
      'warm-cache',
      expect.objectContaining({
        fundId: 'fund-1',
        taxonomyVersion: 'v1',
        seed: 'seed-1',
      }),
      expect.objectContaining({
        priority: 1,
        attempts: 3,
      })
    );
    expect(result.scheduled).toBe(4);
    expect(result.jobs).toHaveLength(4);
    expect(result.estimated).toEqual({
      totalDurationMs: 1000,
      completionTime: '2026-03-24T00:00:01.000Z',
    });
    expect(mockQueue.close).toHaveBeenCalledTimes(1);
  });
});
