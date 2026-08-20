/**
 * Durable reserve-calculation command for the fund scenario workspace.
 *
 * One intent = one Idempotency-Key; the key is minted per user intent and
 * reused verbatim across retries so the server can replay or reject
 * deterministically (ADR durable-idempotency contract).
 *
 * @module client/lib/fund-scenario-reserve-command
 */

import { ApiError, apiRequest } from '@/lib/queryClient';
import { scenarioSetApiPath } from '@/lib/fund-scenario-workspace-api';
import {
  FundScenarioReserveCalculationQueuedV1Schema,
  type FundScenarioReserveCalculationQueuedV1,
} from '@shared/contracts/fund-scenario-sets-v1.contract';

export type ReserveCalculationIntent = {
  idempotencyKey: string;
  body: { calculationMode: 'async_reserve_allocation' };
};

function defaultRandomUUID(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `reserve-calculation-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

export function createReserveCalculationIntent(
  randomUUID: () => string = defaultRandomUUID
): ReserveCalculationIntent {
  return {
    idempotencyKey: randomUUID(),
    body: { calculationMode: 'async_reserve_allocation' },
  };
}

export type ReserveCommandOutcome =
  | { kind: 'queued'; response: FundScenarioReserveCalculationQueuedV1 }
  | { kind: 'in_progress' }
  | { kind: 'inputs_changed' }
  | { kind: 'queue_unavailable' }
  | { kind: 'retryable_error'; message: string }
  | { kind: 'terminal_error'; message: string };

const MAX_IN_PROGRESS_RETRIES = 2;
const DEFAULT_RETRY_AFTER_MS = 1000;
// 4xx statuses whose contracts prove the command failed before any claim was
// taken, so discarding the key cannot orphan a queued command.
const TERMINAL_PRE_CLAIM_STATUSES = new Set([400, 401, 403, 404, 428]);

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function executeReserveCalculationCommand(params: {
  fundId: number;
  scenarioSetId: string;
  intent: ReserveCalculationIntent;
  sleep?: (ms: number) => Promise<void>;
}): Promise<ReserveCommandOutcome> {
  const { fundId, scenarioSetId, intent, sleep = defaultSleep } = params;
  const url = scenarioSetApiPath(String(fundId), scenarioSetId, '/calculate-reserve');

  for (let attempt = 0; ; attempt += 1) {
    try {
      const raw = await apiRequest('POST', url, intent.body, {
        headers: { 'Idempotency-Key': intent.idempotencyKey },
      });
      return { kind: 'queued', response: FundScenarioReserveCalculationQueuedV1Schema.parse(raw) };
    } catch (error) {
      if (!(error instanceof ApiError)) {
        // Network failure, or an unparseable success body: outcome unknown,
        // keep the intent and let the caller retry with the same key.
        const message = error instanceof Error ? error.message : String(error);
        return { kind: 'retryable_error', message };
      }
      if (error.status === 409 && error.errorCode === 'idempotency_request_in_progress') {
        if (attempt >= MAX_IN_PROGRESS_RETRIES) return { kind: 'in_progress' };
        await sleep(error.retryAfterMs ?? DEFAULT_RETRY_AFTER_MS);
        continue;
      }
      if (error.status === 422 && error.errorCode === 'idempotency_key_reused') {
        return { kind: 'inputs_changed' };
      }
      if (error.status === 503 && error.errorCode === 'scenario_calculation_queue_unavailable') {
        return { kind: 'queue_unavailable' };
      }
      if (TERMINAL_PRE_CLAIM_STATUSES.has(error.status)) {
        return { kind: 'terminal_error', message: error.message };
      }
      return { kind: 'retryable_error', message: error.message };
    }
  }
}
