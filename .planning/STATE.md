---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: in_progress
last_updated: '2026-04-08T02:13:02.359Z'
progress:
  total_phases: 4
  completed_phases: 3
  total_plans: 12
  completed_plans: 12
  percent: 100
---

# GSD State — Updog

## Project Reference

See: `.planning/PROJECT.md` (last updated 2026-04-07)

**Core value:** A GP must be able to model, publish, and recall an authoritative
fund result without leaving the browser, with results that are statistically
defensible and traceable to the inputs that produced them.

**Current focus:** Phase 04 — Sensitivity Surface Polish (next phase per
ROADMAP). Phases 01, 02, and 03 are all COMPLETE. Phase 03 closed 2026-04-08 via
**close-via-archive**: every worktrack from
`docs/archive/2026-q2/2026-04-05-todo-report-remediation-strategy.md` (A, B, C1)
verified settled on current `main`, and C2/D were declared settled-on-main
reference lanes by the strategy doc itself. Plan 03-01 archived both stale
planning artifacts (`2026-04-05-todo-report-remediation-strategy.md` and
`todo-report-accuracy-review-2026-04-05.md`) into `docs/archive/2026-q2/` via
`git mv` (history preserved), updated 6 active reference files (ROADMAP,
REQUIREMENTS, PROJECT, STABILIZATION-ROADMAP, ADR-014,
variance-roadmap-revision) to point at the archived paths, and marked
REQ-TODO-01 and REQ-TODO-02 as `[x]` with closure rationale. All three Phase 3
exit gates green: `npm run check` 0 TS errors, `npm run validate:core` 37/37
unit + 1/1 integration, `npm run phoenix:truth` 262/262 across 6 files. Phase 04
is unblocked.

## Codebase Reference

Detailed brownfield map at `.planning/codebase/`:

- `STACK.md` — Node 20+, TS 5.9, React 18, Express 5, Drizzle, BullMQ, Vitest 3,
  Vite 6

- `INTEGRATIONS.md` — Postgres (Neon/pg), Redis (ioredis or memory://),
  Anthropic/OpenAI/Gemini/DeepSeek/Ollama, Sentry, Pino, OTel

- `ARCHITECTURE.md` — Three-tier monorepo (client/server/shared), 5-phase
  bootstrap, Express layer chain, calculation engine catalog

- `STRUCTURE.md` — Directory layout, naming conventions, path aliases, test
  placement rules

- `CONVENTIONS.md` — Strict TS, ESLint boundaries, no-emoji, idempotency,
  optimistic locking

- `TESTING.md` — Vitest dual-project (server/client), integration global setup,
  Phoenix truth cases, baseline gate

- `CONCERNS.md` — 5 high-priority live concerns, lint baselines, REFLs 1-35

## Historical Roadmap

`docs/STABILIZATION-ROADMAP.md` — Milestones M0A through M7 are COMPLETE (last
updated 2026-03-28). The project is now in Milestone M8 (post-stabilization
cleanup) tracked in `.planning/ROADMAP.md`.

## Current Roadmap (M8)

`.planning/ROADMAP.md` — 4 phases, 11 requirements, coarse granularity:

1. **Phase 1**: Variance Automation 1C.3 Follow-Ons (REQ-VAR-01..03)
2. **Phase 2**: Backtesting Scenario Comparison Rewrite — P1 (REQ-BCK-01..03)
3. **Phase 3**: TODO Report Remediation (REQ-TODO-01..02)
4. **Phase 4**: Sensitivity Surface Polish (REQ-SENS-01..03)

## Configuration

`.planning/config.json` — YOLO mode, coarse granularity, parallel plan
execution, `commit_docs: true`, `model_profile: inherit` (Opus 4.6 1M), full
quality workflow (research + plan-check + verifier all enabled),
`nyquist_validation: false` (granularity is coarse).

## Active Phase

**Phase 04 — Sensitivity Surface Polish** (next phase per ROADMAP after Phase 03
closure 2026-04-08).

Phases 01, 02, and 03 are all COMPLETE. Phase 03 closed at commit `a067ad08`
(reference updates) on top of `98563f09` (archive moves) and `e85cc90d`
(CONTEXT + plan), all on 2026-04-08, via close-via-archive. The two stale
planning artifacts now live at
`docs/archive/2026-q2/2026-04-05-todo-report-remediation-strategy.md` and
`docs/archive/2026-q2/todo-report-accuracy-review-2026-04-05.md`. REQ-TODO-01
and REQ-TODO-02 are marked `[x]` in REQUIREMENTS.md and PROJECT.md with closure
rationale. All three Phase 3 exit gates green: `npm run check` 0 TS errors,
`npm run validate:core` exit 0, `npm run phoenix:truth` 262/262.

To start Phase 04, run `/gsd-discuss-phase 4` or `/gsd-plan-phase 4`.

## Authoritative Documents

These predate GSD adoption and remain authoritative. GSD docs **reference** them
rather than replacing them:

- `CLAUDE.md` — project instructions, mandatory pre-action checks, discovery
  routing

- `DECISIONS.md` — 12 ADRs (latest 2026-03-26)
- `CHANGELOG.md` — selective; `git log` is the operational record per the
  2026-04-05 freshness note

- `docs/STABILIZATION-ROADMAP.md` — historical milestone framework
- `docs/skills/REFL-001..035` — debugging learnings (REFL-036 likely landed
  recently per memory note about `scripts/check-orphan-tests.mjs`)

- `cheatsheets/INDEX.md` — 30+ cheatsheets

## Recent Workstream Signal (last 2 weeks of `git log --oneline`)

- Sensitivity surface trio (one-way / two-way / stress) — multiple commits,
  in-flight

- Variance helper extraction (`remaining-capital`)
- Vite 6 fallout (pdfTheme circular import; override bumps in agent packages)
- Test rehabilitation (orphaned test rescue; perf threshold tuning; MC timeout
  bumps)

- Plan-doc reconciliation (1C.2 status; backtesting P1 debt tracking)
- New pre-push hook `scripts/check-orphan-tests.mjs` enforcing test placement
  (REFL-036, commit `a4aa91e6`)

- 343 dead lib tests resurrected via Phase A/C across `01b87889`, `ef3672ee`,
  `a4aa91e6` (per memory)

## Known Drift / Hazards (verify before acting)

- **Phoenix truth case count is in drift** — never quote a number from docs;
  always run `npm run phoenix:truth` for the live count

- **`tests/integration/fund-idempotency.spec.ts`** is still excluded with the
  original cascade comment despite the global-setup migration that should have
  removed the cause

- **`cheatsheets/pr-merge-verification.md`** baseline is ~5 months stale; do not
  use it for PR-merge decisions until refreshed

- **Pre-push hook compiles client/server/shared separately** — local
  `tsc --noEmit` may pass while pre-push fails (TS4111 drift)

- **Stale baseline file** — if `.tsc-baseline.json` reports 0 errors but real
  errors exist, every push fails with "NEW ERRORS DETECTED"; recovery:
  `npm run baseline:save && commit`

- **Subagent permission limitation** — this very GSD onboarding ran in
  sequential mapping mode because `gsd-codebase-mapper` and
  `gsd-project-researcher` subagents do not have Write/Bash approval at the
  session permission layer. To run parallel GSD agents in future, those tools
  must be approved for subagents.

- **`generate-claude-md` was NOT run** during this onboarding to preserve the
  existing hand-tuned `CLAUDE.md`. Run it manually only if you want a
  GSD-flavored project guide and are willing to merge the result.

## Memory Pointers

User auto-memory
(`C:\Users\nikhi\.claude\projects\C--dev-Updog-restore\memory\MEMORY.md`) is the
canonical record for non-derivable gotchas. Most relevant on `main` right now:

- Linter Edit Hook strips imports added in separate edits
- exactOptionalPropertyTypes spread pattern
- Pre-Push Baseline vs Local tsc
- Integration Test Server Lifecycle (CI ceiling — fixed but residual)
- Codex CLI invocation patterns
- Client Test File Placement (now hook-enforced — REFL-036)
- Subagent Collateral Cleanup
- Planning Docs Drift From Main

## Last Updated

2026-04-08 — **Phase 03 CLOSED via close-via-archive** through Plan 03-01.
Commits `e85cc90d` (CONTEXT + plan), `98563f09` (archive moves), `a067ad08`
(reference updates). Both stale planning artifacts archived to
`docs/archive/2026-q2/` via `git mv` (history preserved). 6 active reference
files updated to point at archived paths: `.planning/ROADMAP.md`,
`.planning/REQUIREMENTS.md`, `.planning/PROJECT.md`,
`docs/STABILIZATION-ROADMAP.md`, `docs/adr/ADR-014-snapshot-governance.md`, and
`docs/plans/2026-03-31-variance-roadmap-revision.md` (the last fixed proactively
as Rule 3 link-rot prevention even though not in the strict update list).
REQ-TODO-01 and REQ-TODO-02 marked `[x]` in REQUIREMENTS.md and PROJECT.md with
closure rationale. All three Phase 3 exit gates green: `npm run check` 0 TS
errors, `npm run validate:core` exit 0, `npm run phoenix:truth` 262/262 across 6
test files. Phase 04 (Sensitivity Surface Polish) is next per ROADMAP.

2026-04-08 — **Phase 02 CLOSED** at commit `e704f56a` after Plan 02-06 authored
`docs/plans/2026-04-08-backtesting-scenario-comparison-rewrite.md` and ran the
Phase 2 exit gates: `npm run phoenix:truth` 262/262 across 6 test files (was
258/258 across 5 files pre-Phase 2; Plan 02-05 added the GFC truth case suite),
`npm run validate:core` exit 0 (type check baseline 0 errors,
wizard-to-results-e2e integration test 1/1, lint:phase4:strict --max-warnings 0
green, worker warnings 41 <= baseline 55). All three REQ-BCK-\*\* requirements
satisfied. Plan doc surfaces the gitignored
`.a5c/processes/sensitivity-stress-panel.inputs.json` planning defect with three
resolution paths for the user to pick. Next phase per ROADMAP: Phase 03 (TODO
Report Remediation).

2026-04-08 — Plan 02-03 (runScenarioComparisons rewrite) landed at `8f1d0cce`.
Phoenix truth 258/258, type check clean, 21/21 unit tests + 25/25 integration
tests passing. REQ-BCK-01 marked complete in REQUIREMENTS.md.

2026-04-07 — initialized via `/gsd-new-project` brownfield onboarding (option 1:
onboard onto existing codebase).
