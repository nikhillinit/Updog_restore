// This transform is the sanctioned config float-ingestion boundary. Decimal-valued config
// numbers are converted once to fixed decimal strings before participating in Decimal math.
import type { FinancialFactsSnapshotV1 } from '../../contracts/financial-facts-snapshot-v1.contract';
import type { FundDraftWriteV1 } from '../../contracts/fund-draft-write-v1.contract';
import {
  PLAN_TRANSFORMATION_VERSION,
  type CurrentPlanAllocationV1,
  type CurrentPlanAssumptionsHashPreimageV1,
  type CurrentPlanCohortAssumptionsV1,
  type CurrentPlanPacingAssumptionsV1,
  type CurrentPlanVersionV1,
} from '../../contracts/current-plan-version-v1.contract';
import { canonicalSha256 } from '../canonical-hash';
import { Decimal } from '../decimal-config';
import { canonicalizeDecimalLeaves, toFixedDecimalString } from '../decimal-string';
import { compileAnnualFeeDrag, FeeProfileAbsentError } from '../economics/fee-drag-compiler';

export const RESERVE_POLICY_VERSION = 'reserve-policy/1.0.0' as const;

export type DerivedCurrentPlanV1 = Omit<
  CurrentPlanVersionV1,
  'id' | 'version' | 'supersedesVersionId' | 'supersededByVersionId' | 'createdAt'
>;

export type DeriveCurrentPlanResult =
  | { ok: true; plan: DerivedCurrentPlanV1 }
  | {
      ok: false;
      code: 'PLAN_DERIVATION_INCOMPLETE' | 'OWNERSHIP_STRATEGY_UNSUPPORTED' | 'FEE_PROFILE_ABSENT';
      missingFields?: string[];
      detail: string;
    };

export interface DeriveCurrentPlanV1Input {
  config: FundDraftWriteV1;
  sourceConfigId: number;
  sourceConfigVersion: number;
  factsSnapshot: FinancialFactsSnapshotV1;
  asOfDate: string;
}

function ingestConfigDecimal(value: number, places: number): string {
  return toFixedDecimalString(new Decimal(value), places);
}

function sumDecimals(values: Decimal[]): Decimal {
  return values.reduce((sum, value) => sum.plus(value), new Decimal(0));
}

function normalizedRatioStrings(weights: Decimal[]): string[] {
  if (weights.length === 0) return [];

  const weightTotal = sumDecimals(weights);
  const effectiveWeights = weightTotal.isZero() ? weights.map(() => new Decimal(1)) : weights;
  const effectiveTotal = weightTotal.isZero() ? new Decimal(weights.length) : weightTotal;
  let emittedTotal = new Decimal(0);

  return effectiveWeights.map((weight, index) => {
    if (index === effectiveWeights.length - 1) {
      return toFixedDecimalString(new Decimal(1).minus(emittedTotal), 12);
    }

    const ratio = toFixedDecimalString(weight.div(effectiveTotal), 12);
    emittedTotal = emittedTotal.plus(ratio);
    return ratio;
  });
}

function sourceSnapshotId(snapshot: FinancialFactsSnapshotV1): string {
  // The persisted snapshot row supplies id; the payload contract intentionally omits DB identity.
  const persistedSnapshot = snapshot as FinancialFactsSnapshotV1 & { readonly id: number };
  return String(persistedSnapshot.id);
}

export function deriveCurrentPlanV1(input: DeriveCurrentPlanV1Input): DeriveCurrentPlanResult {
  const { config } = input;
  const sourceAllocations = config.capitalPlanAllocations;
  const horizonYears = config.fundLife ?? config.investmentPeriod;
  const missingFields: string[] = [];

  if (config.fundSize === undefined) missingFields.push('fundSize');
  if (!sourceAllocations || sourceAllocations.length === 0) {
    missingFields.push('capitalPlanAllocations');
  } else {
    sourceAllocations.forEach((allocation, index) => {
      if (
        allocation.initialCheckStrategy === 'amount' &&
        allocation.initialCheckAmount === undefined
      ) {
        missingFields.push(`capitalPlanAllocations[${index}].initialCheckAmount`);
      }
    });
  }
  if (horizonYears === undefined) missingFields.push('fundLife');

  if (missingFields.length > 0) {
    return {
      ok: false,
      code: 'PLAN_DERIVATION_INCOMPLETE',
      missingFields,
      detail: `Current-plan derivation requires: ${missingFields.join(', ')}.`,
    };
  }

  if (config.fundSize === undefined || horizonYears === undefined || !sourceAllocations) {
    throw new Error('Current-plan derivation precondition narrowing failed.');
  }

  const ownershipAllocation = sourceAllocations.find(
    (allocation) => allocation.initialCheckStrategy === 'ownership'
  );
  if (ownershipAllocation) {
    return {
      ok: false,
      code: 'OWNERSHIP_STRATEGY_UNSUPPORTED',
      detail: `Allocation ${ownershipAllocation.id} uses an unsupported ownership initial-check strategy.`,
    };
  }

  let feeCompilation: ReturnType<typeof compileAnnualFeeDrag>;
  try {
    feeCompilation = compileAnnualFeeDrag(config.economicsAssumptions?.feeModel?.tiers, {
      horizonYears: Math.ceil(horizonYears),
    });
  } catch (error) {
    if (error instanceof FeeProfileAbsentError) {
      return {
        ok: false,
        code: 'FEE_PROFILE_ABSENT',
        detail: error.message,
      };
    }
    throw error;
  }

  const fundSizeUsd = ingestConfigDecimal(config.fundSize, 6);
  const horizonYearsDecimal = new Decimal(ingestConfigDecimal(horizonYears, 12));
  const feeBurden = new Decimal(feeCompilation.annualFeeDragPct).times(horizonYearsDecimal);
  const deployableCapital = Decimal.max(
    new Decimal(0),
    new Decimal(fundSizeUsd).times(new Decimal(1).minus(feeBurden))
  );
  const deployableCapitalUsd = toFixedDecimalString(deployableCapital, 6);

  const allocations: CurrentPlanAllocationV1[] = sourceAllocations.map((allocation) => {
    if (allocation.initialCheckAmount === undefined) {
      throw new Error(
        `Allocation ${allocation.id} passed derivation without an initial check amount.`
      );
    }

    const capitalAllocationPct = new Decimal(
      ingestConfigDecimal(allocation.capitalAllocationPct, 12)
    );
    const initialCapitalUsd = toFixedDecimalString(
      capitalAllocationPct.times(deployableCapital),
      6
    );
    const avgInitialCheckUsd = ingestConfigDecimal(allocation.initialCheckAmount, 6);
    const followOnParticipationPct = ingestConfigDecimal(allocation.followOnParticipationPct, 12);
    const followOnCapitalUsd =
      allocation.followOnStrategy === 'amount'
        ? ingestConfigDecimal(allocation.followOnAmount ?? 0, 6)
        : toFixedDecimalString(new Decimal(initialCapitalUsd).times(followOnParticipationPct), 6);

    return {
      allocationId: allocation.id,
      name: allocation.name,
      stageFocus: allocation.entryRound,
      initialCapitalUsd,
      followOnCapitalUsd,
      avgInitialCheckUsd,
      pacingQuarters: Math.ceil(allocation.investmentHorizonMonths / 3),
      followOnStrategy: allocation.followOnStrategy,
      followOnParticipationPct,
    };
  });

  const initialCapitals = allocations.map(
    (allocation) => new Decimal(allocation.initialCapitalUsd)
  );
  const followOnCapitals = allocations.map(
    (allocation) => new Decimal(allocation.followOnCapitalUsd)
  );
  const totalInitialCapital = sumDecimals(initialCapitals);
  const totalFollowOnCapital = sumDecimals(followOnCapitals);
  const totalPlannedCapital = totalInitialCapital.plus(totalFollowOnCapital);
  const deploymentQuarters = Math.max(
    ...allocations.map((allocation) => allocation.pacingQuarters)
  );

  const pacingAssumptions: CurrentPlanPacingAssumptionsV1 = {
    contractVersion: 'current-plan-pacing-v1',
    deploymentQuarters,
    quarterlyDeploymentPcts: normalizedRatioStrings(
      Array.from({ length: deploymentQuarters }, () => new Decimal(1))
    ),
    followOnReservePct: totalPlannedCapital.isZero()
      ? '0.000000000000'
      : toFixedDecimalString(totalFollowOnCapital.div(totalPlannedCapital), 12),
    annualFeeDragPct: feeCompilation.annualFeeDragPct,
  };

  const stageCapitalByName = new Map<string, Decimal>();
  allocations.forEach((allocation) => {
    const currentCapital = stageCapitalByName.get(allocation.stageFocus) ?? new Decimal(0);
    stageCapitalByName.set(
      allocation.stageFocus,
      currentCapital.plus(allocation.initialCapitalUsd)
    );
  });
  const stageCapitals = [...stageCapitalByName.entries()].map(([stage, capital]) => ({
    stage,
    capital,
  }));
  const stagePcts = normalizedRatioStrings(stageCapitals.map(({ capital }) => capital));
  const weightedInitialChecks = allocations.reduce(
    (sum, allocation) =>
      sum.plus(new Decimal(allocation.initialCapitalUsd).times(allocation.avgInitialCheckUsd)),
    new Decimal(0)
  );

  const cohortAssumptions: CurrentPlanCohortAssumptionsV1 = {
    contractVersion: 'current-plan-cohort-v1',
    averageInitialCheckUsd: totalInitialCapital.isZero()
      ? '0.000000'
      : toFixedDecimalString(weightedInitialChecks.div(totalInitialCapital), 6),
    stageDistribution: stageCapitals.map(({ stage }, index) => {
      const pct = stagePcts[index];
      if (pct === undefined) {
        throw new Error('Stage distribution percentage cardinality mismatch.');
      }

      return { stage, pct };
    }),
    graduationMatrix: stageCapitals.map(({ stage }) => ({
      fromStage: stage,
      toStage: stage,
      rate: '1.000000000000',
      quartersToGraduate: 0,
    })),
    // Real exit assumptions require a richer config source in a later transform version.
    // V1 neutral values keep the contract valid while the engine reports an indicative result.
    exitAssumptions: stageCapitals.map(({ stage }) => ({
      stage,
      exitMultiple: '1.000000000000',
      quartersToExit: 0,
      failureRate: '0.000000000000',
    })),
  };

  const sourceFactsSnapshotId = sourceSnapshotId(input.factsSnapshot);
  const assumptionsHashPreimage: CurrentPlanAssumptionsHashPreimageV1 = {
    sourceConfigId: input.sourceConfigId,
    sourceConfigVersion: input.sourceConfigVersion,
    sourceFactsSnapshotId,
    asOfDate: input.asOfDate,
    planTransformationVersion: PLAN_TRANSFORMATION_VERSION,
    feeCompilerVersion: feeCompilation.compilerVersion,
    deployableCapitalUsd,
    allocations,
    pacingAssumptions,
    cohortAssumptions,
    reservePolicyVersion: RESERVE_POLICY_VERSION,
  };
  const assumptionsHash = canonicalSha256(canonicalizeDecimalLeaves(assumptionsHashPreimage));

  return {
    ok: true,
    plan: {
      contractVersion: 'current-plan-version-v1',
      fundId: input.factsSnapshot.fundId,
      sourceConfigId: input.sourceConfigId,
      sourceConfigVersion: input.sourceConfigVersion,
      sourceFactsSnapshotId,
      deployableCapitalUsd,
      planTransformationVersion: PLAN_TRANSFORMATION_VERSION,
      allocations,
      pacingAssumptions,
      cohortAssumptions,
      reservePolicyVersion: RESERVE_POLICY_VERSION,
      assumptionsHash,
    },
  };
}
