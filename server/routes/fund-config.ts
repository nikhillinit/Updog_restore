import type { Express } from "express";
import { z } from "zod";
import { db } from "../db";
import { funds, fundConfigs, fundEvents, fundSnapshots } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import type { ApiError } from "@shared/types";
import { Queue } from "bullmq";
import { v4 as uuidv4 } from "uuid";

// Redis connection for queue
const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

// Initialize queues
const reserveQueue = new Queue('reserve-calc', { connection });
const pacingQueue = new Queue('pacing-calc', { connection });
const cohortQueue = new Queue('cohort-calc', { connection });

export function registerFundConfigRoutes(app: Express) {
  // Save draft configuration
  app.put("/api/funds/:id/draft", async (req, res) => {
    try {
      const fundId = parseInt(req.params.id);
      
      if (isNaN(fundId)) {
        const error: ApiError = {
          error: 'Invalid fund ID',
          message: 'Fund ID must be a number'
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

      // Save draft
      const [newConfig] = await db.insert(fundConfigs).values({
        fundId,
        version: nextVersion,
        config: req.body,
        isDraft: true,
        isPublished: false,
      }).returning();

      // Log event
      await db.insert(fundEvents).values({
        fundId,
        eventType: 'DRAFT_SAVED',
        payload: { version: nextVersion },
        userId: req.user?.id,
        correlationId: uuidv4(),
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
  app.get("/api/funds/:id/draft", async (req, res) => {
    try {
      const fundId = parseInt(req.params.id);
      
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
  app.post("/api/funds/:id/publish", async (req, res) => {
    try {
      const fundId = parseInt(req.params.id);
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

      // Mark previous published versions as not current
      await db.update(fundConfigs)
        .set({ isPublished: false })
        .where(and(
          eq(fundConfigs.fundId, fundId),
          eq(fundConfigs.isPublished, true)
        ));

      // Publish the draft
      const [published] = await db.update(fundConfigs)
        .set({
          isDraft: false,
          isPublished: true,
          publishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(fundConfigs.id, draft.id))
        .returning();

      // Log publish event
      await db.insert(fundEvents).values({
        fundId,
        eventType: 'PUBLISHED',
        payload: { 
          version: published.version,
          config: published.config 
        },
        userId: req.user?.id,
        correlationId,
      });

      // Queue calculation jobs
      const jobOptions = {
        removeOnComplete: true,
        removeOnFail: false,
      };

      await Promise.all([
        reserveQueue.add('calculate', { fundId, correlationId }, jobOptions),
        pacingQueue.add('calculate', { fundId, correlationId }, jobOptions),
        cohortQueue.add('calculate', { fundId, correlationId }, jobOptions),
      ]);

      // Log calculation trigger
      await db.insert(fundEvents).values({
        fundId,
        eventType: 'CALC_TRIGGERED',
        payload: { 
          engines: ['reserve', 'pacing', 'cohort'],
          correlationId 
        },
        userId: req.user?.id,
        correlationId,
      });

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
  app.get("/api/funds/:id/reserves", async (req, res) => {
    try {
      const fundId = parseInt(req.params.id);
      
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