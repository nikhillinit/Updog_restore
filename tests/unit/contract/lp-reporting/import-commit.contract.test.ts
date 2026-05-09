/**
 * Contract tests for the LP Reporting import-commit wire schemas
 * (Phase 1c.1).
 *
 * Covers the protected commit endpoints:
 *   POST /api/funds/:fundId/imports/ledger/commit
 *   POST /api/funds/:fundId/imports/valuation-marks/commit
 *
 * Phase 1c locks the wire format BEFORE the server handlers ship so the
 * client commit hooks (1c.2) and server handlers (1c.3-1c.5) integrate
 * against a single contract. The PreviewDriftError shape is exercised
 * here because the server returns it as an HTTP 409 body when the
 * client-supplied previewHash no longer matches the recomputed hash.
 *
 * All imports come from the lp-reporting barrel per Phase 1.1 convention.
 */
import { describe, expect, it } from 'vitest';

import {
  LedgerImportCommitRequestSchema,
  LedgerImportCommitResponseSchema,
  PreviewDriftErrorSchema,
  PreviewHashSchema,
  ValuationMarkImportCommitRequestSchema,
  ValuationMarkImportCommitResponseSchema,
} from '@shared/contracts/lp-reporting';

const validHash = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const validUuid = '11111111-2222-4333-8444-555555555555';
const validIso = '2026-05-09T05:00:00Z';
const csvBase64 = Buffer.from('a,b\n1,2\n').toString('base64');

const happyLedgerRequest = {
  fundId: 1,
  sourceType: 'csv' as const,
  payload: csvBase64,
  previewHash: validHash,
  importBatchId: validUuid,
};

const happyLedgerResponse = {
  persistedEventIds: [101, 102, 103],
  importBatchId: validUuid,
  committedAt: validIso,
  previewHash: validHash,
  rowCount: 3,
};

const happyMarkRequest = {
  fundId: 1,
  sourceType: 'notion' as const,
  payload: csvBase64,
  previewHash: validHash,
  importBatchId: validUuid,
};

const happyMarkResponse = {
  persistedMarkIds: [501, 502],
  importBatchId: validUuid,
  committedAt: validIso,
  previewHash: validHash,
  rowCount: 2,
};

describe('LedgerImportCommitRequestSchema -- round-trip', () => {
  it('accepts a happy-path commit request', () => {
    expect(() => LedgerImportCommitRequestSchema.parse(happyLedgerRequest)).not.toThrow();
  });

  it('rejects unknown top-level keys (.strict)', () => {
    expect(() =>
      LedgerImportCommitRequestSchema.parse({ ...happyLedgerRequest, bogus: 'x' })
    ).toThrow();
  });

  it('rejects a non-UUID importBatchId', () => {
    expect(() =>
      LedgerImportCommitRequestSchema.parse({ ...happyLedgerRequest, importBatchId: 'not-a-uuid' })
    ).toThrow();
  });

  it('rejects sourceType outside the csv/notion enum', () => {
    expect(() =>
      LedgerImportCommitRequestSchema.parse({ ...happyLedgerRequest, sourceType: 'excel' })
    ).toThrow();
  });

  it('rejects fundId <= 0', () => {
    expect(() =>
      LedgerImportCommitRequestSchema.parse({ ...happyLedgerRequest, fundId: 0 })
    ).toThrow();
  });
});

describe('ValuationMarkImportCommitRequestSchema -- round-trip', () => {
  it('accepts a happy-path commit request', () => {
    expect(() => ValuationMarkImportCommitRequestSchema.parse(happyMarkRequest)).not.toThrow();
  });

  it('rejects unknown top-level keys (.strict)', () => {
    expect(() =>
      ValuationMarkImportCommitRequestSchema.parse({ ...happyMarkRequest, extra: 1 })
    ).toThrow();
  });
});

describe('LedgerImportCommitResponseSchema -- round-trip', () => {
  it('accepts a happy-path commit response', () => {
    expect(() => LedgerImportCommitResponseSchema.parse(happyLedgerResponse)).not.toThrow();
  });

  it('echoes the previewHash field back to the client', () => {
    const parsed = LedgerImportCommitResponseSchema.parse(happyLedgerResponse);
    expect(parsed.previewHash).toBe(validHash);
  });

  it('rejects unknown top-level keys (.strict)', () => {
    expect(() =>
      LedgerImportCommitResponseSchema.parse({ ...happyLedgerResponse, bogus: 'x' })
    ).toThrow();
  });

  it('rejects rowCount < 0', () => {
    expect(() =>
      LedgerImportCommitResponseSchema.parse({ ...happyLedgerResponse, rowCount: -1 })
    ).toThrow();
  });

  it('rejects non-positive persistedEventIds', () => {
    expect(() =>
      LedgerImportCommitResponseSchema.parse({
        ...happyLedgerResponse,
        persistedEventIds: [101, 0],
      })
    ).toThrow();
  });
});

describe('ValuationMarkImportCommitResponseSchema -- round-trip', () => {
  it('accepts a happy-path commit response', () => {
    expect(() => ValuationMarkImportCommitResponseSchema.parse(happyMarkResponse)).not.toThrow();
  });

  it('exposes persistedMarkIds (not persistedEventIds)', () => {
    const parsed = ValuationMarkImportCommitResponseSchema.parse(happyMarkResponse);
    expect(parsed.persistedMarkIds).toEqual([501, 502]);
  });
});

describe('PreviewHashSchema regex', () => {
  it('accepts 64 lowercase hex chars', () => {
    expect(() => PreviewHashSchema.parse(validHash)).not.toThrow();
  });

  it('rejects "TOO_SHORT"', () => {
    expect(() => PreviewHashSchema.parse('TOO_SHORT')).toThrow();
  });

  it('rejects mixed-case hex (uppercase letters)', () => {
    expect(() =>
      PreviewHashSchema.parse('ABCdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789')
    ).toThrow();
  });

  it('rejects 65 chars (too long)', () => {
    expect(() => PreviewHashSchema.parse(`${validHash}0`)).toThrow();
  });

  it('rejects 63 chars (too short)', () => {
    expect(() => PreviewHashSchema.parse(validHash.slice(0, 63))).toThrow();
  });
});

describe('committedAt requires offset', () => {
  it('accepts a Z-suffixed ISO 8601 timestamp', () => {
    expect(() =>
      LedgerImportCommitResponseSchema.parse({ ...happyLedgerResponse, committedAt: validIso })
    ).not.toThrow();
  });

  it('accepts a +00:00 offset', () => {
    expect(() =>
      LedgerImportCommitResponseSchema.parse({
        ...happyLedgerResponse,
        committedAt: '2026-05-09T05:00:00+00:00',
      })
    ).not.toThrow();
  });

  it('rejects a space-separated naive timestamp', () => {
    expect(() =>
      LedgerImportCommitResponseSchema.parse({
        ...happyLedgerResponse,
        committedAt: '2026-05-09 05:00:00',
      })
    ).toThrow();
  });
});

describe('PreviewDriftErrorSchema', () => {
  const happyDrift = {
    code: 'PREVIEW_DRIFT' as const,
    expectedPreviewHash: validHash,
    actualPreviewHash: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
    diff: {
      addedSourceIds: [42, 'mark:abc'],
      removedSourceIds: [],
    },
  };

  it('accepts a happy-path drift error', () => {
    expect(() => PreviewDriftErrorSchema.parse(happyDrift)).not.toThrow();
  });

  it('code is the literal "PREVIEW_DRIFT" (rejects any other string)', () => {
    expect(() =>
      PreviewDriftErrorSchema.parse({ ...happyDrift, code: 'GENERIC_CONFLICT' })
    ).toThrow();
  });

  it('diff.changedFieldsByEntity is optional (omit-and-still-parses)', () => {
    expect(() => PreviewDriftErrorSchema.parse(happyDrift)).not.toThrow();
  });

  it('diff.changedFieldsByEntity, when present, is a record of string -> string[]', () => {
    expect(() =>
      PreviewDriftErrorSchema.parse({
        ...happyDrift,
        diff: {
          ...happyDrift.diff,
          changedFieldsByEntity: { 'event:42': ['amount', 'eventDate'] },
        },
      })
    ).not.toThrow();
  });

  it('rejects unknown top-level keys (.strict)', () => {
    expect(() => PreviewDriftErrorSchema.parse({ ...happyDrift, bogus: 'x' })).toThrow();
  });

  it('rejects unknown keys inside diff (.strict)', () => {
    expect(() =>
      PreviewDriftErrorSchema.parse({
        ...happyDrift,
        diff: { ...happyDrift.diff, somethingElse: 'no' },
      })
    ).toThrow();
  });
});
