# Code Review Request Checklist

## Pull Request Overview

### PR Details

**PR Title:** [Clear, descriptive title following convention] **PR
Number:** #[number] **Target Branch:** main (or specify) **Source Branch:**
[your-feature-branch]

**Description:** [Link to feature/bug, summarize changes, link to related docs]

**Type of Change:**

- [ ] New Feature
- [ ] Bug Fix
- [ ] Performance Improvement
- [ ] Refactoring
- [ ] Documentation Update
- [ ] Test Addition/Improvement
- [ ] Dependency Update

---

## Scope Summary

### What Changed

**Components Modified:**

- [ ] Frontend (React/Tailwind)
- [ ] Backend (Express/Routes)
- [ ] Database (Schema/Migrations)
- [ ] API Contracts
- [ ] Workers (BullMQ)
- [ ] Tests
- [ ] Documentation

**Files Changed:** [Number of files modified] **Lines Added/Deleted:** [+X, -Y]

**Key Files to Review:**

1. `[file1.ts]` - [1-2 sentence explanation]
2. `[file2.tsx]` - [1-2 sentence explanation]
3. `[file3.test.ts]` - [1-2 sentence explanation]

### Dependencies

- [ ] New npm packages added: [List any]
- [ ] Schema changes: [Yes / No]
- [ ] API contract changes: [Yes / No]
- [ ] Database migrations: [Yes / No]

---

## Quality Gate Verification

### Pre-Review Checklist (Self-Review First)

#### Code Quality

- [ ] `npm run lint` passes (no ESLint errors)
- [ ] `npm run check` passes (no TypeScript errors)
- [ ] Code formatted consistently (Prettier)
- [ ] No `console.log()` left in production code
- [ ] No commented-out code blocks
- [ ] No hardcoded values/credentials

#### Testing

- [ ] `npm test -- --project=server` passes (if backend changes)
- [ ] `npm test -- --project=client` passes (if frontend changes)
- [ ] `/test-smart` run confirms all affected tests pass
- [ ] New tests written for new functionality
- [ ] Tests cover happy path AND error scenarios
- [ ] Edge cases tested

#### Type Safety

- [ ] TypeScript strict mode satisfied
- [ ] No `any` types without explanation
- [ ] Proper error type handling
- [ ] Generics properly constrained

#### Documentation

- [ ] JSDoc comments for public functions
- [ ] Complex logic explained with comments
- [ ] CHANGELOG.md updated with summary
- [ ] DECISIONS.md updated (if architectural change)
- [ ] README/cheatsheet updated (if needed)

---

## Anti-Pattern Review

### Mandatory Safety Checks

**Race Condition Prevention:**

- [ ] **Concurrent mutations:** Version fields checked before updates
- [ ] **Cursor validation:** All pagination cursors validated
- [ ] **State consistency:** No lost updates in concurrent scenarios
- [ ] **Idempotency:** Operations safe to retry

**Data Integrity:**

- [ ] **Immutable updates:** No in-place mutations of shared objects
- [ ] **Validation:** All user inputs validated with Zod
- [ ] **Optimistic locking:** Version checks in place for updates
- [ ] **Cascading operations:** Deletes/updates cascade correctly

**Worker/Queue Safety:**

- [ ] **Job timeouts:** BullMQ jobs have reasonable timeouts
- [ ] **Idempotency keys:** Jobs can be safely retried
- [ ] **Error handling:** Failed jobs handled gracefully
- [ ] **State persistence:** State saved before risky operations

**Async/Promise Safety:**

- [ ] **Unhandled rejections:** All promises properly handled
- [ ] **Race conditions:** Concurrent async calls managed correctly
- [ ] **Cleanup:** Finally blocks used for cleanup when needed
- [ ] **Error propagation:** Errors properly caught and handled

**Reviewed Against:**

- [ ] ANTI_PATTERNS.md (24 patterns)
- [ ] cheatsheets/anti-pattern-prevention.md
- [ ] DECISIONS.md (architectural precedents)

---

## Architecture & Design Review

### Design Correctness

- [ ] Follows project architecture (client/server/shared separation)
- [ ] Uses established patterns (custom hooks, service layer, etc.)
- [ ] Proper separation of concerns
- [ ] DRY principle applied (no unnecessary duplication)

### API Design (if applicable)

- [ ] Endpoint naming consistent with REST conventions
- [ ] Request/response schemas defined
- [ ] Error responses consistent (proper status codes)
- [ ] API versioning considered (if breaking)
- [ ] Documentation up-to-date

**API Endpoints Added/Modified:**

```typescript
// [List new/changed endpoints with brief description]
```

### Database Schema (if applicable)

- [ ] Schema changes follow existing patterns
- [ ] Proper indexes on query-heavy columns
- [ ] Foreign key constraints defined
- [ ] Not introducing N+1 query problems
- [ ] Migration tested (forward and rollback)

---

## Performance Considerations

### Performance Impact

- [ ] No obvious performance regressions
- [ ] Bundle size impact checked (if frontend)
- [ ] Database query optimization reviewed
- [ ] UI rendering performance acceptable

**Performance Notes:**

```
[Any performance analysis or metrics to highlight]
```

### Bundle Size Analysis (if frontend changes)

```bash
# Command to check
npm run build
```

- [ ] Bundle size within acceptable range
- [ ] No unnecessary large dependencies added

---

## Backwards Compatibility

### Breaking Changes

- [ ] No breaking changes OR explicitly documented
- [ ] Database migration path clear
- [ ] API deprecation handled properly
- [ ] Feature flag used (if needed for gradual rollout)

**Breaking Changes (if any):**

- [ ] Change 1: [Description and migration path]
- [ ] Change 2: [Description and migration path]

---

## Testing Depth

### Test Coverage

- [ ] Unit tests for business logic (>80% coverage target)
- [ ] Integration tests for API endpoints
- [ ] Component tests for React components
- [ ] Edge case tests (boundary conditions)
- [ ] Error scenario tests

**Test Statistics:**

```
Total tests: [number]
New tests: [number]
Test coverage: [%]
```

**Sample Test Results:**

```
[Paste output of npm test for relevant project]
```

---

## Manual Testing & Scenarios

### Tested Scenarios

- [ ] Happy path works correctly
- [ ] Error handling works as expected
- [ ] Edge cases handled gracefully
- [ ] Concurrent operations work correctly
- [ ] Database state consistent
- [ ] No console errors/warnings

**Testing Environment:**

- Browser/Version: [if applicable]
- Node Version: [if backend]
- Database: [PostgreSQL version]

**Manual Test Results:**

```
[Describe any manual testing performed]
[Include screenshots if relevant]
```

---

## Security Review

### Security Considerations

- [ ] No secrets/credentials in code
- [ ] Input validation at all entry points
- [ ] SQL injection prevented (using Drizzle ORM)
- [ ] XSS prevention (proper escaping)
- [ ] CSRF tokens used (if applicable)
- [ ] Authentication/authorization checks in place
- [ ] Rate limiting considered

**Security Concerns (if any):**

- [ ] Issue: [Description]
- [ ] Mitigation: [How addressed]

---

## Deployment Readiness

### Deployment Checklist

- [ ] Code changes ready for production
- [ ] Database migrations ready (if needed)
- [ ] Feature flags configured (if needed)
- [ ] Monitoring/alerts updated
- [ ] Rollback plan documented
- [ ] Staging validation passed

**Deployment Steps:**

```bash
[Describe deployment procedure]
[Include any special commands or migrations]
```

### Rollback Plan

```
[How to revert this change if issues occur]
[Any data cleanup needed]
```

---

## Code Review Questions

### For Reviewers

**Please pay special attention to:**

1. [Key area 1 - why this matters]
2. [Key area 2 - why this matters]
3. [Key area 3 - why this matters]

**Questions/Decisions Needing Feedback:**

1. [Question 1] - [Context]
2. [Question 2] - [Context]
3. [Question 3] - [Context]

**Known Limitations:**

- [ ] Limitation 1: [Explanation and future improvement]
- [ ] Limitation 2: [Explanation and future improvement]

---

## Related Documentation

### Links & References

- **Feature Spec:** [Link if exists]
- **Issue/Ticket:** [Link to GitHub issue]
- **Related PRs:** [Link to related PRs]
- **Relevant Docs:** [Link to cheatsheets/docs]
- **Design Doc:** [Link if applicable]

### Cheatsheet References

- CAPABILITIES.md - [Relevant section]
- ANTI_PATTERNS.md - [Relevant section]
- DECISIONS.md - [Relevant ADR/decision]
- cheatsheets/ - [Relevant cheatsheet]

---

## Commit Quality

### Git Hygiene

- [ ] Commits are logical and well-organized
- [ ] Commit messages follow convention
- [ ] No merge commits (rebased if needed)
- [ ] No debug/WIP commits

**Commit Messages Sample:**

```
feat(portfolio): Add MOIC calculation to portfolio overview
  - Implements MOIC schema validation
  - Updates Portfolio route to return MOIC data
  - Adds comprehensive test coverage

This implements the portfolio MOIC feature as specified in the design doc.
Closes #[issue-number]
```

---

## Review Status Tracking

### Sign-Off Checklist

- [ ] Code review complete
- [ ] All feedback addressed
- [ ] Tests passing on CI/CD
- [ ] Approved by at least 1 reviewer
- [ ] Ready to merge
- [ ] Ready for deployment

### CI/CD Status

- [ ] GitHub Actions: ✅ Passing
- [ ] TypeScript checks: ✅ Passing
- [ ] ESLint: ✅ Passing
- [ ] Tests: ✅ Passing
- [ ] Bundle size: ✅ Within limits

---

## Final Notes for Reviewer

**Summary for Reviewer:** [Concise explanation of what this PR does and why it
matters]

**Time Estimate for Review:**

- Complexity: [Low / Medium / High]
- Estimated review time: [X minutes]

**Questions for Reviewer:** [Any specific feedback you're seeking]

---

## Approval & Merge

### Ready for Merge When:

- [ ] At least 1 approval received
- [ ] All CI checks passing
- [ ] All anti-pattern checks passed
- [ ] Code review feedback addressed
- [ ] Documentation updated
- [ ] No merge conflicts

**Merge Strategy:**

- [ ] Squash and merge (for feature branches)
- [ ] Create a merge commit (for release branches)
- [ ] Rebase and merge (keep linear history)

---

## Post-Merge Monitoring

### Deployment Monitoring

After merge, monitor for:

- [ ] No new error spikes in production
- [ ] Performance metrics stable
- [ ] Database migrations successful
- [ ] Feature flag behavior correct
- [ ] No new support tickets

**Monitoring URLs:**

- [Error tracking dashboard]
- [Performance metrics]
- [User behavior analytics]
