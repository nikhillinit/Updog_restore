/**
 * LP Reporting -- XIRR diagnostic formatter tests.
 *
 * Walks every `(convergence, failureReason)` combination from the
 * locked taxonomy and asserts a deterministic tone. The happy path
 * (`converged`) must always return `tone = 'ok'`.
 */

import { describe, expect, it } from 'vitest';

import { formatXirrConvergence } from '@/lib/format/lp-reporting/xirr';
import type { XirrDiagnostic, XirrFailureReason } from '@shared/contracts/lp-reporting';

const FAILURE_REASONS: XirrFailureReason[] = [
  'INSUFFICIENT_CASH_FLOWS',
  'NO_SIGN_CHANGE',
  'MULTIPLE_ROOTS',
  'OUT_OF_BOUNDS_HIGH',
  'OUT_OF_BOUNDS_LOW',
  'NUMERICAL_INSTABILITY',
];

function diag(overrides: Partial<XirrDiagnostic>): XirrDiagnostic {
  return {
    convergence: 'converged',
    iterations: 7,
    method: 'newton',
    boundHit: null,
    failureReason: null,
    ...overrides,
  };
}

describe('formatXirrConvergence', () => {
  it('returns tone=ok for converged solver runs', () => {
    const result = formatXirrConvergence(diag({ convergence: 'converged' }));
    expect(result.tone).toBe('ok');
    expect(result.label).toBe('Converged');
    expect(result.description).toMatch(/iteration/);
  });

  it('uses singular iteration wording when iterations === 1', () => {
    const result = formatXirrConvergence(
      diag({ convergence: 'converged', iterations: 1, method: 'brent' })
    );
    expect(result.description).toContain('1 iteration');
    expect(result.description).not.toContain('iterations');
    expect(result.description).toContain('brent');
  });

  it('returns tone=warn for bounded_high', () => {
    const result = formatXirrConvergence(diag({ convergence: 'bounded_high', boundHit: 'max' }));
    expect(result.tone).toBe('warn');
    expect(result.label).toBe('Bounded high');
    expect(result.description).toMatch(/upper/i);
  });

  it('returns tone=warn for bounded_low', () => {
    const result = formatXirrConvergence(diag({ convergence: 'bounded_low', boundHit: 'min' }));
    expect(result.tone).toBe('warn');
    expect(result.label).toBe('Bounded low');
    expect(result.description).toMatch(/lower/i);
  });

  it.each(FAILURE_REASONS)('returns tone=fail for failed convergence with reason=%s', (reason) => {
    const result = formatXirrConvergence(
      diag({ convergence: 'failed', method: 'none', failureReason: reason })
    );
    expect(result.tone).toBe('fail');
    expect(result.label).toBe('Failed');
    expect(result.description.length).toBeGreaterThan(0);
  });

  it('handles failed convergence with a null failureReason', () => {
    const result = formatXirrConvergence(
      diag({ convergence: 'failed', method: 'none', failureReason: null })
    );
    expect(result.tone).toBe('fail');
    expect(result.description).toMatch(/without a structured failure reason/);
  });

  it('produces distinct descriptions for each failure reason', () => {
    const descriptions = new Set(
      FAILURE_REASONS.map(
        (reason) =>
          formatXirrConvergence(diag({ convergence: 'failed', failureReason: reason })).description
      )
    );

    expect(descriptions.size).toBe(FAILURE_REASONS.length);
  });
});
