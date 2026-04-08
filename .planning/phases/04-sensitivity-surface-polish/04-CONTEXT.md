# Phase 4: Sensitivity Surface Polish - Context

**Gathered:** 2026-04-08 **Status:** Ready for planning **Mode:** `--auto` — all
gray areas auto-selected with recommended defaults.

<domain>
## Phase Boundary

Finalize the sensitivity analysis surface trio (one-way / two-way / stress) that
landed across the recent commit burst (`9e134b5f`, `bc592b38`, `7633fb51`,
`2772dce9`, `e4707353`, `3a6fe301`). Verify the panels share polish, the engines
map errors consistently, integration tests cover the routes end-to-end, and
capture any new patterns into a REFL.

## Drift findings during scout (2026-04-08)

The ROADMAP description for Phase 4 was generated against an older snapshot.
Several claims are stale or misleading:

1. **"REFL-033 is already this surface"** — FALSE.
   `docs/skills/REFL-033-defensive-grep-before-destructive-action.md` is about
   defensive grep / planning-doc drift, not the sensitivity surface. No existing
   REFL covers the sensitivity surface. Phase 4 will add `REFL-037` (the next
   sequential number; latest is REFL-036).

2. **"Add `tests/integration/sensitivity-routes.test.ts` if missing"** —
   confirmed missing. ROADMAP success criterion 3 requires it.

3. **The surface is NOT bare** — these already exist and are passing on `main`:
   - `client/src/pages/sensitivity-analysis.tsx` (4-tab layout: Monte Carlo,
     One-Way, Two-Way, Stress)
   - `client/src/components/sensitivity/{OneWayPanel,TwoWayPanel, StressPanel,_shared}.tsx`
   - `server/routes/sensitivity.ts` (with `STATUS_BY_CODE` error mapping at
     lines 34-41 — 6 codes including the ENGINE_FAILURE catch-all)
   - `server/services/{one-way,two-way}-sensitivity-engine.ts`,
     `stress-test-engine.ts`, `sensitivity-run-service.ts`
   - `tests/unit/routes/sensitivity-routes-error-mapping.test.ts` (already
     covers the route-level error mapping)
   - `tests/unit/components/sensitivity/{OneWayPanel,TwoWayPanel, StressPanel}.test.tsx`
     (panel-level component tests)
   - `tests/unit/pages/sensitivity-analysis.test.tsx` (page-level test)

   The actual gap is at the INTEGRATION layer — there is no test that exercises
   a real Express request through the routes, the services, the engines, and
   back. Plus the formal "polish consistency" audit and the REFL capture.

</domain>

<decisions>
## Implementation Decisions

### Integration test coverage (success criterion 3)

- **D-01:** Add a single integration test file
  `tests/integration/sensitivity-routes.test.ts` covering all three sensitivity
  endpoints with at least one happy-path + one error-path test each. Six tests
  minimum.
  - **Recommended pattern:** mock-DB integration test (same as the unit layer)
    that mounts `server/routes/sensitivity.ts` on a fresh Express app instance,
    exercises the route handlers via `supertest`, and asserts the responses. NOT
    a full server-spawn integration test. Avoids the REFL-024 cascade failure
    mode AND the integration runner overhead — these tests can run against the
    unit harness.
  - Rationale: the existing
    `tests/unit/routes/sensitivity-routes-error-mapping.test.ts` already proves
    the mapping at the unit layer; the integration test proves the end-to-end
    request → engine → response shape works without the unit test's mock seams.
  - **Auto-selected recommended option:** mock-DB integration tests via
    supertest, NOT full server spawn.

### Panel and engine polish consistency (success criteria 1 + 2)

- **D-02:** Treat success criteria 1 and 2 as **VERIFY-AND-DOCUMENT** rather
  than implement-and-fix. The researcher's scout confirms the 3 panels and 3
  engines exist; the planner's job is to read all 6 files end-to-end and
  document any inconsistencies. If gaps are minor (consistent loading skeleton
  vs subtle visual variation), tighten in the same plan. If gaps are major (one
  engine raises raw `Error`, two raise `SensitivityEngineError`), that's a
  separate plan.
  - **Auto-selected recommended option:** read-only audit first; only fix what's
    strictly necessary for "the three engines map errors to HTTP status codes
    consistently" (success criterion 1) and "the three panels share polish"
    (success criterion 2).

### REFL capture (success criterion 4)

- **D-03:** Add a new REFL at `docs/skills/REFL-037-*.md` (the next sequential
  number) capturing the patterns the surface uses. Candidate topics — researcher
  picks during scout, planner picks final scope:
  - Dynamic-import seam in route handlers (`await import('../services/...')`)
    that lets unit tests substitute via `vi.mock` against the resolved specifier
  - The `STATUS_BY_CODE` mapping pattern + the comment-anchored "add here AND in
    the test file" discipline
  - The 4-tab page composition pattern (Tabs > TabsList > TabsContent children
    that lazy-render via component)
  - The `_shared/formatters.ts` + `SummaryCard` reuse across all 3 panels
  - Whatever else stands out during the audit

  - **Auto-selected recommended option:** dynamic-import seam pattern (it's the
    most reusable — applies to ANY future route module that needs `vi.mock`
    substitution).

### Verification gates (success criterion 4 — partial)

- **D-04:** Run `npm run validate:core` AND `scripts/check-orphan-tests.mjs`
  (the pre-push orphan-test hook) before closing the phase. Phoenix truth cases
  should still be 262/262 — Phase 4 does not touch calc paths, so it's a
  pass-through.
  - The new integration test file MUST live under `tests/integration/` not
    `__tests__/` per REFL-036.

### Claude's Discretion (planner decides)

- **Truth case shape** — none required. Phase 4 is not a calc-path rewrite; the
  existing 262 truth cases are sufficient.
- **Specific assertions in the new integration tests** — planner picks based on
  what `STATUS_BY_CODE` actually contains and what the engines actually throw.
  Researcher provides the file:line references.
- **REFL topic precise framing** — researcher recommends, planner finalizes.
- **Panel/engine fix scope IF inconsistencies are found** — planner decides
  whether to bundle into the polish plan or split.

</decisions>

<canonical_refs>

## Canonical References

### Files the planner MUST read

- `client/src/pages/sensitivity-analysis.tsx` (52 lines, 4-tab layout)
- `client/src/components/sensitivity/OneWayPanel.tsx`
- `client/src/components/sensitivity/TwoWayPanel.tsx`
- `client/src/components/sensitivity/StressPanel.tsx`
- `client/src/components/sensitivity/_shared/index.ts`
- `client/src/components/sensitivity/_shared/formatters.ts`
- `client/src/components/sensitivity/_shared/SummaryCard.tsx`
- `server/routes/sensitivity.ts` (especially lines 34-41 STATUS_BY_CODE)
- `server/services/one-way-sensitivity-engine.ts`
- `server/services/two-way-sensitivity-engine.ts`
- `server/services/stress-test-engine.ts`
- `server/services/sensitivity-run-service.ts`
- `tests/unit/routes/sensitivity-routes-error-mapping.test.ts` (existing
  error-mapping unit test — the integration test should cover the SAME status
  codes from the request side)
- `tests/unit/components/sensitivity/OneWayPanel.test.tsx`
- `tests/unit/components/sensitivity/TwoWayPanel.test.tsx`
- `tests/unit/components/sensitivity/StressPanel.test.tsx`
- `tests/unit/pages/sensitivity-analysis.test.tsx`

### Quality gates

- `npm run check` — 0 new TS errors
- `npm run phoenix:truth` — must remain 262/262 (Phase 4 does not touch calc
  paths)
- `scripts/check-orphan-tests.mjs` — new test must be under `tests/integration/`
  not `__tests__/`

### Existing patterns from the codebase

- `tests/integration/backtesting-api.test.ts` — template for an integration test
  that mocks the underlying service and exercises the Express route layer
  end-to-end
- `tests/integration/portfolio-schema.spec.ts` — template for an integration
  test that uses the real `db` import directly
- Phase 1 / Phase 2 SUMMARY files for the conventional commit shape and the
  SUMMARY structure

### REFL discipline

- `docs/skills/REFL-036-silent-test-discovery-loss-from-tests-dirs.md` — most
  recent REFL; use as a shape reference
- `cheatsheets/INDEX.md` — REFL is the right artifact for non-derivable pattern
  capture; cheatsheets are for derivable conventions

</canonical_refs>

<deferred>

## Deferred Ideas

- **Panel visual regression tests** — out of scope; would require a visual diff
  harness the project doesn't currently use.
- **End-to-end browser tests** for the sensitivity workflow — out of scope; the
  unit + integration coverage is sufficient for Phase 4.
- **Engine performance benchmarks** — out of scope; engines are already in the
  perf budget.
- **Multiple REFLs** — one is enough. If the audit surfaces multiple distinct
  patterns worth capturing, the planner picks the most reusable and notes the
  rest as "candidate REFLs" in SUMMARY.md for follow-up.

</deferred>

---

_Phase: 04-sensitivity-surface-polish_ _Context gathered: 2026-04-08 via
`--auto` mode (no interactive questioning — all gray areas auto-selected with
recommended defaults)._
