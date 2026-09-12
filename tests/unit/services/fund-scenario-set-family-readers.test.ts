import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import historical from '../../fixtures/capital-planning/completed-interpretation-1.0.0.json';
import {
  makeCapitalDeclarations,
  makeCapitalInput,
  makeCapitalRawConfig,
} from '../../fixtures/capital-planning/fixtures';

const { queryMock, transactionMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  transactionMock: vi.fn(),
}));
vi.mock('../../../server/db/pg-circuit.js', () => ({ transaction: transactionMock }));

import * as source from '../../../server/services/fund-scenario-set-service';
import * as materializer from '../../../shared/lib/capital-planning/materialize-from-fund-draft';
import * as calculator from '../../../shared/lib/capital-planning/capital-planning-v1';
import * as reserve from '../../../server/services/fund-scenario-reserve-calculation-service';
import {
  getAllScenarioResultsForFund,
  getScenarioResults,
} from '../../../server/services/fund-scenario-calculation-service';
import { getFundScenarioCalculationStatus } from '../../../server/services/fund-scenario-calculation-status-service';
import {
  FundScenarioCalculationPayloadV1Schema,
  FundScenarioCapitalCalculationPayloadV1Schema,
  FundScenarioCapitalDetailResponseV1Schema,
  FundScenarioCapitalResultsResponseV1Schema,
  FundScenarioCapitalSourceResponseV1Schema,
  FundScenarioSetDetailV1Schema,
} from '../../../shared/contracts/fund-scenario-sets-v1.contract';
import { canonicalJson } from '../../../shared/lib/canonical-json';

const FUND = 101;
const CAPITAL_ID = historical.scenarioSet.id;
const LEGACY_ID = '55555555-5555-4555-8555-555555555555';
const LEGACY_VARIANT = '66666666-6666-4666-8666-666666666666';
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

type Fixture = {
  rawSource: materializer.CapitalRawSource;
  scenarioSet: source.FundScenarioSetRow;
  variants: source.FundScenarioVariantRow[];
  snapshot: {
    id: number;
    fund_id: number;
    scenario_set_id: string;
    config_id: number;
    config_version: number;
    calc_version: string;
    state_hash: string;
    payload: unknown;
    correlation_id: string;
    created_at: string;
    snapshot_time: string;
  };
  payloadSerialized: string;
  payloadSha256: string;
};
const historicFixture = () => structuredClone(historical) as unknown as Fixture;
function currentFixture(): Fixture {
  const f = historicFixture();
  const raw = makeCapitalRawConfig();
  raw.investmentPeriod = 2;
  f.rawSource.config.raw = raw;
  const input = makeCapitalInput();
  const other = structuredClone(input);
  other.allocations[0]!.initialCheckUsd = '2.000000';
  other.allocations[0]!.deploymentPeriodYears = 2;
  other.allocations[0]!.plannedCompanyCount = 30;
  other.netInvestableCapitalUsd = '80.000000';
  const inputs = [input, other];
  const m = materializer.materializeCapitalSource({
    source: f.rawSource,
    inputs,
    unitDeclarations: makeCapitalDeclarations(),
  });
  if (!m.ok) throw new Error(JSON.stringify(m));
  const oldPayload = FundScenarioCapitalCalculationPayloadV1Schema.parse(f.snapshot.payload);
  f.variants = f.variants.map((variant, i) => ({
    ...variant,
    override_payload: {
      input: inputs[i]!,
      sourceBundle: m.sourceBundle,
      sourceBundleHash: m.sourceBundle.sourceBundleHash,
    },
  }));
  f.snapshot.payload = {
    ...oldPayload,
    interpretationVersion: m.sourceBundle.interpretationVersion,
    sourceBundleHash: m.sourceBundle.sourceBundleHash,
    variants: f.variants.map((variant, i) => ({
      variantId: variant.id,
      scenarioSetId: CAPITAL_ID,
      name: variant.name,
      overrideType: 'capital_plan',
      result: calculator.calculateCapitalPlanningV1({
        input: inputs[i]!,
        sourceBundle: m.sourceBundle,
      }),
    })),
  };
  f.payloadSerialized = JSON.stringify(f.snapshot.payload);
  f.payloadSha256 = sha256(f.payloadSerialized);
  return f;
}

function legacySet(archived = false): source.FundScenarioSetRow {
  return {
    ...historicFixture().scenarioSet,
    id: LEGACY_ID,
    name: 'Legacy fee set',
    variant_count: 1,
    archived_at: archived ? '2026-08-02T00:00:00.000Z' : null,
  };
}
function legacyVariant(): source.FundScenarioVariantRow {
  return {
    ...historicFixture().variants[0]!,
    id: LEGACY_VARIANT,
    scenario_set_id: LEGACY_ID,
    name: 'Legacy fee',
    override_type: 'fee_profile',
    override_payload: {
      feeProfiles: [
        {
          id: 'fee',
          name: 'Fee',
          feeTiers: [
            {
              id: 'tier',
              name: 'Management fee',
              percentage: 2,
              feeBasis: 'committed_capital',
              startMonth: 0,
            },
          ],
        },
      ],
    },
  };
}

const legacyEconomicsResult = {
  version: 'v1',
  annual: [
    {
      year: 1,
      lpCapitalCalls: 1,
      gpCommitmentCalls: 0,
      grossExitProceeds: 0,
      beginningCash: 0,
      investments: 0,
      feesPaidToManager: 1,
      expensesPaid: 0,
      recycledProceeds: 0,
      endingCash: 0,
      lpDistributions: 0,
      gpInvestmentDistributions: 0,
      gpCarryDistributed: 0,
      gpCarryEscrowed: 0,
      gpCarryReleasedFromEscrow: 0,
      clawbackPaid: 0,
      grossNav: 0,
      lpNetNav: 0,
      dpi: 0,
      rvpi: 0,
      tvpi: 0,
      conservationDelta: 0,
    },
  ],
  summary: {
    grossIrr: null,
    lpNetIrr: null,
    gpNetIrr: null,
    totalLpPaidIn: 1,
    totalGpCommitmentCalled: 0,
    totalManagementFees: 1,
    totalExpenses: 0,
    totalRecycled: 0,
    totalLpDistributions: 0,
    totalGpInvestmentDistributions: 0,
    totalGpCarryDistributed: 0,
    totalGpFeeIncome: 1,
    finalDpi: 0,
    finalRvpi: 0,
    finalTvpi: 0,
    finalClawbackDue: 0,
    maxEscrowAvailable: 0,
    netGpCarryAfterClawback: 0,
  },
  checks: {
    passed: true,
    tolerance: 0.01,
    errors: [],
  },
} as const;

function calculatedLegacyPayload() {
  return FundScenarioCalculationPayloadV1Schema.parse({
    version: 'fund-scenarios-v1',
    calculationMode: 'sync_fee_profile',
    fundId: FUND,
    scenarioSetId: LEGACY_ID,
    sourceConfigId: 11,
    sourceConfigVersion: 1,
    staleness: {
      state: 'CURRENT',
      sourceConfigVersion: 1,
      currentPublishedConfigVersion: 1,
    },
    calculatedAt: '2026-07-01T12:05:00.000Z',
    variants: [
      {
        variantId: LEGACY_VARIANT,
        scenarioSetId: LEGACY_ID,
        name: 'Legacy fee',
        overrideType: 'fee_profile',
        economics: legacyEconomicsResult,
      },
    ],
  });
}

let fixture: Fixture;
let sets: source.FundScenarioSetRow[];
let variants: source.FundScenarioVariantRow[];
let live: materializer.CapitalRawSource | null;
let snapshotPresent: boolean;
let legacyPayload: unknown;
function resetFixture(f: Fixture) {
  fixture = f;
  sets = [f.scenarioSet];
  variants = f.variants;
  live = structuredClone(f.rawSource);
  snapshotPresent = true;
  legacyPayload = null;
}
function idsIn(params: unknown[]) {
  return params
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter((value): value is string => typeof value === 'string');
}
function query(sqlValue: unknown, params: unknown[] = []) {
  const sql = String(sqlValue);
  if (/\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/i.test(sql))
    throw new Error(`Reader attempted mutation: ${sql}`);
  if (/fund_scenario_calculation_runs|fund_scenario_set_events/.test(sql))
    throw new Error('Reader attempted reserve run/event work');
  if (/type\s*=\s*'ECONOMICS'/.test(sql))
    throw new Error('Reader attempted authoritative economics query');
  if (sql.includes('FROM funds f'))
    return {
      rows: live
        ? [
            {
              fund_id: FUND,
              size: live.fund.size,
              base_currency: live.fund.baseCurrency,
              id: live.config.id,
              version: live.config.version,
              config: live.config.raw,
              published_at: live.config.publishedAt,
            },
          ]
        : [],
    };
  if (/FROM funds\b/.test(sql)) return { rows: [{ id: FUND }] };
  if (sql.includes('FROM fund_scenario_sets')) {
    const direct = typeof params[1] === 'string' ? params[1] : null;
    const active = sql.includes('s.archived_at IS NULL');
    const selected = sets.filter(
      (set) => (!direct || set.id === direct) && (!active || !set.archived_at)
    );
    if (sql.includes('snapshot_payload')) {
      const eligible = new Set(idsIn(params));
      return {
        rows: selected
          .filter((set) => eligible.has(set.id))
          .map((set) => ({
            scenario_set_id: set.id,
            scenario_set_name: set.name,
            source_config_id: set.source_config_id,
            source_config_version: set.source_config_version,
            variant_count: variants.filter((v) => v.scenario_set_id === set.id).length,
            snapshot_payload: set.id === CAPITAL_ID ? fixture.snapshot.payload : legacyPayload,
          })),
      };
    }
    return { rows: selected };
  }
  if (sql.includes('FROM fund_scenario_variants')) {
    const requested = new Set(idsIn(params));
    return { rows: variants.filter((v) => requested.has(v.scenario_set_id)) };
  }
  if (sql.includes('FROM fundconfigs'))
    return {
      rows: live
        ? [
            {
              id: live.config.id,
              version: live.config.version,
              config: live.config.raw,
              published_at: live.config.publishedAt,
            },
          ]
        : [],
    };
  if (sql.includes('FROM fund_snapshots'))
    return { rows: snapshotPresent ? [{ ...fixture.snapshot }] : [] };
  throw new Error(`Unexpected reader query: ${sql}`);
}
const client = { query: queryMock } as unknown as PoolClient;
function assertReadOnly() {
  expect(
    queryMock.mock.calls.every(([sql]) => !/\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/i.test(String(sql)))
  ).toBe(true);
}

beforeEach(() => {
  vi.restoreAllMocks();
  queryMock.mockReset();
  transactionMock.mockReset();
  resetFixture(historicFixture());
  queryMock.mockImplementation(query);
  transactionMock.mockImplementation(async (run: (client: PoolClient) => unknown) => run(client));
});
afterEach(() => {
  assertReadOnly();
  vi.restoreAllMocks();
});

describe('B7 real raw-family reader adapters', () => {
  it('pins completed historical bytes from the immutable 1.0.0 producer without adding benchmark fields', () => {
    const parsed = FundScenarioCapitalCalculationPayloadV1Schema.parse(fixture.snapshot.payload);
    expect(JSON.stringify(parsed)).toBe(fixture.payloadSerialized);
    expect(sha256(fixture.payloadSerialized)).toBe(
      '4ca5df1d10f8c08734aa5027b0398557f7483383924b21733084256b0d93f73a'
    );
    expect(parsed.interpretationVersion).toBe('capital-source-interpretation/1.0.0');
    for (const variant of fixture.variants)
      expect(variant.override_payload).not.toHaveProperty('benchmarkSnapshots');
  });

  it('keeps raw source identity and undeclared amounts unchanged through source GET', async () => {
    const before = canonicalJson(live);
    const expected = materializer.fingerprintCapitalSource(fixture.rawSource);
    const response = await source.getFundScenarioCapitalSourceConfig(FUND);
    expect(FundScenarioCapitalSourceResponseV1Schema.safeParse(response).success).toBe(true);
    expect(response.sourceBundleHash).toBe(expected.sourceBundleHash);
    expect(response.projection).toEqual(expected.projection);
    expect(response.materialized).toBeNull();
    expect(response.calculationReadiness).toMatchObject({
      context: 'current_preview',
      state: 'INPUT_REQUIRED',
    });
    expect(response.calculationReadiness.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'inputs', code: 'INVALID_INPUT' })])
    );
    expect(canonicalJson(live)).toBe(before);
  });

  it('uses only exact source-global declaration paths with selected explicit GP/fee/expense branches', () => {
    const rawSource = {
      ...fixture.rawSource,
      config: { ...fixture.rawSource.config, raw: makeCapitalRawConfig() },
    };
    const inspected = materializer.inspectCapitalSourcePreview(rawSource);
    expect(inspected.remainingDeclarations.map((d) => d.path).sort()).toEqual(
      [
        'economicsAssumptions.expenseModel.annualExpenses[0].amount',
        'economicsAssumptions.gpCommitmentModel.commitmentAmount',
        'fundSize',
        'funds.size',
      ].sort()
    );
    expect(inspected.materialized).toBeNull();
  });

  it.each(['nested-percent', 'top-level', 'zero-fallback'] as const)(
    'does not require a shadowed GP amount declaration for %s',
    (branch) => {
      const raw = makeCapitalRawConfig();
      const gp = raw.economicsAssumptions!.gpCommitmentModel!;
      delete gp.commitmentAmount;
      if (branch === 'nested-percent') {
        gp.commitmentPct = 0.1;
        raw.gpCommitment = 9;
      } else if (branch === 'top-level') raw.gpCommitment = 9;
      const inspected = materializer.inspectCapitalSourcePreview({
        ...fixture.rawSource,
        config: { ...fixture.rawSource.config, raw },
      });
      const paths = inspected.remainingDeclarations.map((d) => d.path);
      expect(paths).not.toContain('economicsAssumptions.gpCommitmentModel.commitmentAmount');
      expect(paths).not.toContain('economicsAssumptions.gpCommitmentModel.commitmentPct');
      expect(paths.includes('gpCommitment')).toBe(branch === 'top-level');
    }
  );

  it('treats explicit empty expenses as shadowing legacy monthly expenses', () => {
    const raw = makeCapitalRawConfig();
    raw.economicsAssumptions!.expenseModel!.annualExpenses = [];
    raw.fundExpenses = [
      { id: 'legacy', category: 'administration', monthlyAmount: 1, startMonth: 0 },
    ];
    const inspected = materializer.inspectCapitalSourcePreview({
      ...fixture.rawSource,
      config: { ...fixture.rawSource.config, raw },
    });
    expect(
      inspected.remainingDeclarations.map((d) => d.path).filter((p) => p.includes('Expenses'))
    ).toEqual([]);
  });

  it('requires only consumed legacy fee rates, monthly amounts and present month origins', () => {
    const raw = makeCapitalRawConfig();
    delete raw.economicsAssumptions!.feeModel;
    delete raw.economicsAssumptions!.expenseModel;
    raw.feeProfiles = [
      {
        id: 'legacy',
        name: 'Full fund',
        feeTiers: [
          {
            id: 'tier',
            name: 'Tier',
            percentage: 2,
            feeBasis: 'committed_capital',
            startMonth: 0,
            endMonth: 24,
          },
        ],
      },
    ];
    raw.fundExpenses = [
      { id: 'expense', category: 'administration', monthlyAmount: 1, startMonth: 0 },
    ];
    const inspected = materializer.inspectCapitalSourcePreview({
      ...fixture.rawSource,
      config: { ...fixture.rawSource.config, raw },
    });
    expect(inspected.remainingDeclarations.map((d) => d.path).sort()).toEqual(
      [
        'funds.size',
        'fundSize',
        'economicsAssumptions.gpCommitmentModel.commitmentAmount',
        'feeProfiles[0].feeTiers[0].percentage',
        'feeProfiles[0].feeTiers[0].startMonth',
        'feeProfiles[0].feeTiers[0].endMonth',
        'fundExpenses[0].monthlyAmount',
        'fundExpenses[0].startMonth',
      ].sort()
    );
  });

  it.each(['empty', 'unknown', 'mixed'] as const)(
    'rejects %s variant-family integrity before any stored payload parsing',
    async (kind) => {
      variants =
        kind === 'empty'
          ? []
          : kind === 'unknown'
            ? [{ ...fixture.variants[0]!, override_type: 'unknown', override_payload: {} }]
            : [...fixture.variants, { ...legacyVariant(), scenario_set_id: CAPITAL_ID }];
      await expect(source.getFundScenarioSet(FUND, CAPITAL_ID)).rejects.toMatchObject({
        statusCode: 500,
        code: 'scenario_set_family_invalid',
      });
    }
  );

  it('refuses capital through the strict legacy facade before parsing malformed capital payloads', async () => {
    variants[0]!.override_payload = {};
    await expect(source.getFundScenarioSet(FUND, CAPITAL_ID)).rejects.toMatchObject({
      statusCode: 406,
      code: 'scenario_representation_required',
    });
    expect(queryMock.mock.calls.some(([sql]) => String(sql).includes('fund_snapshots'))).toBe(
      false
    );
  });

  it('refuses the capital selector on legacy detail before parsing malformed legacy payloads', async () => {
    sets = [legacySet()];
    variants = [{ ...legacyVariant(), override_payload: {} }];
    await expect(source.getFundScenarioCapitalSet(FUND, LEGACY_ID)).rejects.toMatchObject({
      statusCode: 406,
      code: 'scenario_representation_not_applicable',
    });
  });

  it('filters mixed collections by family with one batched variant query and strict independent schemas', async () => {
    sets.push(legacySet());
    variants.push(legacyVariant());
    const legacy = await source.listFundScenarioSets(FUND);
    expect(legacy.map((set) => set.id)).toEqual([LEGACY_ID]);
    expect(
      queryMock.mock.calls.filter(([sql]) => String(sql).includes('FROM fund_scenario_variants'))
    ).toHaveLength(1);
    const detail = await source.getFundScenarioSet(FUND, LEGACY_ID);
    expect(FundScenarioSetDetailV1Schema.safeParse(detail).success).toBe(true);
    const capital = await source.listFundScenarioCapitalSets(FUND);
    expect(capital.scenarioSets.map((set) => set.id)).toEqual([CAPITAL_ID]);
    const capitalDetail = await source.getFundScenarioCapitalSet(FUND, CAPITAL_ID);
    expect(FundScenarioCapitalDetailResponseV1Schema.safeParse(capitalDetail).success).toBe(true);
  });

  it('excludes archived capital by default and includes it only on request', async () => {
    fixture.scenarioSet.archived_at = '2026-08-02T00:00:00.000Z';
    expect((await source.listFundScenarioCapitalSets(FUND)).scenarioSets).toEqual([]);
    expect(
      (await source.listFundScenarioCapitalSets(FUND, { includeArchived: true })).scenarioSets
    ).toHaveLength(1);
  });

  it.each(['historical', 'current'] as const)(
    'returns %s completed payload bytes without current materialization or calculation',
    async (version) => {
      if (version === 'current') resetFixture(currentFixture());
      const materialize = vi.spyOn(materializer, 'materializeCapitalSource');
      const calculate = vi.spyOn(calculator, 'calculateCapitalPlanningV1');
      const verify = vi.spyOn(materializer, 'verifyPinnedCapitalSourceBundle');
      const response = await getScenarioResults(FUND, CAPITAL_ID, 'capital-plan-v1');
      expect(FundScenarioCapitalResultsResponseV1Schema.safeParse(response).success).toBe(true);
      expect(JSON.stringify(response.savedResult!.payload)).toBe(fixture.payloadSerialized);
      expect(response.savedResult!.snapshotId).toBe(42);
      expect(response.readState.sourceFreshness).toBe('CURRENT');
      expect(response.readState.interpretationCompatibility.state).toBe(
        version === 'current' ? 'CURRENT' : 'UNSUPPORTED_SAVED_VERSION'
      );
      expect(materialize).not.toHaveBeenCalled();
      expect(calculate).not.toHaveBeenCalled();
      expect(verify).not.toHaveBeenCalled();
    }
  );

  it.each(['publish', 'raw', 'missing', 'uncanonicalizable'] as const)(
    'preserves historical payload bytes when current source is %s',
    async (state) => {
      if (state === 'publish') live!.config.version = 2;
      if (state === 'raw') live!.fund.baseCurrency = 'EUR';
      if (state === 'missing') live = null;
      if (state === 'uncanonicalizable') live!.config.raw = { invalid: Number.NaN };
      const response = await getScenarioResults(FUND, CAPITAL_ID, 'capital-plan-v1');
      expect(JSON.stringify(response.savedResult!.payload)).toBe(fixture.payloadSerialized);
      expect(response.readState.sourceFreshness).toBe(
        state === 'publish'
          ? 'STALE_PUBLISH'
          : state === 'raw'
            ? 'STALE_SOURCE'
            : 'STALE_SOURCE_UNAVAILABLE'
      );
      expect(response.readState.interpretationCompatibility.state).toBe(
        'UNSUPPORTED_SAVED_VERSION'
      );
    }
  );

  it.each([
    ['fund_id', 102],
    ['scenario_set_id', LEGACY_ID],
    ['config_id', 12],
    ['config_version', 2],
    ['calc_version', 'capital-planning/9.9.9'],
    ['state_hash', 'f'.repeat(64)],
    ['id', 0],
    ['correlation_id', 'not-a-uuid'],
  ] as const)('refuses saved snapshot row metadata mismatch for %s', async (field, value) => {
    Object.assign(fixture.snapshot, { [field]: value });
    await expect(getScenarioResults(FUND, CAPITAL_ID, 'capital-plan-v1')).rejects.toMatchObject({
      statusCode: 500,
      code: 'scenario_saved_data_invalid',
    });
  });

  it.each([
    ['fundId', 102],
    ['scenarioSetId', LEGACY_ID],
    ['sourceConfigId', 12],
    ['sourceConfigVersion', 2],
    ['sourceBundleHash', 'f'.repeat(64)],
    ['baselineVariantId', LEGACY_VARIANT],
  ] as const)('refuses saved payload metadata mismatch for %s', async (field, value) => {
    Object.assign(fixture.snapshot.payload as object, { [field]: value });
    await expect(getScenarioResults(FUND, CAPITAL_ID, 'capital-plan-v1')).rejects.toMatchObject({
      statusCode: 500,
      code: 'scenario_saved_data_invalid',
    });
  });

  it.each(['set', 'variant', 'snapshot'] as const)(
    'enforces strict saved %s name bounds through the real reader',
    async (target) => {
      for (const invalid of ['', '   ', 'x'.repeat(121)]) {
        resetFixture(historicFixture());
        if (target === 'set') fixture.scenarioSet.name = invalid;
        else if (target === 'variant') fixture.variants[0]!.name = invalid;
        else {
          const payload = FundScenarioCapitalCalculationPayloadV1Schema.parse(
            fixture.snapshot.payload
          );
          payload.variants[0]!.name = invalid;
          fixture.snapshot.payload = payload;
        }
        await expect(getScenarioResults(FUND, CAPITAL_ID, 'capital-plan-v1')).rejects.toMatchObject(
          {
            statusCode: 500,
            code: 'scenario_saved_data_invalid',
          }
        );
      }
    }
  );

  it.each(['x', 'x'.repeat(120), '  Saved name  '])(
    'retains valid names without trimming or rebuilding saved payload bytes: %s',
    async (name) => {
      fixture.scenarioSet.name = name;
      fixture.variants[0]!.name = name;
      const payload = FundScenarioCapitalCalculationPayloadV1Schema.parse(fixture.snapshot.payload);
      payload.variants[0]!.name = name;
      fixture.snapshot.payload = payload;
      const savedBytes = JSON.stringify(payload);
      const detail = await source.getFundScenarioCapitalSet(FUND, CAPITAL_ID);
      const response = await getScenarioResults(FUND, CAPITAL_ID, 'capital-plan-v1');
      expect(detail.name).toBe(name);
      expect(detail.variants[0]!.name).toBe(name);
      expect(response.savedResult!.payload.variants[0]!.name).toBe(name);
      expect(JSON.stringify(response.savedResult!.payload)).toBe(savedBytes);
    }
  );

  it('returns a typed uncalculated capital result without entering reserve work', async () => {
    snapshotPresent = false;
    const response = await getScenarioResults(FUND, CAPITAL_ID, 'capital-plan-v1');
    expect(response.savedResult).toBeNull();
    expect(response.unavailableReason).toBe('NO_CALCULATED_RESULT');
  });

  it('rejects a corrupt saved projection hash without replacing it from the live source', async () => {
    const payload = variants[0]!.override_payload as {
      sourceBundle: { projection: { fund: { size: string } } };
    };
    payload.sourceBundle.projection.fund.size = '101.00';
    await expect(source.getFundScenarioCapitalSet(FUND, CAPITAL_ID)).rejects.toMatchObject({
      statusCode: 500,
      code: 'scenario_saved_data_invalid',
    });
  });

  it.each([undefined, 'capital-plan-v1'] as const)(
    'refuses capital status before reserve identity and run work with selector %s',
    async (representation) => {
      const identity = vi
        .spyOn(reserve, 'getReserveScenarioCalculationIdentity')
        .mockRejectedValue(new Error('Reserve identity must not run'));
      await expect(
        getFundScenarioCalculationStatus(FUND, CAPITAL_ID, representation)
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(identity).not.toHaveBeenCalled();
      expect(
        queryMock.mock.calls.some(([sql]) =>
          /fund_scenario_calculation_runs|fund_scenario_set_events/.test(String(sql))
        )
      ).toBe(false);
    }
  );

  it('returns no legacy sets for a capital-only aggregate before requesting snapshots or current source', async () => {
    expect(await getAllScenarioResultsForFund(FUND)).toEqual({ kind: 'none_exist' });
    expect(
      queryMock.mock.calls.some(([sql]) => /fund_snapshots|fundconfigs/.test(String(sql)))
    ).toBe(false);
  });

  it('counts only uncalculated legacy sets when capital already has a saved snapshot', async () => {
    sets.push(legacySet());
    variants.push(legacyVariant());
    expect(await getAllScenarioResultsForFund(FUND)).toEqual({
      kind: 'none_calculated',
      scenarioSetCount: 1,
    });
    const selection = queryMock.mock.calls.find(([sql]) =>
      String(sql).includes('snapshot_payload')
    );
    expect(selection?.[1]).toEqual([FUND, [LEGACY_ID]]);
  });

  it.each([false, true])(
    'returns calculated legacy results beside capital with archived=%s without parsing capital snapshots',
    async (capitalArchived) => {
      fixture.scenarioSet.archived_at = capitalArchived ? '2026-08-02T00:00:00.000Z' : null;
      sets.push(legacySet());
      variants.push(legacyVariant());
      legacyPayload = calculatedLegacyPayload();
      fixture.snapshot.payload = { corruptCapitalSnapshot: true };
      const response = await getAllScenarioResultsForFund(FUND);
      expect(response.kind).toBe('calculated');
      if (response.kind !== 'calculated') throw new Error('Expected calculated legacy aggregate');
      expect(response.sets).toHaveLength(1);
      expect(response.sets[0]).toMatchObject({
        scenarioSetId: LEGACY_ID,
        name: 'Legacy fee set',
        calculationMode: 'sync_fee_profile',
        variantCount: 1,
        variants: [{ variantId: LEGACY_VARIANT, name: 'Legacy fee', overrideType: 'fee_profile' }],
      });
      const selection = queryMock.mock.calls.find(([sql]) =>
        String(sql).includes('snapshot_payload')
      );
      expect(selection?.[1]).toEqual([FUND, [LEGACY_ID]]);
    }
  );

  it('ignores archived legacy sets alongside active capital without counting or snapshot queries', async () => {
    sets.push(legacySet(true));
    variants.push(legacyVariant());
    expect(await getAllScenarioResultsForFund(FUND)).toEqual({ kind: 'none_exist' });
    expect(queryMock.mock.calls.some(([sql]) => String(sql).includes('fund_snapshots'))).toBe(
      false
    );
  });
});
