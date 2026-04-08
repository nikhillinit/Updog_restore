---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: cleanup-and-decay-reduction
status: Defining requirements
last_updated: '2026-04-08T05:30:00.000Z'
progress:
  total_phases: 3
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# GSD State — Updog

## Project Reference

See: `.planning/PROJECT.md` (last updated 2026-04-07)

**Core value:** A GP must be able to model, publish, and recall an authoritative
fund result without leaving the browser, with results that are statistically
defensible and traceable to the inputs that produced them.

**Current focus:** **Milestone M9 — v1.1 Cleanup and Decay Reduction**, just
opened 2026-04-08 via `/gsd-new-milestone` after M8 closed clean (all 11 v1
requirements satisfied; see `MILESTONE_SUMMARY-v1.0.md` for the full M8 record).
M9 is a 3-phase cleanup milestone: test hygiene resurrection,
schema/docs/baseline drift cleanup, and bounded debt drawdown of two small lint
baselines. Phase numbering continues from M8 (5, 6, 7). Status: defining
requirements complete; ready to discuss/plan Phase 5.

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

## Current Roadmap (M9 — v1.1)

`.planning/ROADMAP.md` — 3 phases, 7 requirements, coarse granularity. Phase
numbering continues from M8 (which used 1-4):

1. **Phase 5**: Test Hygiene Resurrection (REQ-TEST-01, REQ-TEST-02)
2. **Phase 6**: Schema, Docs, and Baseline Drift Cleanup (REQ-DRIFT-01..03)
3. **Phase 7**: Bounded Debt Drawdown (REQ-DEBT-01, REQ-DEBT-02)

## Previous Roadmap (M8 — v1.0, COMPLETE 2026-04-08)

M8 shipped 4 phases / 13 plans / 11 requirements over 2026-04-07..08. Full
record at `.planning/reports/MILESTONE_SUMMARY-v1.0.md` (gitignored local-only)
and in the per-phase SUMMARY files at `.planning/phases/01..04-*/`. M8 phases:
Variance Automation 1C.3 Follow-Ons, Backtesting Scenario Comparison Rewrite
(P1), TODO Report Remediation (close-via-archive), Sensitivity Surface Polish.

## Configuration

`.planning/config.json` — YOLO mode, coarse granularity, parallel plan
execution, `commit_docs: true`, `model_profile: inherit` (Opus 4.6 1M), full
quality workflow (research + plan-check + verifier all enabled),
`nyquist_validation: false` (granularity is coarse).

## Active Phase

**Phase 5 — Test Hygiene Resurrection** (first phase of M9 per ROADMAP).

M8 is COMPLETE (all 4 phases / 13 plans / 11 requirements; closed 2026-04-08 at
commit `46be2c37`). M9 just opened via `/gsd-new-milestone` and is ready to
plan.

To start Phase 5, run `/gsd-discuss-phase 5` or `/gsd-plan-phase 5`.

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

2026-04-08 — **Milestone M9 (v1.1 Cleanup and Decay Reduction) OPENED** via
`/gsd-new-milestone` after M8 closed clean. 3 phases / 7 requirements scoped:
Phase 5 (Test Hygiene Resurrection — REQ-TEST-01/02), Phase 6 (Schema, Docs, and
Baseline Drift Cleanup — REQ-DRIFT-01/02/03), Phase 7 (Bounded Debt Drawdown —
REQ-DEBT-01/02). Phase numbering continues from M8 (which used 1-4). Research
intentionally skipped — M9 is cleanup of known items. Key discovery during
scoping: CLAUDE.md baseline numbers (374 console / 132 eslint-disable / ~400
any) are stale by ~10x — actual values from `.baselines/` are 39 / 29 / 363,
captured as REQ-DRIFT-03. PROJECT.md updated with Current Milestone section + M8
shipped reqs moved to Validated with phase references; REQUIREMENTS.md and
ROADMAP.md replaced with M9 content; M8 phase directories at
`.planning/phases/01..04-*/` left in place as institutional memory (deviation
from workflow Step 6 `phases clear` — intentional). Status: defining
requirements complete; ready to discuss/plan Phase 5.

2026-04-08 — **M8 (v1.0) CLOSED** at commit `46be2c37` with all 4 phases
complete. 11/11 v1 requirements satisfied. Full record in
`.planning/reports/MILESTONE_SUMMARY-v1.0.md` (gitignored, local-only). Phoenix
truth cases ended at 262/262 (started milestone at 258/258). Total M8 spend: 69
commits, 112 files changed (+22566 / -1213).

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
