---
status: ACTIVE
last_updated: 2026-01-19
---

# Brainstorming

## Overview

Transform rough ideas into fully-formed designs through structured questioning
and alternative exploration.

## Core Principle

**Ask questions to understand, explore alternatives, present design
incrementally for validation.**

## Announce at Start

**"I'm using the brainstorming skill to refine your idea into a design."**

## Quick Reference

| Phase                       | Key Activities                   | Tool Usage                               | Output                               |
| --------------------------- | -------------------------------- | ---------------------------------------- | ------------------------------------ |
| **1. Understanding**        | Ask questions (one at a time)    | AskUserQuestion for choices              | Purpose, constraints, criteria       |
| **2. Exploration**          | Propose 2-3 approaches           | AskUserQuestion for approach selection   | Architecture options with trade-offs |
| **3. Design Presentation**  | Present in 200-300 word sections | Open-ended questions                     | Complete design with validation      |
| **3.5. Design Refinement**  | Critique & multi-AI validation   | extended-thinking, multi-ai-collab tools | Refined, validated design            |
| **4. Design Documentation** | Write design document            | writing-clearly-and-concisely skill      | Design doc in docs/plans/            |
| **5. Worktree Setup**       | Set up isolated workspace        | using-git-worktrees skill                | Ready development environment        |
| **6. Planning Handoff**     | Create implementation plan       | writing-plans skill                      | Detailed task breakdown              |

## The Process

### Phase 1: Understanding

**Goal**: Clarify the idea and gather requirements

#### Check Current State

Before asking questions, understand the project:

```bash
# Check recent changes
git log --oneline --since="1 week ago"

# Review relevant files
ls -la client/src/core/
ls -la server/routes/
```

#### Ask ONE Question at a Time

Don't overwhelm with multiple questions. Single focus per message.

**Example**:

```
User: "I want to add caching to Monte Carlo simulations"

You: "I'm using the brainstorming skill to refine your idea into a design.

First, let me understand the performance issue. [Use AskUserQuestion]"

Options:
1. Monte Carlo takes too long (>30 seconds per run)
2. Too many redundant calculations (same config run multiple times)
3. Redis is underutilized (want to leverage existing infrastructure)
4. Other reason

Which best describes the motivation?
```

#### Use AskUserQuestion Tool for Choices

When you have multiple-choice options (2-4 clear alternatives):

```typescript
AskUserQuestion({
  question: "What's the primary caching goal?",
  options: [
    'Speed up individual runs (optimization)',
    'Avoid redundant calculations (deduplication)',
    'Reduce server load (resource management)',
  ],
});
```

#### Gather Key Information

- **Purpose**: Why are we building this?
- **Constraints**: Time, technical, budget limitations
- **Success criteria**: How will we know it works?
- **Existing patterns**: What similar things exist in codebase?

### Phase 2: Exploration

**Goal**: Propose multiple approaches with trade-offs

#### Propose 2-3 Different Approaches

Never settle on first idea. Explore alternatives.

**Example**:

```markdown
I see three potential approaches for Monte Carlo caching:

## Approach 1: Function-Level Memoization

**Architecture**: Use memoization within the calculation function to cache
results for identical inputs.

**Pros**:

- Simple to implement (library like memoizee)
- No external dependencies
- Works in-process

**Cons**:

- Cache doesn't persist across server restarts
- Limited to single worker process
- Memory pressure on large result sets

**Complexity**: Low (1-2 hours)

---

## Approach 2: Redis-Backed Caching

**Architecture**: Cache results in Redis with TTL, keyed by config hash.

**Pros**:

- Persists across restarts
- Shared across worker processes
- Redis already in infrastructure
- TTL handles invalidation

**Cons**:

- Network overhead (Redis round trip)
- Requires cache key design
- Need invalidation strategy

**Complexity**: Medium (4-6 hours)

---

## Approach 3: Hybrid (Memoization + Redis)

**Architecture**: Two-tier cache - in-memory L1, Redis L2.

**Pros**:

- Fast for repeated queries (L1 hit)
- Shared across workers (L2)
- Graceful degradation if Redis down

**Cons**:

- Most complex to implement
- Cache coherence challenges
- Higher maintenance burden

**Complexity**: High (8-12 hours)

---

[Use AskUserQuestion] Which approach resonates with your priorities?
```

#### Use AskUserQuestion for Approach Selection

Present approaches as structured options:

```typescript
AskUserQuestion({
  question: 'Which caching approach fits best?',
  options: [
    'Approach 1: Function memoization (simple, in-process)',
    'Approach 2: Redis caching (persistent, shared)',
    'Approach 3: Hybrid (complex, best performance)',
  ],
});
```

### Phase 3: Design Presentation

**Goal**: Present complete design in digestible sections

#### Present in 200-300 Word Sections

Don't dump entire design at once. Build incrementally.

**Example**:

```markdown
Great! Let's design the Redis-backed caching approach.

## Architecture Overview

The caching layer will intercept Monte Carlo job execution in the BullMQ worker.
Before running the simulation, we'll generate a cache key from the config (using
stable serialization and MD5 hash), check Redis for existing results, and return
cached data if found. On cache miss, we'll run the simulation and store results
with a configurable TTL.

Key components:

1. **Cache key generator** - Deterministic hashing of config
2. **Cache get/set operations** - Redis interface with error handling
3. **Worker integration** - Check cache before simulation
4. **Invalidation strategy** - TTL-based with manual flush option

This approach leverages existing Redis infrastructure and BullMQ worker pattern.
Cache hits will bypass the 15-45 second simulation time entirely.

**Does this architecture look right so far?**
```

#### Ask After Each Section (Open-Ended)

Don't use AskUserQuestion here - allow detailed feedback:

```
Does this look right so far?
Any concerns about this approach?
Should we add anything to this section?
```

#### Cover These Areas (Incrementally)

1. **Architecture overview** - High-level structure
2. **Components** - What are the pieces?
3. **Data flow** - How does data move through system?
4. **Error handling** - What could go wrong and how to handle?
5. **Testing strategy** - How to verify it works?
6. **Integration points** - Where does this touch existing code?

**Example Flow**:

```
You present: Architecture overview
User validates: "Looks good"

You present: Component details (cache key generator)
User validates: "Make sure it handles nested objects"

You present: Updated component details with stable serialization
User validates: "Perfect"

[Continue until design complete]
```

### Phase 3.5: Design Refinement (Optional)

**Goal**: Validate and refine design through structured critique and
multi-perspective analysis

#### When to Use

Use this refinement phase for:

- Complex features with multiple stakeholders
- High-stakes architectural decisions
- Unclear trade-offs requiring deeper analysis
- Designs that benefit from diverse AI perspectives
- Documents requiring quality validation before finalization

#### Refinement Process

**Step 1: Generate Structured Critique**

Use **extended-thinking-framework** to analyze the design:

```markdown
Let me apply structured critique to this design...

**Strengths**: [What works well] **Weaknesses**: [Potential issues or gaps]
**Risks**: [What could go wrong] **Alternatives**: [Other approaches to
consider] **Missing Context**: [What's not addressed]
```

**Step 2: Multi-AI Validation (When Available)**

Leverage **multi-ai-collab MCP tools** for diverse perspectives:

```typescript
// Get multiple AI perspectives on the design
ask_all_ais({
  prompt:
    'Review this caching design for Monte Carlo simulations. Focus on: architecture soundness, edge cases, performance implications, and maintainability.',
  temperature: 0.7,
});
```

**When to use each tool**:

- **ask_all_ais**: Get diverse perspectives on design approach or architecture
- **ai_debate**: Explore trade-offs between 2-3 specific architectural choices
- **ai_consensus**: Validate critical design decisions with multiple models
- **gemini_brainstorm** / **openai_brainstorm**: Generate creative alternatives

**Step 3: Debate Trade-Offs**

For critical decisions with unclear trade-offs:

```typescript
ai_debate({
  topic:
    'Redis-backed caching vs. Hybrid (memoization + Redis) for Monte Carlo simulations',
  ai1: 'gemini', // Argues for simplicity
  ai2: 'openai', // Argues for performance
});
```

**Step 4: Consensus on Critical Decisions**

For high-stakes choices:

```typescript
ai_consensus({
  question:
    'Should we implement European waterfall as discriminated union extension or separate class?',
  options:
    'Option 1: Discriminated union (type-safe, follows patterns)\nOption 2: Separate class (clean separation, easier testing)',
});
```

**Step 5: Update Design Based on Feedback**

Synthesize insights and revise design:

```markdown
Based on multi-AI feedback:

**Changes Made**:

- Added cache stampede mitigation (jitter to TTL)
- Clarified error handling for Redis connection failures
- Added monitoring metrics for cache hit rate

**Issues Addressed**:

- Risk of stale data → Documented TTL tuning strategy
- Memory pressure → Added eviction policy recommendation
```

**Step 6: Re-Validate**

Present revised design to user:

```markdown
I've refined the design based on structured critique and multi-AI validation.
Key improvements:

1. [Improvement 1]
2. [Improvement 2]
3. [Improvement 3]

**Does this revised design address your concerns?**
```

#### Example: Refining Handoff Memo

**Scenario**: Refining test remediation handoff memo

**Step 1: Structured Critique**

```markdown
Analyzing handoff memo structure...

**Strengths**:

- Comprehensive accomplishments documented
- Clear test baseline metrics
- Good code references with line numbers

**Weaknesses**:

- Critical blocker buried at bottom (seed script bugs)
- Priorities misaligned with blockers
- Missing risk assessment
- No rollback procedures

**Risks**:

- LP tests cannot run until seed script fixed (1-2 hour delay minimum)
- Feature test assumptions not verified (61 tests assumed new features)
- No contingency if seed fix takes longer than expected

**Missing Context**:

- Success criteria for LP security tests
- Decision criteria for feature deployment
- Rollback plan if changes break tests
```

**Step 2: Multi-AI Perspective** (if MCP available)

```typescript
ask_all_ais({
  prompt:
    'Review this test remediation handoff memo. Assess: document structure, prioritization accuracy, missing risks, and actionability of next steps.',
});
```

**Step 3: Apply Refinements**

Based on critique:

- Move CRITICAL BLOCKER to top
- Reorder priorities: Fix seed script → Quick wins → LP tests
- Add risk matrix
- Define clear success criteria
- Add rollback procedures

#### Integration with Multi-AI Collaboration

**When to Use Multi-AI Tools in Design Workflow**:

| Scenario                        | Tool                | Purpose                            |
| ------------------------------- | ------------------- | ---------------------------------- |
| Get diverse design perspectives | ask_all_ais         | Compare approaches across models   |
| Debate architecture trade-offs  | ai_debate           | Explore pros/cons with opposition  |
| Validate critical decisions     | ai_consensus        | Ensure alignment on key choices    |
| Generate creative alternatives  | gemini_brainstorm   | Explore novel approaches           |
| Deep technical analysis         | gemini_think_deep   | Extended reasoning on complexity   |
| Code-specific review            | gemini_code_review  | Security, performance, readability |
| Architecture design validation  | gemini_architecture | System design soundness            |
| Debugging complex issues        | openai_debug        | Error analysis and resolution      |
| Get OpenAI perspective          | openai_think_deep   | Alternative deep analysis          |
| Collaborative problem-solving   | collaborative_solve | Multi-AI approach to complex issue |

**Example Workflow: Caching Design Refinement**

```markdown
1. **Initial Design** (Phase 3) Present: Redis-backed caching architecture User:
   "Looks good, but worried about edge cases"

2. **Refinement** (Phase 3.5) Action: Generate structured critique Result:
   Identified cache stampede risk, stale data concerns

3. **Multi-AI Validation** Tool: ask_all_ais Prompt: "Review Redis caching
   design for edge cases and risks" Result: All models recommend TTL jitter,
   monitoring metrics

4. **Trade-off Debate** Tool: ai_debate (gemini vs openai) Topic: "Simple Redis
   vs Hybrid caching approach" Result: Consensus on simple Redis for v1, hybrid
   for v2 if needed

5. **Final Validation** Present: Revised design with improvements User:
   "Perfect, addresses all concerns"

6. **Proceed** → Phase 4 (Documentation)
```

#### When to Skip Refinement

**Skip Phase 3.5 if**:

- Design is straightforward and user already validated
- No complex trade-offs or high-stakes decisions
- Time-sensitive implementation
- Incremental changes to existing patterns

**Use Phase 3.5 when**:

- Complex architectural changes
- Multiple valid approaches with unclear winner
- High-stakes features (security, data integrity, financial calculations)
- User expresses uncertainty or concerns
- Design documents need quality validation

### Phase 4: Design Documentation

**Goal**: Create written design document for reference

After design is validated in Phase 3:

```markdown
**I'm using the writing-clearly-and-concisely skill to document this design.**

[Create comprehensive design document]

**Saving to**: `docs/plans/2025-11-06-monte-carlo-caching-design.md`
```

#### Design Document Structure

````markdown
# Monte Carlo Caching Design

**Author**: Claude **Date**: 2025-11-06 **Status**: Approved

## Problem Statement

[What problem does this solve?]

## Goals

- [Primary goal]
- [Secondary goals]

## Non-Goals

- [Explicitly out of scope]

## Architecture

### Overview

[High-level description with diagram if helpful]

### Components

#### Component 1: Cache Key Generator

**Responsibility**: Create deterministic hash from config **Interface**:

```typescript
function generateCacheKey(config: MonteCarloConfig): string;
```
````

**Implementation**: Use stable-stringify + MD5 hash

[Continue for each component...]

### Data Flow

1. Worker receives Monte Carlo job
2. Generate cache key from config
3. Check Redis for key
4. If hit: Return cached result
5. If miss: Run simulation, cache result, return

### Error Handling

- Redis connection failure → Log error, run simulation (degrade gracefully)
- Cache deserialization error → Log error, invalidate key, run simulation
- TTL expiration → Normal cache miss behavior

## Testing Strategy

- Unit tests for cache key generation (consistency)
- Integration tests for get/set operations (Redis)
- E2E tests for worker with cache hits/misses

## Rollout Plan

1. Implement behind feature flag
2. Test with subset of users
3. Monitor cache hit rate and performance
4. Roll out to all users

## Risks & Mitigations

| Risk           | Likelihood | Impact | Mitigation                         |
| -------------- | ---------- | ------ | ---------------------------------- |
| Cache stampede | Medium     | High   | Add jitter to TTL                  |
| Stale results  | Low        | Medium | Document TTL tuning                |
| Redis memory   | Low        | High   | Monitor usage, set eviction policy |

## Alternatives Considered

- Function memoization (rejected: doesn't scale across workers)
- Hybrid approach (rejected: too complex for initial implementation)

## Open Questions

- [ ] What TTL duration? (Suggest: 1 hour)
- [ ] Manual cache invalidation API needed?

````

#### Commit Design Document
```bash
git add docs/plans/2025-11-06-monte-carlo-caching-design.md
git commit -m "docs: add Monte Carlo caching design document"
````

### Phase 5: Worktree Setup (for Implementation)

**Goal**: Create isolated workspace for implementation

```markdown
**I'm using the using-git-worktrees skill to set up an isolated workspace for
this feature.**

[Follow using-git-worktrees skill process]

[Return when worktree is ready]

**Worktree ready at**: `../updog-monte-carlo-caching/`
```

### Phase 6: Planning Handoff

**Goal**: Create detailed implementation plan

Ask user if ready:

```markdown
**Design complete and documented. Ready to create the implementation plan?**

[If yes, use writing-plans skill]
```

Then use **writing-plans** skill:

```markdown
**I'm using the writing-plans skill to create the implementation plan.**

[Follow writing-plans skill process]

**Plan saved to**: `docs/plans/2025-11-06-monte-carlo-caching.md`
```

**Note**: Phases renumbered after Phase 3.5 addition. Original Phase 4-6 are now
Phase 5-7 in the process flow, but retain original numbering in headers for
backward compatibility.

## When to Use AskUserQuestion Tool

### Use For:

- **Phase 1 clarifying questions** with 2-4 clear options
- **Phase 2 architectural approach selection** (2-3 alternatives)
- Any decision with **distinct, mutually exclusive choices**
- When options have **clear trade-offs** to present

**Example**:

```typescript
AskUserQuestion({
  question: "What's the priority for this feature?",
  options: [
    'Speed (get it working fast)',
    'Robustness (handle all edge cases)',
    'Performance (optimize for scale)',
  ],
});
```

### Use Open-Ended Questions For:

- **Phase 3 design validation** ("Does this look right?")
- When you need **detailed feedback**
- When structured options would **limit creative input**
- Gathering requirements that aren't multiple-choice

**Example**:

```
"Does this error handling strategy address your concerns?"
"Any edge cases I'm missing in this data flow?"
"What else should be included in the testing strategy?"
```

## Key Principles

### One Question at a Time (Phase 1)

**Bad**: "What's the goal? What are the constraints? How much time do you have?
What's your budget?"

**Good**: "What's the primary goal for this feature?" [Wait for answer, then ask
next]

### Explore Alternatives (Phase 2)

**Bad**: "Here's how we'll implement it: [single approach]"

**Good**: "I see three approaches: [A, B, C with trade-offs]. Which resonates?"

### YAGNI Ruthlessly

**Bad**: "Let's add analytics, A/B testing, and multi-region support"

**Good**: "For v1, focus on core caching. Analytics can be added later if
needed."

### Incremental Validation (Phase 3)

**Bad**: [Dumps 2000-word design in one message]

**Good**: [Presents 200-300 word sections, validates each before continuing]

### Flexible Progression

If user feedback reveals misunderstanding:

```
User: "Actually, I don't need caching for performance. I need it to reduce API costs."

You: "Ah! That changes the approach. Let me revise..."
[Go back to Phase 2 with new understanding]
```

## Integration with VC Fund Modeling Context

### Example: Brainstorming European Waterfall Support

**Phase 1: Understanding**

```
User: "I want to add European waterfalls"

You: "I'm using the brainstorming skill to refine your idea into a design.

First, let me understand the scope. [AskUserQuestion]"

Options:
1. Add as separate calculation option alongside AMERICAN
2. Replace AMERICAN with EUROPEAN
3. Support both with runtime switching

Which best describes your vision?
```

**Phase 2: Exploration**

```markdown
I see two main approaches for adding European waterfall support:

## Approach 1: Discriminated Union Extension

**Architecture**: Extend existing Waterfall type with EUROPEAN variant, use type
guards for type-specific logic.

**Pros**:

- Leverages existing discriminated union pattern
- Type-safe with TypeScript
- Natural fit for applyWaterfallChange() helper

**Cons**:

- Need to update all waterfall consumers
- More complex type narrowing

**Complexity**: Medium (6-8 hours)

---

## Approach 2: Separate Implementation

**Architecture**: Create EuropeanWaterfall class alongside existing
AmericanWaterfall.

**Pros**:

- Clean separation of concerns
- Easier to test independently

**Cons**:

- Duplicates validation logic
- Harder to switch types at runtime
- Doesn't match existing patterns

**Complexity**: Medium (6-8 hours)

---

[AskUserQuestion] Which approach aligns better with the codebase architecture?
```

**Phase 3: Design Presentation**

````markdown
Great! Let's design the discriminated union extension.

## Type System Changes

We'll extend the Waterfall type from a single AMERICAN type to a discriminated
union supporting both AMERICAN and EUROPEAN:

```typescript
type Waterfall =
  | {
      type: 'AMERICAN';
      hurdle: number;
      catchUp: number;
      carryVestingMonths: number;
    }
  | {
      type: 'EUROPEAN';
      hurdle: number;
      carryVestingMonths: number;
    };
```
````

Key difference: EUROPEAN doesn't have catchUp property. This is enforced at
compile time via discriminated union.

The existing applyWaterfallChange() helper will be overloaded to handle both
types safely with type-specific signatures.

**Does this type structure look right so far?**

````

**Phase 4: Documentation**
```markdown
**I'm using the writing-clearly-and-concisely skill to document this design.**

[Create docs/plans/2025-11-06-european-waterfall-design.md]
````

**Phase 5: Worktree Setup**

```markdown
**I'm using the using-git-worktrees skill to set up an isolated workspace.**

[Create worktree: ../updog-european-waterfall/]
```

**Phase 6: Planning**

```markdown
**Ready to create the implementation plan?**

[If yes] **I'm using the writing-plans skill.**

[Create docs/plans/2025-11-06-european-waterfall.md]
```

## Checklist

### Phase 1: Understanding

- [ ] Checked current project state
- [ ] Asked clarifying questions one at a time
- [ ] Used AskUserQuestion for multiple-choice decisions
- [ ] Gathered: purpose, constraints, success criteria

### Phase 2: Exploration

- [ ] Proposed 2-3 different approaches
- [ ] Included trade-offs for each approach
- [ ] Estimated complexity for each
- [ ] Used AskUserQuestion for approach selection

### Phase 3: Design Presentation

- [ ] Presented in 200-300 word sections
- [ ] Validated each section before continuing
- [ ] Covered: architecture, components, data flow, errors, testing
- [ ] Used open-ended questions for validation

### Phase 3.5: Design Refinement (Optional)

- [ ] Generated structured critique (strengths, weaknesses, risks, missing
      context)
- [ ] Applied extended-thinking-framework for deep analysis
- [ ] Used multi-AI tools for validation (if appropriate)
  - [ ] ask_all_ais for diverse perspectives
  - [ ] ai_debate for trade-off exploration
  - [ ] ai_consensus for critical decisions
- [ ] Synthesized feedback and updated design
- [ ] Re-validated with user

### Phase 4: Documentation

- [ ] Used writing-clearly-and-concisely skill
- [ ] Saved to docs/plans/YYYY-MM-DD-<topic>-design.md
- [ ] Committed design document

### Phase 5: Worktree (if implementing)

- [ ] Used using-git-worktrees skill
- [ ] Returned when worktree ready

### Phase 6: Planning

- [ ] Asked if user ready for implementation plan
- [ ] Used writing-plans skill
- [ ] Created detailed task breakdown

## Integration with Other Skills

### With Writing Plans

Brainstorming → Design → Implementation Plan

```
1. brainstorming skill → Create design
2. Save design document
3. writing-plans skill → Create implementation plan
4. Execute plan
```

### With Memory Management

Track design decisions:

```markdown
## Design Session: Monte Carlo Caching

**Date**: 2025-11-06

**Key Decisions**:

- Redis-backed caching (HIGH confidence - fits infrastructure)
- TTL-based invalidation (MEDIUM confidence - may need tuning)
- Feature flag rollout (HIGH confidence - standard practice)

**Alternatives Rejected**:

- Function memoization (doesn't scale across workers)
- Hybrid approach (too complex for v1)

**Open Questions**:

- TTL duration (suggested 1 hour, needs validation)
```

### With Pattern Recognition

Identify existing patterns to follow:

```markdown
During brainstorming, use pattern-recognition to find:

- Similar caching patterns in codebase
- Existing BullMQ worker patterns
- Validation patterns to reuse
```

### With Continuous Improvement

After design session:

```markdown
What worked well?

- Incremental validation caught misunderstanding early
- Exploring alternatives revealed simpler approach

What was inefficient?

- Should have checked existing patterns earlier
- Jumped to implementation too quickly (should have documented first)

Next time:

- Use pattern-recognition before proposing approaches
- Always document design before implementation
```

## Summary

**Seven Phases** (3.5 is optional):

1. Understanding - Ask questions one at a time (AskUserQuestion for choices)
2. Exploration - Propose 2-3 approaches with trade-offs
3. Design Presentation - Present incrementally, validate each section
4. **3.5. Design Refinement** - Structured critique + multi-AI validation
   (optional)
5. Documentation - Write design doc (writing-clearly-and-concisely)
6. Worktree Setup - Isolated workspace (using-git-worktrees)
7. Planning - Implementation plan (writing-plans)

**Tool Usage**:

- AskUserQuestion: Phase 1 choices, Phase 2 approach selection
- Open-ended: Phase 3 validation, detailed feedback
- Multi-AI tools: Phase 3.5 refinement (ask_all_ais, ai_debate, ai_consensus)
- Extended thinking: Phase 3.5 critique generation

**Key Principles**: One question at a time, explore alternatives, YAGNI,
incremental validation, structured refinement for complex decisions

---

_Last Updated: 2025-11-07_ _Version: 3.5 (multi-AI refinement phase added)_
