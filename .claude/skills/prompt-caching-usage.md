# Prompt Caching Usage

## Overview

Leverage cached prompts to reduce latency by 85% and cost by 90% for repeated
context. Critical for agent operations that repeatedly send the same project
context (CLAUDE.md, schemas, documentation) with varying user queries.

**Expected Impact**: First call ~20s/$0.30, subsequent calls ~3s/$0.03

## When to Use

**High-Reuse Context Scenarios**:

- Test repair agents (cache test suite structure)
- Multi-turn conversations (cache system prompts)
- Evaluator-optimizer loops (cache evaluation criteria)
- Documentation queries (cache CLAUDE.md, DECISIONS.md)
- Schema validation (cache shared/schemas files)
- Code generation (cache project patterns)

**Don't Use When**:

- One-time queries (no reuse)
- Highly dynamic content (cache misses)
- Short prompts (overhead not worth it)

## What to Cache (Prioritization)

### Cache These (High Reuse)

1. **Project instructions** (CLAUDE.md) - Used in every agent call
2. **Schema files** (shared/schemas/\*) - Used in validation operations
3. **Test file structure** - Used in test repair loops
4. **API specs** (OpenAPI YAML) - Used in route generation
5. **Documentation** (DECISIONS.md, cheatsheets/) - Used in research queries
6. **Evaluation criteria** - Used in iterative-improvement loops

### Don't Cache (Low Reuse)

- User queries (change every call)
- Dynamic test failures
- Real-time metrics
- Git diffs (workspace-specific)
- Session-specific data

## Pattern: Cacheable vs Dynamic Split

### Good: Separate Cached and Dynamic Content

```typescript
const response = await claude.messages.create({
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: projectContext, // CACHED (reused)
          cache_control: { type: 'ephemeral' },
        },
        {
          type: 'text',
          text: userQuery, // DYNAMIC (changes)
        },
      ],
    },
  ],
  headers: {
    'anthropic-beta': 'prompt-caching-2024-07-31',
  },
});
```

### Bad: Mixing Cached and Dynamic

```typescript
// Can't cache selectively
const combined = `${projectContext}\n\n${userQuery}`;
```

## Example: VC Fund Context

### Test Repair Agent (High Cache Hit Rate)

**Cached (reused 100+ times)**:

- Project structure (CLAUDE.md) - ~50k chars
- Test patterns (cheatsheets/testing.md) - ~20k chars
- Schema definitions (shared/schemas/\*) - ~30k chars

**Dynamic (changes per call)**:

- Specific test failure message
- Git diff of recent changes
- User's repair request

**Expected Impact**:

- Latency: 20s → 3s (85% reduction)
- Cost: $0.30 → $0.03 per call (90% reduction)
- 10 iterations: $3.00 → $0.33 total

### Monte Carlo Simulation Queries

**Cached**:

- ReserveEngine implementation
- PacingEngine algorithms
- Waterfall calculation logic
- Domain concepts (hurdle, carry, vesting)

**Dynamic**:

- Specific performance question
- Current bottleneck details
- Optimization constraints

## Monitoring Cache Effectiveness

### Track These Metrics

```typescript
// After implementation
const cacheMetrics = {
  hitRate: cacheReadTokens / totalTokens, // Target: >70%
  latencyReduction: (oldTime - newTime) / oldTime, // Target: >80%
  costSavings: (oldCost - newCost) / oldCost, // Target: >85%
};
```

### Use Continuous Improvement to Refine

```markdown
## Cache Performance Review - 2025-11-29

Metrics:

- Hit rate: 82% (target: >70%) PASS
- Latency: 18s → 2.8s (84% reduction) PASS
- Cost: $0.28 → $0.04 (86% savings) PASS

What worked well?

- CLAUDE.md caching perfect (100% reuse)
- Schema caching effective (95% reuse)

What needs improvement?

- cheatsheets/ changing frequently (60% hit rate)

Next actions:

- Cache only stable cheatsheets (exclude WIP docs)
- Increase cache TTL for CLAUDE.md
```

## Integration with Other Skills

### With Memory Management

Identify high-reuse content from session notes:

```markdown
## Memory: High-Reuse Content Patterns

HIGH reuse (always cache):

- CLAUDE.md: Used in 100% of agent calls
- WaterfallSchema: Used in 80% of VC calculations

MEDIUM reuse (cache selectively):

- Test patterns: Used in 60% of repair sessions
- API docs: Used in 40% of route design

LOW reuse (don't cache):

- Git diffs: Unique per session
- User queries: Never repeated
```

### With Continuous Improvement

Track effectiveness in retrospectives:

```markdown
What worked well?

- Prompt caching reduced test repair from 60s to 12s
- 5x cost savings on multi-iteration evaluator loops

What was inefficient?

- Cached cheatsheet that changed 3 times (wasted cache)

Next time?

- Only cache stable documentation
- Monitor cache hit rates weekly
```

### With BaseAgent

System prompt caching for all agents:

```typescript
class BaseAgent {
  private systemPrompt = `
    You are a VC fund modeling expert...
    Project conventions: ${claudeMdContent}
    Schema definitions: ${schemaContent}
  `; // Cache this entire block

  async callAI(userQuery: string) {
    return anthropic.messages.create({
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: this.systemPrompt,
              cache_control: { type: 'ephemeral' },
            },
            { type: 'text', text: userQuery },
          ],
        },
      ],
      headers: { 'anthropic-beta': 'prompt-caching-2024-07-31' },
    });
  }
}
```

### With TestRepairAgent

Cache test suite structure:

```typescript
const testRepairCache = {
  projectContext: [
    'CLAUDE.md content',
    'Test patterns from cheatsheets/',
    'Schema definitions',
    'Known anti-patterns',
  ].join('\n'), // Cache this

  testFailure: failureMessage, // Dynamic per test
  repairAttempt: iteration, // Dynamic per iteration
};
```

## Implementation Checklist

### Before Caching

- [ ] Identify high-reuse content (CLAUDE.md, schemas)
- [ ] Separate cacheable from dynamic content
- [ ] Estimate expected hit rate (>70% to justify)
- [ ] Set up metrics tracking (latency, cost, hit rate)

### During Implementation

- [ ] Add cache_control to cacheable text blocks
- [ ] Add anthropic-beta header
- [ ] Verify cache hits in response.usage
- [ ] Test with real workload (not synthetic)

### After Deployment

- [ ] Monitor hit rate weekly (target >70%)
- [ ] Track latency reduction (target >80%)
- [ ] Measure cost savings (target >85%)
- [ ] Refine cached content based on metrics
- [ ] Document successful patterns

## Best Practices

### 1. Cache Stable Content Only

```typescript
// GOOD: Stable project documentation
cache(claudeMdContent); // Changes monthly

// BAD: Frequently changing content
cache(gitDiff); // Changes every commit
```

### 2. Structure for Maximum Reuse

```typescript
// GOOD: Modular caching
{
  systemPrompt: cached,
  schemas: cached,
  userQuery: dynamic
}

// BAD: Monolithic with embedded dynamic
{
  everything: `${cached}\n${dynamic}` // Can't cache selectively
}
```

### 3. Monitor and Adapt

```typescript
// Track what's actually being reused
if (cacheHitRate < 0.7) {
  // Content changing too frequently
  // Reduce cached content or increase stability
}
```

### 4. Use with Multi-Turn Conversations

```typescript
// Cache grows across conversation
[
  { text: systemPrompt, cache_control: { type: 'ephemeral' } },
  { text: conversationHistory, cache_control: { type: 'ephemeral' } },
  { text: newUserMessage }, // Only this is new
];
// Massive savings for long conversations
```

## Integration with Other Skills

- **memory-management**: Identify high-reuse content
- **continuous-improvement**: Track cache effectiveness
- **BaseAgent**: Infrastructure for system prompt caching
- **TestRepairAgent**: Cache test suite structure
- **multi-model-consensus**: Cache shared context across models
