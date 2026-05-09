/**
 * LP Reporting -- LedgerTable component tests.
 *
 * Asserts:
 *   - Empty state renders when `rows` is empty (default + custom).
 *   - Rows render with `formatDecimalCurrency` exercised on `amount`
 *     (e.g. "1000000" -> "$1,000,000.00", precision-preserving).
 *   - Source-discipline check: the component file does NOT contain
 *     JS-number arithmetic on `row.amount`.
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { LedgerTable } from '@/components/lp-reporting/LedgerTable';
import type { ImportPreviewRow } from '@shared/contracts/lp-reporting';

function makeRow(overrides: Partial<ImportPreviewRow> = {}): ImportPreviewRow {
  return {
    rowIndex: 1,
    eventType: 'lp_capital_call',
    amount: '1000000.000000',
    eventDate: '2026-03-31',
    duplicate: false,
    excluded: false,
    ...overrides,
  };
}

describe('LedgerTable', () => {
  it('renders the default empty state when rows is empty', () => {
    render(<LedgerTable rows={[]} />);

    expect(screen.getByTestId('ledger-table-empty')).toBeInTheDocument();
    expect(screen.getByText(/no ledger rows yet/i)).toBeInTheDocument();
  });

  it('renders a custom empty state when supplied', () => {
    render(<LedgerTable rows={[]} emptyState={<span data-testid="custom-empty">nothing</span>} />);

    expect(screen.getByTestId('custom-empty')).toBeInTheDocument();
  });

  it('renders rows with currency-formatted amounts', () => {
    render(
      <LedgerTable
        rows={[
          makeRow({ amount: '1000000.000000', eventType: 'lp_capital_call' }),
          makeRow({
            rowIndex: 2,
            amount: '-50000.500000',
            eventType: 'lp_distribution',
            eventDate: '2026-04-15',
          }),
        ]}
      />
    );

    expect(screen.getByTestId('ledger-table')).toBeInTheDocument();
    expect(screen.getByText('$1,000,000.00')).toBeInTheDocument();
    expect(screen.getByText('-$50,000.50')).toBeInTheDocument();
    expect(screen.getByText('lp_capital_call')).toBeInTheDocument();
    expect(screen.getByText('lp_distribution')).toBeInTheDocument();
    expect(screen.getByText('2026-03-31')).toBeInTheDocument();
    expect(screen.getByText('2026-04-15')).toBeInTheDocument();
  });

  it('preserves precision beyond Number.MAX_SAFE_INTEGER', () => {
    // 9_007_199_254_740_993 is MAX_SAFE_INTEGER + 2 -- a JS number would
    // round to 9_007_199_254_740_992. The decimal-string formatter must
    // keep the trailing 3.
    render(<LedgerTable rows={[makeRow({ amount: '9007199254740993', rowIndex: 99 })]} />);

    expect(screen.getByText('$9,007,199,254,740,993.00')).toBeInTheDocument();
  });

  it('renders a placeholder when amount is undefined on the row', () => {
    const { container } = render(
      <LedgerTable
        rows={[
          {
            rowIndex: 1,
            eventType: 'lp_capital_call',
            eventDate: '2026-03-31',
            duplicate: false,
            excluded: false,
          },
        ]}
      />
    );

    const amountCell = container.querySelector('[data-column="amount"]');
    expect(amountCell).not.toBeNull();
    expect(amountCell?.textContent).toBe('--');
  });

  it('source-discipline: component does not perform arithmetic on row.amount', () => {
    const sourcePath = resolve(
      __dirname,
      '../../../../client/src/components/lp-reporting/LedgerTable.tsx'
    );
    const source = readFileSync(sourcePath, 'utf8');

    // Strip line comments and block comments so we don't trip on prose
    // that mentions "Number(" inside the doc strings.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n');

    expect(code).not.toMatch(/Number\(\s*row\.amount/);
    expect(code).not.toMatch(/parseFloat\(/);
    expect(code).not.toMatch(/parseInt\(\s*row\.amount/);
    // No additive / subtractive / multiplicative ops on row.amount.
    expect(code).not.toMatch(/row\.amount\s*[+\-*/]/);
    expect(code).not.toMatch(/[+\-*/]\s*row\.amount/);
  });
});
