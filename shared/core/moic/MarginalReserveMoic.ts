import Decimal from '@shared/lib/decimal-config';
import { canonicalSha256 } from '@shared/lib/canonical-hash';
import {
  MIN_DELTA_CAPITAL_FLOOR,
  MarginalReserveMoicInputV1Schema,
  MarginalReserveMoicResultV1Schema,
  type MarginalReserveMoicInputV1,
  type MarginalReserveMoicResultV1,
  type MarginalReserveStageV1,
  type StructuredWarning,
} from '@shared/contracts/marginal-reserve-moic-v1.contract';

const OUTPUT_DECIMAL_PLACES = 6;
const ZERO = new Decimal(0);
const ONE = new Decimal(1);

type CounterfactualPath = 'withDecision' | 'withoutDecision';

interface DecimalStageContribution {
  ownershipAfterRound: Decimal;
  expectedCapital: Decimal;
  expectedProceeds: Decimal;
  expectedOwnershipAtExit: Decimal;
}

interface ProjectedStage {
  stage: MarginalReserveStageV1['stage'];
  monthsFromAsOf: number;
  reachProbability: Decimal;
  conditionalExitProbability: Decimal;
  conditionalGraduationProbability: Decimal;
  conditionalFailureProbability: Decimal;
  unconditionalExitProbability: Decimal;
  unconditionalFailureProbability: Decimal;
  contribution: DecimalStageContribution;
}

interface CounterfactualProjection {
  exactExpectedProceeds: Decimal;
  exactExpectedCapital: Decimal;
  exactExpectedOwnershipAtExit: Decimal;
  expectedProceeds: Decimal;
  expectedCapital: Decimal;
  expectedOwnershipAtExit: Decimal;
  stages: ProjectedStage[];
}

interface DatedDecimalCashFlow {
  monthsFromAsOf: number;
  amount: Decimal;
}

function roundMetric(value: Decimal): Decimal {
  return value.toDecimalPlaces(OUTPUT_DECIMAL_PLACES, Decimal.ROUND_HALF_UP);
}

function formatMetric(value: Decimal): string {
  return roundMetric(value).toFixed(OUTPUT_DECIMAL_PLACES);
}

function validateProbabilityTree(stage: MarginalReserveStageV1): void {
  const exitProbability = new Decimal(stage.exitProbability);
  const graduationProbability = new Decimal(stage.graduationProbability);
  if (
    exitProbability.lt(0) ||
    exitProbability.gt(1) ||
    graduationProbability.lt(0) ||
    graduationProbability.gt(1) ||
    exitProbability.plus(graduationProbability).gt(1)
  ) {
    throw new Error(`Invalid probability tree at stage ${stage.stage}`);
  }
}

function ownershipAfterRound(
  existingOwnershipBefore: Decimal,
  preMoneyValuation: Decimal,
  roundSize: Decimal,
  fundCheck: Decimal
): Decimal {
  const postMoney = preMoneyValuation.plus(roundSize);
  if (postMoney.lte(0)) {
    throw new Error('Priced round post-money valuation must be positive');
  }

  const existingOwnershipAfter = existingOwnershipBefore.times(preMoneyValuation).div(postMoney);
  const incrementalOwnershipPurchased = fundCheck.div(postMoney);
  return existingOwnershipAfter.plus(incrementalOwnershipPurchased);
}

function projectCounterfactual(
  input: MarginalReserveMoicInputV1,
  path: CounterfactualPath
): CounterfactualProjection {
  let reachProbability = ONE;
  let ownership = new Decimal(input.currentOwnership);
  let monthsFromAsOf = 0;
  const stages: ProjectedStage[] = [];

  for (const stage of input.stages) {
    validateProbabilityTree(stage);
    monthsFromAsOf += stage.monthsFromPriorStage;

    const exitProbability = new Decimal(stage.exitProbability);
    const graduationProbability = new Decimal(stage.graduationProbability);
    const failureProbability = ONE.minus(exitProbability).minus(graduationProbability);
    const unconditionalExitProbability = reachProbability.times(exitProbability);
    const unconditionalFailureProbability = reachProbability.times(failureProbability);
    const decision = stage[path];
    const checkAmount = decision.participate ? new Decimal(decision.checkAmount) : ZERO;

    ownership = ownershipAfterRound(
      ownership,
      new Decimal(stage.preMoneyValuation),
      new Decimal(stage.roundSize),
      checkAmount
    );

    const expectedCapital = reachProbability.times(checkAmount);
    const expectedOwnershipAtExit = unconditionalExitProbability.times(ownership);
    const expectedProceeds = expectedOwnershipAtExit.times(new Decimal(stage.exitValuation));

    stages.push({
      stage: stage.stage,
      monthsFromAsOf,
      reachProbability,
      conditionalExitProbability: exitProbability,
      conditionalGraduationProbability: graduationProbability,
      conditionalFailureProbability: failureProbability,
      unconditionalExitProbability,
      unconditionalFailureProbability,
      contribution: {
        ownershipAfterRound: ownership,
        expectedCapital,
        expectedProceeds,
        expectedOwnershipAtExit,
      },
    });

    reachProbability = reachProbability.times(graduationProbability);
  }

  return {
    exactExpectedProceeds: stages.reduce(
      (total, stage) => total.plus(stage.contribution.expectedProceeds),
      ZERO
    ),
    exactExpectedCapital: stages.reduce(
      (total, stage) => total.plus(stage.contribution.expectedCapital),
      ZERO
    ),
    exactExpectedOwnershipAtExit: stages.reduce(
      (total, stage) => total.plus(stage.contribution.expectedOwnershipAtExit),
      ZERO
    ),
    expectedProceeds: stages.reduce(
      (total, stage) => total.plus(roundMetric(stage.contribution.expectedProceeds)),
      ZERO
    ),
    expectedCapital: stages.reduce(
      (total, stage) => total.plus(roundMetric(stage.contribution.expectedCapital)),
      ZERO
    ),
    expectedOwnershipAtExit: stages.reduce(
      (total, stage) => total.plus(roundMetric(stage.contribution.expectedOwnershipAtExit)),
      ZERO
    ),
    stages,
  };
}

function decimalNpvAt(rate: Decimal, cashFlows: DatedDecimalCashFlow[]): Decimal | null {
  const base = ONE.plus(rate);
  if (base.lte(0)) {
    return null;
  }

  return cashFlows.reduce((npv, cashFlow) => {
    const years = new Decimal(cashFlow.monthsFromAsOf).div(12);
    return npv.plus(cashFlow.amount.div(base.pow(years)));
  }, ZERO);
}

function calculateExpectedIrr(datedCashFlows: DatedDecimalCashFlow[]): Decimal | null {
  const aggregatedByMonth = new Map<number, Decimal>();
  for (const cashFlow of datedCashFlows) {
    aggregatedByMonth.set(
      cashFlow.monthsFromAsOf,
      (aggregatedByMonth.get(cashFlow.monthsFromAsOf) ?? ZERO).plus(cashFlow.amount)
    );
  }

  const cashFlows = [...aggregatedByMonth.entries()]
    .sort(([leftMonth], [rightMonth]) => leftMonth - rightMonth)
    .map(([monthsFromAsOf, amount]) => ({ monthsFromAsOf, amount }))
    .filter((cashFlow) => !cashFlow.amount.isZero());

  if (
    cashFlows.length < 2 ||
    !cashFlows.some((cashFlow) => cashFlow.amount.lt(0)) ||
    !cashFlows.some((cashFlow) => cashFlow.amount.gt(0))
  ) {
    return null;
  }

  let signChanges = 0;
  for (let index = 1; index < cashFlows.length; index += 1) {
    const prior = cashFlows[index - 1];
    const current = cashFlows[index];
    if (prior && current && prior.amount.isNegative() !== current.amount.isNegative()) {
      signChanges += 1;
    }
  }
  if (signChanges !== 1) {
    return null;
  }

  let lower = new Decimal('-0.999999');
  let upper = ONE;
  let lowerNpv = decimalNpvAt(lower, cashFlows);
  let upperNpv = decimalNpvAt(upper, cashFlows);
  if (lowerNpv === null || upperNpv === null) {
    return null;
  }

  const maximumUpperRate = new Decimal(1_000_000);
  while (lowerNpv.times(upperNpv).gt(0) && upper.lt(maximumUpperRate)) {
    upper = upper.times(2).plus(1);
    upperNpv = decimalNpvAt(upper, cashFlows);
    if (upperNpv === null) {
      return null;
    }
  }
  if (lowerNpv.times(upperNpv).gt(0)) {
    return null;
  }

  const npvTolerance = new Decimal('0.0000001');
  const rateTolerance = new Decimal('0.000000000001');
  for (let iteration = 0; iteration < 256; iteration += 1) {
    const midpoint = lower.plus(upper).div(2);
    const midpointNpv = decimalNpvAt(midpoint, cashFlows);
    if (midpointNpv === null) {
      return null;
    }
    if (midpointNpv.abs().lte(npvTolerance) || upper.minus(lower).abs().lte(rateTolerance)) {
      return midpoint;
    }

    if (lowerNpv.times(midpointNpv).lte(0)) {
      upper = midpoint;
      upperNpv = midpointNpv;
    } else {
      lower = midpoint;
      lowerNpv = midpointNpv;
    }
  }

  return null;
}

function normalizeInputForHash(input: MarginalReserveMoicInputV1): unknown {
  return {
    ...input,
    currentOwnership: formatMetric(new Decimal(input.currentOwnership)),
    stages: input.stages.map((stage) => ({
      ...stage,
      preMoneyValuation: formatMetric(new Decimal(stage.preMoneyValuation)),
      roundSize: formatMetric(new Decimal(stage.roundSize)),
      graduationProbability: formatMetric(new Decimal(stage.graduationProbability)),
      exitProbability: formatMetric(new Decimal(stage.exitProbability)),
      exitValuation: formatMetric(new Decimal(stage.exitValuation)),
      withDecision: {
        ...stage.withDecision,
        checkAmount: formatMetric(new Decimal(stage.withDecision.checkAmount)),
      },
      withoutDecision: {
        ...stage.withoutDecision,
        checkAmount: formatMetric(new Decimal(stage.withoutDecision.checkAmount)),
      },
    })),
  };
}

export function calculateMarginalReserveMoic(
  input: MarginalReserveMoicInputV1
): MarginalReserveMoicResultV1 {
  const parsedInput = MarginalReserveMoicInputV1Schema.parse(input);
  const withDecision = projectCounterfactual(parsedInput, 'withDecision');
  const withoutDecision = projectCounterfactual(parsedInput, 'withoutDecision');
  const exactDeltaExpectedProceeds = withDecision.exactExpectedProceeds.minus(
    withoutDecision.exactExpectedProceeds
  );
  const exactDeltaExpectedCapital = withDecision.exactExpectedCapital.minus(
    withoutDecision.exactExpectedCapital
  );
  const displayedDeltaExpectedProceeds = withDecision.expectedProceeds.minus(
    withoutDecision.expectedProceeds
  );
  const displayedDeltaExpectedCapital = withDecision.expectedCapital.minus(
    withoutDecision.expectedCapital
  );
  const denominatorFloor = Decimal.max(
    new Decimal(MIN_DELTA_CAPITAL_FLOOR.absoluteUsd),
    withDecision.exactExpectedCapital.times(
      MIN_DELTA_CAPITAL_FLOOR.withDecisionExpectedCapitalRatio
    )
  );

  const warnings: StructuredWarning[] = [];
  if (parsedInput.readiness?.status === 'indicative') {
    warnings.push({
      code: 'STALE_ASSUMPTION',
      message: 'One or more approved assumptions are stale',
    });
  }
  let status: MarginalReserveMoicResultV1['status'];
  let marginalMoic: Decimal | null = null;
  let marginalIrr: Decimal | null = null;

  if (exactDeltaExpectedCapital.lte(0)) {
    status = 'unavailable';
    warnings.push({
      code: 'NON_POSITIVE_DELTA_CAPITAL',
      message: 'Delta expected capital must be positive',
    });
  } else if (exactDeltaExpectedCapital.lt(denominatorFloor)) {
    status = 'unavailable';
    warnings.push({
      code: 'MIN_DENOMINATOR_FLOOR',
      message: `Unrounded delta expected capital is below the ${formatMetric(denominatorFloor)} floor`,
    });
  } else {
    marginalMoic = exactDeltaExpectedProceeds.div(exactDeltaExpectedCapital);
    const exceedsMagnitudeThreshold = marginalMoic.gt(100);
    status =
      exceedsMagnitudeThreshold || parsedInput.readiness?.status === 'indicative'
        ? 'indicative'
        : 'actionable';
    if (exceedsMagnitudeThreshold) {
      warnings.push({
        code: 'IMPLAUSIBLE_MAGNITUDE',
        message: 'Marginal MOIC exceeds 100x',
      });
    }

    const marginalCashFlows: DatedDecimalCashFlow[] = [];
    for (let index = 0; index < parsedInput.stages.length; index += 1) {
      const withStage = withDecision.stages[index];
      const withoutStage = withoutDecision.stages[index];
      if (!withStage || !withoutStage) {
        throw new Error('Counterfactual stage projections are misaligned');
      }

      const capitalDelta = withStage.contribution.expectedCapital.minus(
        withoutStage.contribution.expectedCapital
      );
      const proceedsDelta = withStage.contribution.expectedProceeds.minus(
        withoutStage.contribution.expectedProceeds
      );
      if (!capitalDelta.isZero()) {
        marginalCashFlows.push({
          monthsFromAsOf: withStage.monthsFromAsOf,
          amount: capitalDelta.negated(),
        });
      }
      if (!proceedsDelta.isZero()) {
        marginalCashFlows.push({
          monthsFromAsOf: withStage.monthsFromAsOf,
          amount: proceedsDelta,
        });
      }
    }

    marginalIrr = calculateExpectedIrr(marginalCashFlows);
    if (marginalIrr === null) {
      warnings.push({
        code: 'IRR_UNAVAILABLE',
        message: 'Marginal expected cash flows do not have one bounded IRR root',
      });
    }
  }

  const stageContributions = parsedInput.stages.map((stage, index) => {
    const withStage = withDecision.stages[index];
    const withoutStage = withoutDecision.stages[index];
    if (!withStage || !withoutStage) {
      throw new Error('Counterfactual stage projections are misaligned');
    }

    return {
      stage: stage.stage,
      reachProbability: formatMetric(withStage.reachProbability),
      conditionalExitProbability: formatMetric(withStage.conditionalExitProbability),
      conditionalGraduationProbability: formatMetric(withStage.conditionalGraduationProbability),
      conditionalFailureProbability: formatMetric(withStage.conditionalFailureProbability),
      unconditionalExitProbability: formatMetric(withStage.unconditionalExitProbability),
      unconditionalFailureProbability: formatMetric(withStage.unconditionalFailureProbability),
      withDecision: {
        ownershipAfterRound: formatMetric(withStage.contribution.ownershipAfterRound),
        expectedCapital: formatMetric(withStage.contribution.expectedCapital),
        expectedProceeds: formatMetric(withStage.contribution.expectedProceeds),
        expectedOwnershipAtExit: formatMetric(withStage.contribution.expectedOwnershipAtExit),
      },
      withoutDecision: {
        ownershipAfterRound: formatMetric(withoutStage.contribution.ownershipAfterRound),
        expectedCapital: formatMetric(withoutStage.contribution.expectedCapital),
        expectedProceeds: formatMetric(withoutStage.contribution.expectedProceeds),
        expectedOwnershipAtExit: formatMetric(withoutStage.contribution.expectedOwnershipAtExit),
      },
      deltaExpectedProceeds: formatMetric(
        roundMetric(withStage.contribution.expectedProceeds).minus(
          roundMetric(withoutStage.contribution.expectedProceeds)
        )
      ),
      deltaExpectedCapital: formatMetric(
        roundMetric(withStage.contribution.expectedCapital).minus(
          roundMetric(withoutStage.contribution.expectedCapital)
        )
      ),
    };
  });

  const resultWithoutHash: Omit<MarginalReserveMoicResultV1, 'resultHash'> = {
    contractVersion: 'marginal-reserve-moic-result-v1',
    companyId: parsedInput.companyId,
    status,
    marginalMoic: marginalMoic === null ? null : formatMetric(marginalMoic),
    marginalIrr: marginalIrr === null ? null : formatMetric(marginalIrr),
    deltaExpectedProceeds: formatMetric(displayedDeltaExpectedProceeds),
    deltaExpectedCapital: formatMetric(displayedDeltaExpectedCapital),
    withDecision: {
      expectedProceeds: formatMetric(withDecision.expectedProceeds),
      expectedCapital: formatMetric(withDecision.expectedCapital),
      expectedOwnershipAtExit: formatMetric(withDecision.expectedOwnershipAtExit),
    },
    withoutDecision: {
      expectedProceeds: formatMetric(withoutDecision.expectedProceeds),
      expectedCapital: formatMetric(withoutDecision.expectedCapital),
      expectedOwnershipAtExit: formatMetric(withoutDecision.expectedOwnershipAtExit),
    },
    stageContributions,
    factsInputHash: parsedInput.factsInputHash,
    assumptionsHash: parsedInput.assumptionsHash,
    warnings,
  };

  const result: MarginalReserveMoicResultV1 = {
    ...resultWithoutHash,
    resultHash: canonicalSha256({
      input: normalizeInputForHash(parsedInput),
      output: resultWithoutHash,
    }),
  };

  return MarginalReserveMoicResultV1Schema.parse(result);
}
