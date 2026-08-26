import { describe, expect, it } from 'vitest';

import {
  PLAN_TRANSFORMATION_VERSION,
  CurrentPlanAssumptionsHashPreimageV1Schema,
  CurrentPlanVersionV1Schema,
} from '../../../shared/contracts/current-plan-version-v1.contract';
import { canonicalizeDecimalLeaves } from '../../../shared/lib/decimal-string';

function validCurrentPlanVersion() {
  return {
    contractVersion: 'current-plan-version-v1',
    id: 'plan-version-1',
    fundId: 7,
    version: 1,
    sourceConfigId: 11,
    sourceConfigVersion: 0,
    sourceFactsSnapshotId: '23',
    deployableCapitalUsd: '9000000.000000',
    planTransformationVersion: PLAN_TRANSFORMATION_VERSION,
    allocations: [
      {
        allocationId: 'seed-allocation',
        name: 'Seed',
        stageFocus: 'Seed',
        initialCapitalUsd: '6000000.000000',
        followOnCapitalUsd: '3000000.000000',
        avgInitialCheckUsd: '1000000.000000',
        pacingQuarters: 8,
        followOnStrategy: 'maintain_ownership',
        followOnParticipationPct: '0.500000000000',
      },
    ],
    pacingAssumptions: {
      contractVersion: 'current-plan-pacing-v1',
      deploymentQuarters: 2,
      quarterlyDeploymentPcts: ['0.500000000000', '0.500000000000'],
      followOnReservePct: '0.333333333333',
      annualFeeDragPct: '0.020000000000',
    },
    cohortAssumptions: {
      contractVersion: 'current-plan-cohort-v1',
      averageInitialCheckUsd: '1000000.000000',
      stageDistribution: [
        { stage: 'Seed', pct: '0.600000000000' },
        { stage: 'Series A', pct: '0.400000000000' },
      ],
      graduationMatrix: [
        {
          fromStage: 'Seed',
          toStage: 'Series A',
          rate: '0.750000000000',
          quartersToGraduate: 4,
        },
      ],
      exitAssumptions: [
        {
          stage: 'Seed',
          exitMultiple: '3.000000000000',
          quartersToExit: 20,
          failureRate: '0.250000000000',
        },
      ],
    },
    reservePolicyVersion: 'reserve-policy/1.0.0',
    assumptionsHash: 'a'.repeat(64),
    supersedesVersionId: null,
    supersededByVersionId: null,
    createdAt: '2026-07-22T05:07:50.303Z',
  };
}

describe('CurrentPlanVersionV1 contract', () => {
  it('parses a valid current-plan version', () => {
    const parsed = CurrentPlanVersionV1Schema.parse(validCurrentPlanVersion());

    expect(parsed.planTransformationVersion).toBe(PLAN_TRANSFORMATION_VERSION);
  });

  it('rejects unknown top-level keys', () => {
    const result = CurrentPlanVersionV1Schema.safeParse({
      ...validCurrentPlanVersion(),
      unexpected: true,
    });

    expect(result.success).toBe(false);
  });

  it('rejects six-place values for ratio-class fields', () => {
    const invalidPct = validCurrentPlanVersion();
    invalidPct.pacingAssumptions.annualFeeDragPct = '0.020000';
    const invalidRate = validCurrentPlanVersion();
    invalidRate.cohortAssumptions.graduationMatrix[0]!.rate = '0.750000';

    expect(CurrentPlanVersionV1Schema.safeParse(invalidPct).success).toBe(false);
    expect(CurrentPlanVersionV1Schema.safeParse(invalidRate).success).toBe(false);
  });

  it('rejects money fields without exactly six decimal places', () => {
    const invalid = validCurrentPlanVersion();
    invalid.deployableCapitalUsd = '9000000.00';

    expect(CurrentPlanVersionV1Schema.safeParse(invalid).success).toBe(false);
  });

  it('rejects quarterly deployment percentages that do not sum to one', () => {
    const invalid = validCurrentPlanVersion();
    invalid.pacingAssumptions.quarterlyDeploymentPcts = ['0.500000000000', '0.400000000000'];

    expect(CurrentPlanVersionV1Schema.safeParse(invalid).success).toBe(false);
  });

  it('rejects stage-distribution percentages that do not sum to one', () => {
    const invalid = validCurrentPlanVersion();
    invalid.cohortAssumptions.stageDistribution = [
      { stage: 'Seed', pct: '0.600000000000' },
      { stage: 'Series A', pct: '0.300000000000' },
    ];

    expect(CurrentPlanVersionV1Schema.safeParse(invalid).success).toBe(false);
  });

  it('rejects graduation and failure rates outside the inclusive zero-to-one range', () => {
    const invalidGraduationRate = validCurrentPlanVersion();
    invalidGraduationRate.cohortAssumptions.graduationMatrix[0]!.rate = '1.000000000001';
    const invalidFailureRate = validCurrentPlanVersion();
    invalidFailureRate.cohortAssumptions.exitAssumptions[0]!.failureRate = '-0.000000000001';

    expect(CurrentPlanVersionV1Schema.safeParse(invalidGraduationRate).success).toBe(false);
    expect(CurrentPlanVersionV1Schema.safeParse(invalidFailureRate).success).toBe(false);
  });

  it('accepts a lowercase 64-hex assumptions hash and rejects a non-hex hash', () => {
    expect(CurrentPlanVersionV1Schema.safeParse(validCurrentPlanVersion()).success).toBe(true);

    const invalid = validCurrentPlanVersion();
    invalid.assumptionsHash = 'g'.repeat(64);
    expect(CurrentPlanVersionV1Schema.safeParse(invalid).success).toBe(false);
  });

  it('is compatible with canonical decimal-leaf validation', () => {
    const parsed = CurrentPlanVersionV1Schema.parse(validCurrentPlanVersion());

    expect(() => canonicalizeDecimalLeaves(parsed)).not.toThrow();
  });

  it('validates the assumptions-hash preimage used by the derivation transform', () => {
    const plan = validCurrentPlanVersion();
    const parsed = CurrentPlanAssumptionsHashPreimageV1Schema.parse({
      sourceConfigId: plan.sourceConfigId,
      sourceConfigVersion: plan.sourceConfigVersion,
      sourceFactsSnapshotId: plan.sourceFactsSnapshotId,
      asOfDate: '2026-07-21',
      planTransformationVersion: PLAN_TRANSFORMATION_VERSION,
      feeCompilerVersion: 'fee-drag-compiler/1.0.0',
      deployableCapitalUsd: plan.deployableCapitalUsd,
      allocations: plan.allocations,
      pacingAssumptions: plan.pacingAssumptions,
      cohortAssumptions: plan.cohortAssumptions,
      reservePolicyVersion: plan.reservePolicyVersion,
    });

    expect(parsed.planTransformationVersion).toBe(PLAN_TRANSFORMATION_VERSION);
  });
});
