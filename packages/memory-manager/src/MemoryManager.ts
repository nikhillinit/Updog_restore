/**
 * MemoryManager - Unified Memory Management
 *
 * Provides intelligent context management for AI agents
 * without requiring the full conversation history.
 *
 * Supports both in-memory (Phase 1) and PostgreSQL (Phase 2) backends.
 */

import type { Memory, MemoryContext, MemorySearchResult } from './types';
import { PostgresMemoryStore } from './PostgresMemoryStore';
import { randomUUID } from 'crypto';

export interface MemoryManagerConfig {
  useDatabase?: boolean;
  databaseUrl?: string;
  embeddingApiKey?: string;
  useMockEmbeddings?: boolean;
}

export class MemoryManager {
  private memories: Map<string, Memory[]> = new Map();
  private readonly maxMemoriesPerUser = 100;
  private postgresStore?: PostgresMemoryStore;
  private useDatabase: boolean;

  constructor(
    private context: MemoryContext,
    config: MemoryManagerConfig = {}
  ) {
    this.useDatabase = config.useDatabase || false;

    if (this.useDatabase) {
      const connectionString = config.databaseUrl || process.env.DATABASE_URL;
      if (!connectionString) {
        throw new Error('DATABASE_URL is required when useDatabase is true');
      }

      this.postgresStore = new PostgresMemoryStore({
        connectionString,
        embeddingApiKey: config.embeddingApiKey,
        useMockEmbeddings: config.useMockEmbeddings,
      });
    }
  }

  /**
   * Add a new memory to storage
   */
  async add(memory: Omit<Memory, 'id' | 'createdAt'>): Promise<void> {
    if (this.useDatabase && this.postgresStore) {
      // Phase 2: Persist to PostgreSQL with embeddings
      await this.postgresStore.add(memory);
    } else {
      // Phase 1: Store in-memory
      const key = this.getStorageKey();
      const fullMemory: Memory = {
        ...memory,
        id: randomUUID(),
        createdAt: new Date(),
      };

      const existing = this.memories.get(key) || [];
      existing.push(fullMemory);

      // Keep only recent memories (simple eviction)
      if (existing.length > this.maxMemoriesPerUser) {
        existing.shift(); // Remove oldest
      }

      this.memories.set(key, existing);
    }
  }

  /**
   * Get relevant context for a new query
   */
  async getContext(query: string, k: number = 5): Promise<MemorySearchResult[]> {
    if (this.useDatabase && this.postgresStore) {
      // Phase 2: Semantic search with pgvector
      return await this.postgresStore.search(query, this.context.userId, this.context.agentId, k);
    } else {
      // Phase 1: Simple recency-based retrieval
      const key = this.getStorageKey();
      const memories = this.memories.get(key) || [];

      return memories
        .slice(-k) // Get last k memories
        .reverse() // Most recent first
        .map((m) => ({ ...m, similarity: 1.0 })); // Mock similarity for now
    }
  }

  /**
   * Search memories by content
   */
  async search(query: string, k: number = 10): Promise<MemorySearchResult[]> {
    if (this.useDatabase && this.postgresStore) {
      // Phase 2: Semantic search with embeddings
      return await this.postgresStore.search(query, this.context.userId, this.context.agentId, k);
    } else {
      // Phase 1: Simple string matching
      const key = this.getStorageKey();
      const memories = this.memories.get(key) || [];

      const matches = memories.filter((m) => m.content.toLowerCase().includes(query.toLowerCase()));

      return matches
        .slice(-k)
        .reverse()
        .map((m) => ({ ...m, similarity: 1.0 }));
    }
  }

  /**
   * Get recent conversation history
   */
  async getRecentHistory(limit: number = 10): Promise<Memory[]> {
    if (this.useDatabase && this.postgresStore) {
      return await this.postgresStore.getRecent(this.context.userId, this.context.agentId, limit);
    } else {
      const key = this.getStorageKey();
      const memories = this.memories.get(key) || [];
      return memories.slice(-limit).reverse();
    }
  }

  /**
   * Clear session cache
   */
  async clearSession(): Promise<void> {
    if (this.useDatabase && this.postgresStore) {
      await this.postgresStore.clear(this.context.userId, this.context.agentId);
    } else {
      const key = this.getStorageKey();
      this.memories.delete(key);
    }
  }

  /**
   * Get storage key for current context
   */
  private getStorageKey(): string {
    return `${this.context.userId}:${this.context.agentId}`;
  }

  /**
   * Get memory statistics (useful for benchmarking)
   */
  async getStats(): Promise<{ totalMemories: number; userMemories?: number }> {
    if (this.useDatabase && this.postgresStore) {
      return await this.postgresStore.getStats(this.context.userId, this.context.agentId);
    } else {
      const key = this.getStorageKey();
      const userMemories = this.memories.get(key)?.length || 0;
      const totalMemories = Array.from(this.memories.values()).reduce(
        (sum, arr) => sum + arr.length,
        0
      );

      return { totalMemories, userMemories };
    }
  }

  /**
   * Close database connections (call when shutting down)
   */
  async close(): Promise<void> {
    if (this.postgresStore) {
      await this.postgresStore.close();
    }
  }

  /**
   * Test database connection (useful for health checks)
   */
  async testConnection(): Promise<boolean> {
    if (this.useDatabase && this.postgresStore) {
      return await this.postgresStore.testConnection();
    }
    return true; // In-memory always works
  }
}
