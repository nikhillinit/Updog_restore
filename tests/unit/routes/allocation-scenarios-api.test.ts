import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const {
  listAllocationScenariosMock,
  getAllocationScenarioMock,
  getAllocationScenarioApplyPreviewMock,
  createAllocationScenarioMock,
  updateAllocationScenarioMock,
} = vi.hoisted(() => ({
  listAllocationScenariosMock: vi.fn(),
  getAllocationScenarioMock: vi.fn(),
  getAllocationScenarioApplyPreviewMock: vi.fn(),
  createAllocationScenarioMock: vi.fn(),
  updateAllocationScenarioMock: vi.fn(),
}));

vi.mock('../../../server/services/allocation-scenario-service.js', () => ({
  listAllocationScenarios: listAllocationScenariosMock,
  getAllocationScenario: getAllocationScenarioMock,
  getAllocationScenarioApplyPreview: getAllocationScenarioApplyPreviewMock,
  createAllocationScenario: createAllocationScenarioMock,
  updateAllocationScenario: updateAllocationScenarioMock,
}));

import allocationScenarioRouter from '../../../server/routes/allocation-scenarios';

const scenarioId = '00000000-0000-0000-0000-000000000101';
const scenarioDetail = {
  id: scenarioId,
  fund_id: 1,
  name: 'Upside reserve plan',
  notes: 'Follow-on heavy scenario',
  source_allocation_version: 3,
  company_count: 2,
  total_planned_cents: 350000000,
  last_applied_at: null,
  last_applied_by: null,
  last_applied_allocation_version: null,
  last_synced_at: null,
  last_synced_by: null,
  created_at: '2026-03-30T15:00:00.000Z',
  updated_at: '2026-03-30T16:00:00.000Z',
  snapshot_items: [
    {
      company_id: 1,
      planned_reserves_cents: 200000000,
      allocation_cap_cents: 250000000,
      allocation_reason: 'Series B support',
    },
    {
      company_id: 2,
      planned_reserves_cents: 150000000,
      allocation_cap_cents: null,
      allocation_reason: null,
    },
  ],
};

const scenarioApplyPreview = {
  scenario: {
    id: scenarioId,
    fund_id: 1,
    name: 'Upside reserve plan',
    notes: 'Follow-on heavy scenario',
    source_allocation_version: 3,
    company_count: 2,
    total_planned_cents: 350000000,
    last_applied_at: null,
    last_applied_by: null,
    last_applied_allocation_version: null,
    last_synced_at: null,
    last_synced_by: null,
    created_at: '2026-03-30T15:00:00.000Z',
    updated_at: '2026-03-30T16:00:00.000Z',
  },
  live: {
    fund_id: 1,
    company_count: 2,
    total_planned_cents: 325000000,
    total_deployed_cents: 100000000,
    max_allocation_version: 3,
    last_updated_at: '2026-03-30T17:00:00.000Z',
  },
  drift_status: 'exact_match',
  apply_state: 'apply_allowed',
  live_token: 'preview-token',
  summary: {
    companies_changed: 1,
    companies_unchanged: 1,
    scenario_only_count: 0,
    live_only_count: 0,
    total_planned_delta_cents: 25000000,
  },
};

describe('Allocation scenarios API', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(allocationScenarioRouter);
    vi.clearAllMocks();
  });

  it('lists scenarios for a fund', async () => {
    listAllocationScenariosMock.mockResolvedValue([
      {
        ...scenarioDetail,
        snapshot_items: undefined,
      },
    ]);

    const response = await request(app).get('/funds/1/allocation-scenarios').expect(200);

    expect(response.body).toEqual({
      scenarios: [
        expect.objectContaining({
          id: scenarioId,
          name: 'Upside reserve plan',
          updated_at: '2026-03-30T16:00:00.000Z',
        }),
      ],
    });
    expect(listAllocationScenariosMock).toHaveBeenCalledWith(1);
  });

  it('fetches scenario detail', async () => {
    getAllocationScenarioMock.mockResolvedValue(scenarioDetail);

    const response = await request(app)
      .get(`/funds/1/allocation-scenarios/${scenarioId}`)
      .expect(200);

    expect(response.body).toEqual(scenarioDetail);
    expect(getAllocationScenarioMock).toHaveBeenCalledWith(1, scenarioId);
  });

  it('fetches scenario apply preview', async () => {
    getAllocationScenarioApplyPreviewMock.mockResolvedValue(scenarioApplyPreview);

    const response = await request(app)
      .get(`/funds/1/allocation-scenarios/${scenarioId}/apply-preview`)
      .expect(200);

    expect(response.body).toEqual(scenarioApplyPreview);
    expect(getAllocationScenarioApplyPreviewMock).toHaveBeenCalledWith(1, scenarioId);
  });

  it('creates a scenario snapshot', async () => {
    createAllocationScenarioMock.mockResolvedValue(scenarioDetail);

    const payload = {
      name: 'Upside reserve plan',
      notes: 'Follow-on heavy scenario',
      source_allocation_version: 3,
      snapshot_items: scenarioDetail.snapshot_items,
    };

    const response = await request(app)
      .post('/funds/1/allocation-scenarios')
      .send(payload)
      .expect(201);

    expect(response.body).toEqual(scenarioDetail);
    expect(createAllocationScenarioMock).toHaveBeenCalledWith(1, payload);
  });

  it('patches scenario metadata and snapshots', async () => {
    updateAllocationScenarioMock.mockResolvedValue({
      ...scenarioDetail,
      name: 'Renamed reserve plan',
    });

    const payload = {
      name: 'Renamed reserve plan',
      notes: 'Updated label',
    };

    const response = await request(app)
      .patch(`/funds/1/allocation-scenarios/${scenarioId}`)
      .send(payload)
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        id: scenarioId,
        name: 'Renamed reserve plan',
      })
    );
    expect(updateAllocationScenarioMock).toHaveBeenCalledWith(1, scenarioId, payload);
  });

  it('rejects invalid fund ids before touching the service', async () => {
    const response = await request(app).get('/funds/not-a-number/allocation-scenarios').expect(400);

    expect(response.body).toEqual(
      expect.objectContaining({
        error: 'invalid_fund_id',
      })
    );
    expect(listAllocationScenariosMock).not.toHaveBeenCalled();
  });

  it('rejects invalid scenario ids before touching the service', async () => {
    const response = await request(app).get('/funds/1/allocation-scenarios/not-a-uuid').expect(400);

    expect(response.body).toEqual(
      expect.objectContaining({
        error: 'invalid_scenario_id',
      })
    );
    expect(getAllocationScenarioMock).not.toHaveBeenCalled();
  });

  it('rejects empty patch payloads', async () => {
    const response = await request(app)
      .patch(`/funds/1/allocation-scenarios/${scenarioId}`)
      .send({})
      .expect(400);

    expect(response.body).toEqual(
      expect.objectContaining({
        error: 'invalid_request_body',
      })
    );
    expect(updateAllocationScenarioMock).not.toHaveBeenCalled();
  });
});
