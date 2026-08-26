import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { parseOpeningAccountingStateArtifact } from '../../../../server/services/financial-facts/opening-accounting-state-artifact';

const observation = {
  contractVersion: 'fund-accounting-state-observation/1.1.0',
  cutoverInstant: '2026-06-30T23:59:59.123456Z',
  currency: 'USD',
  cashBalanceUsd: '100.000000',
  cumulativeLpPaidInUsd: '80.000000',
  cumulativeGpPaidInUsd: '20.000000',
  gpUnreturnedContributedCapitalUsd: '15.000000',
  lpDistributionsReturnOfCapitalUsd: '10.000000',
  lpDistributionsProfitUsd: '5.000000',
  actualLpDistributionsCumulativeUsd: '15.000000',
  gpInvestmentDistributionsPaidUsd: '2.000000',
  gpCarryPaidUsd: '1.000000',
  accruedPreferredReturnUsd: '0.000000',
  accruedPreferredReturnThroughInstant: '2026-06-30T23:59:59.123456Z',
  recallableDistributionsCumulativeUsd: '4.000000',
  recallableDistributionsOutstandingUsd: '3.000000',
  recycledProceedsCumulativeUsd: '6.000000',
  realizedProceedsCumulativeUsd: '21.000000',
  methodologyVersion: 'opening-state-methodology/1.0.0',
} as const;

// The frozen v1.1 schema derives lpUnreturnedContributedCapitalUsd as
// cumulativeLpPaidInUsd (80) minus lpDistributionsReturnOfCapitalUsd (10);
// this is the shape parseOpeningAccountingStateArtifact actually returns.
const resolvedObservation = {
  ...observation,
  lpUnreturnedContributedCapitalUsd: '70.000000',
};

// G20 founding fixture (shared with fund-accounting-state-observation-v1.1
// contract tests and the V4 contract adapter tests): paidIn 10,000,000 minus
// ROC 3,500,000 derives 6,500,000.
const G20_FOUNDING_OBSERVATION_INPUT = {
  contractVersion: 'fund-accounting-state-observation/1.1.0',
  cutoverInstant: '2026-06-30T23:59:59.000Z',
  currency: 'USD',
  cashBalanceUsd: '1250000.000000',
  cumulativeLpPaidInUsd: '10000000.000000',
  cumulativeGpPaidInUsd: '250000.000000',
  gpUnreturnedContributedCapitalUsd: '150000.000000',
  lpDistributionsReturnOfCapitalUsd: '3500000.000000',
  lpDistributionsProfitUsd: '875000.000000',
  actualLpDistributionsCumulativeUsd: '4375000.000000',
  gpInvestmentDistributionsPaidUsd: '125000.000000',
  gpCarryPaidUsd: '200000.000000',
  accruedPreferredReturnUsd: '325000.000000',
  accruedPreferredReturnThroughInstant: '2026-06-30T23:59:59.000Z',
  recallableDistributionsCumulativeUsd: '600000.000000',
  recallableDistributionsOutstandingUsd: '400000.000000',
  recycledProceedsCumulativeUsd: '250000.000000',
  realizedProceedsCumulativeUsd: '5000000.000000',
  methodologyVersion: 'fund-accounting-methodology/1.0.0',
} as const;
const G20_DERIVED_LP_UNRETURNED = '6500000.000000';

function artifactRow(overrides: Record<string, unknown> = {}) {
  const payload = Buffer.from(JSON.stringify(observation), 'utf8');
  const row = {
    id: 42,
    fundId: 7,
    sourceType: 'manual',
    mediaType: 'application/json',
    payloadSha256: createHash('sha256').update(payload).digest('hex'),
    payload,
    purgedAt: null,
    createdAt: new Date('2026-06-30T23:59:59.500Z'),
    ...overrides,
  };
  if (
    !Object.prototype.hasOwnProperty.call(overrides, 'payloadSha256') &&
    Buffer.isBuffer(row.payload)
  ) {
    row.payloadSha256 = createHash('sha256').update(row.payload).digest('hex');
  }
  return row;
}

const parseInput = {
  fundId: 7,
  asOfDate: '2026-06-30',
  knowledgeCutoff: '2026-07-01T00:00:00.000Z',
  actorId: 99,
} as const;

describe('parseOpeningAccountingStateArtifact', () => {
  it.each(['manual', 'structured_paste'])(
    'returns an attested ref from exact stored JSON bytes for %s artifacts',
    (sourceType) => {
      const row = artifactRow({ sourceType });

      expect(parseOpeningAccountingStateArtifact({ ...parseInput, row })).toEqual({
        sourceArtifactId: 42,
        sourceArtifactSha256: row.payloadSha256,
        sourceArtifactCreatedAt: '2026-06-30T23:59:59.500Z',
        attestedByActorId: 99,
        observation: resolvedObservation,
      });
    }
  );

  it('rejects a missing composite fund and artifact match', () => {
    for (const row of [null, undefined, artifactRow({ fundId: 8 })]) {
      expect(() => parseOpeningAccountingStateArtifact({ ...parseInput, row })).toThrowError(
        expect.objectContaining({
          status: 404,
          code: 'OPENING_ACCOUNTING_STATE_ARTIFACT_NOT_FOUND',
        })
      );
    }
  });

  it('rejects a purged artifact or unavailable payload', () => {
    for (const row of [
      artifactRow({ purgedAt: new Date('2026-07-01T00:00:00.000Z'), payload: null }),
      artifactRow({ payload: null }),
    ]) {
      expect(() => parseOpeningAccountingStateArtifact({ ...parseInput, row })).toThrowError(
        expect.objectContaining({
          status: 422,
          code: 'OPENING_ACCOUNTING_STATE_ARTIFACT_PURGED',
        })
      );
    }
  });

  it.each([
    ['wrong source type', { sourceType: 'csv' }],
    ['wrong media type', { mediaType: 'text/plain' }],
    ['malformed JSON bytes', { payload: Buffer.from('{', 'utf8') }],
    [
      'invalid observation',
      { payload: Buffer.from(JSON.stringify({ ...observation, cashBalanceUsd: '-1.000000' })) },
    ],
    ['stored digest mismatch', { payloadSha256: 'f'.repeat(64) }],
  ])('rejects %s as an invalid artifact', (_case, overrides) => {
    expect(() =>
      parseOpeningAccountingStateArtifact({
        ...parseInput,
        row: artifactRow(overrides),
      })
    ).toThrowError(
      expect.objectContaining({
        status: 422,
        code: 'OPENING_ACCOUNTING_STATE_ARTIFACT_INVALID',
      })
    );
  });

  it('rejects an artifact created after the knowledge cutoff', () => {
    expect(() =>
      parseOpeningAccountingStateArtifact({
        ...parseInput,
        row: artifactRow({ createdAt: new Date('2026-07-01T00:00:00.001Z') }),
      })
    ).toThrowError(
      expect.objectContaining({
        status: 422,
        code: 'OPENING_ACCOUNTING_STATE_AFTER_CUTOFF',
      })
    );
  });

  it('rejects an observation cutover after the knowledge cutoff', () => {
    const payload = Buffer.from(
      JSON.stringify({
        ...observation,
        cutoverInstant: '2026-07-01T00:00:00.001Z',
        accruedPreferredReturnThroughInstant: '2026-07-01T00:00:00.001Z',
      }),
      'utf8'
    );

    expect(() =>
      parseOpeningAccountingStateArtifact({
        ...parseInput,
        row: artifactRow({
          payload,
          payloadSha256: createHash('sha256').update(payload).digest('hex'),
        }),
      })
    ).toThrowError(
      expect.objectContaining({
        status: 422,
        code: 'OPENING_ACCOUNTING_STATE_AFTER_CUTOFF',
      })
    );
  });

  it('rejects an observation cutover after the cutoff by less than one millisecond', () => {
    const cutoverInstant = '2026-06-30T23:59:59.1234561Z';
    const payload = Buffer.from(
      JSON.stringify({
        ...observation,
        cutoverInstant,
        accruedPreferredReturnThroughInstant: cutoverInstant,
      }),
      'utf8'
    );

    expect(() =>
      parseOpeningAccountingStateArtifact({
        ...parseInput,
        knowledgeCutoff: '2026-06-30T23:59:59.123456Z',
        row: artifactRow({
          payload,
          createdAt: new Date('2026-06-30T23:59:59.123Z'),
        }),
      })
    ).toThrowError(
      expect.objectContaining({
        status: 422,
        code: 'OPENING_ACCOUNTING_STATE_AFTER_CUTOFF',
      })
    );
  });

  it('rejects an observation whose UTC cutover date differs from as-of date', () => {
    const payload = Buffer.from(
      JSON.stringify({
        ...observation,
        cutoverInstant: '2026-06-29T23:59:59.999Z',
        accruedPreferredReturnThroughInstant: '2026-06-29T23:59:59.999Z',
      }),
      'utf8'
    );

    expect(() =>
      parseOpeningAccountingStateArtifact({
        ...parseInput,
        row: artifactRow({
          payload,
          payloadSha256: createHash('sha256').update(payload).digest('hex'),
        }),
      })
    ).toThrowError(
      expect.objectContaining({
        status: 422,
        code: 'OPENING_ACCOUNTING_STATE_AS_OF_MISMATCH',
      })
    );
  });
});

describe('parseOpeningAccountingStateArtifact v1.1 parse boundary (T-D2)', () => {
  it('derives lpUnreturnedContributedCapitalUsd from the G20 founding fixture (paidIn 10,000,000 / ROC 3,500,000 -> 6,500,000)', () => {
    const payload = Buffer.from(JSON.stringify(G20_FOUNDING_OBSERVATION_INPUT), 'utf8');

    const resolved = parseOpeningAccountingStateArtifact({
      ...parseInput,
      row: artifactRow({
        payload,
        payloadSha256: createHash('sha256').update(payload).digest('hex'),
      }),
    });

    expect(resolved.observation.lpUnreturnedContributedCapitalUsd).toBe(G20_DERIVED_LP_UNRETURNED);
    expect(resolved.observation.contractVersion).toBe('fund-accounting-state-observation/1.1.0');
  });

  it('rejects a stored v1.0.0 artifact as typed INVALID with version context, not a silent v1 fallback', () => {
    const v1Observation = {
      ...G20_FOUNDING_OBSERVATION_INPUT,
      contractVersion: 'fund-accounting-state-observation/1.0.0',
      lpUnreturnedContributedCapitalUsd: G20_DERIVED_LP_UNRETURNED,
    };
    const payload = Buffer.from(JSON.stringify(v1Observation), 'utf8');

    expect(() =>
      parseOpeningAccountingStateArtifact({
        ...parseInput,
        row: artifactRow({
          payload,
          payloadSha256: createHash('sha256').update(payload).digest('hex'),
        }),
      })
    ).toThrowError(
      expect.objectContaining({
        status: 422,
        code: 'OPENING_ACCOUNTING_STATE_ARTIFACT_INVALID',
        message: expect.stringContaining('fund-accounting-state-observation/1.0.0'),
      })
    );
  });

  it('rejects a source artifact that supplies lpUnreturnedContributedCapitalUsd directly, even when its value equals the correct derivation', () => {
    const suppliedDerivedObservation = {
      ...G20_FOUNDING_OBSERVATION_INPUT,
      lpUnreturnedContributedCapitalUsd: G20_DERIVED_LP_UNRETURNED,
    };
    const payload = Buffer.from(JSON.stringify(suppliedDerivedObservation), 'utf8');

    expect(() =>
      parseOpeningAccountingStateArtifact({
        ...parseInput,
        row: artifactRow({
          payload,
          payloadSha256: createHash('sha256').update(payload).digest('hex'),
        }),
      })
    ).toThrowError(
      expect.objectContaining({
        status: 422,
        code: 'OPENING_ACCOUNTING_STATE_ARTIFACT_INVALID',
      })
    );
  });
});
