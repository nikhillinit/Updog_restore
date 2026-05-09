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
});
