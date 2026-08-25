import crypto from 'node:crypto';
import { Queue } from 'bullmq';
import { getQueueConnectionOptions, getQueueRuntimePolicy } from '../config/features';
import {
  registerQueueRuntime,
  unregisterQueueRuntime,
  type RegisteredQueueRuntime,
} from '../queues/registry';
import { transaction } from '../db/pg-circuit.js';
import {
  FundScenarioReserveCalculationQueuedV1Schema,
  type FundScenarioReserveCalculationQueuedV1,
} from '@shared/contracts/fund-scenario-sets-v1.contract';
import {
  getReserveScenarioCalculationIdentity,
  type ReserveScenarioCalculationIdentity,
} from './fund-scenario-reserve-calculation-service.js';
import {
  createHttpError,
  insertScenarioSetEvent,
  normalizeActor,
  type FundScenarioMutationActor,
} from './fund-scenario-set-service.js';
import {
  acquireScenarioCalculationRunWithCreation,
  bindQueuedScenarioCalculationRunJobId,
  type ScenarioCalculationRunRecord,
} from './fund-scenario-calculation-run-service.js';

const QUEUE_NAME = 'fund-scenario-calc';
const JOB_ID_PREFIX = 'reserve-scenario';
let fundScenarioCalcQueue: Queue | null = null;

export function getFundScenarioCalcQueueOrThrow(): Queue {
  const queuePolicy = getQueueRuntimePolicy();
  if (!queuePolicy.enabled) {
    throw createHttpError(503, 'Fund scenario calculation queue is not available', {
      code: 'scenario_calculation_queue_unavailable',
      details: { reason: queuePolicy.reason },
    });
  }

  let connection;
  try {
    connection = getQueueConnectionOptions();
  } catch {
    connection = null;
  }
  if (!connection) {
    throw createHttpError(503, 'Fund scenario calculation queue is not available', {
      code: 'scenario_calculation_queue_unavailable',
      details: { reason: queuePolicy.reason },
    });
  }

  if (fundScenarioCalcQueue === null) {
    const queue = new Queue(QUEUE_NAME, { connection });
    let closed = false;
    const runtime: RegisteredQueueRuntime = {
      getQueue: () => queue,
      isInitialized: () => fundScenarioCalcQueue === queue,
      healthMode: 'producer',
      close: async () => {
        if (closed) return;
        closed = true;
        if (fundScenarioCalcQueue === queue) fundScenarioCalcQueue = null;
        unregisterQueueRuntime('fund-scenario-calc', 'producer', runtime);
        await Promise.allSettled([queue.close()]);
      },
    };
    fundScenarioCalcQueue = queue;
    registerQueueRuntime('fund-scenario-calc', runtime);
  }

  return fundScenarioCalcQueue;
}

export interface ReserveCalculationRunContext {
  identity: ReserveScenarioCalculationIdentity;
  run: ScenarioCalculationRunRecord;
  inserted: boolean;
  jobId: string;
}

/**
 * Deterministic job identity: fund, scenario set, source config id/version,
 * hash kind, input hash, model-inputs date, and comparison lineage version.
 * Null lineage components take fixed tokens so the identity stays stable and
 * unambiguous. The run id is appended by acquireReserveCalculationRun, so a
 * prior failed same-input BullMQ job can never satisfy a newer command's
 * identity -- the new run mints a new job id.
 */
function reserveIdentityKey(identity: ReserveScenarioCalculationIdentity): string {
  return [
    JOB_ID_PREFIX,
    String(identity.fundId),
    identity.scenarioSetId,
    `cfg${identity.sourceConfigId}`,
    `v${identity.sourceConfigVersion}`,
    identity.inputLineage.hashKind,
    identity.inputHash,
    identity.inputLineage.modelInputsAsOfDate ?? 'undated',
    identity.inputLineage.comparisonLineageVersion ?? 'no-lineage',
  ].join('-');
}

/**
 * Find the active run for the resolved input lineage or create one. New runs
 * take the supplied correlation ID; existing runs keep their persisted
 * correlation and job identity, which stay canonical across replays.
 */
export async function acquireReserveCalculationRun(input: {
  identity: ReserveScenarioCalculationIdentity;
  correlationId: string;
}): Promise<ReserveCalculationRunContext> {
  const { identity } = input;
  const identityKey = reserveIdentityKey(identity);
  const baseRunIdentity = {
    fundId: identity.fundId,
    scenarioSetId: identity.scenarioSetId,
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
      return { run: { ...result.run, jobId }, inserted: true, jobId };
    }
    return {
      run: result.run,
      inserted: false,
      jobId: result.run.jobId ?? jobId,
    };
  });

  return { identity, ...acquired };
}

/**
 * Create the deterministic BullMQ job for a queued run when the job is absent
 * or previously failed. Running and completed runs are never requeued. The job
 * payload always carries the persisted run correlation ID.
 */
export async function ensureReserveCalculationJob(params: {
  queue: Queue;
  context: ReserveCalculationRunContext;
  actor: FundScenarioMutationActor;
}): Promise<string> {
  const { queue, context, actor } = params;
  const { run, identity, jobId } = context;

  if (run.status !== 'queued') {
    return jobId;
  }

  const priorJob = await queue.getJob(jobId);
  if (priorJob) {
    if (await priorJob.isFailed()) {
      await priorJob.remove();
    } else {
      return jobId;
    }
  }

  await queue.add(
    'async_reserve_allocation',
    {
      fundId: identity.fundId,
      scenarioSetId: identity.scenarioSetId,
      correlationId: run.correlationId,
      calculationMode: 'async_reserve_allocation',
      actor: normalizeActor(actor),
      inputHash: identity.inputHash,
      runId: run.id,
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

  return jobId;
}

/**
 * Record the calculation_queued event exactly once per run. The run row's
 * queued_event_recorded_at marker and the event insert share one transaction,
 * so retries and additional command keys cannot duplicate the event.
 */
export async function recordReserveCalculationQueuedEventOnce(params: {
  context: ReserveCalculationRunContext;
  actor: FundScenarioMutationActor;
}): Promise<boolean> {
  const { context, actor } = params;
  const { run, identity, jobId } = context;

  return transaction(async (client) => {
    // Acquire a KEY SHARE lock on fund_scenario_sets before touching the run
    // row to ensure a consistent lock-acquisition order with the BullMQ worker.
    // The worker's claimReserveScenarioRun transaction takes a FOR UPDATE lock
    // on fund_scenario_sets first, then updates fund_scenario_calculation_runs.
    // Without this pre-lock the two transactions can deadlock: HTTP holds the
    // run row lock and waits for the FK-check KEY SHARE on fund_scenario_sets,
    // while the worker holds fund_scenario_sets FOR UPDATE and waits for the
    // run row lock.
    await client.query(
      `SELECT 1 FROM fund_scenario_sets WHERE id = $1 AND fund_id = $2 FOR KEY SHARE`,
      [identity.scenarioSetId, identity.fundId]
    );

    const marked = await client.query(
      `UPDATE fund_scenario_calculation_runs
          SET queued_event_recorded_at = clock_timestamp(),
              updated_at = clock_timestamp()
        WHERE id = $1
          AND queued_event_recorded_at IS NULL
        RETURNING id`,
      [run.id]
    );
    if ((marked.rowCount ?? marked.rows.length) !== 1) {
      return false;
    }

    await insertScenarioSetEvent(client, {
      scenarioSetId: identity.scenarioSetId,
      fundId: identity.fundId,
      eventType: 'calculation_queued',
      actor: normalizeActor(actor),
      changeSummary: {
        headline: 'Queued reserve scenario calculation',
        calculation_mode: 'async_reserve_allocation',
        correlation_id: run.correlationId,
        job_id: jobId,
        input_hash: identity.inputHash,
        hash_kind: identity.inputLineage.hashKind,
        source_config_version: identity.sourceConfigVersion,
        variant_count: identity.variantCount,
      },
    });
    return true;
  });
}

export function buildReserveCalculationQueuedResponse(
  context: ReserveCalculationRunContext
): FundScenarioReserveCalculationQueuedV1 {
  return FundScenarioReserveCalculationQueuedV1Schema.parse({
    fundId: context.identity.fundId,
    scenarioSetId: context.identity.scenarioSetId,
    calculationMode: 'async_reserve_allocation',
    status: 'queued',
    jobId: context.jobId,
    correlationId: context.run.correlationId,
  });
}

/**
 * Legacy composition without a durable command receipt. The idempotent HTTP
 * path goes through executeReserveCalculationCommand; this remains for
 * callers that own their own dedup, and shares the exactly-once queued-event
 * marker with the command path.
 */
export async function enqueueReserveScenarioCalculation(input: {
  fundId: number;
  scenarioSetId: string;
  correlationId: string;
  actor: FundScenarioMutationActor;
}): Promise<FundScenarioReserveCalculationQueuedV1> {
  const queue = getFundScenarioCalcQueueOrThrow();
  const identity = await getReserveScenarioCalculationIdentity(input.fundId, input.scenarioSetId);
  const context = await acquireReserveCalculationRun({
    identity,
    correlationId: input.correlationId,
  });
  await ensureReserveCalculationJob({ queue, context, actor: input.actor });
  await recordReserveCalculationQueuedEventOnce({ context, actor: input.actor });
  return buildReserveCalculationQueuedResponse(context);
}

export function mintReserveCalculationCorrelationId(): string {
  return crypto.randomUUID();
}
