---
status: ACTIVE
last_updated: 2026-01-19
---

# Extended Thinking Framework

## Overview

A reusable scaffold for complex tasks and audits that require structured,
systematic thinking.

## When to Use

- Complex tasks requiring multi-step analysis
- Code audits or architecture reviews
- Research requiring synthesis from multiple sources
- Quality assurance or validation tasks
- Any work benefiting from explicit reasoning structure

## Template

```xml
<research_thinking>
  <initial_analysis>
    [What is the problem/task? What's already known? What are the constraints?]
  </initial_analysis>

  <strategy>
    [How will you approach this? What steps? What tools/skills will you use?]
  </strategy>

  <execution_notes>
    [Document findings as you work. Track surprises, blockers, decisions.]
  </execution_notes>

  <synthesis>
    [What did you learn? How do the pieces fit together? What patterns emerged?]
  </synthesis>

  <quality_check>
    [Did you achieve the objective? What's the confidence level? What's uncertain?]
  </quality_check>
</research_thinking>
```

## Detailed Section Guidance

### Initial Analysis

**Purpose**: Establish context and scope

**Questions to answer**:

- What is the specific problem or task?
- What do I already know about this?
- What are the constraints (time, resources, technical)?
- What would success look like?
- What are the risks or unknowns?

**Example**:

```xml
<initial_analysis>
Task: Audit waterfall calculation implementation for correctness and edge cases

Known:
- Waterfall implementation in client/src/lib/waterfall.ts
- Two types: AMERICAN and EUROPEAN
- Used throughout portfolio modeling

Constraints:
- Must not break existing functionality
- Need to maintain backward compatibility
- Performance is important (called frequently)

Success criteria:
- All edge cases identified and tested
- Type safety validated
- Performance acceptable (<10ms per calculation)

Risks:
- May find bugs in production calculations
- Type system may allow invalid states
- Performance bottlenecks in Monte Carlo simulations
</initial_analysis>
```

### Strategy

**Purpose**: Plan the approach before execution

**Questions to answer**:

- What steps will I take?
- What tools or skills will I use?
- How will I validate findings?
- What's the order of operations?

**Example**:

```xml
<strategy>
Approach:
1. Code review of waterfall.ts implementation
   - Use pattern-recognition to identify calculation patterns
   - Use inversion-thinking to identify potential failure modes

2. Test coverage analysis
   - Review existing tests in waterfall.test.ts
   - Identify gaps in edge case coverage

3. Type safety audit
   - Verify discriminated union handling
   - Check for any 'any' types or type assertions
   - Use multi-ai-collab for TypeScript best practices validation

4. Performance profiling
   - Benchmark current implementation
   - Identify any O(n²) or worse algorithms

5. Integration review
   - Check how components use waterfall functions
   - Use pattern-recognition to find inconsistent usage

Tools:
- pattern-recognition skill for identifying patterns
- inversion-thinking skill for failure mode analysis
- /test-smart for running affected tests
- mcp__multi-ai-collab for TypeScript expertise

Validation:
- All findings cross-referenced with code and tests
- Multi-AI consensus on ambiguous issues
- Benchmark data for performance claims
</strategy>
```

### Execution Notes

**Purpose**: Document the investigation in real-time

**What to capture**:

- Findings (with file/line references)
- Surprises or unexpected behavior
- Decisions made during investigation
- Blockers or uncertainties
- Questions that arise

**Example**:

```xml
<execution_notes>
## Code Review (Step 1)

Finding 1: Centralized helper pattern
- Location: client/src/lib/waterfall.ts:45-67
- Pattern: applyWaterfallChange() handles all updates
- Good: Type-safe overloads for each waterfall type
- Concern: Not all components use this helper (tech debt)

Finding 2: Schema validation
- Location: client/src/lib/waterfall.ts:12-30
- WaterfallSchema.parse() provides runtime validation
- Good: Catches invalid states at runtime
- Surprise: Defaults are schema-backed (didn't expect this)

Finding 3: Immutability pattern
- All helpers return new objects (no mutation)
- Consistent with engine pattern (ReserveEngine, PacingEngine)

## Test Coverage (Step 2)

Finding 4: Comprehensive test suite
- Location: client/src/lib/__tests__/waterfall.test.ts
- 19 test cases covering both types
- Good edge cases: zero hurdle, max carry, type switching

Gap 1: No tests for invalid intermediate states
Gap 2: No performance benchmarks

## Type Safety Audit (Step 3)

Finding 5: Strong discriminated union
- Type guards prevent cross-type access
- TypeScript enforces type narrowing

Issue 1: One 'as' assertion found
- Location: waterfall.ts:89
- Reason: Zod parse result needs type assertion
- Risk: Low (schema validates structure)

## Performance Profile (Step 4)

Benchmark results:
- applyWaterfallChange: 0.3ms avg (n=1000)
- changeWaterfallType: 0.8ms avg (n=1000)
- Well under 10ms target ✓

## Integration Review (Step 5)

Pattern: Most components use helpers correctly
Anti-pattern: 3 components bypass helpers
- Location: component A, B, C (see pattern-recognition notes)
- Risk: Medium (could introduce type errors)
- Recommendation: Migration needed
</execution_notes>
```

### Synthesis

**Purpose**: Connect findings into coherent understanding

**Questions to answer**:

- What are the key insights?
- How do findings relate to each other?
- What patterns or themes emerged?
- What's the big picture?

**Example**:

```xml
<synthesis>
Key Insights:

1. Architecture Quality: HIGH
   - Waterfall implementation follows best practices
   - Strong type safety with discriminated unions
   - Immutable update pattern consistent with engine architecture
   - Schema validation provides runtime safety

2. Implementation Gaps: MEDIUM
   - 3 components bypass centralized helpers (tech debt)
   - Missing performance benchmarks in test suite
   - Some edge cases not explicitly tested

3. Performance: EXCELLENT
   - Sub-millisecond execution for all operations
   - No algorithmic concerns
   - Scales well for Monte Carlo usage

Patterns Detected:
- Consistent with broader codebase patterns (engines, immutability)
- Helper pattern reduces duplication and errors
- Schema-first approach ensures validity

Relationships:
- Waterfall helpers enable type-safe UI components
- Schema validation bridges runtime and compile-time safety
- Immutability pattern enables predictable state management

Big Picture:
The waterfall implementation is architecturally sound with strong type safety
and good performance. Main concern is incomplete adoption of helper pattern
across components. Migration path is clear and low-risk.
</synthesis>
```

### Quality Check

**Purpose**: Validate work and assess confidence

**Questions to answer**:

- Did I achieve the stated objective?
- What's my confidence level in findings?
- What remains uncertain or needs follow-up?
- What assumptions did I make?
- How would I validate this further?

**Example**:

```xml
<quality_check>
Objective Achievement: YES
✓ Identified all edge cases in implementation
✓ Validated type safety mechanisms
✓ Confirmed performance is acceptable
✓ Found integration gaps and migration path

Confidence Levels:

HIGH Confidence (verified in code/tests):
- Type safety implementation is sound
- Performance meets requirements
- Helper pattern prevents type errors
- Schema validation works correctly

MEDIUM Confidence (observed but not exhaustive):
- Component usage patterns (checked sample, not all)
- Edge case coverage (didn't generate all combinations)

LOW Confidence (assumptions):
- Production usage patterns (no telemetry data)
- Real-world performance under high load

Uncertainties:
? Do all components really bypass helpers, or just the 3 I found?
? Are there edge cases in production we haven't encountered?
? Would migration to helpers cause any breaking changes?

Assumptions Made:
- Test suite represents real-world usage
- Performance benchmarks on dev machine representative
- No undiscovered components using waterfalls

Further Validation Needed:
- Grep entire codebase for waterfall usage patterns
- Review production telemetry for edge cases
- Load test waterfall calculations under Monte Carlo scale
- Get multi-AI review of type safety implementation

Recommendations:
1. Migrate remaining components to helpers (high priority)
2. Add performance regression tests (medium priority)
3. Expand edge case test coverage (medium priority)
4. Document waterfall pattern in cheatsheet (low priority)
</quality_check>
```

## Integration with Other Skills

### With Inversion Thinking

```xml
<initial_analysis>
  [Use inversion-thinking: "What would make this audit terrible?"]
  - Missing edge cases
  - Incorrect assumptions
  - No validation of findings
</initial_analysis>
```

### With Pattern Recognition

```xml
<execution_notes>
  [Use pattern-recognition throughout execution]
  - Note repeated patterns
  - Flag contradictions
  - Link cause-effect relationships
</execution_notes>
```

### With Memory Management

```xml
<synthesis>
  [Use memory-management to track findings with confidence levels]
  - HIGH: Verified in code
  - MEDIUM: Observed pattern
  - LOW: Assumption
</synthesis>
```

### With Continuous Improvement

```xml
<quality_check>
  [Use continuous-improvement reflection prompts]
  - What worked well? (Strategy was effective)
  - What was inefficient? (Manual grep, should use better tools)
  - What will I change next time? (Use automated analysis tools)
</quality_check>
```

## Example: Complete Framework Usage

```xml
<research_thinking>
  <initial_analysis>
    Task: Investigate performance degradation in Monte Carlo simulations

    Known:
    - Monte Carlo uses BullMQ workers
    - Simulations run 10,000 iterations
    - Recent user reports of slowdowns

    Constraints:
    - Can't impact production
    - Need to maintain accuracy
    - Limited time for investigation

    Success: Identify bottleneck and propose solution within 2 hours

    Risks: May need extensive profiling, might not find clear bottleneck
  </initial_analysis>

  <strategy>
    Approach:
    1. Review recent changes (git log, CHANGELOG.md)
    2. Profile Monte Carlo execution with benchmarks
    3. Use pattern-recognition to compare with PacingEngine performance
    4. Use multi-ai-collab for optimization strategies
    5. Validate hypothesis with targeted tests

    Tools:
    - memory-management to track findings
    - pattern-recognition for bottleneck patterns
    - /test-smart for targeted test runs
    - mcp__multi-ai-collab__ai_consensus for optimization approach

    Validation:
    - Benchmark before/after
    - Verify with production-like data volume
  </strategy>

  <execution_notes>
    ## Change Review
    - Found: Waterfall calculation added to each iteration (PR #145)
    - Previous: Waterfall calculated once, reused
    - Impact: 10,000x redundant calculations

    ## Profiling
    - Baseline: 15 seconds for 10k iterations
    - Current: 45 seconds for 10k iterations
    - Waterfall calls: 0.8ms each × 10,000 = 8 seconds overhead
    - But total slowdown is 30 seconds (more than just waterfall)

    ## Pattern Recognition
    - Similar issue in PacingEngine (solved with memoization)
    - Pattern: Expensive calculation in hot loop
    - Solution precedent: Move calculation outside loop

    ## Multi-AI Consultation
    Asked: "Best way to optimize repeated waterfall calculations?"
    Consensus: Memoization for same inputs, hoist invariant calculations

    ## Hypothesis Testing
    - Hypothesis 1: Waterfall calculation is bottleneck ✓ (partial)
    - Hypothesis 2: Other calculations also regressed ✓
    - Found: Schema validation also moved into loop
  </execution_notes>

  <synthesis>
    Root Cause:
    PR #145 refactored Monte Carlo to be more modular but inadvertently
    moved invariant calculations (waterfall, schema validation) into the
    hot loop. This caused 10,000x redundant work.

    Pattern:
    Same optimization mistake as PacingEngine (solved 2 months ago).
    Should have caught this in code review.

    Solution:
    1. Hoist waterfall calculation outside loop
    2. Hoist schema validation outside loop
    3. Add memoization for repeated calculations
    4. Add performance regression test

    Expected Impact:
    - Waterfall hoisting: -8 seconds
    - Schema validation hoisting: -12 seconds
    - Back to ~15 second baseline
  </synthesis>

  <quality_check>
    Objective: YES - Found bottleneck and solution in 1.5 hours

    HIGH Confidence:
    - Profiling data confirms waterfall overhead
    - Similar pattern solved before (precedent)
    - Solution straightforward

    MEDIUM Confidence:
    - Schema validation impact (estimated, not profiled separately)

    Assumptions:
    - Production workload similar to test data
    - No other regressions introduced

    Follow-up:
    - Implement fix
    - Add performance regression test to CI
    - Update code review checklist (avoid hot loop mistakes)
    - Document in DECISIONS.md
  </quality_check>
</research_thinking>
```

## Best Practices

1. **Fill out sections in order** - each builds on the previous
2. **Be specific** - file/line references, concrete examples
3. **Track confidence** - distinguish facts from assumptions
4. **Cross-reference** - link to code, docs, other skills
5. **Update as you learn** - execution_notes should grow during work
6. **Be honest in quality_check** - acknowledge uncertainties

## Integration with Project Memory

After completing extended thinking session:

```bash
# Document significant findings
/log-change "Fixed Monte Carlo performance regression by hoisting invariant calculations"

# Record architectural learning
/log-decision "Always validate performance impact of refactoring in hot loops"

# Create reusable guide
/create-cheatsheet performance-regression-debugging
```

## Integration with Other Skills

- **Foundation for all complex tasks** - provides structure
- Use with **memory-management** to persist thinking across sessions
- Use with **inversion-thinking** in initial_analysis phase
- Use with **pattern-recognition** in execution_notes phase
- Use with **continuous-improvement** in quality_check phase
