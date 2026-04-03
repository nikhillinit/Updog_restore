import { parseArgs } from 'node:util';
import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm';
import { calcRuns, fundBaselines } from '@shared/schema';
import { db, pool } from '../server/db';
import { ensureAttributedFundMetricsForCalcRun } from '../server/services/fund-metrics-attribution-service';
import { varianceTrackingService } from '../server/services/variance-tracking';

type BackfillOptions = {
  dryRun: boolean;
  maxAgeDays: number;
  batchSize: number;
  fundId?: number;
  delayBetweenBatchesMs: number;
};

type OrphanedRun = {
  runId: number;
  fundId: number;
  completedAt: Date;
};

function printUsage(): void {
  console.log(`Usage: npx tsx scripts/backfill-automated-baselines.ts [options]

Options:
  --dry-run                   Show candidate runs without creating baselines
  --max-age-days <days>       Only backfill runs completed within this many days (default: 7)
  --batch-size <count>        Number of runs to process per batch (default: 10)
  --fund-id <id>              Limit backfill to a single fund
  --delay-between-batches-ms <ms>
                              Delay between batches in milliseconds (default: 1000)
  --help                      Show this message
`);
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseCliArgs(): BackfillOptions & { help: boolean } {
  const { values } = parseArgs({
    options: {
      'dry-run': { type: 'boolean', default: false },
      'max-age-days': { type: 'string' },
      'batch-size': { type: 'string' },
      'fund-id': { type: 'string' },
      'delay-between-batches-ms': { type: 'string' },
      help: { type: 'boolean', default: false },
    },
    allowPositionals: false,
  });

  const fundId =
    values['fund-id'] != null ? parsePositiveInt(values['fund-id'], Number.NaN) : undefined;

  return {
    dryRun: values['dry-run'],
    maxAgeDays: parsePositiveInt(values['max-age-days'], 7),
    batchSize: parsePositiveInt(values['batch-size'], 10),
    fundId: Number.isFinite(fundId) ? fundId : undefined,
    delayBetweenBatchesMs: parsePositiveInt(values['delay-between-batches-ms'], 1000),
    help: values.help,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadOrphanedRuns(fundId?: number): Promise<OrphanedRun[]> {
  const conditions = [isNotNull(calcRuns.completedAt), isNull(fundBaselines.id)];

  if (fundId != null) {
    conditions.push(eq(calcRuns.fundId, fundId));
  }

  const rows = await db
    .select({
      runId: calcRuns.id,
      fundId: calcRuns.fundId,
      completedAt: calcRuns.completedAt,
    })
    .from(calcRuns)
    .leftJoin(
      fundBaselines,
      and(eq(fundBaselines.fundId, calcRuns.fundId), eq(fundBaselines.sourceRunId, calcRuns.id))
    )
    .where(and(...conditions))
    .orderBy(asc(calcRuns.completedAt));

  return rows.map((row) => ({
    runId: row.runId,
    fundId: row.fundId,
    completedAt: row.completedAt as Date,
  }));
}

export async function backfillAutomatedBaselines(options: BackfillOptions): Promise<{
  scanned: number;
  eligible: number;
  skippedTooOld: number;
  processed: number;
  failed: number;
}> {
  const cutoff = new Date(Date.now() - options.maxAgeDays * 24 * 60 * 60 * 1000);
  const orphanedRuns = await loadOrphanedRuns(options.fundId);
  const eligibleRuns = orphanedRuns.filter((run) => run.completedAt >= cutoff);
  const skippedRuns = orphanedRuns.filter((run) => run.completedAt < cutoff);

  console.log(
    `[INFO] Found ${orphanedRuns.length} orphaned calc runs (${eligibleRuns.length} eligible, ${skippedRuns.length} skipped as too old)`
  );

  if (skippedRuns.length > 0) {
    for (const run of skippedRuns) {
      console.log(
        `[SKIPPED] run=${run.runId} fund=${run.fundId} completedAt=${run.completedAt.toISOString()} reason=too_old_for_automatic_backfill`
      );
    }
  }

  if (options.dryRun) {
    for (const run of eligibleRuns) {
      console.log(
        `[DRY RUN] run=${run.runId} fund=${run.fundId} completedAt=${run.completedAt.toISOString()}`
      );
    }

    return {
      scanned: orphanedRuns.length,
      eligible: eligibleRuns.length,
      skippedTooOld: skippedRuns.length,
      processed: 0,
      failed: 0,
    };
  }

  let processed = 0;
  let failed = 0;

  for (let index = 0; index < eligibleRuns.length; index += options.batchSize) {
    const batch = eligibleRuns.slice(index, index + options.batchSize);
    console.log(
      `[BATCH] Processing runs ${index + 1}-${index + batch.length} of ${eligibleRuns.length}`
    );

    for (const run of batch) {
      try {
        await ensureAttributedFundMetricsForCalcRun(run.runId);
        const baseline = await varianceTrackingService.baselines.createBaselineFromCalcRun(
          run.runId,
          {
            mode: 'backfill',
          }
        );

        console.log(
          `[OK] run=${run.runId} fund=${run.fundId} baseline=${baseline.id} isDefault=${baseline.isDefault}`
        );
        processed += 1;
      } catch (error) {
        failed += 1;
        console.error(
          `[FAILED] run=${run.runId} fund=${run.fundId} error=${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    if (index + options.batchSize < eligibleRuns.length && options.delayBetweenBatchesMs > 0) {
      await sleep(options.delayBetweenBatchesMs);
    }
  }

  console.log(
    `[SUMMARY] scanned=${orphanedRuns.length} eligible=${eligibleRuns.length} processed=${processed} failed=${failed} skippedTooOld=${skippedRuns.length}`
  );
  console.log(
    '[NOTE] Backfilled baselines are created with backfill tags and never auto-promote to default. Promote a baseline manually if periodic alerts should use it.'
  );

  return {
    scanned: orphanedRuns.length,
    eligible: eligibleRuns.length,
    skippedTooOld: skippedRuns.length,
    processed,
    failed,
  };
}

async function closePool(): Promise<void> {
  if (pool && typeof pool === 'object' && 'end' in pool && typeof pool.end === 'function') {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]!}`) {
  const options = parseCliArgs();

  if (options.help) {
    printUsage();
    process.exit(0);
  }

  backfillAutomatedBaselines(options)
    .then(async (summary) => {
      await closePool();
      process.exit(summary.failed > 0 ? 1 : 0);
    })
    .catch(async (error) => {
      console.error('[FATAL] Backfill failed:', error);
      await closePool();
      process.exit(1);
    });
}
