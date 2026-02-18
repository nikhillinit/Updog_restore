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
  normalizeWeightsLenient,
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
  detectUnitMismatch,
  validateUnitConsistency,
  normalizeFieldsToCents,
  validateAndNormalizeCAInput,
  type UnitScale,
  type CAInputValidation,
} from './units';

// Types and schemas
export {
  // Constants
  FAR_FUTURE,
  WEIGHT_SUM_TOLERANCE,

  // Schemas
  CanonicalDateSchema,
  CentsSchema,
  SignedCentsSchema,
  PercentageSchema,
  CashFlowSchema,
  CohortInputSchema,
  CohortOutputSchema,
  FundInputSchema,
  ConstraintsInputSchema,
  TimelineInputSchema,
  CAEngineInputSchema,
  ViolationTypeSchema,
  ViolationSeveritySchema,
  ViolationSchema,
  ReserveBalancePointSchema,
  CAEngineOutputSchema,

  // Types
  type CashFlow,
  type FlowsInput,
  type CohortInput,
  type CohortOutput,
  type FundInput,
  type ConstraintsInput,
  type TimelineInput,
  type CAEngineInput,
  type ViolationType,
  type ViolationSeverity,
  type Violation,
  type ReserveBalancePoint,
  type CAEngineOutput,
  type InternalCohort,
  type CashLedgerState,
  type CapacityState,

  // Type guards and factories
  isImplicitCohort,
  isValidCanonicalDate,
  createEmptyOutput,
  createViolation,
} from './types';

// Input/Output adapter
export {
  adaptTruthCaseInput,
  shouldSkipTruthCase,
  centsToOutputUnits,
  formatCohortOutput,
  type TruthCaseInput,
  type NormalizedInput,
} from './adapter';

// Core engine
export {
  calculateEffectiveBuffer,
  calculateReserveBalance,
  calculateCashLedger,
  allocateCapacityToCohorts,
  executeCapitalAllocation,
  calculateCapitalAllocation,
} from './CapitalAllocationEngine';

// Invariant validators
export {
  CONSERVATION_TOLERANCE_CENTS,
  verifyCashConservation,
  verifyCapacityConservation,
  verifyBufferConstraint,
  verifyNonNegativity,
  checkAllInvariants,
  calculateExpectedReserveIndependently,
  calculateExpectedAllocationIndependently,
  type InvariantResult,
  type ConservationCheckResult,
} from './invariants';

// Period Loop Engine (Phase 2: Pacing Model)
export {
  generatePeriods,
  calculateMonthlyPacingTarget,
  calculatePeriodPacingTarget,
  getActiveCohorts,
  executePeriodLoop,
  convertPeriodLoopOutput,
  type Period,
  type PeriodResult,
  type PeriodLoopOutput,
} from './periodLoop';
