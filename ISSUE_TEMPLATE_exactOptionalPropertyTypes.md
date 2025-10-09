# Enable `exactOptionalPropertyTypes` TypeScript Compiler Flag

## Summary

Enable `exactOptionalPropertyTypes: true` in `tsconfig.json` to improve type safety by preventing explicit `undefined` values from being passed to optional properties.

**Status:** Ready for scheduling
**Effort:** 2-3 focused days (12-18 hours estimated)
**Priority:** P2 - Tech Debt / Type Safety
**Risk:** Medium-High (touches user-facing UI components)

---

## Background

During October 2025 refactor, we attempted to enable `exactOptionalPropertyTypes` but discovered **~1,600 TypeScript diagnostics** across the codebase. The scope is too large for an incremental fix, requiring dedicated focused time.

**What this flag does:**
Prevents code like `{ optional: undefined }` and requires either omitting the property or using `{ optional: value }`. This catches subtle bugs where `undefined` is passed explicitly but not handled.

---

## Current State

### ✅ Already Fixed (Oct 2025)
These critical paths have been refactored and are ready:

| File | Changes | Status |
|------|---------|--------|
| `client/src/adapters/kpiAdapter.ts` | Conditional property spreading | ✅ Fixed |
| `client/src/components/analytics/AnalyticsErrorBoundary.tsx` | Proper prop construction | ✅ Fixed |
| `client/src/api/reserve-engine-client.ts` | Config without undefined values | ✅ Fixed |
| `client/src/core/flags/featureFlags.ts` | Type-safe env access | ✅ Fixed |
| `client/src/hooks/useFeatureFlag.ts` | Fixed env override handling | ✅ Fixed |
| `types/vite/client.d.ts` | Added local type stubs | ✅ Added |
| `types/vitest/client.d.ts` | Added test type stubs | ✅ Added |

**Commits:**
- `ff962f3` - "refactor(types): improve optional property handling for exactOptionalPropertyTypes compatibility"
- `c056324` - "revert(types): rollback exactOptionalPropertyTypes flag with tracking plan"

---

## Remaining Work (~1,600 Diagnostics)

### Affected Areas

| Priority | Module | Files (Est.) | Impact | Effort |
|----------|--------|-------------|--------|--------|
| **P1** | Error boundaries | 3-5 | Core reliability | 1-2 hours |
| **P2** | Chart components (Recharts/Nivo) | 15-20 | High visibility | 3-4 hours |
| **P2** | Dashboard views | 10-15 | High visibility | 2-3 hours |
| **P3** | Saved views | 5-8 | Medium usage | 1-2 hours |
| **P3** | Drag/drop builder | 8-10 | Medium usage | 2-3 hours |
| **P4** | Form components | 10-15 | Lower priority | 2-3 hours |
| **P4** | Remaining UI | 20-30 | Lower priority | 3-4 hours |

**Total:** ~50-80 files, 12-18 hours estimated

---

## Implementation Plan

### Phase 1: Enable Flag & Assess (30 min)
1. Set `exactOptionalPropertyTypes: true` in `tsconfig.json`
2. Run `npm run check` to capture all diagnostics
3. Export to file: `npm run check 2>&1 | tee exact-optional-errors.txt`
4. Categorize errors by module/component

### Phase 2: Fix by Priority (10-15 hours)

#### Pattern 1: Conditional Property Spreading
**Before:**
```typescript
const config = {
  baseUrl: 'https://api.example.com',
  apiKey: maybeApiKey,  // Could be undefined
  timeout: maybeTimeout ?? 30000,
};
```

**After:**
```typescript
const config = {
  baseUrl: 'https://api.example.com',
  ...(maybeApiKey !== undefined ? { apiKey: maybeApiKey } : {}),
  timeout: maybeTimeout ?? 30000,
};
```

#### Pattern 2: Prop Construction
**Before:**
```typescript
<Component
  optional={maybeValue}  // Passes undefined explicitly
  required={requiredValue}
/>
```

**After:**
```typescript
const props = {
  required: requiredValue,
  ...(maybeValue !== undefined ? { optional: maybeValue } : {}),
};
<Component {...props} />
```

#### Pattern 3: Type Adjustments
**Before:**
```typescript
interface Props {
  optional?: string;  // Allows undefined
}
```

**After (if undefined is intentional):**
```typescript
interface Props {
  optional?: string | undefined;  // Explicit undefined
}
```

### Phase 3: Validation & Testing (2-3 hours)
1. Run full test suite: `npm test`
2. Visual regression tests for charts/dashboards
3. Manual testing of:
   - Chart interactions (tooltips, legends, axis labels)
   - Saved view creation/loading
   - Drag/drop builder
   - Form submissions

### Phase 4: Documentation (30 min)
1. Update coding standards docs
2. Add ESLint rule to prevent regressions
3. Update this issue with results

---

## Migration Checklist

### Before Starting
- [ ] Create feature branch: `refactor/exact-optional-properties`
- [ ] Block out 2-3 consecutive days for focus
- [ ] Ensure all tests pass on main branch
- [ ] Notify team of high-risk refactor in progress

### Module Fixes
- [ ] **P1:** Error boundaries (1-2 hours)
- [ ] **P2:** Chart components - Recharts (2 hours)
- [ ] **P2:** Chart components - Nivo (1-2 hours)
- [ ] **P2:** Dashboard KPI cards (1 hour)
- [ ] **P2:** Dashboard grids/layouts (1 hour)
- [ ] **P3:** Saved views - creation (1 hour)
- [ ] **P3:** Saved views - loading (30 min)
- [ ] **P3:** Drag/drop - builder (1-2 hours)
- [ ] **P3:** Drag/drop - handlers (1 hour)
- [ ] **P4:** Form components (2-3 hours)
- [ ] **P4:** Remaining UI components (3-4 hours)

### Testing
- [ ] All unit tests pass (`npm test`)
- [ ] All integration tests pass
- [ ] Visual regression tests pass
- [ ] Manual testing: Charts (tooltips, interactions)
- [ ] Manual testing: Dashboards (KPI cards, filters)
- [ ] Manual testing: Saved views (create/load/delete)
- [ ] Manual testing: Drag/drop (reorder, add, remove)
- [ ] Manual testing: Forms (validation, submission)

### Deployment
- [ ] Code review completed
- [ ] PR approved by 2+ reviewers
- [ ] Merge to main
- [ ] Deploy to staging
- [ ] Smoke tests pass on staging
- [ ] Deploy to production
- [ ] Monitor error logs for 24 hours

---

## Success Criteria

1. ✅ `exactOptionalPropertyTypes: true` enabled in `tsconfig.json`
2. ✅ `npm run check` reports 0 errors
3. ✅ All tests pass (unit + integration)
4. ✅ No production incidents related to refactor
5. ✅ ESLint rule added to prevent regressions

---

## Risks & Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| Chart rendering bugs | High | Medium | Visual regression tests + manual QA |
| Form submission failures | High | Low | Comprehensive form tests + staging validation |
| Saved view corruption | Medium | Low | Backup/restore mechanism + migration tests |
| Performance regression | Low | Low | Bundle size checks + performance monitoring |

---

## References

- **TypeScript Docs:** [exactOptionalPropertyTypes](https://www.typescriptlang.org/tsconfig#exactOptionalPropertyTypes)
- **Related Commits:**
  - `ff962f3` - Initial improvements
  - `c056324` - Rollback with plan
- **Related PRs:** #112 (contains preparatory work)

---

## Notes

- The critical path fixes from Oct 2025 are **production-ready** and improve code quality immediately
- This refactor is **risk management**, not giving up on type safety
- Scheduling dedicated time ensures quality and reduces regression risk
- Consider pair programming for high-risk modules (charts, drag/drop)

---

**Created:** October 2025
**Type:** Tech Debt / Type Safety
**Labels:** `typescript`, `tech-debt`, `refactor`, `P2`
