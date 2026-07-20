import { describe, expect, it } from 'vitest';
import {
  MarginalReserveInputFailureSchema,
  MarginalReserveRankingItemV1Schema,
} from '@shared/contracts/marginal-reserve-moic-v1.contract';
import { MarginalReserveRankingsResponseV2Schema } from '@shared/contracts/marginal-reserve-moic-v2.contract';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);

type RankingStatus = 'actionable' | 'indicative' | 'unavailable';

function makeResult(status: RankingStatus) {
  const isUnavailable = status === 'unavailable';
  const isIndicative = status === 'indicative';

  return {
    contractVersion: 'marginal-reserve-moic-result-v1',
    status,
    marginalMoic: isUnavailable ? null : isIndicative ? '101.000000' : '5.000000',
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
    warnings: isIndicative
      ? [{ code: 'IMPLAUSIBLE_MAGNITUDE', message: 'Marginal MOIC exceeds 100x' }]
      : [{ code: 'IRR_UNAVAILABLE', message: 'No marginal IRR root exists' }],
  };
}

function makeRanking(status: RankingStatus) {
  return MarginalReserveRankingItemV1Schema.parse({
    companyId: 2,
    status,
    inputReadiness: { status: 'actionable', reasons: [] },
    result: makeResult(status),
  });
}

const unavailableItem = MarginalReserveInputFailureSchema.parse({
  companyId: 3,
  reasons: ['MISSING_CURRENT_OWNERSHIP'],
});

function makeResponse(overrides: Record<string, unknown> = {}) {
  return {
    contractVersion: 'marginal-reserve-rankings-v2',
    mode: 'on',
    actionability: 'non_actionable',
    fundId: 1,
    asOfDate: '2026-07-20',
    factsInputHash: HASH_A,
    assumptionsHash: HASH_B,
    rankings: [makeRanking('actionable')],
    unavailable: [unavailableItem],
    ...overrides,
  };
}

describe('MarginalReserveRankingsResponseV2Schema', () => {
  it('accepts exactly the locked top-level wire keys and rejects unknown keys', () => {
    const parsed = MarginalReserveRankingsResponseV2Schema.parse(makeResponse());

    expect(Object.keys(parsed).sort()).toEqual(
      [
        'contractVersion',
        'mode',
        'actionability',
        'fundId',
        'asOfDate',
        'factsInputHash',
        'assumptionsHash',
        'rankings',
        'unavailable',
      ].sort()
    );
    expect(
      MarginalReserveRankingsResponseV2Schema.safeParse(
        makeResponse({ unexpected: true })
      ).success
    ).toBe(false);
  });

  it.each(['off', 'shadow', 'on'] as const)(
    'accepts %s mode with non_actionable disclosure',
    (mode) => {
      expect(
        MarginalReserveRankingsResponseV2Schema.safeParse(
          makeResponse({ mode, actionability: 'non_actionable' })
        ).success
      ).toBe(true);
    }
  );

  it('accepts on/actionable with at least one actionable ranking', () => {
    expect(
      MarginalReserveRankingsResponseV2Schema.safeParse(
        makeResponse({ actionability: 'actionable' })
      ).success
    ).toBe(true);
  });

  it.each(['off', 'shadow'] as const)('rejects %s/actionable at the mode gate', (mode) => {
    const parsed = MarginalReserveRankingsResponseV2Schema.safeParse(
      makeResponse({ mode, actionability: 'actionable' })
    );

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: ['mode'] })])
      );
    }
  });

  it.each([
    ['empty', []],
    ['all-indicative', [makeRanking('indicative')]],
    ['all-unavailable', [makeRanking('unavailable')]],
  ])('rejects on/actionable when rankings are %s', (_case, rankings) => {
    const parsed = MarginalReserveRankingsResponseV2Schema.safeParse(
      makeResponse({ actionability: 'actionable', rankings })
    );

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: ['rankings'] })])
      );
    }
  });
});
