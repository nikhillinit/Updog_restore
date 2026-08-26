/**
 * Contract tests for LP Reporting narrative-run endpoint shapes.
 */
import { describe, expect, it } from 'vitest';

import {
  NarrativeRunApproveRequestSchema,
  NarrativeRunCreateRequestSchema,
  NarrativeRunCreateResponseSchema,
  NarrativeRunDetailResponseSchema,
  NarrativeRunEditRequestSchema,
  NarrativeRunLifecycleResponseSchema,
  NarrativeRunListResponseSchema,
  NarrativeRunRecordSchema,
  NarrativeRunReviewRequestSchema,
  NarrativeStatusSchema,
  NarrativeTypeSchema,
} from '@shared/contracts/lp-reporting/lp-narrative-run.contract';

const narrativeRecord = {
  narrativeRunId: 41,
  fundId: 7,
  metricRunId: 17,
  asOfDate: '2026-03-31',
  narrativeType: 'methodology',
  generatedText: 'Methodology narrative for 2026-03-31.',
  editedText: null,
  status: 'draft',
  generatedBy: 9,
  editedBy: null,
  reviewedBy: null,
  reviewedAt: null,
  approvedBy: null,
  approvedAt: null,
  exportedAt: null,
  version: 1,
  createdAt: '2026-05-10T00:00:00.000Z',
  updatedAt: '2026-05-10T00:00:00.000Z',
} as const;

describe('narrative run enums', () => {
  it.each(['no_dpi', 'methodology', 'portfolio_update', 'risk_disclosure'])(
    'accepts narrative type %s',
    (value) => {
      expect(() => NarrativeTypeSchema.parse(value)).not.toThrow();
    }
  );

  it('rejects unknown narrative types', () => {
    expect(() => NarrativeTypeSchema.parse('investment_memo')).toThrow();
  });

  it.each(['draft', 'reviewed', 'approved', 'exported'])('accepts status %s', (value) => {
    expect(() => NarrativeStatusSchema.parse(value)).not.toThrow();
  });

  it('rejects unknown narrative statuses', () => {
    expect(() => NarrativeStatusSchema.parse('locked')).toThrow();
  });
});

describe('NarrativeRunCreateRequestSchema', () => {
  it('accepts only narrativeType', () => {
    expect(NarrativeRunCreateRequestSchema.parse({ narrativeType: 'no_dpi' })).toEqual({
      narrativeType: 'no_dpi',
    });
  });

  it.each([
    'fundId',
    'metricRunId',
    'narrativeRunId',
    'asOfDate',
    'generatedText',
    'editedText',
    'status',
    'generatedBy',
    'editedBy',
    'reviewedBy',
    'reviewedAt',
    'approvedBy',
    'approvedAt',
    'exportedAt',
    'version',
    'createdAt',
    'updatedAt',
  ])('rejects client-owned field %s', (field) => {
    expect(() =>
      NarrativeRunCreateRequestSchema.parse({
        narrativeType: 'no_dpi',
        [field]: field.endsWith('At') ? '2026-05-10T00:00:00.000Z' : 7,
      })
    ).toThrow();
  });
});

describe('narrative lifecycle request schemas', () => {
  it('accepts trimmed edit text and expectedVersion', () => {
    expect(
      NarrativeRunEditRequestSchema.parse({ expectedVersion: 1, editedText: '  Reviewed copy  ' })
    ).toEqual({
      expectedVersion: 1,
      editedText: 'Reviewed copy',
    });
  });

  it('rejects blank edit text', () => {
    expect(() =>
      NarrativeRunEditRequestSchema.parse({ expectedVersion: 1, editedText: '   ' })
    ).toThrow();
  });

  it.each([
    NarrativeRunEditRequestSchema,
    NarrativeRunReviewRequestSchema,
    NarrativeRunApproveRequestSchema,
  ])('rejects route-owned lifecycle fields', (schema) => {
    expect(() =>
      schema.parse({
        expectedVersion: 1,
        editedText: 'Reviewed copy',
        narrativeRunId: 41,
      })
    ).toThrow();
  });

  it('accepts review and approve expectedVersion only', () => {
    expect(NarrativeRunReviewRequestSchema.parse({ expectedVersion: 2 })).toEqual({
      expectedVersion: 2,
    });
    expect(NarrativeRunApproveRequestSchema.parse({ expectedVersion: 3 })).toEqual({
      expectedVersion: 3,
    });
  });
});

describe('NarrativeRunRecordSchema', () => {
  it('parses the response record shape', () => {
    const parsed = NarrativeRunRecordSchema.parse(narrativeRecord);
    expect(parsed.narrativeRunId).toBe(41);
    expect(parsed.editedText).toBeNull();
    expect(parsed.status).toBe('draft');
    expect(parsed.version).toBe(1);
    expect(parsed.reviewedBy).toBeNull();
  });

  it('rejects unknown record fields', () => {
    expect(() =>
      NarrativeRunRecordSchema.parse({ ...narrativeRecord, unexpected: true })
    ).toThrow();
  });
});

describe('narrative response envelopes', () => {
  it('parses create response inserted marker', () => {
    const parsed = NarrativeRunCreateResponseSchema.parse({
      record: narrativeRecord,
      inserted: false,
    });
    expect(parsed.inserted).toBe(false);
    expect(parsed.record.narrativeType).toBe('methodology');
  });

  it('parses list and detail responses', () => {
    expect(
      NarrativeRunListResponseSchema.parse({ records: [narrativeRecord] }).records
    ).toHaveLength(1);
    expect(
      NarrativeRunDetailResponseSchema.parse({ record: narrativeRecord }).record.metricRunId
    ).toBe(17);
  });

  it('parses lifecycle response changed marker', () => {
    const parsed = NarrativeRunLifecycleResponseSchema.parse({
      record: {
        ...narrativeRecord,
        status: 'reviewed',
        editedText: 'Reviewed copy',
        editedBy: 9,
        reviewedBy: 9,
        reviewedAt: '2026-05-10T00:01:00.000Z',
        version: 2,
      },
      changed: false,
    });
    expect(parsed.changed).toBe(false);
    expect(parsed.record.reviewedBy).toBe(9);
  });
});
