/**
 * Contract tests for EvidenceRecordCreateSchema (LP Reporting Phase 0.3).
 *
 * Asserts the typed-FK exclusivity rule: exactly one of
 * {valuationMarkId, companyId, metricRunId, narrativeRunId} must be set.
 * No polymorphic target_type/target_id allowed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  ConfidentialitySchema,
  EvidenceRecordCreateSchema,
  EvidenceSourceSchema,
  MaterialityLevelSchema,
} from '@shared/contracts/lp-reporting/evidence-record.contract';

const baseFields = {
  fundId: 1,
  evidenceSource: 'financing_round' as const,
  sourceDate: '2026-04-15',
};

describe('EvidenceRecordCreateSchema -- typed-FK exclusivity (num_nonnulls = 1)', () => {
  it('rejects 0 targets (none of the four FKs set)', () => {
    expect(() => EvidenceRecordCreateSchema.parse({ ...baseFields })).toThrow(
      /Exactly one of valuationMarkId, companyId, metricRunId, narrativeRunId/
    );
  });

  it('accepts exactly 1 target -- valuationMarkId', () => {
    expect(() =>
      EvidenceRecordCreateSchema.parse({ ...baseFields, valuationMarkId: 7 })
    ).not.toThrow();
  });

  it('accepts exactly 1 target -- companyId', () => {
    expect(() => EvidenceRecordCreateSchema.parse({ ...baseFields, companyId: 42 })).not.toThrow();
  });

  it('accepts exactly 1 target -- metricRunId', () => {
    expect(() =>
      EvidenceRecordCreateSchema.parse({ ...baseFields, metricRunId: 11 })
    ).not.toThrow();
  });

  it('accepts exactly 1 target -- narrativeRunId', () => {
    expect(() =>
      EvidenceRecordCreateSchema.parse({ ...baseFields, narrativeRunId: 22 })
    ).not.toThrow();
  });

  it('rejects 2 targets (companyId + metricRunId)', () => {
    expect(() =>
      EvidenceRecordCreateSchema.parse({
        ...baseFields,
        companyId: 42,
        metricRunId: 11,
      })
    ).toThrow();
  });

  it('rejects 4 targets (all set)', () => {
    expect(() =>
      EvidenceRecordCreateSchema.parse({
        ...baseFields,
        valuationMarkId: 7,
        companyId: 42,
        metricRunId: 11,
        narrativeRunId: 22,
      })
    ).toThrow();
  });
});

describe('.strict() rejects unknown top-level keys', () => {
  it('rejects bogus key', () => {
    expect(() =>
      EvidenceRecordCreateSchema.parse({
        ...baseFields,
        valuationMarkId: 7,
        bogus: 'extra',
      })
    ).toThrow();
  });

  it('rejects polymorphic target_type', () => {
    expect(() =>
      EvidenceRecordCreateSchema.parse({
        ...baseFields,
        target_type: 'valuation_mark',
        target_id: 7,
      })
    ).toThrow();
  });
});

describe('Enum coverage', () => {
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
    'customer_contract',
    'management_report',
    'auditor_confirmation',
  ];
  it.each(sources)('accepts EvidenceSourceSchema value %s', (v) => {
    expect(() => EvidenceSourceSchema.parse(v)).not.toThrow();
  });

  it('rejects an unknown evidence source', () => {
    expect(() => EvidenceSourceSchema.parse('overheard_at_dinner')).toThrow();
  });

  it.each(['high', 'medium', 'low'])('accepts MaterialityLevelSchema value %s', (v) => {
    expect(() => MaterialityLevelSchema.parse(v)).not.toThrow();
  });

  it('rejects an unknown materiality level', () => {
    expect(() => MaterialityLevelSchema.parse('catastrophic')).toThrow();
  });

  it.each(['internal', 'lp_shareable', 'restricted'])(
    'accepts ConfidentialitySchema value %s',
    (v) => {
      expect(() => ConfidentialitySchema.parse(v)).not.toThrow();
    }
  );

  it('rejects an unknown confidentiality value', () => {
    expect(() => ConfidentialitySchema.parse('public')).toThrow();
  });
});

describe('Defaults applied', () => {
  it('confidenceLevel defaults to medium', () => {
    const parsed = EvidenceRecordCreateSchema.parse({ ...baseFields, companyId: 42 });
    expect(parsed.confidenceLevel).toBe('medium');
  });

  it('confidentiality defaults to internal', () => {
    const parsed = EvidenceRecordCreateSchema.parse({ ...baseFields, companyId: 42 });
    expect(parsed.confidentiality).toBe('internal');
  });

  it('attachments defaults to []', () => {
    const parsed = EvidenceRecordCreateSchema.parse({ ...baseFields, companyId: 42 });
    expect(parsed.attachments).toEqual([]);
  });

  it('redactionRequired defaults to false', () => {
    const parsed = EvidenceRecordCreateSchema.parse({ ...baseFields, companyId: 42 });
    expect(parsed.redactionRequired).toBe(false);
  });
});

describe('Polymorphic target_type forbidden in source', () => {
  it('contract source contains no target_type or target_id field', () => {
    const source = fs.readFileSync(
      path.join(
        process.cwd(),
        'shared',
        'contracts',
        'lp-reporting',
        'evidence-record.contract.ts'
      ),
      'utf8'
    );
    expect(source).not.toMatch(/target_type\s*:\s*z\./i);
    expect(source).not.toMatch(/targetType\s*:\s*z\./i);
    expect(source).not.toMatch(/target_id\s*:\s*z\./i);
    expect(source).not.toMatch(/targetId\s*:\s*z\./i);
  });
});
