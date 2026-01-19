---
status: ACTIVE
last_updated: 2026-01-19
---

# Agent Memory Integration Cheatsheet

Complete guide for integrating native memory tools (HybridMemoryManager,
PatternLearningEngine, ToolHandler) into your agents.

## Quick Start (3 Lines)

```typescript
import { BaseAgent } from '@agent-core';

const agent = new YourAgent({
  name: 'YourAgent',
  enableNativeMemory: true, // Enable hybrid memory (Redis + Native)
  enablePatternLearning: true, // Enable cross-session pattern learning
  tenantId: 'user:project', // Multi-tenant isolation
});
```

That's it! BaseAgent now auto-initializes:

- ✅ HybridMemoryManager for storage
- ✅ PatternLearningEngine for learning
- ✅ ToolHandler for native memory operations
- ✅ TenantContext for isolation

## Configuration Options

### AgentConfig Interface

```typescript
interface AgentConfig {
  name: string;

  // Existing options
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  enableConversationMemory?: boolean;

  // Native Memory Integration (NEW)
  enableNativeMemory?: boolean; // Enable hybrid memory storage
  enablePatternLearning?: boolean; // Enable pattern learning engine
  tenantId?: string; // Format: "user:project" or "org:team:project"
  memoryScope?: 'session' | 'project' | 'longterm'; // Default: 'project'
}
```

### Memory Scopes

| Scope      | Storage        | Persistence                  | Use Case                             |
| ---------- | -------------- | ---------------------------- | ------------------------------------ |
| `session`  | Redis only     | Until Redis TTL              | Temporary session data               |
| `project`  | Redis + Native | Permanent (with Redis cache) | Cross-session project data           |
| `longterm` | Native only    | Permanent                    | Long-term learnings, global patterns |

## Pattern Recording Workflow

### 1. Automatic Pattern Recording

BaseAgent **automatically records** patterns in `execute()`:

- ✅ Success patterns on successful execution
- ✅ Failure patterns on failed execution
- ✅ Execution context, duration, retry count

**No additional code needed!** Just enable `enablePatternLearning: true`.

### 2. Manual Pattern Recording

For fine-grained control, use protected methods:

```typescript
class YourAgent extends BaseAgent {
  protected async performOperation(input, context) {
    // Try a specific approach
    try {
      const result = await this.tryApproach(input);

      // Record what worked
      await this.recordSuccessPattern(
        'approach-1-context',
        JSON.stringify(input),
        'Successfully processed with approach 1'
      );

      return result;
    } catch (error) {
      // Record what didn't work
      await this.recordFailurePattern(
        'approach-1-context',
        JSON.stringify(input),
        error.message
      );

      throw error;
    }
  }
}
```

### 3. Retrieving Learned Patterns

```typescript
// Get patterns relevant to current context
const patterns = await this.getLearnedPatterns('error-type: TypeError');

// patterns is an array of strings containing successful approaches
console.log('Learned patterns:', patterns);

// Use patterns to inform decision-making
if (patterns.includes('use-type-annotation-fix')) {
  // Apply known fix
}
```

## Memory Storage Workflow

### 1. Storing Data

```typescript
// Store in project scope (default)
await this.storeMemory('cache-key', { data: 'value' });

// Store in specific scope
await this.storeMemory('session-data', { temp: true }, 'session');
await this.storeMemory('global-config', { setting: 1 }, 'longterm');

// Complex data (automatically serialized)
await this.storeMemory('analysis-results', {
  timestamp: Date.now(),
  results: [...],
  metadata: { ... },
});
```

### 2. Retrieving Data

```typescript
// Retrieve from project scope (default)
const data = await this.getMemory<{ data: string }>('cache-key');

if (data) {
  console.log('Found cached data:', data.data);
}

// Retrieve from specific scope
const sessionData = await this.getMemory('session-data', 'session');
const globalConfig = await this.getMemory('global-config', 'longterm');

// Returns null if not found (no exception)
const missing = await this.getMemory('non-existent-key');
console.log(missing); // null
```

## Complete Example: Test Repair Agent

```typescript
import { BaseAgent, AgentConfig, AgentExecutionContext } from '@agent-core';

interface RepairInput {
  filePath: string;
  errorMessage: string;
  code: string;
}

interface RepairOutput {
  success: boolean;
  fixedCode?: string;
  patternsUsed: string[];
}

class TestRepairAgent extends BaseAgent<RepairInput, RepairOutput> {
  constructor() {
    super({
      name: 'TestRepairAgent',
      enableNativeMemory: true,
      enablePatternLearning: true,
      tenantId: 'test-repair:global',
      memoryScope: 'project',
    });
  }

  protected async performOperation(
    input: RepairInput,
    context: AgentExecutionContext
  ): Promise<RepairOutput> {
    const patternsUsed: string[] = [];

    // Check cache for similar errors
    const cacheKey = `fix:${input.filePath}:${this.hashError(input.errorMessage)}`;
    const cachedFix = await this.getMemory<{ code: string }>(cacheKey);

    if (cachedFix) {
      return {
        success: true,
        fixedCode: cachedFix.code,
        patternsUsed: ['cached-fix'],
      };
    }

    // Get learned patterns for this error type
    const errorContext = this.extractErrorType(input.errorMessage);
    const learnedPatterns = await this.getLearnedPatterns(errorContext);
    patternsUsed.push(...learnedPatterns);

    // Apply repair
    const result = await this.applyRepair(input, learnedPatterns);

    if (result.success) {
      // Cache successful fix
      await this.storeMemory(cacheKey, { code: result.fixedCode });

      // Record pattern (automatic via execute(), or manual)
      await this.recordSuccessPattern(
        errorContext,
        `Fix: ${result.strategy}`,
        'Successfully repaired'
      );
    }

    return {
      success: result.success,
      fixedCode: result.fixedCode,
      patternsUsed,
    };
  }

  private extractErrorType(errorMessage: string): string {
    const match = errorMessage.match(/^(\w+Error)/);
    return match ? match[1] : 'UnknownError';
  }

  private hashError(errorMessage: string): string {
    // Simple hash implementation
    return errorMessage
      .split('')
      .reduce((hash, char) => {
        return (hash << 5) - hash + char.charCodeAt(0);
      }, 0)
      .toString(36);
  }

  private async applyRepair(input: RepairInput, patterns: string[]) {
    // Your repair logic here
    return { success: true, fixedCode: input.code, strategy: 'type-fix' };
  }
}

// Usage
const agent = new TestRepairAgent();

const result = await agent.execute({
  filePath: 'src/utils.ts',
  errorMessage: 'TypeError: Cannot read property...',
  code: 'function foo() { ... }',
});

console.log('Patterns used:', result.data?.patternsUsed);
```

## Multi-Tenant Configuration

### User:Project Isolation

```typescript
// Different users, same project
const agent1 = new Agent({ tenantId: 'alice:project-alpha' });
const agent2 = new Agent({ tenantId: 'bob:project-alpha' });

// Isolated learnings - alice and bob have separate pattern stores
```

### Organization:Team:Project

```typescript
// Team-level isolation
const teamAgent = new Agent({
  tenantId: 'acme:engineering:payment-service',
});

// Share patterns across team members
const member1 = new Agent({ tenantId: 'acme:engineering:payment-service' });
const member2 = new Agent({ tenantId: 'acme:engineering:payment-service' });

// member1 and member2 share learned patterns
```

### Global Sharing

```typescript
// Share patterns globally across all projects
const globalAgent = new Agent({
  tenantId: 'global:shared-patterns',
  memoryScope: 'longterm',
});
```

## Token Budget Management

BaseAgent integrates with TokenBudgetManager automatically:

- **30%** reserved for conversation history
- **15%** reserved for memory retrieval
- **10%** reserved for learned patterns

**No configuration needed** - handled automatically by HybridMemoryManager.

## Event Bus Integration

Memory operations trigger events:

```typescript
// Events are emitted automatically:
// - 'memory:set' when storeMemory() is called
// - 'memory:get' when getMemory() is called
// - 'pattern:record' when recordSuccessPattern() is called

// Events trigger cache invalidation and metrics collection
```

## Common Patterns

### Pattern 1: Cached Computation

```typescript
const cacheKey = `compute:${input.hash}`;
const cached = await this.getMemory(cacheKey);

if (cached) {
  return cached; // Fast path
}

const result = await this.expensiveComputation(input);
await this.storeMemory(cacheKey, result);
return result;
```

### Pattern 2: Progressive Learning

```typescript
// Start with basic strategies
const strategies = ['strategy-1', 'strategy-2'];

// Add learned strategies
const learned = await this.getLearnedPatterns(context);
strategies.push(...learned);

// Try strategies in order
for (const strategy of strategies) {
  const result = await this.tryStrategy(strategy);
  if (result.success) {
    await this.recordSuccessPattern(context, strategy, result.outcome);
    return result;
  }
}
```

### Pattern 3: Error Recovery

```typescript
try {
  return await this.primaryApproach(input);
} catch (error) {
  // Check if we've seen this error before
  const errorContext = error.message.substring(0, 100);
  const recoveryPatterns = await this.getLearnedPatterns(errorContext);

  if (recoveryPatterns.length > 0) {
    // Try known recovery approach
    return await this.applyRecovery(recoveryPatterns[0]);
  }

  // Learn from new failure
  await this.recordFailurePattern(
    errorContext,
    'primary-approach',
    error.message
  );
  throw error;
}
```

## Protected Methods Reference

### Pattern Recording

```typescript
// Record successful pattern
protected async recordSuccessPattern(
  context: string,      // Context where pattern applies
  pattern: string,      // The pattern that worked
  outcome: string       // Successful outcome description
): Promise<void>

// Record failure pattern
protected async recordFailurePattern(
  context: string,      // Context where pattern failed
  pattern: string,      // The pattern that was tried
  error: string         // Error message
): Promise<void>

// Get learned patterns
protected async getLearnedPatterns(
  context: string       // Context to match against
): Promise<string[]>    // Array of pattern strings
```

### Memory Operations

```typescript
// Store in memory
protected async storeMemory(
  key: string,
  value: unknown,
  scope?: 'session' | 'project' | 'longterm'
): Promise<void>

// Retrieve from memory
protected async getMemory<T = unknown>(
  key: string,
  scope?: 'session' | 'project' | 'longterm'
): Promise<T | null>
```

## Troubleshooting

### Pattern learning not working

```typescript
// Check if enabled
const status = agent.getStatus();
console.log('Pattern learning enabled:', !!agent['patternLearning']);

// Check logs
// Set logLevel: 'debug' to see pattern recording
```

### Memory not persisting

```typescript
// Verify scope
// 'session' scope only persists in Redis (temporary)
// Use 'project' or 'longterm' for persistence

await this.storeMemory('key', 'value', 'project'); // Persisted
```

### Tenant isolation not working

```typescript
// Ensure unique tenantId per isolation boundary
const agent1 = new Agent({ tenantId: 'user1:project' });
const agent2 = new Agent({ tenantId: 'user2:project' });

// Different tenantId = isolated memory/patterns
```

## See Also

- **CAPABILITIES.md** - "💾 Memory Systems" section
- **NATIVE-MEMORY-INTEGRATION.md** - Complete integration guide
- **packages/agent-core/examples/memory-enabled-agent.ts** - Working example
- **packages/agent-core/src/BaseAgent.ts** - Source code reference

## Migration from Redis-Only

If you have an existing agent using Redis only:

1. Add config flags: `enableNativeMemory: true, enablePatternLearning: true`
2. Remove manual Redis client initialization
3. Replace `redis.set()` with `this.storeMemory()`
4. Replace `redis.get()` with `this.getMemory()`

See **MIGRATION-NATIVE-MEMORY.md** for complete migration guide.
