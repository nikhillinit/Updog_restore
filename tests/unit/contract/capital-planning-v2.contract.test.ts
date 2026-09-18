import { describe, expect, it } from 'vitest';
import {
  CAPITAL_PLANNING_V2_VERSION,
  CAPITAL_PLANNING_V2_ROUNDING_POLICY,
  CapitalPlanningInputV2Schema,
  CapitalFinancingV2Schema,
  CapitalPathResultV2Schema,
  CapitalPathSplitV2Schema,
  CapitalPlanningStoredInputV2Schema,
  CapitalAssumptionEvidenceV2Schema,
  CapitalSolutionV2Schema,
} from '../../../shared/contracts/capital-planning-v2.contract';

const financing = {
  valuationUsd: '10000000.000000',
  valuationBasis: 'pre_money',
  primaryCapital: {
    basis: 'total_primary_including_fund_check',
    totalPrimaryAmountUsd: '2000000.000000',
    primary_only_excludes_secondary: true,
  },
};
const round = {
  roundId: 'a',
  stageId: 'a',
  roundLabel: 'Series A',
  graduationRatio: '0.500000000000',
  eligibility: { type: 'all' },
  participationPolicy: { type: 'all_eligible' },
  checkPolicy: { type: 'pro_rata', proRataExerciseRatio: '1.000000000000' },
  lagMonthsFromPreviousRound: 12,
  timingBasis: 'interval_from_previous_round',
  poolBasis: 'incremental_pre_money',
  incrementalPreMoneyPoolDilutionRatio: '0.100000000000',
  financing,
};
const input = {
  contractVersion: 'capital-planning/2.0.0',
  roundingPolicy: 'capital-planning-rounding/half-up-money-6-ratio-12/1.0.0',
  solve: { mode: 'fixed_fund' },
  allocations: [
    {
      allocationId: 'seed',
      name: 'Seed',
      entryRound: 'Seed',
      pipelineProfileId: 'pipeline',
      entryStageId: 'seed',
      initialPoolShareRatio: '1.000000000000',
      initialCheckUsd: '1000000.000000',
      deploymentPeriodYears: 3,
      scheduleAnchor: 'entry_deployment_month',
      deploymentCadence: 'uniform_monthly_over_deployment_period',
      entryFinancing: financing,
      followOnRounds: [round],
    },
  ],
};

describe('corrected capital planning contract', () => {
  it('binds evidence uniquely to existing assumption leaves', () => {
    const evidence = { inputPath: 'allocations[0].initialCheckUsd', origin: 'manager_assumption' };
    expect(
      CapitalPlanningInputV2Schema.safeParse({ ...input, assumptionEvidence: [evidence] }).success
    ).toBe(true);
    for (const inputPath of [
      'allocations[0].missing',
      'allocations[0]',
      'contractVersion',
      'roundingPolicy',
      'assumptionEvidence[0].origin',
      'allocations[0].__proto__.toString',
    ]) {
      expect(
        CapitalPlanningInputV2Schema.safeParse({
          ...input,
          assumptionEvidence: [{ ...evidence, inputPath }],
        }).success,
        inputPath
      ).toBe(false);
    }
    expect(
      CapitalPlanningInputV2Schema.safeParse({ ...input, assumptionEvidence: [evidence, evidence] })
        .success
    ).toBe(false);
  });
  it('returns validation failures for malformed numeric strings without throwing', () => {
    for (const value of ['oops', '1e1000000', '-0.000000000000', '0.0000000000000']) {
      const candidate = structuredClone(input);
      candidate.allocations[0]!.initialPoolShareRatio = value;
      expect(() => CapitalPlanningInputV2Schema.safeParse(candidate)).not.toThrow();
      expect(CapitalPlanningInputV2Schema.safeParse(candidate).success).toBe(false);
    }
  });
  it('requires explicit opt-in and preserves input bytes', () => {
    expect(CapitalPlanningInputV2Schema.parse(input)).toEqual(input);
    expect(CAPITAL_PLANNING_V2_VERSION).toBe(input.contractVersion);
    expect(CAPITAL_PLANNING_V2_ROUNDING_POLICY).toBe(input.roundingPolicy);
  });
  it.each(['roundingPolicy', 'solve'])('rejects missing %s', (key) => {
    const candidate = { ...input } as Record<string, unknown>;
    delete candidate[key];
    expect(CapitalPlanningInputV2Schema.safeParse(candidate).success).toBe(false);
  });
  it.each(['participationPolicy', 'eligibility', 'timingBasis', 'poolBasis', 'financing'])(
    'rejects missing round %s',
    (key) => {
      const candidate = structuredClone(input);
      delete (candidate.allocations[0]!.followOnRounds[0] as Record<string, unknown>)[key];
      expect(CapitalPlanningInputV2Schema.safeParse(candidate).success).toBe(false);
    }
  );
  it('rejects lifecycle weights, unknown fields, partial weight sums and duplicate IDs', () => {
    const candidate = structuredClone(input);
    expect(
      CapitalPlanningInputV2Schema.safeParse({ ...input, budgetShareRatio: '1.000000000000' })
        .success
    ).toBe(false);
    candidate.allocations[0]!.initialPoolShareRatio = '0.500000000000';
    expect(CapitalPlanningInputV2Schema.safeParse(candidate).success).toBe(false);
    candidate.allocations.push(candidate.allocations[0]!);
    expect(CapitalPlanningInputV2Schema.safeParse(candidate).success).toBe(false);
  });
  it('admits fixed portfolio objective only with positive decimal expected count', () => {
    expect(
      CapitalPlanningInputV2Schema.safeParse({
        ...input,
        solve: { mode: 'fixed_portfolio', totalExpectedCompanyCount: '3.500000000000' },
      }).success
    ).toBe(true);
    expect(
      CapitalPlanningInputV2Schema.safeParse({
        ...input,
        solve: { mode: 'fixed_portfolio', totalExpectedCompanyCount: '0.000000000000' },
      }).success
    ).toBe(false);
  });
  it('rejects secondary-shaped or ambiguous external post-money financing', () => {
    expect(
      CapitalFinancingV2Schema.safeParse({
        ...financing,
        primaryCapital: { ...financing.primaryCapital, primary_only_excludes_secondary: false },
      }).success
    ).toBe(false);
    expect(
      CapitalFinancingV2Schema.safeParse({
        ...financing,
        valuationBasis: 'post_money',
        primaryCapital: {
          basis: 'external_primary_excluding_fund_check',
          externalPrimaryAmountUsd: '1000000.000000',
          primary_only_excludes_secondary: true,
        },
      }).success
    ).toBe(false);
  });
  it('requires signed split residual and bounded bitset identity', () => {
    const path = {
      participationHistory: '01',
      parentParticipationHistory: '0',
      roundIndex: 2,
      state: 'live',
      outcome: 'participated',
      probability: '0.250000000000',
      ownershipRatio: '0.100000000000',
      checkUsd: '100.000000',
      demandUsd: '25.000000',
    };
    expect(CapitalPathResultV2Schema.safeParse(path).success).toBe(true);
    expect(
      CapitalPathResultV2Schema.safeParse({ ...path, participationHistory: '012' }).success
    ).toBe(false);
    const split = {
      parentParticipationHistory: '0',
      parentProbability: '0.500000000000',
      pathProbabilityRoundingResidual: '-0.000000000001',
    };
    expect(CapitalPathSplitV2Schema.safeParse(split).success).toBe(true);
    const { pathProbabilityRoundingResidual: _, ...missing } = split;
    expect(CapitalPathSplitV2Schema.safeParse(missing).success).toBe(false);
  });
  it('keeps unknown recorded policies structurally readable but not executable', () => {
    const future = { ...input, roundingPolicy: 'rounding/future' };
    expect(CapitalPlanningStoredInputV2Schema.parse(future)).toEqual(future);
    expect(CapitalPlanningInputV2Schema.safeParse(future).success).toBe(false);
  });
  it('requires all market observation measurement dimensions', () => {
    expect(
      CapitalAssumptionEvidenceV2Schema.safeParse({
        inputPath: 'allocations[0].initialCheckUsd',
        origin: 'market_observation',
        publisher: 'Example',
      }).success
    ).toBe(false);
    expect(
      CapitalAssumptionEvidenceV2Schema.safeParse({
        inputPath: 'allocations[0].initialCheckUsd',
        origin: 'manager_assumption',
      }).success
    ).toBe(true);
  });
  it('requires the three solution residuals including zeros', () => {
    const solution = {
      mode: 'fixed_fund',
      countBasis: 'expected',
      sourceCapacityGapUsd: '0.000000',
      feasible: true,
      initialPoolUsd: '100.000000',
      totalExpectedCompanyCount: '1.000000000000',
      totalReserveUsd: '0.000000',
      requiredConstructionCapitalUsd: '100.000000',
      requiredCommittedCapitalUsd: { state: 'unavailable', value: null, reason: 'NOT_APPLICABLE' },
      expectedCountRoundingResidual: '0.000000000000',
      initialAllocationRoundingResidualUsd: '0.000000',
      capitalRoundingResidualUsd: '-0.000001',
    };
    expect(CapitalSolutionV2Schema.safeParse(solution).success).toBe(true);
    for (const key of [
      'expectedCountRoundingResidual',
      'initialAllocationRoundingResidualUsd',
      'capitalRoundingResidualUsd',
    ]) {
      const candidate = { ...solution } as Record<string, unknown>;
      delete candidate[key];
      expect(CapitalSolutionV2Schema.safeParse(candidate).success).toBe(false);
    }
  });
});
