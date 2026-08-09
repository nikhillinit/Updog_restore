import { beforeEach, describe, expect, it, vi } from 'vitest';

const { transactionMock } = vi.hoisted(() => ({ transactionMock: vi.fn() }));

vi.mock('../../../server/db/pg-circuit.js', () => ({
  transaction: transactionMock,
}));

import { sweepFundScenarioCalculationRunDeadlines } from '../../../server/services/fund-scenario-calculation-run-service';

describe('fund scenario deadline sweep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FUND_SCENARIO_HARD_TIMEOUT_MS = '30000';
    delete process.env.FUND_SCENARIO_SWEEP_ENABLED;
  });

  it('keeps reconciliation and terminalization disabled by default', async () => {
    await expect(sweepFundScenarioCalculationRunDeadlines()).resolves.toEqual({
      reconciledCount: 0,
      timedOutCount: 0,
    });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('reconciles a null deadline first, then terminalizes it on a later sweep', async () => {
    process.env.FUND_SCENARIO_SWEEP_ENABLED = '1';
    let sweepNumber = 0;
    const queryMock = vi.fn();
    transactionMock.mockImplementation(async (callback: (client: unknown) => unknown) => {
      sweepNumber += 1;
      queryMock.mockReset();
      if (sweepNumber === 1) {
        queryMock
          .mockResolvedValueOnce({ rowCount: 1, rows: [] })
          .mockResolvedValueOnce({ rows: [] });
      } else {
        queryMock
          .mockResolvedValueOnce({ rowCount: 0, rows: [] })
          .mockResolvedValueOnce({ rows: [{ id: 'run-1', job_id: 'job-1' }] })
          .mockResolvedValueOnce({ rowCount: 1, rows: [] });
      }
      return callback({ query: queryMock });
    });

    await expect(sweepFundScenarioCalculationRunDeadlines()).resolves.toEqual({
      reconciledCount: 1,
      timedOutCount: 0,
    });
    await expect(sweepFundScenarioCalculationRunDeadlines()).resolves.toEqual({
      reconciledCount: 0,
      timedOutCount: 1,
    });

    expect(String(queryMock.mock.calls[2]?.[0])).toContain("failure_code = 'HARD_TIMEOUT'");
    expect(queryMock.mock.calls[2]?.[1]).toEqual(['run-1', 'job-1']);
  });
});
