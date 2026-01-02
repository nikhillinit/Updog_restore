import type { Request, Response } from 'express';
import { logger } from '../lib/logger';

/**
 * Cancellation endpoint for agent runs
 * DELETE /api/agents/run/:runId
 *
 * Sets a cancellation flag in Redis that workers check periodically
 */

export async function cancel(req: Request, res: Response) {
  const { runId } = req.params;

  try {
    // TODO: Wire to actual Redis client
    // Example:
    // await redis.set(`ai:run:${runId}:cancel`, '1', 'EX', 300);

    // Mock implementation for development
    logger.info({ runId }, 'Agent run cancellation requested');

    // In production, this would set a Redis key:
    // const redis = getRedisClient();
    // await redis.set(`ai:run:${runId}:cancel`, '1', { EX: 300 });

    res["status"](204)["send"]();
  } catch (error) {
    logger.error({ runId: runId ?? 'unknown', error }, 'Failed to cancel agent run');
    res["status"](500)["json"]({
      error: 'Failed to cancel run',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Check if a run has been cancelled
 * Workers should call this periodically during execution
 *
 * @param runId - Run ID to check
 * @returns true if cancellation requested
 */
export async function isCancelled(runId: string): Promise<boolean> {
  try {
    // TODO: Wire to actual Redis client
    // const redis = getRedisClient();
    // const value = await redis.get(`ai:run:${runId}:cancel`);
    // return value === '1';

    return false; // Mock: always return false in development
  } catch (error) {
    logger.error({ runId, error }, 'Failed to check cancellation status');
    return false; // Fail-safe: don't block execution
  }
}
