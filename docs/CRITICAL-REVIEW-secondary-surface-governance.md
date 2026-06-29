# Critical Review: Latest Strategy Proposal for Secondary Surface Governance

**Date:** 2026-06-17 **Reviewer:** Orchestrator **Scope:** Updog_restore route
governance, production safety, mock-data quarantine, provenance contracts, and
build-time exclusion **Validation method:** Live codebase exploration with
parallel agent investigation **Status:** Claims validated against
`C:\dev\Updog_restore`

---

## 1. Executive Summary of the Review

The latest strategy proposal is **directionally sound** and makes four genuine
improvements over prior iterations: it tightens Vite/Rollup build-exclusion
mechanics, pushes provenance from UI labels into server/shared contracts,
clarifies that client route gates are not security boundaries, and adds
operational governance concerns (telemetry schemas, CODEOWNERS, source-map
policy, health-gate thresholds). Most of these should be adopted.

However, the strategy still contains **unvalidated claims, severity
misclassifications, and gaps in codebase awareness** that would produce an
incorrect implementation order if followed verbatim. The following sections
distinguish **code facts**, **decision-doc claims**, **inferences**, and
**future policy choices** for every major surface.

---

## 2. Claims That Are Correctly Validated

### 2.1 `/reserves-demo` is mounted without `isProtected`

**Code fact:** `client/src/app/app-routes.tsx:103` registers
`{ path: '/reserves-demo', component: ReservesDemo }` with no `isProtected`
flag. The `ReservesDemo` lazy import is declared at line 20 in the same
production-reachable module.

**Decision-doc claim:**
`docs/plans/2026-03-27-secondary-surface-decisions.md:13-15` documents it as
"intentional direct route mount" and "retire only with an explicit demo
deprecation decision."

**Verdict:** Both validated. The strategy correctly treats this as a
ratification-required branch.

### 2.2 `isProtected` is a fund-context guard, not an auth boundary

**Code fact:** `client/src/app/app-router.tsx:51-99` defines `ProtectedRoute`.
It imports `useFundContext()` and checks `needsSetup`, `isLoading`, and
`fundLoadError`. It does **not** check JWT, session, role, or identity. The
`renderAppRoute` function (lines 101-114) wraps `isProtected` routes in
`<ProtectedRoute>`.

**Verdict:** Validated. The strategy's rename to `fundContextGuard` in
governance is appropriate.

### 2.3 Tear Sheet mock export is client-side and hardcodes fund name

**Code fact:** `client/src/components/reports/tear-sheet-dashboard.tsx:343`
contains `fundName: 'Press On Ventures II', // Could come from context`. The PDF
template `client/src/utils/pdf/templates/TearSheetTemplate.tsx` uses
`@react-pdf/renderer`. The dashboard initializes state from `MOCK_TEAR_SHEETS`
(line 130) and `MOCK_AUDIT_LOG` (line 219).

**Verdict:** Validated. The strategy correctly identifies this as a P0A
production-safety risk.

### 2.4 Mock data arrays are present in production-reachable pages

| Symbol                       | File                                                                  | Line | Production-Reachable |
| ---------------------------- | --------------------------------------------------------------------- | ---- | -------------------- |
| `MOCK_TEAR_SHEETS`           | `client/src/components/reports/tear-sheet-dashboard.tsx`              | 130  | YES                  |
| `MOCK_AUDIT_LOG`             | same                                                                  | 219  | YES                  |
| `SAMPLE_COMPANIES`           | `client/src/components/portfolio/portfolio-analytics-dashboard.tsx`   | 137  | YES                  |
| `SAMPLE_CAP_TABLE_SCENARIOS` | `client/src/pages/CapTables.tsx`                                      | 41   | YES                  |
| `SAMPLE_TRANSACTIONS`        | `client/src/components/cash-management/cash-management-dashboard.tsx` | 79   | YES                  |
| `moicData`                   | `client/src/pages/moic-analysis.tsx`                                  | 51   | YES                  |
| `$55M`                       | `client/src/pages/allocation-manager.tsx`                             | 43   | YES                  |

**Verdict:** All validated. The quarantine list in Phase 4 is correct.

### 2.5 Vite `sourcemap` is always `true` regardless of environment

**Code fact:** `vite.config.ts:345` contains
`sourcemap: process.env['VITE_SOURCEMAP'] === 'true' ? true : true`. The ternary
is dead code; both branches return `true`.

**Verdict:** Validated. Strategy correctly flags this as needing an explicit
production source-map policy.

### 2.6 ADR numbering conflict exists

**Code fact:**

- `DECISIONS.md:330` has `ADR-010: PowerLawDistribution API Design`
- `docs/adr/ADR-010-xirr-day-count-and-bounds.md` has
  `ADR-010: XIRR Day-Count and Bounds Reconciliation`
- `DECISIONS.md:1543` has `ADR-011: Anti-Pattern Prevention Strategy`
- `docs/adr/ADR-011-decimal-string-api-convention.md` has
  `ADR-011: Decimal-String API Convention`
- `DECISIONS.md:3560` has `ADR-012: Mandatory Evidence-Based Document Reviews`
- `docs/adr/` has **no ADR-012 file**

**Verdict:** Validated. The conflict is **worse than the strategy describes**:
not only is ADR-012 missing from `docs/adr/`, but ADR-010 and ADR-011 have
**completely different topics** in `DECISIONS.md` versus `docs/adr/`. This is
not a simple duplication; it is a namespace collision.

### 2.7 `portfolio/snapshots` is implemented but unmounted

**Code fact:** `server/routes/portfolio/snapshots.ts` is 262 lines with full
POST/GET/GET/PUT handlers. `server/routes.ts:67` mounts `portfolio/lots.js` but
never mounts `portfolio/snapshots`.

**Verdict:** Validated. The strategy correctly calls for a server-surface
governance audit.

### 2.8 LP Reporting middleware uses `requireLPAccess`, not `requireRole`

**Code fact:** `server/routes/lp-api.ts:22-23` imports `requireLPAccess` and
`requireLPFundAccess`. No LP Reporting route uses `requireRole`.
`requireLPAccess` (defined in `server/middleware/requireLPAccess.ts:51`) checks
`req.user.roles?.includes('lp') || req.user.role === 'lp'`.

**Verdict:** Validated. The strategy's claim that LP Reporting uses
`requireRole` is **incorrect**; it uses LP-specific middleware. The role audit
should target `requireLPAccess` specifically, not generic `requireRole`.

### 2.9 `ExpandableSidebar` and `client/src/config/navigation.ts` have zero production importers

**Code fact:** Grep for `import.*ExpandableSidebar` and
`from.*expandable-sidebar` returned zero matches. Grep for
`from '@/config/navigation'` returned zero matches. Active layout
`app-layout.tsx` uses `Sidebar` from `@/components/layout/sidebar`.

**Verdict:** Validated. Both are dead artifacts. The strategy correctly
schedules deletion after structural guards.

---

## 3. Claims That Are Mischaracterized or Under-Specified

### 3.1 The `moicData` problem is more severe than described

**Strategy claim:** "The current page has a live hook and server endpoint, but
still defines static `moicData`."

**Code fact:** `client/src/pages/moic-analysis.tsx:51-180` defines
`const moicData: MOICMetric[] = [...]` with 8 hardcoded companies. This static
array is used for **the main table, cards, and ranking UI** at lines 189, 208,
321, 345, and 369. The live API (`useFundMoicRankings`) is only used for a
conditional "Follow-on Rankings" section at the bottom of the page (line 406:
`parsedFundId !== null && ...`).

**Gap:** The strategy implies deleting `moicData` and adding provenance will fix
the page. But the real problem is that the **primary UI is unconditionally
fake** even when a `fundId` is present. The page should render the API response
as the primary content when `fundId` is available, and show `UNAVAILABLE` or
`NO_DATA` when it is not. Deleting `moicData` without a primary-data replacement
path would break the page entirely. The PR 6 spec must include:

1. Delete `moicData`.
2. Make `useFundMoicRankings` the primary data source.
3. Add `ProvenanceBoundary` wrapper.
4. Render `Access Denied` for 401/403.
5. Render `No Data` for empty live rankings.

**Severity:** P0B (misleading production rendering) because a user with `fundId`
in the query string sees a mix of fake primary data and real secondary data.

### 3.2 `totalActiveAlerts` uses `|| 0`, not `?? 0`

**Strategy claim:** "Current code uses
`dashboardData?.data?.summary.totalActiveAlerts ?? 0`."

**Code fact:** `client/src/pages/variance-tracking.tsx:278` uses
`const totalActiveAlerts = dashboardData?.data?.summary?.totalActiveAlerts || 0;`
(note `||` not `??`, and optional chaining on `summary`).

**Gap:** The `||` operator makes `0` (a valid live zero) indistinguishable from
`undefined`/`null` (missing/error). The `??` operator would at least preserve
`0` as a valid value. However, the deeper issue is the same: the code collapses
API failure into a falsy value. The proposed `AlertSummaryState` union type is
the correct fix, but the strategy should cite the actual `||` operator, not
`??`.

**Severity:** P0B. The proposed state model is correct regardless of the
operator detail.

### 3.3 Cashflow demo fallback is already properly gated

**Strategy claim:** "CashflowDashboard passes `allowDemoFallback: isDemoMode()`.
... This is now P1 guardrail if the current fix is stable."

**Code fact:** `client/src/core/demo/persona.ts:18` defines `isDemoMode()` to
return `false` unconditionally in production unless `VITE_E2E_DEMO_ENABLED` is
set or `?demo` query param is present.
`client/src/hooks/useLiquidityAnalytics.ts:281-297` checks
`options.allowDemoFallback` before returning mock data.

**Gap:** The strategy's P0A/P0B split is directionally right, but cashflow
should be **P1B or lower**, not P0B. The existing gate is structurally sound:
production without explicit flags cannot reach mock data. The regression lock is
appropriate, but the strategy should not group it with ungated mock surfaces
like Tear Sheets.

### 3.4 Tear Sheet PDF is lazy-loaded, not build-excluded

**Strategy claim:** "Delete the mock export code path from production. Do not
preserve a dormant client-side PDF function."

**Code fact:** `client/src/components/reports/tear-sheet-dashboard.tsx:116-127`
lazy-loads the PDF runtime via `loadTearSheetPdfRuntime()`. This is a
**performance optimization**, not a conditional exclusion. The code path is
still in the production bundle (just in a separate chunk).

**Gap:** The strategy is correct about deleting the export path, but it should
not confuse lazy-loading with build-exclusion. The PDF generation function is
still reachable in production if the user triggers the export button. The
server-side replacement rule is correct.

### 3.5 `fund-moic-v1.contract.ts` has no provenance field

**Strategy claim:** "Add provenance to shared MOIC response contract."

**Code fact:** `shared/contracts/fund-moic-v1.contract.ts:16-20` defines
`FundMoicRankingsResponseV1Schema` with `fundId`, `rankings`, and `generatedAt`
only. No provenance field exists.

**Gap:** Validated, but the strategy should also note that the codebase
**already has a mature provenance pattern**
(`shared/contracts/reserve-ic-decision-v1.contract.ts:28-102` defines
`ReserveIcDecisionProvenanceSchema` with `sourceScenarioId`,
`sourceAllocationVersion`, `liveAllocationVersion`, etc.). The new
`DataProvenanceSchema` should be designed to be **compatible with** or
**extend** this existing pattern, not reinvent it in a separate namespace. The
`shared/contracts/` directory is the correct placement.

### 3.6 `AirChair` leaks into benchmarking dashboard too

**Strategy claim:** The quarantine list focuses on `/allocation-manager`,
`/cap-tables`, `/portfolio-analytics`, `/cash-management`, and `/reserves-demo`.

**Code fact:** `client/src/components/portfolio/benchmarking-dashboard.tsx:95`
contains a hardcoded benchmark entry with `AirChair`.

**Gap:** The strategy misses this additional leak. Any production bundle
sentinel scan must include `AirChair` and other fake names, but also the
**benchmarking dashboard** should be quarantined or rebuilt if it contains
hardcoded sample data.

### 3.7 LP Reporting Playwright tests bypass auth

**Code fact:** `playwright.lp-reporting.config.ts` runs with `REQUIRE_AUTH: '0'`
and `ALLOW_MEMORY_STORAGE: '1'`.

**Gap:** The strategy correctly says to use the existing E2E harness, but it
should note that the **test harness disables auth**. This is a test concern, not
a production concern, but it means the E2E tests do not validate the
auth/fund-scope middleware that production will use. The strategy should add a
requirement for **auth-enabled integration tests** before LP Reporting
promotion.

---

## 4. Persistent Weaknesses in the Strategy

### 4.1 The PR sequence front-loads policy work but delays structural fixes

The strategy proposes:

- PR 0: Decision authority, CODEOWNERS, boundary matrix, ADR dedup
- PR 1: P0A/P0B production safety (mock export removal, reserves-demo branch)
- PR 2: Governance execution layer
- PR 3: Build-time quarantine

**Weakness:** The mock data is **already in production-reachable modules**.
Waiting until PR 3 to move dev-only lazy imports to excluded modules means
mock-backed routes remain in the production bundle for at least two PRs. The
correct order should be:

1. **Immediate:** Build-exclude `/reserves-demo` and mock-backed routes (or
   confirm they are already excluded by the route array, which they are not).
2. **PR 0:** Decision ratification.
3. **PR 1:** Production safety (Tear Sheet export, mock tab removal, Active
   Alerts fix).
4. **PR 2:** Governance tests and registry.

Since `app-routes.tsx` currently includes all routes in a single `APP_ROUTES`
array with no production/dev split, the build-time quarantine is the
**highest-priority structural change**. The strategy should not treat it as
PR 3.

### 4.2 The `server-surface governance audit` (Phase 12) is treated as a late add-on

**Weakness:** The unmounted `portfolio/snapshots` route (262 lines, fully
implemented) is a **production-trust risk** because it is documented but not
reachable. If it becomes mounted by accident (e.g., a merge conflict or
copy-paste error in `routes.ts`), it exposes endpoints that have not been tested
in production. The audit should be **PR 0 or PR 1**, not Phase 12. The strategy
should require:

- A CI check that every `.ts` file under `server/routes/` is either mounted in
  `routes.ts` or explicitly listed in an `UNMOUNTED_ROUTES` allowlist with a
  documented reason.

### 4.3 The strategy does not address the `reports` page beyond Tear Sheet

**Weakness:** `client/src/pages/reports.tsx` lazy-loads `TearSheetDashboard`.
The strategy focuses on the Tear Sheet tab and mock export. But what about the
other reports tabs? If the entire `/reports` page is mock-backed, the page
itself should be quarantined, not just the Tear Sheet tab. The strategy should
verify which tabs are live-backed versus mock-backed before deciding whether to
hide the tab or the entire page.

### 4.4 The `DataProvenanceSchema` is comprehensive but not versioned

**Weakness:** The proposed `DataProvenanceSchema` has 18 fields. This is correct
for a final contract, but the rollout strategy should include **versioning**.
The existing `ReserveIcDecisionProvenanceSchema` does not use a `configVersion`
or `schemaVersion` field. The new schema should include
`schemaVersion: z.literal('1.0')` or similar so that future additions are
additive and backward-compatible. The strategy should also specify that the
schema is **additive** to existing contracts, not a breaking replacement.

### 4.5 The strategy does not leverage the existing `ReserveIcDecisionProvenanceSchema`

**Weakness:** The codebase already has a provenance schema with
`sourceScenarioId`, `sourceAllocationVersion`, `liveAllocationVersion`, etc. The
new `DataProvenanceSchema` is more general (applies to all material financial
APIs). The strategy should explicitly map the two: `ReserveIcDecisionProvenance`
can become a **specialization** of `DataProvenanceSchema` with additional
fields, or the new schema can be a **superset** that replaces the old one in
future refactors. Without this mapping, the codebase will have two parallel
provenance systems.

### 4.6 The `isProtected` rename is governance-only, with no code change plan

**Weakness:** The strategy says: "In governance, rename `isProtected` to
`fundContextGuard` or keep it only as `routeFundSetupGuard`." But it does not
specify a code change. If the rename is governance-only (docs, comments,
registry), the TypeScript property `isProtected` remains in `AppRouteEntry` and
`app-routes.tsx`. The strategy should specify whether the code rename is in
scope, and if so, which PR should do it. If the code rename is deferred, the CI
rule must lint against `isProtected` being used in auth contexts.

### 4.7 The `fund-moic-v1.contract.ts` is not checked for the `generatedAt` field usage

**Weakness:** The strategy says MOIC should be fund-scoped under
`/fund-model-results/:fundId`. The existing contract has
`generatedAt: z.string().datetime()`. The new provenance should include
`calculatedAt` and `asOfDate`. The strategy should specify whether `generatedAt`
is **deprecated** in favor of `calculatedAt` or **retained as a compatibility
alias**. Without this decision, the API will accumulate redundant timestamp
fields.

### 4.8 The `shared/contracts/provenance.contract.ts` path conflicts with existing convention

**Weakness:** The codebase uses `shared/contracts/` for domain-specific
contracts (`fund-moic-v1.contract.ts`, `lp-reporting/*.contract.ts`). The
strategy proposes `shared/contracts/provenance.contract.ts`. This is fine, but
it should also consider whether provenance is a **cross-cutting concern** that
belongs in `shared/schemas/common.ts` or `shared/types/metrics.ts` (which
already have `MetricSource` for provenance). A cross-cutting schema in
`shared/contracts/provenance.contract.ts` is correct, but the strategy should
explicitly deprecate or map the existing `MetricSource` type.

---

## 5. Overlooked Opportunities

### 5.1 Use the existing `shared/contracts/` directory as a provenance template

`shared/contracts/reserve-ic-decision-v1.contract.ts:28-102` already has
`ReserveIcDecisionProvenanceSchema`. This proves the team knows how to write Zod
provenance contracts. The new `DataProvenanceSchema` should follow the same
pattern (Zod object, exported type, exported schema). The strategy should
reference this file as the implementation template.

### 5.2 Add a CI check for `routes.ts` completeness

Since `portfolio/snapshots` is fully implemented but unmounted, the CI should
enforce:

- Every file in `server/routes/**/*.ts` (excluding `index.ts` or `routes.ts`
  itself) must be either imported in `routes.ts` or listed in an
  `ALLOWED_UNMOUNTED` array with a comment.

This is a one-line check that prevents future accidental exposure of unmounted
routes.

### 5.3 Use the `shared/contracts/` naming convention for the new provenance schema

The existing contracts use kebab-case with version suffixes
(`fund-moic-v1.contract.ts`, `reserve-ic-decision-v1.contract.ts`). The new file
should be `shared/contracts/data-provenance-v1.contract.ts` to match. The
strategy's `provenance.contract.ts` is acceptable but inconsistent with the
existing convention.

### 5.4 The `app-routes.tsx` line 20 lazy import is a DCE risk even if the route is filtered

**Code fact:**
`const ReservesDemo = React.lazy(() => import('@/pages/reserves-demo'));` is
evaluated at module load time. Even if `APP_ROUTES` is filtered to exclude
`/reserves-demo`, the `import()` call may still be analyzed by the bundler and
the chunk may be generated. The correct fix is to move the lazy declaration to a
dev-only module, as the strategy proposes in Phase 4.1, but the strategy should
note that **filtering the route array is not sufficient** if the import
declaration is in the same module.

### 5.5 The `MOICAnalysisPage` should use the existing `fund-moic-v1.contract.ts` for Zod parsing

**Code fact:** `client/src/hooks/use-moic.ts` does not import or validate
against `FundMoicRankingsResponseV1Schema`. It uses a generic
`useQuery<FundMoicRankingsResponseV1>`. The strategy should require that the
client hook import the shared schema and validate the response at the network
boundary. This is a prerequisite for the "missing provenance maps to FAILED"
rule.

---

## 6. Code Fact vs. Decision-Doc vs. Inference vs. Future Policy

The strategy correctly aims to distinguish these categories. Here is the
corrected mapping for the most contentious surfaces:

| Surface               | Code Fact                                                                                                 | Decision-Doc Claim                                                    | Inference                                                | Future Policy                                                        |
| --------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------- | ------------------------------ |
| `/reserves-demo`      | Mounted at `app-routes.tsx:103` without `isProtected`                                                     | Secondary Surface Decisions doc says "intentional internal live demo" | If no branch is ratified, default to production-disabled | Branch A or B must be ratified in PR 0                               |
| `portfolio/snapshots` | Implemented at `server/routes/portfolio/snapshots.ts` (262 lines), **not mounted** in `routes.ts`         | Architecture doc says "Ready for Implementation" (6-endpoint API)     | It may become mounted accidentally in a future merge     | CI check for unmounted route files                                   |
| `isProtected`         | Checks fund context (`needsSetup`, `isLoading`, `fundLoadError`) at `app-router.tsx:58-96`                | Strategy renames to `fundContextGuard` in governance                  | It is sometimes confused with auth                       | CI lint: `isProtected` cannot be sole auth boundary                  |
| Tear Sheet export     | Client-side `@react-pdf/renderer` with hardcoded `Press On Ventures II` at `tear-sheet-dashboard.tsx:343` | Strategy says server-side only                                        | Client-side PDF generation is not authoritative          | Server-side export with provenance/idempotency                       |
| `totalActiveAlerts`   | Uses `                                                                                                    |                                                                       | 0`at`variance-tracking.tsx:278`                          | Strategy says `?? 0` (incorrect detail)                              | API failure coerces to `0` / `Stable` | `AlertSummaryState` union type |
| `moicData`            | Static array at `moic-analysis.tsx:51-180` is **primary UI data**                                         | Strategy says "delete static moicData"                                | The page is mostly fake even with `fundId` query param   | Fund-scoped child route with provenance                              |
| LP Reporting          | Uses `requireAuth` + `requireLPAccess`/`requireLPFundAccess` (not `requireRole`)                          | Strategy says "audit `requireRole` callers"                           | LP role is implicit in `requireLPAccess`                 | Audit `requireLPAccess` and add shared role schema                   |
| `sourcemap`           | Always `true` at `vite.config.ts:345` (dead conditional)                                                  | Strategy says "explicit source-map policy"                            | Public source maps may leak mock literals                | Decide public vs. private source-map serving                         |
| ADR numbering         | `DECISIONS.md` ADR-010/011/012 have different topics from `docs/adr/` ADR-010/011                         | Strategy says "duplicate ADR IDs"                                     | The two files are independent namespaces                 | Generate ADR index, detect collisions, decide single source of truth |

---

## 7. Fully Revised Development Spec

The following is the corrected, codebase-validated development strategy. Each
phase references validated file paths and line numbers. Claims are tagged as
**[Code]**, **[Doc]**, **[Inference]**, or **[Policy]**.

---

# Revised Strategy: Secondary Surface Governance & Production Truthfulness

## Executive Strategy

Updog_restore should treat every mounted, externally reachable, or documented
surface as a governed product contract with explicit placement, environment,
security boundary, data authority, calculation lineage, export policy,
telemetry, owner, and rollback path.

The first priority is **production truthfulness**, not discoverability. Remove
or build-exclude mock/demo financial surfaces from production, make evidence
state explicit in shared server/client contracts, and only then qualify MOIC and
LP Reporting for fund-scoped exposure consistent with the repo's canonical
`/fund-model-results/:fundId` flow.

This is aligned with the README's current product truth: canonical flow is
`/fund-setup -> review -> publish -> /fund-model-results/:fundId`, and
secondary-surface exposure is intentionally narrow.

---

# Phase 0 — Decision authority and surface-truth baseline

## 0.1 Decision-doc authority

Update `docs/plans/2026-03-27-secondary-surface-decisions.md` first. No route
promotion or preservation of unsafe demo routes proceeds without a ratified
decision row.

Add CODEOWNERS coverage for:

```txt
docs/plans/2026-03-27-secondary-surface-decisions.md @nikhillinit
```

**[Code]** Existing CODEOWNERS (`CODEOWNERS` root and `.github/CODEOWNERS`)
covers `docs/adr/**`, metrics docs, observability docs, workflows, and security
tooling, but not this decision file.

## 0.2 Required decision row fields

Each governed surface must declare:

- surface path or route family,
- product state,
- allowed environments,
- runtime/build placement,
- client placement,
- security boundary,
- fund-scope requirement,
- role/workflow policy,
- data source authority,
- calculation mode,
- export policy,
- telemetry key,
- owner,
- rollback path,
- decision date,
- review cadence,
- ratifying reviewer.

## 0.3 Decision-tree rule for `/reserves-demo`

**[Code]** `client/src/app/app-routes.tsx:103` mounts `/reserves-demo` without
`isProtected`. `client/src/app/app-routes.tsx:20` lazy-imports it in a
production-reachable module.

**[Doc]** The Secondary Surface Decisions doc describes it as an intentionally
mounted internal live demo.

PR 0 must choose exactly one:

### Branch A — production-disabled (default)

`/reserves-demo` is excluded from production route arrays and chunks. If no
branch is ratified, this is the default.

### Branch B — production-preserved as internal demo

Allowed only if all of these are true:

- external gateway or server-side demo authorization is documented,
- the route is not treated as public,
- production bundle sentinel policy allows it by explicit reviewed exception,
- route telemetry identifies direct hits,
- rollback is defined.

## 0.4 ADR/decision hygiene

**[Code]** `DECISIONS.md` contains ADR-010 (PowerLawDistribution), ADR-011
(Anti-Pattern Prevention), ADR-012 (Evidence-Based Reviews). `docs/adr/`
contains ADR-010 (XIRR Day-Count), ADR-011 (Decimal-String API), and **no
ADR-012**. The same IDs refer to **different topics**.

Add a Phase 0 task:

- generate ADR index,
- detect duplicate ADR IDs across `DECISIONS.md` and `docs/adr/**`,
- decide whether `DECISIONS.md` is historical index, active source, or umbrella
  table,
- add CI check preventing new duplicate ADR IDs.

## 0.5 Server-surface governance audit (moved from Phase 12)

**[Code]** `server/routes/portfolio/snapshots.ts` is 262 lines, fully
implemented, but `server/routes.ts:67` mounts `portfolio/lots.js` and never
mounts `portfolio/snapshots`.

Generate a server route inventory covering:

- mounted Express routes,
- unmounted route files,
- docs-declared endpoints,
- implementation status,
- auth/fund-scope middleware,
- response contract,
- 501/placeholder status if present,
- governance row.

**[Policy]** Add CI check: every file in `server/routes/**/*.ts` must be either
mounted in `routes.ts` or listed in an `ALLOWED_UNMOUNTED` array with a
documented reason.

---

# Phase 1 — P0A production safety: stop externalization of fabricated facts

## 1.1 Remove Tear Sheet mock export

**[Code]** `client/src/components/reports/tear-sheet-dashboard.tsx:343`
hardcodes `fundName: 'Press On Ventures II'`. The component uses
`@react-pdf/renderer` (`client/src/utils/pdf/templates/TearSheetTemplate.tsx`).
The PDF runtime is lazy-loaded at `tear-sheet-dashboard.tsx:116-127`, but this
is a **performance optimization**, not a build exclusion.

### Required change

Delete the mock export code path from production. Do not preserve a dormant
client-side PDF function that can be re-enabled from local state.

### Final export rule

**[Policy]** Authoritative financial documents must be generated server-side.
The client may only:

- request an export,
- receive a binary or signed artifact reference,
- download the server-created artifact.

The server must enforce:

- `requireAuth`,
- fund scope,
- role/workflow policy,
- data provenance,
- idempotency/version,
- audit logging.

### Acceptance tests

- No production client code can generate a Tear Sheet PDF from local state.
- Production bundle does not include `Press On Ventures II` from Tear Sheet
  export.
- Export UI is absent unless server export contract exists.
- Export attempt in non-authoritative state returns/records blocked policy.

## 1.2 Production-disable Tear Sheet mock tab/grid unless live-backed

**[Code]** `client/src/components/reports/tear-sheet-dashboard.tsx:130` defines
`MOCK_TEAR_SHEETS` and `MOCK_AUDIT_LOG` (line 219). The component is lazy-loaded
by `client/src/pages/reports.tsx:6` and rendered at line 38.

**[Inference]** The entire `/reports` page should be audited, not just the Tear
Sheet tab, to confirm which tabs are live-backed.

### Required change

In production, one of these must be true:

1. Tear Sheets tab is absent; or
2. Tab renders a non-data unavailable state and does not import mock dashboard;
   or
3. Tab is backed by live, fund-scoped, provenance-bearing API data.

Mock-labeled Tear Sheets may exist only in explicit demo/non-production
surfaces.

## 1.3 Make `/reserves-demo` production-safe

**[Code]** `client/src/app/app-routes.tsx:103` mounts the route.
`client/src/app/app-routes.tsx:20` declares the lazy import in the same
production-reachable module.

### Required change

Implement the branch ratified in Phase 0.

For Branch A, production must exclude the route and chunk. This requires moving
the lazy import out of `app-routes.tsx` into a dev-only module, because
**filtering the route array is not sufficient** if the `import()` declaration is
analyzed by the bundler.

For Branch B, server/gateway security and telemetry must be validated.

### Acceptance tests

- Production manifest excludes `/reserves-demo` unless Branch B is ratified.
- Direct production navigation is Not Found/safe redirect unless Branch B is
  ratified.
- If Branch B, test gateway/admin access behavior and denial path.

## 1.4 Fix Reports Active Alerts error-to-zero coercion

**[Code]** `client/src/pages/variance-tracking.tsx:278` uses
`const totalActiveAlerts = dashboardData?.data?.summary?.totalActiveAlerts || 0;`.
Note `||` (not `??` as the prior strategy claimed).

### Required state model

```ts
type AlertSummaryState =
  | { state: 'LIVE'; count: number }
  | { state: 'LOADING' }
  | { state: 'FAILED'; status?: number; message: string }
  | { state: 'UNAVAILABLE'; reason: string };
```

### Acceptance tests

- API failure never displays `0` or `Stable`.
- Valid live zero still displays `0` and `Stable`.
- Reports list and dashboard summary render independently in mixed-success
  cases.

## 1.5 Lock cashflow demo fallback (P1, not P0)

**[Code]** `client/src/components/dashboard/CashflowDashboard.tsx:90` passes
`allowDemoFallback: isDemoMode()`. `client/src/core/demo/persona.ts:18` returns
`false` in production unless `VITE_E2E_DEMO_ENABLED` is set or `?demo` query
param is present. `client/src/hooks/useLiquidityAnalytics.ts:281-297` checks
`options.allowDemoFallback` before returning mock data.

**[Inference]** The existing gate is structurally sound. This is a **P1
regression lock**, not P0B.

### Required tests

- production + `?demo` without E2E flag does not generate mock cashflow,
- production + no inputs renders unavailable/empty,
- E2E demo mode remains explicit and scoped.

---

# Phase 2 — Security boundary matrix

The previous spec correctly said client route gates are not security boundaries,
but the final strategy must operationalize that.

## 2.1 Boundary matrix

Create `docs/security/surface-boundary-matrix.md`.

Each surface must classify:

| Layer              | Meaning                                          |
| ------------------ | ------------------------------------------------ |
| Static SPA route   | URL can render shell or not                      |
| Client UX guard    | Fund context, feature flag, role hint            |
| API auth           | `requireAuth` or equivalent                      |
| Fund scope         | `requireFundAccess` / `enforceProvidedFundScope` |
| Role/policy        | `requireRole` or policy engine                   |
| Workflow state     | dry-run, draft, approved, locked, package-ready  |
| Deployment gateway | static app protection if any                     |
| Export authority   | server-side artifact generation                  |

**[Code]** `server/lib/auth/jwt.ts:218` defines `requireAuth`.
`server/lib/auth/jwt.ts:255` defines `requireFundAccess`.
`server/lib/auth/jwt.ts:245` defines `requireRole`.
`server/lib/auth/provided-fund-scope.ts:27-65` defines
`enforceProvidedFundScope`.

## 2.2 `isProtected` governance rename

**[Code]** `client/src/app/app-router.tsx:51-99` shows `isProtected` wraps
`ProtectedRoute` which checks fund context only.

**[Policy]** In governance, rename `isProtected` to `fundContextGuard` or keep
it only as `routeFundSetupGuard`. It must never satisfy auth.

**[Policy]** CI rule:

```txt
If authBoundary !== 'public-contract' and authBoundary !== 'external-gateway',
a server/API access policy or explicit "no server data" rationale is required.
isProtected/fundContextGuard alone is never sufficient.
```

---

# Phase 3 — Build-time quarantine and chunk ownership

## 3.1 Correct Vite/DCE pattern

**[Code]** `client/src/app/app-routes.tsx` currently declares all lazy imports
at the top level (lines 4-65) and includes all routes in a single `APP_ROUTES`
array (lines 73-104). There is no production/dev split.

**[Inference]** The final rule:

> A production-disabled route is excluded only when its component module, lazy
> import declaration, route entry, and route chunk are absent from
> production-reachable modules.

Do not use top-level lazy imports in production-reachable `app-routes.tsx` for
dev-only routes.

### Preferred architecture

```ts
// app-routes.core.tsx
export const CORE_APP_ROUTES = [
  // production-safe routes only
];

// app-routes.dev.tsx
const ReservesDemo = React.lazy(() => import('@/pages/reserves-demo'));
const AllocationManager = React.lazy(
  () => import('@/pages/allocation-manager')
);
const CapTables = React.lazy(() => import('@/pages/CapTables'));

export const DEV_ONLY_APP_ROUTES = [
  { path: '/reserves-demo', component: ReservesDemo },
  {
    path: '/allocation-manager',
    component: AllocationManager,
    isProtected: true,
  },
  { path: '/cap-tables', component: CapTables, isProtected: true },
];

// app-routes.tsx
export const APP_ROUTES = import.meta.env.PROD
  ? CORE_APP_ROUTES
  : [...CORE_APP_ROUTES, ...DEV_ONLY_APP_ROUTES];
```

If importing `DEV_ONLY_APP_ROUTES` itself causes route chunks to appear, use one
of:

- Vite alias in production to an empty module,
- separate prod/dev route entry modules,
- build-time plugin stripping dev route module,
- CI manifest enforcement as the source of truth.

## 3.2 Quarantine list

**[Code]** Production-disabled until rebuilt or ratified:

- `/reserves-demo` — mounted without `isProtected`, lazy import in
  production-reachable module.
- `/allocation-manager` — `client/src/pages/allocation-manager.tsx:43` hardcodes
  `const totalFundSize = 55000000; // $55M fund`.
- `/cap-tables` — `client/src/pages/CapTables.tsx:41` uses
  `SAMPLE_CAP_TABLE_SCENARIOS`.
- `/portfolio-analytics` —
  `client/src/components/portfolio/portfolio-analytics-dashboard.tsx:137` uses
  `SAMPLE_COMPANIES`.
- `/cash-management` —
  `client/src/components/cash-management/cash-management-dashboard.tsx:79` uses
  `SAMPLE_TRANSACTIONS`.
- `/moic-analysis` — `client/src/pages/moic-analysis.tsx:51-180` uses static
  `moicData` as primary UI.
- Benchmarking dashboard —
  `client/src/components/portfolio/benchmarking-dashboard.tsx:95` contains
  hardcoded `AirChair` benchmark entry.

## 3.3 Bundle sentinel policy

### Hard-fail source guards

Run on production-reachable source:

- `MOCK_`,
- `SAMPLE_`,
- `generateMock`,
- fake financial export payloads,
- client PDF generation for authoritative reports,
- dev-only route modules imported by prod route modules.

### Hard-fail bundle literals

Scan built production assets for high-signal strings likely to survive
minification:

- `Press On Ventures II`,
- `AirChair`,
- `Mock data - would come from actual investment data`,
- `Cash flow projection modeling and scenario analysis coming soon`,
- `Fund Capital Reserves` if route quarantined,
- other route-specific proper nouns.

### Review-only sentinels

Company names such as `TechFlow`, `FinanceHub`, or `DataFlow Systems` may
collide with legitimate future data. Treat as review warnings unless tied to a
quarantined chunk.

### Avoid brittle sentinels

Do not hard-fail on numeric literals like `2.5` or `0.35` alone.

## 3.4 Source-map policy

**[Code]** `vite.config.ts:345` sets
`sourcemap: process.env['VITE_SOURCEMAP'] === 'true' ? true : true` (always
`true`).

**[Policy]** Add explicit decision:

- If production source maps are publicly served: disable public source maps or
  scan public maps for high-signal literals.
- If source maps are private/upload-only: exclude them from client-served
  sentinel checks and protect upload/storage access.

---

# Phase 4 — Route governance without drift

## 4.1 Use executable registry + generated governance inventory

Split layers:

### Runtime registry

Executable concerns:

- path,
- component,
- placement,
- environment,
- feature flag,
- redirect target,
- public/admin/dev/prod-disabled classification.

### Policy registry

Security/export concerns:

- auth boundary,
- fund scope,
- role policy,
- workflow policy,
- data authority,
- export policy.

### Generated inventory

Docs enrichment:

- owner,
- decision doc,
- decision date,
- review cadence,
- rollback,
- telemetry key.

This avoids turning one TypeScript file into a false master record while still
keeping CI-enforced consistency.

## 4.2 Route tests must import compiled objects

**[Code]** `client/src/app/route-governance-registry.ts` imports `APP_ROUTES`,
`ARCHIVED_PLACEHOLDER_ROUTES`, `LP_ROUTES`, `PUBLIC_ENTRY_ROUTES`,
`ADMIN_GATED_ROUTES`, `LEGACY_REDIRECT_ROUTES` from `@/App` (lines 1-8).

Tests should import:

- `APP_ROUTES`,
- `ARCHIVED_PLACEHOLDER_ROUTES`,
- `PUBLIC_ENTRY_ROUTES`,
- `LP_ROUTES`,
- active `getNavigationItems()`,
- governance registry.

Do not rely on regex.

## 4.3 Conditional nav parity

Corrected rule:

- every active nav item must map to a governed route;
- every governed `core-nav`/`footer-nav` route must be representable in active
  nav **when its environment, flags, and role/workflow constraints allow it**;
- feature-gated nav must have tests for on/off states.

## 4.4 Structural guard moves earlier

**[Code]** `client/src/app/app-layout.tsx` imports `Sidebar` from
`@/components/layout/sidebar`.
`client/src/components/layout/expandable-sidebar.tsx` has zero production
importers. `client/src/config/navigation.ts` has zero production importers.

Add this in PR 2, not PR 8:

- `AppLayout` imports canonical `Sidebar`,
- `client/src/config/navigation.ts` has no production importers,
- `ExpandableSidebar` has no production importers,
- active nav source is unique.

Deletion can still occur later after test cleanup.

---

# Phase 5 — Shared provenance contracts

## 5.1 Shared schema

Add `shared/contracts/data-provenance-v1.contract.ts` (following existing
kebab-case naming convention), not just a client type.

**[Code]** The codebase already has
`shared/contracts/reserve-ic-decision-v1.contract.ts:28-102`
(`ReserveIcDecisionProvenanceSchema`) as a provenance template. The new schema
should be compatible with or extend this pattern.

```ts
export const DataProvenanceSchema = z.object({
  schemaVersion: z.literal('1.0'),
  state: z.enum([
    'LIVE',
    'PARTIAL',
    'FALLBACK',
    'DEMO',
    'UNAVAILABLE',
    'FAILED',
  ]),
  sourceAuthority: z.enum([
    'authoritative',
    'non_authoritative',
    'demo',
    'unknown',
  ]),
  calculationMode: z.enum([
    'complete',
    'partial',
    'fallback',
    'not_applicable',
  ]),
  source: z.string(),
  sourceLabel: z.string().optional(),
  fundId: z.number().int().positive().optional(),
  asOfDate: z.string().datetime().nullable().optional(),
  calculatedAt: z.string().datetime().nullable().optional(),
  generatedAt: z.string().datetime().nullable().optional(),
  configVersion: z.string().optional(),
  publishedAt: z.string().datetime().nullable().optional(),
  warnings: z.array(z.string()).default([]),
  fallbackReason: z.string().optional(),
  freshness: z.enum(['fresh', 'stale', 'unknown']),
  exportEligibility: z.enum([
    'allowed',
    'allowed_approved_partial',
    'blocked_non_authoritative',
    'blocked_demo',
    'blocked_failed',
    'blocked_unavailable',
    'blocked_policy',
  ]),
  correlationId: z.string().optional(),
});
```

**[Policy]** The `schemaVersion` field ensures future additions are additive.
The existing `ReserveIcDecisionProvenanceSchema` can be migrated to include
`schemaVersion` in a future refactor.

## 5.2 Wire contract rule

Every server endpoint feeding a material financial UI must include:

```ts
provenance: DataProvenanceSchema;
```

This must be additive and versioned where needed.

## 5.3 Zod network boundary

**[Code]** `client/src/hooks/use-moic.ts` does not currently validate against
`FundMoicRankingsResponseV1Schema`. It uses
`useQuery<FundMoicRankingsResponseV1>` with manual JSON parsing.

Client hooks must parse responses with Zod. If provenance is missing or invalid:

- parse fails,
- UI renders `FAILED`,
- telemetry emits `route_data_state` with `FAILED`,
- UI does not silently infer `FALLBACK`.

## 5.4 Centralized rendering wrapper

To avoid rollout brittleness, PR 4 should ship a central component:

```tsx
<ProvenanceBoundary provenance={provenance}>
  {liveOrPartialContent}
</ProvenanceBoundary>
```

It centrally handles all six states. Individual components can become exhaustive
later; the rollout does not need every component to switch on every state on day
one.

---

# Phase 6 — Forecast, cashflow, and reports trust migration

## 6.1 Forecast fallback semantics

The server can catch projected metric failure and fall back to defaults. The
response currently carries sources, config, and warnings.

Final rule:

- fallback must be explicit in shared response contract,
- `state = FALLBACK`,
- `calculationMode = fallback`,
- `sourceAuthority = non_authoritative` or `authoritative` depending on policy,
  but export blocked by default,
- `asOfDate` and `calculatedAt` should be null/omitted if values are static
  config defaults,
- UI should say "Default values from configuration vN," not "freshly
  calculated."

This addresses the review's as-of-date concern.

## 6.2 Cashflow server-sourced model

The cashflow demo fallback fix is necessary but not sufficient. The trust
register still says dashboard liquidity analysis and forecasts should use
fund-scoped server endpoints instead of generated browser inputs.

Final rule:

- production material cashflow metrics come from server response with
  provenance,
- no client-generated material values in production,
- empty source renders `UNAVAILABLE`,
- failure renders `FAILED`.

## 6.3 Reports cards

Reports dashboard cards must independently track provenance for:

- report list,
- latest report,
- active alerts,
- default baseline.

No shared "everything failed" collapse.

---

# Phase 7 — MOIC promotion as fund-scoped child surface

## 7.1 Product rationale

MOIC ranking is valuable because Tactyc's reserve ranking ranks each company by
expected return on planned reserves, and Exit MOIC on Planned Reserves is the
expected return on the next dollar into each company. Tactyc's MOIC content says
planned-reserve MOIC is especially useful for optimizing reserves and comparing
one company's reserves to another.

## 7.2 Current risk

**[Code]** `client/src/pages/moic-analysis.tsx:51-180` defines
`const moicData: MOICMetric[] = [...]` with 8 hardcoded companies. This static
array is used for the **primary table, cards, and ranking UI** (lines 189, 208,
321, 345, 369). The live API (`useFundMoicRankings`) is only used for a
conditional "Follow-on Rankings" section at the bottom (line 406).

**[Inference]** This means the page is **mostly fake** even when a `fundId` is
present. Deleting `moicData` without making the API the primary data source
would break the page.

## 7.3 Final route model

Preferred promotion:

- `/fund-model-results/:fundId/moic-analysis`, or
- a tab/action inside `/fund-model-results/:fundId`.

Keep `/moic-analysis?fundId=` only as compatibility/deep link if necessary.

## 7.4 Prerequisites

1. Delete static `moicData`.
2. Make `useFundMoicRankings` the **primary** data source for the main UI.
3. Add provenance to `shared/contracts/fund-moic-v1.contract.ts` (currently
   lacks it).
4. Parse response with Zod at client boundary (`client/src/hooks/use-moic.ts`
   must import `FundMoicRankingsResponseV1Schema`).
5. Render `Access Denied` for 401/403.
6. Render `No Data` for empty live ranking.
7. Add telemetry.
8. Add production bundle sentinel for old sample names.

---

# Phase 8 — LP Reporting promotion with role and workflow policy

## 8.1 Current state

**[Code]** LP Reporting import routes use `requireAuth`
(`server/lib/auth/jwt.ts:218`) and LP-specific middleware (`requireLPAccess`,
`requireLPFundAccess` from `server/middleware/requireLPAccess.ts`). Metric-run
routes cover dry-run, commit, approval, lock, report package, exports, evidence
records, and narrative workflows (`server/routes/lp-reporting/metric-runs.ts`).

## 8.2 Role vocabulary audit

Before enforcing role policy:

- audit all `requireLPAccess` callers (not generic `requireRole`),
- enumerate existing JWT role vocabulary (`lp`, `gp`, `admin`),
- decide LP/GP/Admin policies,
- add shared role schema if missing,
- update server middleware tests.

**[Code]** `requireLPAccess` checks
`req.user.roles?.includes('lp') || req.user.role === 'lp'` (line 51). Do not
assume LP roles exist just because JWT supports `role` and `lpId`.

## 8.3 Workflow-state gates

Promotion requires policy for:

- dry-run-only state,
- draft metric run,
- evidence-complete draft,
- approved,
- locked,
- report package assembled,
- export-ready,
- export-blocked.

## 8.4 E2E harness

**[Code]** `playwright.lp-reporting.config.ts` already targets
`lp-reporting-package-flow.spec.ts` and configures LP Reporting test output. It
runs with `REQUIRE_AUTH: '0'` and `ALLOW_MEMORY_STORAGE: '1'`.

**[Policy]** Use the existing Playwright config for functional coverage, but add
**auth-enabled integration tests** before production promotion because the E2E
harness does not validate the auth middleware.

Do not create parallel E2E infrastructure unless existing configs are
insufficient.

---

# Phase 9 — Telemetry with privacy and health gates

## 9.1 Redacted event schemas

### `archived_redirect_hit`

Fields:

- `fromPath`
- `toPath`
- `hadFundIdParam: boolean`
- `routeFamily`
- `clientSessionIdHash` if already approved
- `userRoleClass` attached server-side if available
- no raw referrer
- no user email/id
- no fund name
- retention ≤ 90 days unless legal/compliance approves longer.

### `route_viewed`

Client fields:

- route key,
- surface key,
- placement,
- flag state,
- fund ID present boolean or hashed scoped ID if approved.

Role should be attached server-side on ingestion where possible.

## 9.2 Default promotion health gates

For MOIC/LP Reporting staging soak:

- at least 7 days or agreed minimum test window,
- route load error ≤ 0.5%,
- failed data state ≤ 1% excluding planned outage tests,
- zero unhandled 401/403-as-empty regressions,
- zero server export from non-authoritative provenance,
- no production bundle sentinel violations,
- no auth/fund-scope failure spike attributable to the promoted surface,
- rollback drill completed.

For limited production:

- kill switch tested,
- telemetry dashboard live,
- owner/on-call identified,
- failure budget defined.

---

# Phase 10 — External public contracts and archived redirects

README defines `/shared/:shareId` and `/portal/:rest*` as intentional public
contracts. Archived placeholder routes preserve redirects in code.

Final governance:

- public contracts are externally supported unauthenticated product contracts,
- archived redirects are compatibility contracts,
- neither should be confused with arbitrary client route reachability.

Each archived redirect needs:

- owner,
- reason,
- target,
- telemetry,
- deprecation criteria,
- retention review.

---

# Phase 11 — Canonical flow trust: XState/wizard persistence

Accepted as a trust-adjacent gap. The README canonical flow depends on
`/fund-setup -> review -> publish -> /fund-model-results/:fundId`. DECISIONS.md
includes ADR-016 for XState Wizard Persistence.

Final strategy:

- keep this outside P0 route governance,
- add it as P3 canonical-flow trust dependency,
- ensure governance changes do not distract from wizard data-loss prevention,
- add a readiness check for canonical flow persistence before broad surface
  promotion.

---

# Phase 12 — Dead nav cleanup

## 12.1 Current facts

**[Code]** Active layout (`client/src/app/app-layout.tsx`) renders `Sidebar`,
not `ExpandableSidebar`. `ExpandableSidebar`
(`client/src/components/layout/expandable-sidebar.tsx`) includes links to
mock-backed routes. The legacy nav file (`client/src/config/navigation.ts`)
defines many stale routes. Neither has production importers.

## 12.2 Final order

1. PR 2: add structural guard against production imports.
2. Replace tests importing `ExpandableSidebar`.
3. PR 8: delete `client/src/config/navigation.ts`.
4. PR 8: delete `expandable-sidebar.tsx`.
5. Keep historical summary only in docs if needed.

---

# Revised PR Sequence

## PR 0 — Decision authority and boundary baseline

- Update Secondary Surface Decisions.
- Add CODEOWNERS for Secondary Surface Decisions.
- Add security boundary matrix.
- Add `/reserves-demo` branch decision.
- Add ADR index/dedup check.
- Add external public-contract definitions.
- Add server-surface governance audit (moved from Phase 12).
- Add CI check for unmounted route files.

## PR 1 — Build-time quarantine and P0A production safety

- Move dev-only lazy imports to production-excluded modules.
- Production-exclude mock-backed routes.
- Remove client-side Tear Sheet mock export.
- Production-disable Tear Sheet mock tab/grid.
- Implement ratified `/reserves-demo` branch.
- Fix Reports Active Alerts failure coercion.
- Add prod manifest and chunk ownership checks.
- Add source-level mock guard.
- Add high-signal bundle sentinel scan.
- Decide source-map serving policy.

## PR 2 — Governance execution layer

- Extend route governance with executable/policy/docs layers.
- Add compiled-object route/nav/governance tests.
- Add structural guard for active nav source.
- Add external public-contract allowlist.
- Add archived redirect redacted telemetry schema.
- Lock cashflow demo fallback (P1 regression test).

## PR 3 — Shared provenance contract

- Add shared Zod provenance schema
  (`shared/contracts/data-provenance-v1.contract.ts`).
- Add central `ProvenanceBoundary`.
- Add export eligibility primitive.
- Require material financial APIs to carry provenance additively.
- Missing provenance at network boundary maps to `FAILED`.
- Update `client/src/hooks/use-moic.ts` to validate against
  `FundMoicRankingsResponseV1Schema`.

## PR 4 — Visible trust migration

- Forecast fallback contract and UI.
- Reports card provenance.
- Cashflow server-read model or explicit unavailable state.
- Scenario Modeling tab hidden or converted to real fund-scoped link.
- Canonical flow persistence status noted.

## PR 5 — MOIC fund-scoped qualification

- Delete static `moicData` and make API the primary data source.
- Add provenance to `shared/contracts/fund-moic-v1.contract.ts`.
- Prefer `/fund-model-results/:fundId` tab/child placement.
- Keep query-param route only as compatibility if needed.
- Add 401/403 Access Denied state.
- Add telemetry and health gates.
- Add production bundle sentinel for old sample names.
- Quarantine benchmarking dashboard if still mock-backed.

## PR 6 — LP Reporting qualification

- Audit `requireLPAccess` and LP role schema (not generic `requireRole`).
- Define workflow-state gates.
- Enforce server-side role/workflow policy.
- Add provenance to report package/export states.
- Use existing `playwright.lp-reporting.config.ts` for functional E2E.
- Add auth-enabled integration tests.
- Add telemetry and health gates.

## PR 7 — Dead nav deletion

- Delete stale nav file (`client/src/config/navigation.ts`).
- Delete `ExpandableSidebar`
  (`client/src/components/layout/expandable-sidebar.tsx`).
- Update tests.
- Keep single active nav source guard.

---

# Final Acceptance Criteria

The strategy is complete only when:

1. `/reserves-demo` follows its ratified branch and is not accidentally public.
2. Tear Sheet mock export is gone from production.
3. Mock Tear Sheets do not render in production unless live-backed or explicitly
   non-production demo.
4. Reports never converts dashboard failure into `0 / Stable`.
5. Production build excludes quarantined route chunks, not just route entries.
6. Bundle scans and source guards both pass.
7. Public source-map policy is explicit.
8. Governance tests import and validate executable route/nav objects.
9. `isProtected`/fund context guard is not treated as auth.
10. Material financial APIs return shared Zod provenance.
11. Missing/invalid provenance maps to `FAILED`.
12. Server exports are authoritative binary/artifact flows, not client-rendered
    PDFs from JSON.
13. MOIC is fund-scoped, static sample data removed, API is primary data source,
    and provenance-backed.
14. LP Reporting promotion has role and workflow-state policy.
15. Telemetry is redacted and health gates are numeric.
16. Archived redirects are treated as compatibility contracts.
17. Server route inventory covers mounted, unmounted, docs-only, and placeholder
    APIs.
18. CI check prevents unmounted route files from being silently ignored.
19. Dead nav artifacts are deleted after structural guards are in place.
20. Canonical flow remains protected by regression tests and wizard persistence
    status is tracked.
