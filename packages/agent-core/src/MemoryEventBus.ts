/**
 * Memory Event Bus
 *
 * Event-driven system for memory operations that triggers cache invalidation
 * and other reactive behaviors when memories change.
 *
 * @example
 * ```typescript
 * const bus = MemoryEventBus.getInstance();
 *
 * // Subscribe to events
 * bus.on('memory_created', (event) => {
 *   console.log('New memory created:', event.memoryId);
 *   cache.invalidate(event.threadId);
 * });
 *
 * // Emit events
 * bus.emit({
 *   type: 'memory_created',
 *   memoryId: 'mem-123',
 *   tenantId: 'user:project',
 *   threadId: 'thread-456',
 * });
 * ```
 */

import { logger } from './Logger.js';

/**
 * Memory event types
 */
export type MemoryEventType =
  | 'memory_created'
  | 'memory_updated'
  | 'memory_deleted'
  | 'pattern_learned'
  | 'pattern_applied'
  | 'context_cleared';

/**
 * Base memory event
 */
export interface BaseMemoryEvent {
  type: MemoryEventType;
  timestamp: string;
  tenantId: string;
  threadId?: string;
}

/**
 * Memory created event
 */
export interface MemoryCreatedEvent extends BaseMemoryEvent {
  type: 'memory_created';
  memoryId: string;
  path: string;
  visibility: 'user' | 'project' | 'global';
}

/**
 * Memory updated event
 */
export interface MemoryUpdatedEvent extends BaseMemoryEvent {
  type: 'memory_updated';
  memoryId: string;
  path: string;
  changeType: 'edit' | 'append' | 'rename';
}

/**
 * Memory deleted event
 */
export interface MemoryDeletedEvent extends BaseMemoryEvent {
  type: 'memory_deleted';
  memoryId: string;
  path: string;
}

/**
 * Pattern learned event
 */
export interface PatternLearnedEvent extends BaseMemoryEvent {
  type: 'pattern_learned';
  patternId: string;
  operation: string;
  confidence: number;
}

/**
 * Pattern applied event
 */
export interface PatternAppliedEvent extends BaseMemoryEvent {
  type: 'pattern_applied';
  patternId: string;
  operation: string;
  success: boolean;
}

/**
 * Context cleared event
 */
export interface ContextClearedEvent extends BaseMemoryEvent {
  type: 'context_cleared';
  toolUsesCleared: number;
  tokensSaved: number;
}

/**
 * Union of all memory events
 */
export type MemoryEvent =
  | MemoryCreatedEvent
  | MemoryUpdatedEvent
  | MemoryDeletedEvent
  | PatternLearnedEvent
  | PatternAppliedEvent
  | ContextClearedEvent;

/**
 * Event listener function
 */
export type MemoryEventListener<T extends MemoryEvent = MemoryEvent> = (event: T) => void | Promise<void>;

/**
 * Memory Event Bus (Singleton)
 *
 * Centralized event system for memory operations.
 * Uses pub/sub pattern for loose coupling between components.
 */
export class MemoryEventBus {
  private static instance: MemoryEventBus;

  private listeners = new Map<MemoryEventType, Set<MemoryEventListener>>();
  private eventHistory: MemoryEvent[] = [];
  private maxHistorySize = 1000;

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): MemoryEventBus {
    if (!this.instance) {
      this.instance = new MemoryEventBus();
    }
    return this.instance;
  }

  /**
   * Subscribe to memory events
   *
   * @param eventType - Type of event to listen for
   * @param listener - Callback function
   * @returns Unsubscribe function
   *
   * @example
   * ```typescript
   * const unsubscribe = bus.on('memory_created', (event) => {
   *   console.log('Memory created:', event.memoryId);
   * });
   *
   * // Later: unsubscribe
   * unsubscribe();
   * ```
   */
  on<T extends MemoryEvent>(
    eventType: T['type'],
    listener: MemoryEventListener<T>
  ): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }

    const listenerSet = this.listeners.get(eventType)!;
    listenerSet.add(listener as MemoryEventListener);

    logger.debug('Event listener registered', {eventType,
      totalListeners: listenerSet.size,
    });

    // Return unsubscribe function
    return () => {
      listenerSet.delete(listener as MemoryEventListener);
      logger.debug('Event listener unregistered', {eventType,
        totalListeners: listenerSet.size,
      });
    };
  }

  /**
   * Subscribe to all events of a certain type (one-time)
   *
   * @param eventType - Type of event to listen for
   * @param listener - Callback function (runs once then auto-unsubscribes)
   */
  once<T extends MemoryEvent>(
    eventType: T['type'],
    listener: MemoryEventListener<T>
  ): void {
    const wrappedListener: MemoryEventListener<T> = (event) => {
      listener(event);
      // Auto-unsubscribe after first call
      this.listeners.get(eventType)?.delete(wrappedListener as MemoryEventListener);
    };

    this.on(eventType, wrappedListener);
  }

  /**
   * Emit a memory event
   *
   * @param event - Event to emit (type and data)
   *
   * @example
   * ```typescript
   * bus.emit({
   *   type: 'memory_created',
   *   memoryId: 'mem-123',
   *   tenantId: 'user:project',
   *   path: '/memories/patterns/concurrency.md',
   *   visibility: 'project',
   *   timestamp: new Date().toISOString(),
   * });
   * ```
   */
  async emit(event: Omit<MemoryEvent, 'timestamp'> & { timestamp?: string }): Promise<void> {
    const fullEvent: MemoryEvent = {
      ...event,
      timestamp: event.timestamp ?? new Date().toISOString(),
    } as MemoryEvent;

    // Add to history
    this.addToHistory(fullEvent);

    const listeners = this.listeners.get(fullEvent.type);
    if (!listeners || listeners.size === 0) {
      logger.debug('Event emitted with no listeners', {eventType: fullEvent.type,
        tenantId: fullEvent.tenantId,
      });
      return;
    }

    logger.debug('Emitting event', {eventType: fullEvent.type,
      tenantId: fullEvent.tenantId,
      listenerCount: listeners.size,
    });

    // Call all listeners (in parallel)
    const promises = Array.from(listeners).map(async (listener) => {
      try {
        await listener(fullEvent);
      } catch (error: unknown) {
        logger.error('Event listener error', {eventType: fullEvent.type,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    await Promise.all(promises);
  }

  /**
   * Remove all listeners for a specific event type
   *
   * @param eventType - Event type to clear
   */
  removeAllListeners(eventType?: MemoryEventType): void {
    if (eventType) {
      this.listeners.delete(eventType);
      logger.debug('All listeners removed', {eventType,
      });
    } else {
      this.listeners.clear();
      logger.debug('All listeners removed (all event types)', {});
    }
  }

  /**
   * Get event history
   *
   * @param filter - Optional filter by event type or tenant ID
   * @param limit - Maximum number of events to return
   * @returns Array of historical events
   */
  getHistory(
    filter?: { eventType?: MemoryEventType; tenantId?: string },
    limit?: number
  ): MemoryEvent[] {
    let events = [...this.eventHistory];

    if (filter?.eventType) {
      events = events.filter(e => e.type === filter.eventType);
    }

    if (filter?.tenantId) {
      events = events.filter(e => e.tenantId === filter.tenantId);
    }

    if (limit) {
      events = events.slice(-limit);
    }

    return events;
  }

  /**
   * Clear event history
   */
  clearHistory(): void {
    this.eventHistory = [];
    logger.debug('Event history cleared', {});
  }

  /**
   * Add event to history (with size limit)
   */
  private addToHistory(event: MemoryEvent): void {
    this.eventHistory.push(event);

    // Trim history if too large
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Get statistics about event bus usage
   */
  getStats(): {
    listenersByType: Record<MemoryEventType, number>;
    totalListeners: number;
    historySize: number;
    eventsByType: Record<MemoryEventType, number>;
  } {
    const listenersByType: Partial<Record<MemoryEventType, number>> = {};
    let totalListeners = 0;

    for (const [eventType, listenerSet] of this.listeners.entries()) {
      listenersByType[eventType] = listenerSet.size;
      totalListeners += listenerSet.size;
    }

    const eventsByType: Partial<Record<MemoryEventType, number>> = {};
    for (const event of this.eventHistory) {
      eventsByType[event.type] = (eventsByType[event.type] ?? 0) + 1;
    }

    return {
      listenersByType: listenersByType as Record<MemoryEventType, number>,
      totalListeners,
      historySize: this.eventHistory.length,
      eventsByType: eventsByType as Record<MemoryEventType, number>,
    };
  }
}

/**
 * Convenience function to get event bus instance
 */
export function getEventBus(): MemoryEventBus {
  return MemoryEventBus.getInstance();
}
