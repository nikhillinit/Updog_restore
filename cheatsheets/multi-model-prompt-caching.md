# Multi-Model Prompt Caching Cheatsheet

Quick reference for using prompt caching across different AI providers in the agent framework.

## Quick Start

```typescript
import { MultiModelPromptCache } from '@agent-core';

// Create cache for your provider
const cache = new MultiModelPromptCache({
  provider: 'anthropic', // or 'openai', 'google', 'generic'
  enabled: true
});

// Prepare cached prompt
const result = cache.prepare({
  systemPrompt: 'You are a helpful assistant.',
  projectContext: largeContextString,
  userQuery: 'What is the main function?'
});

// Use in API call
const response = await client.messages.create({
  model: 'claude-sonnet-4-5',
  system: result.system,
  messages: result.messages,
  ...result.headers // Includes caching headers
});
```

## Provider Comparison

| Provider | Native Caching | Latency ↓ | Cost ↓ | Min Size |
|----------|---------------|-----------|--------|----------|
| **Anthropic** | ✅ | ~85% | ~90% | 1024 chars |
| **Gemini** | ✅ | ~70% | ~75% | 2048 chars |
| **OpenAI** | ❌ | N/A | N/A | N/A |
| **Generic** | ❌ | N/A | N/A | N/A |

## Common Patterns

### Pattern 1: Single-Turn with Large Context

```typescript
const cache = new MultiModelPromptCache({ provider: 'anthropic' });

const result = cache.prepare({
  projectContext: fs.readFileSync('CLAUDE.md', 'utf-8'),
  userQuery: 'What is the architecture?'
});

// First call: builds cache
// Second call: reuses cache (85% faster!)
```

### Pattern 2: Multi-Turn Conversations

```typescript
const history: Array<{ role: string; content: string }> = [];

// Turn 1
const turn1 = cache.prepare({
  systemPrompt: SYSTEM_PROMPT,
  projectContext: PROJECT_CONTEXT,
  conversationHistory: history,
  userQuery: 'First question'
});

// Add to history
history.push(
  { role: 'user', content: 'First question' },
  { role: 'assistant', content: response.text }
);

// Turn 2 (system + context cached!)
const turn2 = cache.prepare({
  systemPrompt: SYSTEM_PROMPT,
  projectContext: PROJECT_CONTEXT,
  conversationHistory: history,
  userQuery: 'Follow-up question'
});
```

### Pattern 3: BaseAgent Integration

```typescript
class MyAgent extends BaseAgent<Input, Output> {
  private cache: MultiModelPromptCache;

  constructor() {
    super({ name: 'my-agent' });
    this.cache = new MultiModelPromptCache({ provider: 'anthropic' });
  }

  protected async performOperation(input: Input, context: Context): Promise<Output> {
    const result = this.cache.prepare({
      systemPrompt: this.getSystemPrompt(),
      projectContext: await this.loadProjectContext(),
      userQuery: input.query
    });

    // Call API with cached prompt
    const response = await this.callAI(result);

    return this.processResponse(response);
  }
}
```

### Pattern 4: Dynamic Provider Switching

```typescript
const cache = new MultiModelPromptCache({ provider: 'anthropic' });

// Route based on task type
function selectProvider(taskType: string): AIProvider {
  if (taskType === 'code-analysis') return 'anthropic';
  if (taskType === 'performance') return 'google';
  if (taskType === 'simple-query') return 'openai';
  return 'generic';
}

// Switch provider dynamically
cache.switchProvider(selectProvider(task.type));

const result = cache.prepare({
  systemPrompt: SYSTEM_PROMPT,
  userQuery: task.query
});
```

## Configuration Options

```typescript
interface MultiModelCacheConfig {
  provider: 'anthropic' | 'openai' | 'google' | 'generic';
  enabled: boolean;                    // Default: true
  cacheSystemPrompts?: boolean;        // Default: true
  cacheProjectContext?: boolean;       // Default: true
  cacheConversationHistory?: boolean;  // Default: true
  maxCacheSize?: number;               // Default: 100000 chars
  minCacheSize?: number;               // Default: 1024 chars
}
```

## Cache Statistics

```typescript
const stats = cache.getStats();

console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
console.log(`Tokens saved: ${stats.tokensSaved.toLocaleString()}`);
console.log(`Cost savings: $${stats.estimatedCostSavings.toFixed(2)}`);
console.log(`Latency reduction: ${stats.estimatedLatencyReduction}%`);
console.log(`Supports native caching: ${stats.supportsNativeCaching}`);
```

## Best Practices

### ✅ DO

- Cache large, stable content (system prompts, project docs)
- Use incremental caching for multi-turn conversations
- Monitor cache statistics regularly
- Switch providers based on task requirements
- Ensure content is > minCacheSize for caching benefits

### ❌ DON'T

- Cache content that changes frequently
- Include user queries in cached content
- Cache very small content (< 1024 chars for Anthropic)
- Ignore cache statistics (monitor savings!)
- Use the same provider for all tasks

## Performance Tips

1. **First Call is Slower**: Cache miss builds the cache
2. **Subsequent Calls are Faster**: Cache hits reuse cached content
3. **Cache Breakpoints**: System → Context → History (newest first)
4. **TTL Awareness**: Anthropic cache expires in 5 minutes
5. **Token Estimation**: ~4 chars per token (rough estimate)

## Provider-Specific Notes

### Anthropic
- Requires `anthropic-beta: prompt-caching-2024-07-31` header
- Min size: 1024 chars (~256 tokens)
- Cache TTL: 5 minutes
- Max 4 cache breakpoints per request

### Gemini
- Requires context caching API
- Min size: 2048 tokens (~8192 chars)
- Cache TTL: 1 hour (configurable)
- Cached tokens are 75% cheaper

### OpenAI
- No native caching
- Optimizes via conversation compression
- Keeps last 4 turns intact
- Summarizes older turns

## Integration with Router

```typescript
import { AIRouter, MultiModelPromptCache } from '@agent-core';

const router = new AIRouter();
const cache = new MultiModelPromptCache({ provider: 'anthropic' });

const decision = router.route({
  type: 'typescript-error',
  complexity: 7,
  description: 'Type mismatch in component'
});

// Switch cache to match routed model
cache.switchProvider(mapModelToProvider(decision.model));

const result = cache.prepare({
  systemPrompt: SYSTEM_PROMPT,
  projectContext: PROJECT_CONTEXT,
  userQuery: task.query
});
```

## Troubleshooting

### Cache not working
- Check `cache.supportsNativeCaching()` - OpenAI/Generic don't support it
- Verify content size > `minCacheSize`
- Ensure `enabled: true` in config
- Check cache TTL hasn't expired

### High costs despite caching
- Monitor `cache.getStats()` hit rate
- Ensure large content is in `projectContext`, not `userQuery`
- Verify cache breakpoints are set correctly
- Check that output tokens are minimized

### Slow responses
- First call builds cache (expected)
- Subsequent calls should be 70-85% faster
- Check `estimatedLatencyReduction` in stats
- Verify caching is enabled for the provider

## Examples

See complete examples:
- `packages/agent-core/examples/demo-multi-model-cache.ts`
- `packages/agent-core/examples/demo-agent-with-multi-model-cache.ts`

Run examples:
```bash
npx tsx packages/agent-core/examples/demo-multi-model-cache.ts
```

## References

- [Full Documentation](../packages/agent-core/docs/MULTI_MODEL_PROMPT_CACHING.md)
- [Anthropic Prompt Caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)
- [Gemini Context Caching](https://ai.google.dev/gemini-api/docs/caching)
- [Agent Core README](../packages/agent-core/README.md)
