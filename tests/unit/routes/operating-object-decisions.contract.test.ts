import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import express from 'express';
import request from 'supertest';
import { rowVersionETag } from '../../../server/lib/http-preconditions';
import { clearIdempotencyCache, idempotency } from '../../../server/middleware/idempotency';

const fundScopeState = vi.hoisted(() => ({
  enforceProvidedFundScope: vi.fn(async (_req: Request, _res: Response, _fundId: number) => true),
}));

const decisionService = vi.hoisted(() => ({
  createDecision: vi.fn(),
  listDecisionsForFund: vi.fn(),
  loadDecision: vi.fn(),
  recordOutcome: vi.fn(),
  supersedeDecision: vi.fn(),
  transitionDecision: vi.fn(),
}));

const evidenceService = vi.hoisted(() => ({
  createDecisionEvidenceLink: vi.fn(),
  listDecisionEvidenceLinks: vi.fn(),
}));

vi.mock('../../../server/lib/auth/provided-fund-scope', () => ({
  enforceProvidedFundScope: fundScopeState.enforceProvidedFundScope,
}));

vi.mock('../../../server/services/operating-objects/decision-service', () => {
  class MockDecisionServiceError extends Error {
    readonly status: number;

    constructor(
      readonly statusCode: number,
      readonly code: string,
      message: string,
      readonly details?: Readonly<Record<string, unknown>>
    ) {
      super(message);
      this.name = 'DecisionServiceError';
      this.status = statusCode;
    }
  }

  return { DecisionServiceError: MockDecisionServiceError, ...decisionService };
});

vi.mock('../../../server/services/operating-objects/decision-evidence-link-service', () => {
  class MockDecisionEvidenceLinkServiceError extends Error {
    readonly status: number;

    constructor(
      readonly statusCode: number,
      readonly code: string,
      message: string
    ) {
      super(message);
      this.name = 'DecisionEvidenceLinkServiceError';
      this.status = statusCode;
    }
  }

  return {
    DecisionEvidenceLinkServiceError: MockDecisionEvidenceLinkServiceError,
    ...evidenceService,
  };
});

import decisionsRouter from '../../../server/routes/operating-object-decisions';
import { DecisionServiceError } from '../../../server/services/operating-objects/decision-service';
import { DecisionEvidenceLinkServiceError } from '../../../server/services/operating-objects/decision-evidence-link-service';
import { IdempotentCommandError } from '../../../server/lib/idempotent-command';

function makeApp(options: { actorId?: string; railwayMiddleware?: boolean } = {}) {
  const app = express();
  app.use(express.json());
  if (options.actorId !== undefined) {
    app.use((req, _res, next) => {
      req.user = { id: options.actorId } as never;
      next();
    });
  }
  if (options.railwayMiddleware) app.use(idempotency());
  app.use(decisionsRouter);
  return app;
}

function decisionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    fundId: 1,
    title: 'Approve follow-on',
    recommendation: 'Invest $1m',
    status: 'proposed',
    supersedesDecisionId: null,
    outcome: null,
    outcomeRecordedAt: null,
    outcomeRecordedBy: null,
    followUpOwnerId: null,
    followUpDate: null,
    idempotencyKey: 'decision-key-1',
    requestHash: 'private-hash',
    createdBy: null,
    createdAt: new Date('2026-09-01T08:00:00.000Z'),
    updatedAt: new Date('2026-09-01T08:00:00.000Z'),
    ...overrides,
  };
}

function createBody(fundId = 1) {
  return {
    fundId,
    title: 'Approve follow-on',
    recommendation: 'Invest $1m',
  };
}

const target = { kind: 'analysis_reference', id: 31 } as const;
const evidenceLink = {
  contractVersion: 'decision-evidence-link/1.0.0',
  linkId: 41,
  fundId: 1,
  decisionId: 10,
  target,
  createdAt: '2026-09-01T08:10:00.000Z',
};

describe('operating-object decision route contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fundScopeState.enforceProvidedFundScope.mockResolvedValue(true);
    decisionService.listDecisionsForFund.mockResolvedValue([]);
    decisionService.loadDecision.mockResolvedValue(undefined);
    evidenceService.listDecisionEvidenceLinks.mockResolvedValue([]);
  });

  it.each([
    ['POST', '/api/funds/01/decisions'],
    ['GET', '/api/funds/01/decisions'],
    ['GET', '/api/funds/1/decisions/01'],
    ['PATCH', '/api/funds/1/decisions/01'],
    ['POST', '/api/funds/1/decisions/01/outcome'],
    ['POST', '/api/funds/1/decisions/01/supersede'],
    ['GET', '/api/funds/1/decisions/01/evidence-links'],
    ['POST', '/api/funds/1/decisions/01/evidence-links'],
  ])('%s %s rejects a non-canonical identifier before service access', async (method, path) => {
    const response = await request(makeApp())
      [method.toLowerCase() as 'get'](path)
      .send(createBody());

    expect(response.status).toBe(400);
    expect(fundScopeState.enforceProvidedFundScope).not.toHaveBeenCalled();
  });

  it('rejects cross-fund scope before decision service access', async () => {
    fundScopeState.enforceProvidedFundScope.mockImplementationOnce(async (_req, res) => {
      res.status(403).json({ error: 'Forbidden' });
      return false;
    });

    const response = await request(makeApp()).get('/api/funds/2/decisions');

    expect(response.status).toBe(403);
    expect(decisionService.listDecisionsForFund).not.toHaveBeenCalled();
  });

  it.each([
    ['/api/funds/1/decisions', createBody()],
    ['/api/funds/1/decisions/10/supersede', createBody()],
    ['/api/funds/1/decisions/10/evidence-links', { target }],
  ])('POST %s requires Idempotency-Key', async (path, body) => {
    const response = await request(makeApp()).post(path).send(body);

    expect(response.status).toBe(428);
    expect(response.body.error).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it.each([
    ['/api/funds/1/decisions', createBody()],
    ['/api/funds/1/decisions/10/supersede', createBody()],
    ['/api/funds/1/decisions/10/evidence-links', { target }],
  ])('POST %s rejects malformed Idempotency-Key', async (path, body) => {
    const response = await request(makeApp())
      .post(path)
      .set('Idempotency-Key', 'bad key')
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_IDEMPOTENCY_KEY');
  });

  it.each([
    ['create', '/api/funds/1/decisions', decisionService.createDecision, null],
    ['supersede', '/api/funds/1/decisions/10/supersede', decisionService.supersedeDecision, 10],
  ])(
    'returns 201 then 200 replay for decision %s',
    async (_label, path, service, supersedesDecisionId) => {
      service
        .mockResolvedValueOnce({
          row: decisionRow({ supersedesDecisionId }),
          xmin: '7',
          replayed: false,
        })
        .mockResolvedValueOnce({
          row: decisionRow({ supersedesDecisionId }),
          xmin: '7',
          replayed: true,
        });

      const created = await request(makeApp())
        .post(path)
        .set('Idempotency-Key', 'key-1')
        .send(createBody());
      const replayed = await request(makeApp())
        .post(path)
        .set('Idempotency-Key', 'key-1')
        .send(createBody());

      expect([created.status, replayed.status]).toEqual([201, 200]);
      expect(created.headers.etag).toBe(rowVersionETag('7'));
      expect(replayed.body.etag).toBe(rowVersionETag('7'));
    }
  );

  it('returns 201 then 200 replay for evidence-link create', async () => {
    evidenceService.createDecisionEvidenceLink
      .mockResolvedValueOnce({ evidenceLink, replayed: false })
      .mockResolvedValueOnce({ evidenceLink, replayed: true });

    const created = await request(makeApp())
      .post('/api/funds/1/decisions/10/evidence-links')
      .set('Idempotency-Key', 'evidence-1')
      .send({ target });
    const replayed = await request(makeApp())
      .post('/api/funds/1/decisions/10/evidence-links')
      .set('Idempotency-Key', 'evidence-1')
      .send({ target });

    expect([created.status, replayed.status]).toEqual([201, 200]);
    expect(replayed.body).toEqual(evidenceLink);
  });

  it('maps idempotency-key reuse to 409', async () => {
    decisionService.createDecision.mockRejectedValue(
      new IdempotentCommandError(409, 'IDEMPOTENCY_KEY_REUSE', 'Key reused.')
    );

    const response = await request(makeApp())
      .post('/api/funds/1/decisions')
      .set('Idempotency-Key', 'key-1')
      .send(createBody());

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('IDEMPOTENCY_KEY_REUSE');
  });

  it.each([
    ['PATCH', '/api/funds/1/decisions/10', { status: 'accepted' }],
    ['POST', '/api/funds/1/decisions/10/outcome', { outcome: 'Won' }],
  ])('%s %s requires If-Match', async (method, path, body) => {
    const response = await request(makeApp({ actorId: '42' }))
      [method.toLowerCase() as 'post'](path)
      .send(body);

    expect(response.status).toBe(428);
    expect(response.body.error).toBe('IF_MATCH_REQUIRED');
  });

  it('PATCH returns 412 with current ETag for a stale version', async () => {
    decisionService.loadDecision.mockResolvedValue({ row: decisionRow(), xmin: '9' });

    const response = await request(makeApp())
      .patch('/api/funds/1/decisions/10')
      .set('If-Match', rowVersionETag('8'))
      .send({ status: 'accepted' });

    expect(response.status).toBe(412);
    expect(response.body.current).toBe(rowVersionETag('9'));
    expect(decisionService.transitionDecision).not.toHaveBeenCalled();
  });

  it('PATCH returns updated ETag without serializing xmin', async () => {
    decisionService.loadDecision.mockResolvedValue({ row: decisionRow(), xmin: '9' });
    decisionService.transitionDecision.mockResolvedValue({
      row: decisionRow({ status: 'accepted' }),
      xmin: '10',
    });

    const response = await request(makeApp())
      .patch('/api/funds/1/decisions/10')
      .set('If-Match', rowVersionETag('9'))
      .send({ status: 'accepted' });

    expect(response.status).toBe(200);
    expect(response.headers.etag).toBe(rowVersionETag('10'));
    expect(response.body).not.toHaveProperty('xmin');
  });

  it('outcome requires actor before loading decision', async () => {
    const response = await request(makeApp())
      .post('/api/funds/1/decisions/10/outcome')
      .set('If-Match', rowVersionETag('9'))
      .send({ outcome: 'Won' });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('ACTOR_REQUIRED');
    expect(decisionService.loadDecision).not.toHaveBeenCalled();
  });

  it('outcome returns 412 for an untouched stale decision', async () => {
    decisionService.loadDecision.mockResolvedValue({ row: decisionRow(), xmin: '9' });

    const response = await request(makeApp({ actorId: '42' }))
      .post('/api/funds/1/decisions/10/outcome')
      .set('If-Match', rowVersionETag('8'))
      .send({ outcome: 'Won' });

    expect(response.status).toBe(412);
    expect(decisionService.recordOutcome).not.toHaveBeenCalled();
  });

  it('outcome returns replay ETag when service accepts an identical recorded outcome', async () => {
    decisionService.loadDecision.mockResolvedValue({
      row: decisionRow({
        outcome: 'Won',
        outcomeRecordedAt: new Date('2026-09-01T09:00:00.000Z'),
        outcomeRecordedBy: 42,
      }),
      xmin: '11',
    });
    decisionService.recordOutcome.mockResolvedValue({
      row: decisionRow({
        outcome: 'Won',
        outcomeRecordedAt: new Date('2026-09-01T09:00:00.000Z'),
        outcomeRecordedBy: 42,
      }),
      xmin: '11',
    });

    const response = await request(makeApp({ actorId: '42' }))
      .post('/api/funds/1/decisions/10/outcome')
      .set('If-Match', rowVersionETag('1'))
      .send({ outcome: 'Won' });

    expect(response.status).toBe(200);
    expect(response.headers.etag).toBe(rowVersionETag('11'));
    expect(response.body).not.toHaveProperty('xmin');
  });

  it.each([
    [new DecisionServiceError(404, 'DECISION_NOT_FOUND', 'Missing.'), 404, 'DECISION_NOT_FOUND'],
    [
      new DecisionServiceError(409, 'DECISION_OUTCOME_ALREADY_RECORDED', 'Immutable.'),
      409,
      'DECISION_OUTCOME_ALREADY_RECORDED',
    ],
  ] as const)('maps typed decision service failures to HTTP', async (error, status, code) => {
    decisionService.createDecision.mockRejectedValue(error);

    const response = await request(makeApp())
      .post('/api/funds/1/decisions')
      .set('Idempotency-Key', 'key-1')
      .send(createBody());

    expect(response.status).toBe(status);
    expect(response.body.error).toBe(code);
  });

  it('GET list returns strict public response shapes without xmin', async () => {
    decisionService.listDecisionsForFund.mockResolvedValue([
      { row: decisionRow(), xmin: '4' },
      { row: decisionRow({ id: 11, title: 'Second' }), xmin: '5' },
    ]);

    const response = await request(makeApp()).get('/api/funds/1/decisions');

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
    expect(response.body.data[0]).not.toHaveProperty('xmin');
    expect(response.body.data[0].etag).toBe(rowVersionETag('4'));
  });

  it('GET detail returns ETag and 404 when absent', async () => {
    decisionService.loadDecision
      .mockResolvedValueOnce({ row: decisionRow(), xmin: '6' })
      .mockResolvedValueOnce(undefined);

    const found = await request(makeApp()).get('/api/funds/1/decisions/10');
    const missing = await request(makeApp()).get('/api/funds/1/decisions/10');

    expect(found.status).toBe(200);
    expect(found.headers.etag).toBe(rowVersionETag('6'));
    expect(found.body).not.toHaveProperty('xmin');
    expect(missing.status).toBe(404);
  });

  it('GET evidence links returns strict data shape without cacheability', async () => {
    evidenceService.listDecisionEvidenceLinks.mockResolvedValue([evidenceLink]);

    const response = await request(makeApp()).get('/api/funds/1/decisions/10/evidence-links');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [evidenceLink] });
    expect(response.headers['cache-control']).toBe('private, no-store');
  });

  it('maps typed evidence-link failures to 404', async () => {
    evidenceService.listDecisionEvidenceLinks.mockRejectedValue(
      new DecisionEvidenceLinkServiceError(404, 'DECISION_NOT_FOUND', 'Missing.')
    );

    const response = await request(makeApp()).get('/api/funds/1/decisions/10/evidence-links');

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('DECISION_NOT_FOUND');
  });
});

type SequenceResult = {
  created: request.Response;
  replayed: request.Response;
  conflicted: request.Response;
};

function expectSurfaceParity(direct: SequenceResult, railway: SequenceResult) {
  expect([direct.created.status, direct.replayed.status, direct.conflicted.status]).toEqual([
    201, 200, 409,
  ]);
  expect([railway.created.status, railway.replayed.status, railway.conflicted.status]).toEqual([
    201, 200, 409,
  ]);
  expect(railway.created.body).toEqual(direct.created.body);
  expect(railway.replayed.body).toEqual(direct.replayed.body);
  expect(railway.conflicted.body).toEqual(direct.conflicted.body);
  expect(railway.created.headers['idempotency-replay']).toBeUndefined();
  expect(railway.replayed.headers['idempotency-replay']).toBeUndefined();
  expect(railway.conflicted.headers['idempotency-replay']).toBeUndefined();
}

describe('decision POST dual-surface idempotency parity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearIdempotencyCache();
    fundScopeState.enforceProvidedFundScope.mockResolvedValue(true);
  });

  it('keeps decision create 201 / 200 replay / 409 conflict identical on both surfaces', async () => {
    async function run(railwayMiddleware: boolean): Promise<SequenceResult> {
      decisionService.createDecision.mockReset();
      decisionService.createDecision
        .mockResolvedValueOnce({ row: decisionRow(), xmin: '7', replayed: false })
        .mockResolvedValueOnce({ row: decisionRow(), xmin: '7', replayed: true })
        .mockRejectedValueOnce(
          new IdempotentCommandError(409, 'IDEMPOTENCY_KEY_REUSE', 'Key reused.')
        );
      const app = makeApp({ railwayMiddleware });
      const created = await request(app)
        .post('/api/funds/1/decisions')
        .set('Idempotency-Key', 'decision-key-1')
        .send(createBody());
      const replayed = await request(app)
        .post('/api/funds/1/decisions')
        .set('Idempotency-Key', 'decision-key-1')
        .send(createBody());
      const conflicted = await request(app)
        .post('/api/funds/1/decisions')
        .set('Idempotency-Key', 'decision-key-1')
        .send({ ...createBody(), recommendation: 'Do not invest' });
      return { created, replayed, conflicted };
    }

    const direct = await run(false);
    clearIdempotencyCache();
    const railway = await run(true);

    expectSurfaceParity(direct, railway);
  });

  it('keeps supersede 201 / 200 replay / 409 conflict identical on both surfaces', async () => {
    async function run(railwayMiddleware: boolean): Promise<SequenceResult> {
      decisionService.supersedeDecision.mockReset();
      decisionService.supersedeDecision
        .mockResolvedValueOnce({
          row: decisionRow({ id: 11, supersedesDecisionId: 10 }),
          xmin: '8',
          replayed: false,
        })
        .mockResolvedValueOnce({
          row: decisionRow({ id: 11, supersedesDecisionId: 10 }),
          xmin: '8',
          replayed: true,
        })
        .mockRejectedValueOnce(
          new IdempotentCommandError(409, 'IDEMPOTENCY_KEY_REUSE', 'Key reused.')
        );
      const app = makeApp({ railwayMiddleware });
      const created = await request(app)
        .post('/api/funds/1/decisions/10/supersede')
        .set('Idempotency-Key', 'supersede-key-1')
        .send(createBody());
      const replayed = await request(app)
        .post('/api/funds/1/decisions/10/supersede')
        .set('Idempotency-Key', 'supersede-key-1')
        .send(createBody());
      const conflicted = await request(app)
        .post('/api/funds/1/decisions/10/supersede')
        .set('Idempotency-Key', 'supersede-key-1')
        .send({ ...createBody(), title: 'Different successor' });
      return { created, replayed, conflicted };
    }

    const direct = await run(false);
    clearIdempotencyCache();
    const railway = await run(true);

    expectSurfaceParity(direct, railway);
  });

  it('keeps evidence-link create 201 / 200 replay / 409 conflict identical on both surfaces', async () => {
    async function run(railwayMiddleware: boolean): Promise<SequenceResult> {
      evidenceService.createDecisionEvidenceLink.mockReset();
      evidenceService.createDecisionEvidenceLink
        .mockResolvedValueOnce({ evidenceLink, replayed: false })
        .mockResolvedValueOnce({ evidenceLink, replayed: true })
        .mockRejectedValueOnce(
          new IdempotentCommandError(409, 'IDEMPOTENCY_KEY_REUSE', 'Key reused.')
        );
      const app = makeApp({ railwayMiddleware });
      const created = await request(app)
        .post('/api/funds/1/decisions/10/evidence-links')
        .set('Idempotency-Key', 'evidence-key-1')
        .send({ target });
      const replayed = await request(app)
        .post('/api/funds/1/decisions/10/evidence-links')
        .set('Idempotency-Key', 'evidence-key-1')
        .send({ target });
      const conflicted = await request(app)
        .post('/api/funds/1/decisions/10/evidence-links')
        .set('Idempotency-Key', 'evidence-key-1')
        .send({ target: { ...target, id: 32 } });
      return { created, replayed, conflicted };
    }

    const direct = await run(false);
    clearIdempotencyCache();
    const railway = await run(true);

    expectSurfaceParity(direct, railway);
  });
});
