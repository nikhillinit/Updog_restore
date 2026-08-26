import { logger } from '../lib/logger';
import { sanitizeQueueError } from '../server/lib/queue-error-sanitizer';

/**
 * BullMQ emitters with no 'error' listener fall through to a raw
 * console.error(err) inside bullmq, which dumps the failing Redis command —
 * including AUTH credential arguments — into deploy logs. Every Worker and
 * QueueEvents instance must attach this before connecting.
 */
export function attachQueueErrorLogging(
  emitter: { on(event: 'error', listener: (error: Error) => void): unknown },
  label: string
): void {
  emitter.on('error', (error) => {
    logger.error(`${label} queue error`, undefined, { err: sanitizeQueueError(error) });
  });
}
