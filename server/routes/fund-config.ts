import type { Express, Request, Response } from 'express';
import { db } from '../db';
import { funds, fundConfigs, fundEvents, fundSnapshots } from '@schema';
import { eq, and, desc } from 'drizzle-orm';
import type { ApiError } from '@shared/types';
import { Queue } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
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
      const fund = await db.query.funds.findFirst({
        where: eq(funds.id, fundId),
      });

      if (!fund) {
        const error: ApiError = {
          error: 'Fund not found',
          message: `No fund exists with ID: ${fundId}`,
        };
        return res['status'](404)['json'](error);
      }

      // Draft-safe upsert: UPDATE existing draft if found, INSERT if not
      const existingDraft = await db.query.fundConfigs.findFirst({
        where: and(eq(fundConfigs.fundId, fundId), eq(fundConfigs.isDraft, true)),
        orderBy: desc(fundConfigs.version),
      });

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
        console.warn('draft-save', { fundId, fieldCount });

        try {
          const [inserted] = await db
            .insert(fundConfigs)
            .values({
              fundId,
              config: validation.data,
            })
            .returning();
          savedConfig = inserted;
        } catch (insertErr) {
          // Unique constraint race: retry as UPDATE targeting isDraft=true
          const retryDraft = await db.query.fundConfigs.findFirst({
            where: and(eq(fundConfigs.fundId, fundId), eq(fundConfigs.isDraft, true)),
          });
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

      const draft = await db.query.fundConfigs.findFirst({
        where: and(eq(fundConfigs.fundId, fundId), eq(fundConfigs.isDraft, true)),
        orderBy: desc(fundConfigs.version),
      });

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

  // Publish configuration
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
      const correlationId = uuidv4();

      // Get latest draft
      const draft = await db.query.fundConfigs.findFirst({
        where: and(eq(fundConfigs.fundId, fundId), eq(fundConfigs.isDraft, true)),
        orderBy: desc(fundConfigs.version),
      });

      if (!draft) {
        const error: ApiError = {
          error: 'No draft to publish',
          message: 'Create a draft configuration first',
        };
        return res['status'](400)['json'](error);
      }

      // Mark previous published versions as not current (simplified)
      const unpublishedValues: Partial<typeof fundConfigs.$inferInsert> = {
        isPublished: false,
        updatedAt: new Date(),
      };
      await db
        .update(fundConfigs)
        .set(unpublishedValues)
        .where(and(eq(fundConfigs.fundId, fundId), eq(fundConfigs.isPublished, true)));

      // Publish the draft (simplified)
      const publishedValues: Partial<typeof fundConfigs.$inferInsert> = {
        isPublished: true,
        isDraft: false,
        publishedAt: new Date(),
        updatedAt: new Date(),
      };
      const [published] = await db
        .update(fundConfigs)
        .set(publishedValues)
        .where(eq(fundConfigs.id, draft.id))
        .returning();

      // Log publish event (simplified)
      await db.insert(fundEvents).values({
        fundId,
        eventType: 'PUBLISHED',
        eventTime: new Date(),
      });

      // Queue calculation jobs
      const jobOptions = {
        removeOnComplete: true,
        removeOnFail: false,
      };

      if (reserveQueue && pacingQueue && cohortQueue) {
        await Promise.all([
          reserveQueue.add('calculate', { fundId, correlationId }, jobOptions),
          pacingQueue.add('calculate', { fundId, correlationId }, jobOptions),
          cohortQueue.add('calculate', { fundId, correlationId }, jobOptions),
        ]);
      }

      // Log calculation trigger
      const currentUserId = (req as RequestWithOptionalUser).user?.id;
      const calculationTriggeredEvent: typeof fundEvents.$inferInsert = {
        fundId,
        eventType: 'CALC_TRIGGERED',
        eventTime: new Date(),
        payload: {
          engines: ['reserve', 'pacing', 'cohort'],
          correlationId,
        },
        userId: currentUserId ? parseInt(currentUserId, 10) : undefined,
        correlationId,
      };
      await db.insert(fundEvents).values(calculationTriggeredEvent);

      res['json']({
        success: true,
        data: published,
        message: 'Configuration published and calculations queued',
        correlationId,
      });
    } catch (error) {
      console.error('Publish error:', error);
      const apiError: ApiError = {
        error: 'Failed to publish configuration',
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

      const snapshot = await db.query.fundSnapshots.findFirst({
        where: and(eq(fundSnapshots.fundId, fundId), eq(fundSnapshots.type, 'RESERVE')),
        orderBy: desc(fundSnapshots.createdAt),
      });

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
}
