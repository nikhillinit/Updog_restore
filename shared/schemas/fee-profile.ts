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
  })
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
 * Calculate management fees for a given period
 *
 * @param profile - Fee profile with its tiers, holidays, and caps
 * @param context - Basis amounts for the current period
 * @param periodMonths - Length of the period in months (default 1, one month)
 *
 * Capital-stock tiers charge the annual rate pro-rated by the period length,
 * because the basis is a balance that is held through the whole period.
 * Period-flow tiers (see `isPeriodFlowFeeBasis`) charge the annual rate once on
 * the amount that moved during the period, with no pro-rating: the amount is
 * already confined to that period, so pro-rating it a second time would make
 * the total fee depend on the modeling granularity.
 */
export function calculateManagementFees(
  profile: FeeProfile,
  context: FeeCalculationContext,
  periodMonths = 1
): Decimal {
  let totalFees = new Decimal(0);
  const currentYear = Math.floor(context.currentMonth / 12) + 1;

  // Check if in fee holiday
  if (profile.feeHolidays) {
    const inHoliday = profile.feeHolidays.some((holiday) => {
      const holidayEnd = holiday.startMonth + holiday.durationMonths;
      return context.currentMonth >= holiday.startMonth && context.currentMonth < holidayEnd;
    });
    if (inHoliday) return new Decimal(0);
  }

  // Calculate fees from active tiers
  for (const tier of profile.tiers) {
    const tierActive =
      currentYear >= tier.startYear && (!tier.endYear || currentYear <= tier.endYear);

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
