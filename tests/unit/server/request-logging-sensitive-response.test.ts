import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { requestLoggingMiddleware } from '../../../server/middleware/request-logging';

const SENSITIVE_RECEIPT = {
  receiptVersion: 'internal-lp-economics-run-receipt/1.0.0',
  runId: 9,
  fundId: 1,
  hashes: { inputHash: 'sensitive-input-hash' },
  basis: { policyVersionId: 3 },
  outcome: { runState: 'succeeded' },
};

function buildApp(info: ReturnType<typeof vi.fn>, createStatus = 201) {
  const app = express();
  app.use(requestLoggingMiddleware({ APP_VERSION: 'test', NODE_ENV: 'test' }, { info }));
  app.post('/api/funds/:fundId/internal-economics/runs', (_req, res) => {
    res.status(createStatus).json(SENSITIVE_RECEIPT);
  });
  app.get('/api/funds/:fundId/internal-economics/runs/:runId', (_req, res) => {
    res.status(200).json(SENSITIVE_RECEIPT);
  });
  app.get('/api/funds/:fundId/summary', (_req, res) => {
    res.status(200).json({ visible: 'ordinary-response' });
  });
  return app;
}

describe('request logging sensitive-response boundary', () => {
  it.each([
    '/api/funds/1/internal-economics/runs/9',
    '/api/funds/1/internal-economics/runs/9/',
    '/api/FUNDS/1/INTERNAL-ECONOMICS/RUNS/9',
  ])('omits internal-economics receipts from structured and rendered logs for %s', async (path) => {
    const info = vi.fn();

    await request(buildApp(info)).get(path).expect(200);

    expect(info).toHaveBeenCalledOnce();
    const [metadata, line] = info.mock.calls[0] as [Record<string, unknown>, string];
    expect(metadata).not.toHaveProperty('response');
    expect(line).not.toContain('receiptVersion');
    expect(JSON.stringify(info.mock.calls)).not.toContain('sensitive-input-hash');
  });

  it.each([
    [201, 'first create'],
    [200, 'replay'],
  ] as const)(
    'omits POST collection receipt hashes from structured and rendered logs for %s %s semantics',
    async (status) => {
      const info = vi.fn();

      const response = await request(buildApp(info, status))
        .post('/api/funds/1/internal-economics/runs')
        .set('Idempotency-Key', 'internal-economics-run-create')
        .send({})
        .expect(status);

      expect(response.body).toEqual(SENSITIVE_RECEIPT);
      expect(info).toHaveBeenCalledOnce();
      const [metadata, line] = info.mock.calls[0] as [Record<string, unknown>, string];
      expect(metadata).not.toHaveProperty('response');
      expect(JSON.stringify(metadata)).not.toContain('receiptVersion');
      expect(JSON.stringify(metadata)).not.toContain('sensitive-input-hash');
      expect(line).not.toContain('receiptVersion');
      expect(line).not.toContain('sensitive-input-hash');
    }
  );

  it('preserves response logging for ordinary API routes', async () => {
    const info = vi.fn();

    await request(buildApp(info)).get('/api/funds/1/summary').expect(200);

    expect(info).toHaveBeenCalledOnce();
    const [metadata, line] = info.mock.calls[0] as [Record<string, unknown>, string];
    expect(metadata).toHaveProperty('response.visible', 'ordinary-response');
    expect(line).toContain('ordinary-response');
  });
});
