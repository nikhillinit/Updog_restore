import type { z } from 'zod';
import type { FundDraftWriteV1Schema } from '../../../shared/contracts/fund-draft-write-v1.contract';
import {
  CAPITAL_PLANNING_VERSION,
  type CapitalPlanningInputV1,
  type CapitalUnitDeclarationsV1,
} from '../../../shared/contracts/capital-planning-v1.contract';

// Synthetic dollars, fixed identities, and raw values: never hydrate this through a parser.
export function makeCapitalRawConfig(): z.input<typeof FundDraftWriteV1Schema> {
  return {
    fundName: 'Synthetic capital source',
    fundSize: 100,
    vintageYear: 2026,
    isEvergreen: false,
    fundLife: 2,
    investmentPeriod: 1,
    fundedFromFeesPct: 0.4,
    economicsAssumptions: {
      version: 'v1',
      gpCommitmentModel: { commitmentAmount: 10 },
      feeModel: {
        source: 'economics_override',
        tiers: [
          {
            id: 'fee-1',
            name: 'Committed fee',
            rate: 0.02,
            basis: 'committed_capital',
            startYear: 1,
            endYear: 2,
          },
        ],
      },
      expenseModel: {
        source: 'economics_override',
        annualExpenses: [
          { id: 'expense-1', category: 'administration', amount: 1, startYear: 1, endYear: 2 },
        ],
      },
    },
    allocations: [
      { id: 'category-initial', category: 'Initial', percentage: 60 },
      { id: 'category-follow-on', category: 'Follow-on', percentage: 40 },
    ],
    capitalPlanAllocations: [
      {
        id: 'a1',
        name: 'Seed',
        entryRound: 'Seed',
        capitalAllocationPct: 100,
        initialCheckStrategy: 'amount',
        initialCheckAmount: 1,
        followOnStrategy: 'amount',
        followOnParticipationPct: 0,
        investmentHorizonMonths: 12,
      },
    ],
    pipelineProfiles: [
      {
        id: 'p1',
        name: 'Synthetic pipeline',
        stages: [
          {
            id: 's0',
            name: 'Seed',
            roundSize: 2,
            valuation: 10,
            valuationType: 'pre',
            esopPct: 0,
            graduationRate: 0,
            exitRate: 0,
            exitValuation: 0,
            monthsToGraduate: 12,
            monthsToExit: 24,
          },
        ],
      },
    ],
  };
}

export function makeCapitalInput(): CapitalPlanningInputV1 {
  return {
    contractVersion: CAPITAL_PLANNING_VERSION,
    allocations: [
      {
        allocationId: 'a1',
        name: 'Seed',
        entryRound: 'Seed',
        pipelineProfileId: 'p1',
        entryStageId: 's0',
        budgetShareRatio: '1.000000000000',
        initialCheckUsd: '1.000000',
        deploymentPeriodYears: 1,
        followOnRounds: [],
      },
    ],
  };
}

export function makeCapitalDeclarations(): CapitalUnitDeclarationsV1 {
  return {
    'funds.size': 'usd',
    fundSize: 'usd',
    'economicsAssumptions.gpCommitmentModel.commitmentAmount': 'usd',
    'economicsAssumptions.expenseModel.annualExpenses[0].amount': 'usd',
    'capitalPlanAllocations[0].capitalAllocationPct': 'percent_points',
    'capitalPlanAllocations[0].followOnParticipationPct': 'percent_points',
    'capitalPlanAllocations[0].initialCheckAmount': 'usd',
    'pipelineProfiles[0].stages[0].roundSize': 'usd',
    'pipelineProfiles[0].stages[0].valuation': 'usd',
    'pipelineProfiles[0].stages[0].exitValuation': 'usd',
    'pipelineProfiles[0].stages[0].graduationRate': 'ratio',
    'pipelineProfiles[0].stages[0].esopPct': 'ratio',
  };
}
