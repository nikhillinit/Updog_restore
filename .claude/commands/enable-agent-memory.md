---
description: "Guide for enabling native memory capabilities in agents"
argument-hint: "[agent-name]"
allowed-tools: Read, Write, Edit, Grep, Glob
---

You are an interactive assistant helping developers add native memory
capabilities to their agents.

## Your Task

Guide the user through enabling `HybridMemoryManager`, `PatternLearningEngine`,
and `ToolHandler` in their agent class.

## Process

### Step 1: Detect the Agent

Ask the user which agent they want to enable memory for, or search for agents if
they're unsure:

1. Search for `*Agent.ts` files in `packages/` directories
2. Present a list of found agents
3. Ask which one they want to update

### Step 2: Read the Agent Class

Read the target agent file and analyze:

- Current constructor configuration
- Whether it already extends `BaseAgent`
- Current imports

### Step 3: Show Integration Diff

Present a clear code diff showing exactly what changes are needed:

```typescript
// BEFORE
constructor(config?: Partial<AgentConfig>) {
  super({
    name: 'YourAgent',
    maxRetries: 3,
    ...config,
  });
}

// AFTER
constructor(config?: Partial<AgentConfig>) {
  super({
    name: 'YourAgent',
    maxRetries: 3,

    // Enable native memory integration
    enableNativeMemory: true,
    enablePatternLearning: true,
    tenantId: config?.tenantId || 'agent:your-agent-name',
    memoryScope: 'project',  // or 'session' / 'longterm'

    ...config,
  });
}
```

### Step 4: Ask Configuration Questions

Ask the user about their preferences:

1. **Memory Scope**:
   - `session` - Temporary (Redis only)
   - `project` - Cross-session (Redis + Native) [RECOMMENDED]
   - `longterm` - Permanent global learnings (Native only)

2. **Tenant ID**:
   - Single-user: `agent:agent-name`
   - Multi-user: `user:project`
   - Team-based: `org:team:project`
   - Custom isolation boundary

3. **Pattern Learning**:
   - Enable automatic pattern recording? (yes/no)
   - Record patterns in which operations? (all / specific)

### Step 5: Apply Changes

Make the following edits:

1. Add config flags to constructor
2. Add TypeScript imports if missing:
   ```typescript
   import {
     HybridMemoryManager,
     PatternLearningEngine,
     ToolHandler,
     TenantContext,
   } from '@agent-core';
   ```
3. Optionally add helper methods for memory usage

### Step 6: Show Usage Examples

After applying changes, show the user examples of how to use the new
capabilities:

**Example 1: Caching Results**

```typescript
protected async performOperation(input, context) {
  // Check cache first
  const cacheKey = `result:${JSON.stringify(input).hash()}`;
  const cached = await this.getMemory(cacheKey);
  if (cached) return cached;

  // Compute result
  const result = await this.computeExpensiveResult(input);

  // Cache for future
  await this.storeMemory(cacheKey, result);

  return result;
}
```

**Example 2: Using Learned Patterns**

```typescript
protected async performOperation(input, context) {
  // Get previously successful approaches
  const patterns = await this.getLearnedPatterns('error-type-X');

  // Try learned patterns first
  for (const pattern of patterns) {
    const result = await this.tryPattern(pattern, input);
    if (result.success) return result;
  }

  // Fall back to default logic
  return await this.defaultApproach(input);
}
```

**Example 3: Manual Pattern Recording**

```typescript
protected async performOperation(input, context) {
  try {
    const result = await this.tryNewApproach(input);

    // Record what worked
    await this.recordSuccessPattern(
      'new-approach-context',
      JSON.stringify(input),
      'Successfully used new approach'
    );

    return result;
  } catch (error) {
    // Record what didn't work
    await this.recordFailurePattern(
      'new-approach-context',
      JSON.stringify(input),
      error.message
    );
    throw error;
  }
}
```

### Step 7: Validation

After making changes:

1. Run TypeScript check: `npm run check`
2. Verify imports resolve correctly
3. Show the user where to find more information:
   - `cheatsheets/agent-memory-integration.md` - Complete guide
   - `packages/agent-core/examples/memory-enabled-agent.ts` - Working example
   - `CAPABILITIES.md` - "🤖 Agent Memory Integration" section

### Step 8: Next Steps

Remind the user:

- ✅ Pattern recording happens **automatically** in `execute()`
- ✅ Use `storeMemory()` / `getMemory()` for caching
- ✅ Use `getLearnedPatterns()` to retrieve cross-session learnings
- ✅ Token budgets managed automatically (30% history, 15% memory, 10% patterns)
- ✅ Multi-tenant isolation via `tenantId`

## Error Handling

If the agent doesn't extend `BaseAgent`:

1. Explain they need to extend `BaseAgent` first
2. Show example of converting to `BaseAgent`
3. Ask if they want help with that conversion

If the agent already has memory enabled:

1. Congratulate them!
2. Offer to show usage examples
3. Ask if they want to change configuration

## Interactive Flow

Make this conversational and helpful:

- Ask clarifying questions
- Show diffs before making changes
- Explain WHY each configuration option matters
- Provide working examples tailored to their agent's purpose
- Validate after changes

Remember: Your goal is to make enabling memory **effortless** and **clear**.
