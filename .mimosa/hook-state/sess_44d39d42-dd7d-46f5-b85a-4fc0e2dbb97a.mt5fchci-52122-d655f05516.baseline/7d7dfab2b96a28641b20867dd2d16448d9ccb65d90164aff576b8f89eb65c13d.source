/**
 * Versioned calculation context (Tranche 1 substrate).
 *
 * Bundles the injected deterministic RNG, the injected fixed clock, the
 * calculation key, and a frozen flag snapshot so that a deterministic kernel
 * receives every ambient capability explicitly and can never reach for
 * Math.random, new Date(), or process.env.
 */

import { CALC_SUBSTRATE_CONTRACT_VERSION, CalculationKeySchema } from './calc-basis';
import { createDeterministicRng, type CalcRng } from './deterministic-rng';
import { createFixedClock, type CalcClock } from './fixed-clock';

export interface CalculationContext {
  readonly contractVersion: typeof CALC_SUBSTRATE_CONTRACT_VERSION;
  readonly calculationKey: string;
  readonly rng: CalcRng;
  readonly clock: CalcClock;
  readonly flags: Readonly<Record<string, boolean>>;
}

export interface CalculationContextOptions {
  calculationKey: string;
  seed: number;
  /** Z-suffixed ISO-8601 UTC instant the calculation is pinned to. */
  asOf: string;
  flags?: Record<string, boolean>;
}

export function createCalculationContext(options: CalculationContextOptions): CalculationContext {
  const calculationKey = CalculationKeySchema.parse(options.calculationKey);
  const rng = createDeterministicRng(options.seed);
  const clock = createFixedClock(options.asOf);
  const flags = Object.freeze({ ...(options.flags ?? {}) });
  return Object.freeze({
    contractVersion: CALC_SUBSTRATE_CONTRACT_VERSION,
    calculationKey,
    rng,
    clock,
    flags,
  });
}
