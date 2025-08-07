import { connect, NatsConnection, StringCodec } from 'nats';
import { WebSocketServer } from 'ws';
import { Server as HttpServer } from 'http';
import { logger } from './logger';
import { z } from 'zod';
import crypto from 'crypto';
import { natsBridgeConnections, natsBridgeMessages } from './metrics';

// Message schemas
const subscribeSchema = z.object({
  fundId: z.number().int().positive(),
  eventTypes: z.array(z.string()).optional(),
});

const eventMessageSchema = z.object({
  fundId: z.number(),
  eventType: z.string(),
  event: z.any(),
  timestamp: z.string().datetime(),
  checksum: z.string().optional(),
});

// NATS subjects
function getFundSubject(fundId: number): string {
  return `fund.${fundId}.events`;
}

function getEventTypeSubject(fundId: number, eventType: string): string {
  return `fund.${fundId}.events.${eventType}`;
}

export class NatsBridge {
  private nc: NatsConnection | null = null;
  private wss: WebSocketServer;
  private sc = StringCodec();
  private connections = new Map<string, Set<string>>(); // clientId -> subjects

  constructor(httpServer: HttpServer) {
    this.wss = new WebSocketServer({
      server: httpServer,
      path: '/ws',
      perMessageDeflate: {
        zlibDeflateOptions: {
          chunkSize: 1024,
          memLevel: 7,
          level: 3,
        },
        zlibInflateOptions: {
          chunkSize: 10 * 1024,
        },
        threshold: 1024, // Only compress messages > 1KB
      },
    });

    this.setupWebSocketServer();
  }

  async connect(): Promise<void> {
    try {
      this.nc = await connect({
        servers: process.env.NATS_URL || 'nats://localhost:4222',
        reconnect: true,
        maxReconnectAttempts: 3,
        reconnectTimeWait: 1000,
        timeout: 5000, // Reduced timeout for development
      });

      logger.info('NATS connected', { url: this.nc.getServer() });

      // Monitor connection events
      (async () => {
        for await (const status of this.nc!.status()) {
          logger.info('NATS connection status', { status: status.type });
        }
      })();
    } catch (error) {
      logger.error('NATS connection failed', error);
      throw error;
    }
  }

  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws, req) => {
      const clientId = crypto.randomUUID();
      const clientSubs = new Set<string>();
      this.connections.set(clientId, clientSubs);

      logger.info('WebSocket client connected', {
        clientId,
        ip: req.socket.remoteAddress,
      });
      
      natsBridgeConnections.inc();

      // Handle ping/pong for connection health
      const pingInterval = setInterval(() => {
        if (ws.readyState === ws.OPEN) {
          ws.ping();
        }
      }, 30000);

      ws.on('pong', () => {
        // Client is alive
      });

      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString());
          natsBridgeMessages.inc({ direction: 'in', type: message.type || 'unknown' });
          await this.handleClientMessage(clientId, ws, message);
        } catch (error) {
          ws.send(JSON.stringify({
            error: 'Invalid message format',
            details: error instanceof Error ? error.message : 'Unknown error',
          }));
        }
      });

      ws.on('close', () => {
        clearInterval(pingInterval);
        this.cleanupClient(clientId);
        logger.info('WebSocket client disconnected', { clientId });
        natsBridgeConnections.dec();
      });

      ws.on('error', (error) => {
        logger.error('WebSocket error', { clientId, error });
      });

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'welcome',
        clientId,
        timestamp: new Date().toISOString(),
      }));
    });
  }

  private async handleClientMessage(
    clientId: string,
    ws: any,
    message: any
  ): Promise<void> {
    const { type, data } = message;

    switch (type) {
      case 'subscribe':
        await this.handleSubscribe(clientId, ws, data);
        break;
      case 'unsubscribe':
        await this.handleUnsubscribe(clientId, ws, data);
        break;
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        break;
      default:
        ws.send(JSON.stringify({
          error: 'Unknown message type',
          type,
        }));
    }
  }

  private async handleSubscribe(
    clientId: string,
    ws: any,
    data: any
  ): Promise<void> {
    try {
      const parsed = subscribeSchema.parse(data);
      const { fundId, eventTypes } = parsed;
      const clientSubs = this.connections.get(clientId)!;

      // Subscribe to main fund subject
      const mainSubject = getFundSubject(fundId);
      if (!clientSubs.has(mainSubject)) {
        const sub = this.nc!.subscribe(mainSubject);
        clientSubs.add(mainSubject);

        // Forward messages to WebSocket
        (async () => {
          for await (const msg of sub) {
            if (ws.readyState === ws.OPEN) {
              const event = JSON.parse(this.sc.decode(msg.data));
              
              // Add checksum for integrity
              const checksum = crypto
                .createHash('md5')
                .update(JSON.stringify(event))
                .digest('hex');

              ws.send(JSON.stringify({
                type: 'event',
                data: { ...event, checksum },
              }));
            }
          }
        })();
      }

      // Subscribe to specific event types if requested
      if (eventTypes && eventTypes.length > 0) {
        for (const eventType of eventTypes) {
          const subject = getEventTypeSubject(fundId, eventType);
          if (!clientSubs.has(subject)) {
            const sub = this.nc!.subscribe(subject);
            clientSubs.add(subject);

            (async () => {
              for await (const msg of sub) {
                if (ws.readyState === ws.OPEN) {
                  const event = JSON.parse(this.sc.decode(msg.data));
                  const checksum = crypto
                    .createHash('md5')
                    .update(JSON.stringify(event))
                    .digest('hex');

                  ws.send(JSON.stringify({
                    type: 'event:typed',
                    data: { ...event, checksum },
                  }));
                }
              }
            })();
          }
        }
      }

      ws.send(JSON.stringify({
        type: 'subscribed',
        fundId,
        eventTypes,
      }));

      logger.info('Client subscribed', { clientId, fundId, eventTypes });
    } catch (error) {
      ws.send(JSON.stringify({
        error: 'Subscription failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  }

  private async handleUnsubscribe(
    clientId: string,
    ws: any,
    data: any
  ): Promise<void> {
    try {
      const { fundId } = data;
      const clientSubs = this.connections.get(clientId)!;

      // Remove fund-related subscriptions
      const toRemove = Array.from(clientSubs).filter((sub) =>
        sub.startsWith(`fund.${fundId}.`)
      );

      toRemove.forEach((sub) => clientSubs.delete(sub));

      ws.send(JSON.stringify({
        type: 'unsubscribed',
        fundId,
      }));

      logger.info('Client unsubscribed', { clientId, fundId });
    } catch (error) {
      ws.send(JSON.stringify({
        error: 'Unsubscription failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  }

  private cleanupClient(clientId: string): void {
    const clientSubs = this.connections.get(clientId);
    if (clientSubs) {
      // NATS subscriptions auto-cleanup when not consumed
      this.connections.delete(clientId);
    }
  }

  // Publish event to NATS (called by event processor)
  async publishEvent(
    fundId: number,
    eventType: string,
    event: any
  ): Promise<void> {
    if (!this.nc) {
      throw new Error('NATS not connected');
    }

    const message = eventMessageSchema.parse({
      fundId,
      eventType,
      event,
      timestamp: new Date().toISOString(),
    });

    // Publish to main fund subject
    await this.nc.publish(
      getFundSubject(fundId),
      this.sc.encode(JSON.stringify(message))
    );

    // Publish to event-type specific subject
    await this.nc.publish(
      getEventTypeSubject(fundId, eventType),
      this.sc.encode(JSON.stringify(message))
    );

    logger.debug('Event published to NATS', { fundId, eventType });
  }

  // Graceful shutdown
  async close(): Promise<void> {
    this.wss.clients.forEach((ws) => {
      ws.close(1000, 'Server shutting down');
    });

    if (this.nc) {
      await this.nc.drain();
      await this.nc.close();
    }
  }

  // Metrics
  getMetrics() {
    return {
      activeConnections: this.wss.clients.size,
      totalSubscriptions: Array.from(this.connections.values()).reduce(
        (sum, subs) => sum + subs.size,
        0
      ),
      natsConnected: this.nc ? !this.nc.isClosed() : false,
    };
  }
}
