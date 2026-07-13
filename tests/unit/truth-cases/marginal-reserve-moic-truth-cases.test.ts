import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { calculateMarginalReserveMoic } from '@shared/core/moic/MarginalReserveMoic';
import type { MarginalReserveMoicInputV1 } from '@shared/contracts/marginal-reserve-moic-v1.contract';

const FACTS_HASH = '1'.repeat(64);
const ASSUMPTIONS_HASH = '2'.repeat(64);

function anchorInput(): MarginalReserveMoicInputV1 {
  return {
    contractVersion: 'marginal-reserve-moic-input-v1',
    fundId: 7,
    companyId: 11,
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

describe('marginal reserve MOIC truth cases', () => {
  it('anchor: a USD 1m check at USD 10m post-money returns exactly 5.0x', () => {
    // Post-money = 8m + 2m = 10m.
    // Incremental ownership = 1m / 10m = 10%.
    // Certain proceeds = 10% * 50m = 5m.
    // Marginal MOIC = 5m / 1m = 5.000000.
    const result = calculateMarginalReserveMoic(anchorInput());

    expect(result.status).toBe('actionable');
    expect(result.deltaExpectedProceeds).toBe('5000000.000000');
    expect(result.deltaExpectedCapital).toBe('1000000.000000');
    expect(result.marginalMoic).toBe('5.000000');
  });

  it('weights the anchor at a 25% exit probability to exactly 1.25x', () => {
    // Expected proceeds = 25% * 10% ownership * 50m = 1.25m.
    // Expected capital is still the reached-stage 1m check.
    // Marginal MOIC = 1.25m / 1m = 1.250000.
    const input = anchorInput();
    input.stages[0]!.exitProbability = '0.25';

    const result = calculateMarginalReserveMoic(input);

    expect(result.deltaExpectedProceeds).toBe('1250000.000000');
    expect(result.deltaExpectedCapital).toBe('1000000.000000');
    expect(result.marginalMoic).toBe('1.250000');
  });

  it('applies a later 20% dilution to reduce the certain-exit anchor to 4.0x', () => {
    // Seed check buys 10%. A later 8m pre / 2m round with no participation
    // retains 8m / 10m = 80%, so ownership becomes 8%.
    // Certain proceeds = 8% * 50m = 4m; capital remains 1m; MOIC = 4.0x.
    const input = anchorInput();
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
    expect(result.deltaExpectedCapital).toBe('1000000.000000');
    expect(result.marginalMoic).toBe('4.000000');
  });

  it('moves both numerator and denominator for a probability-weighted future pro-rata check', () => {
    // Seed: 1m buys 10%; 50% exits at 20m, contributing 1.0m proceeds.
    // The other 50% reaches Series A. A 200k pro-rata check preserves 10%:
    //   future expected capital = 50% * 200k = 100k
    //   future expected proceeds = 50% * 10% * 50m = 2.5m
    // Totals: delta proceeds = 3.5m; delta capital = 1.1m;
    // marginal MOIC = 3.5m / 1.1m = 3.181818.
    const input = anchorInput();
    input.stages[0]!.exitProbability = '0.5';
    input.stages[0]!.graduationProbability = '0.5';
    input.stages[0]!.exitValuation = '20000000';
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

    expect(result.stageContributions[1]?.withDecision.expectedCapital).toBe('100000.000000');
    expect(result.stageContributions[1]?.withDecision.expectedProceeds).toBe('2500000.000000');
    expect(result.deltaExpectedProceeds).toBe('3500000.000000');
    expect(result.deltaExpectedCapital).toBe('1100000.000000');
    expect(result.marginalMoic).toBe('3.181818');
  });

  it('never emits a numeric MOIC for a USD 500 denominator', () => {
    // Delta capital = 500, below max(USD 1,000, 1% * 500) = USD 1,000.
    // The mathematical ratio is deliberately suppressed as unavailable.
    const input = anchorInput();
    input.stages[0]!.withDecision.checkAmount = '500';

    const result = calculateMarginalReserveMoic(input);

    expect(result.deltaExpectedCapital).toBe('500.000000');
    expect(result.status).toBe('unavailable');
    expect(result.marginalMoic).toBeNull();
    expect(result.marginalIrr).toBeNull();
    expect(result.warnings.map((warning) => warning.code)).toContain('MIN_DENOMINATOR_FLOOR');
  });
});

describe('marginal reserve MOIC properties', () => {
  it('higher exit value cannot lower marginal MOIC in a linear one-round case', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1_000_000, max: 100_000_000 }),
        fc.integer({ min: 1, max: 100_000_000 }),
        (lowerExitValue, increase) => {
          const lowerInput = anchorInput();
          lowerInput.stages[0]!.exitValuation = lowerExitValue.toString();
          const higherInput = anchorInput();
          higherInput.stages[0]!.exitValuation = (lowerExitValue + increase).toString();

          const lower = calculateMarginalReserveMoic(lowerInput);
          const higher = calculateMarginalReserveMoic(higherInput);

          expect(Number(higher.marginalMoic)).toBeGreaterThanOrEqual(Number(lower.marginalMoic));
        }
      ),
      { numRuns: 50 }
    );
  });

  it('higher check at the same price preserves per-dollar MOIC in a linear no-cap case', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1_000, max: 2_000_000 }), (checkAmount) => {
        const input = anchorInput();
        input.stages[0]!.withDecision.checkAmount = checkAmount.toString();

        const result = calculateMarginalReserveMoic(input);

        expect(result.status).toBe('actionable');
        expect(result.marginalMoic).toBe('5.000000');
      }),
      { numRuns: 50 }
    );
  });

  it('more dilution cannot increase marginal MOIC without other changes', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 4_000_000 }),
        fc.integer({ min: 1, max: 4_000_000 }),
        (firstRoundSize, extraDilution) => {
          const calculateWithLaterRound = (roundSize: number) => {
            const input = anchorInput();
            input.stages[0]!.exitProbability = '0';
            input.stages[0]!.graduationProbability = '1';
            input.stages.push({
              stage: 'series_a',
              preMoneyValuation: '8000000',
              roundSize: roundSize.toString(),
              monthsFromPriorStage: 12,
              graduationProbability: '0',
              exitProbability: '1',
              exitValuation: '50000000',
              withDecision: { participate: false, checkAmount: '0' },
              withoutDecision: { participate: false, checkAmount: '0' },
            });
            return calculateMarginalReserveMoic(input);
          };

          const lessDilution = calculateWithLaterRound(firstRoundSize);
          const moreDilution = calculateWithLaterRound(firstRoundSize + extraDilution);

          expect(Number(moreDilution.marginalMoic)).toBeLessThanOrEqual(
            Number(lessDilution.marginalMoic)
          );
        }
      ),
      { numRuns: 50 }
    );
  });
});
