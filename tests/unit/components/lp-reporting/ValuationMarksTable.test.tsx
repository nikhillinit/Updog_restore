/**
 * LP Reporting -- ValuationMarksTable component tests.
 *
 * Asserts:
 *   - Empty state renders when `rows` is empty (default + custom).
 *   - Rows render with `formatDecimalCurrency` exercised on `fairValue`.
 *   - Confidence Badge renders the right tone for each level
 *     (high / medium / low) via stable data-testids.
 *   - Future-dated rows (asOfDate > pageAsOfDate) carry the visual
 *     affordance: future-dated badge AND aria-label on the row.
 *   - Source-discipline check: the component does NOT call Number(),
 *     parseFloat(), or perform arithmetic on row.fairValue.
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { ValuationMarksTable } from '@/components/lp-reporting/ValuationMarksTable';
import type { ImportPreviewRow } from '@shared/contracts/lp-reporting';

const PAGE_AS_OF = '2026-05-08';

function makeRow(overrides: Partial<ImportPreviewRow> = {}): ImportPreviewRow {
  return {
    rowIndex: 1,
    markSource: 'gp_estimate',
    companyId: 42,
    fairValue: '1000000.000000',
    asOfDate: '2026-03-31',
    confidenceLevel: 'low',
    duplicate: false,
    excluded: false,
    ...overrides,
  };
}

describe('ValuationMarksTable', () => {
  it('renders the default empty state when rows is empty', () => {
    render(<ValuationMarksTable rows={[]} asOfDate={PAGE_AS_OF} />);

    expect(screen.getByTestId('valuation-marks-table-empty')).toBeInTheDocument();
    expect(screen.getByText(/no valuation marks yet/i)).toBeInTheDocument();
  });

  it('renders a custom empty state when supplied', () => {
    render(
      <ValuationMarksTable
        rows={[]}
        asOfDate={PAGE_AS_OF}
        emptyState={<span data-testid="custom-empty">nothing yet</span>}
      />
    );

    expect(screen.getByTestId('custom-empty')).toBeInTheDocument();
  });

  it('renders rows with currency-formatted fairValue', () => {
    render(
      <ValuationMarksTable
        rows={[
          makeRow({ fairValue: '1000000.000000' }),
          makeRow({
            rowIndex: 2,
            fairValue: '-50000.500000',
            asOfDate: '2026-04-15',
          }),
        ]}
        asOfDate={PAGE_AS_OF}
      />
    );

    expect(screen.getByTestId('valuation-marks-table')).toBeInTheDocument();
    expect(screen.getByText('$1,000,000.00')).toBeInTheDocument();
    expect(screen.getByText('-$50,000.50')).toBeInTheDocument();
  });

  it('preserves precision beyond Number.MAX_SAFE_INTEGER on fairValue', () => {
    render(
      <ValuationMarksTable
        rows={[makeRow({ fairValue: '9007199254740993', rowIndex: 99 })]}
        asOfDate={PAGE_AS_OF}
      />
    );

    expect(screen.getByText('$9,007,199,254,740,993.00')).toBeInTheDocument();
  });

  it('renders a placeholder when fairValue is undefined', () => {
    const { container } = render(
      <ValuationMarksTable
        rows={[
          {
            rowIndex: 1,
            markSource: 'gp_estimate',
            companyId: 42,
            asOfDate: '2026-03-31',
            confidenceLevel: 'low',
            duplicate: false,
            excluded: false,
          },
        ]}
        asOfDate={PAGE_AS_OF}
      />
    );

    const cell = container.querySelector('[data-column="fair-value"]');
    expect(cell).not.toBeNull();
    expect(cell?.textContent).toBe('--');
  });

  it('renders the high-confidence badge with the success tone', () => {
    render(
      <ValuationMarksTable rows={[makeRow({ confidenceLevel: 'high' })]} asOfDate={PAGE_AS_OF} />
    );

    expect(screen.getByTestId('confidence-badge-high')).toBeInTheDocument();
  });

  it('renders the medium-confidence badge with the warning tone', () => {
    render(
      <ValuationMarksTable rows={[makeRow({ confidenceLevel: 'medium' })]} asOfDate={PAGE_AS_OF} />
    );

    expect(screen.getByTestId('confidence-badge-medium')).toBeInTheDocument();
  });

  it('renders the low-confidence badge with the muted tone (import default)', () => {
    render(
      <ValuationMarksTable rows={[makeRow({ confidenceLevel: 'low' })]} asOfDate={PAGE_AS_OF} />
    );

    expect(screen.getByTestId('confidence-badge-low')).toBeInTheDocument();
  });

  it('renders confidence as low when the row omits confidenceLevel', () => {
    render(
      <ValuationMarksTable
        rows={[
          {
            rowIndex: 1,
            markSource: 'gp_estimate',
            companyId: 42,
            fairValue: '1000000.000000',
            asOfDate: '2026-03-31',
            duplicate: false,
            excluded: false,
          },
        ]}
        asOfDate={PAGE_AS_OF}
      />
    );

    expect(screen.getByTestId('confidence-badge-low')).toBeInTheDocument();
  });

  it('flags future-dated marks with badge AND aria-label affordance', () => {
    const { container } = render(
      <ValuationMarksTable
        rows={[
          // Past mark -- not future-dated.
          makeRow({ rowIndex: 1, asOfDate: '2026-03-31' }),
          // Strictly later than pageAsOfDate -- future-dated.
          makeRow({ rowIndex: 2, asOfDate: '2026-09-30' }),
        ]}
        asOfDate={PAGE_AS_OF}
      />
    );

    const futureDatedBadges = screen.getAllByTestId('future-dated-badge');
    expect(futureDatedBadges).toHaveLength(1);
    expect(futureDatedBadges[0]?.textContent).toMatch(/future-dated/i);

    const flaggedRows = container.querySelectorAll('[data-future-dated="true"]');
    expect(flaggedRows).toHaveLength(1);
    expect(flaggedRows[0]?.getAttribute('aria-label')).toMatch(/future-dated/i);
    expect(flaggedRows[0]?.getAttribute('aria-label')).toMatch(/excluded from current nav/i);

    // Past row must NOT carry the affordance.
    const pastRow = container.querySelector('[data-row-index="1"]');
    expect(pastRow?.getAttribute('data-future-dated')).toBeNull();
  });

  it('does not flag a mark whose asOfDate equals the page as-of date', () => {
    const { container } = render(
      <ValuationMarksTable rows={[makeRow({ asOfDate: PAGE_AS_OF })]} asOfDate={PAGE_AS_OF} />
    );

    expect(container.querySelectorAll('[data-future-dated="true"]')).toHaveLength(0);
    expect(screen.queryByTestId('future-dated-badge')).toBeNull();
  });

  it('source-discipline: component does not perform arithmetic on row.fairValue', () => {
    const sourcePath = resolve(
      __dirname,
      '../../../../client/src/components/lp-reporting/ValuationMarksTable.tsx'
    );
    const source = readFileSync(sourcePath, 'utf8');

    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n');

    expect(code).not.toMatch(/Number\(\s*row\.fairValue/);
    expect(code).not.toMatch(/parseFloat\(/);
    expect(code).not.toMatch(/parseInt\(\s*row\.fairValue/);
    expect(code).not.toMatch(/row\.fairValue\s*[+\-*/]/);
    expect(code).not.toMatch(/[+\-*/]\s*row\.fairValue/);
  });
});
