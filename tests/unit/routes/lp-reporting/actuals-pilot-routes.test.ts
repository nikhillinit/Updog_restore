import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VerifiedRequestCredential } from '../../../../server/lib/auth/request-credentials';

const state = vi.hoisted(() => ({
  pilotFundId: null as number | null,
  head: { kind: 'none' } as { kind: string; row?: Record<string, unknown>; code?: string },
  selectedRows: [] as Record<string, unknown>[],
}));

const preview = vi.hoisted(() => ({ run: vi.fn() }));
const publisher = vi.hoisted(() => ({ run: vi.fn() }));
const codec = vi.hoisted(() => ({ parse: vi.fn() }));
const metricsProjector = vi.hoisted(() => ({ project: vi.fn() }));

vi.mock('../../../../server/config/actuals-pilot-env', () => ({
  readActualsPilotFundId: () => state.pilotFundId,
}));

vi.mock('../../../../server/lib/auth/jwt', () => ({
  requireAuth: () => (req: Request, _res: Response, next: NextFunction) => {
    const authenticatedRequest = req as Request & {
      user?: Record<string, unknown>;
      authCredential?: VerifiedRequestCredential;
    };
    authenticatedRequest.user = {
      id: '9',
      sub: '9',
      email: 'pilot@example.com',
      role: 'admin',
      roles: ['admin'],
      fundIds: [7],
      ip: '127.0.0.1',
      userAgent: 'vitest',
    };
    authenticatedRequest.authCredential = {
      source: 'bearer',
      token: 'verified',
      claims: { sub: '9', role: 'admin', roles: ['admin'], fundIds: [7] },
    } as VerifiedRequestCredential;
    next();
  },
  requireFundAccess: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../../../../server/lib/auth/actuals-pilot-grant', () => ({
  requireActualsPilotGrant:
    (readPilotFundId: () => number | null) =>
    (req: Request, res: Response, next: NextFunction) => {
      if (Number(req.params['fundId']) !== readPilotFundId()) {
        res.status(404).json({ error: 'RESOURCE_NOT_FOUND' });
        return;
      }
      next();
    },
}));

const factsReadback = vi.hoisted(() => ({
  byId: vi.fn(),
  terminalHead: vi.fn(),
}));

vi.mock('../../../../server/services/financial-facts-snapshot-service', () => ({
  getFinancialFactsSnapshotById: factsReadback.byId,
  getTerminalFinancialFactsHead: factsReadback.terminalHead,
}));

vi.mock('../../../../server/services/financial-facts/parse-persisted-facts-row', () => ({
  parsePersistedFactsRow: codec.parse,
}));

vi.mock('../../../../server/services/actual-metrics-v2-projector', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../server/services/actual-metrics-v2-projector')
  >()),
  projectActualMetricsV2: metricsProjector.project,
}));

vi.mock('../../../../server/services/lp-reporting/actuals-pilot-preview-service', () => {
  class ActualsPilotPreviewError extends Error {
    constructor(
      readonly statusCode: number,
      readonly code: string,
      message: string,
      readonly details?: unknown
    ) {
      super(message);
    }
  }
  return { ActualsPilotPreviewError, previewActualsPilot: preview.run };
});

vi.mock('../../../../server/services/lp-reporting/actuals-pilot-publish-service', () => {
  class ActualsPilotPublishError extends Error {
    constructor(
      readonly statusCode: number,
      readonly code: string,
      message: string,
      readonly details?: unknown
    ) {
      super(message);
    }
  }
  return { ActualsPilotPublishError, publishActualsPilot: publisher.run };
});

function previewRequest() {
  return {
    contractVersion: 'actuals-preview-request/1.0.0',
    templateVersion: 'actuals-ledger/1.0.0',
    asOfDate: '2026-09-04',
    fileName: 'ledger.csv',
    payload: Buffer.from('header').toString('base64'),
  };
}

function publishRequest() {
  return {
    contractVersion: 'actuals-pilot-publish/1.0.0',
    asOfDate: '2026-09-04',
    ledger: {
      templateVersion: 'actuals-ledger/1.0.0',
      fileName: 'ledger.csv',
      payload: Buffer.from('header').toString('base64'),
      expectedPayloadSha256: 'a'.repeat(64),
      expectedCanonicalRowsHash: 'b'.repeat(64),
      expectedPreviewHash: 'c'.repeat(64),
    },
    valuation: null,
    coverage: {
      ledger: 'inception_to_date',
      priorFactsSnapshotId: null,
      evidenceNote: 'Initial load',
    },
  };
}

async function makeApp(pilotFundId: number | null) {
  state.pilotFundId = pilotFundId;
  vi.resetModules();
  const { default: router } = await import('../../../../server/routes/lp-reporting/imports');
  const app = express();
  app.use(express.json({ limit: '256kb' }));
  app.use(router);
  return app;
}

beforeEach(() => {
  factsReadback.byId.mockReset().mockImplementation(async () => state.selectedRows[0] ?? null);
  factsReadback.terminalHead.mockReset().mockImplementation(async () => state.head);
  state.head = { kind: 'none' };
  state.selectedRows = [];
  preview.run.mockReset();
  publisher.run.mockReset();
  codec.parse.mockReset();
  metricsProjector.project.mockReset();
});

describe('actuals pilot route registration and command boundary', () => {
  it('registers none of the four routes when the pilot fund is unset', async () => {
    const app = await makeApp(null);
    const responses = await Promise.all([
      request(app).post('/api/funds/7/imports/actuals/dry-run').send(previewRequest()),
      request(app).post('/api/funds/7/imports/actuals/publish').send(publishRequest()),
      request(app).get('/api/funds/7/financial-facts/latest-reference'),
      request(app).get('/api/funds/7/actuals/metrics'),
    ]);
    expect(responses.map(({ status }) => status)).toEqual([404, 404, 404, 404]);
  });

  it('keeps grant and handler fund identity fixed after configuration changes', async () => {
    const app = await makeApp(7);
    state.pilotFundId = 8;

    const otherFund = await request(app).get('/api/funds/8/financial-facts/latest-reference');
    expect(otherFund.status).toBe(404);
    expect(factsReadback.terminalHead).not.toHaveBeenCalled();

    const pilotFund = await request(app).get('/api/funds/7/financial-facts/latest-reference');
    expect(pilotFund.status).toBe(200);
    expect(factsReadback.terminalHead).toHaveBeenCalledWith({ fundId: 7 });
  });

  it('validates preview JSON before the read-only preview service', async () => {
    const app = await makeApp(7);
    const invalid = await request(app)
      .post('/api/funds/7/imports/actuals/dry-run')
      .send({ contractVersion: 'wrong' });
    expect(invalid.status).toBe(400);
    expect(invalid.headers['cache-control']).toBe('private, no-store');
    expect(invalid.body.code).toBe('INVALID_BODY');
    expect(preview.run).not.toHaveBeenCalled();

    const { ActualsPilotPreviewError } =
      await import('../../../../server/services/lp-reporting/actuals-pilot-preview-service');
    preview.run.mockRejectedValueOnce(
      new ActualsPilotPreviewError(422, 'INCOMPLETE_COVERAGE', 'Coverage is incomplete.')
    );
    const valid = await request(app)
      .post('/api/funds/7/imports/actuals/dry-run')
      .send(previewRequest());
    expect(valid.status).toBe(422);
    expect(valid.body).toMatchObject({ code: 'INCOMPLETE_COVERAGE' });
    expect(preview.run).toHaveBeenCalledWith({ fundId: 7, request: previewRequest() });
  });

  it('freezes validated publish headers, body, actor, and request identity for the publisher', async () => {
    const app = await makeApp(7);
    expect(
      (await request(app).post('/api/funds/7/imports/actuals/publish').send(publishRequest()))
        .status
    ).toBe(428);
    expect(
      (
        await request(app)
          .post('/api/funds/7/imports/actuals/publish')
          .set('If-Match', '"financial-facts:none"')
          .set('Idempotency-Key', 'abcdefab-cdef-7abc-8def-abcdefabcdef')
          .send(publishRequest())
      ).status
    ).toBe(400);
    expect(publisher.run).not.toHaveBeenCalled();

    const { ActualsPilotPublishError } =
      await import('../../../../server/services/lp-reporting/actuals-pilot-publish-service');
    publisher.run.mockRejectedValueOnce(
      new ActualsPilotPublishError(503, 'MUTATION_OUTCOME_UNKNOWN', 'Outcome is unknown.')
    );
    const response = await request(app)
      .post('/api/funds/7/imports/actuals/publish')
      .set('If-Match', '"financial-facts:none"')
      .set('Idempotency-Key', 'abcdefab-cdef-4abc-8def-abcdefabcdef')
      .set('X-Request-ID', 'route-request-1')
      .send(publishRequest());
    expect(response.status).toBe(503);
    expect(response.body.code).toBe('MUTATION_OUTCOME_UNKNOWN');
    expect(publisher.run).toHaveBeenCalledWith({
      fundId: 7,
      actorId: 9,
      idempotencyKey: 'abcdefab-cdef-4abc-8def-abcdefabcdef',
      ifMatch: '"financial-facts:none"',
      request: publishRequest(),
      requestId: 'unknown',
    });
  });

  it('returns canonical empty latest-reference and actual-metrics responses', async () => {
    const app = await makeApp(7);
    const latest = await request(app).get('/api/funds/7/financial-facts/latest-reference');
    expect(latest.status).toBe(200);
    expect(latest.body).toEqual({
      contractVersion: 'financial-facts-latest-reference/1.0.0',
      head: null,
    });

    const metrics = await request(app).get('/api/funds/7/actuals/metrics');
    expect(metrics.status).toBe(200);
    expect(metrics.body).toEqual({
      contractVersion: 'actual-metrics/2.0.0',
      snapshotStatus: 'unavailable',
      fundId: 7,
      asOfDate: null,
      knowledgeCutoff: null,
      financialFactsSnapshotId: null,
      snapshotInputHash: null,
      reasonCodes: ['FACTS_NOT_FOUND'],
    });
  });

  it('validates explicit metrics snapshot IDs and scopes missing rows to the fund', async () => {
    const app = await makeApp(7);
    const invalid = await request(app).get('/api/funds/7/actuals/metrics?factsSnapshotId=01');
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe('INVALID_QUERY');

    const missing = await request(app).get('/api/funds/7/actuals/metrics?factsSnapshotId=17');
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('RESOURCE_NOT_FOUND');
    expect(factsReadback.byId).toHaveBeenCalledWith({ fundId: 7, snapshotId: 17 });
  });

  it('binds latest-reference and explicit metrics ETags to the same parsed snapshot identity', async () => {
    const row = {
      id: 17,
      fundId: 7,
      snapshotInputHash: 'a'.repeat(64),
      supersedesSnapshotId: 16,
    };
    const snapshot = {
      ...row,
      sourceFactsInputHash: 'b'.repeat(64),
      policyVersion: 'financial-facts-policy/1.4.0',
      payloadSchemaId: 'financial-facts-payload/5',
      asOfDate: '2026-09-04',
      knowledgeCutoff: '2026-09-04T12:00:00.000Z',
      consumerEvaluations: [{ consumer: 'current_forecast_v2', status: 'accepted', reasons: [] }],
    };
    state.head = { kind: 'head', row };
    state.selectedRows = [row];
    codec.parse.mockReturnValue({ kind: 'facts', snapshot });
    metricsProjector.project.mockReturnValue({
      contractVersion: 'actual-metrics/2.0.0',
      snapshotStatus: 'unavailable',
      fundId: 7,
      asOfDate: null,
      knowledgeCutoff: null,
      financialFactsSnapshotId: null,
      snapshotInputHash: null,
      reasonCodes: ['FACTS_NOT_FOUND'],
    });
    const app = await makeApp(7);

    const latest = await request(app).get('/api/funds/7/financial-facts/latest-reference');
    expect(latest.status).toBe(200);
    expect(latest.headers.etag).toBe(`"financial-facts:17:${'a'.repeat(64)}"`);
    expect(latest.body.head).toMatchObject({
      snapshotId: 17,
      snapshotInputHash: 'a'.repeat(64),
      supersedesSnapshotId: 16,
      basisRef: {
        snapshotId: 17,
        snapshotInputHash: 'a'.repeat(64),
        sourceFactsInputHash: 'b'.repeat(64),
      },
    });

    const metrics = await request(app).get('/api/funds/7/actuals/metrics?factsSnapshotId=17');
    expect(metrics.status).toBe(200);
    expect(metrics.headers.etag).toBe(`"actual-metrics:17:${'a'.repeat(64)}:actual-metrics-2.0.0"`);
    expect(metricsProjector.project).toHaveBeenCalledWith(snapshot);
  });

  it('returns typed terminal-head errors without reading a snapshot payload', async () => {
    state.head = { kind: 'ambiguous', code: 'FACTS_HEAD_AMBIGUOUS' };
    const app = await makeApp(7);
    const response = await request(app).get('/api/funds/7/financial-facts/latest-reference');
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('FACTS_HEAD_AMBIGUOUS');
    expect(codec.parse).not.toHaveBeenCalled();
  });
});
