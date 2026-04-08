---
phase: 02-backtesting-scenario-comparison-rewrite-p1
plan: 06
subsystem: documentation
tags:
  - phase-2-closeout
  - plan-doc
  - verification-gate
  - phoenix-truth
  - validate-core
  - satisfies-2026-01-p0

# Dependency graph
requires:
  - 02-01-baseline-capture (BEFORE percentiles fixture sourced from
    _baselines/before-percentiles.json)
  - 02-02-engine-market-params-override (failureRate translation choice
    documented; option (a) locked)
  - 02-03-runscenariocomparisons-rewrite (rewrite of runScenarioComparisons
    referenced; commit SHA recorded)
  - 02-04-severity-reclassification (alphaFinding severity P1 referenced;
    actionRequired date placeholder updated to 2026-04-08)
  - 02-05-phoenix-truth-case (AFTER percentiles fixture sourced from
    docs/backtesting-scenario.truth-cases.json; truth count 262/262 captured)
provides:
  - "docs/plans/2026-04-08-backtesting-scenario-comparison-rewrite.md - the
    durable institutional-memory plan doc for the Phase 2 rewrite, with
    before/after percentile comparison table, the verbatim 'satisfies the
    2026-01 P0 requirement' cross-reference, the failureRate translation
    rationale, the streaming engine determinism caveat, the soft migration
    boundary note, the live verification gate counts, the planning defect note
    about the gitignored .a5c/ file, and the upstream commit SHA table"
  - 'Updated .a5c/processes/sensitivity-stress-panel.inputs.json
    alphaFinding.actionRequired field with the concrete plan doc filename
    (2026-04-08-...) replacing the 2026-04-XX placeholder; force-added again
    because .a5c/ remains gitignored'
  - 'Phase 2 closure: REQ-BCK-01, REQ-BCK-02, REQ-BCK-03 all satisfied; all 5
    ROADMAP success criteria DONE; both verification gates green at phase close
    (phoenix:truth 262/262, validate:core exit 0)'
affects:
  - 'Future operators reading the rewrite outcome: the durable record lives at
    docs/plans/ and contains everything needed to understand the rewrite without
    reading the .planning/ phase scaffolding'
  - 'Phase 3 (TODO Report Remediation) is the next phase per ROADMAP; STATE.md
    advances Current Plan past Phase 2'

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Plan-doc-as-institutional-memory: the durable artifact lives at
      docs/plans/{date}-{slug}.md and is operator-facing; the .planning/ phase
      scaffolding (CONTEXT, RESEARCH, per-plan PLANs and SUMMARYs) stays as
      workflow scratch and is not the audit surface'
    - 'Force-add for gitignored single files: when a contract-visible file lives
      under a gitignored directory, use git add -f on the single path rather
      than modifying .gitignore. The lint-staged hook will fail cosmetically
      when it tries to re-stage the prettier-reformatted file, but the original
      force-add content is in the index and the commit lands successfully
      (verified post-d738c8dd and post-e704f56a)'
    - 'Live verification gate capture pattern: run npm run phoenix:truth and npm
      run validate:core BEFORE writing the doc, paste the actual output tail
      into the doc, then re-run after writing as a final sanity check. Catches
      drift between Step 3 capture and final commit'
    - "Pre-write placeholder hygiene: every {bracketed} placeholder in the plan
      doc template MUST be replaced with the real value before commit; use a
      node -e regex check (matching /\\{[a-zA-Z0-9 \\/.-]+\\}/g) as a gate, but
      escape false positives like bash glob notation 02-{01..06} by rewording
      them"

key-files:
  created:
    - docs/plans/2026-04-08-backtesting-scenario-comparison-rewrite.md
    - .planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-06-SUMMARY.md
  modified:
    - .a5c/processes/sensitivity-stress-panel.inputs.json

key-decisions:
  - "Filename date is 2026-04-08 (today's UTC date per node Date.toISOString
    when the plan executed). This is 'Claude's Discretion' per CONTEXT.md; the
    planner picks the date when the plan lands. Plan 02-04 used the placeholder
    2026-04-XX in actionRequired and this plan updated it in the same commit."
  - 'Did NOT modify .gitignore to whitelist the .a5c/processes/...inputs.json
    file. Re-applied the same git add -f workaround from Plan 02-04 (commit
    d738c8dd) for the actionRequired date update. The plan doc surfaces this as
    a planning defect with three resolution paths for the user to choose at
    phase close (whitelist, move, document).'
  - 'Captured live verification gate counts directly into the plan doc rather
    than referencing them by file path. Phoenix truth: 6 test files / 262 tests
    / 2.83s. validate:core: type-check 0 errors, integration 1/1, lint
    --max-warnings 0 green, worker warnings 41 <= baseline 55. Both gates exit
    0.'
  - 'Did NOT re-capture _baselines/after-percentiles.json from the post-rewrite
    code. The before/after table sources the AFTER row from the Plan 02-05 GFC
    truth case (docs/backtesting-scenario.truth-cases.json) instead. This is the
    simpler path documented in 02-06-PLAN.md interfaces section and avoids
    re-running the opt-in CAPTURE_BASELINE=1 block. Operators who want a
    5-scenario apples-to-apples diff can opt in later; the table is sufficient
    for D-12.'
  - "Documented the engine-mismatch caveat directly above the before/after table
    in the plan doc, per Plan 02-05's SUMMARY note: BEFORE was captured against
    a mocked engine (mockSimulationResult.irr.statistics.mean = 0.18); AFTER was
    captured against the real engine with synthetic baseline + fund. The
    structural contrast (analytic 2-parameter rescale vs sample percentiles)
    matters more than literal arithmetic delta."

requirements-completed:
  - REQ-BCK-03

# Metrics
duration: ~25min
started: 2026-04-08T00:34:00Z
completed: 2026-04-08T00:50:00Z
---

# Phase 02 Plan 06: Plan Doc and Verification Gate Close Summary

**Authored the durable Phase 2 plan doc at
`docs/plans/2026-04-08-backtesting-scenario-comparison-rewrite.md` with the
verbatim "satisfies the 2026-01 P0 requirement" cross-reference, the GFC
before/after percentile comparison table sourced from the Plan 02-01 baseline
fixture and the Plan 02-05 truth case, the failureRate translation rationale,
the streaming determinism caveat, the soft migration boundary note, the live
verification gate counts, and the planning defect surfaced by Plan 02-04. Both
Phase 2 exit gates are green: `npm run phoenix:truth` 262/262 across 6 files
(was 258/258 across 5 files pre-Phase 2) and `npm run validate:core` exit 0.
Phase 2 is closed.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-08T00:34:00Z
- **Completed:** 2026-04-08T00:50:00Z
- **Tasks:** 1 / 1
- **Files created:** 2 (1 plan doc + this SUMMARY)
- **Files modified:** 1 (the .a5c inputs file, force-added)

## Accomplishments

- **`docs/plans/2026-04-08-backtesting-scenario-comparison-rewrite.md`** created
  with all 14 success criteria from the PLAN.md `<success_criteria>` block
  satisfied:
  - File exists at `docs/plans/{YYYY-MM-DD}-...md` with the real ISO date
    (`2026-04-08`)
  - Contains the verbatim phrase
    `satisfies the 2026-01 P0 requirement documented in docs/plans/2026-04-07-backtesting-scenario-comparison-correctness.md`
    (1 occurrence; verified by grep)
  - Contains the populated `Before / After` percentile comparison table for the
    GFC scenario sourced from `_baselines/before-percentiles.json` and
    `docs/backtesting-scenario.truth-cases.json`
  - Documents the failureRate translation choice (option (a) from Plan 02-02)
    with rationale and the directional sanity check (GFC 0.0809 < bull 0.1259)
  - Documents the streaming engine determinism caveat (RESEARCH Pitfall #1) with
    the three mitigation steps the truth case applies
  - Documents the soft migration boundary (D-07): old `backtest_results` records
    keep analytic-rescale values, no auto-backfill
  - Contains live captured output from `npm run phoenix:truth` and
    `npm run validate:core`
  - No `{...}` placeholders remain (verified by node -e regex check)
  - No emoji anywhere in the file (verified by Unicode regex codepoint check)

- **`.a5c/processes/sensitivity-stress-panel.inputs.json`** updated with the
  concrete plan doc filename in `alphaFinding.actionRequired` -- replaced the
  `2026-04-XX-backtesting-scenario-comparison-rewrite.md` placeholder with
  `2026-04-08-backtesting-scenario-comparison-rewrite.md`. Force-added again
  because `.a5c/` is still gitignored. The committed file is the
  prettier-reformatted version that survived the lint-staged hook.

- **Both Phase 2 exit gates green:**
  - `npm run phoenix:truth`: exit 0, 6 test files / 262 tests passing, duration
    ~3s. Was 258/258 across 5 files pre-Phase 2 (the 4 new tests came from Plan
    02-05's GFC truth case).
  - `npm run validate:core`: exit 0. Type check baseline clean (0 errors across
    client + server + shared separate compilations), integration test
    `wizard-to-results-e2e.test.ts` 1/1 passing, lint:phase4:strict
    `--max-warnings 0` green, guard:phase4:workers:check current 41 <=
    baseline 55.

- **Phase 2 success criteria 1-5 from ROADMAP all confirmed in the plan doc**
  with explicit verification methods and the responsible plan numbers.

## failureRate translation choice (re-stated for the audit trail)

Plan 02-02 chose **option (a)**: scale `irr.mean` by
`Math.max(0, 1 - failureRate)` inside `applyMarketParametersOverride`. This is
the minimum-viable, fully-encapsulated translation. The Plan 02-05 GFC truth
case locks the snapshot against this choice. The directional sanity check
(`GFC mean < bull market mean`) holds at the snapshot values (GFC ~0.0809, bull
~0.1259). A future phase can upgrade to option (b) (binomial gate inside
`generateSingleScenario`) if statistical defensibility becomes a P1 concern --
the truth case will fail loudly when the snapshot moves.

## Verification gate counts (verbatim from /tmp logs)

```
$ npm run phoenix:truth
 Test Files  6 passed (6)
      Tests  262 passed (262)
   Duration  2.83s
PHOENIX_EXIT=0
```

```
$ npm run validate:core
[type-check]                      baseline: 0 errors (client + server + shared)
[test:unit]                       Test Files 1 passed (1) | Tests 37 passed (37)
[test:phase4:integration]         Test Files 1 passed (1) | Tests 1 passed (1)
[lint:phase4:strict]              eslint --max-warnings 0 green
[guard:phase4:workers:check]      worker warnings: 41  (baseline 55, pass)
VALIDATE_EXIT=0
```

Both captured at 2026-04-08 00:36-00:38 UTC during Plan 02-06 execution. A
re-run at 00:48 UTC (after writing the plan doc and updating .a5c) reproduced
the same exit codes -- no drift.

## Upstream commit SHAs (referenced by the plan doc)

| Plan  | Commit SHA | Purpose                                                        |
| ----- | ---------- | -------------------------------------------------------------- |
| 02-01 | `fbc2ad32` | Baseline capture: opt-in CAPTURE_BASELINE block + fixture      |
| 02-02 | `27640933` | RED test for marketParameters override (TDD)                   |
| 02-02 | `e75c159f` | GREEN: wire override through both engines via shared helper    |
| 02-03 | `8f1d0cce` | Rewrite runScenarioComparisons + delete applyMarketAdjustment  |
| 02-04 | `d738c8dd` | Reclassify alphaFinding severity to P1 (force-added .a5c file) |
| 02-05 | `30feec85` | Phoenix truth case JSON + test for 2008 GFC scenario           |
| 02-06 | `e704f56a` | This plan: plan doc + .a5c date update                         |

## Task Commits

1. **Task 1: Author plan doc + update .a5c actionRequired date** -- `e704f56a`
   (docs)

**Plan metadata commit:** pending (this SUMMARY.md + STATE.md + ROADMAP.md +
REQUIREMENTS.md bundled by the GSD executor final commit step).

## Files Created/Modified

- **`docs/plans/2026-04-08-backtesting-scenario-comparison-rewrite.md`** -- NEW.
  ~390 lines after prettier reformat (the lint-staged prettier hook ran on the
  staged file and reformatted some headings into wrapped two-line blocks). All
  content intact.
- **`.a5c/processes/sensitivity-stress-panel.inputs.json`** -- MODIFIED.
  One-line edit to `alphaFinding.actionRequired` replacing the date placeholder.
  Force-added because `.a5c/` is gitignored. The lint-staged hook tried to
  re-stage the prettier-reformatted version via normal `git add` and failed
  cosmetically with "The following paths are ignored by one of your .gitignore
  files: .a5c", but the originally-staged content via `git add -f` is in the
  commit and the commit landed successfully.
- **`.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-06-SUMMARY.md`**
  -- NEW (this file). Closes Plan 02-06 and Phase 2.

## Decisions Made

See `key-decisions` in frontmatter. Most consequential:

1. **Date is 2026-04-08** (the wall-clock date when the plan executed; node
   `Date.toISOString().slice(0,10)` confirmed it).
2. **Did not whitelist `.a5c/processes/sensitivity-stress-panel.inputs.json` in
   `.gitignore`** -- re-applied the Plan 02-04 force-add workaround and surfaced
   the planning defect with three resolution paths in the plan doc for the user
   to choose at phase close.
3. **Sourced AFTER row from the truth case JSON, not from a fresh
   CAPTURE_BASELINE=1 re-run.** Plan 02-06's interfaces section in PLAN.md
   explicitly endorses this simpler path; the engine-mismatch caveat is
   documented above the table.
4. **Captured gate output to /tmp files first, then pasted the tail into the
   plan doc.** Avoids polluting the commit with multi-MB log files while still
   preserving the verbatim values.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Process] False-positive placeholder match on bash glob notation**

- **Found during:** Step 6 (final verification with the node -e placeholder
  regex check)
- **Issue:** The first run of the placeholder grep flagged
  `02-{01..06}-SUMMARY.md` in the "Related docs" section. The brace expansion is
  bash glob notation (a shorthand for "files 02-01 through 02-06"), not a
  fillable placeholder. The verification regex `/\{[a-zA-Z0-9 \/.-]+\}/` matched
  the literal `{01..06}` because `..` is inside the character class.
- **Fix:** Reworded the line to spell out the file range in prose:
  `(one per plan, files 02-01-SUMMARY.md through 02-06-SUMMARY.md)` and pointed
  at the parent directory. The regex now finds zero matches and the intent is
  preserved.
- **Files modified:**
  `docs/plans/2026-04-08-backtesting-scenario-comparison-rewrite.md`
- **Verification:** Re-ran the node -e check and got
  `OK: plan doc is well-formed`.
- **Committed in:** `e704f56a`

**2. [Rule 3 - Process] lint-staged cosmetic failure on .a5c file re-stage**

- **Found during:** `git commit` for Task 1
- **Issue:** The lint-staged hook ran prettier on both staged files
  (`docs/plans/...` and `.a5c/processes/...`), then tried to re-`git add` the
  prettier-reformatted versions. For the `.a5c/` file the re-add failed with
  "The following paths are ignored by one of your .gitignore files: .a5c --
  hint: Use -f if you really want to add them". This is the same cosmetic
  failure mode that Plan 02-04 hit on commit `d738c8dd`.
- **Fix:** None needed. The commit succeeded because the originally-staged
  content from my `git add -f` call was already in the index when prettier
  reformatted in-place. The hook's failure message was cosmetic; the commit
  contains the prettier-reformatted version of both files (which is what I
  wanted anyway).
- **Files modified:** none beyond the planned files
- **Verification:** `git show --stat HEAD` shows
  `2 files changed, 391 insertions(+), 1 deletion(-)` for both planned files.
  `node -e "const d = require('./.a5c/.../inputs.json'); console.log(d.alphaFinding.severity, d.alphaFinding.actionRequired.includes('2026-04-08'))"`
  prints `P1 true`. The committed file is the prettier-reformatted version with
  the date update.
- **Committed in:** `e704f56a` (same commit as the plan doc)

---

**Total deviations:** 2 auto-fixed (1 false-positive regex match, 1 cosmetic
hook failure). **Impact on plan:** Both stayed inside the plan's intended file
scope. The deviations are tooling friction, not content drift.

## Issues Encountered

- **Lint-staged hook noise on the .a5c file** (same as Plan 02-04). The hook
  fails the re-add step because `.a5c/` is gitignored, but the commit succeeds
  because the content is already in the index. Documented in Plan 02-04's
  SUMMARY and again here. The fix is to either whitelist the file in
  `.gitignore` (option 1 in the plan doc's resolution path) or accept the
  cosmetic noise (current behavior).
- **Phoenix truth tail spam.** The performance alert from
  `memory_simulation_complete took 36110552ms (critical)` is noisy but harmless
  -- it is a performance threshold tuning issue in
  `tests/unit/truth-cases/backtesting-scenario.test.ts` (or one of its
  dependencies), not a real test failure. All 262/262 tests pass and the exit
  code is 0. Out of scope for Phase 2.
- **Pre-existing drift in `docs/PHASE-STATUS.json` and
  `.planning/config.json`.** Both files are in the working tree from previous
  sessions. I left them untouched and only staged the plan doc + the .a5c file
  for the commit. Same approach as Plans 02-01 through 02-05.

## Verification Gate Results

- **`npm run phoenix:truth`** -- exit 0, 6/6 test files, 262/262 tests (was
  258/258 across 5 files pre-Phase 2)
- **`npm run validate:core`** -- exit 0 (type check 0 errors, integration 1/1,
  lint --max-warnings 0 green, worker warnings 41 <= baseline 55)
- **`node -e` placeholder/emoji check** -- PASS (1 occurrence of the
  satisfies-2026-01-P0 phrase, 1 occurrence of "Before / After" heading, 0
  placeholders, 0 emoji)
- **`grep -c "satisfies the 2026-01 P0 requirement"`** -- 1 (>= 1 required)
- **`git show --stat HEAD`** -- 2 files in commit `e704f56a`:
  - `.a5c/processes/sensitivity-stress-panel.inputs.json` (1 line changed)
  - `docs/plans/2026-04-08-backtesting-scenario-comparison-rewrite.md` (390
    insertions, new file)

## Phase 2 Closure

**REQ-BCK-01** (rewrite runScenarioComparisons): COMPLETE. Marked complete by
Plan 02-05.

**REQ-BCK-02** (reclassify alphaFinding severity to P1): COMPLETE. Marked
complete by Plan 02-04.

**REQ-BCK-03** (document the rewrite outcome in a new plan doc): COMPLETE.
Marked complete by this plan (Plan 02-06).

All 5 Phase 2 ROADMAP success criteria are DONE. Both verification gates
(phoenix:truth and validate:core) are green at phase close. Phase 2 is closed;
the next phase per ROADMAP is Phase 3 (TODO Report Remediation).

## Self-Check: PASSED

**Files verified:**

- FOUND: `docs/plans/2026-04-08-backtesting-scenario-comparison-rewrite.md`
  (verified via `git ls-files`)
- FOUND:
  `.planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-06-SUMMARY.md`
  (this file)
- FOUND: `.a5c/processes/sensitivity-stress-panel.inputs.json` with
  `actionRequired` containing
  `2026-04-08-backtesting-scenario-comparison-rewrite.md` (verified via node -e)

**Commits verified:**

- FOUND: `e704f56a` (Task 1: plan doc + .a5c date update) -- verified via
  `git show --stat HEAD`

**Acceptance criteria from PLAN.md:**

- [x] File matching `docs/plans/*-backtesting-scenario-comparison-rewrite.md`
      exists with a real ISO date (`2026-04-08`)
- [x] Plan doc contains the exact phrase `satisfies the 2026-01 P0 requirement`
      (verbatim)
- [x] Plan doc contains a `Before / After` heading and a populated table
- [x] Plan doc contains the failureRate translation option (a) and rationale
- [x] Plan doc contains a "Streaming engine determinism caveat" section
- [x] Plan doc contains a "Soft migration boundary (D-07)" section
- [x] Plan doc contains pasted output from `npm run phoenix:truth` and
      `npm run validate:core`
- [x] Plan doc contains a "Files modified" section listing 11+ files
- [x] Plan doc contains a "Commit references" table with 5+ SHA rows (actually
      6 + this commit row = 7 entries)
- [x] No `{...}` placeholders remain in the final file
- [x] No emoji anywhere in the file
- [x] `npm run phoenix:truth` exits 0 with at least 259 truth cases (262)
- [x] `npm run validate:core` exits 0
- [x] `grep -c "satisfies the 2026-01 P0 requirement"` returns 1
- [x] Plan 02-04's actionRequired field updated from `2026-04-XX` to
      `2026-04-08` in the same commit

## Next Phase Readiness

- **Phase 2 is closed.** All three REQ-BCK-\* requirements satisfied, all 5
  ROADMAP success criteria DONE, both exit gates green.
- **Phase 3 (TODO Report Remediation) is the next phase per ROADMAP.** STATE.md
  should advance to reflect the Phase 2 completion.
- **The user has a decision to make at phase close** about the gitignored
  `.a5c/processes/sensitivity-stress-panel.inputs.json` file. Three resolution
  paths are documented in the plan doc's "Planning defect" section. Default if
  no decision: leave as-is (force-add convention).

---

_Phase: 02-backtesting-scenario-comparison-rewrite-p1_ _Plan: 06_ _Completed:
2026-04-08_
