# Secondary-Surface Production Safety (P0A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. **Project note:** This repo's workflow
> contract routes edits/tests through Hermes
> (`npm run hermes:production -- --task "..."`). Either dispatch each task via
> Hermes or use a superpowers sub-skill; the steps below are written to be
> executable either way.

**Goal:** Stop the variance dashboard and Tear Sheet surface from externalizing
fabricated facts in production — show truthful alert states instead of a fake
`0/Stable`, build-exclude the mock Tear Sheet dashboard (and its client-side PDF
export) from the production bundle, and make production source maps opt-in.

**Architecture:** Three independent, non-contentious P0A fixes plus one reusable
build-verification primitive. Pure decision logic is lifted into framework-free
modules (`client/src/lib`, `scripts/`) and unit-tested fast; the React/Vite
wiring is verified by `tsc` + a post-build manifest scan. No route-governance or
`secondary-surface-decisions.md` changes are required (those are deferred to a
separate decision-gated plan — see Follow-on Plans).

**Tech Stack:** React 18 + TypeScript (strict), Vite/Rollup, Vitest (projects:
`server`=node, `client`=jsdom), Node ESM build scripts.

---

## Why this scope (context)

An adversarial evaluation of
`docs/CRITICAL-REVIEW-secondary-surface-governance.md` (run `wf_8c63987a-c13`,
summary in `.claude/artifacts/secondary-surface-proposal-evaluation.md`)
verified 28/33 code claims exact and concluded the 8-PR proposal is over-scoped
for a solo-dev tool. Two findings shape this plan:

1. The **clean, immediately-shippable** P0A wins are: truthful Active Alerts
   state (`variance-tracking.tsx:278` uses `|| 0`, collapsing API failure into
   `0/Stable`), and removing the client-side Tear Sheet mock PDF export
   (`tear-sheet-dashboard.tsx:343` fabricates a fund, the only prod importer is
   `reports.tsx:6`).
2. The mock-backed **routes** (`/allocation-manager`, `/cash-management`,
   `/portfolio-analytics`, `/cap-tables`, `/reserves-demo`) are deliberately
   pinned `internal-live` in `tests/unit/app/route-governance-registry.test.tsx`
   and ratified in `docs/plans/2026-03-27-secondary-surface-decisions.md`.
   Build-excluding them is contended and blocked on re-ratifying that decision —
   **out of scope here**, deferred to Plan B.

Correctness catch baked in: `'Press On Ventures II'` is NOT a usable mock
sentinel — but not because it is legitimate. `branding.ts:15` ships
`legalName: 'Press On Ventures II L.P.'`, which is itself a fabricated value
(the registered adviser per SEC IAPD CRD 334106 is "Press On Ventures GP, LLC";
no "II L.P." is on record). The literal therefore appears across several modules
(branding.ts, tear-sheet, a test, an ExportWrapper comment) and is an unreliable
locator. The Tear Sheet is verified by **manifest module-path absence**
(`tear-sheet-dashboard`), not literal scanning. (The `branding.ts` legal-name
defect is tracked separately — see Follow-on Plans.)

---

## File Structure

**Created:**

- `client/src/lib/variance-alert-summary.ts` — pure `AlertSummaryState` union +
  `deriveAlertSummaryState()`. Framework-free so it unit-tests in the node
  project (mirrors the existing `client/src/lib/cash-event-edit-model.ts`
  pattern).
- `tests/unit/lib/variance-alert-summary.test.ts` — unit tests for the pure
  function (server/node project: glob `tests/unit/**/*.test.ts`).
- `scripts/check-prod-bundle.mjs` — reusable production-bundle verifier: pure
  `findForbiddenModules()` + `findSourceMaps()` and a CLI. Extensible (Plan B
  appends route modules).
- `tests/unit/scripts/check-prod-bundle.test.mjs` — unit tests for the pure
  scanner functions (server project: glob `tests/unit/scripts/**/*.test.mjs`).

**Modified:**

- `client/src/pages/variance-tracking.tsx` — wire `deriveAlertSummaryState` into
  the alert count, `analysisStatus`, and the "Active Alerts" StatCard.
- `client/src/pages/reports.tsx` — build-exclude the Tear Sheet dashboard + tab
  from production.
- `vite.config.ts:345` — fix the dead `sourcemap` ternary to an opt-in policy.
- `package.json` — add `build:verify` script.

---

## Task 1: Truthful Active Alerts state

**Files:**

- Create: `client/src/lib/variance-alert-summary.ts`
- Test: `tests/unit/lib/variance-alert-summary.test.ts`
- Modify: `client/src/pages/variance-tracking.tsx` (import; line 278;
  `analysisStatus` block lines 283-311; "Active Alerts" StatCard lines 660-668)

- [ ] **Step 1: Write the pure module**

Create `client/src/lib/variance-alert-summary.ts`:

```ts
/**
 * Truthful alert-summary state for the variance dashboard.
 *
 * The page previously used `dashboardData?.data?.summary?.totalActiveAlerts || 0`,
 * which collapses an API failure (undefined) into a valid-looking `0` and renders
 * "Stable" / "No active alerts". For an LP/GP-facing surface that is a fabricated
 * fact. This module makes the distinction explicit so the UI can render LOADING /
 * FAILED / UNAVAILABLE instead of a fake zero.
 */
export type AlertSummaryState =
  | { state: 'LOADING' }
  | { state: 'FAILED'; message: string }
  | { state: 'UNAVAILABLE'; reason: string }
  | { state: 'LIVE'; count: number };

export interface AlertSummaryInput {
  isLoading: boolean;
  isError: boolean;
  totalActiveAlerts: number | null | undefined;
}

export function deriveAlertSummaryState(
  input: AlertSummaryInput
): AlertSummaryState {
  if (input.isLoading) {
    return { state: 'LOADING' };
  }
  if (input.isError) {
    return { state: 'FAILED', message: 'Unable to load alert summary.' };
  }
  if (
    typeof input.totalActiveAlerts !== 'number' ||
    !Number.isFinite(input.totalActiveAlerts)
  ) {
    return { state: 'UNAVAILABLE', reason: 'No alert summary available yet.' };
  }
  return { state: 'LIVE', count: input.totalActiveAlerts };
}
```

- [ ] **Step 2: Write the failing test**

Create `tests/unit/lib/variance-alert-summary.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { deriveAlertSummaryState } from '@/lib/variance-alert-summary';

describe('deriveAlertSummaryState', () => {
  it('reports LOADING while the query is in flight', () => {
    expect(
      deriveAlertSummaryState({
        isLoading: true,
        isError: false,
        totalActiveAlerts: undefined,
      })
    ).toEqual({ state: 'LOADING' });
  });

  it('reports FAILED on query error instead of a fake zero', () => {
    expect(
      deriveAlertSummaryState({
        isLoading: false,
        isError: true,
        totalActiveAlerts: undefined,
      })
    ).toEqual({ state: 'FAILED', message: 'Unable to load alert summary.' });
  });

  it('reports UNAVAILABLE when the count is missing but there is no error', () => {
    expect(
      deriveAlertSummaryState({
        isLoading: false,
        isError: false,
        totalActiveAlerts: undefined,
      })
    ).toEqual({
      state: 'UNAVAILABLE',
      reason: 'No alert summary available yet.',
    });
  });

  it('preserves a real zero as a LIVE value (not collapsed away)', () => {
    expect(
      deriveAlertSummaryState({
        isLoading: false,
        isError: false,
        totalActiveAlerts: 0,
      })
    ).toEqual({ state: 'LIVE', count: 0 });
  });

  it('returns the live count when present', () => {
    expect(
      deriveAlertSummaryState({
        isLoading: false,
        isError: false,
        totalActiveAlerts: 3,
      })
    ).toEqual({ state: 'LIVE', count: 3 });
  });
});
```

- [ ] **Step 3: Run the test to verify it passes**

Run:
`npx vitest run tests/unit/lib/variance-alert-summary.test.ts --project=server`
Expected: PASS, 5 tests. (Module already exists from Step 1, so this is green
immediately — the failing-first signal here is the prior nonexistence of the
file; if you prefer strict red-first, create the test before the module and
observe the import error.)

- [ ] **Step 4: Wire the import into variance-tracking.tsx**

In `client/src/pages/variance-tracking.tsx`, add this import next to the other
`@/lib` imports (the file already imports `@/lib/utils` at line 56):

```ts
import { deriveAlertSummaryState } from '@/lib/variance-alert-summary';
```

- [ ] **Step 5: Replace the `|| 0` alert count (line 278)**

Replace exactly:

```ts
const totalActiveAlerts = dashboardData?.data?.summary?.totalActiveAlerts || 0;
```

with:

```ts
const alertSummary = deriveAlertSummaryState({
  isLoading: dashboardLoading,
  isError: Boolean(dashboardError),
  totalActiveAlerts: dashboardData?.data?.summary?.totalActiveAlerts,
});
const totalActiveAlerts =
  alertSummary.state === 'LIVE' ? alertSummary.count : 0;
```

(`dashboardLoading` and `dashboardError` are already destructured at lines
213-214; `lastAnalysisDate` at line 279 and `alertCounts` at line 280 remain
unchanged.)

- [ ] **Step 6: Replace the `analysisStatus` block (lines 283-311)**

Replace the entire existing
`const analysisStatus = isAnalysisRunning ? {...} : ... ;` expression with:

```ts
const analysisStatus =
  alertSummary.state === 'LOADING'
    ? {
        value: 'Loading',
        description: 'Loading alert summary',
        badgeText: 'Loading',
        badgeVariant: 'secondary' as const,
      }
    : alertSummary.state === 'FAILED'
      ? {
          value: 'Unavailable',
          description: 'Alert summary failed to load',
          badgeText: 'Data error',
          badgeVariant: 'destructive' as const,
        }
      : alertSummary.state === 'UNAVAILABLE'
        ? {
            value: 'Unavailable',
            description: 'No alert summary available yet',
            badgeText: 'No data',
            badgeVariant: 'secondary' as const,
          }
        : isAnalysisRunning
          ? {
              value: 'Running',
              description: 'Variance analysis is in progress',
              badgeText: 'In progress',
              badgeVariant: 'secondary' as const,
            }
          : !lastAnalysisDate
            ? {
                value: 'Not Run',
                description: 'Run analysis to generate the first report',
                badgeText: 'No report',
                badgeVariant: 'secondary' as const,
              }
            : totalActiveAlerts > 0
              ? {
                  value: 'Attention',
                  description: 'Active alerts need review',
                  badgeText: `${totalActiveAlerts} active`,
                  badgeVariant: 'destructive' as const,
                }
              : {
                  value: 'Stable',
                  description: hasReports
                    ? 'Driven by latest variance report'
                    : 'Most recent analysis completed',
                  badgeText: 'No active alerts',
                  badgeVariant: 'default' as const,
                };

const activeAlertsValue: string | number =
  alertSummary.state === 'LIVE'
    ? alertSummary.count
    : alertSummary.state === 'LOADING'
      ? '…'
      : '—';
const activeAlertsBadge =
  alertSummary.state === 'LIVE'
    ? {
        text: `${alertCounts?.critical || 0} Critical`,
        variant: ((alertCounts?.critical || 0) > 0
          ? 'destructive'
          : 'secondary') as 'destructive' | 'secondary',
      }
    : alertSummary.state === 'FAILED'
      ? { text: 'Unavailable', variant: 'destructive' as const }
      : { text: 'No data', variant: 'secondary' as const };
```

- [ ] **Step 7: Update the "Active Alerts" StatCard (lines 660-668)**

Replace exactly:

```tsx
<StatCard
  title="Active Alerts"
  value={dashboardData?.data?.summary?.totalActiveAlerts || 0}
  icon={AlertTriangle}
  badge={{
    text: `${alertCounts?.critical || 0} Critical`,
    variant: (alertCounts?.critical || 0) > 0 ? 'destructive' : 'secondary',
  }}
/>
```

with:

```tsx
<StatCard
  title="Active Alerts"
  value={activeAlertsValue}
  icon={AlertTriangle}
  badge={activeAlertsBadge}
/>
```

- [ ] **Step 8: Verify types, lint, and the unit test**

Run: `npm run check` Expected: PASS (no type errors in `variance-tracking.tsx`
or the new module).

Run: `npm run lint` Expected: PASS (0 warnings; gate is `--max-warnings 0`).

Run:
`npx vitest run tests/unit/lib/variance-alert-summary.test.ts --project=server`
Expected: PASS, 5 tests.

- [ ] **Step 9: Commit**

```bash
git add client/src/lib/variance-alert-summary.ts tests/unit/lib/variance-alert-summary.test.ts client/src/pages/variance-tracking.tsx
git commit -m "fix(variance): render truthful alert state instead of error-as-zero"
```

---

## Task 2: Reusable production-bundle verifier

**Files:**

- Create: `scripts/check-prod-bundle.mjs`
- Test: `tests/unit/scripts/check-prod-bundle.test.mjs`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Write the failing test**

Create `tests/unit/scripts/check-prod-bundle.test.mjs`:

```mjs
import { describe, expect, it } from 'vitest';
import {
  findForbiddenModules,
  findSourceMaps,
} from '../../../scripts/check-prod-bundle.mjs';

describe('findForbiddenModules', () => {
  it('flags a manifest entry whose source path matches a forbidden substring', () => {
    const manifest = {
      'client/src/components/reports/tear-sheet-dashboard.tsx': {
        file: 'assets/tear-sheet-dashboard-abc123.js',
        src: 'client/src/components/reports/tear-sheet-dashboard.tsx',
        isDynamicEntry: true,
      },
    };
    const hits = findForbiddenModules(manifest, ['tear-sheet-dashboard']);
    expect(hits).toHaveLength(1);
    expect(hits[0].needle).toBe('tear-sheet-dashboard');
  });

  it('returns no hits when the forbidden module is absent', () => {
    const manifest = {
      'client/src/pages/reports.tsx': {
        file: 'assets/reports-def456.js',
        src: 'client/src/pages/reports.tsx',
      },
    };
    expect(findForbiddenModules(manifest, ['tear-sheet-dashboard'])).toEqual(
      []
    );
  });
});

describe('findSourceMaps', () => {
  it('returns only .map files', () => {
    expect(findSourceMaps(['a.js', 'a.js.map', 'b.css', 'b.css.map'])).toEqual([
      'a.js.map',
      'b.css.map',
    ]);
  });

  it('returns empty when no maps present', () => {
    expect(findSourceMaps(['a.js', 'b.css'])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
`npx vitest run tests/unit/scripts/check-prod-bundle.test.mjs --project=server`
Expected: FAIL — cannot resolve `../../../scripts/check-prod-bundle.mjs` (module
not created yet).

- [ ] **Step 3: Write the scanner module + CLI**

Create `scripts/check-prod-bundle.mjs`:

```mjs
// Production-bundle safety verifier.
//
// Asserts that quarantined source modules are NOT present in the built client
// manifest, and that no source-map files were emitted unless explicitly enabled.
// Reusable: extend QUARANTINED_MODULES as more surfaces are build-excluded.
//
// Run after `npm run build` via `npm run build:verify`.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST_DIR = resolve(process.cwd(), 'dist/public');
const MANIFEST_PATH = join(DIST_DIR, '.vite/manifest.json');

// Source-path substrings that must never appear in a production build manifest.
export const QUARANTINED_MODULES = ['tear-sheet-dashboard'];

/** Pure: return manifest entries whose key/src/file matches a forbidden substring. */
export function findForbiddenModules(manifest, forbiddenSubstrings) {
  const hits = [];
  for (const key of Object.keys(manifest)) {
    const entry = manifest[key] ?? {};
    const haystacks = [key, entry.src ?? '', entry.file ?? ''];
    for (const needle of forbiddenSubstrings) {
      if (haystacks.some((h) => String(h).includes(needle))) {
        hits.push({ needle, key, file: entry.file ?? '' });
      }
    }
  }
  return hits;
}

/** Pure: return the subset of file paths that are source maps. */
export function findSourceMaps(filePaths) {
  return filePaths.filter((p) => p.endsWith('.map'));
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function main() {
  if (!existsSync(MANIFEST_PATH)) {
    console.error(
      `[check-prod-bundle] manifest not found at ${MANIFEST_PATH}. Run "npm run build" first.`
    );
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const moduleHits = findForbiddenModules(manifest, QUARANTINED_MODULES);

  const allowSourceMaps = process.env['VITE_SOURCEMAP'] === 'true';
  const sourceMaps = allowSourceMaps ? [] : findSourceMaps(walk(DIST_DIR));

  let failed = false;
  if (moduleHits.length > 0) {
    failed = true;
    console.error(
      '[check-prod-bundle] FAIL: quarantined modules present in production bundle:'
    );
    for (const hit of moduleHits)
      console.error(`  - "${hit.needle}" via ${hit.key} -> ${hit.file}`);
  }
  if (sourceMaps.length > 0) {
    failed = true;
    console.error(
      '[check-prod-bundle] FAIL: source maps emitted without VITE_SOURCEMAP=true:'
    );
    for (const map of sourceMaps) console.error(`  - ${map}`);
  }
  if (failed) process.exit(1);
  console.log(
    '[check-prod-bundle] OK: no quarantined modules or stray source maps.'
  );
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  main();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
`npx vitest run tests/unit/scripts/check-prod-bundle.test.mjs --project=server`
Expected: PASS, 4 tests.

- [ ] **Step 5: Add the `build:verify` npm script**

In `package.json`, add this entry to the `"scripts"` object (place it next to
the other `build*` scripts):

```json
    "build:verify": "node scripts/check-prod-bundle.mjs",
```

- [ ] **Step 6: Commit**

```bash
git add scripts/check-prod-bundle.mjs tests/unit/scripts/check-prod-bundle.test.mjs package.json
git commit -m "test(build): add production-bundle verifier for quarantined modules + source maps"
```

---

## Task 3: Build-exclude the Tear Sheet mock dashboard

**Files:**

- Modify: `client/src/pages/reports.tsx` (lines 5-6 import; lines 18-21
  TabsList; lines 27-40 TabsContent)

- [ ] **Step 1: Confirm the verifier currently FAILS (negative control)**

Run: `npm run build` (≈1-3 min) Run: `npm run build:verify` Expected: FAIL —
`"tear-sheet-dashboard"` is present in the manifest (the lazy chunk is still
emitted by the current code). This proves the gate is load-bearing.

- [ ] **Step 2: Replace the lazy import (lines 5-6)**

Replace exactly:

```tsx
// Lazy-load PDF generation to reduce initial bundle size (saves ~430 KB gzipped)
const TearSheetDashboard = lazy(
  () => import('@/components/reports/tear-sheet-dashboard')
);
```

with:

```tsx
// Tear Sheets are mock-backed and ship a client-side PDF export that fabricates fund
// facts. Build-exclude the entire dashboard (and its chunk) from production:
// `import.meta.env.DEV` is statically replaced with `false` in production builds, so the
// dynamic import in the dead branch is dropped by Rollup and no chunk is emitted.
const SHOW_TEAR_SHEETS = import.meta.env.DEV;
const TearSheetDashboard = SHOW_TEAR_SHEETS
  ? lazy(() => import('@/components/reports/tear-sheet-dashboard'))
  : null;
```

- [ ] **Step 3: Gate the tab trigger (lines 18-21)**

Replace exactly:

```tsx
<TabsList className="grid w-full grid-cols-2">
  <TabsTrigger value="reports">Fund Reports</TabsTrigger>
  <TabsTrigger value="tear-sheets">Tear Sheets</TabsTrigger>
</TabsList>
```

with:

```tsx
<TabsList
  className={`grid w-full ${SHOW_TEAR_SHEETS ? 'grid-cols-2' : 'grid-cols-1'}`}
>
  <TabsTrigger value="reports">Fund Reports</TabsTrigger>
  {SHOW_TEAR_SHEETS && (
    <TabsTrigger value="tear-sheets">Tear Sheets</TabsTrigger>
  )}
</TabsList>
```

- [ ] **Step 4: Gate the tab content (lines 27-40)**

Replace exactly:

```tsx
<TabsContent value="tear-sheets" className="mt-6">
  <Suspense
    fallback={
      <div className="flex items-center justify-center p-12" role="status">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pov-charcoal mx-auto mb-4"></div>
          <p className="text-charcoal-600">Preparing tear sheet workspace...</p>
        </div>
      </div>
    }
  >
    <TearSheetDashboard />
  </Suspense>
</TabsContent>
```

with:

```tsx
{
  SHOW_TEAR_SHEETS && TearSheetDashboard && (
    <TabsContent value="tear-sheets" className="mt-6">
      <Suspense
        fallback={
          <div className="flex items-center justify-center p-12" role="status">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pov-charcoal mx-auto mb-4"></div>
              <p className="text-charcoal-600">
                Preparing tear sheet workspace...
              </p>
            </div>
          </div>
        }
      >
        <TearSheetDashboard />
      </Suspense>
    </TabsContent>
  );
}
```

- [ ] **Step 5: Reconcile any existing test that asserts the Tear Sheets tab**

Run: `npx vitest run --project=client -t "tear" 2>&1 | head -40` (locate
component tests touching the tab). Also: search for assertions on the literal
`Tear Sheets` under `tests/`. Run (search): use the editor's grep for
`Tear Sheets` and `tear-sheets` within `tests/`. Expected: If a `reports`/jsdom
test asserts the tab is present, note that under vitest
`import.meta.env.DEV === true`, so the tab IS rendered in tests — existing
assertions remain valid. No change needed unless a test asserts production-mode
absence (none expected).

- [ ] **Step 6: Verify types and the production build/scan (now GREEN)**

Run: `npm run check` Expected: PASS.

Run: `npm run build` (≈1-3 min) Run: `npm run build:verify` Expected: PASS —
`[check-prod-bundle] OK`. The tear-sheet chunk is no longer emitted.

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/reports.tsx
git commit -m "fix(reports): build-exclude mock Tear Sheet dashboard + PDF export from production"
```

---

## Task 4: Source-map production policy

**Files:**

- Modify: `vite.config.ts:345`

- [ ] **Step 1: Replace the dead `sourcemap` ternary (line 345)**

Replace exactly:

```ts
      sourcemap: process.env['VITE_SOURCEMAP'] === 'true' ? true : true, // Always enable source maps for profiling (keeping environment option)
```

with:

```ts
      sourcemap: process.env['VITE_SOURCEMAP'] === 'true', // Off by default in production; opt in with VITE_SOURCEMAP=true. Avoids publishing maps that ease extraction of source/mock literals.
```

- [ ] **Step 2: Verify build emits no source maps by default**

Run: `npm run build` (without `VITE_SOURCEMAP`) Run: `npm run build:verify`
Expected: PASS — no `.map` files under `dist/public` (the verifier's source-map
check passes).

- [ ] **Step 3: Verify opt-in still works**

Run (PowerShell):
`$env:VITE_SOURCEMAP="true"; npm run build; npm run build:verify; Remove-Item Env:VITE_SOURCEMAP`
Expected: build emits `.map` files AND `build:verify` PASSES (source-map check
skipped when `VITE_SOURCEMAP=true`).

- [ ] **Step 4: Commit**

```bash
git add vite.config.ts
git commit -m "fix(build): make production source maps opt-in via VITE_SOURCEMAP"
```

---

## Task 5: Full-suite verification

**Files:** none (verification + optional CI wiring note)

- [ ] **Step 1: Run type check, lint, and the full unit suite**

Run: `npm run check` Expected: PASS.

Run: `npm run lint` Expected: PASS (0 warnings).

Run: `npm test` Expected: PASS (both `server` and `client` projects; the two new
unit files included).

- [ ] **Step 2: Final production build + verify**

Run: `npm run build && npm run build:verify` Expected: `[check-prod-bundle] OK`.

- [ ] **Step 3 (optional, recommended): wire `build:verify` into CI**

Per the evaluation's premortem/devex findings, the gate is only durable if it is
a hard, always-run check. Add `npm run build:verify` immediately after the
existing build step in the CI build job, and confirm that job feeds the required
`CI Gate Status` aggregator (do NOT add it as a separate path-filtered job —
those skip docs-only PRs). Because this touches branch-protection-adjacent CI,
confirm the exact workflow file before editing rather than guessing.

---

## Follow-on Plans (separate, do not fold into PR-1)

These are independent subsystems from the proposal + amendment, deliberately
split out:

- **Plan B — Mock-route build exclusion.** Re-ratify
  `docs/plans/2026-03-27-secondary-surface-decisions.md` and
  `tests/unit/app/route-governance-registry.test.tsx` FIRST (the 4 operational
  pages + `/reserves-demo` are currently pinned `internal-live`), then split
  `client/src/app/app-routes.tsx` into core + dev-only modules and add a
  production Vite `resolve.alias` mapping the dev-routes module to an empty stub
  (mirror the `@sentry`→noop alias at `vite.config.ts:401`). Extend
  `QUARANTINED_MODULES` in `scripts/check-prod-bundle.mjs` with the route source
  paths. Verification is the manifest scan (governance unit tests run under
  vitest where the alias is not applied, so keep them asserting the
  dev-inclusive array — see eng-arch finding (d)).
- **Plan C — MOIC live-primary + provenance base.** Make `useFundMoicRankings`
  the primary data source in `client/src/pages/moic-analysis.tsx`, delete static
  `moicData`, add Zod parsing in `client/src/hooks/use-moic.ts`, and introduce a
  `.strict()` `ProvenanceBaseSchema` reconciled with
  `shared/contracts/reserve-ic-decision-v1.contract.ts`.
- **Plan D — ADR/decision hygiene.** Trivial unique-ADR-number + broken-link
  check folded into the existing `docs:routing:generate` pipeline (not a
  semantic dedup detector).
- **Plan E — Branding legal-name truthfulness.**
  `client/src/config/branding.ts:15` ships a non-registered `legalName` ('Press
  On Ventures II L.P.'); the registered adviser is "Press On Ventures GP, LLC"
  (SEC IAPD CRD 334106). Correct or data-source the value (and the related
  `demo.fundName` / `Carmasal Fund` placeholders) per the owner's decision. Low
  live exposure (only dead `investments` components consume it), so this is a
  small standalone cleanup, not a P0A blocker.

---

## Self-Review

**1. Spec coverage.** Accepted P0A items from
`.claude/artifacts/secondary-surface-proposal-evaluation.md`: Active Alerts
error-not-zero (Task 1), Tear Sheet client-export removal (Task 3), source-map
policy (Task 4). Build-exclusion _mechanism_ is established reusably (Task 2)
and applied to the one non-contentious surface (Tear Sheet); contended routes
explicitly deferred to Plan B. MOIC/ADR deferred to Plans C/D. No accepted PR-1
item is unaddressed.

**2. Placeholder scan.** No TBD/TODO/"handle edge cases"/"similar to" — every
code step has complete code; every command has expected output.

**3. Type consistency.**
`AlertSummaryState`/`deriveAlertSummaryState`/`AlertSummaryInput` are used
identically in Task 1's module, test, and wiring.
`findForbiddenModules`/`findSourceMaps`/`QUARANTINED_MODULES` match across Task
2's module, test, and CLI. `SHOW_TEAR_SHEETS`/`TearSheetDashboard` are
consistent across Task 3. `build:verify` is defined in Task 2 and invoked in
Tasks 3-5.
