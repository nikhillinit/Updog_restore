import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import type { FundMoicRankingItemV1 } from '../../../../shared/contracts/fund-moic-v1.contract';
import type {
  MarginalReserveMoicInputV1,
  MarginalReserveRankingItemV1,
} from '../../../../shared/contracts/marginal-reserve-moic-v1.contract';
import { calculateMarginalReserveMoic } from '../../../../shared/core/moic/MarginalReserveMoic';
import {
  buildMarginalReserveMoicShadowArtifact,
  emitMarginalReserveMoicShadowComparison,
  type MarginalReserveMoicShadowInput,
} from '../../../../server/services/moic/marginal-reserve-moic-shadow-service';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

function planned(
  companyId: number,
  rank: number,
  moic: number | null,
  name = `Private Company ${companyId}`
): FundMoicRankingItemV1 {
  return {
    rank,
    investmentId: String(companyId),
    investmentName: name,
    reservesMoic: {
      value: moic,
      description: `private-description-${companyId}`,
      formula: `private-formula-${companyId}`,
    },
  };
}

function marginal(
  companyId: number,
  moic: number,
  readiness: MarginalReserveMoicInputV1['readiness'] = {
    status: 'actionable',
    reasons: [],
  }
): MarginalReserveRankingItemV1 {
  const input: MarginalReserveMoicInputV1 = {
    contractVersion: 'marginal-reserve-moic-input-v1',
    fundId: 1,
    companyId,
    baseCurrency: 'USD',
    asOfDate: '2026-07-12',
    currentOwnership: '0',
    stages: [
      {
        stage: 'series_a',
        preMoneyValuation: '8000000',
        roundSize: '2000000',
        monthsFromPriorStage: 12,
        graduationProbability: '0',
        exitProbability: '1',
        exitValuation: String(moic * 10_000_000),
        withDecision: { participate: true, checkAmount: '1000000' },
        withoutDecision: { participate: false, checkAmount: '0' },
      },
    ],
    factsInputHash: HASH_A,
    assumptionsHash: HASH_B,
    engineVersion: 'marginal-reserve-moic-v1',
    readiness,
  };
  const result = calculateMarginalReserveMoic(input);
  return {
    companyId,
    status:
      result.status === 'actionable' && readiness.status === 'indicative'
        ? 'indicative'
        : result.status,
    inputReadiness: readiness,
    result,
  };
}

function fixture(
  overrides: Partial<MarginalReserveMoicShadowInput> = {}
): MarginalReserveMoicShadowInput {
  return {
    fundId: 1,
    plannedRankings: [
      planned(1, 1, 1),
      planned(2, 2, 1),
      planned(3, 3, 1),
      planned(4, 4, 1),
      planned(5, 5, 1),
      planned(6, 6, 1),
      planned(8, 7, null),
    ],
    marginalRankings: [
      marginal(2, 10),
      marginal(1, 9),
      marginal(3, 8),
      marginal(5, 7),
      marginal(4, 6),
      marginal(7, 5),
      marginal(8, 4, { status: 'indicative', reasons: ['STALE_ASSUMPTION'] }),
    ],
    unavailable: [
      { companyId: 9, reasons: ['BLOCKED_CURRENCY', 'BLOCKED_CURRENCY'] },
      { companyId: 10, reasons: ['BLOCKED_CURRENCY', 'MISSING_CURRENT_OWNERSHIP'] },
    ],
    ...overrides,
  };
}

describe('marginal reserve MOIC shadow comparison', () => {
  it('emits overlap, inversion, actionability, and unavailable-reason metrics', () => {
    const artifact = buildMarginalReserveMoicShadowArtifact(fixture());

    expect(artifact.metrics).toEqual({
      top_3_overlap: 3,
      top_5_overlap: 5,
      pairwise_rank_inversion_count: 2,
      companies_actionable_in_both: 5,
      companies_only_planned_actionable: 1,
      companies_only_marginal_actionable: 1,
      median_moic_ratio: '8.000000',
      unavailable_reason_counts: {
        BLOCKED_CURRENCY: 2,
        MISSING_CURRENT_OWNERSHIP: 1,
      },
    });
  });

  it('creates empty top-five annotations that block approval', () => {
    const artifact = buildMarginalReserveMoicShadowArtifact(fixture());

    expect(artifact.status).toBe('annotation_required');
    expect(artifact.annotations).toEqual([
      {
        inversionId: '1:2',
        companyIds: [1, 2],
        plannedRanks: [1, 2],
        marginalRanks: [2, 1],
        annotation: '',
        reviewedBy: null,
        reviewerRole: null,
        reviewedAt: null,
      },
      {
        inversionId: '4:5',
        companyIds: [4, 5],
        plannedRanks: [4, 5],
        marginalRanks: [5, 4],
        annotation: '',
        reviewedBy: null,
        reviewerRole: null,
        reviewedAt: null,
      },
    ]);
  });

  it('approves only after every unexplained top-five inversion is annotated', () => {
    const artifact = buildMarginalReserveMoicShadowArtifact(
      fixture({
        annotationsByInversionId: {
          '1:2': {
            annotation: 'Investment team prefers company 2 at the margin.',
            reviewedBy: 'reviewer-1',
            reviewerRole: 'investment_team',
            reviewedAt: '2026-07-12T20:00:00.000Z',
          },
          '4:5': {
            annotation: 'Known timing difference in the approved stage path.',
            reviewedBy: 'reviewer-2',
            reviewerRole: 'investment_team',
            reviewedAt: '2026-07-12T20:05:00.000Z',
          },
        },
      })
    );

    expect(artifact.status).toBe('approved');
    expect(artifact.annotations.every((annotation) => annotation.annotation.length > 0)).toBe(true);
  });

  it('produces deterministic rankings and annotations from permuted fixture order', () => {
    const original = fixture();
    const permuted = fixture({
      plannedRankings: [...original.plannedRankings].reverse(),
      marginalRankings: [...original.marginalRankings].reverse(),
      unavailable: [...original.unavailable].reverse(),
    });

    expect(buildMarginalReserveMoicShadowArtifact(permuted)).toEqual(
      buildMarginalReserveMoicShadowArtifact(original)
    );
  });

  it('calculates odd, even, and unavailable median MOIC ratios', () => {
    const odd = buildMarginalReserveMoicShadowArtifact(
      fixture({
        plannedRankings: [planned(1, 1, 2), planned(2, 2, 4), planned(3, 3, 5)],
        marginalRankings: [marginal(1, 2), marginal(2, 8), marginal(3, 20)],
        unavailable: [],
      })
    );
    const even = buildMarginalReserveMoicShadowArtifact(
      fixture({
        plannedRankings: [planned(1, 1, 2), planned(2, 2, 4)],
        marginalRankings: [marginal(1, 2), marginal(2, 12)],
        unavailable: [],
      })
    );
    const none = buildMarginalReserveMoicShadowArtifact(
      fixture({
        plannedRankings: [planned(1, 1, 0), planned(2, 2, null)],
        marginalRankings: [marginal(1, 2)],
        unavailable: [],
      })
    );

    expect(odd.metrics.median_moic_ratio).toBe('2.000000');
    expect(even.metrics.median_moic_ratio).toBe('2.000000');
    expect(none.metrics.median_moic_ratio).toBeNull();
  });

  it('logs IDs and aggregate metrics without names or raw result payloads', () => {
    const log = { info: vi.fn() };

    const artifact = emitMarginalReserveMoicShadowComparison(fixture(), log);

    expect(log.info).toHaveBeenCalledTimes(1);
    expect(log.info.mock.calls[0]?.[0]).toEqual({
      fundId: 1,
      status: artifact.status,
      companyIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      inversionIds: ['1:2', '4:5'],
      metrics: artifact.metrics,
    });
    const serializedLog = JSON.stringify(log.info.mock.calls);
    expect(serializedLog).not.toContain('Private Company');
    expect(serializedLog).not.toContain('private-description');
    expect(serializedLog).not.toContain('deltaExpectedProceeds');
    expect(serializedLog).not.toContain('stageContributions');
  });

  it('has no database imports or write methods', async () => {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
    const source = await readFile(
      path.join(repoRoot, 'server/services/moic/marginal-reserve-moic-shadow-service.ts'),
      'utf8'
    );

    expect(source).not.toMatch(/from ['"].*\/db['"]/);
    expect(source).not.toMatch(/\.(insert|update|delete)\s*\(/);
  });
});
