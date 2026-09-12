import { describe, expect, it } from 'vitest';
import { capitalSchemaIssues } from '../../../shared/lib/scenarios/scenario-input-envelope';
import {
  CreateFundScenarioSetV3Schema,
  FundScenarioCapitalStoredOverrideV1Schema,
} from '../../../shared/contracts/fund-scenario-sets-v1.contract';
import {
  CapitalIssuesV1Schema,
  CapitalPlanningInputV1Schema,
} from '../../../shared/contracts/capital-planning-v1.contract';
import {
  makeCapitalInput,
  makeCapitalDeclarations,
} from '../../fixtures/capital-planning/fixtures';
import maximumShape from '../../fixtures/capital-planning/maximum-shape.json';
import { materializeCapitalSource } from '../../../shared/lib/capital-planning/materialize-from-fund-draft';
import historical from '../../fixtures/capital-planning/completed-interpretation-1.0.0.json';
import {
  canonicalCapitalScenarioInputString,
  canonicalScenarioInputString,
  type CapitalScenarioInputHashEnvelope,
  type ScenarioInputHashEnvelope,
} from '../../../shared/lib/scenarios/scenario-input-envelope';
import {
  createCapitalScenarioInputHash,
  createScenarioInputHash,
} from '../../../server/lib/scenarios/scenario-input-hash';
import type { FundScenarioCapitalStoredOverrideV1 } from '../../../shared/contracts/fund-scenario-sets-v1.contract';
import {
  CAPITAL_BENCHMARK_CATALOG_VERSION,
  getCapitalBenchmarkPresetV1,
} from '../../../shared/lib/capital-planning/benchmark-presets';

function withSavedBenchmark(): CapitalScenarioInputHashEnvelope {
  const input = envelope();
  const selector = { version: CAPITAL_BENCHMARK_CATALOG_VERSION, stage: 'seed' as const };
  input.variants[0]!.override.payload.benchmarkSnapshots = [
    {
      target: {
        kind: 'entry',
        allocationId: input.variants[0]!.override.payload.input.allocations[0]!.allocationId,
      },
      selector,
      ...getCapitalBenchmarkPresetV1(selector),
    },
  ];
  return input;
}

function envelope(): CapitalScenarioInputHashEnvelope {
  const fixture = structuredClone(historical);
  const payload = fixture.snapshot.payload;
  return {
    version: 'scenario-input-hash-v1',
    contractVersion: 'fund-scenarios-v1',
    fundId: payload.fundId,
    scenarioSetId: payload.scenarioSetId,
    sourceConfigId: payload.sourceConfigId,
    sourceConfigVersion: payload.sourceConfigVersion,
    calculationDomain: 'capital_plan',
    calculationMode: 'sync_capital_plan',
    overrideType: 'capital_plan',
    capitalPreimageVersion: 'capital-preimage/1.0.0',
    methodVersion: 'capital-planning/1.0.0',
    interpretationVersion: payload.interpretationVersion,
    engineVersion: payload.calculationVersion,
    baselineVariantId: payload.baselineVariantId,
    sourceBundleHash: payload.sourceBundleHash,
    variants: fixture.variants.map((variant) => ({
      variantId: variant.id,
      sortOrder: variant.sort_order,
      override: {
        overrideType: 'capital_plan',
        payload: variant.override_payload as FundScenarioCapitalStoredOverrideV1['payload'],
      },
    })),
  };
}

function legacy(): ScenarioInputHashEnvelope {
  return {
    version: 'scenario-input-hash-v1',
    contractVersion: 'fund-scenarios-v1',
    scenarioSetId: 'legacy-set',
    sourceConfigId: 3,
    sourceConfigVersion: 2,
    calculationMode: 'sync_fee_profile',
    overrideType: 'fee_profile',
    engineVersion: '1.0.0',
    variants: [{ variantId: 'v1', sortOrder: 0, override: { z: 2, a: 1 } }],
  };
}

describe('capital V3 schema refusal classification', () => {
  function request() {
    return {
      contractVersion: 'fund-scenario-set-create/3.0.0',
      name: 'Schema classification',
      variants: [
        {
          variantId: '00000000-0000-4000-8000-000000000001',
          name: 'Baseline',
          override: { overrideType: 'capital_plan', payload: makeCapitalInput() },
        },
      ],
      baselineVariantId: '00000000-0000-4000-8000-000000000001',
      expectedSourceConfigId: 11,
      expectedSourceConfigVersion: 1,
      expectedSourceBundleHash: 'a'.repeat(64),
      expectedInterpretationVersion: 'capital-source-interpretation/1.0.1',
      unitDeclarations: makeCapitalDeclarations(),
    };
  }

  function issues(input: unknown) {
    const parsed = CreateFundScenarioSetV3Schema.safeParse(input);
    expect(parsed.success).toBe(false);
    if (parsed.success) throw new Error('Expected invalid fixture');
    const result = capitalSchemaIssues(parsed.error.issues, input);
    expect(CapitalIssuesV1Schema.safeParse(result).success).toBe(true);
    return result;
  }

  it.each([
    [
      'set name',
      120,
      121,
      (input: ReturnType<typeof request>) => {
        input.name = 'n'.repeat(121);
      },
    ],
    [
      'allocation label',
      240,
      241,
      (input: ReturnType<typeof request>) => {
        input.variants[0]!.override.payload.allocations[0]!.name = 'n'.repeat(241);
      },
    ],
    [
      'allocation ID',
      120,
      121,
      (input: ReturnType<typeof request>) => {
        input.variants[0]!.override.payload.allocations[0]!.allocationId = 'a'.repeat(121);
      },
    ],
    [
      'decimal characters',
      24,
      25,
      (input: ReturnType<typeof request>) => {
        input.variants[0]!.override.payload.allocations[0]!.initialCheckUsd =
          '100000000000000000.000000';
      },
    ],
    [
      'deployment years',
      10,
      11,
      (input: ReturnType<typeof request>) => {
        input.variants[0]!.override.payload.allocations[0]!.deploymentPeriodYears = 11;
      },
    ],
    [
      'planned companies',
      10000,
      10001,
      (input: ReturnType<typeof request>) => {
        input.variants[0]!.override.payload.allocations[0]!.plannedCompanyCount = 10001;
      },
    ],
  ] as const)('retains %s bounds through request unions', (_name, limit, observed, mutate) => {
    const input = request();
    mutate(input);
    expect(issues(input)[0]).toMatchObject({
      code: 'INPUT_TOO_LARGE',
      limit,
      observed,
      support: 'invalid',
    });
  });

  it('classifies an oversized declaration key using its length instead of the unit value', () => {
    const input = request();
    const stem = 'fundExpenses[].monthlyAmount';
    const declarationPath = `fundExpenses[${'1'.repeat(257 - stem.length)}].monthlyAmount`;
    expect(declarationPath.length).toBe(257);
    input.unitDeclarations[declarationPath] = 'usd';
    expect(issues(input)[0]).toMatchObject({
      code: 'INPUT_TOO_LARGE',
      limit: 256,
      observed: 257,
    });
  });

  it('classifies the declaration-count sentinel with exact observed count', () => {
    const input = request();
    input.unitDeclarations = Object.fromEntries(
      Array.from({ length: 2049 }, (_, index) => [
        `capitalPlanAllocations[${index}].initialCheckAmount`,
        'usd' as const,
      ])
    );
    expect(issues(input)[0]).toMatchObject({
      code: 'INPUT_TOO_LARGE',
      limit: 2048,
      observed: 2049,
    });
  });

  it('classifies aggregate rows identically at route and service entry', () => {
    const input = request();
    input.variants = maximumShape.map((entry, index) => ({
      variantId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      name: `Variant ${index}`,
      override: {
        overrideType: 'capital_plan',
        payload: structuredClone(entry.inputs[0]!) as ReturnType<typeof makeCapitalInput>,
      },
    }));
    input.variants[4]!.override.payload.allocations[9]!.plannedCompanyCount = 10000;
    expect(issues(input)[0]).toMatchObject({
      code: 'INPUT_TOO_LARGE',
      path: 'input.variants',
      limit: 60000,
      observed: 60840,
    });
  });

  it('preserves the mixed window-origin sentinel', () => {
    const input = request();
    input.unitDeclarations['feeProfiles[0].feeTiers[0].startMonth'] = 'fund_month_zero_based';
    input.unitDeclarations['feeProfiles[0].feeTiers[0].endMonth'] = 'fund_month_one_based';
    expect(issues(input)[0]).toMatchObject({
      code: 'TIME_ORIGIN_UNRESOLVED',
      support: 'incomplete',
    });
  });

  it('leaves ordinary malformed V3 input classified as invalid', () => {
    expect(
      issues({ ...request(), extra: true }).every((issue) => issue.code === 'INVALID_INPUT')
    ).toBe(true);
  });

  it('preserves an unsupported selected check-policy discriminator at its exact path', () => {
    const input = request();
    const round = CapitalPlanningInputV1Schema.parse(maximumShape[0]!.inputs[0]).allocations[0]!
      .followOnRounds[0]!;
    Object.assign(round.checkPolicy, { type: 'capped_check' });
    input.variants[0]!.override.payload.allocations[0]!.followOnRounds = [round];
    expect(issues(input)[0]).toMatchObject({
      code: 'POLICY_UNSUPPORTED',
      support: 'unsupported',
      path: 'input.variants[0].override.payload.allocations[0].followOnRounds[0].checkPolicy.type',
    });
  });

  it('keeps unrelated invalid discriminators generic', () => {
    const input = request();
    const performanceCase = CapitalPlanningInputV1Schema.parse(
      maximumShape[0]!.inputs[0]
    ).performanceCase!;
    Object.assign(performanceCase.participationCap, { type: 'ordinary_typo' });
    input.variants[0]!.override.payload.performanceCase = performanceCase;
    expect(issues(input).every((issue) => issue.code === 'INVALID_INPUT')).toBe(true);
  });

  it.each([
    'secondary',
    'transfer',
    'safe_conversion',
    'note_conversion',
    'warrant_conversion',
    'ownership_only',
    'ambiguous_seniority',
  ])('retains the selected unsupported companion mapping %s', (transactionType) => {
    const input = request();
    const performanceCase = CapitalPlanningInputV1Schema.parse(
      maximumShape[0]!.inputs[0]
    ).performanceCase!;
    Object.assign(performanceCase, { transactionType });
    input.variants[0]!.override.payload.performanceCase = performanceCase;
    expect(issues(input)[0]).toMatchObject({
      code: 'INSTRUMENT_MAPPING_UNSUPPORTED',
      support: 'unsupported',
      path: 'input.variants[0].override.payload.performanceCase.transactionType',
    });
  });

  it('does not invent a mapping code for an unknown extra companion field', () => {
    const input = request();
    const performanceCase = CapitalPlanningInputV1Schema.parse(
      maximumShape[0]!.inputs[0]
    ).performanceCase!;
    Object.assign(performanceCase, { transactionType: 'ordinary_typo' });
    input.variants[0]!.override.payload.performanceCase = performanceCase;
    expect(issues(input).every((issue) => issue.code === 'INVALID_INPUT')).toBe(true);
  });
});

describe('selected construction source bounds', () => {
  it('independently refuses eleven normalized profiles at the stored-input fault boundary', () => {
    const override = envelope().variants[0]!.override;
    const original = override.payload.sourceBundle.construction.pipelineProfiles[0]!;
    override.payload.sourceBundle.construction.pipelineProfiles = Array.from(
      { length: 11 },
      (_, index) => ({
        ...structuredClone(original),
        id: index === 0 ? original.id : `extra-normalized-${index}`,
      })
    );
    const parsed = FundScenarioCapitalStoredOverrideV1Schema.safeParse(override);
    expect(parsed.success).toBe(false);
    if (parsed.success) throw new Error('Expected normalized profile bound');
    expect(parsed.error.issues).toHaveLength(1);
    expect(capitalSchemaIssues(parsed.error.issues, override, 'storedVariants[0]')).toEqual([
      expect.objectContaining({
        code: 'INPUT_TOO_LARGE',
        path: 'storedVariants[0].payload.sourceBundle.construction.pipelineProfiles',
        limit: 10,
        observed: 11,
      }),
    ]);
  });

  it('admits unused raw profiles and stages within independent projection bounds', () => {
    const fixture = structuredClone(maximumShape[0]!);
    const raw = fixture.source.config.raw;
    const extra = structuredClone(raw.pipelineProfiles[0]!);
    extra.id = 'unused-extra-profile';
    raw.pipelineProfiles.push(extra);
    const last = structuredClone(raw.pipelineProfiles[0]!.stages[11]!);
    last.id = 'unused-extra-stage';
    raw.pipelineProfiles[0]!.stages.push(last);
    const result = materializeCapitalSource(fixture);
    expect(result.ok).toBe(true);
  });

  it('returns the typed stage bound when selected facts exceed twelve stages', () => {
    const fixture = structuredClone(maximumShape[0]!);
    const profile = fixture.source.config.raw.pipelineProfiles[0]!;
    profile.stages.push({ ...profile.stages[11]!, id: 's12', name: 'Round 12' });
    const first = fixture.inputs[0]!.allocations[0]!;
    const second = fixture.inputs[0]!.allocations[1]!;
    fixture.inputs[0]!.allocations = [first, second];
    first.budgetShareRatio = '0.500000000000';
    second.budgetShareRatio = '0.500000000000';
    second.entryStageId = 's6';
    second.followOnRounds.forEach((round, index) => {
      round.stageId = `s${index + 7}`;
    });
    const result = materializeCapitalSource(fixture);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected selected stage refusal');
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'INPUT_TOO_LARGE',
        path: 'pipelineProfiles[0].stages',
        limit: 12,
        observed: 13,
        support: 'unsupported',
      })
    );
  });
});

describe('capital scenario input identity', () => {
  it('pins a saved-only historical preimage independently of its synthetic reader-fixture hash', () => {
    const input = envelope();
    expect(createCapitalScenarioInputHash(input)).toBe(
      '3891b7fef7377558e1b1fd5b2679b8107c9522ca12aceadbaa9440874c14efd6'
    );
    expect(createCapitalScenarioInputHash(input)).not.toBe(historical.snapshot.state_hash);
    expect(canonicalCapitalScenarioInputString(input)).not.toContain('benchmarkSnapshots');
    expect(input).toEqual(envelope());
  });

  it('normalizes object-key and physical-array order using stable saved sort order', () => {
    const input = envelope();
    const reordered = Object.fromEntries(
      Object.entries(input).reverse()
    ) as CapitalScenarioInputHashEnvelope;
    reordered.variants = [...input.variants].reverse();
    expect(createCapitalScenarioInputHash(reordered)).toBe(createCapitalScenarioInputHash(input));
  });

  it.each(['1.0.1', 'historical-engine'])(
    'binds calculation engine version %s',
    (engineVersion) => {
      const input = envelope();
      input.engineVersion = engineVersion;
      expect(createCapitalScenarioInputHash(input)).not.toBe(
        createCapitalScenarioInputHash(envelope())
      );
    }
  );

  it('binds saved interpretation without resolving current support', () => {
    const input = envelope();
    input.interpretationVersion = 'capital-source-interpretation/0.9.0';
    for (const variant of input.variants)
      variant.override.payload.sourceBundle.interpretationVersion = input.interpretationVersion;
    expect(createCapitalScenarioInputHash(input)).not.toBe(
      createCapitalScenarioInputHash(envelope())
    );
  });

  it('binds exact unit declarations even when raw fingerprint is unchanged', () => {
    const input = envelope();
    for (const variant of input.variants)
      variant.override.payload.sourceBundle.unitDeclarations['funds.size'] = 'usd_millions';
    expect(input.sourceBundleHash).toBe(envelope().sourceBundleHash);
    expect(createCapitalScenarioInputHash(input)).not.toBe(
      createCapitalScenarioInputHash(envelope())
    );
  });

  it('binds normalized scenario assumptions', () => {
    const input = envelope();
    input.variants[0]!.override.payload.input.allocations[0]!.initialCheckUsd = '3.000000';
    expect(createCapitalScenarioInputHash(input)).not.toBe(
      createCapitalScenarioInputHash(envelope())
    );
  });

  it('preserves absent benchmark copies versus explicit empty copies', () => {
    const input = envelope();
    input.variants[0]!.override.payload.benchmarkSnapshots = [];
    expect(createCapitalScenarioInputHash(input)).not.toBe(
      createCapitalScenarioInputHash(envelope())
    );
  });

  it('hashes retained benchmark versions unavailable in the current catalog', () => {
    const input = withSavedBenchmark();
    const saved = input.variants[0]!.override.payload.benchmarkSnapshots![0]!;
    saved.selector.version = 'archived-benchmark/0.9.0';
    saved.metadata.version = saved.selector.version;
    expect(createCapitalScenarioInputHash(input)).not.toBe(
      createCapitalScenarioInputHash(withSavedBenchmark())
    );
  });

  it.each([
    'baseline',
    'metadata',
    'observed-label',
    'override-presence',
    'override-value',
  ] as const)('binds benchmark %s independently of unchanged source/input', (field) => {
    const input = withSavedBenchmark();
    const saved = input.variants[0]!.override.payload.benchmarkSnapshots![0]!;
    if (field === 'baseline') saved.baselineFinancing.valuationUsd = '25000000.000000';
    if (field === 'metadata') saved.metadata.population = 'A different reported population';
    if (field === 'observed-label')
      saved.observedMetrics.valuationUsd = 'A different reported valuation label';
    if (field === 'override-presence') saved.overrides = {};
    if (field === 'override-value') saved.overrides = { totalPrimaryRoundUsd: '5000000.000000' };
    expect(createCapitalScenarioInputHash(input)).not.toBe(
      createCapitalScenarioInputHash(withSavedBenchmark())
    );
  });

  it('binds baseline and stable variant IDs', () => {
    const input = envelope();
    input.baselineVariantId = '11111111-1111-4111-8111-111111111111';
    input.variants[0]!.variantId = input.baselineVariantId;
    expect(createCapitalScenarioInputHash(input)).not.toBe(
      createCapitalScenarioInputHash(envelope())
    );
  });

  it('binds genuine v2 business date and comparison lineage while v1 stays date-free', () => {
    const input = envelope();
    for (const variant of input.variants)
      variant.override.payload.sourceBundle.modelInputsAsOfDate = '2026-01-31';
    const v2 = {
      ...input,
      version: 'scenario-input-hash-v2' as const,
      modelInputsAsOfDate: '2026-01-31',
    };
    expect(canonicalCapitalScenarioInputString(v2)).toContain(
      '"comparisonLineageVersion":"comparison-lineage-v1"'
    );
    expect(createCapitalScenarioInputHash(v2)).not.toBe(createCapitalScenarioInputHash(envelope()));
    expect(canonicalCapitalScenarioInputString(envelope())).not.toContain(
      'comparisonLineageVersion'
    );
  });

  it.each(['fundId', 'sourceConfigId', 'sourceConfigVersion'] as const)(
    'rejects mismatched saved %s identity',
    (key) => {
      const input = envelope();
      input[key] += 1;
      expect(() => createCapitalScenarioInputHash(input)).toThrow('identity is inconsistent');
    }
  );

  it('rejects a valid-looking stored hash that does not authenticate its raw projection', () => {
    const input = envelope();
    input.sourceBundleHash = 'a'.repeat(64);
    for (const variant of input.variants) {
      variant.override.payload.sourceBundleHash = input.sourceBundleHash;
      variant.override.payload.sourceBundle.sourceBundleHash = input.sourceBundleHash;
    }
    expect(() => createCapitalScenarioInputHash(input)).toThrow('projection hash is inconsistent');
  });

  it.each(['duplicate-order', 'duplicate-id', 'wrong-baseline', 'mixed-source'] as const)(
    'rejects %s',
    (kind) => {
      const input = envelope();
      if (kind === 'duplicate-order') input.variants[1]!.sortOrder = 0;
      if (kind === 'duplicate-id') input.variants[1]!.variantId = input.variants[0]!.variantId;
      if (kind === 'wrong-baseline') input.baselineVariantId = input.variants[1]!.variantId;
      if (kind === 'mixed-source')
        input.variants[1]!.override.payload.sourceBundle.publishedAt = '2026-01-01T00:00:00.000Z';
      expect(() => createCapitalScenarioInputHash(input)).toThrow('identity is inconsistent');
    }
  );

  it.each([
    { modelInputsAsOfDate: '2026-01-31' },
    { calculationMode: 'sync_fee_profile' },
    { overrideType: 'fee_profile' },
    { extra: 'not admitted' },
    { capitalPreimageVersion: 'capital-preimage/9.0.0' },
  ])('rejects inadmissible envelope fields %j', (patch) => {
    expect(() =>
      createCapitalScenarioInputHash({
        ...envelope(),
        ...patch,
      } as CapitalScenarioInputHashEnvelope)
    ).toThrow();
  });
});

describe('legacy preimage isolation', () => {
  it('retains the exact legacy v1 canonical bytes and SHA-256', () => {
    expect(canonicalScenarioInputString(legacy())).toBe(
      '{"calculationMode":"sync_fee_profile","contractVersion":"fund-scenarios-v1","engineVersion":"1.0.0","overrideType":"fee_profile","scenarioSetId":"legacy-set","sourceConfigId":3,"sourceConfigVersion":2,"variants":[{"override":{"a":1,"z":2},"sortOrder":0,"variantId":"v1"}],"version":"scenario-input-hash-v1"}'
    );
    expect(createScenarioInputHash(legacy())).toBe(
      'bb5b72fe80e0ae2fb6f3fabd98701ba099526cfbc81a283cc3f18652f67c3e6d'
    );
  });

  it.each([
    'calculationDomain',
    'capitalPreimageVersion',
    'methodVersion',
    'interpretationVersion',
    'baselineVariantId',
    'sourceBundleHash',
    'unitDeclarations',
    'sourceBundle',
    'benchmarkSnapshots',
  ])('rejects capital-only %s on a legacy envelope', (key) => {
    expect(() =>
      createScenarioInputHash({ ...legacy(), [key]: null } as ScenarioInputHashEnvelope)
    ).toThrow('Capital fields require');
  });

  it('rejects nested capital overrides on the legacy path', () => {
    const input = legacy();
    input.variants = [
      { variantId: 'v1', sortOrder: 0, override: envelope().variants[0]!.override },
    ];
    expect(() => createScenarioInputHash(input)).toThrow('Capital fields require');
  });
});
