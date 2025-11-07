# Continuous Improvement

## Overview

Self-review process to build adaptive expertise through structured reflection.

## When to Use

- After completing a feature or significant task
- At the end of debugging sessions
- After code reviews or pair programming
- During weekly or sprint retrospectives

## Reflection Prompts

### 1. What Worked Well?

Identify successful patterns and practices:

- Which tools or approaches were most effective?
- What decisions saved time or prevented bugs?
- Which documentation or tests were most helpful?

**Example**:

```
✓ Using /test-smart reduced test execution time by 70%
✓ Waterfall helper functions prevented type errors
✓ Zod validation caught input errors early
```

### 2. What Was Inefficient?

Spot friction points and waste:

- Where did I get stuck or slow down?
- What required multiple attempts or iterations?
- Which processes felt manual or repetitive?

**Example**:

```
⚠ Manually searching for component imports across files
⚠ Re-running full test suite for small changes
⚠ Copy-pasting Zod schemas instead of using shared types
```

### 3. Any Surprising Sources or Insights?

Capture unexpected learning:

- What assumptions were wrong?
- What documentation or code helped unexpectedly?
- What edge cases emerged?

**Example**:

```
💡 Found that ReserveEngine handles European waterfalls differently
💡 Discovered existing applyWaterfallChange() helper (avoided duplication)
💡 BullMQ retries failed jobs automatically (don't need manual retry logic)
```

### 4. How Could Clarity Improve?

Identify communication gaps:

- What should be documented better?
- Where would type definitions help?
- What naming could be clearer?

**Example**:

```
📝 Add JSDoc comments to waterfall helper functions
📝 Create cheatsheet for BullMQ worker patterns
📝 Rename ambiguous variable: 'data' → 'portfolioAllocations'
```

### 5. What Will I Change Next Time?

Commit to concrete improvements:

- What patterns will I adopt?
- What anti-patterns will I avoid?
- What tools or processes will I use?

**Example**:

```
→ Always check CAPABILITIES.md before implementing
→ Use /test-smart for faster feedback loops
→ Create todo list at start of complex tasks
→ Add type guards when working with discriminated unions
```

## Integration with Project Workflow

### Update Project Memory

After reflection, update relevant documentation:

```bash
# Log significant changes
/log-change "Implemented waterfall calculation optimization using helper pattern"

# Document architectural decisions
/log-decision "Use centralized waterfall helpers to prevent type errors"

# Create focused guides
/create-cheatsheet waterfall-patterns
```

### Build Reusable Patterns

Convert learnings into reusable assets:

- Add successful patterns to cheatsheets
- Create slash commands for repetitive workflows
- Update CLAUDE.md with new conventions

## Example Reflection Session

**Task**: Implemented Monte Carlo simulation caching

**What Worked Well?**

- Redis caching pattern from existing code was reusable
- BullMQ queue integration was straightforward
- Zod schemas caught serialization issues early

**What Was Inefficient?**

- Debugged cache invalidation manually (no logging)
- Ran full test suite multiple times (missed /test-smart)

**Surprising Insights?**

- Monte Carlo jobs can timeout under high load
- Cache keys need tenant isolation (multi-tenancy consideration)

**Clarity Improvements?**

- Add JSDoc to cache helper functions
- Document cache invalidation strategy in DECISIONS.md

**Changes for Next Time?**

- Add structured logging to all cache operations
- Use /test-smart for faster iteration
- Check for existing caching patterns before implementing

## Integration with Other Skills

- Use with **pattern-recognition** to identify recurring themes
- Combine with **memory-management** to persist learnings
- Leverage **inversion-thinking** to identify what NOT to repeat
