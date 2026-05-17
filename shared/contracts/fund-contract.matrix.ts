/**
 * Fund Contract Field Matrix
 *
 * Documents which fields flow through POST /api/funds (create)
 * vs PUT /api/funds/:id/draft (draft save).
 *
 * POST (FundCreateV1): name, size, managementFee, carryPercentage, vintageYear,
 *   modelVersion, engineResults
 *
 * PUT draft (FundDraftWriteV1): fundName + all ~30 config fields from FundState
 *   (full-replace semantics, missing = "not set")
 *
 * Overlap: fund identity (name/size/fees/vintage) appears in BOTH paths.
 * The POST path uses decimal ratios (0.02); the draft path uses store units
 * (percentage: 2.0). The client adapter handles conversion.
 */

import type { FundCreateV1 } from './fund-create-v1.contract';
import type { FundDraftWriteV1 } from './fund-draft-write-v1.contract';

// Type-level assertion: these types must be importable (compile-time check)
type _AssertCreate = FundCreateV1;
type _AssertDraft = FundDraftWriteV1;

/** Fields present in the POST create payload */
export const CREATE_FIELDS = [
  'name',
  'size',
  'managementFee',
  'carryPercentage',
  'vintageYear',
  'modelVersion',
  'engineResults',
] as const;

/** Fields present in the PUT draft payload (beyond fundName) */
export const DRAFT_CONFIG_FIELDS = [
  'fundName',
  'fundSize',
  'vintageYear',
  'managementFeeRate',
  'carriedInterest',
  'establishmentDate',
  'isEvergreen',
  'fundLife',
  'investmentPeriod',
  'gpCommitment',
  'lpClasses',
  'lps',
  'stages',
  'sectorProfiles',
  'allocations',
  'followOnChecks',
  'capitalStageAllocations',
  'capitalPlanAllocations',
  'pipelineProfiles',
  'waterfallType',
  'waterfallTiers',
  'recyclingEnabled',
  'recyclingType',
  'recyclingCap',
  'recyclingPeriod',
  'exitRecyclingRate',
  'mgmtFeeRecyclingRate',
  'allowFutureRecycling',
  'feeProfiles',
  'fundExpenses',
  'economicsAssumptions',
] as const;

// Suppress unused-variable warnings for type assertions
void (0 as unknown as _AssertCreate);
void (0 as unknown as _AssertDraft);
