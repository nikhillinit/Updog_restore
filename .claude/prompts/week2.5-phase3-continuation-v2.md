# Week 2.5 Phase 3 - Test Failure Resolution (Continuation v2)

**Last Updated**: 2025-12-20
**Current Branch**: `week2-foundation-hardening`
**Status**: Sidecar Eliminated, Ready for Systematic Test Repairs

---

## Quick Start (Copy-Paste This)

```
Read .claude/prompts/week2.5-phase3-continuation-v2.md for context, then continue Week 2.5 Phase 3 test failure resolution.

Current state: Sidecar architecture eliminated (dual React instances resolved), variance tracking tests fixed (32/32 passing), approximately 209 remaining failures in service layer tests.

Apply the proven Phase 3 workflow: service-first debugging, vi.mock() pattern fixes, targeted verification.
```

---

## Session Context: What Just Happened

### Major Achievement: Windows Sidecar Elimination [x]

**Commit**: [ce8cbc81](../../../commit/ce8cbc81)

The Windows junction-based sidecar architecture has been **completely eliminated**:
- [x] 0 junction links detected (all packages are real directories)
- [x] Dual React instances eliminated (resolves 517 hook errors)
- [x] npm install works without Windows Defender exclusions
- [x] 53 tools_local references → npx direct calls
- [x] Build passing (17.50s), TypeScript 387 baseline maintained

**What This Means**: The development environment is now stable. No more dual React instances causing hook violations. The sidecar workaround is gone forever.

### Recent Commits (Last Session)

1. **a7242229** - WaterfallStep performance fix (useDebounceDeep + type safety)
2. **ce8cbc81** - Windows sidecar elimination (8-phase migration)
3. **9cc09996** - Variance tracking test fixes (32/32 passing)
4. **6d922d75** - Updated PR summary documentation

### Test Quality Status

**Variance Tracking Tests**: 32/32 passing [x]
- BaselineService (8 tests)
- VarianceCalculationService (12 tests)
- AlertRuleEvaluationService (12 tests)

**Server Project**: 1585 passing, 227 failing
**Client Project**: ~1571 passing (Phase 2 baseline maintained)
**TypeScript**: 387 errors (baseline maintained, 0 new)

**Remaining Work**: ~209 test failures in service layer and API tests

---

## Your Mission: Continue Phase 3 Test Repairs

### Recommended Approach: Systematic Service Layer Fixes

Use the **proven workflow** from variance tracking test fixes:

1. **Service-first debugging**: Check service implementations before assuming schema issues
2. **vi.mock() pattern fixes**: Correct hoisting violations (mock before import)
3. **Mock enhancement**: Capture inserted data instead of hardcoding
4. **Type safety**: Convert Drizzle decimal fields to strings
5. **Targeted verification**: Run specific test file → project tests → verify no regression

### High-Priority Targets (Estimated Impact)

**Immediate** (Quick Wins):
- [ ] `tests/unit/services/snapshot-service.test.ts` (19 failures - "Not implemented")
- [ ] `tests/unit/services/lot-service.test.ts` (20 failures - similar pattern to variance tracking)

**Medium Priority**:
- [ ] API endpoint tests (variance-tracking-api.test.ts, etc.)
- [ ] Other service layer tests with vi.mock() issues

**Estimated Session Goal**: Fix 50-100 tests (2-3 service files)

---

## Recommended Tools & Workflows

### Use the Development-Essentials Bugfix Agent

The `development-essentials:bugfix` agent is **highly effective** for service test fixes:

```
Use Task tool with subagent_type='development-essentials:bugfix' for systematic test repairs.

The agent excels at:
- Analyzing service implementation gaps
- Fixing vi.mock() hoisting violations
- Completing missing service methods
- Type safety corrections (Drizzle decimal → string)

Proven success: Variance tracking 0/32 → 32/32 passing in one agent invocation.
```

**When to Use**:
- Service test files with "Not implemented" errors
- Tests with vi.mock() hoisting violations
- Service layer tests with similar patterns to variance tracking

### Alternative: Manual Systematic Workflow

If you prefer manual control:

```bash
# 1. Identify next failing test file
npm test -- --project=server --run 2>&1 | grep "FAIL" | head -20

# 2. Run specific test file to see failure details
npm test tests/unit/services/[FILE].test.ts -- --run

# 3. Analyze failure patterns (NOT schema first!)
# - vi.mock() hoisting issues?
# - Mock structure issues?
# - Service implementation gaps?
# - Type mismatches?

# 4. Apply targeted fixes (see patterns below)

# 5. Verify specific file passes
npm test tests/unit/services/[FILE].test.ts -- --run

# 6. Check for regressions
npm test -- --project=server --run

# 7. Verify TypeScript clean
npm run check
```

---

## Technical Patterns (Copy These)

### 1. Correct vi.mock() Pattern

**Critical Rule**: Mock definition MUST come before import

```typescript
// [x] CORRECT PATTERN (from variance-tracking.test.ts)
vi.mock('../../../server/db', () => {
  // Create persistent mock state
  const valuesMock = vi.fn((data) => ({
    returning: vi.fn(() => Promise.resolve([{
      id: 'test-id',
      ...data  // Spread actual data
    }]))
  }));

  return {
    db: {
      query: { /* ... */ },
      insert: vi.fn(() => ({ values: valuesMock })),
      update: vi.fn(() => ({ /* ... */ })),
    }
  };
});

import { db } from '../../../server/db'; // [x] After mock
```

**Add Test Helpers**:
```typescript
// Access mock data for assertions
valuesMock.__getLastInsertData = () =>
  valuesMock.mock.calls[valuesMock.mock.calls.length - 1]?.[0];
```

### 2. Service Implementation Checklist

When completing service methods (e.g., SnapshotService.create()):

- [ ] All required schema fields included in data objects
- [ ] Default values for optional parameters (`?? null`, `?? false`)
- [ ] Null/undefined validation
- [ ] Type conversions (number → string for Drizzle decimal fields)
- [ ] Return types match schema expectations
- [ ] Field names match schema exactly

**Example from VarianceCalculationService**:
```typescript
{
  baselineId: data.baselineId,
  comparisonSnapshotId: data.comparisonSnapshotId,
  totalValueVariance: variances.totalValueVariance?.toString() ?? null,  // Drizzle decimal
  irrVariance: variances.irrVariance?.toString() ?? null,
  moicVariance: variances.moicVariance?.toString() ?? null,
  varianceFactors: variances.varianceFactors ?? null,
  // ... other fields
}
```

### 3. Drizzle Decimal Type Handling

**Schema**: `decimal("field")` → TypeScript: `string`

```typescript
// [X] WRONG
totalValueVariance: variances.totalValueVariance,  // number

// [x] CORRECT
totalValueVariance: variances.totalValueVariance?.toString() ?? null,  // string
```

---

## Phase 3 Workflow Best Practices

### [X] What NOT to Do (Lessons Learned)

1. **Don't jump to database schema work** - Check service implementations first
2. **Don't assume schema is missing** - Verify it exists, then check service code
3. **Don't run full test suite for every fix** - Use staged verification
4. **Don't batch todos before marking complete** - Mark completed immediately

### [x] What WORKS (Proven Effective)

1. **Quick viability check**: Run specific test file after each fix to confirm failure mode changes
2. **Read-only analysis first**: Inspect actual code before making changes
3. **Staged verification**: Targeted test → project tests → full suite (optional)
4. **Observable success criteria**: Track exact test counts (e.g., "32/32 passing")
5. **Service-first debugging**: Check if services are implemented before assuming schema issues
6. **Immediate completion**: Mark todos as completed right after finishing

---

## Key Reference Files

### Essential Documentation

**This Session Context**:
- [Week 2.5 Phase 3 PR Summary](../../docs/plans/WEEK2.5-PHASE3-PR-SUMMARY.md) - Complete session documentation with sidecar migration details

**Previous Phases**:
- [Phase 2 Success](../../docs/plans/WEEK2.5-PHASE2-SUCCESS.md) - React hooks (517 tests fixed)
- [Phase 1 Results](../../docs/plans/WEEK2.5-FOUNDATION-HARDENING-RESULTS.md) - TypeScript baseline
- [Week 2.5 Index](../../docs/plans/WEEK2.5-INDEX.md) - Complete navigation

**Technical Patterns**:
- [Service Testing Patterns](../../cheatsheets/service-testing-patterns.md) - Mock cleanup patterns
- [PR Merge Verification](../../cheatsheets/pr-merge-verification.md) - Baseline comparison

### Example Implementation (Reference)

**Variance Tracking Tests** (GOOD vi.mock() pattern):
- File: `tests/unit/services/variance-tracking.test.ts`
- Pattern: Inline factory, persistent mock state, data capture helpers
- Result: 32/32 passing

**Variance Tracking Service** (Complete implementation):
- File: `server/services/variance-tracking.ts`
- Pattern: All required fields, default values, Drizzle decimal conversions
- Result: All service methods implemented correctly

---

## Verification Commands

### Run Specific Tests
```bash
# Snapshot service tests
npm test tests/unit/services/snapshot-service.test.ts -- --run

# Lot service tests
npm test tests/unit/services/lot-service.test.ts -- --run

# Server project only
npm test -- --project=server --run

# Client project only
npm test -- --project=client --run
```

### Quality Checks
```bash
# TypeScript (must maintain 387 baseline)
npm run check

# Linting
npm run lint

# Build
npm run build
```

### Investigation
```bash
# Find failing test files
npm test -- --project=server --run 2>&1 | grep "FAIL" | head -20

# Count total failures
npm test -- --project=server --run 2>&1 | grep "FAIL.*test.ts" | wc -l

# Search for service usage patterns
rg "db\." server/services/[service-name].ts

# Check schema definitions
rg "export const [tableName]" shared/schema.ts
```

---

## Success Criteria

### Minimum Viable (This Session)

- [ ] Fix 2-3 service test files (50-100 tests passing)
- [ ] Maintain server test baseline (1585+ passing, no new regressions)
- [ ] TypeScript errors remain at 387 (0 new errors)
- [ ] Build passing

### Moderate Goal

- [ ] Fix all service layer tests with similar patterns (100-150 tests)
- [ ] Total failures: 209 → <100
- [ ] Document any new patterns discovered

### Stretch Goal

- [ ] Fix all remaining test failures (209 → 0)
- [ ] Create PR for Week 2.5 Phase 1-3 complete
- [ ] Update test documentation

---

## Troubleshooting Guide

### If Tests Parse But Fail with Assertion Errors

- [x] **Good**: Syntax is fixed
-  **Next**: Check service implementations (don't assume schema missing)
-  **Pattern**: Read service code, verify methods exist and return correct data

### If Tests Fail with "Cannot read properties of undefined"

-  **Check**: Mock structure matches actual Drizzle query chains
-  **Check**: Service methods actually implemented
-  **Pattern**: Use grep to find actual service usage: `rg "db\." server/services/[service-name]`

### If TypeScript Errors After Service Changes

-  **Check**: Schema field types (decimal = string, not number)
-  **Check**: Field names match schema exactly
-  **Pattern**: Search schema file: `rg "export const [tableName]" shared/schema.ts`

### If Server Tests Regress

- [WARN] **Stop**: Don't proceed until regression identified
-  **Check**: What changed in shared service code
-  **Pattern**: Run just the regressed file to isolate issue

---

## Git Status & Branch Info

### Current Branch
- **Name**: `week2-foundation-hardening`
- **Base**: `main`
- **Status**: Clean, all recent work committed

### Recent Commits (Last 4)
1. **6d922d75** - docs: update Phase 3 PR summary with sidecar migration results
2. **9cc09996** - fix(tests): resolve all 32 variance tracking test failures
3. **ce8cbc81** - refactor: eliminate Windows sidecar architecture
4. **a7242229** - perf(wizard): apply useDebounceDeep to WaterfallStep + fix type safety

### Rollback Safety
- Git tag: `pre-sidecar-elimination` (before sidecar migration)
- Migration backup: `.migration-backup/` (excluded from git)

---

## Environment Notes

### Post-Sidecar Architecture

**What Changed**:
- No more `tools_local/` workspace
- No more junction links (all packages are real directories)
- npm scripts now use `npx` direct calls
- Project-local npm cache in `.npm-cache/` and `.npm-tmp/`

**What's the Same**:
- All npm commands work normally
- Build, test, lint commands unchanged
- TypeScript compilation unchanged

**Known Working**:
- [x] npm install (2370 packages)
- [x] npm run build (17.50s)
- [x] npm run check (387 baseline errors)
- [x] npm test (variance tracking 32/32 passing)

---

## Recommended Session Flow

### Step 1: Environment Verification (2 min)

```bash
# Verify clean state
git status
npm run check | tail -5  # Should show 387 errors
npm test tests/unit/services/variance-tracking.test.ts -- --run  # Should pass 32/32
```

### Step 2: Identify Next Target (3 min)

```bash
# Find failing test files
npm test -- --project=server --run 2>&1 | grep "FAIL" | head -20

# Pick highest-impact target (snapshot-service or lot-service)
```

### Step 3: Apply Fixes (30-45 min)

**Option A: Use Bugfix Agent** (Recommended)
```
Task(subagent_type='development-essentials:bugfix', prompt='
Fix all test failures in tests/unit/services/snapshot-service.test.ts.

Apply patterns from variance-tracking tests:
1. Check for vi.mock() hoisting violations
2. Verify mock return values capture actual data
3. Check service implementations for missing fields/methods
4. Convert decimal fields to strings if TypeScript errors

Success criteria:
- All tests in file passing
- No TypeScript errors
- No regressions in server project tests
')
```

**Option B: Manual Workflow**
- Follow "Technical Patterns" section above
- Reference variance-tracking tests as template
- Apply service-first debugging approach

### Step 4: Verification (5-10 min)

```bash
# Verify specific file
npm test tests/unit/services/[FILE].test.ts -- --run

# Check for regressions
npm test -- --project=server --run | tail -20

# TypeScript check
npm run check | tail -5
```

### Step 5: Commit & Document (5 min)

```bash
# Commit the fix
git add [files]
git commit -m "fix(tests): resolve [FILE] test failures"

# Optional: Update this prompt for next session
```

---

## Copy-Paste Prompts for Common Tasks

### Start with Snapshot Service
```
Continue Week 2.5 Phase 3 test repairs.

Target: tests/unit/services/snapshot-service.test.ts (19 failures - "Not implemented")

Use the bugfix agent or manual workflow from .claude/prompts/week2.5-phase3-continuation-v2.md.

Apply patterns from variance tracking tests: vi.mock() fixes, service implementation completion, Drizzle decimal conversions.
```

### Start with Lot Service
```
Continue Week 2.5 Phase 3 test repairs.

Target: tests/unit/services/lot-service.test.ts (20 failures)

Apply the proven workflow from variance tracking fixes: service-first debugging, vi.mock() pattern, mock enhancements.
```

### Systematic Multi-File Approach
```
Continue Phase 3 with systematic test repairs across multiple service files.

Use variance tracking as the pattern template:
- vi.mock() hoisting corrections
- Service implementation completeness
- Mock data capture enhancements
- Drizzle decimal type conversions

Target: Reduce failures from 209 to <100 this session.
```

### Quick Status Check
```
Quick status check for Week 2.5 Phase 3:

1. Verify variance tracking tests still passing (32/32)
2. Check current server test status
3. Identify top 3 test files with most failures
4. Recommend next steps with specific targets
```

---

**Generated**: 2025-12-20
**Session Type**: Phase 3 Continuation (Post-Sidecar)
**Branch**: week2-foundation-hardening
**Starting Point**: 1585 passing, 227 failing (209 legitimate failures to fix)
**Est. Session Goal**: Fix 50-100 tests (2-3 service files)
**Recommended Agent**: development-essentials:bugfix
