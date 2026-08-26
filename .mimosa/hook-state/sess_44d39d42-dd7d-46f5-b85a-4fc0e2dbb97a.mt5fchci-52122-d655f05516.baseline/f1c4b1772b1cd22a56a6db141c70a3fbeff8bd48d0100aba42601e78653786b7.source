import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

// Mock the Tranche 6 resolver so the shadow actually runs (in `shadow` mode)
// with no live DB. The only runtime consumer of this module is the shadow
// helper, so replacing the whole module is safe.
vi.mock('../../../server/services/substrate-calc-mode-resolver', () => ({
  resolveSubstrateCalcMode: vi.fn(async () => ({
    configuredMode: 'shadow',
    killSwitchActive: false,
  })),
}));

import { makeApp } from '../../../server/app';
import { signToken } from '../../../server/lib/auth/jwt';

const VALID_BODY = {
  availableReserves: 1_000_000,
  companies: [
    { id: 'c1', name: 'Alpha', stage: 'seed', invested: 250_000, ownership: 0.15 },
    { id: 'c2', name: 'Beta', stage: 'series_a', invested: 1_000_000, ownership: 0.1 },
  ],
  stagePolicies: [
    { stage: 'seed', reserveMultiple: 2.5, weight: 1 },
    { stage: 'series_a', reserveMultiple: 2, weight: 1.2 },
  ],
};

function stripRid(body: Record<string, unknown>) {
  const { rid: _rid, ...rest } = body;
  return rest;
}

describe('POST /api/v1/reserves/calculate substrate shadow (ADR-048)', () => {
  let app: Express;

  beforeAll(() => {
    app = makeApp();
  });

  it('is byte-identical (modulo rid) and 200 with and without ?fundId', async () => {
    const authorization = `Bearer ${signToken({
      sub: 'reserves-shadow-route-test',
      role: 'analyst',
      fundIds: [],
    })}`;
    const withoutFund = await request(app)
      .post('/api/v1/reserves/calculate')
      .set('Authorization', authorization)
      .send(VALID_BODY);
    const withFund = await request(app)
      .post('/api/v1/reserves/calculate?fundId=1')
      .set('Authorization', authorization)
      .send(VALID_BODY);

    expect(withoutFund.status).toBe(200);
    expect(withFund.status).toBe(200);
    expect(stripRid(withFund.body)).toEqual(stripRid(withoutFund.body));
  });
});
