---
status: REFERENCE
last_updated: 2026-05-20
owner: Core Team
categories: [reviews, refactor, architecture]
keywords: [architecture, audit, refactor, route-boundaries]
source_of_truth: false
related:
  - docs/governance/2026-05-19-refactor-roadmap.md
---

# POVC Fund-Modeling Platform - Architectural Audit Report

> Reference status: this raw audit is supporting evidence. Use
> `docs/governance/2026-05-19-refactor-roadmap.md` for the canonical execution
> order.

**Auditor**: Senior Software Architect **Date**: 2025 **Scope**: Full-stack
monorepo (5,577 files, 222MB) **Stack**: React/Preact + Express + Drizzle ORM +
PostgreSQL + Redis + TypeScript

---

## Executive Summary

The POVC Fund-Modeling Platform exhibits **strong foundational architecture**
with good separation of concerns in the database layer, effective use of Drizzle
ORM, and well-structured client state management via Zustand + React Query.
However, **critical architectural issues** are accumulating across five major
areas: a **false monorepo** containing 5 tooling-coupled AI packages, **massive
route files** violating single-responsibility, **inconsistent API mounting
patterns**, a **600-line App.tsx god component**, and **production debug code**
in the client entry point. These issues will compound as the codebase scales
beyond its current 2,500+ code files.

**Top 5 Most Critical Issues**:

1. P0: 5 AI-agent packages are not app-runtime dependencies but remain
   tooling-coupled through scripts, tsconfigs, and docs
2. P0: App.tsx is a 600-line god component with routing, layout, auth, and
   providers
3. P1: 75 Express route files with manual registration and several large
   route-file boundaries
4. P1: Direct DB/storage imports remain in route files; the older 29%/71%
   service-delegation ratio is superseded by the 2026-05-19 route inventory
5. P1: Inconsistent API route mounting creating auth boundary confusion

---

## 2026-05-19 Verification Update

This architectural audit has been reconciled with the latest solo/internal
refactor plan. The architectural smells remain useful, but the execution order
and several deletion recommendations changed:

- `packages/*` is not imported by the production app, but it is still referenced
  by root scripts, package tests, `client/tsconfig.json`, docs, and AI tooling.
  Remove those references before deleting or extracting packages.
- `client/src/machines/modeling-wizard.machine.ts` is active. It is imported by
  `useModelingWizard`, `WizardShell`, submit/persistence tests, and docs. Do not
  delete or archive it until behavior is locked and callers are migrated.
- Root `src/` contains active route metadata at `src/core/routes/ia.ts` used by
  route-story tests. Treat it as a boundary cleanup item, not dead code.
- Route mounting cleanup must preserve existing URLs. This is not an `/api/v1`
  migration, and route contract tests should land before service extraction.
- No npm workspace adoption is recommended unless the packages become real app
  dependencies.

### 2026-05-19 Route Refactor Execution Addendum

The first route-refactor safety slice is implemented in the execution worktree
`C:\dev\Updog_restore\.worktrees\refactor-plan-execution` on branch
`codex/refactor-plan-execution`; it is not yet merged into this main workspace:

- Branch-local `tests/unit/routes/deal-pipeline.contract.test.ts` pins
  deal-pipeline endpoint contracts for invalid IDs, invalid cursors, missing
  deal envelopes, invalid import/bulk payloads, fund-scope rejection, and
  semantic idempotency replay.
- Branch-local `tests/unit/server/route-surface-inventory.test.ts` carries a
  typed route surface inventory with auth posture, mount surfaces, duplicate
  aliases, and external ownership for metrics/RUM endpoints.
- Branch-local `server/routes/deal-pipeline.ts` instantiates the idempotency
  middleware once before registering mutating routes. Passing the middleware
  factory directly caused those routes to hang rather than advancing the Express
  chain.
- Fresh route-file scan in the execution worktree: 75 files under
  `server/routes/`; 29 import `../services` or `@server/services`; 26 import
  `../db`, `../storage`, or `@server/db`. Treat the older "29% service usage /
  71% direct DB" ratio as superseded by query-dependent current inventory.
- Do not apply one generic "service layer" prescription to every large route
  file. `deal-pipeline.ts` and `lp-api.ts` are the direct-DB extraction targets;
  `monte-carlo.ts`, `portfolio-intelligence.ts`, and `variance.ts` need
  separately scoped treatment.
- `/metrics`, `/api/metrics`, `/metrics/rum`, and `/api/metrics/rum` are pinned
  as public compatibility surfaces with external observability consumers. Do not
  remove duplicate aliases before scraper/dashboard evidence is checked.

## 1. P0 — Tooling-Coupled AI Packages / False Monorepo

**Severity**: P0 (Critical) **Category**: Monorepo **Issue**: The `packages/`
directory contains 5 AI-agent packages that are not production app-runtime
dependencies, but they are still coupled to the repository through scripts,
package tests, tsconfigs, docs, and AI tooling. Calling them "0 references" is
no longer accurate.

**Evidence**:

```
packages/
  agent-core/                   app-runtime import surface is sparse; tooling references remain
  memory-manager/               tooling/docs references remain
  codex-review-agent/           tooling/docs references remain
  test-repair-agent/            package and test references remain
  bundle-optimization-agent/    package and script references remain
```

- Production app imports are sparse/non-runtime, but root tooling still
  references packages:
  - `package.json` has `lint:wave6:residual` and `test:wave6:packages` entries
    for `packages/*`
  - `client/tsconfig.json` includes
    `../packages/agent-core/src/ConversationMemory.ts` and
    `../packages/agent-core/src/Logger.ts`
  - `scripts/ai-tools/index.js`, `scripts/ai-tools/bundle-analyzer.mjs`,
    `scripts/codex-review-watch.ts`, and `scripts/init-memory-manager.ts` import
    package sources
  - Package `package.json` files reference `@povc/agent-core` through `file:`
    dependencies
- Root `package.json` still has no `workspaces` field.

**Recommendation**:

- First decide whether these are product dependencies or developer-only tooling.
- If developer-only, remove package references from scripts, tsconfigs, and AI
  tooling, then delete or extract the packages with `check`, `test:unit`, and
  `build:prod` validation.
- If they become real product dependencies, adopt npm workspaces deliberately.
  Do not add workspaces just to preserve unused packages.

```
# Target if these remain developer-only
external tooling repo or removed after reference cleanup
```

**Impact**: Reduces cognitive load, shrinks install surface, eliminates CI time
spent building unused packages.

---

## 2. P0 — App.tsx God Component (600+ Lines)

**Severity**: P0 (Critical) **Category**: Client **Issue**: `App.tsx` is a
600-line file that combines: route definitions (APP_ROUTES, LP_ROUTES,
ARCHIVED_PLACEHOLDER_ROUTES), route rendering functions, layout components
(AppLayout, MobileNavigation, MobileNavigationToggle), auth guards
(ProtectedRoute, AdminRoute), deferred component loaders (DeferredToaster,
DeferredGuidedTour, DeferredDemoBanner), and v2 routing (AppRouter). This
violates SRP and makes the routing layer unmaintainable.

**Evidence**: `/mnt/agents/Updog_restore/client/src/App.tsx` (601 lines)

- Lines 33-98: ~30 lazy imports
- Lines 101-224: MobileNavigation + MobileNavigationToggle + AppLayout
- Lines 226-296: 3 deferred component wrappers
- Lines 312-360: ProtectedRoute with fund context recovery
- Lines 362-541: Route definition arrays + Router function + render helpers
- Lines 543-600: App() + AppRouter() with v2 bypass logic

**Recommendation**: Decompose into dedicated modules:

```tsx
// Before: everything in App.tsx
function App() {
  /* 600 lines */
}

// After: clean separation
import { AppRouter } from '@/routing/AppRouter';
import { AppProviders } from '@/providers/AppProviders';
import { AppLayout } from '@/layout/AppLayout';

// App.tsx → 20 lines
function App() {
  return (
    <AppProviders>
      <AppRouter />
    </AppProviders>
  );
}

// routes/app-routes.ts → route definitions
// routes/lp-routes.ts → LP portal routes
// routes/render-helpers.ts → renderAppRoute, renderLPRoute
// layout/AppLayout.tsx → layout shell
// providers/AppProviders.tsx → all context providers
```

**Impact**: Each module becomes independently testable, lazy-loadable, and
maintainable. Route changes no longer require editing App.tsx.

---

## 3. P1 — Massive Route Files (1,200+ Lines Each)

**Severity**: P1 (High) **Category**: Server **Issue**: Multiple Express route
files exceed 1,000 lines, mixing route handlers, business logic, validation,
database queries, and response formatting. The top 3 offenders:

| File                               | Lines |
| ---------------------------------- | ----- |
| `routes/portfolio-intelligence.ts` | 1,480 |
| `routes/lp-api.ts`                 | 1,263 |
| `routes/deal-pipeline.ts`          | 1,228 |
| `routes/variance.ts`               | 914   |
| `routes/monte-carlo.ts`            | 827   |

**Evidence**: `server/routes/deal-pipeline.ts` contains direct `db.insert()`
calls, Zod validation schemas, activity logging logic, and Kanban pipeline
construction — all in one file.

**Recommendation**: Apply route thinning one boundary at a time, starting with
direct-DB route files. The first safe next production slice is
`deal-pipeline.ts` service extraction behind the new deal-pipeline contract
tests. `lp-api.ts` should get its own endpoint-level contracts before
extraction. Do not force `monte-carlo.ts`, `portfolio-intelligence.ts`, or
`variance.ts` into the same shape without re-scoping their orchestration,
placeholder, or in-flight service-extraction constraints.

```typescript
// Before: 1,228-line route file with everything
router.post('/opportunities', async (req, res) => {
  // validation
  // db.insert
  // logging
  // response formatting
  // ... 200+ lines
});

// After: thin route + service
dealPipelineRouter.post(
  '/opportunities',
  validate(createDealSchema),
  async (req, res) => {
    const result = await dealPipelineService.createOpportunity(
      req.body,
      req.user
    );
    res.status(201).json(result);
  }
);
```

**Impact**: Testability (services can be unit-tested without HTTP), readability
(routes < 100 lines), and separation of concerns.

---

## 4. P1 — Routes Bypassing Service Layer (Current Ratio Supersedes Old 71%)

**Severity**: P1 (High) **Category**: Server **Issue**: A fresh 2026-05-19
route-file scan found 75 files under `server/routes/`; 29 import `../services`
or `@server/services`, while 26 import `../db`, `../storage`, or `@server/db`.
The exact ratio depends on whether the inventory counts files, routers, or
mounted URL surfaces, but direct persistence access in route files remains a
real boundary problem.

**Evidence**:

```
Route files under server/routes/: 75
Route files importing services:   29
Route files importing db/storage: 26
```

- `/server/routes/deal-pipeline.ts`: Direct
  `db.insert(pipelineActivities).values(...)`
- `/server/routes/shares.ts`: Direct `db.select().from(shares).where(...)`
- `/server/routes/funds.ts`: Direct `db.select().from(persistedFunds)`

**Recommendation**: First extract the highest-leverage direct-DB routes behind
contract tests. Add a lint guard only after the pattern has landed for at least
one route and the existing direct-DB routes are either migrated or explicitly
grandfathered. A repo-wide hard ban today would flag known legacy surfaces
before the migration path exists.

```typescript
// .eslintrc rule or custom lint
// "routes/*" files may NOT import from "../db" directly
// "routes/*" files may ONLY import from "../services/*"

// Valid route:
import { fundService } from '../services/fund-service';

// Invalid route (lint error):
import { db } from '../db';
import { funds } from '@shared/schema';
```

**Impact**: Centralized transaction management, easier mocking for tests, clear
separation between HTTP and persistence layers.

---

## 5. P1 — Inconsistent API Route Mounting

**Severity**: P1 (High) **Category**: API Design **Issue**: Route mounting in
`app.ts` is inconsistent — some routes mount at `/api`, some at `/api/deals`,
some at bare `/`, and some are mounted twice. This creates auth boundary
confusion and makes it impossible to reason about URL structure from the route
file alone.

**Evidence**: `server/app.ts` route registration and the expanded
`tests/unit/server/route-surface-inventory.test.ts` inventory:

```typescript
app.use(healthRouter); // bare — /health
app.use('/metrics', metricsRouter); // /metrics
app.use('/api', metricsRouter); // /api/metrics — DUPLICATE
app.use(metricsRumRouter); // bare — rum events
app.use('/api', metricsRumRouter); // /api/metrics/rum — DUPLICATE
app.use('/api/cashflow', cashflowRouter); // /api/cashflow/*
app.use('/api/calculations', calculationsRouter); // /api/calculations/*
app.use('/api/ai', aiRouter); // /api/ai/*
app.use('/api/deals', dealPipelineRouter); // /api/deals/*
app.use('/api/cohorts', cohortAnalysisRouter); // /api/cohorts/*
app.use('/api', fundsRouter); // /api/funds, /api/funds/*
app.use(fundMetricsRouter); // bare — ?
app.use('/', varianceRouter); // bare — /
```

**Recommendation**: Adopt uniform mounting internally while preserving every
currently supported public URL. Add route contract tests first, normalize one
router family at a time, and avoid an `/api/v1` or URL-renaming migration in
this cleanup phase. Metrics and RUM duplicate aliases are now pinned as public
compatibility surfaces, so treat their removal as a later consumer-verification
task, not a cleanup default:

```typescript
// After: consistent mounting
const API_PREFIX = '/api';

// Domain routers — each self-describes its mount point
app.use(`${API_PREFIX}/funds`, fundsRouter);
app.use(`${API_PREFIX}/deals`, dealPipelineRouter);
app.use(`${API_PREFIX}/cohorts`, cohortAnalysisRouter);
app.use(`${API_PREFIX}/cashflow`, cashflowRouter);
app.use(`${API_PREFIX}/calculations`, calculationsRouter);
app.use(`${API_PREFIX}/ai`, aiRouter);
// ...etc

// Public routes (health, metrics) — explicitly separate
app.use('/health', healthRouter);
app.use('/metrics', metricsRouter);
```

**Impact**: Predictable URL structure, simpler auth boundary checks
(`/^\/api\//`), cleaner route files.

---

## 6. P1 — main.tsx Contains Production Debug Code

**Severity**: P1 (High) **Category**: Client **Issue**: The client entry point
(`main.tsx`) contains an "emergency rollback" feature with direct DOM
manipulation, localStorage polling, and a debug fetch interceptor — all compiled
into production bundles.

**Evidence**: `client/src/main.tsx`

- Lines 9-13: Global window extension for `__FORCE_LEGACY_STATE`
- Lines 15-16: `installFetchTap()` debug interceptor — always installed
- Lines 19-50: 30 lines of emergency rollback logic with DOM manipulation
- Lines 56-75: Sentry lazy-load + Web Vitals collection

**Recommendation**: Strip debug code from production entry points:

```tsx
// Before: 91 lines of mixed concerns
import { installFetchTap } from './debug/fetch-tap';
installFetchTap(); // ← always runs, even in prod

function checkEmergencyRollback() {
  /* 30 lines */
}
checkEmergencyRollback();

// After: clean entry point
import { createRoot } from 'react-dom/client';
import { App } from './App';

// Debug tools — DEV only, stripped by dead-code elimination
if (import.meta.env.DEV) {
  import('./debug/fetch-tap').then((m) => m.installFetchTap());
  import('./debug/emergency-rollback').then((m) => m.install());
}

// Monitoring — PROD only
if (import.meta.env.PROD) {
  import('./monitoring/bootstrap').then((m) => m.bootstrap());
}

createRoot(document.getElementById('root')!).render(<App />);
```

**Impact**: Smaller bundle, faster boot, no debug code in production.

---

## 7. P1 — Schema Files Scattered (Inconsistent Locations)

**Severity**: P1 (High) **Category**: Database **Issue**: Drizzle schema
definitions are split between `shared/schema/` (8 files, clean) and flat files
at `shared/` root (`schema-lp-reporting.ts`, `schema-lp-sprint3.ts`). This
inconsistency forces `db-schema.ts` to import from multiple locations and makes
schema discovery difficult.

**Evidence**:

```typescript
// server/db-schema.ts — imports from 4 different sources
import * as sharedSchema from '@shared/schema'; // ← shared/schema/index.ts
import * as lpSchema from '@shared/schema-lp-reporting'; // ← flat file at root
import * as lpSprint3Schema from '@shared/schema-lp-sprint3'; // ← flat file at root
import * as approvalSchema from '@shared/schemas/reserve-approvals'; // ← different dir
```

**Recommendation**: Consolidate all schema under `shared/schema/`:

```
# Before: scattered
shared/
  schema/                    ← 8 files (fund, portfolio, scenario, shares, user, etc.)
  schema-lp-reporting.ts     ← flat file
  schema-lp-sprint3.ts       ← flat file
  schemas/
    reserve-approvals.ts     ← different directory

# After: unified
shared/
  schema/
    index.ts                 ← re-exports everything
    fund.ts
    portfolio.ts
    scenario.ts
    shares.ts
    user.ts
    lp-reporting.ts          ← moved from flat file
    lp-sprint3.ts            ← moved from flat file
    reserve-approvals.ts     ← moved from schemas/
```

**Impact**: Single import point for all schema, predictable file locations,
simplified `db-schema.ts`.

---

## 8. P2 — Active XState Machine Requires Compatibility-First Migration

**Severity**: P2 (Medium) **Category**: State Management **Issue**: The modeling
wizard XState machine (`modeling-wizard.machine.ts`) is legacy-marked, but
current verification shows it remains active and behaviorally covered. It is not
a safe deletion candidate.

**Evidence**: `client/src/machines/modeling-wizard.machine.ts`

- Exports `modelingWizardMachine`
- Imported by `client/src/hooks/useModelingWizard.ts`
- Type-imported by `client/src/components/modeling-wizard/WizardShell.tsx`
- Covered by submit transport, fund id, and persistence tests under
  `tests/unit/`
- Referenced by wizard and reserve-bridge docs

**Recommendation**: Keep the machine for now. Add/keep behavior tests around
submit, persistence, and wizard shell integration, then migrate callers to the
replacement flow behind compatibility adapters. Delete or archive the file only
after references are removed and route/user-flow validation passes.

**Impact**: Avoids breaking the modeling wizard while still making the eventual
state-management migration explicit.

---

## 9. P2 — Route Registration is Manual and Error-Prone

**Severity**: P2 (Medium) **Category**: API Design **Issue**: Every new route
requires manual import + manual `app.use()` registration in `app.ts`. With 75
route files, this creates a 90-line registration block that's a constant merge
conflict source. No auto-discovery mechanism exists.

**Evidence**: `server/app.ts` lines 16-44 (26 imports) + lines 166-235 (30
registrations)

**Recommendation**: Implement **route auto-discovery** with a convention-based
loader:

```typescript
// After: auto-discovery
// routes/index.ts
import { glob } from 'glob';
import { Router } from 'express';

export async function loadRoutes(): Promise<Router[]> {
  const routeFiles = await glob('routes/**/*.route.ts', { cwd: __dirname });
  const routes = await Promise.all(
    routeFiles.map((f) => import(f).then((m) => m.default || m.router))
  );
  return routes.filter(Boolean);
}

// app.ts → 3 lines instead of 30
const routes = await loadRoutes();
routes.forEach((r) => app.use('/api', r));
```

**Impact**: New routes are automatically picked up, no merge conflicts in
app.ts, consistent mounting.

---

## 10. P2 — Duplicated Directory Names (schema vs schemas)

**Severity**: P2 (Medium) **Category**: Shared Code **Issue**: Two directories
with nearly identical names serve different purposes: `shared/schema/` (Drizzle
DB schema) and `shared/schemas/` (Zod validation schemas, route contracts). This
is a constant source of import confusion.

**Evidence**:

```
shared/
  schema/         ← Drizzle ORM table definitions (fund.ts, portfolio.ts, user.ts)
  schemas/        ← Zod validation, route contracts, parsing logic
    examples/
    parse-stage-distribution.ts
    portfolio-route.ts
    reserve-approvals.ts
```

**Recommendation**: Rename for clarity:

```
# Before: confusing
shared/schema/    ← db schema
shared/schemas/   ← validation schemas

# After: clear intent
shared/db-schema/     ← Drizzle ORM definitions
shared/validation/    ← Zod schemas, route contracts
```

**Impact**: Eliminates import confusion, clear mental model for developers.

---

## 11. P2 — Client Has `client/src/shared/` Directory

**Severity**: P2 (Medium) **Category**: Shared Code **Issue**: The client has
its own `client/src/shared/` directory that duplicates the purpose of the
root-level `shared/` directory. This creates ambiguity about where shared code
should live.

**Evidence**: `find /mnt/agents/Updog_restore/client/src/shared -type f` exists
alongside root `/shared/`.

**Recommendation**: Audit `client/src/shared/` contents. Move anything truly
shared to root `shared/`. Rename client-local directory to `client/src/common/`
or `client/src/lib/shared/`.

```
# Before: two shared/ directories
shared/              ← root (shared across client + server)
client/src/shared/   ← client-local shared code

# After: clear boundaries
shared/              ← root — shared across packages
client/src/common/   ← client-local shared utilities
```

**Impact**: Single source of truth for shared code, no ambiguity about import
paths.

---

## 12. P2 — Server Has `server/shared/` Directory

**Severity**: P2 (Medium) **Category**: Server **Issue**: The server also has a
`server/shared/` directory (found at `server/shared/` in the directory listing).
Combined with root `shared/` and `client/src/shared/`, this creates a 3-way
ambiguity.

**Evidence**: `/mnt/agents/Updog_restore/server/shared/` exists alongside root
`shared/`.

**Recommendation**: Consolidate server-local shared code into `server/lib/` or
merge into root `shared/`:

```
# Before: 3 shared directories
shared/              ← root
server/shared/       ← server-local
client/src/shared/   ← client-local

# After: unified
shared/              ← root — only shared directory
server/lib/          ← server-local utilities (rename from server/shared/)
client/src/common/   ← client-local utilities
```

**Impact**: Single shared directory, predictable import paths, reduced cognitive
load.

---

## 13. P2 — No Workspace Configuration for Packages

**Severity**: P2 (Medium) **Category**: Monorepo **Issue**: Despite having a
`packages/` directory, the root `package.json` has no `workspaces` field. The
packages are not product workspaces, but they are still connected to the repo
through scripts, package-local dependencies, tsconfig includes, docs, and AI
tooling.

**Evidence**: Root `package.json` has no `"workspaces"` key. Current root
scripts still reference package tests and lint targets, and
`client/tsconfig.json` includes selected `packages/agent-core` source files.

**Recommendation**: Do not adopt npm workspaces unless the packages become real
app dependencies. For the solo/internal cleanup path, first remove package
references from root scripts, tsconfigs, and tooling, then extract or delete the
packages:

```json
// Option A: Real workspaces
{
  "name": "povc-platform",
  "workspaces": ["packages/*"],
  "scripts": {
    "build": "npm run build --workspaces && npm run build:web && npm run build:server"
  }
}

// Solo/internal cleanup path:
// 1. remove package refs from scripts/tsconfigs/tooling
// 2. validate check + test:unit + build:prod
// 3. delete or extract packages/*
```

**Impact**: Keeps package removal reversible and prevents workspace adoption
from becoming a new maintenance obligation.

---

## 14. P2 — Auth Boundary Logic is Inline

**Severity**: P2 (Medium) **Category**: Server **Issue**: Authentication
middleware is applied inline in `app.ts` with a closure:
`const requireApiAuth = requireAuth(); app.use('/api', (req, res, next) => { ... })`.
The `isPublicApiPath()` check duplicates knowledge that should live in each
route file.

**Evidence**: `server/app.ts` lines 175-185

```typescript
const requireApiAuth = requireAuth();
app.use('/api', (req, res, next) => {
  if (isPublicApiPath(req.method, req.path)) {
    return next();
  }
  return requireApiAuth(req, res, next);
});
```

**Recommendation**: Move auth to a per-route middleware pattern:

```typescript
// After: auth at route level
// routes/funds.ts — public for GET, auth for mutations
fundsRouter.get('/', publicHandler); // no auth
fundsRouter.post('/', requireAuth, createFund); // auth required

// app.ts — single middleware mount
app.use('/api', apiRouter); // auth handled per-route
```

**Impact**: Auth intent is visible in each route file, no centralized
path-matching logic, simpler testing.

---

## 15. P3 — Root-Level `client/src/` Has 34 Top-Level Directories

**Severity**: P3 (Low) **Category**: Client **Issue**: The client's `src/`
directory has 34 top-level folders, making it hard to navigate and understand
the codebase structure at a glance.

**Evidence**: `client/src/` contains: adapters, ai, api, app, assets,
components, config, contexts, core, debug, domain, engines, features, hooks,
lib, machines, metrics, monitoring, pages, providers, schemas, selectors,
services, shared, state, stores, styles, theme, types, utils, workers — plus
nested component folders (46 component subdirectories).

**Recommendation**: Organize into 3-4 top-level buckets:

```
# Before: 34 flat directories
client/src/
  adapters/
  ai/
  api/
  app/
  components/
  contexts/
  core/
  ... (28 more)

# After: grouped architecture
client/src/
  app/           ← routing, providers, entry points
  ui/            ← components, hooks, theme, styles
  domain/        ← business logic: stores, machines, engines, core/
  infra/         ← api, monitoring, debug, workers
  pages/         ← route-level pages
  shared/        ← or common/ — cross-cutting utilities
```

**Impact**: Faster onboarding, easier navigation, clearer architectural
boundaries.

---

## 16. P3 — `client/src/state/` and `client/src/stores/` Coexist

**Severity**: P3 (Low) **Category**: State Management **Issue**: Two directories
for state management: `stores/` (Zustand) and `state/` (unknown purpose). This
creates confusion about where new state code belongs.

**Evidence**:

```
client/src/stores/
  useFundSelector.ts
  useFundStore.ts
  fundStore.ts
  useFund.ts
client/src/state/
  (contents unknown)
```

**Recommendation**: Merge into a single directory:

```
# After
client/src/state/
  stores/        ← Zustand stores
  machines/      ← XState machines (if any remain)
  contexts/      ← React contexts (moved from src/contexts/)
```

**Impact**: Single location for all state management code.

---

## 17. P3 — Client Entry Point Mixes Environments Poorly

**Severity**: P3 (Low) **Category**: Client **Issue**: `main.tsx` uses both
`import.meta.env.PROD` and `process.env['NODE_ENV']` for environment detection —
two different systems that may disagree.

**Evidence**: `main.tsx`

- Line 56: `if (import.meta.env.PROD)` ← Vite env
- Line 80: `process.env['NODE_ENV'] === 'development'` ← Node env (polyfilled?)

**Recommendation**: Standardize on Vite's `import.meta.env`:

```tsx
// After: consistent environment checks
const isDev = import.meta.env.DEV;
const isProd = import.meta.env.PROD;

// Remove all process.env references from client code
```

**Impact**: Consistent environment detection, no reliance on Node polyfills.

---

## 18. P3 — `server/db.ts` Uses `require()` in ESM Module

**Severity**: P3 (Low) **Category**: Database **Issue**: `db.ts` uses
`createRequire(import.meta.url)` to use `require()` inside an ESM module. This
is a workaround that undermines the ESM migration.

**Evidence**: `server/db.ts` lines 8-13, 42-49

```typescript
const require = createRequire(import.meta.url);
// ...
const { drizzle } = require('drizzle-orm/neon-http');
const { neon } = require('@neondatabase/serverless');
```

**Recommendation**: Use dynamic `import()` consistently:

```typescript
// After: pure ESM
if (isVercel) {
  const { drizzle } = await import('drizzle-orm/neon-http');
  const { neon } = await import('@neondatabase/serverless');
  // ...
}
```

**Impact**: Cleaner ESM usage, consistent async patterns, removes
`createRequire` workaround.

---

## 19. P3 — Middleware Proliferation (26 Files)

**Severity**: P3 (Low) **Category**: Server **Issue**: 26 middleware files
suggest a highly fragmented middleware layer with potential overlap. Several
files appear to address the same concerns:

**Evidence**: `server/middleware/`

- `async.ts` + `asyncErrorHandler.ts` — both async error handling?
- `rate-limit.ts` + `rateLimitDetailed.ts` + `rateLimits.ts` — 3 rate limit
  implementations
- `audit.ts` + `auditLog.ts` + `enhanced-audit.ts` — 3 audit middlewares
- `engine-guards.ts` + `engineGuardExpress.ts` — duplicate engine guards?

**Recommendation**: Consolidate overlapping middleware:

```
# Before: 26 files with potential overlap
middleware/
  async.ts
  asyncErrorHandler.ts
  rate-limit.ts
  rateLimitDetailed.ts
  rateLimits.ts
  audit.ts
  auditLog.ts
  enhanced-audit.ts
  ...

# After: consolidated by concern
middleware/
  error-handler.ts      ← merged: async + asyncErrorHandler
  rate-limit.ts         ← merged: all 3 rate limiters
  audit.ts              ← merged: all 3 audit variants
  auth.ts               ← merged: auth + requireLPAccess
  ...
```

**Impact**: Fewer files to maintain, clearer middleware chain, reduced
confusion.

---

## 20. P3 — Client Has `client/src/schemas/` and `client/src/core/` With Potential Overlap

**Severity**: P3 (Low) **Category**: Client **Issue**: The client has both
`schemas/` (likely Zod/form schemas) and `core/` (business logic, types, utils,
routes) directories that may contain overlapping validation logic.

**Evidence**:

```
client/src/schemas/
  (likely form validation schemas)
client/src/core/
  api/
  capitalAllocation/
  cohorts/
  demo/
  flags/
  graduation/
  pacing/
  reserves/
  routes/
  selectors/
  types/
  utils/
```

**Recommendation**: Audit and consolidate:

- Move validation schemas to `client/src/validation/`
- Keep `core/` for pure business logic only
- Ensure no Zod schemas are duplicated between `schemas/` and `core/`

**Impact**: Single location for validation logic, clear separation between
business rules and form validation.

---

## Appendix: Architectural Health Metrics

| Metric                               | Value                     | Assessment                                       |
| ------------------------------------ | ------------------------- | ------------------------------------------------ |
| Total Files                          | 5,577                     | Large                                            |
| Code Files                           | 2,511                     | Large                                            |
| Client Pages                         | 54                        | Moderate                                         |
| Client Components                    | 46 dirs + 10 files        | Moderate                                         |
| Server Routes                        | 75                        | High — needs decomposition                       |
| Server Services                      | 108                       | Good — healthy service layer                     |
| Server Middleware                    | 26                        | High — needs consolidation                       |
| Schema Files                         | 8 + 2 flat files          | Good — minor consolidation needed                |
| Migrations                           | 5 SQL files               | Low — migration count seems light                |
| Packages (tooling-coupled)           | 5                         | Critical — decouple before delete/extract        |
| Zustand Stores                       | 4                         | Good — focused state management                  |
| React Query Files                    | 53                        | Good — server state well-managed                 |
| XState Machines                      | 1 (legacy-marked, active) | Medium — migrate behind tests, do not delete now |
| Contexts                             | 2                         | Good — minimal context usage                     |
| Route files > 500 lines              | ~15                       | High — needs service extraction                  |
| Routes using services                | 29/75 branch-local scan   | Mixed — direct DB/storage imports remain         |
| Routes with Zod validation           | 37/75 (49%)               | Moderate                                         |
| Client `useState`/`useContext` files | 210                       | High — consider Zustand for complex local state  |

---

_Report generated by architectural audit tooling. 20 issues identified across 7
categories: Monorepo (3), Client (5), Server (5), Database (2), API Design (2),
State Management (2), Shared Code (1)._
