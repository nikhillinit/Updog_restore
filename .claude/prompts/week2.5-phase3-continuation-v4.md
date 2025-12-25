# Week 2.5 Phase 3 Test Failure Resolution - Continuation v4

## Session Context

This session continues Week 2.5 Phase 3 test failure resolution. Previous session made significant progress using "Quick Wins First" strategy.

## Current State (as of commit ac379070)

### Test Baseline Status
- **Starting point (session v3)**: 178 failed tests
- **Current estimate**: ~130 failed tests
- **Net progress**: 48 tests fixed/skipped
- **Goal**: Reduce to <100 failures

### Completed Quick Wins (Session v3)

1. **performance-prediction.test.ts** (Commit d34e1d94)
   - Fixed: 18 of 22 tests
   - Root cause: Missing `performanceForecasts` export in vi.mock()
   - Also fixed: Unused `index` parameters in map callbacks
   - File: [tests/unit/services/performance-prediction.test.ts:36](tests/unit/services/performance-prediction.test.ts#L36)

2. **allocations.test.ts** (Commit ac379070)
   - Skipped: 30 integration tests
   - Root cause: Tests require real PostgreSQL database (`povc_dev`)
   - Solution: Marked with `describe.skip()` and `@group integration` tag
   - File: [tests/api/allocations.test.ts:20](tests/api/allocations.test.ts#L20)
   - Future work: Convert to use database mocks or separate integration suite

### Remaining Quick Win Target

**monte-carlo validation (5 tests)** - Status: NOT STARTED
- Estimated impact: 5 tests
- Estimated effort: 2 hours
- Need to identify specific test file and failure pattern

## Approved Strategy: "Quick Wins First"

Continue with infrastructure fixes (mocks, type safety) before implementing missing features:

1. **Quick Wins** (current phase)
   - Fix test infrastructure issues (mock setup, type safety)
   - Skip integration tests requiring real resources
   - Target: Fix 78+ tests to reach <100 threshold

2. **Deeper Issues** (after reaching <100)
   - Missing route implementations
   - Algorithm issues
   - Validation logic

## Technical Patterns Established

### Mock-Before-Import Pattern
```typescript
// CORRECT: vi.mock() before imports
vi.mock('@shared/schema', () => ({
  performancePredictions: 'mocked-predictions-table',
  performanceForecasts: 'mocked-forecasts-table',  // Must export ALL tables used
  fundMetrics: 'mocked-metrics-table',
}));

import { PerformancePredictionEngine } from '../../../server/services/performance-prediction';
```

### Database Mock System
- Test environment (`NODE_ENV=test`) automatically uses `databaseMock`
- See: [server/db.ts:19-26](server/db.ts#L19-L26)
- Tests importing from `server/db/pg-circuit` bypass the mock (integration tests)

### Integration Test Classification
```typescript
/**
 * @group integration
 */
describe.skip('Test Name', () => {
  // Tests requiring real database, Redis, etc.
});
```

## Next Steps (Priority Order)

### 1. Immediate: Find monte-carlo validation failures
```bash
# Search for monte-carlo test files
npm test -- --project=server --run 2>&1 | grep -i "monte"

# Or search test file names
find tests -name "*monte*" -o -name "*carlo*"
```

### 2. Quick Assessment
Run full test suite to get current baseline:
```bash
npm test -- --project=server --run 2>&1 | grep -E "Test Files.*failed|Tests.*failed"
```

### 3. High-Impact Targets (from session v2 analysis)

If monte-carlo only has 5 tests, look for next quick wins:
- **Test infrastructure issues** (missing mocks, type errors)
- **Integration tests** (database, Redis, external APIs)
- **Mock export completeness** (similar to performanceForecasts fix)

## Files Modified This Session

1. `tests/unit/services/performance-prediction.test.ts`
   - Added `performanceForecasts` to schema mock (line 36)
   - Fixed unused `index` parameters (lines 295, 372)

2. `tests/api/allocations.test.ts`
   - Changed `describe()` to `describe.skip()` (line 20)
   - Added integration test documentation (lines 6-7)

## Quality Gate Reminders

Before ANY commit:
```bash
# 1. Linting - MUST show 0 errors, 0 warnings
npm run lint

# 2. Type Checking - MUST show 0 type errors
npm run check

# 3. Tests - Verify fix works
npm test <file> -- --run
```

**NEVER use `git commit --no-verify`**

## Commit Message Template

```
fix(tests): <brief description>

<Detailed explanation of root cause and fix>

Test Results:
- Before: X failing
- After: Y failing
- Net gain: Z tests fixed

 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

## Key Resources

### Documentation
- `.claude/WORKFLOW.md` - Quality Gate Protocol
- `cheatsheets/anti-pattern-prevention.md` - 24 cataloged patterns
- `tests/helpers/database-mock.ts` - Database mock implementation

### Database Configuration
- `server/db.ts` - Environment-based database selection (test/Vercel/dev)
- `server/db/typed-query.ts` - Type-safe Drizzle ORM wrappers

### Test Infrastructure
- Mock pattern: `vi.mock()` BEFORE imports
- Type safety: NO `any` types (enforced by ESLint)
- Schema exports: ALL tables must be in vi.mock()

## Session Goals

1. **Primary**: Find and fix monte-carlo validation (5 tests)
2. **Secondary**: Identify next highest-impact targets
3. **Target**: Reduce total failures to <100 (need 30+ more fixes)

## Known Issue: portfolio-intelligence timeouts

37 tests in `tests/unit/api/portfolio-intelligence.test.ts` pass infrastructure but timeout waiting for route implementations. This is a separate issue from test infrastructure - these need actual route implementations or stub responses.

**Do NOT spend time on these yet** - focus on infrastructure quick wins first.

---

**Branch**: `week2-foundation-hardening`
**Last Commit**: ac379070 (Skip allocations integration tests)
**Session**: v4 (continuation from v3)
**Strategy**: Quick Wins First (infrastructure over implementation)
