---
status: ACTIVE
last_updated: 2026-03-27
---

# Claude Code Standard Workflow

## MANDATORY FIRST STEP (Before ANY Task)

```
1. Read CLAUDE.md
2. Search the repo for existing solutions
3. Use docs/INDEX.md and .claude/DISCOVERY-MAP.md for routing
4. Check CHANGELOG for similar past work
5. Consult CAPABILITIES.md only if historical inventory helps
```

## Task Workflow (After Discovery Check)

### Phase 1: Informed Planning

1. **Check the current surface** - What code, docs, commands, skills, or agents
   already exist for this?
2. **Create informed TodoWrite** - Tasks that USE existing tools
3. **Verify approach** - Would existing agents handle this better?

### Phase 2: Execution

1. **Mark in_progress** - One task at a time
2. **Use existing agents** - Via Task tool
3. **Mark completed** - Immediately when done
4. **Next task** - Continue through list

## NEVER DO THIS:

- Create todos to build things that already exist
- Skip repo search and routing docs
- Implement from scratch without checking the current surface
- Ignore existing agents

## ALWAYS DO THIS:

- Start with CLAUDE.md, repo search, docs/INDEX.md, and .claude/DISCOVERY-MAP.md
- Use existing agents via Task tool
- Run agents in parallel when possible
- Update discovery docs when adding durable tools or workflows

## Example Workflow

**User Request:** "Analyze our fund's performance"

**Step 1: Check Current Surface**

```
Read CLAUDE.md
Search repo for existing report flows
Check docs/INDEX.md and .claude/DISCOVERY-MAP.md
Found: waterfall-specialist, docs-architect, existing reporting docs
```

**Step 2: Create Informed Todos**

```
TodoWrite:
- [ ] Use waterfall-specialist for carry analysis
- [ ] Use perf-guard for performance metrics
- [ ] Generate report with docs-architect
```

**Step 3: Execute Using Existing Tools**

```
Task(waterfall-specialist, ...)
Task(perf-guard, ...)
Task(docs-architect, ...)
```

---

**This workflow ensures we leverage existing capabilities instead of recreating
them.**

---

## Quality Gate Protocol (MANDATORY)

**For all agents making code changes:**

### Pre-Commit Verification Sequence

Before ANY commit, run all three quality gates:

```bash
# 1. Linting (MUST show 0 errors, 0 warnings)
npm run lint

# 2. Type Checking (MUST show 0 type errors)
npm run check

# 3. Tests (MUST pass all tests)
npm test -- --run
```

### Type Safety Rules

This project enforces **STRICT type safety**:

- NEVER use `any` type (eslint.config.js enforces
  `@typescript-eslint/no-explicit-any: 'error'`)
- Use `unknown` + type guards for truly dynamic data
- Reference tsconfig.json (strict mode enabled: line 32)
- Use proper Drizzle ORM types from `@shared/schema`
- Consult cheatsheets/anti-pattern-prevention.md (24 cataloged patterns)

### Commit Protocol

- **NEVER** use `git commit --no-verify` to bypass hooks
- **NEVER** commit with known linting violations
- **NEVER** defer type safety fixes to "followup commit"
- Fix all violations inline before committing

### Pre-Implementation Checklist

Before implementing TypeScript changes:

1. Read `eslint.config.js` lines 132-138 (type safety rules)
2. Read `tsconfig.json` line 32 (strict mode confirmation)
3. Read `cheatsheets/anti-pattern-prevention.md` (anti-patterns)
4. Use proper types from `@shared/schema` (Drizzle ORM tables)

### Quality Gate Failure Protocol

If any gate fails:

1. **Stop** - Do not proceed to commit
2. **Review** - Analyze violations/errors
3. **Fix** - Address root cause (no workarounds)
4. **Re-run** - Verify all gates pass
5. **Then commit** - Only after all gates are green

Use `/pre-commit-check` command for automated validation.
