# Requirements — Updog Cleanup and Decay Reduction (M9 — v1.1)

> **Scope:** This document lists the **active** v1 requirements for the current
> milestone (M9 — v1.1 Cleanup and Decay Reduction). Validated requirements from
> prior milestones (including M8) live in `PROJECT.md` § Validated for
> institutional memory.
>
> Generated 2026-04-08 by `/gsd-new-milestone` after M8 closed.

## v1.1 Requirements (M9 active backlog)

### Test Hygiene Resurrection

Source: M8 leftovers and discovery during the M9 milestone-summary pass.

- [ ] **REQ-TEST-01**: Re-enable `tests/integration/fund-idempotency.spec.ts`.
      Currently in `vitest.config.int.ts` exclude list with the original
      cascade-failure comment that no longer applies. The cascade was fixed by
      the global-setup migration months ago (REFL-024); the exclusion is dead
      weight. Acceptance: the file is removed from the exclude list, the test
      runs in the integration suite, and either it passes (free win) or any
      failure is diagnosed and either fixed or re-excluded with a NEW comment
      that describes the actual current failure mode (not the stale REFL-024
      reference).

- [ ] **REQ-TEST-02**: Fix the slow-test threshold warning in
      `tests/unit/truth-cases/backtesting-scenario.test.ts`. The
      `memory_simulation_complete took 36110552ms (critical)` warning is a
      misconfigured threshold; the test passes in well under a second.
      Documented as out-of-scope for Phase 2 in `02-06-SUMMARY.md` § "Issues
      Encountered". Acceptance: the warning no longer prints during
      `npm run phoenix:truth`, the threshold reflects actual measured runtime +
      reasonable headroom, and the truth-case suite still exits 0.

### Schema, Docs, and Baseline Drift Cleanup

Source: Plan 01-01 SUMMARY follow-up flag, M8 milestone summary discovery, and a
baseline mismatch surfaced while scoping this milestone.

- [ ] **REQ-DRIFT-01**: Reconcile `shared/schema.ts` against the live Neon
      endpoint. Plan 01-01 surfaced this when `npm run db:push` prompted to
      rename `drizzle_migrations` into `cohort_definitions` — symptom of the
      schema referencing tables that do not exist in the live DB. Per-table
      decision required for each phantom table (`scenario_matrices`,
      `optimization_sessions`, `cohort_definitions`, plus any others surfaced by
      a fresh `db:push --dry-run`-style pass). Each phantom table is resolved by
      ONE of: (a) create the table in the live DB via a new hand-written
      migration; (b) delete from `shared/schema.ts` if no code references it;
      (c) gate behind a feature flag if it's planned for a future phase.
      Acceptance: a follow-up `db:push --dry-run` (or equivalent schema
      introspection) reports zero unexpected creates AND zero rename prompts;
      `npm run check` stays at 0 errors; no runtime regressions.

- [ ] **REQ-DRIFT-02**: Remove hardcoded Phoenix truth case counts from docs;
      replace with pointers to `npm run phoenix:truth` for the live count. Two
      historical snapshots disagree (118/118 vs 107/107 vs the current 262/262);
      CLAUDE.md memory note "Phoenix truth case count is in drift" already warns
      against quoting numbers from docs. Acceptance: a grep for hardcoded
      `\d+/\d+` truth-case counts across `docs/`, `cheatsheets/`, `README*`, and
      `CLAUDE.md` returns only the live-command pointer (or the count is
      captured in a generated file that the live command refreshes).

- [ ] **REQ-DRIFT-03**: Update `CLAUDE.md` baseline numbers to match the actual
      `.baselines/` files. Current claims are stale by ~10x: CLAUDE.md says "374
      / 132 baselines" but `.baselines/console-prod-baseline.json` is **39** and
      `.baselines/eslint-file-disable-baseline.json` is **29**. The claim of
      "~400 baselined `any` violations" should become **363** per
      `.baselines/eslint-output.json`. Acceptance: CLAUDE.md numbers match what
      `node -e "console.log(require('./.baselines/console-prod-baseline.json').total)"`
      and the equivalent for the eslint-disable baseline return on the day of
      the commit.

### Bounded Debt Drawdown

Source: stale numbers in CLAUDE.md inflated the perceived size of this backlog.
Real numbers are small enough to halve in a single phase.

- [ ] **REQ-DEBT-01**: Halve the console baseline from **39 → ≤19** (drop ≥20).
      Source of truth: `.baselines/console-prod-baseline.json` (currently
      `total: 39`, all of which are `console.log`). Approach: replace with the
      existing Pino logger child where the call site already has logger access;
      delete entries that are dead code; convert one-shot bootstrap diagnostics
      to structured logs. Acceptance: regenerate the baseline
      (`npm run baseline:console:save` or equivalent), the new total is ≤19, and
      `npm run validate:core` stays green.

- [ ] **REQ-DEBT-02**: Halve the file-level `eslint-disable` baseline from **29
      → ≤14** (drop ≥15). Source of truth:
      `.baselines/eslint-file-disable-baseline.json` (currently `total: 29`).
      Approach: open each file in the baseline, identify the rule that triggered
      the disable, and either fix the underlying issue or convert the file-level
      disable to a tighter line-level `eslint-disable-next-line` with a comment
      explaining why. Acceptance: regenerate the baseline, the new total is ≤14,
      and `npm run lint` exits clean.

- **EXPLICITLY NOT in scope:** the **363** explicit-`any` baseline drawdown.
  That is its own milestone-sized fight (the baseline is ~10x larger than the
  console + eslint-disable baselines combined) and conflating the two would blow
  M9's scope. Captured in v2 for follow-up.

## v2 Requirements (deferred — known but not committed)

These remain visible so they are not lost. Same shape as the M8 v2 list, trimmed
for items M9 absorbs.

- **`any` type drawdown** — the 363 explicit-`any` baseline. Separate
  milestone-sized effort.
- **Variance 1C.3 Item B** (auto-resolve superseded baseline-scoped incidents) —
  re-deferred from M8 per `01-CONTEXT.md` D-05; trigger documented in
  `docs/plans/2026-04-07-phase-1c3-variance-automation-followons-backlog.md`.
- **Variance 1C.3 Item C** (move scheduler to dedicated worker process) —
  re-deferred from M8 per `01-CONTEXT.md` D-06; the M8 leader-election shipped
  in Phase 1 is the scaffolding this item will build on when its trigger fires.
- **Vite 6 audit sweep** — speculative dependency-cruiser pass for latent
  circulars across PDF and chart modules. One known issue (`pdfTheme`) was
  already fixed; revisit when a real second issue surfaces.
- **`.a5c/processes/sensitivity-stress-panel.inputs.json` whitelist decision** —
  Phase 2 used `git add -f` workaround. 30-min decision, not a milestone item;
  resolve inline whenever it next becomes friction.
- **Phoenix truth case count reconciliation** — partially absorbed by
  REQ-DRIFT-02 above; the deeper "audit historical snapshots and reconcile" work
  stays deferred.
- **LP portal expansion / KPI manager / Compass productionization** — archived
  secondary surfaces. Revisit only if the perimeter is reopened by an explicit
  decision.

## Out of Scope

See `PROJECT.md` § Out of Scope for the canonical list. M9-specific exclusions
(in addition to the perimeter exclusions):

- The 363 explicit-`any` drawdown (separate milestone-sized fight)
- Adding any new product surfaces
- Reopening any of M8's re-deferred items (REQ-VAR-02, REQ-VAR-03)
- Anything in the historical "Out of Scope" perimeter list (LP / KPI / Compass /
  client-owned lifecycle / removing validate:core / greenfield engine rewrites /
  mocking the DB in schema-dependent tests / emoji)

## Traceability (filled by roadmap)

| REQ-ID       | Phase | Status |
| ------------ | ----- | ------ |
| REQ-TEST-01  | 5     | Active |
| REQ-TEST-02  | 5     | Active |
| REQ-DRIFT-01 | 6     | Active |
| REQ-DRIFT-02 | 6     | Active |
| REQ-DRIFT-03 | 6     | Active |
| REQ-DEBT-01  | 7     | Active |
| REQ-DEBT-02  | 7     | Active |

100% of v1.1 requirements mapped to a phase. Phase numbers continue from M8
(which used 1-4); M9 starts at 5.

---

_Generated 2026-04-08 by `/gsd-new-milestone` after M8 closed clean (all 11 v1
requirements satisfied). Phase numbering continues from M8. Research was
intentionally skipped — M9 is cleanup of known items, no domain learning
needed._
