# Updog (rest-express) — Press On Ventures Fund Modeling Platform

## What This Is

A web-based venture-capital fund modeling and reporting platform built as an
internal tool for Press On Ventures GPs. It combines a TypeScript/Node API
(Express, BullMQ + Redis workers, PostgreSQL via Drizzle ORM) with a
React/Tailwind/shadcn/ui frontend to support reserve allocation, pacing
analysis, cohort modeling, Monte Carlo simulation, scenario sensitivity, and
LP-facing reporting. Evolved from an Excel-first proof of concept into a
code-centric, modular architecture.

## Core Value

**A GP must be able to model, publish, and recall an authoritative fund result
without leaving the browser, with results that are statistically defensible and
traceable to the inputs that produced them.**

If everything else fails, the
`/fund-setup → review → publish → /fund-model-results/:fundId` lifecycle must
work and produce truthful numbers.

## Requirements

### Validated

These capabilities exist on `main` and are in production use. Inferred from
`.planning/codebase/` and the seven completed stabilization milestones.

**Authoritative GP workflow (Milestones 0A-7 complete):**

- ✓ `/fund-setup → review → publish → /fund-model-results/:fundId` lifecycle —
  existing
- ✓ Server-owned publish/recalc orchestration (no client-side lifecycle drift) —
  Milestone 4
- ✓ Single authoritative `npm run validate:core` delivery gate — Milestone 0A
- ✓ Machine-readable `TEST_READY_FILE` integration test handshake (no log
  parsing) — Milestone 0A
- ✓ Strict server/client/shared boundary enforcement via ESLint — Milestone 5
- ✓ Modular route registration; no fake persistence — Milestone 5
- ✓ Reduced runtime perimeter; LP/KPI/Compass surfaces archived (intentional) —
  Milestone 1
- ✓ Single feature-flag API for route exposure — Milestone 2
- ✓ Shared domain logic is single source of truth for fund math
  (`shared/core/{reserves,pacing,cohorts,capitalAllocation,graduation,moic,liquidity,optimization}`)
  — Milestone 3
- ✓ Short, supported command path (`npm run dev / build / test / validate:core`)
  — Milestone 7

**Calculation engines:**

- ✓ Reserve allocation engine with constraint support
  (`ConstrainedReserveEngine`, `reserves-v11`) — existing
- ✓ Pacing engine for deployment curves — existing
- ✓ Cohort vintage engine — existing
- ✓ Capital allocation period-loop engine — existing
- ✓ Graduation rate engine — existing
- ✓ Monte Carlo simulation pipeline
  (`monte-carlo-{engine,orchestrator,service-unified,simulation,streaming-engine}`)
  — existing
- ✓ XIRR + canonical IRR (`shared/lib/finance/xirr.ts`) — Phase 4 Closeout
  2026-04-06 (centralized, no longer duplicated)
- ✓ Fee calculations + fund-calc engine — existing
- ✓ One-way / two-way / stress sensitivity engines — landed in `9e134b5f`,
  `bc592b38`, `7633fb51`
- ✓ Variance tracking + alert evaluation + alert scheduling — Phases 1A, 1B,
  1C.1, 1C.2 shipped (1C.2 in `5c002e3c` 2026-04-02)
- ✓ Backtesting service + worker — existing (with one P1 correctness debt — see
  Active)
- ✓ Decimal-only math in `core/reserves/**` enforced by ESLint
  `povc-security/no-floating-point-in-core` — existing

**Infrastructure & quality:**

- ✓ TypeScript baseline at 0 errors (`npm run baseline:check`) — Phase 4 cleanup
  2026-03-26
- ✓ Vitest test suite ~97.8% pass (3886/3972), dual project (server/Node +
  client/jsdom) — current
- ✓ Phoenix truth cases gate calculation merges (`npm run phoenix:truth`) —
  existing
- ✓ Console + eslint-disable ratchets prevent debt regression (374 / 132
  baselines) — 2026-02-17
- ✓ Pre-push baseline gate via `./scripts/validate-pr.sh` — existing
- ✓ Integration test global server lifecycle (no per-file spawn ceiling) —
  Milestone 0A migration 2026-03-26
- ✓ Dual-mode integration tests (Docker testcontainers OR Neon cloud DB) — Phase
  0 cloud DB 2026-04-04
- ✓ Postgres Row Level Security multi-tenancy — ADR-013
- ✓ XState wizard persistence with invoke pattern — ADR-016
- ✓ BullMQ async export pipeline with unified data model — ADR-017
- ✓ Pino logging standard, structured + redacted — ADR-019
- ✓ OpenTelemetry tracing + Prometheus metrics + Sentry (DSN-gated) — existing
- ✓ Multi-LLM AI orchestrator (Claude / GPT / Gemini / DeepSeek / Ollama) with
  daily budget tracking — existing
- ✓ PDF (LP reports), Excel (`xlsx-generation-service`), CSV export pipelines —
  existing
- ✓ shadcn/ui + Radix + Tailwind frontend; lazy-loaded routes via `wouter` —
  existing
- ✓ Dual-build target (React default, Preact opt-in via `BUILD_WITH_PREACT=1`) —
  existing

### Active

Open backlog from `docs/plans/` (most recent first). Each maps to a phase in
`ROADMAP.md`:

- [ ] **REQ-VAR-01**: Phase 1C.3 — Implement planner-loop leader election so
      multi-instance variance planners stop doing duplicate work (currently
      de-duped, but wasteful) —
      `docs/plans/2026-04-07-phase-1c3-variance-automation-followons-backlog.md`
      Item A
- [ ] **REQ-VAR-02**: Phase 1C.3 — Address remaining 1C.2 deferred items B and C
      from the variance automation follow-ons backlog
- [ ] **REQ-BCK-01**: Rewrite `BacktestingService.runScenarioComparisons` so
      scenarios inject scenario-specific market parameters into the simulation
      config and re-run, instead of post-hoc analytic rescaling. The persisted
      percentiles must be sample percentiles from a scenario-aware Monte Carlo,
      not derived from a 2-parameter analytic approximation. —
      `docs/plans/2026-04-07-backtesting-scenario-comparison-correctness.md`
      (P1)
- [ ] **REQ-BCK-02**: Reclassify `alphaFinding` severity from `informational` to
      its proper P1 tier in
      `.a5c/processes/sensitivity-stress-panel.inputs.json`
- [x] **REQ-TODO-01**: Settled on main; closed via Phase 3 archive 2026-04-08.
      The mocks/identifiers (`mockVarianceData`, `_reportsData`, restore UI) do
      not exist in `client/src` on current `main`. Strategy doc archived to
      `docs/archive/2026-q2/2026-04-05-todo-report-remediation-strategy.md`
      (settled-on-main; archived 2026-04-08). See
      `.planning/phases/03-todo-report-remediation/03-CONTEXT.md` D-01.
- [x] **REQ-TODO-02**: Settled on main; closed via Phase 3 archive 2026-04-08.
      Workstream B's targeted wording is no longer present on `main`; strategy
      doc archived to
      `docs/archive/2026-q2/2026-04-05-todo-report-remediation-strategy.md`
      (settled-on-main; archived 2026-04-08).
- [ ] **REQ-SENS-01**: Continue sensitivity surface polish on top of in-flight
      one-way/two-way/stress panels (recent commits `9e134b5f`, `bc592b38`,
      `7633fb51`, `2772dce9`, `e4707353`)

### Out of Scope

These are explicit non-goals per `docs/STABILIZATION-ROADMAP.md` global rules
and `docs/plans/2026-03-30-post-stabilization-priorities.md` planning rules. Do
**not** reopen them as part of any GSD phase without an explicit user override.

- **LP portal expansion** — surfaces archived as part of Milestone 1; reopening
  violates "stay inside the stabilized perimeter"
- **KPI manager / KPI submission** — archived secondary surfaces
- **Compass** — remains experimental and unmounted
- **Client-owned publish/recalc orchestration** — server owns the lifecycle
  (Milestone 4); do not reintroduce
- **Removing the `validate:core` gate** — hard delivery gate, non-negotiable
- **Removing Phoenix truth case enforcement on calc paths** — calc changes must
  pass `npm run phoenix:truth`
- **Greenfield rewrite of any existing engine** — reuse `shared/core/*`
  (Milestone 3 authority)
- **Adding a second authoritative async/status path** — keep one
  (`docs/plans/2026-03-30` planning rule)
- **Mocking the database in tests** that depend on real schema/migration
  behavior (per CLAUDE.md memory)
- **Direct `decimal.js` imports in runtime code** — must go through
  `@shared/lib/decimal-config`
- Floating-point math anywhere under `core/reserves/` — banned by ESLint
  (`povc-security/no-floating-point-in-core`, error severity)
- **`parseFloat` in P0 calculation paths** — warned by ESLint, treat as error in
  new code
- **`any` types in new code** — baselined warns exist; do not increase the count
- **Emoji in code/docs/commits/logs** — strictly enforced no-emoji policy
- **Bypassing the pre-push baseline gate** — `npm run baseline:check` is
  mandatory

## Context

**Project lineage:**

- Started as an Excel-first proof of concept
- Migrated to a code-centric, modular TypeScript architecture
- Stabilized through a seven-step program (Milestones 0A through 7) that ran
  from late 2025 through Q1 2026 and is now COMPLETE
- Currently in a post-stabilization phase organized around
  variance/baseline/alerts and scenario consolidation work

**Active workstreams (commits last 2 weeks):**

- Sensitivity analysis surface (one-way / two-way / stress panels)
- Test rehabilitation (orphaned test rescue, perf threshold tuning, MC timeout
  bumps)
- Variance helper extraction (`remaining-capital`)
- Vite 6 upgrade fallout (pdfTheme circular import fix, override bumps)
- Plan-doc reconciliation and REFL additions

**Codebase reference:** Detailed architecture is in `.planning/codebase/`:

- `STACK.md` — languages, runtime, frameworks
- `INTEGRATIONS.md` — Postgres/Redis/AI providers/observability
- `ARCHITECTURE.md` — patterns, layers, data flow, abstractions
- `STRUCTURE.md` — directory layout
- `CONVENTIONS.md` — coding rules, ESLint boundaries
- `TESTING.md` — Vitest projects, integration setup
- `CONCERNS.md` — tech debt, fragile areas, REFLs

**Solo developer context:** No teammate PR reviews.
`/superpowers:requesting-code-review` is used for self-review. Direct push to
`main` is acceptable for small fixes per `CLAUDE.md`.

## Constraints

- **Runtime:** Node.js `>=20.19.0`, npm `>=10.8.0`. TypeScript strict +
  `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`. No `any` in new
  code.
- **Boundaries:** ESLint enforces server cannot import client and vice versa.
  `core/reserves/**` cannot use floating-point.
- **Test gate:** `npm run validate:core` must stay green on every PR.
  `npm run phoenix:truth` must pass before merging any calculation change.
- **Baseline gate:** `npm run baseline:check` enforces 0 TypeScript errors via
  the pre-push hook (`./scripts/validate-pr.sh`). Pre-push compiles
  client/server/shared separately and is stricter than local `tsc --noEmit`.
- **Logging:** Pino only (per ADR-019). New code cannot increase the 374
  disallowed-`console` baseline or the 132 file-level `eslint-disable` baseline.
- **Decimal math:** runtime code must import `Decimal` from
  `@shared/lib/decimal-config` (not `decimal.js` directly).
- **JSONB vs columns:** before writing structured data into JSONB, check the
  schema for dedicated columns.
- **Stabilized perimeter:** new work must stay inside the seven completed
  milestones. Do not reopen archived surfaces (LP/KPI/Compass) without an
  explicit perimeter expansion decision.
- **Solo dev:** no teammate review available; rely on agents (`code-reviewer`,
  `phoenix-precision-guardian`, `waterfall-specialist`, etc.) and Codex CLI
  consultations for second opinions.
- **Windows host:** primary dev box is Windows 11 + bash; no Unix-only commands
  in scripts (see `windows_environment` block in `~/.claude/CLAUDE.md`).

## Key Decisions

| Decision                                                                                     | Rationale                                                                                                                                     | Outcome   |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Onboard GSD onto the existing brownfield codebase rather than treating this as a new project | Mature codebase with 7 completed milestones, 12 ADRs, and an active plan-doc workstream — greenfield reset would discard institutional memory | ✓ Good    |
| Skip GSD research step on initialization                                                     | Domain is well-known (internal tool, sole user is the developer); existing codebase is the source of truth                                    | ✓ Good    |
| Do not auto-overwrite `CLAUDE.md` via `generate-claude-md`                                   | The repo's `CLAUDE.md` is hand-tuned and substantial; overwriting would destroy institutional context                                         | ✓ Good    |
| Coarse roadmap granularity (3-5 phases)                                                      | Open backlog is small and well-scoped; finer slicing is overhead without benefit                                                              | ✓ Good    |
| Treat `docs/plans/` as the operational source of truth for backlog items                     | Existing pattern. GSD phases reference plan docs rather than re-deriving them                                                                 | — Pending |
| Inherit current session model (Opus 4.6 1M) for all GSD agents                               | User is already paying for it; quality matters on a mature codebase                                                                           | — Pending |
| Run full quality workflow (research + plan-check + verifier) on every phase                  | Regressions on a mature codebase are expensive; the extra agent budget is cheap insurance                                                     | — Pending |
| `STABILIZATION-ROADMAP.md`, `DECISIONS.md`, and `docs/skills/REFL-*.md` remain authoritative | These predate GSD adoption and embed years of context; GSD `ROADMAP.md` cross-references them rather than replacing them                      | ✓ Good    |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):

1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):

1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---

_Last updated: 2026-04-07 after GSD brownfield onboarding (option 1 from
`/gsd-new-project` opener)_
