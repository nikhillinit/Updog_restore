/**
 * Golden fixtures for FundCreateV1 and FundDraftWriteV1 contract tests
 */

import type { FundCreateV1 } from '@shared/contracts/fund-create-v1.contract';
import type { FundDraftWriteV1 } from '@shared/contracts/fund-draft-write-v1.contract';

// ---------------------------------------------------------------------------
// POST /api/funds (FundCreateV1)
// ---------------------------------------------------------------------------

export const validCreatePayload: FundCreateV1 = {
  name: 'Press On Fund III',
  size: 50_000_000,
  managementFee: 0.02,
  carryPercentage: 0.2,
  vintageYear: 2026,
};

export const validCreatePayloadWithEngine: FundCreateV1 = {
  name: 'Press On Fund IV',
  size: 100_000_000,
  managementFee: 0.025,
  carryPercentage: 0.2,
  vintageYear: 2026,
  modelVersion: 'reserves-ev1',
  engineResults: {
    calculatedAt: '2026-01-15T00:00:00.000Z',
    engineVersion: '1.0.0',
    allocations: [
      {
        companyId: 'co-1',
        companyName: 'Acme Corp',
        stage: 'Seed',
        allocation: 5_000_000,
        expectedReturn: 3.5,
        riskScore: 0.4,
      },
    ],
    portfolioMetrics: {
      expectedPortfolioMOIC: 3.2,
      concentrationRisk: 0.3,
      reserveUtilization: 0.65,
      diversificationScore: 0.7,
    },
    riskAnalysis: {
      overallRisk: 'MEDIUM',
      reserveExhaustionRisk: false,
      highConcentrationWarning: false,
      unrealisticReturnsWarning: false,
    },
    inputSummary: {
      totalAllocated: 80_000_000,
      totalAvailable: 100_000_000,
      portfolioSize: 16,
    },
  },
};

export const invalidCreatePayloads = {
  missingName: { size: 50_000_000 },
  negativeSize: { name: 'Bad Fund', size: -1 },
  oversizedFee: { name: 'Bad Fund', size: 50_000_000, managementFee: 0.5 },
  oversizedCarry: { name: 'Bad Fund', size: 50_000_000, carryPercentage: 0.9 },
  unknownKey: { name: 'Bad Fund', size: 50_000_000, bogusField: true },
  emptyName: { name: '', size: 50_000_000 },
};

// ---------------------------------------------------------------------------
// PUT /api/funds/:id/draft (FundDraftWriteV1)
// ---------------------------------------------------------------------------

export const validDraftPayload: FundDraftWriteV1 = {
  fundName: 'Press On Fund III',
  fundSize: 50_000_000,
  vintageYear: 2026,
  managementFeeRate: 2.0,
  carriedInterest: 20.0,
  establishmentDate: '2026-01-15',
  isEvergreen: false,
  fundLife: 10,
  investmentPeriod: 5,
  gpCommitment: 2_500_000,
  lpClasses: [
    { id: 'lpc-1', name: 'Class A', targetAllocation: 80 },
    { id: 'lpc-2', name: 'Class B', targetAllocation: 20, preferredReturn: 8 },
  ],
  lps: [
    {
      id: 'lp-1',
      name: 'Alpha LP',
      commitment: 10_000_000,
      lpClassId: 'lpc-1',
      type: 'institutional',
    },
  ],
  stages: [
    { id: 'stg-1', name: 'Seed', graduate: 30, exit: 10, months: 18 },
    { id: 'stg-2', name: 'Series A', graduate: 50, exit: 20, months: 24 },
  ],
  sectorProfiles: [
    { id: 'sp-1', name: 'SaaS', targetPercentage: 60 },
    { id: 'sp-2', name: 'Fintech', targetPercentage: 40 },
  ],
  allocations: [
    { id: 'alloc-1', category: 'Initial', percentage: 60 },
    { id: 'alloc-2', category: 'Follow-on', percentage: 40 },
  ],
  followOnChecks: { A: 1, B: 2, C: 3 },
  capitalStageAllocations: [
    { id: 'csa-1', label: 'Seed', pct: 40 },
    { id: 'csa-2', label: 'Series A', pct: 60 },
  ],
  capitalPlanAllocations: [
    {
      id: 'cpa-1',
      name: 'SaaS Seed',
      entryRound: 'Seed',
      capitalAllocationPct: 40,
      initialCheckStrategy: 'amount',
      initialCheckAmount: 500_000,
      followOnStrategy: 'maintain_ownership',
      followOnParticipationPct: 50,
      investmentHorizonMonths: 60,
    },
  ],
  targetMetrics: {
    targetIRR: 0.25,
    targetTVPI: 2.5,
    targetDPI: 1.5,
    targetCompanyCount: 25,
    targetReserveRatio: 0.5,
  },
  pipelineProfiles: [
    {
      id: 'pp-1',
      name: 'Default Pipeline',
      stages: [
        {
          id: 'pps-1',
          name: 'Seed',
          roundSize: 2_000_000,
          valuation: 10_000_000,
          valuationType: 'pre',
          esopPct: 10,
          graduationRate: 30,
          exitRate: 10,
          exitValuation: 50_000_000,
          monthsToGraduate: 18,
          monthsToExit: 60,
        },
      ],
    },
  ],
  waterfallType: 'american',
  waterfallTiers: [
    { id: 'wt-1', name: 'Return of Capital', gpSplit: 0, lpSplit: 100 },
    {
      id: 'wt-2',
      name: 'Preferred Return',
      preferredReturn: 8,
      catchUp: 100,
      gpSplit: 20,
      lpSplit: 80,
    },
  ],
  recyclingEnabled: true,
  recyclingType: 'both',
  recyclingCap: 25,
  recyclingPeriod: 36,
  exitRecyclingRate: 50,
  mgmtFeeRecyclingRate: 100,
  allowFutureRecycling: false,
  feeProfiles: [
    {
      id: 'fp-1',
      name: 'Standard Fees',
      feeTiers: [
        {
          id: 'ft-1',
          name: 'Investment Period',
          percentage: 2.0,
          feeBasis: 'committed_capital',
          startMonth: 0,
          endMonth: 60,
        },
      ],
    },
  ],
  fundExpenses: [
    { id: 'fe-1', category: 'Legal', monthlyAmount: 5000, startMonth: 0 },
    { id: 'fe-2', category: 'Audit', monthlyAmount: 3000, startMonth: 0, endMonth: 120 },
  ],
};

export const minimalDraftPayload: FundDraftWriteV1 = {
  fundName: 'Minimal Fund',
};

export const warningFieldsBlankDraft: FundDraftWriteV1 = {
  fundName: 'Defaults Test Fund',
  fundSize: 0,
  managementFeeRate: 0,
  carriedInterest: 0,
};

export const invalidDraftPayloads = {
  missingFundName: { fundSize: 50_000_000 },
  emptyFundName: { fundName: '' },
  unknownKey: { fundName: 'Test', bogusField: true },
  duplicateStageIds: {
    fundName: 'Test',
    stages: [
      { id: 'stg-dup', name: 'Seed', graduate: 30, exit: 10, months: 18 },
      { id: 'stg-dup', name: 'Series A', graduate: 50, exit: 20, months: 24 },
    ],
  },
};
