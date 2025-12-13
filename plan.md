# Automatic Discovery System - Implementation Complete

## Summary

Implemented a **UserPromptSubmit discovery hook** that automatically recommends existing tools/assets before processing user prompts. This replaces the reactive approach in PR #253 with a proactive discovery system.

## PR #253 Decision

**Status: DECLINED**

Reason: PR #253 adds defensive verification (manual checklist for "doesn't exist" claims) but doesn't solve the core problem. The implemented discovery hook makes PR #253's approach unnecessary by proactively surfacing available tools.

---

## Implementation Details

### Files Created/Modified

| File | Change |
|------|--------|
| `scripts/hooks/discovery-hook.sh` | NEW - UserPromptSubmit hook for automatic discovery |
| `scripts/routeQueryFast.ts` | ENHANCED - Added `--format=hook` and `--format=json` output modes |
| `.claude/settings.json` | UPDATED - Added UserPromptSubmit hook configuration |

### How It Works

```
USER PROMPT
    |
    v
[UserPromptSubmit Hook]
    |
    +---> Phase 1: Router-based matching (router-fast.json)
    |              Highest priority, uses pre-defined patterns
    |
    +---> Phase 2: Keyword-based discovery
    |              Searches agents, commands, MCP servers by filename/content
    |
    +---> Score and rank matches
    |
    +---> Output top 5 recommendations
    |
    v
[Agent receives prompt + discovery context]
```

### Discovery Sources

| Source | Location | Priority |
|--------|----------|----------|
| Router patterns | `docs/_generated/router-fast.json` | Highest (score 50+) |
| Agent filenames | `.claude/agents/*.md` | High (score 30) |
| Agent content | `.claude/agents/*.md` | Medium (score 10) |
| Commands | `.claude/commands/*.md` | High (score 25) |
| MCP servers | `.mcp.json` | High (score 35) |

### Example Output

**Query**: "help me with waterfall clawback calculations"

```
==============================================
DISCOVERY (auto-generated)
==============================================
Confidence: HIGH

Recommended for this task:

  [DOC] .claude/agents/waterfall-specialist.md
  [AGENT] Task tool: subagent_type='waterfall-specialist'
  [AGENT] Task tool: subagent_type='phoenix-probabilistic-engineer'
  [AGENT] Task tool: subagent_type='phoenix-docs-scribe'
  [AGENT] Task tool: subagent_type='phoenix-capital-allocation-analyst'

Use these before implementing from scratch.
==============================================
```

### Skip Conditions

The hook silently passes through for:
- Prompts < 15 characters
- Slash commands (already routed)
- Simple responses: yes, no, ok, thanks, etc.

---

## Configuration

### settings.json Hook Definition

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash scripts/hooks/discovery-hook.sh",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

### Router CLI Enhancements

```bash
# Default output (human-readable)
npx tsx scripts/routeQueryFast.ts "help with waterfall"

# Hook-formatted output
npx tsx scripts/routeQueryFast.ts --format=hook "help with waterfall"

# JSON output
npx tsx scripts/routeQueryFast.ts --format=json "help with waterfall"
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
| Coverage | Agents, skills only | Agents, commands, MCP, router patterns |

---

## Testing Results

| Query | Top Recommendation | Confidence |
|-------|-------------------|------------|
| "waterfall clawback calculations" | waterfall-specialist | HIGH |
| "run tests and fix failures" | silent-failure-hunter | MEDIUM |
| "database queries optimization" | database-expert | HIGH |
| "yes" | (skip - no output) | N/A |

---

## Future Enhancements

1. **Plugin marketplace discovery** - Add scanning of `.claude/plugins/marketplaces/`
2. **Skills discovery** - Add `.claude/skills/*.md` scanning
3. **Metrics tracking** - Log discovery hit rates
4. **User preference learning** - Boost frequently-used tools

---

## Status

**IMPLEMENTATION COMPLETE**

- [x] Discovery hook created and tested
- [x] Router enhanced with hook output format
- [x] settings.json configured with UserPromptSubmit hook
- [x] MCP servers included in discovery
- [ ] PR #253 declined (comment pending - gh CLI not available)
