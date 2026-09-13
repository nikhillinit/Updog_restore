import { z } from 'zod';
import Decimal from '../lib/decimal-config';
import {
  CAPITAL_PLANNING_PROVISIONAL_LIMITS as limits,
  CapitalAnnualScheduleRowV1Schema,
  CapitalAssumptionProvenanceV1Schema,
  CapitalBenchmarkSelectionV1Schema,
  CapitalBenchmarkSnapshotV1Schema,
  CapitalBudgetBridgeV1Schema,
  CapitalCheckPolicyV1Schema,
  CapitalDecimalV1Schema,
  CapitalDisclosuresV1Schema,
  CapitalIdV1Schema,
  CapitalIssuesV1Schema,
  CapitalLabelV1Schema,
  CapitalMoneyV1Schema,
  CapitalMonthlyDetailV1Schema,
  CapitalNonnegativeDecimalV1Schema,
  CapitalNonnegativeMoneyV1Schema,
  CapitalOptionalMoneyV1Schema,
  CapitalPlanningMemoV1Schema,
  CapitalReadStateV1Schema,
  CapitalScenarioNameV1Schema,
  type CapitalPlanningMemoV1,
  CapitalPositiveMoneyV1Schema,
  CapitalRatioV1Schema,
  CapitalSourceBundleV1Schema,
  CapitalStressResultV1Schema,
  CapitalVersionV1Schema,
} from './capital-planning-v1.contract';

export const CAPITAL_PLANNING_V2_VERSION = 'capital-planning/2.0.0' as const;
export const CAPITAL_PLANNING_V2_ROUNDING_POLICY =
  'capital-planning-rounding/half-up-money-6-ratio-12/1.0.0' as const;
export const CAPITAL_PLANNING_V2_LIMITS = {
  ...limits,
  workingPrecision: 80,
  maxLiveHistories: 64,
  maxStoppedHistories: 63,
  maxRetainedStates: 127,
} as const;
const D = Decimal.clone({ precision: 80, rounding: Decimal.ROUND_HALF_UP });
function decimal(value: string) {
  return value.length <= limits.maxDecimalCharacters && /^-?(?:0|[1-9]\d*)\.\d+$/.test(value)
    ? new D(value)
    : null;
}
export const CapitalPathV2Schema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z][A-Za-z0-9_]*(?:(?:\[(?:0|[1-9]\d*|"[01]*")\])|(?:\.[A-Za-z0-9_]+))*$/);
export const CapitalAssumptionProvenanceV2Schema = CapitalAssumptionProvenanceV1Schema.innerType()
  .extend({
    inputPath: CapitalPathV2Schema,
    effectiveValue: z.union([
      CapitalAssumptionProvenanceV1Schema.innerType().shape.effectiveValue,
      z.literal(''),
    ]),
  })
  .superRefine((value, ctx) => {
    if ((value.origin === 'benchmark_derived') !== (value.benchmark !== null))
      ctx.addIssue({
        code: 'custom',
        path: ['benchmark'],
        message: 'Benchmark origin requires evidence metadata',
      });
  });
const HistorySchema = z.string().regex(/^[01]{0,6}$/);
const PositiveCountSchema = CapitalNonnegativeDecimalV1Schema.refine(
  (v) => decimal(v)?.gt(0) === true
);
const MonthSchema = z.number().int().min(0).max(limits.maxScheduleMonth);

export const CapitalPrimaryCapitalV2Schema = z.discriminatedUnion('basis', [
  z
    .object({
      basis: z.literal('total_primary_including_fund_check'),
      totalPrimaryAmountUsd: CapitalPositiveMoneyV1Schema,
      primary_only_excludes_secondary: z.literal(true),
    })
    .strict(),
  z
    .object({
      basis: z.literal('external_primary_excluding_fund_check'),
      externalPrimaryAmountUsd: CapitalPositiveMoneyV1Schema,
      primary_only_excludes_secondary: z.literal(true),
    })
    .strict(),
]);
export const CapitalFinancingV2Schema = z
  .object({
    valuationUsd: CapitalPositiveMoneyV1Schema,
    valuationBasis: z.enum(['pre_money', 'post_money']),
    primaryCapital: CapitalPrimaryCapitalV2Schema,
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.valuationBasis !== 'post_money') return;
    if (v.primaryCapital.basis === 'external_primary_excluding_fund_check') {
      ctx.addIssue({
        code: 'custom',
        path: ['valuationBasis'],
        message: 'External primary financing requires explicit pre-money valuation',
      });
    } else if (
      decimal(v.valuationUsd)?.lte(decimal(v.primaryCapital.totalPrimaryAmountUsd) ?? 0) === true
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['valuationUsd'],
        message: 'Post-money valuation must exceed total primary capital',
      });
    }
  });
export const CapitalParticipationPolicyV2Schema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('all_eligible') }).strict(),
  z.object({ type: z.literal('none') }).strict(),
  z
    .object({
      type: z.literal('homogeneous_conditional_probability'),
      probability: CapitalRatioV1Schema,
    })
    .strict(),
  z
    .object({
      type: z.literal('conditional_probability_by_history'),
      probabilitiesByReachableHistory: z
        .record(HistorySchema, CapitalRatioV1Schema)
        .refine((v) => Object.keys(v).length <= 64, 'History map exceeds six-round limit'),
    })
    .strict(),
]);
export const CapitalEligibilityV2Schema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('all') }).strict(),
  z
    .object({
      type: z.literal('by_history'),
      eligibleParticipationHistories: z
        .array(HistorySchema)
        .max(64)
        .refine((v) => new Set(v).size === v.length, 'Duplicate history'),
    })
    .strict(),
]);
export const CapitalFollowOnRoundV2Schema = z
  .object({
    roundId: CapitalIdV1Schema,
    stageId: CapitalIdV1Schema,
    roundLabel: CapitalLabelV1Schema,
    graduationRatio: CapitalRatioV1Schema,
    eligibility: CapitalEligibilityV2Schema,
    participationPolicy: CapitalParticipationPolicyV2Schema,
    checkPolicy: CapitalCheckPolicyV1Schema,
    lagMonthsFromPreviousRound: z.number().int().min(0).max(limits.maxRoundLagMonths),
    timingBasis: z.literal('interval_from_previous_round'),
    poolBasis: z.literal('incremental_pre_money'),
    incrementalPreMoneyPoolDilutionRatio: CapitalRatioV1Schema.refine(
      (v) => decimal(v)?.lt(1) === true
    ),
    financing: CapitalFinancingV2Schema,
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      v.checkPolicy.type === 'fixed_check' &&
      v.financing.primaryCapital.basis === 'total_primary_including_fund_check' &&
      decimal(v.checkPolicy.checkUsd)?.gt(
        decimal(v.financing.primaryCapital.totalPrimaryAmountUsd) ?? 0
      ) === true
    ) {
      ctx.addIssue({ code: 'custom', path: ['checkPolicy'], message: 'CHECK_EXCEEDS_ROUND_SIZE' });
    }
  });
export const CapitalAllocationInputV2Schema = z
  .object({
    allocationId: CapitalIdV1Schema,
    name: CapitalLabelV1Schema,
    entryRound: CapitalLabelV1Schema,
    pipelineProfileId: CapitalIdV1Schema,
    entryStageId: CapitalIdV1Schema,
    initialPoolShareRatio: CapitalRatioV1Schema,
    initialCheckUsd: CapitalPositiveMoneyV1Schema,
    deploymentPeriodYears: z.number().int().min(1).max(limits.maxDeploymentYears),
    plannedCompanyCount: z.number().int().min(0).max(limits.maxPlannedCompanies).optional(),
    scheduleAnchor: z.literal('entry_deployment_month'),
    deploymentCadence: z.literal('uniform_monthly_over_deployment_period'),
    entryFinancing: CapitalFinancingV2Schema,
    followOnRounds: z.array(CapitalFollowOnRoundV2Schema).max(limits.maxFollowOnRounds),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      new Set(v.followOnRounds.map((r) => r.roundId)).size !== v.followOnRounds.length ||
      new Set([v.entryStageId, ...v.followOnRounds.map((r) => r.stageId)]).size !==
        v.followOnRounds.length + 1
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['followOnRounds'],
        message: 'Duplicate round or stage ID',
      });
    }
    if (
      v.entryFinancing.primaryCapital.basis === 'total_primary_including_fund_check' &&
      decimal(v.initialCheckUsd)?.gt(
        decimal(v.entryFinancing.primaryCapital.totalPrimaryAmountUsd) ?? 0
      ) === true
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['initialCheckUsd'],
        message: 'CHECK_EXCEEDS_ROUND_SIZE',
      });
    }
  });
export const CapitalSolveV2Schema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('fixed_fund') }).strict(),
  z
    .object({ mode: z.literal('fixed_portfolio'), totalExpectedCompanyCount: PositiveCountSchema })
    .strict(),
]);
export const CapitalAssumptionEvidenceV2Schema = z.discriminatedUnion('origin', [
  z
    .object({
      inputPath: CapitalPathV2Schema,
      origin: z.literal('manager_assumption'),
      sourceDocument: CapitalLabelV1Schema.optional(),
      sourceDate: z.string().date().optional(),
    })
    .strict(),
  z
    .object({
      inputPath: CapitalPathV2Schema,
      origin: z.literal('market_observation'),
      publisher: CapitalLabelV1Schema,
      publicationDate: z.string().date(),
      observationCutoff: z.string().date(),
      geography: CapitalLabelV1Schema,
      population: CapitalLabelV1Schema,
      statisticType: CapitalLabelV1Schema,
      measurementBasis: CapitalLabelV1Schema,
    })
    .strict(),
]);
const InputObject = z
  .object({
    contractVersion: z.literal(CAPITAL_PLANNING_V2_VERSION),
    roundingPolicy: z.literal(CAPITAL_PLANNING_V2_ROUNDING_POLICY),
    solve: CapitalSolveV2Schema,
    netInvestableCapitalUsd: CapitalNonnegativeMoneyV1Schema.optional(),
    allocations: z.array(CapitalAllocationInputV2Schema).min(1).max(limits.maxAllocations),
    assumptionEvidence: z
      .array(CapitalAssumptionEvidenceV2Schema)
      .max(limits.maxSourceFacts)
      .optional(),
  })
  .strict();
/** Canonical editable leaves; evidence and version metadata are not financial assumptions. */
export function capitalPlanningAssumptionEntriesV2(
  input: z.infer<typeof InputObject>
): Array<[string, string | number | boolean]> {
  const entries: Array<[string, string | number | boolean]> = [];
  const walk = (value: unknown, path: string): void => {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
      entries.push([path, value]);
    else if (Array.isArray(value))
      value.forEach((child, index) => walk(child, `${path}[${index}]`));
    else if (value && typeof value === 'object')
      for (const [key, child] of Object.entries(value))
        walk(child, key === '' ? `${path}[""]` : `${path}.${key}`);
  };
  walk(input.solve, 'solve');
  walk(input.allocations, 'allocations');
  if (input.netInvestableCapitalUsd !== undefined)
    walk(input.netInvestableCapitalUsd, 'netInvestableCapitalUsd');
  return entries;
}
function refineInput(v: z.infer<typeof InputObject>, ctx: z.RefinementCtx) {
  const paths = new Set(capitalPlanningAssumptionEntriesV2(v).map(([path]) => path));
  const seen = new Set<string>();
  for (const [index, evidence] of (v.assumptionEvidence ?? []).entries()) {
    if (!paths.has(evidence.inputPath) || seen.has(evidence.inputPath))
      ctx.addIssue({
        code: 'custom',
        path: ['assumptionEvidence', index, 'inputPath'],
        message: 'Evidence must uniquely identify an existing assumption leaf',
      });
    seen.add(evidence.inputPath);
  }

  if (new Set(v.allocations.map((a) => a.allocationId)).size !== v.allocations.length) {
    ctx.addIssue({ code: 'custom', path: ['allocations'], message: 'Duplicate allocation ID' });
  }
  if (
    !v.allocations
      .reduce((sum, a) => sum.plus(decimal(a.initialPoolShareRatio) ?? 0), new D(0))
      .eq(1)
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['allocations'],
      message: 'Initial dollar weights must sum exactly to one',
    });
  }
}
export const CapitalPlanningInputV2Schema = InputObject.superRefine(refineInput);
export const CapitalPlanningStoredInputV2Schema = InputObject.extend({
  roundingPolicy: CapitalVersionV1Schema,
}).superRefine((v, ctx) =>
  refineInput({ ...v, roundingPolicy: CAPITAL_PLANNING_V2_ROUNDING_POLICY }, ctx)
);
export const CapitalPlanningDraftV2Schema = z
  .object({
    input: CapitalPlanningInputV2Schema,
    benchmarkSelections: z
      .array(CapitalBenchmarkSelectionV1Schema)
      .max(
        0,
        'Corrected planning requires explicit primary financing and separate assumption evidence'
      )
      .optional(),
  })
  .strict();

export const CapitalPathResultV2Schema = z
  .object({
    participationHistory: HistorySchema,
    parentParticipationHistory: HistorySchema,
    roundIndex: z.number().int().min(1).max(6),
    state: z.enum(['live', 'stopped']),
    outcome: z.enum(['participated', 'eligible_zero_election', 'ineligible', 'non_graduation']),
    probability: CapitalRatioV1Schema,
    ownershipRatio: CapitalRatioV1Schema,
    checkUsd: CapitalNonnegativeMoneyV1Schema,
    demandUsd: CapitalNonnegativeMoneyV1Schema,
  })
  .strict()
  .superRefine((v, ctx) => {
    if ((v.state === 'stopped') !== (v.outcome === 'non_graduation')) {
      ctx.addIssue({
        code: 'custom',
        path: ['state'],
        message: 'Only non-graduation stops a retained financing path',
      });
    }
  });
export const CapitalPathSplitV2Schema = z
  .object({
    parentParticipationHistory: HistorySchema,
    parentProbability: CapitalRatioV1Schema,
    pathProbabilityRoundingResidual: CapitalDecimalV1Schema,
  })
  .strict();
export const CapitalRoundResultV2Schema = z
  .object({
    roundId: CapitalIdV1Schema,
    stageId: CapitalIdV1Schema,
    roundLabel: CapitalLabelV1Schema,
    eligibleCompanyCount: CapitalNonnegativeDecimalV1Schema,
    participatingCompanyCount: CapitalNonnegativeDecimalV1Schema,
    demandUsd: CapitalNonnegativeMoneyV1Schema,
    pathDemandRoundingResidualUsd: CapitalMoneyV1Schema,
    cumulativeLagMonths: MonthSchema,
    paths: z.array(CapitalPathResultV2Schema).max(127),
    splits: z.array(CapitalPathSplitV2Schema).max(64),
  })
  .strict();
export const CapitalAllocationResultV2Schema = z
  .object({
    allocationId: CapitalIdV1Schema,
    name: CapitalLabelV1Schema,
    initialPoolShareRatio: CapitalRatioV1Schema,
    initialCheckUsd: CapitalPositiveMoneyV1Schema,
    expectedCompanyCount: CapitalNonnegativeDecimalV1Schema,
    entered: z
      .object({
        companyCount: CapitalNonnegativeDecimalV1Schema,
        initialDemandUsd: CapitalNonnegativeMoneyV1Schema,
        reserveUsd: CapitalNonnegativeMoneyV1Schema,
        totalDemandUsd: CapitalNonnegativeMoneyV1Schema,
        signedBudgetResidualUsd: CapitalMoneyV1Schema,
      })
      .strict()
      .optional(),
    initialDemandUsd: CapitalNonnegativeMoneyV1Schema,
    reserveUsd: CapitalNonnegativeMoneyV1Schema,
    initialScheduleRoundingResidualUsd: CapitalMoneyV1Schema,
    followOnScheduleRoundingResidualUsd: CapitalMoneyV1Schema,
    rounds: z.array(CapitalRoundResultV2Schema).max(limits.maxFollowOnRounds),
  })
  .strict();
export const CapitalSolutionV2Schema = z
  .object({
    mode: z.enum(['fixed_fund', 'fixed_portfolio']),
    countBasis: z.literal('expected'),
    initialPoolUsd: CapitalNonnegativeMoneyV1Schema,
    totalExpectedCompanyCount: CapitalNonnegativeDecimalV1Schema,
    totalReserveUsd: CapitalNonnegativeMoneyV1Schema,
    requiredConstructionCapitalUsd: CapitalNonnegativeMoneyV1Schema,
    requiredCommittedCapitalUsd: CapitalOptionalMoneyV1Schema,
    sourceCapacityGapUsd: CapitalMoneyV1Schema,
    feasible: z.boolean(),
    expectedCountRoundingResidual: CapitalDecimalV1Schema,
    initialAllocationRoundingResidualUsd: CapitalMoneyV1Schema,
    capitalRoundingResidualUsd: CapitalMoneyV1Schema,
  })
  .strict();
export const CapitalConstructionResultV2Schema = z
  .object({
    methodVersion: z.literal(CAPITAL_PLANNING_V2_VERSION),
    roundingPolicy: z.literal(CAPITAL_PLANNING_V2_ROUNDING_POLICY),
    budgetBridge: CapitalBudgetBridgeV1Schema,
    solution: CapitalSolutionV2Schema,
    allocations: z.array(CapitalAllocationResultV2Schema).min(1).max(limits.maxAllocations),
    monthlyDetail: z.array(CapitalMonthlyDetailV1Schema).max(limits.maxExpandedRows),
    annualSchedule: z.array(CapitalAnnualScheduleRowV1Schema).max(140),
    stresses: z.array(CapitalStressResultV1Schema).min(4).max(8),
    disclosures: CapitalDisclosuresV1Schema,
    assumptions: z
      .object({
        countBasis: z.literal('expected'),
        historyAwareParticipation: z.literal(true),
        timingBasis: z.literal('interval_from_previous_round'),
        poolBasis: z.literal('incremental_pre_money'),
        deploymentCadence: z.literal('uniform_monthly_over_deployment_period'),
      })
      .strict(),
  })
  .strict();
export const CapitalPlanningResultV2Schema = z
  .object({
    contractVersion: z.literal(CAPITAL_PLANNING_V2_VERSION),
    roundingPolicy: z.literal(CAPITAL_PLANNING_V2_ROUNDING_POLICY),
    input: CapitalPlanningInputV2Schema,
    sourceBundle: CapitalSourceBundleV1Schema,
    provenance: z.array(CapitalAssumptionProvenanceV2Schema).max(limits.maxSourceFacts),
    benchmarkSnapshots: z
      .array(CapitalBenchmarkSnapshotV1Schema)
      .max(limits.maxAllocations * 7)
      .optional(),
    construction: CapitalConstructionResultV2Schema,
  })
  .strict();
export const CapitalPlanningStoredResultV2Schema = CapitalPlanningResultV2Schema.extend({
  roundingPolicy: CapitalVersionV1Schema,
  input: CapitalPlanningStoredInputV2Schema,
  construction: CapitalConstructionResultV2Schema.extend({
    roundingPolicy: CapitalVersionV1Schema,
  }),
}).superRefine((value, ctx) => {
  if (
    value.roundingPolicy !== value.input.roundingPolicy ||
    value.roundingPolicy !== value.construction.roundingPolicy
  )
    ctx.addIssue({
      code: 'custom',
      path: ['roundingPolicy'],
      message: 'Saved rounding policy identities disagree',
    });
});
export const CapitalPlanningRefusalV2Schema = z
  .object({
    state: z.literal('refused'),
    methodVersion: z.literal(CAPITAL_PLANNING_V2_VERSION),
    issues: CapitalIssuesV1Schema.nonempty(),
  })
  .strict();
export type CapitalPlanningInputV2 = z.infer<typeof CapitalPlanningInputV2Schema>;
export type CapitalPlanningStoredInputV2 = z.infer<typeof CapitalPlanningStoredInputV2Schema>;
export type CapitalPlanningDraftV2 = z.infer<typeof CapitalPlanningDraftV2Schema>;
export type CapitalPlanningResultV2 = z.infer<typeof CapitalPlanningResultV2Schema>;
export type CapitalConstructionResultV2 = z.infer<typeof CapitalConstructionResultV2Schema>;
export type CapitalAllocationInputV2 = z.infer<typeof CapitalAllocationInputV2Schema>;
export type CapitalFollowOnRoundV2 = z.infer<typeof CapitalFollowOnRoundV2Schema>;
export type CapitalFinancingV2 = z.infer<typeof CapitalFinancingV2Schema>;
export type CapitalPathResultV2 = z.infer<typeof CapitalPathResultV2Schema>;
export type CapitalRoundResultV2 = z.infer<typeof CapitalRoundResultV2Schema>;
export type CapitalAllocationResultV2 = z.infer<typeof CapitalAllocationResultV2Schema>;

export const CapitalPlanningMemoV2Schema = z
  .object({
    contractVersion: z.literal('capital-planning-memo/2.0.0'),
    fundId: z.number().int().positive(),
    scenarioSetId: z.string().uuid(),
    variantId: z.string().uuid(),
    scenarioSetName: CapitalScenarioNameV1Schema,
    variantName: CapitalScenarioNameV1Schema,
    result: CapitalPlanningStoredResultV2Schema,
    readState: CapitalReadStateV1Schema,
    countBasis: z.literal('expected'),
    limitations: z.array(z.string().min(1).max(2000)).min(1).max(20),
    detailScope: z.enum(['complete', 'labeled_summary']),
  })
  .strict();
export type CapitalPlanningMemoV2 = z.infer<typeof CapitalPlanningMemoV2Schema>;
export type CapitalPlanningMemo = CapitalPlanningMemoV1 | CapitalPlanningMemoV2;
export const CapitalPlanningMemoSchema = z.union([
  CapitalPlanningMemoV1Schema,
  CapitalPlanningMemoV2Schema,
]);
