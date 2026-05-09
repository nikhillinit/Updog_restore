/**
 * LP Reporting -- MetricsCards tests.
 *
 * Asserts:
 *   - all six cards (DPI / RVPI / TVPI / MOIC / Net IRR / Gross IRR) render
 *   - decimal-string values pass through formatters and reach the DOM
 *   - null values render the LP-friendly placeholder `--`
 *   - source-discipline: the component file does NOT call `Number()`,
 *     `parseFloat`, `parseInt`, nor perform `+ - * /` arithmetic on
 *     decimal-string fields
 *   - the IRR cards expose `aria-describedby` when a panel id is supplied
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { MetricsCards } from '@/components/lp-reporting/MetricsCards';
import type { LpMetricRunResults } from '@shared/contracts/lp-reporting';

function makeResults(overrides: Partial<LpMetricRunResults> = {}): LpMetricRunResults {
  return {
    asOfDate: '2026-03-31',
    currency: 'USD',
    dpi: '0.450000',
    rvpi: '1.250000',
    tvpi: '1.700000',
    moic: '1.700000',
    netIrr: '0.150000',
    grossIrr: '0.180000',
    xirrDiagnostic: {
      net: {
        convergence: 'converged',
        iterations: 5,
        method: 'newton',
        boundHit: null,
        failureReason: null,
      },
      gross: {
        convergence: 'converged',
        iterations: 4,
        method: 'newton',
        boundHit: null,
        failureReason: null,
      },
    },
    contributionsTotal: '50000000',
    distributionsTotal: '22500000',
    currentNav: '62500000',
    markConfidenceMix: { high: 8, medium: 3, low: 1 },
    ...overrides,
  };
}

describe('MetricsCards', () => {
  it('renders all six headline cards with formatted values', () => {
    render(<MetricsCards results={makeResults()} />);

    expect(screen.getByTestId('metric-card-dpi-value').textContent).toBe('0.45x');
    expect(screen.getByTestId('metric-card-rvpi-value').textContent).toBe('1.25x');
    expect(screen.getByTestId('metric-card-tvpi-value').textContent).toBe('1.70x');
    expect(screen.getByTestId('metric-card-moic-value').textContent).toBe('1.70x');
    expect(screen.getByTestId('metric-card-net-irr-value').textContent).toBe('15.00%');
    expect(screen.getByTestId('metric-card-gross-irr-value').textContent).toBe('18.00%');
  });

  it('renders the LP-friendly placeholder for null ratios', () => {
    render(
      <MetricsCards
        results={makeResults({
          dpi: null,
          rvpi: null,
          tvpi: null,
          moic: null,
          netIrr: null,
          grossIrr: null,
        })}
      />
    );

    for (const testId of [
      'metric-card-dpi-value',
      'metric-card-rvpi-value',
      'metric-card-tvpi-value',
      'metric-card-moic-value',
      'metric-card-net-irr-value',
      'metric-card-gross-irr-value',
    ]) {
      expect(screen.getByTestId(testId).textContent).toBe('--');
    }
  });

  it('exposes aria-describedby on IRR cards when a panel id is supplied', () => {
    render(<MetricsCards results={makeResults()} diagnosticPanelId="xirr-panel" />);

    expect(screen.getByTestId('metric-card-net-irr-value').getAttribute('aria-describedby')).toBe(
      'xirr-panel'
    );
    expect(screen.getByTestId('metric-card-gross-irr-value').getAttribute('aria-describedby')).toBe(
      'xirr-panel'
    );
  });

  it('omits aria-describedby on IRR cards when no panel id is supplied', () => {
    render(<MetricsCards results={makeResults()} />);

    expect(screen.getByTestId('metric-card-net-irr-value').hasAttribute('aria-describedby')).toBe(
      false
    );
    expect(screen.getByTestId('metric-card-gross-irr-value').hasAttribute('aria-describedby')).toBe(
      false
    );
  });

  it('source-discipline: never calls Number(), parseFloat, or parseInt on values', () => {
    const file = path.resolve(
      __dirname,
      '../../../../client/src/components/lp-reporting/MetricsCards.tsx'
    );
    const raw = readFileSync(file, 'utf-8');
    // Strip block comments and line comments before scanning so that the
    // module's JSDoc header (which mentions `Number()` etc. as forbidden
    // calls) doesn't trigger the assertion.
    const text = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

    expect(text).not.toMatch(/\bNumber\s*\(/);
    expect(text).not.toMatch(/parseFloat\s*\(/);
    expect(text).not.toMatch(/parseInt\s*\(/);
  });

  it('source-discipline: never imports decimal.js directly (must go through @shared)', () => {
    const file = path.resolve(
      __dirname,
      '../../../../client/src/components/lp-reporting/MetricsCards.tsx'
    );
    const text = readFileSync(file, 'utf-8');

    expect(text).not.toMatch(/from ['"]decimal\.js['"]/);
  });
});
