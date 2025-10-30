# Extended Thinking Integration

**Status:** ✅ Active **Date Added:** 2025-10-28 **Models Supported:** Claude
Sonnet 4.5, Claude 3.7 Sonnet, Claude Opus 4

## Overview

Extended thinking gives Claude enhanced reasoning capabilities for complex tasks
while providing transparency into the step-by-step thought process. This
integration makes extended thinking available across the entire Updog platform:

- **AI Agents** - Autonomous agents with deep reasoning
- **Background Workers** - Complex calculations in BullMQ jobs
- **API Endpoints** - Enhanced analysis capabilities
- **Jupyter Notebooks** - Interactive exploration and prototyping

## Architecture

```
ai-utils/extended-thinking/
├── index.ts              # Core ExtendedThinkingAgent class
├── agent-helper.ts       # Agent-specific utilities with metrics
└── README.md            # API documentation

notebooks/examples/
└── extended-thinking-multi-model.ipynb  # Interactive examples

docs/
└── extended-thinking-integration.md     # This file

cheatsheets/
└── extended-thinking.md                 # Quick reference guide
```

## Core Components

### 1. ExtendedThinkingAgent

Main class for interacting with Claude's extended thinking API.

**Features:**

- Multi-model support (Sonnet 4.5, 3.7, Opus 4)
- Token counting and budget management
- Streaming support
- Error handling with context window checks

**Usage:**

```typescript
import { ExtendedThinkingAgent } from '@/ai-utils/extended-thinking';

const agent = new ExtendedThinkingAgent('sonnet-4.5', {
  defaultThinkingBudget: 2000,
  maxTokens: 4000,
});

const result = await agent.think('Calculate IRR for investment...');
console.log(result.answer);
```

### 2. AgentThinkingHelper

Enhanced wrapper for autonomous agents with metrics collection.

**Features:**

- Auto-scaling thinking budgets based on complexity
- Comprehensive metrics collection
- Multi-step reasoning chains
- Streaming with progress callbacks
- Error recovery with budget adjustment

**Usage:**

```typescript
import { AgentThinkingHelper } from '@/ai-utils/extended-thinking/agent-helper';

const helper = new AgentThinkingHelper('sonnet-4.5');

const { result, metrics } = await helper.agentThink(
  'Analyze waterfall distribution...',
  {
    taskName: 'waterfall-analysis',
    complexity: 'complex',
    retryOnError: true,
  }
);

console.log('Duration:', metrics.durationMs);
console.log('Success:', metrics.success);
```

### 3. Domain-Specific Helpers

Pre-configured helpers for common VC fund modeling tasks.

```typescript
import {
  waterfallThink,
  pacingThink,
  reserveThink,
  monteCarloThink,
} from '@/ai-utils/extended-thinking/agent-helper';

// Waterfall calculations (default: complex)
const waterfallResult = await waterfallThink(
  'Calculate carry for AMERICAN waterfall with 8% hurdle'
);

// Pacing analysis (default: complex)
const pacingResult = await pacingThink(
  'Optimize deployment schedule for $50M fund'
);

// Reserve strategy (default: complex)
const reserveResult = await reserveThink(
  'Calculate constrained reserve allocation'
);

// Monte Carlo (default: very-complex)
const monteCarloResult = await monteCarloThink(
  'Run 10,000 iterations with correlation analysis'
);
```

## Complexity Budgets

Tasks are categorized by complexity, which determines the thinking token budget:

| Complexity     | Tokens | Use Cases                                    |
| -------------- | ------ | -------------------------------------------- |
| `simple`       | 1,024  | Basic calculations, simple queries           |
| `moderate`     | 2,000  | Standard analysis, straightforward reasoning |
| `complex`      | 4,000  | Multi-step calculations, strategic analysis  |
| `very-complex` | 8,000  | Monte Carlo, optimization, deep analysis     |

**Example:**

```typescript
const { result, metrics } = await helper.agentThink(prompt, {
  taskName: 'monte-carlo-analysis',
  complexity: 'very-complex', // Uses 8,000 token budget
});
```

## Integration Patterns

### BullMQ Worker Integration

```typescript
import { Queue, Worker } from 'bullmq';
import { AgentThinkingHelper } from '@/ai-utils/extended-thinking/agent-helper';

const analysisQueue = new Queue('deep-analysis');

const worker = new Worker(
  'deep-analysis',
  async (job) => {
    const helper = new AgentThinkingHelper();

    const { result, metrics } = await helper.agentThink(job.data.prompt, {
      taskName: job.name,
      complexity: job.data.complexity || 'moderate',
      retryOnError: true,
    });

    // Log metrics to Winston
    logger.info('Extended thinking complete', {
      jobId: job.id,
      taskName: job.name,
      durationMs: metrics.durationMs,
      tokensEstimate: metrics.tokensEstimate,
      success: metrics.success,
    });

    return {
      answer: result.answer,
      thinking: result.thinking,
      metrics,
    };
  },
  {
    connection: redisConnection,
  }
);
```

### Express API Integration

```typescript
import { Router } from 'express';
import { think } from '@/ai-utils/extended-thinking';

const router = Router();

router.post('/api/v1/analyze/deep', async (req, res) => {
  try {
    const { prompt, complexity } = req.body;

    // Validate complexity
    const validComplexities = ['simple', 'moderate', 'complex', 'very-complex'];
    if (complexity && !validComplexities.includes(complexity)) {
      return res.status(400).json({ error: 'Invalid complexity level' });
    }

    const result = await think(prompt, {
      modelKey: 'sonnet-4.5',
      thinkingBudget: COMPLEXITY_BUDGETS[complexity || 'moderate'],
    });

    res.json({
      answer: result.answer,
      metadata: {
        thinkingChars: result.thinkingChars,
        answerChars: result.answerChars,
        tokensEstimate: Math.ceil(
          (result.thinkingChars + result.answerChars) / 4
        ),
      },
    });
  } catch (error) {
    logger.error('Extended thinking failed', { error });
    res.status(500).json({ error: error.message });
  }
});

export default router;
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

  async analyzeWaterfallPolicy(config: WaterfallConfig) {
    const { result, metrics } = await this.thinkingHelper.agentThink(
      `Analyze waterfall configuration and recommend optimizations:\n${JSON.stringify(config, null, 2)}`,
      {
        taskName: 'waterfall-policy-analysis',
        complexity: 'complex',
        retryOnError: true,
      }
    );

    // Store metrics for monitoring
    this.recordMetrics({
      operation: 'analyze_policy',
      durationMs: metrics.durationMs,
      tokensUsed: metrics.tokensEstimate,
      success: metrics.success,
    });

    return {
      recommendations: result.answer,
      reasoning: result.thinking,
      confidence: this.calculateConfidence(metrics),
    };
  }

  async multiStepAnalysis(waterfallConfig: WaterfallConfig) {
    const steps = [
      {
        description: 'Analyze current structure',
        prompt: `Review waterfall configuration:\n${JSON.stringify(waterfallConfig)}`,
        complexity: 'moderate' as const,
      },
      {
        description: 'Calculate distributions',
        prompt:
          'Calculate carry distribution across scenarios (1x, 2x, 3x TVPI)',
        complexity: 'complex' as const,
      },
      {
        description: 'Optimize parameters',
        prompt: 'Recommend optimal hurdle rate and carry percentage',
        complexity: 'complex' as const,
      },
    ];

    const results = await this.thinkingHelper.reasoningChain(steps, {
      taskName: 'waterfall-optimization',
    });

    return {
      steps: results.map((r) => ({
        step: r.step,
        description: r.description,
        result: r.result.answer,
        metrics: r.metrics,
      })),
      totalDuration: results.reduce((sum, r) => sum + r.metrics.durationMs, 0),
      totalTokens: results.reduce(
        (sum, r) => sum + r.metrics.tokensEstimate,
        0
      ),
    };
  }

  private calculateConfidence(metrics: AgentThinkingMetrics): number {
    // Higher thinking/answer ratio = more thorough reasoning = higher confidence
    const ratio = metrics.thinkingChars / (metrics.answerChars || 1);
    return Math.min(0.95, 0.5 + ratio * 0.1);
  }
}
```

### React Component Integration

```typescript
// client/src/hooks/useExtendedThinking.ts
import { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';

interface ExtendedThinkingResult {
  answer: string;
  metadata: {
    thinkingChars: number;
    answerChars: number;
    tokensEstimate: number;
  };
}

export function useExtendedThinking() {
  const [thinking, setThinking] = useState<string[]>([]);

  const mutation = useMutation({
    mutationFn: async (prompt: string) => {
      const response = await fetch('/api/v1/analyze/deep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, complexity: 'complex' })
      });

      if (!response.ok) {
        throw new Error('Extended thinking failed');
      }

      return response.json() as Promise<ExtendedThinkingResult>;
    },
    onMutate: () => {
      setThinking([]);
    }
  });

  const analyze = useCallback(async (prompt: string) => {
    return mutation.mutateAsync(prompt);
  }, [mutation]);

  return {
    analyze,
    result: mutation.data,
    isThinking: mutation.isPending,
    error: mutation.error,
    thinking
  };
}

// Usage in component
function WaterfallAnalyzer() {
  const { analyze, result, isThinking } = useExtendedThinking();

  const handleAnalyze = async () => {
    await analyze('Analyze waterfall distribution for $100M fund...');
  };

  return (
    <div>
      <button onClick={handleAnalyze} disabled={isThinking}>
        {isThinking ? 'Thinking...' : 'Analyze'}
      </button>
      {result && (
        <div>
          <h3>Analysis Result</h3>
          <p>{result.answer}</p>
          <small>Tokens: ~{result.metadata.tokensEstimate}</small>
        </div>
      )}
    </div>
  );
}
```

## Monitoring and Metrics

### Collecting Metrics

```typescript
const helper = new AgentThinkingHelper();

// Run multiple tasks
for (const task of tasks) {
  await helper.agentThink(task.prompt, {
    taskName: task.name,
    complexity: task.complexity,
  });
}

// Analyze aggregate metrics
const analysis = helper.analyzeMetrics();
console.log('Performance Analysis:', {
  totalTasks: analysis.totalTasks,
  successRate: analysis.successRate,
  avgDuration: analysis.avgDurationMs,
  totalTokens: analysis.totalEstimatedTokens,
  byComplexity: analysis.byComplexity,
});
```

### Exporting for Monitoring

```typescript
import fs from 'fs';

// Export metrics as JSON
const metricsJson = helper.exportMetrics();
fs.writeFileSync(`metrics-${Date.now()}.json`, metricsJson);

// Or send to monitoring service
await fetch('https://metrics.example.com/api/thinking', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: metricsJson,
});
```

### Winston Logger Integration

```typescript
import logger from '@/utils/logger';

const { result, metrics } = await helper.agentThink(prompt, context);

logger.info('Extended thinking complete', {
  taskName: context.taskName,
  complexity: context.complexity,
  durationMs: metrics.durationMs,
  thinkingChars: metrics.thinkingChars,
  answerChars: metrics.answerChars,
  tokensEstimate: metrics.tokensEstimate,
  success: metrics.success,
  modelUsed: metrics.modelUsed,
});
```

## Best Practices

### 1. Choose Appropriate Complexity

```typescript
// ✓ Good: Match complexity to task
await waterfallThink('Calculate carry', { complexity: 'complex' });
await monteCarloThink('10k iterations', { complexity: 'very-complex' });

// ✗ Avoid: Over-budgeting for simple tasks
await agentThink('What is 2+2?', 'basic-math', 'very-complex');
```

### 2. Handle Errors Gracefully

```typescript
try {
  const { result, metrics } = await helper.agentThink(prompt, {
    taskName: 'analysis',
    complexity: 'complex',
    retryOnError: true, // Auto-retry with reduced budget on context errors
  });
} catch (error) {
  logger.error('Extended thinking failed', { error });

  // Fall back to standard approach
  const fallbackResult = await standardAnalysis(prompt);
  return fallbackResult;
}
```

### 3. Monitor Token Usage

```typescript
// Set up periodic reporting
setInterval(() => {
  const analysis = helper.analyzeMetrics();

  logger.info('Extended thinking usage report', {
    period: '1h',
    totalTasks: analysis.totalTasks,
    successRate: analysis.successRate,
    totalTokens: analysis.totalEstimatedTokens,
    avgDuration: analysis.avgDurationMs,
  });

  helper.clearMetrics(); // Reset for next period
}, 3600000); // Every hour
```

### 4. Use Streaming for Long Tasks

```typescript
// For tasks that take >10 seconds
const { thinking, answer, metrics } = await helper.streamWithProgress(
  'Run comprehensive Monte Carlo analysis',
  {
    taskName: 'monte-carlo',
    complexity: 'very-complex',
  },
  {
    onThinking: (chunk) => {
      // Update UI with thinking progress
      setThinkingProgress((prev) => prev + chunk);
    },
    onText: (chunk) => {
      // Stream answer to user
      setAnswer((prev) => prev + chunk);
    },
    onComplete: (metrics) => {
      // Show completion metrics
      setMetrics(metrics);
    },
  }
);
```

### 5. Validate Before Making Requests

```typescript
import { validateThinkingConfig } from '@/ai-utils/extended-thinking';

const validation = validateThinkingConfig('sonnet-4.5', thinkingBudget);
if (!validation.valid) {
  throw new Error(`Invalid thinking config: ${validation.error}`);
}

// Proceed with request
const result = await agent.think(prompt, { thinkingBudget });
```

## Performance Considerations

### Token Costs

- **Thinking tokens count as output tokens**
- Current pricing (as of 2025-10-28):
  - Claude Sonnet 4.5: $3/MTok input, $15/MTok output
  - Claude 3.7 Sonnet: $3/MTok input, $15/MTok output

**Example calculation:**

```typescript
// Task with 2000 thinking tokens + 500 output tokens
const thinkingCost = (2000 / 1_000_000) * 15; // $0.03
const outputCost = (500 / 1_000_000) * 15; // $0.0075
const totalCost = thinkingCost + outputCost; // $0.0375
```

### Rate Limits

- Thinking tokens contribute to rate limits
- Monitor usage across all extended thinking requests
- Consider implementing request queuing for high-volume scenarios

### Context Window Management

```typescript
// Always budget for: input + thinking + output < 200k tokens
const INPUT_TOKENS = 5000;
const THINKING_BUDGET = 8000;
const OUTPUT_BUFFER = 2000;
const TOTAL = INPUT_TOKENS + THINKING_BUDGET + OUTPUT_BUFFER; // 15,000 tokens

if (TOTAL > 200000) {
  throw new Error('Would exceed context window');
}
```

## Troubleshooting

### Error: "thinking.budget_tokens: Input should be greater than or equal to 1024"

**Solution:** Use minimum 1024 tokens for thinking budget.

```typescript
// ✗ Wrong
await agent.think(prompt, { thinkingBudget: 500 });

// ✓ Correct
await agent.think(prompt, { thinkingBudget: 1024 });
```

### Error: "temperature may only be set to 1 when thinking is enabled"

**Solution:** Don't use temperature, top_p, or top_k with extended thinking.

```typescript
// ✗ Wrong
const response = await client.messages.create({
  temperature: 0.7,
  thinking: { type: 'enabled', budget_tokens: 2000 },
});

// ✓ Correct
const response = await client.messages.create({
  thinking: { type: 'enabled', budget_tokens: 2000 },
});
```

### Error: "prompt is too long"

**Solution:** Reduce thinking budget or input size.

```typescript
// Option 1: Reduce thinking budget
await agent.think(prompt, { thinkingBudget: 2000 }); // Instead of 8000

// Option 2: Summarize input
const summarized = await summarizePrompt(longPrompt);
await agent.think(summarized, { thinkingBudget: 4000 });
```

## Testing

### Unit Tests

```typescript
import { describe, it, expect } from 'vitest';
import {
  ExtendedThinkingAgent,
  validateThinkingConfig,
} from '@/ai-utils/extended-thinking';

describe('ExtendedThinkingAgent', () => {
  it('should validate thinking config', () => {
    const validation = validateThinkingConfig('sonnet-4.5', 2000);
    expect(validation.valid).toBe(true);
  });

  it('should reject invalid thinking budget', () => {
    const validation = validateThinkingConfig('sonnet-4.5', 500);
    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('below minimum');
  });

  it('should create agent with valid config', () => {
    const agent = new ExtendedThinkingAgent('sonnet-4.5', {
      defaultThinkingBudget: 2000,
    });
    expect(agent).toBeDefined();
  });
});
```

### Integration Tests

```typescript
describe('ExtendedThinkingAgent integration', () => {
  it('should complete thinking task', async () => {
    const agent = new ExtendedThinkingAgent('sonnet-4.5');

    const result = await agent.think('Calculate 2 + 2');

    expect(result.answer).toContain('4');
    expect(result.thinkingChars).toBeGreaterThan(0);
    expect(result.answerChars).toBeGreaterThan(0);
  });
});
```

## Resources

- **API Documentation:** `ai-utils/extended-thinking/README.md`
- **Quick Reference:** `cheatsheets/extended-thinking.md`
- **Interactive Examples:**
  `notebooks/examples/extended-thinking-multi-model.ipynb`
- **Claude Docs:**
  https://docs.claude.com/en/docs/build-with-claude/extended-thinking
- **API Reference:** https://docs.anthropic.com/en/api/messages

## Future Enhancements

- [ ] Prometheus metrics integration
- [ ] Grafana dashboard for extended thinking usage
- [ ] Automatic complexity detection based on prompt analysis
- [ ] Cost optimization recommendations
- [ ] A/B testing framework for thinking budgets
- [ ] Real-time streaming UI components
