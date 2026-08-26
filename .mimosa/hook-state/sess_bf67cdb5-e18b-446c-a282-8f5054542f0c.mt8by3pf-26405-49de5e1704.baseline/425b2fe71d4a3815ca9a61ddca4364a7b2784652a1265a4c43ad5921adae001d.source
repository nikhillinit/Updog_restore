// Default import on purpose: node-setup.ts vi.mock('fs') stubs the NAMED
// readFileSync/existsSync exports, but its ...actual spread preserves
// `default` as the real fs module - same pattern as reconcile-prod-schema.
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
  detectLedgerDuplicates,
  parseLedgerCsv,
  parseValuationMarksCsv,
  runLedgerDryRun,
  runValuationMarkDryRun,
} from '../../../../server/services/lp-reporting/import-reconciliation-service';

const FIXTURE_ROOT = path.join(process.cwd(), 'tests', 'fixtures', 'lp-reporting', 'adversarial');
const MANIFEST_PATH = path.join(FIXTURE_ROOT, 'manifest.json');

const ExpectedSchema = z
  .object({
    parsedRows: z.number().int().nonnegative().optional(),
    validRows: z.number().int().nonnegative().optional(),
    invalidRows: z.number().int().nonnegative().optional(),
    duplicateRows: z.number().int().nonnegative().optional(),
    errorCodes: z.array(z.string()).optional(),
    warningCodes: z.array(z.string()).optional(),
    selectedFields: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .optional(),
  })
  .strict();

const ManifestCaseSchema = z
  .object({
    caseId: z.string().min(1),
    parser: z.enum(['ledger', 'valuation', 'notion', 'future_v2']),
    fixture: z.string().min(1),
    classification: z.enum([
      'accepted_current_v1',
      'rejected_current_v1',
      'known_current_v1_limitation',
      'future_v2_security_requirement',
    ]),
    expected: ExpectedSchema,
    futureOwner: z.enum(['task_5a', 'task_6']).optional(),
    issueReference: z.string().url().optional(),
  })
  .strict();

const ManifestSchema = z
  .object({
    schemaVersion: z.literal('lp-reporting-import-adversary/1'),
    fixedClock: z.string().datetime(),
    cases: z.array(ManifestCaseSchema).min(1),
  })
  .strict();

const manifest = ManifestSchema.parse(JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')));
type ManifestCase = (typeof manifest.cases)[number];
type ExpectedScalar = string | number | boolean | null;
type ErrorLocation = { row: number; column: string; code: string };

const ERROR_LOCATIONS: Record<string, ErrorLocation[]> = {
  'ledger-embedded-line-break': [
    { row: 2, column: 'event_type', code: 'UNKNOWN_EVENT_TYPE' },
    { row: 2, column: 'amount', code: 'MALFORMED_AMOUNT' },
    { row: 2, column: 'event_date', code: 'MALFORMED_EVENT_DATE' },
  ],
  'ledger-missing-required-headers': [
    { row: 1, column: 'event_type', code: 'UNKNOWN_EVENT_TYPE' },
    { row: 1, column: 'event_date', code: 'MALFORMED_EVENT_DATE' },
  ],
  'ledger-inconsistent-dates': [{ row: 1, column: 'event_date', code: 'MALFORMED_EVENT_DATE' }],
  'ledger-scientific-notation': [{ row: 1, column: 'amount', code: 'MALFORMED_AMOUNT' }],
  'ledger-parenthetical-negative': [{ row: 1, column: 'amount', code: 'MALFORMED_AMOUNT' }],
  'ledger-malformed-number': [{ row: 1, column: 'amount', code: 'MALFORMED_AMOUNT' }],
  'ledger-formula-prefix-amount': [{ row: 1, column: 'amount', code: 'MALFORMED_AMOUNT' }],
  'ledger-unsupported-currency': [{ row: 1, column: 'currency', code: 'UNSUPPORTED_CURRENCY' }],
  'valuation-embedded-line-break': [
    { row: 2, column: 'mark_date', code: 'MALFORMED_MARK_DATE' },
    { row: 2, column: 'as_of_date', code: 'MALFORMED_AS_OF_DATE' },
    { row: 2, column: 'fair_value', code: 'MALFORMED_FAIR_VALUE' },
    { row: 2, column: 'company_id', code: 'MALFORMED_INTEGER_ID' },
    { row: 2, column: 'mark_source', code: 'MISSING_MARK_SOURCE' },
  ],
  'valuation-missing-required-headers': [
    { row: 1, column: 'mark_date', code: 'MALFORMED_MARK_DATE' },
    { row: 1, column: 'as_of_date', code: 'MALFORMED_AS_OF_DATE' },
    { row: 1, column: 'company_id', code: 'MISSING_COMPANY_ID' },
    { row: 1, column: 'mark_source', code: 'MISSING_MARK_SOURCE' },
  ],
  'valuation-scientific-notation': [{ row: 1, column: 'fair_value', code: 'MALFORMED_FAIR_VALUE' }],
  'valuation-parenthetical-negative': [
    { row: 1, column: 'fair_value', code: 'MALFORMED_FAIR_VALUE' },
  ],
  'valuation-formula-prefix-fair-value': [
    { row: 1, column: 'fair_value', code: 'MALFORMED_FAIR_VALUE' },
  ],
  'valuation-unsupported-currency': [{ row: 1, column: 'currency', code: 'UNSUPPORTED_CURRENCY' }],
};

function loadFixture(testCase: ManifestCase): Buffer {
  return fs.readFileSync(path.join(FIXTURE_ROOT, testCase.fixture));
}

function expectErrorLocations(
  caseId: string,
  actual: ErrorLocation[],
  expectedCodes?: string[]
): void {
  const expected = ERROR_LOCATIONS[caseId];
  if (!expectedCodes) {
    expect(actual).toHaveLength(0);
    expect(expected, `${caseId} should not have local error-location expectations`).toBeUndefined();
    return;
  }

  expect(expected, `${caseId} must pin exact parse error row/column/code`).toBeDefined();
  expect(actual.map(({ row, column, code }) => ({ row, column, code }))).toEqual(expected);
  expect(actual.map((error) => error.code)).toEqual(expectedCodes);
}

function expectWarningCodes(actual: { code: string }[], expected?: string[]): void {
  if (!expected) {
    expect(actual).toHaveLength(0);
    return;
  }
  expect(actual.map((warning) => warning.code)).toEqual(expected);
}

function isExpectedScalar(value: unknown): value is ExpectedScalar {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function buildRowSnapshot(
  rows: unknown[],
  extras: Record<string, ExpectedScalar> = {}
): Record<string, ExpectedScalar> {
  const snapshot: Record<string, ExpectedScalar> = { ...extras };
  rows.forEach((row, rowIndex) => {
    const record = row as Record<string, unknown>;
    for (const [key, value] of Object.entries(record)) {
      if (isExpectedScalar(value)) {
        snapshot[`row${rowIndex}.${key}`] = value;
      }
    }
    if (typeof record.description === 'string') {
      snapshot[`row${rowIndex}.descriptionLength`] = record.description.length;
    }
    snapshot[`row${rowIndex}.notesPresent`] = Object.prototype.hasOwnProperty.call(record, 'notes');
  });
  return snapshot;
}

function expectSelectedFields(
  snapshot: Record<string, ExpectedScalar>,
  expected?: Record<string, ExpectedScalar>
): void {
  if (!expected) {
    return;
  }
  for (const [field, expectedValue] of Object.entries(expected)) {
    expect(snapshot[field], field).toBe(expectedValue);
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(manifest.fixedClock));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('LP import adversarial manifest', () => {
  it('validates every case and keeps case IDs unique', () => {
    const caseIds = manifest.cases.map((testCase) => testCase.caseId);
    expect(new Set(caseIds).size).toBe(caseIds.length);
  });

  it('has a committed fixture for every manifest entry', () => {
    for (const testCase of manifest.cases) {
      expect(fs.existsSync(path.join(FIXTURE_ROOT, testCase.fixture)), testCase.caseId).toBe(true);
    }
  });

  it('keeps future-only rows as issue-owned metadata', () => {
    const futureCases = manifest.cases.filter(
      (testCase) => testCase.classification === 'future_v2_security_requirement'
    );

    expect(futureCases).toHaveLength(1);
    for (const testCase of futureCases) {
      expect(testCase.parser).toBe('future_v2');
      expect(testCase.futureOwner).toBe('task_6');
      expect(testCase.issueReference).toContain('/1173');
      expect(testCase.expected.selectedFields).toBeUndefined();
    }
  });

  it('pins row and column locations for every manifest case with parse errors', () => {
    const casesWithErrors = manifest.cases
      .filter((testCase) => testCase.expected.errorCodes !== undefined)
      .map((testCase) => testCase.caseId)
      .sort();

    expect(Object.keys(ERROR_LOCATIONS).sort()).toEqual(casesWithErrors);
  });
});

describe('parseLedgerCsv adversarial characterization', () => {
  const ledgerCases = manifest.cases.filter((testCase) => testCase.parser === 'ledger');

  it.each(ledgerCases)('$caseId pins current V1 $classification behavior', (testCase) => {
    const parsed = parseLedgerCsv(loadFixture(testCase), 1);
    const duplicates = detectLedgerDuplicates(parsed.rows);

    // Review R1: the dry-run RESPONSE is the frozen aggregation authority -
    // asserting its fields (not a test-side reimplementation of the count
    // math) so a V2 change to the dry-run layer trips this characterization.
    const dryRun = runLedgerDryRun(loadFixture(testCase), 'csv', 1);
    expect(dryRun.parsedRows).toBe(testCase.expected.parsedRows);
    expect(dryRun.validRows).toBe(testCase.expected.validRows);
    expect(dryRun.invalidRows).toBe(testCase.expected.invalidRows ?? 0);
    expect(dryRun.duplicateRows).toBe(testCase.expected.duplicateRows ?? 0);
    expectErrorLocations(testCase.caseId, parsed.parseErrors, testCase.expected.errorCodes);
    expectWarningCodes(parsed.parseWarnings, testCase.expected.warningCodes);

    expectSelectedFields(
      buildRowSnapshot(parsed.rows, {
        ...(duplicates.size === 1 && { duplicateRowIndex: [...duplicates][0]! }),
      }),
      testCase.expected.selectedFields
    );
  });

  it('keeps previewHash deterministic for identical ledger bytes and inputs only', () => {
    const testCase = ledgerCases.find((entry) => entry.caseId === 'ledger-quoted-comma');
    expect(testCase).toBeDefined();

    const buffer = loadFixture(testCase!);
    const first = runLedgerDryRun(buffer, 'csv', 1);
    const second = runLedgerDryRun(buffer, 'csv', 1);
    const otherFund = runLedgerDryRun(buffer, 'csv', 2);

    expect(second.importId).not.toBe(first.importId);
    expect(second.previewHash).toBe(first.previewHash);
    expect(otherFund.previewHash).not.toBe(first.previewHash);
  });

  it('pins duplicate count stability while reordered duplicate row index follows current row order', () => {
    const duplicated = ledgerCases.find(
      (entry) => entry.caseId === 'ledger-duplicated-economic-rows'
    );
    const reordered = ledgerCases.find(
      (entry) => entry.caseId === 'ledger-reordered-economic-rows'
    );
    expect(duplicated).toBeDefined();
    expect(reordered).toBeDefined();

    const duplicatedRows = parseLedgerCsv(loadFixture(duplicated!), 1);
    const reorderedRows = parseLedgerCsv(loadFixture(reordered!), 1);

    expect(detectLedgerDuplicates(duplicatedRows.rows).size).toBe(1);
    expect(detectLedgerDuplicates(reorderedRows.rows).size).toBe(1);
    expect([...detectLedgerDuplicates(duplicatedRows.rows)]).toEqual([2]);
    expect([...detectLedgerDuplicates(reorderedRows.rows)]).toEqual([3]);
  });
});

describe('parseValuationMarksCsv adversarial characterization', () => {
  const valuationCases = manifest.cases.filter((testCase) => testCase.parser === 'valuation');

  it.each(valuationCases)('$caseId pins current V1 $classification behavior', (testCase) => {
    const parsed = parseValuationMarksCsv(loadFixture(testCase), 1);

    // Review R1: assert the dry-run response fields directly (see ledger note).
    const dryRun = runValuationMarkDryRun(loadFixture(testCase), 'csv', 1);
    expect(dryRun.parsedRows).toBe(testCase.expected.parsedRows);
    expect(dryRun.validRows).toBe(testCase.expected.validRows);
    expect(dryRun.invalidRows).toBe(testCase.expected.invalidRows ?? 0);
    expect(dryRun.duplicateRows).toBe(testCase.expected.duplicateRows ?? 0);
    expectErrorLocations(testCase.caseId, parsed.parseErrors, testCase.expected.errorCodes);
    expectWarningCodes(parsed.parseWarnings, testCase.expected.warningCodes);

    expectSelectedFields(buildRowSnapshot(parsed.rows), testCase.expected.selectedFields);
  });

  it('keeps valuation dry-run previewHash deterministic under the manifest fixed UTC clock', () => {
    const testCase = valuationCases.find((entry) => entry.caseId === 'valuation-quoted-comma');
    expect(testCase).toBeDefined();

    const buffer = loadFixture(testCase!);
    const first = runValuationMarkDryRun(buffer, 'csv', 1);
    const second = runValuationMarkDryRun(buffer, 'csv', 1);
    const otherFund = runValuationMarkDryRun(buffer, 'csv', 2);

    expect(second.importId).not.toBe(first.importId);
    expect(second.previewHash).toBe(first.previewHash);
    expect(otherFund.previewHash).not.toBe(first.previewHash);
  });
});
