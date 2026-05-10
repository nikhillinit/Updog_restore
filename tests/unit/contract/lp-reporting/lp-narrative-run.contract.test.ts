/**
 * Contract tests for LP Reporting narrative-run endpoint shapes.
 */
import { describe, expect, it } from 'vitest';

import {
  NarrativeRunCreateRequestSchema,
  NarrativeRunCreateResponseSchema,
  NarrativeRunDetailResponseSchema,
  NarrativeRunListResponseSchema,
  NarrativeRunRecordSchema,
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
  approvedBy: null,
  approvedAt: null,
  exportedAt: null,
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
    'approvedBy',
    'approvedAt',
    'exportedAt',
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

describe('NarrativeRunRecordSchema', () => {
  it('parses the response record shape', () => {
    const parsed = NarrativeRunRecordSchema.parse(narrativeRecord);
    expect(parsed.narrativeRunId).toBe(41);
    expect(parsed.editedText).toBeNull();
    expect(parsed.status).toBe('draft');
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
});
