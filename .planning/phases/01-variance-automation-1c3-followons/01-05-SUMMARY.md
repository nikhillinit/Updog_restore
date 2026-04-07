---
phase: 01-variance-automation-1c3-followons
plan: 01-05
subsystem: variance-automation
status: complete
completed: 2026-04-07
tags:
  - documentation
  - exit-gates
  - phase-closeout
  - validate-core
  - phoenix-truth
requires:
  - 01-01 (leader table schema)
  - 01-02 (lease manager + planner gate)
  - 01-03 (unit tests)
  - 01-04 (integration test)
provides:
  - Backlog doc decision trail for D-05/D-06/D-07
  - Phase 1 exit-gate verification (validate:core + phoenix:truth)
  - Phase 1 success criteria 1-4 confirmation
affects:
  - docs/plans/2026-04-07-phase-1c3-variance-automation-followons-backlog.md
key_files:
  modified:
    - docs/plans/2026-04-07-phase-1c3-variance-automation-followons-backlog.md
decisions:
  - Frontmatter last_updated already 2026-04-07; no frontmatter mutation needed
    (Plan Edit 4 was a no-op since the file was already authored today).
  - Item A status note added as a new subsection AFTER the existing "Approximate
    scope when acted on" bullets and BEFORE the Item B heading, preserving the
    historical "when we deferred this from 1C.2" context.
metrics:
  duration_minutes: 8
  tasks_completed: 2
  files_modified: 1
  files_created: 0
  commits: 1
  validate_core_exit: 0
  phoenix_truth_exit: 0
  phoenix_truth_count: 258
---

# Plan 01-05: Backlog Doc + Phase 1 Verification — SUMMARY

## Phase 1 one-liner

Documented the Phase 1 decision trail (D-05/D-06/D-07) in the 1C.3 backlog doc
and ran both Phase 1 exit gates (`validate:core`, `phoenix:truth`) — both green.

## What was built

Three precise edits to
`docs/plans/2026-04-07-phase-1c3-variance-automation-followons-backlog.md` plus
two exit-gate runs. No source files modified, no new files created.

## The three doc edits

### Edit 1 — Item A status note (D-07: Item A SHIPPED)

Added a new `**Status (2026-04-07, Phase 1):**` subsection AFTER the existing
"Approximate scope when acted on" bullets in the
`### Item A: Planner Loop Leader Election` section. The note marks Item A as
SHIPPED and captures the full decision trail from 01-CONTEXT.md:

- D-01: heartbeat table (`variance_planner_leader`), not advisory locks (Neon
  PgBouncer transaction-mode incompatibility) and not Redis (split-brain +
  `memory://` fallback drift)
- D-02: 10-minute lease, 2.5-minute renewal, env-tunable via
  `VARIANCE_PLANNER_LEASE_MS` and `VARIANCE_PLANNER_RENEWAL_MS`
- D-03: single global leader across all frequencies
- D-04: planner-only gate (`runProcessorCycle` + `recoverStaleProcessingJobs`
  unchanged for resilience)
- Crash-takeover proof: in-process integration test using lease fast-forward, no
  child process per REFL-024
- Pointer to phase directory for full decision trail

### Edit 2 — Item B trigger restated (D-05)

Replaced the original `**Trigger to act:**` line in
`### Item B: Auto-Resolve Superseded Baseline-Scoped Incidents` with a new
`**Trigger to act (restated 2026-04-07, Phase 1 decision trail — see D-05):**`
line that:

- Restates the three OR-conditions verbatim from D-05
- Notes that no signal was observed in the 2026-03/2026-04 commit stream
- References commit `b8d3bd60` as the holding read-side filter
- Explicitly marks Item B as re-deferred from Phase 1 (M8 1C.3 follow-ons)

### Edit 3 — Item C trigger restated (D-06)

Replaced the original `**Trigger to act:**` line in
`### Item C: Move Scheduler To Dedicated Worker Process` with a new
`**Trigger to act (restated 2026-04-07, Phase 1 decision trail — see D-06):**`
line that:

- Restates the three OR-conditions verbatim from D-06
- Notes that no scale pressure, topology change, or restart correctness issue
  was observed in 2026-03/2026-04
- References Item A (SHIPPED) as the scaffolding this item will build on
- Explicitly marks Item C as re-deferred from Phase 1

### Edit 4 — frontmatter (no-op)

The plan instructed updating `last_updated: 2026-04-07` to today's date. The
file was already authored today (`last_updated: 2026-04-07`), so no mutation was
needed. Documented as a no-op rather than touching the line for nothing.

## Diff stat

```
docs/plans/2026-04-07-phase-1c3-variance-automation-followons-backlog.md
  | 35 ++++++++++++++++++----
  1 file changed, 30 insertions(+), 5 deletions(-)
```

Three content blocks changed. No other lines modified. Prettier-clean.

## Acceptance grep results (Task 1)

| Pattern                                       | Expected | Actual | PASS |
| --------------------------------------------- | -------- | ------ | ---- |
| `Status (2026-04-07, Phase 1)`                | 1        | 1      | yes  |
| `SHIPPED`                                     | >= 1     | 2      | yes  |
| `VARIANCE_PLANNER_LEASE_MS`                   | 1        | 1      | yes  |
| `restated 2026-04-07, Phase 1 decision trail` | 2        | 2      | yes  |
| `D-05`                                        | >= 1     | 1      | yes  |
| `D-06`                                        | >= 1     | 1      | yes  |
| Emoji unicode (1F300-1FAFF, 2600-27BF)        | 0        | 0      | yes  |
| `npx prettier --check`                        | exit 0   | exit 0 | yes  |

## Phase 1 exit gates (Task 2)

### `npm run validate:core` — PASSED (exit 0)

Full chain:
`baseline:check && test:publish-orchestration && test:phase4 && lint:phase4`

Last lines from
`.planning/phases/01-variance-automation-1c3-followons/_logs/validate-core.log`:

```
> rest-express@1.3.2 test:phase4:client
 Test Files  1 passed (1)
      Tests  37 passed (37)
   Duration  10.32s

> rest-express@1.3.2 test:phase4:integration
 Test Files  1 passed (1)
      Tests  1 passed (1)
   Duration  22.29s

> rest-express@1.3.2 lint:phase4
> rest-express@1.3.2 lint:phase4:strict (no errors)
> rest-express@1.3.2 guard:phase4:workers:check
[phase4-worker-eslint-ratchet] worker warnings: 41
[phase4-worker-eslint-ratchet] pass: current 41 <= baseline 55
```

All sub-gates green:

- `baseline:check` — PASS (TypeScript baseline holds at 0 new errors)
- `test:publish-orchestration` — PASS
- `test:phase4:server` — PASS
- `test:phase4:client` — PASS (37/37)
- `test:phase4:integration` — PASS (1/1)
- `lint:phase4:strict` — PASS (eslint --max-warnings 0 on the Phase 4 file set)
- `guard:phase4:workers:check` — PASS (41 worker warnings <= baseline 55)

**No stale-baseline remediation was required.** The baseline was already
current; no `node scripts/typescript-baseline.cjs save` invocation was made
during this plan.

### `npm run phoenix:truth` — PASSED (exit 0)

```
> rest-express@1.3.2 phoenix:truth
> cross-env TZ=UTC vitest run tests/unit/truth-cases/

 Test Files  5 passed (5)
      Tests  258 passed (258)
   Duration  4.55s
```

**Live Phoenix truth case count: 258** (across 5 truth-case files:
`exit-recycling.test.ts`, `xirr.test.ts`, `runner.test.ts`,
`capital-allocation.test.ts`, plus one more in the suite). Per CLAUDE.md
governance, this is the authoritative count from the live run, not a hardcoded
number from any doc.

## Files modified across all 5 Phase 1 plans

| Plan  | File                                                                       | Status   |
| ----- | -------------------------------------------------------------------------- | -------- |
| 01-01 | `shared/schema.ts`                                                         | modified |
| 01-01 | `server/db/migrations/0011_variance_planner_leader.sql`                    | created  |
| 01-01 | `server/db/migrations/rollback/0011_variance_planner_leader_down.sql`      | created  |
| 01-01 | `scripts/check-leader-table.mjs`                                           | created  |
| 01-02 | `server/services/variance-alert-automation.ts`                             | modified |
| 01-03 | `tests/unit/services/variance-alert-automation.test.ts`                    | modified |
| 01-04 | `tests/integration/variance-planner-leader-election.test.ts`               | created  |
| 01-05 | `docs/plans/2026-04-07-phase-1c3-variance-automation-followons-backlog.md` | modified |

Plus 5 PLAN.md files and 5 SUMMARY.md files in
`.planning/phases/01-variance-automation-1c3-followons/` (this SUMMARY is the
last). The orchestrator-applied 0011 migration is the only schema change in the
live DB.

## Constraint files confirmed unchanged

Verified via `git log --oneline -n 1 <path>` and
`git diff HEAD~10..HEAD --name-only -- <pattern>`:

- `server/lib/locks.ts` — last touched in `9a2f47d1` (TS4111 refactor, unrelated
  to Phase 1). **D-01 rejection held** — advisory locks were evaluated and
  rejected for Phase 1; no Phase 1 commit modified this file.
- `server/routes.ts` — last touched in `62173d70` (backtesting consolidation,
  unrelated to Phase 1). **Constraint 11 held** — no new call site added.
- `shared/core/reserves/**` — no diffs in last 10 commits. **No calc path
  drift.**
- `server/queues/**` — no diffs in last 10 commits. **Processor enqueue path
  untouched.**
- `server/workers/**` — no diffs in last 10 commits. **Worker path untouched.**
- `runProcessorCycle` and `recoverStaleProcessingJobs` — verified unchanged in
  Plan 01-02 SUMMARY (D-04 — planner-only gate). The Plan 01-03 D-04 regression
  guard (Test 6) catches any future drift.
- `runCalcRunCompletion` — realtime alert path, never gated, untouched per Plan
  01-02 SUMMARY.
- `job_outbox` — durable boundary, untouched per Phase 1 scope (no migration, no
  schema change).

## Phase 1 success criteria — confirmation

| #   | Criterion                                                                                          | Met? | Evidence                                                                                                                                                                      |
| --- | -------------------------------------------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A single elected leader runs the variance planner loop per window; observable via metrics and logs | YES  | Plan 01-02: lease manager + planner gate; Pino events `alert.planner.leader.{elected,renewed,demoted}` at info; `getHealth().planner.{isLeader,leaseExpiresAt,lastElectedAt}` |
| 2   | Correctness preserved across leader crash mid-window, verified by integration test                 | YES  | Plan 01-04: `tests/integration/variance-planner-leader-election.test.ts` test 3 (`crash-takeover`) — fast-forward `lease_expires_at` then assert B takes over and A demotes   |
| 3   | `npm run phoenix:truth` and `npm run validate:core` green                                          | YES  | This plan, Task 2: validate:core exit 0, phoenix:truth exit 0 (258 tests)                                                                                                     |
| 4   | Items B and C either shipped, re-deferred with rationale, or split to a follow-on phase            | YES  | This plan, Task 1: D-05 re-defers Item B, D-06 re-defers Item C, both with full rationale recorded in the backlog doc                                                         |

**All four Phase 1 success criteria are satisfied.**

## REQ traceability

| REQ-ID     | Where validated                                                                      |
| ---------- | ------------------------------------------------------------------------------------ |
| REQ-VAR-01 | Plan 01-01 + 01-02 + 01-03 + 01-04 (Item A SHIPPED, leader election + tests)         |
| REQ-VAR-02 | This plan, Edit 2 (Item B re-deferred per D-05 with 2026-04-07 trail in backlog doc) |
| REQ-VAR-03 | This plan, Edit 3 (Item C re-deferred per D-06 with 2026-04-07 trail in backlog doc) |

All three Phase 1 requirements have shipped artifacts. REQ-VAR-02 and REQ-VAR-03
are documentation-only per the discuss-phase decision trail (D-05/D-06).

## Deviations from Plan

### Edit 4 — frontmatter no-op

**Plan said:** Change `last_updated: 2026-04-07` to today's date. If today is
not 2026-04-07, use today's date.

**Actual:** No mutation. The file already had `last_updated: 2026-04-07` and
today IS 2026-04-07 (per environment context). No-op recorded explicitly so a
future reader does not wonder why the diff has no frontmatter line.

This is not a Rule 1/2/3 deviation — it is the plan literally requesting no
change because the date matches.

### Migration apply path (inherited from Plan 01-01)

The plan instructed running
`npm run db:push && node scripts/check-leader-table.mjs`. Plan 01-01 already
documented why this deviated to a direct `pg.Client` apply: drizzle-kit push
surfaced an interactive prompt asking whether to rename `drizzle_migrations`
into `cohort_definitions`, which would have destroyed the Drizzle migration
tracker. Plan 01-05 inherits that decision — no further `db:push` invocation was
attempted in this plan.

## Authentication gates

None. Both `validate:core` and `phoenix:truth` are local-only and required zero
auth.

## Verification performed

- `npx prettier --check docs/plans/2026-04-07-phase-1c3-variance-automation-followons-backlog.md`
  -> exit 0
- 7 acceptance grep checks against the backlog doc -> all PASS
- `git diff --stat docs/plans/2026-04-07-phase-1c3-variance-automation-followons-backlog.md`
  -> `1 file changed, 30 insertions(+), 5 deletions(-)` (matches expected
  three-block change)
- `git status --short` -> only the backlog doc + pre-existing untracked
  `.planning/config.json`; no collateral drift
- `npm run validate:core` -> exit 0 (full log at
  `.planning/phases/01-variance-automation-1c3-followons/_logs/validate-core.log`
  — gitignored on-disk artifact, not committed)
- `npm run phoenix:truth` -> exit 0 (full log at
  `.planning/phases/01-variance-automation-1c3-followons/_logs/phoenix-truth.log`
  — gitignored on-disk artifact, not committed)
- Constraint files unchanged via git log + git diff (locks.ts, routes.ts,
  shared/core/reserves/, server/queues/, server/workers/)
- Pre-commit hook (eslint --fix --max-warnings 0 + prettier --write + emoji
  scan + bigint safety) -> PASS
- Conventional commit format -> PASS

## Commit

`13b80c4f` -- docs(01-variance-automation-1c3-followons): update 1C.3 backlog
doc per D-05/D-06/D-07 (01-05 task 1)

(Task 2 was verification-only with no file mutations; no separate commit.)

## Self-Check

- [x] All three doc edits applied (Item A status, Item B trigger, Item C
      trigger)
- [x] Frontmatter no-op documented (file already dated 2026-04-07)
- [x] All 7 acceptance grep checks pass
- [x] Prettier-clean
- [x] No emoji
- [x] `npm run validate:core` exit 0
- [x] `npm run phoenix:truth` exit 0 (258 tests)
- [x] No collateral file drift
- [x] `server/lib/locks.ts` unchanged (D-01 rejection held)
- [x] `server/routes.ts` unchanged (constraint 11 held)
- [x] No `shared/core/reserves/`, `server/queues/`, or `server/workers/` drift
- [x] No stale-baseline remediation required
- [x] Conventional commit with phase scope + 01-05 token (`13b80c4f`)
- [x] All four Phase 1 success criteria confirmed satisfied
- [x] All three Phase 1 REQ-VAR-\* requirements traced to shipped artifacts

## What this unblocks

**Phase 1 is COMPLETE.** All four success criteria are satisfied. All three
Phase 1 requirements (REQ-VAR-01, REQ-VAR-02, REQ-VAR-03) have shipped
artifacts. The next action is the Phase 1 verifier subagent (per
`.planning/config.json` `workflow.verifier: true`), followed by
`/gsd-transition` to advance to Phase 2 (Backtesting Scenario Comparison Rewrite
— P1, REQ-BCK-01..03).

## Self-Check: PASSED

All items above verified. Commit `13b80c4f` is on `main`. Backlog doc reflects
D-05/D-06/D-07. Both exit gates green. Phase 1 is structurally complete.
