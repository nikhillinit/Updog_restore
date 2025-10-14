import type { Request, Response } from 'express';
import { logger } from '@/lib/logger';

const MAX_BUFFER_BYTES = 10 * 1024 * 1024; // 10 MB per stream
const KEEPALIVE_INTERVAL_MS = 25_000; // 25 seconds

/**
 * SSE Streaming endpoint for agent runs with backpressure protection
 * GET /api/agents/stream/:runId
 *
 * Features:
 * - 10 MB buffer limit with graceful close
 * - Keepalive pings every 25s
 * - Automatic cleanup on disconnect
 * - Byte tracking for observability
 *
 * Events emitted:
 * - status: { msg: string }
 * - delta: { incremental update }
 * - partial: { partial result }
 * - complete: { final result }
 * - error: { message: string, code?: string }
 */

export async function stream(req: Request, res: Response) {
  const { runId } = req.params;
  if (!runId) {
    res.status(400).json({ error: 'Missing runId parameter' });
    return;
  }
  let bytesSent = 0;
  const startTime = Date.now();

  // Set SSE headers
  res["setHeader"]('Content-Type', 'text/event-stream');
  res["setHeader"]('Cache-Control', 'no-cache, no-transform');
  res["setHeader"]('Connection', 'keep-alive');
  res["setHeader"]('Access-Control-Allow-Origin', '*');
  res["setHeader"]('X-Accel-Buffering', 'no'); // Disable nginx buffering

  res.status(200);
  res["flushHeaders"]();

  logger.info('SSE stream started', { runId, maxBytes: MAX_BUFFER_BYTES });

  // Send retry hint
  res["write"](`retry: 3000\n\n`);

  /**
   * Write SSE event with backpressure check
   */
  const writeEvent = (eventType: string, data: unknown): boolean => {
    const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    const eventSize = Buffer.byteLength(payload, 'utf8');

    // Backpressure check
    if (bytesSent + eventSize > MAX_BUFFER_BYTES) {
      const errorPayload = `event: error\ndata: ${JSON.stringify({
        code: 'stream-limit-exceeded',
        message: `Stream exceeded ${MAX_BUFFER_BYTES} byte limit`,
        limitBytes: MAX_BUFFER_BYTES,
        bytesSent
      })}\n\n`;
      res["write"](errorPayload);

      logger.warn('SSE stream limit exceeded', {
        runId,
        bytesSent,
        limitBytes: MAX_BUFFER_BYTES
      });

      cleanup();
      res.end();
      return false;
    }

    res["write"](payload);
    bytesSent += eventSize;
    return true;
  };

  // Send initial connection event
  writeEvent('status', { msg: 'Connected' });

  // Keepalive interval (every 25s)
  const keepalive = setInterval(() => {
    res["write"](`:keepalive ${Date.now()}\n\n`);
  }, KEEPALIVE_INTERVAL_MS);

  // TODO: Wire to your agent progress bus (Redis pubsub/BullMQ events)
  // Example subscription:
  const unsubscribe = subscribeToAgentEvents(runId, (evt) => {
    try {
      const success = writeEvent(evt.type, evt.data);

      // Auto-close on complete or error
      if (!success || evt.type === 'complete' || evt.type === 'error') {
        cleanup();
      }
    } catch (error) {
      logger.error('SSE write error', { runId, error });
      cleanup();
    }
  });

  // Cleanup on client disconnect
  req["on"]('close', () => {
    cleanup();
  });

  function cleanup() {
    clearInterval(keepalive);
    unsubscribe();

    const durationSeconds = (Date.now() - startTime) / 1000;
    logger.info('SSE stream closed', {
      runId,
      bytesSent,
      durationSeconds
    });

    // TODO: Emit metrics
    // prometheus.histogram('ai_stream_duration_seconds').observe(durationSeconds);
    // prometheus.counter('ai_stream_bytes_sent_total').inc(bytesSent);

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
