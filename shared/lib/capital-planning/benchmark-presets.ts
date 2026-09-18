import { z } from 'zod';
import {
  CAPITAL_PLANNING_PROVISIONAL_LIMITS as limits,
  CAPITAL_SOURCE_INTERPRETATION_VERSION,
  CapitalAssumptionProvenanceV1Schema,
  CapitalBenchmarkSelectionV1Schema,
  CapitalBenchmarkSnapshotV1Schema,
  CapitalFinancingV1Schema,
  CapitalPlanningDraftV1Schema,
  CapitalPlanningInputV1Schema,
  CapitalSourceBundleV1Schema,
  type CapitalAssumptionProvenanceV1,
  type CapitalBenchmarkSelectionV1,
  type CapitalBenchmarkSnapshotV1,
  type CapitalMoneySourceFactV1,
  type CapitalPlanningDraftV1,
  type CapitalPlanningInputV1,
  type CapitalSourceBundleV1,
} from '../../contracts/capital-planning-v1.contract';
import { Decimal } from '../decimal-config';
import {
  assertCalculationSize,
  money,
  parseCalculation,
  refuseCalculation,
} from './calculation-support';

export const CAPITAL_BENCHMARK_CATALOG_VERSION = 'carta-us-software-2026-07-10/1.0.0';

// This admission binds the static values to the retained publisher-page/chart
// inspection. It neither fetches sources nor changes existing saved snapshots.
export const CAPITAL_BENCHMARK_CATALOG_ADMISSION = Object.freeze({
  version: CAPITAL_BENCHMARK_CATALOG_VERSION,
  sourceRevalidationReceiptSha256:
    '73f4866dbbfb75bb94ca0d67fcca42413c329e5223b07af932ba07b891d6e216',
  chartSha256: 'fefcb677fdcc96c70cb8bbbceb7e98269a7dc89a5dd1160afdf4a42f4c7de402',
});

type Selector = CapitalBenchmarkSelectionV1['selector'];
type Preset = Pick<
  CapitalBenchmarkSnapshotV1,
  'baselineFinancing' | 'metadata' | 'observedMetrics'
>;
const medians: Record<Selector['stage'], readonly [string, string, string]> = {
  seed: ['Seed', '24.3', '4.1'],
  series_a: ['Series A', '80.0', '14.4'],
  series_b: ['Series B', '190.9', '25.0'],
  series_c: ['Series C', '390.9', '39.5'],
  series_d: ['Series D', '789.4', '63.2'],
};

/** A fresh copy supports explicit user adoption through selection.overrides. */
export function getCapitalBenchmarkPresetV1(selector: Selector): Preset {
  const selected = parseCalculation(
    CapitalBenchmarkSelectionV1Schema.shape.selector,
    selector,
    'selector'
  );
  if (selected.version !== CAPITAL_BENCHMARK_CATALOG_VERSION)
    refuseCalculation(
      'INVALID_INPUT',
      'selector.version',
      'Benchmark catalog version is unsupported',
      'unsupported'
    );
  const [stage, valuation, round] = medians[selected.stage];
  return {
    baselineFinancing: {
      valuationUsd: money(new Decimal(valuation).times(1_000_000)),
      valuationBasis: 'post_money',
      totalPrimaryRoundUsd: money(new Decimal(round).times(1_000_000)),
    },
    metadata: {
      version: selected.version,
      sourceUrl: 'https://carta.com/data/linkedin-vc-fundraising-benchmarks-2026/',
      sourceTitle: 'VC Startup Fundraising Benchmarks From 1000 Rounds',
      observationStart: null,
      observationEnd: '2026-07-10',
      observationWindow: 'last 6 months',
      population: '1,133 US software startup rounds',
      geography: 'US',
      sector: 'software startups',
      stage,
      statistic: 'median',
      valuationBasis: 'post_money',
      sourceUnit: 'usd_millions',
      sampleSize: 1133,
      populationMismatch:
        'Applicability to this scenario is unverified. Separately calculated medians form a synthetic financing. Cash Raised is treated as total primary round capital; the source does not establish primary-only or priced-only financing.',
    },
    observedMetrics: { valuationUsd: 'Post-Money Val', totalPrimaryRoundUsd: 'Cash Raised' },
  };
}

const targetKey = (target: CapitalBenchmarkSelectionV1['target']): string =>
  JSON.stringify(
    target.kind === 'entry'
      ? [target.kind, target.allocationId]
      : [target.kind, target.allocationId, target.roundId]
  );

function sourceMoney(fact: CapitalMoneySourceFactV1 | null): string | null {
  if (fact === null) return null;
  let value: Decimal;
  try {
    value = new Decimal(fact.rawValue).times(fact.sourceUnit === 'usd_millions' ? 1_000_000 : 1);
  } catch {
    refuseCalculation(
      'SOURCE_BUNDLE_INCONSISTENT',
      fact.path,
      'Pinned source financing is not numeric'
    );
  }
  if (!value.isFinite() || value.lte(0))
    refuseCalculation(
      'INVALID_INPUT',
      fact.path,
      'Supplied source financing must be positive; a preset cannot repair it'
    );
  if (money(value) !== fact.normalizedValue)
    refuseCalculation(
      'SOURCE_BUNDLE_INCONSISTENT',
      fact.path,
      'Pinned source financing and normalized value disagree'
    );
  return fact.normalizedValue;
}

export function resolveCapitalPlanningDraftV1(args: {
  draft: CapitalPlanningDraftV1;
  sourceBundle: CapitalSourceBundleV1;
  /** Trusted saved copies only. Presence selects replay without a catalog lookup. */
  benchmarkSnapshots?: readonly CapitalBenchmarkSnapshotV1[];
}): {
  input: CapitalPlanningInputV1;
  benchmarkSnapshots: CapitalBenchmarkSnapshotV1[];
  financingProvenance: CapitalAssumptionProvenanceV1[];
} {
  assertCalculationSize(args, limits.maxSnapshotBytes, 'resolution');
  assertCalculationSize(args.draft, limits.maxInputBytes, 'draft');
  const source = parseCalculation(CapitalSourceBundleV1Schema, args.sourceBundle, 'sourceBundle');
  if (source.interpretationVersion !== CAPITAL_SOURCE_INTERPRETATION_VERSION)
    refuseCalculation(
      'INTERPRETATION_VERSION_UNSUPPORTED',
      'sourceBundle.interpretationVersion',
      'Pinned interpretation version is unsupported',
      'unsupported'
    );
  const draft = parseCalculation(CapitalPlanningDraftV1Schema, args.draft, 'draft');
  const selections = draft.benchmarkSelections ?? [];
  const saved =
    args.benchmarkSnapshots === undefined
      ? undefined
      : parseCalculation(
          z
            .array(CapitalBenchmarkSnapshotV1Schema)
            .max(limits.maxAllocations * (limits.maxFollowOnRounds + 1)),
          args.benchmarkSnapshots,
          'benchmarkSnapshots'
        );
  const savedByTarget = new Map(saved?.map((snapshot) => [targetKey(snapshot.target), snapshot]));
  if (saved && (saved.length !== selections.length || savedByTarget.size !== saved.length))
    refuseCalculation(
      'INVALID_INPUT',
      'benchmarkSnapshots',
      'Saved benchmark targets must match selections exactly'
    );
  const snapshots: CapitalBenchmarkSnapshotV1[] = [];
  const records: CapitalAssumptionProvenanceV1[] = [];
  for (const [selectionIndex, selection] of selections.entries()) {
    let snapshot: CapitalBenchmarkSnapshotV1;
    if (saved !== undefined) {
      const copied = savedByTarget.get(targetKey(selection.target));
      if (
        !copied ||
        Object.prototype.hasOwnProperty.call(copied, 'overrides') !==
          Object.prototype.hasOwnProperty.call(selection, 'overrides') ||
        JSON.stringify({
          target: copied.target,
          selector: copied.selector,
          ...(Object.prototype.hasOwnProperty.call(copied, 'overrides')
            ? { overrides: copied.overrides }
            : {}),
        }) !== JSON.stringify(selection)
      )
        refuseCalculation(
          'INVALID_INPUT',
          `benchmarkSnapshots[${selectionIndex}]`,
          'Saved benchmark target, version and explicit intent must match'
        );
      snapshot = copied;
    } else {
      snapshot = parseCalculation(
        CapitalBenchmarkSnapshotV1Schema,
        { ...selection, ...getCapitalBenchmarkPresetV1(selection.selector) },
        `benchmarkSnapshots[${selectionIndex}]`
      );
    }
    snapshots.push(snapshot);
    const ai = draft.input.allocations.findIndex(
      (allocation) => allocation.allocationId === selection.target.allocationId
    );
    const allocation = draft.input.allocations[ai]!;
    const sourceAllocation = source.construction.capitalPlanAllocations.find(
      (item) => item.id === allocation.allocationId
    );
    if (!sourceAllocation)
      refuseCalculation(
        'ALLOCATION_LINK_UNRESOLVED',
        `input.allocations[${ai}].allocationId`,
        'Allocation is absent from the pinned source bundle',
        'incomplete'
      );
    const profile = source.construction.pipelineProfiles.find(
      (item) => item.id === allocation.pipelineProfileId
    );
    if (!profile)
      refuseCalculation(
        'PROFILE_LINK_UNRESOLVED',
        `input.allocations[${ai}].pipelineProfileId`,
        'Selected pipeline profile is absent from the pinned source bundle',
        'incomplete'
      );
    const target = selection.target;
    const ri =
      target.kind === 'follow_on'
        ? allocation.followOnRounds.findIndex((round) => round.roundId === target.roundId)
        : -1;
    const stageId =
      target.kind === 'entry' ? allocation.entryStageId : allocation.followOnRounds[ri]!.stageId;
    const stage = profile.stages.find((item) => item.id === stageId);
    if (!stage)
      refuseCalculation(
        'STAGE_LINK_UNRESOLVED',
        `input.allocations[${ai}]`,
        'Selected financing stage is absent from the pinned profile',
        'incomplete'
      );
    // Validate supplied facts even when an override wins. Missing is only null,
    // never zero, malformed, unit-unresolved, or an ambiguous source link.
    const valuation = sourceMoney(stage.valuation);
    const round = sourceMoney(stage.roundSize);
    const basis = stage.valuationType === 'pre' ? 'pre_money' : 'post_money';
    if (valuation !== null && round !== null)
      parseCalculation(
        CapitalFinancingV1Schema,
        { valuationUsd: valuation, valuationBasis: basis, totalPrimaryRoundUsd: round },
        `sourceBundle.construction.pipelineProfiles.${profile.id}.${stage.id}`
      );
    const valuationOverride = selection.overrides?.valuation;
    const roundOverride = selection.overrides?.totalPrimaryRoundUsd;
    const valuationOrigin =
      valuationOverride !== undefined
        ? 'user_override'
        : valuation !== null
          ? 'source_derived'
          : 'benchmark_derived';
    const roundOrigin =
      roundOverride !== undefined
        ? 'user_override'
        : round !== null
          ? 'source_derived'
          : 'benchmark_derived';
    const financing = parseCalculation(
      CapitalFinancingV1Schema,
      {
        valuationUsd:
          valuationOverride?.valuationUsd ?? valuation ?? snapshot.baselineFinancing.valuationUsd,
        valuationBasis:
          valuationOverride?.valuationBasis ??
          (valuation !== null ? basis : snapshot.baselineFinancing.valuationBasis),
        totalPrimaryRoundUsd:
          roundOverride ?? round ?? snapshot.baselineFinancing.totalPrimaryRoundUsd,
      },
      `input.allocations[${ai}].${target.kind === 'entry' ? 'entryFinancing' : `followOnRounds[${ri}].financing`}`
    );
    const prefix = `allocations[${ai}].${target.kind === 'entry' ? 'entryFinancing' : `followOnRounds[${ri}].financing`}`;
    if (target.kind === 'entry') allocation.entryFinancing = financing;
    else allocation.followOnRounds[ri]!.financing = financing;
    const add = (
      field: keyof typeof financing,
      origin: CapitalAssumptionProvenanceV1['origin'],
      sourcePath: string | null,
      sourceValue: CapitalAssumptionProvenanceV1['sourceValue']
    ) => {
      records.push(
        parseCalculation(
          CapitalAssumptionProvenanceV1Schema,
          {
            inputPath: `${prefix}.${field}`,
            origin,
            sourcePath,
            sourceValue,
            effectiveValue: financing[field],
            profileId: profile.id,
            stageId: stage.id,
            effectiveDate: source.modelInputsAsOfDate,
            sourceVintage: String(source.vintageYear),
            note:
              origin === 'benchmark_derived'
                ? 'Conditional preset fallback; separate medians form a synthetic financing and Cash Raised is interpreted as total primary round capital.'
                : origin === 'user_override'
                  ? 'Explicit scenario override; selected benchmark baseline is retained separately.'
                  : 'Supported source financing; selected benchmark baseline is retained separately.',
            benchmark: origin === 'benchmark_derived' ? snapshot.metadata : null,
          },
          `provenance.${prefix}.${field}`
        )
      );
    };
    add('valuationUsd', valuationOrigin, stage.valuation?.path ?? null, valuation);
    add('totalPrimaryRoundUsd', roundOrigin, stage.roundSize?.path ?? null, round);
    add(
      'valuationBasis',
      valuationOrigin,
      stage.valuation === null
        ? null
        : stage.graduationRate.path.replace(/graduationRate$/, 'valuationType'),
      valuation === null ? null : basis
    );
  }
  return {
    input: parseCalculation(CapitalPlanningInputV1Schema, draft.input, 'input'),
    benchmarkSnapshots: snapshots,
    financingProvenance: records,
  };
}

/** Replace only selected financing records; preserve all other provenance. */
export function applyCapitalBenchmarkProvenanceV1(
  existing: readonly CapitalAssumptionProvenanceV1[],
  financingProvenance: readonly CapitalAssumptionProvenanceV1[]
): CapitalAssumptionProvenanceV1[] {
  const selected = new Map(financingProvenance.map((record) => [record.inputPath, record]));
  const result = existing.map((record) => {
    const replacement = selected.get(record.inputPath);
    selected.delete(record.inputPath);
    return replacement ?? record;
  });
  return [...result, ...selected.values()];
}
