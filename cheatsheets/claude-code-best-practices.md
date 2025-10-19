# Claude Code Best Practices - Updog Integration

Integration patterns from Anthropic's Claude Code developer guide, optimized for solo side-project development.

## Overview

This guide documents Claude Code features integrated into the Updog project, based on [Anthropic's official developer guide](https://docs.claude.com/en/docs/claude-code/).

**Our Implementation Philosophy:**
- **Suggest and wait**: Claude recommends agents/commands, you explicitly approve
- **Conversational reminders**: In-chat prompts instead of blocking hooks
- **Minimal friction**: Automate the boring, alert for the critical
- **Solo-optimized**: No team overhead (PR templates, external CI/CD)

---

## 🤖 Specialized Subagents

### What They Are
Subagents are pre-configured AI assistants with:
- Specific expertise areas
- Separate context windows (preserves main conversation)
- Custom tool access
- Specialized system prompts

### Our Subagents

| Agent | Purpose | When Invoked | Tools |
|-------|---------|--------------|-------|
| `waterfall-specialist` | Validate waterfall calculations | Editing waterfall logic/UI | Read, Edit, Grep, Glob, Bash |
| `test-repair` | Autonomous test failure fixing | Tests fail after changes | Read, Edit, Write, Bash, Grep, Glob |
| `perf-guard` | Bundle analysis & regressions | Dependency updates, pre-deployment | Read, Bash, Grep, Glob, Write |
| `db-migration` | Safe schema change management | Before `db:push`, schema edits | Read, Edit, Bash, Grep, Glob |

**Location:** `.claude/agents/*.md`

**Usage:**
```
Use waterfall-specialist agent to review my changes
Use test-repair agent to fix these failing tests
```

**Benefits:**
- **Context preservation**: Agent analysis doesn't pollute main conversation
- **Specialized expertise**: Domain-specific validation (waterfall math, schema safety)
- **Reusability**: Define once, use across sessions
- **Flexible permissions**: Limit tools to what each agent needs

**Best Practice:**
> Invoke agents **proactively** (before problems) not just reactively (after failures)

---

## 🛠️ Custom Slash Commands

### What They Are
Markdown files with YAML frontmatter that expand into detailed prompts for Claude.

### Our Commands

| Command | Purpose | Use Case |
|---------|---------|----------|
| `/test-smart` | Intelligent test selection | After code changes (runs only affected tests) |
| `/fix-auto` | Automated repair workflow | Before commit (lint, types, tests) |
| `/deploy-check` | 8-phase pre-deployment validation | Before merging/deploying |
| `/workflows` | Interactive tool selection guide | When unsure which tool to use |

**Location:** `.claude/commands/*.md`

**Usage:**
```
/test-smart
/fix-auto
/deploy-check
/workflows
```

**Benefits:**
- **Consistency**: Same workflow every time
- **Speed**: Single command triggers multi-step process
- **Documentation**: Commands self-document workflows
- **Shareable**: Team can use same commands (if you expand)

**Command Structure:**
```markdown
---
description: Brief description shown in /help
---

# Command Title

Detailed instructions for Claude on how to execute this workflow...
```

---

## 🔗 Hooks (Minimal Automation)

### What They Are
Scripts that execute in response to events (tool calls, file edits).

### Our Hook Strategy

**Philosophy:** Minimal automation, maximum control

**Configured in:** `.claude/settings.json`

```json
{
  "hooks": {
    "PostToolUse": {
      "Edit(**/*.ts)": "npm run lint:fix",
      "Edit(**/*.tsx)": "npm run lint:fix"
    }
  }
}
```

**What We Automate:**
- ✅ Linting after TypeScript edits (non-intrusive)

**What We DON'T Automate:**
- ❌ Pre-commit hooks (blocking)
- ❌ Auto-testing (prefer explicit `/test-smart`)
- ❌ Auto-deployment (always manual)
- ❌ Schema pushes (always require `db-migration` agent review)

**Why Minimal Hooks?**
- Solo dev: You decide when to act
- Side project: Minimize friction
- Learning: Explicit commands reinforce patterns

---

## 🎯 Extended Thinking (When to Use)

### What It Is
Claude uses additional reasoning tokens to think deeply about complex problems before responding.

### When to Use
- Planning architectural changes
- Debugging complex calculation logic (waterfall, Monte Carlo)
- Evaluating tradeoffs (e.g., Drizzle vs Prisma)
- Understanding engine logic (ReserveEngine, PacingEngine, CohortEngine)

### How to Trigger
```
Think deeply about the best approach for implementing OAuth2 in our API
Think hard about edge cases in waterfall catch-up calculations
```

**Intensity levels:**
- "think" → Basic extended thinking
- "think hard" / "think deeply" → More thorough reasoning
- "think a lot" / "think longer" → Maximum depth

### Our Use Cases
- **Waterfall logic changes**: Think through AMERICAN vs EUROPEAN edge cases
- **Schema migrations**: Evaluate data loss risks
- **Performance optimizations**: Analyze bundle splitting strategies
- **Engine refactoring**: Plan reserve allocation algorithm changes

**Note:** Extended thinking is disabled by default. Enable per-task with prompts or set `MAX_THINKING_TOKENS` in settings.

---

## 📝 Conversational Reminder System

### Session Start
Every session, Claude shows:
```
👋 Welcome back to Updog development!

📋 Available Tools:
  • /test-smart, /fix-auto, /deploy-check, /workflows

🤖 Specialized Agents:
  • waterfall-specialist, test-repair, perf-guard, db-migration

💡 Recent Context:
  • Last commit, current branch, uncommitted files
```

### Inline Reminders (File-Based)

**Editing waterfall files:**
```
💡 Reminder: You're editing waterfall calculations. Consider:
- Invoke waterfall-specialist agent for validation
- Run npm run test -- waterfall before committing
- See: 19 test cases in waterfall.test.ts
```

**Editing schema files:**
```
⚠️ Schema Change Detected: Before running npm run db:push:
- Invoke db-migration agent to validate safety
- Check if Zod schemas need updates
- Consider data migration plan
```

**Updating package.json:**
```
📦 Dependency Change: After npm install:
- Invoke perf-guard agent to check bundle impact
- Run npm run doctor:links (Windows sidecar check)
- Run full test suite
```

### Action-Based Reminders

**When you say "ready to commit":**
```
✅ Pre-commit checklist:
- Run /test-smart (only affected tests)
- Run /fix-auto (clean up issues)
- Update CHANGELOG.md (/log-change)
```

**When you say "ready to deploy":**
```
🚀 Deployment Checklist:
- Run /deploy-check (8-phase validation)
- CHANGELOG.md updated?
- DECISIONS.md updated if architectural?
```

### Weekly Review (Fridays)
```
🗓️ Week in Review:
- Commits this week, tests added, coverage change, bundle size
📋 Maintenance Tasks:
- [ ] Run /deploy-check
- [ ] npm audit
- [ ] npm outdated
```

---

## 🔒 Permission Boundaries

### Configured in `.claude/settings.json`

**Allow (Auto-approved):**
```json
"allow": [
  "Bash(npm run lint:*)",
  "Bash(npm run test:*)",
  "Bash(npm run check:*)",
  "Bash(npm run build:*)",
  "Bash(git status:*)",
  "Bash(git diff:*)",
  "Read(**/*)"
]
```

**Deny (Require Approval):**
```json
"deny": [
  "Bash(npm run db:push*)",  // Schema changes need db-migration agent review
  "Bash(git push*)",          // You control deployments
  "Write(.env*)",             // Protect secrets
  "Write(package.json)"       // Dependency changes need review
]
```

**Why These Boundaries?**
- **Safety**: Prevent accidental schema pushes, deployments, secret exposure
- **Control**: You decide critical actions
- **Speed**: Auto-approve safe, repetitive commands

---

## 📊 Parallel Tool Execution

### What It Means
Claude can run multiple independent tool calls simultaneously for speed.

### Our Use Cases

**Code Quality Checks (Phase 1 of /deploy-check):**
```bash
# Run in parallel
npm run check   # Type checking
npm run lint    # Linting
npm test        # Test suite
```

**Git Analysis:**
```bash
# Run in parallel
git status --porcelain
git diff --name-only main...HEAD
git log -5 --oneline
```

**Bundle Analysis:**
```bash
# Run in parallel
npm run build
npm ls --depth=0
npm audit --production
```

**Benefits:**
- `/deploy-check` completes in ~5min instead of ~10min
- `/test-smart` identifies affected tests faster
- Better user experience (less waiting)

**How to Trigger:**
```
Run lint, tests, and type checking in parallel
Analyze git status, diff, and recent commits concurrently
```

---

## 🔄 Resume Previous Conversations

### What It Does
Continue Claude Code sessions from exactly where you left off.

### How to Use

**Continue most recent:**
```bash
claude --continue
```

**Pick from history:**
```bash
claude --resume
```
(Shows interactive picker with summaries)

### Our Use Cases
- **Multi-day features**: Resume complex feature work
- **Debugging sessions**: Continue investigation next day
- **Context preservation**: Full message history restored

**Benefits:**
- No need to re-explain context
- Tool usage history preserved
- Conversation flow maintained

---

## 🖥️ Windows Development: Git Worktrees

### What They Are
Multiple working directories from same repository, each with different branch checked out.

### Why Useful for Solo Dev
- Run parallel Claude sessions (different features)
- Test changes without switching branches
- Deploy from one worktree while developing in another

### How to Use

**Create worktree:**
```bash
git worktree add ../updog-feature-analytics -b feature/analytics
```

**Run Claude in worktree:**
```bash
cd ../updog-feature-analytics
claude
```

**Manage worktrees:**
```bash
git worktree list
git worktree remove ../updog-feature-analytics
```

### Our Use Cases
- **Major refactoring**: Test in worktree while main continues
- **Urgent bugfix**: Fix in separate worktree while feature work continues
- **Experimentation**: Try risky changes without polluting main worktree

**Important:** Run `npm install` in each worktree (sidecar architecture)

---

## 🧪 Unix-Style Utility Patterns

### Pipe Integration

**Analyze errors:**
```bash
cat build-error.txt | claude -p 'concisely explain root cause'
```

**Process logs:**
```bash
npm test 2>&1 | claude -p 'summarize test failures'
```

### Output Format Control

**Text (default):**
```bash
claude -p 'analyze this code' --output-format text > summary.txt
```

**JSON (for scripts):**
```bash
claude -p 'find bugs' --output-format json > analysis.json
```

**Streaming JSON:**
```bash
claude -p 'parse log file' --output-format stream-json
```

### Our Use Cases
- **CI/CD integration**: JSON output for GitHub Actions
- **Automated analysis**: Pipe build errors for diagnosis
- **Batch processing**: Process multiple files through Claude

---

## 📁 Project-Specific Integrations

### Waterfall Calculation Validation

**Pattern:**
```typescript
// ❌ DON'T: Manual updates
waterfall.hurdle = 0.08

// ✅ DO: Use helpers
applyWaterfallChange(waterfall, 'hurdle', 0.08)
```

**Claude's Role:**
- `waterfall-specialist` agent validates helper usage
- Checks 19 test cases pass
- Ensures type safety (discriminated union)
- Validates value constraints (hurdle/catchUp [0,1])

### Database Schema Safety

**Pattern:**
```
1. Edit schema in shared/db/schema/
2. Claude detects change, suggests db-migration agent
3. Agent categorizes risk: Safe / Risky / Dangerous
4. Agent suggests migration SQL if risky
5. You approve and run db:push
```

**Risk Categories:**
- **Safe**: Nullable columns, new tables, indexes
- **Risky**: Renaming columns, type changes, NOT NULL
- **Dangerous**: Dropping columns/tables, breaking FKs

### Bundle Performance Monitoring

**Pattern:**
```
1. Update dependencies (package.json)
2. Claude reminds to check bundle impact
3. perf-guard agent runs npm run build
4. Analyzes bundle sizes, checks for regressions
5. Reports: Critical (>15%), Warning (>10%), Info (>5%)
```

**Baselines:**
- Total bundle: <500 KB
- Vendor chunk: <300 KB
- App chunk: <200 KB
- Build time: <30s

### Test Intelligence

**Pattern:**
```
1. Make code changes
2. /test-smart analyzes git diff
3. Maps changed files to test files
4. Runs only affected tests (~30s vs 5min)
5. If failures: Suggests test-repair agent
```

**Mapping Rules:**
- `client/src/lib/waterfall.ts` → `npm run test -- waterfall`
- `shared/db/schema/*` → `npm test` (full suite)
- `package.json` → `npm test` (full suite)

---

## 🎯 Solo Developer Optimizations

### What We DIDN'T Implement (And Why)

| Feature | Why Not | Alternative |
|---------|---------|-------------|
| Blocking pre-commit hooks | Slows iteration | Conversational reminders + `/fix-auto` |
| PR templates | No PRs to yourself | `/deploy-check` provides same validation |
| External CI/CD | Adds complexity/cost | Local `/deploy-check` replicates CI |
| 100% test coverage | Diminishing returns | Focus on critical paths (waterfall, engines) |
| Mandatory code review | Solo dev | Agents act as "second pair of eyes" |

### What We Optimized For

**Speed:**
- `/test-smart` instead of full suite (6x faster)
- Parallel tool execution
- Minimal hooks (no blocking)

**Safety:**
- Agent validation (waterfall, schema, bundle)
- Permission boundaries (deny db:push, git push)
- Strong warnings (not blocks)

**Learning:**
- Explicit commands (reinforces patterns)
- Conversational reminders (educational)
- Documentation as you go (/log-change)

**Sustainability:**
- Weekly reviews (not daily)
- Automated fixes (/fix-auto)
- Context preservation (resume conversations)

---

## 📚 Integration Summary

### Created Files

**Configuration:**
- `.claude/settings.json` - Permissions, hooks, statusLine

**Agents:**
- `.claude/agents/waterfall-specialist.md`
- `.claude/agents/test-repair.md`
- `.claude/agents/perf-guard.md`
- `.claude/agents/db-migration.md`

**Commands:**
- `.claude/commands/test-smart.md`
- `.claude/commands/fix-auto.md`
- `.claude/commands/deploy-check.md`
- `.claude/commands/workflows.md`

**Documentation:**
- `cheatsheets/daily-workflow.md`
- `cheatsheets/claude-code-best-practices.md` (this file)

### Workflow Changes

**Before:**
- Manual test selection → slow feedback
- Ad-hoc quality checks → inconsistent
- Waterfall edits → risk of errors
- Schema changes → potential data loss

**After:**
- `/test-smart` → 30s feedback loop
- `/fix-auto` + `/deploy-check` → consistent quality
- `waterfall-specialist` agent → validated calculations
- `db-migration` agent → safe schema evolution

### Measurement

**Efficiency Gains:**
- Testing: 6x faster with `/test-smart` (30s vs 5min)
- Quality: `/fix-auto` saves ~10min per commit
- Validation: `/deploy-check` prevents production issues
- Context: Resume conversations saves ~5min re-explaining

**Quality Improvements:**
- Domain validation: `waterfall-specialist` catches calculation errors
- Schema safety: `db-migration` prevents data loss
- Bundle monitoring: `perf-guard` detects regressions
- Test health: `test-repair` maintains passing suite

---

## 🔗 Related Documentation

- [Anthropic Claude Code Docs](https://docs.claude.com/en/docs/claude-code/)
- [Subagents Guide](https://docs.claude.com/en/docs/claude-code/sub-agents)
- [Slash Commands Guide](https://docs.claude.com/en/docs/claude-code/slash-commands)
- [Hooks Documentation](https://docs.claude.com/en/docs/claude-code/hooks)
- [Settings Reference](https://docs.claude.com/en/docs/claude-code/settings)

**Internal:**
- [CLAUDE.md](../CLAUDE.md) - Project conventions
- [cheatsheets/daily-workflow.md](daily-workflow.md) - Day-to-day usage
- [DECISIONS.md](../DECISIONS.md) - Architectural rationale

---

## 💡 Next Steps

1. **Try the tools**: Use `/workflows` to pick the right tool for your task
2. **Invoke agents**: Don't wait for failures, use proactively
3. **Build muscle memory**: Use tools daily for 2 weeks
4. **Iterate**: Adjust commands/agents based on what works
5. **Document learnings**: `/create-cheatsheet` for new patterns

**Questions?** Ask Claude: "What should I do when [scenario]?"
