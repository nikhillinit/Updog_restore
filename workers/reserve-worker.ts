import { Worker } from 'bullmq';
import { db } from '../server/db';
import { fundConfigs, fundSnapshots, portfolioCompanies } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { ReserveEngine, generateReserveSummary } from '../client/src/core/reserves/ReserveEngine';
import { logger } from '../lib/logger';
import { withMetrics, metrics } from '../lib/metrics';
import { registerWorker, createHealthServer } from './health-server';
import type { ReserveInput } from '@shared/types';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retries: number = MAX_RETRIES,
  delay: number = RETRY_DELAY_MS
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries === 0) throw error;

    logger.warn(`Retrying operation, ${retries} attempts remaining`, {
      error: (error as Error).message,
      remainingRetries: retries,
    });

    await new Promise((resolve) => setTimeout(resolve, delay));
    return retryWithBackoff(fn, retries - 1, delay * 2);
  }
}

export const reserveWorker = new Worker(
  'reserve-calc',
  async (job) => {
    const { fundId, correlationId } = job.data;

    logger.info('Processing reserve calculation', { fundId, correlationId, jobId: job.id });

    return withMetrics('reserve', async () => {
      const startTime = performance.now();

      try {
        // Load fund configuration with retry logic
        const fundConfig = await retryWithBackoff(() =>
          db.query.fundConfigs.findFirst({
            where: (configs, { eq, and }) =>
              and(eq(configs.fundId, fundId), eq(configs.isPublished, true)),
            orderBy: (configs, { desc }) => desc(configs.version),
          })
        );

        // Fallback to funds table if no published config
        const fund = await retryWithBackoff(() =>
          db.query.funds.findFirst({
            where: (funds, { eq }) => eq(funds.id, fundId),
          })
        );

        if (!fund && !fundConfig) {
          const error = new Error(`Fund ${fundId} not found`);
          logger.error('Fund not found', error, { fundId, correlationId });
          throw error;
        }

        // Load investments with company details
        const investments = await retryWithBackoff(() =>
          db.query.investments.findMany({
            where: (inv, { eq }) => eq(inv.fundId, fundId),
            with: {
              company: true,
            },
          })
        );

        // If no investments, fallback to portfolio companies
        let portfolio: ReserveInput[];

        if (investments.length > 0) {
          portfolio = investments.map((inv) => ({
            id: inv.companyId || inv.id,
            invested: parseFloat(inv.amount),
            ownership: inv.ownershipPercentage ? parseFloat(inv.ownershipPercentage) : 0.15,
            stage: inv.round || 'seed',
            sector: inv.company?.sector || 'unknown',
          }));
        } else {
          // Fallback to portfolio companies
          const portfolioCompanies = await db.query.portfolioCompanies.findMany({
            where: (companies, { eq }) => eq(companies.fundId, fundId),
          });

          portfolio = portfolioCompanies.map((company) => ({
            id: company.id,
            invested: parseFloat(company.investmentAmount || '0'),
            ownership: 0.15, // Default 15% ownership
            stage: company.stage,
            sector: company.sector,
          }));
        }
        
        // Generate reserve calculations
        const reserves = generateReserveSummary(fundId, portfolio);
        
        // Write snapshot to database
        const [snapshot] = await db.insert(fundSnapshots).values({
          fundId,
          type: 'RESERVE',
          payload: reserves as unknown as Record<string, unknown>,
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
        const err = error as Error;
        logger.error('Reserve calculation failed', err, {
          fundId,
          correlationId,
          errorStack: err.stack,
        });

        metrics.counter('reserve_calculation_errors_total', 1, {
          fundId: fundId.toString(),
          errorType: err.name,
        });

        // Re-throw for BullMQ retry handling
        throw error;
      }
    });
  },
  {
    connection,
    concurrency: 5,
    attempts: 3, // Retry failed jobs 3 times
    backoff: {
      type: 'exponential',
      delay: 2000, // Start with 2 second delay
    },
    removeOnComplete: {
      age: 3600, // Keep completed jobs for 1 hour
      count: 100, // Keep max 100 completed jobs
    },
    removeOnFail: {
      age: 86400, // Keep failed jobs for 24 hours
    },
  }
);

// Register worker for health monitoring
registerWorker('reserve-calc', reserveWorker);

// Start health check server
const HEALTH_PORT = parseInt(process.env.RESERVE_WORKER_HEALTH_PORT || '9001');
createHealthServer(HEALTH_PORT);

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Reserve worker shutting down gracefully...');
  await reserveWorker.close();
  logger.info('Reserve worker shut down complete');
});

process.on('SIGINT', async () => {
  logger.info('Reserve worker received SIGINT, shutting down...');
  await reserveWorker.close();
  process.exit(0);
});