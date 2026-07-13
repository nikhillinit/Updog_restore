import { describe, expect, it } from 'vitest';
import {
  MIN_DELTA_CAPITAL_FLOOR,
  MarginalReserveMoicInputV1Schema,
  MarginalReserveInputFailureSchema,
  MarginalReserveMoicResultV1Schema,
  MarginalReserveRankingItemV1Schema,
  MarginalReserveStageV1Schema,
} from '@shared/contracts/marginal-reserve-moic-v1.contract';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);

function makeStage(overrides: Record<string, unknown> = {}) {
  return {
    stage: 'seed',
    preMoneyValuation: '8000000',
    roundSize: '2000000',
    monthsFromPriorStage: 0,
    graduationProbability: '0',
    exitProbability: '1',
    exitValuation: '50000000',
    withDecision: { participate: true, checkAmount: '1000000' },
    withoutDecision: { participate: false, checkAmount: '0' },
    ...overrides,
  };
}

function makeInput(overrides: Record<string, unknown> = {}) {
  return {
    contractVersion: 'marginal-reserve-moic-input-v1',
    fundId: 1,
    companyId: 2,
    baseCurrency: 'USD',
    asOfDate: '2026-07-12',
    currentOwnership: '0',
    stages: [makeStage()],
    factsInputHash: HASH_A,
    assumptionsHash: HASH_B,
    engineVersion: 'marginal-reserve-moic-v1',
    ...overrides,
  };
}

function makeResult(overrides: Record<string, unknown> = {}) {
  return {
    contractVersion: 'marginal-reserve-moic-result-v1',
    status: 'actionable',
    marginalMoic: '5.000000',
    marginalIrr: null,
    deltaExpectedProceeds: '5000000.000000',
    deltaExpectedCapital: '1000000.000000',
    withDecision: {
      expectedProceeds: '5000000.000000',
      expectedCapital: '1000000.000000',
      expectedOwnershipAtExit: '0.100000',
    },
    withoutDecision: {
      expectedProceeds: '0.000000',
      expectedCapital: '0.000000',
      expectedOwnershipAtExit: '0.000000',
    },
    stageContributions: [
      {
        stage: 'seed',
        reachProbability: '1.000000',
        conditionalExitProbability: '1.000000',
        conditionalGraduationProbability: '0.000000',
        conditionalFailureProbability: '0.000000',
        unconditionalExitProbability: '1.000000',
        unconditionalFailureProbability: '0.000000',
        withDecision: {
          ownershipAfterRound: '0.100000',
          expectedCapital: '1000000.000000',
          expectedProceeds: '5000000.000000',
          expectedOwnershipAtExit: '0.100000',
        },
        withoutDecision: {
          ownershipAfterRound: '0.000000',
          expectedCapital: '0.000000',
          expectedProceeds: '0.000000',
          expectedOwnershipAtExit: '0.000000',
        },
        deltaExpectedProceeds: '5000000.000000',
        deltaExpectedCapital: '1000000.000000',
      },
    ],
    factsInputHash: HASH_A,
    assumptionsHash: HASH_B,
    resultHash: HASH_C,
    warnings: [{ code: 'IRR_UNAVAILABLE', message: 'No marginal IRR root exists' }],
    ...overrides,
  };
}

describe('MarginalReserveMoicInputV1Schema', () => {
  it('accepts a strict, ordered priced-round counterfactual', () => {
    expect(MarginalReserveMoicInputV1Schema.parse(makeInput())).toEqual(makeInput());
  });

  it('rejects numbers, NaN, and Infinity in decimal-string fields', () => {
    for (const invalid of [1, Number.NaN, Number.POSITIVE_INFINITY, 'NaN', 'Infinity']) {
      const parsed = MarginalReserveStageV1Schema.safeParse(
        makeStage({ preMoneyValuation: invalid })
      );
      expect(parsed.success).toBe(false);
    }
  });

  it('rejects probabilities outside bounds and exit plus graduation above one', () => {
    expect(
      MarginalReserveStageV1Schema.safeParse(makeStage({ exitProbability: '1.000001' })).success
    ).toBe(false);
    expect(
      MarginalReserveStageV1Schema.safeParse(makeStage({ graduationProbability: '-0.1' })).success
    ).toBe(false);
    expect(
      MarginalReserveStageV1Schema.safeParse(
        makeStage({ exitProbability: '0.6', graduationProbability: '0.400001' })
      ).success
    ).toBe(false);
  });

  it('rejects negative valuations, round sizes, and checks', () => {
    expect(
      MarginalReserveStageV1Schema.safeParse(makeStage({ preMoneyValuation: '-1' })).success
    ).toBe(false);
    expect(MarginalReserveStageV1Schema.safeParse(makeStage({ roundSize: '-1' })).success).toBe(
      false
    );
    expect(
      MarginalReserveStageV1Schema.safeParse(
        makeStage({ withDecision: { participate: true, checkAmount: '-1' } })
      ).success
    ).toBe(false);
  });

  it('enforces participation/check consistency and priced-round capacity', () => {
    expect(
      MarginalReserveStageV1Schema.safeParse(
        makeStage({ withDecision: { participate: false, checkAmount: '1' } })
      ).success
    ).toBe(false);
    expect(
      MarginalReserveStageV1Schema.safeParse(
        makeStage({ withDecision: { participate: true, checkAmount: '0' } })
      ).success
    ).toBe(false);
    expect(
      MarginalReserveStageV1Schema.safeParse(
        makeStage({ withDecision: { participate: true, checkAmount: '2000000.000001' } })
      ).success
    ).toBe(false);
  });

  it('requires unique stages in canonical order', () => {
    const duplicate = makeInput({ stages: [makeStage(), makeStage()] });
    const reversed = makeInput({
      stages: [makeStage({ stage: 'series_a' }), makeStage({ stage: 'seed' })],
    });

    expect(MarginalReserveMoicInputV1Schema.safeParse(duplicate).success).toBe(false);
    expect(MarginalReserveMoicInputV1Schema.safeParse(reversed).success).toBe(false);
  });

  it('requires at least one capital difference between paths', () => {
    const sameCapital = makeInput({
      stages: [
        makeStage({
          withDecision: { participate: true, checkAmount: '1000000' },
          withoutDecision: { participate: true, checkAmount: '1000000.000000' },
        }),
      ],
    });

    expect(MarginalReserveMoicInputV1Schema.safeParse(sameCapital).success).toBe(false);
  });

  it('rejects non-USD inputs until an approved FX policy exists', () => {
    expect(
      MarginalReserveMoicInputV1Schema.safeParse(makeInput({ baseCurrency: 'EUR' })).success
    ).toBe(false);
    expect(
      MarginalReserveMoicInputV1Schema.safeParse(makeInput({ baseCurrency: 'usd' })).success
    ).toBe(false);
  });

  it('is strict at every object boundary', () => {
    expect(
      MarginalReserveMoicInputV1Schema.safeParse(makeInput({ unexpected: true })).success
    ).toBe(false);
    expect(
      MarginalReserveMoicInputV1Schema.safeParse({
        ...makeInput(),
        stages: [makeStage({ withDecision: { participate: true, checkAmount: '1', extra: 1 } })],
      }).success
    ).toBe(false);
  });

  it('represents stale assumptions as indicative input readiness', () => {
    expect(
      MarginalReserveMoicInputV1Schema.safeParse(
        makeInput({
          readiness: { status: 'indicative', reasons: ['STALE_ASSUMPTION'] },
        })
      ).success
    ).toBe(true);
    expect(
      MarginalReserveMoicInputV1Schema.safeParse(
        makeInput({ readiness: { status: 'actionable', reasons: ['STALE_ASSUMPTION'] } })
      ).success
    ).toBe(false);
  });

  it('requires explicit reasons for unavailable company inputs', () => {
    expect(
      MarginalReserveInputFailureSchema.parse({
        companyId: 2,
        reasons: ['MISSING_CURRENT_OWNERSHIP'],
      })
    ).toEqual({ companyId: 2, reasons: ['MISSING_CURRENT_OWNERSHIP'] });
    expect(MarginalReserveInputFailureSchema.safeParse({ companyId: 2, reasons: [] }).success).toBe(
      false
    );
  });
});

describe('MarginalReserveMoicResultV1Schema', () => {
  it('accepts auditable paired summaries and stage contributions', () => {
    expect(MarginalReserveMoicResultV1Schema.parse(makeResult())).toEqual(makeResult());
  });

  it('requires unavailable results to suppress MOIC and IRR', () => {
    expect(
      MarginalReserveMoicResultV1Schema.safeParse(
        makeResult({ status: 'unavailable', marginalMoic: '5.000000' })
      ).success
    ).toBe(false);
    expect(
      MarginalReserveMoicResultV1Schema.safeParse(
        makeResult({ status: 'unavailable', marginalMoic: null, marginalIrr: null })
      ).success
    ).toBe(true);
  });

  it('requires the structured magnitude warning for indicative results', () => {
    expect(
      MarginalReserveMoicResultV1Schema.safeParse(
        makeResult({ status: 'indicative', marginalMoic: '101.000000', warnings: [] })
      ).success
    ).toBe(false);
    expect(
      MarginalReserveMoicResultV1Schema.safeParse(
        makeResult({
          status: 'indicative',
          marginalMoic: '101.000000',
          warnings: [{ code: 'IMPLAUSIBLE_MAGNITUDE', message: 'Marginal MOIC exceeds 100x' }],
        })
      ).success
    ).toBe(true);
  });

  it('enforces the 100x indicative threshold in both directions', () => {
    expect(
      MarginalReserveMoicResultV1Schema.safeParse(
        makeResult({ status: 'actionable', marginalMoic: '101.000000' })
      ).success
    ).toBe(false);
    expect(
      MarginalReserveMoicResultV1Schema.safeParse(
        makeResult({
          status: 'indicative',
          marginalMoic: '100.000000',
          warnings: [{ code: 'IMPLAUSIBLE_MAGNITUDE', message: 'Marginal MOIC exceeds 100x' }],
        })
      ).success
    ).toBe(false);
  });

  it('keeps stale readiness outside the strict V1 engine result', () => {
    expect(
      MarginalReserveMoicResultV1Schema.safeParse(
        makeResult({
          status: 'indicative',
          marginalMoic: '5.000000',
          warnings: [],
        })
      ).success
    ).toBe(false);
    expect(
      MarginalReserveRankingItemV1Schema.safeParse({
        companyId: 2,
        status: 'indicative',
        inputReadiness: { status: 'indicative', reasons: ['STALE_ASSUMPTION'] },
        result: makeResult(),
      }).success
    ).toBe(true);
    expect(
      MarginalReserveRankingItemV1Schema.safeParse({
        companyId: 2,
        status: 'actionable',
        inputReadiness: { status: 'indicative', reasons: ['STALE_ASSUMPTION'] },
        result: makeResult(),
      }).success
    ).toBe(false);
  });
});

describe('MIN_DELTA_CAPITAL_FLOOR', () => {
  it('documents both binding floor prongs as exact decimal strings', () => {
    expect(MIN_DELTA_CAPITAL_FLOOR).toEqual({
      absoluteUsd: '1000',
      withDecisionExpectedCapitalRatio: '0.01',
    });
  });
});
