import { describe, expect, it } from 'vitest';
import { buildDealsUrl } from '@/pages/pipeline';

describe('buildDealsUrl', () => {
  it('scopes deal list requests to the active fund when available', () => {
    const url = buildDealsUrl({
      fundId: 7,
      search: 'ai',
      status: 'qualified',
      priority: 'high',
      sortBy: 'createdAt',
      sortDir: 'desc',
      limit: 100,
    });

    const parsed = new URL(url, window.location.origin);

    expect(parsed.pathname).toBe('/api/deals/opportunities');
    expect(parsed.searchParams.get('fundId')).toBe('7');
    expect(parsed.searchParams.get('search')).toBe('ai');
    expect(parsed.searchParams.get('status')).toBe('qualified');
    expect(parsed.searchParams.get('priority')).toBe('high');
    expect(parsed.searchParams.get('sortBy')).toBe('createdAt');
    expect(parsed.searchParams.get('sortDir')).toBe('desc');
    expect(parsed.searchParams.get('limit')).toBe('100');
  });

  it('omits fundId for unscoped compatibility calls', () => {
    const url = buildDealsUrl({ fundId: null, limit: 100 });
    const parsed = new URL(url, window.location.origin);

    expect(parsed.searchParams.has('fundId')).toBe(false);
    expect(parsed.searchParams.get('limit')).toBe('100');
  });
});
