/**
 * mem0-inspired Memory Manager for AI Agents
 * Custom implementation to avoid dependency conflicts
 */

export { MemoryManager } from './MemoryManager';
export type { MemoryManagerConfig } from './MemoryManager';
export { PostgresMemoryStore } from './PostgresMemoryStore';
export type { PostgresMemoryStoreConfig } from './PostgresMemoryStore';
export { EmbeddingService } from './EmbeddingService';
export type { EmbeddingOptions } from './EmbeddingService';
export type { Memory, MemoryContext, MemorySearchResult } from './types';
