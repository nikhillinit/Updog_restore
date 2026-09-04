import { describe, expect, it } from 'vitest';

import type { PersistedFinancialFactsSnapshotV1 } from '@shared/contracts/financial-facts-snapshot-v1.contract';
import type { FundDraftWriteV1 } from '@shared/contracts/fund-draft-write-v1.contract';
import { CurrentPlanVersionV1Schema } from '@shared/contracts/current-plan-version-v1.contract';
import { deriveCurrentPlanV1 } from '@shared/lib/current-plan/derive-current-plan-v1';
import { Decimal } from '@shared/lib/decimal-config';
import { canonicalizeDecimalLeaves } from '@shared/lib/decimal-string';

describe('deriveCurrentPlanV1', () => {
  it('derives unchanged from a persisted policy 1.0.0 facts snapshot', () => {
    const result = deriveCurrentPlanV1(completeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.plan.deployableCapitalUsd).toBe('80000000.000000');
    const persistedPlan = CurrentPlanVersionV1Schema.parse({
      ...result.plan,
      id: 'current-plan-1',
      version: 1,
      supersedesVersionId: null,
      supersededByVersionId: null,
      createdAt: '2026-07-22T02:00:00.000Z',
    });
    expect(persistedPlan.allocations).toEqual(result.plan.allocations);
  });

  it('pins derivation from a payload-5-shaped facts snapshot', () => {
    const result = deriveCurrentPlanV1({
      ...completeInput(),
      // Phase 1 adds payload-5 schema/types; keep this characterization fixture plain.
      factsSnapshot: payload5FactsSnapshot() as unknown as PersistedFinancialFactsSnapshotV1,
    });

    expect(result).toEqual({
      ok: true,
      plan: {
        contractVersion: 'current-plan-version-v1',
        fundId: 1,
        sourceConfigId: 17,
        sourceConfigVersion: 3,
        sourceFactsSnapshotId: '31',
        deployableCapitalUsd: '80000000.000000',
        planTransformationVersion: 'fund-config-to-current-plan/1.0.0',
        allocations: [
          {
            allocationId: 'seed',
            name: 'Seed',
            stageFocus: 'Seed',
            initialCapitalUsd: '48000000.000000',
            followOnCapitalUsd: '5000000.000000',
            avgInitialCheckUsd: '1000000.000000',
            pacingQuarters: 8,
            followOnStrategy: 'amount',
            followOnParticipationPct: '0.250000000000',
          },
          {
            allocationId: 'series-a',
            name: 'Series A',
            stageFocus: 'Series A',
            initialCapitalUsd: '32000000.000000',
            followOnCapitalUsd: '3200000.000000',
            avgInitialCheckUsd: '2000000.000000',
            pacingQuarters: 6,
            followOnStrategy: 'maintain_ownership',
            followOnParticipationPct: '0.100000000000',
          },
        ],
        pacingAssumptions: {
          contractVersion: 'current-plan-pacing-v1',
          deploymentQuarters: 8,
          quarterlyDeploymentPcts: [
            '0.125000000000',
            '0.125000000000',
            '0.125000000000',
            '0.125000000000',
            '0.125000000000',
            '0.125000000000',
            '0.125000000000',
            '0.125000000000',
          ],
          followOnReservePct: '0.092970521542',
          annualFeeDragPct: '0.020000000000',
        },
        cohortAssumptions: {
          contractVersion: 'current-plan-cohort-v1',
          averageInitialCheckUsd: '1400000.000000',
          stageDistribution: [
            { stage: 'Seed', pct: '0.600000000000' },
            { stage: 'Series A', pct: '0.400000000000' },
          ],
          graduationMatrix: [
            {
              fromStage: 'Seed',
              toStage: 'Seed',
              rate: '1.000000000000',
              quartersToGraduate: 0,
            },
            {
              fromStage: 'Series A',
              toStage: 'Series A',
              rate: '1.000000000000',
              quartersToGraduate: 0,
            },
          ],
          exitAssumptions: [
            {
              stage: 'Seed',
              exitMultiple: '1.000000000000',
              quartersToExit: 0,
              failureRate: '0.000000000000',
            },
            {
              stage: 'Series A',
              exitMultiple: '1.000000000000',
              quartersToExit: 0,
              failureRate: '0.000000000000',
            },
          ],
        },
        reservePolicyVersion: 'reserve-policy/1.0.0',
        assumptionsHash: 'dc977b2e7462a3d4c1b0f00df0258a38899cdb64a6797f5171a9a58c56b60dbe',
      },
    });
  });

  it('produces the same assumptions hash for the same config', () => {
    const input = completeInput();
    const first = deriveCurrentPlanV1(input);
    const second = deriveCurrentPlanV1(input);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(second.plan.assumptionsHash).toBe(first.plan.assumptionsHash);
  });

  it('reports fundSize when fund size is absent', () => {
    const config = completeConfig();
    delete config.fundSize;

    const result = deriveCurrentPlanV1({ ...completeInput(), config });

    expect(result).toMatchObject({
      ok: false,
      code: 'PLAN_DERIVATION_INCOMPLETE',
      missingFields: ['fundSize'],
    });
  });

  it('rejects ownership-based initial check allocations', () => {
    const config = completeConfig();
    const ownershipAllocation = config.capitalPlanAllocations?.[0];
    if (!ownershipAllocation) throw new Error('Expected a complete allocation fixture.');
    ownershipAllocation.initialCheckStrategy = 'ownership';
    ownershipAllocation.initialOwnershipPct = 0.1;
    delete ownershipAllocation.initialCheckAmount;

    const result = deriveCurrentPlanV1({ ...completeInput(), config });

    expect(result).toMatchObject({
      ok: false,
      code: 'OWNERSHIP_STRATEGY_UNSUPPORTED',
    });
  });

  it('reports an absent fee profile when fee tiers are absent', () => {
    const config = completeConfig();
    const feeModel = config.economicsAssumptions?.feeModel;
    if (!feeModel) throw new Error('Expected a complete fee-model fixture.');
    delete feeModel.tiers;

    const result = deriveCurrentPlanV1({ ...completeInput(), config });

    expect(result).toMatchObject({
      ok: false,
      code: 'FEE_PROFILE_ABSENT',
    });
  });

  it('normalizes quarterly deployment and stage distributions to exactly one', () => {
    const result = deriveCurrentPlanV1(completeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const quarterlyDeploymentTotal = result.plan.pacingAssumptions.quarterlyDeploymentPcts.reduce(
      (sum, pct) => sum.plus(pct),
      new Decimal(0)
    );
    const stageDistributionTotal = result.plan.cohortAssumptions.stageDistribution.reduce(
      (sum, allocation) => sum.plus(allocation.pct),
      new Decimal(0)
    );

    expect(quarterlyDeploymentTotal.toFixed(12)).toBe('1.000000000000');
    expect(stageDistributionTotal.toFixed(12)).toBe('1.000000000000');
  });

  it('produces a plan with canonical decimal leaves', () => {
    const result = deriveCurrentPlanV1(completeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { assumptionsHash: _assumptionsHash, ...hashPreimage } = result.plan;
    // Production canonicalizes only the hash-free preimage.
    expect(() => canonicalizeDecimalLeaves(hashPreimage)).not.toThrow();
  });
});

function completeInput() {
  return {
    config: completeConfig(),
    sourceConfigId: 17,
    sourceConfigVersion: 3,
    factsSnapshot: factsSnapshot(),
    asOfDate: '2026-07-21',
  };
}

function completeConfig(): FundDraftWriteV1 {
  return {
    fundName: 'Fund I',
    fundSize: 100_000_000,
    fundLife: 10,
    capitalPlanAllocations: [
      {
        id: 'seed',
        name: 'Seed',
        entryRound: 'Seed',
        capitalAllocationPct: 0.6,
        initialCheckStrategy: 'amount',
        initialCheckAmount: 1_000_000,
        followOnStrategy: 'amount',
        followOnAmount: 5_000_000,
        followOnParticipationPct: 0.25,
        investmentHorizonMonths: 24,
      },
      {
        id: 'series-a',
        name: 'Series A',
        entryRound: 'Series A',
        capitalAllocationPct: 0.4,
        initialCheckStrategy: 'amount',
        initialCheckAmount: 2_000_000,
        followOnStrategy: 'maintain_ownership',
        followOnParticipationPct: 0.1,
        investmentHorizonMonths: 18,
      },
    ],
    economicsAssumptions: {
      version: 'v1',
      feeModel: {
        source: 'economics_override',
        tiers: [
          {
            id: 'management-fee',
            name: 'Management fee',
            rate: 0.02,
            basis: 'committed_capital',
            startYear: 1,
            endYear: 10,
          },
        ],
      },
    },
  };
}

function factsSnapshot(): PersistedFinancialFactsSnapshotV1 & { id: number } {
  return {
    id: 31,
    policyVersion: 'financial-facts-policy/1.0.0',
    fundId: 1,
    asOfDate: '2026-07-21',
    knowledgeCutoff: '2026-07-22T02:00:00.000Z',
    vehicleScope: 'fund_all',
    vehicleIds: [11],
    selectionSetHash: '0'.repeat(64),
    sourceFactsInputHash: 'a'.repeat(64),
    snapshotInputHash: 'b'.repeat(64),
    consumerEvaluations: [],
    payload: {
      companyActuals: {
        fundId: 1,
        asOfDate: '2026-07-21',
        facts: [],
        inputHash: 'c'.repeat(64),
      },
      sourceObservationIds: [],
      workingValueSelectionIds: [],
      participationTermRefs: [],
      cashFlowSeries: {
        series: [],
        totals: {
          contributions: '0.000000',
          distributions: '0.000000',
          recallableDistributions: '0.000000',
        },
        warnings: [],
      },
      marksSeries: { marks: [], periodNav: [], warnings: [] },
      vehicleRoster: [],
    },
    actorId: 7,
    createdAt: '2026-07-22T02:00:00.000Z',
  };
}

function payload5FactsSnapshot() {
  const facts = factsSnapshot();
  return {
    ...facts,
    policyVersion: 'financial-facts-policy/1.4.0',
    payloadSchemaId: 'financial-facts-payload/5',
    payload: {
      ...facts.payload,
      positionRefs: [],
      positionComponentRefs: [],
      ownershipRefs: [],
      valuationRefs: [],
      observationRefs: [],
      openingAccountingState: null,
      capitalActuals: {
        ledgerCoverage: 'complete',
        paidInCapital: {
          value: '0.000000',
          availability: 'available',
          reasonCodes: [],
          sourceRefs: ['fixture:payload-5'],
        },
      },
      valuationActuals: {
        valuationDate: null,
        roster: [],
        marks: [],
        coverage: 'not_supplied',
        missingCompanyIds: [],
      },
      admissionReceiptCore: {
        contractVersion: 'actuals-pilot-publish-receipt/1.0.0',
        fundId: facts.fundId,
        asOfDate: facts.asOfDate,
      },
    },
  };
}
