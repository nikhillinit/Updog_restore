/**
 * LP Reporting -- ImportPreviewPanel tests.
 *
 * Asserts:
 *   - Renders matched / partial / unmatched buckets with counts.
 *   - Empty buckets render the empty state.
 *   - Bucket assignment uses errors[].row, warnings[].row, and
 *     row.excluded.
 *   - Decimal-string fields render through the currency formatter
 *     (no JS-number math in the source).
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';

import { ImportPreviewPanel } from '@/components/lp-reporting/ImportPreviewPanel';
import type { ImportDryRunResponse } from '@shared/contracts/lp-reporting';

function makeResponse(): ImportDryRunResponse {
  return {
    importId: '11111111-2222-3333-4444-555555555555',
    sourceType: 'csv',
    previewHash: 'a'.repeat(64),
    parsedRows: 4,
    validRows: 2,
    invalidRows: 1,
    duplicateRows: 1,
    warnings: [
      {
        row: 2,
        column: 'amount',
        code: 'AMOUNT_PRECISION_TRUNCATED',
        message: 'Amount truncated to 6 decimals.',
      },
    ],
    errors: [
      {
        row: 3,
        column: 'event_date',
        code: 'INVALID_DATE',
        message: 'Date is not ISO-8601.',
        severity: 'error',
      },
    ],
    reconciliation: {
      calledCapitalImported: '1000000.000000',
      distributionsImported: '0.000000',
      latestNavImported: '0.000000',
      explanations: [],
    },
    preview: [
      {
        rowIndex: 1,
        eventType: 'lp_capital_call',
        amount: '1000000.000000',
        eventDate: '2026-03-31',
        duplicate: false,
        excluded: false,
      },
      {
        rowIndex: 2,
        eventType: 'lp_distribution',
        amount: '500000.000000',
        eventDate: '2026-04-01',
        duplicate: false,
        excluded: false,
      },
      {
        rowIndex: 3,
        eventType: 'fund_expense',
        amount: '12500.000000',
        eventDate: 'not-a-date',
        duplicate: false,
        excluded: false,
      },
      {
        rowIndex: 4,
        eventType: 'reversal',
        amount: '250000.000000',
        eventDate: '2026-04-02',
        duplicate: true,
        excluded: true,
        excludedReason: 'duplicate of row 1',
      },
    ],
  };
}

function emptyResponse(): ImportDryRunResponse {
  return {
    importId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    sourceType: 'csv',
    previewHash: 'a'.repeat(64),
    parsedRows: 0,
    validRows: 0,
    invalidRows: 0,
    duplicateRows: 0,
    warnings: [],
    errors: [],
    reconciliation: {
      calledCapitalImported: '0.000000',
      distributionsImported: '0.000000',
      latestNavImported: '0.000000',
      explanations: [],
    },
    preview: [],
  };
}

describe('ImportPreviewPanel', () => {
  it('renders matched / partial / unmatched buckets with the expected rows', () => {
    render(<ImportPreviewPanel response={makeResponse()} />);

    expect(screen.getByTestId('import-preview-panel')).toBeInTheDocument();

    // Counts: matched=1 (row 1), partial=1 (row 2), unmatched=2 (rows 3, 4)
    expect(screen.getByTestId('import-preview-matched-count').textContent).toBe('(1)');
    expect(screen.getByTestId('import-preview-partial-count').textContent).toBe('(1)');
    expect(screen.getByTestId('import-preview-unmatched-count').textContent).toBe('(2)');

    expect(screen.getByTestId('import-preview-matched-table')).toBeInTheDocument();
    expect(screen.getByTestId('import-preview-partial-table')).toBeInTheDocument();
    expect(screen.getByTestId('import-preview-unmatched-table')).toBeInTheDocument();
  });

  it('renders the empty state for every bucket when preview is empty', () => {
    render(<ImportPreviewPanel response={emptyResponse()} />);

    expect(screen.getByTestId('import-preview-matched-empty')).toBeInTheDocument();
    expect(screen.getByTestId('import-preview-partial-empty')).toBeInTheDocument();
    expect(screen.getByTestId('import-preview-unmatched-empty')).toBeInTheDocument();
  });

  it('renders decimal-string amounts through the currency formatter', () => {
    render(<ImportPreviewPanel response={makeResponse()} />);

    // 1,000,000.00 from row 1 (matched bucket)
    expect(screen.getByText('$1,000,000.00')).toBeInTheDocument();
  });

  it('source-discipline: component does not perform arithmetic on row.amount or row.fairValue', () => {
    const sourcePath = resolve(
      __dirname,
      '../../../../client/src/components/lp-reporting/ImportPreviewPanel.tsx'
    );
    const source = readFileSync(sourcePath, 'utf8');

    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n');

    expect(code).not.toMatch(/Number\(\s*row\.amount/);
    expect(code).not.toMatch(/Number\(\s*row\.fairValue/);
    expect(code).not.toMatch(/parseFloat\(/);
    expect(code).not.toMatch(/parseInt\(/);
    expect(code).not.toMatch(/row\.amount\s*[+\-*/]/);
    expect(code).not.toMatch(/row\.fairValue\s*[+\-*/]/);
  });
});
