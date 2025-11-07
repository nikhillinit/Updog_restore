# Writing Implementation Plans

## Overview

Write comprehensive implementation plans assuming the engineer has zero context
for your codebase and questionable taste. Document everything they need to know:
which files to touch for each task, complete code examples, testing steps, and
verification procedures.

## When to Use

- After design is complete (use **brainstorming** skill first for design)
- Creating detailed implementation tasks for yourself or others
- Breaking down complex features into manageable steps
- Documenting implementation for future reference

## Announce at Start

**"I'm using the writing-plans skill to create the implementation plan."**

## Save Plans To

`docs/plans/YYYY-MM-DD-<feature-name>.md`

**Example**: `docs/plans/2025-11-06-european-waterfall-support.md`

## Bite-Sized Task Granularity

Each step is **one action** (2-5 minutes):

✅ **Good granularity**:

- "Write the failing test" - step
- "Run it to make sure it fails" - step
- "Implement the minimal code to make the test pass" - step
- "Run the tests and make sure they pass" - step
- "Commit" - step

❌ **Too coarse**:

- "Implement feature" - not a step, too vague
- "Write tests and implementation" - should be separate steps
- "Fix all bugs" - not specific enough

## Plan Document Structure

### Required Header

Every plan MUST start with this header:

```markdown
# [Feature Name] Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task.

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries used]

---
```

**Example**:

```markdown
# European Waterfall Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task.

**Goal:** Add support for EUROPEAN waterfall type alongside existing AMERICAN
type.

**Architecture:** Extend existing waterfall discriminated union with EUROPEAN
type, add type-specific validation, and update all consumers to handle both
types using type guards.

**Tech Stack:** TypeScript, Zod validation, React components, Vitest tests

---
```

### Task Structure Template

````markdown
### Task N: [Component Name]

**Files:**

- Create: `exact/path/to/new-file.ts`
- Modify: `exact/path/to/existing-file.ts:123-145`
- Test: `tests/exact/path/to/test-file.test.ts`

**Step 1: Write the failing test**

```typescript
// Complete code example
import { describe, it, expect } from 'vitest';
import { changeWaterfallType } from '@/lib/waterfall';

describe('changeWaterfallType', () => {
  it('converts AMERICAN to EUROPEAN waterfall', () => {
    const american = {
      type: 'AMERICAN',
      hurdle: 0.08,
      catchUp: 1.0,
      carryVestingMonths: 48,
    };

    const european = changeWaterfallType(american, 'EUROPEAN');

    expect(european.type).toBe('EUROPEAN');
    expect(european.hurdle).toBe(0.08);
    // EUROPEAN doesn't have catchUp
  });
});
```
````

**Step 2: Run test to verify it fails**

```bash
npm test -- waterfall.test.ts
```

Expected output:

```
FAIL  Function changeWaterfallType does not exist
```

**Step 3: Write minimal implementation**

Location: `client/src/lib/waterfall.ts:89`

```typescript
export function changeWaterfallType(
  waterfall: Waterfall,
  newType: 'AMERICAN' | 'EUROPEAN'
): Waterfall {
  if (waterfall.type === newType) {
    return waterfall; // No-op if already correct type
  }

  if (newType === 'EUROPEAN') {
    return {
      type: 'EUROPEAN',
      hurdle: waterfall.hurdle,
      carryVestingMonths: waterfall.carryVestingMonths,
    };
  } else {
    return {
      type: 'AMERICAN',
      hurdle: waterfall.hurdle,
      catchUp: 1.0, // Default for AMERICAN
      carryVestingMonths: waterfall.carryVestingMonths,
    };
  }
}
```

**Step 4: Run test to verify it passes**

```bash
npm test -- waterfall.test.ts
```

Expected: **PASS** ✓

**Step 5: Commit**

```bash
git add client/src/lib/waterfall.ts client/src/lib/__tests__/waterfall.test.ts
git commit -m "feat: add changeWaterfallType helper for type conversion"
```

````

## Complete Example Plan

```markdown
# Monte Carlo Caching Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Redis caching to Monte Carlo simulations to improve performance.

**Architecture:** Intercept Monte Carlo job execution, check Redis cache for matching config hash, return cached results if found, otherwise execute simulation and cache results with TTL.

**Tech Stack:** BullMQ workers, Redis, Zod validation, Vitest tests

---

## Task 1: Cache Key Generation

**Files:**
- Create: `server/cache/monte-carlo-cache.ts`
- Test: `tests/unit/cache/monte-carlo-cache.test.ts`

**Step 1: Write failing test for cache key generation**

```typescript
import { describe, it, expect } from 'vitest';
import { generateCacheKey } from '@/cache/monte-carlo-cache';

describe('generateCacheKey', () => {
  it('generates consistent hash for same config', () => {
    const config = {
      fundId: 'fund-123',
      iterations: 10000,
      portfolioConfig: { /* ... */ },
    };

    const key1 = generateCacheKey(config);
    const key2 = generateCacheKey(config);

    expect(key1).toBe(key2);
    expect(key1).toMatch(/^mc:fund-123:[a-f0-9]{32}$/);
  });

  it('generates different hash for different config', () => {
    const config1 = { fundId: 'fund-123', iterations: 10000 };
    const config2 = { fundId: 'fund-123', iterations: 20000 };

    expect(generateCacheKey(config1)).not.toBe(generateCacheKey(config2));
  });
});
````

**Step 2: Run test to verify it fails**

```bash
npm test -- monte-carlo-cache.test.ts
```

Expected: FAIL - Module not found

**Step 3: Implement cache key generation**

Location: `server/cache/monte-carlo-cache.ts`

```typescript
import crypto from 'crypto';
import { stableStringify } from '@/lib/stable-serialize';

export function generateCacheKey(config: MonteCarloConfig): string {
  const { fundId, iterations, portfolioConfig } = config;

  // Stable serialization for consistent hashing
  const payload = stableStringify({
    iterations,
    portfolioConfig,
  });

  const hash = crypto.createHash('md5').update(payload).digest('hex');

  return `mc:${fundId}:${hash}`;
}
```

**Step 4: Run test to verify it passes**

```bash
npm test -- monte-carlo-cache.test.ts
```

Expected: PASS ✓

**Step 5: Commit**

```bash
git add server/cache/monte-carlo-cache.ts tests/unit/cache/monte-carlo-cache.test.ts
git commit -m "feat(cache): add Monte Carlo cache key generation"
```

---

## Task 2: Cache Get/Set Operations

**Files:**

- Modify: `server/cache/monte-carlo-cache.ts`
- Test: `tests/unit/cache/monte-carlo-cache.test.ts`

**Step 1: Write failing tests for get/set**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { getCachedResult, setCachedResult } from '@/cache/monte-carlo-cache';
import { redis } from '@/redis';

describe('Monte Carlo cache operations', () => {
  beforeEach(async () => {
    await redis.flushdb(); // Clean slate
  });

  it('returns null for cache miss', async () => {
    const config = { fundId: 'fund-123', iterations: 10000 };
    const result = await getCachedResult(config);

    expect(result).toBeNull();
  });

  it('returns cached result on hit', async () => {
    const config = { fundId: 'fund-123', iterations: 10000 };
    const simulationResult = { mean: 2.5, median: 2.3 /* ... */ };

    await setCachedResult(config, simulationResult, 3600);
    const cached = await getCachedResult(config);

    expect(cached).toEqual(simulationResult);
  });

  it('respects TTL expiration', async () => {
    const config = { fundId: 'fund-123', iterations: 10000 };
    const result = { mean: 2.5 };

    await setCachedResult(config, result, 1); // 1 second TTL
    await new Promise((resolve) => setTimeout(resolve, 1100)); // Wait

    const cached = await getCachedResult(config);
    expect(cached).toBeNull(); // Expired
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npm test -- monte-carlo-cache.test.ts
```

Expected: FAIL - Functions not defined

**Step 3: Implement get/set operations**

Location: `server/cache/monte-carlo-cache.ts:30`

```typescript
import { redis } from '@/redis';

export async function getCachedResult(
  config: MonteCarloConfig
): Promise<MonteCarloResult | null> {
  const key = generateCacheKey(config);
  const cached = await redis.get(key);

  if (!cached) return null;

  return JSON.parse(cached);
}

export async function setCachedResult(
  config: MonteCarloConfig,
  result: MonteCarloResult,
  ttlSeconds: number
): Promise<void> {
  const key = generateCacheKey(config);
  await redis.setex(key, ttlSeconds, JSON.stringify(result));
}
```

**Step 4: Run tests to verify they pass**

```bash
npm test -- monte-carlo-cache.test.ts
```

Expected: PASS ✓

**Step 5: Commit**

```bash
git add server/cache/monte-carlo-cache.ts tests/unit/cache/monte-carlo-cache.test.ts
git commit -m "feat(cache): implement get/set operations for Monte Carlo results"
```

---

## Task 3: Integrate Caching into Worker

**Files:**

- Modify: `server/workers/monte-carlo.ts:89-120`
- Test: `tests/integration/monte-carlo-worker.test.ts`

**Step 1: Write integration test**

```typescript
import { describe, it, expect } from 'vitest';
import { runMonteCarloJob } from '@/workers/monte-carlo';

describe('Monte Carlo worker with caching', () => {
  it('uses cached result on second run', async () => {
    const config = { fundId: 'fund-123', iterations: 10000 };

    const start1 = Date.now();
    const result1 = await runMonteCarloJob(config);
    const duration1 = Date.now() - start1;

    const start2 = Date.now();
    const result2 = await runMonteCarloJob(config);
    const duration2 = Date.now() - start2;

    expect(result1).toEqual(result2); // Same results
    expect(duration2).toBeLessThan(duration1 * 0.1); // <10% of original time
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- monte-carlo-worker.test.ts
```

Expected: FAIL - Both runs take full time (no caching)

**Step 3: Add caching to worker**

Location: `server/workers/monte-carlo.ts:89`

```typescript
import { getCachedResult, setCachedResult } from '@/cache/monte-carlo-cache';

export async function runMonteCarloJob(config: MonteCarloConfig) {
  // Check cache first
  const cached = await getCachedResult(config);
  if (cached) {
    console.log('[Monte Carlo] Cache hit for', config.fundId);
    return cached;
  }

  // Run simulation
  console.log('[Monte Carlo] Cache miss, running simulation');
  const result = await runSimulation(config);

  // Cache result (1 hour TTL)
  await setCachedResult(config, result, 3600);

  return result;
}
```

**Step 4: Run test to verify it passes**

```bash
npm test -- monte-carlo-worker.test.ts
```

Expected: PASS ✓

**Step 5: Commit**

```bash
git add server/workers/monte-carlo.ts tests/integration/monte-carlo-worker.test.ts
git commit -m "feat(workers): integrate caching into Monte Carlo worker"
```

---

## Task 4: Cache Invalidation on Config Change

[Continue with same pattern...]

---

````

## Key Principles

### DRY (Don't Repeat Yourself)
- Include complete code examples (don't say "add validation")
- Show exact implementation, not "similar to X"

### YAGNI (You Aren't Gonna Need It)
- Only implement what's needed for this feature
- No speculative features or "nice to haves"

### TDD (Test-Driven Development)
- Write test first (shows it fails)
- Implement minimal code (shows it passes)
- Every task follows this cycle

### Frequent Commits
- Commit after each passing task
- Granular commits enable easy rollback
- Clear commit messages describe what, not how

## Execution Handoff

After saving the plan, offer execution choice:

```markdown
**Plan complete and saved to `docs/plans/2025-11-06-feature-name.md`.**

**Two execution options:**

**1. Subagent-Driven (this session)**
- I dispatch fresh subagent per task
- Review between tasks
- Fast iteration with oversight

**2. Parallel Session (separate)**
- Open new Claude Code session
- Use executing-plans skill
- Batch execution with checkpoints

**Which approach would you like?**
````

## Integration with VC Fund Modeling Context

### Example Plan Elements

**For Engine Implementation**:

````markdown
### Task: Extend ReserveEngine

**Files:**

- Modify: `client/src/core/reserves/ReserveEngine.ts:45-89`
- Test: `client/src/core/reserves/__tests__/ReserveEngine.test.ts`

**Step 1: Write failing test for European waterfall reserves**

```typescript
it('calculates reserves with European waterfall', () => {
  const engine = new ReserveEngine();
  const result = engine.calculate({
    waterfall: { type: 'EUROPEAN', hurdle: 0.08 },
    portfolioData: {
      /* ... */
    },
  });

  expect(result.totalReserves).toBe(expectedValue);
});
```
````

````

**For API Route**:
```markdown
### Task: Add Reserve Calculation Endpoint

**Files:**
- Create: `server/routes/reserves.ts`
- Test: `tests/api/reserves.test.ts`

**Step 1: Write failing API test**

```typescript
import request from 'supertest';
import { app } from '@/server';

describe('POST /api/reserves/calculate', () => {
  it('calculates reserves with valid input', async () => {
    const response = await request(app)
      .post('/api/reserves/calculate')
      .send({
        fundId: 'fund-123',
        portfolioData: { /* ... */ },
      });

    expect(response.status).toBe(200);
    expect(response.body.totalReserves).toBeDefined();
  });
});
````

````

## Common Mistakes to Avoid

### ❌ Vague Instructions
```markdown
### Task: Add validation
- Add validation to the API
- Make sure it works
````

### ✅ Specific Instructions

````markdown
### Task: Add Zod Validation to Reserves API

**Files:**

- Modify: `server/routes/reserves.ts:12`
- Add: Zod schema validation middleware

**Step 1: Write test that requires validation** [Complete test code]

**Step 2: Add validation middleware**

```typescript
import { validateRequest } from '@/middleware/validation';
import { PortfolioDataSchema } from '@shared/schemas';

router.post(
  '/api/reserves',
  validateRequest(PortfolioDataSchema), // ADD THIS LINE
  async (req, res) => {
    // ...
  }
);
```
````

````

### ❌ Missing Expected Output
```markdown
Run the tests
````

### ✅ With Expected Output

````markdown
**Step 2: Run test to verify it fails**

```bash
npm test -- waterfall.test.ts
```
````

Expected output:

```
FAIL  client/src/lib/__tests__/waterfall.test.ts
  changeWaterfallType
    ✕ converts AMERICAN to EUROPEAN waterfall

  ● Function changeWaterfallType does not exist
```

````

## Integration with Other Skills

### With Brainstorming
1. Use **brainstorming** to create design
2. Save design to `docs/plans/YYYY-MM-DD-<feature>-design.md`
3. Use **writing-plans** to create implementation plan
4. Save plan to `docs/plans/YYYY-MM-DD-<feature>.md`

### With Memory Management
Track plan progress in memory-management notes:

```markdown
## Implementation Progress: European Waterfall

**Plan**: docs/plans/2025-11-06-european-waterfall.md

**Status**:
- [x] Task 1: Cache key generation (commit abc123)
- [x] Task 2: Get/set operations (commit def456)
- [ ] Task 3: Worker integration (in progress)
- [ ] Task 4: Cache invalidation (pending)

**Issues**:
- Task 2 revealed edge case with large payloads (documented)
````

### With Continuous Improvement

After executing plan:

```markdown
What worked well?

- Granular tasks made progress visible
- Complete code examples prevented ambiguity
- TDD cycle caught bugs early

What was inefficient?

- Task 3 was too large (should have been 2 tasks)
- Missing dependency on Redis setup

Next time:

- Break down tasks more (aim for 2-3 minutes each)
- Include setup/teardown in plan
- Add troubleshooting section for common issues
```

## Summary

**Plan Structure**:

1. Required header with goal, architecture, tech stack
2. Tasks broken into 2-5 minute steps
3. Each step: Test → Run → Implement → Verify → Commit

**Key Principles**: DRY, YAGNI, TDD, Frequent Commits

**Execution**: Offer choice of subagent-driven or parallel session

**Save Location**: `docs/plans/YYYY-MM-DD-<feature-name>.md`
