# P5 Tech Debt Reduction - Findings

## Investigation Results (2026-02-16)

### Baseline Metrics

| Metric             | Count |
| ------------------ | ----- |
| Tests passing      | 2,884 |
| Tests skipped      | 213   |
| Test files passing | 141   |
| Test files skipped | 11    |
| Total test files   | 152   |

### 1. Blanket `eslint-disable @typescript-eslint/no-explicit-any` (130 files)

**Severity: HIGH** -- single largest type safety debt

- **client/src/components/**: 57 files (charts, wizard, portfolio, investments,
  UI)
- **client/src/pages/**: 11 files
- **client/src/**: 22 more (hooks, utils, config, core, lib)
- **server/**: 40 files (middleware, services, routes, types, lib)

Top offenders by subsystem:

- Charts: 9 files (cohort, nivo, fund-expense, performance, etc.)
- Investments: 8 files (dialogs, editors, layout)
- Portfolio: 7 files (analytics, table, builders)
- Server middleware: 6 files (rate limit, async, shutdown, etc.)
- Server types/: 9 files (d.ts shims -- many may be legitimate)

### 2. TODO/FIXME/HACK Clusters (80+ items)

**Severity: MEDIUM-HIGH** -- some are stubs with no implementation

| File                                         | Count | Category                         |
| -------------------------------------------- | ----- | -------------------------------- |
| server/compass/routes.ts                     | 10    | Stub routes, mock data, no DB    |
| workers/dlq.ts                               | 5     | Mock Redis client                |
| server/services/storage-service.ts           | 5     | S3 stubs (not implemented)       |
| server/services/actual-metrics-calculator.ts | 5     | Missing storage interface        |
| server/routes/lp-api.ts                      | 2     | Persist settings, error handling |
| server/services/notion-service.ts            | 3     | Save to DB, fetch names          |
| server/routes/v1/reserve-approvals.ts        | 2     | Notifications, execution         |
| server/services/metrics-aggregator.ts        | 2     | Config from DB                   |
| server/services/monte-carlo-engine.ts        | 1     | createdBy from context           |

### 3. Quarantine Debt (36 quarantined, 28 undocumented)

**Severity: HIGH** -- 28 tests lack exit criteria

Documented (8): testcontainers, scenario-comparison, backtesting, allocations,
chaos, monte-carlo-orchestrator, time-travel-api, portfolio-intelligence

Undocumented (28): See tests/quarantine/REPORT.md for full list. Largest blocks:

- 19 skipped: snapshot-service
- 14 skipped: reallocation-api, monte-carlo validation (x3)
- 13 skipped: time-travel-api, monte-carlo-orchestrator
- 12 skipped: time-travel-simple

### 4. @deprecated Code Still Present (~40 items)

**Severity: MEDIUM** -- migration paths documented but not executed

- `client/src/lib/xirr.ts` -- replaced by `@/lib/finance/xirr`
- `client/src/core/selectors/xirr.ts` -- same
- `client/src/lib/wizard-reserve-bridge.ts` -- 2 deprecated functions
- `shared/types.ts` -- 2 deprecated type aliases
- `shared/core/capitalAllocation/units.ts` -- 3 deprecated functions
- `client/src/lib/fees.ts` -- 1 deprecated function
- `client/src/lib/excel-parity-validator.ts` -- 2 deprecated adapters
- `shared/schemas.ts` -- 1 deprecated schema
- `client/src/core/reserves/types.ts` -- 2 deprecated types

### 5. Console.log in Client Code (45 occurrences, 15 files)

**Severity: LOW-MEDIUM** -- debug noise in production

Key files: rollout-runtime.ts (8), ErrorBoundary.tsx (6), vitals.ts (5), xirr
selectors (5)

### 6. Large Files (decomposition candidates)

**Severity: MEDIUM** -- maintenance burden

| File                                            | Lines |
| ----------------------------------------------- | ----- |
| client/src/pages/variance-tracking.tsx          | 1,278 |
| server/routes/lp-api.ts                         | 1,232 |
| server/services/streaming-monte-carlo-engine.ts | 1,133 |
| client/src/pages/portfolio-constructor.tsx      | 934   |
| server/services/performance-prediction.ts       | 875   |
| client/src/pages/investment-detail.tsx          | 888   |
| client/src/pages/CapitalStructureStep.tsx       | 873   |

### 7. Dependency Debt (major version bumps available)

**Severity: MEDIUM** -- security + feature gaps

| Package                  | Current | Latest | Risk                          |
| ------------------------ | ------- | ------ | ----------------------------- |
| @hookform/resolvers      | 3.10    | 5.2    | Major -- breaking API         |
| @neondatabase/serverless | 0.10    | 1.0    | Major -- production DB driver |
| @notionhq/client         | 4.0     | 5.9    | Major -- integration only     |
| @types/express           | 4.17    | 5.0    | Major -- type definitions     |
| @eslint/js               | 9.39    | 10.0   | Major -- dev tool             |
| @size-limit/file         | 11.2    | 12.0   | Major -- dev tool             |

### 8. Dead/Stub Code

**Severity: LOW-MEDIUM**

- `server/compass/routes.ts` (365 lines) -- all routes return mock data, 10
  TODOs, 3 `as any` casts
- `workers/dlq.ts` (130 lines) -- DLQ with mock Redis, not wired to real client
- `server/services/storage-service.ts` S3 methods -- all stubs with TODO
- `auto-discovery/` files -- blanket eslint-disable (5 rules), scaffolded stubs
- `archive/` -- 11MB of archived code (already moved, low priority)

### 9. `as any` / `: any` in Source (76 occurrences, 30 files)

**Severity: MEDIUM** -- overlaps with eslint-disable findings but some are
inline casts in otherwise typed files
