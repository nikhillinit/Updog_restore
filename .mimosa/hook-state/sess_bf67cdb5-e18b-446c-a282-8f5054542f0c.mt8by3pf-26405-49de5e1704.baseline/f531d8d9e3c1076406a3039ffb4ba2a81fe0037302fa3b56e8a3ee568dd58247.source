/**
 * Contract tests for import commit request/response schemas.
 */
import { describe, expect, it } from 'vitest';

import {
  ImportCommitRequestSchema,
  ImportCommitResponseSchema,
} from '@shared/contracts/lp-reporting/import-commit.contract';

const previewHash = 'a'.repeat(64);

describe('ImportCommitRequestSchema', () => {
  it('accepts sourceType, payload, and previewHash', () => {
    expect(() =>
      ImportCommitRequestSchema.parse({
        sourceType: 'csv',
        payload: Buffer.from('a,b\n1,2\n').toString('base64'),
        previewHash,
      })
    ).not.toThrow();
  });

  it('rejects requests without the dry-run previewHash', () => {
    expect(() =>
      ImportCommitRequestSchema.parse({
        sourceType: 'csv',
        payload: Buffer.from('a,b\n1,2\n').toString('base64'),
      })
    ).toThrow();
  });

  it('rejects malformed previewHash values', () => {
    expect(() =>
      ImportCommitRequestSchema.parse({
        sourceType: 'csv',
        payload: 'abc',
        previewHash: 'not-a-hash',
      })
    ).toThrow();
  });
});

describe('ImportCommitResponseSchema', () => {
  it('accepts a commit summary with inserted and skipped counts', () => {
    expect(() =>
      ImportCommitResponseSchema.parse({
        importBatchId: '11111111-2222-3333-4444-555555555555',
        previewHash,
        insertedCount: 2,
        skippedExistingCount: 1,
        skippedDuplicateCount: 1,
        skippedExcludedCount: 0,
        insertedIds: [10, 11],
      })
    ).not.toThrow();
  });

  it('rejects unknown keys', () => {
    expect(() =>
      ImportCommitResponseSchema.parse({
        importBatchId: '11111111-2222-3333-4444-555555555555',
        previewHash,
        insertedCount: 0,
        skippedExistingCount: 0,
        skippedDuplicateCount: 0,
        skippedExcludedCount: 0,
        insertedIds: [],
        sourceHash: previewHash,
      })
    ).toThrow();
  });
});
