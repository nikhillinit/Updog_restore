import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import express from 'express';
import request from 'supertest';

const fundScopeState = vi.hoisted(() => ({
  enforceProvidedFundScope: vi.fn(async (_req: Request, _res: Response, _fundId: number) => true),
}));

const serviceState = vi.hoisted(() => ({
  listAllocationScenarios: vi.fn(async () => []),
  getAllocationScenario: vi.fn(async () => ({})),
  getAllocationScenarioApplyPreview: vi.fn(async () => ({})),
  createAllocationScenario: vi.fn(async () => ({})),
  createReserveIcDecision: vi.fn(async () => ({})),
  listReserveIcDecisions: vi.fn(async () => []),
  syncAllocationScenario: vi.fn(async () => ({})),
  applyAllocationScenario: vi.fn(async () => ({})),
  updateReserveIcDecision: vi.fn(async () => ({})),
  updateAllocationScenario: vi.fn(async () => ({})),
}));

vi.mock('../../../server/lib/auth/provided-fund-scope', () => ({
  enforceProvidedFundScope: fundScopeState.enforceProvidedFundScope,
}));

vi.mock('../../../server/services/allocation-scenario-service.js', () => ({
  listAllocationScenarios: serviceState.listAllocationScenarios,
  getAllocationScenario: serviceState.getAllocationScenario,
  getAllocationScenarioApplyPreview: serviceState.getAllocationScenarioApplyPreview,
  createAllocationScenario: serviceState.createAllocationScenario,
  createReserveIcDecision: serviceState.createReserveIcDecision,
  listReserveIcDecisions: serviceState.listReserveIcDecisions,
  syncAllocationScenario: serviceState.syncAllocationScenario,
  applyAllocationScenario: serviceState.applyAllocationScenario,
  updateReserveIcDecision: serviceState.updateReserveIcDecision,
  updateAllocationScenario: serviceState.updateAllocationScenario,
}));

import allocationScenarioRouter from '../../../server/routes/allocation-scenarios';

const SCENARIO_ID = '00000000-0000-0000-0000-000000000101';
const DECISION_ID = '00000000-0000-0000-0000-000000000301';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = {
      id: 'analyst-1',
      sub: 'analyst-1',
      email: 'analyst@example.com',
      role: 'analyst',
      roles: ['analyst'],
      fundIds: [1],
      ip: '127.0.0.1',
      userAgent: 'vitest',
    };
    next();
  });
  app.use(allocationScenarioRouter);
  app.use((_req, res) => res.status(404).json({ error: 'not_found' }));
  return app;
}

function denyOnce() {
  fundScopeState.enforceProvidedFundScope.mockImplementationOnce(async (_req, res) => {
    res.status(403).json({ error: 'Forbidden', code: 'FUND_ACCESS_DENIED' });
    return false;
  });
}

describe('allocation-scenarios route fund-scope contracts', () => {
  beforeEach(() => {
    fundScopeState.enforceProvidedFundScope.mockReset();
    fundScopeState.enforceProvidedFundScope.mockResolvedValue(true);
    serviceState.listAllocationScenarios.mockReset();
    serviceState.listAllocationScenarios.mockResolvedValue([]);
    serviceState.createAllocationScenario.mockReset();
    serviceState.createAllocationScenario.mockResolvedValue({});
    serviceState.updateReserveIcDecision.mockReset();
    serviceState.updateReserveIcDecision.mockResolvedValue({});
    serviceState.applyAllocationScenario.mockReset();
    serviceState.applyAllocationScenario.mockResolvedValue({});
  });

  it('rejects a non-canonical fundId before the scope check and the service', async () => {
    const res = await request(makeApp()).get('/funds/01/allocation-scenarios');
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'invalid_fund_id' });
    expect(fundScopeState.enforceProvidedFundScope).not.toHaveBeenCalled();
    expect(serviceState.listAllocationScenarios).not.toHaveBeenCalled();
  });

  it('denies cross-fund scope on the list read before the service', async () => {
    denyOnce();
    const res = await request(makeApp()).get('/funds/2/allocation-scenarios');
    expect(res.status).toBe(403);
    expect(fundScopeState.enforceProvidedFundScope).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      2
    );
    expect(serviceState.listAllocationScenarios).not.toHaveBeenCalled();
  });

  it('denies cross-fund scope on scenario create before the write', async () => {
    denyOnce();
    const res = await request(makeApp())
      .post('/funds/2/allocation-scenarios')
      .send({
        name: 'probe',
        snapshot_items: [
          {
            company_id: 1,
            planned_reserves_cents: 0,
            allocation_cap_cents: null,
            allocation_reason: null,
          },
        ],
      });
    expect(res.status).toBe(403);
    expect(fundScopeState.enforceProvidedFundScope).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      2
    );
    expect(serviceState.createAllocationScenario).not.toHaveBeenCalled();
  });

  it('denies cross-fund scope on the nested decision write before the service', async () => {
    denyOnce();
    const res = await request(makeApp())
      .patch(`/funds/2/allocation-scenarios/${SCENARIO_ID}/decisions/${DECISION_ID}`)
      .send({ decisionStatus: 'approved' });
    expect(res.status).toBe(403);
    expect(fundScopeState.enforceProvidedFundScope).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      2
    );
    expect(serviceState.updateReserveIcDecision).not.toHaveBeenCalled();
  });

  it('denies cross-fund scope on scenario apply before the write', async () => {
    denyOnce();
    const res = await request(makeApp())
      .post(`/funds/2/allocation-scenarios/${SCENARIO_ID}/apply`)
      .send({ preview_token: 'a'.repeat(64) });
    expect(res.status).toBe(403);
    expect(fundScopeState.enforceProvidedFundScope).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      2
    );
    expect(serviceState.applyAllocationScenario).not.toHaveBeenCalled();
  });

  it('runs the guard for the requested fund before body validation', async () => {
    const res = await request(makeApp()).post('/funds/1/allocation-scenarios').send({});
    expect(res.status).toBe(400);
    expect(fundScopeState.enforceProvidedFundScope).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      1
    );
    expect(serviceState.createAllocationScenario).not.toHaveBeenCalled();
  });
});
