---
status: REFERENCE
last_updated: 2026-05-20
owner: Core Team
categories: [reviews, refactor, code-quality]
keywords: [code-quality, audit, duplicates, refactor]
source_of_truth: false
related:
  - docs/governance/2026-05-19-refactor-roadmap.md
---

# Updog_restore Code Quality Audit Report

> Reference status: this raw audit is supporting evidence. Use
> `docs/governance/2026-05-19-refactor-roadmap.md` for the canonical execution
> order.

## Repository Overview

| Metric                | Count                    |
| --------------------- | ------------------------ |
| Client TS/TSX files   | 767 (318 .ts + 448 .tsx) |
| Server TS/JS files    | 374                      |
| Shared TS/TSX files   | 185                      |
| Test files            | 675                      |
| Barrel files (client) | 27                       |
| TODO/FIXME/HACK       | 56                       |

---

## 2026-05-19 Verification Update

This report has been reconciled with the latest solo/internal refactor plan. The
duplicate-code findings remain useful, but several "delete now" findings were
reclassified:

- Root `src/` is not an 18-file ghost directory in the current tree. It contains
  one tracked file, `src/core/routes/ia.ts`, and route-story tests import it.
- `shared/money.ts` and `shared/lib/money.ts` encode different semantics
  (`bigint` cents vs Decimal math). Treat this as a semantic migration, not a
  simple duplicate deletion.
- `client/src/machines/modeling-wizard.machine.ts` is active and covered by
  tests; do not remove it as dead code.
- Root `archive/` is absent. Any `_archive/` cleanup needs its own manifest.
- Product-code refactors should wait behind golden/domain tests and route
  contract tests, especially for fund stores, schema renames, engines, route
  metadata, and money utilities.

### 2026-05-19 Route/Test Execution Addendum

This addendum describes branch-local work in
`C:\dev\Updog_restore\.worktrees\refactor-plan-execution`, not code already
merged into this main workspace:

- `tests/unit/routes/deal-pipeline.contract.test.ts` covers deal-pipeline
  validation, fund-scope rejection, missing-deal response shape, and semantic
  idempotency replay for create/import/stage/delete/bulk actions on that branch.
- `tests/unit/server/route-surface-inventory.test.ts` records auth posture,
  mount surface, duplicate aliases, and external ownership for metrics/RUM on
  that branch.
- `server/routes/deal-pipeline.ts` uses an instantiated idempotency middleware
  on mutating routes on that branch. The previous direct factory registration
  was a correctness bug, not just a style issue.
- Capital allocation duplication is no longer a current high-priority cleanup
  target when client files are thin shared-engine re-export stubs.
- Fund-store consolidation remains valid, but it must start with an import and
  persistence audit. The two stores share the `investment-strategy` key with
  different persisted versions/shapes, so naive "merge then delete" can corrupt
  or drop local state.

## Issue 1: Root `src/` Route Metadata Mirror | **P1 - HIGH**

**Evidence:**

- Current tracked root `src/` contains one file: `src/core/routes/ia.ts`
- `tests/unit/app/legacy-route-map.test.ts` and
  `tests/unit/app/ia-route-story.test.ts` import it
- Related integration and PR docs reference the IA route map

**Impact:** A root `src/` boundary remains confusing beside `client/src/`, but
the current file is active route metadata rather than disposable dead code.

**Recommendation:** Do not delete root `src/` as a first cleanup action. Move
`src/core/routes/ia.ts` to a clearer route metadata location only after
adding/keeping route contract tests and updating all imports/docs. Delete the
root directory only after the consumer migration is complete.

---

## Issue 2: Duplicate State Management - fundStore.ts vs useFundStore.ts | **P0 - CRITICAL**

**Evidence:** | File | Lines | State Library | |------|-------|---------------|
| `client/src/stores/fundStore.ts` | 1,022 | `zustand/vanilla` (createStore) | |
`client/src/stores/useFundStore.ts` | 364 | `zustand` (create) | |
`client/src/state/useFundStore.ts` | 7 | Re-export from stores/ |

Both files define the **exact same types** (`StrategyStage`, `LPClass`, `LP`)
and **identical state shape** (`stages`, `sectorProfiles`, `allocations`,
`followOnChecks`). The 1,022-line `fundStore.ts` uses `zustand/vanilla`
(imperative), while the 364-line `useFundStore.ts` uses `zustand` (React hooks).

```typescript
// fundStore.ts (line 1)
import { createStore } from 'zustand/vanilla';
// useFundStore.ts (line 1)
import { create } from 'zustand';
```

**Recommendation:** Audit before consolidating. Build an import/consumer matrix
for `client/src/stores/fundStore.ts`, `client/src/stores/useFundStore.ts`, and
`client/src/state/useFundStore.ts`; identify non-React consumers; inventory the
shared `investment-strategy` persistence key, versions, partialized fields, and
migrations; then choose between vanilla core + React adapter, a single React
store, or status quo plus a lint guard. Do not merge the stores until the
persistence migration path is explicit.

---

## Issue 3: Dual `shared/schema/` and `shared/schemas/` Directories | **P1 - HIGH**

**Evidence:**

```
/shared/schema/         (8 files)  - Uses pgTable (drizzle ORM schemas)
  fund.ts, portfolio.ts, user.ts, shares.ts, scenario.ts, ...
/shared/schemas/        (22 files) - Uses z.object() (Zod validation schemas)
  fund-model.ts, portfolio-route.ts, reserves-schemas.ts, ...
```

Both directories contain fund-related schema definitions but use completely
different schema systems (Drizzle ORM vs Zod). New developers cannot determine
which to use without reading file contents.

**Recommendation:** Rename directories to reflect their purpose:
`shared/schema/` -> `shared/db-schema/` (Drizzle ORM) and `shared/schemas/` ->
`shared/validation-schemas/` (Zod). Update all imports across the codebase.

---

## Issue 4: Nearly Identical type-guards.ts Files | **P1 - HIGH**

**Evidence:** | File | Lines | Identical Functions |
|------|-------|---------------------| | `shared/utils/type-guards.ts` | 223 |
isDefined, isNotNull, isString, isNumber, isBoolean, isRecord, ... | |
`client/src/lib/type-guards.ts` | 222 | isDefined, isNotNull, isString,
isNumber, isBoolean, isRecord, ... |

Both files export `isDefined<T>()`, `isNotNull<T>()`, `isString()`,
`isNumber()`, `isBoolean()`, `isRecord()`, and ~15 more. Diff shows **>95%
content duplication**. The shared version has comprehensive JSDoc; the client
version has minimal comments.

**Recommendation:** Delete `client/src/lib/type-guards.ts`. Re-export from
`shared/utils/type-guards.ts` via `client/src/lib/index.ts` barrel. The shared
version should be the single source of truth since `type-guards` is a
cross-cutting utility.

---

## Issue 5: Duplicate money.ts - Different Implementations | **P1 - HIGH**

**Evidence:**

```typescript
// shared/money.ts (18 lines) - Cents/bigint approach
export type Cents = bigint;
export const toCents = (n: number): Cents => BigInt(Math.round(n * 100));
export const addCents = (a: Cents, b: Cents): Cents => a + b;

// shared/lib/money.ts (187 lines) - Decimal.js approach
import Decimal from '@shared/lib/decimal-config';
export const roundP = (n: Decimal.Value, places = 6): Decimal => ...
```

Two completely different money handling implementations in the same `shared/`
package. The root `shared/money.ts` uses `bigint` cents; `shared/lib/money.ts`
uses `Decimal.js`.

**Recommendation:** Treat this as a semantic migration, not cleanup. First map
consumers of `shared/money.ts` and `shared/lib/money.ts`, then decide whether
cents-based arithmetic should remain as a named compatibility module or be
migrated behind explicit adapters. Do not make `shared/money.ts` a blind
re-export of `shared/lib/money.ts`; that would silently change `bigint` cents
semantics to Decimal semantics.

---

## Issue 6: Three ComingSoonPage Components | **P1 - HIGH**

**Evidence:** | File | Lines | Props | |------|-------|-------| |
`client/src/components/ComingSoonPage.tsx` | ~125 | `hub`, `eta?`, `features?`,
`showBackButton?` | | `client/src/components/common/ComingSoonPage.tsx` | ~9 |
`title`, `eta?`, `copy?` | | `src/components/common/ComingSoonPage.tsx` (ghost)
| n/a | Stale audit row; no longer present in current root `src/` |

The root `components/ComingSoonPage.tsx` is imported by pages
(`/components/ComingSoonPage` self-references at lines 85, 103, 121). The
`common/` version is simpler but may have stale consumers.

**Recommendation:** Consolidate to the richer `components/ComingSoonPage.tsx`
(the one with `hub`, `features`, `showBackButton` props) only after import
scans. Delete or redirect `components/common/ComingSoonPage.tsx` if no active
callers require the smaller API. No root `src/components/common/` copy remains
in the current tree.

---

## Issue 7: Duplicate Capital Allocation Engine (12 Files) | **P1 - HIGH**

**Evidence:** 12 files exist in BOTH locations with identical names:

```
shared/core/capitalAllocation/CapitalAllocationEngine.ts
client/src/core/capitalAllocation/CapitalAllocationEngine.ts
shared/core/capitalAllocation/adapter.ts
client/src/core/capitalAllocation/adapter.ts
shared/core/capitalAllocation/allocateLRM.ts
client/src/core/capitalAllocation/allocateLRM.ts
... (plus cohorts.ts, invariants.ts, pacing.ts, periodLoop.ts,
     periodLoopEngine.ts, periods.ts, rounding.ts, sorting.ts, types.ts, units.ts)
```

The shared/ versions are the canonical server-safe implementations; the
client/src/ versions may be browser-specific adaptations or stale copies.

**Recommendation:** Audit each file pair. If the client version is a re-export
stub (like `ReserveEngine.ts`), keep only the re-export. If the client version
has browser-specific logic, rename it clearly (e.g.,
`CapitalAllocationEngine.client.ts`). Add a README to
`client/src/core/capitalAllocation/` documenting the relationship to
`shared/core/capitalAllocation/`.

---

## Issue 8: Duplicate Reserve Engines | **P1 - HIGH**

**Evidence:**

```typescript
// client/src/core/reserves/ReserveEngine.ts
export {
  ReserveEngine,
  generateReserveSummary,
} from '@shared/core/reserves/ReserveEngine';
// (1 line - correct re-export)

// client/src/core/reserves/ConstrainedReserveEngine.ts
// client/src/core/reserves/DeterministicReserveEngine.ts
// (Full implementations? Need audit)
```

While `ReserveEngine.ts` properly re-exports from shared, the sibling files
(`ConstrainedReserveEngine.ts`, `DeterministicReserveEngine.ts`) may have full
implementations that diverge from shared.

**Recommendation:** Standardize all reserve engine files to re-export from
`shared/core/reserves/`. Any client-specific behavior should be in
adapter/wrapper files with `.client.ts` suffix. Audit
`ConstrainedReserveEngine.ts` and `DeterministicReserveEngine.ts` for
divergence.

---

## Issue 9: Pages Directory Naming Chaos (3 Conventions) | **P2 - MEDIUM**

**Evidence:**

```
PascalCase (15):  FundBasicsStep.tsx, DistributionsStep.tsx, ReviewStep.tsx, ...
kebab-case (27):  allocation-manager.tsx, cash-management.tsx, fund-model-results.tsx, ...
camelCase (37):   dashboard.tsx, pipeline.tsx, planning.tsx, settings.tsx, ...
```

**Recommendation:** Standardize on PascalCase for page components (Next.js
convention). Create a migration script to rename all files. Example renames:

- `dashboard.tsx` -> `DashboardPage.tsx`
- `fund-model-results.tsx` -> `FundModelResultsPage.tsx`
- `allocation-manager.tsx` -> `AllocationManagerPage.tsx`

---

## Issue 10: Components Subdirectory Naming Inconsistency | **P2 - MEDIUM**

**Evidence:** All component subdirectories use **kebab-case** (e.g.,
`capital-allocation/`, `lp-reporting/`, `monte-carlo/`), but the COMPONENT FILES
inside use **PascalCase**. This inconsistency is pervasive across 46 component
directories.

**Recommendation:** Standardize directory names. Either:

- (A) Rename directories to PascalCase to match their files (`fund-results/` ->
  `FundResults/`), OR
- (B) Keep directories as kebab-case (common convention) and document the
  standard in `client/src/components/README.md`.

Option B is preferred - just document the convention.

---

## Issue 11: Overcrowded UI Components Directory | **P2 - MEDIUM**

**Evidence:**

- `client/src/components/ui/` contains **77 files** (the largest directory)
- Contains: cards, dialogs, forms, tables, charts, layout elements, navigation,
  feedback components

**Recommendation:** Split into subdirectories by category:

```
components/ui/
  card/           (Card, CardHeader, CardFooter, ...)
  dialog/         (Dialog, DialogOverlay, DialogContent, ...)
  form/           (Input, Select, Checkbox, ...)
  table/          (Table, TableRow, TableCell, ...)
  layout/         (Sidebar, Header, Footer, ...)
  feedback/       (Toast, Alert, Progress, ...)
  navigation/     (Tabs, Breadcrumb, Pagination, ...)
```

---

## Issue 12: Duplicate Feature Flag Systems | **P2 - MEDIUM**

**Evidence:**

```
client/src/shared/useFlags.ts           (130 lines - React hook)
client/src/core/flags/featureFlags.ts   (unknown size)
client/src/core/flags/unifiedClientFlags.ts  (unknown size)
client/src/core/flags/flagAdapter.ts    (unknown size)
shared/feature-flags/flag-definitions.ts (canonical source)
shared/flags/getFlag.ts                 (canonical source)
shared/flags/index.ts                   (barrel)
```

`client/src/shared/useFlags.ts` imports from
`@shared/feature-flags/flag-definitions` and `@shared/utils/type-guards`, but is
placed in a confusing `client/src/shared/` directory (singular, not matching the
`@shared` package alias).

**Recommendation:** Move `useFlags.ts` to `client/src/hooks/` (where 56 other
hooks live). Delete the `client/src/shared/` directory entirely. Ensure all flag
imports go through the `@shared` package, not a local mirror.

---

## Issue 13: Duplicate Directory Pairs (lp/lps, investment/investments) | **P2 - MEDIUM**

**Evidence:**

```
client/src/components/lp/       (7 files: CapitalAccountTable, CapitalCallsWidget, ...)
client/src/components/lps/      (5 files: LPCard, WaterfallEditor, README, examples, index)

client/src/components/investment/   (1 file: fund-liquidation-warnings.tsx)
client/src/components/investments/  (20 files: BulkImportModal, enhanced-investments-table, ...)
```

These near-identical names create confusion about where new files should go.

**Recommendation:**

- Merge `lp/` contents into `lps/` (lps/ has more files + barrel). Delete `lp/`.
- Move `investment/fund-liquidation-warnings.tsx` into `investments/` with a
  clearer name. Delete `investment/`.

---

## Issue 14: Duplicate Utility Files (pLimit, resilientLimit, type-guards) | **P2 - MEDIUM**

**Evidence:**

```
File                        shared/              client/src/utils/       Client Lines
pLimit.ts                   34 lines             2 lines (re-export)   OK
resilientLimit.ts           62 lines             6 lines (re-export)   OK
type-guards.ts              223 lines            N/A (in lib/)         222 lines (full dup)
```

`client/src/utils/pLimit.ts` and `resilientLimit.ts` are proper re-exports (2-6
lines). But `type-guards.ts` is a full 222-line duplicate at
`client/src/lib/type-guards.ts`.

**Recommendation:** Convert `client/src/lib/type-guards.ts` to a 2-line
re-export stub:

```typescript
export * from '@shared/utils/type-guards';
```

---

## Issue 15: Massive Components (>700 lines) | **P2 - MEDIUM**

**Evidence:** | File | Lines | Issue | |------|-------|-------| |
`client/src/pages/variance-tracking.tsx` | 2,339 | **4x recommended max** -
contains chart logic, table logic, filtering, export, all in one file | |
`client/src/components/portfolio/tabs/AllocationsTab.tsx` | 1,853 | Multiple
sub-components, state management, API calls | |
`client/src/pages/lp-reporting/metrics.tsx` | 1,796 | Multiple metric cards,
chart configurations, data transforms | |
`client/src/pages/fund-model-results.tsx` | 1,658 | Results display, comparison
logic, export handling | |
`client/src/components/investments/portfolio-company-detail.tsx` | 990 |
Editing, display, validation, tabs all in one component |

**Recommendation:** Extract sub-components, custom hooks, and utility functions.
For `variance-tracking.tsx`, extract:

- `useVarianceData()` hook for data fetching
- `<VarianceChart />` sub-component
- `<VarianceTable />` sub-component
- `exportVariance()` utility
- Filter/sidebar logic into `<VarianceFilters />`

Target: No component file >400 lines.

---

## Issue 16: Test File Naming Inconsistency | **P3 - LOW**

**Evidence:**

```
*.test.tsx: 21 files  (e.g., POVComponents.test.tsx, chart-theme.test.ts)
*.spec.tsx:  2 files  (e.g., reserves.spec.ts, finalizePayload.spec.ts)
```

Both `.test.` and `.spec.` extensions used inconsistently within the same test
directories.

**Recommendation:** Standardize on `.test.ts` (Jest/Vitest convention). Rename
the 4 `.spec.` files:

- `reserves.spec.ts` -> `reserves.test.ts`
- `finalizePayload.spec.ts` -> `finalizePayload.test.ts`

---

## Issue 17: 56 TODO/FIXME Comments Without Tracking | **P3 - LOW**

**Evidence:**

```
client: 26 TODOs
server: 30 TODOs
shared: 0 TODOs
```

Examples:

```typescript
// client/src/lib/excel-parity-validator.ts:54
// TODO: Update EngineCompany to use CanonicalStage directly (tracked in tech debt plan)

// client/src/lib/wizard-reserve-bridge.ts:491
// TODO: Migrate callers to transformWizardToReserveRequest + DeterministicReserveEngine

// client/src/components/investments/enhanced-investments-table.tsx:363
// TODO: call bulk import API
```

**Recommendation:** Create a `TECH_DEBT.md` file at repo root cataloging all
TODOs with priority and assignee. Use GitHub issues or a project board. The
`wizard-reserve-bridge.ts` TODO at line 491 is **6 months old** (based on git
history) and represents a significant migration gap.

---

## Issue 18: Duplicate `lib/index.ts` Barrel File Risk | **P3 - LOW**

**Evidence:** `client/src/lib/index.ts` is a 37-line barrel that exports
utilities AND defines an `api` client object:

```typescript
export * from '../utils/async-iteration';
export * from './type-guards';
// ... AND defines:
export const api = { async get<T>(url: string): Promise<T> { ... } }
```

This creates a circular dependency risk: `lib/index.ts` ->
`utils/async-iteration.ts` -> potentially back to `lib/`.

**Recommendation:** Move the `api` client object to `client/src/api/client.ts`.
Keep `lib/index.ts` as pure re-exports only. The `api` object at line 7 should
not be co-located with utility re-exports.

---

## Issue 19: Unused `useFlags.ts` Import from `@shared/utils/type-guards` | **P3 - LOW**

**Evidence:** `client/src/shared/useFlags.ts` imports `isRecord` from
`@shared/utils/type-guards` but only uses it in one function. Meanwhile,
`client/src/lib/type-guards.ts` (the local duplicate) also exports `isRecord`.

**Recommendation:** After consolidating `type-guards.ts` (Issue 4), audit all
`@shared/utils/type-guards` imports in the client. Remove the local duplicate
and ensure a single import path.

---

## Issue 20: Root Archive Finding Superseded | **P3 - LOW**

**Evidence:**

```
archive/      absent in current tree
_archive/     present, separate cleanup target if needed
```

**Recommendation:** No action remains for the old `archive/` path. If
`_archive/` enters scope, classify it separately in the cleanup manifest and
scan references before deleting.

---

## Summary Matrix

| #   | Category               | Severity | File(s)                                              | Lines                     |
| --- | ---------------------- | -------- | ---------------------------------------------------- | ------------------------- |
| 1   | Boundary cleanup       | P1       | `src/core/routes/ia.ts`                              | 1 active file             |
| 2   | Duplication            | P0       | `stores/fundStore.ts` + `stores/useFundStore.ts`     | 1,386                     |
| 3   | Naming                 | P1       | `shared/schema/` vs `shared/schemas/`                | 30 files                  |
| 4   | Duplication            | P1       | `shared/utils/type-guards.ts` + `lib/type-guards.ts` | 445                       |
| 5   | Semantic migration     | P1       | `shared/money.ts` + `shared/lib/money.ts`            | 205                       |
| 6   | Duplication            | P1       | 3x `ComingSoonPage.tsx`                              | 143                       |
| 7   | Superseded duplication | P3       | Capital Allocation client/shared stubs               | verify as re-export shims |
| 8   | Duplication            | P1       | Reserve Engines (unaudited)                          | ~800                      |
| 9   | Naming                 | P2       | `pages/` (3 naming conventions)                      | 79 files                  |
| 10  | Naming                 | P2       | Component dirs (kebab) vs files (Pascal)             | 46 dirs                   |
| 11  | Complexity             | P2       | `components/ui/` overcrowded                         | 77 files                  |
| 12  | Duplication            | P2       | 3x Feature Flag systems                              | ~500                      |
| 13  | Naming                 | P2       | `lp/`+`lps/`, `investment/`+`investments/`           | 33 files                  |
| 14  | Duplication            | P2       | `type-guards` (full dup) + `pLimit`/`resilientLimit` | 256                       |
| 15  | Complexity             | P2       | 5 components >700 lines                              | 7,640                     |
| 16  | Consistency            | P3       | `.test.` vs `.spec.` naming                          | 4 files                   |
| 17  | Consistency            | P3       | 56 TODOs without tracking                            | N/A                       |
| 18  | Imports                | P3       | `lib/index.ts` barrel + api client                   | 37                        |
| 19  | Imports                | P3       | Cross-import between local and shared type-guards    | 2 files                   |
| 20  | Superseded             | P3       | `archive/` absent; `_archive/` out of scope          | n/a                       |

---

## Top 5 Priority Actions

1. **Migrate root route metadata out of `src/core/routes/ia.ts` behind route
   tests** (P1) - active consumers exist
2. **Audit fundStore.ts vs useFundStore.ts before consolidation** (P0) -
   persistence keys and versions conflict
3. **Rename `shared/schema/` and `shared/schemas/` to be descriptive** (P1) - 30
   files affected
4. **Consolidate type-guards.ts to shared/utils/** (P1) - Eliminate 222-line
   duplicate
5. **Standardize `pages/` to PascalCase** (P2) - 79 files, automated rename
   script

---

_Audit performed on repository at `/mnt/agents/Updog_restore`_ _Total steps
used: 17/60_
