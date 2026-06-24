import { describe, expect, it, vi } from 'vitest';

import { invalidatePortfolioData } from '../../../client/src/lib/invalidate-portfolio-data';

describe('invalidatePortfolioData', () => {
  it('invalidates portfolio-companies, portfolio-overview, and allocations for a fund', () => {
    const invalidateQueries = vi.fn();

    invalidatePortfolioData({ invalidateQueries } as never, 1);

    expect(invalidateQueries).toHaveBeenCalledTimes(3);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['portfolio-companies'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['portfolio-overview', 1] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['allocations', 'latest', 1] });
  });

  it('falls back to broad prefixes when no fundId is provided', () => {
    const invalidateQueries = vi.fn();

    invalidatePortfolioData({ invalidateQueries } as never);

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['portfolio-overview'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['allocations', 'latest'] });
  });
});
