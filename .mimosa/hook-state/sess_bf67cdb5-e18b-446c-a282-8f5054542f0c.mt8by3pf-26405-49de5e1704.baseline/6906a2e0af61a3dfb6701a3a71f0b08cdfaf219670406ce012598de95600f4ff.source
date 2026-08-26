import {
  GraduationRateEngine,
  createDefaultGraduationConfig,
  fromLegacyGraduationRates,
  type CohortProjection,
  type GraduationConfig,
  type GraduationSummary,
  type LegacyGraduationRates,
  type Stage,
  type TransitionProbabilities,
  type TransitionResult,
} from '@shared/core/graduation/GraduationRateEngine';
import type { FundDataForReserves } from '../reserves/computeReservesFromGraduation';

export {
  GraduationRateEngine,
  createDefaultGraduationConfig,
  fromLegacyGraduationRates,
  type CohortProjection,
  type GraduationConfig,
  type GraduationSummary,
  type LegacyGraduationRates,
  type Stage,
  type TransitionProbabilities,
  type TransitionResult,
};

// Preserve the client-facing reserve-bridge helper while keeping the engine authoritative in shared/.
export function fromFundDataGraduationRates(
  graduationRates: FundDataForReserves['graduationRates'],
  expectationMode: boolean = true,
  seed: number = 42
): GraduationConfig {
  return fromLegacyGraduationRates(graduationRates, expectationMode, seed);
}
