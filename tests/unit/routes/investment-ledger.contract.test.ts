// Default import on purpose: node-setup.ts vi.mock('fs') stubs named exports,
// while its actual-module spread preserves `default` as the real fs module.
import fs from 'node:fs';
import path from 'node:path';

import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const serviceState = vi.hoisted(() => ({
  createFinancingEvent: vi.fn(),
  recordFinancingTranche: vi.fn(),
  correctFinancingTranche: vi.fn(),
  loadFinancingEventDetail: vi.fn(),
  createVehicleFinancingParticipation: vi.fn(),
  correctVehicleParticipationLedger: vi.fn(),
  convertPosition: vi.fn(),
  listCurrentPositions: vi.fn(),
  createOwnershipSnapshot: vi.fn(),
  listOwnershipSnapshots: vi.fn(),
  recordDirectPositionValuation: vi.fn(),
  selectPositionValuation: vi.fn(),
  recordPositionEvent: vi.fn(),
  correctPosition: vi.fn(),
}));

const authState = vi.hoisted(() => ({
  user: {
    id: '3',
    sub: '3',
    email: 'ledger-user@example.com',
    role: 'user',
    roles: ['user'],
    fundIds: [7],
  } as Express.User | undefined,
}));

// The factory must export every symbol the route imports, or the route module
// throws at load time rather than failing a single assertion.
vi.mock('../../../server/services/investment-ledger/financing-event-service', () => ({
  createFinancingEvent: serviceState.createFinancingEvent,
  recordFinancingTranche: serviceState.recordFinancingTranche,
  correctFinancingTranche: serviceState.correctFinancingTranche,
  loadFinancingEventDetail: serviceState.loadFinancingEventDetail,
}));

vi.mock('../../../server/services/investment-ledger/participation-service', () => ({
  createVehicleFinancingParticipation: serviceState.createVehicleFinancingParticipation,
}));

vi.mock('../../../server/services/investment-ledger/position-conversion-service', () => ({
  convertPosition: serviceState.convertPosition,
}));

vi.mock('../../../server/services/investment-ledger/current-position-service', () => ({
  listCurrentPositions: serviceState.listCurrentPositions,
}));

vi.mock('../../../server/services/investment-ledger/ownership-snapshot-service', () => ({
  createOwnershipSnapshot: serviceState.createOwnershipSnapshot,
  listOwnershipSnapshots: serviceState.listOwnershipSnapshots,
}));

vi.mock('../../../server/services/investment-ledger/position-valuation-service', () => ({
  recordDirectPositionValuation: serviceState.recordDirectPositionValuation,
  selectPositionValuation: serviceState.selectPositionValuation,
}));

vi.mock('../../../server/services/investment-ledger/ledger-correction-service', () => ({
  correctVehicleParticipationLedger: serviceState.correctVehicleParticipationLedger,
}));

vi.mock('../../../server/services/investment-ledger/position-service', () => ({
  recordPositionEvent: serviceState.recordPositionEvent,
  correctPosition: serviceState.correctPosition,
}));

vi.mock('../../../server/lib/auth/jwt', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../server/lib/auth/jwt')>();
  return {
    ...actual,
    requireAuth: () => (req: Request, res: Response, next: NextFunction) => {
      if (!authState.user) {
        return res.sendStatus(401);
      }
      req.user = authState.user;
      next();
    },
  };
});

import investmentLedgerRouter from '../../../server/routes/investment-ledger';

const EVENT = {
  id: 100,
  fundId: 7,
  companyIdentityId: 11,
  eventKey: 'series-a-2026',
};

const TRANCHE = { id: 500, fundId: 7, trancheKey: 'first-close', version: 1 };
const PARTICIPATION = { id: 600, fundId: 7, vehicleId: 9, version: 1 };
const POSITION_EVENT = {
  id: 700,
  fundId: 7,
  vehicleId: 9,
  companyIdentityId: 11,
  eventType: 'acquisition',
};
const POSITION_CORRECTION = {
  reversal: { ...POSITION_EVENT, id: 701, eventType: 'reversal' },
  replacement: { ...POSITION_EVENT, id: 702 },
  reconciliationCaseId: 703,
};
const POSITION_CONVERSION = {
  sourceParticipationId: 600,
  sourceParticipationVersion: 1,
  resultingParticipation: { id: 601, economicOrigin: 'conversion_result' },
  conversionEvent: { ...POSITION_EVENT, eventType: 'conversion', id: 704 },
  capitalizedAdjustmentEvent: null,
  reliefMode: 'source_basis',
  lotReliefs: [],
  sourceBasisRelief: { conversionPositionEventId: 704 },
  resultConversionLotId: '11111111-1111-4111-8111-111111111111',
  conversionObservationId: 705,
};
const CURRENT_POSITIONS = {
  fundId: 7,
  asOfDate: '2026-07-01',
  knowledgeCutoff: '2026-07-26T00:00:00.000Z',
  positions: [],
};
const OWNERSHIP_SNAPSHOT = {
  id: 801,
  fundId: 7,
  vehicleId: 9,
  companyIdentityId: 11,
  effectiveDate: '2026-07-01',
  recordedAt: '2026-07-01T00:00:00.000Z',
  ownershipPct: '12.50000000',
  fdNumerator: '125.000000',
  fdDenominator: '1000.000000',
  currency: 'USD',
  supersedesSnapshotId: null,
  sourceObservationId: 802,
  createdBy: 3,
  idempotencyKey: 'ownership-1',
  requestHash: 'a'.repeat(64),
};
const OWNERSHIP_SNAPSHOTS = {
  fundId: 7,
  asOfDate: '2026-07-01',
  knowledgeCutoff: '2026-07-26T00:00:00.000Z',
  snapshots: [OWNERSHIP_SNAPSHOT],
};
const DIRECT_POSITION_VALUATION = {
  valuationMarkId: 901,
  sourceObservationId: 902,
  fundId: 7,
  vehicleId: 9,
  companyIdentityId: 11,
  companyId: 12,
  asOfDate: '2026-07-01',
  fairValue: '1250000.000000',
  sourceHash: 'b'.repeat(64),
};
const POSITION_VALUATION_SELECTION = {
  fundId: 7,
  vehicleId: 9,
  companyIdentityId: 11,
  companyId: 12,
  asOfDate: '2026-07-01',
  aggregateFairValue: '1250000.000000',
  basis: 'direct',
  directMarkId: 901,
  directSourceObservationId: 902,
  ownershipSnapshotId: null,
  derivedTrancheId: null,
  derivedTrancheVersion: null,
  derivedParticipationId: null,
  derivedParticipationVersion: null,
  evidenceDate: '2026-07-01',
  valuationAgeDays: 0,
  pricedComponentFairValue: '1250000.000000',
  warnings: [],
};

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(investmentLedgerRouter);
  app.use((_req, res) => res.status(404).json({ error: 'not_found' }));
  return app;
}

const eventBody = {
  companyIdentityId: 11,
  eventKey: 'series-a-2026',
  roundName: 'Series A',
  securityType: 'equity',
  eventDate: '2026-02-01',
  currency: 'USD',
  postMoneyValuation: '40000000.000000',
};

const trancheBody = {
  trancheKey: 'first-close',
  closingDate: '2026-02-01',
  securityType: 'equity',
  investmentAmount: '2500000.000000',
  pricePerShare: '4.250000',
};

const participationBody = {
  vehicleId: 9,
  participationAmount: '123.456789',
};

const ledgerCorrectionBody = {
  expectedTrancheVersion: 1,
  correctedTranche: trancheBody,
  dependents: [
    {
      participationId: 600,
      expectedVersion: 1,
      acknowledgements: {
        termsReviewed: true,
        compatibilityRewriteAccepted: true,
      },
    },
  ],
};

const positionEventBody = {
  vehicleId: 9,
  companyIdentityId: 11,
  eventType: 'acquisition',
  effectiveDate: '2026-02-01',
  sharesDelta: '100.00000000',
  costBasisDelta: '2500000.000000',
  proceeds: '0.000000',
};
const positionCorrectionBody = {
  positionEventId: 700,
  currency: 'USD',
  sharesDelta: '90.00000000',
  costBasisDelta: '2250000.000000',
  proceeds: '0.000000',
};
const positionConversionBody = {
  sourceParticipationId: 600,
  resultingTrancheId: 501,
  effectiveDate: '2026-07-01',
  resultingSharesAcquired: '100.000000',
  accruedInterest: { mode: 'excluded' },
  currency: 'USD',
};
const ownershipSnapshotBody = {
  vehicleId: 9,
  companyIdentityId: 11,
  effectiveDate: '2026-07-01',
  ownershipPct: '12.50000000',
  fdNumerator: '125.000000',
  fdDenominator: '1000.000000',
  sourceObservationId: 802,
  currency: 'USD',
};
const directValuationBody = {
  vehicleId: 9,
  companyIdentityId: 11,
  companyId: 12,
  asOfDate: '2026-07-01',
  fairValue: '1250000.000000',
  sourceObservationId: 902,
  markSource: 'board_update',
  confidenceLevel: 'high',
  valuationMethod: 'direct_position_mark',
  currency: 'USD',
};

beforeEach(() => {
  authState.user = {
    id: '3',
    sub: '3',
    email: 'ledger-user@example.com',
    role: 'user',
    roles: ['user'],
    fundIds: [7],
  };
  serviceState.createFinancingEvent.mockReset();
  serviceState.recordFinancingTranche.mockReset();
  serviceState.correctFinancingTranche.mockReset();
  serviceState.loadFinancingEventDetail.mockReset();
  serviceState.createVehicleFinancingParticipation.mockReset();
  serviceState.correctVehicleParticipationLedger.mockReset();
  serviceState.convertPosition.mockReset();
  serviceState.listCurrentPositions.mockReset();
  serviceState.createOwnershipSnapshot.mockReset();
  serviceState.listOwnershipSnapshots.mockReset();
  serviceState.recordDirectPositionValuation.mockReset();
  serviceState.selectPositionValuation.mockReset();
  serviceState.recordPositionEvent.mockReset();
  serviceState.correctPosition.mockReset();
});

describe('investment-ledger routes', () => {
  it('rejects a write with no Idempotency-Key before it inspects the body', async () => {
    const response = await request(makeApp())
      .post('/api/funds/7/investment-ledger/financing-events')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_IDEMPOTENCY_KEY');
    expect(serviceState.createFinancingEvent).not.toHaveBeenCalled();
  });

  it('rejects an Idempotency-Key longer than 128 characters', async () => {
    const response = await request(makeApp())
      .post('/api/funds/7/investment-ledger/financing-events')
      .set('Idempotency-Key', 'k'.repeat(129))
      .send(eventBody);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_IDEMPOTENCY_KEY');
    expect(serviceState.createFinancingEvent).not.toHaveBeenCalled();
  });

  const fundScopedRoutes = [
    {
      name: 'create event',
      method: 'post' as const,
      path: (fundId: string) => `/api/funds/${fundId}/investment-ledger/financing-events`,
      service: serviceState.createFinancingEvent,
      body: eventBody,
    },
    {
      name: 'record tranche',
      method: 'post' as const,
      path: (fundId: string) =>
        `/api/funds/${fundId}/investment-ledger/financing-events/100/tranches`,
      service: serviceState.recordFinancingTranche,
      body: trancheBody,
    },
    {
      name: 'correct tranche',
      method: 'post' as const,
      path: (fundId: string) => `/api/funds/${fundId}/investment-ledger/tranches/500/corrections`,
      service: serviceState.correctFinancingTranche,
      body: trancheBody,
    },
    {
      name: 'record participation',
      method: 'post' as const,
      path: (fundId: string) =>
        `/api/funds/${fundId}/investment-ledger/tranches/500/participations`,
      service: serviceState.createVehicleFinancingParticipation,
      body: participationBody,
    },
    {
      name: 'correct participation ledger',
      method: 'post' as const,
      path: (fundId: string) =>
        `/api/funds/${fundId}/investment-ledger/tranches/500/ledger-corrections`,
      service: serviceState.correctVehicleParticipationLedger,
      body: ledgerCorrectionBody,
    },
    {
      name: 'record position event',
      method: 'post' as const,
      path: (fundId: string) => `/api/funds/${fundId}/investment-ledger/position-events`,
      service: serviceState.recordPositionEvent,
      body: positionEventBody,
    },
    {
      name: 'read current positions',
      method: 'get' as const,
      path: (fundId: string) => `/api/funds/${fundId}/investment-ledger/positions`,
      service: serviceState.listCurrentPositions,
    },
    {
      name: 'convert position',
      method: 'post' as const,
      path: (fundId: string) => `/api/funds/${fundId}/investment-ledger/position-conversions`,
      service: serviceState.convertPosition,
      body: positionConversionBody,
    },
    {
      name: 'correct position',
      method: 'post' as const,
      path: (fundId: string) => `/api/funds/${fundId}/investment-ledger/position-corrections`,
      service: serviceState.correctPosition,
      body: positionCorrectionBody,
    },
    {
      name: 'read ownership snapshots',
      method: 'get' as const,
      path: (fundId: string) => `/api/funds/${fundId}/investment-ledger/ownership-snapshots`,
      service: serviceState.listOwnershipSnapshots,
    },
    {
      name: 'record ownership snapshot',
      method: 'post' as const,
      path: (fundId: string) => `/api/funds/${fundId}/investment-ledger/ownership-snapshots`,
      service: serviceState.createOwnershipSnapshot,
      body: ownershipSnapshotBody,
    },
    {
      name: 'read position valuation',
      method: 'get' as const,
      path: (fundId: string) =>
        `/api/funds/${fundId}/investment-ledger/position-valuations?vehicleId=9&companyIdentityId=11&companyId=12&asOfDate=2026-07-01`,
      service: serviceState.selectPositionValuation,
    },
    {
      name: 'record direct position valuation',
      method: 'post' as const,
      path: (fundId: string) => `/api/funds/${fundId}/investment-ledger/position-valuations`,
      service: serviceState.recordDirectPositionValuation,
      body: directValuationBody,
    },
    {
      name: 'read detail',
      method: 'get' as const,
      path: (fundId: string) => `/api/funds/${fundId}/investment-ledger/financing-events/100`,
      service: serviceState.loadFinancingEventDetail,
    },
  ];

  it.each([
    ['malformed', 'abc'],
    ['non-positive', '0'],
    ['unsafe', '9007199254740992'],
    ['PostgreSQL int overflow', '2147483648'],
  ])(
    'returns the ledger INVALID_FUND_ID envelope for %s fundId on every fund-scoped route',
    async (_caseName, fundId) => {
      for (const route of fundScopedRoutes) {
        let pending = request(makeApp())[route.method](route.path(fundId));
        if (route.method === 'post') {
          pending = pending.set('Idempotency-Key', `invalid-${fundId}`).send(route.body);
        }

        const response = await pending;

        expect(response.status, route.name).toBe(400);
        expect(response.body, route.name).toMatchObject({
          error: 'INVALID_FUND_ID',
          message: 'fundId must be a positive integer.',
        });
        expect(route.service, route.name).not.toHaveBeenCalled();
      }
    }
  );

  it('preserves auth-before-resource ordering for malformed fundId requests', async () => {
    authState.user = undefined;

    const response = await request(makeApp())
      .post('/api/funds/abc/investment-ledger/financing-events')
      .set('Idempotency-Key', 'evt-1')
      .send(eventBody);

    expect(response.status).toBe(401);
    expect(serviceState.createFinancingEvent).not.toHaveBeenCalled();
  });

  it('runs the real fund access guard for valid fund IDs', async () => {
    authState.user = {
      id: '3',
      sub: '3',
      email: 'ledger-user@example.com',
      role: 'user',
      roles: ['user'],
      fundIds: [7],
    };

    const response = await request(makeApp())
      .post('/api/funds/8/investment-ledger/financing-events')
      .set('Idempotency-Key', 'evt-1')
      .send(eventBody);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      error: 'Forbidden',
      message: 'You do not have access to fund 8',
    });
    expect(serviceState.createFinancingEvent).not.toHaveBeenCalled();
  });

  it('returns 201 on a first event write and 200 on a replay', async () => {
    serviceState.createFinancingEvent.mockResolvedValueOnce({ value: EVENT, replayed: false });
    const created = await request(makeApp())
      .post('/api/funds/7/investment-ledger/financing-events')
      .set('Idempotency-Key', 'evt-1')
      .send(eventBody);

    expect(created.status).toBe(201);
    expect(created.body).toEqual(EVENT);
    expect(serviceState.createFinancingEvent).toHaveBeenCalledWith(
      expect.objectContaining({ fundId: 7, actorId: 3, idempotencyKey: 'evt-1' })
    );

    serviceState.createFinancingEvent.mockResolvedValueOnce({ value: EVENT, replayed: true });
    const replayed = await request(makeApp())
      .post('/api/funds/7/investment-ledger/financing-events')
      .set('Idempotency-Key', 'evt-1')
      .send(eventBody);

    expect(replayed.status).toBe(200);
  });

  it('records a tranche against the parsed event id', async () => {
    serviceState.recordFinancingTranche.mockResolvedValueOnce({
      value: TRANCHE,
      replayed: false,
    });

    const response = await request(makeApp())
      .post('/api/funds/7/investment-ledger/financing-events/100/tranches')
      .set('Idempotency-Key', 'tr-1')
      .send(trancheBody);

    expect(response.status).toBe(201);
    expect(serviceState.recordFinancingTranche).toHaveBeenCalledWith(
      expect.objectContaining({ fundId: 7, eventId: 100, idempotencyKey: 'tr-1' })
    );
  });

  it('rejects a non-numeric tranche id on the correction route', async () => {
    const response = await request(makeApp())
      .post('/api/funds/7/investment-ledger/tranches/not-a-number/corrections')
      .set('Idempotency-Key', 'fix-1')
      .send(trancheBody);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_TRANCHE_ID');
    expect(serviceState.correctFinancingTranche).not.toHaveBeenCalled();
  });

  it('surfaces a service conflict with its own status and code', async () => {
    serviceState.correctFinancingTranche.mockRejectedValueOnce(
      Object.assign(new Error('Only the current tranche version can be corrected.'), {
        status: 409,
        statusCode: 409,
        code: 'FINANCING_TRANCHE_NOT_CURRENT',
      })
    );

    const response = await request(makeApp())
      .post('/api/funds/7/investment-ledger/tranches/500/corrections')
      .set('Idempotency-Key', 'fix-1')
      .send(trancheBody);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('FINANCING_TRANCHE_NOT_CURRENT');
  });

  it('returns 201 for participation creation and 200 for an exact replay', async () => {
    serviceState.createVehicleFinancingParticipation
      .mockResolvedValueOnce({ value: PARTICIPATION, replayed: false })
      .mockResolvedValueOnce({ value: PARTICIPATION, replayed: true });

    const created = await request(makeApp())
      .post('/api/funds/7/investment-ledger/tranches/500/participations')
      .set('Idempotency-Key', 'participation-1')
      .send(participationBody);
    const replayed = await request(makeApp())
      .post('/api/funds/7/investment-ledger/tranches/500/participations')
      .set('Idempotency-Key', 'participation-1')
      .send(participationBody);

    expect(created.status).toBe(201);
    expect(replayed.status).toBe(200);
    expect(serviceState.createVehicleFinancingParticipation).toHaveBeenCalledWith(
      expect.objectContaining({
        fundId: 7,
        trancheId: 500,
        actorId: 3,
        idempotencyKey: 'participation-1',
      })
    );
  });

  it('returns duplicate-confirmation conflict without burning the route key', async () => {
    serviceState.createVehicleFinancingParticipation.mockRejectedValueOnce(
      Object.assign(new Error('A matching legacy position requires confirmation.'), {
        status: 409,
        statusCode: 409,
        code: 'SUSPECTED_DUPLICATE_POSITION',
        details: { duplicateFingerprints: ['a'.repeat(64)] },
      })
    );

    const response = await request(makeApp())
      .post('/api/funds/7/investment-ledger/tranches/500/participations')
      .set('Idempotency-Key', 'participation-confirm')
      .send(participationBody);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('SUSPECTED_DUPLICATE_POSITION');
    expect(response.body.details).toEqual({ duplicateFingerprints: ['a'.repeat(64)] });
  });

  it('passes the atomic ledger-correction body through one route command', async () => {
    serviceState.correctVehicleParticipationLedger.mockResolvedValueOnce({
      value: { tranche: TRANCHE, participations: [PARTICIPATION] },
      replayed: false,
    });

    const response = await request(makeApp())
      .post('/api/funds/7/investment-ledger/tranches/500/ledger-corrections')
      .set('Idempotency-Key', 'ledger-correction-1')
      .send(ledgerCorrectionBody);

    expect(response.status).toBe(201);
    expect(serviceState.correctVehicleParticipationLedger).toHaveBeenCalledWith(
      expect.objectContaining({
        fundId: 7,
        trancheId: 500,
        actorId: 3,
        idempotencyKey: 'ledger-correction-1',
        request: ledgerCorrectionBody,
      })
    );
  });

  it('records a manual position event through the route command', async () => {
    serviceState.recordPositionEvent
      .mockResolvedValueOnce({
        value: POSITION_EVENT,
        replayed: false,
      })
      .mockResolvedValueOnce({
        value: POSITION_EVENT,
        replayed: true,
      });

    const created = await request(makeApp())
      .post('/api/funds/7/investment-ledger/position-events')
      .set('Idempotency-Key', 'position-event-1')
      .send(positionEventBody);
    const replayed = await request(makeApp())
      .post('/api/funds/7/investment-ledger/position-events')
      .set('Idempotency-Key', 'position-event-1')
      .send(positionEventBody);

    expect(created.status).toBe(201);
    expect(created.body).toEqual(POSITION_EVENT);
    expect(replayed.status).toBe(200);
    expect(serviceState.recordPositionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        fundId: 7,
        actorId: 3,
        idempotencyKey: 'position-event-1',
        request: positionEventBody,
      })
    );
  });

  it('requires If-Match before dispatching a position correction', async () => {
    const response = await request(makeApp())
      .post('/api/funds/7/investment-ledger/position-corrections')
      .set('Idempotency-Key', 'position-correction-1')
      .send(positionCorrectionBody);

    expect(response.status).toBe(428);
    expect(response.body).toMatchObject({
      error: 'precondition_required',
      message: 'If-Match header is required',
    });
    expect(serviceState.correctPosition).not.toHaveBeenCalled();
  });

  it('converts a position through the route command and preserves replay status', async () => {
    serviceState.convertPosition
      .mockResolvedValueOnce({ value: POSITION_CONVERSION, replayed: false })
      .mockResolvedValueOnce({ value: POSITION_CONVERSION, replayed: true });

    const created = await request(makeApp())
      .post('/api/funds/7/investment-ledger/position-conversions')
      .set('Idempotency-Key', 'position-conversion-1')
      .send(positionConversionBody);
    const replayed = await request(makeApp())
      .post('/api/funds/7/investment-ledger/position-conversions')
      .set('Idempotency-Key', 'position-conversion-1')
      .send(positionConversionBody);

    expect(created.status).toBe(201);
    expect(created.body).toEqual(POSITION_CONVERSION);
    expect(replayed.status).toBe(200);
    expect(serviceState.convertPosition).toHaveBeenCalledWith(
      expect.objectContaining({
        fundId: 7,
        actorId: 3,
        idempotencyKey: 'position-conversion-1',
        request: positionConversionBody,
      })
    );
  });

  it('rejects public current-position reads that supply knowledgeCutoff', async () => {
    const response = await request(makeApp()).get(
      '/api/funds/7/investment-ledger/positions?knowledgeCutoff=2026-07-01T00:00:00.000Z'
    );

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('KNOWLEDGE_CUTOFF_NOT_ACCEPTED');
    expect(serviceState.listCurrentPositions).not.toHaveBeenCalled();
  });

  it('serves current positions with only public filters passed to the service', async () => {
    serviceState.listCurrentPositions.mockResolvedValueOnce(CURRENT_POSITIONS);

    const response = await request(makeApp()).get(
      '/api/funds/7/investment-ledger/positions?vehicleId=9&companyIdentityId=11&asOfDate=2026-07-01'
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual(CURRENT_POSITIONS);
    expect(serviceState.listCurrentPositions).toHaveBeenCalledWith({
      fundId: 7,
      query: { vehicleId: 9, companyIdentityId: 11, asOfDate: '2026-07-01' },
    });
  });

  it.each(['2026-02-30', '2026-04-31'])(
    'rejects calendar-invalid public asOfDate %s before every position read',
    async (asOfDate) => {
      const routes = [
        {
          path: `/api/funds/7/investment-ledger/positions?asOfDate=${asOfDate}`,
          service: serviceState.listCurrentPositions,
        },
        {
          path: `/api/funds/7/investment-ledger/ownership-snapshots?asOfDate=${asOfDate}`,
          service: serviceState.listOwnershipSnapshots,
        },
        {
          path: `/api/funds/7/investment-ledger/position-valuations?vehicleId=9&companyIdentityId=11&companyId=12&asOfDate=${asOfDate}`,
          service: serviceState.selectPositionValuation,
        },
      ];

      for (const route of routes) {
        const response = await request(makeApp()).get(route.path);

        expect(response.status, route.path).toBe(400);
        expect(response.body, route.path).toMatchObject({
          error: 'INVALID_AS_OF_DATE',
          message: 'asOfDate must be an ISO date.',
        });
        expect(route.service, route.path).not.toHaveBeenCalled();
      }
    }
  );

  it('serves terminal ownership heads and rejects client knowledge cutoffs', async () => {
    const rejected = await request(makeApp()).get(
      '/api/funds/7/investment-ledger/ownership-snapshots?knowledgeCutoff=2026-07-01T00:00:00.000Z'
    );
    expect(rejected.status).toBe(400);

    serviceState.listOwnershipSnapshots.mockResolvedValueOnce(OWNERSHIP_SNAPSHOTS);
    const accepted = await request(makeApp()).get(
      '/api/funds/7/investment-ledger/ownership-snapshots?vehicleId=9&companyIdentityId=11&asOfDate=2026-07-01'
    );

    expect(accepted.status).toBe(200);
    expect(accepted.body).toEqual(OWNERSHIP_SNAPSHOTS);
    expect(serviceState.listOwnershipSnapshots).toHaveBeenCalledWith({
      fundId: 7,
      vehicleId: 9,
      companyIdentityId: 11,
      asOfDate: '2026-07-01',
    });
  });

  it('records ownership snapshots and direct position valuations with replay status', async () => {
    serviceState.createOwnershipSnapshot
      .mockResolvedValueOnce({ value: OWNERSHIP_SNAPSHOT, replayed: false })
      .mockResolvedValueOnce({ value: OWNERSHIP_SNAPSHOT, replayed: true });
    serviceState.recordDirectPositionValuation
      .mockResolvedValueOnce({ value: DIRECT_POSITION_VALUATION, replayed: false })
      .mockResolvedValueOnce({ value: DIRECT_POSITION_VALUATION, replayed: true });

    const ownershipCreated = await request(makeApp())
      .post('/api/funds/7/investment-ledger/ownership-snapshots')
      .set('Idempotency-Key', 'ownership-1')
      .send(ownershipSnapshotBody);
    const ownershipReplay = await request(makeApp())
      .post('/api/funds/7/investment-ledger/ownership-snapshots')
      .set('Idempotency-Key', 'ownership-1')
      .send(ownershipSnapshotBody);
    const valuationCreated = await request(makeApp())
      .post('/api/funds/7/investment-ledger/position-valuations')
      .set('Idempotency-Key', 'valuation-1')
      .send(directValuationBody);
    const valuationReplay = await request(makeApp())
      .post('/api/funds/7/investment-ledger/position-valuations')
      .set('Idempotency-Key', 'valuation-1')
      .send(directValuationBody);

    expect(ownershipCreated.status).toBe(201);
    expect(ownershipReplay.status).toBe(200);
    expect(valuationCreated.status).toBe(201);
    expect(valuationReplay.status).toBe(200);
    expect(serviceState.createOwnershipSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ fundId: 7, actorId: 3, idempotencyKey: 'ownership-1' })
    );
    expect(serviceState.recordDirectPositionValuation).toHaveBeenCalledWith(
      expect.objectContaining({ fundId: 7, actorId: 3, idempotencyKey: 'valuation-1' })
    );
  });

  it('selects a position valuation through required public filters only', async () => {
    serviceState.selectPositionValuation.mockResolvedValueOnce(POSITION_VALUATION_SELECTION);

    const response = await request(makeApp()).get(
      '/api/funds/7/investment-ledger/position-valuations?vehicleId=9&companyIdentityId=11&companyId=12&asOfDate=2026-07-01'
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual(POSITION_VALUATION_SELECTION);
    expect(serviceState.selectPositionValuation).toHaveBeenCalledWith({
      fundId: 7,
      vehicleId: 9,
      companyIdentityId: 11,
      companyId: 12,
      asOfDate: '2026-07-01',
    });
  });

  it('rejects position-valuation GET knowledgeCutoff and missing identity filters', async () => {
    const cutoff = await request(makeApp()).get(
      '/api/funds/7/investment-ledger/position-valuations?vehicleId=9&companyIdentityId=11&companyId=12&asOfDate=2026-07-01&knowledgeCutoff=2026-07-01T00:00:00.000Z'
    );
    const missing = await request(makeApp()).get(
      '/api/funds/7/investment-ledger/position-valuations?vehicleId=9&companyIdentityId=11&asOfDate=2026-07-01'
    );

    expect(cutoff.status).toBe(400);
    expect(cutoff.body.error).toBe('KNOWLEDGE_CUTOFF_NOT_ACCEPTED');
    expect(missing.status).toBe(400);
    expect(missing.body.error).toBe('INVALID_COMPANY_ID');
    expect(serviceState.selectPositionValuation).not.toHaveBeenCalled();
  });

  it('passes the parsed If-Match value into the atomic position correction command', async () => {
    serviceState.correctPosition.mockResolvedValueOnce({
      value: POSITION_CORRECTION,
      replayed: false,
    });

    const response = await request(makeApp())
      .post('/api/funds/7/investment-ledger/position-corrections')
      .set('Idempotency-Key', 'position-correction-1')
      .set('If-Match', 'W/"event-version-101"')
      .send(positionCorrectionBody);

    expect(response.status).toBe(201);
    expect(response.body).toEqual(POSITION_CORRECTION);
    expect(serviceState.correctPosition).toHaveBeenCalledWith(
      expect.objectContaining({
        fundId: 7,
        actorId: 3,
        idempotencyKey: 'position-correction-1',
        ifMatch: 'event-version-101',
        request: positionCorrectionBody,
      })
    );
  });

  it('serves the fund-scoped event detail read', async () => {
    const detail = { event: EVENT, headTranches: [TRANCHE], versionHistory: [TRANCHE] };
    serviceState.loadFinancingEventDetail.mockResolvedValueOnce(detail);

    const response = await request(makeApp()).get(
      '/api/funds/7/investment-ledger/financing-events/100'
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual(detail);
    expect(serviceState.loadFinancingEventDetail).toHaveBeenCalledWith(7, 100);
  });

  it('keeps persistence behind the service (no ../db import)', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'server', 'routes', 'investment-ledger.ts'),
      'utf8'
    );

    expect(source).not.toMatch(/from\s+'\.\.\/db'/);
    expect(source).not.toMatch(/from\s+"\.\.\/db"/);
  });
});
