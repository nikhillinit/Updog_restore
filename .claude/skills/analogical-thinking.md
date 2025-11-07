# Analogical Thinking

## Overview

Use structured analogies ("X is like Y because..., but differs in...") to bridge
concepts and improve understanding.

## When to Use

- Explaining complex domain concepts to stakeholders
- Understanding unfamiliar codebases or patterns
- Designing new features based on existing patterns
- Teaching or documenting architecture

## Steps

### 1. Draft the Analogy

Identify the core similarity between two concepts:

- **ReserveEngine** is like a **budget allocation calculator**
- **PacingEngine** is like a **project timeline optimizer**
- **Waterfall distributions** are like **tax brackets**

### 2. Name the Similarity

Explicitly state what makes the analogy work:

```
ReserveEngine is like a budget allocation calculator because:
- Both allocate limited resources across competing needs
- Both require optimization under constraints
- Both need to handle scenarios and what-if modeling
```

### 3. State Where It Breaks

Critical step - identify where the analogy fails:

```
But it differs in:
- Reserves must account for follow-on round timing uncertainty
- Budget calculators don't need probabilistic modeling (Monte Carlo)
- Venture reserve allocation has domain-specific rules (graduation rates)
```

### 4. Validate with Sources

Check that your analogy aligns with actual implementation:

- Read the code: [ReserveEngine.ts](client/src/core/reserves/ReserveEngine.ts)
- Check documentation: CLAUDE.md, cheatsheets
- Verify with tests: Look at test cases to confirm behavior

### 5. Use in Final Explanation

Incorporate the validated analogy into your communication:

> "Our ReserveEngine works like a budget allocation calculator - it distributes
> limited capital across portfolio companies based on their expected needs.
> However, unlike traditional budgeting, it uses Monte Carlo simulation to
> account for uncertainty in follow-on round timing and amounts."

## Example: VC Fund Modeling Context

**Analogy**: BullMQ workers are like a restaurant kitchen

**Similarity**:

- Both process jobs/orders asynchronously
- Both have queues to manage workload
- Both can scale with multiple workers

**Where It Breaks**:

- Kitchens don't persist state in Redis
- Food orders don't retry on failure
- Restaurant workflow is more linear (order → cook → serve)
- BullMQ supports complex job patterns (delayed, recurring, prioritized)

**Validation**: Check [server/routes/funds.ts](server/routes/funds.ts) to
confirm Monte Carlo jobs use BullMQ queue pattern

## Integration with Other Skills

- Use with **inversion-thinking** to identify bad analogies
- Combine with **pattern-recognition** to find analogous patterns in codebase
- Leverage **evidence-and-confidence** to track analogy validity
