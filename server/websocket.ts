import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { redis } from './redis';
import { logger } from './logger';
import { z } from 'zod';
import { db } from './db';
import { fundEvents, funds } from '@shared/schema';
import { eq } from 'drizzle-orm';

// WebSocket event schemas
const subscribeSchema = z.object({
  fundId: z.number().int().positive(),
  eventTypes: z.array(z.string()).optional(),
});

const unsubscribeSchema = z.object({
  fundId: z.number().int().positive(),
});

// Room naming convention
function getFundRoom(fundId: number): string {
  return `fund:${fundId}`;
}

function getEventTypeRoom(fundId: number, eventType: string): string {
  return `fund:${fundId}:event:${eventType}`;
}

export function initializeWebSocket(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.NODE_ENV === 'production' 
        ? process.env.FRONTEND_URL 
        : 'http://localhost:5173',
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
  });

  // Redis pub/sub for distributing events across multiple server instances
  const pubClient = typeof redis === 'object' && 'duplicate' in redis ? redis.duplicate() : redis;
  const subClient = typeof redis === 'object' && 'duplicate' in redis ? redis.duplicate() : redis;

  // Subscribe to Redis channels for event distribution
  if ('subscribe' in subClient) {
    subClient.subscribe('fund:events');
  }
  if ('on' in subClient) {
    subClient.on('message', async (channel: string, message: string) => {
    try {
      const data = JSON.parse(message);
      const { fundId, eventType, event } = data;

      // Broadcast to all clients in the fund room
      io.to(getFundRoom(fundId)).emit('fund:event', {
        fundId,
        eventType,
        event,
        timestamp: new Date().toISOString(),
      });

      // Broadcast to specific event type rooms
      if (eventType) {
        io.to(getEventTypeRoom(fundId, eventType)).emit('fund:event:typed', {
          fundId,
          eventType,
          event,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      logger.error('WebSocket Redis message error:', error);
    }
    });
  }

  // WebSocket connection handling
  io.on('connection', (socket: Socket) => {
    logger.info('WebSocket client connected', { socketId: socket.id });

    // Track subscriptions per socket
    const subscriptions = new Set<number>();

    // Subscribe to fund events
    socket.on('subscribe:fund', async (data, callback) => {
      try {
        const parsed = subscribeSchema.parse(data);
        const { fundId, eventTypes } = parsed;

        // Verify fund exists
        const fund = await db.query.funds.findFirst({
          where: eq(funds.id, fundId),
        });

        if (!fund) {
          return callback({
            error: 'Fund not found',
            message: `Fund ${fundId} does not exist`,
          });
        }

        // Join fund room
        socket.join(getFundRoom(fundId));
        subscriptions.add(fundId);

        // Join specific event type rooms if requested
        if (eventTypes && eventTypes.length > 0) {
          eventTypes.forEach((eventType) => {
            socket.join(getEventTypeRoom(fundId, eventType));
          });
        }

        logger.info('Client subscribed to fund', {
          socketId: socket.id,
          fundId,
          eventTypes,
        });

        callback({ success: true, fundId });
      } catch (error) {
        logger.error('Subscribe error:', error);
        callback({
          error: 'Subscription failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Unsubscribe from fund events
    socket.on('unsubscribe:fund', async (data, callback) => {
      try {
        const parsed = unsubscribeSchema.parse(data);
        const { fundId } = parsed;

        // Leave all rooms for this fund
        const rooms = Array.from(socket.rooms).filter(
          (room) => room.startsWith(`fund:${fundId}`)
        );
        
        rooms.forEach((room) => socket.leave(room));
        subscriptions.delete(fundId);

        logger.info('Client unsubscribed from fund', {
          socketId: socket.id,
          fundId,
        });

        callback({ success: true, fundId });
      } catch (error) {
        logger.error('Unsubscribe error:', error);
        callback({
          error: 'Unsubscription failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Get current subscriptions
    socket.on('get:subscriptions', (callback) => {
      callback({
        subscriptions: Array.from(subscriptions),
        rooms: Array.from(socket.rooms),
      });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      logger.info('WebSocket client disconnected', {
        socketId: socket.id,
        subscriptions: Array.from(subscriptions),
      });
    });

    // Ping/pong for connection health
    socket.on('ping', (callback) => {
      callback({ pong: true, timestamp: Date.now() });
    });
  });

  // Metrics for WebSocket connections
  setInterval(() => {
    const sockets = io.sockets.sockets;
    const roomCounts = new Map<string, number>();

    // Count clients per room
    io.sockets.adapter.rooms.forEach((socketIds, room) => {
      if (room.startsWith('fund:')) {
        roomCounts.set(room, socketIds.size);
      }
    });

    logger.debug('WebSocket metrics', {
      totalConnections: sockets.size,
      roomCounts: Object.fromEntries(roomCounts),
    });
  }, 30000); // Every 30 seconds

  return io;
}

// Helper function to publish events via WebSocket
export async function publishFundEvent(
  fundId: number,
  eventType: string,
  event: any
): Promise<void> {
  try {
    const message = JSON.stringify({
      fundId,
      eventType,
      event,
    });

    if ('publish' in redis) {
      await redis.publish('fund:events', message);
    }
  } catch (error) {
    logger.error('Failed to publish fund event', {
      fundId,
      eventType,
      error,
    });
  }
}
