---
status: ACTIVE
last_updated: 2026-08-18
---

# AGENTS.md

**Governing policy:**
`docs/governance/solo-internal-change-and-production-policy.md` — resolve it
from `origin/main` (the protected target branch), never from a working branch;
read it before any merge, production, archive, or governance action. Document
roles and precedence are defined there.

This file is an entry loader for Codex: it routes by action and keeps only the
rules that must reach every session before routing. Operational detail lives in
the routed documents below.

## Project Overview

Internal VC fund modeling and reporting platform for Press On Ventures:
TypeScript/Node Express API with BullMQ + Redis workers and PostgreSQL, plus a
React / Tailwind (shadcn/ui) frontend for portfolio construction, pacing,
reserve allocation, and exit scenarios. Architecture, tech stack, conventions,
and setup live in `README.md`.

## Mandatory Workflow

1. This file.
2. Governing policy — whenever the action touches merge, production, archive, or
   governance.
3. Repo search — existing code, commands, skills, and docs.
4. `docs/INDEX.md` — human-facing documentation routing.
5. `.claude/DISCOVERY-MAP.md` — agent-facing discovery routing.
6. `CHANGELOG.md` / `DECISIONS.md` — prior work and rationale.

## Discovery Routing (Quick Reference)

For detailed routing logic, see `.claude/DISCOVERY-MAP.md`. Key patterns:

| Task Type                                        | Route To                                                                   |
| ------------------------------------------------ | -------------------------------------------------------------------------- |
| New feature/capability                           | AGENTS.md -> repo search -> docs/INDEX.md                                  |
| Governance, merge authority, precedence          | docs/governance/solo-internal-change-and-production-policy.md              |
| Production action (deploy, schema, provider)     | docs/workflows/PRODUCTION_SCRIPTS.md                                       |
| Documentation governance, archive, Phoenix locks | governing policy, "Documentation governance" section                       |
| Architecture, stack, conventions, setup          | README.md                                                                  |
| Commands and troubleshooting                     | cheatsheets/daily-workflow.md + cheatsheets/INDEX.md                       |
| Operating loop, checkpoints, handoff             | docs/claude/operating-loop.md                                              |
| Full-vs-lite mode, bias audit                    | .claude/skills/control-plane/SKILL.md + .claude/skills/bias-audit/SKILL.md |
| Git safety                                       | scripts/control-plane/git-safety.mjs                                       |
| AI orchestration (Hermes, Codex, babysitter)     | DEV_BRAIN.md + .a5c/                                                       |
| Memory, commands, skills                         | cheatsheets/INDEX.md + .claude/skills/INDEX.md                             |
| Phoenix validation                               | `/phoenix-truth` command                                                   |
| Phoenix Phase 2 (probabilistic)                  | `/phoenix-phase2` command                                                  |
| Waterfall/clawback issues                        | `waterfall-specialist` agent                                               |
| Precision/numeric drift                          | `phoenix-precision-guardian` agent                                         |
| XIRR/fees issues                                 | `xirr-fees-validator` agent                                                |
| Architecture decisions                           | DECISIONS.md                                                               |
| Milestone governance / PR scope                  | docs/STABILIZATION-ROADMAP.md                                              |

**Machine-readable index**: `docs/_generated/router-index.json` **Staleness
report**: `docs/_generated/staleness-report.md` **Regenerate**:
`npm run docs:routing:generate`

## Non-Negotiable Rules (always loaded)

The governing policy's retained controls defer to the mandates below — do not
strip them from this file.

- All mutations MUST have idempotency
- All updates MUST use optimistic locking
- All cursors MUST be validated
- All queue jobs MUST have timeouts
- No emoji in code, docs, or logs — see
  [cheatsheets/emoji-free-documentation.md](cheatsheets/emoji-free-documentation.md)
- Phoenix truth cases must pass before merging calculation changes
  (`npm run phoenix:truth`; do not trust hardcoded counts in docs)
- Pre-push baseline check compiles client/server/shared separately
- TZ=UTC required for all test runs
- Conventional commits (feat:, fix:, refactor:, chore:, docs:, test:)

## Mandatory Pre-Action Checks

- BEFORE changing shared test mocks or fixtures, grep for ALL assertion patterns
  that depend on current behavior across the full test suite.
- WHEN diagnosing failing integration tests in CI, check if failures cluster at
  the END of execution order — that's a resource-ceiling cascade (Vitest
  `setupFiles` spawns a fresh server per file), not per-file bugs. Pre-push hook
  reports the warm/true state; cold CI runs can flake the tail.
- BEFORE pushing when test infrastructure changed, run `npm test` (full suite),
  not just targeted tests.
- BEFORE writing data to JSONB, check schema for dedicated columns. Do NOT nest
  structured data into a blob when proper columns exist.
- BEFORE implementing client route changes, trace actual app routing to verify
  which component renders. Spec may name the wrong component.
- AFTER subagent batches, diff for files outside owned scope before committing.
- WHEN errors occur, follow graduated response: lint fails ->
  `npm run lint:fix`. Type errors -> `npm run check` with targeted fix. Test
  fails -> run targeted test first, full suite only if targeted passes but
  suspicion remains.
- BEFORE advancing a multi-step task, create a durable, attributable checkpoint
  — prefer an atomic green commit; when committing is prohibited or the batch is
  incomplete, preserve the exact diff and record why it couldn't be committed.
- BEFORE declaring a file, plan, or branch missing, search all worktrees
  (`git worktree list`) and origin refs, not just the current working tree — and
  name which tree was authoritative once found.

## Codex Environment Notes

- Canonical Windows verification path:
  `& .\scripts\windows-node-env.ps1 npm.cmd run doctor` (constrained-shell /
  doctor-path issue class; treat raw `npm.cmd run doctor` as informational).
- Codex CLI: `codex exec "question" --sandbox read-only` (GPT-5.3, xhigh
  reasoning).

## Escape Valve and Kill Switch

- `/explore` - non-executing discovery mode
- `CLAUDE_HOOKS_DISABLE=1` - disable all control plane hooks (logged to
  `.claude/artifacts/metrics.jsonl`)

## Design System

Read `DESIGN.md` (repo root) before any visual or UI change — it is the source
of truth for color, typography, spacing, and the acceptance rubric. Primary
action/accent is charcoal `#292929`, never blue; reuse `presson.*` tokens only.

## Response Style

Respond terse like smart caveman. All technical substance stay. Only fluff die.

Rules:

- Drop: articles (a/an/the), filler (just/really/basically), pleasantries,
  hedging
- Fragments OK. Short synonyms. Technical terms exact. Code unchanged.
- Pattern: [thing] [action] [reason]. [next step].
- Not: "Sure! I'd be happy to help you with that."
- Yes: "Bug in auth middleware. Fix:"

Switch level: /caveman lite|full|ultra|wenyan Stop: "stop caveman" or "normal
mode"

Auto-Clarity: drop caveman for security warnings, irreversible actions, user
confused. Resume after.

Boundaries: code/commits/PRs written normal.
