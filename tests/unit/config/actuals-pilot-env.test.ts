import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  readActualsPilotFundId,
  readActualsPilotPublishFundId,
} from '../../../server/config/actuals-pilot-env';

const originalPilotFundId = process.env['ACTUALS_PILOT_FUND_ID'];

afterEach(() => {
  vi.unstubAllEnvs();
  if (originalPilotFundId === undefined) {
    delete process.env['ACTUALS_PILOT_FUND_ID'];
  } else {
    process.env['ACTUALS_PILOT_FUND_ID'] = originalPilotFundId;
  }
});

describe('readActualsPilotPublishFundId', () => {
  it.each([undefined, '', 'false'])(
    'keeps publication disabled for %s while retaining the pilot',
    (value) => {
      vi.stubEnv('ACTUALS_PILOT_FUND_ID', '7');
      vi.stubEnv('ACTUALS_PILOT_PUBLISH_ENABLED', value);
      expect(readActualsPilotPublishFundId()).toBeNull();
      expect(readActualsPilotFundId()).toBe(7);
    }
  );

  it('enables only the explicitly configured fund and reads changes each time', () => {
    vi.stubEnv('ACTUALS_PILOT_FUND_ID', '7');
    vi.stubEnv('ACTUALS_PILOT_PUBLISH_ENABLED', 'true');
    expect(readActualsPilotPublishFundId()).toBe(7);
    vi.stubEnv('ACTUALS_PILOT_PUBLISH_ENABLED', 'false');
    expect(readActualsPilotPublishFundId()).toBeNull();
  });

  it.each(['TRUE', '1', 'yes', ' true ', 'FALSE'])('rejects noncanonical setting %s', (value) => {
    vi.stubEnv('ACTUALS_PILOT_FUND_ID', '7');
    vi.stubEnv('ACTUALS_PILOT_PUBLISH_ENABLED', value);
    expect(readActualsPilotPublishFundId).toThrow('ACTUALS_PILOT_PUBLISH_ENABLED');
  });

  it.each([undefined, ''])('rejects enablement without a selected fund (%s)', (value) => {
    vi.stubEnv('ACTUALS_PILOT_FUND_ID', value);
    vi.stubEnv('ACTUALS_PILOT_PUBLISH_ENABLED', 'true');
    expect(readActualsPilotPublishFundId).toThrow('ACTUALS_PILOT_FUND_ID');
  });
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
