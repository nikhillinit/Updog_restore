---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: in_progress
last_updated: '2026-04-08T00:50:41.011Z'
progress:
  total_phases: 4
  completed_phases: 2
  total_plans: 11
  completed_plans: 11
  percent: 100
---

# GSD State — Updog

## Project Reference

See: `.planning/PROJECT.md` (last updated 2026-04-07)

**Core value:** A GP must be able to model, publish, and recall an authoritative
fund result without leaving the browser, with results that are statistically
defensible and traceable to the inputs that produced them.

**Current focus:** Phase 03 — TODO Report Remediation (next phase per ROADMAP).
Phase 01 (variance automation 1C.3 follow-ons) and Phase 02
(backtesting-scenario-comparison-rewrite-p1) are both COMPLETE. Phase 02 closed
2026-04-08 at `e704f56a` after Plan 02-06 authored
`docs/plans/2026-04-08-backtesting-scenario-comparison-rewrite.md` and ran the
exit gates: `npm run phoenix:truth` 262/262 across 6 files (was 258/258 across 5
files pre-Phase 2; Plan 02-05 added the GFC truth case suite),
`npm run validate:core` exit 0. All three REQ-BCK-\* requirements satisfied. The
rewrite replaced the analytic 2-parameter rescale in
`BacktestingService.runScenarioComparisons` with true per-scenario MC runs
injecting `marketParameters` via the new `SimulationConfig.marketParameters?`
seam; `applyMarketAdjustment` is deleted; sample percentiles are read from
`result.irr.percentiles`; three Pino structured events
(`backtesting.scenario_comparison.{started,completed,failed}`) replace the prior
`console.error`; the GFC truth case is snapshot-locked at `randomSeed: 12345`
with the option (a) failureRate translation. The plan doc surfaces the
gitignored `.a5c/processes/sensitivity-stress-panel.inputs.json` planning defect
with three resolution paths for the user to decide at phase close. Phase 03 is
unblocked.

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

**Phase 03 — TODO Report Remediation** (next phase per ROADMAP after Phase 02
closure 2026-04-08).

Phases 01 and 02 are COMPLETE. Phase 02 closed at commit `e704f56a` with the
Phase 2 plan doc at
`docs/plans/2026-04-08-backtesting-scenario-comparison-rewrite.md`. Both Phase 2
exit gates green: `npm run phoenix:truth` 262/262, `npm run validate:core`
exit 0. All three REQ-BCK-\* requirements satisfied.

To start Phase 03, run `/gsd-discuss-phase 3` or `/gsd-plan-phase 3`.

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
