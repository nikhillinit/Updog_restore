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
  assertSourcePinnedScenarioVariants,
  createFundScenarioSet,
} from '../../../server/services/fund-scenario-set-create-service';
import { CreateFundScenarioSetV2Schema } from '@shared/contracts/fund-scenario-sets-v1.contract';
import { FundDraftWriteV1Schema } from '@shared/contracts/fund-draft-write-v1.contract';

const scenarioSetId = '00000000-0000-0000-0000-000000000211';

// Pinned published-config draft (FundDraftWriteV1 shapes). Note the deliberate
// cross-array shared id 'alloc-a': row identity is the typed tuple
// {arrayKind, id}, never the bare id.
const pinnedConfig = {
  fundName: 'Fund I',
  allocations: [
    { id: 'alloc-a', category: 'Seed', percentage: 60, description: 'Seed sleeve' },
    { id: 'alloc-b', category: 'Series A', percentage: 40 },
  ],
  capitalPlanAllocations: [
    {
      id: 'cpa-1',
      name: 'Seed checks',
      sectorProfileId: 'sp-1',
      entryRound: 'Seed',
      capitalAllocationPct: 60,
      initialCheckStrategy: 'amount',
      initialCheckAmount: 2000000,
      followOnStrategy: 'amount',
      followOnAmount: 4000000,
      followOnParticipationPct: 0.5,
      investmentHorizonMonths: 84,
    },
    {
      id: 'alloc-a',
      name: 'Shared id row',
      entryRound: 'Series A',
      capitalAllocationPct: 40,
      initialCheckStrategy: 'ownership',
      initialOwnershipPct: 10,
      followOnStrategy: 'maintain_ownership',
      followOnParticipationPct: 0.75,
      investmentHorizonMonths: 96,
    },
  ],
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function buildV2Input() {
  const base = {
    allocations: clone(pinnedConfig.allocations),
    capitalPlanAllocations: clone(pinnedConfig.capitalPlanAllocations),
  };
  const upside = {
    allocations: clone(pinnedConfig.allocations).map((row) => ({
      ...row,
      percentage: row.id === 'alloc-a' ? 70 : 30,
      category: row.category,
    })),
    capitalPlanAllocations: clone(pinnedConfig.capitalPlanAllocations).map((row) => ({
      ...row,
      name: `${row.name} (upside)`,
      capitalAllocationPct: row.capitalAllocationPct + 5,
    })),
  };
  const downside = {
    allocations: clone(pinnedConfig.allocations).map((row) => ({
      ...row,
      percentage: row.id === 'alloc-a' ? 50 : 50,
    })),
    capitalPlanAllocations: clone(pinnedConfig.capitalPlanAllocations).map((row) => ({
      ...row,
      capitalAllocationPct: Math.max(row.capitalAllocationPct - 5, 0),
    })),
  };

  return {
    contractVersion: 'fund-scenario-set-create/2.0.0' as const,
    name: 'Allocation scenarios',
    description: null,
    expectedSourceConfigId: 12,
    expectedSourceConfigVersion: 4,
    variants: [
      {
        name: 'Base',
        description: null,
        override: { overrideType: 'allocation' as const, payload: base },
      },
      {
        name: 'Upside',
        description: null,
        override: { overrideType: 'allocation' as const, payload: upside },
      },
      {
        name: 'Downside',
        description: null,
        override: { overrideType: 'allocation' as const, payload: downside },
      },
    ],
  };
}

function parseV2(input: unknown) {
  const parsed = CreateFundScenarioSetV2Schema.safeParse(input);
  if (!parsed.success) throw new Error('fixture does not parse as V2');
  return parsed.data;
}

function requestHash(fundId: number, input: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify({ fundId, input })).digest('hex');
}

function scenarioSetRow(overrides: Record<string, unknown> = {}) {
  return {
    id: scenarioSetId,
    fund_id: 1,
    name: 'Allocation scenarios',
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
    idempotency_key: null,
    idempotency_request_hash: null,
    created_at: new Date('2026-05-26T12:00:00.000Z'),
    updated_at: new Date('2026-05-26T12:00:00.000Z'),
    variant_count: '3',
    ...overrides,
  };
}

const VARIANT_IDS = [
  '00000000-0000-0000-0000-000000000221',
  '00000000-0000-0000-0000-000000000222',
  '00000000-0000-0000-0000-000000000223',
] as const;

function allocationVariantRow(index: number, payload: unknown) {
  return {
    id: VARIANT_IDS[index]!,
    scenario_set_id: scenarioSetId,
    name: ['Base', 'Upside', 'Downside'][index]!,
    description: null,
    sort_order: index,
    override_type: 'allocation',
    override_payload: payload,
    created_at: new Date('2026-05-26T12:00:00.000Z'),
    updated_at: new Date('2026-05-26T12:00:00.000Z'),
  };
}

function insertQueries() {
  return queryMock.mock.calls.filter(([sql]) => /INSERT INTO/i.test(String(sql)));
}

describe('fund scenario set create V2 (source-pinned allocation templates)', () => {
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

  it('accepts an exact V2 request and inserts against the pinned config', async () => {
    const input = buildV2Input();
    const parsed = parseV2(input);

    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // verifyFundExists
      .mockResolvedValueOnce({ rows: [] }) // idempotency lookup
      .mockResolvedValueOnce({ rows: [{ id: 12, version: 4, config: pinnedConfig }] })
      .mockResolvedValueOnce({ rows: [{ active_count: '0' }] })
      .mockResolvedValueOnce({ rows: [{ id: scenarioSetId }] }) // set insert
      .mockResolvedValueOnce({
        rows: [allocationVariantRow(0, parsed.variants[0].override.payload)],
      })
      .mockResolvedValueOnce({
        rows: [allocationVariantRow(1, parsed.variants[1].override.payload)],
      })
      .mockResolvedValueOnce({
        rows: [allocationVariantRow(2, parsed.variants[2].override.payload)],
      })
      .mockResolvedValueOnce({ rows: [{ id: '00000000-0000-0000-0000-000000000213' }] }) // event
      .mockResolvedValueOnce({ rows: [scenarioSetRow()] })
      .mockResolvedValueOnce({
        rows: [
          allocationVariantRow(0, parsed.variants[0].override.payload),
          allocationVariantRow(1, parsed.variants[1].override.payload),
          allocationVariantRow(2, parsed.variants[2].override.payload),
        ],
      });

    const result = await createFundScenarioSet(
      1,
      input,
      {
        userId: 17,
        label: 'analyst@example.com',
      },
      { idempotencyKey: 'v2-happy' }
    );

    expect(result).toMatchObject({
      id: scenarioSetId,
      sourceConfigId: 12,
      sourceConfigVersion: 4,
      variantCount: 3,
    });

    const setInsert = insertQueries().find(([sql]) =>
      String(sql).includes('INSERT INTO fund_scenario_sets')
    );
    expect(setInsert).toBeDefined();
    expect(setInsert![1]).toEqual(expect.arrayContaining([1, 'Allocation scenarios', null, 12, 4]));
    const variantInserts = insertQueries().filter(([sql]) =>
      String(sql).includes('INSERT INTO fund_scenario_variants')
    );
    expect(variantInserts).toHaveLength(3);
  });

  it('locks the published config row through the create transaction (stale-pin race guard)', async () => {
    const input = buildV2Input();
    const parsed = parseV2(input);

    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 12, version: 4, config: pinnedConfig }] })
      .mockResolvedValueOnce({ rows: [{ active_count: '0' }] })
      .mockResolvedValueOnce({ rows: [{ id: scenarioSetId }] })
      .mockResolvedValueOnce({
        rows: [allocationVariantRow(0, parsed.variants[0].override.payload)],
      })
      .mockResolvedValueOnce({
        rows: [allocationVariantRow(1, parsed.variants[1].override.payload)],
      })
      .mockResolvedValueOnce({
        rows: [allocationVariantRow(2, parsed.variants[2].override.payload)],
      })
      .mockResolvedValueOnce({ rows: [{ id: '00000000-0000-0000-0000-000000000213' }] })
      .mockResolvedValueOnce({ rows: [scenarioSetRow()] })
      .mockResolvedValueOnce({
        rows: [
          allocationVariantRow(0, parsed.variants[0].override.payload),
          allocationVariantRow(1, parsed.variants[1].override.payload),
          allocationVariantRow(2, parsed.variants[2].override.payload),
        ],
      });

    await createFundScenarioSet(1, input, { userId: 17 }, { idempotencyKey: 'v2-lock' });

    // The publish path flips is_published without the funds-row lock; the
    // create read must hold the published row through commit.
    const configRead = queryMock.mock.calls.find(([sql]) =>
      String(sql).includes('FROM fundconfigs')
    );
    expect(configRead).toBeDefined();
    expect(String(configRead![0])).toMatch(/FOR UPDATE/);
  });

  it('rejects a stale source pin with 409 and writes nothing', async () => {
    const input = { ...buildV2Input(), expectedSourceConfigVersion: 5 };

    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 12, version: 4, config: pinnedConfig }] });

    await expect(
      createFundScenarioSet(1, input, { userId: 17 }, { idempotencyKey: 'v2-stale' })
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'scenario_source_config_stale',
      details: {
        suppliedSourceConfigId: 12,
        suppliedSourceConfigVersion: 5,
        currentSourceConfigId: 12,
        currentSourceConfigVersion: 4,
      },
    });

    expect(insertQueries()).toHaveLength(0);
  });

  it('rejects row-identity drift with 422 and writes nothing (UI bypass attempt)', async () => {
    const input = buildV2Input();
    // Drift: Upside (index 1) changes a frozen field on a capital-plan row.
    input.variants[1]!.override.payload.capitalPlanAllocations[0]!.entryRound = 'Series B';

    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 12, version: 4, config: pinnedConfig }] });

    await expect(
      createFundScenarioSet(1, input, { userId: 17 }, { idempotencyKey: 'v2-drift' })
    ).rejects.toMatchObject({
      statusCode: 422,
      code: 'scenario_variant_row_identity_drift',
    });

    expect(insertQueries()).toHaveLength(0);
  });

  it('replays a matching V2 idempotency key before reading publication state', async () => {
    const input = buildV2Input();
    const parsed = parseV2(input);
    const storedRow = scenarioSetRow({
      idempotency_key: 'v2-replay',
      idempotency_request_hash: requestHash(1, parsed),
    });

    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [storedRow] })
      .mockResolvedValueOnce({ rows: [scenarioSetRow({ idempotency_key: 'v2-replay' })] })
      .mockResolvedValueOnce({
        rows: [
          allocationVariantRow(0, parsed.variants[0].override.payload),
          allocationVariantRow(1, parsed.variants[1].override.payload),
          allocationVariantRow(2, parsed.variants[2].override.payload),
        ],
      });

    const result = await createFundScenarioSet(
      1,
      input,
      { userId: 17 },
      { idempotencyKey: 'v2-replay' }
    );

    expect(result.id).toBe(scenarioSetId);
    // Replay returned before any fundconfigs read: publication may have
    // advanced since the original write and must not fail the replay.
    const configReads = queryMock.mock.calls.filter(([sql]) =>
      String(sql).includes('FROM fundconfigs')
    );
    expect(configReads).toHaveLength(0);
    expect(insertQueries()).toHaveLength(0);
  });

  it('returns 422 idempotency_key_reused when a V1-consumed key is replayed with a V2 payload', async () => {
    const v1Input = {
      name: 'Fee sensitivity',
      variants: [
        {
          name: 'Lower fee',
          override: {
            overrideType: 'fee_profile',
            payload: {
              feeProfiles: [
                {
                  id: 'fp-1',
                  name: 'Lower fees',
                  feeTiers: [
                    {
                      id: 'tier-1',
                      name: 'Management fee',
                      percentage: 1.5,
                      feeBasis: 'committed_capital',
                      startMonth: 0,
                    },
                  ],
                },
              ],
            },
          },
        },
      ],
    };
    const storedRow = scenarioSetRow({
      idempotency_key: 'shared-key',
      idempotency_request_hash: requestHash(1, v1Input),
    });

    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [storedRow] });

    await expect(
      createFundScenarioSet(1, buildV2Input(), { userId: 17 }, { idempotencyKey: 'shared-key' })
    ).rejects.toMatchObject({ statusCode: 422, code: 'idempotency_key_reused' });
    expect(insertQueries()).toHaveLength(0);
  });

  it('returns 422 idempotency_key_reused when a V2-consumed key is replayed with a V1 payload', async () => {
    const parsed = parseV2(buildV2Input());
    const storedRow = scenarioSetRow({
      idempotency_key: 'shared-key-2',
      idempotency_request_hash: requestHash(1, parsed),
    });

    const v1Attempt = {
      name: 'Allocation scenarios',
      variants: [
        {
          name: 'Base',
          override: {
            overrideType: 'allocation',
            payload: {
              allocations: clone(pinnedConfig.allocations),
              capitalPlanAllocations: clone(pinnedConfig.capitalPlanAllocations),
            },
          },
        },
      ],
    };

    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [storedRow] });

    await expect(
      createFundScenarioSet(1, v1Attempt, { userId: 17 }, { idempotencyKey: 'shared-key-2' })
    ).rejects.toMatchObject({ statusCode: 422, code: 'idempotency_key_reused' });
    expect(insertQueries()).toHaveLength(0);
  });

  it('rejects a two-variant V2 body with 422 before any write', async () => {
    const input = buildV2Input();
    const twoVariants = { ...input, variants: input.variants.slice(0, 2) };

    await expect(
      createFundScenarioSet(1, twoVariants, { userId: 17 }, { idempotencyKey: 'v2-count' })
    ).rejects.toMatchObject({ statusCode: 422, code: 'invalid_scenario_set_v2_payload' });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('rejects a non-allocation V2 submission with 422 before any write', async () => {
    const input = buildV2Input();
    const mutated = {
      ...input,
      variants: input.variants.map((variant) => ({
        ...variant,
        override: {
          overrideType: 'sector_profile',
          payload: { sectorProfiles: [{ id: 'sp-1', name: 'Sector', targetPercentage: 50 }] },
        },
      })),
    };

    await expect(
      createFundScenarioSet(1, mutated, { userId: 17 }, { idempotencyKey: 'v2-nonalloc' })
    ).rejects.toMatchObject({ statusCode: 422, code: 'invalid_scenario_set_v2_payload' });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('keeps V1 create semantics against a config-bearing published row', async () => {
    const v1Input = {
      name: 'Fee sensitivity',
      variants: [
        {
          name: 'Lower fee',
          override: {
            overrideType: 'fee_profile',
            payload: {
              feeProfiles: [
                {
                  id: 'fp-1',
                  name: 'Lower fees',
                  feeTiers: [
                    {
                      id: 'tier-1',
                      name: 'Management fee',
                      percentage: 1.5,
                      feeBasis: 'committed_capital' as const,
                      startMonth: 0,
                    },
                  ],
                },
              ],
            },
          },
        },
      ],
    };

    const feeVariantRow = {
      ...allocationVariantRow(0, v1Input.variants[0]!.override.payload),
      override_type: 'fee_profile',
      name: 'Lower fee',
    };

    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 12, version: 4, config: pinnedConfig }] })
      .mockResolvedValueOnce({ rows: [{ active_count: '0' }] })
      .mockResolvedValueOnce({
        rows: [scenarioSetRow({ name: 'Fee sensitivity', variant_count: '1' })],
      })
      .mockResolvedValueOnce({ rows: [feeVariantRow] })
      .mockResolvedValueOnce({ rows: [{ id: '00000000-0000-0000-0000-000000000214' }] })
      .mockResolvedValueOnce({
        rows: [scenarioSetRow({ name: 'Fee sensitivity', variant_count: '1' })],
      })
      .mockResolvedValueOnce({ rows: [feeVariantRow] });

    const result = await createFundScenarioSet(1, v1Input, { userId: 17 });
    expect(result).toMatchObject({ id: scenarioSetId, variantCount: 1 });
  });
});

describe('assertSourcePinnedScenarioVariants (row-identity helper)', () => {
  const pinned = parseV2(buildV2Input());
  // Parse through the production draft schema so the pinned side carries the
  // exact Zod-parsed types the service compares against.
  const pinnedDraft = FundDraftWriteV1Schema.parse(pinnedConfig);
  const pinnedArrays = {
    allocations: pinnedDraft.allocations,
    capitalPlanAllocations: pinnedDraft.capitalPlanAllocations,
  };

  it('accepts the exact Base clone plus numerics-edited Upside/Downside', () => {
    expect(() => assertSourcePinnedScenarioVariants(pinned, pinnedArrays)).not.toThrow();
  });

  it('keeps cross-array same-id rows distinct ({arrayKind, id} identity)', () => {
    // pinnedConfig shares id 'alloc-a' across allocations and
    // capitalPlanAllocations; identity holds per array kind.
    expect(pinnedConfig.allocations.some((row) => row.id === 'alloc-a')).toBe(true);
    expect(pinnedConfig.capitalPlanAllocations.some((row) => row.id === 'alloc-a')).toBe(true);
    expect(() => assertSourcePinnedScenarioVariants(pinned, pinnedArrays)).not.toThrow();
  });

  it('rejects a variant that adds a row to a pinned array', () => {
    const input = parseV2(buildV2Input());
    input.variants[1].override.payload.allocations!.push({
      id: 'alloc-c',
      category: 'Growth',
      percentage: 10,
    });
    expect(() => assertSourcePinnedScenarioVariants(input, pinnedArrays)).toThrow(
      expect.objectContaining({ statusCode: 422, code: 'scenario_variant_row_identity_drift' })
    );
  });

  it('rejects a reordered id sequence on an Upside array', () => {
    const input = parseV2(buildV2Input());
    const rows = input.variants[1].override.payload.allocations!;
    input.variants[1].override.payload.allocations = [rows[1]!, rows[0]!];
    expect(() => assertSourcePinnedScenarioVariants(input, pinnedArrays)).toThrow(
      expect.objectContaining({ statusCode: 422, code: 'scenario_variant_row_identity_drift' })
    );
  });

  it('rejects a variant missing an array kind the pinned config has', () => {
    const input = parseV2(buildV2Input());
    delete input.variants[2].override.payload.capitalPlanAllocations;
    expect(() => assertSourcePinnedScenarioVariants(input, pinnedArrays)).toThrow(
      expect.objectContaining({ statusCode: 422, code: 'scenario_variant_row_identity_drift' })
    );
  });

  it('rejects a variant carrying an array kind the pinned config lacks', () => {
    const sparsePinned = {
      allocations: pinnedArrays.allocations,
      capitalPlanAllocations: undefined,
    };
    const input = parseV2(buildV2Input());
    expect(() => assertSourcePinnedScenarioVariants(input, sparsePinned)).toThrow(
      expect.objectContaining({ statusCode: 422, code: 'scenario_variant_row_identity_drift' })
    );
  });

  it.each([
    ['sectorProfileId', 'sp-9'],
    ['entryRound', 'Series B'],
    ['initialCheckStrategy', 'ownership'],
    ['followOnStrategy', 'maintain_ownership'],
  ] as const)('rejects frozen-field drift on Upside/Downside: %s', (field, value) => {
    const input = parseV2(buildV2Input());
    const row = input.variants[1].override.payload.capitalPlanAllocations![0] as Record<
      string,
      unknown
    >;
    row[field] = value;
    expect(() => assertSourcePinnedScenarioVariants(input, pinnedArrays)).toThrow(
      expect.objectContaining({ statusCode: 422, code: 'scenario_variant_row_identity_drift' })
    );
  });

  it('rejects Base deep-equality drift even on decorative fields', () => {
    const input = parseV2(buildV2Input());
    input.variants[0].override.payload.allocations![0]!.description = 'edited';
    expect(() => assertSourcePinnedScenarioVariants(input, pinnedArrays)).toThrow(
      expect.objectContaining({ statusCode: 422, code: 'scenario_variant_row_identity_drift' })
    );
  });

  it('allows decorative and numeric edits on Upside/Downside', () => {
    const input = parseV2(buildV2Input());
    input.variants[1].override.payload.allocations![0]!.category = 'Renamed sleeve';
    input.variants[2].override.payload.capitalPlanAllocations![0]!.name = 'Renamed plan row';
    expect(() => assertSourcePinnedScenarioVariants(input, pinnedArrays)).not.toThrow();
  });

  it('rejects wrong variant count', () => {
    const input = parseV2(buildV2Input());
    const shrunk = { ...input, variants: input.variants.slice(0, 2) };
    expect(() => assertSourcePinnedScenarioVariants(shrunk as typeof input, pinnedArrays)).toThrow(
      expect.objectContaining({ statusCode: 422, code: 'scenario_variant_row_identity_drift' })
    );
  });

  it('rejects a non-allocation override inside a V2-shaped request', () => {
    const input = parseV2(buildV2Input());
    const mutated = {
      ...input,
      variants: input.variants.map((variant) => ({
        ...variant,
        override: {
          overrideType: 'fee_profile',
          payload: { feeProfiles: [] },
        },
      })),
    };
    expect(() =>
      assertSourcePinnedScenarioVariants(mutated as unknown as typeof input, pinnedArrays)
    ).toThrow(
      expect.objectContaining({ statusCode: 422, code: 'scenario_variant_row_identity_drift' })
    );
  });
});
