import type { CapitalFeeExpenseSourceFactsV1 } from '../../contracts/capital-planning-v1.contract';
import { Decimal } from '../decimal-config';
import { computeFeeBasisTimeline, type FeeBasisConfig } from '../fund-math';

/** Input tiers have already passed capital admission, including whole-year alignment. */
export function feeTiersToFeeProfile(
  tiers: CapitalFeeExpenseSourceFactsV1['feeTiers']
): NonNullable<FeeBasisConfig['feeProfile']> {
  // The legacy parser rejects equal-start/additive tiers and inclusive single-year tiers.
  // The timeline accepts both; retain source order and pass the validated typed profile.
  return {
    id: 'capital-planning',
    name: 'Capital planning committed-capital fees',
    tiers: tiers.map((tier) => ({
      basis: tier.basis,
      annualRatePercent: new Decimal(tier.rate.rawValue).div(
        tier.rate.sourceUnit === 'percent_points' ? 100 : 1
      ),
      startYear: tier.period.normalizedStartMonth / 12 + 1,
      endYear: (tier.period.normalizedEndMonth + 1) / 12,
    })),
  };
}

export function computeCapitalLifetimeFees(
  commitmentsUsd: Decimal,
  fundLifeYears: number,
  tiers: CapitalFeeExpenseSourceFactsV1['feeTiers']
): Decimal {
  return computeFeeBasisTimeline({
    fundSize: commitmentsUsd,
    numQuarters: fundLifeYears * 4,
    feeProfile: feeTiersToFeeProfile(tiers),
  }).totalFees;
}
