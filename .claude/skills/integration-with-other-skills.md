# Integration with Other Skills

## Overview

Coordinate research methods and thinking frameworks with complementary Claude
Code tools and skills to maximize effectiveness.

## When to Use

- Working on complex tasks requiring multiple perspectives
- Need cross-validation or redundancy reduction
- Combining multiple data sources or tools
- Building comprehensive solutions

## Core Integrations

### 1. MCP Servers → External Data Access

**Available MCP Tools**:

- `multi-ai-collab` - Gemini, OpenAI, Grok, DeepSeek collaboration

**Use Cases**:

```
Task: Code review requiring multiple perspectives
→ Use multi-ai-collab for consensus opinion
→ Combine with pattern-recognition to identify common themes
→ Use continuous-improvement to track which AI insights were most valuable
```

**Example**:

```typescript
// Get multiple AI perspectives on architecture
mcp__multi -
  ai -
  collab__ai_consensus({
    question: 'Should we use BullMQ or implement custom worker queue?',
    options: 'BullMQ (battle-tested), Custom (full control)',
  });

// Use pattern-recognition to synthesize responses
// Use memory-management to track decision rationale
```

### 2. Project Tools → Task Execution

**Available Tools**:

- `/test-smart` - Intelligent test selection
- `/fix-auto` - Automated repair
- `/deploy-check` - Pre-deployment validation
- `/perf-guard` - Performance regression detection

**Use Cases**:

```
Task: Implement new feature with quality gates
→ Use inversion-thinking to identify failure modes
→ Implement feature
→ Use /test-smart for fast feedback
→ Use /fix-auto for lint/format issues
→ Use /deploy-check before merging
→ Use continuous-improvement to reflect on workflow
```

**Example Workflow**:

1. **Plan**: Use `inversion-thinking` - "What would make this feature terrible?"
2. **Design**: Use `analogical-thinking` - "This is like X pattern in our
   codebase"
3. **Implement**: Write code
4. **Test**: `/test-smart` for affected tests only
5. **Fix**: `/fix-auto` for automated repairs
6. **Validate**: `/deploy-check` for comprehensive checks
7. **Reflect**: `continuous-improvement` - "What worked? What didn't?"

### 3. Memory Systems → Knowledge Persistence

**Available Memory Tools**:

- `/log-change` - Update CHANGELOG.md
- `/log-decision` - Update DECISIONS.md
- `/create-cheatsheet` - New documentation
- `memory-management` skill (this system)

**Use Cases**:

```
Task: Research unfamiliar pattern in codebase
→ Use pattern-recognition to analyze code
→ Use memory-management to track findings
→ Use /create-cheatsheet to document pattern
→ Use /log-decision if pattern becomes convention
```

**Example**:

```bash
# During investigation (memory-management)
# Track findings in session notes with confidence levels

# After validation (project memory)
/create-cheatsheet waterfall-calculation-patterns

# Document architectural choice (decisions)
/log-decision "Use centralized waterfall helpers to prevent type confusion"

# Track implementation (changelog)
/log-change "Migrated all waterfall calculations to use applyWaterfallChange helper"
```

### 4. Thinking Frameworks → Complementary Skills

**Skill Combinations**:

| Primary Skill          | Complement With          | Purpose                  |
| ---------------------- | ------------------------ | ------------------------ |
| `inversion-thinking`   | `pattern-recognition`    | Identify anti-patterns   |
| `analogical-thinking`  | `memory-management`      | Track analogy validity   |
| `pattern-recognition`  | `continuous-improvement` | Refine pattern detection |
| `systematic-debugging` | `root-cause-tracing`     | Deep bug investigation   |
| `writing-plans`        | `inversion-thinking`     | Identify plan pitfalls   |

**Example: Debugging Workflow**:

```
1. Use systematic-debugging to structure investigation
2. Use pattern-recognition to identify similar bugs
3. Use root-cause-tracing for deep call stack analysis
4. Use memory-management to track investigation findings
5. Use continuous-improvement to prevent recurrence
```

## Multi-AI Collaboration Patterns

### Pattern 1: Consensus Building

```
Use Case: Architecture decision with multiple valid approaches

Workflow:
1. Use inversion-thinking to identify pitfalls of each approach
2. Use mcp__multi-ai-collab__ai_consensus for multi-AI perspective
3. Use pattern-recognition to identify common themes in responses
4. Use memory-management to track decision rationale
5. Use /log-decision to persist architectural choice
```

### Pattern 2: Code Review

```
Use Case: Complex code requiring security, performance, and readability review

Workflow:
1. Use mcp__multi-ai-collab__gemini_code_review (security focus)
2. Use mcp__multi-ai-collab__openai_code_review (readability focus)
3. Use pattern-recognition to synthesize feedback
4. Use continuous-improvement to track which feedback was most valuable
```

### Pattern 3: Deep Analysis

```
Use Case: Complex technical problem requiring extended reasoning

Workflow:
1. Use extended-thinking-framework to structure analysis
2. Use mcp__multi-ai-collab__gemini_think_deep for one perspective
3. Use mcp__multi-ai-collab__openai_think_deep for alternative perspective
4. Use pattern-recognition to identify convergence/divergence
5. Use memory-management to track insights
```

## Redundancy Reduction Strategies

### Avoid Duplicate Research

```
Before investigating:
1. Check CAPABILITIES.md - existing solutions?
2. Check CHANGELOG.md - similar past work?
3. Check memory-management notes - already researched?
4. Check cheatsheets/ - documented pattern?

Only proceed if truly new investigation
```

### Share Context Efficiently

```
Between skills/tools:
- Use memory-management to build shared context
- Reference previous findings by file/line number
- Link to CHANGELOG.md or DECISIONS.md entries
- Use /create-cheatsheet to make findings reusable
```

## Multi-Perspective Synthesis

### Cross-Validation Pattern

```
Hypothesis: "Caching Monte Carlo results would improve performance"

Validate from multiple angles:
1. Code analysis (pattern-recognition): Look for similar caching patterns
2. Multi-AI perspective (ai_consensus): Get architectural opinions
3. Test evidence (run benchmarks): Measure actual impact
4. Documentation (memory-management): Track assumptions vs reality

Synthesize:
- All perspectives agree → High confidence, proceed
- Perspectives diverge → Medium confidence, prototype first
- Evidence contradicts → Low confidence, investigate further
```

## Example: Complete Integration Workflow

**Task**: Optimize ReserveEngine performance

````markdown
## Session: ReserveEngine Optimization - 2025-11-06

### 1. Inversion Thinking (Planning)

Question: "What would make this optimization terrible?"

- Premature optimization without measurements
- Breaking existing functionality
- Sacrificing code clarity for marginal gains

Action: Measure first, optimize second

### 2. Pattern Recognition (Analysis)

Review existing optimizations:

- Found memoization pattern in PacingEngine
- Found caching pattern in Monte Carlo workers
- No optimization in ReserveEngine yet

Action: Consider both patterns for ReserveEngine

### 3. Multi-AI Collaboration (Validation)

Get consensus on approach:

```typescript
mcp__multi -
  ai -
  collab__ai_consensus({
    question: 'Best optimization for ReserveEngine: memoization or caching?',
    options: 'Memoization (function-level), Caching (Redis-backed)',
  });
```
````

Result: Consensus on memoization for pure calculations, caching for API
responses

### 4. Implementation

- Add memoization to calculation-heavy functions
- Use /test-smart to verify no regressions
- Use /fix-auto for code quality

### 5. Memory Management (Documentation)

Track findings:

- Memoization gave 3x speedup (high confidence - benchmarked)
- Cache hit rate: 67% (medium confidence - 1 week data)
- No regressions in test suite (high confidence - CI passed)

### 6. Project Memory (Persistence)

```bash
/log-change "Optimized ReserveEngine with memoization pattern (3x speedup)"
/log-decision "Use memoization for pure calculation functions, caching for API responses"
/create-cheatsheet performance-optimization-patterns
```

### 7. Continuous Improvement (Reflection)

What worked:

- Measuring first prevented premature optimization
- Multi-AI consensus validated approach early

What to change:

- Should have benchmarked earlier in development
- Consider adding performance regression tests

Next time:

- Add performance benchmarks during initial implementation
- Use /perf-guard to catch regressions in CI

```

## Integration Best Practices

### 1. Choose the Right Tool for the Job
- **Analysis**: pattern-recognition, memory-management
- **Planning**: inversion-thinking, analogical-thinking
- **Execution**: /test-smart, /fix-auto, /deploy-check
- **Validation**: Multi-AI collaboration, systematic-debugging
- **Reflection**: continuous-improvement

### 2. Build Feedback Loops
```

Plan → Execute → Measure → Reflect → Update Memory → Repeat

```

### 3. Layer Skills Strategically
```

Foundation: memory-management (persistent context) Analysis:
pattern-recognition + inversion-thinking Execution: Project tools (/test-smart,
etc.) Validation: Multi-AI collaboration Improvement: continuous-improvement

```

### 4. Reduce Context Switching
Group related activities:
- Batch research with pattern-recognition + memory-management
- Batch implementation with /test-smart + /fix-auto
- Batch documentation with /log-change + /create-cheatsheet

## Integration with Other Skills
- Use with **all skills** - this is the meta-skill for coordination
- Especially powerful with **memory-management** for tracking integration patterns
- Use **continuous-improvement** to refine integration workflows
```
