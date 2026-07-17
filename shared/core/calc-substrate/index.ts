/**
 * Tranche 1 calculation substrate (ADR-042).
 *
 * Additive contracts only: nothing here changes production calculation
 * behavior. Engines adopt this substrate explicitly in later tranches.
 */

export {
  CALC_SUBSTRATE_CONTRACT_VERSION,
  CalcBasisSchema,
  CalcModeSchema,
  CalculationKeySchema,
  Sha256HexSchema,
  type CalcBasis,
  type CalcMode,
} from './calc-basis';
export { CALC_REASON_CODES, CalcReasonCodeSchema, type CalcReasonCode } from './reason-codes';
export {
  CalcResultStateSchema,
  GenericCalcResultSchema,
  createCalcResultSchema,
  toDatasetTrustState,
  type CalcResult,
  type CalcResultState,
} from './calc-result';
export {
  HashAdmissionError,
  RESULT_HASH_DOMAIN,
  admitForHashing,
  buildResultHashPreimage,
  computeResultHash,
  normalizeDecimalString,
  type ResultHashPreimage,
} from './hash-admission';
export { assertValidSeed, createDeterministicRng, type CalcRng } from './deterministic-rng';
export { createFixedClock, type CalcClock } from './fixed-clock';
export {
  createCalculationContext,
  type CalculationContext,
  type CalculationContextOptions,
} from './calculation-context';
