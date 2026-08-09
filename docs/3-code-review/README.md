# Code Review Records

This folder holds committed code review records produced by the TRIP workflow.

## Naming

`CR_w<a>_v<x.y.z>.md` — `a` = project week (Week 1 = week of 2026-08-03), `x.y.z` = release version.

## Sources

- Human-driven reviews via the `TRIP-review` skill, rendered from `.claude/skills/TRIP-review/cr-template.md`.
- Codex-driven review loops (`codex-code-review` skill), promoted here by `TRIP-3-release` Step 3 after the loop converges (`APPROVED`).

## Criteria

Review criteria live in `.claude/skills/TRIP-review/checklist.md` — the single source of truth referenced by both review surfaces. Do not copy criteria into review records; reference them.
