---
description: Interactive helper showing available tools and when to use them
---

# Workflow Helper - Quick Reference

Interactive guide to available commands, agents, and when to use them.

## Available Commands

### `/test-smart`
**When to use:** After making code changes, before committing
**What it does:** Intelligently selects and runs only affected tests for fast feedback
**Example:** Made changes to `waterfall.ts` → Runs only waterfall-related tests

### `/fix-auto`
**When to use:** When you have lint errors, type errors, or simple test failures
**What it does:** Automatically fixes common issues (linting, formatting, simple type errors)
**Example:** After coding session, before committing changes

### `/deploy-check`
**When to use:** Before deployment, before merging to main, weekly validation
**What it does:** Comprehensive pre-deployment validation (8 phases)
**Example:** Ready to deploy → Runs full validation suite

### `/workflows` (this command)
**When to use:** Need help choosing which tool to use
**What it does:** Shows this interactive guide

## Available Agents

### `waterfall-specialist`
**When to use:** Editing waterfall calculation logic or related UI
**What it does:** Validates waterfall calculations, ensures helpers used correctly
**Example:** `Use waterfall-specialist agent to review my changes`
**Files:** `client/src/lib/waterfall.ts`, waterfall components

### `test-repair`
**When to use:** Tests are failing and you need autonomous repair
**What it does:** Diagnoses and fixes test failures while preserving intent
**Example:** `Use test-repair agent to fix these failing tests`

### `perf-guard`
**When to use:** After dependency updates, before deployment, weekly checks
**What it does:** Bundle analysis, performance regression detection
**Example:** `Use perf-guard agent to analyze bundle size`

### `db-migration`
**When to use:** Before running `npm run db:push`, when editing schema files
**What it does:** Validates schema changes, prevents data loss
**Example:** `Use db-migration agent before I push schema changes`
**Files:** `shared/db/schema/*`

## Decision Tree

```
┌─ Made code changes?
│
├─── Touching waterfall.ts or carry calculations?
│    └─→ Use waterfall-specialist agent
│
├─── Modifying database schema?
│    └─→ Use db-migration agent (before db:push!)
│
├─── Ready to commit?
│    ├─→ /fix-auto (clean up issues)
│    └─→ /test-smart (run affected tests)
│
├─── Tests failing?
│    └─→ Use test-repair agent
│
├─── Updated dependencies (package.json)?
│    ├─→ npm run doctor:links (Windows sidecar check)
│    └─→ Use perf-guard agent (bundle impact)
│
└─── Ready to deploy?
     └─→ /deploy-check (full validation)
```

## Routine Workflows

### Daily Development
```
1. Start coding
2. Make changes
3. /test-smart (verify affected tests)
4. /fix-auto (clean up before commit)
5. Commit changes
6. Update CHANGELOG.md (/log-change)
```

### Before Every Commit
```
- [ ] /fix-auto (lint, types, simple test fixes)
- [ ] /test-smart (affected tests pass)
- [ ] Update CHANGELOG.md if feature/fix
```

### Before Deployment
```
- [ ] /deploy-check (full validation)
- [ ] perf-guard agent (bundle analysis)
- [ ] db-migration agent (if schema changed)
- [ ] Update CHANGELOG.md
- [ ] Update DECISIONS.md (if architectural)
```

### Weekly Maintenance
```
- [ ] /deploy-check (health check)
- [ ] npm audit (security check)
- [ ] npm outdated (dependency check)
- [ ] Review CHANGELOG for clarity
- [ ] perf-guard agent (bundle trend)
```

## Common Scenarios

### Scenario: "I'm adding a new feature"
```
1. Code the feature
2. If touching waterfall → waterfall-specialist agent
3. If schema changes → db-migration agent
4. /test-smart (run affected tests)
5. /fix-auto (clean up)
6. /log-change "feat: [description]"
7. If architectural → /log-decision
```

### Scenario: "Tests are failing"
```
1. Try /fix-auto first (handles simple failures)
2. If still failing → test-repair agent
3. /test-smart to verify fix
```

### Scenario: "Build is broken"
```
1. Check if Windows sidecar issue → npm run doctor:links
2. /fix-auto (type/lint issues)
3. If bundle issues → perf-guard agent
4. npm run build to verify
```

### Scenario: "Ready to push to production"
```
1. /deploy-check (comprehensive validation)
2. Review deployment readiness report
3. Fix any critical issues
4. Warnings? Review but may proceed
5. All green? Safe to deploy!
```

## Memory Management

**CHANGELOG.md** (`/log-change`)
- Every feature, bug fix, dependency update
- Timestamped entries

**DECISIONS.md** (`/log-decision`)
- Architectural choices
- Algorithm changes
- Tech stack additions

**cheatsheets/** (`/create-cheatsheet [topic]`)
- Reusable patterns
- Complex workflows
- Domain knowledge

## Quick Links

- [CLAUDE.md](../CLAUDE.md) - Core architecture
- [CHANGELOG.md](../../CHANGELOG.md) - Recent changes
- [DECISIONS.md](../../DECISIONS.md) - Architectural decisions
- [cheatsheets/](../../cheatsheets/) - Detailed guides

## Tips

- **Use agents proactively**: Don't wait for failures, invoke for validation
- **Commands are fast**: /test-smart and /fix-auto save time
- **Document as you go**: /log-change after every feature
- **Weekly validation**: /deploy-check even if not deploying
- **Windows quirks**: npm run doctor:links if build issues

---

**Need more help?** Ask: "What should I do when [scenario]?"
