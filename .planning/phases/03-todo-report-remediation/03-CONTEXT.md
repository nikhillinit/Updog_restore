---
phase: 03-todo-report-remediation
status: closed-via-archive
created: 2026-04-08
closed: 2026-04-08
decisions:
  - id: D-01
    summary:
      Close Phase 3 by archiving stale planning artifacts instead of executing
      the workstreams
    rationale:
      Every worktrack from the strategy doc is already settled on main;
      verification would fabricate work
---

# Phase 3 Context — TODO Report Remediation

## Vision

Close Phase 3 cleanly without fabricating verification work.

The Phase 3 ROADMAP description was generated from outdated information. Both
REQ-TODO-01 (Workstream A: wire `_reportsData`, remove `mockVarianceData`, gate
restore UI) and REQ-TODO-02 (Workstream B) reference identifiers and components
that **do NOT exist on current `main`**. The remediation strategy doc itself has
five worktracks (A / B / C1 / C2 / D) of which:

- **A, B** verified DONE via the strategy doc's own evidence commands (zero
  matches for all "should not exist" patterns).
- **C1** verified DONE via grep — `server/services/actual-metrics-calculator.ts`
  already imports `xirrNewtonBisection` from the canonical shared XIRR;
  `server/services/metrics-aggregator.ts` only has `targetIRR` config fields, no
  local IRR algorithm.
- **C2, D** explicitly settled per the strategy doc itself ("settled-on-main
  reference lanes").

## Decisions

### D-01 — Close-via-archive

**Decision:** Close Phase 3 by archiving the two stale planning artifacts
(`docs/plans/2026-04-05-todo-report-remediation-strategy.md` and
`docs/todo-report-accuracy-review-2026-04-05.md`) into `docs/archive/2026-q2/`,
update active references to point at the archived paths, mark REQ-TODO-01 and
REQ-TODO-02 as satisfied with the rationale "Settled on main; planning artifacts
archived to docs/archive/2026-q2/", and run the standard exit gates
(`npm run check`, `npm run validate:core`, `npm run phoenix:truth`).

**Rationale:**

1. The two docs no longer describe reality. Leaving them on the active planning
   surface would mislead any future reader who lands on them.
2. They are not deletable: ADR-014 cites the strategy doc as a reference for
   snapshot governance, and the variance roadmap revision links to it as the
   handoff for Phase 0.P remediation tail. History must be preserved.
3. `git mv` into `docs/archive/2026-q2/` preserves history and lets active
   references be updated to the archived path with one round of edits.
4. There is no executable work left. Running the strategy doc's evidence
   commands against current `main` returns the empty set for every "should not
   exist" pattern. Phase 3 has no real work to do.

**Alternatives considered:**

- **Execute the workstreams as written.** Rejected — there is nothing to
  execute; mockVarianceData and `_reportsData` do not exist on `main`.
- **Delete the docs outright.** Rejected — ADR-014 and the variance roadmap
  revision link to them; deletion creates unresolvable history gaps.
- **Leave the docs in place but mark them stale in a banner.** Rejected —
  banners drift; archiving is the established convention
  (`docs/archive/2026-q1/`, `docs/archive/m7-cleanup/`).

## Constraints

- Archive ONLY the two named docs. **Do NOT** archive
  `docs/plans/2026-03-31-variance-roadmap-revision.md` — it is referenced by
  multiple sibling plan docs and must stay in `docs/plans/` as the historical
  framework.
- Use `git mv` (preserve history). Never `cp + rm`.
- Update references in: `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`,
  `.planning/PROJECT.md`, `docs/STABILIZATION-ROADMAP.md`,
  `docs/adr/ADR-014-snapshot-governance.md`, and
  `docs/plans/2026-03-31-variance-roadmap-revision.md` (the one in-doc link that
  would otherwise become a broken path).
- `docs/INDEX.md` does **not** reference the strategy doc — verified by grep, no
  edit required.
- Conventional commits with `03-todo-report-remediation` phase scope and `03-01`
  plan token.
- Phase 3 exit gates: `npm run check`, `npm run validate:core`, and
  `npm run phoenix:truth` must all exit 0. Phoenix should still be 262/262.

## Success Criteria

1. Both docs moved to `docs/archive/2026-q2/` via `git mv` (history preserved).
2. All active references updated to the new archive paths; no broken links to
   the moved docs.
3. ROADMAP Phase 3 description rewritten to reflect close-via-archive (no stale
   `mockVarianceData`/`_reportsData` wording).
4. REQ-TODO-01 and REQ-TODO-02 marked `[x]` in REQUIREMENTS.md with rationale.
5. `npm run check` exits 0 (markdown changes only — should be a no-op).
6. `npm run validate:core` exits 0.
7. `npm run phoenix:truth` exits 0 (still 262/262).
8. SUMMARY.md created at
   `.planning/phases/03-todo-report-remediation/03-01-SUMMARY.md`.
