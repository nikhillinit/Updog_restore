import { describe, expect, it } from 'vitest';

import { APP_ROUTE_DEFINITIONS, LP_ROUTE_DEFINITIONS } from '@shared/routes/app-route-definitions';
import {
  CORE_LIVE_GOVERNED_PATHS,
  getRouteGovernanceEntry,
} from '@shared/routes/route-governance-registry';

describe('internal economics route governance', () => {
  it('defines the exact protected analysis route before the generic fund results route', () => {
    const paths = APP_ROUTE_DEFINITIONS.map((route) => route.path);
    const economicsIndex = paths.indexOf('/fund-model-results/:fundId/analysis');

    expect(APP_ROUTE_DEFINITIONS[economicsIndex]).toEqual({
      path: '/fund-model-results/:fundId/analysis',
      isProtected: true,
    });
    expect(economicsIndex).toBeLessThan(paths.indexOf('/fund-model-results/:fundId'));
  });

  it('derives protected internal-live governance without expanding core-live paths', () => {
    expect(getRouteGovernanceEntry('/fund-model-results/:fundId/analysis')).toMatchObject({
      exposure: 'internal-live',
      surface: 'app-route',
      isProtected: true,
    });
    expect(CORE_LIVE_GOVERNED_PATHS).not.toContain('/fund-model-results/:fundId/analysis');
  });

  it('leaves reports, internal-analysis, and LP route contracts unchanged', () => {
    const paths = APP_ROUTE_DEFINITIONS.map((route) => route.path);
    expect(paths).toContain('/fund-model-results/:fundId/reports');
    expect(paths).toContain('/fund-model-results/:fundId/internal-analysis');
    expect(LP_ROUTE_DEFINITIONS.map((route) => route.path)).toEqual([
      '/lp/dashboard',
      '/lp/fund-detail/:fundId',
      '/lp/capital-account',
      '/lp/performance',
      '/lp/reports',
      '/lp/settings',
    ]);
  });
});
