import { beforeEach, describe, expect, it, vi } from 'vitest';

const { transactionMock, queryMock } = vi.hoisted(() => ({
  transactionMock: vi.fn(),
  queryMock: vi.fn(),
}));

vi.mock('../../../server/db/pg-circuit.js', () => ({
  transaction: transactionMock,
}));

import { getAllocationScenarioApplyPreview } from '../../../server/services/allocation-scenario-service';

const scenarioId = '00000000-0000-0000-0000-000000000101';

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
        {
          id: scenarioId,
          fund_id: 1,
          name: 'Upside reserve plan',
          notes: 'Follow-on heavy scenario',
          source_allocation_version: options.sourceAllocationVersion,
          company_count: options.scenarioItems.length,
          total_planned_cents: options.scenarioItems
            .reduce((sum, item) => sum + parseInt(item.planned_reserves_cents, 10), 0)
            .toString(),
          created_at: new Date('2026-03-30T15:00:00.000Z'),
          updated_at: new Date('2026-03-30T16:00:00.000Z'),
        },
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
