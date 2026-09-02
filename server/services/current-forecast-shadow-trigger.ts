import { and, eq, sql } from 'drizzle-orm';

import {
  METHODOLOGY_VERSION,
  type CurrentForecastRecomputeOutcome,
  type CurrentForecastV2,
} from '../../shared/contracts/current-forecast-v2.contract';
import type { PersistedFinancialFactsSnapshotV1 } from '../../shared/contracts/financial-facts-snapshot-v1.contract';
import { canonicalSha256 } from '../../shared/lib/canonical-hash';
import {
  currentForecastRecomputeCommands,
  type CurrentForecastRecomputeCommand,
} from '../../shared/schema/current-forecast-recompute-commands';
import { financialFactsSnapshots } from '../../shared/schema/financial-facts-snapshots';
import { db } from '../db';
import { IdempotentCommandError } from '../lib/idempotent-command';
import { logger } from '../lib/logger';
import {
  resolveCurrentForecastModeResolution,
  type CurrentForecastModeResolution,
} from './current-forecast-calc-mode-resolver';
import { lockCurrentForecastFund } from './current-forecast-fund-lock';
import {
  getOrCreateCurrentForecastV2WithReceipt,
  resolveCurrentForecastPlanVersionId,
  runCurrentForecastV2,
  type CurrentForecastDatabase,
  type RunCurrentForecastV2Receipt,
} from './current-forecast-v2-service';
import {
  buildCurrentForecastShadowRecord,
  persistCurrentForecastShadowFailure,
  persistCurrentForecastShadowReconciliation,
  runCurrentForecastShadowBase,
  type CurrentForecastShadowBase,
  type PersistCurrentForecastShadowReconciliationFn,
} from './current-forecast-shadow-service';

const log = logger.child({ module: 'current-forecast-shadow-trigger' });
const DEFAULT_TRIGGER_TIMEOUT_MS = 30_000;
const FAILURE_PERSIST_TIMEOUT_MS = 5_000;
const CURRENT_FORECAST_RECOMPUTE_ROUTE = 'POST /api/funds/:fundId/current-forecast/recompute';

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

export type ManualCurrentForecastRecomputeOutcome = CurrentForecastRecomputeOutcome;

export interface RunManualCurrentForecastRecomputeInput {
  fundId: number;
  idempotencyKey: string;
  actorId: number | null;
  database?: CurrentForecastDatabase;
}

class ManualCurrentForecastRecomputeOwnershipLostError extends Error {
  constructor(readonly commandId: number) {
    super(`Manual current-forecast recompute command ${commandId} lost its pending claim`);
    this.name = 'ManualCurrentForecastRecomputeOwnershipLostError';
  }
}

function manualRecomputeOutcomeFromCommand(
  command: CurrentForecastRecomputeCommand,
  replayed: boolean
): ManualCurrentForecastRecomputeOutcome {
  switch (command.status) {
    case 'completed':
      if (command.shadowReconciliationId === null) {
        throw new Error('Completed current-forecast recompute command has no reconciliation');
      }
      return {
        status: 'completed',
        shadowReconciliationId: command.shadowReconciliationId,
        replayed,
      };
    case 'failed':
      if (command.failureCode === null) {
        throw new Error('Failed current-forecast recompute command has no failure code');
      }
      return { status: 'failed', failureCode: command.failureCode, replayed };
    case 'skipped':
      return { status: 'skipped', replayed };
    case 'pending':
      throw new Error('Pending current-forecast recompute command has no terminal outcome');
  }
}

async function loadManualCurrentForecastRecomputeCommand(
  database: CurrentForecastDatabase,
  fundId: number,
  idempotencyKey: string
): Promise<CurrentForecastRecomputeCommand | undefined> {
  const [command] = await database
    .select()
    .from(currentForecastRecomputeCommands)
    .where(
      and(
        eq(currentForecastRecomputeCommands.fundId, fundId),
        eq(currentForecastRecomputeCommands.idempotencyKey, idempotencyKey)
      )
    )
    .limit(1);
  return command;
}

/**
 * Diagnostic lookup of the command id behind a (fund, key) claim, for server
 * logs that must name the command without widening the wire outcome.
 */
export async function findManualCurrentForecastRecomputeCommandId(params: {
  fundId: number;
  idempotencyKey: string;
  database?: CurrentForecastDatabase;
}): Promise<number | null> {
  const command = await loadManualCurrentForecastRecomputeCommand(
    params.database ?? db,
    params.fundId,
    params.idempotencyKey
  );
  return command?.id ?? null;
}

async function claimManualCurrentForecastRecompute(params: {
  database: CurrentForecastDatabase;
  fundId: number;
  idempotencyKey: string;
  requestHash: string;
  actorId: number | null;
}): Promise<
  | { owned: true; commandId: number }
  | { owned: false; outcome: ManualCurrentForecastRecomputeOutcome }
> {
  // The claim is the manual path's critical section: it takes the same
  // per-fund lock as the activation check-and-flip, so a claim can never land
  // between the activation blocker read and the flip (F_1.11.0 P0b item 4).
  // No non-transactional fallback (ADR-093).
  return params.database.transaction(async (transaction) => {
    await lockCurrentForecastFund(transaction, params.fundId);

    const [claimed] = await transaction
      .insert(currentForecastRecomputeCommands)
      .values({
        fundId: params.fundId,
        idempotencyKey: params.idempotencyKey,
        requestHash: params.requestHash,
        status: 'pending',
        createdBy: params.actorId,
      })
      .onConflictDoNothing({
        target: [
          currentForecastRecomputeCommands.fundId,
          currentForecastRecomputeCommands.idempotencyKey,
        ],
      })
      .returning({ id: currentForecastRecomputeCommands.id });

    if (claimed) return { owned: true, commandId: claimed.id };

    const existing = await loadManualCurrentForecastRecomputeCommand(
      transaction,
      params.fundId,
      params.idempotencyKey
    );
    if (!existing) {
      throw new IdempotentCommandError(
        409,
        'IDEMPOTENCY_RACE_UNRESOLVED',
        'The recompute claim conflict could not be resolved after reloading the command.',
        { idempotencyKey: params.idempotencyKey }
      );
    }
    if (existing.requestHash !== params.requestHash) {
      throw new IdempotentCommandError(
        409,
        'IDEMPOTENCY_KEY_REUSE',
        'Idempotency-Key was already used for a different current-forecast recompute request.',
        { idempotencyKey: params.idempotencyKey }
      );
    }
    if (existing.status !== 'pending') {
      return { owned: false, outcome: manualRecomputeOutcomeFromCommand(existing, true) };
    }

    const [recovered] = await transaction
      .update(currentForecastRecomputeCommands)
      .set({
        status: 'failed',
        failureCode: 'stale_pending',
        shadowReconciliationId: null,
        createdReconciliation: false,
        finalizedAt: sql`NOW()`,
      })
      .where(
        and(
          eq(currentForecastRecomputeCommands.id, existing.id),
          eq(currentForecastRecomputeCommands.status, 'pending'),
          sql`${currentForecastRecomputeCommands.startedAt} <= NOW() - INTERVAL '90 seconds'`
        )
      )
      .returning();

    if (recovered) {
      return { owned: false, outcome: manualRecomputeOutcomeFromCommand(recovered, true) };
    }

    const current = await loadManualCurrentForecastRecomputeCommand(
      transaction,
      params.fundId,
      params.idempotencyKey
    );
    if (current && current.status !== 'pending') {
      return { owned: false, outcome: manualRecomputeOutcomeFromCommand(current, true) };
    }

    throw new IdempotentCommandError(
      409,
      'RECOMPUTE_IN_FLIGHT',
      'Current-forecast recompute is already in flight for this Idempotency-Key.',
      { idempotencyKey: params.idempotencyKey }
    );
  });
}

async function finalizeManualCurrentForecastRecomputeFailure(params: {
  database: CurrentForecastDatabase;
  commandId: number;
  fundId: number;
  idempotencyKey: string;
  failureCode: 'execution_timeout' | 'execution_error';
}): Promise<ManualCurrentForecastRecomputeOutcome> {
  const [finalized] = await params.database
    .update(currentForecastRecomputeCommands)
    .set({
      status: 'failed',
      failureCode: params.failureCode,
      shadowReconciliationId: null,
      createdReconciliation: false,
      finalizedAt: sql`NOW()`,
    })
    .where(
      and(
        eq(currentForecastRecomputeCommands.id, params.commandId),
        eq(currentForecastRecomputeCommands.status, 'pending')
      )
    )
    .returning();

  if (finalized) return manualRecomputeOutcomeFromCommand(finalized, false);

  const winner = await loadManualCurrentForecastRecomputeCommand(
    params.database,
    params.fundId,
    params.idempotencyKey
  );
  if (winner && winner.status !== 'pending') {
    return manualRecomputeOutcomeFromCommand(winner, false);
  }
  throw new ManualCurrentForecastRecomputeOwnershipLostError(params.commandId);
}

async function executeOwnedManualCurrentForecastRecompute(params: {
  database: CurrentForecastDatabase;
  commandId: number;
  fundId: number;
}): Promise<ManualCurrentForecastRecomputeOutcome> {
  const resolution = await resolveCurrentForecastModeResolution(params.fundId);
  if (resolution.mode !== 'shadow') {
    const [skipped] = await params.database
      .update(currentForecastRecomputeCommands)
      .set({
        status: 'skipped',
        failureCode: null,
        shadowReconciliationId: null,
        createdReconciliation: false,
        finalizedAt: sql`NOW()`,
      })
      .where(
        and(
          eq(currentForecastRecomputeCommands.id, params.commandId),
          eq(currentForecastRecomputeCommands.status, 'pending')
        )
      )
      .returning();
    if (!skipped) throw new ManualCurrentForecastRecomputeOwnershipLostError(params.commandId);
    return manualRecomputeOutcomeFromCommand(skipped, false);
  }

  const clock = new Date().toISOString();
  const receipt = await getOrCreateCurrentForecastV2WithReceipt({
    fundId: params.fundId,
    clock,
    database: params.database,
  });
  const financialFactsSnapshotId = Number.parseInt(receipt.result.financialFactsSnapshotId, 10);
  const currentPlanVersionId = Number.parseInt(receipt.result.currentPlanVersionId, 10);
  const base = pinnedBase(
    {
      fundId: params.fundId,
      financialFactsSnapshotId,
      currentPlanVersionId,
      clock,
      receipt,
    },
    receipt
  );

  return params.database.transaction(async (transaction) => {
    const result = await runCurrentForecastV2({
      fundId: params.fundId,
      currentPlanVersionId: String(currentPlanVersionId),
      financialFactsSnapshotId: String(financialFactsSnapshotId),
      clock,
      database: transaction,
    });
    const { record } = buildCurrentForecastShadowRecord({
      base,
      result,
      modes: {
        configuredMode: 'shadow',
        effectiveMode: 'shadow',
        killSwitchActive: false,
      },
    });
    const reconciliation = await persistCurrentForecastShadowReconciliation(record, transaction);
    const [finalized] = await transaction
      .update(currentForecastRecomputeCommands)
      .set({
        status: 'completed',
        failureCode: null,
        shadowReconciliationId: reconciliation.id,
        createdReconciliation: reconciliation.created,
        finalizedAt: sql`NOW()`,
      })
      .where(
        and(
          eq(currentForecastRecomputeCommands.id, params.commandId),
          eq(currentForecastRecomputeCommands.status, 'pending')
        )
      )
      .returning({ id: currentForecastRecomputeCommands.id });

    if (!finalized) throw new ManualCurrentForecastRecomputeOwnershipLostError(params.commandId);
    return {
      status: 'completed',
      shadowReconciliationId: reconciliation.id,
      replayed: false,
    };
  });
}

export async function runManualCurrentForecastRecompute(
  input: RunManualCurrentForecastRecomputeInput
): Promise<ManualCurrentForecastRecomputeOutcome> {
  const database = input.database ?? db;
  const requestHash = canonicalSha256({
    route: CURRENT_FORECAST_RECOMPUTE_ROUTE,
    fundId: input.fundId,
  });
  const claim = await claimManualCurrentForecastRecompute({
    database,
    fundId: input.fundId,
    idempotencyKey: input.idempotencyKey,
    requestHash,
    actorId: input.actorId,
  });
  if (!claim.owned) return claim.outcome;

  const execution = executeOwnedManualCurrentForecastRecompute({
    database,
    commandId: claim.commandId,
    fundId: input.fundId,
  }).catch(async (error: unknown) => {
    if (error instanceof ManualCurrentForecastRecomputeOwnershipLostError) {
      const winner = await loadManualCurrentForecastRecomputeCommand(
        database,
        input.fundId,
        input.idempotencyKey
      );
      if (winner && winner.status !== 'pending') {
        return manualRecomputeOutcomeFromCommand(winner, false);
      }
      throw error;
    }

    log.error(
      { err: error, fundId: input.fundId, commandId: claim.commandId },
      'Manual current-forecast recompute execution failed'
    );
    return finalizeManualCurrentForecastRecomputeFailure({
      database,
      commandId: claim.commandId,
      fundId: input.fundId,
      idempotencyKey: input.idempotencyKey,
      failureCode: 'execution_error',
    });
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<ManualCurrentForecastRecomputeOutcome>((resolve, reject) => {
    timer = setTimeout(() => {
      void finalizeManualCurrentForecastRecomputeFailure({
        database,
        commandId: claim.commandId,
        fundId: input.fundId,
        idempotencyKey: input.idempotencyKey,
        failureCode: 'execution_timeout',
      }).then(resolve, reject);
    }, DEFAULT_TRIGGER_TIMEOUT_MS);
  });

  try {
    return await Promise.race([execution, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    void execution.catch((error: unknown) => {
      log.error(
        { err: error, fundId: input.fundId, commandId: claim.commandId },
        'Late manual current-forecast recompute execution failed'
      );
    });
  }
}
