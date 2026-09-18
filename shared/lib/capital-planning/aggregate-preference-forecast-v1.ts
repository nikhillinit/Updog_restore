import { z } from 'zod';
import {
  AGGREGATE_PREFERENCE_FORECAST_VERSION,
  CAPITAL_PLANNING_DISCLOSURES,
  CAPITAL_PLANNING_PROVISIONAL_LIMITS as limits,
  AggregatePreferenceInputV1Schema,
  AggregatePreferenceResultV1Schema,
  type AggregatePreferenceInputV1,
  type AggregatePreferenceResultV1,
} from '../../contracts/capital-planning-v1.contract';
import { Decimal } from '../decimal-config';
import { assertCalculationSize, money, parseCalculation, ratio } from './calculation-support';

export { CapitalPlanningCalculationError } from './calculation-support';

const FundTermSchema = z
  .object({
    vintageYear: z.number().int().min(1900).max(2200),
    fundLifeYears: z.number().int().min(1).max(limits.maxFundYears),
  })
  .strict();

/** Representative issuer only: forecast proceeds never fund construction. */
export function calculateAggregatePreferenceForecastV1(
  candidate: AggregatePreferenceInputV1,
  context: { vintageYear: number; fundLifeYears: number }
): AggregatePreferenceResultV1 {
  assertCalculationSize(candidate, limits.maxInputBytes, 'input');
  const input = parseCalculation(AggregatePreferenceInputV1Schema, candidate, 'input');
  const term = parseCalculation(FundTermSchema, context, 'fundTerm');
  const exit = new Decimal(input.exitEquityValueUsd);
  const ownership = new Decimal(
    input.manualOwnershipOverrideRatio ?? input.asConvertedOwnershipRatio!
  );
  const own = new Decimal(input.fundLiquidationPreferenceUsd);
  const senior = new Decimal(input.totalPreferencesSeniorUsd);
  const pari = new Decimal(input.totalPreferencesPariPassuUsd);
  const junior = new Decimal(input.totalPreferencesJuniorUsd);
  const otherClaims = senior.plus(pari).plus(junior);
  const cost = new Decimal(input.investedCostUsd);
  const participating = input.preferenceType === 'participating';
  const cap =
    input.participationCap.type === 'total_payout'
      ? new Decimal(input.participationCap.capAmountUsd)
      : null;

  const seniorPaid = Decimal.min(exit, senior);
  const afterSenior = exit.minus(seniorPaid);
  const pariPaid = Decimal.min(afterSenior, own.plus(pari));
  const ownPaid = own.plus(pari).isZero()
    ? new Decimal(0)
    : pariPaid.times(own).div(own.plus(pari));
  const otherPariPaid = pariPaid.minus(ownPaid);
  const juniorPaid = Decimal.min(afterSenior.minus(pariPaid), junior);
  const residual = afterSenior.minus(pariPaid).minus(juniorPaid);
  const uncapped = participating ? ownPaid.plus(ownership.times(residual)) : ownPaid;
  const preferred = cap === null ? uncapped : Decimal.min(cap, uncapped);
  // Cap excess remains with other common; other fixed claims never change.
  const preferredCommon = residual.minus(preferred.minus(ownPaid));

  const conversionPari = Decimal.min(afterSenior, pari);
  const conversionJunior = Decimal.min(afterSenior.minus(conversionPari), junior);
  const conversionResidual = afterSenior.minus(conversionPari).minus(conversionJunior);
  const conversion = ownership.times(conversionResidual);
  const adjusted = Decimal.max(preferred, conversion);
  const baseline = ownership.times(exit);
  type OptionalMoney = AggregatePreferenceResultV1['capAttainmentUsd'];
  const available = (value: Decimal): OptionalMoney => ({
    state: 'available',
    value: money(value),
  });
  const unavailable = (
    reason: Extract<OptionalMoney, { state: 'unavailable' }>['reason']
  ): OptionalMoney => ({ state: 'unavailable', value: null, reason });
  let capAttainment: OptionalMoney;
  let conversionThreshold: OptionalMoney;
  if (!participating) {
    capAttainment = unavailable('NOT_PARTICIPATING');
    conversionThreshold = ownership.isZero()
      ? unavailable('ZERO_OWNERSHIP')
      : available(otherClaims.plus(own.div(ownership)));
  } else if (cap === null) {
    capAttainment = unavailable('UNCAPPED');
    conversionThreshold = unavailable(ownership.isZero() ? 'ZERO_OWNERSHIP' : 'UNCAPPED');
  } else {
    capAttainment = cap.eq(own)
      ? available(own.isZero() ? new Decimal(0) : senior.plus(own).plus(pari))
      : ownership.isZero()
        ? unavailable('ZERO_OWNERSHIP')
        : available(otherClaims.plus(own).plus(cap.minus(own).div(ownership)));
    conversionThreshold = ownership.isZero()
      ? unavailable('ZERO_OWNERSHIP')
      : available(otherClaims.plus(cap.div(ownership)));
  }
  const trace = (
    fund: Decimal,
    otherPari: Decimal,
    behind: Decimal,
    common: Decimal
  ): AggregatePreferenceResultV1['preferredRouteTrace'] => {
    const leaves = {
      seniorPaidUsd: money(seniorPaid),
      fundPaidUsd: money(fund),
      otherPariPaidUsd: money(otherPari),
      juniorPaidUsd: money(behind),
      otherCommonPaidUsd: money(common),
    };
    return {
      ...leaves,
      signedRoundingResidualUsd: money(
        exit.minus(Object.values(leaves).reduce((sum, value) => sum.plus(value), new Decimal(0)))
      ),
    };
  };
  const moic = (value: Decimal): AggregatePreferenceResultV1['adjustedMoic'] =>
    cost.isZero()
      ? { state: 'unavailable', value: null, reason: 'ZERO_COST' }
      : { state: 'available', value: ratio(value.div(cost)) };
  const fmv = input.manualFmvOverride ?? input.positionFmv ?? null;
  return parseCalculation(
    AggregatePreferenceResultV1Schema,
    {
      methodVersion: AGGREGATE_PREFERENCE_FORECAST_VERSION,
      input,
      effectiveOwnershipRatio: ratio(ownership),
      ownershipOrigin:
        input.manualOwnershipOverrideRatio === undefined ? 'base' : 'manual_override',
      preferredCandidateUsd: money(preferred),
      conversionCandidateUsd: money(conversion),
      selectedRoute: preferred.eq(conversion)
        ? 'indifferent'
        : preferred.gt(conversion)
          ? 'preference'
          : 'conversion',
      adjustedProceedsUsd: money(adjusted),
      noPreferenceBaselineUsd: money(baseline),
      signedPreferenceBenefitUsd: money(adjusted.minus(baseline)),
      electionUpliftUsd: money(adjusted.minus(conversion)),
      adjustedMoic: moic(adjusted),
      baselineMoic: moic(baseline),
      effectiveFmv: fmv,
      fmvUnavailableReason: fmv === null ? 'FMV_UNAVAILABLE' : null,
      capAttainmentUsd: capAttainment,
      conversionThresholdUsd: conversionThreshold,
      preferredRouteTrace: trace(preferred, otherPariPaid, juniorPaid, preferredCommon),
      conversionRouteTrace: trace(
        conversion,
        conversionPari,
        conversionJunior,
        conversionResidual.minus(conversion)
      ),
      exitBeyondFundTerm: input.exitDate >= `${term.vintageYear + term.fundLifeYears}-01-01`,
      juniorPreferenceLabel: 'Preferences Behind Position',
      disclosure: CAPITAL_PLANNING_DISCLOSURES.preference,
      constructionFunding: 'excluded',
      fixedOtherClaims: true,
      fixedResidualShare: true,
      voluntaryFullConversion: true,
    },
    'performance'
  );
}
