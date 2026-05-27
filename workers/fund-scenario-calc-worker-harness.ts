import { QueueEvents } from 'bullmq';
import { getQueueConnectionOptions, type QueueConnectionOptions } from '../server/config/features';
import {
  FUND_SCENARIO_CALC_QUEUE_CONNECTION_ERROR,
  FUND_SCENARIO_CALC_QUEUE_NAME,
  startFundScenarioCalcWorker,
} from './fund-scenario-calc-worker';

interface InProcessFundScenarioCalcWorkerHarnessOptions {
  connection?: QueueConnectionOptions;
  concurrency?: number;
}

export interface InProcessFundScenarioCalcWorkerHarness {
  queueEvents: QueueEvents;
  close: () => Promise<void>;
}

export async function startInProcessFundScenarioCalcWorkerHarness(
  options: InProcessFundScenarioCalcWorkerHarnessOptions = {}
): Promise<InProcessFundScenarioCalcWorkerHarness> {
  const connection = options.connection ?? getQueueConnectionOptions();

  if (!connection) {
    throw new Error(FUND_SCENARIO_CALC_QUEUE_CONNECTION_ERROR);
  }

  const workerRuntime = startFundScenarioCalcWorker({
    connection,
    ...(options.concurrency !== undefined ? { concurrency: options.concurrency } : {}),
    healthPort: null,
  });
  const queueEvents = new QueueEvents(FUND_SCENARIO_CALC_QUEUE_NAME, { connection });
  await queueEvents.waitUntilReady();

  return {
    queueEvents,
    close: async () => {
      await workerRuntime.close();
      await queueEvents.close();
    },
  };
}
