import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';

const { transactionMock, queryMock } = vi.hoisted(() => ({
  transactionMock: vi.fn(),
  queryMock: vi.fn(),
}));

vi.mock('../../../server/db/pg-circuit.js', () => ({
  transaction: transactionMock,
}));

import {
  archiveFundScenarioSet,
  listFundScenarioSets,
} from '../../../server/services/fund-scenario-set-service';
import { createFundScenarioSet } from '../../../server/services/fund-scenario-set-create-service';

const scenarioSetId = '00000000-0000-0000-0000-000000000111';
const variantId = '00000000-0000-0000-0000-000000000112';

const feeProfileOverride = {
  overrideType: 'fee_profile',
  payload: {
    feeProfiles: [
      {
        id: 'fee-profile-upside',
        name: 'Upside fees',
        feeTiers: [
          {
            id: 'tier-1',
            name: 'Management fee',
            percentage: 2,
            feeBasis: 'committed_capital',
            startMonth: 0,
          },
        ],
      },
    ],
  },
} as const;

function createRequestHash(fundId: number, input: Record<string, unknown>): string {
  return crypto.createHash('sha256').update(JSON.stringify({ fundId, input })).digest('hex');
}

function scenarioSetRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: scenarioSetId,
    fund_id: 1,
    name: 'Fee sensitivity',
    description: null,
    source_config_id: 12,
    source_config_version: 4,
    created_by_user_id: 17,
    created_by_label: 'analyst@example.com',
    updated_by_user_id: 17,
    updated_by_label: 'analyst@example.com',
    archived_at: null,
    archived_by_user_id: null,
    archived_by_label: null,
    created_at: new Date('2026-05-26T12:00:00.000Z'),
    updated_at: new Date('2026-05-26T12:00:00.000Z'),
    variant_count: '1',
    ...overrides,
  };
}

function variantRow() {
  return {
    id: variantId,
    scenario_set_id: scenarioSetId,
    name: 'Lower fee',
    description: null,
    sort_order: 0,
    override_type: 'fee_profile',
    override_payload: feeProfileOverride.payload,
    created_at: new Date('2026-05-26T12:00:00.000Z'),
    updated_at: new Date('2026-05-26T12:00:00.000Z'),
  };
}

describe('fund scenario set persistence shell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transactionMock.mockImplementation(
      async (callback: (client: { query: typeof queryMock }) => unknown) =>
        callback({ query: queryMock })
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates a scenario set against the current published config and records an audit event', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 12, version: 4 }] })
      .mockResolvedValueOnce({ rows: [{ active_count: '2' }] })
      .mockResolvedValueOnce({ rows: [scenarioSetRow()] })
      .mockResolvedValueOnce({ rows: [variantRow()] })
      .mockResolvedValueOnce({ rows: [{ id: '00000000-0000-0000-0000-000000000113' }] })
      .mockResolvedValueOnce({ rows: [scenarioSetRow()] })
      .mockResolvedValueOnce({ rows: [variantRow()] });

    const result = await createFundScenarioSet(
      1,
      {
        name: 'Fee sensitivity',
        variants: [
          {
            name: 'Lower fee',
            override: feeProfileOverride,
          },
        ],
      },
      {
        userId: 17,
        label: 'analyst@example.com',
      }
    );

    expect(result).toMatchObject({
      id: scenarioSetId,
      fundId: 1,
      sourceConfigId: 12,
      sourceConfigVersion: 4,
      variantCount: 1,
      createdByLabel: 'analyst@example.com',
      variants: [
        expect.objectContaining({
          id: variantId,
          override: feeProfileOverride,
        }),
      ],
    });

    expect(queryMock.mock.calls[3]?.[0]).toContain('INSERT INTO fund_scenario_sets');
    expect(queryMock.mock.calls[3]?.[1]).toEqual([
      1,
      'Fee sensitivity',
      null,
      12,
      4,
      17,
      'analyst@example.com',
      17,
      'analyst@example.com',
      null,
      null,
    ]);
    expect(queryMock.mock.calls[4]?.[0]).toContain('INSERT INTO fund_scenario_variants');
    expect(queryMock.mock.calls[5]?.[0]).toContain('INSERT INTO fund_scenario_set_events');
    expect(queryMock.mock.calls[5]?.[1]).toEqual([
      scenarioSetId,
      1,
      'created',
      17,
      'analyst@example.com',
      {
        headline: 'Created scenario set with 1 variant',
        variant_count: 1,
        source_config_version: 4,
      },
    ]);
  });

  it('refuses to create an eleventh active scenario set for a fund', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 12, version: 4 }] })
      .mockResolvedValueOnce({ rows: [{ active_count: '10' }] });

    await expect(
      createFundScenarioSet(
        1,
        {
          name: 'Overflow',
          variants: [{ name: 'Lower fee', override: feeProfileOverride }],
        },
        { userId: 17, label: 'analyst@example.com' }
      )
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'max_scenario_sets',
    });
  });

  it('locks the fund row before checking the active scenario set cap', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 12, version: 4 }] })
      .mockResolvedValueOnce({ rows: [{ active_count: '2' }] })
      .mockResolvedValueOnce({ rows: [scenarioSetRow()] })
      .mockResolvedValueOnce({ rows: [variantRow()] })
      .mockResolvedValueOnce({ rows: [{ id: '00000000-0000-0000-0000-000000000113' }] })
      .mockResolvedValueOnce({ rows: [scenarioSetRow()] })
      .mockResolvedValueOnce({ rows: [variantRow()] });

    await createFundScenarioSet(
      1,
      {
        name: 'Fee sensitivity',
        variants: [{ name: 'Lower fee', override: feeProfileOverride }],
      },
      { userId: 17, label: 'analyst@example.com' }
    );

    expect(queryMock.mock.calls[0]?.[0]).toContain('FOR UPDATE');
    expect(queryMock.mock.calls[2]?.[0]).toContain('COUNT(*)::int AS active_count');
  });

  it('maps duplicate active scenario set names to a conflict', async () => {
    const duplicateNameError = Object.assign(
      new Error('duplicate key value violates unique constraint'),
      {
        code: '23505',
        constraint: 'fund_scenario_sets_fund_name_active_unique',
      }
    );

    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 12, version: 4 }] })
      .mockResolvedValueOnce({ rows: [{ active_count: '2' }] })
      .mockRejectedValueOnce(duplicateNameError);

    await expect(
      createFundScenarioSet(
        1,
        {
          name: 'Fee sensitivity',
          variants: [{ name: 'Lower fee', override: feeProfileOverride }],
        },
        { userId: 17, label: 'analyst@example.com' }
      )
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'duplicate_scenario_set_name',
    });
  });

  it('persists an idempotency key and request hash when creating a scenario set', async () => {
    const input = {
      name: 'Fee sensitivity',
      variants: [{ name: 'Lower fee', override: feeProfileOverride }],
    };
    const expectedHash = createRequestHash(1, input);

    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 12, version: 4 }] })
      .mockResolvedValueOnce({ rows: [{ active_count: '2' }] })
      .mockResolvedValueOnce({ rows: [scenarioSetRow()] })
      .mockResolvedValueOnce({ rows: [variantRow()] })
      .mockResolvedValueOnce({ rows: [{ id: '00000000-0000-0000-0000-000000000113' }] })
      .mockResolvedValueOnce({ rows: [scenarioSetRow()] })
      .mockResolvedValueOnce({ rows: [variantRow()] });

    await createFundScenarioSet(
      1,
      input,
      { userId: 17, label: 'analyst@example.com' },
      {
        idempotencyKey: 'scenario-create-1',
      }
    );

    expect(queryMock.mock.calls[1]?.[0]).toContain('idempotency_key = $2');
    expect(queryMock.mock.calls[4]?.[0]).toContain('idempotency_key');
    expect(queryMock.mock.calls[4]?.[1]).toEqual([
      1,
      'Fee sensitivity',
      null,
      12,
      4,
      17,
      'analyst@example.com',
      17,
      'analyst@example.com',
      'scenario-create-1',
      expectedHash,
    ]);
  });

  it('replays an existing scenario set for the same idempotency key and payload', async () => {
    const input = {
      name: 'Fee sensitivity',
      variants: [{ name: 'Lower fee', override: feeProfileOverride }],
    };

    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({
        rows: [
          scenarioSetRow({
            idempotency_key: 'scenario-create-1',
            idempotency_request_hash: createRequestHash(1, input),
          }),
        ],
      })
      .mockResolvedValueOnce({ rows: [scenarioSetRow()] })
      .mockResolvedValueOnce({ rows: [variantRow()] });

    const result = await createFundScenarioSet(
      1,
      input,
      { userId: 17, label: 'analyst@example.com' },
      { idempotencyKey: 'scenario-create-1' }
    );

    expect(result.id).toBe(scenarioSetId);
    expect(queryMock).toHaveBeenCalledTimes(4);
    expect(queryMock.mock.calls[2]?.[0]).toContain('WHERE s.fund_id = $1');
  });

  it('rejects an idempotency key reused with a different payload', async () => {
    const input = {
      name: 'Fee sensitivity',
      variants: [{ name: 'Lower fee', override: feeProfileOverride }],
    };

    queryMock.mockResolvedValueOnce({ rows: [{ id: 1 }] }).mockResolvedValueOnce({
      rows: [
        scenarioSetRow({
          idempotency_key: 'scenario-create-1',
          idempotency_request_hash: 'different-request-hash',
        }),
      ],
    });

    await expect(
      createFundScenarioSet(
        1,
        input,
        { userId: 17, label: 'analyst@example.com' },
        { idempotencyKey: 'scenario-create-1' }
      )
    ).rejects.toMatchObject({
      statusCode: 422,
      code: 'idempotency_key_reused',
    });
  });

  it('lists active scenario sets without archived rows by default', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 1 }] }).mockResolvedValueOnce({
      rows: [scenarioSetRow()],
    });

    const result = await listFundScenarioSets(1);

    expect(result).toEqual([
      expect.objectContaining({
        id: scenarioSetId,
        archivedAt: null,
        variantCount: 1,
      }),
    ]);
    expect(queryMock.mock.calls[1]?.[0]).toContain('archived_at IS NULL');
  });

  it('archives a scenario set idempotently and records actor attribution once', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [scenarioSetRow()] })
      .mockResolvedValueOnce({
        rows: [
          scenarioSetRow({
            archived_at: new Date('2026-05-26T13:00:00.000Z'),
            archived_by_user_id: 17,
            archived_by_label: 'analyst@example.com',
            updated_at: new Date('2026-05-26T13:00:00.000Z'),
          }),
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: '00000000-0000-0000-0000-000000000114' }] });

    const result = await archiveFundScenarioSet(1, scenarioSetId, {
      userId: 17,
      label: 'analyst@example.com',
    });

    expect(result.archivedAt).toBe('2026-05-26T13:00:00.000Z');
    expect(queryMock.mock.calls[1]?.[0]).toContain('FOR UPDATE OF s');
    expect(queryMock.mock.calls[1]?.[0]).not.toContain('GROUP BY');
    expect(queryMock.mock.calls[2]?.[0]).toContain('UPDATE fund_scenario_sets');
    expect(queryMock.mock.calls[3]?.[0]).toContain('INSERT INTO fund_scenario_set_events');
  });
});
