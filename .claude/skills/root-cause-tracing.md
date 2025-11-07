# Root Cause Tracing

## Overview

Use when errors occur deep in execution and you need to trace back to find the
original trigger. Systematically trace bugs backward through call stack, adding
instrumentation when needed, to identify source of invalid data or incorrect
behavior.

## Core Principle

**Never fix where the error appears - trace back to find the original trigger.**

## When to Use

- Error happens deep in execution (not at entry point)
- Stack trace shows long call chain
- Unclear where invalid data originated
- Need to find which test/code triggers the problem
- Error message doesn't reveal root cause

## The Tracing Process

### Step 1: Observe the Symptom

Record exactly what's failing:

```
Error: git init failed in /Users/jesse/project/packages/core
  at execFileAsync (git-utils.ts:45)
  at WorktreeManager.createSessionWorktree (worktree-manager.ts:123)
```

**Document**:

- Exact error message
- Stack trace (if available)
- When it occurs (test? runtime? specific scenario?)

### Step 2: Find Immediate Cause

What code directly causes this error?

```typescript
// worktree-manager.ts:123
await execFileAsync('git', ['init'], { cwd: projectDir });
```

**Ask**: What would make this fail?

- Invalid `projectDir` value?
- Git not installed?
- Permissions issue?

### Step 3: Ask: What Called This?

Trace up the call chain:

```typescript
WorktreeManager.createSessionWorktree(projectDir, sessionId)
  → called by Session.initializeWorkspace()
  → called by Session.create()
  → called by test at Project.create()
```

At each level, **ask**:

- What value was passed?
- Where did that value come from?
- Is it validated?

### Step 4: Keep Tracing Up

Follow the data flow backward:

```typescript
// Test code
const context = setupCoreTest(); // Returns { tempDir: '' }
Project.create('name', context.tempDir); // Accessed before beforeEach!
```

**Found it!**

- `projectDir = ''` (empty string!)
- Empty string as `cwd` resolves to `process.cwd()`
- That's the source code directory (wrong!)
- `context.tempDir` accessed before `beforeEach` initialized it

### Step 5: Identify Original Trigger

**Root cause**: Test setup race condition

```typescript
// WRONG: Access before initialization
const context = setupCoreTest();
describe('Project', () => {
  beforeEach(async () => {
    await context.init(); // tempDir created here
  });

  it('creates project', async () => {
    await Project.create('name', context.tempDir); // Used here
  });
});
```

**Fix at source**:

```typescript
// RIGHT: Access after initialization
describe('Project', () => {
  let context;

  beforeEach(async () => {
    context = await setupCoreTest();
  });

  it('creates project', async () => {
    await Project.create('name', context.tempDir);
  });
});
```

## Adding Stack Traces for Complex Traces

When you can't trace manually, add instrumentation:

```typescript
async function gitInit(directory: string) {
  // Add diagnostic logging
  const stack = new Error().stack;
  console.error('DEBUG git init:', {
    directory,
    cwd: process.cwd(),
    nodeEnv: process.env.NODE_ENV,
    stack,
  });

  await execFileAsync('git', ['init'], { cwd: directory });
}
```

**Critical**: Use `console.error()` in tests (not logger - may not show in test
output)

### Reading Stack Traces

```
Error: Invalid directory
    at gitInit (git-utils.ts:45:11)
    at WorktreeManager.createSessionWorktree (worktree-manager.ts:123:5)
    at Session.initializeWorkspace (session.ts:67:9)
    at Session.create (session.ts:34:12)
    at Project.create (project.ts:89:7)
    at Test.<anonymous> (project.test.ts:15:3)
```

**Read bottom-to-top**:

1. Test triggered at line 15
2. Project.create called Session.create
3. Session.create called Session.initializeWorkspace
4. initializeWorkspace called WorktreeManager.createSessionWorktree
5. createSessionWorktree called gitInit
6. gitInit threw error

**Trace parameters** at each level to find where invalid value entered.

## Common Patterns

### Pattern 1: Invalid Input Passed Down

```
User input → Validation (skipped!) → Function → Deep function → Error
```

**Trace**: Find where validation should have happened, add it there.

### Pattern 2: State Initialization Race

```
Test setup → Access value → Initialize value (too late!) → Error
```

**Trace**: Find initialization order issue, fix sequencing.

### Pattern 3: Type Confusion

```
Function expects X → Receives Y (implicit conversion) → Uses as X → Error
```

**Trace**: Find where type was lost, add type guards.

### Pattern 4: Async Timing Issue

```
Start async operation → Don't await → Use result (undefined) → Error
```

**Trace**: Find missing `await`, add it.

## Integration with VC Fund Modeling Context

### Example: Reserve Calculation Error

**Symptom**:

```
Error: Cannot read property 'totalReserves' of undefined
  at calculateReserveAllocation (reserves.ts:145)
```

**Trace back**:

1. What called `calculateReserveAllocation`? → `ReserveEngine.calculate()`
2. What value was passed? → `portfolioData = undefined`
3. Where did `portfolioData` come from? → API response
4. Was API response validated? → NO! Missing Zod validation
5. Root cause: API endpoint skipped validation middleware

**Fix at source**: Add Zod validation to API route

```typescript
// server/routes/reserves.ts
router.post(
  '/api/reserves/calculate',
  validateRequest(PortfolioDataSchema), // ADD THIS
  async (req, res) => {
    // Now guaranteed valid
  }
);
```

### Example: Waterfall Calculation Error

**Symptom**:

```
Error: hurdle must be between 0 and 1
  at applyWaterfallChange (waterfall.ts:56)
```

**Trace back**:

1. What called `applyWaterfallChange`? → Component's `handleHurdleChange`
2. What value was passed? → `hurdle = 12` (should be 0.12!)
3. Where did 12 come from? → User input (percentage field)
4. Was it converted? → NO! Missing percentage-to-decimal conversion
5. Root cause: Component didn't convert user input (12%) to decimal (0.12)

**Fix at source**: Add conversion in component

```typescript
// Component
const handleHurdleChange = (value: string) => {
  const decimal = parseFloat(value) / 100; // ADD THIS
  const updated = applyWaterfallChange(waterfall, 'hurdle', decimal);
  setWaterfall(updated);
};
```

## Defense in Depth

After finding root cause:

1. **Fix at source** (primary fix)
2. **Add validation at each layer** (prevent future issues)
3. **Add helpful errors** (make next investigation easier)

### Example: Reserve Calculation Defense

```typescript
// Layer 1: API validation (REQUIRED)
router.post('/api/reserves', validateRequest(PortfolioDataSchema), ...)

// Layer 2: Engine validation (belt-and-suspenders)
export class ReserveEngine {
  calculate(data: PortfolioData) {
    if (!data || !data.companies) {
      throw new Error('Invalid portfolio data: missing companies array');
    }
    // ...
  }
}

// Layer 3: Helpful errors (debugging)
function calculateReserveAllocation(data: PortfolioData) {
  console.assert(data, 'Portfolio data is required');
  console.assert(data.totalReserves !== undefined, 'totalReserves is required');
  // ...
}
```

## Tracing Checklist

Before attempting a fix:

- [ ] Can you reproduce the error reliably?
- [ ] Do you have the complete stack trace?
- [ ] Have you traced to the original trigger?
- [ ] Do you understand WHY the invalid value exists?
- [ ] Have you identified the RIGHT place to fix (not just symptom)?

## Red Flags - Keep Tracing

If you're thinking:

- "Just add a null check here" → Keep tracing (why is it null?)
- "Quick fix for now" → Keep tracing (find root cause)
- "Add try/catch to suppress" → DEFINITELY keep tracing (hiding the problem)

## Integration with Other Skills

### With Systematic Debugging

1. **Phase 1** (Root Cause): Use root-cause-tracing
2. **Phase 2** (Pattern Analysis): Compare with working examples
3. **Phase 3** (Hypothesis): Test your root cause theory
4. **Phase 4** (Implementation): Fix at source

### With Pattern Recognition

After tracing several bugs:

- Note common root cause patterns
- Document in memory-management
- Add to continuous-improvement learnings

### With Extended Thinking Framework

```xml
<execution_notes>
## Root Cause Trace

Symptom: Error at line X
Immediate cause: Function Y
Traced back through: A → B → C → D
Original trigger: Test setup race condition
Root cause: Context accessed before initialization

Fix location: Test setup (not at error site)
</execution_notes>
```

## Example: Complete Trace Session

````markdown
## Bug Investigation: Monte Carlo Timeout

**Symptom**: Monte Carlo job times out after 30 seconds

**Immediate Cause**:

```typescript
// workers/monte-carlo.ts:89
await runSimulation(config); // Takes >30 seconds
```
````

**Trace Back**:

1. What's slow in `runSimulation`?
   - Add timing: Each iteration takes 5ms × 10,000 = 50 seconds

2. What changed recently?
   - Check git log: PR #145 added waterfall calculation to each iteration

3. Was waterfall there before?
   - Check old code: NO - waterfall was calculated once, reused

4. Why was it moved into loop?
   - Check PR description: "Refactor for modularity"
   - Unintended consequence: 10,000x redundant calculations

**Root Cause**: Refactoring inadvertently moved invariant calculation into hot
loop

**Fix at Source**:

```typescript
// BEFORE (slow)
for (let i = 0; i < iterations; i++) {
  const waterfall = calculateWaterfall(config); // 10,000 times!
  results[i] = simulateIteration(waterfall);
}

// AFTER (fast)
const waterfall = calculateWaterfall(config); // Once!
for (let i = 0; i < iterations; i++) {
  results[i] = simulateIteration(waterfall);
}
```

**Lesson**: Trace revealed architectural issue (invariant in loop), not just bug

```

```
