# Conversation Memory System

## Overview

The Conversation Memory system enables multi-turn conversations with full context preservation across different AI agents. Inspired by zen-mcp-server's conversation architecture, it provides thread-based conversation tracking, cross-tool continuation, and intelligent context management.

## Key Features

### 1. Thread-Based Conversations
- Each conversation gets a unique UUID thread identifier
- Conversations persist across agent executions
- Parent/child thread chains for hierarchical workflows
- Automatic TTL management (default 3 hours)

### 2. Cross-Tool Continuation
Agents can seamlessly hand off conversations while preserving full context:

```typescript
// Agent A (analyzer) starts
const result1 = await analyzer.execute(input, 'analyze');
// → continuationId: "uuid-1234"

// Agent B (fixer) continues with FULL context from Agent A
const result2 = await fixer.execute(input, 'fix', {
  continuationId: result1.continuationId
});

// Agent C (validator) has context from BOTH A and B
const result3 = await validator.execute(input, 'validate', {
  continuationId: result2.continuationId
});
```

### 3. File Context Preservation
- Files shared in earlier turns remain accessible
- **Newest-first prioritization**: When the same file appears in multiple turns, the reference from the newest turn takes precedence
- Automatic deduplication with preference for recent references

### 4. Token-Aware History
- Model-specific token allocation (file_tokens + history_tokens)
- Intelligent truncation: newest turns prioritized, oldest excluded first
- Graceful degradation when context limits are reached
- Files embedded once to prevent duplication

### 5. Dual Storage Backends
- **In-memory**: Fast, perfect for development/testing
- **Redis**: Production-ready with persistence and TTL

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Agent Orchestration                     │
│                                                             │
│  Agent A         Agent B          Agent C                   │
│  (Analyzer) ───► (Fixer)   ────► (Validator)               │
│      │              │                 │                     │
│      │              │                 │                     │
│      └──────────────┴─────────────────┘                     │
│                     │                                       │
│                     ▼                                       │
│            ┌─────────────────────┐                          │
│            │  Conversation       │                          │
│            │  Memory System      │                          │
│            └─────────────────────┘                          │
│                     │                                       │
│         ┌───────────┴───────────┐                           │
│         ▼                       ▼                           │
│   ┌──────────┐          ┌──────────┐                       │
│   │ In-Memory│          │  Redis   │                       │
│   │ Storage  │          │ Storage  │                       │
│   └──────────┘          └──────────┘                       │
└─────────────────────────────────────────────────────────────┘
```

## Core Concepts

### ThreadContext
Represents a complete conversation with:
- `threadId`: Unique UUID
- `parentThreadId`: Optional parent for chains
- `toolName`: Tool that created the thread
- `turns`: Array of conversation turns
- `initialContext`: Original request parameters
- `createdAt` / `lastUpdatedAt`: Timestamps

### ConversationTurn
Individual message in a conversation:
- `role`: "user" (agent request) or "assistant" (response)
- `content`: Message/response text
- `files`: File paths referenced in this turn
- `images`: Image paths referenced
- `toolName`: Tool that generated this turn
- `modelProvider` / `modelName`: Model info
- `modelMetadata`: Additional metadata (tokens, duration, etc.)

## API Reference

### Core Functions

#### createThread(toolName, initialContext, parentThreadId?)
Create a new conversation thread.

```typescript
const threadId = await createThread('analyzer', { files: ['test.ts'] });
```

#### getThread(threadId)
Retrieve thread context.

```typescript
const thread = await getThread(threadId);
if (thread) {
  console.log(`Thread has ${thread.turns.length} turns`);
}
```

#### addTurn(threadId, role, content, metadata?)
Add a turn to the conversation.

```typescript
await addTurn(threadId, 'assistant', 'Analysis complete', {
  files: ['test.ts'],
  toolName: 'analyzer',
  modelName: 'claude-sonnet-4',
  modelMetadata: { tokens: 1234, duration: 5000 }
});
```

#### getThreadChain(threadId, maxDepth?)
Get complete conversation chain following parent links.

```typescript
const chain = await getThreadChain(threadId);
// Returns all threads in chronological order (oldest first)
```

#### buildConversationHistory(context, options?)
Build formatted history with embedded files.

```typescript
const { history, tokens } = await buildConversationHistory(thread, {
  maxFileTokens: 50000,
  maxHistoryTokens: 100000,
  includeFiles: true
});

// history contains formatted conversation with file contents
// tokens is estimated token count
```

### Helper Functions

#### getConversationFileList(context)
Extract unique files with newest-first prioritization.

#### getConversationImageList(context)
Extract unique images with newest-first prioritization.

#### clearAllThreads()
Clear all threads (testing/development).

## BaseAgent Integration

Enable conversation memory in your agent:

```typescript
class MyAgent extends BaseAgent<Input, Output> {
  constructor() {
    super({
      name: 'my-agent',
      enableConversationMemory: true,  // ← Enable here
    });
  }

  protected async performOperation(
    input: Input,
    context: AgentExecutionContext
  ): Promise<Output> {
    // Access conversation history
    if (context.conversationHistory) {
      console.log('Continuing conversation with full context!');
      // Use context.conversationHistory in your prompts
    }

    // Your agent logic here
    return result;
  }
}
```

Execute with continuation:

```typescript
const result = await agent.execute(input, 'operation', {
  continuationId: 'previous-thread-id',
  files: ['file1.ts', 'file2.ts'],
  images: ['diagram.png']
});

console.log('Continuation ID:', result.continuationId);
```

## Configuration

### Environment Variables

```bash
# Maximum turns per conversation (default: 50)
MAX_CONVERSATION_TURNS=50

# Thread TTL in hours (default: 3)
CONVERSATION_TIMEOUT_HOURS=3
```

### Storage Backend

```typescript
import { initializeStorage } from '@povc/agent-core';

// In-memory (default, for development)
initializeStorage();

// Redis (production)
import { createClient } from 'redis';
const redisClient = await createClient().connect();
initializeStorage(redisClient);
```

## Usage Examples

### Example 1: Three-Agent Workflow

```typescript
// Step 1: Analyzer finds issues
const analyzer = new AnalyzerAgent();
const analysis = await analyzer.execute({ files: ['test.ts'] });

// Step 2: Fixer applies fixes (with analyzer context)
const fixer = new FixerAgent();
const fixes = await fixer.execute(
  { issues: analysis.data.issues },
  'fix',
  { continuationId: analysis.continuationId }
);

// Step 3: Validator verifies (with analyzer + fixer context)
const validator = new ValidatorAgent();
const validation = await validator.execute(
  { files: ['test.ts'] },
  'validate',
  { continuationId: fixes.continuationId }
);

// All agents share full conversation history!
```

### Example 2: Parent/Child Threads

```typescript
// Main task
const mainThread = await createThread('orchestrator', { task: 'main' });

// Spawn subtasks with parent link
const subtask1 = await createThread('worker-1', { task: 'sub1' }, mainThread);
const subtask2 = await createThread('worker-2', { task: 'sub2' }, mainThread);

// Each subtask can access main thread context via chain
const chain = await getThreadChain(subtask1);
// chain[0] = main thread, chain[1] = subtask1
```

### Example 3: Custom History Building

```typescript
const thread = await getThread(continuationId);
const { history, tokens } = await buildConversationHistory(thread!, {
  maxFileTokens: 30000,     // Limit file content
  maxHistoryTokens: 50000,  // Limit history
  includeFiles: true        // Embed file contents
});

// Use in your prompt
const prompt = `
${history}

Current task: ${currentTask}
Please provide your analysis.
`;
```

## Prioritization Strategy

### File Prioritization (Newest-First)
When the same file appears in multiple turns:

```
Turn 1: files = ["main.ts", "utils.ts"]
Turn 2: files = ["test.ts"]
Turn 3: files = ["main.ts", "config.ts"]  // main.ts appears again

Result: ["main.ts", "config.ts", "test.ts", "utils.ts"]
         └─ from Turn 3 (newest), not Turn 1
```

### Turn Prioritization (Two-Phase)
1. **Collection Phase**: Newest-first for token budget
   - When budget is tight, older turns are excluded first
2. **Presentation Phase**: Chronological for LLM comprehension
   - LLM sees "Turn 1 → Turn 2 → Turn 3" natural flow

## Testing

Run the comprehensive test suite:

```bash
cd packages/agent-core
npm test -- ConversationMemory.test.ts
```

Run the demo:

```bash
npx tsx demo-conversation-memory.ts
```

## Performance Characteristics

- **Thread Creation**: O(1) - Single UUID generation + storage write
- **Turn Addition**: O(1) - Append to array + storage update
- **File Collection**: O(n*m) where n=turns, m=files per turn
- **History Building**: O(n) where n=total content size
- **Token Estimation**: O(n) character counting (4 chars ≈ 1 token)
- **Storage**: In-memory O(1), Redis O(1) with network latency

## Comparison with zen-mcp-server

| Feature | zen-mcp-server (Python) | agent-core (TypeScript) |
|---------|------------------------|-------------------------|
| Thread tracking | ✅ UUID-based | ✅ UUID-based |
| Cross-tool continuation | ✅ | ✅ |
| File prioritization | ✅ Newest-first | ✅ Newest-first |
| Token budgeting | ✅ Model-specific | ✅ Model-agnostic |
| Storage backends | ✅ Redis + In-memory | ✅ Redis + In-memory |
| Parent/child chains | ✅ | ✅ |
| Turn limits | ✅ Configurable | ✅ Configurable |
| Type safety | ❌ Python types | ✅ Zod + TypeScript |

## Troubleshooting

### "Thread not found"
- Thread may have expired (check CONVERSATION_TIMEOUT_HOURS)
- Invalid UUID format
- Storage backend not initialized

### "Max turns reached"
- Increase MAX_CONVERSATION_TURNS environment variable
- Start a new thread with parentThreadId to chain conversations

### "Context too large"
- Reduce maxFileTokens or maxHistoryTokens
- System automatically truncates oldest turns first
- Consider splitting into parent/child threads

### "Files not appearing in history"
- Check that files are passed in execute options: `{ files: [...] }`
- Verify file paths are absolute and accessible
- Check token budget (files may be excluded due to size)

## Best Practices

1. **Enable selectively**: Only enable conversation memory for agents that need it
2. **Pass files explicitly**: Always include file paths in execute options
3. **Use parent/child chains**: For complex workflows with multiple subtasks
4. **Monitor token usage**: Use buildConversationHistory to check token counts
5. **Test with clearAllThreads**: Clean slate for each test run
6. **Production storage**: Use Redis for production deployments
7. **Set appropriate limits**: Tune MAX_CONVERSATION_TURNS and timeouts for your use case

## Credits

Architecture and patterns inspired by:
- [zen-mcp-server](https://github.com/BeehiveInnovations/zen-mcp-server) - Conversation memory implementation
- [Claude Cookbook](https://github.com/anthropics/anthropic-cookbook) - Agent orchestration patterns
- [Model Context Protocol](https://modelcontextprotocol.io/) - MCP architecture principles
