import type { Request, Response } from 'express';
import { logger } from '@/lib/logger';

/**
 * SSE Streaming endpoint for agent runs
 * GET /api/agents/stream/:runId
 *
 * Events emitted:
 * - status: { msg: string }
 * - delta: { incremental update }
 * - partial: { partial result }
 * - complete: { final result }
 * - error: { message: string }
 */

export async function stream(req: Request, res: Response) {
  const { runId } = req.params;

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  res.status(200);

  logger.info('SSE stream started', { runId });

  // Send initial connection event
  res.write(`event: status\n`);
  res.write(`data: ${JSON.stringify({ msg: 'Connected' })}\n\n`);

  // Keepalive interval (every 30s)
  const keepalive = setInterval(() => {
    res.write(`: keepalive\n\n`);
  }, 30_000);

  // TODO: Wire to your agent progress bus (Redis pubsub/BullMQ events)
  // Example subscription:
  const unsubscribe = subscribeToAgentEvents(runId, (evt) => {
    try {
      res.write(`event: ${evt.type}\n`);
      res.write(`data: ${JSON.stringify(evt.data)}\n\n`);

      // Auto-close on complete or error
      if (evt.type === 'complete' || evt.type === 'error') {
        cleanup();
      }
    } catch (error) {
      logger.error('SSE write error', { runId, error });
      cleanup();
    }
  });

  // Cleanup on client disconnect
  req.on('close', () => {
    cleanup();
  });

  function cleanup() {
    clearInterval(keepalive);
    unsubscribe();
    logger.info('SSE stream closed', { runId });
    res.end();
  }
}

/**
 * Agent event types
 */
type AgentEvent =
  | { type: 'status'; data: { msg: string } }
  | { type: 'delta'; data: unknown }
  | { type: 'partial'; data: unknown }
  | { type: 'complete'; data: unknown }
  | { type: 'error'; data: { message: string } };

/**
 * Subscribe to agent events
 * TODO: Replace with actual Redis pubsub or BullMQ event subscription
 */
function subscribeToAgentEvents(
  runId: string,
  callback: (evt: AgentEvent) => void
): () => void {
  // Example: mock subscription for development
  const interval = setInterval(() => {
    callback({
      type: 'status',
      data: { msg: 'Processing...' },
    });
  }, 5000);

  // Return unsubscribe function
  return () => {
    clearInterval(interval);
  };

  // Production implementation would look like:
  // const subscriber = redis.duplicate();
  // await subscriber.subscribe(`agent:${runId}:events`);
  // subscriber.on('message', (channel, message) => {
  //   const evt = JSON.parse(message);
  //   callback(evt);
  // });
  // return () => subscriber.unsubscribe();
}
