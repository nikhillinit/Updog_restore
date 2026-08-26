/**
 * Construction Forecast - Retroactive Fee Catch-Up Audit
 *
 * Checks that the forecast tells when the fee profile retroactive catch-up
 * changed a management fee amount. This catch-up is not the GP carry catch-up
 * of the distribution waterfall.
 */

import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { ConstructionForecastCalculator } from '../../../server/services/construction-forecast-calculator';
import type { FeeProfile } from '@shared/schemas/fee-profile';

const FUND_SIZE = new Decimal(100_000_000);

function makeProfile(
  enabled: boolean,
  basis: FeeProfile['tiers'][number]['basis'] = 'committed_capital'
): FeeProfile {
  return {
    id: 'late-start',
    name: 'Late start 2%',
    tiers: [
      {
        basis,
        annualRatePercent: new Decimal(0.02),
        startYear: 3,
        endYear: 10,
      },
    ],
    retroactiveFeeCatchUp: { enabled, accrualStartMonth: 0 },
  };
}

describe('ConstructionForecastCalculator - fee audit', () => {
  it('reports the retroactive fee catch-up when it is enabled', () => {
    const forecast = ConstructionForecastCalculator.generateForecast({
      fundSize: FUND_SIZE,
      establishmentDate: '2024-01-01',
      targetTVPI: 2.5,
      feeProfile: makeProfile(true),
    });

    expect(forecast.feeAudit?.retroactiveCatchUp.applied).toBe(true);
    expect(forecast.feeAudit?.retroactiveCatchUp.quarters).toEqual([8]);
    expect(forecast.feeAudit?.retroactiveCatchUp.months).toBe(24);
    expect(forecast.feeAudit?.retroactiveCatchUp.totalFees.toNumber()).toBeCloseTo(
      FUND_SIZE.times(0.02).times(2).toNumber(),
      6
    );
  });

  it('reports no catch-up when the setting is disabled', () => {
    const forecast = ConstructionForecastCalculator.generateForecast({
      fundSize: FUND_SIZE,
      establishmentDate: '2024-01-01',
      targetTVPI: 2.5,
      feeProfile: makeProfile(false),
    });

    expect(forecast.feeAudit?.retroactiveCatchUp.applied).toBe(false);
    expect(forecast.feeAudit?.retroactiveCatchUp.totalFees.toNumber()).toBe(0);
  });

  it('does not report a zero-dollar catch-up as applied', () => {
    const forecast = ConstructionForecastCalculator.generateForecast({
      fundSize: FUND_SIZE,
      establishmentDate: '2024-01-01',
      targetTVPI: 2.5,
      feeProfile: makeProfile(true, 'called_capital_cumulative'),
    });

    expect(forecast.feeAudit?.retroactiveCatchUp.applied).toBe(false);
    expect(forecast.feeAudit?.retroactiveCatchUp.quarters).toEqual([]);
    expect(forecast.feeAudit?.retroactiveCatchUp.months).toBe(0);
    expect(forecast.feeAudit?.retroactiveCatchUp.totalFees.toNumber()).toBe(0);
  });

  it('omits the fee audit when no fee profile is given', () => {
    const forecast = ConstructionForecastCalculator.generateForecast({
      fundSize: FUND_SIZE,
      establishmentDate: '2024-01-01',
      targetTVPI: 2.5,
    });

    expect(forecast.feeAudit).toBeUndefined();
  });
});
