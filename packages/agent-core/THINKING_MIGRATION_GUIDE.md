# Thinking Mixin Migration Guide

**Parallel Integration En Masse** - Enable all agents to use extended thinking capabilities simultaneously with zero breaking changes.

## Quick Start (5 Minutes)

### Before:
```typescript
import { BaseAgent } from '@agent-core';

export class MyAgent extends BaseAgent<Input, Output> {
  async run(input: Input): Promise<Output> {
    // Regular agent logic
  }
}
```

### After:
```typescript
import { BaseAgent } from '@agent-core';
import { withThinking } from '@agent-core/ThinkingMixin';

export class MyAgent extends withThinking(BaseAgent)<Input, Output> {
  async run(input: Input): Promise<Output> {
    // Now has: this.think(), this.analyze(), etc.
    const analysis = await this.think('Analyze this...', { depth: 'deep' });
    return this.processWithThinking(analysis);
  }
}
```

**That's it!** Zero breaking changes, all existing functionality preserved.

---

## Migration Patterns by Agent Type

### 1. Test Repair Agent

**File**: `packages/test-repair-agent/src/TestRepairAgent.ts`

**Before**:
```typescript
export class TestRepairAgent extends BaseAgent<TestFailure, RepairResult> {
  async run(input: TestFailure): Promise<RepairResult> {
    // Simple pattern matching for common failures
    if (input.error.includes('timeout')) {
      return this.fixTimeout(input);
    }
    // ... more if/else chains
  }
}
```

**After** (with thinking):
```typescript
import { withThinking } from '@agent-core/ThinkingMixin';

export class TestRepairAgent extends withThinking(BaseAgent)<TestFailure, RepairResult> {
  async run(input: TestFailure): Promise<RepairResult> {
    // Let extended thinking analyze complex failures
    const analysis = await this.think(
      `Analyze this test failure and suggest a repair strategy:

      Test: ${input.testName}
      Error: ${input.error}
      Stack: ${input.stackTrace}
      Code: ${input.codeSnippet}`,
      {
        depth: 'deep',
        context: 'Vitest, React Testing Library, TypeScript strict mode'
      }
    );

    this.logger.info('Test repair reasoning', {
      thinking_blocks: analysis.thinking.length,
      cost: analysis.cost?.total_cost_usd
    });

    return this.applyRepairStrategy(analysis.response, analysis.thinking);
  }
}
```

**Benefits**:
- Handles novel failures pattern matching can't catch
- Provides explainable reasoning (thinking blocks)
- Adapts to new test frameworks without code changes

---

### 2. Database Migration Agent

**File**: `packages/db-migration-agent/src/DbMigrationAgent.ts`

**Migration**:
```typescript
import { withThinking } from '@agent-core/ThinkingMixin';

export class DbMigrationAgent extends withThinking(BaseAgent)<Migration, MigrationPlan> {
  async run(input: Migration): Promise<MigrationPlan> {
    // Use deep thinking for critical migrations
    const riskAnalysis = await this.think(
      `Analyze this PostgreSQL migration for risks:

      ${input.sql}

      Consider:
      1. Data loss risks
      2. Downtime requirements
      3. Rollback strategy
      4. Performance impact`,
      {
        depth: 'deep',
        context: 'PostgreSQL 15, Drizzle ORM, zero-downtime requirement',
        enableTools: true // Can query current schema
      }
    );

    return {
      safetyScore: this.calculateSafety(riskAnalysis.thinking),
      rollbackPlan: this.extractRollback(riskAnalysis.response),
      reasoning: riskAnalysis.thinking,
      estimatedDowntime: this.extractDowntime(riskAnalysis.response)
    };
  }
}
```

---

### 3. Code Reviewer Agent

**File**: `packages/code-reviewer-agent/src/CodeReviewerAgent.ts`

**Migration**:
```typescript
import { withThinking } from '@agent-core/ThinkingMixin';

export class CodeReviewerAgent extends withThinking(BaseAgent)<CodeSubmission, Review> {
  async run(input: CodeSubmission): Promise<Review> {
    // Adaptive thinking: simple changes = quick, complex = deep
    const depth = await this.decideThinkingDepth(input.diff);

    if (depth === 'skip') {
      return this.fastReview(input); // Simple linting, no thinking needed
    }

    const review = await this.think(
      `Review this code for architectural consistency:

      ${input.diff}

      Check adherence to:
      - CLAUDE.md conventions
      - Waterfall helper patterns
      - Fail-closed validation (ADR-010)
      - Stage normalization patterns (ADR-011)`,
      { depth }
    );

    return {
      approved: this.shouldApprove(review.response),
      concerns: this.extractConcerns(review.thinking),
      suggestions: review.response,
      confidence: review.thinking.length / 10, // More thinking = higher confidence
      thinkingCost: review.cost?.total_cost_usd
    };
  }
}
```

---

### 4. Bundle Optimization Agent

**File**: `packages/bundle-optimization-agent/src/BundleOptimizationAgent.ts`

**Migration**:
```typescript
import { withThinking } from '@agent-core/ThinkingMixin';

export class BundleOptimizationAgent extends withThinking(BaseAgent)<BundleStats, Optimizations> {
  async run(input: BundleStats): Promise<Optimizations> {
    // Use thinking for complex optimization decisions
    const strategy = await this.think(
      `Analyze bundle size and suggest optimizations:

      Total: ${input.totalSize} (target: ${input.budgetSize})
      Largest chunks: ${JSON.stringify(input.largestChunks)}
      Dependencies: ${input.dependencies.length} packages

      Suggest: code splitting, lazy loading, tree shaking opportunities`,
      {
        depth: input.totalSize > input.budgetSize * 1.5 ? 'deep' : 'quick',
        context: 'Vite build, React SPA, targeting modern browsers'
      }
    );

    return {
      optimizations: this.parseOptimizations(strategy.response),
      expectedSavings: this.estimateSavings(strategy.thinking),
      reasoning: strategy.thinking,
      priority: this.prioritizeByImpact(strategy.response)
    };
  }
}
```

---

### 5. Chaos Engineer Agent

**File**: `packages/chaos-engineer-agent/src/ChaosEngineerAgent.ts`

**Migration**:
```typescript
import { withThinking } from '@agent-core/ThinkingMixin';

export class ChaosEngineerAgent extends withThinking(BaseAgent)<SystemContext, Experiment> {
  async run(input: SystemContext): Promise<Experiment> {
    // Deep thinking for safe failure injection
    const experimentDesign = await this.think(
      `Design a chaos experiment for this system:

      Services: ${JSON.stringify(input.services)}
      Dependencies: ${JSON.stringify(input.dependencies)}
      Current health: ${input.healthScore}

      Constraints:
      - Blast radius < 10% users
      - RTO < 5 minutes
      - No data loss

      Suggest the next experiment with safety analysis.`,
      {
        depth: 'deep',
        enableTools: true // Can query current system state
      }
    );

    return {
      scenario: this.parseScenario(experimentDesign.response),
      safetyChecks: this.extractSafetyChecks(experimentDesign.thinking),
      recoveryPlan: this.extractRecovery(experimentDesign.response),
      confidence: this.calculateConfidence(experimentDesign.thinking),
      reasoning: experimentDesign.thinking
    };
  }
}
```

---

## Parallel Migration Checklist

### Real Agents (Migration Status)

These agents exist in `packages/`:

- [x] **Test Repair Agent** (`packages/test-repair-agent/`) - ✅ **MIGRATED** - Uses extended thinking for complex test failure analysis
- [x] **Bundle Optimization Agent** (`packages/bundle-optimization-agent/`) - ✅ **MIGRATED** - Uses extended thinking for optimization strategy
- [x] **Codex Review Agent** (`packages/codex-review-agent/`) - ✅ **MIGRATED** - Enhanced with extended thinking capabilities
- [x] **Dependency Analysis Agent** (`packages/dependency-analysis-agent/`) - ✅ **MIGRATED** - Extended thinking integrated
- [x] **Route Optimization Agent** (`packages/route-optimization-agent/`) - ✅ **MIGRATED** - Extended thinking integrated
- [x] **Zencoder Agent** (`packages/zencoder-integration/`) - ✅ **MIGRATED** - Extended thinking integrated

**Migration Complete**: All 6 production agents now have extended thinking capabilities!

### Example Agents (Reference Only)

These are hypothetical examples in this guide - not actual packages:

- 📘 **DB Migration Agent** - Example pattern for schema change risk assessment
- 📘 **Chaos Engineer Agent** - Example pattern for safe failure scenario design
- 📘 **Code Reviewer Agent** - Example pattern for architectural pattern validation

## Extended Thinking + Native Memory Integration

All agents in this codebase already have **native memory capabilities** via Claude's memory tool. Extended thinking and native memory work together synergistically:

### How They Work Together

```typescript
import { withThinking } from '@agent-core/ThinkingMixin';

export class TestRepairAgent extends withThinking(BaseAgent)<TestFailure, RepairResult> {
  async run(input: TestFailure): Promise<RepairResult> {
    // 1. Extended thinking provides deep reasoning for THIS task
    const analysis = await this.think(
      `Analyze test failure: ${input.error}`,
      { depth: 'deep' }
    );

    // 2. Native memory stores patterns ACROSS tasks
    // (Automatically enabled via enableNativeMemory in BaseAgent config)
    // Claude remembers: "TypeScript strict mode errors in tests often fixed by..."

    // 3. Combined intelligence: reasoning + learned patterns
    return this.applyRepair(analysis, this.rememberPastFixes());
  }
}
```

### Key Differences

| Feature | Extended Thinking | Native Memory |
|---------|------------------|---------------|
| **Scope** | Current task only | Cross-session patterns |
| **Purpose** | Deep reasoning for complex problems | Learn from past successes/failures |
| **Cost** | $0.02-$0.08 per operation | Free (built into Claude) |
| **When to Use** | Novel problems, architectural decisions | Repetitive patterns, learned optimizations |
| **Example** | "Analyze this migration for risks" | "Remember: migrations without indexes cause downtime" |

### Best Practice Pattern

```typescript
async run(input: Task): Promise<Result> {
  // Check complexity
  const depth = await this.decideThinkingDepth(input.description);

  if (depth === 'skip') {
    // Simple task - rely on memory alone
    return this.applyKnownPatterns(input);
  }

  // Complex task - use extended thinking
  const reasoning = await this.think(input.description, { depth });

  // Memory will automatically store patterns from successful outcomes
  return this.executeWithReasoning(reasoning);
}
```

### Migration Note

When migrating agents to use `withThinking()`, **DO NOT REMOVE** `enableNativeMemory: true` from your agent config. Both capabilities complement each other:

- ✅ **Keep**: `enableNativeMemory: true` (learns patterns)
- ✅ **Add**: `withThinking(BaseAgent)` (deep reasoning)

## Cost Management

### Environment Variables

```bash
# Set per-agent budget (default: $1.00)
AGENT_THINKING_BUDGET=2.00

# API endpoint (default: http://localhost:5000)
API_BASE_URL=https://api.myapp.com
```

### Budget Tracking

```typescript
// Check remaining budget
const budget = this.getThinkingBudget();
console.log(`Remaining: $${budget.remaining.toFixed(2)}`);

// Manual cost control
if (budget.remaining < 0.10) {
  return this.fallbackToSimpleLogic();
}
```

### Cost Estimates

| Depth  | Thinking Tokens | Output Tokens | Typical Cost |
|--------|----------------|---------------|--------------|
| Quick  | ~2,000         | ~4,000        | ~$0.02       |
| Deep   | ~8,000         | ~8,000        | ~$0.08       |

## Testing Thinking Integration

```typescript
import { describe, it, expect, beforeEach } from 'vitest';

describe('MyAgent with Thinking', () => {
  let agent: MyAgent;

  beforeEach(() => {
    agent = new MyAgent({ name: 'test-agent' });
  });

  it('should use extended thinking for complex tasks', async () => {
    const result = await agent.think('Complex analysis...', { depth: 'deep' });

    expect(result.thinking).toBeDefined();
    expect(result.thinking.length).toBeGreaterThan(0);
    expect(result.cost?.total_cost_usd).toBeGreaterThan(0);
  });

  it('should skip thinking when budget exhausted', async () => {
    // Exhaust budget
    agent['thinkingBudget'].spent = agent['thinkingBudget'].total;

    const depth = await agent.decideThinkingDepth('Simple task');
    expect(depth).toBe('skip');
  });

  it('should check API availability', async () => {
    const available = await agent.isThinkingAvailable();
    expect(typeof available).toBe('boolean');
  });
});
```

## Rollback Strategy

If issues arise, simply remove `withThinking()`:

```typescript
// Instant rollback - zero code changes needed
export class MyAgent extends BaseAgent<Input, Output> {
  // Agent still works exactly as before
}
```

## Performance Considerations

- **Latency**: Extended thinking adds 2-10s per operation (varies by depth)
- **Caching**: Consider caching thinking results for similar inputs
- **Async**: Always `await` thinking operations
- **Timeouts**: Default 30s timeout, configurable via agent config

## Best Practices

1. **Use Quick Thinking First**: Try `depth: 'quick'` before `deep`
2. **Provide Context**: More context = better thinking results
3. **Parse Thinking Blocks**: Extract reasoning for explainability
4. **Track Costs**: Log `cost.total_cost_usd` for budget monitoring
5. **Fallback Logic**: Keep simple logic for when budget is exhausted
6. **Test Both Modes**: Test with and without thinking enabled

## Examples Repository

See `packages/agent-core/examples/` for complete working examples:

- `thinking-test-repair.ts` - Full test repair agent with thinking
- `thinking-chaos-engineer.ts` - Chaos engineering with safety analysis
- `thinking-code-reviewer.ts` - Architectural review with reasoning

---

## Support

- **API Docs**: See `server/routes/interleaved-thinking.ts`
- **Health Check**: `GET /api/interleaved-thinking/health`
- **Usage Stats**: `GET /api/interleaved-thinking/usage`

**Questions?** Check CAPABILITIES.md or open an issue.
