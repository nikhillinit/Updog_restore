/**
 * Portfolio Metrics WebSocket
 *
 * Real-time metrics streaming for portfolio intelligence features.
 * Handles live updates for simulations, forecasts, and scenario metrics.
 */

import { eq } from 'drizzle-orm';
import type { Request } from 'express';
import type { IncomingMessage, Server as HTTPServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { z } from 'zod';
import {
  monteCarloSimulations,
  performanceForecasts,
  portfolioScenarios,
} from '@shared/schema';
import { db } from '../db';
import { verifyAccessTokenAsync, userFromClaims } from '../lib/auth/jwt';
import { extractUpgradeRequestCredential } from '../lib/auth/request-credentials';
import { resolveFundScope } from '../lib/auth/fund-scope';
import { isTeamMemberUser, principalFromUser, type RequestPrincipal } from '../lib/auth/principal';
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

type ChannelAuthorizationRequest = {
  channel: Channel;
  fundId?: number | undefined;
  entityId?: string | undefined;
};

interface ClientSubscription {
  channels: Set<string>;
  ws: WebSocket;
  lastPing: number;
  principal: RequestPrincipal;
  /** Universal team READ (subscriptions are reads) — mirrors isSafeReadMethod + isTeamMemberUser middleware layering. */
  teamRead: boolean;
}

interface UpgradeAuthorization {
  principal: RequestPrincipal;
  teamRead: boolean;
}

type UpgradeVerificationInfo = {
  origin: string;
  secure: boolean;
  req: IncomingMessage;
};

type UpgradeVerificationDone = (verified: boolean, code?: number, message?: string) => void;

class UpgradeRejectedError extends Error {
  constructor(
    readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'UpgradeRejectedError';
  }
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseOrigin(value: string): string | null {
  try {
    const origin = new URL(value);
    if (
      (origin.protocol !== 'http:' && origin.protocol !== 'https:') ||
      origin.username ||
      origin.password ||
      origin.pathname !== '/' ||
      origin.search ||
      origin.hash
    ) {
      return null;
    }
    return origin.origin;
  } catch {
    return null;
  }
}

function configuredOrigins(): Set<string> {
  const values = [process.env['ALLOWED_ORIGINS'], process.env['CORS_ORIGIN']]
    .filter((value): value is string => value !== undefined)
    .flatMap((value) => value.split(','))
    .map((value) => parseOrigin(value.trim()))
    .filter((value): value is string => value !== null);
  return new Set(values);
}

function isAllowedCookieOrigin(req: IncomingMessage): boolean {
  const rawOrigin = req.headers.origin;
  if (rawOrigin === undefined || Array.isArray(rawOrigin)) return false;

  const origin = parseOrigin(rawOrigin);
  if (!origin) return false;

  if (configuredOrigins().has(origin)) return true;

  if (
    process.env['NODE_ENV'] !== 'production' &&
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  ) {
    return true;
  }

  const host = firstHeaderValue(req.headers['x-forwarded-host']) ?? req.headers.host;
  if (!host) return false;
  const forwardedProtocol = firstHeaderValue(req.headers['x-forwarded-proto']);
  const isEncrypted = (req.socket as { encrypted?: boolean }).encrypted === true;
  const protocol =
    forwardedProtocol?.split(',')[0]?.trim() || (isEncrypted ? 'https' : 'http');
  return parseOrigin(`${protocol}://${host}`) === origin;
}

function requestAdapterForClaims(req: IncomingMessage): Request {
  return {
    ip: req.socket.remoteAddress ?? 'unknown',
    header(name: string): string | undefined {
      const value = req.headers[name.toLowerCase()];
      return typeof value === 'string' ? value : undefined;
    },
  } as Request;
}

function isPingMessage(message: unknown): message is { type: 'ping' } {
  return (
    typeof message === 'object' && message !== null && 'type' in message && message.type === 'ping'
  );
}

export class PortfolioMetricsWebSocket {
  private wss: WebSocketServer;
  private clients = new Map<WebSocket, ClientSubscription>();
  private channelSubscribers = new Map<string, Set<WebSocket>>();
  private upgradePrincipals = new WeakMap<IncomingMessage, UpgradeAuthorization>();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(server: HTTPServer) {
    this.wss = new WebSocketServer({
      server,
      path: '/ws/portfolio-metrics',
      verifyClient: (info: UpgradeVerificationInfo, done: UpgradeVerificationDone) => {
        void this.verifyUpgrade(info.req, done);
      },
    });

    this.wss.on('connection', this.handleConnection.bind(this));
    this.startHeartbeat();

    logger.info('[PortfolioMetricsWS] WebSocket server initialized on /ws/portfolio-metrics');
  }

  private async verifyUpgrade(req: IncomingMessage, done: UpgradeVerificationDone): Promise<void> {
    try {
      const credential = extractUpgradeRequestCredential(req);
      if (
        credential.kind === 'none' ||
        credential.kind === 'invalid' ||
        credential.kind === 'ambiguous'
      ) {
        throw new UpgradeRejectedError(401, 'Unauthorized');
      }

      if (credential.kind === 'cookie' && !isAllowedCookieOrigin(req)) {
        throw new UpgradeRejectedError(403, 'Forbidden');
      }

      const claims = await verifyAccessTokenAsync(credential.token);
      const user = userFromClaims(requestAdapterForClaims(req), claims);
      this.upgradePrincipals.set(req, {
        principal: principalFromUser(user),
        teamRead: isTeamMemberUser(user),
      });
      done(true);
    } catch (error: unknown) {
      const statusCode = error instanceof UpgradeRejectedError ? error.statusCode : 401;
      logger.warn('[PortfolioMetricsWS] Upgrade rejected', {
        statusCode,
        reason: error instanceof Error ? error.message : String(error),
      });
      done(false, statusCode, statusCode === 403 ? 'Forbidden' : 'Unauthorized');
    }
  }

  private handleConnection(ws: WebSocket, request: IncomingMessage) {
    const authorization = this.upgradePrincipals.get(request);
    this.upgradePrincipals.delete(request);
    if (!authorization) {
      ws.close(1008, 'Unauthorized');
      return;
    }

    const subscription: ClientSubscription = {
      channels: new Set(),
      ws,
      lastPing: Date.now(),
      principal: authorization.principal,
      teamRead: authorization.teamRead,
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
    void this.handleMessageAsync(ws, data);
  }

  private async handleMessageAsync(ws: WebSocket, data: unknown): Promise<void> {
    let message: unknown;
    try {
      message = JSON.parse(String(data)) as unknown;
    } catch {
      this.sendToClient(ws, {
        type: 'error',
        message: 'Invalid message format',
      });
      return;
    }

    try {
      // Handle subscribe
      const subscribeResult = SubscribeSchema.safeParse(message);
      if (subscribeResult.success) {
        await this.handleSubscribe(ws, subscribeResult.data);
        return;
      }

      // Handle unsubscribe
      const unsubscribeResult = UnsubscribeSchema.safeParse(message);
      if (unsubscribeResult.success) {
        await this.handleUnsubscribe(ws, unsubscribeResult.data);
        return;
      }

      // Handle ping
      if (isPingMessage(message)) {
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
    } catch (error: unknown) {
      logger.error('[PortfolioMetricsWS] Subscription handling failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.sendToClient(ws, {
        type: 'error',
        message: 'Subscription service unavailable',
      });
    }
  }

  private async handleSubscribe(
    ws: WebSocket,
    data: z.infer<typeof SubscribeSchema>
  ): Promise<void> {
    const client = this.clients.get(ws);

    if (!client) return;

    const channelKey = await this.getAuthorizedChannelKey(client, data);
    if (!channelKey) {
      this.sendToClient(ws, {
        type: 'error',
        message: 'Subscription is not authorized',
      });
      return;
    }

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

  private async handleUnsubscribe(
    ws: WebSocket,
    data: z.infer<typeof UnsubscribeSchema>
  ): Promise<void> {
    const client = this.clients.get(ws);

    if (!client) return;

    const channelKey = await this.getAuthorizedChannelKey(client, data);
    if (!channelKey) {
      this.sendToClient(ws, {
        type: 'error',
        message: 'Subscription is not authorized',
      });
      return;
    }

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

  private async getAuthorizedChannelKey(
    client: ClientSubscription,
    data: ChannelAuthorizationRequest
  ): Promise<string | null> {
    const fundId = await this.resolveChannelFundId(data);
    if (fundId === null) return null;
    // Subscriptions are reads: universal team READ applies alongside strict
    // fund-scope grants, mirroring the isSafeReadMethod + isTeamMemberUser
    // middleware layering on the HTTP surfaces.
    if (!client.teamRead && resolveFundScope(client.principal, fundId) !== 'allow') {
      return null;
    }
    return this.getChannelKey(data.channel, data.fundId, data.entityId);
  }

  private async resolveChannelFundId(
    data: ChannelAuthorizationRequest
  ): Promise<number | null> {
    if (data.channel === 'metrics') {
      return data.entityId === undefined ? (data.fundId ?? null) : null;
    }

    if (data.entityId === undefined || data.fundId !== undefined) return null;

    if (data.channel === 'scenario') {
      const [scenario] = await db
        .select({ fundId: portfolioScenarios.fundId })
        .from(portfolioScenarios)
        .where(eq(portfolioScenarios.id, data.entityId))
        .limit(1);
      return scenario?.fundId ?? null;
    }

    if (data.channel === 'forecast') {
      const [forecast] = await db
        .select({ fundId: performanceForecasts.fundId })
        .from(performanceForecasts)
        .where(eq(performanceForecasts.id, data.entityId))
        .limit(1);
      return forecast?.fundId ?? null;
    }

    const [simulation] = await db
      .select({ fundId: monteCarloSimulations.fundId })
      .from(monteCarloSimulations)
      .where(eq(monteCarloSimulations.id, data.entityId))
      .limit(1);
    return simulation?.fundId ?? null;
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

  private getChannelKey(channel: Channel, fundId?: number, entityId?: string): string {
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
    this.broadcast(
      'simulation',
      {
        event: 'progress',
        simulationId,
        ...progress,
      },
      undefined,
      simulationId
    );
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
    this.broadcast(
      'simulation',
      {
        event: 'complete',
        simulationId,
        ...results,
      },
      undefined,
      simulationId
    );
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
    this.broadcast(
      'metrics',
      {
        event: 'update',
        fundId,
        metrics,
      },
      fundId
    );
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
