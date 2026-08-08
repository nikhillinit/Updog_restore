import { createHash } from 'node:crypto';

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
  replaceDraftEconomicsReference: vi.fn(),
  replaceDraftEconomicsReferenceWithReceipt: vi.fn(),
  refreshDraft: vi.fn(),
  refreshDraftWithReceipt: vi.fn(),
  saveDraft: vi.fn(),
  saveDraftWithReceipt: vi.fn(),
  startCorrectionDraft: vi.fn(),
  listReferences: vi.fn(),
  planQuarterlyDrafts: vi.fn(),
  getCurrentQuarterlyReview: vi.fn(),
  executeQuarterlyReviewItemCommand: vi.fn(),
  executeQuarterlyReviewWaiverCommand: vi.fn(),
}));

const narrativeService = vi.hoisted(() => ({
  appendNote: vi.fn(),
  createInternalNarrativePorts: vi.fn(),
  generateNarrative: vi.fn(),
  reviseNarrative: vi.fn(),
}));

const authState = vi.hoisted(() => ({
  authenticated: true,
  fundAccess: true,
  calls: [] as string[],
  role: 'admin',
  carrier: 'user' as 'user' | 'context',
}));

const fundScopeState = vi.hoisted(() => ({
  enforceProvidedFundScope: vi.fn(async (_req: Request, res: Response) => {
    if (!authState.fundAccess) {
      res.status(403).json({ error: 'Forbidden', code: 'FUND_ACCESS_DENIED' });
      return false;
    }
    return true;
  }),
}));

vi.mock('express-rate-limit', () => ({
  default: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../../../server/lib/auth/jwt', () => ({
  requireAuth: () => (req: Request, res: Response, next: NextFunction) => {
    authState.calls.push('requireAuth');
    if (!authState.authenticated) return res.sendStatus(401);
    if (authState.carrier === 'user') {
      req.user = {
        id: 7,
        sub: '7',
        role: authState.role,
        roles: [authState.role],
        fundIds: [1],
      } as never;
    } else {
      req.context = { userId: 7, role: authState.role } as never;
    }
    next();
  },
  requireFundAccess: (_req: Request, res: Response, next: NextFunction) => {
    authState.calls.push('requireFundAccess');
    if (!authState.fundAccess) return res.sendStatus(403);
    next();
  },
  requireWriteRole:
    (roles: readonly string[]) => (req: Request, res: Response, next: NextFunction) => {
      authState.calls.push(`requireWriteRole:${roles.join(',')}`);
      const role = req.user?.role ?? req.context?.role;
      if (typeof role !== 'string' || !roles.includes(role)) return res.sendStatus(403);
      next();
    },
  requireRole: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  verifyRequestCredential: async () => null,
  userFromClaims: () => ({}),
}));

vi.mock('../../../server/lib/auth/provided-fund-scope', () => ({
  enforceProvidedFundScope: fundScopeState.enforceProvidedFundScope,
}));

vi.mock('../../../server/services/internal-analysis/quarterly-review-service', () => {
  class MockQuarterlyReviewServiceError extends Error {
    constructor(
      readonly statusCode: number,
      readonly code: string,
      message: string,
      readonly details?: unknown
    ) {
      super(message);
    }
  }
  return {
    QuarterlyReviewServiceError: MockQuarterlyReviewServiceError,
    createQuarterlyReviewPorts: () => ({
      getCurrentReview: service.getCurrentQuarterlyReview,
    }),
    executeQuarterlyReviewItemCommand: service.executeQuarterlyReviewItemCommand,
    executeQuarterlyReviewWaiverCommand: service.executeQuarterlyReviewWaiverCommand,
  };
});

vi.mock('../../../server/services/internal-analysis/internal-narrative-draft-service', async () => {
  const actual = await vi.importActual<
    typeof import('../../../server/services/internal-analysis/internal-narrative-draft-service')
  >('../../../server/services/internal-analysis/internal-narrative-draft-service');
  return {
    ...actual,
    appendNote: narrativeService.appendNote,
    createInternalNarrativePorts: narrativeService.createInternalNarrativePorts,
    generateNarrative: narrativeService.generateNarrative,
    reviseNarrative: narrativeService.reviseNarrative,
  };
});

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
    replaceDraftEconomicsReference: service.replaceDraftEconomicsReference,
    replaceDraftEconomicsReferenceWithReceipt: service.replaceDraftEconomicsReferenceWithReceipt,
    refreshDraft: service.refreshDraft,
    refreshDraftWithReceipt: service.refreshDraftWithReceipt,
    saveDraft: service.saveDraft,
    saveDraftWithReceipt: service.saveDraftWithReceipt,
    startCorrectionDraft: service.startCorrectionDraft,
    listReferences: service.listReferences,
    planQuarterlyDrafts: service.planQuarterlyDrafts,
  };
});

import internalAnalysisRouter from '../../../server/routes/internal-analysis';
import { AnalysisCheckpointServiceError } from '../../../server/services/internal-analysis/analysis-checkpoint-service';
import { QuarterlyReviewServiceError } from '../../../server/services/internal-analysis/quarterly-review-service';

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
  authState.role = 'admin';
  authState.carrier = 'user';
  fundScopeState.enforceProvidedFundScope.mockClear();
  for (const mock of Object.values(service)) mock.mockReset();
  for (const mock of Object.values(narrativeService)) mock.mockReset();
});

describe('internal-analysis route contract', () => {
  it('denies restricted principals before narrative and note mutations', async () => {
    authState.role = 'lp';

    const responses = await Promise.all([
      request(buildApp())
        .post('/api/funds/1/internal-analysis/narratives/generate')
        .send({ analysisDraftId: 3 }),
      request(buildApp())
        .post('/api/funds/1/internal-analysis/narratives/revise')
        .send({
          analysisDraftId: 3,
          claims: [
            {
              body: 'Commentary',
              authorship: 'user_authored_commentary',
              source: null,
            },
          ],
        }),
      request(buildApp())
        .post('/api/funds/1/internal-analysis/notes')
        .send({ analysisDraftId: 3, body: 'Note' }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([403, 403, 403]);
    expect(narrativeService.generateNarrative).not.toHaveBeenCalled();
    expect(narrativeService.reviseNarrative).not.toHaveBeenCalled();
    expect(narrativeService.appendNote).not.toHaveBeenCalled();
  });

  it.each(['partner', 'admin', 'analyst'])(
    'allows %s through narrative and note writes',
    async (role) => {
      authState.role = role;
      const basis = {
        financialFactsSnapshotId: 41,
        knowledgeCutoff: new Date('2026-07-02T00:00:00.000Z'),
        forecastFundSnapshotId: 902,
      };
      narrativeService.createInternalNarrativePorts.mockReturnValue({
        getAnchorBasis: vi.fn().mockResolvedValue(basis),
      });
      narrativeService.generateNarrative.mockResolvedValue({
        narrativeDraftId: 7,
        fundId: 1,
        anchor: { kind: 'analysis_draft', id: 3 },
        revision: 1,
        supersedesDraftId: null,
        createdBy: 7,
        createdAt: new Date('2026-07-03T00:00:00.000Z'),
        claims: [],
      });
      narrativeService.reviseNarrative.mockResolvedValue({
        narrativeDraftId: 8,
        fundId: 1,
        anchor: { kind: 'analysis_draft', id: 3 },
        revision: 2,
        supersedesDraftId: 7,
        createdBy: 7,
        createdAt: new Date('2026-07-03T00:00:00.000Z'),
        claims: [],
      });
      narrativeService.appendNote.mockResolvedValue({
        noteId: 9,
        fundId: 1,
        anchor: { kind: 'analysis_draft', id: 3 },
        body: 'Note',
        supersedesNoteId: null,
        createdBy: 7,
        createdAt: new Date('2026-07-03T00:00:00.000Z'),
      });

      const generate = await request(buildApp())
        .post('/api/funds/1/internal-analysis/narratives/generate')
        .send({ analysisDraftId: 3 });
      const revise = await request(buildApp())
        .post('/api/funds/1/internal-analysis/narratives/revise')
        .send({
          analysisDraftId: 3,
          claims: [
            {
              body: 'Commentary',
              authorship: 'user_authored_commentary',
              source: null,
            },
          ],
        });
      const note = await request(buildApp())
        .post('/api/funds/1/internal-analysis/notes')
        .send({ analysisDraftId: 3, body: 'Note' });

      expect(generate.status).toBe(201);
      expect(revise.status).toBe(201);
      expect(note.status).toBe(201);
    }
  );

  it.each([
    {
      name: 'item update',
      send: (key: string) =>
        request(buildApp())
          .patch('/api/funds/1/internal-analysis/drafts/3/quarterly-review/companies/20/items/kpis')
          .set('If-Match', 'W/"item"')
          .set('Idempotency-Key', key)
          .send({ state: 'reviewed_no_change', note: 'Reviewed' }),
      serviceMock: service.executeQuarterlyReviewItemCommand,
    },
    {
      name: 'waiver',
      send: (key: string) =>
        request(buildApp())
          .post('/api/funds/1/internal-analysis/drafts/3/quarterly-review/companies/20/waiver')
          .set('If-Match', 'W/"company"')
          .set('Idempotency-Key', key)
          .send({ reason: 'Reviewed by waiver authority' }),
      serviceMock: service.executeQuarterlyReviewWaiverCommand,
    },
    {
      name: 'economics-reference replacement',
      send: (key: string) =>
        request(buildApp())
          .patch('/api/funds/1/internal-analysis/drafts/3/economics-reference')
          .set('If-Match', 'W/"draft"')
          .set('Idempotency-Key', key)
          .send({ economicsReferenceId: null }),
      serviceMock: service.replaceDraftEconomicsReferenceWithReceipt,
    },
    {
      name: 'refresh',
      send: (key: string) =>
        request(buildApp())
          .post('/api/funds/1/internal-analysis/drafts/3/refresh')
          .set('If-Match', 'W/"draft"')
          .set('Idempotency-Key', key)
          .send({}),
      serviceMock: service.refreshDraftWithReceipt,
    },
    {
      name: 'save',
      send: (key: string) =>
        request(buildApp())
          .post('/api/funds/1/internal-analysis/drafts/3/save')
          .set('If-Match', 'W/"draft"')
          .set('Idempotency-Key', key)
          .send({ acknowledgeMixedBasis: false }),
      serviceMock: service.saveDraftWithReceipt,
    },
  ])(
    'rejects blank and oversized Idempotency-Key before $name service work',
    async ({ send, serviceMock }) => {
      for (const invalidKey of ['', 'x'.repeat(129)]) {
        const response = await send(invalidKey);

        expect(response.status).toBe(400);
        expect(response.body).toEqual({
          error: 'INVALID_IDEMPOTENCY_KEY',
          message: 'Idempotency-Key must contain 1 to 128 RFC token characters.',
        });
      }
      expect(serviceMock).not.toHaveBeenCalled();
    }
  );

  it.each(['user', 'context'] as const)(
    'allows exact item write roles and denies non-writers through %s carrier',
    async (carrier) => {
      authState.carrier = carrier;
      service.executeQuarterlyReviewItemCommand.mockResolvedValue({
        receiptId: 80,
        operation: 'review_item_update',
        draftId: 3,
        targetId: 30,
        resultingRowVersion: 2,
      });
      for (const role of ['partner', 'admin', 'analyst']) {
        authState.role = role;
        await request(buildApp())
          .patch('/api/funds/1/internal-analysis/drafts/3/quarterly-review/companies/20/items/kpis')
          .set('If-Match', 'W/"item"')
          .set('Idempotency-Key', `item-${carrier}-${role}`)
          .send({ state: 'reviewed_no_change', note: 'Reviewed' })
          .expect(200);
      }
      for (const role of ['viewer', 'operator', 'service']) {
        authState.role = role;
        await request(buildApp())
          .patch('/api/funds/1/internal-analysis/drafts/3/quarterly-review/companies/20/items/kpis')
          .set('If-Match', 'W/"item"')
          .set('Idempotency-Key', `item-${carrier}-${role}`)
          .send({ state: 'reviewed_no_change', note: 'Reviewed' })
          .expect(403);
      }
    }
  );

  it.each(['user', 'context'] as const)(
    'enforces investment-team roles on every draft command through %s carrier',
    async (carrier) => {
      authState.carrier = carrier;
      service.createDraftForPeriod.mockResolvedValue(draftRecord());
      service.startCorrectionDraft.mockResolvedValue(draftRecord());
      service.refreshDraftWithReceipt.mockResolvedValue({
        receiptId: 70,
        operation: 'draft_refresh',
        draftId: 3,
        targetId: 3,
        resultingDraftVersion: 2,
      });
      service.replaceDraftEconomicsReferenceWithReceipt.mockResolvedValue({
        receiptId: 71,
        operation: 'economics_reference_replace',
        draftId: 3,
        targetId: 3,
        resultingDraftVersion: 2,
      });
      service.saveDraftWithReceipt.mockResolvedValue(referenceRecord());

      for (const role of ['partner', 'admin', 'analyst', 'viewer', 'operator', 'service']) {
        authState.role = role;
        const expectedWriteStatus = ['partner', 'admin', 'analyst'].includes(role) ? 200 : 403;
        const expectedCreateStatus = expectedWriteStatus === 200 ? 201 : 403;

        await request(buildApp())
          .post('/api/funds/1/internal-analysis/drafts')
          .send({
            periodKind: 'quarterly',
            periodStart: '2026-04-01',
            periodEnd: '2026-06-30',
          })
          .expect(expectedCreateStatus);
        await request(buildApp())
          .post('/api/funds/1/internal-analysis/references/9/drafts')
          .expect(expectedCreateStatus);
        await request(buildApp())
          .post('/api/funds/1/internal-analysis/drafts/3/refresh')
          .set('If-Match', 'W/"draft"')
          .set('Idempotency-Key', `refresh-${carrier}-${role}`)
          .expect(expectedWriteStatus);
        await request(buildApp())
          .patch('/api/funds/1/internal-analysis/drafts/3/economics-reference')
          .set('If-Match', 'W/"draft"')
          .set('Idempotency-Key', `economics-${carrier}-${role}`)
          .send({ economicsReferenceId: null })
          .expect(expectedWriteStatus);
        await request(buildApp())
          .post('/api/funds/1/internal-analysis/drafts/3/save')
          .set('If-Match', 'W/"draft"')
          .set('Idempotency-Key', `save-${carrier}-${role}`)
          .send({ acknowledgeMixedBasis: false })
          .expect(expectedCreateStatus);
      }
    }
  );

  it('maps corrupt quarterly review GET to safe 409 details plus current draft ETag', async () => {
    service.getCurrentQuarterlyReview.mockRejectedValue(
      new QuarterlyReviewServiceError(409, 'QUARTERLY_REVIEW_ROSTER_CORRUPT', 'Corrupt roster', {
        draftId: 3,
        draftVersion: 2,
        financialFactsSnapshotId: 41,
        expectedCompanyCount: 2,
        actualCompanyCount: 1,
      })
    );

    const response = await request(buildApp()).get(
      '/api/funds/1/internal-analysis/drafts/3/quarterly-review'
    );

    expect(response.status).toBe(409);
    expect(response.headers['etag']).toMatch(/^W\/"[a-f0-9]{16}"$/);
    expect(response.body).toEqual({
      error: 'QUARTERLY_REVIEW_ROSTER_CORRUPT',
      message: 'Corrupt roster',
      details: {
        draftId: 3,
        draftVersion: 2,
        financialFactsSnapshotId: 41,
        expectedCompanyCount: 2,
        actualCompanyCount: 1,
      },
    });
  });

  it('adds current draft ETag to corrupt economics, item, waiver, and save responses', async () => {
    const details = {
      draftId: 3,
      draftVersion: 2,
      financialFactsSnapshotId: 41,
      expectedCompanyCount: 2,
      actualCompanyCount: 1,
    };
    const checkpointError = () =>
      new AnalysisCheckpointServiceError(
        409,
        'QUARTERLY_REVIEW_ROSTER_CORRUPT',
        'Corrupt roster',
        details
      );
    const reviewError = () =>
      new QuarterlyReviewServiceError(
        409,
        'QUARTERLY_REVIEW_ROSTER_CORRUPT',
        'Corrupt roster',
        details
      );
    service.replaceDraftEconomicsReferenceWithReceipt.mockRejectedValueOnce(checkpointError());
    service.executeQuarterlyReviewItemCommand.mockRejectedValueOnce(reviewError());
    service.executeQuarterlyReviewWaiverCommand.mockRejectedValueOnce(reviewError());
    service.saveDraftWithReceipt.mockRejectedValueOnce(checkpointError());

    const responses = await Promise.all([
      request(buildApp())
        .patch('/api/funds/1/internal-analysis/drafts/3/economics-reference')
        .set('If-Match', 'W/"draft"')
        .set('Idempotency-Key', 'corrupt-economics')
        .send({ economicsReferenceId: 9 }),
      request(buildApp())
        .patch('/api/funds/1/internal-analysis/drafts/3/quarterly-review/companies/20/items/kpis')
        .set('If-Match', 'W/"item"')
        .set('Idempotency-Key', 'corrupt-item')
        .send({ state: 'reviewed_no_change', note: 'Reviewed' }),
      request(buildApp())
        .post('/api/funds/1/internal-analysis/drafts/3/quarterly-review/companies/20/waiver')
        .set('If-Match', 'W/"company"')
        .set('Idempotency-Key', 'corrupt-waiver')
        .send({ reason: 'Waiver reason' }),
      request(buildApp())
        .post('/api/funds/1/internal-analysis/drafts/3/save')
        .set('If-Match', 'W/"draft"')
        .set('Idempotency-Key', 'corrupt-save')
        .send({ acknowledgeMixedBasis: false }),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(409);
      expect(response.body.error).toBe('QUARTERLY_REVIEW_ROSTER_CORRUPT');
      expect(response.headers['etag']).toMatch(/^W\/"[a-f0-9]{16}"$/);
    }
  });

  it('adds current draft ETag to stale quarterly-review basis conflicts', async () => {
    const details = {
      draftId: 3,
      draftVersion: 2,
      financialFactsSnapshotId: 42,
    };
    service.executeQuarterlyReviewItemCommand.mockRejectedValueOnce(
      new QuarterlyReviewServiceError(
        412,
        'QUARTERLY_REVIEW_BASIS_CONFLICT',
        'Quarterly review basis changed since it was read.',
        details
      )
    );

    const response = await request(buildApp())
      .patch('/api/funds/1/internal-analysis/drafts/3/quarterly-review/companies/20/items/kpis')
      .set('If-Match', 'W/"item"')
      .set('Idempotency-Key', 'stale-basis')
      .send({ state: 'reviewed_no_change', note: 'Reviewed' });

    expect(response.status).toBe(412);
    expect(response.body.error).toBe('QUARTERLY_REVIEW_BASIS_CONFLICT');
    expect(response.headers['etag']).toBe(
      `W/"${createHash('sha256')
        .update('internal-analysis-draft:1:3:2')
        .digest('hex')
        .slice(0, 16)}"`
    );
  });

  it.each([
    {
      name: 'item update',
      send: () =>
        request(buildApp())
          .patch(
            `/api/funds/1/internal-analysis/drafts/3/quarterly-review/companies/${Number.MAX_SAFE_INTEGER}/items/kpis`
          )
          .set('If-Match', 'W/"item"')
          .set('Idempotency-Key', 'item-out-of-range')
          .send({ state: 'reviewed_no_change', note: 'Reviewed' }),
      serviceMock: service.executeQuarterlyReviewItemCommand,
    },
    {
      name: 'waiver',
      send: () =>
        request(buildApp())
          .post(
            `/api/funds/1/internal-analysis/drafts/3/quarterly-review/companies/${Number.MAX_SAFE_INTEGER}/waiver`
          )
          .set('If-Match', 'W/"company"')
          .set('Idempotency-Key', 'waiver-out-of-range')
          .send({ reason: 'Reviewed by waiver authority' }),
      serviceMock: service.executeQuarterlyReviewWaiverCommand,
    },
  ])(
    'rejects PostgreSQL-integer overflow before $name service work',
    async ({ send, serviceMock }) => {
      const response = await send();

      expect(response.status).toBe(400);
      expect(serviceMock).not.toHaveBeenCalled();
    }
  );

  it('rejects oversized followUpTaskId before quarterly-review item service work', async () => {
    const response = await request(buildApp())
      .patch('/api/funds/1/internal-analysis/drafts/3/quarterly-review/companies/20/items/kpis')
      .set('If-Match', 'W/"item"')
      .set('Idempotency-Key', 'follow-up-overflow')
      .send({
        state: 'changed',
        note: 'Updated assumptions.',
        changeReference: {
          kind: 'internal_route',
          path: '/portfolio/company/100',
          label: 'Company detail',
        },
        followUpTaskId: 2_147_483_648,
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_quarterly_review_item_request');
    expect(service.executeQuarterlyReviewItemCommand).not.toHaveBeenCalled();
  });

  it.each(['user', 'context'] as const)(
    'allows waiver only to partner/admin through %s carrier',
    async (carrier) => {
      authState.carrier = carrier;
      service.executeQuarterlyReviewWaiverCommand.mockResolvedValue({
        receiptId: 81,
        operation: 'company_waive',
        draftId: 3,
        targetId: 20,
        resultingRowVersion: 2,
      });
      for (const role of ['partner', 'admin']) {
        authState.role = role;
        await request(buildApp())
          .post('/api/funds/1/internal-analysis/drafts/3/quarterly-review/companies/20/waiver')
          .set('If-Match', 'W/"company"')
          .set('Idempotency-Key', `waiver-${carrier}-${role}`)
          .send({ reason: 'Reviewed by waiver authority' })
          .expect(200);
      }
      for (const role of ['analyst', 'viewer', 'operator', 'service']) {
        authState.role = role;
        await request(buildApp())
          .post('/api/funds/1/internal-analysis/drafts/3/quarterly-review/companies/20/waiver')
          .set('If-Match', 'W/"company"')
          .set('Idempotency-Key', `waiver-${carrier}-${role}`)
          .send({ reason: 'Not authorized' })
          .expect(403);
      }
    }
  );

  it('restricts interactive draft creation to exact investment-team write roles', async () => {
    service.createDraftForPeriod.mockResolvedValue(draftRecord());

    await request(buildApp())
      .post('/api/funds/1/internal-analysis/drafts')
      .send({ periodKind: 'quarterly', periodStart: '2026-04-01', periodEnd: '2026-06-30' });

    expect(authState.calls).toContain('requireWriteRole:partner,admin,analyst');
  });

  it('rejects a non-numeric fund ID on every route before service work', async () => {
    const app = buildApp();

    const responses = await Promise.all([
      request(app).get('/api/funds/abc/internal-analysis/drafts'),
      request(app).get('/api/funds/abc/internal-analysis/drafts/3'),
      request(app).post('/api/funds/abc/internal-analysis/drafts').send({}),
      request(app)
        .patch('/api/funds/abc/internal-analysis/drafts/3/economics-reference')
        .send({ economicsReferenceId: 9 }),
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

  it('rejects PostgreSQL-integer fundId overflow before quarterly-review service work', async () => {
    const response = await request(buildApp()).get(
      '/api/funds/2147483648/internal-analysis/drafts/3/quarterly-review'
    );

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid parameter');
    expect(service.getCurrentQuarterlyReview).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric draft or reference ID before service work', async () => {
    const app = buildApp();

    const responses = await Promise.all([
      request(app).get('/api/funds/1/internal-analysis/drafts/abc'),
      request(app)
        .patch('/api/funds/1/internal-analysis/drafts/abc/economics-reference')
        .send({ economicsReferenceId: 9 }),
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

  it('rejects PostgreSQL-integer referenceId overflow before detail or correction service work', async () => {
    const app = buildApp();
    const responses = await Promise.all([
      request(app).get('/api/funds/1/internal-analysis/references/2147483648'),
      request(app).post('/api/funds/1/internal-analysis/references/2147483648/drafts').send({}),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid parameter');
    }
    expect(service.getReferenceById).not.toHaveBeenCalled();
    expect(service.startCorrectionDraft).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'quarterly review GET',
      send: () =>
        request(buildApp()).get(
          '/api/funds/1/internal-analysis/drafts/2147483648/quarterly-review'
        ),
      serviceMock: service.getCurrentQuarterlyReview,
    },
    {
      name: 'economics-reference replacement',
      send: () =>
        request(buildApp())
          .patch('/api/funds/1/internal-analysis/drafts/2147483648/economics-reference')
          .set('If-Match', 'W/"draft"')
          .set('Idempotency-Key', 'econ-draft-overflow')
          .send({ economicsReferenceId: null }),
      serviceMock: service.replaceDraftEconomicsReferenceWithReceipt,
    },
    {
      name: 'refresh',
      send: () =>
        request(buildApp())
          .post('/api/funds/1/internal-analysis/drafts/2147483648/refresh')
          .set('If-Match', 'W/"draft"')
          .set('Idempotency-Key', 'refresh-draft-overflow')
          .send({}),
      serviceMock: service.refreshDraftWithReceipt,
    },
    {
      name: 'save',
      send: () =>
        request(buildApp())
          .post('/api/funds/1/internal-analysis/drafts/2147483648/save')
          .set('If-Match', 'W/"draft"')
          .set('Idempotency-Key', 'save-draft-overflow')
          .send({ acknowledgeMixedBasis: false }),
      serviceMock: service.saveDraftWithReceipt,
    },
  ])(
    'rejects PostgreSQL-integer draftId overflow before $name service work',
    async ({ send, serviceMock }) => {
      const response = await send();

      expect(response.status).toBe(400);
      expect(serviceMock).not.toHaveBeenCalled();
    }
  );

  it('rejects PostgreSQL-integer economicsReferenceId overflow before service work', async () => {
    const response = await request(buildApp())
      .patch('/api/funds/1/internal-analysis/drafts/3/economics-reference')
      .set('If-Match', 'W/"draft"')
      .set('Idempotency-Key', 'econ-target-overflow')
      .send({ economicsReferenceId: 2_147_483_648 });

    expect(response.status).toBe(400);
    expect(service.replaceDraftEconomicsReferenceWithReceipt).not.toHaveBeenCalled();
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
    it('requires If-Match on economics-reference replacement (428)', async () => {
      service.getDraftById.mockResolvedValue(draftRecord());

      const response = await request(buildApp())
        .patch('/api/funds/1/internal-analysis/drafts/3/economics-reference')
        .send({ economicsReferenceId: 9 });

      expect(response.status).toBe(428);
      expect(response.body.error).toBe('PRECONDITION_REQUIRED');
      expect(service.replaceDraftEconomicsReference).not.toHaveBeenCalled();
    });

    it('rejects a stale economics-reference ETag before mutation (412)', async () => {
      service.replaceDraftEconomicsReferenceWithReceipt.mockRejectedValue(
        new AnalysisCheckpointServiceError(412, 'DRAFT_VERSION_CONFLICT', 'Stale')
      );

      const response = await request(buildApp())
        .patch('/api/funds/1/internal-analysis/drafts/3/economics-reference')
        .set('If-Match', 'W/"0000000000000000"')
        .set('Idempotency-Key', 'econ-stale')
        .send({ economicsReferenceId: 9 });

      expect(response.status).toBe(412);
      expect(service.replaceDraftEconomicsReferenceWithReceipt).toHaveBeenCalledOnce();
    });

    it.each([{ economicsReferenceId: 9 }, { economicsReferenceId: null }])(
      'replaces economics reference and rotates ETag for $economicsReferenceId',
      async (body) => {
        const before = await readDraftETag();
        service.replaceDraftEconomicsReferenceWithReceipt.mockResolvedValue({
          receiptId: 71,
          operation: 'economics_reference_replace',
          draftId: 3,
          targetId: 3,
          resultingDraftVersion: 2,
        });

        const response = await request(buildApp())
          .patch('/api/funds/1/internal-analysis/drafts/3/economics-reference')
          .set('If-Match', before)
          .set('Idempotency-Key', `econ-${String(body.economicsReferenceId)}`)
          .send(body);

        expect(response.status).toBe(200);
        expect(response.body.result.resultingDraftVersion).toBe(2);
        expect(service.replaceDraftEconomicsReferenceWithReceipt).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            fundId: 1,
            draftId: 3,
            economicsReferenceId: body.economicsReferenceId,
          })
        );
      }
    );

    it('replays retry with the consumed economics-reference ETag and caller key', async () => {
      const before = await readDraftETag();
      service.replaceDraftEconomicsReferenceWithReceipt.mockResolvedValue({
        receiptId: 71,
        operation: 'economics_reference_replace',
        draftId: 3,
        targetId: 3,
        resultingDraftVersion: 2,
      });

      await request(buildApp())
        .patch('/api/funds/1/internal-analysis/drafts/3/economics-reference')
        .set('If-Match', before)
        .set('Idempotency-Key', 'econ-replay')
        .send({ economicsReferenceId: 9 })
        .expect(200);

      const retry = await request(buildApp())
        .patch('/api/funds/1/internal-analysis/drafts/3/economics-reference')
        .set('If-Match', before)
        .set('Idempotency-Key', 'econ-replay')
        .send({ economicsReferenceId: 9 });

      expect(retry.status).toBe(200);
      expect(retry.body.result.receiptId).toBe(71);
    });

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
      service.refreshDraftWithReceipt.mockRejectedValue(
        new AnalysisCheckpointServiceError(412, 'DRAFT_VERSION_CONFLICT', 'Stale')
      );

      const response = await request(buildApp())
        .post('/api/funds/1/internal-analysis/drafts/3/refresh')
        .set('If-Match', 'W/"0000000000000000"')
        .set('Idempotency-Key', 'refresh-stale')
        .send({});

      expect(response.status).toBe(412);
      expect(response.body.error).toBe('DRAFT_VERSION_CONFLICT');
    });

    it('rotates the ETag when a refresh advances the basis', async () => {
      const before = await readDraftETag();

      service.refreshDraftWithReceipt.mockResolvedValue({
        receiptId: 72,
        operation: 'draft_refresh',
        draftId: 3,
        targetId: 3,
        resultingDraftVersion: 2,
      });

      const response = await request(buildApp())
        .post('/api/funds/1/internal-analysis/drafts/3/refresh')
        .set('If-Match', before)
        .set('Idempotency-Key', 'refresh-success')
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.result.resultingDraftVersion).toBe(2);
      expect(service.refreshDraftWithReceipt).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ fundId: 1, draftId: 3 })
      );
    });

    it('requires Idempotency-Key on refresh after a valid If-Match', async () => {
      const etag = await readDraftETag();
      service.getDraftById.mockResolvedValue(draftRecord());

      const response = await request(buildApp())
        .post('/api/funds/1/internal-analysis/drafts/3/refresh')
        .set('If-Match', etag)
        .send({});

      expect(response.status).toBe(428);
      expect(response.body.error).toBe('PRECONDITION_REQUIRED');
      expect(service.refreshDraftWithReceipt).not.toHaveBeenCalled();
    });

    it('accepts a matching ETag on save', async () => {
      const etag = await readDraftETag();
      service.getDraftById.mockResolvedValue(draftRecord());
      service.saveDraftWithReceipt.mockResolvedValue(referenceRecord());

      const response = await request(buildApp())
        .post('/api/funds/1/internal-analysis/drafts/3/save')
        .set('If-Match', etag)
        .set('Idempotency-Key', 'save-success')
        .send({ acknowledgeMixedBasis: false });

      expect(response.status).toBe(201);
      expect(response.body.reference.referenceId).toBe(11);
      expect(response.body.reference.mixedBasisAtSave).toBe(false);
    });

    it('requires Idempotency-Key on save after a valid If-Match', async () => {
      const etag = await readDraftETag();
      service.getDraftById.mockResolvedValue(draftRecord());

      const response = await request(buildApp())
        .post('/api/funds/1/internal-analysis/drafts/3/save')
        .set('If-Match', etag)
        .send({ acknowledgeMixedBasis: false });

      expect(response.status).toBe(428);
      expect(service.saveDraftWithReceipt).not.toHaveBeenCalled();
    });
  });

  it.each([
    {},
    { economicsReferenceId: 0 },
    { economicsReferenceId: '9' },
    { economicsReferenceId: 9, unexpected: true },
  ])('rejects an invalid economics-reference body %#', async (body) => {
    const etag = await readDraftETag();
    const response = await request(buildApp())
      .patch('/api/funds/1/internal-analysis/drafts/3/economics-reference')
      .set('If-Match', etag)
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_analysis_economics_reference_request');
    expect(service.replaceDraftEconomicsReference).not.toHaveBeenCalled();
  });

  it.each([
    [404, 'ECONOMICS_RUN_NOT_FOUND'],
    [409, 'ECONOMICS_RUN_NOT_COMPLETED'],
    [409, 'DRAFT_ALREADY_SAVED'],
    [412, 'DRAFT_VERSION_CONFLICT'],
  ] as const)('maps economics-reference service error %s %s', async (statusCode, code) => {
    const etag = await readDraftETag();
    service.getDraftById.mockResolvedValue(draftRecord());
    service.replaceDraftEconomicsReferenceWithReceipt.mockRejectedValue(
      new AnalysisCheckpointServiceError(statusCode, code, 'Rejected')
    );

    const response = await request(buildApp())
      .patch('/api/funds/1/internal-analysis/drafts/3/economics-reference')
      .set('If-Match', etag)
      .set('Idempotency-Key', `econ-error-${code}`)
      .send({ economicsReferenceId: 9 });

    expect(response.status).toBe(statusCode);
    expect(response.body.error).toBe(code);
  });

  it('maps MIXED_FACTS_BASIS to 409 with the mismatch details', async () => {
    const etag = await readDraftETag();
    service.getDraftById.mockResolvedValue(draftRecord());
    service.saveDraftWithReceipt.mockRejectedValue(
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
      .set('Idempotency-Key', 'save-mixed-error')
      .send({});

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('MIXED_FACTS_BASIS');
    expect(response.body.details.mismatches).toHaveLength(1);
  });

  it('passes an explicit mixed-basis acknowledgement through to the service', async () => {
    const etag = await readDraftETag();
    service.getDraftById.mockResolvedValue(draftRecord());
    service.saveDraftWithReceipt.mockResolvedValue(referenceRecord({ mixedBasisAtSave: true }));

    const response = await request(buildApp())
      .post('/api/funds/1/internal-analysis/drafts/3/save')
      .set('If-Match', etag)
      .set('Idempotency-Key', 'save-mixed-ack')
      .send({ acknowledgeMixedBasis: true });

    expect(response.status).toBe(201);
    expect(response.body.reference.mixedBasisAtSave).toBe(true);
    expect(service.saveDraftWithReceipt).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ acknowledgeMixedBasis: true, idempotencyKey: 'save-mixed-ack' })
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
    expect(service.saveDraftWithReceipt).not.toHaveBeenCalled();
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
