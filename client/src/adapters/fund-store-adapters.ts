/**
 * Fund Store Adapters
 *
 * Maps FundState (client store) to canonical wire formats:
 * - fundStoreToCreateV1: FundState -> FundCreateV1 (POST /api/funds)
 * - fundStoreToDraftWriteV1: FundState -> FundDraftWriteV1 (PUT /api/funds/:id/draft)
 * - fundDraftWriteV1ToStoreHydrationPatch: FundDraftWriteV1 -> FundState patch
 *
 * These replace the legacy mapFundStoreToCreatePayload.
 */

import type { FundCreateV1 } from '@shared/contracts/fund-create-v1.contract';
import type { FundDraftWriteV1 } from '@shared/contracts/fund-draft-write-v1.contract';
import type { EconomicsAssumptionsV1 } from '@shared/contracts/economics-v1.contract';
import { spreadIfDefined } from '@/lib/ts/spreadIfDefined';
import type { FundState } from '@/stores/fundStore';

type FundStateSlice = Pick<
  FundState,
  | 'fundName'
  | 'fundSize'
  | 'managementFeeRate'
  | 'carriedInterest'
  | 'vintageYear'
  | 'establishmentDate'
  | 'isEvergreen'
  | 'fundLife'
  | 'investmentPeriod'
  | 'gpCommitment'
  | 'lpClasses'
  | 'lps'
  | 'stages'
  | 'sectorProfiles'
  | 'allocations'
  | 'followOnChecks'
  | 'capitalStageAllocations'
  | 'capitalPlanAllocations'
  | 'pipelineProfiles'
  | 'waterfallType'
  | 'waterfallTiers'
  | 'recyclingEnabled'
  | 'recyclingType'
  | 'recyclingCap'
  | 'recyclingPeriod'
  | 'exitRecyclingRate'
  | 'mgmtFeeRecyclingRate'
  | 'allowFutureRecycling'
  | 'feeProfiles'
  | 'fundExpenses'
  | 'economicsAssumptions'
  | 'draftFundId'
  | 'draftServerReady'
>;

type DraftHydrationDefaults = Pick<
  FundState,
  | 'isEvergreen'
  | 'lpClasses'
  | 'lps'
  | 'stages'
  | 'sectorProfiles'
  | 'allocations'
  | 'followOnChecks'
  | 'capitalStageAllocations'
  | 'capitalPlanAllocations'
  | 'pipelineProfiles'
  | 'waterfallType'
  | 'waterfallTiers'
  | 'recyclingEnabled'
  | 'recyclingType'
  | 'exitRecyclingRate'
  | 'mgmtFeeRecyclingRate'
  | 'allowFutureRecycling'
  | 'feeProfiles'
  | 'fundExpenses'
  | 'economicsAssumptions'
>;

type DraftLPClass = NonNullable<FundDraftWriteV1['lpClasses']>[number];
type DraftLP = NonNullable<FundDraftWriteV1['lps']>[number];
type DraftCapitalPlanAllocation = NonNullable<FundDraftWriteV1['capitalPlanAllocations']>[number];
type DraftWaterfallTier = NonNullable<FundDraftWriteV1['waterfallTiers']>[number];
type DraftFeeProfile = NonNullable<FundDraftWriteV1['feeProfiles']>[number];
type DraftFeeTier = DraftFeeProfile['feeTiers'][number];
type DraftFundExpense = NonNullable<FundDraftWriteV1['fundExpenses']>[number];

interface EconomicsAdapterOptions {
  includeEconomicsAssumptions?: boolean;
}

function percentToRatio(value: number | undefined): number {
  if (value == null) return 0;
  return value > 1 ? value / 100 : value;
}

function recyclingCapToRatio(value: number | undefined, fundSize: number): number {
  if (value == null || value <= 0 || fundSize <= 0) return 0;
  if (value <= 1) return value;
  if (value <= 100) return value / 100;
  return value / fundSize;
}

function defaultExitDistribution(fundLifeYears: number, investmentPeriodYears: number): number[] {
  const distribution = Array.from({ length: fundLifeYears }, () => 0);
  const startYear = Math.min(fundLifeYears, Math.max(1, investmentPeriodYears + 1));
  const count = fundLifeYears - startYear + 1;
  if (count <= 0) {
    distribution[fundLifeYears - 1] = 1;
    return distribution;
  }
  for (let year = startYear; year <= fundLifeYears; year++) {
    distribution[year - 1] = 1 / count;
  }
  return distribution;
}

function recyclingSources(
  recyclingType: FundStateSlice['recyclingType']
): Array<'management_fees' | 'exit_proceeds'> {
  if (recyclingType === 'fees') return ['management_fees'];
  if (recyclingType === 'both') return ['management_fees', 'exit_proceeds'];
  return ['exit_proceeds'];
}

function buildEconomicsAssumptionsFromState(
  state: FundStateSlice
): EconomicsAssumptionsV1 | undefined {
  if (state.economicsAssumptions != null) {
    return state.economicsAssumptions;
  }
  if (state.fundSize == null || state.fundSize <= 0) {
    return undefined;
  }
  if (state.waterfallType === 'hybrid') {
    return undefined;
  }

  const fundLifeYears = state.fundLife ?? 10;
  const investmentPeriodYears = Math.min(fundLifeYears, state.investmentPeriod ?? 5);
  const primaryTier =
    state.waterfallTiers.find((tier) => tier.gpSplit > 0) ?? state.waterfallTiers[0];

  return {
    version: 'v1',
    timeline: {
      fundLifeYears,
      period: 'annual',
      ...spreadIfDefined('vintageYear', state.vintageYear),
    },
    feeModel: {
      source: 'legacy_fee_profiles',
      defaultRate: percentToRatio(state.managementFeeRate),
      defaultBasis: 'committed_capital',
    },
    expenseModel: {
      source: 'legacy_fund_expenses',
    },
    exitModel: {
      mode: 'cohort',
      cohort: {
        exitDistributionByYear: defaultExitDistribution(fundLifeYears, investmentPeriodYears),
        grossMultiple: 2.5,
        lossRatio: 0,
      },
    },
    recyclingModel: {
      enabled: state.recyclingEnabled ?? false,
      sources: recyclingSources(state.recyclingType),
      capPctOfCommitments: recyclingCapToRatio(state.recyclingCap, state.fundSize),
      ...(state.recyclingPeriod != null && {
        eligibleThroughYear: Math.max(1, Math.ceil(state.recyclingPeriod)),
      }),
      exitProceedsRecyclePct: percentToRatio(state.exitRecyclingRate),
      timing: 'before_waterfall',
    },
    waterfallModel: {
      type: 'american',
      carryPct: percentToRatio(primaryTier?.gpSplit ?? state.carriedInterest ?? 20),
      hurdleRate: percentToRatio(primaryTier?.preferredReturn ?? 8),
      prefType: primaryTier?.preferredReturn === 0 ? 'none' : 'compounded',
      prefCompounding: 'annual',
      prefCatchUp: (primaryTier?.catchUp ?? 0) > 0,
      catchUpRate: percentToRatio(primaryTier?.catchUp ?? 100),
      catchUpTargetCarryPct: percentToRatio(primaryTier?.gpSplit ?? state.carriedInterest ?? 20),
      clawbackEnabled: true,
      clawbackTrigger: 'final_liquidation',
      escrowPct: 0,
      feeOffsetTreatment: 'none',
    },
    gpCommitmentModel: {
      commitmentAmount: state.gpCommitment ?? 0,
      participatesInInvestmentReturns: true,
    },
  };
}

function hydrateLPClasses(
  lpClasses: NonNullable<FundDraftWriteV1['lpClasses']>
): FundState['lpClasses'] {
  return lpClasses.map((lpClass: DraftLPClass): FundState['lpClasses'][number] => ({
    id: lpClass.id,
    name: lpClass.name,
    targetAllocation: lpClass.targetAllocation,
    ...spreadIfDefined('managementFeeRate', lpClass.managementFeeRate),
    ...spreadIfDefined('carriedInterest', lpClass.carriedInterest),
    ...spreadIfDefined('preferredReturn', lpClass.preferredReturn),
  }));
}

function hydrateLPs(lps: NonNullable<FundDraftWriteV1['lps']>): FundState['lps'] {
  return lps.map((lp: DraftLP): FundState['lps'][number] => ({
    id: lp.id,
    name: lp.name,
    commitment: lp.commitment,
    type: lp.type,
    ...spreadIfDefined('lpClassId', lp.lpClassId),
  }));
}

function hydrateCapitalPlanAllocations(
  allocations: NonNullable<FundDraftWriteV1['capitalPlanAllocations']>
): FundState['capitalPlanAllocations'] {
  return allocations.map(
    (allocation: DraftCapitalPlanAllocation): FundState['capitalPlanAllocations'][number] => ({
      id: allocation.id,
      name: allocation.name,
      entryRound: allocation.entryRound,
      capitalAllocationPct: allocation.capitalAllocationPct,
      initialCheckStrategy: allocation.initialCheckStrategy,
      followOnStrategy: allocation.followOnStrategy,
      followOnParticipationPct: allocation.followOnParticipationPct,
      investmentHorizonMonths: allocation.investmentHorizonMonths,
      ...spreadIfDefined('sectorProfileId', allocation.sectorProfileId),
      ...spreadIfDefined('initialCheckAmount', allocation.initialCheckAmount),
      ...spreadIfDefined('initialOwnershipPct', allocation.initialOwnershipPct),
      ...spreadIfDefined('followOnAmount', allocation.followOnAmount),
    })
  );
}

function hydrateWaterfallTiers(
  tiers: NonNullable<FundDraftWriteV1['waterfallTiers']>
): FundState['waterfallTiers'] {
  return tiers.map((tier: DraftWaterfallTier): FundState['waterfallTiers'][number] => ({
    id: tier.id,
    name: tier.name,
    gpSplit: tier.gpSplit,
    lpSplit: tier.lpSplit,
    ...spreadIfDefined('preferredReturn', tier.preferredReturn),
    ...spreadIfDefined('catchUp', tier.catchUp),
    ...spreadIfDefined('condition', tier.condition),
    ...spreadIfDefined('conditionValue', tier.conditionValue),
  }));
}

function hydrateFeeProfiles(
  feeProfiles: NonNullable<FundDraftWriteV1['feeProfiles']>
): FundState['feeProfiles'] {
  return feeProfiles.map((profile: DraftFeeProfile): FundState['feeProfiles'][number] => ({
    id: profile.id,
    name: profile.name,
    feeTiers: profile.feeTiers.map(
      (tier: DraftFeeTier): FundState['feeProfiles'][number]['feeTiers'][number] => ({
        id: tier.id,
        name: tier.name,
        percentage: tier.percentage,
        feeBasis: tier.feeBasis,
        startMonth: tier.startMonth,
        ...spreadIfDefined('endMonth', tier.endMonth),
        ...spreadIfDefined('recyclingPercentage', tier.recyclingPercentage),
      })
    ),
  }));
}

function hydrateFundExpenses(
  expenses: NonNullable<FundDraftWriteV1['fundExpenses']>
): FundState['fundExpenses'] {
  return expenses.map((expense: DraftFundExpense): FundState['fundExpenses'][number] => ({
    id: expense.id,
    category: expense.category,
    monthlyAmount: expense.monthlyAmount,
    startMonth: expense.startMonth,
    ...spreadIfDefined('endMonth', expense.endMonth),
  }));
}

/**
 * Maps fund store state to FundCreateV1 (POST /api/funds).
 *
 * Applies provisional compatibility defaults matching map-fund-store-to-payload.ts:21-29.
 * JSDoc: these defaults exist for backward compat; Phase 2A reconciles.
 *
 * @unit managementFee: decimal ratio (store percent / 100)
 * @unit carryPercentage: decimal ratio (store percent / 100)
 */
export function fundStoreToCreateV1(state: FundStateSlice): FundCreateV1 {
  const currentYear = new Date().getFullYear();

  const defaultedFields: string[] = [];
  if (!state.fundName?.trim()) defaultedFields.push('name');
  if (state.fundSize == null) defaultedFields.push('size');
  if (state.managementFeeRate == null) defaultedFields.push('managementFee');
  if (state.carriedInterest == null) defaultedFields.push('carryPercentage');
  if (state.vintageYear == null) defaultedFields.push('vintageYear');

  if (defaultedFields.length > 0) {
    console.warn('create-defaults-applied', { defaultedFields });
  }

  return {
    name: state.fundName?.trim() || 'Untitled Fund',
    /** @provisional size=0 means user did not enter a value */
    size: state.fundSize ?? 0,
    managementFee: (state.managementFeeRate ?? 0) / 100,
    carryPercentage: (state.carriedInterest ?? 0) / 100,
    vintageYear: state.vintageYear ?? currentYear,
  };
}

/**
 * Maps full fund store state to FundDraftWriteV1 (PUT /api/funds/:id/draft).
 *
 * Sends ALL config fields from the store (30+ fields).
 * Full-replace PUT semantics: missing = "not set".
 * This fixes the data-loss bug where ReviewStep previously sent ~10 of ~30 fields.
 */
export function fundStoreToDraftWriteV1(
  state: FundStateSlice,
  options: EconomicsAdapterOptions = {}
): FundDraftWriteV1 {
  const draft: FundDraftWriteV1 = {
    fundName: state.fundName?.trim() || 'Untitled Fund',
  };

  // Fund Basics
  if (state.fundSize != null) draft.fundSize = state.fundSize;
  if (state.vintageYear != null) draft.vintageYear = state.vintageYear;
  if (state.managementFeeRate != null) draft.managementFeeRate = state.managementFeeRate;
  if (state.carriedInterest != null) draft.carriedInterest = state.carriedInterest;
  if (state.establishmentDate != null) draft.establishmentDate = state.establishmentDate;
  if (state.isEvergreen != null) draft.isEvergreen = state.isEvergreen;
  if (state.fundLife != null) draft.fundLife = state.fundLife;
  if (state.investmentPeriod != null) draft.investmentPeriod = state.investmentPeriod;
  if (state.gpCommitment != null) draft.gpCommitment = state.gpCommitment;

  // Capital Structure
  if (state.lpClasses.length > 0) draft.lpClasses = state.lpClasses;
  if (state.lps.length > 0) draft.lps = state.lps;

  // Investment Strategy
  if (state.stages.length > 0) draft.stages = state.stages;
  if (state.sectorProfiles.length > 0) draft.sectorProfiles = state.sectorProfiles;
  if (state.allocations.length > 0) draft.allocations = state.allocations;
  if (state.followOnChecks) draft.followOnChecks = state.followOnChecks;

  // Capital Plan
  if (state.capitalStageAllocations.length > 0)
    draft.capitalStageAllocations = state.capitalStageAllocations;
  if (state.capitalPlanAllocations.length > 0)
    draft.capitalPlanAllocations = state.capitalPlanAllocations;

  // Investment Pipeline
  if (state.pipelineProfiles.length > 0) draft.pipelineProfiles = state.pipelineProfiles;

  // Distributions & Carry
  if (state.waterfallType != null) draft.waterfallType = state.waterfallType;
  if (state.waterfallTiers.length > 0) draft.waterfallTiers = state.waterfallTiers;
  if (state.recyclingEnabled != null) draft.recyclingEnabled = state.recyclingEnabled;
  if (state.recyclingType != null) draft.recyclingType = state.recyclingType;
  if (state.recyclingCap != null) draft.recyclingCap = state.recyclingCap;
  if (state.recyclingPeriod != null) draft.recyclingPeriod = state.recyclingPeriod;
  if (state.exitRecyclingRate != null) draft.exitRecyclingRate = state.exitRecyclingRate;
  if (state.mgmtFeeRecyclingRate != null) draft.mgmtFeeRecyclingRate = state.mgmtFeeRecyclingRate;
  if (state.allowFutureRecycling != null) draft.allowFutureRecycling = state.allowFutureRecycling;

  // Fees & Expenses
  if (state.feeProfiles.length > 0) draft.feeProfiles = state.feeProfiles;
  if (state.fundExpenses.length > 0) draft.fundExpenses = state.fundExpenses;
  if (options.includeEconomicsAssumptions === true) {
    const economicsAssumptions = buildEconomicsAssumptionsFromState(state);
    if (economicsAssumptions != null) {
      draft.economicsAssumptions = economicsAssumptions;
    }
  }

  return draft;
}

/**
 * Maps a server draft payload back into the routed wizard store.
 *
 * Missing fields are interpreted against the routed wizard's seeded defaults,
 * not the partially persisted client cache. This keeps post-bootstrap resume
 * deterministic and server-authoritative.
 */
export function fundDraftWriteV1ToStoreHydrationPatch(
  draft: FundDraftWriteV1,
  defaults: DraftHydrationDefaults
): Partial<FundState> {
  return {
    fundName: draft.fundName,
    lpClasses: draft.lpClasses ? hydrateLPClasses(draft.lpClasses) : defaults.lpClasses,
    lps: draft.lps ? hydrateLPs(draft.lps) : defaults.lps,
    stages: draft.stages ?? defaults.stages,
    sectorProfiles: draft.sectorProfiles ?? defaults.sectorProfiles,
    allocations: draft.allocations ?? defaults.allocations,
    followOnChecks: draft.followOnChecks ?? defaults.followOnChecks,
    capitalStageAllocations: draft.capitalStageAllocations ?? defaults.capitalStageAllocations,
    capitalPlanAllocations: draft.capitalPlanAllocations
      ? hydrateCapitalPlanAllocations(draft.capitalPlanAllocations)
      : defaults.capitalPlanAllocations,
    pipelineProfiles: draft.pipelineProfiles ?? defaults.pipelineProfiles,
    waterfallTiers: draft.waterfallTiers
      ? hydrateWaterfallTiers(draft.waterfallTiers)
      : defaults.waterfallTiers,
    feeProfiles: draft.feeProfiles ? hydrateFeeProfiles(draft.feeProfiles) : defaults.feeProfiles,
    fundExpenses: draft.fundExpenses
      ? hydrateFundExpenses(draft.fundExpenses)
      : defaults.fundExpenses,
    economicsAssumptions: draft.economicsAssumptions ?? defaults.economicsAssumptions,
    ...spreadIfDefined('fundSize', draft.fundSize),
    ...spreadIfDefined('vintageYear', draft.vintageYear),
    ...spreadIfDefined('managementFeeRate', draft.managementFeeRate),
    ...spreadIfDefined('carriedInterest', draft.carriedInterest),
    ...spreadIfDefined('establishmentDate', draft.establishmentDate),
    ...spreadIfDefined('isEvergreen', draft.isEvergreen ?? defaults.isEvergreen),
    ...spreadIfDefined('fundLife', draft.fundLife),
    ...spreadIfDefined('investmentPeriod', draft.investmentPeriod),
    ...spreadIfDefined('gpCommitment', draft.gpCommitment),
    ...spreadIfDefined('waterfallType', draft.waterfallType ?? defaults.waterfallType),
    ...spreadIfDefined('recyclingEnabled', draft.recyclingEnabled ?? defaults.recyclingEnabled),
    ...spreadIfDefined('recyclingType', draft.recyclingType ?? defaults.recyclingType),
    ...spreadIfDefined('recyclingCap', draft.recyclingCap),
    ...spreadIfDefined('recyclingPeriod', draft.recyclingPeriod),
    ...spreadIfDefined('exitRecyclingRate', draft.exitRecyclingRate ?? defaults.exitRecyclingRate),
    ...spreadIfDefined(
      'mgmtFeeRecyclingRate',
      draft.mgmtFeeRecyclingRate ?? defaults.mgmtFeeRecyclingRate
    ),
    ...spreadIfDefined(
      'allowFutureRecycling',
      draft.allowFutureRecycling ?? defaults.allowFutureRecycling
    ),
  };
}

/**
 * Maps fund store state to FundFinalizeV1 (POST /api/funds/finalize).
 *
 * Merges the required create fields (with unit conversion) and all optional
 * draft config fields into a single atomic payload for the finalize endpoint.
 *
 * @unit managementFee: decimal ratio (store percent / 100)
 * @unit carryPercentage: decimal ratio (store percent / 100)
 */
export function fundStoreToFinalizeV1(
  state: FundStateSlice,
  options: EconomicsAdapterOptions = {}
): import('@shared/contracts/fund-finalize-v1.contract').FundFinalizeV1 {
  const currentYear = new Date().getFullYear();

  // ── Required fund-level fields (same logic as fundStoreToCreateV1) ──
  const result: import('@shared/contracts/fund-finalize-v1.contract').FundFinalizeV1 = {
    name: state.fundName?.trim() || 'Untitled Fund',
    size: state.fundSize ?? 0,
    managementFee: (state.managementFeeRate ?? 0) / 100,
    carryPercentage: (state.carriedInterest ?? 0) / 100,
    vintageYear: state.vintageYear ?? currentYear,
  };

  if (state.draftServerReady && state.draftFundId != null) {
    result.draftFundId = state.draftFundId;
  }

  // ── Optional draft config fields (same logic as fundStoreToDraftWriteV1) ──
  if (state.establishmentDate != null) result.establishmentDate = state.establishmentDate;
  if (state.isEvergreen != null) result.isEvergreen = state.isEvergreen;
  if (state.fundLife != null) result.fundLife = state.fundLife;
  if (state.investmentPeriod != null) result.investmentPeriod = state.investmentPeriod;
  if (state.gpCommitment != null) result.gpCommitment = state.gpCommitment;

  // Capital Structure
  if (state.lpClasses.length > 0) result.lpClasses = state.lpClasses;
  if (state.lps.length > 0) result.lps = state.lps;

  // Investment Strategy
  if (state.stages.length > 0) result.stages = state.stages;
  if (state.sectorProfiles.length > 0) result.sectorProfiles = state.sectorProfiles;
  if (state.allocations.length > 0) result.allocations = state.allocations;
  if (state.followOnChecks) result.followOnChecks = state.followOnChecks;

  // Capital Plan
  if (state.capitalStageAllocations.length > 0)
    result.capitalStageAllocations = state.capitalStageAllocations;
  if (state.capitalPlanAllocations.length > 0)
    result.capitalPlanAllocations = state.capitalPlanAllocations;

  // Investment Pipeline
  if (state.pipelineProfiles.length > 0) result.pipelineProfiles = state.pipelineProfiles;

  // Distributions & Carry
  if (state.waterfallType != null) result.waterfallType = state.waterfallType;
  if (state.waterfallTiers.length > 0) result.waterfallTiers = state.waterfallTiers;
  if (state.recyclingEnabled != null) result.recyclingEnabled = state.recyclingEnabled;
  if (state.recyclingType != null) result.recyclingType = state.recyclingType;
  if (state.recyclingCap != null) result.recyclingCap = state.recyclingCap;
  if (state.recyclingPeriod != null) result.recyclingPeriod = state.recyclingPeriod;
  if (state.exitRecyclingRate != null) result.exitRecyclingRate = state.exitRecyclingRate;
  if (state.mgmtFeeRecyclingRate != null) result.mgmtFeeRecyclingRate = state.mgmtFeeRecyclingRate;
  if (state.allowFutureRecycling != null) result.allowFutureRecycling = state.allowFutureRecycling;

  // Fees & Expenses
  if (state.feeProfiles.length > 0) result.feeProfiles = state.feeProfiles;
  if (state.fundExpenses.length > 0) result.fundExpenses = state.fundExpenses;
  if (options.includeEconomicsAssumptions === true) {
    const economicsAssumptions = buildEconomicsAssumptionsFromState(state);
    if (economicsAssumptions != null) {
      result.economicsAssumptions = economicsAssumptions;
    }
  }

  return result;
}
