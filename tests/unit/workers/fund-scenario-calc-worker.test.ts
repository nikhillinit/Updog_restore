import { describe, expect, it, vi } from 'vitest';

const { runReserveScenarioCalculationMock, loggerInfoMock, loggerErrorMock } = vi.hoisted(() => ({
  runReserveScenarioCalculationMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock('../../../server/services/fund-scenario-reserve-calculation-service', () => ({
  runReserveScenarioCalculation: runReserveScenarioCalculationMock,
}));

vi.mock('../../../lib/logger', () => ({
  logger: {
    info: loggerInfoMock,
    error: loggerErrorMock,
  },
}));

vi.mock('../../../lib/metrics', () => ({
  withMetrics: (_name: string, callback: () => unknown) => callback(),
  metrics: {
    counter: vi.fn(),
  },
}));

vi.mock('../../../workers/health-server', () => ({
  registerWorker: vi.fn(),
  createHealthServer: vi.fn(),
}));

vi.mock('bullmq', () => ({
  Worker: class MockWorker {
    close = vi.fn();
  },
}));

import { handleFundScenarioCalcJob } from '../../../workers/fund-scenario-calc-worker';

describe('fund scenario calc worker handler', () => {
  it('dispatches async reserve allocation jobs to the reserve scenario service', async () => {
    runReserveScenarioCalculationMock.mockResolvedValue({ snapshotId: 42 });

    const result = await handleFundScenarioCalcJob({
      id: 'job-1',
      data: {
        fundId: 1,
        scenarioSetId: '00000000-0000-0000-0000-000000000111',
        correlationId: '00000000-0000-0000-0000-000000000123',
        calculationMode: 'async_reserve_allocation',
        actor: { userId: 17, label: 'analyst@example.com' },
      },
    });

    expect(result).toEqual({ snapshotId: 42 });
    expect(runReserveScenarioCalculationMock).toHaveBeenCalledWith({
      fundId: 1,
      scenarioSetId: '00000000-0000-0000-0000-000000000111',
      correlationId: '00000000-0000-0000-0000-000000000123',
      actor: { userId: 17, label: 'analyst@example.com' },
      jobId: 'job-1',
    });
    expect(loggerInfoMock).toHaveBeenCalledWith(
      'Processing reserve scenario calculation',
      expect.objectContaining({ jobId: 'job-1' })
    );
  });

  it('rejects unsupported calculation modes and logs failures', async () => {
    await expect(
      handleFundScenarioCalcJob({
        id: 'job-2',
        data: {
          fundId: 1,
          scenarioSetId: '00000000-0000-0000-0000-000000000111',
          correlationId: '00000000-0000-0000-0000-000000000123',
          calculationMode: 'sync_fee_profile',
          actor: null,
        },
      })
    ).rejects.toThrow(/Unsupported fund scenario calculation mode/);

    expect(loggerErrorMock).toHaveBeenCalledWith(
      'Reserve scenario calculation failed',
      expect.any(Error),
      expect.objectContaining({ jobId: 'job-2' })
    );
  });
});
