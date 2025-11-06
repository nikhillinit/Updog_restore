# Extended Thinking - Quick Start

**5-minute integration** for autonomous agents. Zero breaking changes.

## Installation

```typescript
import { withThinking } from '@agent-core';

// Before
class MyAgent extends BaseAgent { }

// After - that's it!
class MyAgent extends withThinking(BaseAgent) { }
```

## Usage

```typescript
// Simple thinking
const result = await this.think('Analyze this complex problem...');
console.log(result.response);      // AI response
console.log(result.thinking);      // Reasoning process
console.log(result.cost);          // Cost in USD

// Deep analysis
const analysis = await this.think('Complex architecture decision...', {
  depth: 'deep',
  context: 'TypeScript, React, PostgreSQL'
});

// Automatic depth selection
const auto = await this.analyze('Should we refactor this?');
```

## API Reference

### `think(query, options?)`

Execute extended thinking query.

```typescript
await this.think(query: string, options?: {
  depth?: 'quick' | 'deep',          // Default: 'quick'
  context?: string,                   // Additional context
  thinkingBudget?: number,            // Override token budget
  maxTokens?: number,                 // Override output tokens
  temperature?: number                // 0-1, default: 1.0
}) => ThinkingResult
```

**Returns:**
```typescript
{
  response: string,                   // Final AI response
  thinking: string[],                 // Reasoning blocks
  toolUses?: Array<{                  // Tools used (if enabled)
    name: string,
    input: any,
    output: any
  }>,
  usage: {                            // Token counts
    input_tokens: number,
    output_tokens: number,
    total_tokens: number
  },
  cost: {                             // Costs in USD
    input_cost_usd: number,
    output_cost_usd: number,
    total_cost_usd: number
  },
  duration: number                    // ms
}
```

### `analyze(topic, context?)`

Automatic depth selection based on complexity.

```typescript
await this.analyze(topic: string, context?: string) => ThinkingResult
```

### `decideThinkingDepth(task, budget?)`

Get recommended thinking depth.

```typescript
await this.decideThinkingDepth(
  task: string,
  budget?: CostBudget
) => 'quick' | 'deep' | 'skip'
```

### `getThinkingBudget()`

Check remaining budget.

```typescript
const budget = this.getThinkingBudget();
console.log(budget.total);      // Total budget ($)
console.log(budget.spent);      // Amount spent ($)
console.log(budget.remaining);  // Remaining ($)
```

### `isThinkingAvailable()`

Health check.

```typescript
const healthy = await this.isThinkingAvailable();
```

## Cost Estimates

Claude Sonnet 4.5 Pricing: Input $3/M tokens, Output $15/M tokens

| Depth  | Thinking Tokens | Output Tokens | Input Cost | Output Cost | Total Cost |
|--------|----------------|---------------|------------|-------------|------------|
| Quick  | ~2,000         | ~1,300        | $0.006     | $0.020      | **~$0.03** |
| Deep   | ~8,000         | ~5,300        | $0.024     | $0.080      | **~$0.10** |

**Note**: Actual costs vary based on query complexity and response length. These are typical ranges.

## Environment Variables

```bash
# Per-agent budget (default: $1.00)
AGENT_THINKING_BUDGET=2.00

# API endpoint (default: http://localhost:5000)
API_BASE_URL=https://api.example.com
```

## Common Patterns

### Pattern 1: Error Handling (Always Use Try/Catch)

```typescript
try {
  const result = await this.think('Analyze this...');
  return this.processThinking(result);
} catch (error) {
  this.logger.error('Thinking failed', error);
  // Always have a fallback
  return this.fallbackLogic(input);
}
```

### Pattern 2: Conditional Thinking

```typescript
const depth = await this.decideThinkingDepth(input.description);

if (depth === 'skip') {
  return this.simpleLogic(input);
}

const analysis = await this.think(input.description, { depth });
return this.processThinking(analysis);
```

### Pattern 3: Budget-Aware Operation

```typescript
const budget = this.getThinkingBudget();

if (budget.remaining < 0.05) {
  return this.fallbackLogic(input);
}

const result = await this.think(input.query);
```

### Pattern 4: Explainable Decisions

```typescript
const decision = await this.think('Should we migrate to...');

return {
  decision: this.parseDecision(decision.response),
  reasoning: decision.thinking,        // Show full reasoning
  confidence: decision.thinking.length / 10,
  cost: decision.cost.total_cost_usd
};
```

## Example Agents

### Test Repair Agent

```typescript
class TestRepairAgent extends withThinking(BaseAgent) {
  async run(failure: TestFailure) {
    const analysis = await this.think(
      `Fix this test: ${failure.error}`,
      { depth: 'deep', context: 'Vitest, React Testing Library' }
    );

    return {
      fixes: this.parseFixes(analysis.response),
      reasoning: analysis.thinking,
      cost: analysis.cost.total_cost_usd
    };
  }
}
```

### Code Reviewer

```typescript
class CodeReviewer extends withThinking(BaseAgent) {
  async run(diff: string) {
    const review = await this.analyze(
      `Review this code:\n${diff}`,
      'Check: CLAUDE.md patterns, ADR compliance'
    );

    return {
      approved: review.response.includes('approved'),
      concerns: this.extractConcerns(review.thinking),
      reasoning: review.thinking
    };
  }
}
```

### Chaos Engineer

```typescript
class ChaosEngineer extends withThinking(BaseAgent) {
  async selectExperiment(system: System) {
    const plan = await this.think(
      `Design safe chaos experiment for: ${JSON.stringify(system)}`,
      { depth: 'deep', enableTools: true }
    );

    return {
      scenario: this.parseScenario(plan.response),
      safety: this.extractSafety(plan.thinking),
      reasoning: plan.thinking
    };
  }
}
```

## Testing

```typescript
import { describe, it, expect } from 'vitest';

describe('MyAgent with Thinking', () => {
  it('should use extended thinking', async () => {
    const agent = new MyAgent({ name: 'test' });
    const result = await agent.think('Test query');

    expect(result.thinking).toBeDefined();
    expect(result.cost.total_cost_usd).toBeGreaterThan(0);
  });
});
```

## Rollback

Remove `withThinking()` to instantly rollback:

```typescript
// Rollback: Remove wrapper
class MyAgent extends BaseAgent { }
// Agent works exactly as before
```

## Troubleshooting

### API not available
```typescript
const healthy = await this.isThinkingAvailable();
if (!healthy) {
  return this.fallbackLogic();
}
```

### Budget exhausted
```typescript
const budget = this.getThinkingBudget();
if (budget.remaining < estimatedCost) {
  this.logger.warn('Budget exhausted, using simple logic');
  return this.simpleApproach();
}
```

### Slow response
- Use `depth: 'quick'` instead of `'deep'`
- Consider caching results for similar queries
- Implement timeout handling

## Learn More

- **Full Guide**: `THINKING_MIGRATION_GUIDE.md`
- **Examples**: `examples/thinking-integration-example.ts`
- **API Docs**: `server/routes/interleaved-thinking.ts`

---

**Ready to integrate?** Just add `withThinking()` and start using `this.think()`!
