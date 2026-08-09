import { UnrecoverableError, type Job } from 'bullmq';
import { logger } from '../lib/logger';
import { metrics } from '../lib/metrics';
import {
  isScenarioCalculationOwnershipLost,
  runReserveScenarioCalculation,
} from '../server/services/fund-scenario-reserve-calculation-service';
import {
  getFundScenarioHardTimeoutMs,
  isFundScenarioHardTimeoutError,
} from '../server/services/fund-scenario-timeout';

export interface FundScenarioCalcJobData {
  fundId: number;
  scenarioSetId: string;
  correlationId: string;
  calculationMode: string;
  actor: {
    userId: number | null;
    label: string | null;
  } | null;
}

async function withReserveScenarioMetrics<T>(callback: () => Promise<T>): Promise<T> {
  const timer = metrics.engineLatency.startTimer({ engine: 'fund-scenario-reserve' });

  try {
    const result = await callback();
    if (isScenarioCalculationOwnershipLost(result)) {
      return result;
    }

    timer({ status: 'success' });
    return result;
  } catch (error) {
    timer({ status: 'error' });
    metrics.engineErrors.inc({
      engine: 'fund-scenario-reserve',
      error_type: error instanceof Error ? error.constructor.name : 'unknown',
    });
    throw error;
  }
}

export async function handleFundScenarioCalcJob(
  job: Pick<Job<FundScenarioCalcJobData>, 'id' | 'data' | 'remove'>,
  _token?: string,
  signal?: AbortSignal
) {
  const { fundId, scenarioSetId, correlationId, calculationMode, actor } = job.data;

  logger.info('Processing reserve scenario calculation', {
    fundId,
    scenarioSetId,
    correlationId,
    jobId: job.id,
    calculationMode,
  });

  const ownedAbortController = new AbortController();
  const onBullMqAbort = () => {
    ownedAbortController.abort(signal?.reason);
  };
  if (signal?.aborted) {
    onBullMqAbort();
  } else {
    signal?.addEventListener('abort', onBullMqAbort, { once: true });
  }

  try {
    if (calculationMode !== 'async_reserve_allocation') {
      throw new Error(`Unsupported fund scenario calculation mode: ${calculationMode}`);
    }

    const result = await withReserveScenarioMetrics(async () =>
      runReserveScenarioCalculation({
        fundId,
        scenarioSetId,
        correlationId,
        actor: actor ?? {},
        jobId: String(job.id),
        signal: ownedAbortController.signal,
        abortController: ownedAbortController,
        removeJob: () => job.remove(),
      })
    );
    return isScenarioCalculationOwnershipLost(result) ? undefined : result;
  } catch (error) {
    const err = error as Error;
    if (isFundScenarioHardTimeoutError(error)) {
      metrics.fundScenarioHardTimeouts?.inc();
      metrics.fundScenarioHardTimeoutDuration?.observe(getFundScenarioHardTimeoutMs() / 1000);
      throw new UnrecoverableError(err.message);
    }

    logger.error('Reserve scenario calculation failed', err, {
      fundId,
      scenarioSetId,
      correlationId,
      jobId: job.id,
      errorName: err.name,
      errorMessage: err.message,
      errorStack: err.stack,
    });
    const counter = (
      metrics as unknown as {
        counter?: (name: string, value: number, labels: Record<string, string>) => void;
      }
    ).counter;
    counter?.('fund_scenario_reserve_calculation_failed_total', 1, {
      fundId: String(fundId),
      errorType: err.name,
    });
    throw error;
  } finally {
    signal?.removeEventListener('abort', onBullMqAbort);
  }
}
