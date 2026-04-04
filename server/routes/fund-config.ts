import type { Express, Request, Response } from 'express';
import { db } from '../db';
import { funds, fundConfigs, fundEvents, fundSnapshots } from '@schema';
import { eq, and, desc, max } from 'drizzle-orm';
import type { ApiError } from '@shared/types';
import { Queue } from 'bullmq';
import { toNumber, NumberParseError } from '@shared/number';
import { getQueueConnectionOptions, getQueueConfig } from '../config/features';
import { registerQueueRuntime } from '../queues/registry';

const queueConfig = getQueueConfig();
const connection = (() => {
  try {
    return getQueueConnectionOptions();
  } catch {
    return null;
  }
})();

// Initialize queues only when Redis-backed queues are enabled
const reserveQueue =
  queueConfig.enabled && connection ? new Queue('reserve-calc', { connection }) : null;
const pacingQueue =
  queueConfig.enabled && connection ? new Queue('pacing-calc', { connection }) : null;
const cohortQueue =
  queueConfig.enabled && connection ? new Queue('cohort-calc', { connection }) : null;

function ensureProducerQueuesRegistered(): void {
  if (reserveQueue) {
    registerQueueRuntime('reserve-calc', {
      getQueue: () => reserveQueue,
      isInitialized: () => reserveQueue !== null,
    });
  }

  if (pacingQueue) {
    registerQueueRuntime('pacing-calc', {
      getQueue: () => pacingQueue,
      isInitialized: () => pacingQueue !== null,
    });
  }

  if (cohortQueue) {
    registerQueueRuntime('cohort-calc', {
      getQueue: () => cohortQueue,
      isInitialized: () => cohortQueue !== null,
    });
  }
}

import { FundDraftWriteV1Schema } from '@shared/contracts/fund-draft-write-v1.contract';
import { sendApiError } from '../lib/apiError';

type RequestWithOptionalUser = Request & { user?: { id?: string } };

export function registerFundConfigRoutes(app: Express) {
  ensureProducerQueuesRegistered();

  // Atomic finalize: create fund + save config + publish in one call
  app.post('/api/funds/finalize', async (req: Request, res: Response) => {
    try {
      const { FundFinalizeV1Schema: Schema } =
        await import('@shared/contracts/fund-finalize-v1.contract');
      const validation = Schema.safeParse(req.body);
      if (!validation.success) {
        return sendApiError(res, 400, {
          error: 'Finalize payload is invalid',
          code: 'FINALIZE_VALIDATION_ERROR',
          issues: validation.error.issues.map((i) => ({ path: i.path, message: i.message })),
        });
      }

      const { fundPersistenceService } = await import('../services/fund-persistence-service');
      const result = await fundPersistenceService.finalize(validation.data, {
        reserve: reserveQueue,
        pacing: pacingQueue,
        cohort: cohortQueue,
      });

      res['status'](201)['json']({
        success: true as const,
        data: result,
      });
    } catch (error) {
      console.error('Finalize error:', error);
      const apiError: ApiError = {
        error: 'Failed to finalize fund',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
      res['status'](500)['json'](apiError);
    }
  });

  // Save draft configuration (upsert: UPDATE if draft exists, INSERT if not)
  app.put('/api/funds/:id/draft', async (req: Request, res: Response) => {
    try {
      let fundId: number;
      try {
        fundId = toNumber(req.params['id'], 'fund ID', { integer: true, min: 1 });
      } catch (err) {
        if (err instanceof NumberParseError) {
          const error: ApiError = {
            error: 'Invalid fund ID',
            message: err.message,
          };
          return res['status'](400)['json'](error);
        }
        throw err;
      }

      // Validate with strict FundDraftWriteV1Schema (rejects unknown keys)
      const validation = FundDraftWriteV1Schema.safeParse(req.body);
      if (!validation.success) {
        return sendApiError(res, 400, {
          error: 'Draft configuration is invalid',
          code: 'DRAFT_VALIDATION_ERROR',
          issues: validation.error.issues.map((i) => ({ path: i.path, message: i.message })),
        });
      }

      // Check if fund exists
      const [fund] = await db.select().from(funds).where(eq(funds.id, fundId)).limit(1);

      if (!fund) {
        const error: ApiError = {
          error: 'Fund not found',
          message: `No fund exists with ID: ${fundId}`,
        };
        return res['status'](404)['json'](error);
      }

      // Draft-safe upsert: UPDATE existing draft if found, INSERT if not
      const [existingDraft] = await db
        .select()
        .from(fundConfigs)
        .where(and(eq(fundConfigs.fundId, fundId), eq(fundConfigs.isDraft, true)))
        .orderBy(desc(fundConfigs.version))
        .limit(1);

      const fieldCount = Object.keys(validation.data).length;
      let savedConfig;

      if (existingDraft) {
        const priorFieldCount = existingDraft.config
          ? Object.keys(existingDraft.config as Record<string, unknown>).length
          : 0;
        console.warn('draft-save', { fundId, fieldCount, priorFieldCount });

        const updateValues: Partial<typeof fundConfigs.$inferInsert> = {
          config: validation.data,
          updatedAt: new Date(),
        };
        const [updated] = await db
          .update(fundConfigs)
          .set(updateValues)
          .where(eq(fundConfigs.id, existingDraft.id))
          .returning();
        savedConfig = updated;
      } else {
        // No active draft: allocate next version (MAX(version)+1)
        const [versionResult] = await db
          .select({ maxVersion: max(fundConfigs.version) })
          .from(fundConfigs)
          .where(eq(fundConfigs.fundId, fundId));
        const nextVersion = (versionResult?.maxVersion ?? 0) + 1;

        console.warn('draft-save', { fundId, fieldCount, nextVersion });

        try {
          const [inserted] = await db
            .insert(fundConfigs)
            .values({
              fundId,
              version: nextVersion,
              config: validation.data,
            })
            .returning();
          savedConfig = inserted;
        } catch (insertErr) {
          // Unique constraint race: retry as UPDATE targeting isDraft=true
          const [retryDraft] = await db
            .select()
            .from(fundConfigs)
            .where(and(eq(fundConfigs.fundId, fundId), eq(fundConfigs.isDraft, true)))
            .limit(1);
          if (retryDraft) {
            const retryValues: Partial<typeof fundConfigs.$inferInsert> = {
              config: validation.data,
              updatedAt: new Date(),
            };
            const [updated] = await db
              .update(fundConfigs)
              .set(retryValues)
              .where(eq(fundConfigs.id, retryDraft.id))
              .returning();
            savedConfig = updated;
          } else {
            throw insertErr;
          }
        }
      }

      // Log event
      await db.insert(fundEvents).values({
        fundId,
        eventType: 'DRAFT_SAVED',
        eventTime: new Date(),
      });

      res['json']({
        success: true,
        data: savedConfig,
        message: 'Draft saved successfully',
      });
    } catch (error) {
      console.error('Draft save error:', error);
      const apiError: ApiError = {
        error: 'Failed to save draft',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
      res['status'](500)['json'](apiError);
    }
  });

  // Get latest draft
  app['get']('/api/funds/:id/draft', async (req: Request, res: Response) => {
    try {
      let fundId: number;
      try {
        fundId = toNumber(req.params['id'], 'fund ID', { integer: true, min: 1 });
      } catch (err) {
        if (err instanceof NumberParseError) {
          const error: ApiError = {
            error: 'Invalid fund ID',
            message: err.message,
          };
          return res['status'](400)['json'](error);
        }
        throw err;
      }

      const [draft] = await db
        .select()
        .from(fundConfigs)
        .where(and(eq(fundConfigs.fundId, fundId), eq(fundConfigs.isDraft, true)))
        .orderBy(desc(fundConfigs.version))
        .limit(1);

      if (!draft) {
        const error: ApiError = {
          error: 'No draft found',
          message: 'No draft configuration exists for this fund',
        };
        return res['status'](404)['json'](error);
      }

      res['json'](draft);
    } catch (error) {
      const apiError: ApiError = {
        error: 'Failed to fetch draft',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
      res['status'](500)['json'](apiError);
    }
  });

  // Publish configuration (delegates to FundPersistenceService)
  app.post('/api/funds/:id/publish', async (req: Request, res: Response) => {
    try {
      let fundId: number;
      try {
        fundId = toNumber(req.params['id'], 'fund ID', { integer: true, min: 1 });
      } catch (err) {
        if (err instanceof NumberParseError) {
          const error: ApiError = {
            error: 'Invalid fund ID',
            message: err.message,
          };
          return res['status'](400)['json'](error);
        }
        throw err;
      }

      const currentUserId = (req as RequestWithOptionalUser).user?.id;
      const userId = currentUserId ? parseInt(currentUserId, 10) : undefined;

      const { fundPersistenceService } = await import('../services/fund-persistence-service');
      const result = await fundPersistenceService.publishDraft(
        fundId,
        { reserve: reserveQueue, pacing: pacingQueue, cohort: cohortQueue },
        userId
      );

      res['json']({
        success: true,
        data: result.published,
        message: 'Configuration published and calculations started',
        correlationId: result.correlationId,
        runId: result.run.id,
        dispatchState: result.run.dispatchState,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'No draft to publish') {
        const apiError: ApiError = {
          error: 'No draft to publish',
          message: 'Create a draft configuration first',
        };
        return res['status'](400)['json'](apiError);
      }
      console.error('Publish error:', error);
      const apiError: ApiError = {
        error: 'Failed to publish configuration',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
      res['status'](500)['json'](apiError);
    }
  });

  // Recalculate published configuration
  app.post('/api/funds/:id/recalculate', async (req: Request, res: Response) => {
    try {
      let fundId: number;
      try {
        fundId = toNumber(req.params['id'], 'fund ID', { integer: true, min: 1 });
      } catch (err) {
        if (err instanceof NumberParseError) {
          const error: ApiError = {
            error: 'Invalid fund ID',
            message: err.message,
          };
          return res['status'](400)['json'](error);
        }
        throw err;
      }

      const currentUserId = (req as RequestWithOptionalUser).user?.id;
      const userId = currentUserId ? parseInt(currentUserId, 10) : undefined;

      const { fundPersistenceService } = await import('../services/fund-persistence-service');

      const result = await fundPersistenceService.recalculatePublished(
        fundId,
        { reserve: reserveQueue, pacing: pacingQueue, cohort: cohortQueue },
        userId
      );

      res['json']({
        success: true,
        correlationId: result.correlationId,
        runId: result.run.id,
        dispatchState: result.run.dispatchState,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'NoPublishedConfigError') {
        const apiError: ApiError = {
          error: 'No published configuration',
          message: 'Publish a configuration first',
        };
        return res['status'](400)['json'](apiError);
      }
      if (error instanceof Error && error.name === 'CalculationInProgressError') {
        const apiError: ApiError = {
          error: 'Calculation already in progress',
          message: 'Wait for the current calculation to complete',
        };
        return res['status'](409)['json'](apiError);
      }
      console.error('Recalculate error:', error);
      const apiError: ApiError = {
        error: 'Failed to recalculate',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
      res['status'](500)['json'](apiError);
    }
  });

  // Get fund reserves (from snapshots)
  app['get']('/api/funds/:id/reserves', async (req: Request, res: Response) => {
    try {
      let fundId: number;
      try {
        fundId = toNumber(req.params['id'], 'fund ID', { integer: true, min: 1 });
      } catch (err) {
        if (err instanceof NumberParseError) {
          const error: ApiError = {
            error: 'Invalid fund ID',
            message: err.message,
          };
          return res['status'](400)['json'](error);
        }
        throw err;
      }

      const [snapshot] = await db
        .select()
        .from(fundSnapshots)
        .where(and(eq(fundSnapshots.fundId, fundId), eq(fundSnapshots.type, 'RESERVE')))
        .orderBy(desc(fundSnapshots.createdAt))
        .limit(1);

      if (!snapshot) {
        const error: ApiError = {
          error: 'No reserve calculations found',
          message: 'Publish a fund configuration to trigger calculations',
        };
        return res['status'](404)['json'](error);
      }

      // Check if snapshot is stale (> 24 hours old)
      const isStale = snapshot.createdAt
        ? new Date().getTime() - snapshot.createdAt.getTime() > 24 * 60 * 60 * 1000
        : true;

      res['json']({
        reserves: snapshot.payload,
        calculatedAt: snapshot.createdAt,
        version: snapshot.calcVersion,
        correlationId: snapshot.correlationId,
        stale: isStale,
      });
    } catch (error) {
      const apiError: ApiError = {
        error: 'Failed to fetch reserves',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
      res['status'](500)['json'](apiError);
    }
  });

  // Get fund lifecycle state (two-axis: config + calculation)
  app['get']('/api/funds/:id/state', async (req: Request, res: Response) => {
    try {
      let fundId: number;
      try {
        fundId = toNumber(req.params['id'], 'fund ID', { integer: true, min: 1 });
      } catch (err) {
        if (err instanceof NumberParseError) {
          const error: ApiError = {
            error: 'Invalid fund ID',
            message: err.message,
          };
          return res['status'](400)['json'](error);
        }
        throw err;
      }

      const { fundStateReadService } = await import('../services/fund-state-read-service');
      const state = await fundStateReadService.getState(fundId);

      if (!state) {
        const error: ApiError = {
          error: 'Fund not found',
          message: `No fund exists with ID: ${fundId}`,
        };
        return res['status'](404)['json'](error);
      }

      res['json'](state);
    } catch (error) {
      console.error('Fund state read error:', error);
      const apiError: ApiError = {
        error: 'Failed to read fund state',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
      res['status'](500)['json'](apiError);
    }
  });

  // GET /api/funds/:id/results -- Phase 3 results read model
  app.get('/api/funds/:id/results', async (req, res) => {
    const idParam = Number(req.params['id']);
    if (!Number.isFinite(idParam) || idParam <= 0 || !Number.isInteger(idParam)) {
      return res.status(400).json({ error: 'Invalid fund ID' });
    }
    try {
      const { fundResultsReadService } = await import('../services/fund-results-read-service');
      const results = await fundResultsReadService.getResults(idParam);
      if (!results) {
        return res.status(404).json({ error: 'Fund not found' });
      }
      return res.json(results);
    } catch (err) {
      console.error('[fund-results] Error:', err);
      return res.status(500).json({ error: 'Failed to read fund results' });
    }
  });

  // GET /api/funds/:id/lifecycle-history -- M6 lifecycle history read model
  app['get']('/api/funds/:id/lifecycle-history', async (req: Request, res: Response) => {
    try {
      let fundId: number;
      try {
        fundId = toNumber(req.params['id'], 'fund ID', { integer: true, min: 1 });
      } catch (err) {
        if (err instanceof NumberParseError) {
          const error: ApiError = {
            error: 'Invalid fund ID',
            message: err.message,
          };
          return res['status'](400)['json'](error);
        }
        throw err;
      }

      const { fundLifecycleHistoryService } =
        await import('../services/fund-lifecycle-history-service');
      const history = await fundLifecycleHistoryService.getHistory(fundId);

      if (!history) {
        const error: ApiError = {
          error: 'Fund not found',
          message: `No fund exists with ID: ${fundId}`,
        };
        return res['status'](404)['json'](error);
      }

      res['json'](history);
    } catch (error) {
      console.error('[lifecycle-history] Error:', error);
      const apiError: ApiError = {
        error: 'Failed to read lifecycle history',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
      res['status'](500)['json'](apiError);
    }
  });

  // GET /api/funds/:id/results-comparison -- Post-stabilization results comparison read model
  // Summary-level comparison only: this route is intentionally narrow and must
  // not be treated as automatic authorization for broader PR4 live-surface
  // rollout or generic forecasting API expansion.
  app['get']('/api/funds/:id/results-comparison', async (req: Request, res: Response) => {
    try {
      let fundId: number;
      try {
        fundId = toNumber(req.params['id'], 'fund ID', { integer: true, min: 1 });
      } catch (err) {
        if (err instanceof NumberParseError) {
          const error: ApiError = {
            error: 'Invalid fund ID',
            message: err.message,
          };
          return res['status'](400)['json'](error);
        }
        throw err;
      }

      const { fundResultsComparisonService } =
        await import('../services/fund-results-comparison-service');
      const comparison = await fundResultsComparisonService.getComparison(fundId);

      if (!comparison) {
        const error: ApiError = {
          error: 'Fund not found',
          message: `No fund exists with ID: ${fundId}`,
        };
        return res['status'](404)['json'](error);
      }

      res['json'](comparison);
    } catch (error) {
      console.error('[results-comparison] Error:', error);
      const apiError: ApiError = {
        error: 'Failed to read results comparison',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
      res['status'](500)['json'](apiError);
    }
  });
}
