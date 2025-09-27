import { Worker } from 'bullmq';
import { logger } from '../lib/logger';
import { getConfig } from '../server/config';

// Exit early if in demo mode
const config = getConfig();
if (config.DEMO_MODE) {
  console.log('[pacing-worker] DEMO_MODE=1: worker disabled');
  process.exit(0);
}

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

export const pacingWorker = new Worker(
  'pacing:calc',
  async (job) => {
    const { fundId, correlationId } = job.data;
    
    logger.info('Processing pacing calculation', { fundId, correlationId, jobId: job.id });
    
    // TODO: Implement pacing calculation
    return {
      fundId,
      message: 'Pacing calculation not yet implemented',
      calculatedAt: new Date(),
    };
  },
  {
    connection,
    concurrency: 5,
  }
);