import type { EconomicsFeeTierV1 } from '../../contracts/economics-v1.contract';
import { Decimal } from '../decimal-config';
import { toFixedDecimalString } from '../decimal-string';

export const FEE_DRAG_COMPILER_VERSION = 'fee-drag-compiler/1.0.0' as const;

export class FeeProfileAbsentError extends Error {
  readonly code = 'FEE_PROFILE_ABSENT' as const;

  constructor() {
    super('At least one fee tier is required to compile annual fee drag.');
    this.name = 'FeeProfileAbsentError';
  }
}

export class InvalidFeeDragHorizonError extends Error {
  readonly code = 'INVALID_FEE_DRAG_HORIZON' as const;

  constructor(horizonYears: number) {
    super(`horizonYears must be a positive integer; received ${horizonYears}.`);
    this.name = 'InvalidFeeDragHorizonError';
  }
}

export function compileAnnualFeeDrag(
  tiers: EconomicsFeeTierV1[] | undefined,
  opts: { horizonYears: number }
): { annualFeeDragPct: string; compilerVersion: string } {
  if (!Number.isInteger(opts.horizonYears) || opts.horizonYears <= 0) {
    throw new InvalidFeeDragHorizonError(opts.horizonYears);
  }

  if (!tiers || tiers.length === 0) {
    throw new FeeProfileAbsentError();
  }

  let totalRate = new Decimal(0);

  for (let year = 1; year <= opts.horizonYears; year += 1) {
    let applicableTier: EconomicsFeeTierV1 | undefined;

    // Basis is intentionally ignored: this compiler flattens the shared fee inputs to one rate.
    for (const tier of tiers) {
      if (tier.startYear <= year && year <= (tier.endYear ?? opts.horizonYears)) {
        // Array order is semantic; replacing each match makes the last matching tier win.
        applicableTier = tier;
      }
    }

    totalRate = totalRate.plus(applicableTier?.rate ?? 0);
  }

  return {
    annualFeeDragPct: toFixedDecimalString(totalRate.div(opts.horizonYears), 12),
    compilerVersion: FEE_DRAG_COMPILER_VERSION,
  };
}
