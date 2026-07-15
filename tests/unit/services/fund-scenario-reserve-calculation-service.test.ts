import { beforeEach, describe, expect, it, vi } from 'vitest';

const { transactionMock, identityQueryMock } = vi.hoisted(() => ({
  transactionMock: vi.fn(),
  identityQueryMock: vi.fn(),
}));

vi.mock('../../../server/db/pg-circuit.js', () => ({
  transaction: transactionMock,
}));

import {
  createReserveScenarioInputHash,
  getReserveScenarioCalculationIdentity,
} from '../../../server/services/fund-scenario-reserve-calculation-service';
import { persistReserveScenarioSnapshot } from '../../../server/services/fund-scenario-reserve-snapshot-store';
import type { FundScenarioCalculationPayloadV1 } from '../../../shared/contracts/fund-scenario-sets-v1.contract';

describe('fund scenario reserve calculation service', () => {
  beforeEach(() => {
    identityQueryMock.mockReset();
    transactionMock.mockReset().mockImplementation(
      async (callback: (client: { query: typeof identityQueryMock }) => unknown) =>
        callback({ query: identityQueryMock })
    );
  });

  it.each([
    {
      label: 'eligible dated config',
      config: { fundName: 'Reserve Fund', modelInputsAsOfDate: '2026-06-30' },
      expectedLineage: {
        hashKind: 'scenario-input-hash-v2',
        modelInputsAsOfDate: '2026-06-30',
        comparisonLineageVersion: 'comparison-lineage-v1',
      },
    },
    {
      label: 'undated legacy config',
      config: { fundName: 'Legacy Reserve Fund' },
      expectedLineage: {
        hashKind: 'scenario-input-hash-v1',
        modelInputsAsOfDate: null,
        comparisonLineageVersion: null,
      },
    },
  ])('derives async run lineage from the pinned $label', async ({ config, expectedLineage }) => {
    const scenarioSetId = '11111111-1111-4111-8111-111111111111';
    identityQueryMock
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: scenarioSetId,
            fund_id: 1,
            name: 'Reserve sensitivity',
            description: null,
            source_config_id: 2,
            source_config_version: 3,
            created_by_user_id: 7,
            created_by_label: 'owner@example.com',
            updated_by_user_id: 7,
            updated_by_label: 'owner@example.com',
            archived_at: null,
            archived_by_user_id: null,
            archived_by_label: null,
            created_at: new Date('2026-06-01T00:00:00.000Z'),
            updated_at: new Date('2026-06-01T00:00:00.000Z'),
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: '22222222-2222-4222-8222-222222222222',
            scenario_set_id: scenarioSetId,
            name: 'Reserve variant',
            description: null,
            sort_order: 0,
            override_type: 'reserve_allocation',
            override_payload: {
              allocationVersion: null,
              items: [{ companyId: 1, plannedReservesCents: 1000 }],
            },
            created_at: new Date('2026-06-01T00:00:00.000Z'),
            updated_at: new Date('2026-06-01T00:00:00.000Z'),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: 2, version: 3, config }] })
      .mockResolvedValueOnce({ rows: [{ version: 3 }] });

    const result = await getReserveScenarioCalculationIdentity(1, scenarioSetId);

    expect(result.inputLineage).toEqual(expectedLineage);
    expect(result.inputHash).toMatch(/^[a-f0-9]{64}$/);
    expect(String(identityQueryMock.mock.calls[3]?.[0])).toContain('SELECT id, version, config');
  });

  it('creates a stable input hash regardless of equivalent variant ordering', () => {
    const first = createReserveScenarioInputHash({
      fundId: 1,
      scenarioSetId: '11111111-1111-4111-8111-111111111111',
      sourceConfigId: 2,
      sourceConfigVersion: 3,
      calcVersion: 'fund-scenarios-v1',
      calculationMode: 'async_reserve_allocation',
      variants: [
        {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          sortOrder: 1,
          override: { b: 2, a: 1 },
        },
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          sortOrder: 2,
          override: { amountCents: 1000 },
        },
      ],
    });

    const second = createReserveScenarioInputHash({
      fundId: 1,
      scenarioSetId: '11111111-1111-4111-8111-111111111111',
      sourceConfigId: 2,
      sourceConfigVersion: 3,
      calcVersion: 'fund-scenarios-v1',
      calculationMode: 'async_reserve_allocation',
      variants: [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          sortOrder: 2,
          override: { amountCents: 1000 },
        },
        {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          sortOrder: 1,
          override: { a: 1, b: 2 },
        },
      ],
    });

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it('cuts over to a date-bound v2 hash while preserving undated legacy v1 hashing', () => {
    const input = {
      fundId: 1,
      scenarioSetId: '11111111-1111-4111-8111-111111111111',
      sourceConfigId: 2,
      sourceConfigVersion: 3,
      calcVersion: 'fund-scenarios-v1',
      calculationMode: 'async_reserve_allocation' as const,
      variants: [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          sortOrder: 1,
          override: { amountCents: 1000 },
        },
      ],
    };

    const legacyHash = createReserveScenarioInputHash(input);
    const juneHash = createReserveScenarioInputHash({
      ...input,
      modelInputsAsOfDate: '2026-06-30',
    });
    const julyHash = createReserveScenarioInputHash({
      ...input,
      modelInputsAsOfDate: '2026-07-31',
    });

    expect(juneHash).not.toBe(legacyHash);
    expect(juneHash).not.toBe(julyHash);
    expect(juneHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('stamps reserve input trust summary metadata on scenario snapshots', async () => {
    const reservePayload: FundScenarioCalculationPayloadV1 = {
      version: 'fund-scenarios-v1',
      calculationMode: 'async_reserve_allocation',
      fundId: 1,
      scenarioSetId: '11111111-1111-4111-8111-111111111111',
      sourceConfigId: 2,
      sourceConfigVersion: 3,
      staleness: {
        state: 'CURRENT',
        sourceConfigVersion: 3,
        currentPublishedConfigVersion: 3,
      },
      calculatedAt: '2026-05-29T00:00:00.000Z',
      variants: [
        {
          variantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          scenarioSetId: '11111111-1111-4111-8111-111111111111',
          name: 'Reserve variant',
          overrideType: 'reserve_allocation',
          reserve: {
            fundId: 1,
            totalBaseAllocationCents: 0,
            totalScenarioAllocationCents: 1000,
            totalAllocationDeltaCents: 1000,
            avgConfidence: 1,
            highConfidenceCount: 1,
            allocations: [
              {
                companyId: 1,
                baseAllocationCents: 0,
                plannedReservesCents: 1000,
                maxAllocationCents: null,
                scenarioAllocationCents: 1000,
                allocationDeltaCents: 1000,
                capApplied: false,
                confidence: 1,
                rationale: 'unit test',
              },
            ],
            warnings: [],
            generatedAt: '2026-05-29T00:00:00.000Z',
          },
        },
      ],
    };
    let capturedScenarioSnapshotMetadata:
      | ({ reserve_input_trust_summary_hash?: string } & Record<string, unknown>)
      | undefined;
    const queryMock = vi.fn(async (_sql: string, values: unknown[]) => {
      capturedScenarioSnapshotMetadata = values[4] as {
        reserve_input_trust_summary_hash?: string;
      } & Record<string, unknown>;
      return {
        rows: [
          {
            id: 202,
            payload: reservePayload,
            correlation_id: '11111111-1111-4111-8111-111111111113',
            created_at: new Date(),
            snapshot_time: new Date(),
          },
        ],
      };
    });

    await persistReserveScenarioSnapshot(
      { query: queryMock } as never,
      {
        fundId: 1,
        scenarioSetId: '11111111-1111-4111-8111-111111111111',
        sourceConfigId: 2,
        sourceConfigVersion: 3,
        correlationId: '11111111-1111-4111-8111-111111111113',
        payload: reservePayload,
        inputHash: 'b'.repeat(64),
        variantCount: 1,
        companyCount: 1,
        warningCount: 0,
        reserveInputTrustSummary: {
          trustedForActivation: false,
          defaultedInputCount: 2,
          unavailableInputCount: 0,
          defaultedFields: ['ownership', 'stage'],
          unavailableFields: [],
        },
      }
    );

    expect(capturedScenarioSnapshotMetadata).toMatchObject({
      reserve_input_trust_summary: {
        trustedForActivation: false,
        defaultedFields: ['ownership', 'stage'],
      },
    });
    expect(capturedScenarioSnapshotMetadata!.reserve_input_trust_summary_hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
