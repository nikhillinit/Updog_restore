---
status: ACTIVE
last_updated: 2026-01-19
---

# Portfolio Intelligence API - Phase 4 Implementation Plan

**Context**: Portfolio Intelligence API merged with 73/76 tests passing (96%). Security middleware is commented out, creating a CRITICAL security gap.

**Current Status** (as of 2025-12-22):

- **Commits**: PR #299 merged with functional implementation complete
- **Test Results**: 73/76 passing (3 security tests failing due to missing middleware)
- **Security Status**: CRITICAL - No security middleware applied to production routes
- **Code Quality**: Zero TypeScript warnings, all linting passing

---

## MANDATORY PRE-CHECKS

Before proceeding, verify you have consulted:

1. [CAPABILITIES.md](../CAPABILITIES.md) - Security testing patterns and agents
2. [DECISIONS.md](../DECISIONS.md) - Architectural decisions (next: ADR-017)
3. [cheatsheets/anti-pattern-prevention.md](../cheatsheets/anti-pattern-prevention.md) - Security anti-patterns (AP-CURSOR-02)
4. [cheatsheets/INDEX.md](../cheatsheets/INDEX.md) - Testing and security guides

---

## Problem Statement

### Current Security Middleware Has Architectural Flaw

**File**: [server/middleware/security.ts:463-470](../server/middleware/security.ts#L463-L470)

```typescript
export const securityMiddlewareStack = [
  securityHeaders,
  ipFilter,
  generalRateLimit,
  inputSanitization,            // Line 467: RUNS FIRST (wrong)
  suspiciousActivityDetection,  // Line 468: RUNS SECOND (ineffective)
  securityEventLogger
];
```

**Problem**: `inputSanitization` runs BEFORE `suspiciousActivityDetection`

**Impact**:
```
Input: "'; DROP TABLE strategies; --"
  → inputSanitization: strips SQL patterns (silently)
  → suspiciousActivityDetection: checks sanitized data (finds nothing)
  → Result: 201 with sanitized data (attack not logged)
```

**Expected behavior**:
```
Input: "'; DROP TABLE strategies; --"
  → suspiciousActivityDetection: detects SQL pattern
  → Result: 400 rejection + security event logged
```

### Security Middleware Not Applied to Routes

**File**: [server/routes/portfolio-intelligence.ts:14-15, 92-95](../server/routes/portfolio-intelligence.ts#L14-L15)

```typescript
// TODO: Apply security middleware once test infrastructure supports it
// import { securityMiddlewareStack } from '../middleware/security';

// ...

// router.use(securityMiddlewareStack);  // COMMENTED OUT
```

**Impact**: Production routes have NO protection:
- No rate limiting
- No input sanitization
- No suspicious activity detection
- No security logging

---

## Solution Architecture

### Design Decision: Reject Malicious Input (Defense in Depth)

**Strategy**: Detect-then-sanitize (two-layer defense)

**Layer 1 - Detection** (REJECT obvious attacks):
- SQL injection patterns → 400
- XSS patterns → 400
- Code injection → 400
- Logs security events for audit

**Layer 2 - Sanitization** (ALLOW with cleanup):
- HTML entity encoding
- URL-encoded special chars (non-malicious)
- Whitespace normalization
- Empty strings after removing invalid URLs

**Middleware order**: `suspiciousActivityDetection` → `inputSanitization`

---

## Implementation Plan

### Phase 1: Fix Middleware Order (CRITICAL)

**File**: [server/middleware/security.ts:463-470](../server/middleware/security.ts#L463-L470)

**Change**:
```typescript
export const securityMiddlewareStack = [
  securityHeaders,
  ipFilter,
  generalRateLimit,
  suspiciousActivityDetection,  // MOVED UP: detect before sanitize
  inputSanitization,            // MOVED DOWN: sanitize residual
  securityEventLogger
];
```

**Rationale**:
- Detection evaluates raw request data
- Attack patterns logged before sanitization
- Sanitization handles edge cases that aren't suspicious
- Defense in depth: two independent layers

**Impact on other routes**: NONE (only portfolio-intelligence uses this middleware)

---

### Phase 2: Apply Security Middleware to Routes

**File**: [server/routes/portfolio-intelligence.ts](../server/routes/portfolio-intelligence.ts)

**Changes**:
1. Line 15: Uncomment `import { securityMiddlewareStack } from '../middleware/security';`
2. Line 95: Uncomment `router.use(securityMiddlewareStack);`
3. Lines 14, 92-94: Remove TODO comments

**Result**: Security middleware now protects all portfolio intelligence routes

---

### Phase 3: Fix Security Test Data

**File**: [tests/unit/api/portfolio-intelligence.test.ts:1104-1146](../tests/unit/api/portfolio-intelligence.test.ts#L1104-L1146)

**Current Problem**: Tests send incomplete data that fails Zod validation BEFORE security middleware runs

**Required fields** (from [CreateStrategySchema](../server/routes/portfolio-intelligence.ts#L102-L120)):
- `followOnStrategy: z.record(z.any())` (required, no default)
- `concentrationLimits: z.record(z.any())` (required, no default)

**Fix for HTML Injection Test** (line 1104):
```typescript
const maliciousData = {
  name: '<script>alert("xss")</script>Malicious Strategy',
  description: '<img src="x" onerror="alert(1)">',
  modelType: 'strategic',
  targetPortfolioSize: 25,
  checkSizeRange: { min: 500000, max: 2000000, target: 1000000 },
  sectorAllocation: { tech: 1.0 },
  stageAllocation: { seriesA: 1.0 },
  followOnStrategy: { strategy: 'performance_based' },    // ADD THIS
  concentrationLimits: { max_per_company: 0.15 }         // ADD THIS
};
```

**Fix for SQL Injection Test** (line 1129):
```typescript
const sqlInjectionAttempt = {
  name: "'; DROP TABLE strategies; --",
  modelType: 'strategic',
  targetPortfolioSize: 25,
  checkSizeRange: { min: 500000, max: 2000000, target: 1000000 },
  sectorAllocation: { tech: 1.0 },
  stageAllocation: { seriesA: 1.0 },
  followOnStrategy: { strategy: 'performance_based' },    // ADD THIS
  concentrationLimits: { max_per_company: 0.15 }         // ADD THIS
};
```

---

### Phase 4: Update Security Test Expectations

**File**: [tests/unit/api/portfolio-intelligence.test.ts](../tests/unit/api/portfolio-intelligence.test.ts)

**HTML Injection Test** (line 1104):
```typescript
// OLD (expects silent sanitization):
.expect(201);
expect(response.body.data.name).not.toContain('<script>');

// NEW (expects rejection):
.expect(400);  // suspiciousActivityDetection rejects
expect(response.body.error).toContain('Suspicious activity detected');
```

**SQL Injection Test** (line 1129):
```typescript
// OLD (expects silent sanitization):
.expect(201);
expect(response.body.success).toBe(true);

// NEW (expects rejection):
.expect(400);  // suspiciousActivityDetection rejects
expect(response.body.error).toContain('Suspicious activity detected');
```

**Update test descriptions**:
- Line 1104: "should reject HTML in request body" ✓ (already correct)
- Line 1129: "should reject SQL injection in query params" ✓ (already correct)

---

### Phase 5: Fix Rate Limiting Test

**File**: [tests/unit/api/portfolio-intelligence.test.ts:1052-1060](../tests/unit/api/portfolio-intelligence.test.ts#L1052-L1060)

**Current config** ([security.ts:25-27](../server/middleware/security.ts#L25-L27)):
- `windowMs: 15 * 60 * 1000` (15 minutes)
- `max: 100` (requests per window)

**Current test**: Sends 20 requests (insufficient to trigger rate limit)

**Option A: Increase request count** (RECOMMENDED):
```typescript
it('should enforce rate limiting', async () => {
  // Send 101 requests to exceed limit of 100
  const requests = Array.from({ length: 101 }, () =>
    request(app).get('/api/portfolio/strategies/1')
  );

  const responses = await Promise.all(requests);

  // At least one response should be rate limited
  expect(responses.some((response) => response.status === 429)).toBe(true);

  // Most responses should succeed
  const successCount = responses.filter(r => r.status === 200).length;
  expect(successCount).toBeGreaterThan(0);
  expect(successCount).toBeLessThan(101);
});
```

**Option B: Mock rate limiter** (alternative):
- Mock Redis store to use lower limits in tests
- More complex, requires test infrastructure changes

---

### Phase 6: Document Architectural Decision

**File**: [DECISIONS.md](../DECISIONS.md)

**Add ADR-017** (next available number after ADR-016):

```markdown
## ADR-017: Security Middleware Application Strategy for Portfolio Intelligence API

**Date:** 2025-12-22
**Status:** Accepted

### Context

Portfolio Intelligence API routes were initially implemented without security middleware, creating a critical security gap. Three security tests were failing because:

1. Security middleware was commented out in routes
2. Middleware order was incorrect (sanitization before detection)
3. Test expectations assumed silent sanitization instead of rejection

### Problem

**Middleware Order Issue**:
The `securityMiddlewareStack` ran `inputSanitization` before `suspiciousActivityDetection`, causing detection to evaluate already-sanitized data. This defeated the purpose of pattern detection and prevented security event logging.

**Missing Enforcement**:
No security middleware was applied to portfolio intelligence routes, leaving production endpoints vulnerable to:
- Rate limit exhaustion
- XSS attacks
- SQL injection
- Unlogged malicious activity

### Decision

**1. Middleware Order** (Defense in Depth):
```typescript
export const securityMiddlewareStack = [
  securityHeaders,
  ipFilter,
  generalRateLimit,
  suspiciousActivityDetection,  // FIRST: detect on raw input
  inputSanitization,            // SECOND: sanitize residual
  securityEventLogger
];
```

**2. Security Behavior** (Reject Malicious Input):
- **Detect and reject** obvious attack patterns with 400 status
- **Log security events** for audit trail
- **Sanitize edge cases** that aren't obviously malicious
- Two-layer defense: detection catches attacks, sanitization handles ambiguity

**3. Mandatory Application**:
- ALL API routes MUST apply `securityMiddlewareStack` (no exceptions)
- Security middleware cannot be disabled for testing convenience
- Tests must use proper test infrastructure (mocked Redis, etc.)

### Attack Pattern Handling

**REJECT with 400** (logged as security events):
- SQL injection: `DROP TABLE`, `UNION SELECT`, `DELETE FROM`, etc.
- XSS: `<script>`, `javascript:`, `onerror=`, `onload=`, etc.
- Code injection: `eval()`, `exec()`, `expression()`, etc.

**ALLOW with sanitization**:
- HTML entity encoding: `&lt;` instead of `<`
- URL-encoded special characters (non-malicious)
- Whitespace normalization
- Invalid URL removal (replaced with empty string)

### Testing Strategy

**Security Tests**:
- Test data must satisfy Zod schemas BEFORE security checks
- Expect 400 rejection for obvious attack patterns
- Verify security event logging
- Use test-appropriate rate limits (101+ requests to exceed 100 limit)

**Rate Limiting**:
- Production: 100 requests per 15-minute window
- Tests: Use sufficient request count to trigger limit (101+)
- Alternative: Mock Redis store for test-specific limits

### Consequences

**Positive**:
- Production routes protected by default
- Security cannot be accidentally disabled
- Attack attempts logged for audit/analysis
- Clear separation: detection vs sanitization
- Tests validate actual security behavior

**Negative**:
- Tests require proper schema-compliant data
- Rate limit tests require 101+ requests (slower)
- Middleware order change affects all routes using stack

**Mitigation**:
- Only portfolio-intelligence routes currently use this middleware
- Schema validation is a feature, not a bug (ensures data quality)
- Rate limit test cost is acceptable for security validation

### Compliance

**Anti-Pattern Prevention**:
- Addresses AP-CURSOR-02 (No Cursor Validation) via input sanitization
- Implements defense-in-depth pattern
- Security-first design

**References**:
- [cheatsheets/anti-pattern-prevention.md](cheatsheets/anti-pattern-prevention.md) - AP-CURSOR-02
- [server/middleware/security.ts](server/middleware/security.ts) - Implementation
- [tests/unit/api/portfolio-intelligence.test.ts](tests/unit/api/portfolio-intelligence.test.ts) - Test validation
```

---

## Testing and Validation

### Pre-Flight Checks

Before running tests:
1. Verify middleware order changed in security.ts
2. Verify security middleware uncommented in portfolio-intelligence.ts
3. Verify test data includes required schema fields

### Test Execution

```bash
# Run portfolio intelligence tests
npm run test:unit -- tests/unit/api/portfolio-intelligence.test.ts

# Run only security tests
npm run test:unit -- tests/unit/api/portfolio-intelligence.test.ts -t "Security"

# Verify all 76 tests pass
npm run test:unit -- tests/unit/api/portfolio-intelligence.test.ts 2>&1 | grep -E "(passed|failed)"
```

### Expected Results

- Test 1 (Rate Limiting): PASS (101 requests, some return 429)
- Test 2 (HTML Injection): PASS (400 rejection)
- Test 3 (SQL Injection): PASS (400 rejection)
- All other tests: PASS (unchanged)
- **Total: 76/76 passing (100%)**

---

## Risks and Mitigation

### Risk 1: Legitimate Input Blocked

**Risk**: Detection patterns too broad, blocking valid user input

**Examples**:
- User names like "O'Brien" contain single quote
- Descriptions mentioning "drop table" as table name
- HTML entities in rich text fields

**Mitigation**:
- Patterns are anchored to SQL/XSS contexts (e.g., `/drop\s+table/i`)
- Input sanitization still allows through after detection
- Monitor security event logs for false positives
- Add allowlist patterns if needed

### Risk 2: Rate Limit Test Flakiness

**Risk**: 101 requests may hit limit non-deterministically

**Mitigation**:
- Use `Promise.all()` to ensure simultaneous requests
- Assert "some" responses are 429, not exact count
- Document rate limit config in test comments
- Consider test-only config if flakiness occurs

### Risk 3: Breaking Other Routes

**Risk**: Middleware order change affects other routes

**Mitigation**:
- Verified: Only portfolio-intelligence routes use this middleware
- No other routes affected
- Change is isolated to security.ts

---

## Open Questions for Confirmation

### Question 1: Rate Limit Test Strategy

**Option A**: Increase request count to 101 (recommended)
- Pros: Simple, validates actual config
- Cons: 101 HTTP requests per test run (slower)

**Option B**: Test-only rate limit config
- Pros: Faster tests (lower threshold)
- Cons: More complex, separate config to maintain

**Recommendation**: Option A (validate real config, accept test cost)

### Question 2: Sanitization Coverage Test

Should we add a test for **non-suspicious** HTML that gets silently sanitized?

Example:
```typescript
it('should sanitize non-suspicious HTML entities', async () => {
  const data = {
    name: 'Strategy &lt;2024&gt;',  // HTML entities, not XSS
    description: 'Requires <b>bold</b> formatting',
    // ... other required fields
  };

  const response = await request(app)
    .post('/api/portfolio/strategies?fundId=1')
    .send(data)
    .expect(201);  // Allowed but sanitized

  expect(response.body.data.name).not.toContain('<');
  expect(response.body.data.name).not.toContain('>');
});
```

**Recommendation**: YES - validates sanitization layer works independently

### Question 3: Integration Test Suite

Should security tests move to `tests/integration/` for real infrastructure?

**Pros**:
- Real Redis, real rate limiting
- Separate from unit test concerns
- Can test across multiple routes

**Cons**:
- More infrastructure setup
- Slower CI/CD pipeline

**Recommendation**: DEFER - keep in unit tests for now, revisit if flakiness occurs

---

## File Modification Summary

### Files to Modify

1. **[server/middleware/security.ts](../server/middleware/security.ts#L463-L470)**
   - Swap lines 467-468 (detection before sanitization)

2. **[server/routes/portfolio-intelligence.ts](../server/routes/portfolio-intelligence.ts#L14-L15)**
   - Uncomment import (line 15)
   - Uncomment middleware application (line 95)
   - Remove TODO comments (lines 14, 92-94)

3. **[tests/unit/api/portfolio-intelligence.test.ts](../tests/unit/api/portfolio-intelligence.test.ts)**
   - Line 1052-1060: Increase rate limit test to 101 requests
   - Line 1104-1123: Add required fields, expect 400
   - Line 1129-1146: Add required fields, expect 400

4. **[DECISIONS.md](../DECISIONS.md)**
   - Add ADR-017 after ADR-016

### Files to Read (No Changes)

- [CAPABILITIES.md](../CAPABILITIES.md) - Reference only
- [cheatsheets/anti-pattern-prevention.md](../cheatsheets/anti-pattern-prevention.md) - Reference only

---

## Success Criteria

- [x] Functional implementation complete (73/73 functional tests passing)
- [ ] Middleware order corrected (detection before sanitization)
- [ ] Security middleware applied to all portfolio intelligence routes
- [ ] All 76 tests passing (100% coverage)
- [ ] ADR-017 documented in DECISIONS.md
- [ ] Zero TypeScript warnings (maintained)
- [ ] Pre-commit hooks passing (maintained)

**Current State**: 96% test pass rate, CRITICAL security gap, incorrect middleware order

**Target State**: 100% test pass rate, production security enforced, defense-in-depth architecture

**Severity**: CRITICAL - Must fix before production deployment

---

## Implementation Checklist

### Phase 1: Fix Middleware Order
- [ ] Open [server/middleware/security.ts:463-470](../server/middleware/security.ts#L463-L470)
- [ ] Move `suspiciousActivityDetection` to line 467 (before sanitization)
- [ ] Move `inputSanitization` to line 468 (after detection)
- [ ] Verify `securityEventLogger` remains last

### Phase 2: Apply Security Middleware
- [ ] Open [server/routes/portfolio-intelligence.ts](../server/routes/portfolio-intelligence.ts)
- [ ] Uncomment line 15: `import { securityMiddlewareStack } from '../middleware/security';`
- [ ] Uncomment line 95: `router.use(securityMiddlewareStack);`
- [ ] Delete TODO comments (lines 14, 92-94)

### Phase 3: Fix Test Data
- [ ] Open [tests/unit/api/portfolio-intelligence.test.ts:1104](../tests/unit/api/portfolio-intelligence.test.ts#L1104)
- [ ] Add `followOnStrategy: { strategy: 'performance_based' }` to maliciousData
- [ ] Add `concentrationLimits: { max_per_company: 0.15 }` to maliciousData
- [ ] Repeat for sqlInjectionAttempt at line 1129

### Phase 4: Update Test Expectations
- [ ] Line 1118: Change `.expect(201)` to `.expect(400)`
- [ ] Line 1121-1122: Replace sanitization checks with:
  ```typescript
  expect(response.body.error).toContain('Suspicious activity detected');
  ```
- [ ] Line 1142: Change `.expect(201)` to `.expect(400)`
- [ ] Line 1145: Replace with:
  ```typescript
  expect(response.body.error).toContain('Suspicious activity detected');
  ```

### Phase 5: Fix Rate Limit Test
- [ ] Line 1053: Change `{ length: 20 }` to `{ length: 101 }`
- [ ] Add comment: `// Exceed generalRateLimit (100 requests per 15min window)`

### Phase 6: Document Decision
- [ ] Open [DECISIONS.md](../DECISIONS.md)
- [ ] Add ADR-017 after ADR-016 (line ~4265)
- [ ] Include full ADR content from Phase 6 above

### Phase 7: Validate
- [ ] Run `npm run test:unit -- tests/unit/api/portfolio-intelligence.test.ts`
- [ ] Verify 76/76 tests passing
- [ ] Run `npm run lint` - verify zero warnings
- [ ] Run `npm run check` - verify TypeScript passes

---

## Time Estimate

- Phase 1 (Middleware order): 5 minutes
- Phase 2 (Apply middleware): 5 minutes
- Phase 3 (Fix test data): 10 minutes
- Phase 4 (Update expectations): 10 minutes
- Phase 5 (Fix rate limit): 5 minutes
- Phase 6 (ADR documentation): 15 minutes
- Phase 7 (Validation): 10 minutes

**Total**: ~60 minutes

---

## References

**Project Standards**:
- [CLAUDE.md](../CLAUDE.md) - Project conventions and workflow
- [.claude/WORKFLOW.md](../.claude/WORKFLOW.md) - Quality gate protocol
- [cheatsheets/emoji-free-documentation.md](../cheatsheets/emoji-free-documentation.md) - No emojis policy

**Security References**:
- [cheatsheets/anti-pattern-prevention.md](../cheatsheets/anti-pattern-prevention.md) - AP-CURSOR-02
- [server/middleware/security.ts](../server/middleware/security.ts) - Middleware implementation
- [CAPABILITIES.md](../CAPABILITIES.md) - Security testing agents

**Related Work**:
- [PR #299](https://github.com/nikhillinit/Updog_restore/pull/299) - Initial implementation

---

**Ready to implement with corrected security architecture and proper defense-in-depth pattern.**
