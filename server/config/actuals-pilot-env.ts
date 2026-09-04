const POSTGRES_INT_MAX = 2_147_483_647;
const ACTUALS_PILOT_FUND_ID_PATTERN = /^[1-9][0-9]{0,9}$/;

export function readActualsPilotFundId(): number | null {
  const raw = process.env['ACTUALS_PILOT_FUND_ID'];
  if (raw === undefined || raw === '') {
    return null;
  }

  if (!ACTUALS_PILOT_FUND_ID_PATTERN.test(raw)) {
    throw new Error('ACTUALS_PILOT_FUND_ID must be a positive PostgreSQL integer.');
  }

  const fundId = Number(raw);
  if (fundId > POSTGRES_INT_MAX) {
    throw new Error('ACTUALS_PILOT_FUND_ID must be a positive PostgreSQL integer.');
  }

  return fundId;
}
