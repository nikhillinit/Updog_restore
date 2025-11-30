# Iterative Improvement (Evaluator-Optimizer Pattern)

## Overview

Systematically refine solutions through structured evaluation feedback loops.
The Evaluator-Optimizer pattern creates a cycle where each iteration is assessed
against clear criteria, with feedback informing the next attempt until quality
thresholds are met or iteration limits reached.

## When to Use

- Test repair workflows (fixing failing tests)
- Code generation (creating new components or functions)
- Architectural design refinement (optimizing system designs)
- Documentation improvement (iterating on clarity and completeness)
- Performance optimization (improving execution speed or resource usage)
- Bug fixes requiring multiple approaches (complex debugging scenarios)

## Core Principle

**Single-shot solutions have variable quality. Iterative refinement with
validation produces consistently better outcomes.**

## The Three-Phase Loop

### Phase 1: Generate (or Optimize)

**First Iteration**: Create initial solution based on requirements

**Subsequent Iterations**: Improve solution incorporating feedback from previous
evaluation

### Phase 2: Evaluate Against Criteria

**ALWAYS use exactly 3 criteria** for evaluation consistency:

#### Standard Criteria Pattern

1. **Functional**: Does it work? (requirements met, tests pass)
2. **Safe**: No regressions? (no anti-patterns, backwards compatible)
3. **Conventional**: Follows project patterns? (matches codebase style,
   conventions)

#### VC Fund Context Examples

**Test Repair Evaluation**:

```typescript
{
  testPasses: boolean,        // Addresses the actual error
  noRegressions: boolean,     // No unsafe patterns (@ts-ignore, any)
  followsConventions: boolean // TypeScript types, error handling
}
```

**Performance Optimization Evaluation**:

```typescript
{
  achievesSpeedTarget: boolean,  // Meets performance goal
  preservesFunctionality: boolean, // No behavior changes
  maintainsReadability: boolean   // Code still understandable
}
```

### Phase 3: Status Decision

**Three-status system**:

```typescript
type EvaluationStatus = 'PASS' | 'NEEDS_IMPROVEMENT' | 'FAIL';

if (all 3 criteria met) {
  return 'PASS';           // Stop, return solution
} else if (criterion 1 met) {
  return 'NEEDS_IMPROVEMENT'; // Continue iterating
} else {
  return 'FAIL';           // Unrecoverable, stop early
}
```

## Iteration Control

### Maximum Iterations

```typescript
const MAX_OPTIMIZATION_ITERATIONS = 3;

// Why 3?
// - Iteration 1: Initial attempt
// - Iteration 2: First refinement based on feedback
// - Iteration 3: Second refinement or alternative strategy
// - Beyond 3: Diminishing returns, likely architectural issue
```

### Stop Conditions

**Early Success**:

```typescript
for (let i = 0; i < MAX_ITERATIONS; i++) {
  const solution = generate(feedback);
  const evaluation = evaluate(solution);

  if (evaluation.status === 'PASS') {
    return solution; // Stop immediately
  }

  feedback = buildFeedback(evaluation);
}
```

**Early Failure**:

```typescript
if (evaluation.status === 'FAIL') {
  logger.warn('Unrecoverable failure, stopping iterations');
  break; // Don't waste iterations on wrong approach
}
```

## Example: VC Fund Test Repair Workflow

### Scenario: Reserve Engine Test Failure

**Initial Error**:

```
Error: Cannot read property 'totalReserves' of undefined
  at calculateReserveAllocation (reserves.ts:145)
```

### Iteration 1: Initial Repair

**Generate**:

```typescript
'Add null check before accessing totalReserves property';
```

**Evaluate**:

```typescript
{
  status: 'NEEDS_IMPROVEMENT',
  criteria: {
    testPasses: true,        // Error fixed
    noRegressions: true,     // No unsafe patterns
    followsConventions: false // Missing TypeScript types
  },
  feedback: 'Add proper TypeScript type annotations and guards'
}
```

### Iteration 2: Refine with Type Safety

**Optimize**:

```typescript
"Add null check with TypeScript type guard:
if (!data?.totalReserves) {
  throw new Error('Missing reserve data');
}
const reserves: number = data.totalReserves;
"
```

**Evaluate**:

```typescript
{
  status: 'NEEDS_IMPROVEMENT',
  criteria: {
    testPasses: true,
    noRegressions: true,
    followsConventions: false // Missing error handling pattern
  },
  feedback: 'Use project error handling conventions (try-catch wrapper)'
}
```

### Iteration 3: Add Error Handling Convention

**Optimize**:

```typescript
"Wrap calculation in try-catch with type-safe guard:
try {
  if (!data?.totalReserves) {
    throw new ValidationError('Missing reserve data', { data });
  }
  const reserves: number = data.totalReserves;
  return calculateReserveAllocation(reserves);
} catch (error) {
  logger.error('Reserve calculation failed', { error, data });
  throw error;
}
"
```

**Evaluate**:

```typescript
{
  status: 'PASS',
  criteria: {
    testPasses: true,
    noRegressions: true,
    followsConventions: true
  }
}
```

**Result**: Success after 3 iterations

## Integration with systematic-debugging

**CRITICAL RULE**: Always complete root cause investigation BEFORE entering
iteration loop.

### Two-Stage Process

**Stage 1: Root Cause First** (systematic-debugging)

```
1. Read error message carefully
2. Reproduce consistently
3. Trace to root cause
4. Form hypothesis
→ NOW you have a target for iteration
```

**Stage 2: Iterate to Solution** (iterative-improvement)

```
1. Generate initial fix for root cause
2. Evaluate against criteria
3. Refine based on feedback
4. Repeat until PASS or max iterations
```

### Escalation After Failed Iterations

If 3 iterations fail to achieve PASS:

**STOP and return to systematic-debugging Phase 1**

```typescript
if (iterations === 3 && status !== 'PASS') {
  return {
    action: 'ESCALATE_TO_ROOT_CAUSE',
    reason: 'Iterations not converging, reanalyze problem',
    evidence: previousAttempts,
  };
}
```

## Integration with continuous-improvement

**Track which iteration strategies work** for adaptive learning:

```markdown
## Iteration Strategy Retrospective

**Problem**: Reserve engine null pointer error **Total Iterations**: 3
**Outcome**: PASS

What worked well?

- Type guard approach (iteration 2) addressed core issue
- Following project error handling pattern (iteration 3) aligned with
  conventions

What was inefficient?

- Could have checked existing error handling patterns earlier
- First iteration too minimal

Next time:

- Check for project-specific error classes before first iteration
- Start with type-safe approach
```

## Criteria Design Principles

### 1. Always Use Exactly 3 Criteria

**Why 3?**

- Simple enough to evaluate quickly
- Comprehensive enough to catch major issues
- Consistent pattern across different contexts

### 2. Make Criteria Observable

**GOOD** (can verify):

```typescript
testPasses: boolean; // Run test, check exit code
noRegressions: boolean; // Search for /any|@ts-ignore|console\.log/
followsConventions: boolean; // Check for type annotations
```

**BAD** (subjective):

```typescript
isElegant: boolean; // Undefined, can't verify
feelsRight: boolean; // Subjective opinion
```

### 3. Order by Priority

**Criterion 1 = Most Critical** (must have for basic success) **Criterion 2 =
Safety** (prevents future problems) **Criterion 3 = Quality** (aligns with
standards)

## Reference Implementation

**See**: `packages/test-repair-agent/src/TestRepairAgent.ts`

**Key Methods**:

- `evaluatorOptimizerLoop()` - Main iteration control
- `evaluateFix()` - 3-criteria evaluation logic
- `optimizeWithFeedback()` - Feedback incorporation

**Documentation**: `packages/test-repair-agent/EVALUATOR_OPTIMIZER.md`

## Integration with Other Skills

### With systematic-debugging

**ALWAYS complete Phase 1 (root cause) before iterating**. Iteration refines the
RIGHT solution, debugging finds WHAT to solve.

### With continuous-improvement

**Track successful iteration strategies** in reflection sessions. Build pattern
library of criteria and optimization approaches.

### With pattern-recognition

**Identify common failure patterns** across iterations. Build heuristics for
quicker convergence.

## Summary

**Core Pattern**: Generate → Evaluate (3 criteria) → Optimize (with feedback) →
Repeat

**Success Metrics**:

- PASS: All 3 criteria met
- NEEDS_IMPROVEMENT: Core works, refinement needed
- FAIL: Wrong approach, stop early

**Integration Points**:

- systematic-debugging: Root cause FIRST, then iterate
- continuous-improvement: Track strategies, build pattern library
- pattern-recognition: Learn from iteration convergence patterns

**Key Principles**:

- Always use exactly 3 criteria
- Early stopping on PASS or FAIL
- Max 3 iterations (beyond that = architectural issue)
- Incorporate feedback in each optimization
