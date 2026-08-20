import { UnrecoverableError, type Job } from 'bullmq';
import { logger } from '../lib/logger';
import { metrics } from '../lib/metrics';
import {
  isScenarioCalculationOwnershipLost,
  runReserveScenarioCalculation,
  type ReserveScenarioAttempt,
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
  runId?: string;
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

type FundScenarioCalcJob = Pick<
  Job<FundScenarioCalcJobData>,
  'id' | 'data' | 'attemptsMade' | 'opts'
>;

function deriveAttempt(job: FundScenarioCalcJob): ReserveScenarioAttempt {
  const attempt: ReserveScenarioAttempt = {
    number: job.attemptsMade + 1,
    limit: job.opts.attempts ?? 1,
  };
  if (
    !Number.isSafeInteger(attempt.number) ||
    !Number.isSafeInteger(attempt.limit) ||
    attempt.number < 1 ||
    attempt.limit < 1 ||
    attempt.number > attempt.limit
  ) {
    throw new Error(
      `Fund scenario delivery attempt identity is invalid: ${attempt.number}/${attempt.limit}`
    );
  }
  return attempt;
}

/**
 * Factory for the fund scenario calculation job handler. Production exports
 * the factory invoked with default real dependencies; test harnesses may
 * inject a calculation runner. The BullMQ delivery is the sole source of the
 * attempt pair; the handler derives and validates it before any execution.
 */
export function createFundScenarioCalcJobHandler(deps?: {
  runCalculation?: typeof runReserveScenarioCalculation;
}): typeof handleFundScenarioCalcJob {
  return async function handleFundScenarioCalcJobWithDeps(
    job: FundScenarioCalcJob,
    _token?: string,
    signal?: AbortSignal
  ) {
    const { fundId, scenarioSetId, correlationId, calculationMode, actor, runId } = job.data;
    const startedAt = process.hrtime.bigint();
    let outcome: 'success' | 'failure' | 'hard_timeout' = 'failure';

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

      const attempt = deriveAttempt(job);
      // Resolve at call time so module-level spies stay observable.
      const runCalculation = deps?.runCalculation ?? runReserveScenarioCalculation;
      const result = await withReserveScenarioMetrics(async () =>
        runCalculation({
          fundId,
          scenarioSetId,
          correlationId,
          actor: actor ?? {},
          jobId: String(job.id),
          runId,
          attempt,
          signal: ownedAbortController.signal,
          abortController: ownedAbortController,
        })
      );
      outcome = 'success';
      return isScenarioCalculationOwnershipLost(result) ? undefined : result;
    } catch (error) {
      const err = error as Error;
      if (isFundScenarioHardTimeoutError(error)) {
        outcome = 'hard_timeout';
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
      metrics.workerJobDuration.observe(
        { worker_type: 'fund-scenario-calc', outcome },
        Number(process.hrtime.bigint() - startedAt) / 1_000_000_000
      );
      signal?.removeEventListener('abort', onBullMqAbort);
    }
  };
}

export const handleFundScenarioCalcJob: (
  job: FundScenarioCalcJob,
  _token?: string,
  signal?: AbortSignal
) => Promise<unknown> = createFundScenarioCalcJobHandler();
