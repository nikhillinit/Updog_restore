# Automatic Discovery System - Implementation Complete

## Summary

Implemented a **proactive discovery system** with UserPromptSubmit and SessionStart hooks that automatically recommends existing tools/assets. Replaces the reactive approach in PR #253.

## PR #253 Decision

**Status: DECLINED** (user closed and deleted branch)

Reason: PR #253 added defensive verification (manual checklist) but didn't solve the core problem. The implemented discovery hook makes PR #253's approach unnecessary by proactively surfacing available tools.

---

## Implementation Details

### Files Created/Modified

| File | Change |
|------|--------|
| `scripts/hooks/discovery-hook.sh` | NEW - UserPromptSubmit hook for automatic discovery |
| `scripts/hooks/session-start-hook.sh` | NEW - SessionStart hook for capabilities summary |
| `scripts/routeQueryFast.ts` | ENHANCED - Added `--format=hook` and `--format=json` output modes |
| `.claude/settings.json` | UPDATED - Added SessionStart and UserPromptSubmit hooks |

### How It Works

```
SESSION START
    |
    v
[SessionStart Hook] --> Capabilities summary (agents, skills, commands, cheatsheets)
    |
    v
USER PROMPT
    |
    v
[UserPromptSubmit Hook]
    |
    +---> Phase 0: Task Bundle matching (curated skill+agent groups)
    |              14 bundles for common workflows (score 60)
    |
    +---> Phase 1: Router-based matching (router-fast.json via jq)
    |              Pattern matching with priority (score 50+)
    |
    +---> Phase 2: Keyword-based discovery
    |              Agents, commands, skills, cheatsheets, MCP servers
    |
    +---> Score and rank matches
    |
    +---> Output top 7 recommendations
    |
    v
[Agent receives prompt + discovery context]
```

### Discovery Sources

| Source | Location | Priority (Score) |
|--------|----------|------------------|
| Task Bundles | Built-in | Highest (60) |
| Router patterns | `docs/_generated/router-fast.json` | High (50+) |
| MCP servers | `.mcp.json` | High (35) |
| Agent filenames | `.claude/agents/*.md` | High (30) |
| Commands | `.claude/commands/*.md` | Medium (25) |
| Cheatsheets | `cheatsheets/*.md` | Medium (22) |
| Skills | `.claude/skills/*.md` | Medium (20) |
| Agent content | `.claude/agents/*.md` | Lower (10) |

### Task Bundles (14 Curated Workflows)

| Trigger | Bundled Assets |
|---------|----------------|
| critical, critique, evaluate | inversion-thinking, pattern-recognition, code-reviewer, silent-failure-hunter |
| plan, design, architect | brainstorming, writing-plans, task-decomposition, architecture-patterns, docs-architect |
| debug, investigate, root cause | systematic-debugging, root-cause-tracing, inversion-thinking, debug-expert |
| review, code review, pr review | requesting-code-review, receiving-code-review, code-reviewer, type-design-analyzer |
| implement, feature, build | writing-plans, executing-plans, continuous-improvement, test-automator |
| test strategy, coverage | testing-anti-patterns, condition-based-waiting, test-automator, pr-test-analyzer |
| refactor, simplify, clean | code-simplifier, iterative-improvement, continuous-improvement, code-reviewer |
| performance, optimize, slow | perf-guard, pattern-recognition, code-simplifier |
| complex, difficult, tricky | inversion-thinking, analogical-thinking, extended-thinking-framework |
| security, vulnerability | pattern-recognition, inversion-thinking, silent-failure-hunter |
| branch, worktree, merge | finishing-a-development-branch, using-git-worktrees, verification-before-completion |
| parallel, concurrent | dispatching-parallel-agents, subagent-driven-development, task-decomposition |
| waterfall, carry, xirr | waterfall-specialist, xirr-fees-validator, phoenix-capital-allocation-analyst |
| document, docs, readme | docs-architect, phoenix-docs-scribe, memory-management |

### Example Output

**Query**: "critically evaluate this code for potential issues"

```
==============================================
DISCOVERY (auto-generated)
==============================================
Confidence: HIGH

Recommended for this task:

  [SKILL] inversion-thinking
  [SKILL] pattern-recognition
  [AGENT] Task tool: subagent_type='code-reviewer'
  [AGENT] Task tool: subagent_type='silent-failure-hunter'
  [AGENT] Task tool: subagent_type='code-simplifier'

Use these before implementing from scratch.
==============================================
```

### Session Start Output

```
==============================================
PROJECT CAPABILITIES (auto-summary)
==============================================

  Agents:      31 specialized agents (Task tool)
  Skills:      31 thinking frameworks (auto-activate)
  Commands:    11 slash commands (/command-name)
  Cheatsheets: 31 reference guides

  Quick Access:
    - CAPABILITIES.md - Full inventory
    - /workflows - Interactive command guide
    - Discovery auto-suggests tools for each prompt

==============================================
```

### Skip Conditions

The discovery hook silently passes through for:
- Prompts < 15 characters
- Slash commands (already routed)
- Simple responses: yes, no, ok, thanks, etc.

---

## Performance

| Metric | Before | After |
|--------|--------|-------|
| Router matching | ~1.5s (npx tsx) | ~100ms (jq) |
| Total hook time | ~2s | <1s |

---

## Configuration

### settings.json Hook Definitions

```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "bash scripts/hooks/session-start-hook.sh",
        "timeout": 5
      }]
    }],
    "UserPromptSubmit": [{
      "hooks": [{
        "type": "command",
        "command": "bash scripts/hooks/discovery-hook.sh",
        "timeout": 10
      }]
    }]
  }
}
```

---

## Comparison: Before vs After

| Aspect | Before (PR #253) | After (This Implementation) |
|--------|-----------------|---------------------------|
| Timing | Reactive (before claiming non-existence) | Proactive (before any work) |
| Trigger | Manual (trigger phrases) | Automatic (every prompt) |
| Action | Manual verification checklist | Automatic discovery + recommendations |
| Output | Documentation guidance | Structured tool recommendations |
| Enforcement | Advisory (can skip) | Hook injection (automatic) |
| Coverage | Agents, skills only | Agents, commands, skills, cheatsheets, MCP, router patterns |
| Task Bundles | None | 14 curated bundles for common workflows |
| Session Summary | None | One-time capabilities reminder |
| Performance | N/A | <1s (pure bash/jq) |

---

## Status

**IMPLEMENTATION COMPLETE**

- [x] Discovery hook created and tested
- [x] Router enhanced with hook output format
- [x] settings.json configured with UserPromptSubmit hook
- [x] MCP servers included in discovery
- [x] PR #253 declined (user closed and deleted branch)
- [x] Task bundles for common workflows (14 bundles)
- [x] Skills discovery added
- [x] Cheatsheet discovery added (30 cheatsheets)
- [x] Performance optimization (jq vs npx tsx)
- [x] SessionStart hook for capabilities reminder
