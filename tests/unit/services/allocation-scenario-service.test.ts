import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { transactionMock, queryMock, applyAllocationUpdatesMock } = vi.hoisted(() => ({
  transactionMock: vi.fn(),
  queryMock: vi.fn(),
  applyAllocationUpdatesMock: vi.fn(),
}));

vi.mock('../../../server/db/pg-circuit.js', () => ({
  transaction: transactionMock,
}));

vi.mock('../../../server/services/allocation-write-service.js', () => ({
  applyAllocationUpdates: applyAllocationUpdatesMock,
}));

import {
  applyAllocationScenario,
  getAllocationScenario,
  getAllocationScenarioApplyPreview,
  listAllocationScenarios,
  syncAllocationScenario,
} from '../../../server/services/allocation-scenario-service';

const scenarioId = '00000000-0000-0000-0000-000000000101';

function buildScenarioHeader(options: {
  sourceAllocationVersion: number | null;
  companyCount: number;
  totalPlannedCents: string;
  lastAppliedAt?: Date | null;
  lastAppliedBy?: string | null;
  lastAppliedAllocationVersion?: number | null;
  lastSyncedAt?: Date | null;
  lastSyncedBy?: string | null;
  updatedAt?: Date;
}) {
  return {
    id: scenarioId,
    fund_id: 1,
    name: 'Upside reserve plan',
    notes: 'Follow-on heavy scenario',
    source_allocation_version: options.sourceAllocationVersion,
    company_count: options.companyCount,
    total_planned_cents: options.totalPlannedCents,
    last_applied_at: options.lastAppliedAt ?? null,
    last_applied_by: options.lastAppliedBy ?? null,
    last_applied_allocation_version: options.lastAppliedAllocationVersion ?? null,
    last_synced_at: options.lastSyncedAt ?? null,
    last_synced_by: options.lastSyncedBy ?? null,
    created_at: new Date('2026-03-30T15:00:00.000Z'),
    updated_at: options.updatedAt ?? new Date('2026-03-30T16:00:00.000Z'),
  };
}

function queuePreviewQueries(options: {
  sourceAllocationVersion: number | null;
  scenarioItems: Array<{
    company_id: number;
    planned_reserves_cents: string;
    allocation_cap_cents: string | null;
    allocation_reason: string | null;
  }>;
  liveRows: Array<{
    company_id: number;
    company_name: string;
    planned_reserves_cents: string;
    deployed_reserves_cents: string;
    allocation_cap_cents: string | null;
    allocation_reason: string | null;
    allocation_version: number;
    last_allocation_at: Date | null;
  }>;
}) {
  queryMock
    .mockResolvedValueOnce({ rows: [{ id: 1 }] })
    .mockResolvedValueOnce({
      rows: [
        buildScenarioHeader({
          sourceAllocationVersion: options.sourceAllocationVersion,
          companyCount: options.scenarioItems.length,
          totalPlannedCents: options.scenarioItems
            .reduce((sum, item) => sum + parseInt(item.planned_reserves_cents, 10), 0)
            .toString(),
        }),
      ],
    })
    .mockResolvedValueOnce({ rows: options.scenarioItems })
    .mockResolvedValueOnce({ rows: options.liveRows });
}

describe('allocation scenario apply preview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transactionMock.mockImplementation(async (callback: (client: { query: typeof queryMock }) => unknown) =>
      callback({ query: queryMock })
    );
  });

  it('returns apply_allowed when live versions exactly match the scenario source version', async () => {
    queuePreviewQueries({
      sourceAllocationVersion: 5,
      scenarioItems: [
        {
          company_id: 1,
          planned_reserves_cents: '120000000',
          allocation_cap_cents: '150000000',
          allocation_reason: 'Lead the next round',
        },
        {
          company_id: 2,
          planned_reserves_cents: '200000000',
          allocation_cap_cents: null,
          allocation_reason: null,
        },
      ],
      liveRows: [
        {
          company_id: 1,
          company_name: 'Alpha',
          planned_reserves_cents: '100000000',
          deployed_reserves_cents: '40000000',
          allocation_cap_cents: '150000000',
          allocation_reason: 'Lead the next round',
          allocation_version: 5,
          last_allocation_at: new Date('2026-03-30T17:00:00.000Z'),
        },
        {
          company_id: 2,
          company_name: 'Beta',
          planned_reserves_cents: '200000000',
          deployed_reserves_cents: '60000000',
          allocation_cap_cents: null,
          allocation_reason: null,
          allocation_version: 5,
          last_allocation_at: new Date('2026-03-30T16:30:00.000Z'),
        },
      ],
    });

    const result = await getAllocationScenarioApplyPreview(1, scenarioId);

    expect(result).toMatchObject({
      drift_status: 'exact_match',
      apply_state: 'apply_allowed',
      live: {
        fund_id: 1,
        company_count: 2,
        total_planned_cents: 300000000,
        total_deployed_cents: 100000000,
        max_allocation_version: 5,
        last_updated_at: '2026-03-30T17:00:00.000Z',
      },
      summary: {
        companies_changed: 1,
        companies_unchanged: 1,
        scenario_only_count: 0,
        live_only_count: 0,
        total_planned_delta_cents: 20000000,
      },
    });
    expect(result.live_token).toMatch(/^[a-f0-9]{64}$/);
    expect(queryMock).toHaveBeenCalledTimes(4);
  });

  it('returns confirmable_with_drift when the live set is still mappable but newer', async () => {
    queuePreviewQueries({
      sourceAllocationVersion: 2,
      scenarioItems: [
        {
          company_id: 1,
          planned_reserves_cents: '125000000',
          allocation_cap_cents: null,
          allocation_reason: 'Wait for milestone',
        },
      ],
      liveRows: [
        {
          company_id: 1,
          company_name: 'Alpha',
          planned_reserves_cents: '90000000',
          deployed_reserves_cents: '25000000',
          allocation_cap_cents: null,
          allocation_reason: 'Legacy plan',
          allocation_version: 4,
          last_allocation_at: new Date('2026-03-30T18:00:00.000Z'),
        },
      ],
    });

    const result = await getAllocationScenarioApplyPreview(1, scenarioId);

    expect(result).toMatchObject({
      drift_status: 'stale_but_mappable',
      apply_state: 'confirmable_with_drift',
      live: {
        max_allocation_version: 4,
      },
      summary: {
        companies_changed: 1,
        companies_unchanged: 0,
        scenario_only_count: 0,
        live_only_count: 0,
        total_planned_delta_cents: 35000000,
      },
    });
  });

  it('returns blocked when the live company set no longer matches the saved scenario', async () => {
    queuePreviewQueries({
      sourceAllocationVersion: 3,
      scenarioItems: [
        {
          company_id: 1,
          planned_reserves_cents: '100000000',
          allocation_cap_cents: null,
          allocation_reason: null,
        },
        {
          company_id: 2,
          planned_reserves_cents: '50000000',
          allocation_cap_cents: null,
          allocation_reason: 'Preserve runway',
        },
      ],
      liveRows: [
        {
          company_id: 1,
          company_name: 'Alpha',
          planned_reserves_cents: '100000000',
          deployed_reserves_cents: '50000000',
          allocation_cap_cents: null,
          allocation_reason: null,
          allocation_version: 3,
          last_allocation_at: new Date('2026-03-30T17:00:00.000Z'),
        },
        {
          company_id: 3,
          company_name: 'Gamma',
          planned_reserves_cents: '75000000',
          deployed_reserves_cents: '10000000',
          allocation_cap_cents: null,
          allocation_reason: null,
          allocation_version: 3,
          last_allocation_at: new Date('2026-03-30T18:30:00.000Z'),
        },
      ],
    });

    const result = await getAllocationScenarioApplyPreview(1, scenarioId);

    expect(result).toMatchObject({
      drift_status: 'company_set_changed',
      apply_state: 'blocked',
      summary: {
        companies_changed: 0,
        companies_unchanged: 1,
        scenario_only_count: 1,
        live_only_count: 1,
        total_planned_delta_cents: -25000000,
      },
    });
  });
});

describe('allocation scenario read model metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transactionMock.mockImplementation(
      async (callback: (client: { query: typeof queryMock }) => unknown) => callback({ query: queryMock })
    );
  });

  it('maps last apply and sync metadata in list reads', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: scenarioId,
            fund_id: 1,
            name: 'Upside reserve plan',
            notes: 'Follow-on heavy scenario',
            source_allocation_version: 3,
            company_count: 2,
            total_planned_cents: '350000000',
            last_applied_at: new Date('2026-03-30T18:00:00.000Z'),
            last_applied_by: 'nikhil@example.com',
            last_applied_allocation_version: 7,
            last_synced_at: new Date('2026-03-30T17:30:00.000Z'),
            last_synced_by: 'system',
            created_at: new Date('2026-03-30T15:00:00.000Z'),
            updated_at: new Date('2026-03-30T18:00:00.000Z'),
          },
        ],
      });

    const result = await listAllocationScenarios(1);

    expect(result).toEqual([
      expect.objectContaining({
        id: scenarioId,
        last_applied_at: '2026-03-30T18:00:00.000Z',
        last_applied_by: 'nikhil@example.com',
        last_applied_allocation_version: 7,
        last_synced_at: '2026-03-30T17:30:00.000Z',
        last_synced_by: 'system',
      }),
    ]);
  });

  it('maps last apply and sync metadata in detail reads', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: scenarioId,
            fund_id: 1,
            name: 'Upside reserve plan',
            notes: 'Follow-on heavy scenario',
            source_allocation_version: 3,
            company_count: 2,
            total_planned_cents: '350000000',
            last_applied_at: new Date('2026-03-30T18:00:00.000Z'),
            last_applied_by: 'nikhil@example.com',
            last_applied_allocation_version: 7,
            last_synced_at: new Date('2026-03-30T17:30:00.000Z'),
            last_synced_by: 'system',
            created_at: new Date('2026-03-30T15:00:00.000Z'),
            updated_at: new Date('2026-03-30T18:00:00.000Z'),
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            company_id: 1,
            planned_reserves_cents: '200000000',
            allocation_cap_cents: '250000000',
            allocation_reason: 'Series B support',
          },
          {
            company_id: 2,
            planned_reserves_cents: '150000000',
            allocation_cap_cents: null,
            allocation_reason: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: '00000000-0000-0000-0000-000000000203',
            event_type: 'applied',
            actor_user_id: 17,
            actor_label: 'nikhil@example.com',
            note: 'Apply approved reserve plan',
            source_allocation_version: 6,
            resulting_allocation_version: 7,
            change_summary_json: {
              companies_changed: 1,
              companies_unchanged: 1,
              scenario_only_count: 0,
              live_only_count: 0,
              total_planned_delta_cents: 25000000,
              headline: 'Applied 1 company',
            },
            created_at: new Date('2026-03-30T18:00:00.000Z'),
          },
          {
            id: '00000000-0000-0000-0000-000000000202',
            event_type: 'synced',
            actor_user_id: null,
            actor_label: 'system',
            note: 'Refresh from live',
            source_allocation_version: 2,
            resulting_allocation_version: 3,
            change_summary_json: {
              companies_changed: 1,
              companies_unchanged: 1,
              scenario_only_count: 0,
              live_only_count: 0,
              total_planned_delta_cents: -25000000,
              headline: 'Synced 1 company',
            },
            created_at: new Date('2026-03-30T17:30:00.000Z'),
          },
        ],
      });

    const result = await getAllocationScenario(1, scenarioId);

    expect(result).toMatchObject({
      id: scenarioId,
      last_applied_at: '2026-03-30T18:00:00.000Z',
      last_applied_by: 'nikhil@example.com',
      last_applied_allocation_version: 7,
      last_synced_at: '2026-03-30T17:30:00.000Z',
      last_synced_by: 'system',
      context: {
        scenario_notes: 'Follow-on heavy scenario',
        last_sync: {
          by: 'system',
          note: 'Refresh from live',
          source_allocation_version: 2,
          resulting_allocation_version: 3,
          change_summary: {
            companies_changed: 1,
            total_planned_delta_cents: -25000000,
            headline: 'Synced 1 company',
          },
        },
        last_apply: {
          by: 'nikhil@example.com',
          note: 'Apply approved reserve plan',
          source_allocation_version: 6,
          resulting_allocation_version: 7,
          change_summary: {
            companies_changed: 1,
            total_planned_delta_cents: 25000000,
            headline: 'Applied 1 company',
          },
        },
      },
      snapshot_items: [
        expect.objectContaining({ company_id: 1, planned_reserves_cents: 200000000 }),
        expect.objectContaining({ company_id: 2, planned_reserves_cents: 150000000 }),
      ],
    });
  });
});

describe('allocation scenario sync and apply semantics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transactionMock.mockImplementation(
      async (callback: (client: { query: typeof queryMock }) => unknown) => callback({ query: queryMock })
    );
  });

  it('syncs scenario items from live allocations and records a sync event', async () => {
    queuePreviewQueries({
      sourceAllocationVersion: 3,
      scenarioItems: [
        {
          company_id: 1,
          planned_reserves_cents: '200000000',
          allocation_cap_cents: '250000000',
          allocation_reason: 'Series B support',
        },
        {
          company_id: 2,
          planned_reserves_cents: '150000000',
          allocation_cap_cents: null,
          allocation_reason: null,
        },
      ],
      liveRows: [
        {
          company_id: 1,
          company_name: 'Alpha',
          planned_reserves_cents: '175000000',
          deployed_reserves_cents: '40000000',
          allocation_cap_cents: '250000000',
          allocation_reason: 'Refresh from live',
          allocation_version: 7,
          last_allocation_at: new Date('2026-03-30T18:10:00.000Z'),
        },
        {
          company_id: 2,
          company_name: 'Beta',
          planned_reserves_cents: '150000000',
          deployed_reserves_cents: '60000000',
          allocation_cap_cents: null,
          allocation_reason: null,
          allocation_version: 7,
          last_allocation_at: new Date('2026-03-30T18:05:00.000Z'),
        },
      ],
    });

    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 17 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: '00000000-0000-0000-0000-000000000201',
            event_type: 'synced',
            actor_user_id: 17,
            actor_label: 'analyst@example.com',
            note: 'Refresh from live',
            source_allocation_version: 3,
            resulting_allocation_version: 7,
            change_summary_json: {
              companies_changed: 1,
              companies_unchanged: 1,
              scenario_only_count: 0,
              live_only_count: 0,
              total_planned_delta_cents: -25000000,
              headline: 'Synced 1 company',
            },
            created_at: new Date('2026-03-30T18:15:00.000Z'),
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          buildScenarioHeader({
            sourceAllocationVersion: 7,
            companyCount: 2,
            totalPlannedCents: '325000000',
            lastSyncedAt: new Date('2026-03-30T18:15:00.000Z'),
            lastSyncedBy: 'analyst@example.com',
            updatedAt: new Date('2026-03-30T18:15:00.000Z'),
          }),
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            company_id: 1,
            planned_reserves_cents: '175000000',
            allocation_cap_cents: '250000000',
            allocation_reason: 'Refresh from live',
          },
          {
            company_id: 2,
            planned_reserves_cents: '150000000',
            allocation_cap_cents: null,
            allocation_reason: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: '00000000-0000-0000-0000-000000000201',
            event_type: 'synced',
            actor_user_id: 17,
            actor_label: 'analyst@example.com',
            note: 'Refresh from live',
            source_allocation_version: 3,
            resulting_allocation_version: 7,
            change_summary_json: {
              companies_changed: 1,
              companies_unchanged: 1,
              scenario_only_count: 0,
              live_only_count: 0,
              total_planned_delta_cents: -25000000,
              headline: 'Synced 1 company',
            },
            created_at: new Date('2026-03-30T18:15:00.000Z'),
          },
        ],
      });

    const result = await syncAllocationScenario(1, scenarioId, {
      note: 'Refresh from live',
      actor: {
        user_id: 17,
        label: 'analyst@example.com',
      },
    });

    expect(result.event).toMatchObject({
      event_type: 'synced',
      actor_user_id: 17,
      actor_label: 'analyst@example.com',
      note: 'Refresh from live',
      resulting_allocation_version: 7,
    });
    expect(result.scenario).toMatchObject({
      source_allocation_version: 7,
      last_synced_at: '2026-03-30T18:15:00.000Z',
      last_synced_by: 'analyst@example.com',
      total_planned_cents: 325000000,
      context: {
        scenario_notes: 'Follow-on heavy scenario',
        last_sync: {
          by: 'analyst@example.com',
          note: 'Refresh from live',
          change_summary: {
            companies_changed: 1,
            total_planned_delta_cents: -25000000,
            headline: 'Synced 1 company',
          },
        },
      },
    });
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM allocation_scenario_items'),
      [scenarioId]
    );
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO allocation_scenario_events'),
      expect.arrayContaining([scenarioId, 1, 'synced', 17, 'analyst@example.com'])
    );
  });

  it('applies changed scenario rows through the shared allocation write path and records an apply event', async () => {
    const previewToken = createHash('sha256')
      .update(
        JSON.stringify({
          fundId: 1,
          payload: [
            { company_id: 1, allocation_version: 7 },
            { company_id: 2, allocation_version: 7 },
          ],
        })
      )
      .digest('hex');

    queuePreviewQueries({
      sourceAllocationVersion: 7,
      scenarioItems: [
        {
          company_id: 1,
          planned_reserves_cents: '200000000',
          allocation_cap_cents: '250000000',
          allocation_reason: 'Series B support',
        },
        {
          company_id: 2,
          planned_reserves_cents: '150000000',
          allocation_cap_cents: null,
          allocation_reason: null,
        },
      ],
      liveRows: [
        {
          company_id: 1,
          company_name: 'Alpha',
          planned_reserves_cents: '175000000',
          deployed_reserves_cents: '40000000',
          allocation_cap_cents: '250000000',
          allocation_reason: 'Refresh from live',
          allocation_version: 7,
          last_allocation_at: new Date('2026-03-30T18:20:00.000Z'),
        },
        {
          company_id: 2,
          company_name: 'Beta',
          planned_reserves_cents: '150000000',
          deployed_reserves_cents: '60000000',
          allocation_cap_cents: null,
          allocation_reason: null,
          allocation_version: 7,
          last_allocation_at: new Date('2026-03-30T18:18:00.000Z'),
        },
      ],
    });

    applyAllocationUpdatesMock.mockResolvedValue({
      new_version: 8,
      updated_count: 1,
    });

    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 17 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: '00000000-0000-0000-0000-000000000202',
            event_type: 'applied',
            actor_user_id: 17,
            actor_label: 'analyst@example.com',
            note: 'Apply approved reserve plan',
            source_allocation_version: 7,
            resulting_allocation_version: 8,
            change_summary_json: {
              companies_changed: 1,
              companies_unchanged: 1,
              scenario_only_count: 0,
              live_only_count: 0,
              total_planned_delta_cents: 25000000,
              headline: 'Applied 1 company',
            },
            created_at: new Date('2026-03-30T18:30:00.000Z'),
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          buildScenarioHeader({
            sourceAllocationVersion: 8,
            companyCount: 2,
            totalPlannedCents: '350000000',
            lastAppliedAt: new Date('2026-03-30T18:30:00.000Z'),
            lastAppliedBy: 'analyst@example.com',
            lastAppliedAllocationVersion: 8,
            updatedAt: new Date('2026-03-30T18:30:00.000Z'),
          }),
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            company_id: 1,
            planned_reserves_cents: '200000000',
            allocation_cap_cents: '250000000',
            allocation_reason: 'Series B support',
          },
          {
            company_id: 2,
            planned_reserves_cents: '150000000',
            allocation_cap_cents: null,
            allocation_reason: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: '00000000-0000-0000-0000-000000000202',
            event_type: 'applied',
            actor_user_id: 17,
            actor_label: 'analyst@example.com',
            note: 'Apply approved reserve plan',
            source_allocation_version: 7,
            resulting_allocation_version: 8,
            change_summary_json: {
              companies_changed: 1,
              companies_unchanged: 1,
              scenario_only_count: 0,
              live_only_count: 0,
              total_planned_delta_cents: 25000000,
              headline: 'Applied 1 company',
            },
            created_at: new Date('2026-03-30T18:30:00.000Z'),
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            company_id: 1,
            company_name: 'Alpha',
            planned_reserves_cents: '200000000',
            deployed_reserves_cents: '40000000',
            allocation_cap_cents: '250000000',
            allocation_reason: 'Series B support',
            allocation_version: 8,
            last_allocation_at: new Date('2026-03-30T18:30:00.000Z'),
          },
          {
            company_id: 2,
            company_name: 'Beta',
            planned_reserves_cents: '150000000',
            deployed_reserves_cents: '60000000',
            allocation_cap_cents: null,
            allocation_reason: null,
            allocation_version: 7,
            last_allocation_at: new Date('2026-03-30T18:18:00.000Z'),
          },
        ],
      });

    const result = await applyAllocationScenario(1, scenarioId, {
      preview_token: previewToken,
      note: 'Apply approved reserve plan',
      actor: {
        user_id: 17,
        label: 'analyst@example.com',
      },
    });

    expect(applyAllocationUpdatesMock).toHaveBeenCalledWith(
      { query: queryMock },
      expect.objectContaining({
        fundId: 1,
        userId: 17,
        auditMetadata: {
          source: 'allocation_scenario_apply',
          scenario_id: scenarioId,
        },
        updates: [
          {
            company_id: 1,
            planned_reserves_cents: 200000000,
            allocation_cap_cents: 250000000,
            allocation_reason: 'Series B support',
            expected_version: 7,
          },
        ],
      })
    );
    expect(result.event).toMatchObject({
      event_type: 'applied',
      resulting_allocation_version: 8,
      actor_label: 'analyst@example.com',
    });
    expect(result.live).toMatchObject({
      updated_count: 1,
      resulting_allocation_version: 8,
      previous_preview_token: previewToken,
      current_live_token: expect.any(String),
    });
    expect(result.scenario).toMatchObject({
      source_allocation_version: 8,
      last_applied_at: '2026-03-30T18:30:00.000Z',
      last_applied_by: 'analyst@example.com',
      last_applied_allocation_version: 8,
      context: {
        scenario_notes: 'Follow-on heavy scenario',
        last_apply: {
          by: 'analyst@example.com',
          note: 'Apply approved reserve plan',
          change_summary: {
            companies_changed: 1,
            total_planned_delta_cents: 25000000,
            headline: 'Applied 1 company',
          },
        },
      },
    });
  });

  it('rejects apply when the preview token is stale', async () => {
    queuePreviewQueries({
      sourceAllocationVersion: 7,
      scenarioItems: [
        {
          company_id: 1,
          planned_reserves_cents: '200000000',
          allocation_cap_cents: '250000000',
          allocation_reason: 'Series B support',
        },
      ],
      liveRows: [
        {
          company_id: 1,
          company_name: 'Alpha',
          planned_reserves_cents: '175000000',
          deployed_reserves_cents: '40000000',
          allocation_cap_cents: '250000000',
          allocation_reason: 'Refresh from live',
          allocation_version: 9,
          last_allocation_at: new Date('2026-03-30T18:20:00.000Z'),
        },
      ],
    });

    await expect(
      applyAllocationScenario(1, scenarioId, {
        preview_token: 'stale-preview-token',
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'preview_token_mismatch',
    });
    expect(applyAllocationUpdatesMock).not.toHaveBeenCalled();
  });
});
