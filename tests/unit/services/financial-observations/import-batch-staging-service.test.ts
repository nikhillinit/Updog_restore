import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import type { IdempotentCommandError } from '../../../../server/services/financial-observations/import-batch-staging-service';
import {
  assertProfileMappingGates,
  buildStageReceipt,
  collectStagedCandidates,
  computePreviewHash,
  stageImportBatch,
} from '../../../../server/services/financial-observations/import-batch-staging-service';
import { ReconciliationApiError } from '../../../../server/services/financial-observations/reconciliation-errors';
import { canonicalSha256 } from '../../../../shared/lib/canonical-hash';
import {
  IMPORT_V2_CONTRACT_VERSION,
  type NormalizationResultV2,
} from '../../../../shared/contracts/financial-observations/normalization.contract';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const FP_A = 'c'.repeat(64);
const FP_B = 'd'.repeat(64);

function thenableRows(rows: readonly unknown[]): unknown {
  const chain: unknown = new Proxy(() => undefined, {
    get(_target, property) {
      if (property === 'then') {
        return (resolve: (value: readonly unknown[]) => void, reject: (reason: unknown) => void) =>
          Promise.resolve(rows).then(resolve, reject);
      }
      return () => chain;
    },
  });
  return chain;
}

function replayDatabase(
  batch: Record<string, unknown>,
  observations: readonly Record<string, unknown>[],
  caseIds: readonly number[]
) {
  const select = vi
    .fn()
    .mockImplementationOnce(() => thenableRows([batch]))
    .mockImplementationOnce(() => thenableRows(observations))
    .mockImplementationOnce(() => thenableRows(caseIds.map((id) => ({ id }))));
  const transaction = vi.fn(async () => {
    throw new ReconciliationApiError(
      422,
      'ARTIFACT_PAYLOAD_UNAVAILABLE',
      'Artifact payload has been purged.'
    );
  });
  return { database: { select, transaction }, transaction };
}

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

describe('stageImportBatch immutable replay', () => {
  const input = {
    fundId: 1,
    sourceArtifactId: 4,
    mappingProfileId: 3,
    dataBasis: 'observed_actual' as const,
    idempotencyKey: 'stage-replay',
    actorId: 7,
  };
  const requestHash = canonicalSha256({
    fundId: input.fundId,
    contractVersion: IMPORT_V2_CONTRACT_VERSION,
    sourceArtifactId: input.sourceArtifactId,
    mappingProfileId: input.mappingProfileId,
    dataBasis: input.dataBasis,
  });
  const batch = {
    id: 9,
    sourceArtifactId: input.sourceArtifactId,
    mappingProfileId: input.mappingProfileId,
    previewHash: HASH_A,
    purgeAfter: new Date('2026-02-10T00:00:00.000Z'),
    requestHash,
  };
  const observations = [
    { id: 11, sourceLocator: 'csv:row:1', dependencyGroupKey: 'source-observation:11' },
    { id: 12, sourceLocator: 'csv:row:2', dependencyGroupKey: 'source-observation:12' },
  ];
  const caseIds = [20, 30];

  it('returns the persisted receipt after payload purge without entering the insert path', async () => {
    const { database, transaction } = replayDatabase(batch, observations, caseIds);
    const initialReceipt = buildStageReceipt(batch, observations, caseIds);

    const replay = await stageImportBatch({ ...input, database: database as never });

    expect(replay).toEqual({ receipt: initialReceipt, replayed: true });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects a changed body with the stored key before entering the insert path', async () => {
    const { database, transaction } = replayDatabase(batch, observations, caseIds);

    await expect(
      stageImportBatch({
        ...input,
        mappingProfileId: 8,
        database: database as never,
      })
    ).rejects.toMatchObject<Partial<IdempotentCommandError>>({
      status: 409,
      code: 'IDEMPOTENCY_KEY_REUSE',
    });
    expect(transaction).not.toHaveBeenCalled();
  });
});

describe('source observation insert SQL', () => {
  it('preallocates the id and sets the dependency group in one INSERT', () => {
    const source = fs.readFileSync(
      path.join(
        process.cwd(),
        'server',
        'services',
        'financial-observations',
        'import-batch-staging-service.ts'
      ),
      'utf8'
    );
    const start = source.indexOf("SELECT nextval('source_observations_id_seq') AS id");
    const end = source.indexOf('const classification =', start);
    const insertBlock = source.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(insertBlock).toContain('INSERT INTO source_observations');
    expect(insertBlock).toContain('dependency_group_key, status');
    expect(insertBlock).not.toContain('WITH ins AS');
    expect(insertBlock).not.toContain('UPDATE source_observations');
  });
});

describe('ReconciliationApiError', () => {
  it('carries status and code', () => {
    const error = new ReconciliationApiError(409, 'OBSERVATION_ALREADY_ACCEPTED', 'x');
    expect(error.status).toBe(409);
    expect(error.code).toBe('OBSERVATION_ALREADY_ACCEPTED');
  });
});
