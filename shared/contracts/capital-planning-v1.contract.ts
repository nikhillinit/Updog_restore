import { z } from 'zod';
import { Decimal } from '../lib/decimal-config';
import { MoneyDecimalStringSchema, RatioDecimalStringSchema } from '../lib/decimal-string';

export const CAPITAL_PLANNING_VERSION = 'capital-planning/1.0.0' as const;
export const CAPITAL_SOURCE_INTERPRETATION_VERSION = 'capital-source-interpretation/1.0.1' as const;
export const CAPITAL_GP_METHOD_VERSION = 'capital-gp-deemed/1.0.0' as const;
export const CAPITAL_FEE_METHOD_VERSION = 'capital-fee-expense/1.0.0' as const;
export const CAPITAL_PREIMAGE_VERSION = 'capital-preimage/1.0.0' as const;
export const AGGREGATE_PREFERENCE_FORECAST_VERSION = 'aggregate-preference-forecast/1.0.0' as const;

// Engineering candidates, NOT measured supported capacity. Measure the full five-variant
// operation, including every injected bundle and serialized row, before durable release.
export const CAPITAL_PLANNING_PROVISIONAL_LIMITS = {
  status: 'NOT_MEASURED',
  maxVariants: 5,
  maxAllocations: 10,
  maxFollowOnRounds: 6,
  maxProfiles: 10,
  maxStages: 12,
  maxFeeExpensePieces: 120,
  maxFundYears: 30,
  maxDeploymentYears: 10,
  maxRoundLagMonths: 120,
  maxScheduleMonth: 839,
  maxPlannedCompanies: 10000,
  maxSourceFacts: 4096,
  maxDeclarations: 2048,
  maxDecimalCharacters: 24,
  maxInputBytes: 2097152,
  maxExpandedRows: 60000,
  maxSnapshotBytes: 16777216,
  moneyDecimalPlaces: 6,
  ratioDecimalPlaces: 12,
  workingPrecision: 28,
} as const;

export const CAPITAL_PLANNING_DISCLOSURES = {
  timing:
    'This schedule assumes capital can be called as needed. It does not model current cash availability or capital-call execution.',
  budget:
    'Available construction capital excludes recycling and exit proceeds; fee offsets are not modeled. Feasibility is evaluated under these assumptions.',
  preference:
    'Aggregate preference forecast based on entered ownership and summarized preference terms. It does not reproduce a security-level cap table or legal distribution waterfall.',
  gp: 'Available construction capital deducts the GP deemed contribution under ADR-070. An omitted funded-from-fees fraction is treated as zero for this calculation without changing the saved source. The fraction does not reduce the management-fee basis or fee amount.',
} as const;

export const CapitalDisclosuresV1Schema = z
  .object({
    timing: z.literal(CAPITAL_PLANNING_DISCLOSURES.timing),
    budget: z.literal(CAPITAL_PLANNING_DISCLOSURES.budget),
    gp: z.literal(CAPITAL_PLANNING_DISCLOSURES.gp),
  })
  .strict();

const limits = CAPITAL_PLANNING_PROVISIONAL_LIMITS;
export const CapitalIdV1Schema = z.string().trim().min(1).max(120);
export const CapitalScenarioNameV1Schema = CapitalIdV1Schema;
export const CapitalLabelV1Schema = z.string().trim().min(1).max(240);
export const CapitalHashV1Schema = z.string().regex(/^[a-f0-9]{64}$/);
export const CapitalVersionV1Schema = z.string().min(1).max(120);
export const CapitalPathV1Schema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z][A-Za-z0-9]*(?:(?:\[(?:0|[1-9]\d*)\])|(?:\.[A-Za-z][A-Za-z0-9]*))*$/);
export const CapitalMoneyV1Schema = MoneyDecimalStringSchema.max(
  limits.maxDecimalCharacters
).refine((value) => value !== '-0.000000', 'Negative zero is not canonical');
export const CapitalNonnegativeMoneyV1Schema = CapitalMoneyV1Schema.refine(
  (value) => !value.startsWith('-'),
  'Expected nonnegative money'
);
export const CapitalPositiveMoneyV1Schema = CapitalNonnegativeMoneyV1Schema.refine(
  (value) => value !== '0.000000',
  'Expected positive money'
);
export const CapitalDecimalV1Schema = RatioDecimalStringSchema.max(
  limits.maxDecimalCharacters
).refine((value) => value !== '-0.000000000000', 'Negative zero is not canonical');
export const CapitalNonnegativeDecimalV1Schema = CapitalDecimalV1Schema.refine(
  (value) => !value.startsWith('-'),
  'Expected nonnegative decimal'
);
function decimalOrNull(value: string): Decimal | null {
  return value.length <= limits.maxDecimalCharacters && /^-?(?:0|[1-9]\d*)\.\d+$/.test(value)
    ? new Decimal(value)
    : null;
}

export const CapitalRatioV1Schema = CapitalNonnegativeDecimalV1Schema.refine(
  (value) => decimalOrNull(value)?.lte(1) === true,
  'Expected a ratio in [0, 1]'
);
const PoolDilutionSchema = CapitalRatioV1Schema.refine(
  (value) => decimalOrNull(value)?.lt(1) === true,
  'Incremental pool dilution must be less than one'
);
const YearSchema = z.number().int().min(1).max(limits.maxFundYears);
const MonthSchema = z.number().int().min(0).max(limits.maxScheduleMonth);
const NoteSchema = z.string().trim().min(1).max(2000);
const RawNumericSchema = z.union([z.number().finite(), z.string().min(1).max(64)]);

export const CapitalRefusalCodeV1Schema = z.enum([
  'INVALID_INPUT',
  'INPUT_TOO_LARGE',
  'UNIT_PROVENANCE_UNRESOLVED',
  'TIME_ORIGIN_UNRESOLVED',
  'FUND_CURRENCY_UNSUPPORTED',
  'FUND_CURRENCY_UNRESOLVED',
  'FUND_SIZE_SOURCE_MISMATCH',
  'FUND_VEHICLE_MODE_UNSUPPORTED',
  'FUND_VEHICLE_MODE_UNRESOLVED',
  'FUND_TERM_UNRESOLVED',
  'INVESTMENT_PERIOD_UNRESOLVED',
  'VINTAGE_YEAR_UNRESOLVED',
  'GP_COMMITMENT_UNRESOLVED',
  'GP_COMMITMENT_INVALID',
  'GP_COMMITMENT_EXCEEDS_COMMITMENTS',
  'FUNDED_FROM_FEES_FRACTION_INVALID',
  'FEE_MODEL_UNRESOLVED',
  'FEE_TIER_SCHEDULE_REQUIRED',
  'FEE_RATE_INVALID',
  'FEE_BASIS_UNSUPPORTED',
  'FEE_PROFILE_APPLICABILITY_UNSUPPORTED',
  'FEE_PERIOD_NOT_REPRESENTABLE',
  'EXPENSE_MODEL_UNRESOLVED',
  'EXPENSE_AMOUNT_INVALID',
  'EXPENSE_GROWTH_UNSUPPORTED',
  'EXPENSE_CAP_UNSUPPORTED',
  'ALLOCATION_LINK_UNRESOLVED',
  'PROFILE_LINK_UNRESOLVED',
  'STAGE_LINK_UNRESOLVED',
  'POLICY_UNSUPPORTED',
  'OWNERSHIP_INPUT_UNRESOLVED',
  'POOL_DILUTION_UNRESOLVED',
  'VALUATION_INVALID',
  'CHECK_EXCEEDS_ROUND_SIZE',
  'INSTRUMENT_MAPPING_UNSUPPORTED',
  'COMPANION_INPUT_REQUIRED',
  'HISTORICAL_SOURCE_INTEGRITY_FAILED',
  'SOURCE_BUNDLE_INCONSISTENT',
  'INTERPRETATION_VERSION_UNSUPPORTED',
]);
export const CapitalFeeBasisRefusalReasonV1Schema = z.enum([
  'CALL_SCHEDULE_NOT_MODELED',
  'INVESTED_BASIS_ADAPTER_NOT_IMPLEMENTED',
  'VALUATION_PATH_NOT_MODELED',
  'UNREALIZED_COST_SCHEDULE_NOT_MODELED',
]);
export const CapitalIssueV1Schema = z
  .object({
    code: CapitalRefusalCodeV1Schema,
    path: CapitalPathV1Schema,
    message: NoteSchema,
    support: z.enum(['incomplete', 'unsupported', 'invalid']),
    feeBasis: z
      .enum([
        'called_capital_period',
        'called_capital_cumulative',
        'called_capital_net_of_returns',
        'invested_capital',
        'fair_market_value',
        'unrealized_cost',
        'gross_cumulative_called',
        'net_cumulative_called',
        'cumulative_invested',
        'unrealized_investments',
      ])
      .optional(),
    reason: CapitalFeeBasisRefusalReasonV1Schema.optional(),
    limit: z.number().int().nonnegative().safe().optional(),
    observed: z.number().int().nonnegative().safe().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.code === 'INPUT_TOO_LARGE'
        ? value.limit === undefined || value.observed === undefined
        : value.limit !== undefined || value.observed !== undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['limit'],
        message: 'Size refusals require limit and observed; other refusals omit them',
      });
    }
    if (
      value.code === 'FEE_BASIS_UNSUPPORTED'
        ? value.feeBasis === undefined || value.reason === undefined
        : value.feeBasis !== undefined || value.reason !== undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason'],
        message: 'Fee-basis refusals require the selected basis and capability reason',
      });
    }
  });
export const CapitalIssuesV1Schema = z.array(CapitalIssueV1Schema).max(limits.maxSourceFacts);
export const CapitalUnavailableReasonV1Schema = z.enum([
  'NO_CONSTRUCTION_CAPITAL',
  'ZERO_CONSTRUCTION_CAPITAL',
  'ZERO_ALLOCATION_BUDGET',
  'ZERO_ALLOCATED_INVESTMENT_CAPITAL',
  'ZERO_COST',
  'ZERO_OWNERSHIP',
  'ZERO_BASELINE',
  'NOT_ENTERED',
  'NOT_MODELED',
  'NOT_APPLICABLE',
  'UNCAPPED',
  'NOT_PARTICIPATING',
  'FMV_UNAVAILABLE',
  'OWNERSHIP_UNAVAILABLE',
  'COMPANION_OMITTED',
]);
export const CapitalOptionalMoneyV1Schema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('available'), value: CapitalMoneyV1Schema }).strict(),
  z
    .object({
      state: z.literal('unavailable'),
      value: z.null(),
      reason: CapitalUnavailableReasonV1Schema,
    })
    .strict(),
]);
export const CapitalOptionalDecimalV1Schema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('available'), value: CapitalDecimalV1Schema }).strict(),
  z
    .object({
      state: z.literal('unavailable'),
      value: z.null(),
      reason: CapitalUnavailableReasonV1Schema,
    })
    .strict(),
]);

export const CapitalMoneyUnitV1Schema = z.enum(['usd', 'usd_millions']);
export const CapitalRateUnitV1Schema = z.enum(['ratio', 'percent_points']);
export const CapitalMonthOriginV1Schema = z.enum(['fund_month_zero_based', 'fund_month_one_based']);
export const CapitalSourceUnitV1Schema = z.enum([
  'usd',
  'usd_millions',
  'ratio',
  'percent_points',
  'fund_month_zero_based',
  'fund_month_one_based',
]);

const moneyPath =
  /^(?:funds\.size|fundSize|gpCommitment|economicsAssumptions\.gpCommitmentModel\.commitmentAmount|capitalPlanAllocations\[(?:0|[1-9]\d*)\]\.(?:initialCheckAmount|followOnAmount)|pipelineProfiles\[(?:0|[1-9]\d*)\]\.stages\[(?:0|[1-9]\d*)\]\.(?:roundSize|valuation|exitValuation)|fundExpenses\[(?:0|[1-9]\d*)\]\.monthlyAmount|economicsAssumptions\.expenseModel\.annualExpenses\[(?:0|[1-9]\d*)\]\.amount)$/;
const ratePath =
  /^(?:capitalPlanAllocations\[(?:0|[1-9]\d*)\]\.(?:capitalAllocationPct|initialOwnershipPct|followOnParticipationPct)|pipelineProfiles\[(?:0|[1-9]\d*)\]\.stages\[(?:0|[1-9]\d*)\]\.(?:esopPct|graduationRate)|feeProfiles\[(?:0|[1-9]\d*)\]\.feeTiers\[(?:0|[1-9]\d*)\]\.percentage)$/;
const contractRatioPath =
  /^(?:fundedFromFeesPct|economicsAssumptions\.gpCommitmentModel\.commitmentPct|economicsAssumptions\.feeModel\.tiers\[(?:0|[1-9]\d*)\]\.rate)$/;
const contractPercentPath =
  /^(?:allocations\[(?:0|[1-9]\d*)\]\.percentage|sectorProfiles\[(?:0|[1-9]\d*)\]\.targetPercentage)$/;
const monthPath =
  /^(?:feeProfiles\[(?:0|[1-9]\d*)\]\.feeTiers\[(?:0|[1-9]\d*)\]|fundExpenses\[(?:0|[1-9]\d*)\])\.(?:startMonth|endMonth)$/;

export const CapitalUnitDeclarationsV1Schema = z
  .record(CapitalPathV1Schema, CapitalSourceUnitV1Schema)
  .superRefine((declarations, ctx) => {
    if (Object.keys(declarations).length > limits.maxDeclarations) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'INPUT_TOO_LARGE: too many unit declarations',
      });
    }
    for (const [path, unit] of Object.entries(declarations)) {
      const accepted = moneyPath.test(path)
        ? CapitalMoneyUnitV1Schema.safeParse(unit).success
        : ratePath.test(path)
          ? CapitalRateUnitV1Schema.safeParse(unit).success
          : monthPath.test(path) && CapitalMonthOriginV1Schema.safeParse(unit).success;
      if (!accepted)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [path],
          message:
            'Unit declaration must match an exact consumed money, rate, or month-boundary path',
        });
      if (monthPath.test(path) && path.endsWith('.endMonth')) {
        const start = declarations[path.replace(/\.endMonth$/, '.startMonth')];
        if (start !== undefined && start !== unit)
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [path],
            message: 'TIME_ORIGIN_UNRESOLVED: window boundaries must share a month origin',
          });
      }
    }
  });

// Flatten only selected raw scalar facts. Full untouched JSONB is bound by rawConfigHash;
// no arbitrary JSON, current interpreter metadata, or declarations enter this projection.
const RawSourcePathSchema = CapitalPathV1Schema.refine(
  (path) =>
    /^(?:fundSize|vintageYear|modelInputsAsOfDate|isEvergreen|fundLife|investmentPeriod|gpCommitment|fundedFromFeesPct|managementFeeRate)$/.test(
      path
    ) ||
    /^economicsAssumptions\.(?:timeline(?:\.(?:fundLifeYears|period|vintageYear))?|gpCommitmentModel(?:\.(?:commitmentAmount|commitmentPct))?|feeModel(?:\.(?:source|defaultRate|defaultBasis|tiers(?:\[\d+\](?:\.(?:id|name|rate|basis|startYear|endYear|recyclingEligiblePct))?)?))?|expenseModel(?:\.(?:source|orgExpenseCap|orgExpenseCapType|annualExpenses(?:\[\d+\](?:\.(?:id|category|amount|startYear|endYear|growthRate))?)?))?)$/.test(
      path
    ) ||
    /^(?:allocations(?:\[\d+\](?:\.(?:id|category|percentage|description))?)?|capitalPlanAllocations(?:\[\d+\](?:\.(?:id|name|sectorProfileId|entryRound|capitalAllocationPct|initialCheckStrategy|initialCheckAmount|initialOwnershipPct|followOnStrategy|followOnAmount|followOnParticipationPct|investmentHorizonMonths))?)?|sectorProfiles(?:\[\d+\](?:\.(?:id|name|targetPercentage|description))?)?|pipelineProfiles(?:\[\d+\](?:\.(?:id|name|stages(?:\[\d+\](?:\.(?:id|name|roundSize|valuation|valuationType|esopPct|graduationRate|exitRate|exitValuation|monthsToGraduate|monthsToExit))?)?))?)?|feeProfiles(?:\[\d+\](?:\.(?:id|name|feeTiers(?:\[\d+\](?:\.(?:id|name|percentage|feeBasis|startMonth|endMonth|recyclingPercentage))?)?))?)?|fundExpenses(?:\[\d+\](?:\.(?:id|category|monthlyAmount|startMonth|endMonth))?)?)$/.test(
      path
    ),
  'Field is outside the frozen raw source projection'
);
export const CapitalRawSourceFactV1Schema = z.discriminatedUnion('state', [
  z.object({ path: RawSourcePathSchema, state: z.literal('absent') }).strict(),
  z
    .object({
      path: RawSourcePathSchema,
      state: z.literal('present'),
      rawValue: z.union([z.string().max(2000), z.number().finite(), z.boolean(), z.null()]),
    })
    .strict(),
  z
    .object({
      path: RawSourcePathSchema,
      state: z.literal('array'),
      length: z.number().int().min(0).max(limits.maxSourceFacts),
    })
    .strict(),
]);
const PersistedTagSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('absent') }).strict(),
  z
    .object({
      state: z.literal('present'),
      path: CapitalPathV1Schema,
      value: CapitalVersionV1Schema,
    })
    .strict(),
]);
export const CapitalSourceProjectionV1Schema = z
  .object({
    contractVersion: z.literal('fund-scenario-capital-source-projection/1.0.0'),
    fundId: z.number().int().positive(),
    sourceConfigId: z.number().int().positive(),
    sourceConfigVersion: z.number().int().positive(),
    rawConfigHash: CapitalHashV1Schema,
    fund: z
      .object({
        size: RawNumericSchema,
        baseCurrency: z.string().max(3).nullable(),
        sizeUnitTag: PersistedTagSchema,
        schemaTag: PersistedTagSchema,
      })
      .strict(),
    configUnitTag: PersistedTagSchema,
    configSchemaTag: PersistedTagSchema,
    facts: z.array(CapitalRawSourceFactV1Schema).max(limits.maxSourceFacts),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Set(value.facts.map((fact) => fact.path)).size !== value.facts.length)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['facts'],
        message: 'Raw source paths must be unique',
      });
  });

export const CapitalMoneySourceFactV1Schema = z
  .object({
    path: CapitalPathV1Schema.refine(
      (path) => moneyPath.test(path),
      'Expected a money source path'
    ),
    rawValue: RawNumericSchema,
    sourceUnit: CapitalMoneyUnitV1Schema,
    normalizedValue: CapitalNonnegativeMoneyV1Schema,
    unitClass: z.literal('resolved_dollars'),
    provenanceOrigin: z.literal('scenario_declared'),
  })
  .strict();
export const CapitalRateSourceFactV1Schema = z
  .object({
    path: CapitalPathV1Schema,
    rawValue: RawNumericSchema,
    sourceUnit: CapitalRateUnitV1Schema,
    normalizedValue: CapitalRatioV1Schema,
    unitClass: z.literal('resolved_ratio'),
    provenanceOrigin: z.enum(['contract_resolved', 'scenario_declared']),
  })
  .strict()
  .superRefine((value, ctx) => {
    const valid =
      value.provenanceOrigin === 'scenario_declared'
        ? ratePath.test(value.path)
        : (contractRatioPath.test(value.path) && value.sourceUnit === 'ratio') ||
          (contractPercentPath.test(value.path) && value.sourceUnit === 'percent_points');
    if (!valid)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['path'],
        message: 'Rate unit and origin must match the persisted field contract',
      });
  });
const AnnualBoundarySchema = z
  .object({
    path: CapitalPathV1Schema,
    rawValue: YearSchema,
    effectiveValue: YearSchema,
    provenanceOrigin: z.literal('contract_resolved'),
  })
  .strict();
const MonthBoundarySchema = z
  .object({
    path: CapitalPathV1Schema.refine(
      (path) => monthPath.test(path),
      'Expected a legacy month boundary'
    ),
    rawValue: z
      .number()
      .int()
      .min(0)
      .max(limits.maxScheduleMonth + 1),
    sourceUnit: CapitalMonthOriginV1Schema,
    normalizedValue: MonthSchema,
    provenanceOrigin: z.literal('scenario_declared'),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.normalizedValue !==
      value.rawValue - (value.sourceUnit === 'fund_month_one_based' ? 1 : 0)
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['normalizedValue'],
        message: 'Normalized month must match the declared origin',
      });
  });
const AbsentPeriodEndSchema = z
  .object({
    state: z.literal('absent'),
    path: CapitalPathV1Schema,
    effectiveValue: MonthSchema,
    defaultReason: z.literal('FINITE_FUND_HORIZON_END'),
  })
  .strict();
export const CapitalSourcePeriodV1Schema = z
  .discriminatedUnion('kind', [
    z
      .object({
        kind: z.literal('annual'),
        start: AnnualBoundarySchema,
        end: AnnualBoundarySchema.nullable(),
        normalizedStartMonth: MonthSchema,
        normalizedEndMonth: MonthSchema,
        endDefaultReason: z.literal('FINITE_FUND_HORIZON_END').nullable(),
      })
      .strict(),
    z
      .object({
        kind: z.literal('legacy_monthly'),
        start: MonthBoundarySchema,
        end: z.union([MonthBoundarySchema, AbsentPeriodEndSchema]),
        normalizedStartMonth: MonthSchema,
        normalizedEndMonth: MonthSchema,
      })
      .strict(),
  ])
  .superRefine((value, ctx) => {
    // An omitted end uses the horizon even when the source starts beyond it.
    // Retain that excluded window; only an explicitly reversed period is invalid.
    const explicitEnd = value.kind === 'annual' ? value.end !== null : !('state' in value.end);
    if (explicitEnd && value.normalizedEndMonth < value.normalizedStartMonth)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['normalizedEndMonth'],
        message: 'Period end precedes start',
      });
    if (value.kind === 'legacy_monthly') {
      if (value.start.normalizedValue !== value.normalizedStartMonth)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['normalizedStartMonth'],
          message: 'Start boundary mismatch',
        });
      if ('sourceUnit' in value.end && value.end.sourceUnit !== value.start.sourceUnit)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['end'],
          message: 'TIME_ORIGIN_UNRESOLVED',
        });
      const end =
        'normalizedValue' in value.end ? value.end.normalizedValue : value.end.effectiveValue;
      if (end !== value.normalizedEndMonth)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['normalizedEndMonth'],
          message: 'End boundary mismatch',
        });
    } else {
      if (
        value.normalizedStartMonth !== (value.start.effectiveValue - 1) * 12 ||
        (value.end !== null && value.normalizedEndMonth !== value.end.effectiveValue * 12 - 1) ||
        (value.end === null) !== (value.endDefaultReason !== null)
      )
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['end'],
          message: 'Annual period/provenance mismatch',
        });
    }
  });

const RawGpValueSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('absent') }).strict(),
  z.object({ state: z.literal('present'), rawValue: RawNumericSchema }).strict(),
]);
export const CapitalGpSourceFactsV1Schema = z
  .object({
    nestedCommitmentAmount: RawGpValueSchema,
    nestedCommitmentPct: RawGpValueSchema,
    topLevelCommitmentAmount: RawGpValueSchema,
    resolved: z.discriminatedUnion('source', [
      z
        .object({
          source: z.literal('nested_amount'),
          fact: CapitalMoneySourceFactV1Schema,
          commitmentUsd: CapitalNonnegativeMoneyV1Schema,
        })
        .strict(),
      z
        .object({
          source: z.literal('nested_percent'),
          fact: CapitalRateSourceFactV1Schema,
          commitmentUsd: CapitalNonnegativeMoneyV1Schema,
        })
        .strict(),
      z
        .object({
          source: z.literal('top_level_amount'),
          fact: CapitalMoneySourceFactV1Schema,
          commitmentUsd: CapitalNonnegativeMoneyV1Schema,
        })
        .strict(),
      z
        .object({
          source: z.literal('zero_fallback'),
          commitmentUsd: z.literal('0.000000'),
          defaultReason: z.literal('GP_COMMITMENT_SOURCES_ABSENT'),
        })
        .strict(),
    ]),
    fundedFromFeesPct: z.discriminatedUnion('state', [
      z
        .object({
          state: z.literal('absent'),
          effectiveValue: z.literal('0.000000000000'),
          defaultReason: z.literal('ADR_070_MISSING_FRACTION_ZERO'),
        })
        .strict(),
      z
        .object({
          state: z.literal('present'),
          fact: CapitalRateSourceFactV1Schema,
          effectiveValue: CapitalRatioV1Schema,
          defaultReason: z.null(),
        })
        .strict(),
    ]),
    deemedContributionUsd: CapitalNonnegativeMoneyV1Schema,
    methodVersion: z.literal(CAPITAL_GP_METHOD_VERSION),
  })
  .strict()
  .superRefine((value, ctx) => {
    const selected =
      value.nestedCommitmentAmount.state === 'present'
        ? 'nested_amount'
        : value.nestedCommitmentPct.state === 'present'
          ? 'nested_percent'
          : value.topLevelCommitmentAmount.state === 'present'
            ? 'top_level_amount'
            : 'zero_fallback';
    if (value.resolved.source !== selected)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['resolved'],
        message: 'GP source precedence mismatch',
      });
    if (value.resolved.source !== 'zero_fallback') {
      const path =
        value.resolved.source === 'nested_amount'
          ? 'economicsAssumptions.gpCommitmentModel.commitmentAmount'
          : value.resolved.source === 'nested_percent'
            ? 'economicsAssumptions.gpCommitmentModel.commitmentPct'
            : 'gpCommitment';
      if (value.resolved.fact.path !== path)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['resolved', 'fact', 'path'],
          message: 'Selected GP source path mismatch',
        });
    }
    if (
      value.fundedFromFeesPct.state === 'present' &&
      (value.fundedFromFeesPct.fact.path !== 'fundedFromFeesPct' ||
        value.fundedFromFeesPct.fact.normalizedValue !== value.fundedFromFeesPct.effectiveValue)
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fundedFromFeesPct'],
        message: 'Fraction source/effective value mismatch',
      });
    if (
      selected === 'zero_fallback' &&
      decimalOrNull(value.fundedFromFeesPct.effectiveValue)?.gt(0)
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['resolved'],
        message: 'GP_COMMITMENT_UNRESOLVED',
      });
  });

const SourcePresenceSchema = z.enum(['absent', 'empty', 'nonempty']);
const FeeTierFactSchema = z
  .object({
    id: CapitalIdV1Schema,
    name: CapitalLabelV1Schema,
    path: CapitalPathV1Schema,
    rate: CapitalRateSourceFactV1Schema,
    basis: z.literal('committed_capital'),
    population: z.literal('full_fund_committed_capital'),
    period: CapitalSourcePeriodV1Schema,
    recyclingAnnotation: CapitalRawSourceFactV1Schema.nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.period.normalizedStartMonth % 12 !== 0 ||
      (value.period.normalizedEndMonth + 1) % 12 !== 0
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['period'],
        message: 'FEE_PERIOD_NOT_REPRESENTABLE',
      });
  });
const ExpenseFactSchema = z
  .object({
    id: CapitalIdV1Schema,
    category: CapitalLabelV1Schema,
    path: CapitalPathV1Schema,
    amount: CapitalMoneySourceFactV1Schema,
    period: CapitalSourcePeriodV1Schema,
    frequency: z.enum(['annual', 'monthly']),
    growthRate: z.discriminatedUnion('state', [
      z
        .object({ state: z.literal('absent'), effectiveValue: z.literal('0.000000000000') })
        .strict(),
      z
        .object({
          state: z.literal('present'),
          rawValue: z.literal(0),
          effectiveValue: z.literal('0.000000000000'),
        })
        .strict(),
    ]),
  })
  .strict();
export const CapitalFeeExpenseSourceFactsV1Schema = z
  .object({
    methodVersion: z.literal(CAPITAL_FEE_METHOD_VERSION),
    feeSelection: z.enum(['explicit_tiers', 'legacy_profile']),
    expenseSelection: z.enum(['explicit_annual', 'legacy_monthly']),
    rawPresence: z
      .object({
        explicitFeeTiers: SourcePresenceSchema,
        legacyFeeProfiles: SourcePresenceSchema,
        explicitAnnualExpenses: SourcePresenceSchema,
        legacyFundExpenses: SourcePresenceSchema,
        nestedDefaultRate: z.boolean(),
        managementFeeRate: z.boolean(),
      })
      .strict(),
    feeSourceLabel: z.enum(['legacy_fee_profiles', 'economics_override']).nullable(),
    expenseSourceLabel: z.enum(['legacy_fund_expenses', 'economics_override']).nullable(),
    selectedFeeProfileId: CapitalIdV1Schema.nullable(),
    feeTiers: z.array(FeeTierFactSchema).min(1).max(limits.maxFeeExpensePieces),
    expenses: z.array(ExpenseFactSchema).max(limits.maxFeeExpensePieces),
    shadowedPaths: z.array(CapitalPathV1Schema).max(limits.maxSourceFacts),
    annotations: z
      .array(
        z
          .object({
            code: z.literal('SOURCE_LABEL_SELECTION_MISMATCH'),
            path: CapitalPathV1Schema,
            selectedPath: CapitalPathV1Schema,
          })
          .strict()
      )
      .max(2),
    feeBasisUsd: CapitalNonnegativeMoneyV1Schema,
    lifetimeFeesUsd: CapitalNonnegativeMoneyV1Schema,
    lifetimeExpensesUsd: CapitalNonnegativeMoneyV1Schema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const explicit = value.rawPresence.explicitFeeTiers === 'nonempty';
    if (
      (value.feeSelection === 'explicit_tiers') !== explicit ||
      (!explicit && value.rawPresence.legacyFeeProfiles !== 'nonempty') ||
      (value.feeSelection === 'legacy_profile') !== (value.selectedFeeProfileId !== null)
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['feeSelection'],
        message: 'Selected fee branch/profile disagrees with raw presence',
      });
    const annual = value.rawPresence.explicitAnnualExpenses !== 'absent';
    const expensePresence = annual
      ? value.rawPresence.explicitAnnualExpenses
      : value.rawPresence.legacyFundExpenses;
    if (
      (value.expenseSelection === 'explicit_annual') !== annual ||
      expensePresence === 'absent' ||
      (expensePresence === 'empty') !== (value.expenses.length === 0)
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expenseSelection'],
        message: 'Selected expense branch disagrees with raw presence/empty state',
      });
    if (
      value.feeTiers.some((tier) => (tier.period.kind === 'annual') !== explicit) ||
      value.expenses.some(
        (expense) =>
          (expense.frequency === 'annual') !== annual ||
          (expense.period.kind === 'annual') !== annual
      )
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expenses'],
        message: 'Selected period/frequency mismatch',
      });
  });

const OptionalMoneyFactSchema = CapitalMoneySourceFactV1Schema.nullable();
const OptionalRateFactSchema = CapitalRateSourceFactV1Schema.nullable();
export const CapitalConstructionSourceFactsV1Schema = z
  .object({
    allocations: z
      .array(
        z
          .object({
            id: CapitalIdV1Schema,
            category: CapitalLabelV1Schema,
            percentage: CapitalRateSourceFactV1Schema,
          })
          .strict()
      )
      .max(limits.maxAllocations),
    capitalPlanAllocations: z
      .array(
        z
          .object({
            id: CapitalIdV1Schema,
            name: CapitalLabelV1Schema,
            sectorProfileId: CapitalIdV1Schema.nullable(),
            entryRound: CapitalLabelV1Schema,
            capitalAllocationPct: CapitalRateSourceFactV1Schema,
            initialCheckStrategy: z.enum(['amount', 'ownership']),
            initialCheckAmount: OptionalMoneyFactSchema,
            initialOwnershipPct: OptionalRateFactSchema,
            followOnStrategy: z.enum(['amount', 'maintain_ownership']),
            followOnAmount: OptionalMoneyFactSchema,
            followOnParticipationPct: CapitalRateSourceFactV1Schema,
            investmentHorizonMonths: z
              .number()
              .int()
              .min(1)
              .max(limits.maxDeploymentYears * 12),
          })
          .strict()
      )
      .min(1)
      .max(limits.maxAllocations),
    sectorProfiles: z
      .array(
        z
          .object({
            id: CapitalIdV1Schema,
            name: CapitalLabelV1Schema,
            targetPercentage: CapitalRateSourceFactV1Schema,
          })
          .strict()
      )
      .max(limits.maxProfiles),
    pipelineProfiles: z
      .array(
        z
          .object({
            id: CapitalIdV1Schema,
            name: CapitalLabelV1Schema,
            stages: z
              .array(
                z
                  .object({
                    id: CapitalIdV1Schema,
                    name: CapitalLabelV1Schema,
                    roundSize: OptionalMoneyFactSchema,
                    valuation: OptionalMoneyFactSchema,
                    valuationType: z.enum(['pre', 'post']),
                    esopPct: OptionalRateFactSchema,
                    graduationRate: CapitalRateSourceFactV1Schema,
                    exitValuation: OptionalMoneyFactSchema,
                    monthsToGraduate: z.number().int().min(0).max(limits.maxRoundLagMonths),
                    // V1 raw stages have no origin; scenario lags declare it independently.
                    timeOrigin: z.enum(['previous_round', 'unresolved']),
                    poolSemantics: z.enum(['incremental_pre_money', 'unresolved']),
                  })
                  .strict()
              )
              .min(1)
              .max(limits.maxStages),
          })
          .strict()
      )
      .min(1)
      .max(limits.maxProfiles),
    links: z
      .array(
        z
          .object({
            allocationId: CapitalIdV1Schema,
            pipelineProfileId: CapitalIdV1Schema,
            entryStageId: CapitalIdV1Schema,
            provenanceOrigin: z.literal('scenario_declared'),
          })
          .strict()
      )
      .min(1)
      .max(limits.maxAllocations),
  })
  .strict()
  .superRefine((value, ctx) => {
    const groups = [
      'allocations',
      'capitalPlanAllocations',
      'sectorProfiles',
      'pipelineProfiles',
    ] as const;
    for (const key of groups) {
      if (new Set(value[key].map((item) => item.id)).size !== value[key].length)
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: 'Duplicate source ID' });
    }
    for (const [index, profile] of value.pipelineProfiles.entries()) {
      if (new Set(profile.stages.map((stage) => stage.id)).size !== profile.stages.length)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['pipelineProfiles', index, 'stages'],
          message: 'Duplicate stage ID',
        });
    }
    for (const [index, link] of value.links.entries()) {
      const profile = value.pipelineProfiles.find((item) => item.id === link.pipelineProfileId);
      if (
        !value.capitalPlanAllocations.some((item) => item.id === link.allocationId) ||
        !profile?.stages.some((stage) => stage.id === link.entryStageId)
      )
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['links', index],
          message: 'Unresolved allocation/profile/stage link',
        });
    }
    if (
      new Set(value.links.map((link) => link.allocationId)).size !==
        value.capitalPlanAllocations.length ||
      value.links.length !== value.capitalPlanAllocations.length
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['links'],
        message: 'Each allocation requires exactly one link',
      });
  });

const FundYearFactSchema = z
  .object({
    path: CapitalPathV1Schema,
    rawValue: YearSchema,
    effectiveValue: YearSchema,
    provenanceOrigin: z.literal('contract_resolved'),
    shadowed: CapitalRawSourceFactV1Schema.nullable(),
  })
  .strict();
export const CapitalSourceBundleV1Schema = z
  .object({
    contractVersion: z.literal('fund-scenario-capital-source-bundle/1.0.0'),
    projection: CapitalSourceProjectionV1Schema,
    sourceBundleHash: CapitalHashV1Schema,
    publishedAt: z.string().datetime(),
    interpretationVersion: CapitalVersionV1Schema,
    unitDeclarations: CapitalUnitDeclarationsV1Schema,
    fundSize: CapitalMoneySourceFactV1Schema,
    configFundSize: z.discriminatedUnion('state', [
      z.object({ state: z.literal('absent') }).strict(),
      z.object({ state: z.literal('matched'), fact: CapitalMoneySourceFactV1Schema }).strict(),
    ]),
    baseCurrency: z.literal('USD'),
    isEvergreen: z.literal(false),
    modelInputsAsOfDate: z.string().date().nullable(),
    vintageYear: z.number().int().min(1900).max(2200),
    fundLife: FundYearFactSchema,
    investmentPeriod: FundYearFactSchema,
    gp: CapitalGpSourceFactsV1Schema,
    feeExpense: CapitalFeeExpenseSourceFactsV1Schema,
    construction: CapitalConstructionSourceFactsV1Schema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.fundSize.path !== 'funds.size' || value.projection.fund.baseCurrency !== 'USD')
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fundSize'],
        message: 'Expected locked USD fund-row commitment facts',
      });
    if (
      value.configFundSize.state === 'matched' &&
      (value.configFundSize.fact.path !== 'fundSize' ||
        value.configFundSize.fact.normalizedValue !== value.fundSize.normalizedValue)
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['configFundSize'],
        message: 'FUND_SIZE_SOURCE_MISMATCH',
      });
    if (value.investmentPeriod.effectiveValue > value.fundLife.effectiveValue)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['investmentPeriod'],
        message: 'Investment period exceeds fund term',
      });
  });

export const CapitalSourceFreshnessV1Schema = z.enum([
  'CURRENT',
  'STALE_PUBLISH',
  'STALE_SOURCE',
  'STALE_SOURCE_UNAVAILABLE',
]);
export const CapitalCalculationReadinessV1Schema = z
  .object({
    context: z.enum(['current_preview', 'saved_input']),
    state: z.enum(['READY', 'INPUT_REQUIRED', 'UNSUPPORTED']),
    issues: CapitalIssuesV1Schema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.state === 'READY') !== (value.issues.length === 0))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['issues'],
        message: 'Ready inputs have no issues; other states require issues',
      });
  });
export const CapitalInterpretationCompatibilityV1Schema = z
  .object({
    state: z.enum(['CURRENT', 'UPGRADE_AVAILABLE', 'UNSUPPORTED_SAVED_VERSION']),
    savedVersion: CapitalVersionV1Schema,
    currentVersion: CapitalVersionV1Schema,
  })
  .strict();
export const CapitalReadStateV1Schema = z
  .object({
    sourceFreshness: CapitalSourceFreshnessV1Schema,
    calculationReadiness: CapitalCalculationReadinessV1Schema,
    interpretationCompatibility: CapitalInterpretationCompatibilityV1Schema,
  })
  .strict();

export const CapitalFinancingV1Schema = z
  .object({
    valuationUsd: CapitalPositiveMoneyV1Schema,
    valuationBasis: z.enum(['pre_money', 'post_money']),
    totalPrimaryRoundUsd: CapitalPositiveMoneyV1Schema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.valuationBasis === 'post_money' &&
      decimalOrNull(value.valuationUsd)?.lte(decimalOrNull(value.totalPrimaryRoundUsd) ?? 0) ===
        true
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['valuationUsd'],
        message: 'Post-money must exceed primary round size',
      });
  });
export const CapitalCheckPolicyV1Schema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('fixed_check'), checkUsd: CapitalPositiveMoneyV1Schema }).strict(),
  z.object({ type: z.literal('pro_rata'), proRataExerciseRatio: CapitalRatioV1Schema }).strict(),
]);
export const CapitalFollowOnRoundV1Schema = z
  .object({
    roundId: CapitalIdV1Schema,
    stageId: CapitalIdV1Schema,
    roundLabel: CapitalLabelV1Schema,
    graduationRatio: CapitalRatioV1Schema,
    participationRatio: CapitalRatioV1Schema,
    checkPolicy: CapitalCheckPolicyV1Schema,
    monthsAfterPreviousRound: z.number().int().min(0).max(limits.maxRoundLagMonths),
    timeOrigin: z.literal('previous_round'),
    financing: CapitalFinancingV1Schema.optional(),
    incrementalPreMoneyPoolDilutionRatio: PoolDilutionSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.financing &&
      value.checkPolicy.type === 'fixed_check' &&
      decimalOrNull(value.checkPolicy.checkUsd)?.gt(
        decimalOrNull(value.financing.totalPrimaryRoundUsd) ?? 0
      ) === true
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['checkPolicy', 'checkUsd'],
        message: 'CHECK_EXCEEDS_ROUND_SIZE',
      });
  });
export const CapitalAllocationInputV1Schema = z
  .object({
    allocationId: CapitalIdV1Schema,
    name: CapitalLabelV1Schema,
    entryRound: CapitalLabelV1Schema,
    pipelineProfileId: CapitalIdV1Schema,
    entryStageId: CapitalIdV1Schema,
    budgetShareRatio: CapitalRatioV1Schema,
    initialCheckUsd: CapitalPositiveMoneyV1Schema,
    deploymentPeriodYears: z.number().int().min(1).max(limits.maxDeploymentYears),
    plannedCompanyCount: z.number().int().min(0).max(limits.maxPlannedCompanies).optional(),
    entryFinancing: CapitalFinancingV1Schema.optional(),
    followOnRounds: z.array(CapitalFollowOnRoundV1Schema).max(limits.maxFollowOnRounds),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.entryFinancing &&
      decimalOrNull(value.initialCheckUsd)?.gt(
        decimalOrNull(value.entryFinancing.totalPrimaryRoundUsd) ?? 0
      ) === true
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['initialCheckUsd'],
        message: 'CHECK_EXCEEDS_ROUND_SIZE',
      });
    if (
      new Set(value.followOnRounds.map((round) => round.roundId)).size !==
        value.followOnRounds.length ||
      new Set([value.entryStageId, ...value.followOnRounds.map((round) => round.stageId)]).size !==
        value.followOnRounds.length + 1
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['followOnRounds'],
        message: 'Round and stage identities must be unique within the chain',
      });
    const lastProRata = value.followOnRounds.reduce(
      (last, round, index) => (round.checkPolicy.type === 'pro_rata' ? index : last),
      -1
    );
    if (lastProRata >= 0) {
      if (!value.entryFinancing)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['entryFinancing'],
          message: 'OWNERSHIP_INPUT_UNRESOLVED',
        });
      value.followOnRounds.slice(0, lastProRata + 1).forEach((round, index) => {
        if (!round.financing)
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['followOnRounds', index, 'financing'],
            message: 'OWNERSHIP_INPUT_UNRESOLVED',
          });
        if (round.incrementalPreMoneyPoolDilutionRatio === undefined)
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['followOnRounds', index, 'incrementalPreMoneyPoolDilutionRatio'],
            message: 'POOL_DILUTION_UNRESOLVED',
          });
      });
    }
  });

const FmvSchema = z
  .object({
    amountUsd: CapitalNonnegativeMoneyV1Schema,
    asOfDate: z.string().date(),
    basis: z.enum(['direct', 'derived', 'manual']),
    explanation: NoteSchema.optional(),
  })
  .strict();
export const AggregatePreferenceInputV1Schema = z
  .object({
    methodVersion: z.literal(AGGREGATE_PREFERENCE_FORECAST_VERSION),
    issuerLabel: CapitalLabelV1Schema,
    issuerKind: z.enum(['named_holding', 'representative_issuer']),
    exitEquityValueUsd: CapitalNonnegativeMoneyV1Schema,
    exitDate: z.string().date(),
    asConvertedOwnershipRatio: CapitalRatioV1Schema.optional(),
    manualOwnershipOverrideRatio: CapitalRatioV1Schema.optional(),
    ownershipOverrideExplanation: NoteSchema.optional(),
    fundLiquidationPreferenceUsd: CapitalNonnegativeMoneyV1Schema,
    preferenceType: z.enum(['non_participating', 'participating']),
    participationCap: z.discriminatedUnion('type', [
      z.object({ type: z.literal('none') }).strict(),
      z
        .object({ type: z.literal('total_payout'), capAmountUsd: CapitalNonnegativeMoneyV1Schema })
        .strict(),
    ]),
    totalPreferencesSeniorUsd: CapitalNonnegativeMoneyV1Schema,
    totalPreferencesPariPassuUsd: CapitalNonnegativeMoneyV1Schema,
    totalPreferencesJuniorUsd: CapitalNonnegativeMoneyV1Schema,
    investedCostUsd: CapitalNonnegativeMoneyV1Schema,
    positionFmv: FmvSchema.optional(),
    manualFmvOverride: FmvSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.asConvertedOwnershipRatio === undefined &&
      value.manualOwnershipOverrideRatio === undefined
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['asConvertedOwnershipRatio'],
        message: 'Effective ownership is required',
      });
    if (
      value.ownershipOverrideExplanation !== undefined &&
      value.manualOwnershipOverrideRatio === undefined
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ownershipOverrideExplanation'],
        message: 'Explanation requires an ownership override',
      });
    if (value.manualFmvOverride && value.manualFmvOverride.basis !== 'manual')
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['manualFmvOverride', 'basis'],
        message: 'Override FMV must retain manual provenance',
      });
    if (
      value.participationCap.type === 'total_payout' &&
      (value.preferenceType !== 'participating' ||
        decimalOrNull(value.participationCap.capAmountUsd)?.lt(
          decimalOrNull(value.fundLiquidationPreferenceUsd) ?? 0
        ) === true)
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['participationCap'],
        message: 'Only participating positions may cap total payout, at no less than preference',
      });
  });

// Client-editable normalized assumptions only. All source facts/provenance are injected
// by the server after locked CAS and materialization, never trusted from this input.
export const CapitalPlanningInputV1Schema = z
  .object({
    contractVersion: z.literal(CAPITAL_PLANNING_VERSION),
    netInvestableCapitalUsd: CapitalNonnegativeMoneyV1Schema.optional(),
    allocations: z.array(CapitalAllocationInputV1Schema).min(1).max(limits.maxAllocations),
    performanceCase: AggregatePreferenceInputV1Schema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      new Set(value.allocations.map((allocation) => allocation.allocationId)).size !==
      value.allocations.length
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['allocations'],
        message: 'Allocation IDs must be unique',
      });
    const share = value.allocations.reduce(
      (sum, allocation) => sum.plus(decimalOrNull(allocation.budgetShareRatio) ?? 0),
      new Decimal(0)
    );
    if (share.gt(1))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['allocations'],
        message: 'Allocation shares exceed one',
      });
  });

const CapitalBenchmarkTargetV1Schema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('entry'), allocationId: CapitalIdV1Schema }).strict(),
  z
    .object({
      kind: z.literal('follow_on'),
      allocationId: CapitalIdV1Schema,
      roundId: CapitalIdV1Schema,
    })
    .strict(),
]);
const CapitalBenchmarkSelectorV1Schema = z
  .object({
    version: CapitalVersionV1Schema,
    stage: z.enum(['seed', 'series_a', 'series_b', 'series_c', 'series_d']),
  })
  .strict();
const CapitalBenchmarkOverridesV1Schema = z
  .object({
    valuation: z
      .object({
        valuationUsd: CapitalPositiveMoneyV1Schema,
        valuationBasis: z.enum(['pre_money', 'post_money']),
      })
      .strict()
      .optional(),
    totalPrimaryRoundUsd: CapitalPositiveMoneyV1Schema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    for (const key of ['valuation', 'totalPrimaryRoundUsd'] as const) {
      if (Object.prototype.hasOwnProperty.call(value, key) && value[key] === undefined)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: 'A supplied override must have a value',
        });
    }
  });
export const CapitalBenchmarkSelectionV1Schema = z
  .object({
    target: CapitalBenchmarkTargetV1Schema,
    selector: CapitalBenchmarkSelectorV1Schema,
    overrides: CapitalBenchmarkOverridesV1Schema.optional(),
  })
  .strict();

// Reuse the normalized object shapes and refinements. Only selected, missing
// financing may wait for source resolution; identity, share and pool checks remain.
export const CapitalPlanningDraftV1Schema = z
  .object({
    input: CapitalPlanningInputV1Schema.innerType().extend({
      allocations: z
        .array(CapitalAllocationInputV1Schema.innerType())
        .min(1)
        .max(limits.maxAllocations),
    }),
    benchmarkSelections: z
      .array(CapitalBenchmarkSelectionV1Schema)
      .max(limits.maxAllocations * (limits.maxFollowOnRounds + 1))
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const deferredPaths = new Set<string>();
    for (const [index, selection] of (value.benchmarkSelections ?? []).entries()) {
      const ai = value.input.allocations.findIndex(
        (allocation) => allocation.allocationId === selection.target.allocationId
      );
      const allocation = value.input.allocations[ai];
      const target = selection.target;
      const ri =
        target.kind === 'follow_on'
          ? (allocation?.followOnRounds.findIndex((round) => round.roundId === target.roundId) ??
            -1)
          : -1;
      if (!allocation || (target.kind === 'follow_on' && ri < 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['benchmarkSelections', index, 'target'],
          message: 'Benchmark target must identify an existing allocation or round',
        });
        continue;
      }
      const path =
        target.kind === 'entry'
          ? ['allocations', ai, 'entryFinancing']
          : ['allocations', ai, 'followOnRounds', ri, 'financing'];
      const key = JSON.stringify(path);
      if (deferredPaths.has(key))
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['benchmarkSelections', index, 'target'],
          message: 'Benchmark targets must be unique',
        });
      deferredPaths.add(key);
      const supplied =
        target.kind === 'entry'
          ? Object.prototype.hasOwnProperty.call(allocation, 'entryFinancing')
          : Object.prototype.hasOwnProperty.call(allocation.followOnRounds[ri], 'financing');
      if (supplied)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['input', ...path],
          message: 'Selected financing must be absent; explicit edits belong in overrides',
        });
    }
    const normalized = CapitalPlanningInputV1Schema.safeParse(value.input);
    if (!normalized.success)
      for (const issue of normalized.error.issues) {
        if (
          issue.message === 'OWNERSHIP_INPUT_UNRESOLVED' &&
          deferredPaths.has(JSON.stringify(issue.path))
        )
          continue;
        ctx.addIssue({ ...issue, path: ['input', ...issue.path] });
      }
  });

export const CapitalBenchmarkMetadataV1Schema = z
  .object({
    version: CapitalVersionV1Schema,
    sourceUrl: z.string().url().max(2048),
    sourceTitle: CapitalLabelV1Schema,
    observationStart: z.string().date().nullable(),
    observationEnd: z.string().date(),
    observationWindow: CapitalLabelV1Schema.optional(),
    population: CapitalLabelV1Schema,
    geography: CapitalLabelV1Schema,
    sector: CapitalLabelV1Schema,
    stage: CapitalLabelV1Schema,
    statistic: z.literal('median'),
    valuationBasis: z.enum(['pre_money', 'post_money']).nullable(),
    sourceUnit: CapitalSourceUnitV1Schema,
    sampleSize: z.number().int().positive().safe().nullable(),
    populationMismatch: NoteSchema.nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.observationStart === null && value.observationWindow === undefined)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['observationWindow'],
        message: 'An unknown observation start requires the reported observation window',
      });
  });

export const CapitalBenchmarkSnapshotV1Schema = CapitalBenchmarkSelectionV1Schema.extend({
  baselineFinancing: CapitalFinancingV1Schema,
  metadata: CapitalBenchmarkMetadataV1Schema,
  observedMetrics: z
    .object({ valuationUsd: CapitalLabelV1Schema, totalPrimaryRoundUsd: CapitalLabelV1Schema })
    .strict(),
})
  .strict()
  .superRefine((value, ctx) => {
    if (value.selector.version !== value.metadata.version)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['metadata', 'version'],
        message: 'Copied benchmark metadata must retain the selected version',
      });
  });

export const CapitalAssumptionProvenanceV1Schema = z
  .object({
    inputPath: CapitalPathV1Schema,
    origin: z.enum(['source_derived', 'user_entered', 'user_override', 'benchmark_derived']),
    sourcePath: CapitalPathV1Schema.nullable(),
    sourceValue: z.union([
      CapitalMoneyV1Schema,
      CapitalDecimalV1Schema,
      CapitalLabelV1Schema,
      z.number().int().safe(),
      z.boolean(),
      z.null(),
    ]),
    effectiveValue: z.union([
      CapitalMoneyV1Schema,
      CapitalDecimalV1Schema,
      CapitalLabelV1Schema,
      z.number().int().safe(),
      z.boolean(),
    ]),
    profileId: CapitalIdV1Schema.nullable(),
    stageId: CapitalIdV1Schema.nullable(),
    effectiveDate: z.string().date().nullable(),
    sourceVintage: CapitalLabelV1Schema.nullable(),
    note: NoteSchema.nullable(),
    benchmark: CapitalBenchmarkMetadataV1Schema.nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.origin === 'benchmark_derived') !== (value.benchmark !== null))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['benchmark'],
        message: 'Benchmark origin requires its actual evidence metadata',
      });
  });

export const CapitalVerdictAxesV1Schema = z
  .object({
    inputSupport: z.enum(['complete', 'incomplete', 'unsupported', 'invalid']),
    lifetimeCapacity: z.enum(['within_capacity', 'over_capacity', 'unavailable']),
    allocationBudget: z.enum(['within_allocation', 'allocation_gap', 'unavailable']),
    reserveEarmark: z.enum(['within_earmark', 'earmark_gap', 'unavailable']),
    timing: z.enum(['within_term', 'includes_beyond_term', 'all_beyond_term', 'unavailable']),
    staleness: z.enum(['current', 'stale_source', 'unknown_current_source']),
  })
  .strict();
export const CapitalCountBasisV1Schema = z.enum(['expected', 'entered']);
export const CapitalCountViewV1Schema = z
  .object({
    countBasis: CapitalCountBasisV1Schema,
    label: z.enum(['Expected companies', 'Entered company count']),
    companyCount: CapitalNonnegativeDecimalV1Schema,
    initialDemandUsd: CapitalNonnegativeMoneyV1Schema,
    followOnDemandUsd: CapitalNonnegativeMoneyV1Schema,
    totalDemandUsd: CapitalNonnegativeMoneyV1Schema,
    signedResidualUsd: z.union([CapitalMoneyV1Schema, CapitalOptionalMoneyV1Schema]),
    signedReserveResidualUsd: CapitalOptionalMoneyV1Schema,
    reserveRatio: CapitalOptionalDecimalV1Schema,
    reserveRatioDenominator: z.literal('allocated_investment_capital'),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.label !==
      (value.countBasis === 'expected' ? 'Expected companies' : 'Entered company count')
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['label'],
        message: 'Count label must match its basis',
      });
    if (value.countBasis === 'entered' && decimalOrNull(value.companyCount)?.isInteger() !== true)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['companyCount'],
        message: 'Entered count must be an integer',
      });
    if (
      value.reserveRatio.state === 'available' &&
      !CapitalRatioV1Schema.safeParse(value.reserveRatio.value).success
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reserveRatio'],
        message: 'Reserve ratio must be in [0, 1]',
      });
  });
const UnavailableCountSchema = z
  .object({
    state: z.literal('unavailable'),
    value: z.null(),
    reason: z.enum(['NO_CONSTRUCTION_CAPITAL', 'NOT_ENTERED']),
  })
  .strict();
const OwnershipSchema = z.discriminatedUnion('state', [
  z
    .object({
      state: z.literal('available'),
      label: z.literal('Conditional mean ownership'),
      beforePoolRatio: CapitalRatioV1Schema,
      afterPoolRatio: CapitalRatioV1Schema,
      participatingRatio: CapitalRatioV1Schema,
      skippedRatio: CapitalRatioV1Schema,
      conditionalMeanRatio: CapitalRatioV1Schema,
    })
    .strict(),
  z
    .object({
      state: z.literal('unavailable'),
      reason: z.enum(['NOT_MODELED', 'OWNERSHIP_UNAVAILABLE']),
      issues: CapitalIssuesV1Schema,
    })
    .strict(),
]);
export const CapitalRoundResultV1Schema = z
  .object({
    roundId: CapitalIdV1Schema,
    stageId: CapitalIdV1Schema,
    roundLabel: CapitalLabelV1Schema,
    countBasis: CapitalCountBasisV1Schema,
    cumulativeGraduationRatio: CapitalRatioV1Schema,
    eligibleCompanyCount: CapitalNonnegativeDecimalV1Schema,
    participatingCompanyCount: CapitalNonnegativeDecimalV1Schema,
    conditionalCheckUsd: CapitalNonnegativeMoneyV1Schema,
    demandUsd: CapitalNonnegativeMoneyV1Schema,
    cumulativeLagMonths: MonthSchema,
    ownership: OwnershipSchema,
  })
  .strict();
export const CapitalMonthlyDetailV1Schema = z
  .object({
    allocationId: CapitalIdV1Schema,
    entryMonth: MonthSchema,
    demandMonth: MonthSchema,
    roundId: CapitalIdV1Schema.nullable(),
    kind: z.enum(['initial', 'follow_on']),
    countBasis: CapitalCountBasisV1Schema,
    companyCount: CapitalNonnegativeDecimalV1Schema,
    demandUsd: CapitalNonnegativeMoneyV1Schema,
    beyondTerm: z.boolean(),
  })
  .strict();
export const CapitalAnnualScheduleRowV1Schema = z
  .object({
    fundYear: z.number().int().min(1).max(70),
    calendarYear: z.number().int().min(1900).max(2270),
    countBasis: CapitalCountBasisV1Schema,
    initialDemandUsd: CapitalNonnegativeMoneyV1Schema,
    withinTermFollowOnUsd: CapitalNonnegativeMoneyV1Schema,
    beyondTermFollowOnUsd: CapitalNonnegativeMoneyV1Schema,
    totalDemandUsd: CapitalNonnegativeMoneyV1Schema,
  })
  .strict();
export const CapitalBudgetBridgeV1Schema = z
  .object({
    committedCapitalUsd: CapitalNonnegativeMoneyV1Schema,
    gpCommitmentUsd: CapitalNonnegativeMoneyV1Schema,
    fundedFromFeesRatio: CapitalRatioV1Schema,
    gpDeemedContributionUsd: CapitalNonnegativeMoneyV1Schema,
    lifetimeFeesUsd: CapitalNonnegativeMoneyV1Schema,
    lifetimeExpensesUsd: CapitalNonnegativeMoneyV1Schema,
    availableConstructionCapitalUsd: CapitalMoneyV1Schema,
    // Available capital = displayed commitments - displayed deductions + residual.
    signedRoundingResidualUsd: CapitalMoneyV1Schema,
    planningBudgetUsd: CapitalOptionalMoneyV1Schema,
    planningBudgetOrigin: z.enum(['derived_available_capital', 'explicit_override']),
    overrideDifferenceUsd: CapitalOptionalMoneyV1Schema,
    feePopulation: z.literal('full_fund_committed_capital'),
    fundingAssumption: z.literal('callable_as_needed'),
  })
  .strict();
export const CapitalAllocationResultV1Schema = z
  .object({
    allocationId: CapitalIdV1Schema,
    name: CapitalLabelV1Schema,
    allocationBudgetUsd: CapitalOptionalMoneyV1Schema,
    expectedPerCompanyCostUsd: CapitalPositiveMoneyV1Schema,
    expected: z.union([CapitalCountViewV1Schema, UnavailableCountSchema]),
    entered: z.union([CapitalCountViewV1Schema, UnavailableCountSchema]),
    designatedFollowOnReserveUsd: CapitalOptionalMoneyV1Schema,
    rounds: z.array(CapitalRoundResultV1Schema).max(limits.maxFollowOnRounds * 2),
  })
  .strict()
  .superRefine((value, ctx) => {
    for (const basis of ['expected', 'entered'] as const) {
      const view = value[basis];
      if ('countBasis' in view && view.countBasis !== basis)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [basis],
          message: 'Count view cannot swap its basis',
        });
      if (basis === 'expected' && 'reason' in view && view.reason === 'NOT_ENTERED')
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [basis],
          message: 'Expected count is not a user-entered value',
        });
    }
  });
export const CapitalReconciliationV1Schema = z
  .object({
    countBasis: CapitalCountBasisV1Schema,
    initialDemandUsd: CapitalNonnegativeMoneyV1Schema,
    lifetimeFollowOnUsd: CapitalNonnegativeMoneyV1Schema,
    withinTermFollowOnUsd: CapitalNonnegativeMoneyV1Schema,
    beyondTermFollowOnUsd: CapitalNonnegativeMoneyV1Schema,
    unassignedPlanningBudgetUsd: CapitalOptionalMoneyV1Schema,
    // Planning budget minus emitted allocation budgets and unassigned budget.
    signedAllocationRoundingResidualUsd: CapitalMoneyV1Schema,
    // Canonical total demand minus the sum of emitted monthly demand leaves.
    signedRoundingResidualUsd: CapitalMoneyV1Schema,
    // Canonical total demand minus emitted initial and lifetime follow-on totals.
    signedDemandRoundingResidualUsd: CapitalMoneyV1Schema,
    // Lifetime follow-ons minus emitted within-term and beyond-term totals.
    signedTimingRoundingResidualUsd: CapitalMoneyV1Schema,
    signedBudgetResidualUsd: CapitalOptionalMoneyV1Schema,
    signedLifetimeHeadroomUsd: CapitalMoneyV1Schema,
    lifetimeBudgetShortfallUsd: CapitalNonnegativeMoneyV1Schema,
    allocationGapUsd: CapitalOptionalMoneyV1Schema,
    reserveEarmarkGapUsd: CapitalOptionalMoneyV1Schema,
    firstBudgetGapMonth: MonthSchema.nullable(),
    firstGapAllocationId: CapitalIdV1Schema.nullable(),
    firstGapRoundId: CapitalIdV1Schema.nullable(),
  })
  .strict();
export const CapitalStressNameV1Schema = z.enum([
  'graduation_plus_10pp',
  'participation_full',
  'fixed_checks_and_pro_rata_rounds_plus_25pct',
  'follow_on_6_months_earlier',
]);
export const CapitalStressResultV1Schema = z.discriminatedUnion('state', [
  z
    .object({
      state: z.literal('complete'),
      name: CapitalStressNameV1Schema,
      label: CapitalLabelV1Schema,
      countBasis: CapitalCountBasisV1Schema,
      changedPaths: z.array(CapitalPathV1Schema).max(limits.maxSourceFacts),
      reconciliation: CapitalReconciliationV1Schema,
      verdicts: CapitalVerdictAxesV1Schema,
      plannedReserveGapUsd: CapitalNonnegativeMoneyV1Schema,
      annualSchedule: z.array(CapitalAnnualScheduleRowV1Schema).max(70),
    })
    .strict(),
  z
    .object({
      state: z.literal('invalid'),
      name: CapitalStressNameV1Schema,
      label: CapitalLabelV1Schema,
      countBasis: CapitalCountBasisV1Schema,
      issues: CapitalIssuesV1Schema.nonempty(),
    })
    .strict(),
]);
export const CapitalConstructionResultV1Schema = z
  .object({
    methodVersion: z.literal(CAPITAL_PLANNING_VERSION),
    budget: CapitalBudgetBridgeV1Schema,
    allocations: z.array(CapitalAllocationResultV1Schema).min(1).max(limits.maxAllocations),
    verdicts: CapitalVerdictAxesV1Schema.extend({ inputSupport: z.literal('complete') }).strict(),
    headline: NoteSchema,
    qualifications: z
      .array(
        z.enum([
          'ZERO_CONSTRUCTION_CAPITAL',
          'NO_CONSTRUCTION_CAPITAL',
          'INCLUDES_BEYOND_TERM',
          'INFEASIBLE_UNDER_MODELED_ASSUMPTIONS',
          'EXPECTED_COUNTS_ARE_FRACTIONAL',
        ])
      )
      .max(5),
    reconciliation: z.array(CapitalReconciliationV1Schema).min(1).max(2),
    monthlyDetail: z.array(CapitalMonthlyDetailV1Schema).max(limits.maxExpandedRows),
    annualSchedule: z.array(CapitalAnnualScheduleRowV1Schema).max(140),
    stresses: z.array(CapitalStressResultV1Schema).min(4).max(8),
    disclosures: CapitalDisclosuresV1Schema,
    assumptions: z
      .object({
        homogeneousAllocation: z.literal(true),
        graduationAndParticipationIndependentOfOwnershipHistory: z.literal(true),
        affineCheckAndOwnershipUpdates: z.literal(true),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const identities = value.stresses.map((stress) => `${stress.countBasis}:${stress.name}`);
    if (new Set(identities).size !== identities.length)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['stresses'],
        message: 'Named stresses must be unique per count basis',
      });
    for (const basis of new Set(value.stresses.map((stress) => stress.countBasis))) {
      if (value.stresses.filter((stress) => stress.countBasis === basis).length !== 4)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['stresses'],
          message: 'Each stress basis requires all four named stresses',
        });
    }
    if (
      new Set(value.reconciliation.map((row) => row.countBasis)).size !==
      value.reconciliation.length
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reconciliation'],
        message: 'One reconciliation per count basis',
      });
    if (
      new Set(value.allocations.map((allocation) => allocation.allocationId)).size !==
      value.allocations.length
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['allocations'],
        message: 'Result allocation IDs must be unique',
      });
  });

const PreferenceRouteTraceSchema = z
  .object({
    seniorPaidUsd: CapitalNonnegativeMoneyV1Schema,
    fundPaidUsd: CapitalNonnegativeMoneyV1Schema,
    otherPariPaidUsd: CapitalNonnegativeMoneyV1Schema,
    juniorPaidUsd: CapitalNonnegativeMoneyV1Schema,
    otherCommonPaidUsd: CapitalNonnegativeMoneyV1Schema,
    signedRoundingResidualUsd: CapitalMoneyV1Schema,
  })
  .strict();
export const AggregatePreferenceResultV1Schema = z
  .object({
    methodVersion: z.literal(AGGREGATE_PREFERENCE_FORECAST_VERSION),
    input: AggregatePreferenceInputV1Schema,
    effectiveOwnershipRatio: CapitalRatioV1Schema,
    ownershipOrigin: z.enum(['base', 'manual_override']),
    preferredCandidateUsd: CapitalNonnegativeMoneyV1Schema,
    conversionCandidateUsd: CapitalNonnegativeMoneyV1Schema,
    selectedRoute: z.enum(['preference', 'conversion', 'indifferent']),
    adjustedProceedsUsd: CapitalNonnegativeMoneyV1Schema,
    noPreferenceBaselineUsd: CapitalNonnegativeMoneyV1Schema,
    signedPreferenceBenefitUsd: CapitalMoneyV1Schema,
    electionUpliftUsd: CapitalNonnegativeMoneyV1Schema,
    adjustedMoic: CapitalOptionalDecimalV1Schema,
    baselineMoic: CapitalOptionalDecimalV1Schema,
    effectiveFmv: FmvSchema.nullable(),
    fmvUnavailableReason: z.literal('FMV_UNAVAILABLE').nullable(),
    capAttainmentUsd: CapitalOptionalMoneyV1Schema,
    conversionThresholdUsd: CapitalOptionalMoneyV1Schema,
    preferredRouteTrace: PreferenceRouteTraceSchema,
    conversionRouteTrace: PreferenceRouteTraceSchema,
    exitBeyondFundTerm: z.boolean(),
    juniorPreferenceLabel: z.literal('Preferences Behind Position'),
    disclosure: z.literal(CAPITAL_PLANNING_DISCLOSURES.preference),
    constructionFunding: z.literal('excluded'),
    fixedOtherClaims: z.literal(true),
    fixedResidualShare: z.literal(true),
    voluntaryFullConversion: z.literal(true),
  })
  .strict()
  .superRefine((value, ctx) => {
    const ownershipOrigin =
      value.input.manualOwnershipOverrideRatio === undefined ? 'base' : 'manual_override';
    if (value.ownershipOrigin !== ownershipOrigin)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ownershipOrigin'],
        message: 'Ownership origin must match the selected input',
      });
    if (
      value.effectiveOwnershipRatio !==
      (value.input.manualOwnershipOverrideRatio ?? value.input.asConvertedOwnershipRatio)
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['effectiveOwnershipRatio'],
        message: 'Effective ownership must match the selected input',
      });
    if ((value.effectiveFmv === null) !== (value.fmvUnavailableReason !== null))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fmvUnavailableReason'],
        message: 'Only unavailable FMV carries an absence reason',
      });
    if (value.input.investedCostUsd === '0.000000') {
      for (const key of ['adjustedMoic', 'baselineMoic'] as const) {
        const metric = value[key];
        if (metric.state !== 'unavailable' || metric.reason !== 'ZERO_COST')
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: 'Zero invested cost requires null MOIC with ZERO_COST',
          });
      }
    }
  });

export const CapitalPlanningResultV1Schema = z
  .object({
    contractVersion: z.literal(CAPITAL_PLANNING_VERSION),
    input: CapitalPlanningInputV1Schema,
    sourceBundle: CapitalSourceBundleV1Schema,
    provenance: z.array(CapitalAssumptionProvenanceV1Schema).max(limits.maxSourceFacts),
    benchmarkSnapshots: z
      .array(CapitalBenchmarkSnapshotV1Schema)
      .max(limits.maxAllocations * (limits.maxFollowOnRounds + 1))
      .optional(),
    construction: CapitalConstructionResultV1Schema,
    performance: AggregatePreferenceResultV1Schema.nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.input.performanceCase !== undefined) !== (value.performance !== null))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['performance'],
        message: 'Selected companion requires a complete result',
      });
  });

// Both rendering and clipboard formatting consume this exact structured model.
// Read-time metadata lives here, outside the immutable saved calculation result.
export interface CapitalPlanningMemoV1 {
  contractVersion: 'capital-planning-memo/1.0.0';
  fundId: number;
  scenarioSetId: string;
  variantId: string;
  scenarioSetName: string;
  variantName: string;
  result: CapitalPlanningResultV1;
  readState: CapitalReadStateV1;
  countBasis: 'expected' | 'entered';
  limitations: string[];
  detailScope: 'complete' | 'labeled_summary';
}

export const CapitalPlanningMemoV1Schema: z.ZodType<CapitalPlanningMemoV1> = z
  .object({
    contractVersion: z.literal('capital-planning-memo/1.0.0'),
    fundId: z.number().int().positive(),
    scenarioSetId: z.string().uuid(),
    variantId: z.string().uuid(),
    scenarioSetName: CapitalScenarioNameV1Schema,
    variantName: CapitalScenarioNameV1Schema,
    result: CapitalPlanningResultV1Schema,
    readState: CapitalReadStateV1Schema,
    countBasis: CapitalCountBasisV1Schema,
    limitations: z.array(NoteSchema).min(1).max(20),
    detailScope: z.enum(['complete', 'labeled_summary']),
  })
  .strict();

export type CapitalPlanningInputV1 = z.infer<typeof CapitalPlanningInputV1Schema>;
export type CapitalPlanningDraftV1 = z.infer<typeof CapitalPlanningDraftV1Schema>;
export type CapitalBenchmarkSelectionV1 = z.infer<typeof CapitalBenchmarkSelectionV1Schema>;
export type CapitalBenchmarkMetadataV1 = z.infer<typeof CapitalBenchmarkMetadataV1Schema>;
export type CapitalBenchmarkSnapshotV1 = z.infer<typeof CapitalBenchmarkSnapshotV1Schema>;
export type CapitalAllocationInputV1 = z.infer<typeof CapitalAllocationInputV1Schema>;
export type CapitalFollowOnRoundV1 = z.infer<typeof CapitalFollowOnRoundV1Schema>;
export type CapitalCheckPolicyV1 = z.infer<typeof CapitalCheckPolicyV1Schema>;
export type CapitalSourceProjectionV1 = z.infer<typeof CapitalSourceProjectionV1Schema>;
export type CapitalSourceBundleV1 = z.infer<typeof CapitalSourceBundleV1Schema>;
export type CapitalGpSourceFactsV1 = z.infer<typeof CapitalGpSourceFactsV1Schema>;
export type CapitalFeeExpenseSourceFactsV1 = z.infer<typeof CapitalFeeExpenseSourceFactsV1Schema>;
export type CapitalConstructionSourceFactsV1 = z.infer<
  typeof CapitalConstructionSourceFactsV1Schema
>;
export type CapitalUnitDeclarationsV1 = z.infer<typeof CapitalUnitDeclarationsV1Schema>;
export type CapitalMoneySourceFactV1 = z.infer<typeof CapitalMoneySourceFactV1Schema>;
export type CapitalRateSourceFactV1 = z.infer<typeof CapitalRateSourceFactV1Schema>;
export type CapitalSourcePeriodV1 = z.infer<typeof CapitalSourcePeriodV1Schema>;
export type CapitalIssueV1 = z.infer<typeof CapitalIssueV1Schema>;
export type CapitalRefusalCodeV1 = z.infer<typeof CapitalRefusalCodeV1Schema>;
export type CapitalReadStateV1 = z.infer<typeof CapitalReadStateV1Schema>;
export type CapitalAssumptionProvenanceV1 = z.infer<typeof CapitalAssumptionProvenanceV1Schema>;
export type CapitalVerdictAxesV1 = z.infer<typeof CapitalVerdictAxesV1Schema>;
export type CapitalCountViewV1 = z.infer<typeof CapitalCountViewV1Schema>;
export type CapitalMonthlyDetailV1 = z.infer<typeof CapitalMonthlyDetailV1Schema>;
export type CapitalStressResultV1 = z.infer<typeof CapitalStressResultV1Schema>;
export type CapitalConstructionResultV1 = z.infer<typeof CapitalConstructionResultV1Schema>;
export type CapitalPlanningResultV1 = z.infer<typeof CapitalPlanningResultV1Schema>;
export type AggregatePreferenceInputV1 = z.infer<typeof AggregatePreferenceInputV1Schema>;
export type AggregatePreferenceResultV1 = z.infer<typeof AggregatePreferenceResultV1Schema>;
