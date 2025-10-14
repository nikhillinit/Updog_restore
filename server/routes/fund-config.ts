/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db";
import { funds, fundConfigs, fundEvents, fundSnapshots } from "@schema";
import { eq, and, desc } from "drizzle-orm";
import type { ApiError } from "@shared/types";
import { Queue } from "bullmq";
import { v4 as uuidv4 } from "uuid";
import { toNumber, NumberParseError } from "@shared/number";

// Extend Request type to include user property
interface AuthenticatedRequest extends Request {
  user?: { id: string };
}

// Redis connection for queue
const connection = {
  host: process.env['REDIS_HOST'] || 'localhost',
  port: parseInt(process.env['REDIS_PORT'] || '6379'),
};

const queuesEnabled =
  process.env['ENABLE_QUEUES'] === '1' &&
  process.env['REDIS_URL'] &&
  process.env['REDIS_URL'] !== 'memory://';

// Initialize queues only when Redis-backed queues are enabled
const reserveQueue = queuesEnabled ? new Queue('reserve-calc', { connection }) : null;
const pacingQueue = queuesEnabled ? new Queue('pacing-calc', { connection }) : null;
const cohortQueue = queuesEnabled ? new Queue('cohort-calc', { connection }) : null;

// Zod schema for draft validation. This ensures data passed to background
// jobs conforms to the limits of downstream AI/ML models.
const draftConfigSchema = z.object({
  strategy: z.string().max(256, "Strategy must be 256 characters or less").optional(),
  // Add any other text fields from the draft body that are used by the engines.
}).passthrough(); // Allows other fields not defined in the schema

export function registerFundConfigRoutes(app: Express) {
  // Save draft configuration
  app.put("/api/funds/:id/draft", async (req: AuthenticatedRequest, res: Response) => {
    try {
      let fundId: number;
      try {
        fundId = toNumber(req.params["id"], 'fund ID', { integer: true, min: 1 });
      } catch (err) {
        if (err instanceof NumberParseError) {
          const error: ApiError = {
            error: 'Invalid fund ID',
            message: err.message
          };
          return res.status(400).json(error);
        }
        throw err;
      }

      // Validate the request body against the schema
      const validation = draftConfigSchema.safeParse(req.body);
      if (!validation.success) {
        const error: ApiError = {
          error: 'Validation failed',
          message: 'Draft configuration is invalid.',
          details: validation.error.flatten(),
        };
        return res.status(400).json(error);
      }

      // Check if fund exists
      const fund = await db.query.funds.findFirst({
        where: eq(funds.id, fundId)
      });

      if (!fund) {
        const error: ApiError = {
          error: 'Fund not found',
          message: `No fund exists with ID: ${fundId}`
        };
        return res.status(404).json(error);
      }

      // Get latest version
      const latestConfig = await db.query.fundConfigs.findFirst({
        where: eq(fundConfigs.fundId, fundId),
        orderBy: desc(fundConfigs.version)
      });

      const nextVersion = (latestConfig?.version || 0) + 1;

      // Save draft (version, isDraft, isPublished use schema defaults)
      const [newConfig] = await db.insert(fundConfigs).values({
        fundId,
        config: req.body
      }).returning();

      // Log event (simplified insert with required fields only)
      await db.insert(fundEvents).values({
        fundId,
        eventType: 'DRAFT_SAVED',
        eventTime: new Date()
      });

      res.json({
        success: true,
        data: newConfig,
        message: 'Draft saved successfully'
      });
    } catch (error) {
      console.error('Draft save error:', error);
      const apiError: ApiError = {
        error: 'Failed to save draft',
        message: error instanceof Error ? error.message : 'Unknown error'
      };
      res.status(500).json(apiError);
    }
  });

  // Get latest draft
  app['get']("/api/funds/:id/draft", async (req: Request, res: Response) => {
    try {
      let fundId: number;
      try {
        fundId = toNumber(req.params["id"], 'fund ID', { integer: true, min: 1 });
      } catch (err) {
        if (err instanceof NumberParseError) {
          const error: ApiError = {
            error: 'Invalid fund ID',
            message: err.message
          };
          return res.status(400).json(error);
        }
        throw err;
      }
      
      const draft = await db.query.fundConfigs.findFirst({
        where: and(
          eq(fundConfigs.fundId, fundId),
          eq(fundConfigs.isDraft, true)
        ),
        orderBy: desc(fundConfigs.version)
      });

      if (!draft) {
        const error: ApiError = {
          error: 'No draft found',
          message: 'No draft configuration exists for this fund'
        };
        return res.status(404).json(error);
      }

      res.json(draft);
    } catch (error) {
      const apiError: ApiError = {
        error: 'Failed to fetch draft',
        message: error instanceof Error ? error.message : 'Unknown error'
      };
      res.status(500).json(apiError);
    }
  });

  // Publish configuration
  app.post("/api/funds/:id/publish", async (req: AuthenticatedRequest, res: Response) => {
    try {
      let fundId: number;
      try {
        fundId = toNumber(req.params["id"], 'fund ID', { integer: true, min: 1 });
      } catch (err) {
        if (err instanceof NumberParseError) {
          const error: ApiError = {
            error: 'Invalid fund ID',
            message: err.message
          };
          return res.status(400).json(error);
        }
        throw err;
      }
      const correlationId = uuidv4();
      
      // Get latest draft
      const draft = await db.query.fundConfigs.findFirst({
        where: and(
          eq(fundConfigs.fundId, fundId),
          eq(fundConfigs.isDraft, true)
        ),
        orderBy: desc(fundConfigs.version)
      });

      if (!draft) {
        const error: ApiError = {
          error: 'No draft to publish',
          message: 'Create a draft configuration first'
        };
        return res.status(400).json(error);
      }

      // Mark previous published versions as not current (simplified)
      await db.update(fundConfigs)
        ['set']({ 
          isPublished: false,
          updatedAt: new Date()
        } as any)
        .where(and(
          eq(fundConfigs.fundId, fundId),
          eq(fundConfigs.isPublished, true)
        ));

      // Publish the draft (simplified)
      const [published] = await db.update(fundConfigs)
        ['set']({
          isPublished: true,
          isDraft: false,
          publishedAt: new Date(),
          updatedAt: new Date()
        } as any)
        .where(eq(fundConfigs.id, draft.id))
        .returning();

      // Log publish event (simplified)
      await db.insert(fundEvents).values({
        fundId,
        eventType: 'PUBLISHED',
        eventTime: new Date()
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
      await db.insert(fundEvents).values({
        fundId,
        eventType: 'CALC_TRIGGERED',
        eventTime: new Date(),
        payload: { 
          engines: ['reserve', 'pacing', 'cohort'],
          correlationId 
        },
        userId: req.user?.id ? parseInt(req.user.id) : undefined,
        correlationId
      } as any);

      res.json({
        success: true,
        data: published,
        message: 'Configuration published and calculations queued',
        correlationId,
      });
    } catch (error) {
      console.error('Publish error:', error);
      const apiError: ApiError = {
        error: 'Failed to publish configuration',
        message: error instanceof Error ? error.message : 'Unknown error'
      };
      res.status(500).json(apiError);
    }
  });

  // Get fund reserves (from snapshots)
  app['get']("/api/funds/:id/reserves", async (req: Request, res: Response) => {
    try {
      let fundId: number;
      try {
        fundId = toNumber(req.params["id"], 'fund ID', { integer: true, min: 1 });
      } catch (err) {
        if (err instanceof NumberParseError) {
          const error: ApiError = {
            error: 'Invalid fund ID',
            message: err.message
          };
          return res.status(400).json(error);
        }
        throw err;
      }
      
      const snapshot = await db.query.fundSnapshots.findFirst({
        where: and(
          eq(fundSnapshots.fundId, fundId),
          eq(fundSnapshots.type, 'RESERVE')
        ),
        orderBy: desc(fundSnapshots.createdAt)
      });

      if (!snapshot) {
        const error: ApiError = {
          error: 'No reserve calculations found',
          message: 'Publish a fund configuration to trigger calculations'
        };
        return res.status(404).json(error);
      }

      // Check if snapshot is stale (> 24 hours old)
      const isStale = snapshot.createdAt 
        ? new Date().getTime() - snapshot.createdAt.getTime() > 24 * 60 * 60 * 1000
        : true;

      res.json({
        reserves: snapshot.payload,
        calculatedAt: snapshot.createdAt,
        version: snapshot.calcVersion,
        correlationId: snapshot.correlationId,
        stale: isStale,
      });
    } catch (error) {
      const apiError: ApiError = {
        error: 'Failed to fetch reserves',
        message: error instanceof Error ? error.message : 'Unknown error'
      };
      res.status(500).json(apiError);
    }
  });
}
