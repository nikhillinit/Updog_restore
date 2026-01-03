import type { Request, Response } from 'express';
import { logger } from '@/lib/logger';
import { config } from '../config/index.js';

const MAX_BUFFER_BYTES = config.STREAM_BUFFER_SIZE_BYTES; // Default 10 MB per stream
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
    logger.warn('Stream endpoint called without runId', { path: req.path });
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

  res["status"](200);
  res.flushHeaders();

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
      res["end"]();
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
      logger.warn('SSE write error', {
        runId,
        errorMsg: error instanceof Error ? error.message : String(error),
      });
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

    const durationSeconds = (Date.now() - startTime) / 1000;
    logger.info('SSE stream closed', {
      runId,
      bytesSent,
      durationSeconds
    });

    // TODO: Emit metrics
    // prometheus.histogram('ai_stream_duration_seconds').observe(durationSeconds);
    // prometheus.counter('ai_stream_bytes_sent_total').inc(bytesSent);

    res["end"]();
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
 * Subscribe to agent events using BullMQ simulation queue
 */
function subscribeToAgentEvents(
  runId: string,
  callback: (evt: AgentEvent) => void
): () => void {
  // Try to use BullMQ queue subscription if available
  let unsubscribe: (() => void) | null = null;

  // Dynamically import queue module
  import('../queues/simulation-queue')
    .then(({ subscribeToJob, isQueueInitialized }) => {
      if (!isQueueInitialized()) {
        // Queue not available, use mock subscription for development
        const interval = setInterval(() => {
          callback({
            type: 'status',
            data: { msg: 'Processing (mock)...' },
          });
        }, 5000);
        unsubscribe = () => clearInterval(interval);
        return;
      }

      // Subscribe to actual job events
      unsubscribe = subscribeToJob(runId, {
        onProgress: (event) => {
          callback({
            type: 'delta',
            data: {
              progress: event.progress,
              message: event.message,
            },
          });
        },
        onComplete: (event) => {
          callback({
            type: 'complete',
            data: event.result,
          });
        },
        onFailed: (event) => {
          callback({
            type: 'error',
            data: { message: event.error },
          });
        },
      });
    })
    .catch((err) => {
      logger.warn('Failed to load queue module, using mock subscription', { error: err });
      // Fallback to mock
      const interval = setInterval(() => {
        callback({
          type: 'status',
          data: { msg: 'Processing...' },
        });
      }, 5000);
      unsubscribe = () => clearInterval(interval);
    });

  // Return unsubscribe function
  return () => {
    unsubscribe?.();
  };
}
