# AI Model Selection (Routing Pattern)

## Overview

A decision framework for selecting the optimal AI model based on task
characteristics, complexity level, and cost constraints. Helps route questions
to Gemini, OpenAI (ChatGPT), Grok, or DeepSeek via MCP tools to maximize quality
while minimizing cost.

**Core Principle:** Match task complexity and domain to AI strengths. Simple
questions → free models. Complex reasoning → premium models. VC fund modeling →
domain-specific routing.

## When to Use

- Before asking questions via MCP multi-AI collaboration tools
- When deciding between `ask_gemini`, `ask_openai`, etc.
- For cost optimization (Gemini is free, others are paid)
- When task complexity is unclear
- Before dispatching code reviews, debugging, or architecture requests
- When multiple AI opinions are needed (consensus, debate)

## Decision Matrix

| Task Type                     | Complexity | Best Model(s)    | MCP Tool              | Rationale                                     |
| ----------------------------- | ---------- | ---------------- | --------------------- | --------------------------------------------- |
| **Quick Lookups**             | < 3        | Gemini           | `ask_gemini`          | Free, fast, accurate for factual queries      |
| **Code Review (Security)**    | 3-7        | Gemini           | `gemini_code_review`  | Technical accuracy focus, thorough analysis   |
| **Code Review (Readability)** | 3-7        | OpenAI           | `openai_code_review`  | Best practices, clear suggestions             |
| **Debugging**                 | 3-7        | DeepSeek         | `ask_deepseek`        | Strong reasoning, logical analysis            |
| **Architecture Design**       | 7+         | OpenAI           | `openai_architecture` | Balanced, practical, well-documented patterns |
| **Creative Solutions**        | 5-9        | Grok             | `grok_brainstorm`     | Unique perspectives, alternative approaches   |
| **Deep Analysis**             | 8+         | OpenAI (o1)      | `openai_think_deep`   | Extended reasoning, complex problems          |
| **Consensus Building**        | 5+         | All AIs          | `ai_consensus`        | Multiple perspectives reduce bias             |
| **Technical Debate**          | 6+         | Gemini vs OpenAI | `ai_debate`           | Contrasting technical vs practical views      |

## Complexity Thresholds

**Complexity Scale (1-10):**

### Level 1-2: Trivial (Free Tier)

- **Examples:** Factual lookups, syntax questions, simple explanations
- **Best Model:** Gemini (free)
- **Tool:** `mcp__multi-ai-collab__ask_gemini`
- **Cost:** FREE

```typescript
// Example: Simple factual question
mcp__multi -
  ai -
  collab__ask_gemini({
    prompt: 'What is the difference between American and European waterfall?',
    temperature: 0.3, // Low for factual accuracy
  });
```

### Level 3-7: Moderate (Strategic Choice)

- **Examples:** Code review, debugging, design patterns, refactoring
- **Decision Factors:**
  - **Security focus** → Gemini (technical accuracy)
  - **Readability focus** → OpenAI (best practices)
  - **Performance bugs** → DeepSeek (logical reasoning)
  - **Architecture** → OpenAI (balanced approach)
- **Cost:** Varies (Gemini free, others paid)

```typescript
// Example: Code review with focus area
mcp__multi -
  ai -
  collab__gemini_code_review({
    code: waterfallImplementation,
    focus: 'security', // Gemini for security/technical accuracy
  });

mcp__multi -
  ai -
  collab__openai_code_review({
    code: waterfallImplementation,
    focus: 'readability', // OpenAI for best practices
  });
```

### Level 8-10: Complex (Premium Tier)

- **Examples:** System architecture, complex algorithms, multi-constraint
  optimization
- **Best Model:** OpenAI (o1 reasoning), or multi-AI collaboration
- **Tools:** `openai_think_deep`, `ai_consensus`, `collaborative_solve`
- **Cost:** Premium (but higher quality)

```typescript
// Example: Complex architectural decision
mcp__multi -
  ai -
  collab__openai_think_deep({
    topic:
      'Optimize Monte Carlo simulation with 10,000+ iterations while maintaining sub-second response times',
    context:
      'Current bottleneck: waterfall calculations in hot loop. Constraints: no breaking changes, maintain accuracy',
  });
```

## Cost Optimization Strategies

### Strategy 1: Free-First Routing

**Rule:** Always try Gemini first for complexity < 5

```typescript
// Start with free tier
const geminiResponse =
  (await mcp__multi) -
  ai -
  collab__ask_gemini({
    prompt: question,
    temperature: 0.3,
  });

// Escalate to paid only if insufficient
if (needsDeepReasoning) {
  const openaiResponse =
    (await mcp__multi) -
    ai -
    collab__openai_think_deep({
      topic: question,
      context: geminiResponse, // Build on free analysis
    });
}
```

### Strategy 2: Consensus for Critical Decisions

**Rule:** Use multi-AI consensus for decisions with > $10k impact

```typescript
// Example: Architecture decision affecting development velocity
mcp__multi -
  ai -
  collab__ai_consensus({
    question: 'Migrate from Express to Fastify for 2x performance gain?',
    options:
      'Migrate now (2 weeks effort), Optimize Express (1 week), Defer (no cost)',
  });
```

**Cost-Benefit:** $50 in API calls to avoid wrong architecture decision is a
bargain.

### Strategy 3: Hybrid Workflows

**Rule:** Combine free (exploration) + paid (validation)

```typescript
// Phase 1: Brainstorm with free Gemini
const ideas =
  (await mcp__multi) -
  ai -
  collab__ask_gemini({
    prompt: '10 ways to optimize ReserveEngine performance',
  });

// Phase 2: Deep analysis of top idea with paid OpenAI
const analysis =
  (await mcp__multi) -
  ai -
  collab__openai_think_deep({
    topic: ideas[0], // Top idea from Gemini
    context:
      'VC fund modeling constraints: accuracy > speed, no breaking changes',
  });
```

### Strategy 4: Batch Related Questions

**Rule:** Combine related questions into single prompt to reduce API calls

```typescript
// Inefficient: 3 separate calls
(await mcp__multi) - ai - collab__ask_gemini({ prompt: 'Explain hurdle rate' });
(await mcp__multi) -
  ai -
  collab__ask_gemini({ prompt: 'Explain catchup clause' });
(await mcp__multi) -
  ai -
  collab__ask_gemini({ prompt: 'Explain carry vesting' });

// Efficient: 1 combined call
(await mcp__multi) -
  ai -
  collab__ask_gemini({
    prompt: `Explain these waterfall concepts:
  1. Hurdle rate
  2. Catchup clause
  3. Carry vesting

  Provide concise explanation for each (2-3 sentences).`,
  });
```

## Integration with Other Skills

### With Extended Thinking Framework

Use AI model selection BEFORE launching extended thinking:

```xml
<research_thinking>
  <initial_analysis>
    Task: Audit waterfall calculation implementation
    Complexity: 6 (moderate-high)

    AI Routing Decision:
    - Code review → Gemini (security focus, free)
    - Alternative approaches → Grok (creative, paid)
    - Deep analysis → OpenAI (reasoning, paid)
  </initial_analysis>

  <strategy>
    1. Gemini code review for technical accuracy (free)
    2. Grok brainstorm for creative alternatives (if issues found)
    3. OpenAI think deep for complex edge cases (if needed)
    4. Pattern recognition to synthesize findings
  </strategy>
</research_thinking>
```

### With Continuous Improvement

Track which AI models were most effective:

```markdown
## Reflection: Monte Carlo Optimization

What Worked Well?

- DeepSeek correctly identified O(n²) algorithm (saved 2 hours of manual
  debugging)
- Gemini validated fix for free (cost savings)

What Was Inefficient?

- Used OpenAI for simple validation (should have used Gemini)
- Missed opportunity to batch related questions

Next Time?

- Use complexity threshold strictly (< 5 → Gemini)
- Batch related questions into single prompt
- Track AI model effectiveness by task type
```

## Best Practices

### 1. Start Conservative, Escalate as Needed

```typescript
// Conservative: Try free Gemini first
const response = await ask_gemini(question);

// Escalate: If insufficient, use paid model
if (!response.sufficient) {
  return await openai_think_deep(question);
}
```

### 2. Use Temperature Appropriately

```typescript
// Factual/debugging: Low temperature (0.2-0.3)
ask_gemini({ prompt: 'Debug this calculation', temperature: 0.2 });

// Creative/brainstorming: High temperature (0.7-0.9)
grok_brainstorm({ challenge: 'Alternative approaches', temperature: 0.8 });
```

### 3. Combine Models for Validation

```typescript
// Get answer from one model
const answer = await ask_gemini(question);

// Validate with different model
const validation = await ask_openai(`Validate this answer: ${answer}`);

// Consensus if disagreement
if (answer !== validation) {
  const consensus = await ai_consensus({
    question,
    options: `${answer}, ${validation}`,
  });
}
```

## Integration with Other Skills

- Use with **extended-thinking-framework** to plan AI routing strategy
- Combine with **continuous-improvement** to track model effectiveness
- Leverage **pattern-recognition** to identify AI model strengths
- Use with **dispatching-parallel-agents** for model-specific routing
- Integrate with **inversion-thinking** to identify wrong model choices
