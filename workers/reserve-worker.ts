import { Worker } from 'bullmq';
import { db } from '../server/db';
import { fundConfigs, fundSnapshots, portfolioCompanies } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { ReserveEngine, generateReserveSummary } from '../client/src/core/reserves/ReserveEngine';
import { logger } from '../lib/logger';
import { withMetrics, metrics } from '../lib/metrics';
import type { ReserveInput } from '@shared/types';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

export const reserveWorker = new Worker(
  'reserve-calc',
  async (job) => {
    const { fundId, correlationId } = job.data;
    
    logger.info('Processing reserve calculation', { fundId, correlationId, jobId: job.id });
    
    return withMetrics('reserve', async () => {
      const startTime = performance.now();
      
      try {
        // TODO: Load fund config from fund_configs table
        // For now, use existing funds table
        const fund = await db.query.funds.findFirst({
          where: (funds, { eq }) => eq(funds.id, fundId),
        });
        
        if (!fund) {
          throw new Error(`Fund ${fundId} not found`);
        }
        
        // TODO: Load investments from investments table
        // For now, use portfolio companies as a proxy
        const portfolioCompanies = await db.query.portfolioCompanies.findMany({
          where: (companies, { eq }) => eq(companies.fundId, fundId),
        });
        
        // Transform to ReserveInput format
        const portfolio: ReserveInput[] = portfolioCompanies.map((company, index) => ({
          id: company.id,
          invested: parseFloat(company.investmentAmount || '0'),
          ownership: 0.15, // Default 15% ownership for now
          stage: company.stage,
          sector: company.sector,
        }));
        
        // Generate reserve calculations
        const reserves = generateReserveSummary(fundId, portfolio);
        
        // Write snapshot to database
        const [snapshot] = await db.insert(fundSnapshots).values({
          fundId,
          type: 'RESERVE',
          payload: reserves as any, // JSONB expects any
          calcVersion: process.env.ALG_RESERVE_VERSION || '1.0.0',
          correlationId,
          metadata: {
            portfolioCount: portfolio.length,
            engineRuntime: performance.now() - startTime,
          },
        }).returning();
        
        // Record metrics
        metrics.recordSnapshotWrite('RESERVE', true);
        
        logger.info('Reserve calculation completed', {
          fundId,
          correlationId,
          snapshotId: snapshot.id,
          totalAllocation: reserves.totalAllocation,
          avgConfidence: reserves.avgConfidence,
        });
        
        return {
          fundId,
          snapshotId: snapshot.id,
          reserves,
          calculatedAt: snapshot.createdAt,
          version: snapshot.calcVersion,
        };
      } catch (error) {
        logger.error('Reserve calculation failed', error as Error, {
          fundId,
          correlationId,
        });
        throw error;
      }
    });
  },
  {
    connection,
    concurrency: 5,
    removeOnComplete: {
      age: 3600, // Keep completed jobs for 1 hour
      count: 100, // Keep max 100 completed jobs
    },
    removeOnFail: {
      age: 86400, // Keep failed jobs for 24 hours
    },
  }
);