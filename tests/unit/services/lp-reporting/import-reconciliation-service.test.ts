/**
 * Service tests for import-reconciliation-service (LP Reporting Phase 0.4).
 *
 * Verifies pure parser correctness, duplicate detection, reconciliation
 * math, and the orchestrator's response shape. No DB.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ImportDryRunResponseSchema } from '@shared/contracts/lp-reporting';
import {
  detectLedgerDuplicates,
  parseLedgerCsv,
  parseLedgerNotionExport,
  parseValuationMarksCsv,
  reconcileLedgerImport,
  reconcileValuationMarkImport,
  runLedgerDryRun,
  runValuationMarkDryRun,
} from '../../../../server/services/lp-reporting/import-reconciliation-service';

const FIXTURES_DIR = path.join(process.cwd(), 'tests', 'fixtures', 'lp-reporting');

function loadFixture(name: string): Buffer {
  return fs.readFileSync(path.join(FIXTURES_DIR, name));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-08T00:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('parseLedgerCsv -- sample-ledger.csv', () => {
  const buffer = loadFixture('sample-ledger.csv');
  const parsed = parseLedgerCsv(buffer, 1);

  it('returns 5 valid rows (1 row failed parse on malformed event_date)', () => {
    expect(parsed.rows).toHaveLength(5);
  });

  it('reports exactly 1 parse error for the malformed-date row', () => {
    expect(parsed.parseErrors).toHaveLength(1);
    expect(parsed.parseErrors[0]?.code).toBe('MALFORMED_EVENT_DATE');
    expect(parsed.parseErrors[0]?.row).toBe(6);
  });

  it('parsed rows include each documented event type once', () => {
    const types = parsed.rows.map((r) => r.eventType);
    expect(types).toContain('lp_capital_call');
    expect(types).toContain('lp_distribution');
    expect(types).toContain('portfolio_investment');
    expect(types).toContain('fund_expense');
  });

  it('rejects malformed optional IDs instead of leaking NaN or truncated IDs', () => {
    const csv = Buffer.from(
      [
        'event_type,amount,currency,event_date,perspective,company_id,lp_id,vehicle_id',
        'portfolio_investment,1.000000,USD,2026-01-01,company,abc,42x,0',
      ].join('\n')
    );
    const parsed = parseLedgerCsv(csv, 1);
    expect(parsed.rows).toHaveLength(0);
    expect(parsed.parseErrors.map((e) => e.column)).toEqual(
      expect.arrayContaining(['company_id', 'lp_id', 'vehicle_id'])
    );
  });
});

describe('detectLedgerDuplicates', () => {
  const buffer = loadFixture('sample-ledger.csv');
  const parsed = parseLedgerCsv(buffer, 1);
  const duplicates = detectLedgerDuplicates(parsed.rows);

  it('flags exactly one duplicate row', () => {
    expect(duplicates.size).toBe(1);
  });

  it('flags row 5 as the duplicate (second occurrence of the lp_capital_call)', () => {
    expect(duplicates.has(5)).toBe(true);
  });
});

describe('reconcileLedgerImport math', () => {
  const buffer = loadFixture('sample-ledger.csv');
  const parsed = parseLedgerCsv(buffer, 1);

  it('sums lp_capital_call amounts (including the duplicate row, since dedup is a separate concern)', () => {
    const summary = reconcileLedgerImport(parsed.rows);
    expect(summary.calledCapitalImported).toBe('2000000.000000');
  });

  it('sums lp_distribution amounts', () => {
    const summary = reconcileLedgerImport(parsed.rows);
    expect(summary.distributionsImported).toBe('250000.000000');
  });

  it('reports difference vs. expected when supplied', () => {
    const summary = reconcileLedgerImport(parsed.rows, {
      calledCapitalExpected: '1500000.000000',
    });
    expect(summary.calledCapitalExpected).toBe('1500000.000000');
    expect(summary.difference).toBe('500000.000000');
    expect(summary.explanations.length).toBeGreaterThan(0);
  });

  it('omits difference when expected is not supplied', () => {
    const summary = reconcileLedgerImport(parsed.rows);
    expect(summary.difference).toBeUndefined();
    expect(summary.calledCapitalExpected).toBeUndefined();
  });
});

describe('parseValuationMarksCsv -- sample-valuation-marks.csv', () => {
  const buffer = loadFixture('sample-valuation-marks.csv');
  const parsed = parseValuationMarksCsv(buffer, 1);

  it('returns 4 rows', () => {
    expect(parsed.rows).toHaveLength(4);
    expect(parsed.parseErrors).toHaveLength(0);
  });

  it('imported marks default confidence to low for board_update / gp_estimate sources', () => {
    const boardUpdate = parsed.rows.find((r) => r.markSource === 'board_update');
    const gpEstimate = parsed.rows.find((r) => r.markSource === 'gp_estimate');
    expect(boardUpdate?.confidenceLevel).toBe('low');
    expect(gpEstimate?.confidenceLevel).toBe('low');
  });

  it('preserves explicit "high" confidence on financing_round', () => {
    const financingRound = parsed.rows.find((r) => r.markSource === 'financing_round');
    expect(financingRound?.confidenceLevel).toBe('high');
  });

  it('emits a downgrade warning when imported confidence is overridden', () => {
    const downgradedWarnings = parsed.parseWarnings.filter(
      (w) => w.code === 'CONFIDENCE_DOWNGRADED'
    );
    expect(downgradedWarnings.length).toBeGreaterThan(0);
  });

  it('rejects malformed company_id and vehicle_id values', () => {
    const csv = Buffer.from(
      [
        'company_id,mark_date,as_of_date,fair_value,currency,mark_source,confidence_level,valuation_method,vehicle_id',
        '42x,2026-01-01,2026-01-01,100.000000,USD,financing_round,high,priced_round,abc',
      ].join('\n')
    );
    const parsed = parseValuationMarksCsv(csv, 1);
    expect(parsed.rows).toHaveLength(0);
    expect(parsed.parseErrors.map((e) => e.column)).toEqual(
      expect.arrayContaining(['company_id', 'vehicle_id'])
    );
  });
});

describe('reconcileValuationMarkImport excludes future-dated marks', () => {
  const buffer = loadFixture('sample-valuation-marks.csv');
  const parsed = parseValuationMarksCsv(buffer, 1);
  const summary = reconcileValuationMarkImport(parsed.rows);

  it('explanations note that future-dated marks were excluded', () => {
    expect(summary.explanations.some((e) => e.includes('future-dated'))).toBe(true);
  });

  it('latestNavImported sums only current marks (3 of the 4 rows)', () => {
    // Three current marks: 5,000,000 + 5,500,000 + 5,800,000 = 16,300,000
    expect(summary.latestNavImported).toBe('16300000.000000');
  });
});

describe('parseLedgerNotionExport -- sample-notion-export.csv', () => {
  const buffer = loadFixture('sample-notion-export.csv');
  const parsed = parseLedgerNotionExport(buffer, 1);

  it('maps Title Case "Event Type" / "Date" / "Notes" headers to the canonical keys', () => {
    expect(parsed.parseErrors).toHaveLength(0);
    expect(parsed.rows).toHaveLength(4);
  });

  it('the parsed rows expose the correct event types', () => {
    const types = parsed.rows.map((r) => r.eventType).sort();
    expect(types).toEqual(
      ['lp_capital_call', 'lp_distribution', 'portfolio_investment', 'realized_proceeds'].sort()
    );
  });

  it('description column is populated from the Notes column', () => {
    const distribution = parsed.rows.find((r) => r.eventType === 'lp_distribution');
    expect(distribution?.description).toMatch(/Q2 2026/);
  });
});

describe('runLedgerDryRun -- orchestrator', () => {
  const buffer = loadFixture('sample-ledger.csv');
  const result = runLedgerDryRun(buffer, 'csv', 1);

  it('returns a response that conforms to ImportDryRunResponseSchema', () => {
    expect(() => ImportDryRunResponseSchema.parse(result)).not.toThrow();
  });

  it('reports parsedRows = validRows + invalidRows + (rows that parsed but were not in valid count via duplicates)', () => {
    expect(result.invalidRows).toBe(1);
    expect(result.duplicateRows).toBe(1);
    expect(result.parsedRows).toBe(6);
  });

  it('importId is a UUID', () => {
    expect(result.importId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it('previewHash is deterministic even when importId changes', () => {
    const second = runLedgerDryRun(buffer, 'csv', 1);
    expect(second.importId).not.toBe(result.importId);
    expect(second.previewHash).toBe(result.previewHash);
  });

  it('pins the complete current ledger dry-run response body', () => {
    expect(result).toEqual({
      importId: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      ),
      sourceType: 'csv',
      previewHash: '5b1e5841ca3ac59d3062a852b15cdca789cf116a0e5f5e841f26d9f34b38601f',
      parsedRows: 6,
      validRows: 4,
      invalidRows: 1,
      duplicateRows: 1,
      warnings: [],
      errors: [
        {
          row: 6,
          column: 'event_date',
          code: 'MALFORMED_EVENT_DATE',
          message: 'event_date "not-a-date" must be ISO-8601.',
          severity: 'error',
        },
      ],
      reconciliation: {
        calledCapitalImported: '2000000.000000',
        distributionsImported: '250000.000000',
        latestNavImported: '0.000000',
        explanations: [],
      },
      preview: [
        {
          rowIndex: 1,
          eventType: 'lp_capital_call',
          lpId: 1,
          amount: '1000000.000000',
          eventDate: '2026-01-15T00:00:00.000Z',
          duplicate: false,
          excluded: false,
        },
        {
          rowIndex: 2,
          eventType: 'lp_distribution',
          lpId: 1,
          amount: '250000.000000',
          eventDate: '2026-02-20T00:00:00.000Z',
          duplicate: false,
          excluded: false,
        },
        {
          rowIndex: 3,
          eventType: 'portfolio_investment',
          companyId: 42,
          amount: '500000.000000',
          eventDate: '2026-03-10T00:00:00.000Z',
          duplicate: false,
          excluded: false,
        },
        {
          rowIndex: 4,
          eventType: 'fund_expense',
          amount: '12500.000000',
          eventDate: '2026-03-31T00:00:00.000Z',
          duplicate: false,
          excluded: false,
        },
        {
          rowIndex: 5,
          eventType: 'lp_capital_call',
          lpId: 1,
          amount: '1000000.000000',
          eventDate: '2026-01-15T00:00:00.000Z',
          duplicate: true,
          excluded: false,
        },
      ],
    });
  });
});

describe('runValuationMarkDryRun -- orchestrator', () => {
  const buffer = loadFixture('sample-valuation-marks.csv');
  const result = runValuationMarkDryRun(buffer, 'csv', 1);

  it('returns a response that conforms to ImportDryRunResponseSchema', () => {
    expect(() => ImportDryRunResponseSchema.parse(result)).not.toThrow();
  });

  it('preview includes the future-dated mark with excluded=true', () => {
    const futureRow = result.preview.find((r) => r.asOfDate === '2027-01-01');
    expect(futureRow?.excluded).toBe(true);
    expect(futureRow?.excludedReason).toMatch(/future/i);
  });

  it('latestNavImported equals the sum of current marks (excludes 2027-01-01 row)', () => {
    expect(result.reconciliation.latestNavImported).toBe('16300000.000000');
  });

  it('previewHash changes when the fund changes', () => {
    const otherFund = runValuationMarkDryRun(buffer, 'csv', 2);
    expect(otherFund.previewHash).not.toBe(result.previewHash);
  });

  it('pins the complete current valuation dry-run response body', () => {
    const current = runValuationMarkDryRun(buffer, 'csv', 1);

    expect(current).toEqual({
      importId: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      ),
      sourceType: 'csv',
      previewHash: 'd778927a9320b2dec4f51d8852af604164dff352ff75d93bf6483f35b17901b4',
      parsedRows: 4,
      validRows: 4,
      invalidRows: 0,
      duplicateRows: 0,
      warnings: [
        {
          row: 2,
          column: 'confidence_level',
          code: 'CONFIDENCE_DOWNGRADED',
          message: 'confidence_level "high" downgraded to "low" per import policy.',
        },
        {
          row: 3,
          column: 'confidence_level',
          code: 'CONFIDENCE_DOWNGRADED',
          message: 'confidence_level "medium" downgraded to "low" per import policy.',
        },
        {
          row: 4,
          column: 'confidence_level',
          code: 'CONFIDENCE_DOWNGRADED',
          message: 'confidence_level "medium" downgraded to "low" per import policy.',
        },
      ],
      errors: [],
      reconciliation: {
        calledCapitalImported: '0.000000',
        distributionsImported: '0.000000',
        latestNavImported: '16300000.000000',
        explanations: ['1 future-dated mark(s) excluded from current as-of NAV calculation.'],
      },
      preview: [
        {
          rowIndex: 1,
          markSource: 'financing_round',
          companyId: 42,
          fairValue: '5000000.000000',
          asOfDate: '2026-03-31',
          confidenceLevel: 'high',
          duplicate: false,
          excluded: false,
        },
        {
          rowIndex: 2,
          markSource: 'board_update',
          companyId: 42,
          fairValue: '5500000.000000',
          asOfDate: '2026-04-15',
          confidenceLevel: 'low',
          duplicate: false,
          excluded: false,
        },
        {
          rowIndex: 3,
          markSource: 'gp_estimate',
          companyId: 42,
          fairValue: '5800000.000000',
          asOfDate: '2026-04-20',
          confidenceLevel: 'low',
          duplicate: false,
          excluded: false,
        },
        {
          rowIndex: 4,
          markSource: 'board_update',
          companyId: 42,
          fairValue: '6500000.000000',
          asOfDate: '2027-01-01',
          confidenceLevel: 'low',
          duplicate: false,
          excluded: true,
          excludedReason: 'Future-dated mark',
        },
      ],
    });
  });
});
