---
status: ACTIVE
last_updated: 2026-01-19
---

# Memory Update Commands

## Quick Commands (Different for Each File!)

### `/log-change` → CHANGELOG.md
Drafts a CHANGELOG.md entry for the current work:
```md
## YYYY-MM-DD
- [Action] [What changed] in [File/Component]
- Fixed [issue] by [solution]
- Added [feature] to [location]
```

### `/log-decision` → DECISIONS.md
Drafts a DECISIONS.md entry:
```md
## YYYY-MM-DD: [Technology/Pattern Choice]
- **Decision**: [What was decided]
- **Why**: [Reasoning and benefits]
- **Why not [alternative]**: [Trade-offs considered]
- **Impact**: [How this affects the codebase]
```

### `/update-context` → CLAUDE.md (RARE!)
Reviews recent changes and suggests CLAUDE.md updates for:
- New dependencies added
- Architecture changes
- Convention updates
- Important gotchas discovered

### `/create-cheatsheet [topic]`
Creates a new cheatsheet for a specific topic:
- Analyzes recent work on [topic]
- Drafts step-by-step guide
- Includes code examples
- Lists common pitfalls

## Usage Examples

```
User: /log-change
Claude: Here's the CHANGELOG entry for today's work:

## 2024-01-22
- Added Monte Carlo simulation endpoint to `/api/simulations`
- Fixed TypeScript errors in FundConfig validation schema
- Implemented Redis caching for expensive calculations in `SimulationEngine`
- Updated chart components to use Nivo instead of Recharts for better performance
```

```
User: /log-decision
Claude: Based on our recent work, here's a decision to document:

## 2024-01-22: Switched from Recharts to Nivo for data visualization
- **Decision**: Use Nivo for all new chart components
- **Why**: Better performance with large datasets, more customization options, better TypeScript support
- **Why not Recharts**: Performance degradation with 1000+ data points, limited animation control
- **Impact**: Need to migrate existing charts gradually, update chart utility functions
```

## Automation Tips

1. **End of session**: Run `/log-change` to capture all work
2. **After major refactor**: Run `/log-decision` to document choices
3. **New feature complete**: Run `/update-context` if conventions changed
4. **Complex workflow done**: Run `/create-cheatsheet [workflow-name]`

## Custom Templates

### For bug fixes:
```
/log-change bug-fix
- Fixed [symptom] caused by [root cause] in [file:line]
- Solution: [what was changed]
- Testing: [how it was verified]
```

### For performance improvements:
```
/log-change performance
- Optimized [operation] from [before] to [after]
- Method: [optimization technique]
- Impact: [metrics or improvement]
```

### For new features:
```
/log-change feature
- Implemented [feature name] in [location]
- Components: [new files/functions created]
- Integration: [how it connects to existing code]
```