/**
 * LP Reporting -- MarkConfidenceMix tests.
 *
 * Asserts:
 *   - high / medium / low counts render verbatim
 *   - total count is the sum and uses singular when total === 1
 *   - the "Imported marks default to confidence=low" footnote is present
 *   - zero counts still render as "0" rather than the placeholder
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { MarkConfidenceMix } from '@/components/lp-reporting/MarkConfidenceMix';

describe('MarkConfidenceMix', () => {
  it('renders the high / medium / low counts verbatim', () => {
    render(<MarkConfidenceMix mix={{ high: 8, medium: 3, low: 1 }} />);

    expect(screen.getByTestId('confidence-mix-high-count').textContent).toBe('8');
    expect(screen.getByTestId('confidence-mix-medium-count').textContent).toBe('3');
    expect(screen.getByTestId('confidence-mix-low-count').textContent).toBe('1');
  });

  it('renders zeros as 0 (no placeholder substitution)', () => {
    render(<MarkConfidenceMix mix={{ high: 0, medium: 0, low: 0 }} />);

    expect(screen.getByTestId('confidence-mix-high-count').textContent).toBe('0');
    expect(screen.getByTestId('confidence-mix-medium-count').textContent).toBe('0');
    expect(screen.getByTestId('confidence-mix-low-count').textContent).toBe('0');
  });

  it('shows the import-policy footnote', () => {
    render(<MarkConfidenceMix mix={{ high: 1, medium: 0, low: 0 }} />);

    const footnote = screen.getByTestId('confidence-mix-footnote');
    expect(footnote.textContent).toMatch(/imported marks default to confidence=low/i);
  });

  it('uses the singular form when total mark count is 1', () => {
    render(<MarkConfidenceMix mix={{ high: 1, medium: 0, low: 0 }} />);
    expect(screen.getByTestId('confidence-mix-total').textContent).toBe('1 mark');
  });

  it('uses the plural form when total mark count is not 1', () => {
    render(<MarkConfidenceMix mix={{ high: 4, medium: 2, low: 1 }} />);
    expect(screen.getByTestId('confidence-mix-total').textContent).toBe('7 marks');
  });

  it('uses the plural form when total mark count is 0', () => {
    render(<MarkConfidenceMix mix={{ high: 0, medium: 0, low: 0 }} />);
    expect(screen.getByTestId('confidence-mix-total').textContent).toBe('0 marks');
  });
});
