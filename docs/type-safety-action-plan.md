---
status: ACTIVE
last_updated: 2026-01-19
---

# Type Safety Action Plan

## Current State Analysis (Baseline Metrics)

### 📊 Metrics Summary
- **Files scanned**: 604 TypeScript files
- **Explicit "any"**: 620 occurrences
- **"as any" casts**: 189 occurrences  
- **"as unknown" casts**: 11 occurrences (good!)
- **@ts-ignore**: 5 occurrences
- **TypeScript errors**: 850 errors
- **Unknown usage**: 88 (shows some progress already)

### 🔍 Issue Breakdown
- **explicit-any**: 526 occurrences (highest priority)
- **as-any**: 185 occurrences (type assertion issues)
- **untyped-request**: 19 occurrences (Express/Fastify handlers)

## Priority Action Items

### 🔴 Critical (Week 1)
1. **Fix Worker Types** - Workers have many `any` types that handle critical data
   - `workers/reserve-worker.ts`
   - `workers/report-worker.ts`
   - `workers/cohort-worker.ts`
   
2. **Fix Request/Response Types** - 19 untyped HTTP handlers
   - Add proper Express/Fastify types
   - Create `AuthenticatedRequest` interface

3. **Replace High-Risk "as any"** - 185 type assertions bypassing safety
   - Start with API boundaries
   - Focus on data transformation points

### 🟡 Important (Week 2)
1. **Vendor Type Definitions** - `types/vendor.d.ts` has many `any` types
2. **Service Layer Types** - Add proper types to service functions
3. **Component Props** - Type React component props properly

### 🟢 Nice to Have (Week 3+)
1. **Test File Types** - Lower priority as they don't affect production
2. **Migration Scripts** - One-time scripts can wait
3. **Example/Demo Files** - Documentation code is lowest priority

## Implementation Strategy

### Phase 1: Quick Wins (This Week)
```bash
# 1. Apply safe replacements (any → unknown)
npm run ai:type-safety --max-fixes=50

# 2. Fix compilation errors in critical paths
npm run check 2>&1 | grep -E "workers|server/routes" | head -20

# 3. Run ESLint and fix warnings
npm run lint:fix
```

### Phase 2: Systematic Cleanup (Next Week)
1. **Monday**: Fix all worker types
2. **Tuesday**: Fix all Express/Fastify handler types
3. **Wednesday**: Replace "as any" with proper assertions
4. **Thursday**: Fix vendor.d.ts definitions
5. **Friday**: Test and measure improvement

### Phase 3: Enforcement (Week 3)
1. Escalate ESLint rules from `warn` to `error`
2. Add pre-commit hooks to prevent new `any` usage
3. Set up CI gates to block PRs with type errors

## Success Metrics

### Target Reductions
| Metric | Current | Week 1 Target | Week 2 Target | Final Goal |
|--------|---------|---------------|---------------|------------|
| Explicit "any" | 620 | 400 (-35%) | 200 (-68%) | <50 |
| "as any" casts | 189 | 100 (-47%) | 50 (-74%) | 0 |
| TypeScript errors | 850 | 500 (-41%) | 200 (-76%) | 0 |
| @ts-ignore | 5 | 3 | 1 | 0 |

### Business Impact Metrics
- **Developer Velocity**: Track PR review time (expect 20% reduction)
- **Production Bugs**: Monitor type-related errors (expect 50% reduction)
- **IDE Experience**: Survey team on autocomplete quality (expect improvement)

## Risk Mitigation

### Potential Risks
1. **Breaking Changes**: Some type fixes might reveal hidden bugs
   - Mitigation: Test thoroughly, use feature flags
   
2. **Performance Impact**: Unknown types require runtime checks
   - Mitigation: Profile critical paths, optimize hot loops
   
3. **Developer Friction**: Stricter types slow initial development
   - Mitigation: Provide training, share patterns, helper types

## Team Communication

### Stakeholder Message
> We're improving type safety to reduce production bugs by 50% and improve developer experience. This is a 3-week initiative with minimal disruption to feature development.

### Developer Guidelines
1. **No new `any` types** in new code
2. **Use `unknown` instead of `any`** when type is truly unknown
3. **Add proper types** to all function parameters
4. **Document complex types** with JSDoc comments

## Automation & Tooling

### Available Commands
```bash
# Scan for issues
node scripts/type-safety-scanner.js

# Apply fixes
npm run ai:type-safety

# Check metrics
node scripts/quick-type-metrics.js

# Run linter
npm run lint

# Type check
npm run check
```

### CI Integration (Coming Soon)
```yaml
type-safety-check:
  - npm run metrics:type-safety
  - npm run lint
  - npm run check
  - Compare metrics to baseline
  - Fail if regression detected
```

## Next Immediate Actions

1. ✅ Baseline metrics collected
2. ✅ Issues identified and categorized
3. ⏳ Apply first batch of fixes (starting now)
4. ⏳ Test and verify no regressions
5. ⏳ Measure improvement
6. ⏳ Report to team

## Progress Tracking

### Week 1 Checklist
- [ ] Apply 50 automated fixes
- [ ] Fix all worker types manually
- [ ] Add Request/Response types
- [ ] Reduce "any" count by 35%
- [ ] Document patterns for team

### Week 2 Checklist
- [ ] Fix vendor.d.ts
- [ ] Complete service layer types
- [ ] Eliminate "as any" casts
- [ ] Reduce TypeScript errors by 75%
- [ ] Escalate some ESLint rules

### Week 3 Checklist
- [ ] Enable strict type checking
- [ ] Add pre-commit hooks
- [ ] Complete documentation
- [ ] Achieve <50 "any" usages
- [ ] Celebrate success! 🎉