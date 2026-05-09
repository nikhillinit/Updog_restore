/**
 * Contract tests for ValuationMarkCreateSchema (LP Reporting Phase 0.3).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  ConfidenceLevelSchema,
  MarkSourceSchema,
  ValuationMarkCreateSchema,
} from '@shared/contracts/lp-reporting/valuation-mark.contract';

const happyPath = {
  fundId: 1,
  companyId: 42,
  markDate: '2026-04-01',
  asOfDate: '2026-03-31',
  fairValue: '1500000.000000',
  costBasis: '1000000.000000',
  markSource: 'audited_financials' as const,
  confidenceLevel: 'high' as const,
  valuationMethod: 'comparable_companies',
  methodologyNotes: 'Q1 2026 audited.',
};

describe('ValuationMarkCreateSchema -- round-trip', () => {
  it('accepts a fully populated happy path', () => {
    expect(() => ValuationMarkCreateSchema.parse(happyPath)).not.toThrow();
  });

  it('accepts a minimal happy path', () => {
    expect(() =>
      ValuationMarkCreateSchema.parse({
        fundId: 1,
        companyId: 42,
        markDate: '2026-04-01',
        asOfDate: '2026-03-31',
        fairValue: '1000000',
        markSource: 'gp_estimate',
        confidenceLevel: 'medium',
        valuationMethod: 'dcf',
      })
    ).not.toThrow();
  });
});

describe('.strict() rejects unknown top-level keys', () => {
  it('rejects bogus key', () => {
    expect(() => ValuationMarkCreateSchema.parse({ ...happyPath, bogus: 'x' })).toThrow();
  });
});

describe('Enum coverage -- markSource (10 values)', () => {
  const sources = [
    'financing_round',
    'signed_loi',
    'revenue_milestone',
    'strategic_partnership',
    'audited_financials',
    'board_update',
    'gp_estimate',
    'third_party_priced',
    'secondary_transaction',
    'impairment',
  ];

  it.each(sources)('accepts mark_source value %s', (v) => {
    expect(() => MarkSourceSchema.parse(v)).not.toThrow();
  });

  it('rejects an unknown mark_source', () => {
    expect(() => MarkSourceSchema.parse('crystal_ball')).toThrow();
  });
});

describe('Enum coverage -- confidenceLevel (3 values)', () => {
  it.each(['high', 'medium', 'low'])('accepts %s', (v) => {
    expect(() => ConfidenceLevelSchema.parse(v)).not.toThrow();
  });

  it('rejects an unknown confidence level', () => {
    expect(() => ConfidenceLevelSchema.parse('extreme')).toThrow();
  });
});

describe('Required fields', () => {
  it('rejects missing fairValue', () => {
    const { fairValue: _omit, ...rest } = happyPath;
    expect(() => ValuationMarkCreateSchema.parse(rest)).toThrow();
  });

  it('rejects missing companyId', () => {
    const { companyId: _omit, ...rest } = happyPath;
    expect(() => ValuationMarkCreateSchema.parse(rest)).toThrow();
  });

  it('rejects malformed fairValue (not a decimal string)', () => {
    expect(() => ValuationMarkCreateSchema.parse({ ...happyPath, fairValue: '1.2.3' })).toThrow();
  });
});

describe('Money-field grep gate -- no z.number() in money positions', () => {
  it('contract source contains no z.number() pattern on money-named fields', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'shared', 'contracts', 'lp-reporting', 'valuation-mark.contract.ts'),
      'utf8'
    );
    const moneyKeywords = ['fairValue', 'costBasis'];
    for (const keyword of moneyKeywords) {
      const moneyNumberPattern = new RegExp(`${keyword}\\s*:\\s*z\\.number\\(\\)`, 'i');
      expect(source).not.toMatch(moneyNumberPattern);
    }
  });
});
