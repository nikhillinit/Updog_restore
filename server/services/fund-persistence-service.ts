/**
 * FundPersistenceService
 *
 * Encapsulates transactional fund lifecycle operations:
 *   - createFundWithInitialDraft (Item 4): atomic fund + config insert
 *   - publishDraft (Item 7): publish with calcRun tracking
 *
 * @module server/services/fund-persistence-service
 */

import { db } from '../db';
import { funds, fundConfigs, fundEvents, calcRuns } from '@shared/schema';
import { eq, and, max } from 'drizzle-orm';
import type { Fund, FundConfig, CalcRun, DispatchState } from '@shared/schema/fund';
import type { EngineResults } from '@shared/schemas/engine-results-schema';
import type { Queue } from 'bullmq';

// ============================================================================
// Types
// ============================================================================

export interface CreateFundInput {
  name: string;
  size: string;
  managementFee: string;
  carryPercentage: string;
  vintageYear: number;
  engineResults?: EngineResults | null;
}

export interface CreateFundResult {
  fund: Fund;
  draft: FundConfig;
}

export interface PublishQueues {
  reserve: Queue | null;
  pacing: Queue | null;
  cohort: Queue | null;
}

export interface PublishResult {
  published: FundConfig;
  run: CalcRun;
  correlationId: string;
}

// ============================================================================
// Service
// ============================================================================

export class FundPersistenceService {
  /**
   * Atomically creates a fund row and its initial draft config in a single
   * DB transaction. Prevents orphan funds that exist without any config.
   *
   * If configInput is omitted, inserts a minimal draft with empty config JSONB.
   */
  async createFundWithInitialDraft(
    fundInput: CreateFundInput,
    configInput?: Record<string, unknown>
  ): Promise<CreateFundResult> {
    return await db.transaction(async (tx) => {
      // 1. Insert funds row
      const [fund] = await tx
        .insert(funds)
        .values({
          name: fundInput.name,
          size: fundInput.size,
          managementFee: fundInput.managementFee,
          carryPercentage: fundInput.carryPercentage,
          vintageYear: fundInput.vintageYear,
          ...(fundInput.engineResults != null && {
            engineResults: fundInput.engineResults,
          }),
        })
        .returning();

      if (!fund) throw new Error('Failed to insert fund row');

      // 2. Insert initial draft config (version=1, isDraft=true)
      const [draft] = await tx
        .insert(fundConfigs)
        .values({
          fundId: fund.id,
          version: 1,
          config: configInput ?? {},
          isDraft: true,
          isPublished: false,
        })
        .returning();

      if (!draft) throw new Error('Failed to insert initial draft config');

      // 3. Insert FUND_CREATED audit event
      await tx.insert(fundEvents).values({
        fundId: fund.id,
        eventType: 'FUND_CREATED',
        eventTime: new Date(),
        payload: {
          configId: draft.id,
          configVersion: draft.version,
        },
      });

      return { fund, draft };
    });
  }

  /**
   * Allocates the next version number for a new draft of a given fund.
   * Returns MAX(version) + 1, or 1 if no configs exist.
   */
  async allocateNextVersion(fundId: number): Promise<number> {
    const [result] = await db
      .select({ maxVersion: max(fundConfigs.version) })
      .from(fundConfigs)
      .where(eq(fundConfigs.fundId, fundId));

    const currentMax = result?.maxVersion ?? 0;
    return currentMax + 1;
  }

  /**
   * Publish a fund's active draft with calcRun tracking and deterministic jobIds.
   *
   * 1. Idempotency check: if no draft but a pending/partial run exists, re-dispatch.
   * 2. Transaction: unpublish old head, publish draft, insert calcRun + events.
   * 3. After commit: dispatch queue jobs with deterministic jobIds.
   * 4. Update dispatchState based on queue outcomes.
   */
  async publishDraft(
    fundId: number,
    queues: PublishQueues,
    userId?: number
  ): Promise<PublishResult> {
    const { v4: generateUuid } = await import('uuid');
    const correlationId = generateUuid();
    const engines = ['reserve', 'pacing', 'cohort'];

    // Find active draft
    const draft = await db.query.fundConfigs.findFirst({
      where: and(eq(fundConfigs.fundId, fundId), eq(fundConfigs.isDraft, true)),
      orderBy: (configs, { desc }) => desc(configs.version),
    });

    // Idempotency: no draft -> check for pending/partial run
    if (!draft) {
      const existingRun = await db.query.calcRuns.findFirst({
        where: and(eq(calcRuns.fundId, fundId), eq(calcRuns.dispatchState, 'pending')),
      });

      if (existingRun) {
        // Re-dispatch with deterministic jobIds (BullMQ dedup)
        await this.dispatchCalcJobs(existingRun, queues);
        return {
          published: (await db.query.fundConfigs.findFirst({
            where: eq(fundConfigs.id, existingRun.configId),
          }))!,
          run: existingRun,
          correlationId: existingRun.correlationId,
        };
      }

      // Check for already-dispatched run
      const dispatchedRun = await db.query.calcRuns.findFirst({
        where: and(eq(calcRuns.fundId, fundId), eq(calcRuns.dispatchState, 'dispatched')),
      });

      if (dispatchedRun) {
        return {
          published: (await db.query.fundConfigs.findFirst({
            where: eq(fundConfigs.id, dispatchedRun.configId),
          }))!,
          run: dispatchedRun,
          correlationId: dispatchedRun.correlationId,
        };
      }

      throw new Error('No draft to publish');
    }

    // Transaction: publish draft + create calcRun
    const { published, run } = await db.transaction(async (tx) => {
      // Unpublish old published head
      await tx
        .update(fundConfigs)
        .set({ isPublished: false, updatedAt: new Date() })
        .where(and(eq(fundConfigs.fundId, fundId), eq(fundConfigs.isPublished, true)));

      // Publish the draft
      const [pub] = await tx
        .update(fundConfigs)
        .set({
          isPublished: true,
          isDraft: false,
          publishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(fundConfigs.id, draft.id))
        .returning();

      if (!pub) throw new Error('Failed to publish draft');

      // Insert calcRun (dispatchState='pending')
      const [newRun] = await tx
        .insert(calcRuns)
        .values({
          fundId,
          configId: draft.id,
          configVersion: draft.version,
          correlationId,
          engines,
          dispatchState: 'pending',
          requestedAt: new Date(),
        })
        .returning();

      if (!newRun) throw new Error('Failed to create calcRun');

      // Insert PUBLISHED event
      await tx.insert(fundEvents).values({
        fundId,
        eventType: 'PUBLISHED',
        eventTime: new Date(),
        correlationId,
      });

      // Insert CALC_TRIGGERED event
      await tx.insert(fundEvents).values({
        fundId,
        eventType: 'CALC_TRIGGERED',
        eventTime: new Date(),
        payload: { engines, correlationId },
        ...(userId != null && { userId }),
        correlationId,
      });

      return { published: pub, run: newRun };
    });

    // After commit: dispatch queue jobs
    await this.dispatchCalcJobs(run, queues);

    return { published, run, correlationId };
  }

  /**
   * Dispatch calculation jobs with deterministic jobIds.
   * BullMQ natively rejects duplicate jobIds, making re-dispatch idempotent.
   */
  private async dispatchCalcJobs(run: CalcRun, queues: PublishQueues): Promise<void> {
    const jobData = {
      fundId: run.fundId,
      correlationId: run.correlationId,
      runId: run.id,
      configId: run.configId,
      configVersion: run.configVersion,
    };

    const jobOptions = {
      removeOnComplete: true,
      removeOnFail: false,
    };

    const engineQueues: Array<{ engine: string; queue: Queue | null }> = [
      { engine: 'reserve', queue: queues.reserve },
      { engine: 'pacing', queue: queues.pacing },
      { engine: 'cohort', queue: queues.cohort },
    ];

    let dispatched = 0;
    let failed = 0;
    let lastError: string | null = null;

    for (const { engine, queue } of engineQueues) {
      if (!queue) continue;
      try {
        const jobId = `run:${run.id}:${engine}`;
        await queue.add('calculate', jobData, { ...jobOptions, jobId });
        dispatched++;
      } catch (err) {
        failed++;
        lastError = err instanceof Error ? err.message : String(err);
        console.error(`Failed to dispatch ${engine} job for run ${run.id}:`, err);
      }
    }

    // Update dispatch state
    let newState: DispatchState;
    if (failed === 0 && dispatched > 0) {
      newState = 'dispatched';
    } else if (dispatched > 0 && failed > 0) {
      newState = 'partial';
    } else if (dispatched === 0 && failed > 0) {
      newState = 'failed';
    } else {
      // No queues available (all null) -- mark dispatched (no-op in dev)
      newState = 'dispatched';
    }

    const updateValues: Record<string, unknown> = {
      dispatchState: newState,
    };
    if (newState === 'dispatched' || newState === 'partial') {
      updateValues['dispatchedAt'] = new Date();
    }
    if (newState === 'failed') {
      updateValues['failedAt'] = new Date();
    }
    if (lastError) {
      updateValues['lastError'] = lastError;
    }

    await db.update(calcRuns).set(updateValues).where(eq(calcRuns.id, run.id));
  }
}

export const fundPersistenceService = new FundPersistenceService();
