/**
 * mem0-inspired Memory Manager for AI Agents
 * Phase 1: Simple in-memory implementation
 * Phase 2: Add PostgreSQL + pgvector + Redis
 */

export interface Memory {
  id: string;
  userId: string;
  agentId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  embedding?: number[];
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface MemoryContext {
  userId: string;
  agentId: string;
  sessionId?: string;
}

export interface MemorySearchResult extends Memory {
  similarity?: number;
}
