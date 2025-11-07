# Inversion Thinking

## Overview

Invert the question to reveal pitfalls and failure modes; systematically avoid
each item.

## When to Use

- Before starting complex implementations
- When designing architecture or APIs
- During code reviews and planning sessions
- To identify edge cases and failure scenarios

## Steps

### 1. Invert the Question

Transform your goal into its opposite:

- **Original**: "How do I build a robust reserve allocation engine?"
- **Inverted**: "What would make this reserve engine terrible?"

### 2. List Failure Modes

Brainstorm everything that could go wrong:

- Single source of truth with no validation
- No error handling or recovery
- Ignoring edge cases (negative values, division by zero)
- Stale or cached data without invalidation
- Unclear or ambiguous API contracts
- Poor test coverage
- Race conditions in async operations
- Memory leaks or performance bottlenecks

### 3. Convert to Do-Not Checklist

Transform each failure mode into a concrete avoidance rule:

- ❌ Do NOT skip input validation
- ❌ Do NOT ignore error states
- ❌ Do NOT assume data is always available
- ❌ Do NOT write code without corresponding tests
- ❌ Do NOT ignore TypeScript warnings

### 4. Gate Outputs

Before finalizing any implementation:

- Review code against the do-not checklist
- Ensure each failure mode is explicitly prevented
- Add tests that verify the failure modes can't occur

## Example: VC Fund Modeling Context

**Goal**: Implement waterfall distribution calculations

**Inverted**: What would make waterfall calculations catastrophically wrong?

**Failure Modes**:

- Incorrect hurdle rate calculations
- Float precision errors in percentage calculations
- Type confusion between AMERICAN and EUROPEAN waterfalls
- Missing validation for carry percentages (0-1 range)
- No handling for edge cases (zero proceeds, negative values)

**Do-Not Checklist**:

- ❌ Do NOT perform calculations without Zod schema validation
- ❌ Do NOT mix waterfall types without explicit type guards
- ❌ Do NOT skip clamping percentages to valid ranges
- ❌ Do NOT ignore the existing `applyWaterfallChange()` helper
- ❌ Do NOT write waterfall logic without comprehensive tests

## Integration with Other Skills

- Use with **systematic-debugging** when investigating failures
- Combine with **pattern-recognition** to identify common failure modes
- Leverage **continuous-improvement** to refine your do-not checklists
