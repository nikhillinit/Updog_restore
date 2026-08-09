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
import {
  acquireScenarioCalculationRunWithCreation,
  bindQueuedScenarioCalculationRunJobId,
  markQueuedScenarioCalculationRunEnqueueFailed,
} from './fund-scenario-calculation-run-service.js';

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
  const identityKey = [
    JOB_ID_PREFIX,
    String(input.fundId),
    input.scenarioSetId,
    identity.inputLineage.hashKind,
    identity.inputHash,
  ].join('-');
  const baseRunIdentity = {
    fundId: input.fundId,
    scenarioSetId: input.scenarioSetId,
    sourceConfigId: identity.sourceConfigId,
    sourceConfigVersion: identity.sourceConfigVersion,
    calculationMode: 'async_reserve_allocation' as const,
    overrideType: 'reserve_allocation' as const,
    inputHash: identity.inputHash,
    hashKind: identity.inputLineage.hashKind,
    modelInputsAsOfDate: identity.inputLineage.modelInputsAsOfDate,
    comparisonLineageVersion: identity.inputLineage.comparisonLineageVersion,
    correlationId: input.correlationId,
    jobId: identityKey,
  };
  const acquired = await transaction(async (client) => {
    const result = await acquireScenarioCalculationRunWithCreation(client, baseRunIdentity);
    const jobId = `${identityKey}__run__${result.run.id}`;
    if (result.inserted) {
      const rebound = await bindQueuedScenarioCalculationRunJobId(
        client,
        result.run.id,
        identityKey,
        jobId
      );
      if (rebound !== 1) {
        throw new Error('Scenario calculation run job identity could not be bound');
      }
    }
    return {
      ...result,
      jobId: result.inserted ? jobId : (result.run.jobId ?? jobId),
    };
  });
  const jobId = acquired.jobId;
  const runIdentity = { ...baseRunIdentity, jobId };

  if (acquired.inserted) {
    try {
      const priorJob = await fundScenarioCalcQueue.getJob(jobId);
      if (priorJob && (await priorJob.isFailed())) {
        await priorJob.remove();
      }
    } catch {
      // Timeout cleanup is best effort; the run row remains authoritative.
    }
  }

  let job;
  try {
    job = await fundScenarioCalcQueue.add(
      'async_reserve_allocation',
      {
        fundId: input.fundId,
        scenarioSetId: input.scenarioSetId,
        correlationId: input.correlationId,
        calculationMode: 'async_reserve_allocation',
        actor: normalizeActor(input.actor),
        inputHash: identity.inputHash,
        runId: acquired.run.id,
      },
      {
        jobId,
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
  } catch (error) {
    if (acquired.inserted) {
      await transaction((client) =>
        markQueuedScenarioCalculationRunEnqueueFailed(client, acquired.run.id, runIdentity)
      );
    }
    throw error;
  }

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
