import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import Decimal from '@shared/lib/decimal-config';
import { calculateMarginalReserveMoic } from '@shared/core/moic/MarginalReserveMoic';
import type { MarginalReserveMoicInputV1 } from '@shared/contracts/marginal-reserve-moic-v1.contract';

const FACTS_HASH = 'a'.repeat(64);
const ASSUMPTIONS_HASH = 'b'.repeat(64);

function baseInput(): MarginalReserveMoicInputV1 {
  return {
    contractVersion: 'marginal-reserve-moic-input-v1',
    fundId: 1,
    companyId: 2,
    baseCurrency: 'USD',
    asOfDate: '2026-07-12',
    currentOwnership: '0',
    stages: [
      {
        stage: 'seed',
        preMoneyValuation: '8000000',
        roundSize: '2000000',
        monthsFromPriorStage: 0,
        graduationProbability: '0',
        exitProbability: '1',
        exitValuation: '50000000',
        withDecision: { participate: true, checkAmount: '1000000' },
        withoutDecision: { participate: false, checkAmount: '0' },
      },
    ],
    factsInputHash: FACTS_HASH,
    assumptionsHash: ASSUMPTIONS_HASH,
    engineVersion: 'marginal-reserve-moic-v1',
  };
}

describe('calculateMarginalReserveMoic', () => {
  it('calculates a certain exit with no later dilution', () => {
    const result = calculateMarginalReserveMoic(baseInput());

    expect(result.status).toBe('actionable');
    expect(result.deltaExpectedProceeds).toBe('5000000.000000');
    expect(result.deltaExpectedCapital).toBe('1000000.000000');
    expect(result.marginalMoic).toBe('5.000000');
    expect(result.marginalIrr).toBeNull();
    expect(result.withDecision.expectedOwnershipAtExit).toBe('0.100000');
    expect(result.warnings.map((warning) => warning.code)).toEqual(['IRR_UNAVAILABLE']);
  });

  it('weights proceeds by a 50% conditional exit probability', () => {
    const input = baseInput();
    input.stages[0]!.exitProbability = '0.5';

    const result = calculateMarginalReserveMoic(input);

    expect(result.deltaExpectedProceeds).toBe('2500000.000000');
    expect(result.deltaExpectedCapital).toBe('1000000.000000');
    expect(result.marginalMoic).toBe('2.500000');
    expect(result.stageContributions[0]?.unconditionalExitProbability).toBe('0.500000');
  });

  it('dilutes both paths at a later non-participated round', () => {
    const input = baseInput();
    input.stages[0]!.exitProbability = '0';
    input.stages[0]!.graduationProbability = '1';
    input.stages.push({
      stage: 'series_a',
      preMoneyValuation: '8000000',
      roundSize: '2000000',
      monthsFromPriorStage: 12,
      graduationProbability: '0',
      exitProbability: '1',
      exitValuation: '50000000',
      withDecision: { participate: false, checkAmount: '0' },
      withoutDecision: { participate: false, checkAmount: '0' },
    });

    const result = calculateMarginalReserveMoic(input);

    expect(result.stageContributions[1]?.withDecision.ownershipAfterRound).toBe('0.080000');
    expect(result.deltaExpectedProceeds).toBe('4000000.000000');
    expect(result.marginalMoic).toBe('4.000000');
    expect(result.marginalIrr).toBe('3.000000');
  });

  it('models future pro-rata participation independently in the with-decision path', () => {
    const input = baseInput();
    input.stages[0]!.exitProbability = '0';
    input.stages[0]!.graduationProbability = '1';
    input.stages.push({
      stage: 'series_a',
      preMoneyValuation: '8000000',
      roundSize: '2000000',
      monthsFromPriorStage: 12,
      graduationProbability: '0',
      exitProbability: '1',
      exitValuation: '50000000',
      withDecision: { participate: true, checkAmount: '200000' },
      withoutDecision: { participate: false, checkAmount: '0' },
    });

    const result = calculateMarginalReserveMoic(input);

    expect(result.stageContributions[1]?.withDecision.ownershipAfterRound).toBe('0.100000');
    expect(result.deltaExpectedCapital).toBe('1200000.000000');
    expect(result.deltaExpectedProceeds).toBe('5000000.000000');
    expect(result.marginalMoic).toBe('4.166667');
  });

  it('includes all probability-weighted future check differences in capital', () => {
    const input = baseInput();
    input.stages[0]!.exitProbability = '0';
    input.stages[0]!.graduationProbability = '0.5';
    input.stages.push({
      stage: 'series_a',
      preMoneyValuation: '10000000',
      roundSize: '2000000',
      monthsFromPriorStage: 12,
      graduationProbability: '0',
      exitProbability: '1',
      exitValuation: '60000000',
      withDecision: { participate: true, checkAmount: '1000000' },
      withoutDecision: { participate: true, checkAmount: '500000' },
    });

    const result = calculateMarginalReserveMoic(input);

    expect(result.stageContributions[1]?.reachProbability).toBe('0.500000');
    expect(result.stageContributions[1]?.deltaExpectedCapital).toBe('250000.000000');
    expect(result.deltaExpectedCapital).toBe('1250000.000000');
  });

  it('incurs the reached-stage check when the company fails at that stage', () => {
    const input = baseInput();
    input.stages[0]!.exitProbability = '0';
    input.stages[0]!.graduationProbability = '0';

    const result = calculateMarginalReserveMoic(input);

    expect(result.stageContributions[0]?.conditionalFailureProbability).toBe('1.000000');
    expect(result.deltaExpectedCapital).toBe('1000000.000000');
    expect(result.deltaExpectedProceeds).toBe('0.000000');
    expect(result.marginalMoic).toBe('0.000000');
  });

  it('returns unavailable when the only nominal capital difference is unreachable', () => {
    const input = baseInput();
    input.stages[0]!.withDecision = { participate: false, checkAmount: '0' };
    input.stages[0]!.withoutDecision = { participate: false, checkAmount: '0' };
    input.stages.push({
      stage: 'series_a',
      preMoneyValuation: '10000000',
      roundSize: '1000000',
      monthsFromPriorStage: 12,
      graduationProbability: '0',
      exitProbability: '1',
      exitValuation: '50000000',
      withDecision: { participate: true, checkAmount: '1000000' },
      withoutDecision: { participate: false, checkAmount: '0' },
    });

    const result = calculateMarginalReserveMoic(input);

    expect(result.status).toBe('unavailable');
    expect(result.marginalMoic).toBeNull();
    expect(result.marginalIrr).toBeNull();
    expect(result.deltaExpectedCapital).toBe('0.000000');
    expect(result.warnings.map((warning) => warning.code)).toEqual(['NON_POSITIVE_DELTA_CAPITAL']);
  });

  it('applies the absolute denominator floor to a small positive delta', () => {
    const input = baseInput();
    input.stages[0]!.withDecision.checkAmount = '500';

    const result = calculateMarginalReserveMoic(input);

    expect(result.deltaExpectedCapital).toBe('500.000000');
    expect(result.status).toBe('unavailable');
    expect(result.marginalMoic).toBeNull();
    expect(result.marginalIrr).toBeNull();
    expect(result.warnings.map((warning) => warning.code)).toEqual(['MIN_DENOMINATOR_FLOOR']);
  });

  it('applies the one-percent with-decision-capital floor prong', () => {
    const input = baseInput();
    input.stages[0]!.withDecision.checkAmount = '1000000';
    input.stages[0]!.withoutDecision = { participate: true, checkAmount: '995000' };

    const result = calculateMarginalReserveMoic(input);

    expect(result.deltaExpectedCapital).toBe('5000.000000');
    expect(result.status).toBe('unavailable');
    expect(result.warnings[0]?.message).toContain('10000.000000 floor');
  });

  it('downgrades a computed result above 100x to indicative', () => {
    const input = baseInput();
    input.stages[0] = {
      ...input.stages[0]!,
      preMoneyValuation: '0',
      roundSize: '1000',
      exitValuation: '200000',
      withDecision: { participate: true, checkAmount: '1000' },
    };

    const result = calculateMarginalReserveMoic(input);

    expect(result.status).toBe('indicative');
    expect(result.marginalMoic).toBe('200.000000');
    expect(result.warnings.map((warning) => warning.code)).toContain('IMPLAUSIBLE_MAGNITUDE');
  });

  it('downgrades a supported result when approved assumptions are stale', () => {
    const input = baseInput();
    input.readiness = { status: 'indicative', reasons: ['STALE_ASSUMPTION'] };

    const result = calculateMarginalReserveMoic(input);

    expect(result.status).toBe('indicative');
    expect(result.marginalMoic).toBe('5.000000');
    expect(result.warnings.map((warning) => warning.code)).toContain('STALE_ASSUMPTION');
  });

  it('rejects an invalid probability sum before projection', () => {
    const input = baseInput();
    input.stages[0]!.exitProbability = '0.6';
    input.stages[0]!.graduationProbability = '0.5';

    expect(() => calculateMarginalReserveMoic(input)).toThrow(ZodError);
  });

  it('rejects non-USD input rather than inventing FX conversion', () => {
    const input = baseInput();
    Object.assign(input, { baseCurrency: 'EUR' });

    expect(() => calculateMarginalReserveMoic(input)).toThrow(ZodError);
  });

  it('produces a deterministic hash from normalized input and output', () => {
    const compact = baseInput();
    const fixed = baseInput();
    fixed.currentOwnership = '0.000000';
    fixed.stages[0]!.preMoneyValuation = '8000000.000000';
    fixed.stages[0]!.roundSize = '2000000.000000';
    fixed.stages[0]!.graduationProbability = '0.000000';
    fixed.stages[0]!.exitProbability = '1.000000';
    fixed.stages[0]!.exitValuation = '50000000.000000';
    fixed.stages[0]!.withDecision.checkAmount = '1000000.000000';
    fixed.stages[0]!.withoutDecision.checkAmount = '0.000000';

    const compactResult = calculateMarginalReserveMoic(compact);
    const fixedResult = calculateMarginalReserveMoic(fixed);

    expect(compactResult.resultHash).toMatch(/^[a-f0-9]{64}$/);
    expect(fixedResult.resultHash).toBe(compactResult.resultHash);
  });

  it('makes stage deltas sum exactly to top-level deltas', () => {
    const input = baseInput();
    input.stages[0]!.exitProbability = '0';
    input.stages[0]!.graduationProbability = '0.5';
    input.stages.push({
      stage: 'series_a',
      preMoneyValuation: '10000000',
      roundSize: '2000000',
      monthsFromPriorStage: 18,
      graduationProbability: '0',
      exitProbability: '1',
      exitValuation: '60000000',
      withDecision: { participate: true, checkAmount: '1000000' },
      withoutDecision: { participate: true, checkAmount: '500000' },
    });

    const result = calculateMarginalReserveMoic(input);
    const capitalSum = result.stageContributions.reduce(
      (sum, stage) => sum.plus(stage.deltaExpectedCapital),
      new Decimal(0)
    );
    const proceedsSum = result.stageContributions.reduce(
      (sum, stage) => sum.plus(stage.deltaExpectedProceeds),
      new Decimal(0)
    );

    expect(capitalSum.toFixed(6)).toBe(result.deltaExpectedCapital);
    expect(proceedsSum.toFixed(6)).toBe(result.deltaExpectedProceeds);
  });
});
