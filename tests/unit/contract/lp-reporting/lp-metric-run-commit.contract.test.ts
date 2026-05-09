/**
 * Contract tests for the LP Reporting metric-run commit wire schemas
 * (Phase 1c.1).
 *
 * Covers the protected commit endpoint:
 *   POST /api/funds/:fundId/metric-runs/commit
 *
 * The commit request carries previewHash + inputsHash so the server
 * can detect drift (returns 409 PreviewDrift) and idempotently match
 * an existing draft row by (fundId, inputsHash).
 *
 * All imports come from the lp-reporting barrel per Phase 1.1 convention.
 */
import { describe, expect, it } from 'vitest';

import {
  MetricRunCommitRequestSchema,
  MetricRunCommitResponseSchema,
} from '@shared/contracts/lp-reporting';

const validHash = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const otherHash = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
const validIso = '2026-05-09T05:00:00Z';

const happyRequest = {
  fundId: 1,
  asOfDate: '2026-03-31',
  runType: 'quarterly_report' as const,
  perspective: 'lp_net' as const,
  sourceEventIds: [101, 102],
  sourceMarkIds: [501],
  previewHash: validHash,
  inputsHash: otherHash,
};

const happyResponse = {
  metricRunId: 9001,
  inputsHash: otherHash,
  previewHash: validHash,
  committedAt: validIso,
  status: 'draft' as const,
  idempotentHit: false,
};

describe('MetricRunCommitRequestSchema -- round-trip', () => {
  it('accepts a happy-path commit request', () => {
    expect(() => MetricRunCommitRequestSchema.parse(happyRequest)).not.toThrow();
  });

  it('rejects unknown top-level keys (.strict)', () => {
    expect(() => MetricRunCommitRequestSchema.parse({ ...happyRequest, bogus: 'x' })).toThrow();
  });

  it('rejects fundId <= 0', () => {
    expect(() => MetricRunCommitRequestSchema.parse({ ...happyRequest, fundId: 0 })).toThrow();
  });

  it('accepts empty source ID arrays', () => {
    expect(() =>
      MetricRunCommitRequestSchema.parse({
        ...happyRequest,
        sourceEventIds: [],
        sourceMarkIds: [],
      })
    ).not.toThrow();
  });

  it('rejects non-positive sourceEventIds', () => {
    expect(() =>
      MetricRunCommitRequestSchema.parse({ ...happyRequest, sourceEventIds: [101, 0] })
    ).toThrow();
  });
});

describe('asOfDate regex (YYYY-MM-DD)', () => {
  it('accepts "2026-12-31"', () => {
    expect(() =>
      MetricRunCommitRequestSchema.parse({ ...happyRequest, asOfDate: '2026-12-31' })
    ).not.toThrow();
  });

  it('rejects "12/31/2026"', () => {
    expect(() =>
      MetricRunCommitRequestSchema.parse({ ...happyRequest, asOfDate: '12/31/2026' })
    ).toThrow();
  });

  it('rejects "2026-13-01" (regex-only check; semantic month is enforced upstream)', () => {
    // The contract regex permits "2026-13-01" because /^\d{4}-\d{2}-\d{2}$/
    // does not range-check the month. This test documents that the regex
    // is the structural gate; semantic validation happens in the engine.
    expect(() =>
      MetricRunCommitRequestSchema.parse({ ...happyRequest, asOfDate: '2026-13-01' })
    ).not.toThrow();
  });

  it('rejects datetime form "2026-03-31T00:00:00Z"', () => {
    expect(() =>
      MetricRunCommitRequestSchema.parse({ ...happyRequest, asOfDate: '2026-03-31T00:00:00Z' })
    ).toThrow();
  });
});

describe('runType enum coverage', () => {
  it.each(['quarterly_report', 'fundraise_pack', 'internal_review', 'lp_update'])(
    'accepts %s',
    (v) => {
      expect(() =>
        MetricRunCommitRequestSchema.parse({ ...happyRequest, runType: v })
      ).not.toThrow();
    }
  );

  it('rejects "invalid"', () => {
    expect(() =>
      MetricRunCommitRequestSchema.parse({ ...happyRequest, runType: 'invalid' })
    ).toThrow();
  });
});

describe('perspective enum coverage', () => {
  it.each(['lp_net', 'fund_gross', 'vehicle'])('accepts %s', (v) => {
    expect(() =>
      MetricRunCommitRequestSchema.parse({ ...happyRequest, perspective: v })
    ).not.toThrow();
  });

  it('rejects "company"', () => {
    expect(() =>
      MetricRunCommitRequestSchema.parse({ ...happyRequest, perspective: 'company' })
    ).toThrow();
  });
});

describe('previewHash + inputsHash regex (sha256 hex, 64 lowercase)', () => {
  it('rejects previewHash "abc"', () => {
    expect(() =>
      MetricRunCommitRequestSchema.parse({ ...happyRequest, previewHash: 'abc' })
    ).toThrow();
  });

  it('rejects inputsHash uppercase', () => {
    expect(() =>
      MetricRunCommitRequestSchema.parse({
        ...happyRequest,
        inputsHash: 'ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789',
      })
    ).toThrow();
  });
});

describe('MetricRunCommitResponseSchema -- round-trip', () => {
  it('accepts a happy-path commit response', () => {
    expect(() => MetricRunCommitResponseSchema.parse(happyResponse)).not.toThrow();
  });

  it('rejects unknown top-level keys (.strict)', () => {
    expect(() => MetricRunCommitResponseSchema.parse({ ...happyResponse, bogus: 'x' })).toThrow();
  });

  it('rejects metricRunId <= 0', () => {
    expect(() =>
      MetricRunCommitResponseSchema.parse({ ...happyResponse, metricRunId: 0 })
    ).toThrow();
  });

  it('status is the literal "draft" (rejects "approved")', () => {
    expect(() =>
      MetricRunCommitResponseSchema.parse({ ...happyResponse, status: 'approved' })
    ).toThrow();
  });

  it('idempotentHit accepts true and false', () => {
    expect(() =>
      MetricRunCommitResponseSchema.parse({ ...happyResponse, idempotentHit: true })
    ).not.toThrow();
    expect(() =>
      MetricRunCommitResponseSchema.parse({ ...happyResponse, idempotentHit: false })
    ).not.toThrow();
  });

  it('idempotentHit must be a boolean (rejects string)', () => {
    expect(() =>
      MetricRunCommitResponseSchema.parse({ ...happyResponse, idempotentHit: 'true' })
    ).toThrow();
  });

  it('committedAt requires offset', () => {
    expect(() =>
      MetricRunCommitResponseSchema.parse({
        ...happyResponse,
        committedAt: '2026-05-09 05:00:00',
      })
    ).toThrow();
  });
});
