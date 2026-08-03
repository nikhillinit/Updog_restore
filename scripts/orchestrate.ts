#!/usr/bin/env ts-node

import { Queue } from 'bullmq';
import express from 'express';
import { reserveWorker } from '../workers/reserve-worker';
import { pacingWorker } from '../workers/pacing-worker';
import { cohortWorker } from '../workers/cohort-worker';
import { logger } from '../lib/logger';

// Redis connection config
const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

// Initialize queues
const queues = {
  reserve: new Queue('reserve:calc', { connection }),
  pacing: new Queue('pacing:calc', { connection }),
  cohort: new Queue('cohort:calc', { connection }),
};

// Health check server
const app = express();
app.get('/health', async (req, res) => {
  const status = {
    uptime: process.uptime(),
    queues: {},
  };

  for (const [name, queue] of Object.entries(queues)) {
    const counts = await queue.getJobCounts();
    status.queues[name] = counts;
  }

  res.json(status);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down orchestrator...');

  // Close workers
  await Promise.all([reserveWorker.close(), pacingWorker.close(), cohortWorker.close()]);

  // Close queues
  await Promise.all(Object.values(queues).map((q) => q.close()));

  process.exit(0);
});

// Start health check server
const PORT = process.env.ORCHESTRATOR_PORT || 3002;
app.listen(PORT, () => {
  logger.info(`Orchestrator health check running on port ${PORT}`);
  logger.info('Workers started:', {
    reserve: reserveWorker.name,
    pacing: pacingWorker.name,
    cohort: cohortWorker.name,
  });
});
