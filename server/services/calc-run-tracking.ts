import { db } from '../db';
import { calcRuns, fundSnapshots } from '@shared/schema';
import { eq, and, inArray, isNull } from 'drizzle-orm';
import { AUTHORITATIVE_SNAPSHOT_TYPES } from '@shared/contracts/fund-authoritative-calculations.contract';

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

export async function markCalcRunCompletedIfReady(runId: number): Promise<void> {
  const snapshots = await db.query.fundSnapshots.findMany({
    where: and(
      eq(fundSnapshots.runId, runId),
      inArray(fundSnapshots.type, [...AUTHORITATIVE_SNAPSHOT_TYPES])
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
    return;
  }

  await db
    .update(calcRuns)
    .set({ completedAt: new Date() })
    .where(and(eq(calcRuns.id, runId), isNull(calcRuns.completedAt)));
}
