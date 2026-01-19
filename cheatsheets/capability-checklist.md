---
status: ACTIVE
last_updated: 2026-01-19
---

# Pre-Task Capability Checklist

## ⚡ Quick Check (5 seconds)

Before starting ANY task, run through this checklist:

```
□ Did I check CAPABILITIES.md for existing solutions?
□ Is there already an agent that does this?
□ Can I use multiple existing tools instead of building new?
□ Should I get a second opinion from Gemini/OpenAI?
□ Have I checked for similar past work in CHANGELOG?
```

## 🎯 Common Task → Tool Mapping

| If the task involves...      | Use this FIRST               |
| ---------------------------- | ---------------------------- |
| Waterfall/carry calculations | `waterfall-specialist` agent |
| Writing tests                | `test-automator` agent       |
| Code review                  | `code-reviewer` agent        |
| Understanding existing code  | `code-explorer` agent        |
| Multiple agents              | `context-orchestrator` agent |
| Architecture decisions       | `architect-review` agent     |
| Documentation                | `docs-architect` agent       |
| Database work                | `database-expert` agent      |
| Performance issues           | `perf-guard` command         |
| Debugging                    | `debug-expert` agent         |
| Second opinion               | MCP Gemini/OpenAI tools      |
| Remembering decisions        | `/log-decision` command      |
| Tracking changes             | `/log-change` command        |

## 🚫 Anti-patterns to Avoid

### ❌ DON'T

- Implement waterfall calculations from scratch
- Write custom test generators
- Build evaluation frameworks from scratch
- Create new memory systems
- Use Bash for file operations
- Forget to check existing npm scripts
- Skip the capability inventory check

### ✅ DO

- Use Task tool for agents
- Run parallel agents when possible
- Update CHANGELOG/DECISIONS
- Check CAPABILITIES.md first
- Use specialized tools over Bash
- Leverage MCP for reviews
- Document new capabilities when added

## 💡 Mental Model

```
         START
            ↓
    [Load CAPABILITIES.md]
            ↓
    "What tools exist?"
            ↓
    "What worked before?"
            ↓
    "Who else can help?"
            ↓
     Then implement
```

## 📝 Examples

### Bad Approach:

```
User: "Add waterfall calculation"
Assistant: *Starts implementing from scratch*
```

### Good Approach:

```
User: "Add waterfall calculation"
Assistant: *Checks CAPABILITIES.md*
         *Finds waterfall-specialist agent*
         *Uses Task tool to launch it*
```

### Bad Approach:

```
User: "Review this code"
Assistant: *Manually reviews code*
```

### Good Approach:

```
User: "Review this code"
Assistant: *Launches code-reviewer agent*
         *Gets second opinion from mcp__multi-ai-collab__gemini_code_review*
         *Synthesizes feedback*
```

## 🔄 Update Protocol

When you discover or create a new capability:

1. Add it to CAPABILITIES.md immediately
2. Update this checklist if it's commonly used
3. Log the addition with `/log-change`
4. Document the decision with `/log-decision` if architectural

---

**Remember**: The goal is to leverage existing tools optimally, not recreate
them!
