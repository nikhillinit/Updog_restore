---
status: ACTIVE
last_updated: 2026-01-19
---

# Daily Workflow - Solo Developer Guide

Quick reference for common development workflows on the Updog VC fund modeling
platform.

## Session Start

### What Claude Will Show You

```
 Welcome back to Updog development!

 Available Tools:
  • /test-smart - Run only affected tests
  • /fix-auto - Auto-fix lint/type/test issues
  • /deploy-check - Full pre-deployment validation
  • /workflows - Interactive tool selection guide

 Specialized Agents:
  • waterfall-specialist - Domain calculation validation
  • test-repair - Autonomous test fixing
  • perf-guard - Bundle analysis & regression detection
  • db-migration - Safe schema change management

 Recent Context:
  • Last commit: [timestamp and message]
  • Current branch: [branch name]
  • Uncommitted files: [count]
```

### Your Quick Start Checklist

- [ ] Review uncommitted changes: `git status`
- [ ] Check recent commits: `git log -3 --oneline`
- [ ] Review CHANGELOG.md for recent context
- [ ] Start development server: `npm run dev` (if needed)

---

## Development Cycles

### Feature Development Workflow

```
┌─ 1. CODE
│   └─ Make your changes
│
├─ 2. TEST (fast feedback)
│   └─ /test-smart
│       ├─ Analyzes changed files
│       ├─ Runs only affected tests
│       └─ ~30s instead of full suite
│
├─ 3. FIX (automated cleanup)
│   └─ /fix-auto
│       ├─ Auto-fix linting
│       ├─ Fix simple type errors
│       ├─ Delegate test failures to agent
│       └─ ~2-3 minutes
│
├─ 4. DOCUMENT
│   └─ /log-change "feat: [description]"
│
└─ 5. COMMIT
    └─ Descriptive commit message
```

### Bug Fix Workflow

```
┌─ 1. REPRODUCE
│   └─ Isolate the issue
│
├─ 2. FIX
│   └─ Apply fix
│
├─ 3. TEST
│   └─ /test-smart (verify fix + no regressions)
│
├─ 4. DOCUMENT
│   └─ /log-change "fix: [description]"
│
└─ 5. COMMIT
    └─ Reference issue if applicable
```

### Refactoring Workflow

```
┌─ 1. REFACTOR
│   └─ Make improvements
│
├─ 2. VALIDATE
│   ├─ /test-smart (behavior unchanged)
│   └─ npm run build (no bundle regressions)
│
├─ 3. DOCUMENT
│   ├─ /log-change "refactor: [description]"
│   └─ /log-decision (if pattern/architecture changed)
│
└─ 4. COMMIT
    └─ Explain WHY refactored
```

---

## Contextual Reminders (What Claude Will Say)

### When You Edit Waterfall Files

> **Reminder**: You're editing waterfall calculations. Consider:
>
> - Invoke `waterfall-specialist` agent for validation
> - Run `npm run test -- waterfall` before committing
> - See: 19 test cases in `client/src/lib/__tests__/waterfall.test.ts`
> - Always use helpers: `applyWaterfallChange()`, `changeWaterfallType()`

**Files that trigger this:**

- `client/src/lib/waterfall.ts`
- `client/src/components/carry/*`
- `shared/types/waterfall.ts`
- `shared/schemas/waterfall.ts`

### When You Edit Schema Files

> ⚠️ **Schema Change Detected**: Before running `npm run db:push`:
>
> - Invoke `db-migration` agent to validate safety
> - Categorize risk: Safe / Risky / Dangerous
> - Check if Zod schemas in `/shared` need updates
> - Consider data migration plan

**Files that trigger this:**

- `shared/db/schema/*.ts`

### When You Update Dependencies

> **Dependency Change**: After `npm install`:
>
> - Invoke `perf-guard` agent to check bundle impact
> - Run `npm run doctor:quick` (module resolution check)
> - Run full test suite (deps can break anything)
> - Check for security vulnerabilities: `npm audit`

**Files that trigger this:**

- `package.json`

### When Tests Fail

> **Auto-fix available**: Try `/fix-auto` to handle:
>
> - Linting errors → `npm run lint:fix`
> - Simple type errors
> - Test failures → delegates to `test-repair` agent
>
> Or explicitly: `Use test-repair agent to fix these failures`

### When You Say "Ready to Commit"

> ✅ **Pre-commit checklist**:
>
> - Run `/test-smart` (only affected tests, fast feedback)
> - Run `/fix-auto` (clean up lint/type/test issues)
> - Update CHANGELOG.md (`/log-change`)
> - Update DECISIONS.md if architectural (`/log-decision`)

### When You Say "Ready to Deploy"

> **Deployment Checklist**:
>
> - Run `/deploy-check` (8-phase validation)
> - All checks passed from report?
> - CHANGELOG.md updated?
> - DECISIONS.md updated if architectural change?
> - Consider backup plan for schema changes

---

## Decision Tree: Which Tool?

```
┌─ What are you doing?
│
├───  Writing code
│    │
│    ├─── Waterfall calculations?
│    │    └─→ [Coding] → waterfall-specialist agent → /test-smart
│    │
│    ├─── Schema changes?
│    │    └─→ [Coding] → db-migration agent → verify → db:push
│    │
│    ├─── Engine logic (Reserve/Pacing/Cohort)?
│    │    └─→ [Coding] → /test-smart (focus on engine tests)
│    │
│    └─── UI components?
│         └─→ [Coding] → /test-smart → /fix-auto
│
├───  Fixing issues
│    │
│    ├─── Tests failing?
│    │    └─→ /fix-auto → (if still failing) → test-repair agent
│    │
│    ├─── Build failing?
│    │    └─→ npm run doctor:quick -> /fix-auto -> npm run build
│    │
│    └─── Type errors?
│         └─→ /fix-auto → (if complex) → manual review
│
├───  Preparing to commit/deploy
│    │
│    ├─── Just committing?
│    │    └─→ /test-smart → /fix-auto → /log-change → commit
│    │
│    └─── Deploying?
│         └─→ /deploy-check → review report → deploy
│
└───  Maintenance
     │
     ├─── Updated dependencies?
     │    └─→ npm run doctor:quick -> perf-guard agent -> npm test
     │
     └─── Weekly health check?
          └─→ /deploy-check → npm audit → npm outdated
```

---

## ⚡ Quick Commands Reference

### Commands You'll Use Daily

```bash
# Development
npm run dev              # Start full dev environment (port 5000)
npm run dev:client       # Frontend only (Vite)
npm run dev:api          # Backend only (Express)

# Testing
/test-smart              # Smart test selection (RECOMMENDED)
npm run test:quick       # Skip API tests (fast)
npm test                 # Full test suite
npm run test:ui          # Interactive dashboard

# Quality
/fix-auto                # Auto-fix lint/type/test issues
npm run lint:fix         # Fix linting only
npm run check            # Type checking only

# Validation
/deploy-check            # Full pre-deployment check
npm run build            # Production build
npm run doctor:quick     # Module resolution check

# Database
npm run db:studio        # Open Drizzle Studio
npm run db:push          # Push schema (CAUTION: use db-migration agent first!)

# Documentation
/log-change              # Update CHANGELOG.md
/log-decision            # Update DECISIONS.md
/create-cheatsheet       # New cheatsheet
```

### Agents You'll Invoke

```
Use waterfall-specialist agent to review my changes
Use test-repair agent to fix these failing tests
Use perf-guard agent to analyze bundle size
Use db-migration agent before I push schema changes
```

---

## Routine Schedules

### Before Every Commit

```
- [ ] /test-smart (affected tests)
- [ ] /fix-auto (cleanup)
- [ ] /log-change (document change)
- [ ] Descriptive commit message
```

### Before Every Merge to Main

```
- [ ] /deploy-check (full validation)
- [ ] All tests passing
- [ ] CHANGELOG.md updated
- [ ] DECISIONS.md updated (if architectural)
```

### Weekly (Friday Afternoon)

```
- [ ] /deploy-check (health check)
- [ ] npm audit (security check)
- [ ] npm outdated (dependency check)
- [ ] Review CHANGELOG for clarity
- [ ] perf-guard agent (bundle trend)
- [ ] Clean up branches: git branch --merged
```

### Monthly (End of Month)

```
- [ ] Dependency updates (major versions)
- [ ] Performance deep dive (perf-guard agent)
- [ ] Review DECISIONS.md alignment
- [ ] Test coverage review
- [ ] Archive old branches
```

---

## Emergency Procedures

### "Build is completely broken"

```
1. npm run doctor:quick (module resolution issue?)
2. git status (uncommitted changes causing issues?)
3. npm install (dependencies out of sync?)
4. /fix-auto (try automated repair)
5. git diff (what changed recently?)
6. git log -5 --oneline (recent commits suspicious?)
7. git bisect (if needed to find breaking commit)
```

### "All tests failing after schema change"

```
1. DON'T PANIC - schema mismatches common
2. npm run db:studio (inspect actual schema)
3. Check Zod schemas in /shared match DB
4. Run npm run check (type errors?)
5. test-repair agent (fix test data fixtures)
6. Worst case: Revert schema, plan migration carefully
```

### "Bundle size exploded"

```
1. perf-guard agent (detailed analysis)
2. Check package.json (new heavy dep?)
3. npm ls [package] (duplicate versions?)
4. Review imports (importing entire libraries?)
5. Check for circular dependencies
6. Consider code splitting/lazy loading
```

---

## Pro Tips

### Speed Up Development

- Use `/test-smart` instead of full suite (30s vs 5min)
- `/fix-auto` before commit saves time vs manual fixes
- Keep CHANGELOG.md updated as you go (don't batch)
- Invoke agents proactively, not reactively

### Avoid Common Pitfalls

- **Never** `npm run db:push` without `db-migration` agent review
- **Always** use waterfall helpers, never manual mutations
- **Check** `npm run doctor:quick` if Vite or dependency resolution errors
  appear
- **Update** both Zod schemas AND DB schema together

### Windows-Specific

- All commands run in PowerShell/CMD, **not** Git Bash
- Module resolution issues are usually dependency or Vite config drift
  (doctor:quick checks core modules)
- Path separators: `\` not `/`

### Domain Knowledge

- Waterfall types: AMERICAN (catch-up) vs EUROPEAN (simpler)
- Engines: ReserveEngine, PacingEngine, CohortEngine
- Path aliases: `@/` = client/src, `@shared/` = shared

---

## Related Documentation

- [CLAUDE.md](../CLAUDE.md) - Core architecture & conventions
- [CHANGELOG.md](../CHANGELOG.md) - Recent changes
- [DECISIONS.md](../DECISIONS.md) - Architectural decisions
- [cheatsheets/claude-code-best-practices.md](claude-code-best-practices.md) -
  Integration patterns
- [docs/notebooklm-sources/waterfall.md](../docs/notebooklm-sources/waterfall.md) -
  Waterfall calculation semantics and examples

---

## Your Session End Checklist

```
Before you wrap up:

 Uncommitted changes?
   └─→ Commit now or stash for next session

 CHANGELOG.md updated?
   └─→ /log-change for features/fixes

 Tests passing?
   └─→ /test-smart to verify

 Learned something reusable?
   └─→ /create-cheatsheet [topic]

 Friday?
   └─→ Weekly review (see above)
```

**See you next session! **
