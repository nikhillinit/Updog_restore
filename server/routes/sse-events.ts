/**
 * Server-Sent Events (SSE) Routes
 *
 * Provides real-time event streaming for clients that prefer SSE over WebSocket.
 * SSE is simpler, uses standard HTTP, and automatically reconnects.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { logger } from '../logger';

const router = Router();

// Store active SSE connections per fund
const activeConnections = new Map<number, Set<Response>>();

// Event types that can be streamed
export type SSEEventType =
  | 'metrics:update'
  | 'simulation:progress'
  | 'simulation:complete'
  | 'allocation:changed'
  | 'scenario:updated'
  | 'forecast:ready'
  | 'heartbeat';

/**
 * GET /api/events/fund/:fundId
 *
 * Establish an SSE connection for real-time fund events
 * Client will receive events as they occur
 */
router['get']('/api/events/fund/:fundId', (req: Request, res: Response) => {
  const fundIdParam = req.params['fundId'];
  const fundId = parseInt(fundIdParam || '0', 10);

  if (isNaN(fundId) || fundId <= 0) {
    return res['status'](400)['json']({
      error: 'Invalid fund ID',
      message: 'Fund ID must be a positive integer',
    });
  }

  // Parse optional event type filter
  const eventTypesParam = req.query['eventTypes'];
  let eventTypes: string[] | undefined;
  if (typeof eventTypesParam === 'string') {
    eventTypes = eventTypesParam.split(',').map((t) => t.trim());
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.flushHeaders();

  // Register this connection
  if (!activeConnections.has(fundId)) {
    activeConnections.set(fundId, new Set());
  }
  activeConnections.get(fundId)!.add(res);

  // Store event type filter on the response object
  (res as any).eventTypeFilter = eventTypes;
  (res as any).fundId = fundId;

  logger.info('SSE connection established', {
    fundId,
    eventTypes,
    connectionCount: activeConnections.get(fundId)!.size,
  });

  // Send initial connection event
  sendSSEEvent(res, 'connected', {
    fundId,
    timestamp: new Date().toISOString(),
    message: 'SSE connection established',
  });

  // Heartbeat to keep connection alive (every 30 seconds)
  const heartbeatInterval = setInterval(() => {
    if (!res.writableEnded) {
      sendSSEEvent(res, 'heartbeat', {
        timestamp: new Date().toISOString(),
        fundId,
      });
    }
  }, 30000);

  // Clean up on disconnect
  req.on('close', () => {
    clearInterval(heartbeatInterval);
    const fundConnections = activeConnections.get(fundId);
    if (fundConnections) {
      fundConnections.delete(res);
      if (fundConnections.size === 0) {
        activeConnections.delete(fundId);
      }
    }
    logger.info('SSE connection closed', {
      fundId,
      remainingConnections: activeConnections.get(fundId)?.size || 0,
    });
  });
});

/**
 * GET /api/events/simulation/:simulationId
 *
 * SSE stream for Monte Carlo simulation progress
 * Streams progress updates and final results
 */
router['get']('/api/events/simulation/:simulationId', (req: Request, res: Response) => {
  const simulationId = req.params['simulationId'];

  if (!simulationId) {
    return res['status'](400)['json']({
      error: 'Invalid simulation ID',
      message: 'Simulation ID is required',
    });
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  logger.info('SSE connection for simulation established', { simulationId });

  // Send initial connection event
  sendSSEEvent(res, 'simulation:connected', {
    simulationId,
    timestamp: new Date().toISOString(),
    message: 'Connected to simulation progress stream',
  });

  // Register for simulation updates
  const simulationConnections = getSimulationConnections(simulationId);
  simulationConnections.add(res);

  // Heartbeat
  const heartbeatInterval = setInterval(() => {
    if (!res.writableEnded) {
      sendSSEEvent(res, 'heartbeat', {
        timestamp: new Date().toISOString(),
        simulationId,
      });
    }
  }, 15000);

  // Clean up on disconnect
  req.on('close', () => {
    clearInterval(heartbeatInterval);
    simulationConnections.delete(res);
    logger.info('Simulation SSE connection closed', { simulationId });
  });
});

// Simulation connections storage
const simulationConnections = new Map<string, Set<Response>>();

function getSimulationConnections(simulationId: string): Set<Response> {
  if (!simulationConnections.has(simulationId)) {
    simulationConnections.set(simulationId, new Set());
  }
  return simulationConnections.get(simulationId)!;
}

/**
 * Send an SSE event to a specific response stream
 */
function sendSSEEvent(res: Response, eventType: string, data: unknown): void {
  if (res.writableEnded) return;

  try {
    res.write(`event: ${eventType}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch (error) {
    logger.error('Failed to send SSE event', { eventType, error });
  }
}

/**
 * Broadcast an event to all SSE connections for a fund
 */
export function broadcastFundEvent(
  fundId: number,
  eventType: SSEEventType,
  data: unknown
): void {
  const connections = activeConnections.get(fundId);
  if (!connections || connections.size === 0) return;

  const payload = {
    ...((data as object) || {}),
    fundId,
    eventType,
    timestamp: new Date().toISOString(),
  };

  connections.forEach((res) => {
    // Check event type filter if set
    const filter = (res as any).eventTypeFilter as string[] | undefined;
    if (!filter || filter.includes(eventType)) {
      sendSSEEvent(res, eventType, payload);
    }
  });

  logger.debug('SSE event broadcast', {
    fundId,
    eventType,
    recipientCount: connections.size,
  });
}

/**
 * Broadcast simulation progress to connected clients
 */
export function broadcastSimulationProgress(
  simulationId: string,
  progress: {
    completedIterations: number;
    totalIterations: number;
    percentComplete: number;
    estimatedTimeRemaining?: number;
    currentPhase?: string;
  }
): void {
  const connections = getSimulationConnections(simulationId);
  if (connections.size === 0) return;

  const payload = {
    simulationId,
    ...progress,
    timestamp: new Date().toISOString(),
  };

  connections.forEach((res) => {
    sendSSEEvent(res, 'simulation:progress', payload);
  });
}

/**
 * Broadcast simulation completion
 */
export function broadcastSimulationComplete(
  simulationId: string,
  results: {
    status: 'completed' | 'failed';
    summary?: unknown;
    error?: string;
  }
): void {
  const connections = getSimulationConnections(simulationId);
  if (connections.size === 0) return;

  const payload = {
    simulationId,
    ...results,
    timestamp: new Date().toISOString(),
  };

  connections.forEach((res) => {
    sendSSEEvent(res, 'simulation:complete', payload);
    // Close the connection after sending completion
    res.end();
  });

  // Clean up simulation connections
  simulationConnections.delete(simulationId);
}

/**
 * Get SSE connection statistics
 */
export function getSSEStats(): {
  totalFundConnections: number;
  totalSimulationConnections: number;
  fundConnectionsPerFund: Record<number, number>;
  activeSimulations: string[];
} {
  const fundConnectionsPerFund: Record<number, number> = {};
  let totalFundConnections = 0;

  activeConnections.forEach((connections, fundId) => {
    fundConnectionsPerFund[fundId] = connections.size;
    totalFundConnections += connections.size;
  });

  let totalSimulationConnections = 0;
  simulationConnections.forEach((connections) => {
    totalSimulationConnections += connections.size;
  });

  return {
    totalFundConnections,
    totalSimulationConnections,
    fundConnectionsPerFund,
    activeSimulations: Array.from(simulationConnections.keys()),
  };
}

export default router;
