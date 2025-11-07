# Systematic Debugging

## Overview

Use when encountering any bug, test failure, or unexpected behavior, before
proposing fixes. Four-phase framework (root cause investigation, pattern
analysis, hypothesis testing, implementation) that ensures understanding before
attempting solutions.

## The Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

If you haven't completed Phase 1, you **cannot** propose fixes.

## Core Principle

**Random fixes waste time and create new bugs. Quick patches mask underlying
issues.**

**ALWAYS find root cause before attempting fixes. Symptom fixes are failure.**

## The Four Phases

### Phase 1: Root Cause Investigation

**BEFORE attempting ANY fix:**

#### 1. Read Error Messages Carefully

- Don't skip past them or skim
- Every word in error message is a clue
- Copy full error message, not summary

**Example**:

```
Error: Cannot read property 'totalReserves' of undefined
  at calculateReserveAllocation (reserves.ts:145)
  at ReserveEngine.calculate (ReserveEngine.ts:89)
```

**Analysis**:

- `undefined` suggests missing data, not wrong data
- Line 145 = exact location of symptom (not cause)
- Called from ReserveEngine.calculate = trace back from there

#### 2. Reproduce Consistently

- Can you trigger it reliably?
- What's the minimal reproduction case?
- Does it happen in all environments or specific ones?

**Example**:

```typescript
// Minimal reproduction
const engine = new ReserveEngine();
const result = engine.calculate(undefined); // Throws error
```

#### 3. Check Recent Changes

- What changed that could cause this?
- Review git log, CHANGELOG.md
- Compare working vs. broken versions

```bash
# Find recent changes to reserves code
git log --oneline --since="1 week ago" -- client/src/core/reserves/

# Check what changed in last commit
git diff HEAD~1 -- client/src/core/reserves/
```

#### 4. Gather Evidence in Multi-Component Systems

Add diagnostic instrumentation at component boundaries:

```typescript
// API layer
router.post('/api/reserves', (req, res) => {
  console.error('[DEBUG] API received:', {
    body: req.body,
    headers: req.headers,
  });
  // ...
});

// Engine layer
class ReserveEngine {
  calculate(data: PortfolioData) {
    console.error('[DEBUG] Engine received:', {
      data,
      hasData: !!data,
      hasCompanies: !!data?.companies,
    });
    // ...
  }
}
```

**Why console.error?** Shows in test output (console.log may not)

#### 5. Trace Data Flow

Use **root-cause-tracing** skill when error is deep in call stack:

- Trace backward through function calls
- Find where invalid value originated
- Identify the RIGHT place to fix (not just symptom location)

**See**: root-cause-tracing.md for detailed process

### Phase 2: Pattern Analysis

**Find the pattern before fixing:**

#### 1. Find Working Examples

Locate similar working code:

```bash
# Find similar patterns that work
grep -r "ReserveEngine.calculate" client/src/

# Compare working vs broken usage
git diff HEAD~5 -- tests/unit/engines/reserve-engine.test.ts
```

#### 2. Compare Against References

Read reference implementation **COMPLETELY**:

- Don't skim documentation
- Read all related code sections
- Check examples and tests

**Example**:

```typescript
// Check how PacingEngine handles similar case (working reference)
class PacingEngine {
  analyze(data: PortfolioData) {
    if (!data || !data.companies) {
      throw new Error('Invalid portfolio data'); // Validation!
    }
    // ...
  }
}

// ReserveEngine missing this validation!
class ReserveEngine {
  calculate(data: PortfolioData) {
    return data.companies.map(...); // No validation = crash on undefined
  }
}
```

#### 3. Identify Differences

What's different between working and broken?

- Missing validation?
- Different order of operations?
- Type mismatch?
- Async timing issue?

#### 4. Understand Dependencies

- What does this code need to work?
- Are dependencies initialized?
- Version mismatches?

### Phase 3: Hypothesis and Testing

**Scientific method:**

#### 1. Form Single Hypothesis

State clearly: "I think X is the root cause because Y"

**Example**:

```
Hypothesis: ReserveEngine crashes because API route skips validation middleware,
allowing undefined data to reach engine.

Evidence:
- Working routes use validateRequest(Schema) middleware
- Broken route has no validation middleware
- Error occurs when data is undefined
```

#### 2. Test Minimally

- **Smallest possible change**
- **One variable at a time**
- No "shotgun debugging" (changing multiple things hoping something works)

**Example**:

```typescript
// Test: Add validation middleware
router.post(
  '/api/reserves',
  validateRequest(PortfolioDataSchema), // ONLY CHANGE
  async (req, res) => {
    // Rest unchanged
  }
);
```

#### 3. Verify Before Continuing

Did it work?

- Run tests
- Check error is gone
- Verify no new errors introduced

#### 4. When You Don't Know

**Say "I don't understand X"** instead of guessing

**Bad**: "Let's try changing this and see if it works" **Good**: "I don't
understand why data is undefined. Need to trace API request flow."

### Phase 4: Implementation

**Fix the root cause, not the symptom:**

#### 1. Create Failing Test Case

Use **test-driven-development** approach:

```typescript
// Write test that exposes the bug
it('should validate portfolio data before calculation', async () => {
  const response = await request(app).post('/api/reserves').send(undefined); // Invalid data

  expect(response.status).toBe(400); // Should reject
  expect(response.body.error).toContain('validation');
});

// Run test: FAIL (expected behavior)
```

#### 2. Implement Single Fix

**ONE change at a time**:

```typescript
// Add validation middleware (single fix)
router.post(
  '/api/reserves',
  validateRequest(PortfolioDataSchema), // FIX HERE
  async (req, res) => {
    const result = await engine.calculate(req.body);
    res.json(result);
  }
);
```

#### 3. Verify Fix

- Test passes now?
- No other tests broken?
- Error completely resolved?

#### 4. If Fix Doesn't Work

**Less than 3 attempts?**

- Return to **Phase 1** (Root Cause Investigation)
- Your hypothesis was wrong, gather more evidence

**3 or more attempts failed?**

- **STOP and question the architecture** (see next section)

## If 3+ Fixes Failed: Question Architecture

### Pattern Indicating Architectural Problem

- Each fix reveals new shared state/coupling/problem in different place
- Fixes require "massive refactoring" to implement
- Each fix creates new symptoms elsewhere
- Feeling like "sticking with it through sheer inertia"

### STOP and Question Fundamentals

Ask:

- Is this pattern fundamentally sound?
- Are we forcing a square peg into a round hole?
- Should we refactor architecture vs. continue fixing symptoms?
- Is there a simpler approach we're missing?

**Discuss with your human partner before attempting more fixes**

### Example: When to Escalate

```markdown
**Symptom**: Component re-renders excessively

**Attempt 1**: Add useMemo to expensive calculation **Result**: Still
re-renders, now from different prop

**Attempt 2**: Add React.memo to component **Result**: Still re-renders, parent
forces update

**Attempt 3**: Move state up to parent **Result**: Now parent re-renders
excessively, cascades to siblings

**Analysis**: Each fix reveals new coupling. Pattern suggests architectural
issue.

**Question**: Should we use a different state management approach (Zustand,
Jotai)?

→ STOP. Discuss with human partner before more fixes.
```

## Red Flags - STOP and Follow Process

If you catch yourself thinking:

- ❌ "Quick fix for now, investigate later"
- ❌ "Just try changing X and see if it works"
- ❌ "I don't fully understand but this might work"
- ❌ "Here are the main problems:" [lists fixes without investigation]
- ❌ "One more fix attempt" (when already tried 2+)
- ❌ Each fix reveals new problem in different place

**ALL of these mean: STOP. Return to Phase 1.**

## Integration with VC Fund Modeling Context

### Example: Reserve Engine Test Failure

**Phase 1: Root Cause Investigation**

```
Error: Expected totalReserves 1000000, got 950000
  at tests/unit/engines/reserve-engine.test.ts:45

Recent changes: PR #178 "Refactor graduation rate calculation"

Trace:
- Test calls ReserveEngine.calculate()
- Engine calls computeReservesFromGraduation()
- computeReservesFromGraduation calls new graduationRateToReserveAmount()
- New function uses different formula!

Root cause: Formula change in graduation rate conversion
```

**Phase 2: Pattern Analysis**

```
Working (old):
reserveAmount = totalCapital * (1 - graduationRate)

Broken (new):
reserveAmount = totalCapital * graduationRate // WRONG!

Difference: Missing (1 - graduationRate) inversion
```

**Phase 3: Hypothesis**

```
Hypothesis: New function forgot to invert graduation rate.
Graduation rate 5% should reserve 95%, not 5%.

Test:
graduationRateToReserveAmount(1000000, 0.05)
Expected: 950000 (95%)
Actual: 50000 (5%) ← Confirms hypothesis
```

**Phase 4: Implementation**

```typescript
// Fix
function graduationRateToReserveAmount(
  totalCapital: number,
  graduationRate: number
): number {
  return totalCapital * (1 - graduationRate); // ADD (1 - ...)
}

// Test: PASS ✓
```

## Checklist

### Before Proposing Fix

- [ ] Reproduced error consistently
- [ ] Read full error message (not skimmed)
- [ ] Checked recent changes (git log, CHANGELOG.md)
- [ ] Traced to root cause (not just symptom)
- [ ] Found working examples for comparison
- [ ] Formed clear hypothesis
- [ ] Understand WHY the bug exists

### After Implementing Fix

- [ ] Test now passes
- [ ] No new tests broken
- [ ] Fix addresses root cause (not symptom)
- [ ] Added test to prevent regression
- [ ] Documented if non-obvious

### If Fix Failed

- [ ] Less than 3 attempts? → Return to Phase 1
- [ ] 3+ attempts? → Question architecture, discuss with human

## Integration with Other Skills

### With Root Cause Tracing

**Phase 1**: Use root-cause-tracing for deep call stack errors

### With Pattern Recognition

**Phase 2**: Use pattern-recognition to compare working vs. broken patterns

### With Test-Driven Development

**Phase 4**: Create failing test, implement fix, verify passing

### With Extended Thinking Framework

```xml
<research_thinking>
  <initial_analysis>
    [Phase 1: Root cause investigation findings]
  </initial_analysis>

  <strategy>
    [Phase 2: Pattern analysis and hypothesis formation]
  </strategy>

  <execution_notes>
    [Phase 3: Testing hypothesis, Phase 4: Implementation attempts]
  </execution_notes>

  <synthesis>
    [Root cause summary, fix verification]
  </synthesis>

  <quality_check>
    [Did fix resolve issue? Any remaining concerns?]
  </quality_check>
</research_thinking>
```

### With Continuous Improvement

After debugging session:

```markdown
What worked well?

- Root cause tracing found exact issue quickly
- Comparing with working reference (PacingEngine) revealed pattern

What was inefficient?

- Attempted fix before fully understanding (wasted time)
- Should have checked git history earlier

Next time:

- Always check git log first
- Use extended-thinking-framework for complex bugs
- Add more diagnostic logging earlier
```

## Common Bug Patterns in VC Fund Modeling

### Pattern 1: Missing Validation

```typescript
// Symptom: Calculation crashes on undefined
// Root cause: API route skips validation
// Fix: Add validateRequest(Schema) middleware
```

### Pattern 2: Type Confusion

```typescript
// Symptom: AMERICAN waterfall used where EUROPEAN expected
// Root cause: No type guard after user selection
// Fix: Add type narrowing with discriminated union
```

### Pattern 3: Percentage vs Decimal

```typescript
// Symptom: Hurdle 12 rejected (must be 0-1)
// Root cause: Component doesn't convert percentage to decimal
// Fix: Add / 100 conversion in component
```

### Pattern 4: Async Race Condition

```typescript
// Symptom: Test accesses undefined tempDir
// Root cause: beforeEach not awaited
// Fix: Add await to beforeEach setup
```

### Pattern 5: Invariant in Hot Loop

```typescript
// Symptom: Monte Carlo times out
// Root cause: Waterfall calculated 10,000 times instead of once
// Fix: Hoist calculation outside loop
```

## Summary

**Four Phases** (in order, no skipping):

1. **Root Cause Investigation** - Find the real problem
2. **Pattern Analysis** - Understand why it's broken
3. **Hypothesis Testing** - Test your theory scientifically
4. **Implementation** - Fix root cause, not symptom

**Iron Law**: NO FIXES WITHOUT ROOT CAUSE FIRST

**Escalation**: 3+ failed fixes = Question architecture, discuss with human
