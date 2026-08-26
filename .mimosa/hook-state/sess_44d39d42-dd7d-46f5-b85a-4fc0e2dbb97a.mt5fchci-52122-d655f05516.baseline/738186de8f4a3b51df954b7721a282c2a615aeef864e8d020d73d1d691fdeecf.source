import { afterEach, describe, expect, it } from 'vitest';
import { omitEconomicsAssumptionsWhenDisabled } from '../../../server/services/economics-feature-gate';

describe('economics feature gate', () => {
  afterEach(() => {
    delete process.env['ENABLE_GP_ECONOMICS_ENGINE'];
  });

  it('strips economics assumptions when the engine flag is disabled', () => {
    const config = {
      fundName: 'Flagged Fund',
      fundSize: 100_000_000,
      economicsAssumptions: { version: 'v1' },
    };

    const gated = omitEconomicsAssumptionsWhenDisabled(config);

    expect(gated).toEqual({
      fundName: 'Flagged Fund',
      fundSize: 100_000_000,
    });
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
