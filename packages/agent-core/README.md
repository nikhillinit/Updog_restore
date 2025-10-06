# @povc/agent-core

**Production-ready AI agent framework implementing Claude Cookbook patterns**

## Features

### Core Infrastructure

- **BaseAgent**: Abstract base class with retry logic, metrics, and health
  monitoring
- **ConversationMemory**: Multi-turn conversation persistence with cross-tool
  continuation (inspired by zen-mcp-server)
- **Logger**: JSON-structured logging with file and console output
- **MetricsCollector**: Prometheus metrics integration with comprehensive agent
  tracking
- **HealthMonitor**: Agent status monitoring with automatic degradation
  detection

### Advanced Patterns (Claude Cookbook) ⭐ NEW

- **PromptCache**: 85% latency reduction, 90% cost reduction through caching
- **AIRouter**: Intelligent model selection based on task characteristics
- **Orchestrator**: Parallel task delegation with dependency management
- **Evaluator-Optimizer**: Iterative improvement through feedback loops

### Quality & Reliability

- **Type-safe**: Full TypeScript support with comprehensive type definitions
- **Retry Logic**: Configurable retry attempts with exponential backoff
- **Execution Context**: Structured context tracking for all operations
- **Observability**: Complete monitoring stack integration with alerting

## Quick Start

```typescript
import { BaseAgent, AgentConfig } from '@povc/agent-core';

class MyAgent extends BaseAgent<string, string> {
  constructor() {
    super({
      name: 'my-agent',
      maxRetries: 3,
      retryDelay: 1000,
      slack: {
        webhookUrl: 'https://hooks.slack.com/services/...',
        channel: '#ai-agents',
        enabled: true,
      },
    });
  }

  protected async performOperation(input: string): Promise<string> {
    // Your agent logic here
    return `Processed: ${input}`;
  }
}

const agent = new MyAgent();
const result = await agent.execute('test input');

if (result.success) {
  console.log('Result:', result.data);
} else {
  console.error('Error:', result.error);
}

// Metrics are automatically collected and available at /metrics endpoint
```

## Advanced Patterns

### Prompt Caching (85% faster, 90% cheaper)

```typescript
import { PromptCache } from '@povc/agent-core';

const cache = new PromptCache({ enabled: true });

const cached = cache.buildCachedMessages({
  systemPrompt: 'You are a helpful assistant...',
  projectContext: claudeMd + decisionsContent,
  userQuery: 'Fix the test failures',
});

// First call: 20s, $0.30
// Cached calls: 3s, $0.03 ← 85% faster, 90% cheaper!
```

**Demo**: `npx tsx demo-prompt-cache.ts`

### AI Router (Smart Model Selection)

```typescript
import { AIRouter, createTask } from '@povc/agent-core';

const router = new AIRouter({ costSensitive: true });

const decision = router.route(
  createTask('typescript-error', 'Type mismatch in ReserveEngine', {
    complexity: 7,
  })
);

console.log(decision.model); // 'deepseek'
console.log(decision.confidence); // 0.95
console.log(decision.reason); // 'Specialized in code analysis...'
```

**Demo**: `npx tsx demo-router.ts`

### Orchestrator (Parallel Task Delegation)

```typescript
import { Orchestrator } from '@povc/agent-core';

const orchestrator = new Orchestrator({
  maxParallelWorkers: 3,
});

const result = await orchestrator.execute({
  taskDescription: 'Fix all failing tests',
  workerFunction: async (subtask) => {
    return await callAI(subtask.assignedWorker, subtask.description);
  },
});

// Automatic task decomposition → 3x faster through parallelization
```

**Demo**: `npx tsx demo-orchestrator.ts`

### Conversation Memory (Multi-Agent Workflows)

```typescript
import { BaseAgent, getThread, buildConversationHistory } from '@povc/agent-core';

class AnalyzerAgent extends BaseAgent<AnalyzerInput, AnalyzerOutput> {
  constructor() {
    super({
      name: 'analyzer',
      enableConversationMemory: true, // Enable conversation threading
    });
  }

  protected async performOperation(input, context) {
    // context.conversationHistory contains full conversation context
    if (context.conversationHistory) {
      console.log('Continuing conversation with full context!');
    }

    return await analyzeCode(input);
  }
}

// Agent A analyzes code
const analyzer = new AnalyzerAgent();
const result1 = await analyzer.execute({ files: ['test.ts'] }, 'analyze', {
  files: ['test.ts']
});

// Agent B fixes issues (with full context from Agent A)
const fixer = new FixerAgent();
const result2 = await fixer.execute({ issues: result1.data.issues }, 'fix', {
  continuationId: result1.continuationId,  // Continue conversation
  files: ['test.ts']
});

// Agent C validates (with context from A + B)
const validator = new ValidatorAgent();
const result3 = await validator.execute({ files: ['test.ts'] }, 'validate', {
  continuationId: result2.continuationId
});

// Full conversation history preserved across all agents!
```

**Features:**
- Thread-based conversations with UUID tracking
- Cross-tool continuation (analyzer → fixer → validator)
- File context preservation with newest-first prioritization
- Parent/child thread chains for conversation hierarchies
- Token-aware history with intelligent truncation
- In-memory or Redis storage backends

**Demo**: `npx tsx demo-conversation-memory.ts`

## Configuration

```typescript
interface AgentConfig {
  name: string; // Agent identifier
  maxRetries?: number; // Max retry attempts (default: 3)
  retryDelay?: number; // Base retry delay in ms (default: 1000)
  timeout?: number; // Operation timeout in ms (default: 30000)
  logLevel?: LogLevel; // Logging level (default: 'info')
  slack?: SlackConfig; // Slack notifications (optional)
}

interface SlackConfig {
  webhookUrl: string; // Slack webhook URL
  channel?: string; // Slack channel (default: '#ai-agents')
  username?: string; // Bot username (default: 'Agent Monitor')
  enabled?: boolean; // Enable notifications (default: true)
}
```

## Logging

All operations are automatically logged with structured JSON output:

```json
{
  "timestamp": "2025-01-22T22:30:15.123Z",
  "level": "info",
  "agent": "my-agent",
  "message": "Agent execution completed successfully",
  "data": {
    "result": { "success": true, "retries": 0, "duration": 1234 }
  }
}
```

## Development

```bash
# Build the package
npm run build

# Watch mode for development
npm run dev

# Run tests
npm test
```
