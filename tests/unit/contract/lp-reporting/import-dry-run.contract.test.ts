/**
 * Contract tests for ImportDryRunResponseSchema and friends
 * (LP Reporting Phase 0.4).
 */
import { describe, expect, it } from 'vitest';

import {
  ImportDryRunResponseSchema,
  ImportErrorSchema,
  ImportPreviewRowSchema,
  ImportWarningSchema,
  ReconciliationSummarySchema,
  SourceTypeSchema,
} from '@shared/contracts/lp-reporting/import-dry-run.contract';

const happyPath = {
  importId: '11111111-2222-3333-4444-555555555555',
  sourceType: 'csv' as const,
  parsedRows: 5,
  validRows: 4,
  invalidRows: 1,
  duplicateRows: 0,
  warnings: [],
  errors: [],
  reconciliation: {
    calledCapitalImported: '1000000.000000',
    distributionsImported: '250000.000000',
    latestNavImported: '0.000000',
    explanations: [],
  },
  preview: [],
};

describe('ImportDryRunResponseSchema -- round-trip', () => {
  it('accepts a fully populated happy path', () => {
    expect(() => ImportDryRunResponseSchema.parse(happyPath)).not.toThrow();
  });

  it('rejects unknown top-level keys (.strict)', () => {
    expect(() => ImportDryRunResponseSchema.parse({ ...happyPath, bogus: 'x' })).toThrow();
  });

  it('rejects malformed importId', () => {
    expect(() =>
      ImportDryRunResponseSchema.parse({ ...happyPath, importId: 'not-a-uuid' })
    ).toThrow();
  });

  it('rejects negative parsedRows', () => {
    expect(() => ImportDryRunResponseSchema.parse({ ...happyPath, parsedRows: -1 })).toThrow();
  });
});

describe('SourceTypeSchema enum coverage', () => {
  it.each(['csv', 'excel', 'notion'])('accepts %s', (v) => {
    expect(() => SourceTypeSchema.parse(v)).not.toThrow();
  });

  it('rejects an unknown source type', () => {
    expect(() => SourceTypeSchema.parse('json')).toThrow();
  });
});

describe('ReconciliationSummarySchema', () => {
  it('round-trips with optional fields omitted', () => {
    expect(() =>
      ReconciliationSummarySchema.parse({
        calledCapitalImported: '1000000.000000',
        distributionsImported: '0.000000',
        latestNavImported: '0.000000',
        explanations: [],
      })
    ).not.toThrow();
  });

  it('round-trips with all optional fields set', () => {
    expect(() =>
      ReconciliationSummarySchema.parse({
        calledCapitalImported: '1000000.000000',
        calledCapitalExpected: '1000000.000000',
        distributionsImported: '250000.000000',
        latestNavImported: '5000000.000000',
        difference: '0.000000',
        explanations: ['Differs by 0 -- exact match.'],
      })
    ).not.toThrow();
  });

  it('rejects calledCapitalImported as JS number', () => {
    expect(() =>
      ReconciliationSummarySchema.parse({
        calledCapitalImported: 1000000,
        distributionsImported: '0.000000',
        latestNavImported: '0.000000',
        explanations: [],
      })
    ).toThrow();
  });

  it('rejects unknown top-level keys', () => {
    expect(() =>
      ReconciliationSummarySchema.parse({
        calledCapitalImported: '0.000000',
        distributionsImported: '0.000000',
        latestNavImported: '0.000000',
        explanations: [],
        bogus: 'x',
      })
    ).toThrow();
  });
});

describe('ImportError / ImportWarning', () => {
  it('ImportErrorSchema accepts a typical row error', () => {
    expect(() =>
      ImportErrorSchema.parse({
        row: 5,
        column: 'amount',
        code: 'MALFORMED_AMOUNT',
        message: 'amount must be a decimal string',
        severity: 'error',
      })
    ).not.toThrow();
  });

  it('ImportErrorSchema severity defaults to error', () => {
    const parsed = ImportErrorSchema.parse({
      row: 5,
      code: 'MALFORMED_AMOUNT',
      message: 'amount must be a decimal string',
    });
    expect(parsed.severity).toBe('error');
  });

  it('ImportWarningSchema accepts a typical warning', () => {
    expect(() =>
      ImportWarningSchema.parse({
        row: 5,
        column: 'confidence_level',
        code: 'CONFIDENCE_DOWNGRADED',
        message: 'high downgraded to low',
      })
    ).not.toThrow();
  });

  it('ImportWarningSchema rejects negative row', () => {
    expect(() =>
      ImportWarningSchema.parse({
        row: -1,
        code: 'X',
        message: 'm',
      })
    ).toThrow();
  });
});

describe('ImportPreviewRowSchema', () => {
  it('accepts a ledger preview row', () => {
    expect(() =>
      ImportPreviewRowSchema.parse({
        rowIndex: 1,
        eventType: 'lp_capital_call',
        amount: '1000000.000000',
        eventDate: '2026-01-15T00:00:00.000Z',
        duplicate: false,
        excluded: false,
      })
    ).not.toThrow();
  });

  it('accepts a valuation-mark preview row', () => {
    expect(() =>
      ImportPreviewRowSchema.parse({
        rowIndex: 1,
        markSource: 'financing_round',
        companyId: 42,
        fairValue: '5000000.000000',
        asOfDate: '2026-03-31',
        confidenceLevel: 'high',
        duplicate: false,
        excluded: false,
      })
    ).not.toThrow();
  });

  it('duplicate / excluded default to false', () => {
    const parsed = ImportPreviewRowSchema.parse({ rowIndex: 1 });
    expect(parsed.duplicate).toBe(false);
    expect(parsed.excluded).toBe(false);
  });
});
