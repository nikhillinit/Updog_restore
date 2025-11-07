# Memory Management

## Overview

Keep structured notes during research and development sessions to maintain
context and build institutional knowledge.

## When to Use

- During exploratory research or codebase investigation
- When working on complex features spanning multiple sessions
- To track decisions, findings, and credibility of sources
- Building long-term project knowledge

## Components

### 1. Context Maintenance

Store session objectives, findings, and credibility tracking:

```markdown
## Session Context: [Date/Topic]

**Objective**: Implement European waterfall support

**Key Findings**:

- Existing helper in waterfall.ts (high confidence - verified in code)
- Schema validation prevents invalid states (high confidence - tested)
- Some components bypass helpers (medium confidence - observed in 3 files)

**Credibility Tracker**:

- ✓ waterfall.ts - Primary source, well-tested
- ✓ waterfall.test.ts - 19 test cases, comprehensive
- ⚠ Component usage - Observed pattern, not exhaustive search
```

### 2. Information Organization

Group findings by topic, time, and certainty:

**By Topic**:

```
Waterfall Implementation/
├── Core Logic (waterfall.ts)
├── Validation (Zod schemas)
├── Component Integration
└── Test Coverage
```

**By Certainty**:

- **High**: Verified in code/tests/documentation
- **Medium**: Observed pattern, not exhaustive
- **Low**: Assumption needs validation
- **Unknown**: Requires investigation

**By Time**:

- **Current Session**: Active work
- **Recent**: Last 7 days
- **Historical**: CHANGELOG.md entries

### 3. Cross-Referencing

Link supporting and contradicting information:

```markdown
## Finding: Waterfall helpers prevent type errors

**Supporting Evidence**:

- [waterfall.ts:45-67](client/src/lib/waterfall.ts#L45-L67) - Type guards
- [waterfall.test.ts](client/src/lib/__tests__/waterfall.test.ts) - Test
  coverage
- CHANGELOG.md entry: 2025-10-15 "Centralized waterfall pattern"

**Contradicting Evidence**:

- Some components still use direct mutation (needs migration)

**Related Findings**:

- Zod schema validation provides runtime safety
- applyWaterfallChange() uses immutable updates
```

## Integration with Project Memory Systems

### CHANGELOG.md

Use `/log-change` to persist important changes:

```bash
/log-change "Implemented European waterfall support using centralized helpers"
```

### DECISIONS.md

Use `/log-decision` for architectural choices:

```bash
/log-decision "Use discriminated unions for waterfall types to ensure type safety"
```

### Cheatsheets

Use `/create-cheatsheet` for reusable knowledge:

```bash
/create-cheatsheet waterfall-patterns
```

### .claude/skills/

Create custom skills for domain-specific workflows (like this file!)

## Memory Formats

### Session Notes Template

```markdown
# Session: [Topic] - [Date]

## Objective

[What you're trying to accomplish]

## Context

[Relevant background, previous work, constraints]

## Findings

### Confirmed (High Confidence)

- [Finding with source link]

### Probable (Medium Confidence)

- [Pattern observed, needs validation]

### Uncertain (Low Confidence)

- [Assumption or hypothesis]

## Decisions

- [Decision with rationale]

## Next Steps

- [ ] [Action item with owner/timeline]

## Cross-References

- Related: [link to related session/doc]
- See also: [relevant files/patterns]
```

### Knowledge Graph Format

Track relationships between concepts:

```
ReserveEngine
├── Uses: Zod validation
├── Called by: API routes, worker jobs
├── Depends on: Portfolio data, graduation rates
├── Related to: PacingEngine (similar pattern)
└── Documented in: cheatsheets/reserve-calculations.md
```

## Example: Research Session

**Task**: Understand how Monte Carlo simulations work

```markdown
# Session: Monte Carlo Implementation - 2025-11-06

## Objective

Understand Monte Carlo simulation architecture for potential optimization

## Findings

### Confirmed (High Confidence)

- Monte Carlo jobs use BullMQ workers
  - Source: server/routes/funds.ts:234
  - 30-second timeout configured
  - Redis-backed queue

- Simulations are CPU-intensive
  - Source: tests/integration/monte-carlo-2025-market-validation.spec.ts
  - 10,000 iterations per run
  - Observed: 15-45 second execution time

### Probable (Medium Confidence)

- Results may be cacheable
  - Pattern: Similar calculations repeated
  - Evidence: Same fund configurations run multiple times
  - Needs: Cache invalidation strategy

### Uncertain (Low Confidence)

- Could parallelize across multiple workers
  - Hypothesis: Split 10k iterations into chunks
  - Risk: Increased Redis memory usage
  - Needs: Load testing to validate

## Decisions

- Focus on caching before parallelization
- Use Redis for cache storage (consistent with architecture)
- Implement cache invalidation on fund config changes

## Next Steps

- [ ] Review existing caching patterns in codebase
- [ ] Design cache key structure
- [ ] Implement with feature flag

## Cross-References

- Related: server/cache/index.ts (caching infrastructure)
- See also: DECISIONS.md (caching strategy)
- Pattern: BullMQ worker pattern used elsewhere
```

## Integration with Second Brain

For personal knowledge management, integrate with tools like:

- **Obsidian**: Markdown-based notes with bidirectional links
- **Notion**: Structured databases and wikis
- **Logseq**: Outliner-based knowledge graph

Export structured findings to your Second Brain tool for long-term retention.

## Integration with Extended Thinking Framework

Use memory-management to populate extended thinking templates:

```xml
<research_thinking>
  <initial_analysis>
    [Context from memory: objectives, prior findings]
  </initial_analysis>
  <strategy>
    [Informed by credibility tracker and cross-references]
  </strategy>
  <execution_notes>
    [Track new findings with certainty levels]
  </execution_notes>
  <synthesis>
    [Cross-reference findings with existing knowledge]
  </synthesis>
  <quality_check>
    [Validate against memory of similar work]
  </quality_check>
</research_thinking>
```

## Integration with Other Skills

- Use with **pattern-recognition** to track recurring themes
- Combine with **continuous-improvement** for retrospectives
- Leverage with **systematic-debugging** to track bug investigation
- Integrate with **extended-thinking-framework** for complex tasks
