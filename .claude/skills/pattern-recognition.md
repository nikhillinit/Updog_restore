# Pattern Recognition

## Overview

Detect patterns, contradictions, and causal relationships to strengthen
synthesis and understanding.

## When to Use

- Comparing multiple source files or documentation
- Detecting convergence/divergence in implementations
- Finding emerging terminology or conventions
- Analyzing test failures or bug reports
- Code review and refactoring

## Steps

### 1. Note Repeated Themes or Data Points

Look for recurring elements across sources:

- Common function signatures
- Repeated validation patterns
- Similar error handling strategies
- Consistent naming conventions

**Example in Codebase**:

```typescript
// Pattern: All engines follow immutable calculation pattern
ReserveEngine.calculate(input) → new output
PacingEngine.analyze(input) → new output
CohortEngine.compute(input) → new output
```

### 2. Flag Contradictions or Anomalies

Identify inconsistencies that may indicate bugs or technical debt:

- Different approaches to same problem
- Inconsistent error handling
- Divergent naming conventions
- Conflicting documentation

**Example**:

```
⚠ Contradiction found:
- waterfall.ts uses applyWaterfallChange() helper
- Some components still use direct mutation
→ Action: Migrate to centralized helper pattern
```

### 3. Link Cause-Effect or Analogies

Connect patterns to their implications:

- **Pattern**: All API routes use Zod validation
- **Effect**: Type safety extends from DB to frontend
- **Analogy**: Like a type-safe pipeline

**Example**:

```
Pattern: BullMQ workers for long-running tasks
→ Cause: Monte Carlo simulations can take 30+ seconds
→ Effect: API remains responsive, jobs processed async
→ Analogy: Like a restaurant kitchen (orders processed in background)
```

### 4. Summarize Cross-Source Insights

Synthesize findings into actionable knowledge:

**Example Synthesis**:

```
Pattern Analysis: Waterfall Implementation

Sources reviewed:
- client/src/lib/waterfall.ts
- client/src/lib/__tests__/waterfall.test.ts
- server/validators/fundSchema.ts

Patterns detected:
✓ Discriminated union with type guards (AMERICAN | EUROPEAN)
✓ Centralized helpers with validation (applyWaterfallChange)
✓ Immutable update pattern (returns new object)
✓ Schema-backed defaults (WaterfallSchema.parse)

Contradictions:
⚠ Some components bypass helpers (technical debt)
⚠ Inconsistent use of type guards

Recommendations:
→ Enforce helper usage through linting rule
→ Add migration guide to cheatsheet
→ Update CLAUDE.md with waterfall conventions
```

## Pattern Categories

### Architectural Patterns

- **Layered Architecture**: client → server → shared
- **Engine Pattern**: Immutable calculation engines (Reserve, Pacing, Cohort)
- **Worker Pattern**: BullMQ for async jobs
- **Storage Abstraction**: Redis + PostgreSQL via unified interface

### Code Patterns

- **Type Safety**: Zod schemas for runtime validation
- **Immutability**: Return new objects, don't mutate inputs
- **Helper Functions**: Centralized logic (waterfall helpers)
- **Error Boundaries**: React error boundaries for UI resilience

### Testing Patterns

- **Multi-Project Setup**: Separate server (Node) and client (jsdom) test
  environments
- **Co-located Tests**: Tests alongside source files
- **Smart Selection**: /test-smart for affected tests only

### Documentation Patterns

- **CLAUDE.md**: Core architecture only
- **CHANGELOG.md**: Timestamped changes
- **DECISIONS.md**: Architectural rationale
- **cheatsheets/**: Detailed implementation guides

## Example: Detecting API Patterns

**Sources**:

- [server/routes/funds.ts](server/routes/funds.ts)
- [server/routes/allocations.ts](server/routes/allocations.ts)
- [server/routes/scenario-analysis.ts](server/routes/scenario-analysis.ts)

**Patterns Detected**:

```typescript
// Pattern 1: Zod validation middleware
router.post('/api/funds', validateRequest(FundSchema), async (req, res) => {
  // handler
});

// Pattern 2: Consistent error responses
res.status(400).json({ error: 'Validation failed', details: zodError });

// Pattern 3: Async error handling wrapper
router.get(
  '/api/funds/:id',
  asyncHandler(async (req, res) => {
    // handler with automatic error catching
  })
);

// Pattern 4: TanStack Query integration
// Frontend expects { data, error } structure
```

**Contradictions**:

- Some routes use `try/catch`, others use `asyncHandler`
- Error response formats vary slightly

**Recommendations**:

- Standardize on `asyncHandler` for all routes
- Create shared error response utility
- Document pattern in cheatsheets/api-conventions.md

## Integration with Other Skills

- Use with **inversion-thinking** to identify anti-patterns
- Combine with **analogical-thinking** to explain patterns
- Leverage **continuous-improvement** to refine pattern recognition
- Use with **memory-management** to track pattern evolution
