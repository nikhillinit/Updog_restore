import { describe, expect, it } from 'vitest';

import {
  isLivePortfolioCompany,
  normalizePortfolioCompanyStatus,
} from '../../../shared/lib/portfolio-company-status';

describe('portfolio company live-status classifier', () => {
  it.each([
    'exited',
    'exit',
    'realized',
    'realised',
    'written-off',
    'write-off',
    'writtenoff',
    'failed',
    'lost',
    'inactive',
    ' Written Off ',
    'WRITE_OFF',
  ])('classifies %s as non-live', (status) => {
    expect(isLivePortfolioCompany({ status })).toBe(false);
  });

  it.each([null, undefined, 'active', 'growing', 'scaling', 'stealth'])(
    'classifies %s as live',
    (status) => {
      expect(isLivePortfolioCompany({ status })).toBe(true);
    }
  );

  it('normalizes status separators and case', () => {
    expect(normalizePortfolioCompanyStatus('  Written_ OFF ')).toBe('written-off');
  });
});
