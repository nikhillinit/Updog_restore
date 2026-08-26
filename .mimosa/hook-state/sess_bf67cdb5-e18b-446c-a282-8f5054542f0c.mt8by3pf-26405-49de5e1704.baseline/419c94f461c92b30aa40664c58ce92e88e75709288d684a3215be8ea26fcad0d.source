/**
 * LP Reporting -- XirrDiagnosticPanel tests.
 *
 * Most critical assertion: the panel NEVER imports the XIRR solver.
 * The panel is a pure presentation layer that surfaces the locked
 * diagnostic shape; if it ever pulls in `shared/lib/finance/xirr` the
 * separation between engine and UI is broken.
 *
 * Table-driven coverage of the XIRR taxonomy:
 *   convergence: converged | bounded_high | bounded_low | failed
 *   failureReason: each of the 6 enum values + null
 *   method: newton | brent | bisection | none
 *   boundHit: min | max | null
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { XirrDiagnosticPanel } from '@/components/lp-reporting/XirrDiagnosticPanel';
import type { XirrDiagnostic, XirrFailureReason } from '@shared/contracts/lp-reporting';

const CONVERGED: XirrDiagnostic = {
  convergence: 'converged',
  iterations: 5,
  method: 'newton',
  boundHit: null,
  failureReason: null,
};

describe('XirrDiagnosticPanel - source discipline', () => {
  it('never imports the XIRR solver', () => {
    const file = path.resolve(
      __dirname,
      '../../../../client/src/components/lp-reporting/XirrDiagnosticPanel.tsx'
    );
    const text = readFileSync(file, 'utf-8');

    expect(text).not.toMatch(/from ['"][^'"]*\/finance\/xirr['"]/);
    expect(text).not.toMatch(/from ['"]@shared\/lib\/finance/);
  });

  it('never imports decimal.js directly (must go through @shared)', () => {
    const file = path.resolve(
      __dirname,
      '../../../../client/src/components/lp-reporting/XirrDiagnosticPanel.tsx'
    );
    const text = readFileSync(file, 'utf-8');

    expect(text).not.toMatch(/from ['"]decimal\.js['"]/);
  });
});

describe('XirrDiagnosticPanel - convergence states', () => {
  it.each([
    [
      'converged',
      { ...CONVERGED, convergence: 'converged' as const, method: 'newton' as const },
      'Converged',
    ],
    [
      'bounded_high',
      {
        convergence: 'bounded_high' as const,
        iterations: 100,
        method: 'bisection' as const,
        boundHit: 'max' as const,
        failureReason: null,
      },
      'Bounded high',
    ],
    [
      'bounded_low',
      {
        convergence: 'bounded_low' as const,
        iterations: 100,
        method: 'bisection' as const,
        boundHit: 'min' as const,
        failureReason: null,
      },
      'Bounded low',
    ],
    [
      'failed',
      {
        convergence: 'failed' as const,
        iterations: 0,
        method: 'none' as const,
        boundHit: null,
        failureReason: 'INSUFFICIENT_CASH_FLOWS' as const,
      },
      'Failed',
    ],
  ])('renders the convergence label for %s', (_name, diagnostic, expectedLabel) => {
    render(<XirrDiagnosticPanel net={diagnostic} gross={CONVERGED} />);
    expect(screen.getByTestId('xirr-net-convergence-badge').textContent).toBe(expectedLabel);
  });
});

describe('XirrDiagnosticPanel - failureReason taxonomy', () => {
  const FAILURE_REASONS: ReadonlyArray<XirrFailureReason> = [
    'INSUFFICIENT_CASH_FLOWS',
    'NO_SIGN_CHANGE',
    'MULTIPLE_ROOTS',
    'OUT_OF_BOUNDS_HIGH',
    'OUT_OF_BOUNDS_LOW',
    'NUMERICAL_INSTABILITY',
  ];

  it.each(FAILURE_REASONS)('surfaces failureReason=%s with code in dataset', (reason) => {
    const diagnostic: XirrDiagnostic = {
      convergence: 'failed',
      iterations: 0,
      method: 'none',
      boundHit: null,
      failureReason: reason,
    };

    render(<XirrDiagnosticPanel net={diagnostic} gross={CONVERGED} />);

    const node = screen.getByTestId('xirr-net-failure-reason');
    expect(node).toBeInTheDocument();
    expect(node.getAttribute('data-failure-code')).toBe(reason);
  });

  it('renders a description distinct from the label for each failure reason', () => {
    const seen = new Set<string>();
    for (const reason of FAILURE_REASONS) {
      const diagnostic: XirrDiagnostic = {
        convergence: 'failed',
        iterations: 0,
        method: 'none',
        boundHit: null,
        failureReason: reason,
      };

      const { unmount } = render(<XirrDiagnosticPanel net={diagnostic} gross={CONVERGED} />);
      const desc = screen.getByTestId('xirr-net-description').textContent ?? '';
      expect(desc.length).toBeGreaterThan(10);
      seen.add(desc);
      unmount();
    }
    // INSUFFICIENT / NO_SIGN_CHANGE / MULTIPLE_ROOTS / OUT_OF_BOUNDS_HIGH /
    // OUT_OF_BOUNDS_LOW / NUMERICAL_INSTABILITY each map to a distinct
    // human-readable description.
    expect(seen.size).toBe(FAILURE_REASONS.length);
  });
});

describe('XirrDiagnosticPanel - boundHit affordance', () => {
  it.each([
    ['max' as const, /upper bound/i, '200'],
    ['min' as const, /lower bound/i, '-0.999999'],
  ])('renders boundHit=%s explicitly', (boundHit, labelRegex, expectedNumber) => {
    const diagnostic: XirrDiagnostic = {
      convergence: boundHit === 'max' ? 'bounded_high' : 'bounded_low',
      iterations: 100,
      method: 'bisection',
      boundHit,
      failureReason: null,
    };

    render(<XirrDiagnosticPanel net={diagnostic} gross={CONVERGED} />);
    const node = screen.getByTestId('xirr-net-bound-hit');
    expect(node.textContent).toMatch(labelRegex);
    expect(node.textContent).toContain(expectedNumber);
  });

  it('omits the bound-hit affordance when boundHit is null', () => {
    render(<XirrDiagnosticPanel net={CONVERGED} gross={CONVERGED} />);
    expect(screen.queryByTestId('xirr-net-bound-hit')).toBeNull();
    expect(screen.queryByTestId('xirr-gross-bound-hit')).toBeNull();
  });
});

describe('XirrDiagnosticPanel - method + iterations', () => {
  it.each(['newton', 'brent', 'bisection', 'none'] as const)('renders method=%s', (method) => {
    const diagnostic: XirrDiagnostic = {
      convergence: method === 'none' ? 'failed' : 'converged',
      iterations: method === 'none' ? 0 : 7,
      method,
      boundHit: null,
      failureReason: method === 'none' ? 'NUMERICAL_INSTABILITY' : null,
    };

    render(<XirrDiagnosticPanel net={diagnostic} gross={CONVERGED} />);
    expect(screen.getByTestId('xirr-net-method').textContent).toBe(method);
  });

  it('renders the iteration count verbatim', () => {
    const diagnostic: XirrDiagnostic = {
      convergence: 'converged',
      iterations: 42,
      method: 'newton',
      boundHit: null,
      failureReason: null,
    };

    render(<XirrDiagnosticPanel net={diagnostic} gross={CONVERGED} />);
    expect(screen.getByTestId('xirr-net-iterations').textContent).toBe('42');
  });
});

describe('XirrDiagnosticPanel - layout', () => {
  it('renders both net and gross blocks', () => {
    render(<XirrDiagnosticPanel net={CONVERGED} gross={CONVERGED} />);
    expect(screen.getByTestId('xirr-net')).toBeInTheDocument();
    expect(screen.getByTestId('xirr-gross')).toBeInTheDocument();
  });

  it('threads the optional dom id onto the panel root for aria-describedby', () => {
    const { container } = render(
      <XirrDiagnosticPanel net={CONVERGED} gross={CONVERGED} id="xirr-panel" />
    );
    expect(container.querySelector('#xirr-panel')).not.toBeNull();
  });
});
