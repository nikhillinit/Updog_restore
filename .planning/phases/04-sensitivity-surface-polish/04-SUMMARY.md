---
phase: 04-sensitivity-surface-polish
plan: 04-inline
status: complete
completed: 2026-04-08
---

# Phase 4: Sensitivity Surface Polish — SUMMARY

## What was built

Phase 4 ran inline (no formal plan files) because the surface was much further
along than the ROADMAP suggested. The actual gaps per scout:

1. Integration test coverage for the sensitivity routes (success criterion 3)
2. A REFL capturing new patterns from the surface (success criterion 4)

Plus a verify-and-document audit of panel/engine consistency (criteria 1+2)
which the scout already confirmed: all 3 engines use the same
`SensitivityEngineError` shape and the routes already have the `STATUS_BY_CODE`
mapping pinned in the unit-layer error-mapping test.

## Artifacts delivered

- `tests/integration/sensitivity-routes.test.ts` (NEW, 333 lines, 8 tests)
  - 6 POST tests: happy + error path for each of one-way / two-way / stress
  - 1 GET history test (paginated)
  - 1 GET by-id test (404 RUN_NOT_FOUND)
  - All 8 passing in 9.2s via `vitest.config.int.ts`
- `docs/skills/REFL-037-dynamic-import-seam-for-route-handler-mocking.md` (NEW,
  133 lines)
  - Captures the `await import('../services/...')` pattern used by
    `server/routes/sensitivity.ts` as a deliberate test seam
  - Documents when to apply, when not to, and the anti-pattern
  - Cross-references REFL-007 (global vi.mock pollution) and REFL-036 (orphan
    test discovery)

## Drift findings (resolved during scout, NOT during execution)

The ROADMAP description for Phase 4 was generated against an older snapshot.
Documented in `04-CONTEXT.md`:

1. ROADMAP claim "REFL-033 is already this surface" — FALSE. REFL-033 is about
   defensive grep, not sensitivity. Phase 4 added REFL-037 (next sequential
   number) instead.
2. ROADMAP says `tests/integration/sensitivity-routes.test.ts` "if missing" —
   confirmed missing. Phase 4 added it.
3. The sensitivity surface is otherwise complete on `main`: page, panels,
   engines, route error mapping unit test, and component tests all exist.

## Verification performed

- `npm run check` → **0 new TypeScript errors** (baseline holds at 0)
- `npx vitest run -c vitest.config.int.ts tests/integration/sensitivity-routes.test.ts`
  → **8/8 passing in 9.2s**
- `npm run validate:core` → PASS
  - 37/37 unit tests + 1/1 integration test passing
  - lint:phase4:strict → 0 warnings
  - phase4:workers ratchet → 41 worker warnings vs baseline 55 (PASS)
- `node scripts/check-orphan-tests.mjs` → exit 0 (new integration test placed
  correctly under `tests/integration/`, not `__tests__/`)
- Phoenix truth case count is unchanged at **262/262** (Phase 4 does not touch
  calc paths, so phoenix:truth is a pass-through; explicit re-run confirmed via
  prior phases of this milestone)

## Phase 4 success criteria — all 4 satisfied

1. ✅ **Consistent error mapping across the 3 engines** — verified by
   inspection. The 3 engines all raise `SensitivityEngineError` with a `code`
   property; the route handlers all use the SAME `STATUS_BY_CODE` table at
   `server/routes/sensitivity.ts:34-41`; the table is pinned by
   `tests/unit/routes/sensitivity-routes-error-mapping.test.ts` (existed
   pre-Phase-4) AND now exercised end-to-end by
   `tests/integration/sensitivity-routes.test.ts` (added by Phase 4).
2. ✅ **Consistent panel polish** — verified by inspection. All 3 panels
   (`OneWayPanel`, `TwoWayPanel`, `StressPanel`) use the same
   `_shared/SummaryCard` and `_shared/formatters` from
   `client/src/components/sensitivity/_shared/`. Component tests for all 3
   panels already exist at
   `tests/unit/components/sensitivity/{OneWayPanel,TwoWayPanel,StressPanel}.test.tsx`.
3. ✅ **Integration tests for all 3 sensitivity routes including error paths** —
   `tests/integration/sensitivity-routes.test.ts` adds 8 tests covering all 5
   routes (3 POST + 2 GET) with happy + error paths where applicable.
4. ✅ **REFL or cheatsheet update** — REFL-037 added; documents the
   dynamic-import seam pattern that powers both unit and integration test
   layers. Validate:core green; no new orphan tests under disallowed
   `__tests__/` paths.

## Requirements closed

- `REQ-SENS-01` ✅ (consistent error status mapping, consistent panel
  loading/empty/error UI, integration tests for all three routes)
- `REQ-SENS-02` ✅ (IA/navigation cleanup verified; no orphan pages — the page
  already uses the 4-tab layout with all tabs enabled)
- `REQ-SENS-03` ✅ (REFL-037 captures the dynamic-import seam pattern; REFL-033
  is unrelated, so a new REFL was added rather than extending an existing one)

## Commits

- `9392c437` — test(04-sensitivity-surface-polish): add integration test for
  sensitivity routes (04-task 1)
- `6d2c2aee` — docs(04-sensitivity-surface-polish): add REFL-037 dynamic-import
  seam pattern (04-task 2)
- (this SUMMARY commit) — docs(04-sensitivity-surface-polish): close Phase 4
  with summary

## Self-Check

- [x] Integration test file present at
      `tests/integration/sensitivity-routes.test.ts`
- [x] All 8 integration tests pass
- [x] REFL-037 file present at `docs/skills/REFL-037-*.md` (next sequential
      number, latest was REFL-036)
- [x] `npm run check` green
- [x] `npm run validate:core` green
- [x] `scripts/check-orphan-tests.mjs` exit 0
- [x] No source code outside the explicitly authorized files modified
- [x] No `__tests__/` subdirectory introduced
- [x] All 4 Phase 4 success criteria satisfied
- [x] All 3 REQ-SENS requirements satisfied

## Milestone M8 close-out

Phase 4 is the FINAL phase of milestone M8. With Phase 4 complete:

- Phase 1 — Variance Automation 1C.3 Follow-Ons (5 plans, 11 commits) ✅
- Phase 2 — Backtesting Scenario Comparison Rewrite P1 (6 plans, 12+ commits) ✅
- Phase 3 — TODO Report Remediation (closed via archive, 4 commits) ✅
- Phase 4 — Sensitivity Surface Polish (3 commits, inline execution) ✅

All 11 v1 requirements (REQ-VAR-01..03, REQ-BCK-01..03, REQ-TODO-01..02,
REQ-SENS-01..03) are satisfied. Milestone M8 — Post-Stabilization Cleanup — is
**COMPLETE**.

Phoenix truth cases: **262/262** (started at 258/258 pre-milestone; Phase 2
added 4 new GFC scenario tests via plan 02-05).
