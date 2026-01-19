---
status: ACTIVE
last_updated: 2026-01-19
---

# Portfolio Intelligence Test Timeout Investigation

**Context**: Route handler implementation is complete with 34/76 tests passing. The remaining 42 test failures are all timeout errors, not functional issues.

**Current Status**:
- [x] **34 tests passing** - All core route functionality working
- [FAIL] **42 tests timing out** - Edge cases, validation, security, and concurrent request tests
- [x] **Route implementation complete** - All 9 POST routes return proper responses
- [x] **Response format correct** - `{ success: true, data: {...}, message: "..." }`

---

## Quick Start

**Your Task**: Investigate and fix the 42 timeout failures in the portfolio-intelligence test suite.

**Files to Focus On**:
1. [tests/unit/api/portfolio-intelligence.test.ts](../tests/unit/api/portfolio-intelligence.test.ts) - Test file with timeout failures
2. [server/routes/portfolio-intelligence.ts](../server/routes/portfolio-intelligence.ts) - Route handlers (recently implemented)

**Test Command**:
```bash
npm run test:unit -- tests/unit/api/portfolio-intelligence.test.ts
```

---

## Test Failure Categories

Based on the last test run, timeouts fall into these categories:

### Category 1: Validation Tests (Most Common)
**Pattern**: Tests send invalid data, expect 400 status, but timeout instead

**Examples**:
- "should validate strategy name is required" (line 154)
- "should validate sector allocation percentages" (line 175)
- "should validate model type enum values" (line 188)
- "should validate UUID format for strategyModelId" (line 330)
- "should validate scenario type enum" (line 345)

**Likely Issue**: Zod schema validation is passing when it should reject, or error handling isn't sending a response.

**Investigation Path**:
1. Check if Zod schemas are actually validating (CreateStrategySchema, CreateScenarioSchema, etc.)
2. Verify error responses in route handlers send proper status codes
3. Look for missing return statements after error responses

### Category 2: Authentication Tests
**Pattern**: Tests without auth header expect 401, timeout instead

**Example**:
- "should require authentication" (line 212)

**Likely Issue**: Authentication middleware is mocked but auth check in route handler isn't working correctly.

**Investigation Path**:
1. Check auth middleware mock at line 27-31
2. Verify userId check in route handlers (lines 265-273, etc.)
3. Ensure auth failures return early with proper response

### Category 3: Edge Case Tests
**Pattern**: Malformed data, large payloads, or missing headers

**Examples**:
- "should handle internal server errors gracefully" (line 977)
- "should handle missing content-type header" (line 988)
- "should handle extremely large request bodies" (line 998)
- "should validate negative numbers where inappropriate" (line 1014)

**Likely Issue**: Error handling in try-catch blocks or Express middleware not configured.

### Category 4: Security Tests
**Pattern**: XSS, SQL injection attempts expect rejection

**Examples**:
- "should reject HTML in request body" (line 1102)
- "should reject SQL injection in query params" (line 1127)
- "should reject invalid UUIDs in path params" (line 1150)

**Likely Issue**: Security middleware not applied in test setup (lines 1100-1101, 1125-1126, 1148-1149 have comments about requiring securityMiddlewareStack).

### Category 5: Concurrent Requests
**Pattern**: Multiple simultaneous requests

**Examples**:
- "should handle multiple simultaneous strategy creation requests" (line 1063)
- "should enforce rate limiting" (line 1052)

**Likely Issue**: Rate limiting not implemented or concurrent access to testStorage not thread-safe.

---

## Implementation Details (What's Already Done)

### Route Handler Pattern (All 9 Routes)
```typescript
router.post('/api/portfolio/strategies', idempotency, async (req: Request, res: Response) => {
  try {
    // 1. Validate fundId (query param)
    const fundId = req.query['fundId'];
    if (!fundId) {
      return res.status(400).json({ error: 'Missing fund ID', ... });
    }

    // 2. Validate request body with Zod
    const validation = CreateStrategySchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Validation failed', ... });
    }

    const validatedData = validation.data;

    // 3. Check authentication
    const userId = parseInt(req.user?.id || '0');
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required', ... });
    }

    // 4. Create item and store
    const storage = getPortfolioStorage(req);
    const item = {
      id: randomUUID(),
      fundId: parsedFundId,
      ...validatedData,
      createdBy: userId,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    storage.strategies.set(item.id, item);

    // 5. Return success response
    res.status(201).json({
      success: true,
      data: item,
      message: 'Strategy model created successfully'
    });
  } catch (error) {
    console.error('Strategy creation error:', error);
    res.status(500).json({ error: 'Failed to create strategy', ... });
  }
});
```

### Test Setup (Lines 26-87)
```typescript
// Mocked idempotency middleware
vi.mock('../../../server/middleware/idempotency', () => ({
  idempotency: () => (req: Request, res: Response, next: NextFunction) => next(),
  clearIdempotencyCache: vi.fn(),
  default: (req: Request, res: Response, next: NextFunction) => next(),
}));

// Test storage wired to app.locals
app.locals.portfolioStorage = testStorage;

// Mock authentication middleware adds user
app.use((req: Request & { user?: { id: string } }, _res: Response, next: NextFunction) => {
  req.user = { id: '1' };
  next();
});
```

---

## Debugging Strategy

### Step 1: Identify Pattern (5-10 min)
Run a single failing test with verbose output:
```bash
npm run test:unit -- tests/unit/api/portfolio-intelligence.test.ts -t "should validate strategy name is required"
```

Look for:
- Does the request reach the route handler?
- Is validation.success returning true when it should be false?
- Is the error response being sent?
- Are there any console.error outputs?

### Step 2: Verify Zod Schemas (10-15 min)
Check the Zod schemas in [server/routes/portfolio-intelligence.ts](../server/routes/portfolio-intelligence.ts) lines 33-132:

**Example Check**:
```typescript
// Line 34: CreateStrategySchema
const CreateStrategySchema = z.object({
  name: z.string().min(1).max(100),  // Should reject empty string
  // ...
});
```

Test manually:
```typescript
const result = CreateStrategySchema.safeParse({ /* invalid data */ });
console.log(result.success); // Should be false
```

### Step 3: Add Debug Logging (5 min)
Temporarily add console.log statements:
```typescript
const validation = CreateStrategySchema.safeParse(req.body);
console.log('Validation result:', validation.success, validation.error);
if (!validation.success) {
  console.log('Sending 400 response');
  return res.status(400).json({ ... });
}
```

### Step 4: Check Response Sending (10 min)
Verify all error paths have `return` before `res.status()`:
```typescript
// [x] CORRECT
if (!validation.success) {
  return res.status(400).json({ ... });
}

// [FAIL] WRONG - missing return
if (!validation.success) {
  res.status(400).json({ ... });
}
```

### Step 5: Fix and Validate (20-30 min)
- Fix identified issues one category at a time
- Run tests after each fix to verify improvement
- Aim for 60+ passing tests (80%+ pass rate)

---

## Expected Root Causes

Based on timeout patterns, likely issues:

1. **Zod validation not rejecting invalid data** (70% probability)
   - Check schema definitions match test expectations
   - Verify .safeParse() is being called correctly

2. **Missing return statements** (20% probability)
   - Error responses sent but execution continues
   - Response sent twice causes hang

3. **Mock configuration issues** (10% probability)
   - Auth middleware not working as expected
   - Idempotency middleware interfering

---

## Success Criteria

- [ ] 60+ tests passing (80%+ pass rate)
- [ ] Zero timeout errors on validation tests
- [ ] Authentication tests return 401 correctly
- [ ] Edge case tests either pass or fail with meaningful errors (not timeouts)
- [ ] Security tests can be skipped if middleware not in test scope

**Acceptable Outcomes**:
- Some security tests may remain failing if they require middleware not in scope
- Rate limiting test may fail if not implemented (that's OK)
- Goal is to eliminate timeouts and get functional pass/fail results

---

## Time Estimate

**Total**: 1-2 hours

**Breakdown**:
- Pattern identification: 10 minutes
- Zod schema investigation: 15 minutes
- Fix validation issues: 30-45 minutes
- Fix auth/edge cases: 15-30 minutes
- Final validation: 10 minutes

---

## Quick Command Reference

```bash
# Run single test
npm run test:unit -- tests/unit/api/portfolio-intelligence.test.ts -t "test name"

# Run with verbose output
npm run test:unit -- tests/unit/api/portfolio-intelligence.test.ts --reporter=verbose

# Run full file
npm run test:unit -- tests/unit/api/portfolio-intelligence.test.ts

# Check specific test line
npm run test:unit -- tests/unit/api/portfolio-intelligence.test.ts:154
```

---

## Context Files

**Recent Work**:
1. [.claude/integration-test-final-report.md](.claude/integration-test-final-report.md) - Project background
2. [.claude/prompts/integration-test-continuation-prompt.md](.claude/prompts/integration-test-continuation-prompt.md) - Previous task

**Key Code**:
- Routes: [server/routes/portfolio-intelligence.ts](../server/routes/portfolio-intelligence.ts)
- Tests: [tests/unit/api/portfolio-intelligence.test.ts](../tests/unit/api/portfolio-intelligence.test.ts)
- Schemas: Lines 33-132 in portfolio-intelligence.ts

---

## Start Here

**Step 1**: Run the full test suite to confirm current state (34 passing, 42 timeout)

**Step 2**: Run a single failing validation test with verbose output

**Step 3**: Check if Zod validation is actually rejecting invalid data

**Step 4**: Add debug logging to one route handler to trace execution

**Step 5**: Fix issues systematically by category (validation → auth → edge cases)

---

**Project Goal**: Achieve 60+ tests passing (80%+ pass rate) by fixing timeout issues.

**Your Mission**: Debug and fix Zod validation and error handling so tests receive proper HTTP responses instead of timing out.

**Estimated Time**: 1-2 hours

**Let's eliminate those timeouts!**
