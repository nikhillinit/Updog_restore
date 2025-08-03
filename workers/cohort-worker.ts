import { Worker } from 'bullmq';
import { logger } from '../lib/logger';
import { resilientLimit } from '../client/src/utils/resilientLimit';
import { asyncRepl } from '../server/metrics';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

// refactor(async): Replace forEach with controlled concurrency + circuit breaker
const processCohortCompanies = async (companies: any[]) => {
  const limit = resilientLimit({
    concurrency: 3,       // Max 3 concurrent company analyses
    maxFailures: 3,       // Circuit breaker after 3 failures
    resetOnSuccess: true  // Reset failure count on success
  });
  
  // Batch increment counter for this operation
  const migrationCount = 1; // Number of forEach patterns replaced in this function
  
  try {
    const results = await Promise.all(
      companies.map(company => 
        limit(async () => {
          // Simulate cohort analysis per company
          await new Promise(resolve => setTimeout(resolve, 100));
          
          return {
            ...company,
            cohortScore: Math.random() * 100,
            analysisComplete: true,
            processedAt: new Date().toISOString()
          };
        })
      )
    );
    
    // Track successful async forEach replacement
    asyncRepl.inc({ file: 'cohort-worker.ts' }, migrationCount);
    
    return results;
  } catch (error) {
    logger.error('Cohort company processing failed:', error);
    throw error;
  }
};

export const cohortWorker = new Worker(
  'cohort:calc',
  async (job) => {
    const { fundId, correlationId } = job.data;
    
    logger.info('Processing cohort analysis', { fundId, correlationId, jobId: job.id });
    
    // Simulate portfolio companies for cohort analysis
    const mockCompanies = [
      { id: 'comp-1', name: 'TechStart Inc', stage: 'Series A' },
      { id: 'comp-2', name: 'DataFlow LLC', stage: 'Seed' },
      { id: 'comp-3', name: 'AI Solutions Corp', stage: 'Series B' },
    ];
    
    // Process companies with controlled concurrency
    const processedCompanies = await processCohortCompanies(mockCompanies);
    
    return {
      fundId,
      companies: processedCompanies,
      cohortMetrics: {
        totalCompanies: processedCompanies.length,
        avgCohortScore: processedCompanies.reduce((sum, c) => sum + c.cohortScore, 0) / processedCompanies.length,
        completionRate: 100
      },
      calculatedAt: new Date(),
    };
  },
  {
    connection,
    concurrency: 5,
  }
);
