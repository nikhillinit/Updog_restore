import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VerifiedRequestCredential } from '../../../../server/lib/auth/request-credentials';
import { ActualsRestatementReceiptV1Schema } from '../../../../shared/contracts/lp-reporting/actuals-restatement.contract';

const state = vi.hoisted(() => ({
  pilotFundId: 7 as number | null,
  authenticated: true,
  granted: true,
  preview: vi.fn(),
  publish: vi.fn(),
  targets: vi.fn(),
  history: vi.fn(),
}));

vi.mock('../../../../server/config/actuals-pilot-env', () => ({
  readActualsPilotFundId: () => state.pilotFundId,
}));
vi.mock('../../../../server/lib/auth/jwt', () => ({
  requireAuth: () => (req: Request, res: Response, next: NextFunction) => {
    if (!state.authenticated) return res.status(401).json({ code: 'UNAUTHORIZED' });
    const authenticated = req as Request & {
      user?: Record<string, unknown>;
      authCredential?: VerifiedRequestCredential;
    };
    authenticated.user = {
      id: '9',
      sub: '9',
      email: 'restatement@example.test',
      role: 'admin',
      roles: ['admin'],
      fundIds: [7],
    };
    authenticated.authCredential = {
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
    (readPilotFundId: () => number | null) => (req: Request, res: Response, next: NextFunction) => {
      if (!state.granted || Number(req.params['fundId']) !== readPilotFundId()) {
        return res.status(404).json({ code: 'RESOURCE_NOT_FOUND' });
      }
      next();
    },
}));
vi.mock('../../../../server/services/lp-reporting/actuals-pilot-publish-service', () => {
  class ActualsPilotPublishError extends Error {
    constructor(
      readonly statusCode: number,
      readonly code: string,
      message: string
    ) {
      super(message);
    }
  }
  return {
    ActualsPilotPublishError,
    publishActualsPilot: vi.fn(),
    previewActualsRestatement: state.preview,
    publishActualsRestatement: state.publish,
    readActualsRestatementTargets: state.targets,
    readActualsRestatementHistory: state.history,
  };
});

const prefix = '/api/funds/7/imports/actuals/restatements';
const hash = 'a'.repeat(64);
const key = 'abcdefab-cdef-4abc-8def-abcdefabcdef';
const basis = {
  schemaId: 'financial-facts-basis-ref/1.0.0',
  fundId: 7,
  snapshotId: 1,
  snapshotInputHash: hash,
  sourceFactsInputHash: 'b'.repeat(64),
  policyVersion: 'financial-facts-policy/1.4.0',
  asOfDate: '2026-09-08',
  knowledgeCutoff: '2026-09-08T12:00:00.000Z',
};
const etag = `"financial-facts:1:${hash}"`;
const target = { kind: 'ledger', recordId: 11, sourceHash: hash, contentHash: hash };
const originalPublication = { snapshotId: 1, snapshotInputHash: hash, operationHash: hash };
function previewBody() {
  return {
    contractVersion: 'actuals-restatement/1.0.0',
    expectedBasis: basis,
    expectedETag: etag,
    ledger: {
      templateVersion: 'actuals-ledger/1.0.0',
      fileName: 'replacement.csv',
      payload: Buffer.from('header\n').toString('base64'),
      expectedPayloadSha256: hash,
      expectedCanonicalRowsHash: hash,
      expectedPreviewHash: hash,
    },
    valuation: null,
    items: [
      {
        target,
        originalPublication,
        replacementExternalRef: 'replacement-11',
        expectedReplacementContentHash: hash,
      },
    ],
    reason: 'Correct the confirmed amount',
  };
}
function publishBody() {
  return { ...previewBody(), expectedPreviewHash: hash };
}
function receipt() {
  const correction = {
    commandId: key,
    asOfDate: '2026-09-08',
    reason: 'Correct the confirmed amount',
    actor: { userId: 9 },
    createdAt: '2026-09-08T12:00:00.000Z',
    items: [
      {
        target,
        originalPublication,
        replacement: {
          kind: 'ledger',
          recordId: 12,
          sourceHash: 'c'.repeat(64),
          contentHash: 'd'.repeat(64),
        },
      },
    ],
  };
  return ActualsRestatementReceiptV1Schema.parse({
    contractVersion: 'actuals-pilot-publish/2.0.0',
    operationKind: 'restatement',
    operationHash: hash,
    fundId: 7,
    asOfDate: '2026-09-08',
    coverage: { ledger: 'incremental_since_prior_head', priorFactsSnapshotId: 1 },
    admitted: {
      ledger: {
        sourceArtifactId: 4,
        payloadSha256: hash,
        canonicalRowsHash: hash,
        previewHash: hash,
        approvedRowIds: [12],
        approvedCount: 1,
      },
      valuation: null,
      importBatchId: key,
    },
    facts: {
      policyVersion: 'financial-facts-policy/1.5.0',
      payloadSchemaId: 'financial-facts-payload/6',
      supersedesSnapshotId: 1,
      knowledgeCutoff: basis.knowledgeCutoff,
      snapshotId: 2,
      snapshotInputHash: 'e'.repeat(64),
      etag: `"financial-facts:2:${'e'.repeat(64)}"`,
    },
    basisRef: {
      ...basis,
      snapshotId: 2,
      snapshotInputHash: 'e'.repeat(64),
      policyVersion: 'financial-facts-policy/1.5.0',
    },
    effectiveBasis: {
      ledgerRecordIds: [12],
      valuationRecordIds: [],
      recordsHash: hash,
      predecessorSnapshotInputHash: hash,
      corrections: [correction],
    },
    restatement: correction,
  });
}
async function makeApp() {
  vi.resetModules();
  const { default: router } = await import('../../../../server/routes/lp-reporting/imports');
  const app = express();
  app.use(express.json({ limit: '256kb' }));
  app.use(router);
  return app;
}

beforeEach(() => {
  state.pilotFundId = 7;
  state.authenticated = true;
  state.granted = true;
  state.targets.mockReset().mockResolvedValue({
    contractVersion: 'actuals-restatement/1.0.0',
    basisRef: basis,
    targets: [],
    nextCursor: null,
  });
  state.history.mockReset().mockResolvedValue({
    contractVersion: 'actuals-restatement/1.0.0',
    basisRef: basis,
    history: [],
    nextCursor: null,
  });
  state.preview.mockReset();
  state.publish
    .mockReset()
    .mockResolvedValue({ statusCode: 201, receipt: receipt(), replayed: false });
});

describe('actuals restatement HTTP boundary', () => {
  it('registers no correction routes without configured pilot fund', async () => {
    state.pilotFundId = null;
    const app = await makeApp();
    for (const suffix of ['targets', 'history'])
      expect((await request(app).get(`${prefix}/${suffix}`)).status).toBe(404);
    for (const suffix of ['dry-run', 'publish'])
      expect((await request(app).post(`${prefix}/${suffix}`).send({})).status).toBe(404);
  });

  it.each(['targets', 'history'])(
    'passes the full basis and bounded default pagination to %s',
    async (suffix) => {
      const app = await makeApp();
      const response = await request(app)
        .get(`${prefix}/${suffix}`)
        .query({ expectedBasis: JSON.stringify(basis) });
      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(state[suffix as 'targets' | 'history']).toHaveBeenCalledWith({
        fundId: 7,
        actorId: 9,
        request: { expectedBasis: basis, limit: 50, cursor: null },
      });
    }
  );

  it('passes explicit pagination without interpreting the opaque cursor in routes', async () => {
    const app = await makeApp();
    const response = await request(app)
      .get(`${prefix}/history`)
      .query({
        expectedBasis: JSON.stringify(basis),
        limit: '100',
        cursor: 'opaque-basis-bound-cursor',
      });
    expect(response.status).toBe(200);
    expect(state.history).toHaveBeenCalledWith({
      fundId: 7,
      actorId: 9,
      request: { expectedBasis: basis, limit: 100, cursor: 'opaque-basis-bound-cursor' },
    });
  });

  it.each([
    {},
    { expectedBasis: '{' },
    { expectedBasis: JSON.stringify({ snapshotId: 1 }) },
    { expectedBasis: JSON.stringify(basis), limit: '101' },
    { expectedBasis: JSON.stringify(basis), limit: '01' },
    { expectedBasis: JSON.stringify(basis), limit: '1.0' },
    { expectedBasis: JSON.stringify(basis), cursor: '' },
    { expectedBasis: JSON.stringify(basis), cursor: 'x'.repeat(2049) },
    { expectedBasis: JSON.stringify(basis), extra: 'untrusted' },
    { expectedBasis: 'x'.repeat(4097) },
  ])('rejects invalid read query before any read service call: %j', async (query) => {
    const app = await makeApp();
    expect((await request(app).get(`${prefix}/targets`).query(query)).status).toBe(400);
    expect(state.targets).not.toHaveBeenCalled();
  });

  it('requires current auth and the configured fund grant for all four endpoints', async () => {
    const app = await makeApp();
    for (const condition of ['authenticated', 'granted'] as const) {
      state[condition] = false;
      const status = condition === 'authenticated' ? 401 : 404;
      for (const suffix of ['targets', 'history'])
        expect((await request(app).get(`${prefix}/${suffix}`)).status).toBe(status);
      for (const suffix of ['dry-run', 'publish'])
        expect((await request(app).post(`${prefix}/${suffix}`).send({})).status).toBe(status);
      state[condition] = true;
    }
    expect(state.targets).not.toHaveBeenCalled();
    expect(state.history).not.toHaveBeenCalled();
    expect(state.preview).not.toHaveBeenCalled();
    expect(state.publish).not.toHaveBeenCalled();
  });

  it('rejects non-JSON preview and publish bodies', async () => {
    const app = await makeApp();
    for (const suffix of ['dry-run', 'publish'])
      expect(
        (
          await request(app)
            .post(`${prefix}/${suffix}`)
            .set('Content-Type', 'text/plain')
            .send('csv')
        ).status
      ).toBe(415);
    expect(state.preview).not.toHaveBeenCalled();
    expect(state.publish).not.toHaveBeenCalled();
  });

  it('delegates a validated preview with server actor and returns its typed result', async () => {
    const fields = {
      kind: 'ledger',
      eventType: 'settled_contribution',
      effectiveDate: '2026-09-08',
      amount: '80.00',
      currency: 'USD',
      companyId: null,
      vehicleId: 1,
      deploymentCategory: null,
      expenseCategory: null,
      distributionType: null,
      recallable: null,
      description: null,
    };
    const previewResult = {
      contractVersion: 'actuals-restatement/1.0.0',
      basisRef: basis,
      previewHash: hash,
      canPublish: false,
      impact: null,
      items: [
        {
          original: {
            identity: target,
            fields,
            sourceExternalRef: 'original-11',
            originalPublication,
            predecessor: null,
            correctionCommandId: null,
          },
          replacementExternalRef: 'replacement-11',
          replacementContentHash: hash,
          replacementFields: fields,
        },
      ],
      errors: [{ code: 'TARGET_HASH_MISMATCH', message: 'Stored target changed.', target }],
    };
    state.preview.mockResolvedValue(previewResult);
    const app = await makeApp();
    const response = await request(app).post(`${prefix}/dry-run`).send(previewBody());
    expect(response.status).toBe(200);
    expect(response.body).toEqual(previewResult);
    expect(state.preview).toHaveBeenCalledWith({ fundId: 7, actorId: 9, request: previewBody() });
  });

  it('requires strong matching If-Match and lowercase UUID before publish', async () => {
    const app = await makeApp();
    expect((await request(app).post(`${prefix}/publish`).send(publishBody())).status).toBe(428);
    expect(
      (
        await request(app)
          .post(`${prefix}/publish`)
          .set('If-Match', `W/${etag}`)
          .set('Idempotency-Key', key)
          .send(publishBody())
      ).status
    ).toBe(400);
    expect(
      (
        await request(app)
          .post(`${prefix}/publish`)
          .set('If-Match', etag)
          .set('Idempotency-Key', key.toUpperCase())
          .send(publishBody())
      ).status
    ).toBe(400);
    const stale = await request(app)
      .post(`${prefix}/publish`)
      .set('If-Match', `"financial-facts:2:${hash}"`)
      .set('Idempotency-Key', key)
      .send(publishBody());
    expect(stale.status).toBe(412);
    expect(stale.body.code).toBe('STALE_BASIS');
    expect(state.publish).not.toHaveBeenCalled();
  });

  it.each([201, 200] as const)(
    'forwards canonical %s restatement receipt with server actor',
    async (statusCode) => {
      state.publish.mockResolvedValue({
        statusCode,
        receipt: receipt(),
        replayed: statusCode === 200,
      });
      const app = await makeApp();
      const response = await request(app)
        .post(`${prefix}/publish`)
        .set('If-Match', etag)
        .set('Idempotency-Key', key)
        .send(publishBody());
      expect(response.status).toBe(statusCode);
      expect(response.body).toEqual(receipt());
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(state.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          fundId: 7,
          actorId: 9,
          ifMatch: etag,
          idempotencyKey: key,
          request: publishBody(),
        })
      );
    }
  );

  it('rejects caller actor substitution before publish service', async () => {
    const app = await makeApp();
    expect(
      (
        await request(app)
          .post(`${prefix}/publish`)
          .set('If-Match', etag)
          .set('Idempotency-Key', key)
          .send({ ...publishBody(), actorId: 99 })
      ).status
    ).toBe(400);
    expect(state.publish).not.toHaveBeenCalled();
  });

  it.each([409, 412, 503])('preserves typed writer failure %s', async (status) => {
    const app = await makeApp();
    const { ActualsPilotPublishError } =
      await import('../../../../server/services/lp-reporting/actuals-pilot-publish-service');
    state.publish.mockRejectedValue(
      new ActualsPilotPublishError(status, 'STALE_BASIS', 'Current basis changed.')
    );
    const response = await request(app)
      .post(`${prefix}/publish`)
      .set('If-Match', etag)
      .set('Idempotency-Key', key)
      .send(publishBody());
    expect(response.status).toBe(status);
    expect(response.body.code).toBe('STALE_BASIS');
  });
});
