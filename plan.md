# Automatic Discovery System Design

## Problem Statement

**Current State:** CLAUDE.md says "check CAPABILITIES.md first" but this is advisory guidance that agents can skip.

**Ideal State:** When prompted, the agent automatically discovers and selects the best existing tools/assets to execute the task.

**PR #253 Gap:** Adds defensive verification (prevents false "doesn't exist" claims) but doesn't implement proactive discovery.

---

## Existing Infrastructure Analysis

### What Already Exists

| Component | Location | Purpose |
|-----------|----------|---------|
| `routeQueryFast.ts` | `scripts/` | Pattern-based query routing with scoring |
| `router-fast.json` | `docs/_generated/` | Pre-generated pattern index (17+ routes) |
| `CAPABILITIES.md` | root | 250+ agent/skill/tool inventory |
| `DISCOVERY-MAP.md` | `.claude/` | Agent-facing routing decision tree |
| `settings.json` | `.claude/` | Hooks configuration (PostToolUse active) |

### What's Missing

1. **UserPromptSubmit hook** - To intercept prompts and run discovery BEFORE processing
2. **Discovery output format** - Structured recommendations for agent consumption
3. **Enforcement mechanism** - Ensuring agent acknowledges discovery results

---

## Proposed Architecture

### Design: UserPromptSubmit Discovery Hook

```
USER PROMPT
    |
    v
[UserPromptSubmit Hook]
    |
    +---> Run routeQueryFast(prompt)
    |
    +---> Check CAPABILITIES.md for matches
    |
    +---> Output discovery context
    |
    v
[Agent receives prompt + discovery context]
    |
    v
Agent processes with awareness of available tools
```

### Implementation Components

#### 1. Discovery Hook Script (`scripts/hooks/discovery-hook.sh`)

```bash
#!/bin/bash
# UserPromptSubmit hook for automatic discovery

# Read prompt from stdin (JSON)
INPUT=$(cat)
PROMPT=$(echo "$INPUT" | jq -r '.prompt // ""')

# Skip if prompt is too short or is a command
if [ ${#PROMPT} -lt 10 ] || [[ "$PROMPT" == /* ]]; then
  exit 0  # Pass through without discovery
fi

# Run the router
ROUTE_RESULT=$(npx tsx scripts/routeQueryFast.ts "$PROMPT" 2>/dev/null)

if [ $? -eq 0 ] && echo "$ROUTE_RESULT" | grep -q "MATCH:"; then
  echo "---"
  echo "DISCOVERY RESULT (auto-generated):"
  echo "$ROUTE_RESULT"
  echo ""
  echo "Use the recommended asset above before implementing from scratch."
  echo "---"
fi

exit 0
```

#### 2. Settings.json Update

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash scripts/hooks/discovery-hook.sh",
            "timeout": 5
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": { "tools": ["Edit"] },
        "hooks": [
          { "type": "command", "command": "npm run lint:fix" }
        ]
      }
    ]
  }
}
```

#### 3. Enhanced Router Output

Current `routeQueryFast.ts` CLI output:
```
Query: help with waterfall clawback
---
MATCH: phoenix_waterfall
Route: .claude/agents/waterfall-specialist.md
Score: 2.0
Why: Phoenix routing (priority 12)
Agent: waterfall-specialist
```

Proposed structured output for hook consumption:
```
DISCOVERY RESULT (auto-generated):
  Best match: waterfall-specialist agent
  Confidence: HIGH (score 2.0)
  Action: Use Task tool with subagent_type='waterfall-specialist'
  Alternatives:
    - phoenix-capital-allocation-analyst (score 1.5)
    - xirr-fees-validator (score 1.0)
```

---

## Implementation Phases

### Phase 1: Basic Discovery Hook (MVP)
- [ ] Create `scripts/hooks/discovery-hook.sh`
- [ ] Update `.claude/settings.json` with UserPromptSubmit hook
- [ ] Test with sample prompts
- [ ] Measure latency impact (<500ms target)

### Phase 2: Enhanced Router
- [ ] Add `--format=hook` output mode to routeQueryFast.ts
- [ ] Include agent invocation syntax in output
- [ ] Add confidence levels (HIGH/MEDIUM/LOW based on score)

### Phase 3: Enforcement & Feedback
- [ ] Add SessionStart hook for one-time capability reminder
- [ ] Track discovery hit rate in metrics
- [ ] Add `--no-discovery` flag for power users

---

## Comparison: PR #253 vs This Design

| Aspect | PR #253 | This Design |
|--------|---------|-------------|
| Timing | Reactive (before claiming non-existence) | Proactive (before any work) |
| Trigger | Trigger phrases like "doesn't exist" | Every user prompt |
| Action | Manual verification checklist | Automatic router execution |
| Output | Documentation guidance | Structured recommendations |
| Enforcement | None (advisory) | Hook injection (mandatory) |

### Verdict

PR #253 is a **subset** of this design. It addresses one failure mode (false non-existence claims) but doesn't solve the core problem (proactive tool selection).

**Recommendation:**
1. Decline PR #253 as-is
2. Implement the discovery hook system
3. PR #253's verification logic becomes unnecessary once discovery is automatic

---

## Technical Considerations

### Performance
- Router query: ~50ms (cached JSON)
- Hook overhead: ~100ms per prompt
- Target: <200ms total latency

### Edge Cases
1. **Slash commands** - Skip discovery (already routing)
2. **Very short prompts** - Skip (insufficient signal)
3. **No match found** - Silent pass-through (don't block)
4. **Timeout** - Fail open (proceed without discovery)

### Metrics to Track
- Discovery match rate (% of prompts with matches)
- Tool usage correlation (did agent use recommended tool?)
- False positive rate (matched but wrong recommendation)

---

## File Structure

```
scripts/
├── hooks/
│   ├── discovery-hook.sh      # UserPromptSubmit hook
│   └── session-init-hook.sh   # SessionStart hook (optional)
├── routeQueryFast.ts          # Existing router (enhance)
└── generateRouterArtifacts.ts # Existing generator

.claude/
├── settings.json              # Add UserPromptSubmit hook
├── DISCOVERY-MAP.md           # Keep as agent reference
└── agents/                    # No changes needed
```

---

## Next Steps

1. **Validate approach** - Does this design match your vision?
2. **Prototype hook** - Create minimal discovery-hook.sh
3. **Test integration** - Verify latency and output format
4. **Iterate** - Refine based on real usage

---

## Decision Required

Should I:
A) **Proceed with implementation** - Create the discovery hook system
B) **Refine design** - Address specific concerns before building
C) **Hybrid approach** - Accept PR #253 as interim, build discovery system in parallel

Please advise which direction to take.
