import type { Job } from 'bullmq';
import { logger } from '../lib/logger';
import { metrics, withMetrics } from '../lib/metrics';
import { runReserveScenarioCalculation } from '../server/services/fund-scenario-reserve-calculation-service';

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

export async function handleFundScenarioCalcJob(
  job: Pick<Job<FundScenarioCalcJobData>, 'id' | 'data'>
) {
  const { fundId, scenarioSetId, correlationId, calculationMode, actor } = job.data;

  logger.info('Processing reserve scenario calculation', {
    fundId,
    scenarioSetId,
    correlationId,
    jobId: job.id,
    calculationMode,
  });

  try {
    if (calculationMode !== 'async_reserve_allocation') {
      throw new Error(`Unsupported fund scenario calculation mode: ${calculationMode}`);
    }

    return await withMetrics('fund-scenario-reserve', async () =>
      runReserveScenarioCalculation({
        fundId,
        scenarioSetId,
        correlationId,
        actor: actor ?? {},
        jobId: String(job.id),
      })
    );
  } catch (error) {
    const err = error as Error;
    logger.error('Reserve scenario calculation failed', err, {
      fundId,
      scenarioSetId,
      correlationId,
      jobId: job.id,
      errorName: err.name,
      errorMessage: err.message,
      errorStack: err.stack,
    });
    metrics.counter('fund_scenario_reserve_calculation_failed_total', 1, {
      fundId: String(fundId),
      errorType: err.name,
    });
    throw error;
  }
}
