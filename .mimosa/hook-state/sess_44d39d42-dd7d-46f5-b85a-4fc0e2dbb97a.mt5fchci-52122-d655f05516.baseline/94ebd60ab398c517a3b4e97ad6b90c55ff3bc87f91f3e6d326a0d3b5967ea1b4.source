import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

// Hoisted mutable resolver state read INSIDE the vi.fn factory implementation,
// which the global `restoreMocks: true` preserves across tests (declaration-time
// mockResolvedValue would be stripped). Each test sets the mode it needs; the
// no-fundId path never consults the resolver at all.
const resolverState = vi.hoisted(() => ({
  resolution: { configuredMode: 'off' as 'off' | 'shadow' | 'on', killSwitchActive: false },
}));

// Mock the Tranche 6 resolver MODULE (the same seam the T7 shadow route test
// mocks): the promotion service imports its default resolver from this module,
// so this mock keeps governing the route after the T11 rewire.
vi.mock('../../../server/services/substrate-calc-mode-resolver', () => ({
  resolveSubstrateCalcMode: vi.fn(async () => ({ ...resolverState.resolution })),
}));

import { makeApp } from '../../../server/app';
import { signToken } from '../../../server/lib/auth/jwt';
import { ConstrainedReserveEngine } from '../../../shared/core/reserves/ConstrainedReserveEngine';
import { ReserveInputSchema } from '../../../shared/schemas';

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

describe('POST /api/v1/reserves/calculate substrate promotion (ADR-052)', () => {
  let app: Express;
  let authorization: string;

  beforeAll(() => {
    app = makeApp();
    authorization = `Bearer ${signToken({
      sub: 'reserves-promotion-route-test',
      role: 'analyst',
      fundIds: [],
    })}`;
  });

  beforeEach(() => {
    resolverState.resolution = { configuredMode: 'off', killSwitchActive: false };
  });

  function calculate(path: string) {
    return request(app).post(path).set('Authorization', authorization).send(VALID_BODY);
  }

  it('resolver `on`: 200 and the promoted response deep-equals the no-fundId legacy response (verified-match, cents-equal by construction)', async () => {
    const withoutFund = await calculate('/api/v1/reserves/calculate');
    resolverState.resolution = { configuredMode: 'on', killSwitchActive: false };
    const withFund = await calculate('/api/v1/reserves/calculate?fundId=1');

    expect(withoutFund.status).toBe(200);
    expect(withFund.status).toBe(200);
    expect(stripRid(withFund.body)).toEqual(stripRid(withoutFund.body));
  });

  it('resolver `off`: byte-identical (modulo rid) to the no-fundId response', async () => {
    const withoutFund = await calculate('/api/v1/reserves/calculate');
    const withFund = await calculate('/api/v1/reserves/calculate?fundId=1');

    expect(withoutFund.status).toBe(200);
    expect(withFund.status).toBe(200);
    expect(stripRid(withFund.body)).toEqual(stripRid(withoutFund.body));
  });

  it('resolver `on` + kill switch: byte-identical (modulo rid) to the no-fundId response', async () => {
    const withoutFund = await calculate('/api/v1/reserves/calculate');
    resolverState.resolution = { configuredMode: 'on', killSwitchActive: true };
    const withFund = await calculate('/api/v1/reserves/calculate?fundId=1');

    expect(withoutFund.status).toBe(200);
    expect(withFund.status).toBe(200);
    expect(stripRid(withFund.body)).toEqual(stripRid(withoutFund.body));
  });

  it('no-fundId: unchanged - serves exactly the legacy engine output for the request', async () => {
    const response = await calculate('/api/v1/reserves/calculate');
    const legacy = new ConstrainedReserveEngine().calculate(ReserveInputSchema.parse(VALID_BODY));

    expect(response.status).toBe(200);
    expect(Object.keys(response.body).sort()).toEqual([
      'allocations',
      'remaining',
      'rid',
      'totalAllocated',
    ]);
    expect(stripRid(response.body)).toEqual({
      allocations: legacy.allocations,
      totalAllocated: legacy.totalAllocated,
      remaining: legacy.remaining,
    });
  });
});
