import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import type { Express, NextFunction, Request, Response } from 'express';

// Deterministic global-boundary 401: a local `.env` can supply the
// NODE_ENV=development / REQUIRE_AUTH=false combination that makes the REAL
// requireAuth dev-bypass a credential-less request, so asserting the raw
// middleware would be environment-dependent. Reproduce the canonical
// fail-closed 401 for credential-less requests and DELEGATE to the real
// middleware whenever a credential is present, so verification, the
// claims->user mapping (role/fundIds/lpId), and the handler's fund-scope guard
// stay genuinely exercised (fund-moic behavior-test pattern).
vi.mock('../../../server/lib/auth/jwt', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../server/lib/auth/jwt')>();
  return {
    ...actual,
    requireAuth: () => (req: Request, res: Response, next: NextFunction) => {
      if (!req.headers.authorization) return res.sendStatus(401);
      return actual.requireAuth()(req, res, next);
    },
  };
});

import { makeApp } from '../../../server/app';
import { signToken } from '../../../server/lib/auth/jwt';
// In test-mock-db mode `server/db` exports this exact singleton, so seeding it
// here drives the route's DEFAULT reader end to end with no live database.
import { databaseMock } from '../../helpers/database-mock';

const ROUTE = '/api/v1/reserves/constrained/reconciliations';
const LEDGER_TABLE = 'substrate_shadow_reconciliations';

function bearer(claims: Record<string, unknown>): string {
  return `Bearer ${signToken(claims)}`;
}

const TEAM_MEMBER = { sub: 'recon-read-analyst', role: 'analyst', fundIds: [] };

function ledgerRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    fundId: 1,
    calculationKey: 'reserve-constrained',
    configuredMode: 'shadow',
    effectiveMode: 'shadow',
    killSwitchActive: false,
    substrateState: 'indicative',
    reconciliationStatus: 'match',
    inputHash: 'a'.repeat(64),
    resultHash: 'b'.repeat(64),
    assumptionsHash: 'c'.repeat(64),
    mismatches: [],
    observedAt: new Date('2026-07-18T01:00:00.000Z'),
    ...overrides,
  };
}

describe('GET /api/v1/reserves/constrained/reconciliations (ADR-051)', () => {
  let app: Express;

  beforeAll(() => {
    app = makeApp();
  });

  afterEach(() => {
    databaseMock.setMockData(LEDGER_TABLE, []);
  });

  it('401 without a Bearer credential (global /api boundary)', async () => {
    const res = await request(app).get(`${ROUTE}?fundId=1`);

    expect(res.status).toBe(401);
  });

  it('400 when fundId is absent or non-conforming', async () => {
    for (const query of ['', '?fundId=abc', '?fundId=0', '?fundId=1.5']) {
      const res = await request(app)
        .get(`${ROUTE}${query}`)
        .set('Authorization', bearer(TEAM_MEMBER));

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_fund_id');
      expect(typeof res.body.rid).toBe('string');
    }
  });

  it('400 when limit is present but non-conforming', async () => {
    for (const query of ['?fundId=1&limit=abc', '?fundId=1&limit=0', '?fundId=1&limit=2.5']) {
      const res = await request(app)
        .get(`${ROUTE}${query}`)
        .set('Authorization', bearer(TEAM_MEMBER));

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_limit');
    }
  });

  it('200 with an empty list when no ledger rows exist (prod-safe table-absent posture)', async () => {
    const res = await request(app)
      .get(`${ROUTE}?fundId=1`)
      .set('Authorization', bearer(TEAM_MEMBER));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      fundId: 1,
      calculationKey: 'reserve-constrained',
      observations: [],
      rid: expect.any(String),
    });
  });

  it('200 with fund-scoped observations projected to the read DTO', async () => {
    databaseMock.setMockData(LEDGER_TABLE, [
      ledgerRow({ id: 1, observedAt: new Date('2026-07-18T01:00:00.000Z') }),
      ledgerRow({
        id: 2,
        reconciliationStatus: 'mismatch',
        mismatches: ['remaining cents differ: substrate 100 vs legacy 101'],
        observedAt: new Date('2026-07-18T03:00:00.000Z'),
      }),
      ledgerRow({ id: 3, fundId: 2, observedAt: new Date('2026-07-18T04:00:00.000Z') }),
    ]);

    const res = await request(app)
      .get(`${ROUTE}?fundId=1`)
      .set('Authorization', bearer(TEAM_MEMBER));

    expect(res.status).toBe(200);
    expect(res.body.fundId).toBe(1);
    expect(res.body.calculationKey).toBe('reserve-constrained');

    const observations = [...res.body.observations].sort(
      (a: { id: number }, b: { id: number }) => a.id - b.id
    );
    expect(observations).toEqual([
      {
        id: 1,
        fundId: 1,
        calculationKey: 'reserve-constrained',
        configuredMode: 'shadow',
        effectiveMode: 'shadow',
        killSwitchActive: false,
        substrateState: 'indicative',
        reconciliationStatus: 'match',
        inputHash: 'a'.repeat(64),
        resultHash: 'b'.repeat(64),
        assumptionsHash: 'c'.repeat(64),
        mismatches: [],
        observedAt: '2026-07-18T01:00:00.000Z',
      },
      {
        id: 2,
        fundId: 1,
        calculationKey: 'reserve-constrained',
        configuredMode: 'shadow',
        effectiveMode: 'shadow',
        killSwitchActive: false,
        substrateState: 'indicative',
        reconciliationStatus: 'mismatch',
        inputHash: 'a'.repeat(64),
        resultHash: 'b'.repeat(64),
        assumptionsHash: 'c'.repeat(64),
        mismatches: ['remaining cents differ: substrate 100 vs legacy 101'],
        observedAt: '2026-07-18T03:00:00.000Z',
      },
    ]);
  });

  it('applies ?limit at the HTTP layer', async () => {
    databaseMock.setMockData(LEDGER_TABLE, [
      ledgerRow({ id: 1, observedAt: new Date('2026-07-18T01:00:00.000Z') }),
      ledgerRow({ id: 2, observedAt: new Date('2026-07-18T02:00:00.000Z') }),
      ledgerRow({ id: 3, observedAt: new Date('2026-07-18T03:00:00.000Z') }),
    ]);

    const res = await request(app)
      .get(`${ROUTE}?fundId=1&limit=2`)
      .set('Authorization', bearer(TEAM_MEMBER));

    expect(res.status).toBe(200);
    expect(res.body.observations).toHaveLength(2);
  });

  it('403 for a non-team caller without an explicit grant on the fund', async () => {
    const res = await request(app)
      .get(`${ROUTE}?fundId=1`)
      .set('Authorization', bearer({ sub: 'recon-read-viewer', role: 'viewer', fundIds: [2] }));

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
  });

  it('200 for a non-team caller WITH an explicit grant (strict fund scope allow path)', async () => {
    const res = await request(app)
      .get(`${ROUTE}?fundId=1`)
      .set('Authorization', bearer({ sub: 'recon-read-viewer', role: 'viewer', fundIds: [1] }));

    expect(res.status).toBe(200);
    expect(res.body.observations).toEqual([]);
  });

  it('403 for an LP-affiliated caller even with a team-like role', async () => {
    const res = await request(app)
      .get(`${ROUTE}?fundId=1`)
      .set(
        'Authorization',
        bearer({ sub: 'recon-read-lp', role: 'analyst', lpId: 12, fundIds: [] })
      );

    expect(res.status).toBe(403);
  });
});
