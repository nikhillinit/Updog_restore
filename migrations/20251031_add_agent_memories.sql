-- Migration: Add agent_memories table for mem0-inspired memory system
-- Date: 2025-10-31
-- Phase: 2 (Production)

-- Enable pgvector extension (Neon supports this)
CREATE EXTENSION IF NOT EXISTS vector;

-- Create agent_memories table
CREATE TABLE IF NOT EXISTS agent_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- User identifier (simplified for 10-user scale)
    user_id UUID NOT NULL,

    -- Agent and session context
    agent_id VARCHAR(50) NOT NULL,
    session_id UUID,

    -- Memory content
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,

    -- Vector embedding (1536 dimensions for text-embedding-3-small)
    embedding VECTOR(1536) NOT NULL,

    -- Additional metadata (flexible JSON storage)
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- HNSW index for fast similarity search (O(log n) complexity)
-- This is the key to fast semantic search
CREATE INDEX IF NOT EXISTS agent_memories_embedding_idx
ON agent_memories
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- B-tree indexes for filtering
CREATE INDEX IF NOT EXISTS agent_memories_user_idx
ON agent_memories(user_id);

CREATE INDEX IF NOT EXISTS agent_memories_agent_id_idx
ON agent_memories(agent_id);

CREATE INDEX IF NOT EXISTS agent_memories_created_at_idx
ON agent_memories(created_at DESC);

-- Composite index for common query pattern
CREATE INDEX IF NOT EXISTS agent_memories_user_agent_idx
ON agent_memories(user_id, agent_id, created_at DESC);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_agent_memories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at
CREATE TRIGGER update_agent_memories_timestamp
BEFORE UPDATE ON agent_memories
FOR EACH ROW EXECUTE FUNCTION update_agent_memories_updated_at();

-- View for recent user memories (commonly used query)
CREATE OR REPLACE VIEW recent_user_memories AS
SELECT * FROM agent_memories
WHERE created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;

-- Grant permissions (adjust as needed for your user)
-- GRANT ALL ON agent_memories TO your_user;
-- GRANT USAGE ON SEQUENCE agent_memories_id_seq TO your_user;

-- Add helpful comment
COMMENT ON TABLE agent_memories IS 'Stores AI agent conversation memories with vector embeddings for semantic search';
COMMENT ON COLUMN agent_memories.embedding IS 'Vector embedding from OpenAI text-embedding-3-small (1536 dimensions)';
COMMENT ON INDEX agent_memories_embedding_idx IS 'HNSW index for fast cosine similarity search';
