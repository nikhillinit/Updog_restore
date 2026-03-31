import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const {
  listAllocationScenariosMock,
  getAllocationScenarioMock,
  getAllocationScenarioApplyPreviewMock,
  createAllocationScenarioMock,
  syncAllocationScenarioMock,
  applyAllocationScenarioMock,
  updateAllocationScenarioMock,
} = vi.hoisted(() => ({
  listAllocationScenariosMock: vi.fn(),
  getAllocationScenarioMock: vi.fn(),
  getAllocationScenarioApplyPreviewMock: vi.fn(),
  createAllocationScenarioMock: vi.fn(),
  syncAllocationScenarioMock: vi.fn(),
  applyAllocationScenarioMock: vi.fn(),
  updateAllocationScenarioMock: vi.fn(),
}));

vi.mock('../../../server/services/allocation-scenario-service.js', () => ({
  listAllocationScenarios: listAllocationScenariosMock,
  getAllocationScenario: getAllocationScenarioMock,
  getAllocationScenarioApplyPreview: getAllocationScenarioApplyPreviewMock,
  createAllocationScenario: createAllocationScenarioMock,
  syncAllocationScenario: syncAllocationScenarioMock,
  applyAllocationScenario: applyAllocationScenarioMock,
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
  context: {
    scenario_notes: 'Follow-on heavy scenario',
    last_sync: null,
    last_apply: null,
  },
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

const scenarioSyncResult = {
  scenario: {
    ...scenarioDetail,
    source_allocation_version: 7,
    company_count: 2,
    total_planned_cents: 325000000,
    last_synced_at: '2026-03-30T18:15:00.000Z',
    last_synced_by: 'analyst@example.com',
    updated_at: '2026-03-30T18:15:00.000Z',
    context: {
      scenario_notes: 'Follow-on heavy scenario',
      last_sync: {
        event_id: '00000000-0000-0000-0000-000000000202',
        at: '2026-03-30T18:15:00.000Z',
        by: 'analyst@example.com',
        note: 'Refresh from live before committee review',
        source_allocation_version: 3,
        resulting_allocation_version: 7,
        change_summary: {
          companies_changed: 1,
          companies_unchanged: 1,
          scenario_only_count: 0,
          live_only_count: 0,
          total_planned_delta_cents: -25000000,
          headline: 'Synced 1 company',
        },
      },
      last_apply: null,
    },
  },
  event: {
    id: '00000000-0000-0000-0000-000000000202',
    event_type: 'synced',
    actor_user_id: 17,
    actor_label: 'analyst@example.com',
    note: 'Refresh from live before committee review',
    source_allocation_version: 3,
    resulting_allocation_version: 7,
    change_summary: {
      companies_changed: 1,
      companies_unchanged: 1,
      scenario_only_count: 0,
      live_only_count: 0,
      total_planned_delta_cents: -25000000,
      headline: 'Synced 1 company',
    },
    created_at: '2026-03-30T18:15:00.000Z',
  },
};

const scenarioApplyResult = {
  scenario: {
    ...scenarioDetail,
    source_allocation_version: 8,
    last_applied_at: '2026-03-30T18:30:00.000Z',
    last_applied_by: 'analyst@example.com',
    last_applied_allocation_version: 8,
    updated_at: '2026-03-30T18:30:00.000Z',
    context: {
      scenario_notes: 'Follow-on heavy scenario',
      last_sync: null,
      last_apply: {
        event_id: '00000000-0000-0000-0000-000000000203',
        at: '2026-03-30T18:30:00.000Z',
        by: 'analyst@example.com',
        note: 'Apply approved reserve plan',
        source_allocation_version: 7,
        resulting_allocation_version: 8,
        change_summary: {
          companies_changed: 1,
          companies_unchanged: 1,
          scenario_only_count: 0,
          live_only_count: 0,
          total_planned_delta_cents: 25000000,
          headline: 'Applied 1 company',
        },
      },
    },
  },
  event: {
    id: '00000000-0000-0000-0000-000000000203',
    event_type: 'applied',
    actor_user_id: 17,
    actor_label: 'analyst@example.com',
    note: 'Apply approved reserve plan',
    source_allocation_version: 7,
    resulting_allocation_version: 8,
    change_summary: {
      companies_changed: 1,
      companies_unchanged: 1,
      scenario_only_count: 0,
      live_only_count: 0,
      total_planned_delta_cents: 25000000,
      headline: 'Applied 1 company',
    },
    created_at: '2026-03-30T18:30:00.000Z',
  },
  live: {
    updated_count: 1,
    resulting_allocation_version: 8,
    previous_preview_token: 'preview-token',
    current_live_token: 'next-preview-token',
  },
};

describe('Allocation scenarios API', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = {
        id: '17',
        sub: '17',
        email: 'analyst@example.com',
        roles: ['analyst'],
        ip: '127.0.0.1',
        userAgent: 'vitest',
      };
      next();
    });
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

  it('syncs a scenario from live allocations', async () => {
    syncAllocationScenarioMock.mockResolvedValue(scenarioSyncResult);

    const payload = {
      note: 'Refresh from live before committee review',
    };

    const response = await request(app)
      .post(`/funds/1/allocation-scenarios/${scenarioId}/sync`)
      .send(payload)
      .expect(200);

    expect(response.body).toEqual(scenarioSyncResult);
    expect(syncAllocationScenarioMock).toHaveBeenCalledWith(1, scenarioId, {
      ...payload,
      actor: {
        user_id: 17,
        label: 'analyst@example.com',
      },
    });
  });

  it('applies a scenario with a preview token', async () => {
    applyAllocationScenarioMock.mockResolvedValue(scenarioApplyResult);

    const payload = {
      preview_token: 'a'.repeat(64),
      note: 'Apply approved reserve plan',
    };

    const response = await request(app)
      .post(`/funds/1/allocation-scenarios/${scenarioId}/apply`)
      .send(payload)
      .expect(200);

    expect(response.body).toEqual(scenarioApplyResult);
    expect(applyAllocationScenarioMock).toHaveBeenCalledWith(1, scenarioId, {
      ...payload,
      actor: {
        user_id: 17,
        label: 'analyst@example.com',
      },
    });
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

  it('rejects invalid apply payloads before touching the service', async () => {
    const response = await request(app)
      .post(`/funds/1/allocation-scenarios/${scenarioId}/apply`)
      .send({ preview_token: 'stale' })
      .expect(400);

    expect(response.body).toEqual(
      expect.objectContaining({
        error: 'invalid_request_body',
      })
    );
    expect(applyAllocationScenarioMock).not.toHaveBeenCalled();
  });

  it('maps service conflicts to 409 responses', async () => {
    applyAllocationScenarioMock.mockRejectedValue(
      Object.assign(new Error('Apply preview has expired; refresh preview and try again'), {
        statusCode: 409,
        code: 'preview_token_mismatch',
        details: {
          current_live_token: 'fresh-token',
        },
      })
    );

    const response = await request(app)
      .post(`/funds/1/allocation-scenarios/${scenarioId}/apply`)
      .send({ preview_token: 'a'.repeat(64) })
      .expect(409);

    expect(response.body).toEqual({
      error: 'conflict',
      code: 'preview_token_mismatch',
      message: 'Apply preview has expired; refresh preview and try again',
      details: {
        current_live_token: 'fresh-token',
      },
    });
  });
});
