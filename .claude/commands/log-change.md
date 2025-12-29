---
description: "Guided changelog entry for CHANGELOG.md"
argument-hint: "[type=feat|fix|chore|refactor|docs|test] [description]"
allowed-tools: Read, Write, Edit
---

# Log Change - CHANGELOG.md Entry

Add a structured entry to CHANGELOG.md following Keep a Changelog format.

## Context Gathering

Before adding the entry, gather context:

```bash
git diff --name-only HEAD~1  # Recent changes
git log -1 --oneline         # Last commit message
```

## Entry Types

| Type | Description | Example |
|------|-------------|---------|
| feat | New feature or capability | `feat: add user authentication` |
| fix | Bug fix | `fix: resolve null pointer in waterfall calc` |
| chore | Maintenance, dependencies | `chore: update React to 18.3` |
| refactor | Code restructuring | `refactor: extract validation logic` |
| docs | Documentation changes | `docs: update API reference` |
| test | Test additions/changes | `test: add unit tests for XIRR` |

## Entry Format

Add entries under `## [Unreleased]` in the appropriate section:

```markdown
### Added
- **Feature Name** (YYYY-MM-DD)
  - Bullet point describing the change
  - Additional context if needed

### Changed
- Description of modification

### Fixed
- Description of bug fix

### Removed
- Description of removed functionality
```

## Workflow

1. **Read** current CHANGELOG.md to understand structure
2. **Determine** the correct section (Added/Changed/Fixed/Removed)
3. **Write** the entry with today's date
4. **Verify** entry follows existing format patterns

## Example Entry

```markdown
### Added

- **Phoenix Phase 2: Monte Carlo Validation** (2025-12-29)
  - Implemented statistical distribution validation for MOIC forecasts
  - Added 50 new truth cases for probabilistic scenarios
  - Created `/phoenix-phase2` command for workflow orchestration
```

## Quality Checklist

Before completing:
- [ ] Entry has date stamp (YYYY-MM-DD)
- [ ] Entry is under correct section (Added/Changed/Fixed/Removed)
- [ ] Description explains WHAT changed and WHY
- [ ] No emojis used (per CLAUDE.md policy)
- [ ] Entry follows existing changelog format

## Integration

This command supports the memory workflow in CLAUDE.md:
- Use after completing features or fixes
- Pairs with `/log-decision` for architectural changes
- Referenced in daily development workflow
