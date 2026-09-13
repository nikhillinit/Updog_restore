import { describe, expect, it } from 'vitest';
import { calculateCapitalPlanningV2 } from '../../../shared/lib/capital-planning/capital-planning-v2';
import { CapitalPlanningResultV2Schema } from '../../../shared/contracts/capital-planning-v2.contract';
import { v2Input, v2Round, v2Bundle } from '../../fixtures/capital-planning/v2-fixtures';
const money = (n: number) => n.toFixed(6);
function run(input = v2Input(), commitments = 10000000) {
  const result = calculateCapitalPlanningV2({ input, sourceBundle: v2Bundle(input, commitments) });
  expect(CapitalPlanningResultV2Schema.safeParse(result).success).toBe(true);
  return result.construction;
}
function oracle() {
  const i = v2Input();
  i.allocations = [0.43, 0.43, 0.14].map((w, index) => {
    const a = structuredClone(i.allocations[0]!);
    a.allocationId = `a${index + 1}`;
    a.pipelineProfileId = `p${index + 1}`;
    a.initialPoolShareRatio = w.toFixed(12);
    a.initialCheckUsd = money([250000, 500000, 600000][index]!);
    a.followOnRounds = [
      {
        ...v2Round(),
        checkPolicy: { type: 'fixed_check', checkUsd: money([100000, 200000, 300000][index]!) },
      },
    ];
    return a;
  });
  return i;
}
describe('corrected capital financial core', () => {
  it('calculates maximum financial history shape with evidence on every assumption leaf', () => {
    const input = v2Input();
    input.allocations = Array.from({ length: 10 }, (_, index) => ({
      ...structuredClone(input.allocations[0]!),
      allocationId: `a${index}`,
      pipelineProfileId: `p${index}`,
      initialPoolShareRatio: '0.100000000000',
      followOnRounds: Array.from({ length: 6 }, (_, roundIndex) => {
        const histories = Array.from({ length: 2 ** roundIndex }, (_, history) =>
          roundIndex === 0 ? '' : history.toString(2).padStart(roundIndex, '0')
        );
        return {
          ...v2Round(roundIndex + 1),
          graduationRatio: '0.500000000000',
          eligibility: { type: 'by_history' as const, eligibleParticipationHistories: histories },
          participationPolicy: {
            type: 'conditional_probability_by_history' as const,
            probabilitiesByReachableHistory: Object.fromEntries(
              histories.map((history) => [history, '0.500000000000'])
            ),
          },
        };
      }),
    }));
    const paths: string[] = [];
    const walk = (value: unknown, path: string): void => {
      if (['string', 'number', 'boolean'].includes(typeof value)) paths.push(path);
      else if (Array.isArray(value))
        value.forEach((child, index) => walk(child, `${path}[${index}]`));
      else if (value && typeof value === 'object')
        for (const [key, child] of Object.entries(value))
          walk(child, key === '' ? `${path}[""]` : path ? `${path}.${key}` : key);
    };
    walk(input.allocations, 'allocations');
    walk(input.solve, 'solve');
    input.assumptionEvidence = paths.map((inputPath) => ({
      inputPath,
      origin: 'market_observation',
      publisher: 'Example',
      publicationDate: '2026-06-30',
      observationCutoff: '2026-06-30',
      geography: 'US',
      population: 'Seed',
      statisticType: 'median',
      measurementBasis: 'primary',
    }));
    const result = calculateCapitalPlanningV2({ input, sourceBundle: v2Bundle(input) });
    expect(result.input.assumptionEvidence).toEqual(input.assumptionEvidence);
    expect(result.provenance).toHaveLength(paths.length);
    expect(result.provenance.every((row) => !row.inputPath.startsWith('assumptionEvidence'))).toBe(
      true
    );
    expect(result.provenance.length).toBeLessThanOrEqual(4096);
  });
  it('solves 43/43/14 over initial dollars and joint reserves', () => {
    const c = run(oracle(), 14925000);
    expect(c.solution).toMatchObject({
      initialPoolUsd: '10555162.659123',
      totalReserveUsd: '4369837.340877',
      capitalRoundingResidualUsd: '0.000000',
    });
    expect(c.allocations.map((a) => a.expectedCompanyCount)).toEqual([
      '18.154879773692',
      '9.077439886846',
      '2.462871287129',
    ]);
  });
  it('solves fixed portfolio count without rewriting capacity', () => {
    const i = oracle();
    i.solve = { mode: 'fixed_portfolio', totalExpectedCompanyCount: '50.000000000000' };
    const c = run(i);
    expect(c.solution).toMatchObject({
      initialPoolUsd: '17772511.848341',
      requiredConstructionCapitalUsd: '25130331.753555',
      totalExpectedCompanyCount: '50.000000000000',
      feasible: false,
    });
    expect(c.budgetBridge.committedCapitalUsd).toBe('10000000.000000');
  });
  it.each(['total_primary_including_fund_check', 'external_primary_excluding_fund_check'] as const)(
    'preserves separate participate/skip ownership for %s',
    (basis) => {
      const i = v2Input();
      const r = v2Round();
      r.participationPolicy = {
        type: 'homogeneous_conditional_probability',
        probability: '0.500000000000',
      };
      if (basis === 'external_primary_excluding_fund_check')
        r.financing.primaryCapital = {
          basis,
          externalPrimaryAmountUsd: '2000000.000000',
          primary_only_excludes_secondary: true,
        };
      i.allocations[0]!.followOnRounds = [r];
      const paths = run(i).allocations[0]!.rounds[0]!.paths;
      expect(paths.find((p) => p.outcome === 'participated')).toMatchObject({
        ownershipRatio: '0.100000000000',
        checkUsd:
          basis === 'total_primary_including_fund_check' ? '200000.000000' : '222222.222222',
      });
      expect(paths.find((p) => p.outcome === 'eligible_zero_election')).toMatchObject({
        ownershipRatio: '0.090909090909',
        checkUsd: '0.000000',
      });
    }
  );
  it('retains bounded live and stopped histories through six rounds', () => {
    const i = v2Input();
    i.allocations[0]!.followOnRounds = Array.from({ length: 6 }, (_, j) => ({
      ...v2Round(j + 1),
      graduationRatio: '0.500000000000',
      participationPolicy: {
        type: 'homogeneous_conditional_probability' as const,
        probability: '0.500000000000',
      },
    }));
    const p = run(i).allocations[0]!.rounds[5]!.paths;
    expect(p.filter((x) => x.state === 'live')).toHaveLength(64);
    expect(p.filter((x) => x.state === 'stopped')).toHaveLength(63);
    expect(p).toHaveLength(127);
  });
  it('reports the monthly half-up tie residual without redistributing', () => {
    const i = v2Input();
    const c = run(i, 0.000006);
    expect(c.allocations[0]!.initialScheduleRoundingResidualUsd).toBe('-0.000006');
    expect(c.monthlyDetail.map((r) => r.demandUsd)).toEqual(Array(12).fill('0.000001'));
  });
});

describe('corrected residual and policy oracles', () => {
  it('emits signed count tie residual without redistributing stage counts', () => {
    const i = v2Input();
    i.solve = { mode: 'fixed_portfolio', totalExpectedCompanyCount: '0.000000000001' };
    i.allocations[0]!.initialPoolShareRatio = '0.500000000000';
    i.allocations.push({
      ...structuredClone(i.allocations[0]!),
      allocationId: 'a2',
      pipelineProfileId: 'p2',
    });
    const c = run(i);
    expect(c.allocations.map((a) => a.expectedCompanyCount)).toEqual([
      '0.000000000001',
      '0.000000000001',
    ]);
    expect(c.solution.expectedCountRoundingResidual).toBe('-0.000000000001');
  });
  it('preserves distinct ownership with exact per-history path-demand half-up ties', () => {
    const i = v2Input();
    i.solve = { mode: 'fixed_portfolio', totalExpectedCompanyCount: '1.000000000000' };
    const a = i.allocations[0]!;
    a.initialCheckUsd = '1.000000';
    a.entryFinancing = {
      valuationUsd: '10.000000',
      valuationBasis: 'post_money',
      primaryCapital: {
        basis: 'total_primary_including_fund_check',
        totalPrimaryAmountUsd: '2.000000',
        primary_only_excludes_secondary: true,
      },
    };
    const first = v2Round();
    first.financing = structuredClone(a.entryFinancing);
    first.participationPolicy = {
      type: 'homogeneous_conditional_probability',
      probability: '0.500000000000',
    };
    const second = v2Round(2);
    second.financing = {
      valuationUsd: '8.000000',
      valuationBasis: 'pre_money',
      primaryCapital: {
        basis: 'total_primary_including_fund_check',
        totalPrimaryAmountUsd: '0.000025',
        primary_only_excludes_secondary: true,
      },
    };
    second.participationPolicy = {
      type: 'conditional_probability_by_history',
      probabilitiesByReachableHistory: { '1': '0.400000000000', '0': '0.500000000000' },
    };
    a.followOnRounds = [first, second];
    const r = run(i).allocations[0]!.rounds[1]!;
    expect(r.demandUsd).toBe('0.000001');
    expect(r.pathDemandRoundingResidualUsd).toBe('-0.000001');
    expect(r.paths.filter((p) => p.outcome === 'participated').map((p) => p.demandUsd)).toEqual([
      '0.000001',
      '0.000001',
    ]);
  });
  it('reports parent split probability tie residual exactly once', () => {
    const i = v2Input();
    const first = v2Round();
    first.graduationRatio = '0.000000000001';
    first.participationPolicy = { type: 'none' };
    const second = v2Round(2);
    second.participationPolicy = {
      type: 'homogeneous_conditional_probability',
      probability: '0.500000000000',
    };
    i.allocations[0]!.followOnRounds = [first, second];
    const r = run(i).allocations[0]!.rounds[1]!;
    expect(r.splits).toEqual([
      {
        parentParticipationHistory: '0',
        parentProbability: '0.000000000001',
        pathProbabilityRoundingResidual: '-0.000000000001',
      },
    ]);
  });
  it('matches homogeneous participation to a fully expanded history map', () => {
    const i = v2Input();
    i.allocations[0]!.followOnRounds = [v2Round(), v2Round(2)];
    for (const r of i.allocations[0]!.followOnRounds)
      r.participationPolicy = {
        type: 'homogeneous_conditional_probability',
        probability: '0.500000000000',
      };
    const first = run(i);
    i.allocations[0]!.followOnRounds[0]!.participationPolicy = {
      type: 'conditional_probability_by_history',
      probabilitiesByReachableHistory: { '': '0.500000000000' },
    };
    i.allocations[0]!.followOnRounds[1]!.participationPolicy = {
      type: 'conditional_probability_by_history',
      probabilitiesByReachableHistory: { '0': '0.500000000000', '1': '0.500000000000' },
    };
    const second = run(i);
    expect(second.allocations).toEqual(first.allocations);
    expect(second.solution).toEqual(first.solution);
  });
  it('rejects missing and unreachable participation histories', () => {
    const i = v2Input();
    i.allocations[0]!.followOnRounds = [v2Round()];
    i.allocations[0]!.followOnRounds[0]!.participationPolicy = {
      type: 'conditional_probability_by_history',
      probabilitiesByReachableHistory: { '0': '0.500000000000' },
    };
    expect(() => run(i)).toThrow('exactly every reachable eligible history');
  });
  it('applies pool dilution before pro-rata issuance and distinguishes ineligibility', () => {
    const i = v2Input(),
      r = v2Round();
    r.incrementalPreMoneyPoolDilutionRatio = '0.200000000000';
    i.allocations[0]!.followOnRounds = [r];
    expect(run(i).allocations[0]!.rounds[0]!.paths[0]).toMatchObject({
      ownershipRatio: '0.080000000000',
      checkUsd: '160000.000000',
    });
    r.eligibility = { type: 'by_history', eligibleParticipationHistories: [] };
    expect(run(i).allocations[0]!.rounds[0]!.paths[0]).toMatchObject({
      outcome: 'ineligible',
      ownershipRatio: '0.072727272727',
    });
  });
  it('keeps stress base counts while raising graduation', () => {
    const i = v2Input();
    const r = v2Round();
    r.graduationRatio = '0.500000000000';
    r.checkPolicy = { type: 'fixed_check', checkUsd: '1000000.000000' };
    i.allocations[0]!.followOnRounds = [r];
    const c = run(i, 15000000);
    expect(c.allocations[0]!.expectedCompanyCount).toBe('10.000000000000');
    expect(c.stresses.find((s) => s.name === 'graduation_plus_10pp')).toMatchObject({
      state: 'complete',
      reconciliation: {
        initialDemandUsd: '10000000.000000',
        lifetimeFollowOnUsd: '6000000.000000',
      },
      plannedReserveGapUsd: '1000000.000000',
    });
  });
  it('solves fixed-GP affine inversion without changing source commitments', () => {
    const i = v2Input();
    i.solve = { mode: 'fixed_portfolio', totalExpectedCompanyCount: '10.000000000000' };
    const source = v2Bundle(i, 20000000, (raw, declarations) => {
      raw.fundedFromFeesPct = 0.5;
      raw.economicsAssumptions!.gpCommitmentModel!.commitmentAmount = 400000;
      raw.economicsAssumptions!.feeModel!.tiers![0]!.rate = 0.02;
      raw.economicsAssumptions!.expenseModel!.annualExpenses = [
        { id: 'expense', category: 'administration', amount: 100000, startYear: 1, endYear: 10 },
      ];
      declarations['economicsAssumptions.expenseModel.annualExpenses[0].amount'] = 'usd';
    });
    const c = calculateCapitalPlanningV2({ input: i, sourceBundle: source }).construction;
    expect(c.solution.requiredCommittedCapitalUsd).toEqual({
      state: 'available',
      value: '14000000.000000',
    });
    expect(c.budgetBridge.committedCapitalUsd).toBe('20000000.000000');
  });
  it('rejects tampered source funding facts', () => {
    const i = v2Input(),
      source = v2Bundle(i);
    source.fundSize.normalizedValue = '1.000000';
    expect(() => calculateCapitalPlanningV2({ input: i, sourceBundle: source })).toThrow(
      'FUND_SIZE_SOURCE_MISMATCH'
    );
  });
});

describe('rounding and budget boundaries', () => {
  it('keeps initial weights unchanged while a check-size change alters counts', () => {
    const i = oracle(),
      before = run(i);
    i.allocations[0]!.initialCheckUsd = '500000.000000';
    const after = run(i);
    expect(after.allocations.map((a) => a.initialPoolShareRatio)).toEqual(
      before.allocations.map((a) => a.initialPoolShareRatio)
    );
    expect(after.allocations[0]!.expectedCompanyCount).not.toEqual(
      before.allocations[0]!.expectedCompanyCount
    );
  });
  it('discloses negative initial-allocation half-up residual', () => {
    const i = v2Input();
    i.allocations[0]!.initialPoolShareRatio = '0.500000000000';
    i.allocations.push({
      ...structuredClone(i.allocations[0]!),
      allocationId: 'a2',
      pipelineProfileId: 'p2',
    });
    expect(run(i, 0.000001).solution.initialAllocationRoundingResidualUsd).toBe('-0.000001');
  });
  it('discloses negative capital and follow-on schedule residuals', () => {
    const i = v2Input();
    i.allocations[0]!.followOnRounds = [
      { ...v2Round(), checkPolicy: { type: 'fixed_check', checkUsd: '1000000.000000' } },
    ];
    expect(run(i, 0.000001).solution.capitalRoundingResidualUsd).toBe('-0.000001');
    expect(run(i, 0.000012).allocations[0]!.followOnScheduleRoundingResidualUsd).toBe('-0.000006');
  });
  it('reports entered integer selection separately without changing expected solve', () => {
    const i = v2Input();
    const before = run(i);
    i.allocations[0]!.plannedCompanyCount = 11;
    const after = run(i);
    expect(after.solution).toEqual(before.solution);
    expect(after.allocations[0]!.entered).toEqual({
      companyCount: '11.000000000000',
      initialDemandUsd: '11000000.000000',
      reserveUsd: '0.000000',
      totalDemandUsd: '11000000.000000',
      signedBudgetResidualUsd: '-1000000.000000',
    });
  });
});

describe('affine funding and raw stress precision', () => {
  it('solves percentage GP bridge and preserves raw commitment identity', () => {
    const i = v2Input();
    i.solve = { mode: 'fixed_portfolio', totalExpectedCompanyCount: '10.000000000000' };
    const source = v2Bundle(i, 20000000, (raw, declarations) => {
      raw.fundedFromFeesPct = 0.5;
      delete raw.economicsAssumptions!.gpCommitmentModel!.commitmentAmount;
      delete declarations['economicsAssumptions.gpCommitmentModel.commitmentAmount'];
      raw.economicsAssumptions!.gpCommitmentModel!.commitmentPct = 0.02;
      raw.economicsAssumptions!.feeModel!.tiers![0]!.rate = 0.02;
      raw.economicsAssumptions!.expenseModel!.annualExpenses = [
        { id: 'expense', category: 'administration', amount: 100000, startYear: 1, endYear: 10 },
      ];
      declarations['economicsAssumptions.expenseModel.annualExpenses[0].amount'] = 'usd';
    });
    const c = calculateCapitalPlanningV2({ input: i, sourceBundle: source }).construction;
    expect(c.solution.requiredCommittedCapitalUsd).toEqual({
      state: 'available',
      value: '13924050.632911',
    });
    expect(c.budgetBridge.availableConstructionCapitalUsd).toBe('14800000.000000');
  });
  it('does not quantize stress check changes before calculating aggregate demand', () => {
    const i = v2Input();
    i.solve = { mode: 'fixed_portfolio', totalExpectedCompanyCount: '1000000.000000000000' };
    i.allocations[0]!.initialCheckUsd = '1.000000';
    i.allocations[0]!.followOnRounds = [
      { ...v2Round(), checkPolicy: { type: 'fixed_check', checkUsd: '0.000001' } },
    ];
    expect(
      run(i).stresses.find((s) => s.name === 'fixed_checks_and_pro_rata_rounds_plus_25pct')
    ).toMatchObject({ state: 'complete', reconciliation: { lifetimeFollowOnUsd: '1.250000' } });
  });
});

describe('stress valuation and schedule regression', () => {
  function equivalentStress(basis: 'pre_money' | 'post_money') {
    const input = v2Input();
    input.allocations[0]!.followOnRounds = [v2Round(), v2Round(2)];
    input.allocations[0]!.followOnRounds[0]!.participationPolicy = {
      type: 'homogeneous_conditional_probability',
      probability: '0.500000000000',
    };
    for (const round of input.allocations[0]!.followOnRounds) {
      round.financing.valuationBasis = basis;
      round.financing.valuationUsd = basis === 'pre_money' ? '20000000.000000' : '22000000.000000';
    }
    return run(input).stresses.find(
      (s) => s.name === 'fixed_checks_and_pro_rata_rounds_plus_25pct'
    )!;
  }
  it('preserves pre-money economics when stressing equivalent post-money primary capital', () => {
    const pre = equivalentStress('pre_money'),
      post = equivalentStress('post_money');
    expect(pre.state).toBe('complete');
    expect(post.state).toBe('complete');
    if (pre.state !== 'complete' || post.state !== 'complete')
      throw new Error('Stress must complete');
    expect(post.reconciliation).toEqual(pre.reconciliation);
    expect(post.annualSchedule).toEqual(pre.annualSchedule);
    expect(post.changedPaths).toContain('allocations[0].followOnRounds[0].financing.valuationUsd');
  });
  it('classifies entirely within-term demand from schedule rows without cancellation residue', () => {
    const stress = equivalentStress('pre_money');
    expect(stress.state).toBe('complete');
    if (stress.state !== 'complete') throw new Error('Stress must complete');
    expect(stress.reconciliation.beyondTermFollowOnUsd).toBe('0.000000');
    expect(stress.verdicts.timing).toBe('within_term');
  });
});

describe('acceptance boundary proofs', () => {
  it.each([0.1, 0.11])('refuses nonpositive affine slope with annual fee %s', (rate) => {
    const input = v2Input();
    input.solve = { mode: 'fixed_portfolio', totalExpectedCompanyCount: '1.000000000000' };
    const sourceBundle = v2Bundle(input, 10000000, (raw) => {
      raw.economicsAssumptions!.feeModel!.tiers![0]!.rate = rate;
    });
    expect(() => calculateCapitalPlanningV2({ input, sourceBundle })).toThrow(
      'positive affine slope'
    );
  });
  it('refuses hypothetical commitments smaller than the admitted fixed GP commitment', () => {
    const input = v2Input();
    input.solve = { mode: 'fixed_portfolio', totalExpectedCompanyCount: '1.000000000000' };
    const sourceBundle = v2Bundle(input, 10000000, (raw) => {
      raw.economicsAssumptions!.gpCommitmentModel!.commitmentAmount = 5000000;
    });
    expect(() => calculateCapitalPlanningV2({ input, sourceBundle })).toThrow('not representable');
  });
  it('refuses unsupported fee basis at the public source boundary', () => {
    const input = v2Input();
    const sourceBundle = v2Bundle(input);
    Object.assign(sourceBundle.feeExpense.feeTiers[0]!, { basis: 'invested_capital' });
    expect(() => calculateCapitalPlanningV2({ input, sourceBundle })).toThrow(
      /feeTiers\[0\]\.basis/
    );
  });
  it('refuses a reachable q6 commitment round-trip mismatch at sub-micro construction demand', () => {
    const input = v2Input();
    input.allocations[0]!.initialCheckUsd = '490000.000000';
    input.solve = { mode: 'fixed_portfolio', totalExpectedCompanyCount: '0.000000000001' };
    const sourceBundle = v2Bundle(input, 10000000, (raw) => {
      raw.economicsAssumptions!.feeModel!.tiers![0]!.rate = 0.02;
    });
    // C=.00000049, a=.8: F=.0000006125 -> q6(F)=.000001.
    // q6(C)=0, whereas q6(.8*q6(F))=.000001.
    expect(() => calculateCapitalPlanningV2({ input, sourceBundle })).toThrow('not representable');
  });
  it('changes company count without changing initial dollars when checks change and reserves are absent', () => {
    const input = oracle();
    for (const allocation of input.allocations) allocation.followOnRounds = [];
    const before = run(input);
    input.allocations[0]!.initialCheckUsd = '500000.000000';
    const after = run(input);
    expect(after.allocations.map((a) => a.initialDemandUsd)).toEqual(
      before.allocations.map((a) => a.initialDemandUsd)
    );
    expect(after.allocations.map((a) => a.initialPoolShareRatio)).toEqual(
      before.allocations.map((a) => a.initialPoolShareRatio)
    );
    expect(before.allocations[0]!.expectedCompanyCount).toBe('17.200000000000');
    expect(after.allocations[0]!.expectedCompanyCount).toBe('8.600000000000');
  });
  it('separates graduation, eligible population, election, and ineligibility on a fixed cohort', () => {
    const input = v2Input();
    input.solve = { mode: 'fixed_portfolio', totalExpectedCompanyCount: '10.000000000000' };
    const round = v2Round();
    round.graduationRatio = '0.500000000000';
    round.participationPolicy = { type: 'none' };
    input.allocations[0]!.followOnRounds = [round];
    const none = run(input).allocations[0]!.rounds[0]!;
    expect(none).toMatchObject({
      eligibleCompanyCount: '5.000000000000',
      participatingCompanyCount: '0.000000000000',
    });
    expect(none.paths.find((p) => p.state === 'live')!.outcome).toBe('eligible_zero_election');
    round.participationPolicy = { type: 'all_eligible' };
    const all = run(input).allocations[0]!.rounds[0]!;
    expect(all).toMatchObject({
      eligibleCompanyCount: none.eligibleCompanyCount,
      participatingCompanyCount: '5.000000000000',
    });
    round.graduationRatio = '0.200000000000';
    expect(run(input).allocations[0]!.rounds[0]!).toMatchObject({
      eligibleCompanyCount: '2.000000000000',
      participatingCompanyCount: '2.000000000000',
    });
    round.graduationRatio = '0.500000000000';
    round.eligibility = { type: 'by_history', eligibleParticipationHistories: [] };
    const ineligible = run(input).allocations[0]!.rounds[0]!;
    expect(ineligible).toMatchObject({
      eligibleCompanyCount: '0.000000000000',
      participatingCompanyCount: '0.000000000000',
    });
    expect(ineligible.paths.find((p) => p.state === 'live')!).toMatchObject({
      outcome: 'ineligible',
      ownershipRatio: none.paths.find((p) => p.state === 'live')!.ownershipRatio,
    });
  });
  it('requires a participation declaration instead of supplying a policy default', () => {
    const input = v2Input();
    input.allocations[0]!.followOnRounds = [v2Round()];
    const sourceBundle = v2Bundle(input);
    Reflect.deleteProperty(input.allocations[0]!.followOnRounds[0]!, 'participationPolicy');
    expect(() => calculateCapitalPlanningV2({ input, sourceBundle })).toThrow(
      /participationPolicy/
    );
  });
  it('isolates pool dilution with exact full pro-rata preservation and rejects zero primary capital', () => {
    const input = v2Input();
    const round = v2Round();
    round.incrementalPreMoneyPoolDilutionRatio = '0.200000000000';
    input.allocations[0]!.followOnRounds = [round];
    const sourceBundle = v2Bundle(input);
    expect(
      calculateCapitalPlanningV2({ input, sourceBundle }).construction.allocations[0]!.rounds[0]!
        .paths[0]
    ).toMatchObject({ ownershipRatio: '0.080000000000', checkUsd: '160000.000000' });
    Object.assign(round.financing.primaryCapital, { totalPrimaryAmountUsd: '0.000000' });
    expect(() => calculateCapitalPlanningV2({ input, sourceBundle })).toThrow(
      /totalPrimaryAmountUsd/
    );
  });
});
