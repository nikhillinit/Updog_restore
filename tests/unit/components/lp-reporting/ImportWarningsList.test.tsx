/**
 * LP Reporting -- ImportWarningsList tests.
 *
 * Asserts:
 *   - Empty state when warnings AND errors are both empty.
 *   - Each warning renders as an Alert with `data-warning-code`.
 *   - Errors render with the destructive variant.
 *   - Warnings carry severity "warning"; errors carry their declared
 *     severity (e.g. "error").
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ImportWarningsList } from '@/components/lp-reporting/ImportWarningsList';
import type { ImportError, ImportWarning } from '@shared/contracts/lp-reporting';

describe('ImportWarningsList', () => {
  it('renders the empty state when no warnings or errors are supplied', () => {
    render(<ImportWarningsList warnings={[]} />);
    expect(screen.getByTestId('import-warnings-empty')).toBeInTheDocument();
    expect(screen.getByText(/no warnings\./i)).toBeInTheDocument();
  });

  it('renders an Alert per warning with data-warning-code', () => {
    const warnings: ImportWarning[] = [
      {
        row: 2,
        column: 'amount',
        code: 'AMOUNT_PRECISION_TRUNCATED',
        message: 'Amount truncated to 6 decimals.',
      },
      {
        row: 5,
        code: 'FUTURE_DATED_MARK',
        message: 'Mark is future-dated and excluded from current NAV.',
      },
    ];

    render(<ImportWarningsList warnings={warnings} />);

    expect(screen.getByTestId('import-warnings-list')).toBeInTheDocument();
    const codes = Array.from(document.querySelectorAll('[data-warning-code]')).map((el) =>
      el.getAttribute('data-warning-code')
    );
    expect(codes).toContain('AMOUNT_PRECISION_TRUNCATED');
    expect(codes).toContain('FUTURE_DATED_MARK');

    // Each warning carries severity="warning"
    const warningSeverities = Array.from(
      document.querySelectorAll('[data-warning-severity="warning"]')
    );
    expect(warningSeverities).toHaveLength(2);
  });

  it('renders errors with the destructive variant and the declared severity', () => {
    const errors: ImportError[] = [
      {
        row: 3,
        column: 'event_date',
        code: 'INVALID_DATE',
        message: 'Date is not ISO-8601.',
        severity: 'error',
      },
    ];

    render(<ImportWarningsList warnings={[]} errors={errors} />);

    const alert = document.querySelector('[data-warning-code="INVALID_DATE"]');
    expect(alert).not.toBeNull();
    expect(alert?.getAttribute('data-warning-severity')).toBe('error');
    // shadcn Alert applies the destructive variant via className.
    expect(alert?.className).toMatch(/destructive/);
  });

  it('renders both errors and warnings together when both are supplied', () => {
    const warnings: ImportWarning[] = [
      {
        row: 2,
        code: 'AMOUNT_PRECISION_TRUNCATED',
        message: 'truncated',
      },
    ];
    const errors: ImportError[] = [
      {
        row: 3,
        code: 'INVALID_DATE',
        message: 'bad date',
        severity: 'error',
      },
    ];

    render(<ImportWarningsList warnings={warnings} errors={errors} />);

    expect(document.querySelector('[data-warning-code="INVALID_DATE"]')).not.toBeNull();
    expect(
      document.querySelector('[data-warning-code="AMOUNT_PRECISION_TRUNCATED"]')
    ).not.toBeNull();
    expect(screen.queryByTestId('import-warnings-empty')).toBeNull();
  });
});
