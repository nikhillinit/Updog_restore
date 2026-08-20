import { QueueEvents } from 'bullmq';
import { getQueueConnectionOptions, type QueueConnectionOptions } from '../server/config/features';
import { attachQueueErrorLogging } from './queue-error-logging';
import type { handleFundScenarioCalcJob } from './fund-scenario-calc-handler';
import {
  FUND_SCENARIO_CALC_QUEUE_CONNECTION_ERROR,
  FUND_SCENARIO_CALC_QUEUE_NAME,
  startFundScenarioCalcWorker,
} from './fund-scenario-calc-worker';

interface InProcessFundScenarioCalcWorkerHarnessOptions {
  connection?: QueueConnectionOptions;
  concurrency?: number;
  /**
   * Harness-local calculation handler injection; deadline-sweep jobs bypass
   * it inside the worker processor. Production never supplies this.
   */
  calculationHandler?: typeof handleFundScenarioCalcJob;
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
    ...(options.calculationHandler !== undefined
      ? { calculationHandler: options.calculationHandler }
      : {}),
    healthPort: null,
  });
  await workerRuntime.ready;
  const queueEvents = new QueueEvents(FUND_SCENARIO_CALC_QUEUE_NAME, { connection });
  attachQueueErrorLogging(queueEvents, 'fund-scenario-calc queue events');
  await queueEvents.waitUntilReady();

  return {
    queueEvents,
    close: async () => {
      await workerRuntime.close();
      await queueEvents.close();
    },
  };
}
