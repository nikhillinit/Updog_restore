# Command Summary - Quick Reference

## Memory Commands by Target File

| Command | Updates | Use When | Frequency |
|---------|---------|----------|-----------|
| `/log-change` | CHANGELOG.md | Every commit | Very frequent |
| `/log-decision` | DECISIONS.md | Architectural choices | Occasional |
| `/update-context` | CLAUDE.md | Core architecture changes | Rare |
| `/create-cheatsheet [topic]` | New cheatsheet file | New workflow/pattern | As needed |

## Examples

```bash
# After fixing a bug:
/log-change
# → Adds to CHANGELOG.md

# After choosing Redis over in-memory cache:
/log-decision  
# → Adds to DECISIONS.md

# After switching from REST to GraphQL (major!):
/update-context
# → Suggests minimal update to CLAUDE.md

# After creating complex deployment workflow:
/create-cheatsheet deployment
# → Creates cheatsheets/deployment.md
```

## Remember
- **Different commands for different files**
- **CLAUDE.md updates are RARE** - only for architecture changes
- **Most commits only need `/log-change`**