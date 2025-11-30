# Multi-Model Consensus

## Overview

Query multiple AI models in parallel for high-stakes decisions where
correctness, security, or significant business impact requires validation beyond
a single perspective. Leverage debate, consensus, and collaborative solving
patterns to achieve higher-quality outcomes on critical tasks.

## When to Use

### Use For (High-Stakes)

**Technical Correctness**:

- Financial calculation validation (waterfall distributions, carry calculations)
- Security review (authentication, authorization, data protection)
- Architecture decisions with long-term implications
- Database schema changes affecting data integrity
- Algorithm correctness (Monte Carlo simulation logic)

**Business Impact**:

- Features affecting fund reporting accuracy
- Changes to core calculation engines (Reserve, Pacing, Cohort)
- API contracts with external consumers
- Data migration strategies
- Performance optimizations with correctness trade-offs

**Trade-off Analysis**:

- Multiple valid architectural approaches
- Technology selection decisions
- Conflicting quality attributes (performance vs maintainability)

### DON'T Use For (Low-Stakes)

**Simple Fixes** (3-5x cost not justified):

- Linting issues
- Code formatting
- Simple refactoring
- Documentation updates
- UI styling tweaks
- Basic test fixes

**Cost Consideration**: Multi-model queries are 3-5x more expensive than
single-model. Reserve for decisions where the cost of being wrong exceeds the
cost of validation.

## Core Patterns

### Pattern 1: Consensus Building

**Purpose**: Find agreement across models on a specific question

**Tool**: `mcp__multi-ai-collab__ai_consensus`

```typescript
// High-stakes: Waterfall calculation correctness
mcp__multi -
  ai -
  collab__ai_consensus({
    question: 'Is this European waterfall calculation implementation correct?',
    options: 'Current implementation (deal-by-deal), Alternative (whole-fund)',
  });
```

**Integration**: Use with `pattern-recognition` to synthesize consensus:

```markdown
Consensus Result:

- Gemini: Deal-by-deal correct for European style (HIGH confidence)
- OpenAI: Deal-by-deal matches ILPA guidelines (HIGH confidence)
- Grok: Deal-by-deal is standard practice (MEDIUM confidence)

Synthesis (pattern-recognition):

- All models agree on approach
- HIGH confidence: Proceed with current implementation
```

### Pattern 2: Debate Exploration

**Purpose**: Explore disagreement to uncover edge cases and assumptions

**Tool**: `mcp__multi-ai-collab__ai_debate`

```typescript
// Architecture decision: How to cache Monte Carlo results?
mcp__multi -
  ai -
  collab__ai_debate({
    topic:
      'Should we use Redis caching or function memoization for Monte Carlo simulations?',
    ai1: 'gemini', // Often favors battle-tested solutions
    ai2: 'openai', // Often favors simplicity
  });
```

### Pattern 3: Multi-Perspective Analysis

**Purpose**: Get multiple viewpoints on same question

**Tool**: `mcp__multi-ai-collab__ask_all_ais`

```typescript
// Exploratory: What edge cases exist in reserve allocation?
mcp__multi -
  ai -
  collab__ask_all_ais({
    prompt:
      'What edge cases should we test in reserve allocation calculations?',
    temperature: 0.7,
  });
```

**Synthesis Pattern**:

```markdown
Common themes (pattern-recognition):

- All models mention: zero reserves, negative cash flows
- 3/4 models mention: follow-on exhaustion before exit
- 2/4 models mention: multiple rounds same day

Unique insights:

- Gemini: Reserve allocation during fund extension
- OpenAI: Pro-rata rights interaction with reserves
- DeepSeek: Currency conversion timing issues

Action: Test all common themes (HIGH priority), investigate unique insights
(MEDIUM priority)
```

### Pattern 4: Collaborative Solving

**Purpose**: Divide complex problem across models

**Tool**: `mcp__multi-ai-collab__collaborative_solve`

```typescript
// Complex: Optimize entire portfolio modeling pipeline
mcp__multi -
  ai -
  collab__collaborative_solve({
    problem:
      'Reduce Monte Carlo simulation time from 45s to <15s without sacrificing accuracy',
    approach: 'parallel', // Each model tackles different aspect
  });
```

## Decision Framework

### Step 1: Assess Stakes

```markdown
Question checklist:

- [ ] Does this affect financial calculations? (HIGH stakes)
- [ ] Does this affect security or data integrity? (HIGH stakes)
- [ ] Does this have long-term architectural impact? (HIGH stakes)
- [ ] Is this a simple fix or established pattern? (LOW stakes)
- [ ] Would being wrong cost more than 3-5x validation? (Cost threshold)
```

### Step 2: Choose Pattern

| Stakes Level | Question Type         | Pattern           | Tool                  |
| ------------ | --------------------- | ----------------- | --------------------- |
| HIGH         | Need validation       | Consensus         | `ai_consensus`        |
| HIGH         | Multiple approaches   | Debate            | `ai_debate`           |
| MEDIUM       | Exploratory           | Multi-perspective | `ask_all_ais`         |
| HIGH         | Complex multi-faceted | Collaborative     | `collaborative_solve` |
| LOW          | Simple fix            | Single model      | (standard Claude)     |

### Step 3: Synthesize Results

Always use `pattern-recognition` skill to synthesize multi-model output:

1. Note repeated themes (convergence = high confidence)
2. Flag contradictions (divergence = needs investigation)
3. Link cause-effect (understand reasoning)
4. Summarize cross-model insights

## Integration with Other Skills

### With Extended Thinking Framework

```xml
<research_thinking>
  <strategy>
    Approach: Validate waterfall implementation with ai_consensus
    Fallback: If consensus fails, use ai_debate to explore disagreement
  </strategy>

  <quality_check>
    Confidence validation:
    - Use ai_consensus on key findings
    - HIGH confidence if 3+ models agree
    - MEDIUM confidence if 2 models agree
    - LOW confidence if models disagree (investigate further)
  </quality_check>
</research_thinking>
```

### With Pattern Recognition

```markdown
1. Query multiple models (ai_consensus, ai_debate, ask_all_ais) ↓
2. Use pattern-recognition to synthesize:
   - Note repeated themes (convergence)
   - Flag contradictions (divergence)
   - Link cause-effect (reasoning)
   - Summarize insights ↓
3. Assign confidence levels:
   - All models agree → HIGH confidence
   - 3/4 agree → HIGH-MEDIUM confidence
   - 2/4 agree → MEDIUM confidence
   - All disagree → LOW confidence (investigate)
```

### With Continuous Improvement

```markdown
What worked well?

- ai_consensus caught waterfall calculation bug before production
- ai_debate revealed hybrid caching approach (better than either alone)

What was inefficient?

- Used ask_all_ais for simple lint fix (waste of 3-5x cost)

Next time:

- Always assess stakes before multi-model query
- Reserve multi-model for high-stakes decisions
```

## Quick Reference

### Stakes Assessment Checklist

```markdown
HIGH stakes (use multi-model):

- [ ] Financial calculations
- [ ] Security/auth/data integrity
- [ ] Long-term architectural impact
- [ ] Legal/compliance requirements

LOW stakes (single model sufficient):

- [ ] Code formatting
- [ ] Lint fixes
- [ ] UI styling
- [ ] Documentation
```

### Pattern Selection Guide

```markdown
Need validation? → ai_consensus Multiple approaches? → ai_debate Exploratory
research? → ask_all_ais Complex multi-faceted? → collaborative_solve Simple fix?
→ Single model
```

## Summary

**Core Principle**: Reserve multi-model queries for high-stakes decisions where
correctness, security, or business impact justifies 3-5x cost.

**Four Patterns**:

1. **Consensus** - Validation and agreement
2. **Debate** - Trade-off exploration
3. **Multi-perspective** - Diverse viewpoints
4. **Collaborative** - Complex problem solving

**Integration**:

- `extended-thinking-framework` for structure
- `pattern-recognition` for synthesis
- `memory-management` for tracking model performance
- `continuous-improvement` for refining usage

**Remember**: Being wrong on waterfall calculations costs more than 3-5x
validation. Being wrong on lint fixes costs almost nothing. Choose accordingly.
