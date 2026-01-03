/**
 * Portfolio Metrics WebSocket
 *
 * Real-time metrics streaming for portfolio intelligence features.
 * Handles live updates for simulations, forecasts, and scenario metrics.
 */

import type { Server as HTTPServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { z } from 'zod';
import { logger } from '../logger';

// Message schemas
const SubscribeSchema = z.object({
  type: z.literal('subscribe'),
  channel: z.enum(['metrics', 'simulation', 'scenario', 'forecast']),
  fundId: z.number().int().positive().optional(),
  entityId: z.string().uuid().optional(),
});

const UnsubscribeSchema = z.object({
  type: z.literal('unsubscribe'),
  channel: z.enum(['metrics', 'simulation', 'scenario', 'forecast']),
  fundId: z.number().int().positive().optional(),
  entityId: z.string().uuid().optional(),
});

type Channel = 'metrics' | 'simulation' | 'scenario' | 'forecast';

interface ClientSubscription {
  channels: Set<string>;
  ws: WebSocket;
  lastPing: number;
}

export class PortfolioMetricsWebSocket {
  private wss: WebSocketServer;
  private clients = new Map<WebSocket, ClientSubscription>();
  private channelSubscribers = new Map<string, Set<WebSocket>>();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(server: HTTPServer) {
    this.wss = new WebSocketServer({
      server,
      path: '/ws/portfolio-metrics',
    });

    this.wss.on('connection', this.handleConnection.bind(this));
    this.startHeartbeat();

    logger.info('[PortfolioMetricsWS] WebSocket server initialized on /ws/portfolio-metrics');
  }

  private handleConnection(ws: WebSocket) {
    const subscription: ClientSubscription = {
      channels: new Set(),
      ws,
      lastPing: Date.now(),
    };
    this.clients.set(ws, subscription);

    logger.info('[PortfolioMetricsWS] Client connected', {
      totalClients: this.clients.size,
    });

    // Send welcome message
    this.sendToClient(ws, {
      type: 'connected',
      timestamp: new Date().toISOString(),
      message: 'Connected to portfolio metrics stream',
    });

    ws.on('message', (data) => this.handleMessage(ws, data));
    ws.on('close', () => this.handleDisconnect(ws));
    ws.on('error', (error) => {
      logger.error('[PortfolioMetricsWS] WebSocket error:', error);
    });
    ws.on('pong', () => {
      const client = this.clients.get(ws);
      if (client) {
        client.lastPing = Date.now();
      }
    });
  }

  private handleMessage(ws: WebSocket, data: unknown) {
    try {
      const message = JSON.parse(String(data));

      // Handle subscribe
      const subscribeResult = SubscribeSchema.safeParse(message);
      if (subscribeResult.success) {
        this.handleSubscribe(ws, subscribeResult.data);
        return;
      }

      // Handle unsubscribe
      const unsubscribeResult = UnsubscribeSchema.safeParse(message);
      if (unsubscribeResult.success) {
        this.handleUnsubscribe(ws, unsubscribeResult.data);
        return;
      }

      // Handle ping
      if (message.type === 'ping') {
        this.sendToClient(ws, {
          type: 'pong',
          timestamp: Date.now(),
        });
        return;
      }

      // Unknown message type
      this.sendToClient(ws, {
        type: 'error',
        message: 'Unknown message type',
      });
    } catch (error) {
      this.sendToClient(ws, {
        type: 'error',
        message: 'Invalid message format',
      });
    }
  }

  private handleSubscribe(
    ws: WebSocket,
    data: z.infer<typeof SubscribeSchema>
  ) {
    const channelKey = this.getChannelKey(data.channel, data.fundId, data.entityId);
    const client = this.clients.get(ws);

    if (!client) return;

    // Add to client's subscriptions
    client.channels.add(channelKey);

    // Add to channel subscribers
    if (!this.channelSubscribers.has(channelKey)) {
      this.channelSubscribers.set(channelKey, new Set());
    }
    this.channelSubscribers.get(channelKey)!.add(ws);

    logger.info('[PortfolioMetricsWS] Client subscribed', {
      channel: channelKey,
      subscriberCount: this.channelSubscribers.get(channelKey)?.size,
    });

    this.sendToClient(ws, {
      type: 'subscribed',
      channel: channelKey,
      timestamp: new Date().toISOString(),
    });
  }

  private handleUnsubscribe(
    ws: WebSocket,
    data: z.infer<typeof UnsubscribeSchema>
  ) {
    const channelKey = this.getChannelKey(data.channel, data.fundId, data.entityId);
    const client = this.clients.get(ws);

    if (!client) return;

    // Remove from client's subscriptions
    client.channels.delete(channelKey);

    // Remove from channel subscribers
    const subscribers = this.channelSubscribers.get(channelKey);
    if (subscribers) {
      subscribers.delete(ws);
      if (subscribers.size === 0) {
        this.channelSubscribers.delete(channelKey);
      }
    }

    this.sendToClient(ws, {
      type: 'unsubscribed',
      channel: channelKey,
      timestamp: new Date().toISOString(),
    });
  }

  private handleDisconnect(ws: WebSocket) {
    const client = this.clients.get(ws);
    if (client) {
      // Remove from all subscribed channels
      client.channels.forEach((channelKey) => {
        const subscribers = this.channelSubscribers.get(channelKey);
        if (subscribers) {
          subscribers.delete(ws);
          if (subscribers.size === 0) {
            this.channelSubscribers.delete(channelKey);
          }
        }
      });
    }
    this.clients.delete(ws);

    logger.info('[PortfolioMetricsWS] Client disconnected', {
      remainingClients: this.clients.size,
    });
  }

  private getChannelKey(
    channel: Channel,
    fundId?: number,
    entityId?: string
  ): string {
    if (entityId) {
      return `${channel}:${entityId}`;
    }
    if (fundId) {
      return `${channel}:fund:${fundId}`;
    }
    return channel;
  }

  private sendToClient(ws: WebSocket, data: unknown) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      this.clients.forEach((client, ws) => {
        // Disconnect stale clients (no pong in 60 seconds)
        if (now - client.lastPing > 60000) {
          (ws as unknown as { terminate?: () => void }).terminate?.();
          return;
        }
        // Send ping
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        }
      });
    }, 30000);
  }

  /**
   * Broadcast a message to all subscribers of a channel
   */
  public broadcast(channel: Channel, data: unknown, fundId?: number, entityId?: string) {
    const channelKey = this.getChannelKey(channel, fundId, entityId);
    const subscribers = this.channelSubscribers.get(channelKey);

    if (!subscribers || subscribers.size === 0) return;

    const message = JSON.stringify({
      type: 'data',
      channel: channelKey,
      data,
      timestamp: new Date().toISOString(),
    });

    subscribers.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });

    logger.debug('[PortfolioMetricsWS] Broadcast sent', {
      channel: channelKey,
      recipientCount: subscribers.size,
    });
  }

  /**
   * Broadcast simulation progress
   */
  public broadcastSimulationProgress(
    simulationId: string,
    progress: {
      completedIterations: number;
      totalIterations: number;
      percentComplete: number;
      estimatedTimeRemaining?: number;
      currentPhase?: string;
    }
  ) {
    this.broadcast('simulation', {
      event: 'progress',
      simulationId,
      ...progress,
    }, undefined, simulationId);
  }

  /**
   * Broadcast simulation completion
   */
  public broadcastSimulationComplete(
    simulationId: string,
    results: {
      status: 'completed' | 'failed';
      summary?: unknown;
      error?: string;
    }
  ) {
    this.broadcast('simulation', {
      event: 'complete',
      simulationId,
      ...results,
    }, undefined, simulationId);
  }

  /**
   * Broadcast metrics update for a fund
   */
  public broadcastMetricsUpdate(
    fundId: number,
    metrics: {
      irr?: number;
      multiple?: number;
      dpi?: number;
      nav?: number;
      deployed?: number;
      reserved?: number;
    }
  ) {
    this.broadcast('metrics', {
      event: 'update',
      fundId,
      metrics,
    }, fundId);
  }

  /**
   * Get WebSocket statistics
   */
  public getStats() {
    const channelStats: Record<string, number> = {};
    this.channelSubscribers.forEach((subscribers, channel) => {
      channelStats[channel] = subscribers.size;
    });

    return {
      totalClients: this.clients.size,
      channelStats,
    };
  }

  /**
   * Cleanup WebSocket server
   */
  public cleanup() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    this.clients.forEach((_, ws) => {
      ws.close(1000, 'Server shutting down');
    });
    this.clients.clear();
    this.channelSubscribers.clear();

    this.wss.close();
    logger.info('[PortfolioMetricsWS] WebSocket server cleaned up');
  }
}

// Singleton instance (will be initialized by websocket/index.ts)
let portfolioMetricsWS: PortfolioMetricsWebSocket | null = null;

export function getPortfolioMetricsWS(): PortfolioMetricsWebSocket | null {
  return portfolioMetricsWS;
}

export function setPortfolioMetricsWS(instance: PortfolioMetricsWebSocket) {
  portfolioMetricsWS = instance;
}

export default PortfolioMetricsWebSocket;
