import { afterEach, describe, expect, it } from 'vitest';

import { readActualsPilotFundId } from '../../../server/config/actuals-pilot-env';

const originalPilotFundId = process.env['ACTUALS_PILOT_FUND_ID'];

afterEach(() => {
  if (originalPilotFundId === undefined) {
    delete process.env['ACTUALS_PILOT_FUND_ID'];
  } else {
    process.env['ACTUALS_PILOT_FUND_ID'] = originalPilotFundId;
  }
});

describe('readActualsPilotFundId', () => {
  it('returns null when the variable is absent or empty', () => {
    delete process.env['ACTUALS_PILOT_FUND_ID'];
    expect(readActualsPilotFundId()).toBeNull();

    process.env['ACTUALS_PILOT_FUND_ID'] = '';
    expect(readActualsPilotFundId()).toBeNull();
  });

  it('reads each call and accepts canonical positive PostgreSQL integers', () => {
    process.env['ACTUALS_PILOT_FUND_ID'] = '7';
    expect(readActualsPilotFundId()).toBe(7);

    process.env['ACTUALS_PILOT_FUND_ID'] = '2147483647';
    expect(readActualsPilotFundId()).toBe(2_147_483_647);
  });

  it.each(['01', '0', '1a', 'abc', '2147483648'])('rejects invalid value %s', (value) => {
    process.env['ACTUALS_PILOT_FUND_ID'] = value;

    expect(() => readActualsPilotFundId()).toThrow(
      'ACTUALS_PILOT_FUND_ID must be a positive PostgreSQL integer.'
    );
  });
});
