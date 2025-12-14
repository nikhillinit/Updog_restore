/**
 * Capital Allocation Engine
 *
 * Exports all CA utilities and engine components.
 *
 * @see docs/CA-SEMANTIC-LOCK.md
 * @see docs/CA-IMPLEMENTATION-PLAN.md
 */

// Rounding utilities
export {
  bankersRoundPositive,
  bankersRoundSymmetric,
  dollarsToCents,
  centsToDollars,
  roundPercentDerivedToCents,
} from './rounding';

// Allocation (Largest Remainder Method)
export {
  WEIGHT_SCALE,
  normalizeWeightsToBps,
  allocateLRM,
  allocateFromDecimalWeights,
  verifyCA018,
} from './allocateLRM';

// Sorting
export {
  cmp,
  cohortSortKey,
  compareCohorts,
  sortCohorts,
  isCanonicalDate,
  validateCohortDates,
  sortAndValidateCohorts,
  type SortableCohort,
} from './sorting';

// Unit inference and validation
export {
  MILLION,
  SCALE_INFERENCE_THRESHOLD,
  MISMATCH_RATIO_THRESHOLD,
  inferUnitScale,
  inferUnitScaleType,
  toCentsWithInference,
  fromCentsWithInference,
  detectUnitMismatch,
  validateUnitConsistency,
  normalizeFieldsToCents,
  validateAndNormalizeCAInput,
  type UnitScale,
  type CAInputValidation,
} from './units';
