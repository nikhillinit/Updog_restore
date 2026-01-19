---
status: ACTIVE
last_updated: 2026-01-19
---

# Extended Thinking Cheatsheet

Quick reference for using Claude's extended thinking feature in the Updog
platform.

## Quick Start

```typescript
// Simple one-liner
import { think } from '@/ai-utils/extended-thinking';
const result = await think('Calculate IRR for...');
```

## Common Patterns

### 1. Basic Agent Usage

```typescript
import { ExtendedThinkingAgent } from '@/ai-utils/extended-thinking';

const agent = new ExtendedThinkingAgent('sonnet-4.5');
const result = await agent.think('Analyze waterfall...');

console.log(result.answer); // Final answer
console.log(result.thinking); // Reasoning steps
console.log(result.thinkingChars); // Token usage estimate
```

### 2. Agent with Metrics

```typescript
import { AgentThinkingHelper } from '@/ai-utils/extended-thinking/agent-helper';

const helper = new AgentThinkingHelper();

const { result, metrics } = await helper.agentThink(prompt, {
  taskName: 'waterfall-analysis',
  complexity: 'complex',
});

console.log(`Duration: ${metrics.durationMs}ms`);
console.log(`Tokens: ~${metrics.tokensEstimate}`);
```

### 3. Domain-Specific Helpers

```typescript
import {
  waterfallThink,
  pacingThink,
  reserveThink,
  monteCarloThink,
} from '@/ai-utils/extended-thinking/agent-helper';

// Waterfall
const w = await waterfallThink('Calculate carry for AMERICAN waterfall');

// Pacing
const p = await pacingThink('Optimize deployment over 4 years');

// Reserves
const r = await reserveThink('Calculate constrained allocation');

// Monte Carlo
const m = await monteCarloThink('Run 10k iterations');
```

### 4. Multi-Step Reasoning

```typescript
const steps = [
  {
    description: 'Analyze structure',
    prompt: 'Review current waterfall',
    complexity: 'moderate',
  },
  {
    description: 'Calculate scenarios',
    prompt: 'Calculate at 1x, 2x, 3x TVPI',
    complexity: 'complex',
  },
];

const results = await helper.reasoningChain(steps, {
  taskName: 'optimization',
});
```

### 5. Streaming

```typescript
const stream = agent.thinkStream(prompt, { thinkingBudget: 2000 });

for await (const chunk of stream) {
  if (chunk.type === 'thinking') {
    console.log('[Thinking]', chunk.content);
  } else {
    console.log('[Answer]', chunk.content);
  }
}
```

## Complexity Levels

| Level          | Tokens | When to Use                       |
| -------------- | ------ | --------------------------------- |
| `simple`       | 1,024  | Basic math, simple queries        |
| `moderate`     | 2,000  | Standard analysis (default)       |
| `complex`      | 4,000  | Multi-step calculations, strategy |
| `very-complex` | 8,000  | Monte Carlo, deep optimization    |

## Token Management

```typescript
// Count tokens before request
const tokens = await agent.countTokens(prompt);
console.log(`Input tokens: ${tokens}`);

// Validate configuration
import { validateThinkingConfig } from '@/ai-utils/extended-thinking';
const validation = validateThinkingConfig('sonnet-4.5', 2000);
if (!validation.valid) {
  console.error(validation.error);
}

// Budget formula: input + thinking + output < 200k
const SAFE_TOTAL = inputTokens + thinkingBudget + 2000;
```

## Error Handling

```typescript
// With auto-retry
const { result, metrics } = await helper.agentThink(prompt, {
  taskName: 'analysis',
  complexity: 'complex',
  retryOnError: true, // Reduces budget on context errors
});

// Manual error handling
try {
  const result = await agent.think(prompt);
} catch (error) {
  if (error.message.includes('context window')) {
    // Reduce budget or input size
  }
  // Fall back to standard approach
}
```

## BullMQ Integration

```typescript
import { Worker } from 'bullmq';
import { AgentThinkingHelper } from '@/ai-utils/extended-thinking/agent-helper';

const worker = new Worker('analysis', async (job) => {
  const helper = new AgentThinkingHelper();

  const { result, metrics } = await helper.agentThink(job.data.prompt, {
    taskName: job.name,
    complexity: job.data.complexity || 'moderate',
    retryOnError: true,
  });

  return { answer: result.answer, metrics };
});
```

## Express API

```typescript
import { Router } from 'express';
import { think } from '@/ai-utils/extended-thinking';

const router = Router();

router.post('/api/analyze', async (req, res) => {
  const result = await think(req.body.prompt, {
    thinkingBudget: 2000,
  });

  res.json({
    answer: result.answer,
    tokensEstimate: Math.ceil((result.thinkingChars + result.answerChars) / 4),
  });
});
```

## React Hook

```typescript
import { useMutation } from '@tanstack/react-query';

export function useExtendedThinking() {
  const mutation = useMutation({
    mutationFn: async (prompt: string) => {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });
      return res.json();
    }
  });

  return {
    analyze: mutation.mutateAsync,
    result: mutation.data,
    isThinking: mutation.isPending
  };
}

// Usage
function MyComponent() {
  const { analyze, result, isThinking } = useExtendedThinking();

  return (
    <button onClick={() => analyze('Calculate...')} disabled={isThinking}>
      {isThinking ? 'Thinking...' : 'Analyze'}
    </button>
  );
}
```

## Metrics Collection

```typescript
// Run multiple tasks
await helper.agentThink(...);
await helper.agentThink(...);

// Analyze aggregate metrics
const analysis = helper.analyzeMetrics();
console.log({
  totalTasks: analysis.totalTasks,
  successRate: analysis.successRate,
  avgDuration: analysis.avgDurationMs,
  totalTokens: analysis.totalEstimatedTokens
});

// Export for monitoring
const json = helper.exportMetrics();
fs.writeFileSync('metrics.json', json);

// Clear for next period
helper.clearMetrics();
```

## Model Selection

```typescript
import { MODELS, getThinkingModels } from '@/ai-utils/extended-thinking';

// List models with thinking support
const models = getThinkingModels();
models.forEach((m) => console.log(m.id, m.description));

// Use specific model
const agent = new ExtendedThinkingAgent('sonnet-3.7');
```

## Common Errors

```typescript
// ❌ Budget too small (min: 1024)
await agent.think(prompt, { thinkingBudget: 500 });

// ❌ Temperature not allowed
await client.messages.create({
  temperature: 0.7,
  thinking: { type: 'enabled', budget_tokens: 2000 },
});

// ❌ Context window exceeded
// input + thinking + output > 200k

// ✓ Solutions
// 1. Reduce thinking budget
// 2. Shorten input
// 3. Use retryOnError for auto-adjustment
```

## Best Practices

```typescript
// ✓ Match complexity to task
await waterfallThink('Simple calc', { complexity: 'moderate' });
await monteCarloThink('10k iterations', { complexity: 'very-complex' });

// ✓ Use domain helpers
await waterfallThink('...'); // Not generic think()

// ✓ Monitor token usage
const analysis = helper.analyzeMetrics();

// ✓ Enable retry for production
{
  retryOnError: true;
}

// ✓ Stream for long tasks (>10s)
const stream = agent.thinkStream(prompt);

// ✗ Avoid over-budgeting
await agentThink('2+2', 'math', 'very-complex'); // Wasteful
```

## Cost Estimation

```typescript
// Thinking tokens = output tokens for pricing
// Sonnet 4.5: $15/MTok output

const THINKING_TOKENS = 2000;
const OUTPUT_TOKENS = 500;
const TOTAL_OUTPUT = THINKING_TOKENS + OUTPUT_TOKENS;

const cost = (TOTAL_OUTPUT / 1_000_000) * 15;
console.log(`Cost: $${cost.toFixed(4)}`); // $0.0375
```

## Testing

```typescript
import { describe, it, expect } from 'vitest';

describe('Extended Thinking', () => {
  it('should validate config', () => {
    const validation = validateThinkingConfig('sonnet-4.5', 2000);
    expect(validation.valid).toBe(true);
  });

  it('should complete thinking task', async () => {
    const agent = new ExtendedThinkingAgent('sonnet-4.5');
    const result = await agent.think('Calculate 2+2');

    expect(result.answer).toContain('4');
    expect(result.thinkingChars).toBeGreaterThan(0);
  });
});
```

## Quick Reference

### Imports

```typescript
// Core
import { ExtendedThinkingAgent, think } from '@/ai-utils/extended-thinking';

// Agent helper
import { AgentThinkingHelper } from '@/ai-utils/extended-thinking/agent-helper';

// Domain helpers
import {
  waterfallThink,
  pacingThink,
  reserveThink,
  monteCarloThink,
} from '@/ai-utils/extended-thinking/agent-helper';

// Utilities
import {
  validateThinkingConfig,
  getThinkingModels,
  MODELS,
  COMPLEXITY_BUDGETS,
} from '@/ai-utils/extended-thinking';
```

### File Locations

- **Core utilities:** `ai-utils/extended-thinking/index.ts`
- **Agent helper:** `ai-utils/extended-thinking/agent-helper.ts`
- **Documentation:** `docs/extended-thinking-integration.md`
- **Notebook:** `notebooks/examples/extended-thinking-multi-model.ipynb`
- **This cheatsheet:** `cheatsheets/extended-thinking.md`

## Resources

- [Extended Thinking Docs](https://docs.claude.com/en/docs/build-with-claude/extended-thinking)
- [API Reference](https://docs.anthropic.com/en/api/messages)
- [Updog Integration Docs](../docs/extended-thinking-integration.md)
- [Interactive Examples](../notebooks/examples/extended-thinking-multi-model.ipynb)

---

**Quick Help:**

- Not working? Check API key: `process.env.ANTHROPIC_API_KEY`
- Too expensive? Reduce thinking budget or use lower complexity
- Too slow? Use streaming for better UX
- Context errors? Enable `retryOnError` or reduce budget
