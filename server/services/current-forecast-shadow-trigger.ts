import { and, eq } from 'drizzle-orm';

import {
  METHODOLOGY_VERSION,
  type CurrentForecastV2,
} from '../../shared/contracts/current-forecast-v2.contract';
import type { PersistedFinancialFactsSnapshotV1 } from '../../shared/contracts/financial-facts-snapshot-v1.contract';
import { financialFactsSnapshots } from '../../shared/schema/financial-facts-snapshots';
import { db } from '../db';
import { logger } from '../lib/logger';
import {
  resolveCurrentForecastModeResolution,
  type CurrentForecastModeResolution,
} from './current-forecast-calc-mode-resolver';
import {
  getOrCreateCurrentForecastV2WithReceipt,
  resolveCurrentForecastPlanVersionId,
  runCurrentForecastV2,
  type CurrentForecastDatabase,
  type RunCurrentForecastV2Receipt,
} from './current-forecast-v2-service';
import {
  persistCurrentForecastShadowFailure,
  persistCurrentForecastShadowReconciliation,
  runCurrentForecastShadowBase,
  type CurrentForecastShadowBase,
  type PersistCurrentForecastShadowReconciliationFn,
} from './current-forecast-shadow-service';

const log = logger.child({ module: 'current-forecast-shadow-trigger' });
const DEFAULT_TRIGGER_TIMEOUT_MS = 30_000;
const FAILURE_PERSIST_TIMEOUT_MS = 5_000;

export interface CurrentForecastShadowTriggerInput {
  fundId: number;
  financialFactsSnapshotId: number;
  clock: string;
  currentPlanVersionId?: number;
  receipt?: RunCurrentForecastV2Receipt;
  error?: unknown;
  timeoutMs?: number;
  database?: CurrentForecastDatabase;
  persist?: PersistCurrentForecastShadowReconciliationFn;
}

export interface CurrentForecastFactsShadowTriggerInput {
  fundId: number;
  snapshot: PersistedFinancialFactsSnapshotV1;
  timeoutMs?: number;
  database?: CurrentForecastDatabase;
  persist?: PersistCurrentForecastShadowReconciliationFn;
}

interface ShadowTriggerTimeout extends Error {
  code: 'CURRENT_FORECAST_SHADOW_TIMEOUT';
}

function timeoutError(timeoutMs: number): ShadowTriggerTimeout {
  const error = new Error(
    `Current-forecast shadow timed out after ${timeoutMs}ms`
  ) as ShadowTriggerTimeout;
  error.name = 'CurrentForecastShadowTimeoutError';
  error.code = 'CURRENT_FORECAST_SHADOW_TIMEOUT';
  return error;
}

function failureBase(input: CurrentForecastShadowTriggerInput): CurrentForecastShadowBase {
  const receipt = input.receipt;
  const currentPlanVersionId =
    input.currentPlanVersionId ??
    (receipt ? Number.parseInt(receipt.result.currentPlanVersionId, 10) : undefined);
  const planDescriptor = currentPlanVersionId === 0 ? 'none' : (currentPlanVersionId ?? 'unknown');
  const snapshotDescriptor = receipt?.fundSnapshotId ?? 'unknown';
  return {
    name: `facts:${input.financialFactsSnapshotId}:plan:${planDescriptor}:snapshot:${snapshotDescriptor}:clock:${input.clock}`,
    fundId: input.fundId,
    basisDescriptor: `basis:facts=${input.financialFactsSnapshotId};plan=${planDescriptor};snapshot=${snapshotDescriptor};clock=${input.clock}`,
    referenceBasis: {
      fundSnapshotId: receipt?.fundSnapshotId ?? 0,
      currentPlanVersionId: currentPlanVersionId ?? 0,
      financialFactsSnapshotId: input.financialFactsSnapshotId,
    },
    expected: {
      status: 'failed',
      inputHash: null,
      resultHash: null,
      methodologyVersion: METHODOLOGY_VERSION,
      mismatchReasons: [],
    },
  };
}

type ShadowTriggerContext = { receipt: RunCurrentForecastV2Receipt | undefined };

function pinnedBase(
  input: CurrentForecastShadowTriggerInput,
  receipt: RunCurrentForecastV2Receipt
) {
  const result = receipt.result;
  const currentPlanVersionId = Number.parseInt(result.currentPlanVersionId, 10);
  const financialFactsSnapshotId = Number.parseInt(result.financialFactsSnapshotId, 10);
  if (
    result.fundId !== input.fundId ||
    financialFactsSnapshotId !== input.financialFactsSnapshotId ||
    (input.currentPlanVersionId !== undefined &&
      currentPlanVersionId !== input.currentPlanVersionId)
  ) {
    throw new Error('Current-forecast shadow receipt does not match committed basis.');
  }

  return {
    name: `facts:${financialFactsSnapshotId}:plan:${currentPlanVersionId}:clock:${input.clock}`,
    fundId: input.fundId,
    basisDescriptor: `basis:facts=${financialFactsSnapshotId};plan=${currentPlanVersionId};snapshot=${receipt.fundSnapshotId};clock=${input.clock}`,
    referenceBasis: {
      fundSnapshotId: receipt.fundSnapshotId,
      currentPlanVersionId,
      financialFactsSnapshotId,
    },
    expected: {
      status: result.status === 'held' ? 'failed' : result.status,
      inputHash: result.inputHash,
      resultHash: result.resultHash,
      methodologyVersion: result.methodologyVersion,
      mismatchReasons: [],
    },
  } satisfies CurrentForecastShadowBase;
}

async function receiptForFactsPath(
  input: CurrentForecastShadowTriggerInput,
  database: CurrentForecastDatabase
): Promise<RunCurrentForecastV2Receipt> {
  return getOrCreateCurrentForecastV2WithReceipt({
    fundId: input.fundId,
    financialFactsSnapshotId: String(input.financialFactsSnapshotId),
    ...(input.currentPlanVersionId === undefined || input.currentPlanVersionId === 0
      ? {}
      : { currentPlanVersionId: String(input.currentPlanVersionId) }),
    clock: input.clock,
    database,
  });
}

async function runShadow(
  input: CurrentForecastShadowTriggerInput,
  database: CurrentForecastDatabase,
  resolution: CurrentForecastModeResolution,
  context: ShadowTriggerContext
): Promise<void> {
  if (resolution.mode !== 'shadow') return;
  if (input.error !== undefined) {
    const persist =
      input.persist ?? ((record) => persistCurrentForecastShadowReconciliation(record, database));
    await persistCurrentForecastShadowFailure({
      base: failureBase(input),
      ...(input.error === undefined ? {} : { error: input.error }),
      persist,
    });
    return;
  }

  const receipt = input.receipt ?? (await receiptForFactsPath(input, database));
  context.receipt = receipt;
  const base = pinnedBase({ ...input, receipt }, receipt);
  const persist =
    input.persist ?? ((record) => persistCurrentForecastShadowReconciliation(record, database));

  await runCurrentForecastShadowBase({
    base,
    resolveMode: async () => resolution,
    runV2: async (): Promise<CurrentForecastV2> =>
      runCurrentForecastV2({
        fundId: input.fundId,
        currentPlanVersionId: String(base.referenceBasis.currentPlanVersionId),
        financialFactsSnapshotId: String(base.referenceBasis.financialFactsSnapshotId),
        clock: input.clock,
        database,
      }),
    persist,
  });
}

async function persistFailureWithinDeadline(
  input: CurrentForecastShadowTriggerInput,
  database: CurrentForecastDatabase,
  context: ShadowTriggerContext,
  error: unknown,
  reason?: string
): Promise<void> {
  const persist =
    input.persist ?? ((record) => persistCurrentForecastShadowReconciliation(record, database));
  const persistWork = persistCurrentForecastShadowFailure({
    base: failureBase({
      ...input,
      ...(context.receipt === undefined ? {} : { receipt: context.receipt }),
    }),
    ...(reason === undefined ? { error } : { reason }),
    persist,
  });
  const persistTimeoutMessage = `Failure persistence timed out after ${FAILURE_PERSIST_TIMEOUT_MS}ms`;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      persistWork,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(persistTimeoutMessage)),
          FAILURE_PERSIST_TIMEOUT_MS
        );
      }),
    ]);
  } catch (persistError) {
    const persistTimedOut =
      persistError instanceof Error && persistError.message === persistTimeoutMessage;
    if (persistTimedOut) {
      void persistWork.catch((lateError: unknown) => {
        log.error(
          { err: lateError, fundId: input.fundId },
          'Late current-forecast shadow failure persistence failed after timeout'
        );
      });
      log.error(
        { err: persistError, fundId: input.fundId },
        'Current-forecast shadow failure persistence timed out'
      );
    } else {
      log.error(
        { err: persistError, fundId: input.fundId },
        'Current-forecast shadow failure could not be recorded'
      );
    }
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function settleShadowTrigger(params: {
  input: CurrentForecastShadowTriggerInput;
  database: CurrentForecastDatabase;
  context: ShadowTriggerContext;
  work: () => Promise<void>;
  failureInput: () => CurrentForecastShadowTriggerInput;
}): Promise<void> {
  const timeoutMs = params.input.timeoutMs ?? DEFAULT_TRIGGER_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const work = params.work();
  try {
    await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(timeoutError(timeoutMs)), timeoutMs);
      }),
    ]);
  } catch (error) {
    const timedOut =
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: unknown }).code === 'CURRENT_FORECAST_SHADOW_TIMEOUT';
    if (timedOut) {
      void work.catch((lateError: unknown) => {
        log.error(
          { err: lateError, fundId: params.input.fundId },
          'Late current-forecast shadow execution failed after timeout'
        );
      });
    } else {
      log.error(
        { err: error, fundId: params.input.fundId },
        'Current-forecast shadow execution failed'
      );
    }

    const failureInput = params.failureInput();
    await persistFailureWithinDeadline(
      failureInput,
      params.database,
      params.context,
      error,
      timedOut ? 'timeout' : undefined
    );
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Run one pinned current-forecast shadow comparison. Every outcome, including
 * failures and timeouts, is recorded before this function settles; it never
 * throws into a facts commit or checkpoint caller.
 */
export async function triggerCurrentForecastShadow(
  input: CurrentForecastShadowTriggerInput
): Promise<void> {
  const database = input.database ?? db;
  const context: ShadowTriggerContext = { receipt: input.receipt };
  await settleShadowTrigger({
    input,
    database,
    context,
    work: async () => {
      const resolution = await resolveCurrentForecastModeResolution(input.fundId);
      if (resolution.mode !== 'shadow') return;
      await runShadow(input, database, resolution, context);
    },
    failureInput: () => ({
      ...input,
      ...(context.receipt === undefined ? {} : { receipt: context.receipt }),
    }),
  });
}

/** Resolve the committed facts row by its identity hash, never by latest order. */
export async function triggerCurrentForecastShadowForFacts(
  input: CurrentForecastFactsShadowTriggerInput
): Promise<void> {
  const database = input.database ?? db;
  let shadowInput: CurrentForecastShadowTriggerInput = {
    fundId: input.fundId,
    financialFactsSnapshotId: 0,
    clock: input.snapshot.knowledgeCutoff,
    database,
    ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
    ...(input.persist === undefined ? {} : { persist: input.persist }),
  };
  const context: ShadowTriggerContext = { receipt: undefined };

  await settleShadowTrigger({
    input: shadowInput,
    database,
    context,
    work: async () => {
      const resolution = await resolveCurrentForecastModeResolution(input.fundId);
      if (resolution.mode !== 'shadow') return;

      const [snapshotRow] = await database
        .select({ id: financialFactsSnapshots.id })
        .from(financialFactsSnapshots)
        .where(
          and(
            eq(financialFactsSnapshots.fundId, input.fundId),
            eq(financialFactsSnapshots.snapshotInputHash, input.snapshot.snapshotInputHash)
          )
        )
        .limit(1);
      if (!snapshotRow) {
        throw new Error(
          'Committed financial-facts snapshot could not be resolved by identity hash.'
        );
      }

      // Pin the facts identity before any further fallible work so a plan
      // lookup failure still persists the real facts basis, never facts=0.
      shadowInput = { ...shadowInput, financialFactsSnapshotId: snapshotRow.id };

      const currentPlanVersionId = await resolveCurrentForecastPlanVersionId({
        fundId: input.fundId,
        database,
      });
      shadowInput = {
        ...shadowInput,
        // Zero is an internal sentinel: failureBase renders it as plan=none.
        currentPlanVersionId: currentPlanVersionId ?? 0,
      };
      await runShadow(shadowInput, database, resolution, context);
    },
    failureInput: () => shadowInput,
  });
}
