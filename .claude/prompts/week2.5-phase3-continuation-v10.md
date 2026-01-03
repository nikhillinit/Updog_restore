# Portfolio Intelligence API - Continuation Prompt v10

**Context**: Route handler implementation is complete with **124 of 169
integration tests passing** (73%), up from 87 baseline. The
portfolio-intelligence API has 42 remaining failures to address.

**Current Status** (as of 2025-12-21):

- **Recent Commits**:
  - `294ed00e` - feat(portfolio-intelligence): implement 9 POST route handlers
  - `f793d790` - refactor(portfolio-intelligence): improve error handling and
    fix unused variables
- **Test Results**: 124 passing, 42 failing, 3 skipped (169 total)
- **Pass Rate**: 73% overall, ~63% for portfolio-intelligence tests
- **Critical Achievement**: ALL timeouts eliminated by idempotency middleware
  fix

---

## Quick Start

Your task is to fix the remaining 42 test failures in the portfolio intelligence
integration test suite.

**Test Command**:

```bash
npm run test:unit -- tests/unit/api/portfolio-intelligence.test.ts
```

**Expected Outcome**: 60+ passing tests (80%+ pass rate) by fixing validation
and edge case issues.

---

## Background Reading (Priority Order)

1. **[.claude/session-summary-portfolio-intelligence-implementation.md](.claude/session-summary-portfolio-intelligence-implementation.md)** -
   Complete session history with technical decisions
2. **[tests/unit/api/portfolio-intelligence.test.ts](../tests/unit/api/portfolio-intelligence.test.ts)** -
   Test file with remaining failures
3. **[server/routes/portfolio-intelligence.ts](../server/routes/portfolio-intelligence.ts)** -
   Route handlers with implementations

**Key Context**:

- All route handler responses are implemented and working for happy path
- All timeouts eliminated (idempotency middleware fixed)
- Failures are in validation, edge cases, and security tests

---

## What's Already Complete

### Route Handler Implementation (100% Done)

**9 POST routes implemented** with proper response format:

1. POST /api/portfolio/strategies (line 298-313)
2. POST /api/portfolio/scenarios (line 537-552)
3. POST /api/portfolio/scenarios/compare (line 641-654)
4. POST /api/portfolio/scenarios/:id/simulate (line 701-714)
5. POST /api/portfolio/reserves/optimize (line 779-792)
6. POST /api/portfolio/reserves/backtest (line 881-893)
7. POST /api/portfolio/forecasts (line 958-973)
8. POST /api/portfolio/forecasts/validate (line 1056-1067)
9. POST /api/portfolio/quick-scenario (line 1187-1194)

**Response Format** (all routes):

```typescript
res.status(201).json({
  success: true,
  data: item,
  message: 'Operation completed successfully',
});
```

### Infrastructure (100% Ready)

**Helper Functions** (lines 61-76):

```typescript
const isErrorWithMessage = (error: unknown): error is { message: string } => { ... };
const getErrorMessage = (error: unknown): string => { ... };
const getPortfolioStorage = (req: Request): PortfolioStorage => { ... };
```

**Test Storage Wiring** (tests/unit/api/portfolio-intelligence.test.ts:86):

```typescript
app.locals.portfolioStorage = testStorage;
```

---

## Failing Test Categories (42 Failures)

Based on the latest test run, failures fall into these categories:

### Category 1: Validation Tests (9 failures)

**Pattern**: Tests send invalid data, expect 400 status, but get different
response

**Examples**:

- "should validate date formats" (backtest route)
- "should validate benchmark strategy" (backtest route)
- "should validate forecast type" (forecasts route)
- "should validate methodology" (forecasts route)
- "should validate forecast horizon" (forecasts route)
- "should validate forecast against actuals" (validate route)
- "should generate quick scenario" (quick-scenario route)
- "should generate different projections for different risk profiles"
  (quick-scenario route)
- "should generate performance forecast" (forecasts route)

**Likely Issue**: Zod schemas not validating specific edge cases or route
handlers not properly checking validated data

**Investigation Path**:

1. Check Zod schema definitions (lines 84-176 in portfolio-intelligence.ts)
2. Verify validation error responses are being sent correctly
3. Add missing validation checks for specific fields

### Category 2: Error Handling (4 failures)

**Pattern**: Edge case tests expecting proper error responses

**Examples**:

- "should handle internal server errors gracefully"
- "should handle missing content-type header"
- "should handle extremely large request bodies"
- "should validate negative numbers where inappropriate"

**Likely Issue**: Missing Express middleware for body size limits, content-type
checks

**Investigation Path**:

1. Check if Express body parser middleware has size limits configured
2. Add content-type validation middleware
3. Verify Zod schemas reject negative numbers correctly

### Category 3: Security Tests (3 failures)

**Pattern**: Security validation tests

**Examples**:

- "should reject HTML in request body"
- "should reject SQL injection in query params"
- "should reject invalid UUIDs in path params"

**Likely Issue**: Security middleware not implemented or not applied to routes

**Investigation Path**:

1. Check if securityMiddlewareStack exists and is applied
2. Add input sanitization for HTML/SQL patterns
3. Add UUID validation middleware for path params

### Category 4: Performance & Rate Limiting (2 failures)

**Pattern**: Concurrent request handling

**Examples**:

- "should enforce rate limiting"
- "should handle multiple simultaneous strategy creation requests"

**Likely Issue**: Rate limiting not implemented, concurrent access issues with
in-memory storage

**Investigation Path**:

1. Check if rate limiting middleware exists
2. Verify testStorage (Map) is thread-safe for concurrent access
3. Add proper locking or atomic operations if needed

---

## Implementation Strategy

### Step 1: Identify Root Causes (30 minutes)

Run a single failing test with verbose output to understand the exact failure:

```bash
npm run test:unit -- tests/unit/api/portfolio-intelligence.test.ts -t "should validate date formats"
```

Look for:

- Actual vs expected status codes
- Response body differences
- Any error messages or validation failures

### Step 2: Fix Validation Issues (60-90 minutes)

**Priority**: Fix Category 1 (validation tests) first as these are most
impactful

**Approach**:

1. Review Zod schemas for each failing route
2. Add missing validation rules (date formats, enum values, etc.)
3. Ensure validation errors return proper 400 responses with details
4. Test each fix incrementally

**Example Fix Pattern**:

```typescript
// Add specific validation for date format
const BacktestSchema = z.object({
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  // ...
});

// In route handler
const validation = BacktestSchema.safeParse(req.body);
if (!validation.success) {
  return res.status(400).json({
    error: 'Validation failed',
    details: validation.error.flatten(),
  });
}
```

### Step 3: Fix Edge Cases (30-45 minutes)

**Priority**: Category 2 (error handling)

**Approach**:

1. Add Express middleware for request body size limits
2. Add content-type validation
3. Verify negative number validation in Zod schemas

**Example Middleware**:

```typescript
// In Express app setup or route file
router.use(express.json({ limit: '10mb' }));
router.use((req, res, next) => {
  if (req.method === 'POST' && !req.is('application/json')) {
    return res
      .status(415)
      .json({ error: 'Content-Type must be application/json' });
  }
  next();
});
```

### Step 4: Security & Rate Limiting (Optional - 30-60 minutes)

**Priority**: Categories 3 & 4 (lower priority, may skip if out of scope)

**Approach**:

1. Add input sanitization for XSS/SQL injection patterns
2. Add UUID validation middleware
3. Implement basic rate limiting (if in scope)

**Skip Criteria**: If these tests are for future security enhancements not in
current scope, document as known limitations and move on.

---

## Success Criteria

- [ ] 60+ tests passing (80%+ pass rate for portfolio-intelligence)
- [ ] Zero validation tests failing (Category 1 complete)
- [ ] Zero edge case tests failing (Category 2 complete)
- [ ] Security tests either passing or documented as out-of-scope
- [ ] Rate limiting tests either passing or documented as future work

**Acceptable Outcomes**:

- Some security/rate-limiting tests may remain failing if they require
  infrastructure not in current scope
- Goal is to fix all functional validation and error handling issues
- 80%+ pass rate is the target

---

## Time Estimate

**Total**: 2-3 hours

**Breakdown**:

- Root cause identification: 30 minutes
- Validation fixes (Category 1): 60-90 minutes
- Edge case fixes (Category 2): 30-45 minutes
- Security/rate limiting (Category 3-4): 0-60 minutes (optional)
- Final validation & documentation: 15-30 minutes

---

## Quick Command Reference

```bash
# Run single test with verbose output
npm run test:unit -- tests/unit/api/portfolio-intelligence.test.ts -t "test name"

# Run full test file
npm run test:unit -- tests/unit/api/portfolio-intelligence.test.ts

# Run all integration tests to verify no regressions
npm run test:unit -- tests/unit/bug-fixes/phase3-critical-bugs.test.ts tests/unit/services/monte-carlo-engine.test.ts tests/unit/engines/cohort-engine.test.ts tests/unit/api/portfolio-intelligence.test.ts

# Check git status
git status

# Commit progress
git add . && git commit -m "fix(portfolio-intelligence): resolve validation and edge case failures"
```

---

## Context Files

**Session History**:

1. [.claude/session-summary-portfolio-intelligence-implementation.md](.claude/session-summary-portfolio-intelligence-implementation.md) -
   Complete implementation session with technical decisions
2. [.claude/integration-test-final-report.md](.claude/integration-test-final-report.md) -
   Overall integration test project status

**Key Code**:

- Routes:
  [server/routes/portfolio-intelligence.ts](../server/routes/portfolio-intelligence.ts)
- Tests:
  [tests/unit/api/portfolio-intelligence.test.ts](../tests/unit/api/portfolio-intelligence.test.ts)
- Schemas: Lines 84-176 in portfolio-intelligence.ts

---

## Recent Achievements

**From Previous Session**:

1. Implemented all 9 POST route responses
2. Fixed critical idempotency middleware bug (eliminated ALL timeouts)
3. Added error handling helpers and improved type safety
4. Went from 87 → 124 passing tests (+42% improvement)
5. Achieved 73% overall integration test pass rate

**Technical Decisions Made**:

1. Used in-memory storage (Maps) via app.locals for test infrastructure
2. Wrapped all responses in `{ success: true, data: {...}, message: "..." }`
   format
3. Fixed idempotency middleware import (factory → default export)
4. Added type-safe error handling with helper functions
5. Used `unknown` instead of `any` for type parameters

---

## Start Here

**Step 1**: Run the full test suite to confirm current state (124 passing, 42
failing):

```bash
npm run test:unit -- tests/unit/api/portfolio-intelligence.test.ts
```

**Step 2**: Pick one failing validation test and run it with verbose output to
understand the failure pattern

**Step 3**: Fix the validation issue in the Zod schema or route handler

**Step 4**: Repeat for remaining validation tests, then move to edge cases

**Step 5**: Document any tests left as out-of-scope and commit progress

---

**Project Goal**: Achieve 60+ passing tests (80%+ pass rate) by fixing
validation and edge case issues.

**Your Mission**: Debug and fix Zod validation schemas and error handling so
tests receive proper HTTP responses with correct validation.

**Estimated Time**: 2-3 hours

**Current Test Status**: 124 passing, 42 failing (73% pass rate)

**Target**: 60+ passing for portfolio-intelligence tests (80%+ pass rate)

**Let's get to 80%!**
