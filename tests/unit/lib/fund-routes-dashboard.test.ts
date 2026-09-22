import { describe, expect, it } from 'vitest';
import {
  buildDashboardHref,
  extractRouteScopedFundId,
  parseFundIdParam,
  resolveDashboardView,
} from '@/lib/fund-routes';

describe('parseFundIdParam', () => {
  it.each([
    ['', { kind: 'absent' }],
    ['tab=overview', { kind: 'absent' }],
    ['fundId=12', { kind: 'valid', id: 12 }],
    ['?fundId=12', { kind: 'valid', id: 12 }],
    ['fundId=0', { kind: 'invalid' }],
    ['fundId=-3', { kind: 'invalid' }],
    ['fundId=1.5', { kind: 'invalid' }],
    ['fundId=abc', { kind: 'invalid' }],
    ['fundId=', { kind: 'invalid' }],
    ['fundId=1&fundId=2', { kind: 'invalid' }],
  ])('parses %j', (search, expected) => {
    expect(parseFundIdParam(search)).toEqual(expected);
  });
});

describe('resolveDashboardView', () => {
  it('returns null off /dashboard', () => {
    expect(resolveDashboardView('/portfolio', 'tab=overview')).toBeNull();
  });

  it('is the Workspace without a tab', () => {
    expect(resolveDashboardView('/dashboard', 'fundId=4')).toEqual({
      view: 'workspace',
      tab: null,
      fundId: { kind: 'valid', id: 4 },
      normalized: true,
    });
  });

  it.each(['overview', 'performance', 'cashflow'])('is analytics for tab=%s', (tab) => {
    expect(resolveDashboardView('/dashboard', `tab=${tab}`)).toMatchObject({
      view: 'analytics',
      tab,
      normalized: true,
    });
  });

  it('flags unknown or duplicate tabs for normalization', () => {
    expect(resolveDashboardView('/dashboard', 'tab=bogus')).toMatchObject({
      view: 'workspace',
      normalized: false,
    });
    expect(resolveDashboardView('/dashboard', 'tab=overview&tab=cashflow')).toMatchObject({
      view: 'workspace',
      normalized: false,
    });
  });

  it('reads the query from the location when no explicit search is given', () => {
    expect(resolveDashboardView('/dashboard?tab=cashflow&fundId=9')).toMatchObject({
      view: 'analytics',
      tab: 'cashflow',
      fundId: { kind: 'valid', id: 9 },
    });
  });
});

describe('buildDashboardHref', () => {
  it('carries only tab and fundId', () => {
    expect(buildDashboardHref(null, null)).toBe('/dashboard');
    expect(buildDashboardHref('overview', null)).toBe('/dashboard?tab=overview');
    expect(buildDashboardHref(null, 3)).toBe('/dashboard?fundId=3');
    expect(buildDashboardHref('performance', 3)).toBe('/dashboard?tab=performance&fundId=3');
  });
});

describe('/dashboard fund context', () => {
  it('exposes an explicit fundId to the route-scoped context', () => {
    expect(extractRouteScopedFundId('/dashboard', 'fundId=5')).toBe(5);
    expect(extractRouteScopedFundId('/dashboard', 'fundId=x')).toBeNull();
    expect(extractRouteScopedFundId('/dashboard', '')).toBeNull();
  });
});
