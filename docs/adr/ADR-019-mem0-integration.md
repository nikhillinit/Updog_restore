---
status: ACTIVE
last_updated: 2026-01-19
---

# ADR-019: mem0 Integration for AI Agent Memory Management

**Status:** Proposed **Date:** 2025-10-31 **Decision Makers:** Engineering Team,
AI Architecture Team **Consulted:** Gemini AI Expert, OpenAI AI Expert, Deep
Reasoning Analysis

## Executive Summary

### Problem Statement

The Press On Ventures VC fund modeling platform currently faces three critical
challenges with its AI agent system:

1. **Inefficient Token Usage:** Each agent interaction requires sending the
   entire conversation history to the LLM, resulting in token consumption
   averaging 8,000+ tokens per request. With ~10 users running occasional
   calculations, this adds up quickly for a solo project.

2. **Poor Response Performance:** Large context windows (8,000-15,000 tokens)
   significantly increase LLM inference latency, leading to slow response times
   during complex modeling sessions.

3. **No Contextual Memory:** Agents operate statelessly with no memory of past
   interactions within or across sessions. Users must repeat information, making
   agents feel transactional rather than intelligent partners.

### Recommended Solution: Hybrid Memory Architecture

After consultation with multiple AI architecture experts (Gemini, OpenAI) and
deep reasoning analysis, we recommend integrating **mem0** - a self-hostable AI
memory management system - using a **hybrid architecture** that balances
operational simplicity with architectural best practices.

**Key Decision:** Use an integrated module approach with PostgreSQL + pgvector
(NOT a separate microservice) combined with Redis caching, implemented via a
MemoryManager abstraction layer.

This approach was selected over:

- ❌ Separate Docker microservice (too complex for 50-100 user scale)
- ❌ Direct BaseAgent inheritance (creates tight coupling and maintainability
  issues)
- ❌ Third-party hosted mem0 service (privacy concerns with financial data)

### Expected Impact

**Performance Targets:**

- 90% token reduction per API call (8,000 tokens → 800 tokens)
- 91% faster response times (via cache hits + smaller prompts)
- 26% accuracy improvement through semantic context retrieval

**Financial Impact:**

- Development cost: ~160 developer-hours
- Infrastructure cost: <$80/month increase
- **Annual savings: ~$438,000** (10k calls/day × 4k tokens × $0.03/1k)
- ROI timeframe: <1 month

**User Experience:**

- Persistent memory across sessions
- Personalized agent interactions
- Context-aware recommendations
- Faster, more responsive platform

---

## Table of Contents

1. [Context and Background](#context-and-background)
2. [Technical Architecture](#technical-architecture)
3. [Implementation Phases](#implementation-phases)
4. [Integration Points](#integration-points)
5. [Performance Targets and Measurement](#performance-targets-and-measurement)
6. [Security and Privacy](#security-and-privacy)
7. [Testing Strategy](#testing-strategy)
8. [Operational Considerations](#operational-considerations)
9. [Cost-Benefit Analysis](#cost-benefit-analysis)
10. [Decision Rationale](#decision-rationale)
11. [Alternatives Considered](#alternatives-considered)
12. [References](#references)

---

## Context and Background

### Current State

**Technology Stack:**

- Frontend: React 18, TypeScript, Vite, TanStack Query
- Backend: Express.js, Node.js, TypeScript
- Workers: BullMQ + Redis for async job processing
- Database: PostgreSQL with Drizzle ORM
- AI Agents: 5 specialized agents in `packages/agent-core/`
  - test-repair-agent
  - code-reviewer
  - evaluator-optimizer
  - BacktestRunner
  - Orchestrator

**Current Agent Architecture:**

```typescript
// packages/agent-core/src/BaseAgent.ts
class BaseAgent {
  async execute(history: Message[]): Promise<string> {
    // Currently: Send ENTIRE history to LLM every time
    const prompt = this.buildPrompt(history);
    return this.llm.call(prompt);
  }
}
```

**Current Pain Points:**

1. Frontend must manage and send full conversation history
2. No semantic search over past interactions
3. No user preference learning
4. No cross-session context
5. High token costs scale linearly with conversation length

### What is mem0?

mem0 is an open-source intelligent memory layer for AI agents that provides:

- Multi-level memory (user, session, agent)
- Semantic search over past interactions
- Automatic memory extraction and storage
- 90% token reduction through intelligent context retrieval
- Self-hosted deployment for privacy-first applications

**Performance Benchmarks (from mem0 documentation):**

- +26% accuracy vs OpenAI Memory
- 91% faster responses vs full-context approaches
- 90% lower token usage

### Why Now?

1. **Scale Threshold:** 10,000+ daily calculations justify optimization
2. **User Feedback:** Users request contextual memory in agent interactions
3. **Cost Pressure:** LLM API costs growing with platform usage
4. **Competitive Advantage:** Intelligent, persistent agents differentiate
   platform
5. **Technical Maturity:** PostgreSQL pgvector extension is production-ready

---

## Technical Architecture

### System Overview

```
┌─────────────┐      ┌──────────────────┐      ┌─────────────────┐
│   React     │─────▶│  Express API     │─────▶│   BaseAgent     │
│  Frontend   │      │  (Routes)        │      │  (Composition)  │
└─────────────┘      └────────┬─────────┘      └────────┬────────┘
                              │                         │
                              │                         │
                              ▼                         ▼
                    ┌──────────────────────────────────────────┐
                    │         MemoryManager                    │
                    │       (Abstraction Layer)                │
                    │                                          │
                    │  - add(memory)                           │
                    │  - getContext(query, k)                  │
                    │  - search(query, k)                      │
                    │  - getRecentHistory(limit)               │
                    └──────────┬───────────────────────────────┘
                               │
                ┌──────────────┼──────────────┐
                │              │              │
                ▼              ▼              ▼
    ┌──────────────────┐  ┌────────────┐  ┌──────────────────┐
    │  Redis Cache     │  │  BullMQ    │  │  PostgreSQL      │
    │  (Session)       │  │  Worker    │  │  + pgvector      │
    │                  │  │  Queue     │  │  (Persistent)    │
    │  Key: memory:    │  │            │  │                  │
    │  tenant:user:    │  │  Embedding │  │  agent_memories  │
    │  agent           │  │  Generation│  │  table           │
    │  TTL: 24h        │  │            │  │                  │
    └──────────────────┘  └────────────┘  └──────────────────┘
```

### Core Component: MemoryManager

The `MemoryManager` is a new abstraction layer that decouples memory logic from
agent logic. It will be created as a shared package: `packages/memory-manager/`

**TypeScript Interface:**

```typescript
// packages/memory-manager/src/types.ts
interface Memory {
  id: string;
  userId: string;
  tenantId: string;
  agentId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  embedding?: number[];
  metadata?: Record<string, any>;
  createdAt: Date;
}

interface MemoryContext {
  userId: string;
  tenantId: string;
  agentId: string;
  sessionId?: string;
}

// packages/memory-manager/src/MemoryManager.ts
export class MemoryManager {
  constructor(private context: MemoryContext) {}

  /**
   * Add a new memory to cache and queue for persistence
   * @param memory - The memory content to store
   * @returns Promise<void>
   */
  async add(memory: Omit<Memory, 'id' | 'createdAt'>): Promise<void>;

  /**
   * Retrieve the most relevant context for a query using hybrid strategy:
   * 1. Check Redis cache for recent session history
   * 2. Query pgvector for semantically similar past interactions
   * 3. Merge and rank by relevance + recency
   *
   * @param query - User's current input
   * @param k - Number of relevant memories to retrieve (default: 5)
   * @returns Promise<Memory[]>
   */
  async getContext(query: string, k?: number): Promise<Memory[]>;

  /**
   * Search long-term memory using semantic similarity
   * @param query - Search query
   * @param k - Number of results (default: 10)
   * @returns Promise<Memory[]>
   */
  async search(query: string, k?: number): Promise<Memory[]>;

  /**
   * Get recent conversation history from cache
   * @param limit - Number of recent messages (default: 10)
   * @returns Promise<Memory[]>
   */
  async getRecentHistory(limit?: number): Promise<Memory[]>;

  /**
   * Clear session cache (e.g., on logout)
   */
  async clearSession(): Promise<void>;
}
```

### PostgreSQL Schema with pgvector

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create agent_memories table
CREATE TABLE agent_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Multi-tenancy identifiers (CRITICAL for data isolation)
    user_id UUID NOT NULL,
    tenant_id UUID NOT NULL,

    -- Agent and session context
    agent_id VARCHAR(50) NOT NULL,
    session_id UUID,

    -- Memory content
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,

    -- Vector embedding (1536 dimensions for text-embedding-ada-002)
    embedding VECTOR(1536) NOT NULL,

    -- Additional metadata (flexible JSON storage)
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Indexes for performance
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- HNSW index for fast similarity search (O(log n) complexity)
CREATE INDEX agent_memories_embedding_idx
ON agent_memories
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- B-tree indexes for filtering
CREATE INDEX agent_memories_user_tenant_idx
ON agent_memories(user_id, tenant_id);

CREATE INDEX agent_memories_agent_id_idx
ON agent_memories(agent_id);

CREATE INDEX agent_memories_created_at_idx
ON agent_memories(created_at DESC);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_agent_memories_updated_at
BEFORE UPDATE ON agent_memories
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- View for recent user memories (commonly used query)
CREATE VIEW recent_user_memories AS
SELECT * FROM agent_memories
WHERE created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;
```

### Redis Caching Strategy

**Purpose:** Store recent conversation history for ultra-fast retrieval
(sub-millisecond latency)

**Data Structure:** Redis Lists (LPUSH/LRANGE operations)

**Key Naming Convention:**

```
memory:tenant:{tenantId}:user:{userId}:agent:{agentId}
```

**Example:**

```
memory:tenant:a1b2c3:user:d4e5f6:agent:test-repair
```

**Implementation:**

```typescript
// packages/memory-manager/src/RedisCache.ts
export class RedisCache {
  private readonly MAX_HISTORY = 20; // Keep last 20 messages
  private readonly TTL = 86400; // 24 hours in seconds

  async addToCache(key: string, memory: Memory): Promise<void> {
    const serialized = JSON.stringify(memory);

    await this.redis
      .multi()
      .lpush(key, serialized)
      .ltrim(key, 0, this.MAX_HISTORY - 1) // Keep only recent messages
      .expire(key, this.TTL) // Auto-expire after 24h
      .exec();
  }

  async getFromCache(key: string, limit: number = 10): Promise<Memory[]> {
    const cached = await this.redis.lrange(key, 0, limit - 1);
    return cached.map((item) => JSON.parse(item));
  }

  async clearCache(key: string): Promise<void> {
    await this.redis.del(key);
  }
}
```

**Cache Strategy:**

1. **Write-Through:** Every memory added via `MemoryManager.add()` is
   immediately written to Redis
2. **Lazy Load:** BullMQ worker asynchronously generates embedding and persists
   to PostgreSQL
3. **TTL Management:** Cache automatically expires after 24 hours to prevent
   stale data
4. **Eviction Policy:** LTRIM ensures only recent N messages are kept per
   session

### Hybrid Context Retrieval Strategy

The `getContext()` method implements a sophisticated hybrid approach:

```typescript
async getContext(query: string, k: number = 5): Promise<Memory[]> {
  const cacheKey = this.buildCacheKey();

  // Step 1: Get recent session history from Redis (fast)
  const recentMemories = await this.redisCache.getFromCache(cacheKey, 10);

  // Step 2: Generate embedding for the query
  const queryEmbedding = await this.embeddingService.embed(query);

  // Step 3: Query pgvector for semantically similar memories
  const semanticMemories = await this.db.execute(sql`
    SELECT *,
           1 - (embedding <=> ${queryEmbedding}) as similarity
    FROM agent_memories
    WHERE user_id = ${this.context.userId}
      AND tenant_id = ${this.context.tenantId}
      AND agent_id = ${this.context.agentId}
    ORDER BY similarity DESC
    LIMIT ${k}
  `);

  // Step 4: Merge and deduplicate
  const allMemories = [...recentMemories, ...semanticMemories];
  const uniqueMemories = this.deduplicateById(allMemories);

  // Step 5: Rank by relevance + recency
  const ranked = this.rankMemories(uniqueMemories, query);

  return ranked.slice(0, k);
}
```

**Ranking Algorithm:**

```typescript
private rankMemories(memories: Memory[], query: string): Memory[] {
  return memories
    .map(memory => ({
      memory,
      score: this.calculateScore(memory, query)
    }))
    .sort((a, b) => b.score - a.score)
    .map(item => item.memory);
}

private calculateScore(memory: Memory, query: string): number {
  // Weighted scoring: 70% semantic similarity, 30% recency
  const semanticScore = memory.similarity || 0;
  const recencyScore = this.calculateRecencyScore(memory.createdAt);

  return (semanticScore * 0.7) + (recencyScore * 0.3);
}

private calculateRecencyScore(timestamp: Date): number {
  const ageInHours = (Date.now() - timestamp.getTime()) / (1000 * 60 * 60);
  return Math.exp(-ageInHours / 168); // Exponential decay over 1 week
}
```

---
