import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const service = vi.hoisted(() => ({
  getLpEconomicsRunReceipt: vi.fn(),
}));

const authState = vi.hoisted(() => ({
  authenticated: true,
  fundAccess: true,
  role: 'admin',
  lpId: undefined as number | undefined,
  calls: [] as string[],
}));

vi.mock('express-rate-limit', () => ({
  default: () => (_req: Request, _res: Response, next: NextFunction) => {
    authState.calls.push('readLimiter');
    next();
  },
}));

vi.mock('../../../server/lib/auth/jwt', () => ({
  requireAuth: () => (req: Request, res: Response, next: NextFunction) => {
    authState.calls.push('requireAuth');
    if (!authState.authenticated) return res.sendStatus(401);
    req.user = {
      id: '7',
      sub: '7',
      email: 'reader@example.com',
      role: authState.role,
      roles: [authState.role],
      fundIds: [1],
      ...(authState.lpId === undefined ? {} : { lpId: authState.lpId }),
    } as never;
    next();
  },
  requireFundAccess: (_req: Request, res: Response, next: NextFunction) => {
    authState.calls.push('requireFundAccess');
    if (!authState.fundAccess) return res.sendStatus(403);
    next();
  },
}));

vi.mock('../../../server/services/internal-economics/lp-economics-run-service', () => {
  class MockLpEconomicsRunServiceError extends Error {
    readonly statusCode: number;

    constructor(
      readonly status: number,
      readonly code: string,
      message: string,
      readonly details?: Readonly<Record<string, unknown>>
    ) {
      super(message);
      this.name = 'LpEconomicsRunServiceError';
      this.statusCode = status;
    }
  }

  return {
    LpEconomicsRunServiceError: MockLpEconomicsRunServiceError,
    getLpEconomicsRunReceipt: service.getLpEconomicsRunReceipt,
  };
});

import internalEconomicsRouter from '../../../server/routes/internal-economics';
import { LpEconomicsRunServiceError } from '../../../server/services/internal-economics/lp-economics-run-service';

const RECEIPT = {
  receiptVersion: 'internal-lp-economics-run-receipt/1.0.0',
  runId: 9,
  fundId: 1,
  createdAt: '2026-06-30T23:59:59.000Z',
  basis: {
    policyVersionId: 3,
    capitalEnvelopeVersionId: 4,
    factsSnapshotId: 5,
    knowledgeCutoff: '2026-06-30T00:00:00.000Z',
    planVersionId: 6,
    forecastSnapshotId: 7,
    evaluationClock: '2026-06-30T23:59:59.000Z',
    terminalMode: 'hold_unrealized',
    terminalPeriodEnd: '2026-09-30',
    terminalResolutionMethodologyVersion: 'terminal-resolution/1.0.0',
  },
  versions: {
    calculationContractVersion: 'lp-economics/1.1.0',
    engineVersion: 'cash-assembly-period-loop-v1/1.1.0',
    methodologyVersion: 'cash-assembly-period-loop-methodology/1.1.0',
    resultCalculationVersion: null,
  },
  hashes: {
    capitalEnvelopeHash: 'a'.repeat(64),
    policyAssumptionsHash: 'b'.repeat(64),
    factsSnapshotInputHash: 'c'.repeat(64),
    planAssumptionsHash: 'd'.repeat(64),
    forecastInputHash: 'e'.repeat(64),
    inputHash: 'f'.repeat(64),
    resultHash: null,
  },
  outcome: {
    runState: 'failed',
    failure: { code: 'CARRY_PCT_INVALID', context: { field: 'carryPct' } },
  },
} as const;

function buildApp() {
  const app = express();
  app.use('/api', internalEconomicsRouter);
  return app;
}

beforeEach(() => {
  authState.authenticated = true;
  authState.fundAccess = true;
  authState.role = 'admin';
  authState.lpId = undefined;
  authState.calls = [];
  service.getLpEconomicsRunReceipt.mockReset();
  service.getLpEconomicsRunReceipt.mockResolvedValue(RECEIPT);
});

describe('internal-economics receipt route contract', () => {
  it('runs the read limiter before route-local authentication and denies anonymous callers', async () => {
    authState.authenticated = false;

    await request(buildApp()).get('/api/funds/1/internal-economics/runs/9').expect(401);

    expect(authState.calls).toEqual(['readLimiter', 'requireAuth']);
    expect(service.getLpEconomicsRunReceipt).not.toHaveBeenCalled();
  });

  it.each(['admin', 'partner', 'analyst'])(
    'allows the interactive investment-team role %s to read any fund',
    async (role) => {
      authState.role = role;
      authState.fundAccess = true;

      const response = await request(buildApp())
        .get('/api/funds/1/internal-economics/runs/9')
        .expect(200);

      expect(authState.calls).toEqual(['readLimiter', 'requireAuth', 'requireFundAccess']);
      expect(service.getLpEconomicsRunReceipt).toHaveBeenCalledWith({ fundId: 1, runId: 9 });
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(response.body).toEqual(RECEIPT);
      expect(JSON.stringify(response.body)).not.toMatch(
        /replayed|idempotencyKey|requestHash|resultSnapshotId|createdBy/
      );
    }
  );

  it.each([
    ['service', undefined],
    ['viewer', undefined],
    ['operator', undefined],
    ['unknown', undefined],
    ['partner', 41],
  ])(
    'denies non-team principal role=%s lpId=%s before fund access and service work',
    async (role, lpId) => {
      authState.role = role;
      authState.lpId = lpId;

      await request(buildApp()).get('/api/funds/1/internal-economics/runs/9').expect(403);

      expect(authState.calls).toEqual(['readLimiter', 'requireAuth']);
      expect(service.getLpEconomicsRunReceipt).not.toHaveBeenCalled();
    }
  );

  it.each(['0', '-1', '01', '1.0', 'abc'])(
    'rejects noncanonical fund ID %s before role, fund access, and service work',
    async (fundId) => {
      const response = await request(buildApp())
        .get(`/api/funds/${fundId}/internal-economics/runs/9`)
        .expect(400);

      expect(response.body).toEqual({
        error: 'Invalid fund ID',
        message: 'Fund ID must be a canonical positive integer',
      });
      expect(authState.calls).toEqual(['readLimiter', 'requireAuth']);
      expect(service.getLpEconomicsRunReceipt).not.toHaveBeenCalled();
    }
  );

  it.each(['0', '-1', '01', '1.0', 'abc'])(
    'rejects noncanonical run ID %s after fund access and before service work',
    async (runId) => {
      const response = await request(buildApp())
        .get(`/api/funds/1/internal-economics/runs/${runId}`)
        .expect(400);

      expect(response.body).toEqual({
        error: 'Invalid run ID',
        message: 'Run ID must be a canonical positive integer',
      });
      expect(authState.calls).toEqual(['readLimiter', 'requireAuth', 'requireFundAccess']);
      expect(service.getLpEconomicsRunReceipt).not.toHaveBeenCalled();
    }
  );

  it('does not invoke the receipt service when fund access denies', async () => {
    authState.fundAccess = false;

    await request(buildApp()).get('/api/funds/1/internal-economics/runs/9').expect(403);

    expect(service.getLpEconomicsRunReceipt).not.toHaveBeenCalled();
  });

  it.each([
    [404, 'RUN_NOT_FOUND', 'The internal LP economics run was not found.'],
    [404, 'RUN_NOT_FOUND', 'The internal LP economics run does not belong to this fund.'],
    [
      500,
      'UNSUPPORTED_CALCULATION_CONTRACT_VERSION',
      'Persisted run version tuple is unsupported.',
    ],
  ] as const)(
    'maps typed service error %s/%s without leaking persistence data',
    async (status, code, message) => {
      service.getLpEconomicsRunReceipt.mockRejectedValue(
        new LpEconomicsRunServiceError(status, code, message, {
          persistenceRow: { id: 9 },
        })
      );

      const response = await request(buildApp())
        .get('/api/funds/1/internal-economics/runs/9')
        .expect(status);

      expect(response.body).toEqual({ error: code, message });
      expect(response.body).not.toHaveProperty('details');
    }
  );
});
