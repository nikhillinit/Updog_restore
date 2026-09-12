import { describe, expect, it } from 'vitest';
import { Decimal } from '../../../shared/lib/decimal-config';
import {
  AGGREGATE_PREFERENCE_FORECAST_VERSION,
  AggregatePreferenceInputV1Schema,
  AggregatePreferenceResultV1Schema,
  CapitalPlanningInputV1Schema,
  type AggregatePreferenceInputV1,
} from '../../../shared/contracts/capital-planning-v1.contract';
import {
  calculateAggregatePreferenceForecastV1,
  CapitalPlanningCalculationError,
} from '../../../shared/lib/capital-planning/aggregate-preference-forecast-v1';
import { canonicalJson, sha256CanonicalJson } from '../../../shared/lib/canonical-json';
import { makeCapitalInput } from '../../fixtures/capital-planning/fixtures';
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

  it.each([
    [
      'an ignored amount on an uncapped position',
      {
        preferenceType: 'participating',
        participationCap: { type: 'none', capAmountUsd: usd('6') },
      },
    ],
    [
      'a total-payout cap on a non-participating position',
      {
        preferenceType: 'non_participating',
        participationCap: { type: 'total_payout', capAmountUsd: usd('6') },
      },
    ],
  ] as const)('CP051 rejects %s', (_label, change) => {
    refused({ ...base(), ...change }, 'input.participationCap');
  });

  it.each(
    [
      'fundLiquidationPreferenceUsd',
      'totalPreferencesSeniorUsd',
      'totalPreferencesPariPassuUsd',
      'totalPreferencesJuniorUsd',
    ].flatMap((field) => ['NaN', 'Infinity'].map((value) => [field, value] as const))
  )('CP051 rejects non-finite preference amount %s=%s', (field, value) => {
    refused({ ...base(), [field]: value }, `input.${field}`);
  });

  it.each(['NaN', 'Infinity'])('CP051 rejects non-finite participation cap amount %s', (value) => {
    refused(
      {
        ...base(),
        preferenceType: 'participating',
        participationCap: { type: 'total_payout', capAmountUsd: value },
      },
      'input.participationCap.capAmountUsd'
    );
  });
});

function refused(candidate: unknown, path: string): CapitalPlanningCalculationError {
  try {
    calculateAggregatePreferenceForecastV1(candidate as AggregatePreferenceInputV1, context);
    expect.unreachable('Expected aggregate preference input refusal');
  } catch (error) {
    expect(error).toBeInstanceOf(CapitalPlanningCalculationError);
    if (!(error instanceof CapitalPlanningCalculationError)) throw error;
    expect(error.issues).toContainEqual(expect.objectContaining({ code: 'INVALID_INPUT', path }));
    return error;
  }
}

describe('B3 ownership provenance and override boundaries', () => {
  it('ISSUE-5625294952-F7/PERF-R3-006 treats explicit manual zero as selected ownership', () => {
    const input: AggregatePreferenceInputV1 = {
      ...base(),
      preferenceType: 'participating',
      manualOwnershipOverrideRatio: ratio('0'),
      ownershipOverrideExplanation: 'Explicit zero for the representative case',
    };
    const before = structuredClone(input);
    const result = calculateAggregatePreferenceForecastV1(input, context);
    expect(result).toMatchObject({
      ownershipOrigin: 'manual_override',
      effectiveOwnershipRatio: ratio('0'),
      preferredCandidateUsd: usd('4'),
      conversionCandidateUsd: usd('0'),
      adjustedProceedsUsd: usd('4'),
      noPreferenceBaselineUsd: usd('0'),
      adjustedMoic: { state: 'available', value: ratio('2') },
      baselineMoic: { state: 'available', value: ratio('0') },
    });
    expect(result.input.asConvertedOwnershipRatio).toBe(ratio('0.25'));
    expect(result.input.manualOwnershipOverrideRatio).toBe(ratio('0'));
    expect(input).toEqual(before);
  });

  it.each([
    ['0', '4', '2'],
    ['0.5', '8', '4'],
  ] as const)(
    'ISSUE-5625294952-F7 accepts manual-only ownership %s without adding a base value',
    (ownership, proceeds, moic) => {
      const input: AggregatePreferenceInputV1 = {
        ...base(),
        preferenceType: 'participating',
        manualOwnershipOverrideRatio: ratio(ownership),
      };
      delete input.asConvertedOwnershipRatio;
      const result = calculateAggregatePreferenceForecastV1(input, context);
      expect(result.ownershipOrigin).toBe('manual_override');
      expect(result.effectiveOwnershipRatio).toBe(ratio(ownership));
      expect(result.adjustedProceedsUsd).toBe(usd(proceeds));
      expect(result.adjustedMoic).toEqual({ state: 'available', value: ratio(moic) });
      expect(result.input).not.toHaveProperty('asConvertedOwnershipRatio');
    }
  );

  it('CP-052/PERF-R3-006 removing the ownership override restores the exact base result', () => {
    const input: AggregatePreferenceInputV1 = { ...base(), preferenceType: 'participating' };
    const original = calculateAggregatePreferenceForecastV1(input, context);
    const overridden = calculateAggregatePreferenceForecastV1(
      {
        ...input,
        manualOwnershipOverrideRatio: ratio('0.5'),
        ownershipOverrideExplanation: 'Manual case',
      },
      context
    );
    expect(overridden.adjustedProceedsUsd).toBe(usd('8'));
    expect(overridden.adjustedMoic).toEqual({ state: 'available', value: ratio('4') });
    const removed = structuredClone(overridden.input);
    delete removed.manualOwnershipOverrideRatio;
    delete removed.ownershipOverrideExplanation;
    expect(calculateAggregatePreferenceForecastV1(removed, context)).toEqual(original);
    expect(original.ownershipOrigin).toBe('base');
    expect(original.adjustedProceedsUsd).toBe(usd('6'));
    expect(original.adjustedMoic).toEqual({ state: 'available', value: ratio('3') });
  });

  it('ISSUE-5625294952-F7 refuses missing base and manual ownership at the effective-input path', () => {
    const input = base();
    delete input.asConvertedOwnershipRatio;
    refused(input, 'input.asConvertedOwnershipRatio');
  });

  it.each([undefined, '0', '0.25', '0.5'] as const)(
    'ISSUE-5625294952-F7 rejects forged result ownership origin and effective ratio for override %s',
    (override) => {
      const input = base();
      if (override !== undefined) input.manualOwnershipOverrideRatio = ratio(override);
      const result = calculateAggregatePreferenceForecastV1(input, context);
      expect(AggregatePreferenceResultV1Schema.safeParse(result).success).toBe(true);
      expect(result.ownershipOrigin).toBe(override === undefined ? 'base' : 'manual_override');
      expect(result.effectiveOwnershipRatio).toBe(ratio(override ?? '0.25'));
      for (const [field, value] of [
        ['ownershipOrigin', result.ownershipOrigin === 'base' ? 'manual_override' : 'base'],
        ['effectiveOwnershipRatio', ratio('0.75')],
      ] as const) {
        const parsed = AggregatePreferenceResultV1Schema.safeParse({ ...result, [field]: value });
        expect(parsed.success).toBe(false);
        if (parsed.success) throw new Error('Expected result provenance rejection');
        expect(parsed.error.issues).toContainEqual(
          expect.objectContaining({ code: 'custom', path: [field] })
        );
      }
    }
  );
});

describe('B3 issuer, cost and FMV inputs', () => {
  it.each(['', '   '])('PERF-R3-001 refuses an empty issuer label %j', (issuerLabel) => {
    refused({ ...base(), issuerLabel }, 'input.issuerLabel');
  });

  it('PERF-R3-001/002 retains issuer identity and the exact junior preference label', () => {
    const input = base();
    const original = calculateAggregatePreferenceForecastV1(input, context);
    expect(original.input.issuerLabel).toBe('Synthetic representative issuer');
    expect(original.input.issuerKind).toBe('representative_issuer');
    expect(original.juniorPreferenceLabel).toBe('Preferences Behind Position');
    const named: AggregatePreferenceInputV1 = {
      ...input,
      issuerLabel: 'Synthetic named holding',
      issuerKind: 'named_holding',
    };
    const result = calculateAggregatePreferenceForecastV1(named, context);
    expect(result.input.issuerLabel).toBe('Synthetic named holding');
    expect(result.input.issuerKind).toBe('named_holding');
    expect(result.adjustedProceedsUsd).toBe(original.adjustedProceedsUsd);
    expect(sha256CanonicalJson(named)).not.toBe(sha256CanonicalJson(input));
  });

  it.each([undefined, '-1.000000', 'NaN', 'Infinity'] as const)(
    'PERF-R3-004 refuses missing or unsupported invested cost %s',
    (investedCostUsd) => {
      const input: Record<string, unknown> = { ...base() };
      if (investedCostUsd === undefined) delete input.investedCostUsd;
      else input.investedCostUsd = investedCostUsd;
      refused(input, 'input.investedCostUsd');
    }
  );

  it('PERF-R3-005/007 keeps FMV absence, manual zero and removal separate from financial results', () => {
    const input: AggregatePreferenceInputV1 = { ...base(), preferenceType: 'participating' };
    const absent = calculateAggregatePreferenceForecastV1(input, context);
    expect(absent.effectiveFmv).toBeNull();
    expect(absent.fmvUnavailableReason).toBe('FMV_UNAVAILABLE');
    const sourceFmv = { amountUsd: usd('7'), asOfDate: '2026-08-01', basis: 'derived' as const };
    const source = calculateAggregatePreferenceForecastV1(
      { ...input, positionFmv: sourceFmv },
      context
    );
    const manual = {
      amountUsd: usd('0'),
      asOfDate: '2026-09-01',
      basis: 'manual' as const,
      explanation: 'Explicit manual zero',
    };
    const overridden = calculateAggregatePreferenceForecastV1(
      { ...input, positionFmv: sourceFmv, manualFmvOverride: manual },
      context
    );
    expect(overridden.effectiveFmv).toEqual(manual);
    expect(overridden.fmvUnavailableReason).toBeNull();
    expect(overridden.input.positionFmv).toEqual(sourceFmv);
    for (const field of [
      'preferredCandidateUsd',
      'conversionCandidateUsd',
      'selectedRoute',
      'adjustedProceedsUsd',
      'noPreferenceBaselineUsd',
      'signedPreferenceBenefitUsd',
      'electionUpliftUsd',
      'adjustedMoic',
      'baselineMoic',
      'preferredRouteTrace',
      'conversionRouteTrace',
      'capAttainmentUsd',
      'conversionThresholdUsd',
    ] as const) {
      expect(overridden[field]).toEqual(absent[field]);
      expect(source[field]).toEqual(absent[field]);
    }
    expect(overridden.input.investedCostUsd).toBe(usd('2'));
    const removed = structuredClone(overridden.input);
    delete removed.manualFmvOverride;
    expect(calculateAggregatePreferenceForecastV1(removed, context)).toEqual(source);
    expect(source.effectiveFmv).toEqual({
      amountUsd: usd('7'),
      asOfDate: '2026-08-01',
      basis: 'derived',
    });
    delete removed.positionFmv;
    expect(calculateAggregatePreferenceForecastV1(removed, context)).toEqual(absent);
  });

  it('CP-052/PERF-R3-007 removing a manual FMV99 restores original value, date and basis', () => {
    const input: AggregatePreferenceInputV1 = {
      ...base(),
      preferenceType: 'participating',
      positionFmv: { amountUsd: usd('7'), asOfDate: '2026-08-01', basis: 'direct' },
    };
    const original = calculateAggregatePreferenceForecastV1(input, context);
    const overridden = calculateAggregatePreferenceForecastV1(
      {
        ...input,
        manualFmvOverride: { amountUsd: usd('99'), asOfDate: '2026-09-01', basis: 'manual' },
      },
      context
    );
    expect(overridden.effectiveFmv).toEqual({
      amountUsd: usd('99'),
      asOfDate: '2026-09-01',
      basis: 'manual',
    });
    expect(overridden.input.positionFmv).toEqual(input.positionFmv);
    const restored = structuredClone(overridden.input);
    delete restored.manualFmvOverride;
    expect(calculateAggregatePreferenceForecastV1(restored, context)).toEqual(original);
  });
});

describe('B3 aggregate-only boundary and companion input identity', () => {
  it.each([
    'aggregatePreferenceDeductionUsd',
    'secondaryProceedsUsd',
    'tvpi',
    'followOnMoic',
    'partialSaleRatio',
    'returnFundTargetUsd',
  ])('PERF-R3-008 rejects unconsumed financial scope field %s', (field) => {
    const input = { ...base(), [field]: '1.000000' };
    const parsed = AggregatePreferenceInputV1Schema.safeParse(input);
    expect(parsed.success).toBe(false);
    if (parsed.success) throw new Error('Expected strict financial scope rejection');
    expect(parsed.error.issues).toContainEqual(
      expect.objectContaining({ code: 'unrecognized_keys', keys: [field] })
    );
    expect(refused(input, 'input').issues[0]!.message).toContain(field);
  });

  it.each([
    'secondary',
    'transfer',
    'safe_conversion',
    'note_conversion',
    'warrant_conversion',
    'ownership_only',
    'ambiguous_seniority',
  ])(
    'PERF-R3-003 rejects transaction mapping %s at the pure aggregate-input boundary',
    (transactionType) => {
      const input = { ...base(), transactionType };
      const parsed = AggregatePreferenceInputV1Schema.safeParse(input);
      expect(parsed.success).toBe(false);
      if (parsed.success) throw new Error('Expected unmapped transaction input rejection');
      expect(parsed.error.issues).toContainEqual(
        expect.objectContaining({ code: 'unrecognized_keys', keys: ['transactionType'] })
      );
      refused(input, 'input');
    }
  );

  it('CP-053 changes canonical input identity when the companion is added, changed or removed', () => {
    const scenario = makeCapitalInput();
    scenario.allocations[0]!.plannedCompanyCount = 17;
    const allocationBytes = canonicalJson(scenario.allocations);
    const originalHash = sha256CanonicalJson(scenario);
    const added = { ...scenario, performanceCase: base() };
    const addedHash = sha256CanonicalJson(added);
    expect(CapitalPlanningInputV1Schema.safeParse(added).success).toBe(true);
    expect(addedHash).not.toBe(originalHash);
    const changed = {
      ...added,
      performanceCase: {
        ...added.performanceCase,
        exitEquityValueUsd: '1000000000.000000',
        exitDate: '2026-01-01',
      },
    };
    expect(CapitalPlanningInputV1Schema.safeParse(changed).success).toBe(true);
    expect(sha256CanonicalJson(changed)).not.toBe(addedHash);
    const originalCompanion = calculateAggregatePreferenceForecastV1(
      added.performanceCase,
      context
    );
    const changedCompanion = calculateAggregatePreferenceForecastV1(
      changed.performanceCase,
      context
    );
    expect(changedCompanion.adjustedProceedsUsd).not.toBe(originalCompanion.adjustedProceedsUsd);
    expect(originalCompanion.constructionFunding).toBe('excluded');
    expect(changedCompanion.constructionFunding).toBe('excluded');
    expect(canonicalJson(changed.allocations)).toBe(allocationBytes);
    const removed = structuredClone(changed) as typeof scenario;
    delete removed.performanceCase;
    expect(sha256CanonicalJson(removed)).toBe(originalHash);
    expect(canonicalJson(scenario.allocations)).toBe(allocationBytes);
  });
});
