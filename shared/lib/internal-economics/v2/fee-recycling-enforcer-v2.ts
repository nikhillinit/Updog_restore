import { Decimal } from '../../../lib/decimal-config';
import type {
  V2CoreRefusal,
  V2RefusalCode,
  V2Stage,
} from '../../../contracts/internal-economics/internal-economics-input-v2.contract';
import {
  calculateRecyclableFees,
  calculateManagementFeeBreakdown,
} from '../../../schemas/fee-profile';
import type { FeeProfile, FeeCalculationContext } from '../../../schemas/fee-profile';

function refuse(code: V2RefusalCode, stage: V2Stage, message: string): V2CoreRefusal {
  return { ok: false, code, stage, message };
}

const CUMULATIVE_BASES = new Set(['committed_capital', 'called_capital_cumulative']);

export interface FeeAssessmentResult {
  readonly ok: true;
  readonly feeAmount: Decimal;
  readonly recyclableAmount: Decimal;
  readonly catchUpAmount: Decimal;
  readonly lpClassId: string;
  readonly basisPeriod: string;
  readonly currentMonth: number;
}

export type FeeAssessmentOutcome =
  FeeAssessmentResult | { readonly ok: false; readonly refusal: V2CoreRefusal };

export function assessManagementFee(
  profile: FeeProfile,
  context: FeeCalculationContext,
  lpClassId: string,
  basisPeriod: string
): FeeAssessmentOutcome {
  const breakdown = calculateManagementFeeBreakdown(profile, context);
  const totalFee = breakdown.recurringFees.plus(breakdown.retroactiveCatchUpFees);

  if (totalFee.isZero()) {
    return {
      ok: true,
      feeAmount: new Decimal(0),
      recyclableAmount: new Decimal(0),
      catchUpAmount: breakdown.retroactiveCatchUpFees,
      lpClassId,
      basisPeriod,
      currentMonth: context.currentMonth,
    };
  }

  const recyclable = calculateRecyclableFees(profile, totalFee, context);

  return {
    ok: true,
    feeAmount: totalFee,
    recyclableAmount: recyclable,
    catchUpAmount: breakdown.retroactiveCatchUpFees,
    lpClassId,
    basisPeriod,
    currentMonth: context.currentMonth,
  };
}

export interface RecyclingCapacityState {
  readonly openingConsumedFeeRecycling: Decimal;
  readonly openingConsumedExitRecycling: Decimal;
  readonly currentRunConsumedFeeRecycling: Decimal;
  readonly currentRunConsumedExitRecycling: Decimal;
}

export interface RecyclingCapacityResult {
  readonly availableFeeCapacity: Decimal;
  readonly availableExitCapacity: Decimal;
}

export function validateRecyclingBasis(profile: FeeProfile): V2CoreRefusal | null {
  if (!profile.recyclingPolicy || !profile.recyclingPolicy.enabled) {
    return null;
  }
  if (!CUMULATIVE_BASES.has(profile.recyclingPolicy.basis)) {
    return refuse(
      'UNSUPPORTED_V2_RECYCLING_BASIS',
      'recycling',
      `Recycling basis '${profile.recyclingPolicy.basis}' is not a cumulative basis. V2 supports only: ${[...CUMULATIVE_BASES].join(', ')}.`
    );
  }
  return null;
}

export interface ExitRecyclingPolicy {
  readonly enabled: boolean;
  readonly capPercentOfCommitted: Decimal;
}

export function computeRecyclingCapacity(
  feeProfile: FeeProfile,
  exitPolicy: ExitRecyclingPolicy | null,
  committedCapital: Decimal,
  context: FeeCalculationContext,
  state: RecyclingCapacityState
): RecyclingCapacityResult | { ok: false; refusal: V2CoreRefusal } {
  let availableFeeCapacity = new Decimal(0);
  if (feeProfile.recyclingPolicy && feeProfile.recyclingPolicy.enabled) {
    const lifetimeCap = calculateRecyclableFees(
      feeProfile,
      new Decimal('999999999999.999999'),
      context
    );
    const totalConsumed = state.openingConsumedFeeRecycling.plus(
      state.currentRunConsumedFeeRecycling
    );
    availableFeeCapacity = lifetimeCap.minus(totalConsumed);

    if (availableFeeCapacity.lt(0)) {
      return {
        ok: false,
        refusal: refuse(
          'RECYCLING_CAPACITY_EXCEEDED',
          'recycling',
          `Fee recycling consumed (${totalConsumed.toFixed(6)}) exceeds lifetime cap (${lifetimeCap.toFixed(6)}).`
        ),
      };
    }
  }

  let availableExitCapacity = new Decimal(0);
  if (exitPolicy && exitPolicy.enabled) {
    const exitLifetimeCap = committedCapital.mul(exitPolicy.capPercentOfCommitted);
    const totalExitConsumed = state.openingConsumedExitRecycling.plus(
      state.currentRunConsumedExitRecycling
    );
    availableExitCapacity = exitLifetimeCap.minus(totalExitConsumed);

    if (availableExitCapacity.lt(0)) {
      return {
        ok: false,
        refusal: refuse(
          'RECYCLING_CAPACITY_EXCEEDED',
          'recycling',
          `Exit recycling consumed (${totalExitConsumed.toFixed(6)}) exceeds lifetime cap (${exitLifetimeCap.toFixed(6)}).`
        ),
      };
    }
  }

  return { availableFeeCapacity, availableExitCapacity };
}

export function classifyRecyclingTag(
  tag: 'fee' | 'exit' | 'none',
  amount: Decimal,
  feeProfile: FeeProfile,
  exitPolicy: ExitRecyclingPolicy | null,
  availableFeeCapacity: Decimal,
  availableExitCapacity: Decimal
):
  | { recyclableAmount: Decimal; tag: 'fee' | 'exit' | 'none' }
  | { ok: false; refusal: V2CoreRefusal } {
  if (tag === 'none') {
    return { recyclableAmount: new Decimal(0), tag: 'none' };
  }

  if (tag === 'fee') {
    if (!feeProfile.recyclingPolicy || !feeProfile.recyclingPolicy.enabled) {
      return {
        ok: false,
        refusal: refuse(
          'FEE_RECYCLING_DISABLED',
          'recycling',
          'Realization tagged as fee-recyclable but fee recycling is disabled.'
        ),
      };
    }
    const recyclable = Decimal.min(amount, availableFeeCapacity);
    return { recyclableAmount: recyclable, tag: 'fee' };
  }

  if (!exitPolicy || !exitPolicy.enabled) {
    return {
      ok: false,
      refusal: refuse(
        'FEE_RECYCLING_DISABLED',
        'recycling',
        'Realization tagged as exit-recyclable but exit recycling is disabled.'
      ),
    };
  }
  const recyclable = Decimal.min(amount, availableExitCapacity);
  return { recyclableAmount: recyclable, tag: 'exit' };
}

export function computeCalledCapitalPeriod(
  settledDeploymentContributions: readonly { amount: Decimal; partnerId: string }[],
  deploymentCorrections: readonly { amount: Decimal; partnerId: string }[]
): Decimal | { ok: false; refusal: V2CoreRefusal } {
  let total = new Decimal(0);

  for (const contribution of settledDeploymentContributions) {
    total = total.plus(contribution.amount);
  }

  for (const correction of deploymentCorrections) {
    total = total.minus(correction.amount);
  }

  if (total.lt(0)) {
    return {
      ok: false,
      refusal: refuse(
        'NEGATIVE_PERIOD_BASIS',
        'recycling',
        `Net called capital for period is negative (${total.toFixed(6)}). Corrections exceed contributions.`
      ),
    };
  }

  return total;
}
