import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../../server/db', () => ({
  db: {
    query: {
      snapshotVersions: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      forecastSnapshots: {
        findFirst: vi.fn(),
      },
    },
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ maxVersion: 0 }]),
      }),
    }),
  },
  redisGetJSON: vi.fn().mockResolvedValue(null),
  redisSetJSON: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../server/db/typed-query', () => ({
  typedFindFirst: vi.fn(),
  typedFindMany: vi.fn(),
  typedInsert: vi.fn(),
  typedUpdate: vi.fn(),
}));

import versionsRouter from '../../../server/routes/portfolio/versions';
import { typedFindFirst } from '../../../server/db/typed-query';

describe('snapshot version restore route', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/snapshots/:snapshotId/versions', versionsRouter);
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('returns 409 when the target version is already current', async () => {
    const snapshot = {
      id: '00000000-0000-0000-0000-000000000001',
    };
    const currentVersion = {
      id: '00000000-0000-0000-0000-000000000009',
      snapshotId: '00000000-0000-0000-0000-000000000001',
      versionNumber: 9,
      isCurrent: true,
      stateSnapshot: { a: 1 },
      calculatedMetrics: null,
      sourceHash: 'hash-9',
      createdAt: new Date(),
    };

    vi.mocked(typedFindFirst)
      .mockResolvedValueOnce(currentVersion)
      .mockResolvedValueOnce(snapshot)
      .mockResolvedValueOnce(currentVersion)
      .mockResolvedValueOnce(currentVersion);

    const response = await request(app)
      .post(
        '/api/snapshots/00000000-0000-0000-0000-000000000001/versions/00000000-0000-0000-0000-000000000009/restore'
      )
      .send({});

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('restore_conflict');
  });

  it('returns 409 when the expected current version precondition fails', async () => {
    const snapshot = {
      id: '00000000-0000-0000-0000-000000000001',
    };
    const targetVersion = {
      id: '00000000-0000-0000-0000-000000000008',
      snapshotId: '00000000-0000-0000-0000-000000000001',
      versionNumber: 8,
      isCurrent: false,
      stateSnapshot: { a: 1 },
      calculatedMetrics: null,
      sourceHash: 'hash-8',
      createdAt: new Date(),
    };
    const currentVersion = {
      id: '00000000-0000-0000-0000-000000000009',
      snapshotId: '00000000-0000-0000-0000-000000000001',
      versionNumber: 9,
      isCurrent: true,
      stateSnapshot: { a: 2 },
      calculatedMetrics: null,
      sourceHash: 'hash-9',
      createdAt: new Date(),
    };

    vi.mocked(typedFindFirst)
      .mockResolvedValueOnce(targetVersion)
      .mockResolvedValueOnce(snapshot)
      .mockResolvedValueOnce(currentVersion);

    const response = await request(app)
      .post(
        '/api/snapshots/00000000-0000-0000-0000-000000000001/versions/00000000-0000-0000-0000-000000000008/restore'
      )
      .send({
        expectedCurrentVersionId: '00000000-0000-0000-0000-000000000007',
      });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('restore_conflict');
  });
});
