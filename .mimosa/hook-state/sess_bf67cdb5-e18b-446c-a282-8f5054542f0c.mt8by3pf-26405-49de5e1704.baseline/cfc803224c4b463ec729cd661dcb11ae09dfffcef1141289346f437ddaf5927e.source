import { describe, expect, it } from 'vitest';

import { isExitedStatus } from '../../../shared/lib/company-status';

// Parity reference: the original inline implementation that lived in
// client/src/components/portfolio/tabs/OverviewTab.tsx.
function inlineIsExitedStatus(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return normalized === 'exited' || normalized === 'closed' || normalized === 'liquidated';
}

describe('isExitedStatus', () => {
  const cases = [
    'exited',
    'closed',
    'liquidated',
    'active',
    'Exited',
    'CLOSED',
    'Liquidated',
    '  exited  ',
    'investing',
    '',
  ];

  it('matches the former inline OverviewTab logic for every representative status', () => {
    for (const status of cases) {
      expect(isExitedStatus(status)).toBe(inlineIsExitedStatus(status));
    }
  });

  it('treats exited/closed/liquidated as exited, case-insensitively and trimmed', () => {
    expect(isExitedStatus('exited')).toBe(true);
    expect(isExitedStatus('Closed')).toBe(true);
    expect(isExitedStatus('LIQUIDATED')).toBe(true);
    expect(isExitedStatus('  exited ')).toBe(true);
  });

  it('treats everything else as not exited', () => {
    expect(isExitedStatus('active')).toBe(false);
    expect(isExitedStatus('investing')).toBe(false);
    expect(isExitedStatus('')).toBe(false);
  });
});
