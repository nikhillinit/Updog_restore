# Skill: claude-infra-integrity (v4 optimal)

## Purpose

Ensure .claude/ changes are internally consistent and CI-safe.

This skill is used by agents who modify:
- .claude/agents/*.md
- .claude/skills/*/SKILL.md
- .claude/commands/*.md
- CAPABILITIES.md
- docs/INDEX.md
- .claude/settings.json

## Checklist Before Completion

### Naming Consistency
- Agent filename must match `name:` in frontmatter (convention for consistency)
- Skill folder name must match the referenced skill name
- Command filename determines the slash command name

### Reference Integrity
- Every agent `skills:` entry must exist in .claude/skills/
- CAPABILITIES.md must mention every agent and command (no orphaned capabilities)

### Settings Permissions Integrity
Support either settings schema:
- `allowedTools: ["Read", "Write"]`
- `permissions: { allow: ["Read", "Write"] }`

### Documentation Integrity
- Relative links in docs/*.md must resolve (no broken links)
- Prefer ASCII output for docs and CI logs

### Directory Structure
- Use flat structure for agents (all in .claude/agents/)
- Avoid nested subdirectories (not guaranteed to load)

## Required Validation Command

```bash
npm run validate:claude-infra
```

Or directly:

```bash
npx tsx scripts/validate-claude-infra.ts
```

## Environment Variables

| Variable | Default | Effect |
|----------|---------|--------|
| USE_EMOJI | true | Set to false in CI for ASCII output |

## Failure Patterns and Fixes

### Agent name mismatch
**Symptom:** filename `foo-bar.md` but frontmatter `name: foo_bar`
**Fix:** Unify on one canonical name; prefer kebab-case.

### Missing skill folder
**Symptom:** agent references `skills: statistical-testing` but `.claude/skills/statistical-testing/` missing
**Fix:** Create skill folder and add SKILL.md, or remove reference.

### Tool not allowed by settings
**Symptom:** agent uses `Bash` but settings disallow it
**Fix:** Either adjust settings governance or remove tool usage from the agent.

### Broken docs link
**Symptom:** docs/INDEX.md links to missing file
**Fix:** Update the link or add the missing document.

### Nested agent directory warning
**Symptom:** Found nested directory `.claude/agents/subagents/`
**Fix:** Move agents to flat structure in .claude/agents/

## Standard Failure Block

When validation fails, the script emits:

```
===============================================================================
VALIDATION FAILED: Claude Infrastructure
===============================================================================
SUMMARY: N configuration error(s) found in .claude/ directory
PROBABLE_CAUSE: Agent/skill references, naming conventions, or settings are inconsistent
NEXT_STEP: Review errors above and fix configuration files
===============================================================================
```

## Dependencies

The validator requires Node.js/tsx for TypeScript execution:

```bash
npm i -D tsx
```

This handles:
- YAML frontmatter parsing
- File system traversal
- Reference validation
- Link checking
