/**
 * Hybrid Memory Manager
 *
 * Coordinates between Redis-backed conversation memory (fast, session-scoped)
 * and Claude's native memory tool (persistent, cross-session learning).
 *
 * Memory Strategy:
 * - Session: Redis only (fast, temporary, 1-hour TTL)
 * - Project: Both Redis + Native (redundancy)
 * - Long-term: Native memory tool (persistent across sessions)
 *
 * @example
 * ```typescript
 * const manager = new HybridMemoryManager({
 *   redisStorage: getStorage(),
 *   nativeMemoryEnabled: true,
 * });
 *
 * // Session-scoped (fast, temporary)
 * await manager.store(key, value, {
 *   tenantId: 'user:project',
 *   scope: 'session',
 * });
 *
 * // Long-term learning (persistent)
 * await manager.store(key, value, {
 *   tenantId: 'user:project',
 *   scope: 'longterm',
 * });
 * ```
 */

import type { ConversationStorage } from './ConversationMemory.js';
import type { MemoryEventBus} from './MemoryEventBus.js';
import { getEventBus } from './MemoryEventBus.js';
import { logger } from './Logger.js';

/**
 * Memory storage scope
 */
export type MemoryScope = 'session' | 'project' | 'longterm';

/**
 * Memory metadata
 */
export interface MemoryMetadata {
  /** Tenant ID for isolation */
  tenantId: string;

  /** Storage scope */
  scope: MemoryScope;

  /** Optional tags for searchability */
  tags?: string[];

  /** Optional expiry (milliseconds) */
  expiryMs?: number;

  /** Visibility level */
  visibility?: 'user' | 'project' | 'global';
}

/**
 * Memory entry
 */
export interface MemoryEntry {
  key: string;
  value: string;
  metadata: MemoryMetadata;
  createdAt: string;
  updatedAt: string;
}

/**
 * Hybrid Memory Manager Configuration
 */
export interface HybridMemoryConfig {
  /** Redis storage backend */
  redisStorage: ConversationStorage;

  /** Enable native memory tool */
  nativeMemoryEnabled: boolean;

  /** Event bus for memory events */
  eventBus?: MemoryEventBus;

  /** Default expiry for session memories (ms) */
  sessionExpiryMs?: number;
}

/**
 * Hybrid Memory Manager
 *
 * Coordinates Redis + Native Memory Tool for optimal performance and persistence.
 */
export class HybridMemoryManager {
  private readonly redisStorage: ConversationStorage;
  private readonly nativeMemoryEnabled: boolean;
  private readonly eventBus: MemoryEventBus;
  private readonly sessionExpiryMs: number;

  constructor(config: HybridMemoryConfig) {
    this.redisStorage = config.redisStorage;
    this.nativeMemoryEnabled = config.nativeMemoryEnabled;
    this.eventBus = config.eventBus ?? getEventBus();
    this.sessionExpiryMs = config.sessionExpiryMs ?? 3600000; // 1 hour default
  }

  /**
   * Store memory with scope-based routing
   *
   * @param key - Storage key
   * @param value - Value to store
   * @param metadata - Memory metadata (tenant, scope, etc.)
   */
  async store(key: string, value: string, metadata: MemoryMetadata): Promise<void> {
    const fullKey = this.buildStorageKey(key, metadata);

    logger.debug('Storing memory', {
      key: fullKey,
      scope: metadata.scope,
      tenantId: metadata.tenantId,
      hasNativeMemory: this.nativeMemoryEnabled,
    });

    switch (metadata.scope) {
      case 'session':
        // Session-scoped: Redis only (fast, temporary)
        await this.storeInRedis(fullKey, value, metadata.expiryMs ?? this.sessionExpiryMs);
        break;

      case 'project':
        // Project-scoped: Both Redis + Native (redundancy)
        await Promise.all([
          this.storeInRedis(fullKey, value, metadata.expiryMs),
          this.nativeMemoryEnabled ? this.storeInNativeMemory(fullKey, value, metadata) : Promise.resolve(),
        ]);
        break;

      case 'longterm':
        // Long-term: Native memory tool only (persistent across sessions)
        if (this.nativeMemoryEnabled) {
          await this.storeInNativeMemory(fullKey, value, metadata);
        } else {
          // Fallback to Redis with long expiry
          logger.warn('Native memory not enabled, falling back to Redis for long-term storage', {key: fullKey,
          });
          await this.storeInRedis(fullKey, value, metadata.expiryMs ?? 86400000); // 24 hours
        }
        break;
    }

    // Emit event
    await this.eventBus.emit({
      type: 'memory_created',
      memoryId: key,
      tenantId: metadata.tenantId,
      path: fullKey,
      visibility: metadata.visibility ?? 'user',
    });
  }

  /**
   * Retrieve memory
   *
   * Tries Redis first (fast), falls back to native memory if not found.
   *
   * @param key - Storage key
   * @param metadata - Memory metadata
   * @returns Value or null if not found
   */
  async retrieve(key: string, metadata: MemoryMetadata): Promise<string | null> {
    const fullKey = this.buildStorageKey(key, metadata);

    logger.debug('Retrieving memory', {key: fullKey,
      scope: metadata.scope,
      tenantId: metadata.tenantId,
    });

    // Try Redis first (fast)
    const redisValue = await this.redisStorage.get(fullKey);
    if (redisValue) {
      logger.debug('Memory cache hit (Redis)', {key: fullKey,
      });
      return redisValue;
    }

    // For long-term/project scope, try native memory
    if (
      this.nativeMemoryEnabled &&
      (metadata.scope === 'longterm' || metadata.scope === 'project')
    ) {
      logger.debug('Memory cache miss (Redis), trying native memory', {key: fullKey,
      });
      return await this.retrieveFromNativeMemory(fullKey, metadata);
    }

    return null;
  }

  /**
   * Delete memory
   *
   * @param key - Storage key
   * @param metadata - Memory metadata
   */
  async delete(key: string, metadata: MemoryMetadata): Promise<void> {
    const fullKey = this.buildStorageKey(key, metadata);

    logger.debug('Deleting memory', {key: fullKey,
      tenantId: metadata.tenantId,
    });

    await Promise.all([
      this.redisStorage.delete(fullKey),
      // Native memory deletion would happen through tool_use
      // We emit event for coordination
    ]);

    await this.eventBus.emit({
      type: 'memory_deleted',
      memoryId: key,
      tenantId: metadata.tenantId,
      path: fullKey,
    });
  }

  /**
   * Search memories by tenant and tags
   *
   * @param tenantId - Tenant ID
   * @param tags - Optional tags to filter
   * @returns Array of matching memory entries
   */
  async searchByTenant(tenantId: string, tags?: string[]): Promise<MemoryEntry[]> {
    logger.debug('Searching memories', {tenantId,
      tags,
    });

    // This is a placeholder - actual implementation would:
    // 1. Query Redis for keys matching tenant prefix
    // 2. Query native memory tool via Claude API
    // 3. Merge and deduplicate results

    // For now, return empty array
    // Full implementation requires Redis SCAN or dedicated index
    return [];
  }

  /**
   * Store in Redis
   */
  private async storeInRedis(key: string, value: string, expiryMs?: number): Promise<void> {
    await this.redisStorage.set(key, value, expiryMs);

    logger.debug('Stored in Redis', {key,
      expiryMs,
    });
  }

  /**
   * Store in native memory tool
   *
   * Note: This is a coordination point - actual storage happens via
   * Claude's tool_use mechanism during conversation.
   *
   * For now, we just emit events for coordination.
   */
  private async storeInNativeMemory(
    key: string,
    value: string,
    metadata: MemoryMetadata
  ): Promise<void> {
    // Native memory tool is executed by Claude during conversation
    // We can't directly write to it - only coordinate via events

    logger.debug('Native memory storage requested (requires tool_use)', {key,
      tenantId: metadata.tenantId,
    });

    // Store metadata for retrieval coordination
    const metadataKey = `${key}:metadata`;
    await this.redisStorage.set(
      metadataKey,
      JSON.stringify(metadata),
      metadata.expiryMs
    );
  }

  /**
   * Retrieve from native memory tool
   *
   * Note: This is a coordination point - actual retrieval happens via
   * Claude's tool_use mechanism during conversation.
   */
  private async retrieveFromNativeMemory(
    key: string,
    metadata: MemoryMetadata
  ): Promise<string | null> {
    // Native memory retrieval happens via Claude's tool_use
    // For now, return null - full implementation requires conversation context

    logger.debug('Native memory retrieval requested (requires tool_use)', {key,
      tenantId: metadata.tenantId,
    });

    return null;
  }

  /**
   * Build full storage key with tenant prefix
   *
   * Format: {tenantId}:mem:{scope}:{key}
   */
  private buildStorageKey(key: string, metadata: MemoryMetadata): string {
    return `${metadata.tenantId}:mem:${metadata.scope}:${key}`;
  }

  /**
   * Get statistics about memory usage
   */
  async getStats(tenantId: string): Promise<{
    sessionMemories: number;
    projectMemories: number;
    longtermMemories: number;
  }> {
    // Placeholder - full implementation requires Redis SCAN
    return {
      sessionMemories: 0,
      projectMemories: 0,
      longtermMemories: 0,
    };
  }
}

/**
 * Create hybrid memory manager with default configuration
 *
 * @param redisStorage - Redis storage backend
 * @param nativeMemoryEnabled - Enable native memory tool
 * @returns Configured hybrid memory manager
 */
export function createHybridMemoryManager(
  redisStorage: ConversationStorage,
  nativeMemoryEnabled: boolean = false
): HybridMemoryManager {
  return new HybridMemoryManager({
    redisStorage,
    nativeMemoryEnabled,
  });
}
