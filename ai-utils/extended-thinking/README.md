# Extended Thinking Utilities

TypeScript/Node utilities for integrating Claude's extended thinking feature
into the Updog VC Fund Modeling Platform.

## Overview

Extended thinking gives Claude enhanced reasoning capabilities for complex tasks
while providing transparency into the step-by-step thought process. These
utilities make it easy to integrate extended thinking into:

- Autonomous AI agents (`packages/agent-core`)
- Background workers (BullMQ jobs)
- API endpoints requiring deep analysis
- Interactive Jupyter notebooks

## Quick Start

### Basic Usage

```typescript
import { think } from '@/ai-utils/extended-thinking';

const result = await think(
  'Calculate IRR for: Initial: -$1M, Year 1: $300K, Year 2: $400K, Year 3: $500K'
);

console.log('Thinking:', result.thinking);
console.log('Answer:', result.answer);
console.log('Thinking chars:', result.thinkingChars);
```

### Agent Integration

```typescript
import { ExtendedThinkingAgent } from '@/ai-utils/extended-thinking';

const agent = new ExtendedThinkingAgent('sonnet-4.5', {
  defaultThinkingBudget: 2000,
  maxTokens: 4000,
});

const result = await agent.think(
  'Analyze waterfall distribution for $100M fund with 20% carry and 8% hurdle rate'
);
```

### Domain-Specific Helpers

```typescript
import {
  waterfallThink,
  pacingThink,
  reserveThink,
  monteCarloThink,
} from '@/ai-utils/extended-thinking/agent-helper';

// Waterfall calculations
const waterfallResult = await waterfallThink(
  'Calculate carry distribution for AMERICAN waterfall with 8% hurdle'
);

// Pacing analysis
const pacingResult = await pacingThink(
  'Analyze optimal deployment schedule for $50M fund over 4 years'
);

// Reserve strategy
const reserveResult = await reserveThink(
  'Calculate constrained reserve allocation for portfolio with 12 companies'
);

// Monte Carlo
const monteCarloResult = await monteCarloThink(
  'Run 10,000 Monte Carlo iterations for portfolio with given return distributions'
);
```

### Agent Helper with Metrics

```typescript
import { AgentThinkingHelper } from '@/ai-utils/extended-thinking/agent-helper';

const helper = new AgentThinkingHelper('sonnet-4.5');

const { result, metrics } = await helper.agentThink(
  'Analyze waterfall policy and recommend optimal structure',
  {
    taskName: 'waterfall-optimization',
    complexity: 'complex',
  }
);

console.log('Duration:', metrics.durationMs, 'ms');
console.log('Estimated tokens:', metrics.tokensEstimate);
console.log('Success:', metrics.success);

// Get aggregate metrics
const analysis = helper.analyzeMetrics();
console.log('Success rate:', analysis.successRate);
console.log('Avg duration:', analysis.avgDurationMs);
```

### Multi-Step Reasoning

```typescript
const steps = [
  {
    description: 'Analyze current waterfall structure',
    prompt: 'Review AMERICAN waterfall with 20% carry and 8% hurdle',
    complexity: 'moderate' as const,
  },
  {
    description: 'Calculate scenarios',
    prompt: 'Calculate carry distribution for $100M fund with 2.5x TVPI',
    complexity: 'complex' as const,
  },
  {
    description: 'Recommend optimization',
    prompt: 'Recommend optimal hurdle rate based on market conditions',
    complexity: 'complex' as const,
  },
];

const results = await helper.reasoningChain(steps, {
  taskName: 'waterfall-analysis',
});

results.forEach(({ step, description, metrics }) => {
  console.log(`Step ${step}: ${description}`);
  console.log(`  Duration: ${metrics.durationMs}ms`);
  console.log(`  Tokens: ~${metrics.tokensEstimate}`);
});
```

### Streaming with Progress

```typescript
const { thinking, answer, metrics } = await helper.streamWithProgress(
  'Analyze Monte Carlo simulation results',
  {
    taskName: 'monte-carlo-analysis',
    complexity: 'very-complex',
  },
  {
    onThinking: (chunk) => console.log('[Thinking]', chunk),
    onText: (chunk) => console.log('[Answer]', chunk),
    onComplete: (metrics) => console.log('Complete:', metrics),
  }
);
```

## Configuration

### Model Selection

```typescript
import { MODELS, getThinkingModels } from '@/ai-utils/extended-thinking';

// List available models
const models = getThinkingModels();
models.forEach((model) => {
  console.log(`${model.id}: ${model.description}`);
  console.log(
    `  Token range: ${model.minThinkingTokens} - ${model.maxThinkingTokens}`
  );
});

// Use specific model
const agent = new ExtendedThinkingAgent('sonnet-3.7');
```

### Complexity Budgets

```typescript
import { COMPLEXITY_BUDGETS } from '@/ai-utils/extended-thinking/agent-helper';

console.log(COMPLEXITY_BUDGETS);
// {
//   simple: 1024,
//   moderate: 2000,
//   complex: 4000,
//   'very-complex': 8000
// }
```

### Token Management

```typescript
import { validateThinkingConfig } from '@/ai-utils/extended-thinking';

const validation = validateThinkingConfig('sonnet-4.5', 2000);
if (!validation.valid) {
  console.error('Invalid config:', validation.error);
}

// Count tokens before making request
const agent = new ExtendedThinkingAgent('sonnet-4.5');
const tokens = await agent.countTokens('Your prompt here');
console.log('Input tokens:', tokens);
```

## Integration with Existing Systems

### BullMQ Worker Integration

```typescript
import { Queue, Worker } from 'bullmq';
import { AgentThinkingHelper } from '@/ai-utils/extended-thinking/agent-helper';

const analysisQueue = new Queue('analysis');

const worker = new Worker('analysis', async (job) => {
  const helper = new AgentThinkingHelper();

  const { result, metrics } = await helper.agentThink(job.data.prompt, {
    taskName: job.name,
    complexity: job.data.complexity || 'moderate',
    retryOnError: true,
  });

  return {
    answer: result.answer,
    thinking: result.thinking,
    metrics,
  };
});
```

### Express API Integration

```typescript
import { Router } from 'express';
import { think } from '@/ai-utils/extended-thinking';

const router = Router();

router.post('/api/analyze', async (req, res) => {
  try {
    const { prompt, complexity } = req.body;

    const result = await think(prompt, {
      modelKey: 'sonnet-4.5',
      thinkingBudget: complexity === 'high' ? 4000 : 2000,
    });

    res.json({
      answer: result.answer,
      thinkingChars: result.thinkingChars,
      answerChars: result.answerChars,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### Agent Framework Integration

```typescript
// packages/agent-core/src/agents/waterfall-agent.ts
import { BaseAgent } from '../base-agent';
import { AgentThinkingHelper } from '@/ai-utils/extended-thinking/agent-helper';

export class WaterfallAgent extends BaseAgent {
  private thinkingHelper: AgentThinkingHelper;

  constructor() {
    super('waterfall-agent');
    this.thinkingHelper = new AgentThinkingHelper('sonnet-4.5');
  }

  async analyzeWaterfall(waterfallConfig: any) {
    const { result, metrics } = await this.thinkingHelper.agentThink(
      `Analyze waterfall configuration: ${JSON.stringify(waterfallConfig)}`,
      {
        taskName: 'waterfall-analysis',
        complexity: 'complex',
        retryOnError: true,
      }
    );

    this.logMetrics(metrics);
    return result;
  }
}
```

## Best Practices

### 1. Choose Appropriate Complexity

```typescript
// Simple calculations → 'simple' (1024 tokens)
await agentThink('Calculate 2 + 2', 'basic-math', 'simple');

// Standard analysis → 'moderate' (2000 tokens)
await waterfallThink('Analyze standard waterfall structure');

// Complex reasoning → 'complex' (4000 tokens)
await pacingThink('Optimize 4-year deployment strategy with constraints');

// Very complex tasks → 'very-complex' (8000 tokens)
await monteCarloThink(
  '10,000 Monte Carlo iterations with correlation analysis'
);
```

### 2. Handle Errors Gracefully

```typescript
const helper = new AgentThinkingHelper();

try {
  const { result, metrics } = await helper.agentThink(prompt, {
    taskName: 'analysis',
    complexity: 'complex',
    retryOnError: true, // Auto-retry with reduced budget
  });
} catch (error) {
  console.error('Thinking failed:', error);
  // Fall back to standard approach
}
```

### 3. Monitor Token Usage

```typescript
const helper = new AgentThinkingHelper();

// Run multiple tasks
await helper.agentThink(...);
await helper.agentThink(...);

// Analyze usage
const analysis = helper.analyzeMetrics();
console.log('Total estimated tokens:', analysis.totalEstimatedTokens);
console.log('Success rate:', analysis.successRate);

// Export for monitoring
const metricsJson = helper.exportMetrics();
fs.writeFileSync('thinking-metrics.json', metricsJson);
```

### 4. Use Domain-Specific Helpers

```typescript
// ✓ Good: Use domain helper
const result = await waterfallThink('Calculate carry distribution');

// ✗ Avoid: Generic think without context
const result = await think('Calculate carry distribution');
```

## Error Handling

Common errors and solutions:

```typescript
// Error: Thinking budget too small
try {
  await think(prompt, { thinkingBudget: 500 });
} catch (error) {
  // Minimum is 1024 tokens
}

// Error: Context window exceeded
try {
  await think(veryLongPrompt, { thinkingBudget: 32000 });
} catch (error) {
  // Reduce thinking budget or shorten prompt
}

// Error: Temperature not allowed
const agent = new ExtendedThinkingAgent('sonnet-4.5');
// Don't use temperature/top_p/top_k with thinking
```

## Performance Considerations

- **Token costs**: Thinking tokens count as output tokens
- **Rate limits**: Thinking tokens contribute to rate limits
- **Context window**: Budget for input + thinking + output < 200k tokens
- **Latency**: Higher thinking budgets → longer response times

## API Reference

See the TypeScript types for full API documentation:

- `ExtendedThinkingAgent` - Main agent class
- `AgentThinkingHelper` - Enhanced agent utilities
- `ThinkingResult` - Response structure
- `AgentThinkingMetrics` - Metrics structure
- `MODELS` - Available model configurations

## Examples

See `notebooks/examples/extended-thinking-multi-model.ipynb` for comprehensive
examples.

## Resources

- [Extended Thinking Docs](https://docs.claude.com/en/docs/build-with-claude/extended-thinking)
- [API Reference](https://docs.anthropic.com/en/api/messages)
- [Pricing](https://www.anthropic.com/pricing)
