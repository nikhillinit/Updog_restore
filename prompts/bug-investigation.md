# Bug Investigation & Debugging Workflow

## Initial Triage

### Bug Report Details

**Title:** [Concise bug description] **Severity:** [Critical / High / Medium /
Low] **Environment:** [Development / Staging / Production] **Browser/OS:** [If
frontend issue] **Reproducibility:** [Always / Sometimes / Rarely]

**Date Reported:** [Date] **Reported By:** [User/tester name]

---

## Reproduction Steps

### Step-by-Step Instructions

1. [First step]
2. [Second step]
3. [Third step]
4. [Expected vs actual behavior]

### Code Snippet (if available)

```typescript
// Minimal code example that triggers the bug
const problematicCode = () => {
  // Issue occurs here
};
```

### Screenshots/Logs

- [ ] Screenshot attached
- [ ] Error log snippet attached
- [ ] Network tab output attached
- [ ] Server logs available

**Relevant Log Output:**

```
[Paste error logs here]
[Include timestamps and full stack trace]
```

---

## Root Cause Analysis

### Systematic Debugging Framework

#### Phase 1: Observe & Isolate

- [ ] Bug reproduced locally
- [ ] Isolated to specific component/endpoint
- [ ] Narrowed to specific code section
- [ ] Determined whether frontend or backend issue

**Observations:**

```
What exactly breaks?
Where does execution fail?
What's the last successful operation?
```

#### Phase 2: Instrument & Trace

**Debugging Tools to Use:**

```bash
# For backend issues
npm test -- --project=server [test-file]

# For client issues
npm test -- --project=client [test-file]

# Type checking
npm run check

# Code search
npm run grep "[pattern]" -- --include="*.ts"
```

**Key Questions:**

- [ ] Is this a type safety issue? (`npm run check` output)
- [ ] Is this a race condition? (concurrent requests, mutations)
- [ ] Is this a data validation issue? (bad input handling)
- [ ] Is this state corruption? (immutability violations)
- [ ] Is this a timing/async issue? (unhandled promises)

#### Phase 3: Hypothesize & Test

**Hypothesis:**

```
Bug is likely caused by: [Your theory]
Because: [Evidence]
This would explain: [Observations that fit theory]
```

**Test the Hypothesis:**

- [ ] Add debug logs at suspected location
- [ ] Create minimal test case
- [ ] Check related code for same pattern
- [ ] Review recent changes to this area
- [ ] Check if this worked in previous version

#### Phase 4: Implement & Verify

- [ ] Root cause identified and documented
- [ ] Fix implemented with minimal scope
- [ ] Tests written for the bug scenario
- [ ] No regressions detected
- [ ] Related issues checked and fixed

---

## Anti-Pattern Investigation

### Potential Causes (Check These First)

**Race Conditions:**

- [ ] Multiple requests updating same data simultaneously
- [ ] Unvalidated cursors causing inconsistent pagination
- [ ] Cache stale while processing
- [ ] Event ordering violated

**Data Integrity Issues:**

- [ ] In-place mutations modifying shared state
- [ ] Missing Zod schema validation
- [ ] Unvalidated user input reaching business logic
- [ ] Version field not checked before update

**Worker/Queue Issues:**

- [ ] Job timeout too short/not set
- [ ] Missing idempotency key
- [ ] Failed jobs not retried
- [ ] State not persisted before operation

**Async/Promise Issues:**

- [ ] Unhandled promise rejection
- [ ] Concurrent operations not awaited
- [ ] Cleanup (finally/abort) not executed
- [ ] Error propagation broken

### Anti-Pattern Checklist

Review the 24 anti-patterns in `cheatsheets/anti-pattern-prevention.md`:

**High-Probability Issues for This Bug:**

- Pattern: [Anti-pattern name]
  - Location: [File path]
  - Severity: [High / Medium / Low]
  - Fix: [How to resolve]

---

## Investigation Workspace

### Code Review Checklist

**Files to Examine:**

- [ ] Route handler: [/path/to/file.ts]
- [ ] Service layer: [/path/to/file.ts]
- [ ] Database queries: [/path/to/file.ts]
- [ ] Frontend component: [/path/to/file.tsx]
- [ ] Validation schemas: [/path/to/file.ts]
- [ ] Test cases: [/path/to/__tests__/file.test.ts]

**Key Code Sections:**

```typescript
// Section 1: Where bug manifests
// Location: [file.ts:line-range]
// Issue: [What's wrong]

// Section 2: Related logic
// Location: [file.ts:line-range]
// Impact: [How it contributes to bug]

// Section 3: Validation/Safety
// Location: [file.ts:line-range]
// Missing: [What's not checked]
```

### Database/State Investigation

- [ ] Check database schema matches code expectations
- [ ] Verify data in database (corrupted?)
- [ ] Check migration history for schema changes
- [ ] Review transaction logs if available

**Query to investigate:**

```sql
-- Debug query to understand state
SELECT * FROM [table] WHERE [condition];
```

---

## Fix Implementation

### Solution Design

**Root Cause:** [Confirm before implementing]

**Proposed Fix:**

```typescript
// Before (buggy code)
const buggyFunction = () => {
  // Problem: ...
};

// After (fixed code)
const fixedFunction = () => {
  // Solution: ...
  // Validates: ...
  // Prevents: ...
};
```

**Why This Fix Works:**

1. [Addresses root cause]
2. [Prevents recurrence]
3. [No side effects]
4. [Maintains backwards compatibility if needed]

### Testing the Fix

**Unit Tests:**

```typescript
describe('Bug fix: [bug title]', () => {
  it('should fail before fix', () => {
    // Test that would fail with buggy code
  });

  it('should pass after fix', () => {
    // Test that passes with fixed code
  });

  it('should handle edge case X', () => {
    // Test boundary conditions
  });
});
```

**Integration Tests (if applicable):**

- [ ] End-to-end scenario test
- [ ] Multiple concurrent requests test
- [ ] State consistency test

### Verification Checklist

- [ ] Bug no longer reproduces
- [ ] Existing tests still pass (`npm test`)
- [ ] New tests cover the bug scenario
- [ ] No new TypeScript errors
- [ ] ESLint passes
- [ ] Performance not degraded
- [ ] Related issues checked and fixed

---

## Similar Issues Search

### Potential Related Bugs

**Search for similar patterns:**

```bash
# Code search
grep -r "pattern" --include="*.ts" --include="*.tsx" .

# Look in CHANGELOG for similar fixes
grep -i "fix\|bug" CHANGELOG.md
```

**Issues to Check:**

- [ ] Issue 1: [Link/description]
- [ ] Issue 2: [Link/description]
- [ ] Issue 3: [Link/description]

**Preventive Measures:**

- [ ] Apply same fix pattern elsewhere
- [ ] Add linting rule to prevent this class of bugs
- [ ] Document in anti-pattern guide
- [ ] Add test case for variant scenarios

---

## Documentation & Learning

### Post-Mortem Notes

**What went wrong:**

- [Root cause analysis]

**Why we missed it:**

- [Test gap? Design flaw? Insufficient review?]

**How we prevent it:**

- [Process improvement]
- [Test addition]
- [Documentation update]

### Update Project Documentation

- [ ] Add to ANTI_PATTERNS.md if new pattern
- [ ] Update CAPABILITIES.md if tool/approach created
- [ ] Document in cheatsheet if repeated knowledge
- [ ] Log decision in DECISIONS.md if architectural

---

## Deployment Notes

### Rollout Strategy

- [ ] Hotfix to production (if critical)
- [ ] Normal merge to main
- [ ] Feature-flagged deployment (if risky)

### Database Changes Required

- [ ] Migration needed: [Yes / No]
- [ ] Migration script: [Link]
- [ ] Rollback plan: [How to revert if needed]

### Communication

- [ ] Update issue ticket
- [ ] Notify affected users
- [ ] Post in #development Slack
- [ ] Document in CHANGELOG.md

---

## Final Checklist

**Before Marking Bug as Fixed:**

- [ ] Root cause documented
- [ ] Fix implemented
- [ ] Tests pass (npm test --project=[server|client])
- [ ] /test-smart shows all related tests passing
- [ ] Code reviewed
- [ ] Merged to main
- [ ] /deploy-check passes
- [ ] Closed in issue tracking
- [ ] CHANGELOG.md updated with fix summary
