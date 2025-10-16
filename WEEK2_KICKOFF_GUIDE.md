# Week 2 Kickoff Guide: Server-Side TypeScript Remediation

**Date:** 2025-10-13
**Track:** 1B (Server + API)
**Prerequisites:** Week 1 (Track 1A) merged and tagged

## Quick Start (30 seconds)

```bash
# 1. Ensure you're on latest main with Week 1 tag
git checkout main && git pull
git tag | grep v0.1.0-ts-week1-client-complete  # Should show the tag

# 2. Create Week 2 branch
git checkout -b remediation/week2-server-strictness

# 3. Enable server strictness
# Edit tsconfig.server.json: remove any compilerOptions that override strictness
# It should inherit strict: true and exactOptionalPropertyTypes: true from base tsconfig.json

# 4. Capture baseline
mkdir -p artifacts/week2
npm run check:server 2>&1 | tee artifacts/week2/server-errors-baseline.txt

# 5. Commit and create draft PR
git add tsconfig.server.json artifacts/week2/
git commit -m "chore(day0): enable server strictness + record baseline"
gh pr create \
  --title "Week 2 (Day-0): Server strictness baseline" \
  --draft \
  --body "Enables \`strict: true\` and \`exactOptionalPropertyTypes: true\` for server code. Baseline errors captured in \`artifacts/week2/server-errors-baseline.txt\`. Track 1B remediation will follow the same atomic commit pattern as Track 1A."
```

## Post-Merge Checklist (Track 1A)

### ✅ Tag the Release

```bash
git checkout main && git pull
git tag -a v0.1.0-ts-week1-client-complete -m "Week 1: Client+Shared TS Remediation (88→0)

Track 1A complete via parallel agentic workflows:
- Client + Shared TypeScript errors: 88 → 0
- 46 atomic commits (100% conventional format)
- Slack Guard hardened (staging-monitor whitelisted; archives excluded; SIGPIPE safe)
- Codacy unblocked (function-scoped suppression; refactor tracked in #153)
- Execution time: ~3 hours (including CI debugging)
- Patterns documented for Week 2 reuse

Next: Week 2 - Server-side TypeScript remediation (Track 1B)"

git push origin v0.1.0-ts-week1-client-complete
```

### ✅ Optional: Update CHANGELOG.md

```bash
# Add entry to CHANGELOG.md
cat >> CHANGELOG.md << 'EOF'

## [v0.1.0-ts-week1-client-complete] - 2025-10-13

### Week 1: Client-Side TypeScript Remediation Complete

**Track 1A Summary:**
- **Client TS Errors:** 88 → 0 ✅
- **Shared TS Errors:** 0 → 0 ✅ (maintained)
- **Commits:** 46 atomic commits (100% conventional format)
- **Strategy:** Parallel agentic workflows with proven patterns

**Key Patterns Applied:**
1. `spreadIfDefined` helper (38 instances)
2. Explicit `| undefined` unions for optional properties
3. Type guards (`isDefined<T>()`)
4. Bracket notation for dynamic property access

**CI Hardening:**
- Slack Guard: whitelisted `staging-monitor.yml`, excluded archives
- Codacy: function-scoped suppression with follow-up (#153)
- SIGPIPE: safe pipeline handling

**Components Remediated:**
- Analytics engines: ReserveEngine, LiquidityEngine, PacingEngine, CohortEngine
- Modeling wizard: All steps (8 components)
- UI components: Dashboard cards, error boundaries, scenario comparison

**References:**
- PR: #154 (supersedes #145)
- Tag: `v0.1.0-ts-week1-client-complete`
- Follow-up: #153 (jcurve.ts refactoring)

EOF

git add CHANGELOG.md
git commit -m "docs: add Week 1 completion entry to CHANGELOG"
git push origin main
```

## Week 2 Strategy

### Baseline Capture

After enabling server strictness, expect errors in these areas:

**Likely Error Hotspots:**
1. **Express route handlers** - Optional params, query strings
2. **Database queries** - Drizzle ORM result types
3. **API validation** - Zod schema defaults
4. **Worker processes** - BullMQ job data types
5. **Middleware** - Request/response augmentation

**Expected Error Count:** 100-200 errors (estimate based on server codebase size)

### Remediation Patterns (Reuse from Week 1)

#### 1. spreadIfDefined Helper
```typescript
import { spreadIfDefined } from '@shared/lib/ts/spreadIfDefined';

// Express route handler
app.post('/api/funds', async (req, res) => {
  const fund = await createFund({
    name: req.body.name,
    ...spreadIfDefined('description', req.body.description),
    ...spreadIfDefined('managerId', req.query.managerId),
  });
});
```

#### 2. Type Guards for Middleware
```typescript
import { isDefined } from '@shared/lib/ts/type-guards';

// Auth middleware
function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!isDefined(req.user)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}
```

#### 3. Zod Schema Defaults
```typescript
import { z } from 'zod';

// API validation with proper optional handling
const fundSchema = z.object({
  name: z.string(),
  description: z.string().optional(),  // Will be string | undefined
  fundSize: z.number().positive(),
  managementFee: z.number().positive().default(0.02),  // Default value
});
```

#### 4. Drizzle ORM Result Types
```typescript
import { eq } from 'drizzle-orm';
import { funds } from '@shared/db/schema';

// Query with proper null handling
const fund = await db.query.funds.findFirst({
  where: eq(funds.id, fundId),
});

if (!fund) {
  throw new Error('Fund not found');
}

// Now TypeScript knows fund is defined
return fund;
```

### Parallel Workflow (Same as Week 1)

**Phase 1: Core API Routes** (Priority)
- Fund CRUD endpoints
- Investment CRUD endpoints
- Analytics endpoints

**Phase 2: Worker Processes**
- Reserve calculation workers
- Pacing analysis workers
- Monte Carlo workers

**Phase 3: Middleware & Utilities**
- Authentication middleware
- Validation middleware
- Error handlers
- Database utilities

**Commit Pattern:**
```
fix(api): resolve 12 strict TS errors in fund routes
fix(workers): resolve 8 errors in reserve-calculation worker
fix(middleware): resolve validation middleware optional types
```

### CI Considerations

**Slack Guard:** Already hardened (no changes needed)
**Codacy:** Watch for new complexity warnings in route handlers
**Build:** Server build must succeed before merge

## Success Criteria

### Week 2 Complete When:

- [ ] Server TypeScript errors: N → 0
- [ ] All API tests pass
- [ ] Worker processes compile cleanly
- [ ] Build succeeds: `npm run build:server`
- [ ] No new runtime behavior changes
- [ ] All commits conventional format
- [ ] Draft PR → Ready for review

### Merge Checklist

- [ ] `npm run check:server` → 0 errors
- [ ] `npm run test:api` → All passing
- [ ] `npm run build:server` → SUCCESS
- [ ] PR description includes before/after error counts
- [ ] Patterns documented for Week 3 (if applicable)

## Rollback Plan

If Week 2 needs to be reverted:

```bash
# Option 1: Revert merge commit
git revert <merge-sha> -m 1

# Option 2: Reset to Week 1 tag
git reset --hard v0.1.0-ts-week1-client-complete
git push origin main --force-with-lease  # Requires admin

# Option 3: Disable server strictness temporarily
# Edit tsconfig.server.json: add "strict": false
git add tsconfig.server.json
git commit -m "chore: temporarily disable server strictness"
git push
```

## Follow-Up Tasks (Non-Blocking)

### After Week 2 Merge

1. **Branch Protection:** Make Slack Guard required status
   ```bash
   # GitHub Settings → Branches → main → Edit
   # Add "check (1)" and "check (2)" to required status checks
   ```

2. **Codacy Follow-Up:** Refactor `jcurve.ts` (#153)
   - Break into smaller pure functions
   - Add golden tests for output parity
   - Remove ESLint suppression

3. **Documentation:** Update pattern library
   ```bash
   # Create shared/lib/ts/README.md with all patterns
   # Document: spreadIfDefined, type guards, Zod defaults, etc.
   ```

4. **Performance:** Bundle size check
   ```bash
   npm run size-limit
   # Ensure no significant increase from type changes
   ```

## Week 3 Preview (Optional)

If there's additional TypeScript work:

**Track 1C: Test Files**
- Enable strictness for `**/*.test.ts`
- Fix test helper types
- Ensure mock types align with source

**Track 1D: Config Files**
- `vite.config.ts`
- `vitest.config.ts`
- Build/deployment scripts

## Resources

### Pattern Library
- `shared/lib/ts/spreadIfDefined.ts` - Optional property helper
- `shared/lib/ts/type-guards.ts` - Type guard utilities
- `shared/lib/waterfall.ts` - Discriminated union patterns

### Reference Commits (Week 1)
```bash
# View Week 1 remediation commits
git log v0.1.0-ts-week1-client-complete --oneline --grep="fix(core)\|fix(wizard)\|fix(ui)"

# Example commit for pattern reference
git show <commit-sha>
```

### Documentation
- `CLAUDE.md` - Project conventions
- `DECISIONS.md` - Architectural decisions
- `docs/PR_NOTES/CODACY_JCURVE_NOTE.md` - Codacy mitigation example

## Contact / Questions

If issues arise during Week 2:

1. **Check existing patterns** from Week 1 commits
2. **Review error messages** - Most are similar to Week 1
3. **Use proven workflows** - Same parallel strategy
4. **Test incrementally** - Each commit should build

## Summary

**Week 1 Status:** ✅ COMPLETE (PR #154 ready to merge)
**Week 2 Status:** 📋 READY TO START
**Estimated Time:** 3-4 hours (similar to Week 1)
**Risk Level:** 🟢 LOW (proven patterns, types-only)

---

**Prepared by:** Claude Code
**Date:** 2025-10-13
**Version:** 1.0

🚀 Ready to ship Week 1 and roll into Week 2!
