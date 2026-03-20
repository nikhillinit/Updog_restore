/**
 * Fund Store Adapters
 *
 * Maps FundState (client store) to canonical wire formats:
 * - fundStoreToCreateV1: FundState -> FundCreateV1 (POST /api/funds)
 * - fundStoreToDraftWriteV1: FundState -> FundDraftWriteV1 (PUT /api/funds/:id/draft)
 *
 * These replace the legacy mapFundStoreToCreatePayload.
 */

import type { FundCreateV1 } from '@shared/contracts/fund-create-v1.contract';
import type { FundDraftWriteV1 } from '@shared/contracts/fund-draft-write-v1.contract';
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
>;

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
export function fundStoreToDraftWriteV1(state: FundStateSlice): FundDraftWriteV1 {
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

  return draft;
}
