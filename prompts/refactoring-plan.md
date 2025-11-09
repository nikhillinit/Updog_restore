# Safe Refactoring Plan Template

## Refactoring Overview

### Objective

**Title:** [Concise refactoring goal] **Scope:** [What's being refactored]
**Motivation:** [Why refactor now] **Priority:** [Critical / High / Medium /
Low]

**Estimated Effort:** [X story points or days] **Complexity:** [Low / Medium /
High]

---

## Problem Statement

### Current State Issues

**What's wrong with current code:**

- Issue 1: [Description and impact]
- Issue 2: [Description and impact]
- Issue 3: [Description and impact]

**Metrics of the Problem:**

```
Current: [Measurement of problem]
Goal: [Target improvement]
Impact: [Why it matters]
```

### Why This Refactoring Matters

- [ ] Performance improvement
- [ ] Code maintainability
- [ ] Reducing technical debt
- [ ] Preparing for feature work
- [ ] Simplifying complex logic
- [ ] Reducing code duplication

---

## Scope Definition

### What's Included

**Files/Components Affected:**

1. `[path/to/file.ts]` - [Brief description]
2. `[path/to/file.tsx]` - [Brief description]
3. `[path/to/file.test.ts]` - [Brief description]

**Change Categories:**

- [ ] File structure reorganization
- [ ] Function/component splitting
- [ ] State management changes
- [ ] API contract changes
- [ ] Database schema changes
- [ ] Dependency updates
- [ ] Type system improvements

### What's NOT Included

**Out of scope to prevent scope creep:**

- [ ] Item 1
- [ ] Item 2
- [ ] Item 3

---

## Risk Assessment

### Potential Risks

**High-Risk Areas:**

- [ ] Risk 1: [Description]
  - **Mitigation:** [How to reduce risk]
  - **Fallback:** [Rollback plan]

- [ ] Risk 2: [Description]
  - **Mitigation:** [How to reduce risk]
  - **Fallback:** [Rollback plan]

### Breaking Changes

- [ ] No breaking changes OR explicitly documented
- [ ] API consumers notified/updated
- [ ] Database migration path clear
- [ ] Feature-flagged if risky

---

## Strategy & Approach

### Refactoring Strategy

**Approach:** [Choose one]

- [ ] **Big Bang:** Rewrite entire section at once
  - Pros: [Fast, complete change]
  - Cons: [Higher risk, harder to review]

- [ ] **Incremental:** Refactor piece by piece
  - Pros: [Lower risk, easier review]
  - Cons: [Longer timeline, more PRs]

- [ ] **Parallel:** Keep old and new side-by-side
  - Pros: [Safe, gradual migration]
  - Cons: [Temporary duplication]

**Chosen Strategy:** [Selected approach and rationale]

### Refactoring Path

```
Step 1: [What to refactor first]
Step 2: [What to refactor second]
Step 3: [What to refactor third]
...
Final: [Integration and cleanup]
```

---

## Before Refactoring Checklist

### Preparation Phase

- [ ] Code review of original implementation
- [ ] Document current behavior thoroughly
- [ ] Write baseline tests (if not sufficient)
- [ ] Create backup branch for comparison
- [ ] Identify all callers of affected code
- [ ] Plan database migration (if needed)

### Test Coverage Baseline

```bash
# Current test status
npm test -- --project=[server|client]
```

**Current Coverage:**

- [ ] Statements: [%]
- [ ] Branches: [%]
- [ ] Functions: [%]
- [ ] Lines: [%]

**Coverage Gaps to Address:**

- [ ] Gap 1: [What to test]
- [ ] Gap 2: [What to test]

---

## Detailed Implementation Plan

### Phase 1: Extract & Isolate

**Goal:** Separate concerns and identify boundaries

```typescript
// Before: Mixed concerns
const complexFunction = () => {
  // Logic A (parsing)
  // Logic B (validation)
  // Logic C (transformation)
  // Logic D (persistence)
};

// After: Separated concerns
const parseInput = () => {
  /* Logic A */
};
const validateData = () => {
  /* Logic B */
};
const transformData = () => {
  /* Logic C */
};
const persistData = () => {
  /* Logic D */
};
```

**Tasks:**

- [ ] Extract function 1
- [ ] Extract function 2
- [ ] Create new file/module (if needed)
- [ ] Add tests for extracted functions
- [ ] Update imports/exports

### Phase 2: Refactor & Improve

**Goal:** Improve extracted code

```typescript
// Before: Inefficient/unclear
const calculateTotal = (items) => {
  let total = 0;
  for (let i = 0; i < items.length; i++) {
    total += items[i].price * items[i].quantity;
  }
  return total;
};

// After: Clear and efficient
const calculateTotal = (items: Item[]): number =>
  items.reduce((sum, item) => sum + item.price * item.quantity, 0);
```

**Tasks:**

- [ ] Improve algorithm/efficiency
- [ ] Enhance type safety
- [ ] Improve error handling
- [ ] Add validation
- [ ] Update tests

### Phase 3: Integrate & Test

**Goal:** Ensure changes work in context

```typescript
// Integration test
describe('Refactored module integration', () => {
  it('should work with existing code', () => {
    // Test with real dependencies
  });

  it('should handle edge cases', () => {
    // Test boundary conditions
  });
});
```

**Tasks:**

- [ ] Update callers of refactored code
- [ ] Write integration tests
- [ ] Test with actual dependencies
- [ ] Performance testing
- [ ] Manual testing in UI (if frontend)

### Phase 4: Cleanup & Polish

**Goal:** Remove old code and finalize

```typescript
// Remove: Old/duplicate code
// Keep: Only the refactored version
```

**Tasks:**

- [ ] Remove old implementations
- [ ] Remove temporary duplication
- [ ] Clean up imports/exports
- [ ] Update documentation
- [ ] Final test suite run

---

## Implementation Checklist

### Code Changes

- [ ] Refactored code written
- [ ] Type signatures correct (TypeScript strict)
- [ ] No `any` types without explanation
- [ ] Proper error handling
- [ ] Logging/debugging aids removed
- [ ] Code comments added (complex logic)

### Testing

- [ ] Unit tests for refactored code: `npm test -- --project=server`
- [ ] Integration tests passing: `npm test -- --project=server`
- [ ] End-to-end tests (if frontend): `npm test -- --project=client`
- [ ] Test coverage maintained or improved
- [ ] Edge cases covered
- [ ] Error paths tested

### Quality Gates

- [ ] ESLint passes: `npm run lint`
- [ ] TypeScript: `npm run check`
- [ ] No console errors/warnings
- [ ] Build succeeds: `npm run build`
- [ ] No performance regression

### Documentation

- [ ] JSDoc comments updated
- [ ] CHANGELOG.md entry added
- [ ] DECISIONS.md updated (if architectural)
- [ ] Code comments for complex sections
- [ ] README/cheatsheet updated (if needed)

---

## Validation & Testing Strategy

### Test Plan

**Unit Tests:**

```typescript
describe('Refactored: [Feature]', () => {
  it('should maintain original behavior', () => {
    // Regression test
    expect(newImplementation(input)).toEqual(expectedOutput);
  });

  it('should improve performance', () => {
    // Performance validation
    const start = performance.now();
    newImplementation(largeInput);
    const duration = performance.now() - start;
    expect(duration).toBeLessThan(100); // ms
  });

  it('should handle error cases', () => {
    // Error path tests
    expect(() => newImplementation(invalidInput)).toThrow();
  });
});
```

**Integration Tests:**

- [ ] Test with real database
- [ ] Test with real external services
- [ ] Test state persistence
- [ ] Test error recovery

**Manual Testing:**

- [ ] User workflow (if UI change)
- [ ] Concurrent operations
- [ ] Edge cases in production-like environment

### Performance Validation

```bash
# Benchmark before/after
npm run test:performance
```

**Performance Metrics:**

```
Before: [Measurement]
After: [Measurement]
Improvement: [% or X units]
Acceptable: [Yes / No]
```

---

## Review Considerations

### Code Review Focus Areas

**Reviewers should check:**

- [ ] Original behavior preserved (no behavioral changes)
- [ ] Test coverage sufficient
- [ ] Type safety improved
- [ ] No performance regressions
- [ ] Readability improved
- [ ] Anti-pattern violations eliminated

**Design Review Questions:**

1. Does the new structure make sense?
2. Are the boundaries correct?
3. Is this the right abstraction level?
4. Will this scale with future features?

---

## Rollback Plan

### Fallback Strategy

**If refactoring introduces issues:**

```bash
# Quick rollback
git revert [commit-hash]
npm install  # Reinstall deps if needed
npm test     # Verify rollback
npm run build # Rebuild
```

**Rollback Checklist:**

- [ ] Previous version restored
- [ ] Database state consistent
- [ ] All tests passing
- [ ] Production metrics normal
- [ ] Post-mortem scheduled

### Go/No-Go Criteria

**Ready to commit if:**

- [ ] All tests passing
- [ ] Code review approved
- [ ] Performance metrics acceptable
- [ ] No functional regressions
- [ ] Documentation complete

**Halt if:**

- [ ] Tests fail
- [ ] Performance degraded >10%
- [ ] New bugs introduced
- [ ] Architectural concerns raised

---

## Deployment & Monitoring

### Staging Validation

- [ ] Deploy to staging environment
- [ ] Run full test suite in staging
- [ ] Manual testing in staging
- [ ] Performance profiling in staging
- [ ] Database migration validated (if needed)

### Production Rollout

- [ ] Feature flag configuration (if needed)
- [ ] Gradual rollout: [10% → 50% → 100%]
- [ ] Monitoring setup complete
- [ ] Alerts configured
- [ ] On-call runbook updated

### Post-Deployment Monitoring

**Watch for:**

- [ ] Error rate changes
- [ ] Performance metrics
- [ ] Memory usage
- [ ] Database query performance
- [ ] User-reported issues

**Monitoring URLs:**

- [Error tracking dashboard]
- [Performance metrics]
- [Infrastructure monitoring]

---

## Anti-Pattern Prevention

### Refactoring Should NOT Introduce

**Race Conditions:**

- [ ] Concurrent access to shared state handled safely
- [ ] Locking/versioning strategy consistent
- [ ] No lost updates in concurrent scenarios

**Data Corruption:**

- [ ] Immutable updates maintained
- [ ] State transitions atomic
- [ ] Cascading changes handled correctly

**Type Safety Issues:**

- [ ] No new `any` types
- [ ] All types properly constrained
- [ ] Generics correctly applied

**Performance Regressions:**

- [ ] Algorithm complexity not increased
- [ ] No unnecessary iterations/loops
- [ ] Caching strategy maintained

---

## Success Metrics

### How We Know Refactoring Succeeded

**Code Quality Metrics:**

- [ ] Code coverage: [Baseline]% → [Target]%
- [ ] Complexity: [Current] → [Target] (cyclomatic complexity)
- [ ] Maintainability index: [Current] → [Target]
- [ ] Type safety: All `any` types reduced

**Performance Metrics:**

- [ ] Operation time: [Before]ms → [After]ms
- [ ] Memory usage: [Before]MB → [After]MB
- [ ] Bundle size: [Before]KB → [After]KB

**Developer Experience:**

- [ ] Easier to understand code
- [ ] Fewer bugs reported
- [ ] Faster feature development on refactored code
- [ ] Developer satisfaction surveys

---

## Timeline & Milestones

### Gantt Chart

```
Week 1: Prepare & Plan
  ├─ Code review of original [2 hours]
  ├─ Design review [2 hours]
  └─ Test coverage baseline [3 hours]

Week 2-3: Implementation
  ├─ Phase 1 Extract [2 days]
  ├─ Phase 2 Refactor [3 days]
  └─ Phase 3 Integrate [2 days]

Week 4: Review & Polish
  ├─ Code review [2 days]
  ├─ Phase 4 Cleanup [1 day]
  └─ Final testing [2 days]
```

**Key Dates:**

- [ ] Start date: [Date]
- [ ] Target completion: [Date]
- [ ] Deployment target: [Date]

---

## Communication Plan

### Stakeholder Updates

- [ ] Engineering team: [Frequency]
- [ ] Product team: [Frequency]
- [ ] Wider team: [Frequency]

**Communication Channels:**

- [ ] Slack channel: [#channel]
- [ ] Standup updates: [Frequency]
- [ ] Handoff memo: [After completion]

---

## Lessons & Improvements

### Post-Refactoring Review

**What Went Well:**

- [Success 1]
- [Success 2]
- [Success 3]

**What Could Be Better:**

- [Lesson 1]
- [Lesson 2]
- [Lesson 3]

**Apply to Future Refactors:**

- [ ] Process improvement 1
- [ ] Document addition 1
- [ ] Tool/script created

---

## Final Sign-Off

### Ready for Refactoring

- [ ] Plan reviewed and approved
- [ ] Tests baseline established
- [ ] Team aligned on approach
- [ ] Timeline realistic
- [ ] Risk assessment complete

### Refactoring Complete

- [ ] All phases finished
- [ ] Tests all passing
- [ ] Code review approved
- [ ] Deployed to production
- [ ] Monitoring shows success

---

## Appendix: Before/After Code Examples

### Example 1: [Component/Function Name]

```typescript
// Before (problematic)
// [Original code with issues highlighted]

// After (refactored)
// [Improved code with explanations]
```

### Example 2: [Component/Function Name]

```typescript
// Before (problematic)
// [Original code]

// After (refactored)
// [Improved code]
```

---

## References

**Related Documentation:**

- CAPABILITIES.md - [Relevant section]
- DECISIONS.md - [Relevant ADR]
- cheatsheets/ - [Related cheatsheet]

**Similar Refactors:**

- [Previous refactoring 1] - Lessons learned
- [Previous refactoring 2] - Lessons learned
