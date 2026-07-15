import { Queue } from 'bullmq';
import { getQueueConfig, getQueueConnectionOptions } from '../config/features';
import { registerQueueRuntime } from '../queues/registry';
import { transaction } from '../db/pg-circuit.js';
import {
  FundScenarioReserveCalculationQueuedV1Schema,
  type FundScenarioReserveCalculationQueuedV1,
} from '@shared/contracts/fund-scenario-sets-v1.contract';
import { getReserveScenarioCalculationIdentity } from './fund-scenario-reserve-calculation-service.js';
import {
  createHttpError,
  insertScenarioSetEvent,
  normalizeActor,
  type FundScenarioMutationActor,
} from './fund-scenario-set-service.js';

const QUEUE_NAME = 'fund-scenario-calc';
const JOB_ID_PREFIX = 'reserve-scenario';
const queueConfig = getQueueConfig();
const connection = (() => {
  try {
    return getQueueConnectionOptions();
  } catch {
    return null;
  }
})();

const fundScenarioCalcQueue =
  queueConfig.enabled && connection ? new Queue(QUEUE_NAME, { connection }) : null;

if (fundScenarioCalcQueue) {
  registerQueueRuntime('fund-scenario-calc', {
    getQueue: () => fundScenarioCalcQueue,
    isInitialized: () => fundScenarioCalcQueue !== null,
  });
}

export async function enqueueReserveScenarioCalculation(input: {
  fundId: number;
  scenarioSetId: string;
  correlationId: string;
  actor: FundScenarioMutationActor;
}): Promise<FundScenarioReserveCalculationQueuedV1> {
  if (!fundScenarioCalcQueue) {
    throw createHttpError(503, 'Fund scenario calculation queue is not available', {
      code: 'scenario_calculation_queue_unavailable',
      details: { reason: queueConfig.reason },
    });
  }

  const identity = await getReserveScenarioCalculationIdentity(input.fundId, input.scenarioSetId);
  const job = await fundScenarioCalcQueue.add(
    'async_reserve_allocation',
    {
      fundId: input.fundId,
      scenarioSetId: input.scenarioSetId,
      correlationId: input.correlationId,
      calculationMode: 'async_reserve_allocation',
      actor: normalizeActor(input.actor),
      inputHash: identity.inputHash,
    },
    {
      jobId: [
        JOB_ID_PREFIX,
        String(input.fundId),
        input.scenarioSetId,
        identity.inputLineage.hashKind,
        identity.inputHash,
      ].join('-'),
      attempts: 2,
      backoff: {
        type: 'exponential',
        delay: 2_000,
      },
      removeOnComplete: {
        age: 3600,
        count: 100,
      },
      removeOnFail: {
        age: 86400,
      },
    }
  );

  await transaction(async (client) => {
    await insertScenarioSetEvent(client, {
      scenarioSetId: input.scenarioSetId,
      fundId: input.fundId,
      eventType: 'calculation_queued',
      actor: normalizeActor(input.actor),
      changeSummary: {
        headline: 'Queued reserve scenario calculation',
        calculation_mode: 'async_reserve_allocation',
        correlation_id: input.correlationId,
        job_id: String(job.id),
        input_hash: identity.inputHash,
        hash_kind: identity.inputLineage.hashKind,
        source_config_version: identity.sourceConfigVersion,
        variant_count: identity.variantCount,
      },
    });
  });

  return FundScenarioReserveCalculationQueuedV1Schema.parse({
    fundId: input.fundId,
    scenarioSetId: input.scenarioSetId,
    calculationMode: 'async_reserve_allocation',
    status: 'queued',
    jobId: String(job.id),
    correlationId: input.correlationId,
  });
}
