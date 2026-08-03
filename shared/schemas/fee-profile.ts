/**
 * FeeProfile Schema
 * Parameterized fee structure with multiple bases, step-downs, and recycling
 */

import { z } from 'zod';
import Decimal from '@shared/lib/decimal-config';
import { ZodPercentage, ZodPositiveDecimal } from './decimal-zod';

/**
 * Fee calculation bases (what the fee percentage applies to)
 */
export const FeeBasisTypeSchema = z.enum([
  'committed_capital', // Total fund commitment
  'called_capital_period', // Capital called during this period only
  'called_capital_cumulative', // All capital called to date
  'called_capital_net_of_returns', // Called capital minus distributions
  'invested_capital', // Capital deployed in investments
  'fair_market_value', // Current portfolio FMV
  'unrealized_cost', // Cost basis of unrealized investments
]);

export type FeeBasisType = z.infer<typeof FeeBasisTypeSchema>;

/**
 * Capital-stock fee bases: balances that persist through the period.
 *
 * `called_capital_period` is deliberately absent. It is a flow, not a stock,
 * so it cannot cap a recycling balance in a meaningful way: a period with no
 * capital call would give a cap of zero.
 */
export const FeeCapitalStockBasisSchema = z.enum([
  'committed_capital',
  'called_capital_cumulative',
  'called_capital_net_of_returns',
  'invested_capital',
  'fair_market_value',
  'unrealized_cost',
]);

export type FeeCapitalStockBasis = z.infer<typeof FeeCapitalStockBasisSchema>;

/**
 * Fee bases that measure a flow during the period rather than a balance held
 * through it. The fee rate for these is NOT pro-rated by period length: the
 * amount already belongs to one period only, so pro-rating it would make the
 * total fee depend on the modeling granularity.
 */
const PERIOD_FLOW_BASES: ReadonlySet<FeeBasisType> = new Set<FeeBasisType>([
  'called_capital_period',
]);

/**
 * True when the basis measures capital that moves during the period.
 */
export function isPeriodFlowFeeBasis(basis: FeeBasisType): boolean {
  return PERIOD_FLOW_BASES.has(basis);
}

/**
 * Single fee tier with basis, rate, and timing
 */
export const FeeTierSchema = z.object({
  /** Fee calculation basis */
  basis: FeeBasisTypeSchema,

  /** Annual fee rate as percentage (e.g., 0.02 = 2%) */
  annualRatePercent: ZodPercentage,

  /** Fund year when tier becomes active */
  startYear: z.number().int().positive(),

  /** Fund year when tier ends (optional, defaults to fund end) */
  endYear: z.number().int().positive().optional(),

  /** Optional fee cap as percentage of basis */
  capPercent: ZodPercentage.optional(),

  /** Optional fixed fee cap amount */
  capAmount: ZodPositiveDecimal.optional(),
});

export type FeeTier = z.infer<typeof FeeTierSchema>;

/**
 * Fee recycling policy
 */
export const FeeRecyclingPolicySchema = z
  .object({
    /** Enable fee recycling */
    enabled: z.boolean(),

    /** Maximum recyclable amount as % of committed capital */
    recyclingCapPercent: ZodPercentage,

    /** Term during which fees can be recycled (months) */
    recyclingTermMonths: z.number().int().positive(),

    /** Basis for fee recycling cap (capital-stock bases only) */
    basis: FeeCapitalStockBasisSchema.default('committed_capital'),

    /** Proactively assume recycling up to cap (for forecasting) */
    anticipatedRecycling: z.boolean().default(false),
  })
  .refine(
    (data) => !data.enabled || (data.recyclingCapPercent.gt(0) && data.recyclingTermMonths > 0),
    {
      message: 'Recycling cap and term must be positive when enabled',
      path: ['enabled'],
    }
  );

export type FeeRecyclingPolicy = z.infer<typeof FeeRecyclingPolicySchema>;

/**
 * Fee holiday (period with suspended fees)
 */
export const FeeHolidaySchema = z.object({
  /** Start month (from fund inception) */
  startMonth: z.number().int().min(0),

  /** Duration of holiday in months */
  durationMonths: z.number().int().positive(),

  /** Reason for holiday (optional documentation) */
  reason: z.string().optional(),
});

export type FeeHoliday = z.infer<typeof FeeHolidaySchema>;

/**
 * Retroactive fee catch-up policy (fee profile setting)
 *
 * When fees start later than the date from which the fund agreement lets the
 * manager accrue them, this policy charges the missed months in the first
 * month that fees are chargeable.
 *
 * IMPORTANT: This is a management fee setting. It is not the GP carry catch-up
 * of the distribution waterfall (see `shared/schemas/waterfall-policy.ts`).
 * The two settings are independent. Do not derive one from the other.
 *
 * Months in a fee holiday are waived. The policy does not charge them.
 */
export const RetroactiveFeeCatchUpPolicySchema = z.object({
  /** Enable retroactive management fee catch-up */
  enabled: z.boolean().default(false),

  /** Month from fund inception when fee accrual starts (inclusive) */
  accrualStartMonth: z.number().int().min(0).default(0),

  /** Optional limit on the number of missed months that the catch-up charges */
  maxCatchUpMonths: z.number().int().positive().optional(),
});

export type RetroactiveFeeCatchUpPolicy = z.infer<typeof RetroactiveFeeCatchUpPolicySchema>;

/**
 * Default policy for profiles that do not declare the setting.
 * Existing funds keep their current fee amounts because it is disabled.
 */
export const DEFAULT_RETROACTIVE_FEE_CATCH_UP: RetroactiveFeeCatchUpPolicy = {
  enabled: false,
  accrualStartMonth: 0,
};

const RETROACTIVE_PERIOD_FLOW_ERROR =
  'Retroactive fee catch-up requires historical monthly bases, which a period-flow basis does not provide';

function isFeeHolidayMonthInSchedule(
  feeHolidays: FeeHoliday[] | undefined,
  month: number
): boolean {
  return (feeHolidays ?? []).some((holiday) => {
    const holidayEnd = holiday.startMonth + holiday.durationMonths;
    return month >= holiday.startMonth && month < holidayEnd;
  });
}

function getActiveFeeTiers(tiers: FeeTier[], month: number): FeeTier[] {
  const year = Math.floor(month / 12) + 1;
  return tiers.filter((tier) => year >= tier.startYear && (!tier.endYear || year <= tier.endYear));
}

function resolveCatchUpValidationState(
  tiers: FeeTier[],
  feeHolidays: FeeHoliday[] | undefined,
  accrualStartMonth: number
): { applicableTiers: FeeTier[]; missedMonths: number } | undefined {
  const tierEndMonths = tiers.map((tier) =>
    tier.endYear ? tier.endYear * 12 : (tier.startYear + 1) * 12
  );
  const holidayEndMonths = (feeHolidays ?? []).map(
    (holiday) => holiday.startMonth + holiday.durationMonths
  );
  const horizonMonth = Math.max(0, ...tierEndMonths, ...holidayEndMonths);

  for (let month = Math.max(0, accrualStartMonth); month <= horizonMonth; month++) {
    const applicableTiers = getActiveFeeTiers(tiers, month);
    if (applicableTiers.length === 0 || isFeeHolidayMonthInSchedule(feeHolidays, month)) {
      continue;
    }

    let missedMonths = 0;
    for (let missedMonth = accrualStartMonth; missedMonth < month; missedMonth++) {
      if (!isFeeHolidayMonthInSchedule(feeHolidays, missedMonth)) {
        missedMonths++;
      }
    }
    return { applicableTiers, missedMonths };
  }

  return undefined;
}

/**
 * Complete fee profile
 */
export const FeeProfileSchema = z
  .object({
    /** Profile identifier */
    id: z.string(),

    /** Human-readable name */
    name: z.string(),

    /** Fee tiers (must be ordered by startYear) */
    tiers: z.array(FeeTierSchema).min(1),

    /** Months when fees step down (for reference) */
    stepDownMonths: z.array(z.number().int().positive()).optional(),

    /** Fee recycling policy */
    recyclingPolicy: FeeRecyclingPolicySchema.optional(),

    /** Fee holidays */
    feeHolidays: z.array(FeeHolidaySchema).optional(),

    /**
     * Retroactive management fee catch-up.
     * This is not the GP carry catch-up of the distribution waterfall.
     */
    retroactiveFeeCatchUp: RetroactiveFeeCatchUpPolicySchema.optional(),
  })
  .refine(
    (data) => {
      // Fee accrual cannot start after the first fee tier starts.
      const policy = data.retroactiveFeeCatchUp;
      if (!policy || !policy.enabled) {
        return true;
      }
      const firstTier = data.tiers[0];
      if (!firstTier) {
        return true;
      }
      return policy.accrualStartMonth <= (firstTier.startYear - 1) * 12;
    },
    {
      message:
        'Fee profile retroactive fee catch-up requires an accrual start month at or before the first fee tier',
      path: ['retroactiveFeeCatchUp', 'accrualStartMonth'],
    }
  )
  .refine(
    (data) => {
      const policy = data.retroactiveFeeCatchUp;
      if (!policy?.enabled) {
        return true;
      }

      const state = resolveCatchUpValidationState(
        data.tiers,
        data.feeHolidays,
        policy.accrualStartMonth
      );

      return (
        !state ||
        state.missedMonths === 0 ||
        state.applicableTiers.every((tier) => !isPeriodFlowFeeBasis(tier.basis))
      );
    },
    {
      message: RETROACTIVE_PERIOD_FLOW_ERROR,
      path: ['retroactiveFeeCatchUp'],
    }
  )
  .refine(
    (data) => {
      // Validate tiers are sorted by startYear
      for (let i = 1; i < data.tiers.length; i++) {
        const current = data.tiers[i];
        const previous = data.tiers[i - 1];
        if (!current || !previous || current.startYear <= previous.startYear) {
          return false;
        }
        // Validate endYear > startYear if present
        const tier = data.tiers[i];
        if (tier && tier.endYear && tier.endYear <= tier.startYear) {
          return false;
        }
      }
      return true;
    },
    {
      message: 'Fee tiers must be sorted by startYear and endYear must be after startYear',
      path: ['tiers'],
    }
  );

export type FeeProfile = z.infer<typeof FeeProfileSchema>;

/**
 * Fee calculation context (amounts for each basis type)
 */
export interface FeeCalculationContext {
  committedCapital: Decimal;
  /**
   * Net capital called during the current period only, floored at zero.
   * See `shared/lib/economics/called-capital-period.ts` for the definition of
   * the period boundary and of call-adjustment treatment.
   */
  calledCapitalPeriod: Decimal;
  calledCapitalCumulative: Decimal;
  calledCapitalNetOfReturns: Decimal;
  investedCapital: Decimal;
  fairMarketValue: Decimal;
  unrealizedCost: Decimal;
  currentMonth: number;
}

/**
 * Options for the management fee breakdown
 */
export interface ManagementFeeBreakdownOptions {
  /**
   * Length in months of the reporting period that starts at
   * `context.currentMonth`. The one-time retroactive catch-up is charged in the
   * period that contains the first chargeable month. Defaults to 1 month.
   */
  periodMonths?: number;
}

/**
 * Management fee breakdown for one period
 */
export interface ManagementFeeBreakdown {
  /** Recurring fee for the reporting period */
  recurringFees: Decimal;

  /** One-time retroactive fee catch-up charged in this period */
  retroactiveCatchUpFees: Decimal;

  /** Number of missed months that the catch-up charges */
  retroactiveCatchUpMonths: number;
}

/**
 * Get the retroactive fee catch-up policy of a profile.
 * Profiles that do not declare the policy get the disabled default, thus
 * existing funds keep their current fee amounts.
 */
export function resolveRetroactiveFeeCatchUpPolicy(
  profile: FeeProfile
): RetroactiveFeeCatchUpPolicy {
  return profile.retroactiveFeeCatchUp ?? DEFAULT_RETROACTIVE_FEE_CATCH_UP;
}

/**
 * Tell if a month is in a fee holiday
 */
function isFeeHolidayMonth(profile: FeeProfile, month: number): boolean {
  return isFeeHolidayMonthInSchedule(profile.feeHolidays, month);
}

/**
 * Tell if at least one fee tier is active in a month
 */
function hasActiveTier(profile: FeeProfile, month: number): boolean {
  return getActiveFeeTiers(profile.tiers, month).length > 0;
}

/**
 * Tell if fees are chargeable in a month
 */
function isChargeableMonth(profile: FeeProfile, month: number): boolean {
  return hasActiveTier(profile, month) && !isFeeHolidayMonth(profile, month);
}

/**
 * Last month that the profile can describe. Used to bound the month scan.
 */
function resolveProfileHorizonMonth(profile: FeeProfile): number {
  const tierEndMonths = profile.tiers.map((tier) =>
    tier.endYear ? tier.endYear * 12 : (tier.startYear + 1) * 12
  );
  const holidayEndMonths = (profile.feeHolidays ?? []).map(
    (holiday) => holiday.startMonth + holiday.durationMonths
  );
  return Math.max(0, ...tierEndMonths, ...holidayEndMonths);
}

/**
 * Find the first month at or after `fromMonth` in which fees are chargeable
 *
 * @returns The month, or undefined when the profile never charges fees again
 */
function resolveFirstChargeableMonth(profile: FeeProfile, fromMonth: number): number | undefined {
  const horizonMonth = resolveProfileHorizonMonth(profile);
  for (let month = Math.max(0, fromMonth); month <= horizonMonth; month++) {
    if (isChargeableMonth(profile, month)) {
      return month;
    }
  }
  return undefined;
}

/**
 * Count the missed months that the retroactive fee catch-up charges
 *
 * A month is missed when it is at or after the accrual start, before the first
 * chargeable month, and no fee holiday waives it.
 *
 * @param profile - Fee profile
 * @param currentMonth - First month of the reporting period
 * @param periodMonths - Length of the reporting period in months
 * @returns Number of missed months, or 0 when the period does not contain the
 *          first chargeable month
 */
export function resolveRetroactiveFeeCatchUpMonths(
  profile: FeeProfile,
  currentMonth: number,
  periodMonths = 1
): number {
  const policy = resolveRetroactiveFeeCatchUpPolicy(profile);
  if (!policy.enabled) {
    return 0;
  }

  const firstChargeableMonth = resolveFirstChargeableMonth(profile, policy.accrualStartMonth);
  if (firstChargeableMonth === undefined) {
    return 0;
  }

  // Charge the catch-up only in the period that contains the first fee month.
  const periodEnd = currentMonth + Math.max(1, periodMonths);
  if (firstChargeableMonth < currentMonth || firstChargeableMonth >= periodEnd) {
    return 0;
  }

  let missedMonths = 0;
  for (let month = policy.accrualStartMonth; month < firstChargeableMonth; month++) {
    if (!isFeeHolidayMonth(profile, month)) {
      missedMonths++;
    }
  }

  return policy.maxCatchUpMonths === undefined
    ? missedMonths
    : Math.min(missedMonths, policy.maxCatchUpMonths);
}

/**
 * Calculate recurring fees for a reporting period
 *
 * @param profile - Fee profile
 * @param context - Basis amounts of the reporting period
 * @param month - Month that selects the tiers and fee holidays
 * @param periodMonths - Reporting-period length in months
 */
function calculateTierFeesForPeriod(
  profile: FeeProfile,
  context: FeeCalculationContext,
  month: number,
  periodMonths: number
): Decimal {
  if (isFeeHolidayMonth(profile, month)) {
    return new Decimal(0);
  }

  const year = Math.floor(month / 12) + 1;
  let totalFees = new Decimal(0);

  for (const tier of profile.tiers) {
    const tierActive = year >= tier.startYear && (!tier.endYear || year <= tier.endYear);

    if (!tierActive) continue;

    // Get basis amount
    const basisAmount = getBasisAmount(tier.basis, context);
    const isFlowBasis = isPeriodFlowFeeBasis(tier.basis);

    // Flow bases charge the annual rate once on the period amount. Stock bases
    // are annualized, so divide by 12 for monthly and scale to the period after
    // the caps, which are expressed per month.
    let tierFees = isFlowBasis
      ? basisAmount.times(tier.annualRatePercent)
      : basisAmount.times(tier.annualRatePercent).div(12);

    // Apply caps if present
    if (tier.capPercent) {
      const cap = basisAmount.times(tier.capPercent);
      tierFees = Decimal.min(tierFees, cap);
    }
    if (tier.capAmount) {
      tierFees = Decimal.min(tierFees, tier.capAmount);
    }

    totalFees = totalFees.plus(isFlowBasis ? tierFees : tierFees.times(periodMonths));
  }

  return totalFees;
}

/**
 * Calculate the management fee parts of a period
 *
 * The retroactive catch-up uses the basis amounts of the reporting period and
 * the tier that is active in the first chargeable month. A zero basis therefore
 * gives a zero catch-up.
 *
 * @param profile - Fee profile
 * @param context - Fee calculation context
 * @param options - Reporting period options
 * @returns Recurring fee and retroactive catch-up fee for the period
 */
export function calculateManagementFeeBreakdown(
  profile: FeeProfile,
  context: FeeCalculationContext,
  options: ManagementFeeBreakdownOptions = {}
): ManagementFeeBreakdown {
  const periodMonths = options.periodMonths ?? 1;
  const recurringFees = calculateTierFeesForPeriod(
    profile,
    context,
    context.currentMonth,
    periodMonths
  );

  const retroactiveCatchUpMonths = resolveRetroactiveFeeCatchUpMonths(
    profile,
    context.currentMonth,
    periodMonths
  );

  let retroactiveCatchUpFees = new Decimal(0);
  if (retroactiveCatchUpMonths > 0) {
    const policy = resolveRetroactiveFeeCatchUpPolicy(profile);
    const firstChargeableMonth = resolveFirstChargeableMonth(profile, policy.accrualStartMonth);
    if (firstChargeableMonth !== undefined) {
      const hasPeriodFlowTier = getActiveFeeTiers(profile.tiers, firstChargeableMonth).some((tier) =>
        isPeriodFlowFeeBasis(tier.basis)
      );
      if (hasPeriodFlowTier) {
        throw new Error(RETROACTIVE_PERIOD_FLOW_ERROR);
      }

      const catchUpMonthlyFee = calculateTierFeesForPeriod(
        profile,
        context,
        firstChargeableMonth,
        1
      );
      retroactiveCatchUpFees = catchUpMonthlyFee.times(retroactiveCatchUpMonths);
    }
  }

  return {
    recurringFees,
    retroactiveCatchUpFees,
    retroactiveCatchUpMonths,
  };
}

/**
 * Calculate management fees for a given period
 *
 * @param periodMonths - Reporting-period length in months
 * @returns Recurring fee for the reporting period.
 *          Use `calculateManagementFeeBreakdown` to get the retroactive
 *          fee catch-up of the period.
 */
export function calculateManagementFees(
  profile: FeeProfile,
  context: FeeCalculationContext,
  periodMonths = 1
): Decimal {
  return calculateTierFeesForPeriod(profile, context, context.currentMonth, periodMonths);
}

/**
 * Get basis amount from context
 */
function getBasisAmount(basis: FeeBasisType, context: FeeCalculationContext): Decimal {
  switch (basis) {
    case 'committed_capital':
      return context.committedCapital;
    case 'called_capital_period':
      return context.calledCapitalPeriod;
    case 'called_capital_cumulative':
      return context.calledCapitalCumulative;
    case 'called_capital_net_of_returns':
      return context.calledCapitalNetOfReturns;
    case 'invested_capital':
      return context.investedCapital;
    case 'fair_market_value':
      return context.fairMarketValue;
    case 'unrealized_cost':
      return context.unrealizedCost;
  }
}

/**
 * Calculate recyclable fees for a period
 */
export function calculateRecyclableFees(
  profile: FeeProfile,
  feesPaid: Decimal,
  context: FeeCalculationContext
): Decimal {
  if (!profile.recyclingPolicy || !profile.recyclingPolicy.enabled) {
    return new Decimal(0);
  }

  const policy = profile.recyclingPolicy;

  // Check if within recycling term
  if (context.currentMonth > policy.recyclingTermMonths) {
    return new Decimal(0);
  }

  // Calculate recycling cap
  const basisAmount = getBasisAmount(policy.basis, context);
  const cap = basisAmount.times(policy.recyclingCapPercent);

  // Return min of fees paid and cap
  return Decimal.min(feesPaid, cap);
}
