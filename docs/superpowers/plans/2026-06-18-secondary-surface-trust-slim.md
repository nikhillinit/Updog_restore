# Secondary-Surface Trust (Solo Slim) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the app from presenting mock/fallback/sample data as real fund
data, and prevent recurrence — sized for a solo developer on an internal team
tool, not a multi-team SaaS.

**Architecture:** Reuse the production-safety primitives shipped in PR #879
(build-time bundle verifier + `import.meta.env.DEV` build exclusion) and extend
them to the remaining mock-backed surfaces. Then move financial trust from UI
convention into a shared provenance contract. Governance ceremony (10-field
policy registry, CODEOWNERS, security-matrix docs, telemetry gates, identifier
renames) is intentionally **cut** as YAGNI for a single-owner internal tool.

**Tech Stack:** React 18 + Vite/Rollup (build-time tree-shaking via
`import.meta.env.DEV`), TypeScript strict, Vitest, Zod, Drizzle. Node 20.19+.
Tests under `TZ=UTC`.

---

## Source & supersession

- **Reviews / supersedes:** `~/Downloads/updated-dev-roadmap-2026-06-18.md` (the
  full PR-A..PR-K governance proposal). That proposal's _facts_ were verified
  accurate against the repo; this plan keeps its trust/correctness spine and
  cuts the governance overhead.
- **Original safety plan:**
  `docs/superpowers/plans/2026-06-17-secondary-surface-production-safety.md` (PR
  #879 — now landed, treated here as a regression baseline).

## Current state (verified 2026-06-18, main `3a91709d`)

Landed and locked:

- **PR #879** — truthful Active Alerts (`deriveAlertSummaryState`),
  `scripts/check-prod-bundle.mjs` + `npm run build:verify` (CI hard gate), Tear
  Sheet build-excluded via `import.meta.env.DEV`, source maps opt-in
  (`VITE_SOURCEMAP`).
- **PR #880** — `closeDatabasePool()` in `server/db.ts`; `release:check` DB
  proof now passes stages 1–6 non-skipped.

Verified open facts that drive this plan (file:line):

- `scripts/check-prod-bundle.mjs:17` —
  `QUARANTINED_MODULES = ['tear-sheet-dashboard']` (single entry).
- `client/src/app/app-routes.tsx:20-25,89-92,103` — 5 mock routes are top-level
  lazy imports, registered unconditionally, no DEV gate. **They are
  nav-orphaned** (absent from `navigation-config.ts`) — reachable only by typing
  the URL, so exposure is lower than "P0," but they still ship in the bundle.
- `client/src/pages/moic-analysis.tsx:51-180` — static `moicData` is the
  **primary** render (not a fallback); `:42-45` reads `fundId` from the query
  string. `shared/contracts/fund-moic-v1.contract.ts:16-22` — response has no
  provenance field.
- `server/app.ts:43` (`makeApp`) vs `server/routes.ts:36` (`registerRoutes`) —
  two route surfaces; `server/routes/portfolio/snapshots.ts` is fully
  implemented but mounted on neither.
- `server/routes/investments.ts:128,143,181` — `/rounds` and `/cases` return
  501; no `investment_rounds` table and no `enable_investment_rounds` flag exist
  yet.
- `docs/design/audits/server-object-readiness.md:31` (task = HAS_PERSISTENCE)
  contradicts `:72` (task = NONE); line 72 is factually wrong
  (`server/routes/operating-object-tasks.ts` + migration
  `20260616_operating_object_tasks_v1.up.sql` exist and are mounted).
- `client/src/components/layout/expandable-sidebar.tsx` and
  `client/src/config/navigation.ts` — zero **production** importers; canonical
  layout uses `Sidebar` + `navigation-config.ts`. One **test** still references
  them: `tests/unit/components/layout/sidebar-navigation.test.tsx`.

## What this plan CUTS from the source proposal (YAGNI for solo/internal)

- 10-field policy registry
  (`authBoundary`/`rolePolicy`/`workflowPolicy`/`dataAuthority`/`calculationMode`/`exportPolicy`/`telemetryKey`/`owner`/`rollback`).
- CODEOWNERS entries (single owner).
- `docs/security/surface-boundary-matrix.md`.
- `isProtected` → `fundContextGuard` rename across docs/tests (pure churn, risks
  breaking green tests).
- PR-H's 8-state LP workflow FSM (keep the working draft→approved→locked).
- Telemetry / health gates (Phase 10).
- PR-J assumption/comment contracts.

## Sequenced roadmap (solo order)

| #   | PR                                  | Theme                                                                    | Detail level here | Effort      | Impact               |
| --- | ----------------------------------- | ------------------------------------------------------------------------ | ----------------- | ----------- | -------------------- |
| 1   | **Firebreaks**                      | quarantine mock routes + delete dead nav + record decision               | **FULL (below)**  | low (hours) | med-high             |
| 2   | Provenance contract                 | `shared/contracts/provenance.contract.ts` + `ProvenanceBoundary`         | stub              | med         | high                 |
| 3   | MOIC live-primary                   | delete static `moicData`, Zod-parse live data, provenance, access-denied | stub              | med         | high                 |
| 4   | Reports/cashflow/forecast trust     | per-card provenance, fallback labels, no fabricated zeros                | stub              | med         | high                 |
| 5   | Route-mount parity guard            | CI script over `app.ts`+`routes.ts`; fix `snapshots.ts` + task-doc       | stub              | low-med     | med                  |
| 6   | Investment rounds backend (ADR-023) | migration + table + routes + idempotency, flag off                       | stub (own plan)   | high        | high (product)       |
| —   | Release-gate hygiene                | scenario-release-gate teardown (#880 follow-up)                          | note below        | low         | med (unblocks proof) |

Big bets deliberately **not** in this plan unless numbers are observed wrong:
capital-allocation unit unification (6 engines), XIRR 4-impl consolidation.
Compass route wiring is governance OFF-LIMITS until Phase 3C Track B reopens —
excluded.

---

## PR-1: Firebreaks (FULLY DETAILED)

One PR, four tasks. Each is independently revertible. No user-facing nav points
at the quarantined routes (verified nav-orphaned), so this does not break
userspace.

### Task 1: Extend the bundle quarantine list (test-first)

**Files:**

- Modify: `scripts/check-prod-bundle.mjs:17`
- Test: `tests/unit/scripts/check-prod-bundle.test.mjs`

- [ ] **Step 1: Write the failing test** — append to
      `tests/unit/scripts/check-prod-bundle.test.mjs`:

```js
import { describe, it, expect } from 'vitest';
import {
  QUARANTINED_MODULES,
  findForbiddenModules,
} from '../../../scripts/check-prod-bundle.mjs';

describe('mock-route quarantine extension', () => {
  const newlyQuarantined = [
    'reserves-demo',
    'allocation-manager',
    'cash-management',
    'portfolio-analytics',
    'CapTables',
  ];

  it('lists every mock-backed route module', () => {
    for (const mod of newlyQuarantined) {
      expect(QUARANTINED_MODULES).toContain(mod);
    }
  });

  it('flags a manifest entry for each quarantined mock route', () => {
    const manifest = Object.fromEntries(
      newlyQuarantined.map((m) => [
        `pages/${m}.tsx`,
        { file: `assets/${m}-abc123.js` },
      ])
    );
    const hits = findForbiddenModules(manifest, QUARANTINED_MODULES);
    expect(hits.map((h) => h.needle).sort()).toEqual(
      [...newlyQuarantined].sort()
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
`npx cross-env TZ=UTC vitest run tests/unit/scripts/check-prod-bundle.test.mjs`
Expected: FAIL —
`expected [ 'tear-sheet-dashboard' ] to contain 'reserves-demo'`.

- [ ] **Step 3: Extend `QUARANTINED_MODULES`** in
      `scripts/check-prod-bundle.mjs` (replace line 17):

```js
// Source-path substrings that must never appear in a production build manifest.
export const QUARANTINED_MODULES = [
  'tear-sheet-dashboard',
  'reserves-demo',
  'allocation-manager',
  'cash-management',
  'portfolio-analytics',
  'CapTables',
];
```

- [ ] **Step 4: Run test to verify it passes**

Run:
`npx cross-env TZ=UTC vitest run tests/unit/scripts/check-prod-bundle.test.mjs`
Expected: PASS.

- [ ] **Step 5: Do NOT commit yet** — `build:verify` will fail until Task 2
      excludes these routes from the bundle. Commit Tasks 1+2 together (Task 2
      Step 5).

### Task 2: DEV-gate the mock routes (build exclusion) — mirrors `reports.tsx`

**Files:**

- Modify: `client/src/app/app-routes.tsx:20-25` (remove top-level lazy decls),
  `:89-92` and `:103` (remove inline entries), add a dev-only group.

- [ ] **Step 1: Remove the five top-level lazy declarations** at
      `app-routes.tsx:20,22,23,24,25` (delete these lines):

```ts
const ReservesDemo = React.lazy(() => import('@/pages/reserves-demo'));
const AllocationManager = React.lazy(
  () => import('@/pages/allocation-manager')
);
const CashManagement = React.lazy(() => import('@/pages/cash-management'));
const PortfolioAnalytics = React.lazy(
  () => import('@/pages/portfolio-analytics')
);
const CapTables = React.lazy(() => import('@/pages/CapTables'));
```

Keep `MOICAnalysisPage` (line 21) — MOIC is real work in PR-3, not a quarantined
mock.

- [ ] **Step 2: Add a dev-only route group** immediately before
      `export const APP_ROUTES` (before line 73):

```ts
// Internal/demo surfaces. `import.meta.env.DEV` is statically replaced with `false`
// in production builds, so Rollup tree-shakes these dynamic imports out of the prod
// bundle (same mechanism as the Tear Sheet dashboard in pages/reports.tsx).
// Production decision for /reserves-demo: Branch A — production-disabled.
// Guarded by scripts/check-prod-bundle.mjs (QUARANTINED_MODULES).
const SHOW_INTERNAL_DEMOS = import.meta.env.DEV;

const INTERNAL_DEMO_ROUTES: AppRouteEntry[] = SHOW_INTERNAL_DEMOS
  ? [
      {
        path: '/allocation-manager',
        component: React.lazy(() => import('@/pages/allocation-manager')),
        isProtected: true,
      },
      {
        path: '/cash-management',
        component: React.lazy(() => import('@/pages/cash-management')),
        isProtected: true,
      },
      {
        path: '/portfolio-analytics',
        component: React.lazy(() => import('@/pages/portfolio-analytics')),
        isProtected: true,
      },
      {
        path: '/cap-tables',
        component: React.lazy(() => import('@/pages/CapTables')),
        isProtected: true,
      },
      {
        path: '/reserves-demo',
        component: React.lazy(() => import('@/pages/reserves-demo')),
      },
    ]
  : [];
```

- [ ] **Step 3: Remove the five inline `APP_ROUTES` entries**
      (`app-routes.tsx:89,90,91,92,103`) and spread the group in instead. The
      array should no longer contain `/allocation-manager`, `/cash-management`,
      `/portfolio-analytics`, `/cap-tables`, `/reserves-demo` as literals; add
      `...INTERNAL_DEMO_ROUTES,` as the final element before the closing `];`.

- [ ] **Step 4: Build and verify exclusion**

Run: `npm run build && npm run build:verify` Expected: `build:verify` prints
`[check-prod-bundle] OK: no quarantined modules or stray source maps.` If it
FAILS naming a legitimate module (e.g. a real module whose path contains
`portfolio-analytics`), narrow that substring in `QUARANTINED_MODULES` to a more
specific path fragment (e.g. `pages/portfolio-analytics`) and re-run both the
Task 1 test and `build:verify`.

- [ ] **Step 5: Type-check and commit Tasks 1+2**

Run: `npm run check` Expected: no new errors.

```bash
git add scripts/check-prod-bundle.mjs tests/unit/scripts/check-prod-bundle.test.mjs client/src/app/app-routes.tsx
git commit -m "fix: build-exclude mock-backed routes and extend bundle quarantine"
```

### Task 3: Delete dead navigation artifacts

**Files:**

- Delete: `client/src/components/layout/expandable-sidebar.tsx`,
  `client/src/config/navigation.ts`
- Inspect/Modify: `tests/unit/components/layout/sidebar-navigation.test.tsx`

- [ ] **Step 1: Re-confirm zero production importers**

Run:
`npx rg -n "expandable-sidebar|ExpandableSidebar|config/navigation" client/src`
Expected: no matches under `client/src` source (the canonical `Sidebar` +
`navigation-config` are used by `app-layout.tsx`). If any non-test source file
matches, STOP — the artifact is not dead; remove it from this task.

- [ ] **Step 2: Resolve the test importer** — open
      `tests/unit/components/layout/sidebar-navigation.test.tsx`. It references
      a dead module. Apply whichever fits:
  - If it tests `ExpandableSidebar` behavior that the canonical `Sidebar`
    already covers elsewhere → delete the test file.
  - If it imports `config/navigation` only for fixture data → repoint the import
    to `@/components/layout/navigation-config` and keep the assertions that
    still hold.

- [ ] **Step 3: Delete the dead files**

```bash
git rm client/src/components/layout/expandable-sidebar.tsx client/src/config/navigation.ts
```

- [ ] **Step 4: Run the layout tests + type-check**

Run:
`npx cross-env TZ=UTC vitest run tests/unit/components/layout && npm run check`
Expected: PASS, no new type errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: delete dead navigation artifacts (expandable-sidebar, config/navigation)"
```

### Task 4: Record the `/reserves-demo` production decision (no code)

**Files:**

- Modify: `docs/plans/2026-03-27-secondary-surface-decisions.md`

- [ ] **Step 1: Update the decision doc** — bump `last_updated` to `2026-06-18`
      and add a decision row recording **Branch A**: `/reserves-demo` is
      production-disabled (dev-only via `INTERNAL_DEMO_ROUTES`) and guarded by
      `check-prod-bundle.mjs`. Add the same line for the four mock operational
      routes. Keep it to one short table/section — this replaces the source
      proposal's PR-B policy-registry ceremony.

- [ ] **Step 2: Commit**

```bash
git add docs/plans/2026-03-27-secondary-surface-decisions.md
git commit -m "docs: record Branch A production-disable decision for mock-backed routes"
```

### PR-1 acceptance

- `npm run build:verify` passes and would fail if any of the 6 quarantined
  modules reappear.
- Production manifest contains none of: `tear-sheet-dashboard`, `reserves-demo`,
  `allocation-manager`, `cash-management`, `portfolio-analytics`, `CapTables`.
- Dead-nav files gone; layout tests green.
- Decision doc current.

---

## PR-2..PR-6: scoped stubs (expand each into its own plan when picked up)

These are intentionally **not** bite-sized yet (multi-subsystem; later scope
shifts as earlier PRs land). Each becomes its own `docs/superpowers/plans/` doc
at execution time.

### PR-2 — Shared provenance contract

- Create `shared/contracts/provenance.contract.ts` (Zod):
  `{ source: 'live'|'fallback'|'sample'|'unavailable', state: 'OK'|'PARTIAL'|'FAILED'|'UNAVAILABLE', generatedAt }`.
  Missing/invalid provenance maps to `FAILED`.
- Create `ProvenanceBoundary` renderer (client) consuming that state. Reuse the
  `deriveAlertSummaryState` precedent from PR #879.
- Acceptance: contract + renderer unit-tested; no surface migrated yet.

### PR-3 — MOIC live-primary (depends on PR-2)

- `moic-analysis.tsx`: delete static `moicData` (`:51-180`); make
  `useFundMoicRankings` the primary source; Zod-parse at the network boundary;
  401/403 → Access Denied (not empty); empty live ranking state.
- Add provenance to `shared/contracts/fund-moic-v1.contract.ts`.
- Prefer mounting under `/fund-model-results/:fundId`; keep `?fundId=` as
  compatibility only if needed.
- Acceptance: no static sample data renders in prod; live + denied + empty
  states tested.

### PR-4 — Reports / cashflow / forecast trust (depends on PR-2)

- Reports cards get independent provenance state. Cashflow material metrics are
  server-sourced or explicitly `UNAVAILABLE`. Forecast fallback labels say
  configuration/default/fallback, never "fresh calculation." No fabricated zeros
  in production no-input states.
- Acceptance: each card renders truthful state under live / fallback / failed.

### PR-5 — Route-mount parity guard

- Add a CI script that inventories routes mounted on `server/app.ts` vs
  `server/routes.ts` and fails on unexpected divergence. Mount or explicitly
  archive `server/routes/portfolio/snapshots.ts`. Fix
  `server-object-readiness.md:72` (task = HAS_PERSISTENCE). Keep this a
  **script + test**, not a governance program.
- Acceptance: parity script in CI; snapshots resolved; doc contradiction gone.

### PR-6 — Investment rounds backend, ADR-023 L3b (own plan)

- Precondition migration first: `investments.fund_id` nullable → enforce
  `UNIQUE (id, fund_id)` (composite-FK target). Then `investment_rounds` table
  (`NUMERIC(20,6)` money cols), required `Idempotency-Key` + request hash,
  append-only, mandatory fund enforcement. Delete-of-investment-with-rounds =
  `RESTRICT`. Keep `/cases` etc. at 501. Add `enable_investment_rounds`, **off
  in production** until a supersede/correction tranche exists. No live UI.
- Acceptance: integration test flips `/rounds` 501→201/200 behind the flag;
  `/cases` stays 501.

## Parallel hygiene (not blocking the spine)

- **Release-gate teardown (#880 follow-up):** `release:check` DB proof passes
  stages 1–6 but blocks at the Scenario release gate — two unhandled teardown
  errors in
  `tests/integration/scenarios/scenario-release-gate.integration.test.ts`. Fix
  by applying the #880 pattern: await `closeDatabasePool()` (and any route-owned
  pools) in that test's teardown before containers stop. Low effort, unblocks
  the full release proof.
- Batch fill-ins: `shell-quote` npm override (Dependabot 215),
  `vite.config.ts:345` `true ? true : true` dead ternary, prune stale worktrees
  (`C:/tmp/updog-pr864-ci-fix`) and merged local branches.

---

## Self-Review

**Spec coverage** (vs source proposal PR-A..PR-K): PR-A = #879 (locked,
regression baseline). PR-B → collapsed to Task 4 decision row
(registry/CODEOWNERS/matrix CUT, justified). PR-C → PR-1 Tasks 1–2. PR-D → PR-5.
PR-E → PR-2. PR-F → PR-4. PR-G → PR-3. PR-I → PR-6. PR-K → PR-1 Task 3.
PR-H/PR-J + telemetry → CUT (documented). No silent drops.

**Placeholder scan:** PR-1 Tasks 1–4 contain exact paths, full code, exact
commands with expected output. PR-2..6 are explicitly marked scoped stubs
(legitimate per the multi-subsystem scope-check), each to expand into its own
plan — not placeholders within an executable task.

**Type consistency:** `AppRouteEntry` (defined `app-routes.tsx:67`) is reused
for `INTERNAL_DEMO_ROUTES`. `QUARANTINED_MODULES` / `findForbiddenModules` names
match `check-prod-bundle.mjs` exports. `SHOW_INTERNAL_DEMOS` mirrors the
existing `SHOW_TEAR_SHEETS` idiom.

**Userspace safety:** quarantined routes verified nav-orphaned; build exclusion
changes no reachable navigation. Dead-nav deletion gated on a re-confirm grep.
