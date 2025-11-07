# Memory Manager

mem0-inspired memory management system for AI agents, custom-built to avoid
dependency conflicts.

## Phase 1: POC (Current)

Simple in-memory implementation:

- ✅ Add memories
- ✅ Retrieve recent context
- ✅ Search by content (string matching)
- ✅ Clear sessions
- ✅ Memory statistics

## Phase 2: Production (Planned)

Full hybrid architecture:

- [ ] PostgreSQL + pgvector for persistent storage
- [ ] Semantic search with embeddings
- [ ] Redis caching for recent history
- [ ] BullMQ worker for async embedding generation
- [ ] Multi-level memory (user/session/agent)

## Usage

```typescript
import { MemoryManager } from '@updog/memory-manager';

const manager = new MemoryManager({
  userId: 'user123',
  agentId: 'test-repair',
});

// Add memory
await manager.add({
  userId: 'user123',
  agentId: 'test-repair',
  role: 'user',
  content: 'Fix the async timeout test',
});

// Get relevant context
const context = await manager.getContext('test issues', 5);

// Search memories
const results = await manager.search('timeout', 10);
```

## Benefits

- **Token Reduction:** Only send relevant context, not full history
- **Better UX:** Agents remember past interactions
- **Faster Responses:** Smaller prompts = faster LLM inference
- **No Dep Conflicts:** Custom implementation compatible with our stack
