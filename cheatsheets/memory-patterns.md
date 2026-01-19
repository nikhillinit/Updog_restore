---
status: ACTIVE
last_updated: 2026-01-19
---

# Memory Patterns for Claude

## Mini Milestone Documentation

### 1. Immediate CHANGELOG Updates
After completing any task, immediately append to CHANGELOG.md:
```md
## 2024-01-22
- Added TypeScript types for FundConfig model
- Fixed chart rendering performance issue in DashboardCard
- Implemented Redis caching for Monte Carlo results
```

### 2. Decision Recording
When making architectural choices, append to DECISIONS.md:
```md
## 2024-01-22: Chose TanStack Query over Redux
- **Decision**: Use TanStack Query for server state management
- **Why**: Built-in caching, automatic refetching, better DX
- **Why not Redux**: Overkill for server state, more boilerplate
```

### 3. Context Updates in CLAUDE.md
Update CLAUDE.md when:
- Adding new major dependencies
- Changing architectural patterns
- Establishing new conventions
- Discovering critical gotchas

### 4. Cheatsheet Additions
Create focused cheatsheets for:
- Complex workflows (e.g., `deployment.md`)
- Domain-specific logic (e.g., `monte-carlo.md`)
- Integration guides (e.g., `redis-setup.md`)

## Best Practices
1. **Write as you go** - Don't batch documentation
2. **Be specific** - Include file names, function names, line numbers
3. **Date everything** - Use ISO format (YYYY-MM-DD)
4. **Link related items** - Reference PRs, issues, decisions

## Example Workflow
```bash
# 1. Complete a task
# 2. Immediately update CHANGELOG.md
# 3. If architectural decision made, update DECISIONS.md
# 4. If new pattern established, update CLAUDE.md
# 5. If complex workflow, create/update cheatsheet
```