import express from 'express';
import type { Request, Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { KPI_CSV_TEMPLATE_HEADER } from '../../../shared/contracts/kpi/kpi-observation-v1.contract';

const fundScopeState = vi.hoisted(() => ({
  enforceProvidedFundScope: vi.fn(async (_req: Request, _res: Response, _fundId: number) => true),
}));

const serviceState = vi.hoisted(() => ({
  createKpiObservation: vi.fn(),
  listKpiObservations: vi.fn(),
  loadKpiObservation: vi.fn(),
  reviewKpiObservation: vi.fn(),
}));

vi.mock('../../../server/lib/auth/provided-fund-scope', () => ({
  enforceProvidedFundScope: fundScopeState.enforceProvidedFundScope,
}));

vi.mock('../../../server/services/kpi/kpi-observation-service', async () => {
  const actual = await vi.importActual<
    typeof import('../../../server/services/kpi/kpi-observation-service')
  >('../../../server/services/kpi/kpi-observation-service');
  return {
    ...actual,
    createKpiObservation: serviceState.createKpiObservation,
    listKpiObservations: serviceState.listKpiObservations,
    loadKpiObservation: serviceState.loadKpiObservation,
    reviewKpiObservation: serviceState.reviewKpiObservation,
  };
});

import kpiObservationsRouter from '../../../server/routes/kpi-observations';
import { KpiObservationServiceError } from '../../../server/services/kpi/kpi-observation-service';

const AT = new Date('2026-07-06T00:00:00.000Z');

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 9,
    fundId: 1,
    portfolioCompanyId: 4,
    metric: 'revenue_arr',
    periodStart: '2026-04-01',
    periodEnd: '2026-06-30',
    basis: 'actual',
    valueKind: 'money',
    valueAmount: '2100000.000000',
    valueDate: null,
    valueText: null,
    companyKpiLabel: null,
    source: 'manual',
    sourceLabel: null,
    comment: null,
    submittedAt: AT,
    reviewStatus: 'pending',
    reviewComment: null,
    reviewedBy: null,
    reviewedAt: null,
    version: 1,
    idempotencyKey: 'kpi-1',
    requestHash: 'hash',
    createdBy: null,
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

/** A full contract observation; the import route re-validates what it serves. */
const OBSERVATION = {
  contractVersion: 'kpi-observation/1.0.0',
  observationId: 9,
  fundId: 1,
  portfolioCompanyId: 4,
  metric: 'revenue_arr',
  periodStart: '2026-04-01',
  periodEnd: '2026-06-30',
  basis: 'actual',
  value: { valueKind: 'money', amountUsd: '2100000.000000' },
  companyKpiLabel: null,
  source: 'csv_import',
  sourceLabel: 'Q2 collection',
  comment: null,
  submittedAt: '2026-07-05T00:00:00.000Z',
  reviewStatus: 'pending',
  reviewComment: null,
  reviewedAt: null,
  version: 1,
  createdAt: '2026-07-06T00:00:00.000Z',
  updatedAt: '2026-07-06T00:00:00.000Z',
} as const;

const CREATE_BODY = {
  portfolioCompanyId: 4,
  metric: 'revenue_arr',
  periodStart: '2026-04-01',
  periodEnd: '2026-06-30',
  basis: 'actual',
  value: { valueKind: 'money', amountUsd: '2100000.000000' },
  submittedAt: '2026-07-05T09:00:00.000Z',
};

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(kpiObservationsRouter);
  app.use((_req, res) => res.status(404).json({ error: 'not_found' }));
  return app;
}

function csvBase64(...rows: string[]): string {
  return Buffer.from([KPI_CSV_TEMPLATE_HEADER.join(','), ...rows].join('\n'), 'utf8').toString(
    'base64'
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fundScopeState.enforceProvidedFundScope.mockImplementation(async () => true);
});

describe('KPI observation routes', () => {
  it('rejects a non-numeric fund id before touching the service', async () => {
    const response = await request(makeApp()).get('/api/funds/abc/kpi-observations');

    expect(response.status).toBe(400);
    expect(serviceState.listKpiObservations).not.toHaveBeenCalled();
  });

  it('rejects an unsupported list filter', async () => {
    const response = await request(makeApp()).get('/api/funds/1/kpi-observations?sortBy=value');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_KPI_OBSERVATION_QUERY');
  });

  it('passes parsed filters through and never caches the response', async () => {
    serviceState.listKpiObservations.mockResolvedValue([]);
    const response = await request(makeApp()).get(
      '/api/funds/1/kpi-observations?portfolioCompanyId=4&metric=headcount'
    );

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(serviceState.listKpiObservations).toHaveBeenCalledWith(1, {
      portfolioCompanyId: 4,
      metric: 'headcount',
    });
  });

  it('serves a read with the ETag a review must echo', async () => {
    serviceState.loadKpiObservation.mockResolvedValue(row());
    const response = await request(makeApp()).get('/api/funds/1/kpi-observations/9');

    expect(response.status).toBe(200);
    expect(response.headers.etag).toMatch(/^W\//);
    expect(response.body.observationId).toBe(9);
    expect(response.body).not.toHaveProperty('idempotencyKey');
    expect(response.body).not.toHaveProperty('requestHash');
  });

  it('404s a read for an observation outside the fund', async () => {
    serviceState.loadKpiObservation.mockResolvedValue(null);
    const response = await request(makeApp()).get('/api/funds/1/kpi-observations/9');

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('KPI_OBSERVATION_NOT_FOUND');
  });

  it('requires an Idempotency-Key before validating the create body', async () => {
    const response = await request(makeApp()).post('/api/funds/1/kpi-observations').send({});

    expect(response.status).toBe(428);
    expect(response.body.error).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('rejects a malformed Idempotency-Key', async () => {
    const response = await request(makeApp())
      .post('/api/funds/1/kpi-observations')
      .set('Idempotency-Key', 'not a token')
      .send(CREATE_BODY);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_IDEMPOTENCY_KEY');
  });

  it('creates with 201 and replays with 200, always as source "manual"', async () => {
    serviceState.createKpiObservation.mockResolvedValueOnce({
      observation: { fundId: 1, observationId: 9, version: 1 },
      replayed: false,
    });
    const created = await request(makeApp())
      .post('/api/funds/1/kpi-observations')
      .set('Idempotency-Key', 'kpi-1')
      .send(CREATE_BODY);

    expect(created.status).toBe(201);
    expect(serviceState.createKpiObservation).toHaveBeenCalledWith(
      expect.objectContaining({ fundId: 1, source: 'manual', idempotencyKey: 'kpi-1' })
    );

    serviceState.createKpiObservation.mockResolvedValueOnce({
      observation: { fundId: 1, observationId: 9, version: 1 },
      replayed: true,
    });
    const replay = await request(makeApp())
      .post('/api/funds/1/kpi-observations')
      .set('Idempotency-Key', 'kpi-1')
      .send(CREATE_BODY);

    expect(replay.status).toBe(200);
  });

  it('refuses a caller-declared source', async () => {
    const response = await request(makeApp())
      .post('/api/funds/1/kpi-observations')
      .set('Idempotency-Key', 'kpi-1')
      .send({ ...CREATE_BODY, source: 'csv_import' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_KPI_OBSERVATION_BODY');
    expect(serviceState.createKpiObservation).not.toHaveBeenCalled();
  });

  it('maps a cross-fund company to 404 through the typed service error', async () => {
    serviceState.createKpiObservation.mockRejectedValue(
      new KpiObservationServiceError(
        404,
        'PORTFOLIO_COMPANY_NOT_FOUND',
        'Portfolio company not found in this fund.'
      )
    );
    const response = await request(makeApp())
      .post('/api/funds/1/kpi-observations')
      .set('Idempotency-Key', 'kpi-1')
      .send(CREATE_BODY);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('PORTFOLIO_COMPANY_NOT_FOUND');
  });

  it('imports accepted CSV rows and reports rejected ones per row', async () => {
    serviceState.createKpiObservation.mockResolvedValue({
      observation: OBSERVATION,
      replayed: false,
    });
    const response = await request(makeApp())
      .post('/api/funds/1/kpi-observations/imports')
      .set('Idempotency-Key', 'batch-1')
      .send({
        csvBase64: csvBase64(
          '4,revenue_arr,2026-04-01,2026-06-30,actual,2100000,,,,2026-07-05',
          '4,made_up,2026-04-01,2026-06-30,actual,1,,,,2026-07-05'
        ),
        sourceLabel: 'Q2 collection',
      });

    expect(response.status).toBe(201);
    expect(response.body.imported).toHaveLength(1);
    expect(response.body.rejected).toEqual([
      { row: 2, code: 'UNKNOWN_METRIC', message: expect.any(String) },
    ]);
    expect(serviceState.createKpiObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'csv_import',
        idempotencyKey: 'batch-1:row:1',
        request: expect.objectContaining({ sourceLabel: 'Q2 collection' }),
      })
    );
  });

  it('rejects a whole batch whose header is not the fixed template', async () => {
    const response = await request(makeApp())
      .post('/api/funds/1/kpi-observations/imports')
      .set('Idempotency-Key', 'batch-1')
      .send({ csvBase64: Buffer.from('a,b\n1,2\n', 'utf8').toString('base64') });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('TEMPLATE_HEADER_MISMATCH');
    expect(serviceState.createKpiObservation).not.toHaveBeenCalled();
  });

  it('requires If-Match on review and answers 412 when the version moved', async () => {
    const missing = await request(makeApp())
      .patch('/api/funds/1/kpi-observations/9/review')
      .send({ reviewStatus: 'accepted' });
    expect(missing.status).toBe(428);

    serviceState.loadKpiObservation.mockResolvedValue(row({ version: 3 }));
    const stale = await request(makeApp())
      .patch('/api/funds/1/kpi-observations/9/review')
      .set('If-Match', 'W/"deadbeefdeadbeef"')
      .send({ reviewStatus: 'accepted' });

    expect(stale.status).toBe(412);
    expect(serviceState.reviewKpiObservation).not.toHaveBeenCalled();
  });

  it('records a review under a matching If-Match and rotates the ETag', async () => {
    serviceState.loadKpiObservation.mockResolvedValue(row());
    const read = await request(makeApp()).get('/api/funds/1/kpi-observations/9');
    const etag = read.headers.etag as string;

    serviceState.reviewKpiObservation.mockResolvedValue(
      row({
        version: 2,
        reviewStatus: 'accepted',
        reviewComment: 'Matches the board deck',
        reviewedAt: AT,
      })
    );
    const response = await request(makeApp())
      .patch('/api/funds/1/kpi-observations/9/review')
      .set('If-Match', etag)
      .send({ reviewStatus: 'accepted', reviewComment: 'Matches the board deck' });

    expect(response.status).toBe(200);
    expect(response.body.reviewStatus).toBe('accepted');
    expect(response.headers.etag).not.toBe(etag);
    expect(serviceState.reviewKpiObservation).toHaveBeenCalledWith(
      expect.objectContaining({ expectedVersion: 1, reviewStatus: 'accepted' })
    );
  });

  it('answers 412 when the compare-and-set loses a race after a passing precondition', async () => {
    serviceState.loadKpiObservation.mockResolvedValueOnce(row());
    const read = await request(makeApp()).get('/api/funds/1/kpi-observations/9');
    const etag = read.headers.etag as string;

    serviceState.loadKpiObservation.mockResolvedValueOnce(row());
    serviceState.reviewKpiObservation.mockResolvedValue(null);
    serviceState.loadKpiObservation.mockResolvedValueOnce(row({ version: 2 }));

    const response = await request(makeApp())
      .patch('/api/funds/1/kpi-observations/9/review')
      .set('If-Match', etag)
      .send({ reviewStatus: 'rejected' });

    expect(response.status).toBe(412);
  });

  it('refuses to return a reviewed row to pending', async () => {
    serviceState.loadKpiObservation.mockResolvedValue(row());
    const response = await request(makeApp())
      .patch('/api/funds/1/kpi-observations/9/review')
      .set('If-Match', 'W/"anything"')
      .send({ reviewStatus: 'pending' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_KPI_REVIEW_BODY');
  });

  it('stops at the fund-scope boundary before any write', async () => {
    fundScopeState.enforceProvidedFundScope.mockImplementation(async (_req, res) => {
      (res as Response).status(403).json({ error: 'Forbidden' });
      return false;
    });

    const response = await request(makeApp())
      .post('/api/funds/1/kpi-observations')
      .set('Idempotency-Key', 'kpi-1')
      .send(CREATE_BODY);

    expect(response.status).toBe(403);
    expect(serviceState.createKpiObservation).not.toHaveBeenCalled();
  });
});
