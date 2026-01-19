---
status: ACTIVE
last_updated: 2026-01-19
---

# 🧹 Cleanup PR Template - Remove Legacy State System

**Use this template when fund store rollout reaches 100% for 24+ hours**

## PR Title
```
🧹 Remove legacy state system after successful fund store rollout
```

## PR Description Template
```markdown
## 🎯 Cleanup Summary

Fund store rollout has been at 100% for 24+ hours with stable metrics:
- Error score: < 5 consistently
- Migration success: > 99.5%
- Kill-switch usage: < 5 users
- Zero production issues

Time to clean up legacy code paths.

## ✅ Changes Made

### Files Removed
- [ ] `client/src/state/useFundContext.tsx` (legacy context)
- [ ] `client/src/state/FundProvider.tsx` (legacy provider)
- [ ] `client/src/hooks/useLegacyFundState.ts` (legacy hooks)

### Files Modified
- [ ] `client/src/pages/fund-setup.tsx` - Remove legacy imports
- [ ] `client/src/pages/fund-setup/steps/Step3Graduation.tsx` - Clean conditional logic
- [ ] `client/src/config/features.ts` - Default fund store to "on"

### Tests Cleaned
- [ ] Remove legacy state unit tests
- [ ] Update integration tests to assume fund store
- [ ] Keep migration tests for historical reference

### Documentation Updated
- [ ] `docs/DEPLOYMENT_RUNBOOK.md` - Archive rollout instructions
- [ ] `README.md` - Update architecture section
- [ ] Add migration retrospective notes

## 🧪 Validation Checklist

- [ ] All tests pass: `npm test`
- [ ] Build succeeds: `npm run build`
- [ ] E2E tests pass: `npm run e2e`
- [ ] Fund setup wizard works in dev: `npm run dev`
- [ ] Kill switches still functional (for emergency use)

## 🔄 Rollback Plan

If issues arise after cleanup:
1. **Immediate**: Use emergency rollback in `main.tsx`
2. **Short-term**: Revert this PR and redeploy
3. **Long-term**: Re-implement legacy paths if absolutely needed

## 📈 Metrics to Watch

Monitor for 48h after merge:
- Page load times (should improve slightly)
- Bundle size (should decrease ~5-10KB)
- Console errors (should remain stable)
- User feedback (no functionality loss)

## 🎉 Benefits

- ~200 lines of dead code removed
- Simplified mental model for developers
- Faster builds and tests
- Single source of truth for fund state

---

**Ready for merge when:** All validation items checked ✅
```

## 🏷️ Suggested Labels
```
cleanup, tech-debt, performance, ready-for-review
```

## 📋 Files to Focus On

### High Priority (Remove First)
```
client/src/state/useFundContext.tsx
client/src/state/FundProvider.tsx  
client/src/hooks/useLegacyFundState.ts
client/src/__tests__/legacy-state.test.tsx
```

### Medium Priority (Clean Conditionals)
```
client/src/pages/fund-setup.tsx
client/src/pages/fund-setup/steps/Step3Graduation.tsx
client/src/components/wizard/WizardProgress.tsx
```

### Low Priority (Documentation)
```
docs/ARCHITECTURE.md
docs/STATE_MANAGEMENT.md
README.md
```

## ⚠️ Keep These (For Emergency Use)
```
client/src/config/features.ts - Keep flag structure
client/src/config/rollout.ts - Keep for future rollouts
client/src/main.tsx - Keep emergency rollback
client/src/lib/telemetry.ts - Keep monitoring
```

---

*Use this template 24-48h after reaching 100% rollout*
*Estimated cleanup time: 2-3 hours*
*Risk level: Low (emergency rollbacks available)*
