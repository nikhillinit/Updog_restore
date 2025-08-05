---
name: Async Migration
about: Template for async forEach replacement PRs
title: 'refactor(async): [file names] resilient batch migration'
labels: async-migration, performance
---

## 🔄 Async Migration PR

### Files Modified
- [ ] `client/src/pages/fund-setup.tsx`
- [ ] `workers/cohort-worker.ts`
- [ ] Other: ___________

### Checklist
- [ ] ✅ All `forEach` loops handling async operations replaced with `resilientLimit`
- [ ] ✅ `asyncRepl.inc()` called with batch count after successful operations
- [ ] ✅ Circuit breaker parameters configured (concurrency: 4, maxFailures: 3)
- [ ] ✅ Error handling preserves original error context
- [ ] ✅ Local tests pass: `npm test tests/utils/async-iteration.test.ts`
- [ ] ✅ No new ESLint warnings for `no-async-array-methods`

### Performance Impact
- [ ] Ran `node scripts/bench-async.js` locally
- [ ] P95 latency: _____ ms (budget: 400ms)
- [ ] Memory delta: _____ MB

### Migration Pattern Used
```javascript
// Before
items.forEach(async (item) => { /* risky */ });

// After
const limit = resilientLimit({ concurrency: 4, maxFailures: 3 });
await Promise.all(items.map(item => limit(async () => { /* safe */ })));
asyncRepl.inc({ file: 'filename.tsx' }, 1);
```

### Notes
_Any special considerations or deviations from standard pattern_
