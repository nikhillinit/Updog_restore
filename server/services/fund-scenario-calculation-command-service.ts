import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import { transaction } from '../db/pg-circuit.js';
import { canonicalSha256 } from '../../shared/lib/canonical-hash';
import { z } from 'zod';
import {
  FundScenarioReserveCalculationQueuedV1Schema,
  FundScenarioReserveCalculationRequestV1Schema,
  type FundScenarioReserveCalculationQueuedV1,
} from '@shared/contracts/fund-scenario-sets-v1.contract';

type FundScenarioReserveCalculationRequestV1 = z.infer<
  typeof FundScenarioReserveCalculationRequestV1Schema
>;
import { getReserveScenarioCalculationIdentity } from './fund-scenario-reserve-calculation-service.js';
import { createHttpError, type FundScenarioMutationActor } from './fund-scenario-set-service.js';
import {
  acquireReserveCalculationRun,
  buildReserveCalculationQueuedResponse,
  ensureReserveCalculationJob,
  getFundScenarioCalcQueueOrThrow,
  recordReserveCalculationQueuedEventOnce,
} from './fund-scenario-calc-queue-service.js';

export const FUND_SCENARIO_RESERVE_COMMAND_CONTRACT_VERSION =
  'fund-scenario-reserve-calculation-command-v1';

const COMMAND_FAILURE_CODES = Object.freeze([
  'QUEUE_UNAVAILABLE',
  'QUEUE_ENQUEUE_UNCERTAIN',
  'COMMAND_FAILED',
] as const);
export type ReserveCommandFailureCode = (typeof COMMAND_FAILURE_CODES)[number];

type QueryClient = Pick<PoolClient, 'query'>;

interface CommandRow {
  id: string;
  status: 'pending' | 'completed' | 'failed';
  request_hash: string;
  run_id: string | null;
  correlation_id: string | null;
  response_status: number | null;
  response_body: unknown;
  attempt_count: number;
  lease_token: string | null;
  lease_expires_at: Date | string | null;
  lease_expired: boolean;
  failure_code: string | null;
  version: number;
}

export interface ExecuteReserveCalculationCommandInput {
  fundId: number;
  scenarioSetId: string;
  idempotencyKey: string;
  request: FundScenarioReserveCalculationRequestV1;
  actor: FundScenarioMutationActor;
}

export interface ExecuteReserveCalculationCommandOptions {
  leaseDurationMs?: number;
  receiptPollIntervalMs?: number;
  receiptWaitTimeoutMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  randomUUID?: () => string;
  deps?: {
    transaction?: typeof transaction;
    getQueue?: typeof getFundScenarioCalcQueueOrThrow;
    resolveIdentity?: typeof getReserveScenarioCalculationIdentity;
    acquireRun?: typeof acquireReserveCalculationRun;
    ensureJob?: typeof ensureReserveCalculationJob;
    recordQueuedEventOnce?: typeof recordReserveCalculationQueuedEventOnce;
  };
}

const COMMAND_ROW_COLUMNS = `
  id,
  status,
  request_hash,
  run_id,
  correlation_id,
  response_status,
  response_body,
  attempt_count,
  lease_token,
  lease_expires_at,
  lease_expires_at IS NOT NULL AND lease_expires_at <= clock_timestamp() AS lease_expired,
  failure_code,
  version`;

function keyReusedError() {
  return createHttpError(
    422,
    'Idempotency-Key was reused with a different reserve calculation request',
    { code: 'idempotency_key_reused' }
  );
}

function inProgressError() {
  return createHttpError(409, 'Reserve calculation command is still in progress', {
    code: 'idempotency_request_in_progress',
  });
}

function enqueueUncertainError() {
  return createHttpError(500, 'Reserve calculation enqueue outcome is uncertain; retry with the same Idempotency-Key', {
    code: 'reserve_calculation_enqueue_uncertain',
  });
}

function parseStoredResponse(value: unknown): FundScenarioReserveCalculationQueuedV1 {
  const parsed: unknown = typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
  return FundScenarioReserveCalculationQueuedV1Schema.parse(parsed);
}

function isQueueUnavailableError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'scenario_calculation_queue_unavailable'
  );
}

class QueueInteractionError extends Error {
  constructor(cause: unknown) {
    super('Reserve calculation queue interaction failed', { cause });
    this.name = 'QueueInteractionError';
  }
}

export async function executeReserveCalculationCommand(
  input: ExecuteReserveCalculationCommandInput,
  options: ExecuteReserveCalculationCommandOptions = {}
): Promise<FundScenarioReserveCalculationQueuedV1> {
  const leaseDurationMs = options.leaseDurationMs ?? 30_000;
  const receiptPollIntervalMs = options.receiptPollIntervalMs ?? 100;
  const receiptWaitTimeoutMs = options.receiptWaitTimeoutMs ?? 2_000;
  const now = options.now ?? Date.now;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const mintUuid = options.randomUUID ?? (() => crypto.randomUUID());
  const runTransaction = options.deps?.transaction ?? transaction;
  const getQueue = options.deps?.getQueue ?? getFundScenarioCalcQueueOrThrow;
  const resolveIdentity = options.deps?.resolveIdentity ?? getReserveScenarioCalculationIdentity;
  const acquireRun = options.deps?.acquireRun ?? acquireReserveCalculationRun;
  const ensureJob = options.deps?.ensureJob ?? ensureReserveCalculationJob;
  const recordQueuedEventOnce =
    options.deps?.recordQueuedEventOnce ?? recordReserveCalculationQueuedEventOnce;

  const identity = await resolveIdentity(input.fundId, input.scenarioSetId);
  const requestHash = canonicalSha256({
    contractVersion: FUND_SCENARIO_RESERVE_COMMAND_CONTRACT_VERSION,
    operation: 'calculate-reserve',
    fundId: input.fundId,
    scenarioSetId: input.scenarioSetId,
    request: input.request,
    inputLineage: {
      sourceConfigId: identity.sourceConfigId,
      sourceConfigVersion: identity.sourceConfigVersion,
      hashKind: identity.inputLineage.hashKind,
      inputHash: identity.inputHash,
      modelInputsAsOfDate: identity.inputLineage.modelInputsAsOfDate,
      comparisonLineageVersion: identity.inputLineage.comparisonLineageVersion,
    },
  });

  const query = <T extends object>(text: string, values: unknown[]) =>
    runTransaction((client: QueryClient) => client.query<T>(text, values));

  async function claimPending(leaseToken: string): Promise<CommandRow | null> {
    const inserted = await query<CommandRow>(
      `INSERT INTO fund_scenario_calculation_commands
         (fund_id, scenario_set_id, idempotency_key, request_hash, status,
          attempt_count, lease_token, lease_expires_at,
          created_by_user_id, created_by_label)
       VALUES
         ($1, $2, $3, $4, 'pending',
          1, $5, clock_timestamp() + ($6::bigint * INTERVAL '1 millisecond'),
          $7, $8)
       ON CONFLICT (fund_id, scenario_set_id, idempotency_key) DO NOTHING
       RETURNING ${COMMAND_ROW_COLUMNS}`,
      [
        input.fundId,
        input.scenarioSetId,
        input.idempotencyKey,
        requestHash,
        leaseToken,
        leaseDurationMs,
        input.actor.userId,
        input.actor.label ?? 'unknown-actor',
      ]
    );
    return inserted.rows[0] ?? null;
  }

  async function loadExisting(): Promise<CommandRow | null> {
    const existing = await query<CommandRow>(
      `SELECT ${COMMAND_ROW_COLUMNS}
         FROM fund_scenario_calculation_commands
        WHERE fund_id = $1
          AND scenario_set_id = $2
          AND idempotency_key = $3`,
      [input.fundId, input.scenarioSetId, input.idempotencyKey]
    );
    return existing.rows[0] ?? null;
  }

  async function takeOver(row: CommandRow, leaseToken: string): Promise<CommandRow | null> {
    const reclaimed = await query<CommandRow>(
      `UPDATE fund_scenario_calculation_commands
          SET status = 'pending',
              lease_token = $2,
              lease_expires_at = clock_timestamp() + ($3::bigint * INTERVAL '1 millisecond'),
              attempt_count = attempt_count + 1,
              failure_code = NULL,
              response_status = NULL,
              response_body = NULL,
              version = version + 1,
              updated_at = clock_timestamp()
        WHERE id = $1
          AND version = $4
          AND (
            status = 'failed'
            OR (status = 'pending' AND lease_expires_at <= clock_timestamp())
          )
        RETURNING ${COMMAND_ROW_COLUMNS}`,
      [row.id, leaseToken, leaseDurationMs, row.version]
    );
    return reclaimed.rows[0] ?? null;
  }

  async function bindRunIdentity(
    row: CommandRow,
    leaseToken: string,
    runId: string,
    correlationId: string
  ): Promise<CommandRow> {
    const bound = await query<CommandRow>(
      `UPDATE fund_scenario_calculation_commands
          SET run_id = $3,
              correlation_id = $4,
              version = version + 1,
              updated_at = clock_timestamp()
        WHERE id = $1
          AND lease_token = $2
          AND version = $5
        RETURNING ${COMMAND_ROW_COLUMNS}`,
      [row.id, leaseToken, runId, correlationId, row.version]
    );
    const next = bound.rows[0];
    if (!next) {
      throw inProgressError();
    }
    return next;
  }

  async function finalizeCompleted(
    row: CommandRow,
    leaseToken: string,
    response: FundScenarioReserveCalculationQueuedV1
  ): Promise<void> {
    const finalized = await query<CommandRow>(
      `UPDATE fund_scenario_calculation_commands
          SET status = 'completed',
              response_status = 202,
              response_body = $3::jsonb,
              lease_token = NULL,
              lease_expires_at = NULL,
              version = version + 1,
              updated_at = clock_timestamp()
        WHERE id = $1
          AND lease_token = $2
          AND version = $4
        RETURNING id`,
      [row.id, leaseToken, JSON.stringify(response), row.version]
    );
    if ((finalized.rowCount ?? finalized.rows.length) !== 1) {
      throw inProgressError();
    }
  }

  async function failCommand(
    commandId: string,
    leaseToken: string,
    failureCode: ReserveCommandFailureCode
  ): Promise<void> {
    await query(
      `UPDATE fund_scenario_calculation_commands
          SET status = 'failed',
              failure_code = $3,
              response_status = NULL,
              response_body = NULL,
              lease_token = NULL,
              lease_expires_at = NULL,
              version = version + 1,
              updated_at = clock_timestamp()
        WHERE id = $1
          AND lease_token = $2`,
      [commandId, leaseToken, failureCode]
    );
  }

  async function runAsOwner(row: CommandRow, leaseToken: string): Promise<
    FundScenarioReserveCalculationQueuedV1
  > {
    let current = row;
    try {
      const queue = getQueue();
      const context = await acquireRun({ identity, correlationId: mintUuid() });
      current = await bindRunIdentity(current, leaseToken, context.run.id, context.run.correlationId);

      let response: FundScenarioReserveCalculationQueuedV1;
      try {
        await ensureJob({ queue, context, actor: input.actor });
        await recordQueuedEventOnce({ context, actor: input.actor });
        response = buildReserveCalculationQueuedResponse(context);
      } catch (error) {
        throw new QueueInteractionError(error);
      }

      await finalizeCompleted(current, leaseToken, response);

      const stored = await loadExisting();
      if (!stored || stored.status !== 'completed') {
        throw new Error('Reserve calculation command receipt did not persist as completed');
      }
      return parseStoredResponse(stored.response_body);
    } catch (error) {
      if (isQueueUnavailableError(error)) {
        await failCommand(current.id, leaseToken, 'QUEUE_UNAVAILABLE');
        throw error;
      }
      if (error instanceof QueueInteractionError) {
        await failCommand(current.id, leaseToken, 'QUEUE_ENQUEUE_UNCERTAIN');
        throw enqueueUncertainError();
      }
      if (
        typeof error === 'object' &&
        error !== null &&
        (error as { code?: unknown }).code === 'idempotency_request_in_progress'
      ) {
        throw error;
      }
      await failCommand(current.id, leaseToken, 'COMMAND_FAILED');
      throw error;
    }
  }

  const deadline = now() + receiptWaitTimeoutMs;
  let firstIteration = true;

  for (;;) {
    const leaseToken = mintUuid();

    if (firstIteration) {
      firstIteration = false;
      const claimed = await claimPending(leaseToken);
      if (claimed) {
        return runAsOwner(claimed, leaseToken);
      }
    }

    const row = await loadExisting();
    if (!row) {
      const reclaimed = await claimPending(leaseToken);
      if (reclaimed) {
        return runAsOwner(reclaimed, leaseToken);
      }
      continue;
    }

    if (row.request_hash !== requestHash) {
      throw keyReusedError();
    }

    if (row.status === 'completed') {
      return parseStoredResponse(row.response_body);
    }

    if (row.status === 'failed' || (row.status === 'pending' && row.lease_expired)) {
      const reclaimed = await takeOver(row, leaseToken);
      if (reclaimed) {
        return runAsOwner(reclaimed, leaseToken);
      }
      continue;
    }

    if (now() >= deadline) {
      throw inProgressError();
    }
    await sleep(receiptPollIntervalMs);
  }
}
