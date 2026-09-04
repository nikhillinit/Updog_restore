import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildFinancialFactsSnapshot } from '../../../server/services/financial-facts-snapshot-service';
import { createAnalysisCheckpointPorts } from '../../../server/services/internal-analysis/analysis-checkpoint-service';

const originalPilotFundId = process.env['ACTUALS_PILOT_FUND_ID'];

afterEach(() => {
  if (originalPilotFundId === undefined) {
    delete process.env['ACTUALS_PILOT_FUND_ID'];
  } else {
    process.env['ACTUALS_PILOT_FUND_ID'] = originalPilotFundId;
  }
});

function snapshotInput(database: unknown, fundId = 7) {
  return {
    fundId,
    asOfDate: '2026-08-31',
    actorId: 1,
    idempotencyKey: `facts-test-${fundId}`,
    database: database as never,
  };
}

describe('actuals pilot writer fence', () => {
  it('refuses the pilot fund before any database call', async () => {
    process.env['ACTUALS_PILOT_FUND_ID'] = '7';
    const database = {
      select: vi.fn(),
      transaction: vi.fn(),
    };

    await expect(buildFinancialFactsSnapshot(snapshotInput(database))).rejects.toMatchObject({
      status: 409,
      code: 'PILOT_FACTS_WRITER_ONLY',
    });
    expect(database.select).not.toHaveBeenCalled();
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['unset', undefined],
    ['non-pilot fund', '7'],
  ])('preserves builder behavior for %s', async (_label, configuredFundId) => {
    if (configuredFundId === undefined) {
      delete process.env['ACTUALS_PILOT_FUND_ID'];
    } else {
      process.env['ACTUALS_PILOT_FUND_ID'] = configuredFundId;
    }

    const database = {
      transaction: vi.fn().mockRejectedValue(new Error('builder reached database')),
    };

    await expect(buildFinancialFactsSnapshot(snapshotInput(database, 8))).rejects.toThrow(
      'builder reached database'
    );
    expect(database.transaction).toHaveBeenCalledTimes(1);
  });

  it('maps the pilot writer refusal to periodic-analysis policy refusal', async () => {
    process.env['ACTUALS_PILOT_FUND_ID'] = '7';
    const database = { select: vi.fn(), transaction: vi.fn() };
    const ports = createAnalysisCheckpointPorts(database as never);

    await expect(
      ports.rebuildBasis({
        fundId: 7,
        asOfDate: '2026-08-31',
        actorId: null,
        idempotencyKey: 'analysis-pilot-fence',
      })
    ).rejects.toMatchObject({
      status: 422,
      statusCode: 422,
      code: 'UNSUPPORTED_FACTS_POLICY',
    });
    expect(database.select).not.toHaveBeenCalled();
    expect(database.transaction).not.toHaveBeenCalled();
  });
});
