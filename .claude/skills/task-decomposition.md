---
status: ACTIVE
last_updated: 2026-01-19
---

# Task Decomposition

## Overview

Break complex tasks into manageable, independently testable subtasks with clear
success criteria and execution order. Transform overwhelming features into
bite-sized work units that enable systematic progress tracking and parallel
execution where possible.

## When to Use

**Use when:**

- Task requires 3+ distinct implementation steps
- Requirements are unclear or ambiguous (decompose to clarify)
- Large feature implementation (>2 hour estimate)
- Multiple team members/agents could work in parallel
- Complex system changes touching multiple layers
- Need to track progress on multi-day work
- Stakeholder wants visibility into progress

**Don't use when:**

- Single-step task (e.g., "add validation middleware")
- Task already has detailed plan (use executing-plans instead)
- Trivial changes (<20 lines of code)
- Simple bug fix with known root cause
- Work is purely exploratory (use brainstorming first)

## Core Principle

**Large tasks are risky. Small tasks are predictable. Break work into 10-20 line
chunks with clear success criteria.**

## The Decomposition Process

### Step 1: Analyze Complexity

**Classify the task** to understand decomposition approach:

#### Complexity Indicators

**Simple** (2-4 subtasks):

- Single component changes
- Isolated feature addition
- Well-understood pattern application
- No integration complexity

**Moderate** (5-10 subtasks):

- Multi-component changes
- Cross-layer updates (frontend + backend)
- New pattern introduction
- Some integration testing needed

**Complex** (10+ subtasks):

- System-wide changes
- New architectural patterns
- Multiple engine/service updates
- Extensive integration testing
- Performance considerations

#### Example: Complexity Analysis

```markdown
Task: "Add Monte Carlo caching"

Indicators:

- Cross-layer (worker + cache + API)
- New pattern (caching strategy)
- Integration complexity (Redis + BullMQ)
- Performance critical

Classification: MODERATE (8-10 subtasks expected)
```

### Step 2: Identify Dependencies

**Map task relationships** to determine execution order:

#### Dependency Types

**Sequential Dependencies** (must complete in order):

```
A (Schema definition)
  → B (API endpoint uses schema)
    → C (Frontend uses endpoint)
      → D (E2E test covers flow)
```

**Independent Tasks** (can run in parallel):

```
A (Reserve engine update)
B (Pacing engine update)    } All independent
C (Cohort engine update)
```

**Partial Dependencies** (some parallel, some sequential):

```
A (Core calculation logic)
  → B (API integration)
  → D (Frontend)

A → C (Worker integration)    } B and C can run in parallel
```

#### Dependency Mapping Template

```markdown
## Task Dependencies

**Critical Path** (must be sequential):

1. Define waterfall schema types
2. Implement changeWaterfallType helper
3. Update FundSetup component
4. Add E2E test

**Parallel Tracks**:

- Track A: Reserve engine updates (independent)
- Track B: Pacing engine updates (independent)
- Track C: Documentation (independent)

**Shared Dependencies**:

- All tracks depend on: Schema definition (task 1)
```

### Step 3: Break into Subtasks

**Create granular, testable units** following these guidelines:

#### Subtask Granularity Rules

**Each subtask should:**

- Take 10-30 minutes to complete
- Produce 10-50 lines of code
- Have exactly ONE clear success criterion
- Be independently testable
- Result in a single git commit

**GOOD subtask examples:**

```
✓ "Add Zod schema for EuropeanWaterfall type"
✓ "Implement changeWaterfallType() helper function"
✓ "Add type guard isAmericanWaterfall()"
✓ "Update FundSetup to handle both waterfall types"
```

**BAD subtask examples:**

```
✗ "Implement waterfall support" (too broad)
✗ "Fix bugs" (no clear scope)
✗ "Update all components" (too many changes)
✗ "Add tests" (which tests? where?)
```

#### Subtask Template

```markdown
### Subtask N: [Component/Feature Name]

**Scope**: [What changes, where]

**Success Criteria**: [Single, testable condition]

**Files Affected**:

- Create: `path/to/new-file.ts`
- Modify: `path/to/existing.ts:123-145`
- Test: `path/to/test.test.ts`

**Estimated Time**: [10-30 minutes]

**Dependencies**: [List task IDs this depends on]

**Test Strategy**: [How to verify success]
```

### Step 4: Define Success Criteria

**Each subtask needs ONE clear pass/fail condition:**

#### Success Criteria Patterns

**For Implementation Tasks**:

```typescript
// GOOD (testable)
'ReserveEngine.calculate() returns correct reserve amount for European waterfall';

// BAD (vague)
'Reserve engine works with European waterfall';
```

**For Validation Tasks**:

```typescript
// GOOD (concrete)
'Zod schema rejects waterfall with catchUp when type is EUROPEAN';

// BAD (ambiguous)
'Validation is correct';
```

**For Integration Tasks**:

```typescript
// GOOD (observable)
'API endpoint /api/waterfalls/calculate returns 200 with European config';

// BAD (not specific)
'API works';
```

**For Test Tasks**:

```typescript
// GOOD (specific)
'All 12 waterfall conversion tests pass (0 failures, 0 skipped)';

// BAD (unclear)
'Tests are green';
```

### Step 5: Determine Execution Order

**Assign execution strategy** based on dependencies:

#### Execution Strategies

**1. Pure Sequential** (waterfall):

```markdown
Order: Task 1 → Task 2 → Task 3 → Task 4

Use when:

- Each task depends on previous
- Shared state across all tasks
- Single developer workflow
```

**2. Pure Parallel** (dispatch):

```markdown
Execute simultaneously:

- Task A (independent)
- Task B (independent)
- Task C (independent)

Use when:

- No shared dependencies
- Different files/subsystems
- Multiple agents available

See: dispatching-parallel-agents skill
```

**3. Batched Sequential** (checkpoints):

```markdown
Batch 1 (parallel): Tasks 1, 2, 3 → Review checkpoint Batch 2 (parallel): Tasks
4, 5 → Review checkpoint Batch 3 (sequential): Tasks 6, 7

Use when:

- Some dependencies, some independence
- Want review between phases
- Executing-plans skill workflow
```

**4. Pipeline** (continuous):

```markdown
Task 1 → Task 2 → Task 3 Task 4 → Task 5 (starts when Task 2 done)

Use when:

- Partial dependencies allow overlap
- Want to maximize parallelism
- Advanced coordination needed
```

## Integration with VC Fund Modeling Context

### Example 1: Monte Carlo Caching Implementation

**Task**: "Add Redis caching to Monte Carlo simulations"

#### Step 1: Analyze Complexity

```markdown
Classification: MODERATE

Indicators:

- Cross-layer (worker + cache + Redis)
- New pattern (caching strategy)
- Performance critical
- Integration with BullMQ

Estimated subtasks: 8-10
```

#### Step 2: Identify Dependencies

```markdown
Critical Path:

1. Cache key generation (core logic) → 2. Redis get/set operations → 3. Worker
   integration → 4. E2E testing

Parallel Tracks:

- Track A: Cache invalidation strategy (independent after task 2)
- Track B: Monitoring/metrics (independent after task 3)
```

#### Step 3: Break into Subtasks

```markdown
### Subtask 1: Cache Key Generator

**Scope**: Create deterministic hash from Monte Carlo config **Success
Criteria**: Same config produces same key, different configs produce different
keys **Files**:

- Create: `server/cache/monte-carlo-cache.ts`
- Test: `tests/unit/cache/monte-carlo-cache.test.ts` **Time**: 20 minutes
  **Dependencies**: None

### Subtask 2: Cache Get Operation

**Scope**: Redis retrieval with error handling **Success Criteria**: Returns
cached result on hit, null on miss, logs on Redis error **Files**:

- Modify: `server/cache/monte-carlo-cache.ts:30-50`
- Test: `tests/unit/cache/monte-carlo-cache.test.ts` **Time**: 15 minutes
  **Dependencies**: Task 1

### Subtask 3: Cache Set Operation

**Scope**: Redis storage with TTL **Success Criteria**: Stores result with TTL,
expires after timeout, handles large payloads **Files**:

- Modify: `server/cache/monte-carlo-cache.ts:52-75`
- Test: `tests/unit/cache/monte-carlo-cache.test.ts` **Time**: 15 minutes
  **Dependencies**: Task 1

### Subtask 4: Worker Cache Integration

**Scope**: Check cache before simulation, store after **Success Criteria**:
Second run with same config returns cached result in <100ms **Files**:

- Modify: `server/workers/monte-carlo.ts:89-120`
- Test: `tests/integration/monte-carlo-worker.test.ts` **Time**: 25 minutes
  **Dependencies**: Tasks 2, 3

[Continue for remaining tasks...]
```

#### Step 4: Success Criteria (examples)

```markdown
Task 1: "generateCacheKey() produces identical hash for same config, different
hash for configs differing only in iterations"

Task 2: "getCachedResult() returns null on cache miss, parsed object on hit,
null on Redis connection failure (with error log)"

Task 3: "setCachedResult() stores value with TTL, value not retrievable after
TTL expiration"

Task 4: "Monte Carlo worker returns cached result (verified by execution time
<10% of uncached)"
```

#### Step 5: Execution Order

```markdown
Strategy: Batched Sequential

**Batch 1** (Core caching - sequential):

1. Cache key generation
2. Get operation
3. Set operation → Review: Cache layer complete and tested

**Batch 2** (Integration - sequential): 4. Worker integration 5. Integration
tests → Review: Basic caching working end-to-end

**Batch 3** (Enhancements - parallel): 6. Cache invalidation 7.
Metrics/monitoring 8. Documentation → Review: Production-ready
```

### Example 2: European Waterfall Support

**Task**: "Add EUROPEAN waterfall type alongside AMERICAN"

#### Decomposition

```markdown
## Complexity: MODERATE (7 subtasks)

## Dependencies:

Critical Path: 1 → 2 → 3 → 7 Parallel after 2: 4, 5, 6 (engine updates)

## Subtasks:

### 1. Extend Waterfall Type Definition

**Scope**: Add EUROPEAN to discriminated union **Success**: TypeScript compiles,
EUROPEAN type available **Files**: `shared/schemas/waterfall.ts:12-30` **Time**:
10 minutes

### 2. Implement changeWaterfallType Helper

**Scope**: Type conversion function with schema validation **Success**: Converts
AMERICAN ↔ EUROPEAN with correct property mapping **Files**:

- Create: `client/src/lib/waterfall.ts`
- Test: `client/src/lib/__tests__/waterfall.test.ts` **Time**: 25 minutes

### 3. Update FundSetup Component

**Scope**: Add type selector UI, handle both types **Success**: User can select
and configure both waterfall types **Files**:
`client/src/components/FundSetup.tsx:89-145` **Time**: 30 minutes

### 4. Update ReserveEngine

**Scope**: Calculate reserves for EUROPEAN waterfall **Success**:
ReserveEngine.calculate() works with both types **Files**:
`client/src/core/reserves/ReserveEngine.ts:45-89` **Time**: 20 minutes
**Dependencies**: Task 2

### 5. Update PacingEngine

**Scope**: Handle EUROPEAN in pacing calculations **Success**:
PacingEngine.analyze() works with both types **Files**:
`client/src/core/pacing/PacingEngine.ts:67-102` **Time**: 20 minutes
**Dependencies**: Task 2

### 6. Update CohortEngine

**Scope**: Support EUROPEAN in cohort analysis **Success**:
CohortEngine.analyze() works with both types **Files**:
`client/src/core/cohorts/CohortEngine.ts:34-78` **Time**: 20 minutes
**Dependencies**: Task 2

### 7. E2E Test

**Scope**: Full flow with EUROPEAN waterfall **Success**: Create fund →
Configure EUROPEAN → Run simulation → View results **Files**:
`tests/e2e/waterfall-european.test.ts` **Time**: 25 minutes **Dependencies**:
Tasks 3, 4, 5, 6

## Execution Strategy: Pipeline

Phase 1: Tasks 1, 2 (sequential) Phase 2: Tasks 4, 5, 6 (parallel - start when
Task 2 done) Phase 3: Task 3 (when Phase 2 complete) Phase 4: Task 7 (when Task
3 complete)
```

### Example 3: LP Quarterly Report Generation

**Task**: "Generate quarterly LP reports with waterfall distributions"

#### Decomposition

```markdown
## Complexity: COMPLEX (12 subtasks)

## Critical Path:

Schema → Data aggregation → Excel generation → Distribution

## Parallel Tracks:

- Track A: Data collection (tasks 1-4)
- Track B: Excel formatting (tasks 5-7)
- Track C: Distribution logic (tasks 8-10)

## Execution: Batched Sequential

Batch 1 (Data Foundation):

1. Define report schema
2. Aggregate portfolio data
3. Calculate waterfall distributions
4. Generate fund-level metrics → Checkpoint: All data available

Batch 2 (Excel Generation): 5. Create Excel workbook structure 6. Add portfolio
holdings sheet with formulas 7. Add waterfall distribution sheet 8. Add summary
metrics sheet → Checkpoint: Excel structure complete

Batch 3 (Validation & Distribution): 9. Validate calculations against
database 10. Add LP-specific branding/formatting 11. Generate PDF export 12.
Integration test (full report generation) → Checkpoint: Production ready
```

## Integration with Other Skills

### With brainstorming

**Sequence**: brainstorming → task-decomposition → writing-plans

```markdown
1. brainstorming: Refine idea into design → Output: Design document

2. task-decomposition: Break design into subtasks → Output: Task list with
   dependencies

3. writing-plans: Create detailed implementation steps → Output: Complete
   execution plan
```

### With dispatching-parallel-agents

**Use together** when subtasks are independent:

```markdown
1. task-decomposition: Identify independent subtasks → Tasks 4, 5, 6 are
   independent (different engines)

2. dispatching-parallel-agents: Execute in parallel → Dispatch 3 agents, one per
   engine

3. Integration: Review and merge results
```

### With writing-plans

**Complementary**: Task decomposition creates structure, writing-plans adds
detail

```markdown
task-decomposition produces:

- 8 subtasks
- Dependencies mapped
- Execution order defined

writing-plans expands each subtask to:

- Step 1: Write test
- Step 2: Run test (verify fail)
- Step 3: Implement
- Step 4: Verify pass
- Step 5: Commit
```

### With subagent-driven-development

**Perfect pairing** for execution:

```markdown
1. task-decomposition: Create subtask list
2. TodoWrite: Track subtasks as todos
3. subagent-driven-development: Dispatch agent per subtask
4. Review between subtasks
```

### With systematic-debugging

**Use when** decomposed task reveals bugs:

```markdown
Executing Subtask 4: Worker integration → Bug discovered: Cache miss returns
empty object

STOP subtask execution → Use systematic-debugging to find root cause → Fix bug →
Resume subtask execution
```

## Best Practices

### 1. Balance Granularity

**Too coarse** (risky):

```
✗ "Implement caching system" (multiple hours, unclear scope)
```

**Too fine** (overhead):

```
✗ "Import crypto module" (trivial, not worth tracking)
```

**Just right** (actionable):

```
✓ "Implement cache key generation with MD5 hashing" (20 min, clear deliverable)
```

### 2. Make Subtasks Testable

**Every subtask** should have a clear test:

```markdown
Subtask: "Add validation middleware"

Test Strategy:

1. Send invalid request → Expect 400 error
2. Send valid request → Expect 200 success
3. Check error message format → Match schema
```

### 3. Track with TodoWrite

**Create todos** for each subtask:

```typescript
TodoWrite({
  todos: [
    {
      content: 'Implement cache key generation',
      activeForm: 'Implementing cache key generation',
      status: 'in_progress',
    },
    {
      content: 'Add Redis get operation',
      activeForm: 'Adding Redis get operation',
      status: 'pending',
    },
    {
      content: 'Add Redis set operation',
      activeForm: 'Adding Redis set operation',
      status: 'pending',
    },
  ],
});
```

### 4. Identify Shared Dependencies Early

**Before decomposing**, find shared dependencies:

```markdown
Common Dependencies:

- All engine updates need: Waterfall type definition
- All API routes need: Zod validation schemas
- All components need: TypeScript types

Action: Make these subtasks FIRST in execution order
```

### 5. Estimate Conservatively

**Time estimates** should include:

- Implementation (50%)
- Testing (30%)
- Debugging (20%)

```markdown
Example:

- Implementation: 10 minutes (write code)
- Testing: 6 minutes (write + run tests)
- Debugging: 4 minutes (fix edge cases) Total: 20 minutes
```

### 6. Plan for Integration

**Final subtask** should always be integration test:

```markdown
Last subtask: "E2E test covering full feature flow"

Why:

- Verifies all subtasks work together
- Catches integration bugs
- Provides confidence before merge
```

## Common Patterns

### Pattern 1: Schema-First Decomposition

```markdown
When: Adding new data model

Subtasks:

1. Define Zod schema
2. Generate TypeScript types
3. Add database migration
4. Implement CRUD operations
5. Add API endpoints
6. Create frontend forms
7. E2E test
```

### Pattern 2: Engine Extension

```markdown
When: Adding feature to calculation engine

Subtasks:

1. Add calculation logic to engine
2. Add unit tests for new logic
3. Update engine consumers (components)
4. Update API endpoints
5. Integration test
```

### Pattern 3: Cross-Layer Feature

```markdown
When: Feature touches database → API → frontend

Subtasks:

1. Database schema change
2. ORM model update
3. API route implementation
4. Zod validation
5. Frontend hook
6. Component UI
7. E2E test
```

### Pattern 4: Performance Optimization

```markdown
When: Improving slow operation

Subtasks:

1. Benchmark current performance
2. Identify bottleneck (profiling)
3. Implement optimization
4. Benchmark new performance
5. Verify no functionality change
6. Update documentation
```

## Troubleshooting

### Problem: Subtasks are too large

**Symptom**: Subtask takes >1 hour

**Fix**: Break down further using "vertical slice" approach:

```markdown
Original: "Implement reserve calculations"

Decomposed:

1. Calculate base reserves (simple case)
2. Add follow-on investment handling
3. Add graduation rate logic
4. Add waterfall type branching
5. Add edge case handling
```

### Problem: Unclear dependencies

**Symptom**: Can't determine execution order

**Fix**: Draw dependency graph:

```
A (schema)
├─→ B (API)
│   └─→ D (E2E)
└─→ C (engine)
    └─→ D (E2E)

Result: A → (B, C parallel) → D
```

### Problem: Subtasks aren't independent

**Symptom**: Can't test subtask without completing others

**Fix**: Reorder subtasks to create clean dependencies:

```markdown
Before (coupled):

1. Update component to use new API
2. Create new API endpoint

After (decoupled):

1. Create new API endpoint (testable via request)
2. Update component to use API (testable with mock)
```

### Problem: Too many subtasks

**Symptom**: 20+ subtasks for single feature

**Fix**: Group into higher-level chunks:

```markdown
20 subtasks → 4 phases:

Phase 1: Data layer (subtasks 1-5) Phase 2: Business logic (subtasks 6-12) Phase
3: API layer (subtasks 13-16) Phase 4: UI layer (subtasks 17-20)

Treat each phase as batch with checkpoint
```

## Checklist

### Before Decomposition

- [ ] Task is complex enough to warrant decomposition (>2 hours or >3 steps)
- [ ] Have reviewed existing patterns for similar tasks
- [ ] Checked if brainstorming needed first (unclear requirements)
- [ ] Identified relevant project conventions to follow

### During Decomposition

- [ ] Analyzed complexity (simple/moderate/complex)
- [ ] Mapped dependencies (sequential/parallel/hybrid)
- [ ] Each subtask is 10-30 minutes
- [ ] Each subtask has ONE success criterion
- [ ] Each subtask is independently testable
- [ ] Identified shared dependencies
- [ ] Determined execution order

### After Decomposition

- [ ] Created TodoWrite todos for tracking
- [ ] Documented dependencies clearly
- [ ] Added time estimates (conservative)
- [ ] Final subtask is integration test
- [ ] Ready to hand off to writing-plans or dispatching-parallel-agents

## Summary

**Purpose**: Transform complex tasks into manageable, trackable subtasks

**Four-Step Process**:

1. **Analyze** - Classify complexity
2. **Identify** - Map dependencies
3. **Break** - Create 10-30 min subtasks
4. **Order** - Determine execution strategy

**Key Principles**:

- Each subtask: 10-50 lines, one success criterion, independently testable
- Balance granularity (not too coarse, not too fine)
- Identify shared dependencies early
- Track with TodoWrite
- Plan for integration testing

**Integration**:

- brainstorming → task-decomposition → writing-plans (planning flow)
- task-decomposition → dispatching-parallel-agents (parallel execution)
- task-decomposition → subagent-driven-development (systematic execution)
- systematic-debugging (when bugs found during execution)

**When to use**: Complex tasks (3+ steps, >2 hours, unclear requirements,
multi-layer changes)

**When NOT to use**: Simple single-step tasks, already have detailed plan,
trivial changes
