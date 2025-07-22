# @povc/agent-core

Core framework for AI-augmented development agents.

## Features

- **BaseAgent**: Abstract base class with retry logic and structured logging
- **Logger**: JSON-structured logging with file and console output
- **Type-safe**: Full TypeScript support with comprehensive type definitions
- **Retry Logic**: Configurable retry attempts with exponential backoff
- **Execution Context**: Structured context tracking for all operations

## Quick Start

```typescript
import { BaseAgent, AgentConfig } from '@povc/agent-core';

class MyAgent extends BaseAgent<string, string> {
  constructor() {
    super({
      name: 'my-agent',
      maxRetries: 3,
      retryDelay: 1000,
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
```

## Configuration

```typescript
interface AgentConfig {
  name: string;           // Agent identifier
  maxRetries?: number;    // Max retry attempts (default: 3)
  retryDelay?: number;    // Base retry delay in ms (default: 1000)
  timeout?: number;       // Operation timeout in ms (default: 30000)
  logLevel?: LogLevel;    // Logging level (default: 'info')
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