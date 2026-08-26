import { describe, expect, it } from 'vitest';
import {
  FundMoicRankingsProvenanceV1Schema,
  FundMoicRankingsResponseV1Schema,
} from '@shared/contracts/fund-moic-v1.contract';

function makeValidResponse() {
  return {
    fundId: 7,
    provenance: {
      source: 'portfolio_companies',
      calculation: 'reserves_moic_rankings',
      metricBasis: 'planned_reserves',
      sourceRecordCount: 2,
    },
    rankings: [
      {
        rank: 1,
        investmentId: '101',
        investmentName: 'Acme Corp',
        factsBasis: null,
        reservesMoic: {
          value: 3.5,
          description: 'Expected return on planned reserves',
          formula: 'reserve exit value / planned reserves',
        },
      },
    ],
    generatedAt: '2026-06-07T00:00:00.000Z',
  };
}

function withoutProvenance(response: ReturnType<typeof makeValidResponse>) {
  const copy: Partial<ReturnType<typeof makeValidResponse>> = { ...response };
  delete copy.provenance;
  return copy;
}

describe('FundMoicRankingsResponseV1 contract', () => {
  it('accepts valid provenance on the response', () => {
    expect(FundMoicRankingsResponseV1Schema.safeParse(makeValidResponse()).success).toBe(true);
  });

  it('rejects missing provenance', () => {
    expect(
      FundMoicRankingsResponseV1Schema.safeParse(withoutProvenance(makeValidResponse())).success
    ).toBe(false);
  });

  it('rejects wrong provenance literals', () => {
    const response = makeValidResponse();

    response.provenance.source = 'sample_companies';
    response.provenance.calculation = 'all_moic_types';
    response.provenance.metricBasis = 'exit_value';

    expect(FundMoicRankingsResponseV1Schema.safeParse(response).success).toBe(false);
  });

  it.each([
    ['negative', -1],
    ['non-integer', 1.5],
  ])('rejects %s sourceRecordCount', (_label, sourceRecordCount) => {
    const response = makeValidResponse();
    response.provenance.sourceRecordCount = sourceRecordCount;

    expect(FundMoicRankingsResponseV1Schema.safeParse(response).success).toBe(false);
  });

  it('rejects unknown response keys', () => {
    const response = { ...makeValidResponse(), extra: true };

    expect(FundMoicRankingsResponseV1Schema.safeParse(response).success).toBe(false);
  });

  it('rejects unknown provenance keys', () => {
    const response = makeValidResponse();
    const withExtraProvenance = {
      ...response,
      provenance: { ...response.provenance, sampleFallback: true },
    };

    expect(FundMoicRankingsResponseV1Schema.safeParse(withExtraProvenance).success).toBe(false);
  });

  it('rejects unknown ranking keys', () => {
    const response = makeValidResponse();
    const [ranking] = response.rankings;
    const withExtraRanking = {
      ...response,
      rankings: [{ ...ranking, sampleRank: true }],
    };

    expect(FundMoicRankingsResponseV1Schema.safeParse(withExtraRanking).success).toBe(false);
  });

  it('requires factsBasis while accepting an explicit null disclosure', () => {
    const response = makeValidResponse();
    const [ranking] = response.rankings;
    const { factsBasis: _factsBasis, ...withoutFactsBasis } = ranking;

    expect(FundMoicRankingsResponseV1Schema.safeParse(response).success).toBe(true);
    expect(
      FundMoicRankingsResponseV1Schema.safeParse({
        ...response,
        rankings: [withoutFactsBasis],
      }).success
    ).toBe(false);
  });

  it('rejects unknown reservesMoic keys', () => {
    const response = makeValidResponse();
    const [ranking] = response.rankings;
    const withExtraReservesMoic = {
      ...response,
      rankings: [
        {
          ...ranking,
          reservesMoic: { ...ranking.reservesMoic, sampleMultiple: 7 },
        },
      ],
    };

    expect(FundMoicRankingsResponseV1Schema.safeParse(withExtraReservesMoic).success).toBe(false);
  });

  it('keeps provenance strict when parsed directly', () => {
    const result = FundMoicRankingsProvenanceV1Schema.safeParse({
      source: 'portfolio_companies',
      calculation: 'reserves_moic_rankings',
      metricBasis: 'planned_reserves',
      sourceRecordCount: 0,
      extra: true,
    });

    expect(result.success).toBe(false);
  });
});
