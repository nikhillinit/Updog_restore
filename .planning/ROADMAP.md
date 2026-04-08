# Roadmap — Updog Cleanup and Decay Reduction (Milestone M9 — v1.1)

> **3 phases** | **7 requirements mapped** | All v1.1 requirements covered ✓
>
> Generated 2026-04-08 from `REQUIREMENTS.md`. Coarse granularity per
> `.planning/config.json`. Phase numbering continues from M8 (which used phases
> 1-4) → M9 starts at phase 5.

## Milestone Context

**Milestone M9 — v1.1 Cleanup and Decay Reduction**

Goal: pay down accumulated decay (test hygiene, schema/docs drift, lint
baselines) without adding new product surfaces. M8 closed clean on 2026-04-08
with all 11 v1 requirements satisfied; M9 keeps the codebase healthy before the
next feature push.

Exit gate: all 7 v1.1 REQs validated (moved to `PROJECT.md` § Validated), all
three phase verifiers passing, no regression in `validate:core` /
`phoenix:truth`, lint baselines reduced as targeted, no new orphan tests.

## Phase Overview

| #   | Phase                                    | Goal                                                                                                             | Requirements                             | Success Criteria | Touched code paths                                                                                                             |
| --- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 5   | Test Hygiene Resurrection                | Re-enable a dormant integration test and silence a misconfigured slow-test threshold warning                     | REQ-TEST-01, REQ-TEST-02                 | 3                | `vitest.config.int.ts`, `tests/integration/fund-idempotency.spec.ts`, `tests/unit/truth-cases/backtesting-scenario.test.ts`    |
| 6   | Schema, Docs, and Baseline Drift Cleanup | Reconcile `shared/schema.ts` against the live Neon endpoint; fix doc references that lie about reality           | REQ-DRIFT-01, REQ-DRIFT-02, REQ-DRIFT-03 | 4                | `shared/schema.ts`, `server/db/migrations/`, `CLAUDE.md`, `docs/**`, `cheatsheets/**`                                          |
| 7   | Bounded Debt Drawdown                    | Halve the console and file-level eslint-disable baselines. Explicitly NOT touching the 363 explicit-any baseline | REQ-DEBT-01, REQ-DEBT-02                 | 3                | `server/services/**`, `client/src/**`, `.baselines/console-prod-baseline.json`, `.baselines/eslint-file-disable-baseline.json` |

## Phase Details

### Phase 5: Test Hygiene Resurrection

**Goal:** Re-enable the `fund-idempotency.spec.ts` integration test that was
disabled with the original REFL-024 cascade comment (no longer applies after the
global-setup migration), and fix the noisy slow-test threshold warning in the
backtesting scenario truth-case suite. Both items were deferred from M8 with
explicit pointers in the M8 summary.

**Requirements:**

- REQ-TEST-01 — Re-enable `tests/integration/fund-idempotency.spec.ts`
- REQ-TEST-02 — Fix the slow-test threshold warning in
  `tests/unit/truth-cases/backtesting-scenario.test.ts`

**Background:** REQ-TEST-01 is a free-win-or-bug-discovery item. The original
exclusion comment cited REFL-024 (the per-file integration test server spawn
cascade) which was fixed in 2026-03 by the global-setup migration. Either the
test now just works, OR it surfaces a real bug that's been hiding for months —
either outcome is valuable. REQ-TEST-02 is pure cosmetic noise: the test passes
in well under a second but a misconfigured threshold prints a
`took 36110552ms (critical)` warning every run, polluting `phoenix:truth`
output. Plan 02-06 SUMMARY explicitly flagged it as out-of-scope for M8.

**Touchpoints:**

- `vitest.config.int.ts` — exclude list (remove the `fund-idempotency.spec.ts`
  entry; verify no other entries are stale)
- `tests/integration/fund-idempotency.spec.ts` — actual test file (may need
  small fixes if it surfaces a real failure)
- `tests/unit/truth-cases/backtesting-scenario.test.ts` — the slow-test
  threshold setup
- Tests: the file under test IS the test; no new test files unless a real
  failure surfaces

**Success criteria (3):**

1. `tests/integration/fund-idempotency.spec.ts` is no longer in the
   `vitest.config.int.ts` exclude list and the test file is exercised by
   `npx vitest run -c vitest.config.int.ts` (visible in the run output).
2. `npm run phoenix:truth` no longer prints the
   `memory_simulation_complete took 36110552ms (critical)` warning, and the
   truth-case suite still exits 0 with 262/262 passing.
3. `npm run validate:core` is green; no new orphan tests under disallowed
   `__tests__/` paths.

**UI hint:** no

**Phoenix-specific:** Phase 5 does not touch calc paths, so `phoenix:truth` is a
pass-through. Just verify the suite still exits 0 after the threshold fix.

**Plans:** 2 plans

Plans:

- [ ] 05-01-PLAN.md — Fix trackMemoryUsage bytes-as-duration bug in
      server/middleware/performance-monitor.ts (REQ-TEST-02)
- [ ] 05-02-PLAN.md — Unquarantine tests/integration/fund-idempotency.spec.ts
      and branch on outcome (REQ-TEST-01)

### Phase 6: Schema, Docs, and Baseline Drift Cleanup

**Goal:** Reconcile `shared/schema.ts` against the live Neon endpoint
(eliminating the phantom-table landmine surfaced by Plan 01-01), remove
hardcoded Phoenix truth-case counts from documentation, and update CLAUDE.md
baseline numbers to match reality.

**Requirements:**

- REQ-DRIFT-01 — Reconcile `shared/schema.ts` against live Neon endpoint
- REQ-DRIFT-02 — Remove hardcoded Phoenix truth-case counts from docs
- REQ-DRIFT-03 — Update CLAUDE.md baseline numbers (374→39, 132→29, ~400→363)

**Background:** Plan 01-01 (Phase 1 of M8) discovered that `shared/schema.ts`
references several tables that do not exist in the live Neon endpoint
(`scenario_matrices`, `optimization_sessions`, `cohort_definitions`, possibly
more). Today nothing crashes because no live code path queries them, but the day
someone writes a feature that does, it explodes at runtime. The user-facing
symptom Plan 01-01 hit was `npm run db:push` prompting to rename
`drizzle_migrations` into `cohort_definitions` — destructive if answered wrong.
Phase 6 makes a per-table decision for each phantom and stops the landmine from
being live. The doc-drift items (REQ-DRIFT-02 and REQ-DRIFT-03) ride along
because they share the same surface and are cheap.

**Touchpoints:**

- `shared/schema.ts` — phantom table definitions (delete or keep)
- `server/db/migrations/` — possibly new hand-written migration if any phantom
  table is decided to live in the live DB
- `shared/schema-lp-reporting.ts`, `shared/schema-lp-sprint3.ts` — sibling
  schema files; verify no phantoms live there too
- `CLAUDE.md` — three numbers to update (console / eslint-disable / any)
- `docs/**`, `cheatsheets/**`, `README*`, `.planning/codebase/**` — grep for
  hardcoded `\d+/\d+` truth-case counts and replace with live-command pointer
- Tests: any test that currently relies on a phantom table existing (planner
  verifies via grep before touching the schema)

**Success criteria (4):**

1. A schema-introspection pass against the live Neon endpoint reports zero
   unexpected creates AND zero rename prompts. No phantom tables remain in
   `shared/schema.ts` (or all phantoms have a corresponding live-DB migration).
2. A grep for hardcoded Phoenix truth-case counts (regex `\d+/\d+ truth`,
   `phoenix.*\d{2,3}/\d{2,3}`, etc.) returns only deliberate references to the
   live command output, not committed numbers.
3. CLAUDE.md baseline section reflects the actual numbers from
   `.baselines/console-prod-baseline.json` (39),
   `.baselines/eslint-file-disable-baseline.json` (29), and the current
   explicit-`any` count (363 per `.baselines/eslint-output.json`).
4. `npm run check` exits 0; `npm run validate:core` exits 0;
   `npm run phoenix:truth` stays at 262/262 (or whatever the live count is on
   the day Phase 6 lands).

**UI hint:** no

**Phoenix-specific:** Phase 6 does not touch calc paths but it DOES touch
`shared/schema.ts`, which is a Drizzle source-of-truth file. Run `phoenix:truth`
after schema changes as a regression check, even though calc paths shouldn't be
affected.

### Phase 7: Bounded Debt Drawdown

**Goal:** Halve the two smaller lint baselines (console: 39 → ≤19, file-level
eslint-disable: 29 → ≤14). Explicitly NOT touching the 363 explicit-`any`
baseline — that is its own milestone-sized fight.

**Requirements:**

- REQ-DEBT-01 — Halve the console baseline (39 → ≤19)
- REQ-DEBT-02 — Halve the file-level eslint-disable baseline (29 → ≤14)

**Background:** Phase 7 is intentionally last because it is the most expandable
and the lowest-risk. If Phases 5 and 6 ate more than expected, we can shrink
Phase 7's targets without losing anything. If they left time on the table, Phase
7 absorbs it cleanly (e.g., go past the halve target). The baselines are smaller
than CLAUDE.md claimed (Phase 6 fixes the doc); the real numbers make halving
them a single-day exercise.

**Touchpoints:**

- `server/services/**` — primary console.log location
- `client/src/**` — primary file-level eslint-disable location
- `.baselines/console-prod-baseline.json` — regenerated at end of phase
- `.baselines/eslint-file-disable-baseline.json` — regenerated at end of phase
- Pino logger: `server/lib/logger.ts` (or wherever the project's child-logger
  factory lives) — used as the replacement for console.log in server code

**Success criteria (3):**

1. `node -e "console.log(require('./.baselines/console-prod-baseline.json').total)"`
   prints a number ≤19 (down from 39), and the regenerated baseline is
   committed.
2. `node -e "console.log(require('./.baselines/eslint-file-disable-baseline.json').total)"`
   prints a number ≤14 (down from 29), and the regenerated baseline is
   committed.
3. `npm run validate:core` exits 0; `npm run lint` exits clean; the 363
   explicit-`any` baseline is **unchanged** (verified by an explicit read of the
   eslint output before/after).

**UI hint:** no

**Phoenix-specific:** Phase 7 does not touch calc paths (server/services
includes some calc-adjacent code, but the console replacements are
log-statement-level, not algorithm-level). Run `phoenix:truth` as a pass-through
verification.

---

## Coverage Validation

| REQ-ID       | Phase | Validated |
| ------------ | ----- | --------- |
| REQ-TEST-01  | 5     | ✓         |
| REQ-TEST-02  | 5     | ✓         |
| REQ-DRIFT-01 | 6     | ✓         |
| REQ-DRIFT-02 | 6     | ✓         |
| REQ-DRIFT-03 | 6     | ✓         |
| REQ-DEBT-01  | 7     | ✓         |
| REQ-DEBT-02  | 7     | ✓         |

**Coverage: 7/7 v1.1 requirements mapped to a phase.**

## Phase Sequencing Rationale

1. **Phase 5 first (Test Hygiene):** If the dormant test surfaces a real bug,
   that may dictate Phase 6 priorities (e.g., if the bug is in a schema-touching
   path, the schema reconciliation might need to handle it). Doing this first
   gives Phase 6 the most up-to-date context.
2. **Phase 6 second (Drift Cleanup):** Highest-risk phase (touches
   `shared/schema.ts` which can have ripple effects). Doing it second lets Phase
   5 prove the workflow on a less-risky change first. Also, the CLAUDE.md
   baseline update in REQ-DRIFT-03 unblocks Phase 7 by giving it the correct
   starting numbers.
3. **Phase 7 last (Debt Drawdown):** Most expandable, lowest-risk. If the first
   two phases ate more than expected, Phase 7's targets can shrink without
   losing milestone scope. If time is left over, Phase 7 absorbs it cleanly by
   going past the halve target.

Each phase ends with `npm run validate:core` green. Phases 5-6 explicitly re-run
`npm run phoenix:truth` even though they don't touch calc paths.

---

_Generated 2026-04-08 by `/gsd-new-milestone`. Run `/gsd-discuss-phase 5` to
begin Phase 5, or `/gsd-plan-phase 5` to skip discussion._
