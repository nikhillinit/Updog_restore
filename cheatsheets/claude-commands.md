---
status: ACTIVE
last_updated: 2026-01-19
---

# Claude Commands Cheatsheet

## Context Initialization
- `/init CLAUDE.md` - Load the main project context file
- `/init cheatsheets/testing.md` - Load testing-specific guidelines
- `/init cheatsheets/api.md` - Load API development guidelines

## Memory Management Commands
- `/log-change` - Draft CHANGELOG.md entry for current work
- `/log-decision` - Draft DECISIONS.md entry for architectural choices
- `/update-context` - Suggest updates to CLAUDE.md based on recent changes
- `/create-cheatsheet [topic]` - Create new cheatsheet for specific workflow

## Common Workflows
- Review code: "Review [file/feature] for [specific concern]"
- Fix TypeScript errors: "Run typecheck and fix any errors"
- Add feature: "Implement [feature] following our conventions"
- Debug issue: "Debug why [specific behavior] is happening"

## Best Practices
1. Always start with `/init CLAUDE.md` for new sessions
2. Load specific cheatsheets when working in those areas
3. Reference CHANGELOG.md before making changes
4. Document decisions in DECISIONS.md
5. Follow conventions outlined in CLAUDE.md