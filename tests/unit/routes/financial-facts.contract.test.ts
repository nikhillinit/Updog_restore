import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  EMPTY_SELECTION_SET_HASH,
  FINANCIAL_FACTS_POLICY_VERSION,
  type FinancialFactsSnapshotV1,
} from '../../../shared/contracts/financial-facts-snapshot-v1.contract';
import { IdempotentCommandError } from '../../../server/lib/idempotent-command';

const service = vi.hoisted(() => ({
  buildFinancialFactsSnapshot: vi.fn(),
  getLatestFinancialFactsSnapshot: vi.fn(),
}));

const rateLimiterState = vi.hoisted(() => ({
  configs: [] as unknown[],
}));

vi.mock('express-rate-limit', () => ({
  default: (config: unknown) => {
    rateLimiterState.configs.push(config);
    return (_req: Request, _res: Response, next: NextFunction) => next();
  },
}));

vi.mock('../../../server/lib/auth/jwt', () => ({
  requireAuth: () => (req: Request, _res: Response, next: NextFunction) => {
    req.user = {
      id: 7,
      sub: '7',
      role: 'admin',
      roles: ['admin'],
      fundIds: [1, 999],
    } as never;
    next();
  },
  requireFundAccess: (_req: Request, _res: Response, next: NextFunction) => next(),
  requireRole: (role: string) => (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.role !== role) return res.sendStatus(403);
    next();
  },
}));

vi.mock('../../../server/services/financial-facts-snapshot-service', () => {
  class MockFinancialFactsSnapshotServiceError extends Error {
    constructor(
      readonly status: number,
      readonly code: string,
      message: string,
      readonly details?: Readonly<Record<string, unknown>>
    ) {
      super(message);
    }
  }

  return {
    buildFinancialFactsSnapshot: service.buildFinancialFactsSnapshot,
    FinancialFactsSnapshotServiceError: MockFinancialFactsSnapshotServiceError,
    getLatestFinancialFactsSnapshot: service.getLatestFinancialFactsSnapshot,
  };
});

import financialFactsRouter from '../../../server/routes/financial-facts';

const KNOWLEDGE_CUTOFF = '2026-07-22T02:00:00.000Z';

function snapshot(overrides: Partial<FinancialFactsSnapshotV1> = {}): FinancialFactsSnapshotV1 {
  return {
    policyVersion: FINANCIAL_FACTS_POLICY_VERSION,
    fundId: 1,
    asOfDate: '2026-07-21',
    knowledgeCutoff: KNOWLEDGE_CUTOFF,
    vehicleScope: 'fund_all',
    vehicleIds: [11],
    selectionSetHash: EMPTY_SELECTION_SET_HASH,
    sourceFactsInputHash: 'a'.repeat(64),
    snapshotInputHash: 'b'.repeat(64),
    consumerEvaluations: [],
    payload: {
      companyActuals: {
        fundId: 1,
        asOfDate: '2026-07-21',
        facts: [],
        inputHash: 'a'.repeat(64),
      },
      sourceObservationIds: [],
      workingValueSelectionIds: [],
      participationTermRefs: [],
      cashFlowSeries: {
        series: [],
        totals: {
          contributions: '0.000000',
          distributions: '0.000000',
          recallableDistributions: '0.000000',
        },
        warnings: [],
      },
      marksSeries: { marks: [], periodNav: [], warnings: [] },
      vehicleRoster: [],
    },
    actorId: 7,
    createdAt: KNOWLEDGE_CUTOFF,
    ...overrides,
  };
}

function snapshotRow() {
  const value = snapshot();
  return {
    id: 31,
    fundId: value.fundId,
    policyVersion: value.policyVersion,
    payloadSchemaId: 'financial-facts-payload/1',
    asOfDate: value.asOfDate,
    knowledgeCutoff: new Date(value.knowledgeCutoff),
    vehicleScope: value.vehicleScope,
    vehicleIds: value.vehicleIds,
    selectionSetHash: value.selectionSetHash,
    sourceFactsInputHash: value.sourceFactsInputHash,
    snapshotInputHash: value.snapshotInputHash,
    payload: value.payload,
    consumerEvaluations: value.consumerEvaluations,
    actorId: value.actorId,
    idempotencyKey: 'stored-key',
    requestHash: 'c'.repeat(64),
    createdAt: new Date(value.createdAt),
  };
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', financialFactsRouter);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  service.getLatestFinancialFactsSnapshot.mockResolvedValue(null);

  const stored = new Map<string, { request: string; snapshot: FinancialFactsSnapshotV1 }>();
  service.buildFinancialFactsSnapshot.mockImplementation(
    async (input: {
      fundId: number;
      asOfDate: string;
      vehicleIds?: number[];
      actorId: number;
      idempotencyKey: string;
    }) => {
      const requestIdentity = JSON.stringify({
        fundId: input.fundId,
        asOfDate: input.asOfDate,
        vehicleIds: input.vehicleIds ?? [],
      });
      const existing = stored.get(input.idempotencyKey);
      if (existing) {
        if (existing.request !== requestIdentity) {
          throw new IdempotentCommandError(
            409,
            'IDEMPOTENCY_KEY_REUSE',
            'Idempotency-Key was already used for a different request.'
          );
        }
        return existing.snapshot;
      }

      const created = snapshot({
        fundId: input.fundId,
        asOfDate: input.asOfDate,
        vehicleIds: input.vehicleIds ?? [],
      });
      stored.set(input.idempotencyKey, { request: requestIdentity, snapshot: created });
      return created;
    }
  );
});

describe('financial-facts route contract', () => {
  it('registers separate read and write rate-limit contracts', () => {
    expect(rateLimiterState.configs).toEqual([
      expect.objectContaining({
        windowMs: 60_000,
        max: 120,
        standardHeaders: true,
        legacyHeaders: false,
      }),
      expect.objectContaining({
        windowMs: 60_000,
        max: 30,
        standardHeaders: true,
        legacyHeaders: false,
      }),
    ]);
  });

  it('GET rejects a non-numeric fund ID before reading snapshots', async () => {
    const response = await request(buildApp()).get(
      '/api/funds/not-a-number/financial-facts/latest'
    );

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: 'Invalid parameter' });
    expect(service.getLatestFinancialFactsSnapshot).not.toHaveBeenCalled();
  });

  it('GET returns 404 when the fund has no accepted snapshot', async () => {
    const response = await request(buildApp()).get('/api/funds/999/financial-facts/latest');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: 'financial_facts_snapshot_not_found',
      message: 'No accepted financial-facts snapshot exists for fund 999.',
      details: { fundId: 999 },
    });
    expect(service.getLatestFinancialFactsSnapshot).toHaveBeenCalledWith({ fundId: 999 });
  });

  it('GET serves the latest snapshot and its persisted knowledge cutoff', async () => {
    service.getLatestFinancialFactsSnapshot.mockResolvedValueOnce(snapshotRow());

    const response = await request(buildApp()).get('/api/funds/1/financial-facts/latest');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(snapshot());
    expect(response.body.knowledgeCutoff).toBe(KNOWLEDGE_CUTOFF);
    expect(service.getLatestFinancialFactsSnapshot).toHaveBeenCalledWith({ fundId: 1 });
  });

  it('POST rejects a missing Idempotency-Key before building a snapshot', async () => {
    const response = await request(buildApp())
      .post('/api/admin/funds/1/financial-facts/snapshots')
      .send({ asOfDate: '2026-07-21', vehicleIds: [11] });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'idempotency_key_required',
      message: 'Idempotency-Key header is required',
    });
    expect(service.buildFinancialFactsSnapshot).not.toHaveBeenCalled();
  });

  it('POST replays the stored snapshot for the same trigger and payload', async () => {
    const post = () =>
      request(buildApp())
        .post('/api/admin/funds/1/financial-facts/snapshots')
        .set('Idempotency-Key', 'trigger-7')
        .send({ asOfDate: '2026-07-21', vehicleIds: [11] });

    const first = await post();
    const replay = await post();

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(first.body);
    expect(service.buildFinancialFactsSnapshot).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        idempotencyKey: 'facts:1:2026-07-21:financial-facts-policy/1.0.1:trigger-7',
      })
    );
  });

  it('POST maps key reuse with a different payload to 409', async () => {
    const first = await request(buildApp())
      .post('/api/admin/funds/1/financial-facts/snapshots')
      .set('Idempotency-Key', 'trigger-conflict')
      .send({ asOfDate: '2026-07-21', vehicleIds: [11] });
    const conflict = await request(buildApp())
      .post('/api/admin/funds/1/financial-facts/snapshots')
      .set('Idempotency-Key', 'trigger-conflict')
      .send({ asOfDate: '2026-07-21', vehicleIds: [12] });

    expect(first.status).toBe(200);
    expect(conflict.status).toBe(409);
    expect(conflict.body).toMatchObject({
      error: 'IDEMPOTENCY_KEY_REUSE',
      message: 'Idempotency-Key was already used for a different request.',
    });
  });
});
