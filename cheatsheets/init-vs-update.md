# Init vs Update Context - When to Use Which

## `/init CLAUDE.md` - For Fresh Starts
**Use when:**
- Starting a new conversation/session
- After clearing conversation history
- Beginning work on the project
- Need to load the current project context

**What it does:**
- Loads the entire CLAUDE.md file
- Gives Claude the full project context
- Sets up the working environment
- Points to other relevant files

## `/update-context` - For Architecture Changes
**Use when:**
- Made significant architecture changes
- Added new major dependencies
- Changed core patterns/conventions
- Weekly review of accumulated changes

**What it does:**
- Reviews recent changes
- Suggests updates to CLAUDE.md
- Keeps CLAUDE.md minimal and high-signal
- Only adds truly architectural changes

## Quick Decision Tree

```
Did you just clear the conversation?
├─ YES → Use `/init CLAUDE.md`
└─ NO → Are you making architecture changes?
    ├─ YES → Use `/update-context` (rare)
    └─ NO → Use `/log-change` or `/log-decision`
```

## Example Scenarios

1. **New morning, fresh session**
   ```
   User: /init CLAUDE.md
   Claude: [Loads project context, ready to work]
   ```

2. **Just added GraphQL to replace REST API**
   ```
   User: /update-context
   Claude: Suggest adding "GraphQL" to tech stack in CLAUDE.md
   ```

3. **Fixed a bug, want to document**
   ```
   User: /log-change
   Claude: [Updates CHANGELOG.md, not CLAUDE.md]
   ```

## Remember
- `/init` = Load context (frequent)
- `/update-context` = Modify CLAUDE.md (rare)
- Most work only needs `/log-change`