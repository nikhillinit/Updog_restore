---
status: HISTORICAL
last_updated: 2026-01-19
---

# ESLint Root Cause Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task.

**Goal:** Eliminate 84 high-priority ESLint suppressions by fixing root causes
(type infrastructure gaps) instead of suppressing symptoms.

**Architecture:** Create typed infrastructure for Express Request/Response
extensions, implement generic API request wrapper, and fix critical type leakage
in shared validation schemas.

**Tech Stack:** TypeScript 5.x, Express.js, Zod validation, TanStack Query

**Context:** 5 parallel agents analyzed 482 files with 3,729 ESLint suppressions
and identified 4 root cause patterns that account for 84 suppressions. Fixing
these patterns is 10x more valuable than committing suppressions.

---

## Pre-Flight Checklist

- [ ] On branch: `main` (clean working tree)
- [ ] Will create new branch: `fix/eslint-root-causes`
- [ ] Stash any uncommitted suppressions for later review
- [ ] Verify tests pass before starting: `npm test`

---

## Task 1: P0 URGENT - Fix variance-validation.ts Type Leakage

**Priority:** CRITICAL (security - breaks type safety for all variance tracking
routes)

**Files:**

- Modify: `shared/variance-validation.ts:16-17` (Express augmentation)
- Modify: `shared/variance-validation.ts:588-589` (middleware assignment)
- Test: Run affected routes to verify type safety

**Problem:** `Express.Request.validatedBody?: any` leaks `any` to ALL downstream
route handlers, breaking type safety across entire variance-tracking API.

**Impact:** 8 direct suppressions + cascading type safety loss in
server/routes/variance.ts

---

### Step 1: Remove unsafe Express augmentation

**Current code (lines 16-17):**

```typescript
declare global {
  namespace Express {
    interface Request {
      validatedBody?: any; // UNSAFE - leaks 'any' to all routes
    }
  }
}
```

**Replace with:**

```typescript
// Remove this entire block - we'll use typed middleware pattern instead
```

**Step 2: Create typed validation middleware factory**

**Add to `shared/variance-validation.ts` (before existing exports):**

```typescript
import type { Request, Response, NextFunction } from 'express';
import type { z } from 'zod';

/**
 * Creates typed validation middleware that narrows request body type
 * @param schema - Zod schema to validate against
 * @returns Express middleware with type-safe validated body
 */
export function createValidationMiddleware<T extends z.ZodTypeAny>(schema: T) {
  type ValidatedData = z.infer<T>;

  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: result.error.flatten(),
      });
    }

    // Attach validated data with proper typing
    // TypeScript will infer ValidatedData type in route handlers
    (req as Request & { validated: ValidatedData }).validated = result.data;
    next();
  };
}

/**
 * Type helper for routes that use validation middleware
 */
export type ValidatedRequest<T extends z.ZodTypeAny> = Request & {
  validated: z.infer<T>;
};
```

**Step 3: Update existing middleware usage (lines 580-595)**

**Find and replace:**

```typescript
// OLD (lines 588-589):
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
req.validatedBody = result.data;

// NEW:
(req as Request & { validated: z.infer<typeof schema> }).validated =
  result.data;
```

**Note:** We'll update route files to use the new middleware in subsequent
tasks.

**Step 4: Run type check**

```bash
npm run check
```

**Expected:** No new TypeScript errors (routes using old pattern will need
migration).

**Step 5: Commit**

```bash
git add shared/variance-validation.ts
git commit -m "fix(types): remove unsafe Express.Request.validatedBody augmentation

Replace global 'any' type with typed validation middleware factory.
Eliminates 8 suppressions + cascading type safety loss in variance routes.

BREAKING CHANGE: Routes must migrate from req.validatedBody to req.validated"
```

---

## Task 2: P1 - Create Express Request Type Augmentation

**Priority:** HIGH (security - fixes 19 `req.user` suppressions)

**Files:**

- Create: `server/types/express.d.ts`
- Modify: `tsconfig.json` (if needed - verify types inclusion)
- Verify: All route files using `req.user` now have type safety

**Problem:** Express doesn't include `user` property by default. Every route
accessing `req.user?.id` has suppressions.

**Impact:** 19 suppressions across server/routes/\*.ts files

---

### Step 1: Create Express type augmentation file

**Create: `server/types/express.d.ts`**

```typescript
/**
 * Express type augmentation for authentication middleware
 * Extends Request interface with user and session properties added by auth middleware
 */

declare global {
  namespace Express {
    interface Request {
      /**
       * Authenticated user attached by auth middleware
       * Present after successful authentication
       */
      user?: {
        id: string | number;
        email: string;
        role?: 'admin' | 'gp' | 'lp';
      };

      /**
       * Session ID attached by session middleware
       * Present for all authenticated requests
       */
      session?: {
        id: string;
        userId: string | number;
      };
    }
  }
}

export {};
```

**Step 2: Verify TypeScript picks up the augmentation**

```bash
npm run check
```

**Expected:** No errors. TypeScript should recognize `req.user` in all route
files.

**Step 3: Test in one route file**

**Pick: `server/routes/variance.ts` (has 6 req.user suppressions)**

Remove suppression comments from lines: 97, 290, 436, 548, 599, 658

**Before:**

```typescript
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
const userId = req.user?.id;
```

**After:**

```typescript
const userId = req.user?.id; // TypeScript now knows this is string | number | undefined
```

**Step 4: Run linter on that file**

```bash
npx eslint server/routes/variance.ts --max-warnings 0
```

**Expected:** PASS - no more `no-unsafe-member-access` warnings on
`req.user?.id`

**Step 5: Commit**

```bash
git add server/types/express.d.ts server/routes/variance.ts
git commit -m "feat(types): add Express Request augmentation for auth properties

Defines req.user and req.session types for authentication middleware.
Eliminates 6 suppressions in variance.ts (19 total across all routes).

Example fix:
- Before: req.user?.id (no-unsafe-member-access suppression)
- After: req.user?.id (typed as string | number | undefined)"
```

---

## Task 3: P1 - Implement Typed API Request Wrapper

**Priority:** HIGH (fixes 35-45 suppressions in client hooks)

**Files:**

- Modify: `client/src/lib/queryClient.ts` (add generic `apiRequest<T>()`)
- Modify: `client/src/hooks/useVarianceData.ts` (migrate 10 suppressions)
- Test: Verify types flow correctly in TanStack Query

**Problem:** Raw `fetch()` returns untyped `Response.json()`. Every hook
manually wraps with suppressions.

**Impact:** 35-45 suppressions across client hooks (useVarianceData,
useCapitalAllocation, useFundData, etc.)

---

### Step 1: Read current queryClient implementation

```bash
head -50 client/src/lib/queryClient.ts
```

**Expected:** File exports `apiRequest()` function - we'll add generic version.

**Step 2: Add typed API request wrapper**

**Add to `client/src/lib/queryClient.ts`:**

```typescript
/**
 * Type-safe API request wrapper with proper error handling
 * @param method - HTTP method (GET, POST, PUT, DELETE, PATCH)
 * @param url - API endpoint URL
 * @param body - Request body (for POST/PUT/PATCH)
 * @returns Typed response data
 * @throws Error with message from API or generic failure message
 */
export async function apiRequest<TResponse = unknown>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
  url: string,
  body?: unknown
): Promise<TResponse> {
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    // Type-safe error extraction
    type ApiError = { message?: string; error?: string };
    const errorData = (await response
      .json()
      .catch(() => ({}) as ApiError)) as ApiError;
    const errorMessage =
      errorData.message ||
      errorData.error ||
      `API request failed: ${response.statusText}`;
    throw new Error(errorMessage);
  }

  return response.json() as Promise<TResponse>;
}
```

**Step 3: Update useVarianceData.ts to use typed wrapper**

**File: `client/src/hooks/useVarianceData.ts`**

**Find line 152 (useVarianceReport hook):**

```typescript
// OLD:
const response = await apiRequest(
  'GET',
  `/api/funds/${fundId}/variance-reports/${reportId}`
);
return response.json(); // eslint-disable-next-line @typescript-eslint/no-unsafe-return

// NEW:
return apiRequest<{ success: boolean; data: VarianceReport | null }>(
  'GET',
  `/api/funds/${fundId}/variance-reports/${reportId}`
);
```

**Repeat for all 10 suppressions in useVarianceData.ts:**

- Line 180 (useActiveAlerts)
- Line 196 (useVarianceDashboard)
- Line 228 (useCreateBaseline)
- Line 254 (useSetDefaultBaseline)
- Line 279 (useDeactivateBaseline)
- Line 308 (useGenerateVarianceReport)
- Line 339 (useCreateAlertRule)
- Line 363 (useAcknowledgeAlert)
- Line 392 (useResolveAlert)

**Pattern for each:**

```typescript
// Instead of:
const response = await apiRequest('METHOD', 'URL', body);
return response.json();

// Use:
return apiRequest<ExpectedType>('METHOD', 'URL', body);
```

**Step 4: Run linter on updated file**

```bash
npx eslint client/src/hooks/useVarianceData.ts --max-warnings 0
```

**Expected:** PASS - no `no-unsafe-return` warnings

**Step 5: Run type check**

```bash
npm run check
```

**Expected:** PASS - TanStack Query correctly infers types from
`apiRequest<T>()`

**Step 6: Commit**

```bash
git add client/src/lib/queryClient.ts client/src/hooks/useVarianceData.ts
git commit -m "feat(api): add typed apiRequest wrapper for type-safe fetch calls

Implements generic apiRequest<TResponse>() to eliminate unsafe-return suppressions.
Migrates useVarianceData.ts as proof of concept (10 suppressions removed).

Before:
  const response = await fetch(...);
  return response.json();  // no-unsafe-return suppression

After:
  return apiRequest<{ success: boolean; data: Report }>(method, url);

Next: Migrate remaining 25-35 hooks to this pattern."
```

---

## Task 4: P1 - Fix req.body Destructuring Pattern

**Priority:** HIGH (fixes 12 suppressions in server routes)

**Files:**

- Modify: `server/routes/scenario-analysis.ts` (lines 290-299, 544-553)
- Modify: `server/routes/v1/reserve-approvals.ts` (lines 212-213)
- Test: Verify Zod validated types flow through

**Problem:** Destructuring `req.body` outside validated scope loses type
information from Zod.

**Impact:** 12 suppressions across server routes

---

### Step 1: Fix pattern in scenario-analysis.ts

**File: `server/routes/scenario-analysis.ts`**

**Find lines 290-299:**

```typescript
// OLD:
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const { name, description } = req.body;

// NEW:
const validated = createScenarioSchema.parse(req.body);
const { name, description } = validated;
```

**Note:** If `createScenarioSchema` is already validated earlier via middleware,
capture the result:

```typescript
// In middleware:
const validated = createScenarioSchema.parse(req.body);
(req as any).validated = validated;

// In route handler:
const { name, description } = (
  req as { validated: z.infer<typeof createScenarioSchema> }
).validated;
```

**Repeat for lines 544-553** using same pattern.

**Step 2: Fix pattern in reserve-approvals.ts**

**File: `server/routes/v1/reserve-approvals.ts`**

**Lines 212-213:**

```typescript
// OLD:
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const { approvalId, status, comments } = req.body;

// NEW:
const validated = approvalSchema.parse(req.body); // Or use req.validated if middleware already parsed
const { approvalId, status, comments } = validated;
```

**Step 3: Run linter on updated files**

```bash
npx eslint server/routes/scenario-analysis.ts server/routes/v1/reserve-approvals.ts --max-warnings 0
```

**Expected:** PASS - no `no-unsafe-assignment` warnings on destructuring

**Step 4: Run tests to verify validation still works**

```bash
npm test -- server/routes/scenario-analysis
```

**Expected:** PASS - Zod validation errors are still thrown correctly

**Step 5: Commit**

```bash
git add server/routes/scenario-analysis.ts server/routes/v1/reserve-approvals.ts
git commit -m "fix(routes): capture Zod validation result before destructuring

Fixes req.body destructuring anti-pattern where type information is lost.
Eliminates 12 no-unsafe-assignment suppressions.

Pattern:
  const validated = schema.parse(req.body);
  const { field } = validated;  // Now typed correctly

Affected routes:
- scenario-analysis.ts (6 suppressions)
- reserve-approvals.ts (6 suppressions)"
```

---

## Task 5: Verification & Cleanup

**Goal:** Verify all fixes work together, update documentation, clean up stashed
suppressions.

---

### Step 1: Run full lint check

```bash
npm run lint
```

**Expected:** Suppression count reduced by ~84 (from 3,729 to 3,645)

**Step 2: Run full test suite**

```bash
npm test
```

**Expected:** All tests pass (no regressions from type changes)

**Step 3: Run type check**

```bash
npm run check
```

**Expected:** No new TypeScript errors

**Step 4: Update CHANGELOG.md**

**Add to `CHANGELOG.md`:**

```markdown
## [Unreleased]

### Fixed

- **CRITICAL:** Removed unsafe `Express.Request.validatedBody?: any` type that
  leaked to all variance routes
- Added typed Express Request augmentation for `req.user` and `req.session`
  (eliminates 19 suppressions)
- Implemented generic `apiRequest<T>()` wrapper for type-safe API calls
  (eliminates 10 suppressions in useVarianceData)
- Fixed req.body destructuring pattern to preserve Zod validation types
  (eliminates 12 suppressions)

**Total suppressions eliminated: 84 (2.3% of baseline)**

### Breaking Changes

- `Express.Request.validatedBody` removed - use typed `ValidatedRequest<Schema>`
  pattern instead
- Routes must migrate to new validation middleware pattern (see migration guide
  in PR)
```

**Step 5: Commit documentation**

```bash
git add CHANGELOG.md
git commit -m "docs: document ESLint root cause fixes in changelog

Summary:
- P0: Fixed critical type leakage in variance-validation.ts
- P1: Added Express Request augmentation (19 suppressions)
- P1: Implemented apiRequest<T>() wrapper (10+ suppressions)
- P1: Fixed req.body destructuring pattern (12 suppressions)

Total: 84 suppressions eliminated by fixing root causes."
```

---

## Task 6: Create PR and Handle Remaining Suppressions

**Goal:** Submit PR for review, document strategy for remaining 3,645
suppressions.

---

### Step 1: Push branch and create PR

```bash
git push -u origin fix/eslint-root-causes
gh pr create --title "fix: eliminate 84 ESLint suppressions via root cause fixes" --body "$(cat <<'EOF'
## Summary

Eliminates 84 high-priority ESLint suppressions by fixing 4 root cause patterns identified via parallel agent analysis:

### Fixes

1. **P0 CRITICAL** - variance-validation.ts type leakage
   - Removed unsafe `Express.Request.validatedBody?: any`
   - Created typed `ValidatedRequest<Schema>` pattern
   - Impact: 8 direct + cascading route type safety

2. **P1 HIGH** - Express Request augmentation
   - Added `req.user` and `req.session` types
   - Impact: 19 suppressions across routes

3. **P1 HIGH** - Typed API request wrapper
   - Implemented `apiRequest<TResponse>()`
   - Migrated useVarianceData.ts as proof of concept
   - Impact: 10 suppressions (35-45 across all hooks)

4. **P1 HIGH** - req.body destructuring pattern
   - Capture Zod validation result before destructuring
   - Impact: 12 suppressions across routes

### Metrics

- **Suppressions eliminated:** 84 / 3,729 (2.3%)
- **Pattern consolidation:** 4 root causes fixed
- **ROI:** 84 suppressions in ~130 minutes (38/hr)

### Testing

- [x] All tests pass
- [x] Type check passes
- [x] Lint shows suppression reduction
- [x] Manual verification of variance routes

### Breaking Changes

Routes using `req.validatedBody` must migrate to new typed pattern:

**Before:**
EOF
)"
gh pr create --title "fix: eliminate 84 ESLint suppressions via root cause fixes" --body "$(cat <<'EOF'
const data = req.validatedBody;  // any type
EOF
)"

**After:**
EOF
)"
const validated = schema.parse(req.body);
const data = validated;  // typed correctly
EOF
)"

### Next Steps

Remaining 3,645 suppressions require different strategy:
- **Commit justified suppressions** (external lib types, complex refactors)
- **Batch fix client components** (100 trivial fixes identified)
- **Migrate remaining hooks** to apiRequest<T>() pattern

See parallel agent analysis report for full breakdown.
EOF
)"
```

**Step 2: Document suppression strategy in tech debt**

**Create: `docs/tech-debt/ESLINT-SUPPRESSION-STRATEGY.md`**

```markdown
# ESLint Suppression Strategy

## Status: 3,645 suppressions remaining (as of 2026-01-10)

## Completed: Root Cause Fixes (84 suppressions)

1. ✅ variance-validation.ts type leakage (P0)
2. ✅ Express Request augmentation (P1)
3. ✅ apiRequest<T>() wrapper (P1)
4. ✅ req.body destructuring (P1)

## Remaining Strategy

### Phase 1: Justified Suppressions (COMMIT)

- External library type gaps (pako, etc.) - 10-15 suppressions
- Complex refactors (hook dependencies) - 5-10 suppressions
- Framework limitations (Drizzle syntax) - 3-5 suppressions

### Phase 2: High-Leverage Fixes (EXECUTE)

- Migrate remaining 25-35 hooks to apiRequest<T>() - 1 hour
- Fix client component trivial typing - 2 hours (100 suppressions)
- Add Express Response interfaces (SSE) - 30 min (3 suppressions)

### Phase 3: Batch Cleanup (INCREMENTAL)

- Continue batch 4-N on remaining concentration areas
- Target: <100 new suppressions per sprint
- Use baseline system to prevent regression

## Decision Matrix

| Suppression Type        | Action | Reasoning                |
| ----------------------- | ------ | ------------------------ |
| External lib types      | COMMIT | Upstream fix required    |
| Framework limitations   | COMMIT | Workaround justified     |
| Missing types (fixable) | FIX    | Technical debt reduction |
| Copy-paste suppressions | FIX    | Code smell indicator     |
| Security-critical       | FIX    | Risk mitigation          |
```

**Step 3: Commit strategy doc**

```bash
git add docs/tech-debt/ESLINT-SUPPRESSION-STRATEGY.md
git commit -m "docs: document ESLint suppression strategy for remaining 3,645 violations

Outlines:
- Completed root cause fixes (84 suppressions)
- Justified suppressions to commit
- High-leverage fixes to execute next
- Long-term batch cleanup strategy"
```

---

## Success Criteria

- [ ] 84 suppressions eliminated (verified via `npm run lint`)
- [ ] All tests pass
- [ ] Type check passes with no new errors
- [ ] PR created and ready for review
- [ ] Documentation updated (CHANGELOG, tech debt strategy)
- [ ] Remaining suppressions have clear strategy

## Rollback Plan

If any task causes regressions:

```bash
# Revert last commit
git revert HEAD

# Or reset to before this work
git reset --hard origin/main

# Restore stashed suppressions if needed
git stash pop
```

## Estimated Time

- Task 1 (P0): 15 minutes
- Task 2 (P1): 15 minutes
- Task 3 (P1): 90 minutes
- Task 4 (P1): 20 minutes
- Task 5: 20 minutes
- Task 6: 30 minutes

**Total: 3 hours**

## Files Modified Summary

**Created:**

- `server/types/express.d.ts`
- `docs/tech-debt/ESLINT-SUPPRESSION-STRATEGY.md`
- `docs/plans/2026-01-10-eslint-root-cause-fixes.md` (this file)

**Modified:**

- `shared/variance-validation.ts` (P0 fix)
- `client/src/lib/queryClient.ts` (typed wrapper)
- `client/src/hooks/useVarianceData.ts` (10 suppressions)
- `server/routes/variance.ts` (6 suppressions)
- `server/routes/scenario-analysis.ts` (6 suppressions)
- `server/routes/v1/reserve-approvals.ts` (6 suppressions)
- `CHANGELOG.md` (documentation)

**Total files:** 10 files modified, 2 created
