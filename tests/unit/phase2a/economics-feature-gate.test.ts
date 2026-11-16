import { afterEach, describe, expect, it } from 'vitest';
import { omitEconomicsAssumptionsWhenDisabled } from '../../../server/services/economics-feature-gate';

describe('economics feature gate', () => {
  afterEach(() => {
    delete process.env['ENABLE_GP_ECONOMICS_ENGINE'];
  });

  it('preserves absent legacy economics semantics when the engine flag is disabled', () => {
    const config = {
      fundName: 'Flagged Fund',
      fundSize: 100_000_000,
    };

    const gated = omitEconomicsAssumptionsWhenDisabled(config);

    expect(gated).toBe(config);
  });

  it('retains complete capital source semantics while annual economics are disabled', () => {
    const config = {
      fundName: 'Policy Fund',
      fundSize: 20_000_000,
      economicsAssumptions: {
        version: 'v1',
        timeline: { fundLifeYears: 10, period: 'annual' },
        feeModel: {
          source: 'legacy_fee_profiles',
          defaultRate: 0.02,
          defaultBasis: 'committed_capital',
          gpCommitmentExempt: true,
        },
        expenseModel: {
          source: 'legacy_fund_expenses',
          horizonMonths: 150,
          annualExpenses: [
            { id: 'admin', category: 'administration', amount: 75_000, startYear: 1 },
          ],
        },
        gpCommitmentModel: {
          commitmentAmount: 400_000,
          participatesInInvestmentReturns: true,
          callSchedule: [1],
        },
      },
    };

    expect(omitEconomicsAssumptionsWhenDisabled(config)).toBe(config);
  });

  it('preserves economics assumptions when the engine flag is enabled', () => {
    process.env['ENABLE_GP_ECONOMICS_ENGINE'] = 'true';
    const config = {
      fundName: 'Flagged Fund',
      fundSize: 100_000_000,
      economicsAssumptions: { version: 'v1' },
    };

    const gated = omitEconomicsAssumptionsWhenDisabled(config);

    expect(gated).toBe(config);
  });
});
