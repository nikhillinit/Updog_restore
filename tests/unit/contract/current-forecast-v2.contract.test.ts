import { describe, expect, it } from 'vitest';

import {
  ENGINE_VERSION,
  METHODOLOGY_VERSION,
  CurrentForecastSeriesPointV1Schema,
  CurrentForecastV2InputSchema,
  CurrentForecastV2Schema,
} from '../../../shared/contracts/current-forecast-v2.contract';

function validCurrentForecast() {
  return {
    contractVersion: 'current-forecast-v2',
    fundId: 7,
    financialFactsSnapshotId: '23',
    currentPlanVersionId: 'plan-version-1',
    asOfDate: '2026-07-21',
    status: 'unavailable',
    series: [
      {
        periodStart: '2026-07-01',
        periodEnd: '2026-09-30',
        source: 'actual',
        deployedUsd: '1000000.000000',
        contributionsUsd: '1250000.000000',
        distributionsUsd: '0.000000',
        navUsd: '1000000.000000',
        tvpi: '0.800000000000',
        dpi: '0.000000000000',
        activeCompanyCount: 1,
        projectedCohortCount: 0,
      },
    ],
    remainingDeployableCapitalUsd: '8000000.000000',
    committedCapitalUsd: '10000000.000000',
    calledToDateUsd: '1250000.000000',
    projectedFeesRemainingUsd: '750000.000000',
    recallableDistributionsUsd: '0.000000',
    uncalledCapitalUsd: '8750000.000000',
    netIrr: null,
    inputHash: 'a'.repeat(64),
    assumptionsHash: 'b'.repeat(64),
    resultHash: null,
    engineVersion: ENGINE_VERSION,
    methodologyVersion: METHODOLOGY_VERSION,
    unavailableReasons: [
      {
        code: 'ASSUMPTION_STAGE_INCOMPLETE',
        detail: 'Exit assumptions are not yet available.',
      },
    ],
    warnings: ['Forecast is unavailable pending complete assumptions.'],
  };
}

describe('CurrentForecastV2 contract', () => {
  it('parses a valid current forecast with a null net IRR', () => {
    const parsed = CurrentForecastV2Schema.parse(validCurrentForecast());

    expect(parsed.netIrr).toBeNull();
  });

  it('rejects unknown keys in each explicitly strict public schema', () => {
    const forecast = validCurrentForecast();

    expect(CurrentForecastV2Schema.safeParse({ ...forecast, unexpected: true }).success).toBe(
      false
    );
    expect(
      CurrentForecastSeriesPointV1Schema.safeParse({
        ...forecast.series[0],
        unexpected: true,
      }).success
    ).toBe(false);
    expect(
      CurrentForecastV2InputSchema.safeParse({
        fundId: 7,
        financialFactsSnapshotId: '23',
        currentPlanVersionId: 'plan-version-1',
        asOfDate: '2026-07-21',
        knowledgeCutoff: '2026-07-22T05:07:50.303Z',
        clock: '2026-07-22T05:07:50.303Z',
        unexpected: true,
      }).success
    ).toBe(false);
  });

  it('enforces six-place money and twelve-place ratio strings', () => {
    const invalidMoney = validCurrentForecast();
    invalidMoney.series[0]!.navUsd = '1000000.00';
    const invalidRatio = validCurrentForecast();
    invalidRatio.series[0]!.tvpi = '0.800000';

    expect(CurrentForecastV2Schema.safeParse(invalidMoney).success).toBe(false);
    expect(CurrentForecastV2Schema.safeParse(invalidRatio).success).toBe(false);
  });

  it('accepts a lowercase 64-hex assumptions hash and rejects a non-hex hash', () => {
    expect(CurrentForecastV2Schema.safeParse(validCurrentForecast()).success).toBe(true);

    const invalid = validCurrentForecast();
    invalid.assumptionsHash = 'not-a-sha256';
    expect(CurrentForecastV2Schema.safeParse(invalid).success).toBe(false);
  });

  it('rejects unavailable reasons outside the typed reason set', () => {
    const invalid = validCurrentForecast();
    invalid.unavailableReasons[0]!.code = 'UNKNOWN_REASON';

    expect(CurrentForecastV2Schema.safeParse(invalid).success).toBe(false);
  });
});
