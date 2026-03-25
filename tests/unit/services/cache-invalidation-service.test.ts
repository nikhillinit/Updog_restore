import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RedisClientType } from 'redis';
import { CacheInvalidationService } from '../../../server/services/CacheInvalidationService';

const { selectWhereMock, updateWhereMock, mockDb, mockLogger } = vi.hoisted(() => {
  const selectWhereMock = vi.fn();
  const selectFromMock = vi.fn(() => ({ where: selectWhereMock }));
  const selectMock = vi.fn(() => ({ from: selectFromMock }));

  const updateWhereMock = vi.fn();
  const updateSetMock = vi.fn(() => ({ where: updateWhereMock }));
  const updateMock = vi.fn(() => ({ set: updateSetMock }));

  const mockDb = {
    select: selectMock,
    update: updateMock,
  };

  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };

  return { selectWhereMock, updateWhereMock, mockDb, mockLogger };
});

vi.mock('../../../server/db', () => ({
  db: mockDb,
}));

vi.mock('../../../server/lib/logger', () => ({
  logger: mockLogger,
}));

function createRedis(scanKeys: string[] = []): RedisClientType {
  return {
    scan: vi.fn(async () => ({ cursor: 0, keys: scanKeys })),
    del: vi.fn(async (keys: string[] | string) => (Array.isArray(keys) ? keys.length : 1)),
  } as unknown as RedisClientType;
}

describe('CacheInvalidationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectWhereMock.mockReset();
    updateWhereMock.mockReset();
  });

  it('invalidates all Redis and PostgreSQL cache entries', async () => {
    const redis = createRedis(['scenario-matrix:a', 'scenario-matrix:b']) as RedisClientType & {
      scan: ReturnType<typeof vi.fn>;
      del: ReturnType<typeof vi.fn>;
    };

    updateWhereMock.mockResolvedValue({ rowCount: 2 });

    const result = await CacheInvalidationService.invalidate(
      { scope: 'all', reason: 'wave1b-test' },
      redis
    );

    expect(redis.scan).toHaveBeenCalledWith(0, {
      MATCH: 'scenario-matrix:*',
      COUNT: 100,
    });
    expect(redis.del).toHaveBeenCalledWith(['scenario-matrix:a', 'scenario-matrix:b']);
    expect(result.invalidated).toEqual({ redis: 2, postgres: 2 });
    expect(result.auditLog.reason).toBe('wave1b-test');
  });

  it('invalidates fund-scoped Redis keys based on PostgreSQL matrix keys', async () => {
    const redis = createRedis() as RedisClientType & {
      del: ReturnType<typeof vi.fn>;
    };

    selectWhereMock.mockResolvedValue([{ matrixKey: 'matrix-1' }, { matrixKey: 'matrix-2' }]);
    updateWhereMock.mockResolvedValue({ rowCount: 2 });

    const result = await CacheInvalidationService.invalidate(
      { scope: 'fund', fundId: 'fund-123' },
      redis
    );

    expect(redis.del).toHaveBeenCalledWith([
      'scenario-matrix:matrix-1',
      'scenario-matrix:matrix-2',
    ]);
    expect(result.invalidated).toEqual({ redis: 2, postgres: 2 });
  });
});
