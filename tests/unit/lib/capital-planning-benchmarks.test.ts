import { describe, expect, it } from 'vitest';
import {
  CAPITAL_PLANNING_PROVISIONAL_LIMITS,
  CapitalPlanningDraftV1Schema,
  CapitalPlanningInputV1Schema,
  CapitalPlanningResultV1Schema,
  CapitalSourceBundleV1Schema,
  type CapitalAssumptionProvenanceV1,
} from '../../../shared/contracts/capital-planning-v1.contract';
import {
  CAPITAL_BENCHMARK_CATALOG_VERSION,
  getCapitalBenchmarkPresetV1,
  resolveCapitalPlanningDraftV1,
} from '../../../shared/lib/capital-planning/benchmark-presets';
import {
  calculateCapitalPlanningV1,
  CapitalPlanningCalculationError,
} from '../../../shared/lib/capital-planning/capital-planning-v1';
import {
  materializeCapitalSource,
  verifyPinnedCapitalSourceBundle,
  type CapitalMaterializationResult,
  type CapitalRawSource,
} from '../../../shared/lib/capital-planning/materialize-from-fund-draft';
import {
  makeCapitalDeclarations,
  makeCapitalInput,
  makeCapitalRawConfig,
} from '../../fixtures/capital-planning/fixtures';

type Draft = ReturnType<typeof CapitalPlanningDraftV1Schema.parse>;
type Selection = NonNullable<Draft['benchmarkSelections']>[number];
type Selector = Parameters<typeof getCapitalBenchmarkPresetV1>[0];
type Overrides = NonNullable<Selection['overrides']>;

const seedSelector = { version: CAPITAL_BENCHMARK_CATALOG_VERSION, stage: 'seed' } as const;
const sourceFinancing = {
  valuationUsd: '10.000000',
  valuationBasis: 'pre_money',
  totalPrimaryRoundUsd: '2.000000',
} as const;
const seedFinancing = {
  valuationUsd: '24300000.000000',
  valuationBasis: 'post_money',
  totalPrimaryRoundUsd: '4100000.000000',
} as const;

function entrySelection(overrides?: Overrides): Selection {
  const selection = {
    target: { allocationId: 'a1', kind: 'entry' as const },
    selector: { ...seedSelector },
  };
  return overrides === undefined ? selection : { ...selection, overrides };
}

function selectedDraft(input = makeCapitalInput(), overrides?: Overrides): Draft {
  return { input, benchmarkSelections: [entrySelection(overrides)] };
}

function adoptSeed(): Overrides {
  const { baselineFinancing } = getCapitalBenchmarkPresetV1(seedSelector);
  return {
    valuation: {
      valuationUsd: baselineFinancing.valuationUsd,
      valuationBasis: baselineFinancing.valuationBasis,
    },
    totalPrimaryRoundUsd: baselineFinancing.totalPrimaryRoundUsd,
  };
}

function setup() {
  const raw = makeCapitalRawConfig();
  const source: CapitalRawSource = {
    fund: { id: 101, size: '100.00', baseCurrency: 'USD' },
    config: { id: 11, version: 1, raw, publishedAt: '2026-09-01T00:00:00.000Z' },
  };
  return {
    raw,
    source,
    input: makeCapitalInput(),
    unitDeclarations: makeCapitalDeclarations(),
  };
}

function admitted(result: CapitalMaterializationResult) {
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result;
}

function sourceBundle(fixture = setup()) {
  return admitted(
    materializeCapitalSource({
      source: fixture.source,
      inputs: [makeCapitalInput()],
      unitDeclarations: fixture.unitDeclarations,
    })
  ).sourceBundle;
}

function materializeDraft(fixture = setup(), draft = selectedDraft(fixture.input)) {
  const result = admitted(
    materializeCapitalSource({
      source: fixture.source,
      inputs: [draft],
      unitDeclarations: fixture.unitDeclarations,
    })
  );
  const input = result.resolvedInputs?.[0];
  const benchmarkSnapshots = result.benchmarkSnapshotsByInput?.[0];
  if (!input || !benchmarkSnapshots) throw new Error('Selected draft resolution was not returned');
  return { result, input, benchmarkSnapshots };
}

function provenanceAt(provenance: readonly CapitalAssumptionProvenanceV1[], inputPath: string) {
  const found = provenance.filter((item) => item.inputPath === inputPath);
  expect(found).toHaveLength(1);
  return found[0]!;
}

function withFollowOn() {
  const fixture = setup();
  const stages = fixture.raw.pipelineProfiles![0]!.stages;
  stages[0]!.graduationRate = 1;
  stages.push({ ...stages[0]!, id: 's1', name: 'Series A', valuation: 20, roundSize: 5 });
  for (const [path, unit] of Object.entries(fixture.unitDeclarations)) {
    if (path.startsWith('pipelineProfiles[0].stages[0].')) {
      fixture.unitDeclarations[path.replace('stages[0]', 'stages[1]')] = unit;
    }
  }
  fixture.input.allocations[0]!.plannedCompanyCount = 1;
  fixture.input.allocations[0]!.followOnRounds = [
    {
      roundId: 'r1',
      stageId: 's1',
      roundLabel: 'Series A',
      graduationRatio: '1.000000000000',
      participationRatio: '1.000000000000',
      checkPolicy: { type: 'pro_rata', proRataExerciseRatio: '1.000000000000' },
      monthsAfterPreviousRound: 12,
      timeOrigin: 'previous_round',
      incrementalPreMoneyPoolDilutionRatio: '0.000000000000',
    },
  ];
  const draft = selectedDraft(fixture.input);
  draft.benchmarkSelections!.push({
    target: { allocationId: 'a1', kind: 'follow_on', roundId: 'r1' },
    selector: { ...seedSelector },
  });
  return { ...fixture, draft };
}

function maximumSelectionDraft(): Draft {
  const draft: Draft = { input: makeCapitalInput(), benchmarkSelections: [] };
  draft.input.allocations = Array.from(
    { length: CAPITAL_PLANNING_PROVISIONAL_LIMITS.maxAllocations },
    (_, index) => {
      const allocation = makeCapitalInput().allocations[0]!;
      allocation.allocationId = `a${index}`;
      allocation.budgetShareRatio = '0.100000000000';
      draft.benchmarkSelections!.push({
        target: { allocationId: allocation.allocationId, kind: 'entry' },
        selector: { ...seedSelector },
      });
      allocation.followOnRounds = Array.from(
        { length: CAPITAL_PLANNING_PROVISIONAL_LIMITS.maxFollowOnRounds },
        (_, roundIndex) => {
          const roundId = `r${roundIndex}`;
          draft.benchmarkSelections!.push({
            target: { allocationId: allocation.allocationId, kind: 'follow_on', roundId },
            selector: { ...seedSelector },
          });
          return {
            roundId,
            stageId: `s${roundIndex + 1}`,
            roundLabel: `Round ${roundIndex + 1}`,
            graduationRatio: '1.000000000000',
            participationRatio: '1.000000000000',
            checkPolicy: { type: 'fixed_check' as const, checkUsd: '1.000000' },
            monthsAfterPreviousRound: 12,
            timeOrigin: 'previous_round' as const,
          };
        }
      );
      return allocation;
    }
  );
  return draft;
}

describe('CP-029 trusted benchmark catalog', () => {
  it.each([
    ['seed', '24300000.000000', '4100000.000000'],
    ['series_a', '80000000.000000', '14400000.000000'],
    ['series_b', '190900000.000000', '25000000.000000'],
    ['series_c', '390900000.000000', '39500000.000000'],
    ['series_d', '789400000.000000', '63200000.000000'],
  ] as const)(
    'normalizes the reviewed %s medians into exact dollars',
    (stage, valuation, round) => {
      expect(
        getCapitalBenchmarkPresetV1({ version: CAPITAL_BENCHMARK_CATALOG_VERSION, stage })
          .baselineFinancing
      ).toEqual({
        valuationUsd: valuation,
        valuationBasis: 'post_money',
        totalPrimaryRoundUsd: round,
      });
    }
  );

  it('retains the reported observation window and empirical metric labels without inventing a start', () => {
    const preset = getCapitalBenchmarkPresetV1(seedSelector);
    expect(preset.metadata).toMatchObject({
      version: CAPITAL_BENCHMARK_CATALOG_VERSION,
      sourceUrl: 'https://carta.com/data/linkedin-vc-fundraising-benchmarks-2026/',
      sourceTitle: 'VC Startup Fundraising Benchmarks From 1000 Rounds',
      observationStart: null,
      observationEnd: '2026-07-10',
      statistic: 'median',
      valuationBasis: 'post_money',
      sourceUnit: 'usd_millions',
      sampleSize: 1133,
    });
    expect(preset.metadata.observationWindow).toMatch(/6|six/i);
    expect(preset.metadata.sector).toMatch(/software/i);
    expect(preset.metadata.populationMismatch).toBeTruthy();
    expect(JSON.stringify(preset.observedMetrics)).toContain('Post-Money Val');
    expect(JSON.stringify(preset.observedMetrics)).toContain('Cash Raised');
  });

  it('returns independent copies of financing and metadata', () => {
    const first = getCapitalBenchmarkPresetV1(seedSelector);
    first.baselineFinancing.valuationUsd = '1.000000';
    first.metadata.sourceTitle = 'Changed by caller';
    const second = getCapitalBenchmarkPresetV1(seedSelector);
    expect(second.baselineFinancing).toEqual(seedFinancing);
    expect(second.metadata.sourceTitle).toBe('VC Startup Fundraising Benchmarks From 1000 Rounds');
  });

  it.each([
    { version: 'unavailable-catalog/9.0.0', stage: 'seed' },
    { version: CAPITAL_BENCHMARK_CATALOG_VERSION, stage: 'series_e' },
  ])('refuses an unsupported catalog selector %j', (selector) => {
    expect(() => getCapitalBenchmarkPresetV1(selector as Selector)).toThrow(
      CapitalPlanningCalculationError
    );
  });
});

describe('CP-029 strict selection intent', () => {
  it('preserves no-selection materializer bytes for absent and empty selection lists', () => {
    const fixture = setup();
    const run = (input: unknown) =>
      materializeCapitalSource({
        source: fixture.source,
        inputs: [input],
        unitDeclarations: fixture.unitDeclarations,
      });
    const original = admitted(run(fixture.input));
    expect(JSON.stringify(run({ input: fixture.input }))).toBe(JSON.stringify(original));
    expect(JSON.stringify(run({ input: fixture.input, benchmarkSelections: [] }))).toBe(
      JSON.stringify(original)
    );
    expect(original).not.toHaveProperty('resolvedInputs');
    expect(original).not.toHaveProperty('benchmarkSnapshotsByInput');
    const calculation = calculateCapitalPlanningV1({
      input: fixture.input,
      sourceBundle: original.sourceBundle,
    });
    expect(
      JSON.stringify(
        calculateCapitalPlanningV1({
          input: fixture.input,
          sourceBundle: original.sourceBundle,
          benchmarkSnapshots: [],
        })
      )
    ).toBe(JSON.stringify(calculation));
  });

  it('rejects duplicate selections for the same allocation target', () => {
    const draft = selectedDraft();
    draft.benchmarkSelections!.push(entrySelection());
    expect(CapitalPlanningDraftV1Schema.safeParse(draft).success).toBe(false);
  });

  it.each([
    { allocationId: 'missing', kind: 'entry' },
    { allocationId: 'a1', kind: 'follow_on', roundId: 'missing' },
  ])('rejects a target absent from draft input: %j', (target) => {
    const draft = selectedDraft();
    Object.assign(draft.benchmarkSelections![0]!, { target });
    expect(CapitalPlanningDraftV1Schema.safeParse(draft).success).toBe(false);
  });

  it('rejects competing financing at a selected target', () => {
    const draft = selectedDraft();
    draft.input.allocations[0]!.entryFinancing = { ...sourceFinancing };
    expect(CapitalPlanningDraftV1Schema.safeParse(draft).success).toBe(false);
  });

  it.each(['benchmarkSnapshots', 'financingProvenance', 'sourceBundle'])(
    'rejects client-authored %s in the draft envelope',
    (field) => {
      expect(
        CapitalPlanningDraftV1Schema.safeParse({ ...selectedDraft(), [field]: [] }).success
      ).toBe(false);
    }
  );

  it.each([
    { valuation: { valuationUsd: '10.000000' } },
    { valuation: { valuationBasis: 'pre_money' } },
    { valuation: { valuationUsd: '0.000000', valuationBasis: 'pre_money' } },
    { valuation: { valuationUsd: 'NaN', valuationBasis: 'pre_money' } },
    { totalPrimaryRoundUsd: '-1.000000' },
    { totalPrimaryRoundUsd: 2 },
    { totalPrimaryRoundUsd: '2e0' },
    { totalPrimaryRoundUsd: '2.000000', benchmark: {} },
  ])('rejects malformed or ambiguous explicit overrides %j', (overrides) => {
    const draft = selectedDraft();
    Object.assign(draft.benchmarkSelections![0]!, { overrides });
    expect(CapitalPlanningDraftV1Schema.safeParse(draft).success).toBe(false);
  });

  it('admits the exact selection capacity and reports a bound refusal at capacity plus one', () => {
    const draft = maximumSelectionDraft();
    expect(CapitalPlanningDraftV1Schema.safeParse(draft).success).toBe(true);
    draft.benchmarkSelections!.push({
      target: { allocationId: 'outside-capacity', kind: 'entry' },
      selector: { ...seedSelector },
    });
    const result = CapitalPlanningDraftV1Schema.safeParse(draft);
    expect(result.success).toBe(false);
    if (result.success) throw new Error('Selection capacity unexpectedly exceeded');
    expect(
      result.error.issues.some(
        (issue) => issue.code === 'too_big' && issue.path[0] === 'benchmarkSelections'
      )
    ).toBe(true);
  });
});

describe('CP-029 actual materializer and calculator resolution', () => {
  it('fills missing draft financing from valid published source while retaining the selected baseline', () => {
    const { result, input, benchmarkSnapshots } = materializeDraft();
    expect(input.allocations[0]!.entryFinancing).toEqual(sourceFinancing);
    expect(benchmarkSnapshots[0]!.baselineFinancing).toEqual(seedFinancing);
    expect(
      provenanceAt(
        result.assumptionProvenanceByInput[0]!,
        'allocations[0].entryFinancing.valuationUsd'
      )
    ).toMatchObject({ origin: 'source_derived', benchmark: null });
    expect(CapitalPlanningInputV1Schema.safeParse(input).success).toBe(true);
    const calculation = calculateCapitalPlanningV1({
      input,
      sourceBundle: result.sourceBundle,
      benchmarkSnapshots,
    });
    expect(CapitalPlanningResultV1Schema.safeParse(calculation).success).toBe(true);
  });

  it('treats explicit preset adoption as user intent and retains independent benchmark history', () => {
    const fixture = setup();
    const overrides = adoptSeed();
    const { result, input, benchmarkSnapshots } = materializeDraft(
      fixture,
      selectedDraft(fixture.input, overrides)
    );
    expect(input.allocations[0]!.entryFinancing).toEqual(seedFinancing);
    expect(benchmarkSnapshots[0]).toMatchObject({ baselineFinancing: seedFinancing, overrides });
    expect(benchmarkSnapshots[0]!.metadata.sourceTitle).toBe(
      'VC Startup Fundraising Benchmarks From 1000 Rounds'
    );
    for (const field of ['valuationUsd', 'valuationBasis', 'totalPrimaryRoundUsd']) {
      expect(
        provenanceAt(
          result.assumptionProvenanceByInput[0]!,
          `allocations[0].entryFinancing.${field}`
        )
      ).toMatchObject({ origin: 'user_override', benchmark: null });
    }
  });

  it('preserves explicit override origin when values equal the source exactly', () => {
    const fixture = setup();
    const { result } = materializeDraft(
      fixture,
      selectedDraft(fixture.input, {
        valuation: { valuationUsd: '10.000000', valuationBasis: 'pre_money' },
        totalPrimaryRoundUsd: '2.000000',
      })
    );
    for (const field of ['valuationUsd', 'valuationBasis', 'totalPrimaryRoundUsd']) {
      expect(
        provenanceAt(
          result.assumptionProvenanceByInput[0]!,
          `allocations[0].entryFinancing.${field}`
        ).origin
      ).toBe('user_override');
    }
  });

  it('preserves source origin when source values equal the selected preset exactly', () => {
    const fixture = setup();
    Object.assign(fixture.raw.pipelineProfiles![0]!.stages[0]!, {
      valuation: 24300000,
      valuationType: 'post',
      roundSize: 4100000,
    });
    const { result, input } = materializeDraft(fixture);
    expect(input.allocations[0]!.entryFinancing).toEqual(seedFinancing);
    for (const field of ['valuationUsd', 'valuationBasis', 'totalPrimaryRoundUsd']) {
      expect(
        provenanceAt(
          result.assumptionProvenanceByInput[0]!,
          `allocations[0].entryFinancing.${field}`
        )
      ).toMatchObject({ origin: 'source_derived', benchmark: null });
    }
  });

  it('resolves the valuation pair from an override and round amount independently from source', () => {
    const fixture = setup();
    const { result, input } = materializeDraft(
      fixture,
      selectedDraft(fixture.input, {
        valuation: { valuationUsd: '24300000.000000', valuationBasis: 'post_money' },
      })
    );
    expect(input.allocations[0]!.entryFinancing).toEqual({
      ...seedFinancing,
      totalPrimaryRoundUsd: '2.000000',
    });
    expect(
      provenanceAt(
        result.assumptionProvenanceByInput[0]!,
        'allocations[0].entryFinancing.valuationUsd'
      ).origin
    ).toBe('user_override');
    expect(
      provenanceAt(
        result.assumptionProvenanceByInput[0]!,
        'allocations[0].entryFinancing.totalPrimaryRoundUsd'
      ).origin
    ).toBe('source_derived');
  });

  it('resolves a round-only override without replacing the source valuation pair', () => {
    const fixture = setup();
    const { result, input } = materializeDraft(
      fixture,
      selectedDraft(fixture.input, { totalPrimaryRoundUsd: '3.000000' })
    );
    expect(input.allocations[0]!.entryFinancing).toEqual({
      ...sourceFinancing,
      totalPrimaryRoundUsd: '3.000000',
    });
    expect(
      provenanceAt(
        result.assumptionProvenanceByInput[0]!,
        'allocations[0].entryFinancing.valuationUsd'
      ).origin
    ).toBe('source_derived');
    expect(
      provenanceAt(
        result.assumptionProvenanceByInput[0]!,
        'allocations[0].entryFinancing.totalPrimaryRoundUsd'
      ).origin
    ).toBe('user_override');
  });

  it('fills selected entry and follow-on financing before full pro-rata validation', () => {
    const fixture = withFollowOn();
    expect(CapitalPlanningInputV1Schema.safeParse(fixture.draft.input).success).toBe(false);
    expect(CapitalPlanningDraftV1Schema.safeParse(fixture.draft).success).toBe(true);
    const { input } = materializeDraft(fixture, fixture.draft);
    expect(input.allocations[0]!.entryFinancing).toEqual(sourceFinancing);
    expect(input.allocations[0]!.followOnRounds[0]!.financing).toEqual({
      valuationUsd: '20.000000',
      valuationBasis: 'pre_money',
      totalPrimaryRoundUsd: '5.000000',
    });
    expect(CapitalPlanningInputV1Schema.safeParse(input).success).toBe(true);
  });

  it('refuses missing incremental pool dilution even when source reports a total pool', () => {
    const fixture = withFollowOn();
    fixture.raw.pipelineProfiles![0]!.stages[1]!.esopPct = 0.121;
    delete fixture.draft.input.allocations[0]!.followOnRounds[0]!
      .incrementalPreMoneyPoolDilutionRatio;
    const result = materializeCapitalSource({
      source: fixture.source,
      inputs: [fixture.draft],
      unitDeclarations: fixture.unitDeclarations,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Missing incremental pool unexpectedly admitted');
    expect(
      result.readiness.issues.some((issue) =>
        issue.path.includes('incrementalPreMoneyPoolDilutionRatio')
      )
    ).toBe(true);
  });

  it('uses actual post-money subtraction for skipped ownership after explicit follow-on adoption', () => {
    const fixture = withFollowOn();
    fixture.raw.pipelineProfiles![0]!.stages[0]!.valuation = 8;
    fixture.draft.benchmarkSelections![1]!.overrides = adoptSeed();
    fixture.draft.input.allocations[0]!.followOnRounds[0]!.checkPolicy = {
      type: 'pro_rata',
      proRataExerciseRatio: '0.000000000000',
    };
    const { result, input, benchmarkSnapshots } = materializeDraft(fixture, fixture.draft);
    const calculation = calculateCapitalPlanningV1({
      input,
      sourceBundle: result.sourceBundle,
      benchmarkSnapshots,
    });
    const round = calculation.construction.allocations[0]!.rounds.find(
      (item) => item.countBasis === 'entered'
    );
    expect(round?.ownership).toMatchObject({
      state: 'available',
      beforePoolRatio: '0.100000000000',
      skippedRatio: '0.083127572016',
    });
  });

  it('keeps source bytes and source bundle identical across differently selected variants', () => {
    const fixture = setup();
    const before = JSON.stringify(fixture.source);
    const expectedBundle = JSON.stringify(sourceBundle(fixture));
    const drafts = [
      selectedDraft(fixture.input),
      selectedDraft(structuredClone(fixture.input), adoptSeed()),
    ];
    const draftBytes = JSON.stringify(drafts);
    const result = admitted(
      materializeCapitalSource({
        source: fixture.source,
        inputs: drafts,
        unitDeclarations: fixture.unitDeclarations,
      })
    );
    expect(JSON.stringify(result.sourceBundle)).toBe(expectedBundle);
    expect(JSON.stringify(fixture.source)).toBe(before);
    expect(JSON.stringify(drafts)).toBe(draftBytes);
    expect(result.resolvedInputs).toHaveLength(2);
    expect(result.benchmarkSnapshotsByInput).toHaveLength(2);
  });

  it('emits identical selected financing provenance records from preview and calculation', () => {
    const fixture = withFollowOn();
    fixture.draft.benchmarkSelections![1]!.overrides = adoptSeed();
    const { result, input, benchmarkSnapshots } = materializeDraft(fixture, fixture.draft);
    const calculation = calculateCapitalPlanningV1({
      input,
      sourceBundle: result.sourceBundle,
      benchmarkSnapshots,
    });
    for (const prefix of ['entryFinancing', 'followOnRounds[0].financing']) {
      for (const field of ['valuationUsd', 'valuationBasis', 'totalPrimaryRoundUsd']) {
        const path = `allocations[0].${prefix}.${field}`;
        expect(provenanceAt(calculation.provenance, path)).toEqual(
          provenanceAt(result.assumptionProvenanceByInput[0]!, path)
        );
      }
    }
  });
});

describe('CP-029 raw-source refusal boundary', () => {
  it('refuses a missing required raw financing field before considering a preset', () => {
    const fixture = setup();
    Reflect.deleteProperty(fixture.raw.pipelineProfiles![0]!.stages[0]!, 'valuation');
    const result = materializeCapitalSource({
      source: fixture.source,
      inputs: [selectedDraft(fixture.input, adoptSeed())],
      unitDeclarations: fixture.unitDeclarations,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Incomplete raw financing unexpectedly admitted');
    expect(result.readiness.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'INVALID_INPUT',
          path: 'pipelineProfiles[0].stages[0].valuation',
        }),
      ])
    );
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'refuses supplied invalid source valuation %s without treating it as absent',
    (valuation) => {
      const fixture = setup();
      fixture.raw.pipelineProfiles![0]!.stages[0]!.valuation = valuation;
      const result = materializeCapitalSource({
        source: fixture.source,
        inputs: [selectedDraft(fixture.input)],
        unitDeclarations: fixture.unitDeclarations,
      });
      expect(result.ok).toBe(false);
    }
  );

  it('retains whole-source schema refusal before malformed selection refusal', () => {
    const fixture = setup();
    Reflect.set(fixture.raw.pipelineProfiles![0]!.stages[0]!, 'valuation', '10');
    const draft = selectedDraft(fixture.input);
    draft.benchmarkSelections![0]!.selector.version = 'unavailable-catalog/9.0.0';
    const result = materializeCapitalSource({
      source: fixture.source,
      inputs: [draft],
      unitDeclarations: fixture.unitDeclarations,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Malformed source unexpectedly admitted');
    expect(result.readiness.issues[0]).toMatchObject({
      code: 'INVALID_INPUT',
      path: 'pipelineProfiles[0].stages[0].valuation',
    });
  });

  it('refuses unresolved source units even when explicit adoption supplies complete financing', () => {
    const fixture = setup();
    delete fixture.unitDeclarations['pipelineProfiles[0].stages[0].valuation'];
    const result = materializeCapitalSource({
      source: fixture.source,
      inputs: [selectedDraft(fixture.input, adoptSeed())],
      unitDeclarations: fixture.unitDeclarations,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Unresolved source unit unexpectedly admitted');
    expect(result.readiness.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'UNIT_PROVENANCE_UNRESOLVED',
          path: 'pipelineProfiles[0].stages[0].valuation',
        }),
      ])
    );
  });
});

describe('CP-029 conditional normalized-bundle fallback and retained copies', () => {
  it('continues verifying saved bundles against fully normalized saved inputs', () => {
    const fixture = withFollowOn();
    const { result, input } = materializeDraft(fixture, fixture.draft);
    expect(
      verifyPinnedCapitalSourceBundle({
        sourceBundle: result.sourceBundle,
        savedProjection: result.sourceBundle.projection,
        inputs: [input],
      })
    ).toMatchObject({ ok: true, readiness: { context: 'saved_input', state: 'READY' } });
  });

  it.each(['normalized_wrapper', 'unresolved_selected', 'unknown_catalog'] as const)(
    'refuses draft envelope %s at the actual saved-input verifier boundary',
    (kind) => {
      const fixture = withFollowOn();
      const { result, input } = materializeDraft(fixture, fixture.draft);
      const envelope: Draft = kind === 'normalized_wrapper' ? { input } : fixture.draft;
      if (kind === 'unknown_catalog') {
        envelope.benchmarkSelections![0]!.selector.version = 'unavailable-catalog/9.0.0';
      }
      const verified = verifyPinnedCapitalSourceBundle({
        sourceBundle: result.sourceBundle,
        savedProjection: result.sourceBundle.projection,
        inputs: [envelope],
      });
      expect(verified.ok).toBe(false);
      expect(verified.readiness.context).toBe('saved_input');
    }
  );

  it('returns a typed refusal for a schema-valid pinned fact with nonnumeric raw text', () => {
    const bundle = sourceBundle();
    bundle.construction.pipelineProfiles[0]!.stages[0]!.valuation!.rawValue = 'not-money';
    expect(CapitalSourceBundleV1Schema.safeParse(bundle).success).toBe(true);
    expect(() =>
      resolveCapitalPlanningDraftV1({ draft: selectedDraft(), sourceBundle: bundle })
    ).toThrow(CapitalPlanningCalculationError);
  });

  it('fills nullable normalized facts in the pure resolver without certifying fresh raw admission', () => {
    const bundle = sourceBundle();
    const stage = bundle.construction.pipelineProfiles[0]!.stages[0]!;
    stage.valuation = null;
    stage.roundSize = null;
    expect(CapitalSourceBundleV1Schema.safeParse(bundle).success).toBe(true);
    const result = resolveCapitalPlanningDraftV1({ draft: selectedDraft(), sourceBundle: bundle });
    expect(result.input.allocations[0]!.entryFinancing).toEqual(seedFinancing);
    for (const field of ['valuationUsd', 'valuationBasis', 'totalPrimaryRoundUsd']) {
      expect(
        provenanceAt(result.financingProvenance, `allocations[0].entryFinancing.${field}`)
      ).toMatchObject({
        origin: 'benchmark_derived',
        benchmark: result.benchmarkSnapshots[0]!.metadata,
      });
    }
  });

  it('mixes a nullable normalized valuation with a present source round only in the pure resolver', () => {
    const bundle = sourceBundle();
    bundle.construction.pipelineProfiles[0]!.stages[0]!.valuation = null;
    const result = resolveCapitalPlanningDraftV1({ draft: selectedDraft(), sourceBundle: bundle });
    expect(result.input.allocations[0]!.entryFinancing).toEqual({
      ...seedFinancing,
      totalPrimaryRoundUsd: '2.000000',
    });
    expect(
      provenanceAt(result.financingProvenance, 'allocations[0].entryFinancing.valuationUsd').origin
    ).toBe('benchmark_derived');
    expect(
      provenanceAt(result.financingProvenance, 'allocations[0].entryFinancing.totalPrimaryRoundUsd')
        .origin
    ).toBe('source_derived');
  });

  it('preserves absent versus explicitly empty override intent in retained snapshots', () => {
    const bundle = sourceBundle();
    const absent = resolveCapitalPlanningDraftV1({ draft: selectedDraft(), sourceBundle: bundle });
    const empty = resolveCapitalPlanningDraftV1({
      draft: selectedDraft(makeCapitalInput(), {}),
      sourceBundle: bundle,
    });
    expect(absent.benchmarkSnapshots[0]!.overrides).toBeUndefined();
    expect(empty.benchmarkSnapshots[0]!.overrides).toEqual({});
  });

  it('keeps previous input and copied baseline unchanged after explicit user edits', () => {
    const bundle = sourceBundle();
    const draft = selectedDraft(makeCapitalInput(), adoptSeed());
    const first = resolveCapitalPlanningDraftV1({ draft, sourceBundle: bundle });
    const retainedBytes = JSON.stringify(first);
    draft.benchmarkSelections![0]!.overrides!.valuation!.valuationUsd = '25000000.000000';
    const second = resolveCapitalPlanningDraftV1({ draft, sourceBundle: bundle });
    expect(second.input.allocations[0]!.entryFinancing!.valuationUsd).toBe('25000000.000000');
    expect(second.benchmarkSnapshots[0]!.baselineFinancing).toEqual(seedFinancing);
    expect(JSON.stringify(first)).toBe(retainedBytes);
  });

  it('replays a trusted retained version without requiring that version in the current catalog', () => {
    const bundle = sourceBundle();
    const draft = selectedDraft();
    const initial = resolveCapitalPlanningDraftV1({ draft, sourceBundle: bundle });
    const snapshots = structuredClone(initial.benchmarkSnapshots);
    const retainedVersion = 'retained-carta-software/0.9.0';
    draft.benchmarkSelections![0]!.selector.version = retainedVersion;
    snapshots[0]!.selector.version = retainedVersion;
    snapshots[0]!.metadata.version = retainedVersion;
    expect(() => getCapitalBenchmarkPresetV1(draft.benchmarkSelections![0]!.selector)).toThrow(
      CapitalPlanningCalculationError
    );
    const retainedBytes = JSON.stringify(snapshots);
    const replay = resolveCapitalPlanningDraftV1({
      draft,
      sourceBundle: bundle,
      benchmarkSnapshots: snapshots,
    });
    expect(replay.input).toEqual(initial.input);
    expect(JSON.stringify(replay.benchmarkSnapshots)).toBe(retainedBytes);
    expect(JSON.stringify(snapshots)).toBe(retainedBytes);
  });

  it.each(['target', 'selector', 'overrides'] as const)(
    'refuses retained %s inconsistent with supplied intent',
    (field) => {
      const bundle = sourceBundle();
      const draft = selectedDraft();
      const snapshots = resolveCapitalPlanningDraftV1({
        draft,
        sourceBundle: bundle,
      }).benchmarkSnapshots;
      if (field === 'target') snapshots[0]!.target.allocationId = 'other-allocation';
      if (field === 'selector') snapshots[0]!.selector.stage = 'series_a';
      if (field === 'overrides') snapshots[0]!.overrides = { totalPrimaryRoundUsd: '3.000000' };
      expect(() =>
        resolveCapitalPlanningDraftV1({
          draft,
          sourceBundle: bundle,
          benchmarkSnapshots: snapshots,
        })
      ).toThrow(CapitalPlanningCalculationError);
    }
  );

  it('refuses normalized financing inconsistent with trusted saved snapshots during calculation', () => {
    const fixture = setup();
    const { result, input, benchmarkSnapshots } = materializeDraft(
      fixture,
      selectedDraft(fixture.input, adoptSeed())
    );
    input.allocations[0]!.entryFinancing!.valuationUsd = '25000000.000000';
    expect(() =>
      calculateCapitalPlanningV1({ input, sourceBundle: result.sourceBundle, benchmarkSnapshots })
    ).toThrow(CapitalPlanningCalculationError);
  });
});
