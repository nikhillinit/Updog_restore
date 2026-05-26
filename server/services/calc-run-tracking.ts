/**
 * Calc-run completion tracking.
 *
 * markCalcRunCompletedIfReady() is the sole completion trigger for downstream
 * automation. Re-drive is intentional: if a previous completion attempt failed
 * after setting completedAt, later callers rerun the same idempotent handler
 * chain instead of trying to serialize or suppress retries.
 */
import { db } from '../db';
import { calcRuns, fundSnapshots } from '@shared/schema';
import { eq, and, inArray, isNull } from 'drizzle-orm';
import { AUTHORITATIVE_SNAPSHOT_TYPES } from '@shared/contracts/fund-authoritative-calculations.contract';
import { logger } from '../lib/logger';

const log = logger.child({ module: 'calc-run-tracking' });

// --- Completion handler registration ---

export type CalcRunCompletedHandler = (
  runId: number,
  fundId: number,
  configId: number,
  configVersion: number
) => Promise<void>;

type CompletionTarget = {
  id: number;
  fundId: number;
  configId: number;
  configVersion: number;
  completedAt?: Date | null;
};

const completionHandlers: CalcRunCompletedHandler[] = [];

export function registerCalcRunCompletedHandler(handler: CalcRunCompletedHandler): void {
  completionHandlers.push(handler);
}

/** Clear all registered handlers. Exported for test isolation only. */
export function resetCompletionHandlers(): void {
  completionHandlers.length = 0;
}

async function runCompletionHandlers(target: CompletionTarget): Promise<void> {
  const handlers = [...completionHandlers];
  const results = await Promise.allSettled(
    handlers.map((handler) =>
      handler(target.id, target.fundId, target.configId, target.configVersion)
    )
  );

  const failedHandlers: Array<{ handlerName: string; reason: unknown }> = [];

  for (const [index, result] of results.entries()) {
    if (result.status === 'fulfilled') {
      continue;
    }

    const handler = handlers[index];
    const handlerName = handler?.name || 'anonymous';
    failedHandlers.push({ handlerName, reason: result.reason });
    log.error(
      { runId: target.id, handler: handlerName, err: result.reason },
      'Calc-run completion handler failed'
    );
  }

  if (failedHandlers.length > 0) {
    const failureSummary = failedHandlers
      .map(({ handlerName, reason }) => {
        const reasonMessage =
          reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : null;

        return reasonMessage ? `${handlerName}: ${reasonMessage}` : handlerName;
      })
      .join('; ');

    throw new Error(`Calc-run completion handlers failed for run ${target.id}: ${failureSummary}`);
  }
}

// --- Helpers ---

export function isFinalAttempt(job: {
  attemptsMade: number;
  opts: { attempts?: number };
}): boolean {
  const maxAttempts = Number(job.opts.attempts ?? 1);
  return job.attemptsMade + 1 >= maxAttempts;
}

export async function markCalcRunFailed(runId: number, errorMessage: string): Promise<void> {
  await db
    .update(calcRuns)
    .set({
      dispatchState: 'failed',
      failedAt: new Date(),
      lastError: errorMessage,
    })
    .where(eq(calcRuns.id, runId));
}

export async function markCalcRunCompletedIfReady(runId: number): Promise<boolean> {
  const snapshots = await db.query.fundSnapshots.findMany({
    where: and(
      eq(fundSnapshots.runId, runId),
      inArray(fundSnapshots.type, [...AUTHORITATIVE_SNAPSHOT_TYPES]),
      isNull(fundSnapshots.scenarioSetId)
    ),
    columns: {
      type: true,
    },
  });

  const snapshotTypes = new Set(snapshots.map((snapshot) => snapshot.type));
  const hasAuthoritativeCoverage = AUTHORITATIVE_SNAPSHOT_TYPES.every((type) =>
    snapshotTypes.has(type)
  );

  if (!hasAuthoritativeCoverage) {
    return false;
  }

  const updatedRuns = await db
    .update(calcRuns)
    .set({ completedAt: new Date() })
    .where(and(eq(calcRuns.id, runId), isNull(calcRuns.completedAt)))
    .returning({
      id: calcRuns.id,
      fundId: calcRuns.fundId,
      configId: calcRuns.configId,
      configVersion: calcRuns.configVersion,
    });

  const transitionedRun = updatedRuns[0];
  if (transitionedRun) {
    await runCompletionHandlers(transitionedRun);
    return true;
  }

  const completedRun = await db.query.calcRuns.findFirst({
    where: eq(calcRuns.id, runId),
    columns: {
      id: true,
      fundId: true,
      configId: true,
      configVersion: true,
      completedAt: true,
    },
  });

  if (!completedRun?.completedAt) {
    return false;
  }

  // Re-drive idempotent downstream automation so handler failures after the
  // initial completedAt transition can be recovered by later calls. This is an
  // intentional part of the contract, not a duplicate-delivery bug.
  await runCompletionHandlers(completedRun);
  return true;
}
