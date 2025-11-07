/**
 * PostgresMemoryStore - PostgreSQL + pgvector Storage Backend
 *
 * Provides persistent storage for agent memories with semantic search.
 */

import { Pool } from 'pg';
import type { Memory, MemorySearchResult } from './types';
import { EmbeddingService } from './EmbeddingService';
import { randomUUID } from 'crypto';

export interface PostgresMemoryStoreConfig {
  connectionString: string;
  embeddingApiKey?: string;
  useMockEmbeddings?: boolean;
}

export class PostgresMemoryStore {
  private pool: Pool;
  private embeddingService: EmbeddingService;

  constructor(config: PostgresMemoryStoreConfig) {
    this.pool = new Pool({
      connectionString: config.connectionString,
      max: 10, // Maximum connections in the pool
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    this.embeddingService = new EmbeddingService(config.embeddingApiKey, config.useMockEmbeddings);
  }

  /**
   * Add a new memory to PostgreSQL with vector embedding
   */
  async add(memory: Omit<Memory, 'id' | 'createdAt'>): Promise<void> {
    const client = await this.pool.connect();

    try {
      // Generate embedding for the content
      const embedding = await this.embeddingService.embed(memory.content);

      // Insert into database
      await client.query(
        `INSERT INTO agent_memories
         (id, user_id, agent_id, session_id, role, content, embedding, metadata, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::vector, $8, NOW(), NOW())`,
        [
          randomUUID(),
          memory.userId,
          memory.agentId,
          memory.metadata?.sessionId || null,
          memory.role,
          memory.content,
          JSON.stringify(embedding), // pgvector accepts JSON array format
          JSON.stringify(memory.metadata || {}),
        ]
      );
    } finally {
      client.release();
    }
  }

  /**
   * Search for similar memories using pgvector cosine similarity
   */
  async search(
    query: string,
    userId: string,
    agentId: string,
    k: number = 5
  ): Promise<MemorySearchResult[]> {
    const client = await this.pool.connect();

    try {
      // Generate embedding for the query
      const queryEmbedding = await this.embeddingService.embed(query);

      // Perform similarity search using pgvector
      const result = await client.query(
        `SELECT
           id,
           user_id,
           agent_id,
           session_id,
           role,
           content,
           embedding,
           metadata,
           created_at,
           1 - (embedding <=> $1::vector) as similarity
         FROM agent_memories
         WHERE user_id = $2 AND agent_id = $3
         ORDER BY embedding <=> $1::vector ASC
         LIMIT $4`,
        [JSON.stringify(queryEmbedding), userId, agentId, k]
      );

      return result.rows.map(
        (row: {
          id: string;
          user_id: string;
          agent_id: string;
          role: 'user' | 'assistant' | 'system';
          content: string;
          embedding: string;
          metadata: Record<string, unknown>;
          created_at: Date;
          similarity: string;
        }) => ({
          id: row.id,
          userId: row.user_id,
          agentId: row.agent_id,
          role: row.role,
          content: row.content,
          embedding: JSON.parse(row.embedding) as number[],
          metadata: row.metadata,
          createdAt: row.created_at,
          similarity: parseFloat(row.similarity),
        })
      );
    } finally {
      client.release();
    }
  }

  /**
   * Get recent memories (fallback for when semantic search isn't needed)
   */
  async getRecent(userId: string, agentId: string, limit: number = 10): Promise<Memory[]> {
    const client = await this.pool.connect();

    try {
      const result = await client.query(
        `SELECT
           id,
           user_id,
           agent_id,
           session_id,
           role,
           content,
           embedding,
           metadata,
           created_at
         FROM agent_memories
         WHERE user_id = $1 AND agent_id = $2
         ORDER BY created_at DESC
         LIMIT $3`,
        [userId, agentId, limit]
      );

      return result.rows.map(
        (row: {
          id: string;
          user_id: string;
          agent_id: string;
          role: 'user' | 'assistant' | 'system';
          content: string;
          embedding: string;
          metadata: Record<string, unknown>;
          created_at: Date;
        }) => ({
          id: row.id,
          userId: row.user_id,
          agentId: row.agent_id,
          role: row.role,
          content: row.content,
          embedding: JSON.parse(row.embedding) as number[],
          metadata: row.metadata,
          createdAt: row.created_at,
        })
      );
    } finally {
      client.release();
    }
  }

  /**
   * Clear all memories for a user-agent pair
   */
  async clear(userId: string, agentId: string): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query(
        `DELETE FROM agent_memories
         WHERE user_id = $1 AND agent_id = $2`,
        [userId, agentId]
      );
    } finally {
      client.release();
    }
  }

  /**
   * Get statistics about stored memories
   */
  async getStats(
    userId?: string,
    agentId?: string
  ): Promise<{
    totalMemories: number;
    userMemories?: number;
  }> {
    const client = await this.pool.connect();

    try {
      // Total memories
      const totalResult = await client.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM agent_memories`
      );

      const stats: { totalMemories: number; userMemories?: number } = {
        totalMemories: parseInt(totalResult.rows[0].count),
      };

      // User-specific memories if provided
      if (userId && agentId) {
        const userResult = await client.query<{ count: string }>(
          `SELECT COUNT(*) as count FROM agent_memories
           WHERE user_id = $1 AND agent_id = $2`,
          [userId, agentId]
        );
        stats.userMemories = parseInt(userResult.rows[0].count);
      }

      return stats;
    } finally {
      client.release();
    }
  }

  /**
   * Close the connection pool
   */
  async close(): Promise<void> {
    await this.pool.end();
  }

  /**
   * Test database connection
   */
  async testConnection(): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('SELECT 1');
      return true;
    } catch (error) {
      console.error('Database connection test failed:', error);
      return false;
    } finally {
      client.release();
    }
  }
}
