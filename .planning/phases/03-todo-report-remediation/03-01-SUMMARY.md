---
phase: 03-todo-report-remediation
plan: 01
subsystem: docs
tags: [archive, planning, requirements, governance, close-via-archive]

# Dependency graph
requires:
  - phase: 02-backtesting-scenario-comparison-rewrite-p1
    provides:
      clean main with all code changes shipped; no remaining work in client/src
      for the original Phase 3 worktracks
provides:
  - Phase 3 closed via archive — REQ-TODO-01 and REQ-TODO-02 marked satisfied
    with rationale
  - docs/archive/2026-q2/ created as the Q2 2026 archive subdirectory
  - Stale planning artifacts removed from active surface, history preserved
  - Active references in 6 docs updated to point at archived paths
affects:
  - Phase 4 (Sensitivity Surface Polish) — unblocked as the next phase
  - Future planners reading docs/plans/ — no longer encounter the stale TODO
    report strategy doc

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Close-via-archive: when planning artifacts no longer describe reality and
      have no executable work, archive them with git mv (preserves history) and
      update active references rather than deleting or executing fabricated work'

key-files:
  created:
    - .planning/phases/03-todo-report-remediation/03-CONTEXT.md
    - .planning/phases/03-todo-report-remediation/03-01-archive-stale-docs-PLAN.md
    - .planning/phases/03-todo-report-remediation/03-01-SUMMARY.md
    - docs/archive/2026-q2/2026-04-05-todo-report-remediation-strategy.md
    - docs/archive/2026-q2/todo-report-accuracy-review-2026-04-05.md
  modified:
    - .planning/ROADMAP.md
    - .planning/REQUIREMENTS.md
    - .planning/PROJECT.md
    - docs/STABILIZATION-ROADMAP.md
    - docs/adr/ADR-014-snapshot-governance.md
    - docs/plans/2026-03-31-variance-roadmap-revision.md

key-decisions:
  - 'D-01: Close Phase 3 via archive instead of executing the workstreams. Every
    worktrack from the strategy doc (A, B, C1) is verified settled on current
    main; C2 and D were declared settled-on-main reference lanes by the strategy
    doc itself. There is no executable work left.'
  - 'Archive both docs into docs/archive/2026-q2/ via git mv to preserve rename
    history rather than delete + create'
  - 'Update one historical-framework doc
    (2026-03-31-variance-roadmap-revision.md) to fix the in-doc link, even
    though it was not in the strict update list, to prevent link rot'
  - 'Leave docs/session-learning-reports/2026-04-06.md and 2026-04-07.md
    untouched — they are historical session records and the old paths are
    correct as historical references'

patterns-established:
  - 'Close-via-archive: planning artifacts that no longer describe reality on
    main are moved to docs/archive/<quarter>/ with git mv, references in active
    docs are updated, and the requirements they tracked are marked satisfied
    with explicit rationale'
  - 'Archive subdirectory format: docs/archive/<year>-q<n>/ (created
    docs/archive/2026-q2/ as the first Q2 2026 archive)'

requirements-completed: [REQ-TODO-01, REQ-TODO-02]

# Metrics
duration: 14 min
completed: 2026-04-08
---

# Phase 3 Plan 01: Archive Stale TODO Report Remediation Docs Summary

**Closed Phase 3 via archive — both TODO report remediation planning artifacts
moved to `docs/archive/2026-q2/`, all 6 active reference files updated,
REQ-TODO-01 and REQ-TODO-02 marked satisfied with closure rationale, and all
three Phase 3 exit gates green (262/262 Phoenix truth, 0 TS errors,
validate:core clean).**

## Performance

- **Duration:** 14 min
- **Started:** 2026-04-08T01:57:08Z
- **Completed:** 2026-04-08T02:11:00Z
- **Tasks:** 3 (archive, references, exit gates)
- **Files modified:** 6 active docs + 2 archive renames + 3 phase artifacts

## Accomplishments

- Archived `docs/plans/2026-04-05-todo-report-remediation-strategy.md` and
  `docs/todo-report-accuracy-review-2026-04-05.md` into `docs/archive/2026-q2/`
  via `git mv` (100% similarity rename, history preserved)
- Updated 6 active reference files to point at the new archived paths:
  `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `.planning/PROJECT.md`,
  `docs/STABILIZATION-ROADMAP.md`, `docs/adr/ADR-014-snapshot-governance.md`,
  `docs/plans/2026-03-31-variance-roadmap-revision.md`
- Rewrote `.planning/ROADMAP.md` Phase 3 section as
  `[CLOSED 2026-04-08 — close-via-archive]`, removing the stale
  `mockVarianceData`/`_reportsData` wording and reducing plan count from 4 to 1
- Marked REQ-TODO-01 and REQ-TODO-02 as `[x]` in REQUIREMENTS.md and PROJECT.md
  with explicit closure rationale referencing `03-CONTEXT.md` D-01
- All three Phase 3 exit gates green: `npm run check` 0 TS errors,
  `npm run validate:core` 37/37 unit + 1/1 integration, `npm run phoenix:truth`
  262/262 across 6 files
- Created `docs/archive/2026-q2/` as the first Q2 2026 archive subdirectory

## Task Commits

Each task was committed atomically:

1. **Task 0 (CONTEXT + plan creation)** — `e85cc90d` (docs)
   - `.planning/phases/03-todo-report-remediation/03-CONTEXT.md`
   - `.planning/phases/03-todo-report-remediation/03-01-archive-stale-docs-PLAN.md`
2. **Task 1 (archive both docs via git mv)** — `98563f09` (refactor)
   - rename `docs/plans/2026-04-05-todo-report-remediation-strategy.md` →
     `docs/archive/2026-q2/`
   - rename `docs/todo-report-accuracy-review-2026-04-05.md` →
     `docs/archive/2026-q2/`
3. **Task 2 (update references in 6 files)** — `a067ad08` (docs)
   - 6 files modified, +122/-79 lines
4. **Task 3 (run Phase 3 exit gates)** — no commit; verification only. All three
   gates exit 0
5. **Plan metadata (this SUMMARY)** — pending; will be committed after
   self-check

## Files Created/Modified

### Created

- `.planning/phases/03-todo-report-remediation/03-CONTEXT.md` — phase context
  with D-01 close-via-archive decision
- `.planning/phases/03-todo-report-remediation/03-01-archive-stale-docs-PLAN.md`
  — single-plan archive execution spec
- `.planning/phases/03-todo-report-remediation/03-01-SUMMARY.md` — this file
- `docs/archive/2026-q2/2026-04-05-todo-report-remediation-strategy.md` —
  archived (was `docs/plans/`)
- `docs/archive/2026-q2/todo-report-accuracy-review-2026-04-05.md` — archived
  (was `docs/`)

### Modified

- `.planning/ROADMAP.md` — Phase 3 section rewritten as close-via-archive (1
  plan, no stale wording); Coverage Validation table unchanged (REQ-TODO-01/02
  still mapped to Phase 3)
- `.planning/REQUIREMENTS.md` — REQ-TODO-01 and REQ-TODO-02 marked `[x]` with
  closure rationale; section header marked
  `[SETTLED ON MAIN — closed via Phase 3 archive 2026-04-08]`; traceability
  table updated
- `.planning/PROJECT.md` — REQ-TODO-01 and REQ-TODO-02 marked `[x]` with closure
  rationale referencing the archive path
- `docs/STABILIZATION-ROADMAP.md` — strategy doc reference under "Doc
  truthfulness remediation" updated to archive path with `CLOSED 2026-04-08`
  marker
- `docs/adr/ADR-014-snapshot-governance.md` — § References updated to point at
  archived strategy doc path
- `docs/plans/2026-03-31-variance-roadmap-revision.md` — Phase 0.P Cleanup
  bullet rewritten with settled-on-main language; link updated to archive path
  (this is a HISTORICAL-FRAMEWORK doc, but the link would otherwise become
  broken — fixed proactively to prevent link rot)

## Decisions Made

### D-01 — Close-via-archive

**Decision:** Close Phase 3 by archiving the two stale planning artifacts rather
than executing the workstreams.

**Rationale:**

1. **No executable work remains.** Direct grep verification on current `main`:
   - `mockVarianceData` or `_reportsData` in `client/src` → 0 hits
   - `COMING_SOON_TABS` or `planned but not yet wired` in
     `client/src/pages/sensitivity-analysis.tsx` → 0 hits
   - `Restore Unavailable` or `versioned restore workflow` in
     `client/src/pages/time-travel.tsx` → 0 hits
   - `xirrNewtonBisection` in `actual-metrics-calculator.ts` → present at line
     21 (canonical XIRR import) and line 168 (call site)
   - local IRR algorithm in `metrics-aggregator.ts` → 0 hits (only
     `targetIRR`/`expectedIRR` config fields)
2. **The strategy doc itself declared C2 and D "settled-on-main reference
   lanes"** — only A, B, and C1 were ever proposed as executable, and all three
   are now done.
3. **Docs cannot be deleted** — ADR-014 cites the strategy doc for snapshot
   governance, and the variance roadmap revision links to it as the Phase 0.P
   remediation handoff. Archiving preserves history.
4. **Banners drift** — leaving the docs in place with a "stale" banner would
   mislead future readers. The established convention (`docs/archive/2026-q1/`,
   `docs/archive/m7-cleanup/`) is to move stale planning artifacts into
   `docs/archive/`.

**Alternatives considered:**

- Execute the workstreams as written → rejected (nothing to execute)
- Delete the docs → rejected (history loss; broken refs in ADR-014 and variance
  roadmap)
- Mark stale in-place with a banner → rejected (banners drift; archive
  convention is established)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated
`docs/plans/2026-03-31-variance-roadmap-revision.md` link to prevent broken
path**

- **Found during:** Task 2 (reference updates)
- **Issue:** This historical-framework doc references the strategy doc at line
  35 ("Worktrack A/B of `2026-04-05-todo-report-remediation-strategy.md`").
  After the `git mv` in Task 1, the link path would become broken. The operator
  constraints listed only
  ROADMAP/REQUIREMENTS/PROJECT/STABILIZATION-ROADMAP/ADR-014/INDEX as files to
  update — `2026-03-31-variance-roadmap-revision.md` was NOT in that list.
- **Fix:** Updated the single line 33-35 reference to point at
  `docs/archive/2026-q2/2026-04-05-todo-report-remediation-strategy.md` and
  rewrote the bullet to use settled-on-main language consistent with the rest of
  the closure narrative. The doc retains its HISTORICAL-FRAMEWORK status; only
  the link was fixed, not the framing.
- **Files modified:** `docs/plans/2026-03-31-variance-roadmap-revision.md`
- **Verification:**
  `grep -rn "docs/plans/2026-04-05-todo-report-remediation-strategy" .planning docs --include="*.md"`
  returns only the expected files (Phase 3 CONTEXT/PLAN/SUMMARY, the archive
  copy itself, and the two session-learning-reports which are historical and
  intentionally untouched)
- **Committed in:** `a067ad08` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking, technically link-rot prevention)
**Impact on plan:** Trivial — the deviation is a single in-doc link update on a
HISTORICAL-FRAMEWORK doc that would otherwise have a broken reference. No scope
creep, no behavior change. The fix aligns with the spirit of "no broken
references after archive" even though the doc was not in the strict update list.

## Issues Encountered

None. All three exit gates green on first run.

## Authentication Gates

None. No external services were touched.

## User Setup Required

None - documentation-only closure.

## Known Stubs

None - this is a documentation-only plan; no UI wiring or data sources are
involved.

## Next Phase Readiness

- **Phase 3 is CLOSED.** No follow-up work needed.
- **Phase 4 (Sensitivity Surface Polish) is unblocked** and ready to
  discuss/plan via `/gsd-discuss-phase 4` or `/gsd-plan-phase 4`.
- The two archived docs remain accessible at `docs/archive/2026-q2/` for
  historical reference. ADR-014 and the variance roadmap revision now link to
  the archived paths.
- All 11 v1 requirements from REQUIREMENTS.md still mapped to phases;
  REQ-TODO-01 and REQ-TODO-02 are now marked `[x]` (settled on main,
  closed-via-archive). Remaining active requirements: REQ-VAR-01 (Phase 1 —
  pending), REQ-BCK-02 (Phase 2 — gitignored config file defect, separate from
  Phase 2 closure), REQ-SENS-01..03 (Phase 4 — pending).

## Self-Check: PASSED

- All 5 created files exist on disk:
  - `.planning/phases/03-todo-report-remediation/03-CONTEXT.md` FOUND
  - `.planning/phases/03-todo-report-remediation/03-01-archive-stale-docs-PLAN.md`
    FOUND
  - `.planning/phases/03-todo-report-remediation/03-01-SUMMARY.md` FOUND
  - `docs/archive/2026-q2/2026-04-05-todo-report-remediation-strategy.md` FOUND
  - `docs/archive/2026-q2/todo-report-accuracy-review-2026-04-05.md` FOUND
- Both old paths absent:
  `docs/plans/2026-04-05-todo-report-remediation-strategy.md` gone,
  `docs/todo-report-accuracy-review-2026-04-05.md` gone
- All 3 task commits exist in `git log`: `e85cc90d` (CONTEXT+plan), `98563f09`
  (archive moves), `a067ad08` (reference updates)
- All 3 Phase 3 exit gates exit 0:
  - `npm run check`: 0 TS errors (baseline 0, current 0)
  - `npm run validate:core`: 37/37 unit tests + 1/1 integration test,
    lint:phase4:strict 0 warnings, worker warnings 41 ≤ baseline 55
  - `npm run phoenix:truth`: 6 test files, 262/262 tests passed

---

_Phase: 03-todo-report-remediation_ _Completed: 2026-04-08_
