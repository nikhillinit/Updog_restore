---
phase: 03-todo-report-remediation
plan: 01
type: docs
autonomous: true
wave: 1
depends_on: []
requirements: [REQ-TODO-01, REQ-TODO-02]
---

# Plan 03-01: Archive Stale TODO Report Remediation Docs

## Objective

Close Phase 3 (TODO Report Remediation) by archiving the two planning artifacts
that are no longer accurate against current `main`, updating active references
to point at the archived paths, marking REQ-TODO-01 and REQ-TODO-02 satisfied in
REQUIREMENTS.md with rationale, and running the Phase 3 exit gates.

This is a documentation-only plan. No code changes. No test changes. No runtime
behavior changes.

## Context

@.planning/phases/03-todo-report-remediation/03-CONTEXT.md
@.planning/REQUIREMENTS.md @.planning/ROADMAP.md @.planning/PROJECT.md
@docs/plans/2026-04-05-todo-report-remediation-strategy.md
@docs/todo-report-accuracy-review-2026-04-05.md @docs/STABILIZATION-ROADMAP.md
@docs/adr/ADR-014-snapshot-governance.md
@docs/plans/2026-03-31-variance-roadmap-revision.md

**Verification of "settled on main":**

The strategy doc's own evidence commands return the empty set against current
`main` for every "should not exist" pattern:

| Pattern                                               | Path                                           | Result                                                     |
| ----------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------- |
| `mockVarianceData` or `_reportsData`                  | `client/src`                                   | 0 hits                                                     |
| `COMING_SOON_TABS` or `planned but not yet wired`     | `client/src/pages/sensitivity-analysis.tsx`    | 0 hits                                                     |
| `Restore Unavailable` or `versioned restore workflow` | `client/src/pages/time-travel.tsx`             | 0 hits                                                     |
| `xirrNewtonBisection` (canonical XIRR)                | `server/services/actual-metrics-calculator.ts` | line 21 import + line 168 call                             |
| local IRR algorithm                                   | `server/services/metrics-aggregator.ts`        | only `targetIRR`/`expectedIRR` config fields, no algorithm |

C2 and D are explicitly settled-on-main reference lanes per the strategy doc.

## Tasks

### Task 1 — Archive both docs via `git mv`

**Type:** auto

**Action:**

1. Create `docs/archive/2026-q2/` (parent dir).
2. `git mv docs/plans/2026-04-05-todo-report-remediation-strategy.md docs/archive/2026-q2/2026-04-05-todo-report-remediation-strategy.md`
3. `git mv docs/todo-report-accuracy-review-2026-04-05.md docs/archive/2026-q2/todo-report-accuracy-review-2026-04-05.md`
4. Verify both files exist at the new path and the old paths are absent.
5. Verify `git status` shows two renames (R), not adds + deletes.
6. Commit with message:

   ```
   refactor(03-todo-report-remediation): archive todo-report-remediation strategy and audit (03-01 task 1)

   - move docs/plans/2026-04-05-todo-report-remediation-strategy.md → docs/archive/2026-q2/
   - move docs/todo-report-accuracy-review-2026-04-05.md → docs/archive/2026-q2/
   - both worktracks (A/B/C1) verified settled on current main
   - C2/D already declared settled-on-main reference lanes by the strategy doc
   - history preserved via git mv (rename, not delete + add)
   ```

**Verification:**

- `[ -f docs/archive/2026-q2/2026-04-05-todo-report-remediation-strategy.md ] && echo OK`
- `[ -f docs/archive/2026-q2/todo-report-accuracy-review-2026-04-05.md ] && echo OK`
- `[ ! -f docs/plans/2026-04-05-todo-report-remediation-strategy.md ] && echo OK`
- `[ ! -f docs/todo-report-accuracy-review-2026-04-05.md ] && echo OK`
- `git log -1 --format=%s` matches the commit message above.

### Task 2 — Update references in active docs

**Type:** auto

**Action:**

Update all references to the old paths so they point at `docs/archive/2026-q2/`.
Files to update:

1. **`.planning/ROADMAP.md`** — rewrite the Phase 3 section to reflect
   "closed-via-archive" (NOT the stale `mockVarianceData`/`_reportsData`
   wording). Update the requirements REQ-TODO-01 and REQ-TODO-02 descriptions to
   "Settled on main; planning artifacts archived to docs/archive/2026-q2/". Mark
   Phase 3 success criteria as 1 plan instead of 4. Update the Coverage
   Validation table.
2. **`.planning/REQUIREMENTS.md`** — mark REQ-TODO-01 and REQ-TODO-02 as `[x]`
   with rationale "Settled on main; planning artifacts archived to
   docs/archive/2026-q2/. See
   `.planning/phases/03-todo-report-remediation/03-CONTEXT.md` D-01 for closure
   rationale." Update the traceability table at the bottom. Update the
   source-of-truth path on the section header.
3. **`.planning/PROJECT.md`** — update the two references to the strategy doc to
   point at the archived path with a brief "settled-on-main; archived
   2026-04-08" note. Move REQ-TODO-01 and REQ-TODO-02 from Active to nothing
   (they were settled on main; do not move to Validated since the surface was
   never built — the requirements were stale before they were tracked).
4. **`docs/STABILIZATION-ROADMAP.md`** — update the
   `2026-04-05-todo-report-remediation-strategy.md` reference under the "Doc
   truthfulness remediation" bullet to point at the archived path.
5. **`docs/adr/ADR-014-snapshot-governance.md`** — update the strategy doc
   reference in § References to point at the archived path.
6. **`docs/plans/2026-03-31-variance-roadmap-revision.md`** — update the single
   reference at line 35 to point at the archived path. This doc is itself a
   HISTORICAL-FRAMEWORK doc and the link would otherwise become a broken path;
   updating it preserves link integrity.

**Verification (run after edits):**

```bash
# No active doc still references the old paths (excluding the archive itself
# and historical session reports under docs/session-learning-reports/):
grep -rn "docs/plans/2026-04-05-todo-report-remediation-strategy" \
  .planning docs --include="*.md" \
  | grep -v "docs/archive/2026-q2" \
  | grep -v "docs/session-learning-reports" \
  || echo "OK no stale refs"

grep -rn "docs/todo-report-accuracy-review-2026-04-05" \
  .planning docs --include="*.md" \
  | grep -v "docs/archive/2026-q2" \
  | grep -v "docs/session-learning-reports" \
  || echo "OK no stale refs"

# REQ-TODO-01 and REQ-TODO-02 are marked complete:
grep -n "REQ-TODO-01" .planning/REQUIREMENTS.md
grep -n "REQ-TODO-02" .planning/REQUIREMENTS.md
```

The session-learning-reports under `docs/session-learning-reports/2026-04-06.md`
and `docs/session-learning-reports/2026-04-07.md` reference the OLD strategy doc
path as historical session records and **must not** be modified — they are
correct as historical records.

**Commit:**

```
docs(03-todo-report-remediation): update references to archived todo-report-remediation docs (03-01 task 2)

- .planning/ROADMAP.md: rewrite Phase 3 section as close-via-archive
- .planning/REQUIREMENTS.md: mark REQ-TODO-01 and REQ-TODO-02 satisfied
- .planning/PROJECT.md: update strategy doc references to archive path
- docs/STABILIZATION-ROADMAP.md: update strategy doc reference to archive path
- docs/adr/ADR-014-snapshot-governance.md: update strategy doc reference
- docs/plans/2026-03-31-variance-roadmap-revision.md: update strategy doc reference
- session-learning-reports under docs/ left untouched (historical records)
```

### Task 3 — Run Phase 3 exit gates

**Type:** auto

**Action:**

Run the three Phase 3 exit gates in sequence. Each MUST exit 0.

1. `npm run check` — TypeScript baseline. Must be 0 new TS errors. Markdown
   changes should be a no-op.
2. `npm run validate:core` — primary delivery gate.
3. `npm run phoenix:truth` — calculation truth cases. Must still be 262/262.

If any gate fails, STOP and document in SUMMARY.md as a deviation. Do NOT
proceed to summary creation until all three are green.

**Verification:**

Capture exit codes and key output lines for the SUMMARY.md.

## Verification (overall)

- All 6 reference files updated (ROADMAP, REQUIREMENTS, PROJECT,
  STABILIZATION-ROADMAP, ADR-014, variance-roadmap-revision).
- 0 active references to either archived doc remain (excluding the archive copy
  itself and the two historical session-learning-reports).
- Both archived files exist at `docs/archive/2026-q2/` with `git mv` history
  preserved.
- Phase 3 exit gates green: `npm run check` exit 0, `npm run validate:core` exit
  0, `npm run phoenix:truth` exit 0 (262/262).
- 4 commits total: CONTEXT+plan, archive move, reference updates, summary
  metadata.

## Success Criteria

Same as `<success_criteria>` in the operator prompt:

- [ ] `git mv` landed both docs to `docs/archive/2026-q2/` (preserves history)
- [ ] All listed reference files updated to point at the new archive paths
- [ ] `.planning/ROADMAP.md` Phase 3 description rewritten to reflect
      close-via-archive
- [ ] REQ-TODO-01 and REQ-TODO-02 marked `[x]` in REQUIREMENTS.md with rationale
- [ ] `npm run check` exits 0
- [ ] `npm run validate:core` exits 0
- [ ] `npm run phoenix:truth` exits 0 (still 262/262)
- [ ] 4 commits landed with conventional format and `03-01` token
- [ ] SUMMARY.md created at
      `.planning/phases/03-todo-report-remediation/03-01-SUMMARY.md`
- [ ] STATE.md updated (Phase 3 marked complete)
