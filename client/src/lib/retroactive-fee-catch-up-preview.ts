/**
 * Retroactive Fee Catch-Up Preview
 *
 * Turns the wizard fee inputs into the amounts that the shared fee engine
 * charges. The preview calls `calculateManagementFeeBreakdown`, thus the
 * numbers on the screen come from the same code that runs the model.
 *
 * The catch-up here is a management fee setting. It is not the GP carry
 * catch-up of the distribution waterfall.
 *
 * Amounts are percentages of the fee basis, because the wizard fee step does
 * not know the fund size.
 *
 * @see shared/schemas/fee-profile.ts
 */

import Decimal from '@shared/lib/decimal-config';
import {
  calculateManagementFeeBreakdown,
  type FeeProfile,
  type FeeCalculationContext,
} from '@shared/schemas/fee-profile';
import type { FeeBasis } from '@/schemas/modeling-wizard.schemas';

/** Nominal basis. A fee of 2 against this basis reads as 2 percent. */
const NOMINAL_BASIS = new Decimal(100);

export interface RetroactiveFeeCatchUpPreviewInput {
  /** Annual management fee rate (%) */
  rate: number;
  /** Fee basis of the wizard step */
  basis: FeeBasis;
  /** First fund year in which the fund charges fees */
  firstFeeYear: number;
  /** Charge the missed fee months in the first fee period */
  enabled: boolean;
  /** Month from fund inception when fee accrual starts */
  accrualStartMonth: number;
  /** Optional limit on the number of missed months */
  maxCatchUpMonths?: number | undefined;
}

export interface RetroactiveFeeCatchUpPreview {
  /** First month in which the fund charges fees */
  firstFeeMonth: number;
  /** Months between the accrual start and the first fee month */
  missedMonths: number;
  /** Missed months that the catch-up charges after the limit applies */
  chargedMonths: number;
  /** Months that the limit removed */
  cappedMonths: number;
  /** Recurring monthly fee as a percentage of the fee basis */
  monthlyPercentOfBasis: number;
  /** Retroactive catch-up as a percentage of the fee basis */
  catchUpPercentOfBasis: number;
}

/** Map the wizard fee basis onto the fee profile basis */
const BASIS_MAP: Record<FeeBasis, FeeProfile['tiers'][number]['basis']> = {
  committed: 'committed_capital',
  called: 'called_capital_cumulative',
  fmv: 'fair_market_value',
};

/** Human-readable name of the fee basis */
export const BASIS_LABEL: Record<FeeBasis, string> = {
  committed: 'committed capital',
  called: 'called capital',
  fmv: 'fair market value',
};

/**
 * Build the fee profile that the wizard inputs describe
 */
function buildPreviewProfile(input: RetroactiveFeeCatchUpPreviewInput): FeeProfile {
  return {
    id: 'wizard-preview',
    name: 'Wizard fee preview',
    tiers: [
      {
        basis: BASIS_MAP[input.basis],
        annualRatePercent: new Decimal(input.rate).div(100),
        startYear: input.firstFeeYear,
      },
    ],
    retroactiveFeeCatchUp: {
      enabled: input.enabled,
      accrualStartMonth: input.accrualStartMonth,
      ...(input.maxCatchUpMonths === undefined ? {} : { maxCatchUpMonths: input.maxCatchUpMonths }),
    },
  };
}

/**
 * Build the context that gives every basis the nominal amount
 */
function buildPreviewContext(currentMonth: number): FeeCalculationContext {
  return {
    committedCapital: NOMINAL_BASIS,
    calledCapitalPeriod: NOMINAL_BASIS,
    calledCapitalCumulative: NOMINAL_BASIS,
    calledCapitalNetOfReturns: NOMINAL_BASIS,
    investedCapital: NOMINAL_BASIS,
    fairMarketValue: NOMINAL_BASIS,
    unrealizedCost: NOMINAL_BASIS,
    currentMonth,
  };
}

/**
 * Compute what the retroactive fee catch-up charges
 *
 * @param input - Wizard fee inputs
 * @returns Preview amounts, or null when the inputs are not usable yet
 */
export function previewRetroactiveFeeCatchUp(
  input: RetroactiveFeeCatchUpPreviewInput
): RetroactiveFeeCatchUpPreview | null {
  if (!Number.isFinite(input.rate) || input.rate < 0) {
    return null;
  }
  if (!Number.isInteger(input.firstFeeYear) || input.firstFeeYear < 1) {
    return null;
  }
  if (!Number.isInteger(input.accrualStartMonth) || input.accrualStartMonth < 0) {
    return null;
  }
  if (
    input.maxCatchUpMonths !== undefined &&
    (!Number.isInteger(input.maxCatchUpMonths) || input.maxCatchUpMonths <= 0)
  ) {
    return null;
  }

  const firstFeeMonth = (input.firstFeeYear - 1) * 12;
  if (input.accrualStartMonth > firstFeeMonth) {
    return null;
  }

  const profile = buildPreviewProfile(input);
  const breakdown = calculateManagementFeeBreakdown(profile, buildPreviewContext(firstFeeMonth));

  const missedMonths = firstFeeMonth - input.accrualStartMonth;
  const chargedMonths = breakdown.retroactiveCatchUpMonths;

  return {
    firstFeeMonth,
    missedMonths,
    chargedMonths,
    cappedMonths: Math.max(0, missedMonths - chargedMonths),
    monthlyPercentOfBasis: breakdown.recurringFees.toNumber(),
    catchUpPercentOfBasis: breakdown.retroactiveCatchUpFees.toNumber(),
  };
}
