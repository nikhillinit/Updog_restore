import { Queue } from 'bullmq';

const redis = { 
  host: process.env.REDIS_HOST || '127.0.0.1', 
  port: parseInt(process.env.REDIS_PORT || '6379', 10) 
};

(async () => {
  try {
    const q = new Queue('reserve-calc', { connection: redis });
    console.log('Waiting jobs:', await q.getWaitingCount());
    console.log('Failed jobs:', await q.getFailedCount());
    console.log('Queue connected successfully');
    process.exit(0);
  } catch (error) {
    console.error('Failed to connect to queue:', error);
    process.exit(1);
  }
})();