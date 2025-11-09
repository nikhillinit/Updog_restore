# Feature Implementation Request

## Overview

**Feature Name:** [Enter feature name] **Priority:** [Critical / High / Medium /
Low] **Sprint:** [Sprint number or date range] **Estimated Effort:** [e.g., 3
points / 5 days]

---

## Feature Description

### Problem Statement

[What problem does this feature solve? Who experiences it?]

### User Story

```
As a [user role]
I want to [action/capability]
So that [benefit/outcome]
```

### Acceptance Criteria

- [ ] Criterion 1: [Specific, measurable requirement]
- [ ] Criterion 2: [Specific, measurable requirement]
- [ ] Criterion 3: [Specific, measurable requirement]
- [ ] Criterion 4: [Specific, measurable requirement]

---

## Technical Specification

### Architecture Impact

**Components Affected:**

- [ ] Frontend (React/Tailwind)
- [ ] Backend (Express/Node)
- [ ] Database (Schema changes)
- [ ] API (New endpoints/modifications)
- [ ] Workers (BullMQ jobs)

**Dependencies:**

- External libraries: [List any new dependencies]
- Internal modules: [List affected modules]
- Data models: [List Drizzle schema changes]

### Data Model Changes

```typescript
// Before (if applicable)
// [Existing schema]

// After
// [New/modified schema]
```

### API Endpoints (if applicable)

```typescript
// New endpoints
POST /api/[path] - [Description]
  Request: { [structure] }
  Response: { [structure] }
  Error codes: [401, 404, 422, ...]

GET /api/[path]/:id - [Description]
  Response: { [structure] }
```

### Validation Rules

- [ ] Input validation (Zod schemas)
- [ ] Business logic constraints
- [ ] State transitions (if applicable)
- [ ] Permission checks

---

## Implementation Checklist

### Before Coding

- [ ] Read CAPABILITIES.md for existing solutions
- [ ] Review anti-pattern prevention guide
      (cheatsheets/anti-pattern-prevention.md)
- [ ] Check for similar existing features
- [ ] Identify all race conditions risks
- [ ] Design database migrations (if needed)
- [ ] Confirm idempotency requirements

### Code Implementation

- [ ] Test-driven development (write tests first)
- [ ] Type-safe implementation (TypeScript strict mode)
- [ ] Validation at all data entry points
- [ ] Error handling with appropriate status codes
- [ ] Logging at key decision points
- [ ] Follow project naming conventions (camelCase, PascalCase)

### Quality Gates (MANDATORY)

- [ ] ESLint passes (npm run lint)
- [ ] TypeScript compilation (npm run check)
- [ ] Unit tests pass (npm test -- --project=[server|client])
- [ ] Integration tests pass (if applicable)
- [ ] /test-smart run shows all affected tests passing
- [ ] /fix-auto resolves any lint/format issues

### Testing Strategy

- [ ] Unit tests: [What needs testing]
- [ ] Integration tests: [End-to-end scenarios]
- [ ] Edge cases: [Boundary conditions]
- [ ] Error scenarios: [Failure paths]

**Test Files Location:**

- Server tests: `tests/api/` or `server/routes/__tests__/`
- Client tests: `client/src/**/__tests__/`

### Documentation

- [ ] Update CHANGELOG.md with feature summary
- [ ] Log decision in DECISIONS.md (if architectural)
- [ ] Add JSDoc comments to public functions
- [ ] Update relevant cheatsheet if new pattern

---

## Anti-Pattern Prevention

### Race Condition Risks

- [ ] **Concurrent mutations:** Are updates protected by version fields?
- [ ] **Cursor validation:** All pagination cursors validated?
- [ ] **Job idempotency:** Worker jobs have idempotency keys?
- [ ] **Event ordering:** State changes respect correct order?

### Data Safety

- [ ] **Immutable updates:** No in-place mutations?
- [ ] **Schema validation:** Zod validation for all inputs?
- [ ] **Optimistic locking:** Version checks before updates?
- [ ] **Cascading deletes:** Proper cleanup logic?

### Worker/Queue Safety

- [ ] **Job timeouts:** BullMQ jobs have timeouts?
- [ ] **Retry logic:** Failed jobs have proper retry strategy?
- [ ] **Dead-letter handling:** Failed jobs tracked?
- [ ] **State consistency:** Jobs maintain state correctly?

---

## Deployment & Rollback

### Database Migrations

```bash
# Migration command (if needed)
npm run db:push
```

- [ ] Forward migration path clear
- [ ] Rollback strategy documented
- [ ] Data preservation verified

### Feature Flags (if applicable)

- [ ] Feature flag defined: `[FLAG_NAME]`
- [ ] Flag defaults to: [true / false]
- [ ] Gradual rollout plan: [e.g., 10% → 50% → 100%]

### Deployment Steps

1. [ ] Code merged to main
2. [ ] CI/CD passes (npm run build, /deploy-check)
3. [ ] Database migrated (if needed)
4. [ ] Feature flag enabled/disabled as needed
5. [ ] Smoke tests pass in staging
6. [ ] Production deployment

---

## Success Metrics

**How will we know this feature works?**

- [ ] Metric 1: [Measurable outcome]
- [ ] Metric 2: [Performance target]
- [ ] Metric 3: [User satisfaction metric]

**Monitoring & Alerts:**

- [ ] Error tracking configured
- [ ] Performance metrics tracked
- [ ] User behavior monitored

---

## Notes & Considerations

### Risks

- [List potential issues or blockers]

### Future Enhancements

- [Ideas for follow-up work]

### Questions for Review

- [Clarifications needed before coding starts]

---

## Review Checklist

**Code Review Requirements:**

- [ ] All acceptance criteria met
- [ ] Tests pass (/test-smart all green)
- [ ] Zero anti-pattern violations
- [ ] Documentation complete
- [ ] Performance acceptable (<500ms for blocking operations)
- [ ] No console.error in production code
- [ ] Error messages user-friendly

**Pre-Merge:**

- [ ] /deploy-check passes completely
- [ ] CHANGELOG.md updated
- [ ] DECISIONS.md updated (if architectural)
