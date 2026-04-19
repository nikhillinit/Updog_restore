---
status: ACTIVE
last_updated: 2026-04-18
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
# 1. Linting
npm run lint

# 2. Type Checking (MUST show 0 type errors)
npm run check

# 3. Tests (MUST pass all tests)
npm test -- --run
```

### Enforcement Reality

The repo's **quality intent is stricter than current automated enforcement**.

- Local workflow target: zero new lint debt, zero type errors, passing tests
- Current CI enforcement is still operating with baseline ceilings in
  `.github/workflows/code-quality.yml`
- As of 2026-04-18, CI allows `MAX_ESLINT_ERRORS: 4700` and warns at
  `WARNING_ANY_TYPES: 5000`
- These thresholds are **temporary ratchet ceilings for legacy debt**, not
  permission to add new violations
- Do not rely on baseline-tolerant CI to justify regressions in touched code

### Type Safety Rules

This project enforces **TypeScript strict mode** and a **ratchet toward stricter
lint enforcement**:

- Runtime/application code should avoid `any` and prefer `unknown` + type guards
- `eslint.config.js` currently sets `@typescript-eslint/no-explicit-any` to
  `warn` in the main TypeScript block and `off` for test files
- Treat `any` as an exception to be minimized and justified, not a normal tool
- The enforcement direction is to ratchet `any` back toward hard-fail status as
  baseline debt is reduced
- Use `unknown` + type guards for truly dynamic data
- Reference `tsconfig.json` for strict mode settings
- Use proper Drizzle ORM types from `@shared/schema`
- Consult cheatsheets/anti-pattern-prevention.md (24 cataloged patterns)

### Commit Protocol

- **NEVER** use `git commit --no-verify` to bypass hooks
- **NEVER** use current CI baselines to justify new lint or type debt
- **NEVER** commit with new or unexplained linting violations in touched code
- **NEVER** defer type safety fixes to "followup commit"
- Fix all violations inline before committing

### Pre-Implementation Checklist

Before implementing TypeScript changes:

1. Read `eslint.config.js` type-safety rules and current severities
2. Read `tsconfig.json` strict mode settings
3. Read `cheatsheets/anti-pattern-prevention.md` (anti-patterns)
4. Use proper types from `@shared/schema` (Drizzle ORM tables)

### Quality Gate Failure Protocol

If any gate fails:

1. **Stop** - Do not proceed to commit
2. **Review** - Analyze violations/errors
3. **Fix** - Address root cause and remove any new debt in touched code
4. **Re-run** - Verify typecheck and tests are green, and lint is not regressing
5. **Then commit** - Only after the change set meets local quality expectations

Use `/pre-commit-check` command for automated validation.
