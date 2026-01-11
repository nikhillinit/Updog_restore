/* eslint-disable @typescript-eslint/no-explicit-any */ // WebSocket server types
 
 
 
 
import type { Server as HttpServer } from 'http';
import type { Socket } from 'socket.io';
import { Server as SocketIOServer } from 'socket.io';
// Redis pub/sub disabled in dev - will be injected via providers when needed
import { logger } from './logger';
import { z } from 'zod';
import { db } from './db';
import { funds } from '@shared/schema';
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
      origin: process.env['NODE_ENV'] === 'production' 
        ? process.env['FRONTEND_URL'] 
        : 'http://localhost:5173',
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
  });

  // Redis pub/sub disabled in development mode
  // Events will be broadcast directly to connected clients
  // In production, this should be replaced with proper Redis pub/sub

  // WebSocket connection handling
  io['on']('connection', (socket: Socket) => {
    logger.info('WebSocket client connected', { socketId: socket.id });

    // Track subscriptions per socket
    const subscriptions = new Set<number>();

    // Subscribe to fund events
    socket['on']('subscribe:fund', async (data: any, callback: any) => {
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
          eventTypes.forEach((eventType: any) => {
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
    socket['on']('unsubscribe:fund', async (data: any, callback: any) => {
      try {
        const parsed = unsubscribeSchema.parse(data);
        const { fundId } = parsed;

        // Leave all rooms for this fund
        const rooms = Array.from(socket.rooms).filter(
          (room: any) => room.startsWith(`fund:${fundId}`)
        );
        
        rooms.forEach((room: any) => socket.leave(room));
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
    socket['on']('get:subscriptions', (callback: any) => {
      callback({
        subscriptions: Array.from(subscriptions),
        rooms: Array.from(socket.rooms),
      });
    });

    // Handle disconnection
    socket['on']('disconnect', () => {
      logger.info('WebSocket client disconnected', {
        socketId: socket.id,
        subscriptions: Array.from(subscriptions),
      });
    });

    // Ping/pong for connection health
    socket['on']('ping', (callback: any) => {
      callback({ pong: true, timestamp: Date.now() });
    });
  });

  // Metrics for WebSocket connections
  setInterval(() => {
    const sockets = io.sockets.sockets;
    const roomCounts = new Map<string, number>();

    // Count clients per room
    io.sockets.adapter.rooms.forEach((socketIds: any, room: any) => {
      if (room.startsWith('fund:')) {
        roomCounts['set'](room, socketIds.size);
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
  event: any,
  io?: SocketIOServer
): Promise<void> {
  try {
    // In development mode, broadcast directly to connected clients
    if (io) {
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
    }
    // In production, this should publish to Redis for distribution
  } catch (error) {
    logger.error('Failed to publish fund event', {
      fundId,
      eventType,
      error,
    });
  }
}

