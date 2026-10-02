---
status: HISTORICAL
audience: both
last_updated: 2026-10-02
owner: '@nikhillinit'
---

# Code Review: Pi Harness

**Review Date**: 2026-10-02

**Version**: package unchanged; agent tooling only, no new application version
or release tag

**Reviewer**: Codex CLI (`gpt-5.6-sol`, xhigh, read-only sandbox), 10 rounds,
independent of the implementing agent

**Files Reviewed**:

- `.pi/APPEND_SYSTEM.md`
- `.pi/README.md`
- `.pi/extensions/updog-guard/index.ts`
- `.pi/extensions/updog-guard/rules.test.ts`
- `.pi/extensions/updog-guard/rules.ts`
- `.pi/prompts/specialist.md`
- `.pi/prompts/verify.md`
- `.pi/settings.json`
- `CHANGELOG.md`
- `docs/2-changelog/w11_pi-harness.md`
- `eslint.config.js`

**Plan**: none. This was an unplanned tooling change. The review target was the
label `pi-harness`, so plan conformance was skipped. Intent is recorded in
`.pi/README.md`.

---

## Executive Summary

The change adds a project-level harness for the Pi coding agent. It mirrors the
Claude Code control plane (`.claude/settings.json` deny list and hooks) and
`AGENT-SAFETY.md`. It reuses the repo's financial-path classifier and git guard,
and does not mutate the system prompt or tool set per turn. Review centered on
the guard's pre-execution command matching. Every finding was addressed with a
regression test. The stated scope holds: the guard is a seatbelt over raw
command text, and server-side branch protection on `main` remains the
authoritative boundary.

APPROVED

---

## Changes Overview

- **Guard extension** (`.pi/extensions/updog-guard/`): pure rule tables and
  classifiers in `rules.ts`, Pi event wiring in `index.ts`, and Node test-runner
  coverage in `rules.test.ts`. There are two tiers, hard and confirm. The
  confirm tier fails closed without a UI.
- **Prompt templates**: `/verify` runs the graduated gates; `/specialist`
  applies a read-only `.claude/agents` checklist.
- **Static system-prompt addendum** and README, covering design rules, the port
  map, and limits.
- **`eslint.config.js`**: ignore `.pi/**`, which otherwise breaks
  `npm run lint`.

---

## Findings

All findings below were raised by the reviewer, verified against the code before
any change, and fixed with regression tests unless noted.

### Critical Issues

None.

### Major Issues

- **Unknown, MCP, and PowerShell tools bypassed the guard** (round 1).
  **Disposition: addressed.** `classifyTool` routes PowerShell through the shell
  rules. Codemode and `tool_search` stay exempt because their nested calls reach
  `tool_call` themselves. Any other tool needs confirmation unless it declares
  `readOnlyHint`.
- **Force pushes to main/master were not always hard-blocked** (rounds 1-10).
  **Disposition: addressed.** Covered spellings:
  - `-f`, combined short flags, `--force`, `--force-with-lease[=...]`, and
    `--force-if-includes`.
  - `+refspec` (including `+:main`), `:main` and `--delete` deletion, and
    `--mirror` and forced `--all`.
  - Git global options (`-C`, `-c`, `--git-dir`, `--no-pager`).
  - Quoting, escaped whitespace (bash backslash, PowerShell backtick), attached
    separators, and redirections.

  A force push with no explicit destination (no refspec, or only `HEAD`) is
  hard-blocked whatever the directory, upstream, or `push.default`. The
  forwarded `git-guard-hook.mjs` no longer inherits `CLAUDE_HOOKS_DISABLE` or
  `CLAUDE_ACK_GIT_RISK`.

- **Financial reminder state was reset by retries and continuations** (round 1).
  **Disposition: addressed.** Pending financial edits are session-scoped. Only a
  successful truth run clears them, and new edits re-arm the reminder.
- **Destructive Git forms skipped confirmation** (rounds 1-5). **Disposition:
  addressed.** Covered forms:
  - `git clean --force`.
  - `git restore <path>`; a pure `--staged` unstage passes.
  - Every legacy `git checkout` except new-branch `-b`/`--orphan` without force,
    since it cannot be told apart from a path restore.
  - `git switch -f`, `--discard-changes`, `-C`, and `--force-create`.

### Minor Issues

- **`.env.*.example` templates were hard-blocked as secrets** (round 1).
  **Disposition: addressed.**
- **`/verify` omitted the harness test command** (round 1). **Disposition:
  addressed.**
- **Truth-run detection accepted any command mentioning the token** (rounds
  3-6). **Disposition: addressed.** Only a bare, single-line truth command
  counts. Separators, pipes, substitutions, newlines, and unsafe env-assignment
  values are rejected.
- **`gh api` writes through body fields and compact method forms skipped
  confirmation** (rounds 5-6). **Disposition: addressed.**
- **The changelog stated future evidence as complete**, and its test count went
  stale (rounds 1, 4). **Disposition: addressed.**

### Suggestions

- **Indirection is out of scope.** **Disposition: accepted, documented.**
  Variables, `eval`, aliases, and scripts cannot be closed by text matching.
  `.pi/README.md` (Limits) records this, and that server-side branch protection
  on `main` (`CI Gate Status`) is the authoritative boundary.

---

## Checklist

The repo has no `.claude/skills/TRIP-review/checklist.md`; the reviewer applied
the fallback priorities: correctness, safety, then practical concerns.

- [x] 1. Functional Requirements: passed.
- [x] 2. Code Quality: passed.
- [x] 3. Architectural Compliance: passed. No per-turn prompt or tool mutation;
      repo scripts reused.
- [x] 4. Error Handling: passed. Fails closed without a UI.
- [x] 5. Security: passed within the documented seatbelt scope.
- [x] 6. Performance: passed.

---

## Verdict

**APPROVED**

The final run of rule tests passes 8/8 (Node test runner). Strict `tsc` passes
against the installed Pi 1.0 extension types. Smoke tests through Pi's jiti
loader pass, including runs against real throwaway Git repositories.
`npm run check` and `npm run lint` pass. No open findings remain.
