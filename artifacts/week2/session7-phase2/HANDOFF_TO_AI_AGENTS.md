# Handoff to AI Agents: Phase 2A Investigation

## Quick Start for AI Agents

**Mission:** Fix 2 TypeScript type narrowing errors that are blocking Phase 2A completion.

**Repository:** `c:\dev\Updog_restore\` (branch: `remediation/week2-server-strictness`)

**Investigation Document:** `artifacts/week2/session7-phase2/AI_AGENT_INVESTIGATION_PROMPT.md`

---

## Concise Prompt for AI Agents

```
You are investigating 2 TypeScript strict mode errors where control flow analysis is not narrowing types as expected.

CONTEXT:
- Project: TypeScript 5.x strict mode with exactOptionalPropertyTypes enabled
- Current state: 71 errors (down from 74 after Phase 2A partial completion)
- Target: Fix 2 remaining Phase 2A errors to reach 69 errors

ERROR 1: server/routes/flags.ts:207:22 (TS2345)
- Issue: Zod-validated, destructured variable `reason` not narrowing from `string | undefined` to `string` after typeof guard
- Code context: `const { reason } = validation.data; if (!reason || typeof reason !== 'string') return; await updateFlag(..., reason);`
- Function expects: `reason: string`
- TypeScript sees: `string | undefined`

ERROR 2: server/routes/monte-carlo.ts:131:25 (TS2345)
- Issue: Express `req.path` not narrowing from `string | undefined` to `string` after typeof guard inside closure
- Code context: `res['on']('finish', () => { const path = req.path; if (typeof path === 'string') recordHttpMetrics(..., path); });`
- Function expects: `route: string`
- TypeScript sees: `string | undefined`

TASKS:
1. Identify why TypeScript control flow analysis fails in each case
2. Provide working fixes that are types-only (no runtime changes)
3. Create reusable patterns for similar cases in codebase
4. Document root cause with minimal reproductions

DELIVERABLES:
- Root cause analysis for each error
- Working code fixes
- Verification that errors are eliminated
- Recommended patterns for future use

REFERENCE:
- Full investigation guide: artifacts/week2/session7-phase2/AI_AGENT_INVESTIGATION_PROMPT.md
- Detailed context: artifacts/week2/session7-phase2/PHASE2A_INVESTIGATION_REQUIRED.md
- Current errors: artifacts/week2/session7-phase2/tsc.after.2A.txt
- TypeScript config: tsconfig.server.json

TIME BUDGET: 60 minutes
SUCCESS CRITERIA: 71 → 69 errors, types-only fixes, no new errors introduced
```

---

## Files for AI Agents to Access

### Primary Investigation Documents
1. **AI_AGENT_INVESTIGATION_PROMPT.md** (this directory)
   - Complete investigation methodology
   - Minimal reproduction templates
   - Expected deliverable format

2. **PHASE2A_INVESTIGATION_REQUIRED.md** (this directory)
   - Detailed error context
   - All attempted fixes with results
   - Investigation questions and hypotheses

### Source Files with Errors
3. **server/routes/flags.ts** (lines 180-210)
   - Error at line 207, column 22
   - Destructured Zod variable not narrowing

4. **server/routes/monte-carlo.ts** (lines 123-136)
   - Error at line 131, column 25
   - Closure context preventing narrowing

### Supporting Files
5. **server/lib/flags.ts** (lines 322-326) - `updateFlag` signature
6. **server/metrics.ts** (lines 63-68) - `recordHttpMetrics` signature
7. **server/types/request-response.ts** - Custom Express types
8. **shared/schemas/flags.ts** - Zod schema definitions
9. **tsconfig.server.json** - TypeScript configuration

### Artifacts
10. **tsc.after.2A.txt** - Current typecheck output (71 errors)
11. **backups/*.backup** - Original file states before Phase 2A

---

## Expected Output Format

AI agents should return a markdown document structured as:

```markdown
# Investigation Results: Phase 2A TypeScript Narrowing

## Error 1: flags.ts:207 - SOLVED ✅

### Root Cause
[Why TypeScript doesn't narrow]

### Solution
```typescript
// Working fix
```

### Verification
```bash
# Test command
npx tsc --noEmit server/routes/flags.ts
# Result: No errors
```

### Pattern
[Reusable pattern for codebase]

---

## Error 2: monte-carlo.ts:131 - SOLVED ✅

[Same structure]

---

## Summary
- Errors fixed: 2/2
- New error count: 69 (down from 71)
- Patterns created: [list]
- Recommendations: [list]
```

---

## Integration Instructions

When AI agents return their findings:

1. **Review Solutions**
   - Verify fixes are types-only
   - Check no runtime behavior changes
   - Confirm patterns are maintainable

2. **Apply Fixes**
   ```bash
   # Test proposed fixes
   npx tsc --noEmit -p tsconfig.server.json
   # Expected: 71 → 69 errors
   ```

3. **Commit Changes**
   ```bash
   git add server/routes/flags.ts server/routes/monte-carlo.ts
   git commit -m "fix(types): Phase 2A remaining errors - [pattern description]"
   ```

4. **Update Documentation**
   - Add patterns to project style guide if reusable
   - Update PHASE2A_INVESTIGATION_REQUIRED.md with results
   - Mark investigation as COMPLETE

5. **Continue with Phase 2B**
   - Phase 2A will be 100% complete (5/5 errors fixed)
   - Proceed with infrastructure fixes in Phase 2B

---

## Current Project State

### Phase 2A Status (After These Fixes)
- ✅ calculations.ts:8 - Router import
- ✅ monte-carlo.ts:118 - Function binding
- ✅ metrics.ts:101 - Response method
- 🔬 flags.ts:207 - Under investigation
- 🔬 monte-carlo.ts:131 - Under investigation

### Overall Session 7 Progress
- **Starting:** 103 errors (Session 7 start)
- **After Phase 0:** 91 errors (quarantine)
- **After Phase 1:** 74 errors (schema alignment)
- **After Phase 2A (partial):** 71 errors
- **After Phase 2A (complete):** 69 errors (projected)
- **Session 7 Target:** ≤25-30 errors

### Next Steps
- **Phase 2B:** 9 infrastructure errors (locks, http-preconditions, health)
- **Phase 2C:** 5 middleware/metrics errors (engine-guards, lpBusinessMetrics)
- **Estimated completion:** 69 → 55 errors (-14, 20% reduction)

---

## Contact Points

**Primary Developer:** Continue Phase 2B in parallel
**AI Agents:** Investigate in sandbox, return solutions
**Integration:** Apply solutions when ready, test, commit

**Timeline:**
- Investigation: 60 minutes (parallel to Phase 2B)
- Integration: 10 minutes (after solutions received)
- Validation: 5 minutes (typecheck + manual review)

---

## Success Metrics

✅ **Technical Success:**
- Both errors eliminated (71 → 69)
- Types-only fixes (no runtime changes)
- No new errors introduced

✅ **Process Success:**
- Root causes documented
- Patterns generalized for reuse
- Integration smooth and quick

✅ **Project Impact:**
- Phase 2A 100% complete (5/5 errors)
- Clear path for similar issues in future phases
- Maintained momentum toward Session 7 target

---

**Status:** 🚀 READY FOR AI AGENT DEPLOYMENT
**Priority:** MEDIUM (parallel work stream)
**Owner:** External AI Agents → Integration by primary developer

---

**Document Created:** 2025-01-14
**Last Updated:** 2025-01-14
**Next Review:** After AI agent investigation complete
