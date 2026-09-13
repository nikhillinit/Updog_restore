import type {
  CapitalPlanningInputV2,
  CapitalFollowOnRoundV2,
} from '../../../shared/contracts/capital-planning-v2.contract';
import {
  CAPITAL_PLANNING_V2_VERSION,
  CAPITAL_PLANNING_V2_ROUNDING_POLICY,
} from '../../../shared/contracts/capital-planning-v2.contract';
import type {
  CapitalPlanningInputV1,
  CapitalUnitDeclarationsV1,
} from '../../../shared/contracts/capital-planning-v1.contract';
import { materializeCapitalSource } from '../../../shared/lib/capital-planning/materialize-from-fund-draft';
import { makeCapitalRawConfig } from './fixtures';

export function v2Round(index = 1): CapitalFollowOnRoundV2 {
  return {
    roundId: `r${index}`,
    stageId: `s${index}`,
    roundLabel: `Round ${index}`,
    graduationRatio: '1.000000000000',
    eligibility: { type: 'all' },
    participationPolicy: { type: 'all_eligible' },
    checkPolicy: { type: 'pro_rata', proRataExerciseRatio: '1.000000000000' },
    lagMonthsFromPreviousRound: 12,
    timingBasis: 'interval_from_previous_round',
    poolBasis: 'incremental_pre_money',
    incrementalPreMoneyPoolDilutionRatio: '0.000000000000',
    financing: {
      valuationUsd: '20000000.000000',
      valuationBasis: 'pre_money',
      primaryCapital: {
        basis: 'total_primary_including_fund_check',
        totalPrimaryAmountUsd: '2000000.000000',
        primary_only_excludes_secondary: true,
      },
    },
  };
}
export function v2Input(): CapitalPlanningInputV2 {
  return {
    contractVersion: CAPITAL_PLANNING_V2_VERSION,
    roundingPolicy: CAPITAL_PLANNING_V2_ROUNDING_POLICY,
    solve: { mode: 'fixed_fund' },
    allocations: [
      {
        allocationId: 'a1',
        name: 'Seed',
        entryRound: 'Seed',
        pipelineProfileId: 'p1',
        entryStageId: 's0',
        initialPoolShareRatio: '1.000000000000',
        initialCheckUsd: '1000000.000000',
        deploymentPeriodYears: 1,
        scheduleAnchor: 'entry_deployment_month',
        deploymentCadence: 'uniform_monthly_over_deployment_period',
        entryFinancing: {
          valuationUsd: '8000000.000000',
          valuationBasis: 'pre_money',
          primaryCapital: {
            basis: 'total_primary_including_fund_check',
            totalPrimaryAmountUsd: '2000000.000000',
            primary_only_excludes_secondary: true,
          },
        },
        followOnRounds: [],
      },
    ],
  };
}
export function v2Bundle(
  input = v2Input(),
  commitments = 10000000,
  configure?: (
    raw: ReturnType<typeof makeCapitalRawConfig>,
    declarations: CapitalUnitDeclarationsV1
  ) => void
) {
  const raw = makeCapitalRawConfig();
  raw.fundSize = commitments;
  raw.fundLife = 10;
  raw.investmentPeriod = 4;
  raw.fundedFromFeesPct = 0;
  raw.economicsAssumptions!.gpCommitmentModel!.commitmentAmount = 0;
  raw.economicsAssumptions!.feeModel!.tiers![0]!.rate = 0;
  raw.economicsAssumptions!.feeModel!.tiers![0]!.endYear = 10;
  raw.economicsAssumptions!.expenseModel!.annualExpenses = [];
  const declarations: CapitalUnitDeclarationsV1 = {
    'funds.size': 'usd',
    fundSize: 'usd',
    'economicsAssumptions.gpCommitmentModel.commitmentAmount': 'usd',
  };
  raw.capitalPlanAllocations = input.allocations.map((a, i) => {
    for (const f of ['capitalAllocationPct', 'followOnParticipationPct'])
      declarations[`capitalPlanAllocations[${i}].${f}`] = 'ratio';
    declarations[`capitalPlanAllocations[${i}].initialCheckAmount`] = 'usd';
    return {
      id: a.allocationId,
      name: a.name,
      entryRound: a.entryRound,
      capitalAllocationPct: Number(a.initialPoolShareRatio),
      initialCheckStrategy: 'amount',
      initialCheckAmount: Number(a.initialCheckUsd),
      followOnStrategy: 'amount',
      followOnParticipationPct: 0,
      investmentHorizonMonths: a.deploymentPeriodYears * 12,
    };
  });
  raw.pipelineProfiles = input.allocations.map((a, i) => ({
    id: a.pipelineProfileId,
    name: a.name,
    stages: [
      { id: a.entryStageId, name: a.entryRound },
      ...a.followOnRounds.map((r) => ({ id: r.stageId, name: r.roundLabel })),
    ].map((s, j) => {
      for (const f of ['roundSize', 'valuation', 'exitValuation'])
        declarations[`pipelineProfiles[${i}].stages[${j}].${f}`] = 'usd';
      for (const f of ['graduationRate', 'esopPct'])
        declarations[`pipelineProfiles[${i}].stages[${j}].${f}`] = 'ratio';
      return {
        ...s,
        roundSize: 2000000,
        valuation: 10000000,
        valuationType: 'pre' as const,
        esopPct: 0,
        graduationRate: 0.5,
        exitRate: 0,
        exitValuation: 0,
        monthsToGraduate: 12,
        monthsToExit: 24,
      };
    }),
  }));
  configure?.(raw, declarations);
  const legacy: CapitalPlanningInputV1 = {
    contractVersion: 'capital-planning/1.0.0',
    allocations: input.allocations.map((a) => ({
      allocationId: a.allocationId,
      name: a.name,
      entryRound: a.entryRound,
      pipelineProfileId: a.pipelineProfileId,
      entryStageId: a.entryStageId,
      budgetShareRatio: a.initialPoolShareRatio,
      initialCheckUsd: a.initialCheckUsd,
      deploymentPeriodYears: a.deploymentPeriodYears,
      followOnRounds: a.followOnRounds.map((r) => ({
        roundId: r.roundId,
        stageId: r.stageId,
        roundLabel: r.roundLabel,
        graduationRatio: r.graduationRatio,
        participationRatio: '0.000000000000',
        checkPolicy: { type: 'fixed_check', checkUsd: '1.000000' },
        monthsAfterPreviousRound: r.lagMonthsFromPreviousRound,
        timeOrigin: 'previous_round',
      })),
    })),
  };
  const result = materializeCapitalSource({
    source: {
      fund: { id: 101, size: String(commitments), baseCurrency: 'USD' },
      config: { id: 11, version: 1, raw, publishedAt: '2026-09-01T00:00:00.000Z' },
    },
    inputs: [legacy],
    unitDeclarations: declarations,
  });
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.sourceBundle;
}
