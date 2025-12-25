# Week 2.5 Phase 3 - Test Failure Resolution (Continuation v3)

**Last Updated**: 2025-12-20
**Current Branch**: `week2-foundation-hardening`
**Status**: Type Safety Complete, Ready for Remaining Test Repairs

---

## Quick Start (Copy-Paste This)

```
Read .claude/prompts/week2.5-phase3-continuation-v3.md for context, then continue Week 2.5 Phase 3 test failure resolution.

Current state: Type safety violations resolved (79 → 0), 71 service tests passing, ~138 remaining failures to fix.

Target: Reduce remaining failures from ~138 to <100 (original goal: 209 → <100).
```

---

## Session Context: What Just Happened

### Major Achievements [x]

**Type Safety Infrastructure Complete** (Commit [3b2c67a9](../../../commit/3b2c67a9))
- Created [server/db/typed-query.ts](../../../server/db/typed-query.ts) helper utility
- 4 typed wrappers: `typedFindFirst`, `typedFindMany`, `typedInsert`, `typedUpdate`
- Fixed 79 ESLint violations (1 error, 78 warnings → 0)
- All quality gates passing

**Quality Gate Protocol Added** (Commit [daeab461](../../../commit/daeab461))
- Created [.claude/WORKFLOW.md](../../WORKFLOW.md#quality-gate-protocol) - Mandatory quality gate protocol
- Created [.claude/commands/pre-commit-check.md](../../commands/pre-commit-check.md) - Pre-commit validation command
- Updated agent instructions: [test-repair.md](../../agents/test-repair.md), [general-purpose.md](../../agents/general-purpose.md)
- Prevents future linting violations at source

**Service Layer Complete** (Commit [488967fd](../../../commit/488967fd))
- Snapshot service: 19/19 tests passing
- Lot service: 20/20 tests passing
- Variance tracking: 32/32 tests passing
- **Total: 71/71 service tests passing**

**Linter Cleanup** (Commit [ab0cbd92](../../../commit/ab0cbd92))
- Deleted `.eslintignore` (migrated to `eslint.config.js`)
- Fixed `strategy-signature.ts`: Replaced `any` with proper types
- Formatted 18 files with prettier
- Clean working tree

### Recent Commits (Last 4)

1. **ab0cbd92** - chore: apply linter auto-fixes and resolve type safety violations
2. **3b2c67a9** - fix(services): resolve all ESLint type safety violations in service layer
3. **daeab461** - docs(quality): add mandatory quality gate protocol to prevent linting violations
4. **488967fd** - fix(tests): implement snapshot and lot services - 71 tests fixed

### Test Quality Status

**Service Tests**: 71/71 passing [x]
- Variance Tracking: 32/32 (BaselineService, VarianceCalculationService, AlertRuleEvaluationService)
- Snapshot Service: 19/19 (create, update, list, compare)
- Lot Service: 20/20 (create, list, calculateCostBasis)

**Overall Status**:
- Server Project: ~1585 passing, ~138 failing (estimated - down from 227)
- Client Project: ~1571 passing (Phase 2 baseline maintained)
- TypeScript: 387 errors (baseline maintained, 0 new)

**Phase 3 Progress**:
- Original Goal: 209 failures → <100
- Fixed so far: 71 tests (service layer)
- Remaining: ~138 failures
- **NEW Target: 138 → <100** (39 more tests to fix)

---

## Your Mission: Continue Phase 3 Test Repairs

### Strategic Approach: Identify High-Impact Targets

Before diving into fixes, identify which test failures will give you the most value:

1. **Run Full Server Test Suite** (get current failure list)
   ```bash
   npm test -- --project=server --run 2>&1 | grep "FAIL" | head -40
   ```

2. **Categorize Failures by Type**:
   - Service tests with "Not implemented" errors (quick wins)
   - Service tests with similar patterns to variance/snapshot/lot (apply proven workflow)
   - API endpoint tests (may require service + route fixes)
   - Integration tests (may be blocked by missing implementations)

3. **Pick Next Targets** (2-3 files for this session):
   - Look for files with 10+ failures (high impact)
   - Prefer service layer tests (proven workflow available)
   - Check for similar patterns to already-fixed tests

### Recommended Workflow: Proven Patterns

Use the **successful workflow** from variance/snapshot/lot fixes:

1. **Service-First Debugging**
   - Check service implementations BEFORE assuming schema issues
   - Verify methods exist and return correct data types
   - Use `rg "db\." server/services/[service-name]` to find actual usage

2. **vi.mock() Pattern Fixes**
   - Mock definition MUST come before import
   - Use inline factory pattern (not external variables)
   - Capture inserted data instead of hardcoding
   - Example: [tests/unit/services/variance-tracking.test.ts](../../../tests/unit/services/variance-tracking.test.ts)

3. **Type Safety with Typed Helpers**
   ```typescript
   import { typedFindFirst, typedFindMany, typedInsert } from '../db/typed-query';
   import { tableName, type TableType } from '@shared/schema';

   const result = await typedFindFirst<typeof tableName>(
     db.query.tableName.findFirst({ where: eq(tableName.id, id) })
   );
   ```

4. **Service Implementation Checklist**
   - [ ] All required schema fields included
   - [ ] Default values for optional parameters (`?? null`, `?? false`)
   - [ ] Null/undefined validation
   - [ ] Type conversions (number → string for Drizzle decimal fields)
   - [ ] Return types match schema expectations

5. **Staged Verification**
   ```bash
   # 1. Verify specific file passes
   npm test tests/unit/services/[FILE].test.ts -- --run

   # 2. Check for regressions in server project
   npm test -- --project=server --run | tail -20

   # 3. Verify TypeScript baseline maintained
   npm run check | tail -5
   ```

### High-Priority Target Examples

**Estimated Quick Wins** (check if these exist):
- [ ] API endpoint tests (may just need route wiring)
- [ ] Service tests with "Not implemented" errors
- [ ] Tests with similar patterns to variance/snapshot/lot

**To Investigate**:
```bash
# Find failing test files
npm test -- --project=server --run 2>&1 | grep "FAIL.*test.ts" | cut -d' ' -f2 | sort | uniq -c | sort -rn | head -10

# Check for common error patterns
npm test -- --project=server --run 2>&1 | grep -A5 "FAIL" | grep "Error:" | sort | uniq -c | sort -rn
```

---

## Tools & Workflows Available

### Use the Bugfix Agent (Highly Effective)

The `development-essentials:bugfix` agent is **proven effective** for service test fixes:

```
Use Task tool with subagent_type='development-essentials:bugfix' for systematic test repairs.

Target: tests/unit/services/[FILENAME].test.ts

Apply patterns from variance/snapshot/lot fixes:
- Check service implementations for missing methods
- Fix vi.mock() hoisting violations
- Use typed query helpers from server/db/typed-query.ts
- Convert decimal fields to strings (Drizzle ORM)

Success criteria:
- All tests in file passing
- No TypeScript errors
- No regressions in server project tests
```

**When to Use**:
- Service test files with multiple failures (10+ tests)
- Tests with "Not implemented" or "Cannot read properties" errors
- Tests with similar patterns to already-fixed files

### Alternative: Manual Systematic Workflow

If you prefer hands-on control:

1. **Identify Next Target**
   ```bash
   npm test -- --project=server --run 2>&1 | grep "FAIL" | head -20
   ```

2. **Run Specific Test to See Details**
   ```bash
   npm test tests/unit/services/[FILE].test.ts -- --run
   ```

3. **Analyze Failure Patterns**
   - vi.mock() hoisting issues? (mock before import)
   - Mock structure issues? (check return value chains)
   - Service implementation gaps? (verify methods exist)
   - Type mismatches? (use typed helpers)

4. **Apply Targeted Fixes** (see Technical Patterns below)

5. **Verify & Commit**
   ```bash
   npm test tests/unit/services/[FILE].test.ts -- --run
   npm run check
   git add [files] && git commit -m "fix(tests): ..."
   ```

---

## Technical Patterns (Copy These)

### 1. Correct vi.mock() Pattern

**From variance-tracking.test.ts** (GOOD example):

```typescript
vi.mock('../../../server/db', () => {
  const valuesMock = vi.fn((data) => ({
    returning: vi.fn(() => Promise.resolve([{ id: 'test-id', ...data }]))
  }));

  return {
    db: {
      query: { /* ... */ },
      insert: vi.fn(() => ({ values: valuesMock })),
      update: vi.fn(() => ({ /* ... */ }))
    }
  };
});

import { db } from '../../../server/db'; // AFTER mock
```

### 2. Service Implementation Pattern

**From lot-service.ts** (GOOD example):

```typescript
import { typedFindFirst, typedInsert } from '../db/typed-query';
import { investmentLots, type InvestmentLot } from '@shared/schema';

async create(data: InsertInvestmentLot): Promise<InvestmentLot> {
  // Check for existing lot (idempotency)
  const existing = await typedFindFirst<typeof investmentLots>(
    db.query.investmentLots.findFirst({
      where: and(
        eq(investmentLots.investmentId, data.investmentId),
        eq(investmentLots.lotType, data.lotType)
      )
    })
  );

  if (existing) return existing;

  // Create new lot
  const [lot] = await typedInsert<typeof investmentLots>(
    db.insert(investmentLots)
      .values({
        ...data,
        // Convert decimals to strings for Drizzle
        shares: data.shares?.toString() ?? null,
        costBasis: data.costBasis?.toString() ?? null
      })
      .returning()
  );

  if (!lot) throw new Error('Failed to create lot');
  return lot;
}
```

### 3. Drizzle Decimal Type Handling

**Schema**: `decimal("field")` → **TypeScript**: `string`

```typescript
// [X] WRONG
totalValueVariance: variances.totalValueVariance,  // number

// [x] CORRECT
totalValueVariance: variances.totalValueVariance?.toString() ?? null,  // string
```

### 4. Typed Query Helper Usage

```typescript
import { typedFindFirst, typedFindMany, typedInsert, typedUpdate } from '../db/typed-query';
import { forecastSnapshots, type ForecastSnapshot } from '@shared/schema';

// findFirst
const snapshot = await typedFindFirst<typeof forecastSnapshots>(
  db.query.forecastSnapshots.findFirst({ where: eq(forecastSnapshots.id, id) })
);

// findMany
const snapshots = await typedFindMany<typeof forecastSnapshots>(
  db.query.forecastSnapshots.findMany({ where: eq(forecastSnapshots.fundId, fundId) })
);

// insert
const [newSnapshot] = await typedInsert<typeof forecastSnapshots>(
  db.insert(forecastSnapshots).values(data).returning()
);

// update
const [updated] = await typedUpdate<typeof forecastSnapshots>(
  db.update(forecastSnapshots).set(data).where(eq(forecastSnapshots.id, id)).returning()
);
```

---

## Quality Gate Protocol (MANDATORY)

### Pre-Commit Verification

Before ANY commit, run all three quality gates:

```bash
# 1. Linting - MUST show 0 errors, 0 warnings
npm run lint

# 2. Type Checking - MUST show 0 type errors
npm run check

# 3. Tests - MUST pass all tests
npm test -- --run
```

**Use `/pre-commit-check` command for automated validation.**

### Type Safety Standards

- NEVER use `any` type (`@typescript-eslint/no-explicit-any: 'error'`)
- Use `unknown` + type guards for dynamic data
- Use proper Drizzle ORM types from `@shared/schema`
- Use typed query helpers from `server/db/typed-query.ts`

### Commit Protocol

- **NEVER** use `git commit --no-verify` to bypass hooks
- **NEVER** commit with known linting violations
- **NEVER** defer type safety fixes to "followup commit"
- Fix all violations inline before committing

See [.claude/WORKFLOW.md](../../WORKFLOW.md#quality-gate-protocol) for complete protocol.

---

## Key Reference Files

### Session Documentation

**This Session**:
- [Week 2.5 Phase 3 PR Summary](../../docs/plans/WEEK2.5-PHASE3-PR-SUMMARY.md) - Complete Phase 3 documentation

**Previous Phases**:
- [Phase 2 Success](../../docs/plans/WEEK2.5-PHASE2-SUCCESS.md) - React hooks (517 tests fixed)
- [Phase 1 Results](../../docs/plans/WEEK2.5-FOUNDATION-HARDENING-RESULTS.md) - TypeScript baseline
- [Week 2.5 Index](../../docs/plans/WEEK2.5-INDEX.md) - Complete navigation

### Technical References

**Type Safety Infrastructure**:
- [server/db/typed-query.ts](../../../server/db/typed-query.ts) - Typed query helper utility
- [.claude/WORKFLOW.md](../../WORKFLOW.md#type-safety-rules) - Type safety rules
- [cheatsheets/anti-pattern-prevention.md](../../../cheatsheets/anti-pattern-prevention.md) - 24 cataloged anti-patterns

**Working Examples**:
- [tests/unit/services/variance-tracking.test.ts](../../../tests/unit/services/variance-tracking.test.ts) - GOOD vi.mock() pattern
- [server/services/variance-tracking.ts](../../../server/services/variance-tracking.ts) - Complete service implementation
- [server/services/lot-service.ts](../../../server/services/lot-service.ts) - Typed helpers usage
- [server/services/snapshot-service.ts](../../../server/services/snapshot-service.ts) - Idempotency + optimistic locking

---

## Verification Commands

### Find Next Targets

```bash
# Get current failure count and file list
npm test -- --project=server --run 2>&1 | grep "FAIL.*test.ts" | wc -l
npm test -- --project=server --run 2>&1 | grep "FAIL" | head -30

# Find common error patterns
npm test -- --project=server --run 2>&1 | grep -A3 "FAIL" | grep "Error:" | sort | uniq -c | sort -rn

# Check specific test file
npm test tests/unit/services/[FILE].test.ts -- --run
```

### Quality Checks

```bash
# Verify lint clean
npm run lint

# Check TypeScript baseline (must maintain 387)
npm run check | tail -5

# Run service tests only
npm test tests/unit/services/ -- --run

# Full server project test suite
npm test -- --project=server --run
```

### Git Status

```bash
# Check current branch and commits
git log --oneline -5

# Verify clean working tree
git status

# Check uncommitted changes
git diff --stat
```

---

## Success Criteria

### Minimum Viable (This Session)

- [ ] Fix 2-3 test files (20-40 tests passing)
- [ ] Reduce total failures: ~138 → ~100-120
- [ ] Maintain test baseline (71/71 service tests still passing)
- [ ] TypeScript errors remain at 387 (0 new)
- [ ] Build passing

### Moderate Goal (Recommended)

- [ ] Fix 3-5 test files (40-60 tests passing)
- [ ] **Reduce total failures: ~138 → <100** (PHASE 3 TARGET MET)
- [ ] All quality gates passing
- [ ] Document any new patterns discovered

### Stretch Goal

- [ ] Fix all remaining test failures (~138 → 0)
- [ ] Create PR for Week 2.5 Phase 1-3 complete
- [ ] Update Phase 3 documentation with final results

---

## Troubleshooting Guide

### If Tests Parse But Fail with Assertion Errors

- [x] **Good**: Syntax is fixed
- [x]� **Next**: Check service implementations (don't assume schema missing)
- [x]� **Pattern**: Read service code, verify methods exist and return correct data

### If Tests Fail with "Cannot read properties of undefined"

- [x]� **Check**: Mock structure matches actual Drizzle query chains
- [x]� **Check**: Service methods actually implemented
- [x]� **Pattern**: Use `rg "db\." server/services/[service-name]` to find actual usage

### If TypeScript Errors After Service Changes

- [x]� **Check**: Schema field types (decimal = string, not number)
- [x]� **Check**: Field names match schema exactly
- [x]� **Pattern**: Search schema file: `rg "export const [tableName]" shared/schema.ts`

### If Server Tests Regress

- [WARN] **Stop**: Don't proceed until regression identified
- [x]� **Check**: What changed in shared service code
- [x]� **Pattern**: Run just the regressed file to isolate issue

---

## Git Status & Branch Info

### Current Branch
- **Name**: `week2-foundation-hardening`
- **Base**: `main`
- **Status**: Clean, all work committed

### Recent Commits (Last 4)
1. **ab0cbd92** - chore: apply linter auto-fixes and resolve type safety violations
2. **3b2c67a9** - fix(services): resolve all ESLint type safety violations in service layer
3. **daeab461** - docs(quality): add mandatory quality gate protocol to prevent linting violations
4. **488967fd** - fix(tests): implement snapshot and lot services - 71 tests fixed

### Quality Baseline
- Lint: 0 errors, 0 warnings [x]
- Tests: 71/71 service tests passing [x]
- TypeScript: 387 baseline maintained [x]
- Working Tree: Clean [x]

---

## Recommended Session Flow

### Step 1: Identify Next Targets (5-10 min)

```bash
# Get current failure landscape
npm test -- --project=server --run 2>&1 | grep "FAIL" | head -40

# Categorize by file
npm test -- --project=server --run 2>&1 | grep "FAIL.*test.ts" | cut -d' ' -f2 | sort | uniq -c | sort -rn | head -10

# Pick 2-3 high-impact files (10+ failures each)
```

### Step 2: Apply Fixes (40-60 min)

**Option A: Use Bugfix Agent** (Recommended for 10+ test failures)
```
Task(subagent_type='development-essentials:bugfix', prompt='
Fix all test failures in tests/unit/services/[FILENAME].test.ts.

Apply proven patterns:
1. Check service implementation for missing methods
2. Fix vi.mock() hoisting (mock before import)
3. Use typed query helpers from server/db/typed-query.ts
4. Convert decimal fields to strings

Success criteria:
- All tests in file passing
- No TypeScript errors
- No regressions in server tests
')
```

**Option B: Manual Workflow**
- Follow "Technical Patterns" section above
- Reference variance/snapshot/lot tests as templates
- Apply service-first debugging approach

### Step 3: Verification (5-10 min)

```bash
# Verify specific file passes
npm test tests/unit/services/[FILE].test.ts -- --run

# Check for regressions
npm test -- --project=server --run | tail -20

# TypeScript baseline
npm run check | tail -5
```

### Step 4: Commit & Iterate (5 min)

```bash
# Commit the fix
git add [files]
git commit -m "fix(tests): resolve [FILE] test failures"

# Continue to next file or stop for session
```

---

## Copy-Paste Prompts for Common Tasks

### Start with High-Impact File

```
Continue Week 2.5 Phase 3 test repairs.

Step 1: Identify the next test file with 10+ failures
Step 2: Use bugfix agent or manual workflow to fix all failures
Step 3: Verify quality gates and commit

Target: Reduce failures from ~138 to <100 (original Phase 3 goal).

Apply proven patterns from variance/snapshot/lot fixes.
```

### Systematic Multi-File Approach

```
Continue Phase 3 with systematic test repairs across 3-5 test files.

Use proven workflow:
- Service-first debugging
- vi.mock() hoisting corrections
- Typed query helper usage
- Drizzle decimal type conversions

Target: Fix 40-60 tests this session, reducing failures from ~138 to <100.

Verify quality gates before each commit.
```

### Quick Status Check

```
Quick status check for Week 2.5 Phase 3:

1. Run full server test suite, get current failure count
2. Categorize failures by type (service, API, integration)
3. Identify top 3 high-impact targets (10+ failures each)
4. Recommend next steps with specific file targets

Current baseline: 71/71 service tests passing, ~138 failures remaining.
Target: <100 failures.
```

### Final Push to Goal

```
Final push to complete Phase 3 goal: <100 test failures.

Current: ~138 failures
Target: <100 failures (39 tests to fix)

Strategy:
1. Identify remaining high-impact targets
2. Apply proven workflow in parallel if possible
3. Focus on quick wins (similar patterns to already-fixed tests)
4. Verify quality gates throughout

Once <100 achieved, prepare PR for merge.
```

---

**Generated**: 2025-12-20
**Session Type**: Phase 3 Continuation v3 (Type Safety Complete)
**Branch**: week2-foundation-hardening
**Starting Point**: 71/71 service tests passing, ~138 failures remaining
**Target**: <100 failures (39 tests to fix)
**Estimated Session Duration**: 60-90 minutes
**Recommended Agent**: development-essentials:bugfix
