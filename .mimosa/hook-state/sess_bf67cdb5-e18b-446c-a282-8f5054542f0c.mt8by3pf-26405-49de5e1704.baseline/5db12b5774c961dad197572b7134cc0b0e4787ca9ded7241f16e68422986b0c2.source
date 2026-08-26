import { describe, expect, it } from 'vitest';

import {
  INTERNAL_ECONOMICS_TERMINAL_RESOLUTION_VERSION,
  POST_TERM_ACTIVITY_MATRIX_V1,
  PersistedTerminalResolutionV1Schema,
  PostTermSourceClassV1Schema,
  TerminalPolicyV1Error,
  assertPersistedTerminalResolutionMatchesPolicyV1,
  hasPositivePostTermDeploymentDeltaV1,
  persistedTerminalResolutionFromPolicyV1,
  resolvePostTermDispositionV1,
  resolveTerminalPeriodEndV1,
  terminalResolutionHashPreimageV1,
  validatePersistedTerminalResolutionV1,
} from '../../../shared/contracts/internal-economics/terminal-policy-v1.contract';

const persisted = (
  terminalPeriodEnd = '2026-03-31',
  terminalResolutionMethodologyVersion: string = INTERNAL_ECONOMICS_TERMINAL_RESOLUTION_VERSION
) => ({
  terminalPeriodEnd,
  terminalResolutionMethodologyVersion,
});

describe('internal economics terminal policy v1 contract', () => {
  it('exports the frozen terminal-resolution methodology version', () => {
    expect(INTERNAL_ECONOMICS_TERMINAL_RESOLUTION_VERSION).toBe(
      'internal-economics-terminal-resolution/1.0.0'
    );
  });

  it('resolves policy-time term inputs without a forecast or cutover dependency', () => {
    expect(
      resolveTerminalPeriodEndV1({
        termStartDate: '2016-02-15',
        fundLifeYears: '10',
      })
    ).toEqual({
      legalTermEndDate: '2026-02-15',
      terminalPeriodEnd: '2026-03-31',
      terminalInstant: '2026-03-31T23:59:59.999Z',
      terminalResolutionMethodologyVersion: 'internal-economics-terminal-resolution/1.0.0',
    });
  });

  it('keeps an exact quarter-end anniversary unchanged', () => {
    expect(
      resolveTerminalPeriodEndV1({
        termStartDate: '2016-03-31',
        fundLifeYears: '10',
      }).terminalPeriodEnd
    ).toBe('2026-03-31');
  });

  it('clamps a leap-day anniversary in a non-leap target year', () => {
    expect(
      resolveTerminalPeriodEndV1({
        termStartDate: '2016-02-29',
        fundLifeYears: '1',
      })
    ).toMatchObject({
      legalTermEndDate: '2017-02-28',
      terminalPeriodEnd: '2017-03-31',
    });
  });

  it('preserves a leap-day anniversary in a leap target year', () => {
    expect(
      resolveTerminalPeriodEndV1({
        termStartDate: '2016-02-29',
        fundLifeYears: '4',
      }).legalTermEndDate
    ).toBe('2020-02-29');
  });

  it.each([
    ['Gregorian 400-year leap rule', '1996-02-29', '4', '2000-03-31', '2000-02-29'],
    ['Gregorian century non-leap rule', '2096-02-29', '4', '2100-03-31', '2100-02-28'],
  ])('uses the %s', (_name, termStartDate, fundLifeYears, terminalPeriodEnd, legalTermEndDate) => {
    expect(
      resolveTerminalPeriodEndV1({
        termStartDate,
        fundLifeYears,
      })
    ).toMatchObject({ terminalPeriodEnd, legalTermEndDate });
  });

  it('accepts exact quarter fractions of a year', () => {
    expect(
      resolveTerminalPeriodEndV1({
        termStartDate: '2016-01-15',
        fundLifeYears: '0.25',
      })
    ).toMatchObject({
      legalTermEndDate: '2016-04-15',
      terminalPeriodEnd: '2016-06-30',
    });
  });

  it.each(['10.1', '0', '-1'])('rejects fund life %s outside the quarterly grid', (value) => {
    expect(() =>
      resolveTerminalPeriodEndV1({
        termStartDate: '2016-01-15',
        fundLifeYears: value,
      })
    ).toThrowError(expect.objectContaining({ code: 'FUND_LIFE_GRID_UNREPRESENTABLE' }));
  });

  it('is invariant to process local timezone', () => {
    const originalTimezone = process.env['TZ'];
    try {
      const results = ['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati'].map((timezone) => {
        process.env['TZ'] = timezone;
        return resolveTerminalPeriodEndV1({
          termStartDate: '2016-02-29',
          fundLifeYears: '10',
        });
      });
      expect(new Set(results.map((result) => JSON.stringify(result)))).toHaveLength(1);
    } finally {
      if (originalTimezone === undefined) {
        delete process.env['TZ'];
      } else {
        process.env['TZ'] = originalTimezone;
      }
    }
  });

  it('projects policy-time resolution to the strict persisted pair', () => {
    const resolution = resolveTerminalPeriodEndV1({
      termStartDate: '2016-02-15',
      fundLifeYears: '10',
    });
    expect(persistedTerminalResolutionFromPolicyV1(resolution)).toEqual(persisted());
    expect(PersistedTerminalResolutionV1Schema.parse(persisted())).toEqual(persisted());
  });

  it('accepts persisted policy fields when they match a fresh policy-time resolution', () => {
    expect(
      assertPersistedTerminalResolutionMatchesPolicyV1({
        termStartDate: '2016-02-15',
        fundLifeYears: '10',
        persisted: persisted(),
      })
    ).toEqual(persisted());
  });

  it('rejects a persisted terminal date that differs from policy-time resolution', () => {
    expect(() =>
      assertPersistedTerminalResolutionMatchesPolicyV1({
        termStartDate: '2016-02-15',
        fundLifeYears: '10',
        persisted: persisted('2026-06-30'),
      })
    ).toThrowError(expect.objectContaining({ code: 'TERMINAL_RESOLUTION_MISMATCH' }));
  });

  it.each([
    [
      'policy readback',
      () =>
        assertPersistedTerminalResolutionMatchesPolicyV1({
          termStartDate: '2016-02-15',
          fundLifeYears: '10',
          persisted: persisted('2026-03-31', 'internal-economics-terminal-resolution/0.9.0'),
        }),
    ],
    [
      'runtime validation',
      () =>
        validatePersistedTerminalResolutionV1({
          persisted: persisted('2026-03-31', 'internal-economics-terminal-resolution/0.9.0'),
          forecastPeriodEnds: ['2026-03-31'],
        }),
    ],
    [
      'hash preimage',
      () =>
        terminalResolutionHashPreimageV1(
          persisted('2026-03-31', 'internal-economics-terminal-resolution/0.9.0')
        ),
    ],
  ])('rejects an unsupported persisted version during %s', (_name, action) => {
    expect(action).toThrowError(
      expect.objectContaining({ code: 'TERMINAL_RESOLUTION_METHODOLOGY_UNSUPPORTED' })
    );
  });

  it('validates runtime inputs from persisted fields without term inputs', () => {
    expect(
      validatePersistedTerminalResolutionV1({
        persisted: persisted(),
        forecastPeriodEnds: ['2025-12-31', '2026-03-31'],
      })
    ).toEqual({
      ...persisted(),
      terminalInstant: '2026-03-31T23:59:59.999Z',
    });
  });

  it('fails short forecasts without interpolation', () => {
    expect(() =>
      validatePersistedTerminalResolutionV1({
        persisted: persisted(),
        forecastPeriodEnds: ['2025-12-31'],
      })
    ).toThrowError(expect.objectContaining({ code: 'FORECAST_HORIZON_SHORT' }));
  });

  it.each([
    ['missing exact point', ['2025-12-31', '2026-06-30']],
    ['duplicate exact point', ['2025-12-31', '2026-03-31', '2026-03-31']],
  ])('rejects a %s as unrepresentable', (_name, forecastPeriodEnds) => {
    expect(() =>
      validatePersistedTerminalResolutionV1({
        persisted: persisted(),
        forecastPeriodEnds,
      })
    ).toThrowError(expect.objectContaining({ code: 'FORECAST_TERMINAL_PERIOD_UNREPRESENTABLE' }));
  });

  it.each(['2026-03-31T23:59:59.999001Z', '2026-04-01T00:00:00.000Z'])(
    'rejects opening cutover %s after canonical terminal instant',
    (openingCutoverInstant) => {
      expect(() =>
        validatePersistedTerminalResolutionV1({
          persisted: persisted(),
          forecastPeriodEnds: ['2026-03-31'],
          openingCutoverInstant,
        })
      ).toThrowError(expect.objectContaining({ code: 'TERMINAL_BEFORE_CUTOVER' }));
    }
  );

  it('accepts opening cutover at canonical terminal instant', () => {
    expect(
      validatePersistedTerminalResolutionV1({
        persisted: persisted(),
        forecastPeriodEnds: ['2026-03-31'],
        openingCutoverInstant: '2026-03-31T23:59:59.999Z',
      }).terminalInstant
    ).toBe('2026-03-31T23:59:59.999Z');
  });

  it('freezes runtime multi-error precedence: cutover before short horizon', () => {
    expect(() =>
      validatePersistedTerminalResolutionV1({
        persisted: persisted(),
        forecastPeriodEnds: [],
        openingCutoverInstant: '2026-04-01T00:00:00.000Z',
      })
    ).toThrowError(expect.objectContaining({ code: 'TERMINAL_BEFORE_CUTOVER' }));
  });

  it('freezes runtime multi-error precedence: short horizon before exact-point shape', () => {
    expect(() =>
      validatePersistedTerminalResolutionV1({
        persisted: persisted(),
        forecastPeriodEnds: ['2025-12-31', '2025-12-31'],
      })
    ).toThrowError(expect.objectContaining({ code: 'FORECAST_HORIZON_SHORT' }));
  });

  it('hashes the exact validated persisted pair without substituting fields', () => {
    const pair = persisted('2026-06-30');
    expect(terminalResolutionHashPreimageV1(pair)).toEqual(pair);
  });

  it('enumerates every frozen post-term source class exactly once', () => {
    expect(Object.keys(POST_TERM_ACTIVITY_MATRIX_V1).sort()).toEqual(
      [...PostTermSourceClassV1Schema.options].sort()
    );
  });

  it.each([
    'lp_capital_call',
    'projected_contributions',
    'portfolio_investment',
    'projected_deployment_delta',
    'actual_fund_expense',
    'actual_lp_distribution',
    'actual_realized_proceeds',
    'actual_recallable_distribution',
    'actual_nav_mark',
    'actual_period_nav',
  ] as const)('rejects post-term %s under both terminal modes', (sourceClass) => {
    for (const terminalMode of ['liquidate_at_horizon', 'hold_unrealized'] as const) {
      expect(
        resolvePostTermDispositionV1({
          sourceClass,
          terminalMode,
          amountUsd: '1.000000',
        })
      ).toEqual({ action: 'reject', reasonCode: 'POST_TERM_ACTIVITY' });
    }
  });

  it.each(['compiled_management_fee', 'compiled_fund_expense'] as const)(
    'gives V1 fee compatibility precedence for post-term %s',
    (sourceClass) => {
      for (const terminalMode of ['liquidate_at_horizon', 'hold_unrealized'] as const) {
        expect(
          resolvePostTermDispositionV1({
            sourceClass,
            terminalMode,
            amountUsd: '1.000000',
          })
        ).toEqual({ action: 'reject', reasonCode: 'FORECAST_FEE_BASIS_INCOMPATIBLE' });
      }
    }
  );

  it.each(['projected_forecast_quarterly_distribution', 'projected_nav'] as const)(
    'excludes post-term %s under both terminal modes',
    (sourceClass) => {
      for (const terminalMode of ['liquidate_at_horizon', 'hold_unrealized'] as const) {
        expect(
          resolvePostTermDispositionV1({ sourceClass, terminalMode, amountUsd: '1.000000' })
        ).toEqual({ action: 'exclude', reasonCode: null });
      }
    }
  );

  it.each(PostTermSourceClassV1Schema.options)(
    'applies exact-zero policy for every %s matrix cell',
    (sourceClass) => {
      for (const terminalMode of ['liquidate_at_horizon', 'hold_unrealized'] as const) {
        const result = resolvePostTermDispositionV1({
          sourceClass,
          terminalMode,
          amountUsd: '0.000000',
        });
        if (POST_TERM_ACTIVITY_MATRIX_V1[sourceClass].zeroAmountIsNoOp) {
          expect(result).toEqual({ action: 'ignore_zero', reasonCode: null });
        } else {
          expect(result).toEqual(POST_TERM_ACTIVITY_MATRIX_V1[sourceClass][terminalMode]);
        }
      }
    }
  );

  it.each(PostTermSourceClassV1Schema.options)(
    'rejects negative source money for %s before matrix disposition',
    (sourceClass) => {
      expect(() =>
        resolvePostTermDispositionV1({
          sourceClass,
          terminalMode: 'liquidate_at_horizon',
          amountUsd: '-0.000001',
        })
      ).toThrowError(expect.objectContaining({ code: 'NEGATIVE_SOURCE_MONEY' }));
    }
  );

  it('detects only positive post-term cumulative deployment delta', () => {
    expect(hasPositivePostTermDeploymentDeltaV1('10.000000', '10.000000')).toBe(false);
    expect(hasPositivePostTermDeploymentDeltaV1('10.000000', '10.000001')).toBe(true);
    expect(() => hasPositivePostTermDeploymentDeltaV1('10.000000', '9.999999')).toThrowError(
      expect.objectContaining({ code: 'FORECAST_DEPLOYMENT_CUMULATIVE_DECREASE' })
    );
  });

  it.each([
    ['negative previous', '-0.000001', '0.000000'],
    ['negative current', '0.000000', '-0.000001'],
    ['both negative and decreasing', '-1.000000', '-2.000000'],
  ])(
    'rejects %s cumulative deployment with negative-money precedence',
    (_name, previous, current) => {
      expect(() => hasPositivePostTermDeploymentDeltaV1(previous, current)).toThrowError(
        expect.objectContaining({ code: 'NEGATIVE_SOURCE_MONEY' })
      );
    }
  );

  it('uses typed terminal policy errors', () => {
    try {
      resolveTerminalPeriodEndV1({
        termStartDate: '2016-02-15',
        fundLifeYears: '10.1',
      });
      throw new Error('Expected terminal resolution to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(TerminalPolicyV1Error);
    }
  });
});
