import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const {
  execAsyncMock,
  readFileMock,
  writeFileMock,
  statMock,
  pingMock,
} = vi.hoisted(() => ({
  execAsyncMock: vi.fn(),
  readFileMock: vi.fn(),
  writeFileMock: vi.fn(),
  statMock: vi.fn(),
  pingMock: vi.fn(),
}));

vi.mock('util', () => ({
  promisify: vi.fn(() => execAsyncMock),
}));

vi.mock('fs/promises', () => ({
  default: {
    readFile: readFileMock,
    writeFile: writeFileMock,
    stat: statMock,
  },
}));

vi.mock('../../../server/storage', () => ({
  storage: {
    ping: pingMock,
  },
}));

import devDashboardRouter from '../../../server/routes/dev-dashboard';

describe('dev dashboard routes', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();

    app = express();
    app.use(express.json());
    app.use('/api/dev-dashboard', devDashboardRouter);

    readFileMock.mockResolvedValue('[]');
    writeFileMock.mockResolvedValue(undefined);
    statMock.mockImplementation(async (targetPath: string) => ({
      size: targetPath.includes('client') ? 256 : 128,
    }));
    pingMock.mockResolvedValue(undefined);
    execAsyncMock.mockImplementation(async (command: string) => {
      if (command.startsWith('npx tsc')) {
        return {
          stdout: 'client/src/app.ts(3,1): error TS1005: broken type\n',
          stderr: '',
        };
      }

      if (command.startsWith('npm run test:quick -- --reporter=json')) {
        return {
          stdout: '{"testResults":[{"numPassingTests":4,"numFailingTests":0}]}\n',
          stderr: '',
        };
      }

      if (command.startsWith('git branch --show-current')) {
        return { stdout: 'main\n', stderr: '' };
      }

      if (command.startsWith('git status --porcelain')) {
        return { stdout: ' M package.json\n', stderr: '' };
      }

      if (command.startsWith('git log -1')) {
        return { stdout: 'abcdef123456|Latest commit|2026-03-26 10:00:00 -0700\n', stderr: '' };
      }

      return { stdout: '', stderr: '' };
    });
  });

  it('returns aggregated health metrics with typed history persistence', async () => {
    const response = await request(app).get('/api/dev-dashboard/health').expect(200);

    expect(response.body.overall).toBe('warning');
    expect(response.body.metrics.typescript).toEqual(
      expect.objectContaining({
        errorCount: 1,
        trend: 'stable',
      })
    );
    expect(response.body.metrics.tests).toEqual(
      expect.objectContaining({
        status: 'passing',
        passCount: 4,
        failCount: 0,
      })
    );
    expect(response.body.metrics.git).toEqual(
      expect.objectContaining({
        branch: 'main',
        uncommittedChanges: 1,
      })
    );
    expect(writeFileMock).toHaveBeenCalledWith(
      '.ts-error-history.json',
      expect.stringContaining('"count":1')
    );
  });

  it('preserves the fix endpoint failure envelope', async () => {
    execAsyncMock.mockRejectedValueOnce(new Error('tests unavailable'));

    const response = await request(app).post('/api/dev-dashboard/fix/tests').expect(500);

    expect(response.body).toEqual({
      success: false,
      message: 'tests unavailable',
    });
  });
});
