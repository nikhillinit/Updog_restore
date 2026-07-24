import { describe, expect, it } from 'vitest';

import {
  assertProfileMappingGates,
  buildStageReceipt,
  collectStagedCandidates,
  computePreviewHash,
} from '../../../../server/services/financial-observations/import-batch-staging-service';
import { ReconciliationApiError } from '../../../../server/services/financial-observations/reconciliation-errors';
import type { NormalizationResultV2 } from '../../../../shared/contracts/financial-observations/normalization.contract';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const FP_A = 'c'.repeat(64);
const FP_B = 'd'.repeat(64);

function stagedCandidate(overrides: Record<string, unknown> = {}) {
  return {
    outcome: 'staged' as const,
    issues: [],
    normalizedPayload: { schemaVersion: 1, domain: 'ledger_event' },
    observationHash: HASH_A,
    candidateFingerprint: FP_A,
    effectiveDate: '2026-01-15',
    sourceLocator: 'csv:row:1',
    ...overrides,
  };
}

function result(
  candidates: unknown[],
  outcome: 'staged' | 'rejected' = 'staged'
): NormalizationResultV2 {
  return { outcome, issues: [], candidates } as unknown as NormalizationResultV2;
}

describe('assertProfileMappingGates', () => {
  const measureKeyRule = { sourceColumn: 'Measure', targetField: 'measure_key', transforms: [] };
  const amountRule = { sourceColumn: 'Amount', targetField: 'amount', transforms: [] };

  it('rejects a descriptor mapping (finding: descriptor minimization)', () => {
    expect(() =>
      assertProfileMappingGates({
        mappings: [
          measureKeyRule,
          { sourceColumn: 'Memo', targetField: 'memo', transforms: [] },
        ] as never,
      })
    ).toThrowError(
      expect.objectContaining({ code: 'DESCRIPTOR_MAPPING_NOT_ALLOWED', status: 422 })
    );
  });

  it('allows source_label but not memo/description/note/label', () => {
    expect(() =>
      assertProfileMappingGates({
        mappings: [
          measureKeyRule,
          { sourceColumn: 'Src', targetField: 'source_label', transforms: [] },
        ] as never,
      })
    ).not.toThrow();
  });

  it('requires exactly one measure_key mapping (finding 3)', () => {
    expect(() => assertProfileMappingGates({ mappings: [amountRule] as never })).toThrowError(
      expect.objectContaining({ code: 'MEASURE_KEY_MAPPING_REQUIRED' })
    );
    expect(() =>
      assertProfileMappingGates({ mappings: [measureKeyRule, measureKeyRule] as never })
    ).toThrowError(expect.objectContaining({ code: 'MEASURE_KEY_MAPPING_REQUIRED' }));
    expect(() =>
      assertProfileMappingGates({ mappings: [measureKeyRule, amountRule] as never })
    ).not.toThrow();
  });
});

describe('collectStagedCandidates', () => {
  const txDate = '2026-02-01';

  it('rejects the batch when any row rejected', () => {
    const rejected = { outcome: 'rejected', issues: [{ code: 'MALFORMED_DATE', row: 2 }] };
    expect(() =>
      collectStagedCandidates(result([stagedCandidate(), rejected]), txDate)
    ).toThrowError(expect.objectContaining({ code: 'NORMALIZATION_REJECTED' }));
  });

  it('rejects a future effective date (observed-actual only)', () => {
    expect(() =>
      collectStagedCandidates(result([stagedCandidate({ effectiveDate: '2026-03-01' })]), txDate)
    ).toThrowError(expect.objectContaining({ code: 'FUTURE_EFFECTIVE_DATE_UNSUPPORTED' }));
  });

  it('rejects an in-batch duplicate observation hash', () => {
    expect(() =>
      collectStagedCandidates(
        result([stagedCandidate(), stagedCandidate({ sourceLocator: 'csv:row:2' })]),
        txDate
      )
    ).toThrowError(expect.objectContaining({ code: 'DUPLICATE_OBSERVATION_IN_BATCH' }));
  });

  it('returns clean candidates in adapter order', () => {
    const staged = collectStagedCandidates(
      result([
        stagedCandidate(),
        stagedCandidate({
          observationHash: HASH_B,
          candidateFingerprint: FP_B,
          sourceLocator: 'csv:row:2',
        }),
      ]),
      txDate
    );
    expect(staged.map((c) => c.sourceLocator)).toEqual(['csv:row:1', 'csv:row:2']);
  });
});

describe('computePreviewHash', () => {
  const base = {
    artifactPayloadSha256: 'e'.repeat(64),
    mappingProfileId: 3,
    profileVersion: 1,
    orderedCandidates: [
      { sourceLocator: 'csv:row:1', observationHash: HASH_A, candidateFingerprint: FP_A },
      { sourceLocator: 'csv:row:2', observationHash: HASH_B, candidateFingerprint: FP_B },
    ],
  };

  it('is order-sensitive across candidates', () => {
    const reversed = { ...base, orderedCandidates: [...base.orderedCandidates].reverse() };
    expect(computePreviewHash(base)).not.toBe(computePreviewHash(reversed));
  });

  it('changes when the profile or artifact identity changes', () => {
    expect(computePreviewHash(base)).not.toBe(computePreviewHash({ ...base, mappingProfileId: 4 }));
    expect(computePreviewHash(base)).not.toBe(
      computePreviewHash({ ...base, artifactPayloadSha256: 'f'.repeat(64) })
    );
  });

  it('is stable for identical input', () => {
    expect(computePreviewHash(base)).toBe(computePreviewHash({ ...base }));
  });
});

describe('buildStageReceipt', () => {
  const batch = {
    id: 9,
    sourceArtifactId: 4,
    mappingProfileId: 3,
    previewHash: HASH_A,
    purgeAfter: new Date('2026-02-10T00:00:00.000Z'),
  };

  it('orders observations by id, case ids ascending, and omits hashes', () => {
    const receipt = buildStageReceipt(
      batch,
      [
        { id: 12, sourceLocator: 'csv:row:2', dependencyGroupKey: 'source-observation:12' },
        { id: 11, sourceLocator: 'csv:row:1', dependencyGroupKey: 'source-observation:11' },
      ],
      [30, 20]
    );
    expect(receipt.observations.map((o) => o.id)).toEqual([11, 12]);
    expect(receipt.initialCaseIds).toEqual([20, 30]);
    expect(JSON.stringify(receipt)).not.toContain(`${HASH_A.slice(0, 40)}candidate`);
    expect(receipt.observations[0]).not.toHaveProperty('observationHash');
  });
});

describe('ReconciliationApiError', () => {
  it('carries status and code', () => {
    const error = new ReconciliationApiError(409, 'OBSERVATION_ALREADY_ACCEPTED', 'x');
    expect(error.status).toBe(409);
    expect(error.code).toBe('OBSERVATION_ALREADY_ACCEPTED');
  });
});
