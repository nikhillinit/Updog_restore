import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const service = vi.hoisted(() => ({
  getDraftById: vi.fn(),
  listDrafts: vi.fn(),
  getReferenceById: vi.fn(),
  listRevisionEvents: vi.fn(),
  createDraftForPeriod: vi.fn(),
  refreshDraft: vi.fn(),
  saveDraft: vi.fn(),
  startCorrectionDraft: vi.fn(),
  listReferences: vi.fn(),
  planQuarterlyDrafts: vi.fn(),
}));

const authState = vi.hoisted(() => ({
  authenticated: true,
  fundAccess: true,
  calls: [] as string[],
}));

vi.mock('express-rate-limit', () => ({
  default: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../../../server/lib/auth/jwt', () => ({
  requireAuth: () => (req: Request, res: Response, next: NextFunction) => {
    authState.calls.push('requireAuth');
    if (!authState.authenticated) return res.sendStatus(401);
    req.user = { id: 7, sub: '7', role: 'admin', roles: ['admin'], fundIds: [1] } as never;
    next();
  },
  requireFundAccess: (_req: Request, res: Response, next: NextFunction) => {
    authState.calls.push('requireFundAccess');
    if (!authState.fundAccess) return res.sendStatus(403);
    next();
  },
  requireRole: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../../../server/services/internal-analysis/analysis-checkpoint-service', async () => {
  class MockAnalysisCheckpointServiceError extends Error {
    readonly status: number;
    constructor(
      readonly statusCode: number,
      readonly code: string,
      message: string,
      readonly details?: unknown
    ) {
      super(message);
      this.name = 'AnalysisCheckpointServiceError';
      this.status = statusCode;
    }
  }

  const actual = await vi.importActual<
    typeof import('../../../server/services/internal-analysis/analysis-checkpoint-service')
  >('../../../server/services/internal-analysis/analysis-checkpoint-service');

  return {
    AnalysisCheckpointServiceError: MockAnalysisCheckpointServiceError,
    toDraftContract: actual.toDraftContract,
    toReferenceContract: actual.toReferenceContract,
    createAnalysisCheckpointPorts: () => ({
      getDraftById: service.getDraftById,
      listDrafts: service.listDrafts,
      getReferenceById: service.getReferenceById,
      listRevisionEvents: service.listRevisionEvents,
    }),
    createDraftForPeriod: service.createDraftForPeriod,
    refreshDraft: service.refreshDraft,
    saveDraft: service.saveDraft,
    startCorrectionDraft: service.startCorrectionDraft,
    listReferences: service.listReferences,
    planQuarterlyDrafts: service.planQuarterlyDrafts,
  };
});

import internalAnalysisRouter from '../../../server/routes/internal-analysis';
import { AnalysisCheckpointServiceError } from '../../../server/services/internal-analysis/analysis-checkpoint-service';

const PERIOD = {
  periodKind: 'quarterly' as const,
  periodStart: '2026-04-01',
  periodEnd: '2026-06-30',
};

function draftRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    draftId: 3,
    fundId: 1,
    period: PERIOD,
    knowledgeCutoff: new Date('2026-07-02T00:00:00.000Z'),
    financialFactsSnapshotId: 41,
    forecastFundSnapshotId: 902,
    reserveReferenceId: null,
    economicsReferenceId: null,
    sourceReferenceId: null,
    savedAt: null,
    version: 1,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    ...overrides,
  } as never;
}

function referenceRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    referenceId: 11,
    fundId: 1,
    period: PERIOD,
    knowledgeCutoff: new Date('2026-07-02T00:00:00.000Z'),
    financialFactsSnapshotId: 41,
    forecastFundSnapshotId: 902,
    reserveReferenceId: null,
    economicsReferenceId: null,
    mixedBasisAtSave: false,
    supersedesReferenceId: null,
    sourceDraftId: 3,
    createdBy: 7,
    createdAt: new Date('2026-07-02T00:00:00.000Z'),
    ...overrides,
  } as never;
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', internalAnalysisRouter);
  return app;
}

/** Read the ETag the server minted for a draft, the way a real client would. */
async function readDraftETag(): Promise<string> {
  service.getDraftById.mockResolvedValue(draftRecord());
  const response = await request(buildApp()).get('/api/funds/1/internal-analysis/drafts/3');
  return response.headers['etag'] as string;
}

beforeEach(() => {
  authState.authenticated = true;
  authState.fundAccess = true;
  authState.calls = [];
  for (const mock of Object.values(service)) mock.mockReset();
});

describe('internal-analysis route contract', () => {
  it('rejects a non-numeric fund ID on every route before service work', async () => {
    const app = buildApp();

    const responses = await Promise.all([
      request(app).get('/api/funds/abc/internal-analysis/drafts'),
      request(app).get('/api/funds/abc/internal-analysis/drafts/3'),
      request(app).post('/api/funds/abc/internal-analysis/drafts').send({}),
      request(app).post('/api/funds/abc/internal-analysis/drafts/3/refresh').send({}),
      request(app).post('/api/funds/abc/internal-analysis/drafts/3/save').send({}),
      request(app).get('/api/funds/abc/internal-analysis/references'),
      request(app).get('/api/funds/abc/internal-analysis/references/11'),
      request(app).post('/api/funds/abc/internal-analysis/references/11/drafts').send({}),
      request(app).post('/api/admin/funds/abc/internal-analysis/quarterly-draft-run').send({}),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid parameter');
    }
    for (const mock of Object.values(service)) {
      expect(mock).not.toHaveBeenCalled();
    }
  });

  it('rejects a non-numeric draft or reference ID before service work', async () => {
    const app = buildApp();

    const responses = await Promise.all([
      request(app).get('/api/funds/1/internal-analysis/drafts/abc'),
      request(app).post('/api/funds/1/internal-analysis/drafts/abc/refresh').send({}),
      request(app).post('/api/funds/1/internal-analysis/drafts/abc/save').send({}),
      request(app).get('/api/funds/1/internal-analysis/references/abc'),
      request(app).post('/api/funds/1/internal-analysis/references/abc/drafts').send({}),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid parameter');
    }
    expect(service.getDraftById).not.toHaveBeenCalled();
    expect(service.getReferenceById).not.toHaveBeenCalled();
  });

  it('enforces requireAuth and requireFundAccess on every route', async () => {
    const app = buildApp();
    service.listDrafts.mockResolvedValue([]);
    service.listReferences.mockResolvedValue([]);
    service.getDraftById.mockResolvedValue(null);
    service.getReferenceById.mockResolvedValue(null);
    service.planQuarterlyDrafts.mockResolvedValue({ enqueued: 0, periods: [] });

    await request(app).get('/api/funds/1/internal-analysis/drafts');
    await request(app).get('/api/funds/1/internal-analysis/references');
    await request(app).post('/api/admin/funds/1/internal-analysis/quarterly-draft-run').send({});

    expect(authState.calls).toEqual([
      'requireAuth',
      'requireFundAccess',
      'requireAuth',
      'requireFundAccess',
      'requireAuth',
      'requireFundAccess',
    ]);
  });

  it('returns 401 when unauthenticated and 403 without fund access', async () => {
    authState.authenticated = false;
    await request(buildApp()).get('/api/funds/1/internal-analysis/drafts').expect(401);

    authState.authenticated = true;
    authState.fundAccess = false;
    await request(buildApp()).get('/api/funds/1/internal-analysis/drafts').expect(403);
  });

  it('serves drafts with no-store and a draft-scoped ETag', async () => {
    service.listDrafts.mockResolvedValue([draftRecord()]);
    const list = await request(buildApp()).get('/api/funds/1/internal-analysis/drafts');

    expect(list.status).toBe(200);
    expect(list.headers['cache-control']).toBe('private, no-store');
    expect(list.body.drafts).toHaveLength(1);
    expect(list.body.drafts[0].contractVersion).toBe('analysis-reference-snapshot-v1');

    service.getDraftById.mockResolvedValue(draftRecord());
    const detail = await request(buildApp()).get('/api/funds/1/internal-analysis/drafts/3');

    expect(detail.status).toBe(200);
    expect(detail.headers['etag']).toMatch(/^W\/"[a-f0-9]{16}"$/);
    expect(detail.body.draft.basis.financialFactsSnapshotId).toBe(41);
  });

  it('gives different drafts different ETags at the same version', async () => {
    service.getDraftById.mockResolvedValue(draftRecord({ draftId: 3, version: 1 }));
    const first = await request(buildApp()).get('/api/funds/1/internal-analysis/drafts/3');

    service.getDraftById.mockResolvedValue(draftRecord({ draftId: 4, version: 1 }));
    const second = await request(buildApp()).get('/api/funds/1/internal-analysis/drafts/4');

    expect(first.headers['etag']).not.toBe(second.headers['etag']);
  });

  it('404s a draft or reference that is not in this fund', async () => {
    service.getDraftById.mockResolvedValue(null);
    const draft = await request(buildApp()).get('/api/funds/1/internal-analysis/drafts/3');
    expect(draft.status).toBe(404);
    expect(draft.body.error).toBe('DRAFT_NOT_FOUND');

    service.getReferenceById.mockResolvedValue(null);
    const reference = await request(buildApp()).get('/api/funds/1/internal-analysis/references/11');
    expect(reference.status).toBe(404);
    expect(reference.body.error).toBe('REFERENCE_NOT_FOUND');
  });

  describe('If-Match preconditions', () => {
    it('requires If-Match on refresh and save (428)', async () => {
      service.getDraftById.mockResolvedValue(draftRecord());

      const refresh = await request(buildApp())
        .post('/api/funds/1/internal-analysis/drafts/3/refresh')
        .send({});
      expect(refresh.status).toBe(428);
      expect(refresh.body.error).toBe('PRECONDITION_REQUIRED');

      const save = await request(buildApp())
        .post('/api/funds/1/internal-analysis/drafts/3/save')
        .send({});
      expect(save.status).toBe(428);

      expect(service.refreshDraft).not.toHaveBeenCalled();
      expect(service.saveDraft).not.toHaveBeenCalled();
    });

    it('rejects a stale ETag with 412 and never touches the service', async () => {
      service.getDraftById.mockResolvedValue(draftRecord({ version: 2 }));

      const response = await request(buildApp())
        .post('/api/funds/1/internal-analysis/drafts/3/refresh')
        .set('If-Match', 'W/"0000000000000000"')
        .send({});

      expect(response.status).toBe(412);
      expect(response.body.error).toBe('PRECONDITION_FAILED');
      expect(service.refreshDraft).not.toHaveBeenCalled();
    });

    it('rotates the ETag when a refresh advances the basis', async () => {
      const before = await readDraftETag();

      service.getDraftById.mockResolvedValue(draftRecord({ version: 1 }));
      service.refreshDraft.mockResolvedValue(
        draftRecord({ version: 2, financialFactsSnapshotId: 42, forecastFundSnapshotId: 903 })
      );

      const response = await request(buildApp())
        .post('/api/funds/1/internal-analysis/drafts/3/refresh')
        .set('If-Match', before)
        .send({});

      expect(response.status).toBe(200);
      expect(response.headers['etag']).not.toBe(before);
      expect(response.body.draft.version).toBe(2);
      expect(response.body.draft.basis.financialFactsSnapshotId).toBe(42);
      expect(service.refreshDraft).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ fundId: 1, draftId: 3, expectedVersion: 1 })
      );
    });

    it('accepts a matching ETag on save', async () => {
      const etag = await readDraftETag();
      service.getDraftById.mockResolvedValue(draftRecord());
      service.saveDraft.mockResolvedValue(referenceRecord());

      const response = await request(buildApp())
        .post('/api/funds/1/internal-analysis/drafts/3/save')
        .set('If-Match', etag)
        .send({ acknowledgeMixedBasis: false });

      expect(response.status).toBe(201);
      expect(response.body.reference.referenceId).toBe(11);
      expect(response.body.reference.mixedBasisAtSave).toBe(false);
    });
  });

  it('maps MIXED_FACTS_BASIS to 409 with the mismatch details', async () => {
    const etag = await readDraftETag();
    service.getDraftById.mockResolvedValue(draftRecord());
    service.saveDraft.mockRejectedValue(
      new AnalysisCheckpointServiceError(
        409,
        'MIXED_FACTS_BASIS',
        'Pinned components do not all resolve to the draft facts basis.',
        {
          financialFactsSnapshotId: 41,
          mismatches: [{ component: 'forecast', id: 902, financialFactsSnapshotId: 40 }],
        }
      )
    );

    const response = await request(buildApp())
      .post('/api/funds/1/internal-analysis/drafts/3/save')
      .set('If-Match', etag)
      .send({});

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('MIXED_FACTS_BASIS');
    expect(response.body.details.mismatches).toHaveLength(1);
  });

  it('passes an explicit mixed-basis acknowledgement through to the service', async () => {
    const etag = await readDraftETag();
    service.getDraftById.mockResolvedValue(draftRecord());
    service.saveDraft.mockResolvedValue(referenceRecord({ mixedBasisAtSave: true }));

    const response = await request(buildApp())
      .post('/api/funds/1/internal-analysis/drafts/3/save')
      .set('If-Match', etag)
      .send({ acknowledgeMixedBasis: true });

    expect(response.status).toBe(201);
    expect(response.body.reference.mixedBasisAtSave).toBe(true);
    expect(service.saveDraft).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ acknowledgeMixedBasis: true })
    );
  });

  it('rejects an unknown key in the save body', async () => {
    const etag = await readDraftETag();
    service.getDraftById.mockResolvedValue(draftRecord());

    const response = await request(buildApp())
      .post('/api/funds/1/internal-analysis/drafts/3/save')
      .set('If-Match', etag)
      .send({ approve: true });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_analysis_save_request');
    expect(service.saveDraft).not.toHaveBeenCalled();
  });

  describe('draft creation', () => {
    it('rejects a quarterly period that is not a calendar quarter', async () => {
      const response = await request(buildApp())
        .post('/api/funds/1/internal-analysis/drafts')
        .send({ periodKind: 'quarterly', periodStart: '2026-04-01', periodEnd: '2026-07-31' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('invalid_analysis_period');
      expect(service.createDraftForPeriod).not.toHaveBeenCalled();
    });

    it('rejects a malformed body before service work', async () => {
      const response = await request(buildApp())
        .post('/api/funds/1/internal-analysis/drafts')
        .send({ periodStart: 'not-a-date', periodEnd: '2026-06-30' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('invalid_analysis_draft_request');
      expect(service.createDraftForPeriod).not.toHaveBeenCalled();
    });

    it('creates a manual-period draft and returns its ETag', async () => {
      service.createDraftForPeriod.mockResolvedValue(
        draftRecord({
          period: { periodKind: 'manual', periodStart: '2026-04-15', periodEnd: '2026-05-14' },
        })
      );

      const response = await request(buildApp())
        .post('/api/funds/1/internal-analysis/drafts')
        .send({ periodKind: 'manual', periodStart: '2026-04-15', periodEnd: '2026-05-14' });

      expect(response.status).toBe(201);
      expect(response.headers['etag']).toMatch(/^W\/"[a-f0-9]{16}"$/);
      expect(response.body.draft.period.periodKind).toBe('manual');
    });
  });

  describe('references', () => {
    it('lists terminal references by default and all when asked', async () => {
      service.listReferences.mockResolvedValue([referenceRecord()]);

      await request(buildApp()).get('/api/funds/1/internal-analysis/references');
      expect(service.listReferences).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ includeSuperseded: false })
      );

      await request(buildApp()).get(
        '/api/funds/1/internal-analysis/references?includeSuperseded=true'
      );
      expect(service.listReferences).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ includeSuperseded: true })
      );
    });

    it('surfaces the persisted mixed-basis flag and its revision history (R34-d)', async () => {
      service.getReferenceById.mockResolvedValue(referenceRecord({ mixedBasisAtSave: true }));
      service.listRevisionEvents.mockResolvedValue([
        {
          eventId: 1,
          fundId: 1,
          draftId: 3,
          referenceId: 11,
          eventType: 'mixed_basis_acknowledged',
          detail: { mismatches: [] },
          actorId: 7,
          createdAt: '2026-07-02T00:00:00.000Z',
        },
      ]);

      const response = await request(buildApp()).get(
        '/api/funds/1/internal-analysis/references/11'
      );

      expect(response.status).toBe(200);
      expect(response.body.reference.mixedBasisAtSave).toBe(true);
      // The contract requires revisionHistory; it also carries WHY the warning
      // is there.
      expect(response.body.revisionHistory).toHaveLength(1);
      expect(response.body.revisionHistory[0].eventType).toBe('mixed_basis_acknowledged');
    });

    it('starts a late-correction draft from a saved reference', async () => {
      service.startCorrectionDraft.mockResolvedValue(draftRecord({ sourceReferenceId: 11 }));

      const response = await request(buildApp())
        .post('/api/funds/1/internal-analysis/references/11/drafts')
        .send({});

      expect(response.status).toBe(201);
      expect(response.body.draft.sourceReferenceId).toBe(11);
    });

    it('maps a missing reference to 404', async () => {
      service.startCorrectionDraft.mockRejectedValue(
        new AnalysisCheckpointServiceError(
          404,
          'REFERENCE_NOT_FOUND',
          'Analysis reference not found.'
        )
      );

      const response = await request(buildApp())
        .post('/api/funds/1/internal-analysis/references/11/drafts')
        .send({});

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('REFERENCE_NOT_FOUND');
    });
  });

  describe('admin quarterly trigger', () => {
    it('plans only for the fund the route is scoped to', async () => {
      service.planQuarterlyDrafts.mockResolvedValue({ enqueued: 1, periods: [PERIOD] });

      const response = await request(buildApp())
        .post('/api/admin/funds/1/internal-analysis/quarterly-draft-run')
        .send({});

      expect(response.status).toBe(202);
      expect(response.body.enqueued).toBe(1);
      expect(service.planQuarterlyDrafts).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(Date),
        expect.objectContaining({ fundIds: [1] })
      );
    });

    it('rejects an explicit period combined with a lookback', async () => {
      const response = await request(buildApp())
        .post('/api/admin/funds/1/internal-analysis/quarterly-draft-run')
        .send({ periodStart: '2026-04-01', periodEnd: '2026-06-30', catchupDays: 90 });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('invalid_quarterly_draft_run_request');
      expect(service.planQuarterlyDrafts).not.toHaveBeenCalled();
    });

    it('forwards an explicit calendar-quarter period', async () => {
      service.planQuarterlyDrafts.mockResolvedValue({ enqueued: 1, periods: [PERIOD] });

      await request(buildApp())
        .post('/api/admin/funds/1/internal-analysis/quarterly-draft-run')
        .send({ periodStart: '2026-04-01', periodEnd: '2026-06-30' });

      expect(service.planQuarterlyDrafts).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(Date),
        expect.objectContaining({ period: PERIOD })
      );
    });
  });
});
