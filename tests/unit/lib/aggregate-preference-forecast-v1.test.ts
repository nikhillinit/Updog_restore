import { describe, expect, it } from 'vitest';
import { Decimal } from '../../../shared/lib/decimal-config';
import {
  AGGREGATE_PREFERENCE_FORECAST_VERSION,
  AggregatePreferenceResultV1Schema,
  type AggregatePreferenceInputV1,
} from '../../../shared/contracts/capital-planning-v1.contract';
import {
  calculateAggregatePreferenceForecastV1,
  CapitalPlanningCalculationError,
} from '../../../shared/lib/capital-planning/aggregate-preference-forecast-v1';
import expected from '../../fixtures/capital-planning/expected-values.json';

const usd = (millions: string) => new Decimal(millions).times(1_000_000).toFixed(6);
const ratio = (value: string) => new Decimal(value).toFixed(12);
const context = { vintageYear: 2026, fundLifeYears: 10 };
function base(): AggregatePreferenceInputV1 {
  return {
    methodVersion: AGGREGATE_PREFERENCE_FORECAST_VERSION,
    issuerLabel: 'Synthetic representative issuer',
    issuerKind: 'representative_issuer',
    exitEquityValueUsd: usd('20'),
    exitDate: '2030-12-31',
    asConvertedOwnershipRatio: ratio(expected.preferenceBase.ownership),
    fundLiquidationPreferenceUsd: usd(expected.preferenceBase.fundPreference),
    preferenceType: 'non_participating',
    participationCap: { type: 'none' },
    totalPreferencesSeniorUsd: usd(expected.preferenceBase.senior),
    totalPreferencesPariPassuUsd: usd(expected.preferenceBase.pari),
    totalPreferencesJuniorUsd: usd(expected.preferenceBase.junior),
    investedCostUsd: usd(expected.preferenceBase.cost),
  };
}

describe('aggregate preference forecast financial truth', () => {
  it.each(expected.preferences)(
    '$id preserves both elections and the no-preference baseline',
    (fixture) => {
      const input = {
        ...base(),
        exitEquityValueUsd: usd(fixture.exit),
        preferenceType: fixture.type as AggregatePreferenceInputV1['preferenceType'],
        totalPreferencesSeniorUsd: usd(fixture.senior ?? expected.preferenceBase.senior),
        totalPreferencesPariPassuUsd: usd(fixture.pari ?? expected.preferenceBase.pari),
        fundLiquidationPreferenceUsd: usd(
          fixture.fundPreference ?? expected.preferenceBase.fundPreference
        ),
        asConvertedOwnershipRatio: ratio(fixture.ownership ?? expected.preferenceBase.ownership),
        participationCap: fixture.cap
          ? { type: 'total_payout' as const, capAmountUsd: usd(fixture.cap) }
          : { type: 'none' as const },
      };
      const result = calculateAggregatePreferenceForecastV1(input, context);
      expect(AggregatePreferenceResultV1Schema.safeParse(result).success).toBe(true);
      expect(result.preferredCandidateUsd).toBe(usd(fixture.preferred));
      expect(result.conversionCandidateUsd).toBe(usd(fixture.conversion));
      expect(result.adjustedProceedsUsd).toBe(usd(fixture.adjusted));
      expect(result.noPreferenceBaselineUsd).toBe(usd(fixture.baseline));
      expect(result.signedPreferenceBenefitUsd).toBe(usd(fixture.benefit));
      expect(result.adjustedMoic).toEqual({ state: 'available', value: ratio(fixture.moic) });
      const index = expected.preferences.findIndex((item) => item.id === fixture.id);
      expect(result.selectedRoute).toBe(
        [
          'indifferent',
          'preference',
          'conversion',
          'preference',
          'conversion',
          'preference',
          'preference',
          'conversion',
        ][index]
      );
      expect(result.baselineMoic).toEqual({
        state: 'available',
        value: ratio(['1', '1', '3.5', '2.5', '4.5', '1.375', '0', '2.5'][index]!),
      });
      expect(result.electionUpliftUsd).toBe(
        usd(['0', '3', '0', '3', '0', '3.25', '4', '0'][index]!)
      );
      expect(result.juniorPreferenceLabel).toBe('Preferences Behind Position');
    }
  );

  it('reports exact finite breakpoints, including cap equal to preference and ownership one', () => {
    const nonparticipating = calculateAggregatePreferenceForecastV1(base(), context);
    expect(nonparticipating.conversionThresholdUsd).toEqual({
      state: 'available',
      value: usd('24'),
    });
    for (const [ownership, cap, attainment, conversion] of [
      ['0.25', '6', '20', '32'],
      ['0.25', '4', '10', '24'],
      ['1', '6', '14', '14'],
    ]) {
      const input: AggregatePreferenceInputV1 = {
        ...base(),
        preferenceType: 'participating',
        asConvertedOwnershipRatio: ratio(ownership!),
        participationCap: { type: 'total_payout', capAmountUsd: usd(cap!) },
      };
      const result = calculateAggregatePreferenceForecastV1(input, context);
      expect(result.capAttainmentUsd).toEqual({ state: 'available', value: usd(attainment!) });
      expect(result.conversionThresholdUsd).toEqual({
        state: 'available',
        value: usd(conversion!),
      });
      const above = calculateAggregatePreferenceForecastV1(
        { ...input, exitEquityValueUsd: usd(new Decimal(conversion!).plus('0.000001').toString()) },
        context
      );
      expect(new Decimal(above.conversionCandidateUsd).gt(above.preferredCandidateUsd)).toBe(true);
    }
  });

  it('keeps zero cost, zero ownership and uncapped thresholds explicitly unavailable', () => {
    const zero = calculateAggregatePreferenceForecastV1(
      { ...base(), investedCostUsd: usd('0'), asConvertedOwnershipRatio: ratio('0') },
      context
    );
    expect(zero.adjustedMoic).toEqual({ state: 'unavailable', value: null, reason: 'ZERO_COST' });
    expect(zero.baselineMoic).toEqual({ state: 'unavailable', value: null, reason: 'ZERO_COST' });
    expect(zero.conversionThresholdUsd.state).toBe('unavailable');
    const uncapped = calculateAggregatePreferenceForecastV1(
      { ...base(), preferenceType: 'participating' },
      context
    );
    expect(uncapped.capAttainmentUsd.state).toBe('unavailable');
  });

  it('confines manual FMV to displayed FMV and applies ownership override only to the companion', () => {
    const input: AggregatePreferenceInputV1 = {
      ...base(),
      preferenceType: 'participating',
      positionFmv: { amountUsd: usd('7'), asOfDate: '2026-08-01', basis: 'direct' },
    };
    const original = calculateAggregatePreferenceForecastV1(input, context);
    const fmv = {
      amountUsd: usd('99'),
      asOfDate: '2026-09-01',
      basis: 'manual' as const,
      explanation: 'Synthetic override',
    };
    const changed = calculateAggregatePreferenceForecastV1(
      { ...input, manualFmvOverride: fmv },
      context
    );
    for (const key of [
      'adjustedProceedsUsd',
      'noPreferenceBaselineUsd',
      'signedPreferenceBenefitUsd',
      'adjustedMoic',
      'baselineMoic',
    ] as const) {
      expect(changed[key]).toEqual(original[key]);
    }
    expect(changed.effectiveFmv).toEqual(fmv);
    expect(changed.input.investedCostUsd).toBe(input.investedCostUsd);
    expect(changed.input.positionFmv).toEqual(input.positionFmv);
    const ownership = calculateAggregatePreferenceForecastV1(
      { ...input, manualOwnershipOverrideRatio: ratio('0.5') },
      context
    );
    expect(ownership.effectiveOwnershipRatio).toBe(ratio('0.5'));
    expect(ownership.ownershipOrigin).toBe('manual_override');
    expect(ownership.adjustedProceedsUsd).toBe(usd('8'));
    expect(ownership.adjustedMoic).toEqual({ state: 'available', value: ratio('4') });
    expect(ownership.noPreferenceBaselineUsd).toBe(usd('10'));
    expect(ownership.baselineMoic).toEqual({ state: 'available', value: ratio('5') });
    expect(ownership.signedPreferenceBenefitUsd).toBe(usd('-2'));
    expect(ownership.electionUpliftUsd).toBe(usd('2'));
    expect(calculateAggregatePreferenceForecastV1(input, context)).toEqual(original);
  });

  it('conserves emitted route dollars plus named residual through underfunded and capped cases', () => {
    for (const exit of ['0', '1', '2', '3', '4', '6', '8', '10', '14', '20', '36']) {
      for (const ownership of ['0', '0.25', '1']) {
        for (const senior of ['0', '2', '10']) {
          for (const cap of [null, '4', '6', '12']) {
            const input: AggregatePreferenceInputV1 = {
              ...base(),
              preferenceType: 'participating',
              exitEquityValueUsd: usd(exit),
              asConvertedOwnershipRatio: ratio(ownership),
              totalPreferencesSeniorUsd: usd(senior),
              participationCap: cap
                ? { type: 'total_payout', capAmountUsd: usd(cap) }
                : { type: 'none' },
            };
            const result = calculateAggregatePreferenceForecastV1(input, context);
            expect(AggregatePreferenceResultV1Schema.safeParse(result).success).toBe(true);
            for (const trace of [result.preferredRouteTrace, result.conversionRouteTrace]) {
              const emitted = new Decimal(trace.seniorPaidUsd)
                .plus(trace.fundPaidUsd)
                .plus(trace.otherPariPaidUsd)
                .plus(trace.juniorPaidUsd)
                .plus(trace.otherCommonPaidUsd)
                .plus(trace.signedRoundingResidualUsd);
              expect(emitted.toFixed(6)).toBe(input.exitEquityValueUsd);
              expect(new Decimal(trace.fundPaidUsd).gte(0)).toBe(true);
            }
            expect(new Decimal(result.adjustedProceedsUsd).lte(input.exitEquityValueUsd)).toBe(
              true
            );
          }
        }
      }
    }
  });

  it('honors claim priority in each route, beyond simple conservation', () => {
    const trace = (senior: string, fund: string, pari: string, junior: string, common: string) => ({
      seniorPaidUsd: usd(senior),
      fundPaidUsd: usd(fund),
      otherPariPaidUsd: usd(pari),
      juniorPaidUsd: usd(junior),
      otherCommonPaidUsd: usd(common),
      signedRoundingResidualUsd: usd('0'),
    });
    const pariShortfall = calculateAggregatePreferenceForecastV1(
      { ...base(), exitEquityValueUsd: usd('8') },
      context
    );
    expect(pariShortfall.preferredRouteTrace).toEqual(trace('2', '3', '3', '0', '0'));
    const juniorShortfall = calculateAggregatePreferenceForecastV1(
      {
        ...base(),
        exitEquityValueUsd: usd('11'),
        preferenceType: 'participating',
        participationCap: { type: 'total_payout', capAmountUsd: usd('4') },
      },
      context
    );
    expect(juniorShortfall.preferredRouteTrace).toEqual(trace('2', '4', '4', '1', '0'));
    expect(juniorShortfall.conversionRouteTrace).toEqual(trace('2', '0.75', '4', '2', '2.25'));
  });

  it('evaluates both sides and equality at participating cap and conversion thresholds', () => {
    const input: AggregatePreferenceInputV1 = {
      ...base(),
      preferenceType: 'participating',
      participationCap: { type: 'total_payout', capAmountUsd: usd('6') },
    };
    for (const [exit, preferred, conversion, route] of [
      ['19.999999', '5.99999975', '2.99999975', 'preference'],
      ['20', '6', '3', 'preference'],
      ['20.000001', '6', '3.00000025', 'preference'],
      ['24', '6', '4', 'preference'],
      ['31.999999', '6', '5.99999975', 'preference'],
      ['32', '6', '6', 'indifferent'],
      ['32.000001', '6', '6.00000025', 'conversion'],
      ['36', '6', '7', 'conversion'],
    ]) {
      const result = calculateAggregatePreferenceForecastV1(
        { ...input, exitEquityValueUsd: usd(exit!) },
        context
      );
      expect(result.preferredCandidateUsd).toBe(usd(preferred!));
      expect(result.conversionCandidateUsd).toBe(usd(conversion!));
      expect(result.selectedRoute).toBe(route);
    }
    const equality = calculateAggregatePreferenceForecastV1(
      { ...base(), exitEquityValueUsd: usd('24') },
      context
    );
    expect(equality.preferredCandidateUsd).toBe(usd('4'));
    expect(equality.conversionCandidateUsd).toBe(usd('4'));
    expect(equality.selectedRoute).toBe('indifferent');
  });

  it('defines zero-preference and zero-ownership breakpoints without infinities', () => {
    const available = (value: string) => ({ state: 'available', value: usd(value) });
    const unavailable = (reason: string) => ({ state: 'unavailable', value: null, reason });
    const participating: AggregatePreferenceInputV1 = {
      ...base(),
      preferenceType: 'participating',
    };
    const zeroOwnership = calculateAggregatePreferenceForecastV1(
      {
        ...participating,
        asConvertedOwnershipRatio: ratio('0'),
        participationCap: { type: 'total_payout', capAmountUsd: usd('6') },
      },
      context
    );
    expect(zeroOwnership.capAttainmentUsd).toEqual(unavailable('ZERO_OWNERSHIP'));
    expect(zeroOwnership.conversionThresholdUsd).toEqual(unavailable('ZERO_OWNERSHIP'));
    const zeroCap = calculateAggregatePreferenceForecastV1(
      {
        ...participating,
        fundLiquidationPreferenceUsd: usd('0'),
        participationCap: { type: 'total_payout', capAmountUsd: usd('0') },
      },
      context
    );
    expect(zeroCap.capAttainmentUsd).toEqual(available('0'));
    expect(zeroCap.conversionThresholdUsd).toEqual(available('8'));
    const noPari = calculateAggregatePreferenceForecastV1(
      {
        ...participating,
        fundLiquidationPreferenceUsd: usd('0'),
        totalPreferencesPariPassuUsd: usd('0'),
        participationCap: { type: 'total_payout', capAmountUsd: usd('2') },
      },
      context
    );
    expect(noPari.capAttainmentUsd).toEqual(available('12'));
    expect(noPari.conversionThresholdUsd).toEqual(available('12'));
    expect(noPari.preferredRouteTrace.otherPariPaidUsd).toBe(usd('0'));
    const uncapped = calculateAggregatePreferenceForecastV1(participating, context);
    expect(uncapped.capAttainmentUsd).toEqual(unavailable('UNCAPPED'));
    expect(uncapped.conversionThresholdUsd).toEqual(unavailable('UNCAPPED'));
    const nonparticipating = calculateAggregatePreferenceForecastV1(base(), context);
    expect(nonparticipating.capAttainmentUsd).toEqual(unavailable('NOT_PARTICIPATING'));
  });

  it('CP050 crosses the nonparticipating, cap-equals-preference, and full-ownership breakpoints', () => {
    for (const [cap, ownership, exits] of [
      [
        null,
        '0.25',
        [
          ['23.999999', '4', '3.99999975', 'preference'],
          ['24', '4', '4', 'indifferent'],
          ['24.000001', '4', '4.00000025', 'conversion'],
        ],
      ],
      [
        '4',
        '0.25',
        [
          ['9.999999', '3.9999995', '0.49999975', 'preference'],
          ['10', '4', '0.5', 'preference'],
          ['10.000001', '4', '0.50000025', 'preference'],
          ['23.999999', '4', '3.99999975', 'preference'],
          ['24', '4', '4', 'indifferent'],
          ['24.000001', '4', '4.00000025', 'conversion'],
        ],
      ],
      [
        '6',
        '1',
        [
          ['13.999999', '5.999999', '5.999999', 'indifferent'],
          ['14', '6', '6', 'indifferent'],
          ['14.000001', '6', '6.000001', 'conversion'],
        ],
      ],
    ] as const) {
      for (const [exit, preferred, conversion, selectedRoute] of exits) {
        const result = calculateAggregatePreferenceForecastV1(
          {
            ...base(),
            preferenceType: cap === null ? 'non_participating' : 'participating',
            asConvertedOwnershipRatio: ratio(ownership),
            participationCap:
              cap === null ? { type: 'none' } : { type: 'total_payout', capAmountUsd: usd(cap) },
            exitEquityValueUsd: usd(exit),
          },
          context
        );
        expect(result).toMatchObject({
          preferredCandidateUsd: usd(preferred),
          conversionCandidateUsd: usd(conversion),
          selectedRoute,
        });
      }
    }
  });

  it('CP051 preserves proceeds and nonzero FMV when cost is zero', () => {
    const input: AggregatePreferenceInputV1 = {
      ...base(),
      preferenceType: 'participating',
      investedCostUsd: usd('0'),
      positionFmv: { amountUsd: usd('7'), asOfDate: '2026-08-01', basis: 'direct' },
    };
    const result = calculateAggregatePreferenceForecastV1(input, context);
    expect(result).toMatchObject({
      adjustedProceedsUsd: usd('6'),
      noPreferenceBaselineUsd: usd('5'),
      signedPreferenceBenefitUsd: usd('1'),
      effectiveFmv: input.positionFmv,
      adjustedMoic: { state: 'unavailable', value: null, reason: 'ZERO_COST' },
      baselineMoic: { state: 'unavailable', value: null, reason: 'ZERO_COST' },
    });
    const missing = calculateAggregatePreferenceForecastV1(base(), context);
    expect(missing).toMatchObject({
      effectiveFmv: null,
      fmvUnavailableReason: 'FMV_UNAVAILABLE',
      ownershipOrigin: 'base',
    });
    expect(missing.input).toEqual(base());
  });

  it('CP051 defines zero exit and the attainable preference-only cap at zero ownership', () => {
    const zero = calculateAggregatePreferenceForecastV1(
      { ...base(), exitEquityValueUsd: usd('0'), preferenceType: 'participating' },
      context
    );
    for (const key of [
      'preferredCandidateUsd',
      'conversionCandidateUsd',
      'adjustedProceedsUsd',
      'noPreferenceBaselineUsd',
      'signedPreferenceBenefitUsd',
      'electionUpliftUsd',
    ] as const)
      expect(zero[key]).toBe(usd('0'));
    for (const trace of [zero.preferredRouteTrace, zero.conversionRouteTrace])
      for (const value of Object.values(trace)) expect(value).toBe(usd('0'));
    expect(zero.selectedRoute).toBe('indifferent');
    const cap = calculateAggregatePreferenceForecastV1(
      {
        ...base(),
        preferenceType: 'participating',
        asConvertedOwnershipRatio: ratio('0'),
        participationCap: { type: 'total_payout', capAmountUsd: usd('4') },
      },
      context
    );
    expect(cap.capAttainmentUsd).toEqual({ state: 'available', value: usd('10') });
    expect(cap.conversionThresholdUsd).toEqual({
      state: 'unavailable',
      value: null,
      reason: 'ZERO_OWNERSHIP',
    });
  });

  it('CP051 rejects malformed preference assumptions with typed field issues', () => {
    for (const [change, path] of [
      [{ totalPreferencesSeniorUsd: usd('-1') }, 'input.totalPreferencesSeniorUsd'],
      [{ asConvertedOwnershipRatio: ratio('1.1') }, 'input.asConvertedOwnershipRatio'],
      [
        {
          preferenceType: 'participating',
          participationCap: { type: 'total_payout', capAmountUsd: usd('3') },
        },
        'input.participationCap',
      ],
      [{ exitDate: '2026-02-30' }, 'input.exitDate'],
    ] as const) {
      try {
        calculateAggregatePreferenceForecastV1(
          { ...base(), ...change } as AggregatePreferenceInputV1,
          context
        );
        expect.unreachable('Malformed input must be refused');
      } catch (error) {
        expect(error).toBeInstanceOf(CapitalPlanningCalculationError);
        expect((error as CapitalPlanningCalculationError).issues).toContainEqual(
          expect.objectContaining({ code: 'INVALID_INPUT', path })
        );
      }
    }
  });
});
