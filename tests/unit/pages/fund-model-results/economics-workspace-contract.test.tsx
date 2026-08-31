import { describe, expect, it } from 'vitest';

import {
  deriveReadinessRollup,
  type ReadinessRollupInputs,
} from '@/pages/fund-model-results/readiness-rollup';
import { workspaceNavItems } from '@/pages/fund-model-results/workspace-nav';

const unavailable = { kind: 'error', message: 'Facts unavailable' } as const;

describe('economics workspace navigation and readiness contract', () => {
  it('adds Economics after Reserves among the seven live fund workspace destinations', () => {
    // F_1.9.0 appends the disabled Operations placeholder as the eighth entry.
    expect(workspaceNavItems('42').map(({ key, label, href }) => [key, label, href])).toEqual([
      ['summary', 'Summary', '/fund-model-results/42'],
      ['forecast', 'Forecast', '/financial-modeling?fundId=42'],
      ['portfolio-actuals', 'Portfolio Actuals', '/portfolio?tab=reserve-planning&fundId=42'],
      ['reserves', 'Reserves', '/fund-model-results/42/moic-analysis'],
      ['analysis', 'Economics', '/fund-model-results/42/analysis'],
      ['scenarios', 'Scenarios', '/fund-model-results/42/scenarios'],
      ['reports', 'Reports', '/fund-model-results/42/reports'],
      ['operations', 'Operations', null],
    ]);
  });

  it('disables Economics with the standard visible reason until a fund is resolved', () => {
    expect(workspaceNavItems(null).find((item) => item.key === 'analysis')).toEqual({
      key: 'analysis',
      label: 'Economics',
      href: null,
      disabledReason: 'Select a fund to open this view',
    });
  });

  it('keeps readiness at its existing five rows and excludes Economics', () => {
    const model = deriveReadinessRollup({
      fundId: '42',
      forecast: unavailable,
      portfolioActuals: unavailable,
      reserves: unavailable,
      scenarios: unavailable,
      scenarioSetList: unavailable,
    } satisfies ReadinessRollupInputs);

    expect(model.surfaceCount).toBe(5);
    expect(model.rows.map((row) => row.key)).toEqual([
      'forecast',
      'portfolio-actuals',
      'reserves',
      'scenarios',
      'reports',
    ]);
    expect(model.rows.some((row) => row.key === ('analysis' as never))).toBe(false);
  });
});
