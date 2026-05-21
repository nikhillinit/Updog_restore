# Technical Concerns — Updog

> Generated 2026-04-07. Sources: `CHANGELOG.md`, `DECISIONS.md`,
> `docs/STABILIZATION-ROADMAP.md`, `docs/skills/REFL-001..035`, `cheatsheets/`,
> memory notes, `git log`.

## High-priority Live Concerns

### 1. Phoenix truth case count is in drift

Two historical snapshots disagree:

- `docs/phase0-validation-report.md` — 118/118 from 2026-01-21
- `docs/PHOENIX-SOT/evidence-ledger.md` — 107/107 from 2026-02-24

**Mitigation:** Always run `npm run phoenix:truth` for the authoritative live
count. Do NOT cite either number as current. Phoenix truth cases must pass
before merging any calculation change. Per CHANGELOG reconciliation note
2026-04-05.

### 2. `tests/integration/fund-idempotency.spec.ts` still excluded

The integration test server-lifecycle migration (Milestone 0A) is mostly
complete: `vitest.config.int.ts:28` has
`globalSetup: ['tests/integration/global-setup.ts']` and
`tests/integration/setup.ts` is properly scoped to worker hygiene. **However**,
`tests/integration/fund-idempotency.spec.ts` remains in the exclude list at line
48 with the original "cascade resource exhaustion" comment. Unclear whether the
exclusion is still needed post-migration or was left defensively.

**Next step:** un-exclude the file, run integration suite locally, confirm no
regression. Per CHANGELOG note 2026-04-05/2026-04-06.

### 3. `cheatsheets/pr-merge-verification.md` baseline is ~5 months stale

Still references 2025-11-17 baseline (74.7% pass rate, 998/1337 tests, 450
TypeScript errors). Current state (post-stabilization) is ~97.8% pass rate
(3886/3972 passing, 86 skipped) with a **0-error TypeScript baseline**. Any PR
compared against the stale baseline will appear to "improve" for the wrong
reason.

**Action:** Fix the cheatsheet before using it for a real PR merge decision. Per
CHANGELOG note 2026-04-05.

### 4. `1C.3` follow-on backlog open

Recent commit
`643713b8 docs(plans): reconcile 1C.2 status and open 1C.3 follow-on backlog`
indicates Phase 1C.3 work is queued and unfinished.

### 5. Backtesting scenario comparison correctness — P1 debt

Recent commit
`32950abf docs(plans): track backtesting scenario comparison correctness as P1 debt`
flags this as P1 technical debt.

## Pre-existing Lint / Type Baselines

The codebase carries baselined warnings rather than errors for the following —
new code must NOT increase the count, but pre-existing violations remain:

- **`@typescript-eslint/no-explicit-any`** — `warn` (target: `error`); 363
  pre-existing `any` types per `.baselines/eslint-output.json` (counted at the
  `eslint.config.js:181` rule)
- **`@typescript-eslint/no-unsafe-{assignment,member-access,call,return,argument}`**
  — all `warn`
- **`no-console`** — `warn` with `allow: ['warn','error']`; **39 disallowed
  calls** at baseline per `.baselines/console-prod-baseline.json` (enforced by
  `scripts/guardrails/console-ratchet.mjs`)
- **`eslint-disable` directives** — **29 file-level disables** at baseline per
  `.baselines/eslint-file-disable-baseline.json` (enforced by
  `scripts/guardrails/eslint-disable-ratchet.mjs`)
- **Other warns** (pre-existing patterns to fix incrementally):
  - `require-atomic-updates` — many false positives for singletons
  - `no-misleading-character-class`, `no-case-declarations`,
    `no-useless-escape`, `no-unreachable`, `no-redeclare`,
    `no-unexpected-multiline`, `no-empty-pattern`, `no-empty`

**Ratchet enforcement:** `npm run lint` → `npm run guardrails:check` runs both
ratchets. New code cannot increase debt.

## Lint-Exempted "Reference" Files

These files are explicitly ignored — they exist as reference, not runtime:

- `server/security/integration-guide.ts` — security integration guide
- `server/routes/simulations-guarded.example.ts` — example route wiring
- `server/engine/fault-injector.ts` — test-only chaos helper

Plus broad ignores: `archive/`, `_archive/`, `.migration-backup/`, `.backup/`,
`Default Parameters/`, `anthropic-cookbook/`, `api/`, `code-reviewer/`,
`triage-output/`, `.a5c/` — these are historical or external integration drops,
not authoritative code.

## Fragile Areas

### Phoenix calculation precision

- **Rule:** floating-point math is **banned** in `core/reserves/**`
  (`povc-security/no-floating-point-in-core` ESLint rule, error severity)
- **Wrapper:** all decimal math must go through `@shared/lib/decimal-config`
  (Decimal.js); direct `import 'decimal.js'` is forbidden in runtime code
- **`parseFloat` warning** in P0 paths: `client/src/lib/**`,
  `client/src/core/**`, `server/analytics/**`,
  `workers/{reserve,pacing}-worker.ts` (Phase 1A.6 triage)
- **Specialized agent:** `phoenix-precision-guardian` exists for review of these
  paths

### Waterfall ledger correctness

- **Specialized agent:** `waterfall-specialist` is mandatory for ANY changes to
  waterfall logic, validation, or UI components
- **Domain skill:** `phoenix-waterfall-ledger-semantics` covers tier and ledger
  waterfall, clawback behavior, distribution calculations
- **Rationale:** carry distribution math is high-impact for LP reporting

### XIRR / fees

- **Specialized agent:** `xirr-fees-validator` for XIRR and fee module changes
- **Known issue:** REFL-006 — XIRR Newton-Raphson divergence on extreme returns
- **Targets:** `server/analytics/xirr.ts`, `server/analytics/fees.ts`, and their
  truth cases

### Prometheus metrics

- **REFL-022:** Prometheus metrics duplicate registration — registries can
  collide on hot reload or in test runs
- **Mitigation:** singleton registries; client builds receive a virtual stub via
  `vite.config.ts:97-174`

### Integration test server lifecycle (historical CI ceiling)

Per memory "Integration Test Server Lifecycle (CI Ceiling)":

- Vitest `setupFiles` runs per test file, not once globally. With
  `singleFork: true`, each integration file spawned its own Express server.
  After ~31 spawn/kill cycles, CI runners (2 CPU / 7GB) could no longer start
  servers within the 30s healthz timeout.
- **Fix landed 2026-03-26:** migrated to `globalSetup` for shared server
  lifecycle; `tests/integration/setup.ts` reduced to per-worker hydration only.
  See ARCHITECTURE.md "Bootstrap Sequence" and TESTING.md "Integration Tests".
- **Residual:** the one excluded file (concern #2 above).

### Pre-push baseline compilation drift

Per memory "Pre-Push Baseline vs Local tsc":

- `npx tsc --noEmit` may pass while `npm run baseline:check` fails. The pre-push
  hook compiles `client/`, `server/`, `shared/` **separately** and catches
  TS4111 (index signature access) drift that single-pass `tsc` misses.
- If the baseline file is stale (reports 0 errors but codebase has accumulated),
  every push fails with "NEW ERRORS DETECTED". Recovery:
  `npm run baseline:save && git add .tsc-baseline.json && git commit`.

### Sentry / Pino dual-build runtime contamination

- `winston` and `prom-client` are stub-mocked into the client bundle via
  `vite.config.ts` virtual plugin. New imports of these packages from client
  code will silently get the stub at build time and the real module at test time
  → behavior divergence.
- `@sentry/*` is build-time aliased to `client/src/monitoring/noop.ts` when
  `VITE_SENTRY_DSN` is unset (`vite.config.ts:384`). Tests run without DSN and
  get the noop.

### Dual React/Preact build target

- `BUILD_WITH_PREACT=1` (or `mode === 'preact'`) swaps in `preact/compat` via
  `vite.config.ts:369-396`. JSX-runtime aliases (`react/jsx-runtime`,
  `react/jsx-dev-runtime`) are critical — missing them breaks hooks under
  Preact.
- The default `npm run build:web` builds Preact (`vite build --mode preact`);
  `npm run vercel-build` builds React.
- Tests always run React. Runtime divergence is possible but uncovered by the
  test suite.

### Vite 6 circular import hazard

- Recent commit
  `18b93aa8 refactor(pdf): extract pdfTheme to theme.ts to break vite 6 circular import`
  indicates Vite 6 is more strict about circular imports than Vite 5 was. Watch
  for similar issues in PDF and chart modules.

### Test fixtures and mocks blast radius

Multiple memory entries flag this:

- **Grep before changing shared mocks/fixtures** for ALL assertion patterns that
  depend on current behavior (`feedback_grep_before_mock_changes.md`)
- **Run full `npm test`** (3400+ suite) before pushing when test infra changes
- **Drizzle mock chain overwrite** (REFL-026) — chained `.where().limit()` mock
  methods can shadow each other
- **Mock id type change blast radius** (REFL-030) — changing a mock ID from
  `number` to `string` breaks every test that asserts on it
- **Global `vi.mock` pollutes all tests** (REFL-007)
- **`vi.restoreAllMocks` wipes implementations** — Vitest gotcha, kills
  declaration-time `mockResolvedValue`

### Subagent collateral

Per memory:

- **Subagent fabrication tool-uses-zero** (REFL-034) — verifier agents that
  report "0 tool uses" should grep for evidence, not trust the report
- **Subagent collateral cleanup** — diff for files outside owned scope after
  subagent batches before committing
- **Defensive grep for recovered process drafts** (REFL-035)
- **Defensive grep before destructive action** (REFL-033)
- **Use grep, not line numbers** in verifier agents — line numbers shift

## Authentication / Authorization Concerns

- **`DISABLE_AUTH` env var** — dev backdoor; must NEVER be set in production
- **JWT secret minimum:** 32 chars enforced by `server/config.ts:16`
- **`trust proxy 1`** required for `express-rate-limit` to read X-Forwarded-For
  correctly (REFL-010)
- **CORS:** strict allowlist in production via `ALLOWED_ORIGINS`; dev allows
  `localhost`/`127.0.0.1`
- **RLS:** Postgres Row Level Security per ADR-013; new server endpoints must
  establish RLS context (`server/middleware/`)
- **CSP:** `server/config/csp.ts` controls directives; `CSP_REPORT_ONLY=1`
  switches to report-only mode

## Security Hotspots

- **`Math.random()` in production identifiers** — REFL-023, banned in identifier
  generation paths
- **Secrets in workflow `if:` expressions** — REFL-029, GitHub Actions gotcha
- **Custom ESLint rules** in `tools/eslint-plugin-povc-security/`:
  - `no-floating-point-in-core` (error) on `core/reserves/**`
  - `no-parsefloat-in-calculations` (warn) on P0 paths
  - `require-bullmq-config` (warn) on `server/{workers,queues}/**`
  - `no-sql-raw-in-routes` (error) on `server/routes/**`

## Test Quarantine & Skip Hygiene

- **37 quarantine files** documented in `tests/quarantine/REPORT.md` (refreshed
  2026-03-26 per CHANGELOG)
- **Custom rules:**
  - `custom/no-db-import-in-skipped-tests` (error) — Phase 5 regression gate;
    prevents pool creation at import time in skipped tests
  - `custom/warn-stale-skips` (warn) — surfaces `.skip()` annotations missing
    `// SKIP: reason`
- **`@quarantine` JSDoc header** required on quarantined files

## Recent Reflection Learnings (REFL-021..035)

| REFL | Title                                         |
| ---- | --------------------------------------------- |
| 021  | exact-optional property types spread pattern  |
| 022  | Prometheus metrics duplicate registration     |
| 023  | Math.random in production identifiers         |
| 024  | Integration test environment leakage          |
| 025  | CI compilation boundary mismatch              |
| 026  | Drizzle mock chain overwrite                  |
| 027  | Redundant `any` on inferred callbacks         |
| 028  | Duck-type context access                      |
| 029  | Secrets in workflow `if:` expressions         |
| 030  | Mock ID type change blast radius              |
| 031  | `as const` literal type arithmetic            |
| 032  | TS4111 index signature vs ESLint dot notation |
| 033  | Defensive grep before destructive action      |
| 034  | Subagent fabrication tool-uses-zero           |
| 035  | Defensive grep for recovered process drafts   |

35 REFLs total under `docs/skills/REFL-*.md`. Each documents a debugging
learning that should not have to be re-discovered.

## Recent ADRs (Architectural Decision Records)

From `DECISIONS.md` (last_updated 2026-03-26):

| ADR | Title                                                                   |
| --- | ----------------------------------------------------------------------- |
| 009 | Vitest path alias configuration and `test.projects` migration           |
| 010 | PowerLawDistribution API design — constructor over factory pattern      |
| 011 | Anti-pattern prevention strategy for portfolio route API                |
| 012 | Mandatory evidence-based document reviews                               |
| 013 | Multi-tenant isolation via PostgreSQL Row Level Security                |
| 014 | Test baseline & PR merge criteria                                       |
| 015 | Document restructuring approach — sequential split, parallel refinement |
| 016 | XState wizard persistence with invoke pattern and automatic retry       |
| 017 | Export strategy — BullMQ async pipeline with unified data model         |
| 018 | Phase 3C truthful rich results — Track A                                |
| 019 | Operational guardrails, Pino standardization, and policy exclusions     |
| 020 | Phase 3C Track B go/no-go deadline (April 9, 2026 reconsideration)      |

## Stabilization Roadmap Status

Per `docs/STABILIZATION-ROADMAP.md` (last_updated 2026-03-28):

| Milestone | Title                                 | Status   |
| --------- | ------------------------------------- | -------- |
| 0A        | Land The Validated Core Gate          | COMPLETE |
| 0B        | Lock The Gate                         | COMPLETE |
| 1         | Reduce The Runtime Perimeter          | COMPLETE |
| 2         | Consolidate Route And Flag Control    | COMPLETE |
| 3         | Make Shared Domain Logic Authority    | COMPLETE |
| 4         | Move Finalization Authority To Server | COMPLETE |
| 5         | Clean Backend Boundaries              | COMPLETE |
| 6         | Add Narrow Internal Features Only     | COMPLETE |
| 7         | Reduce Tooling Entropy                | COMPLETE |

All seven milestones marked COMPLETE. Active work is now plan-doc / phase-driven
via `docs/plans/` rather than milestone-driven.

## Documentation Drift Hazards

1. **Planning docs drift from main within hours** — before scoping any task from
   a planning doc, grep current main for every named touchpoint and check git
   log. See memory "Planning Docs Drift From Main".
2. **Capability inventories age fast** — `CAPABILITIES.md` is explicitly demoted
   to "historical inventory only" by CLAUDE.md.
3. **Cheatsheet baselines are not auto-updated** — `pr-merge-verification.md` is
   the canonical example (concern #3 above).
4. **Stale `.skip()` annotations** — caught by `custom/warn-stale-skips` but
   accumulates if ignored.

## Known External Dependencies & Risks

- **Neon serverless pooler** requires JSON.stringify for JSONB params in raw
  `pg` queries (memory "Neon Database")
- **Vite 6 stricter circular import handling** (recent commit `18b93aa8`)
- **GitHub Dependabot** triage requires fixes via `package.json` `overrides`
  (including nested), then push the lockfile to trigger rescan;
  dismissed_comment has 280-char limit (memory "Dependabot Triage Flow")
- **Codex CLI** has Windows path issues with HEREDOC + working_dir — use direct
  quoting with forward slashes (memory "Codex CLI")

## Commits & Active Workstreams (last 20 commits, 2026-04-04 → 2026-04-07)

Inferred current focus areas:

- **Sensitivity analysis** — multiple commits adding stress/two-way/one-way
  panels (`9e134b5f`, `bc592b38`, `7633fb51`, `3a6fe301`, `2772dce9`,
  `e4707353`)
- **Test rehabilitation** — orphaned test rescue (`01b87889`), perf threshold
  tuning (`ea2b3abb`), Monte Carlo timeout bumps (`517025e3`)
- **Variance refactor** — extracting `remaining-capital` helper (`eb4822d8`)
- **Vite 6 upgrade fallout** — pdfTheme circular import fix (`18b93aa8`), vite
  override bumps in agent packages (`1e4506c3`)
- **Plan-doc reconciliation** — 1C.2/1C.3 status (`643713b8`), backtesting P1
  debt tracking (`32950abf`)
- **REFL additions** — REFL-034 subagent fabrication, REFL-035 defensive grep
  (`62ab3e0c`)

## Subagent Permission Limitation (this session)

**Note about this very mapping run:** the GSD `gsd-codebase-mapper` subagents
were unable to complete because the session permission mode denies `Write` and
`Bash` to subagents. Only the orchestrator's tool calls succeed. This is not a
code defect — it's a runtime permission posture. If the user wants future
`/gsd-map-codebase` runs to use parallel agents, those tools must be approved at
the session level. Sequential mapping (this run) works, just slower.
