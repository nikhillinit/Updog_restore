# P5: Tech Debt Reduction -- Task Plan

**Branch:** `feat/p5-tech-debt` **Baseline:** 2,884 tests passing, 213 skipped
(main @ 9f34b181) **Findings:** See `p5-findings.md` for raw data

---

## Prioritization Matrix

| Priority | Category                         | Files         | Impact | Effort |
| -------- | -------------------------------- | ------------- | ------ | ------ |
| P5.1     | Quarantine hygiene               | 28 test files | HIGH   | LOW    |
| P5.2     | Deprecated code removal          | ~15 files     | HIGH   | MEDIUM |
| P5.3     | Dead/stub code cleanup           | ~8 files      | MEDIUM | LOW    |
| P5.4     | Client `any` sweep (charts)      | 9 files       | HIGH   | MEDIUM |
| P5.5     | Client `any` sweep (investments) | 8 files       | HIGH   | MEDIUM |
| P5.6     | Server type safety (middleware)  | 6 files       | HIGH   | MEDIUM |
| P5.7     | Console.log cleanup              | 15 files      | LOW    | LOW    |
| P5.8     | Dev dependency updates           | package.json  | MEDIUM | LOW    |

**Out of scope for P5** (too risky or needs dedicated planning):

- Large file decomposition (variance-tracking, lp-api) -- needs feature planning
- Production dependency majors (@neondatabase, @hookform) -- needs migration
  guide
- Unblocking quarantined tests that need infra (Docker, real DB) -- Phase 4
  territory

---

## P5.1: Quarantine Hygiene (28 undocumented skips)

**Goal:** Every `describe.skip` and `it.skip` gets either documented with
`@quarantine` metadata (owner, reason, exit criteria) or removed if the
underlying feature is now implemented.

**Scope:** 28 files listed in `tests/quarantine/REPORT.md` under "Undocumented"

**Tasks:**

1. Triage each undocumented skip: is the blocker still real?
2. For still-blocked tests: add `@quarantine` JSDoc with owner/reason/exit
   criteria
3. For tests whose blockers are resolved: remove skip, verify green
4. Update `tests/quarantine/REPORT.md` to reflect new state
5. Run full suite -- baseline must not regress

**Acceptance:** 0 undocumented quarantines remaining. REPORT.md accurate.

---

## P5.2: Deprecated Code Removal

**Goal:** Remove deprecated APIs and their call sites, replacing with the
documented migration target.

**Scope (by file):**

1. `client/src/lib/xirr.ts` -- delete, update all imports to
   `@/lib/finance/xirr`
2. `client/src/core/selectors/xirr.ts` -- delete, update imports
3. `client/src/lib/wizard-reserve-bridge.ts` -- remove 2 deprecated functions,
   update callers
4. `shared/types.ts` -- remove 2 deprecated type aliases, update consumers
5. `shared/core/capitalAllocation/units.ts` -- remove 3 deprecated functions
6. `client/src/lib/fees.ts` -- remove deprecated `committedFeeDragFraction`
   alias
7. `client/src/lib/excel-parity-validator.ts` -- remove 2 deprecated adapters
8. `shared/schemas.ts` -- remove deprecated CanonicalStageSchema alias
9. `client/src/core/reserves/types.ts` -- remove 2 deprecated types
10. `client/src/lib/sentry.ts` -- remove deprecated getIsSentryEnabled
11. `client/src/lib/telemetry.ts` -- remove 2 deprecated tracking wrappers

**Tasks:**

1. For each deprecated item: find all consumers with Grep
2. Migrate consumers to the documented replacement
3. Delete the deprecated code
4. Run `npm run check` (tsc) + `npm test` after each group
5. Verify no regressions

**Acceptance:** Zero `@deprecated` markers remaining in active source (excluding
node_modules and archive/).

---

## P5.3: Dead/Stub Code Cleanup

**Goal:** Remove code that has no consumers and consists entirely of TODO stubs.

**Scope:**

1. `server/compass/routes.ts` (365 lines) -- all routes return mock data. Verify
   no consumers import/mount these routes. If mounted: add feature flag guard
   instead.
2. `workers/dlq.ts` (130 lines) -- mock Redis, never wired. Verify no imports.
3. `server/services/storage-service.ts` S3 methods -- 5 stubs returning
   `throw new Error('Not implemented')`. Remove stubs, keep interface.
4. `auto-discovery/github-bridge.ts` and `auto-discovery/agent-system.ts` --
   blanket eslint-disable, scaffolded stubs. Verify no imports.

**Tasks:**

1. For each candidate: verify zero imports/consumers
2. Delete or feature-gate dead code
3. Remove any associated test stubs
4. Run full suite

**Acceptance:** No stub-only files remaining. TODO count reduced by 20+.

---

## P5.4: Client `any` Sweep -- Charts (9 files)

**Goal:** Remove `/* eslint-disable @typescript-eslint/no-explicit-any */` from
chart components by adding proper types.

**Files:**

- cohort-analysis-chart.tsx
- enhanced-performance-chart.tsx
- fund-expense-charts.tsx
- investment-breakdown-chart.tsx
- nivo-moic-scatter.tsx
- nivo-performance-chart.tsx
- pacing-timeline-chart.tsx
- reserve-allocation-chart.tsx
- portfolio-cost-value-chart.tsx

**Pattern:** Most `any` usage is for Recharts/Nivo callback params and tooltip
formatters. Type these with the library's exported types (e.g.,
`TooltipProps<number, string>`, `Payload<ValueType, NameType>`).

**Tasks:**

1. For each file: identify `any` usage sites
2. Replace with proper Recharts/Nivo types
3. Remove eslint-disable comment
4. Verify tsc + lint pass

**Acceptance:** 0 blanket `any` disables in chart components.

---

## P5.5: Client `any` Sweep -- Investments (8 files)

**Goal:** Same as P5.4 for investment dialog components.

**Files:**

- valuation-update-dialog.tsx
- ownership-update-dialog.tsx
- new-round-dialog.tsx
- liquidation-preferences-dialog.tsx
- investments-layout.tsx
- future-rounds-builder.tsx
- exit-valuation-editor.tsx
- cap-table-integration.tsx

**Pattern:** Most `any` here is form data types and API response shapes. Replace
with Zod-inferred types from shared schemas.

**Acceptance:** 0 blanket `any` disables in investment components.

---

## P5.6: Server Type Safety -- Middleware (6 files)

**Goal:** Remove `any` from server middleware where Express types exist.

**Files:**

- middleware/shutdownGuard.ts
- middleware/rateLimitDetailed.ts
- middleware/requestId.ts
- middleware/asyncErrorHandler.ts
- middleware/async.ts
- types/express.d.ts (fix the `context?: any` TODO)

**Pattern:** Use `Request`, `Response`, `NextFunction` from express. For
`context`, import `UserContext` from `server/middleware/secure-context`.

**Acceptance:** 0 blanket `any` disables in middleware. express.d.ts TODO
resolved.

---

## P5.7: Console.log Cleanup (15 files)

**Goal:** Replace `console.log/warn/error` in client source with structured
alternatives (logger util or remove entirely).

**Scope:** 45 occurrences across 15 client/src files.

**Rules:**

- ErrorBoundary.tsx: keep console.error (legitimate error reporting)
- rollout-runtime.ts, rollout.ts: replace with logger or remove
- vitals.ts: keep (web vitals reporting)
- xirr selectors: remove debug logs
- debug/\*.ts: keep (debug-only modules)

**Acceptance:** No `console.log` in production client code paths. Debug modules
exempt.

---

## P5.8: Dev Dependency Updates

**Goal:** Update dev-only major dependencies that are low-risk.

**Packages:**

- `@eslint/js` 9 -> 10 (lint tool)
- `@size-limit/file` 11 -> 12 (bundle analysis)
- `@types/express` 4 -> 5 (type defs -- needs compatibility check)
- `@typescript-eslint/*` 8.53 -> 8.56 (minor, in-range)

**Not in scope:** @neondatabase/serverless, @hookform/resolvers,
@notionhq/client (production deps, need dedicated migration).

**Tasks:**

1. Update one package at a time
2. Run lint + tsc + test after each
3. Fix any breakage

**Acceptance:** All updated deps pass full suite.

---

## Execution Order

```
P5.1 (quarantine) ─┐
P5.3 (dead code)  ─┼─> P5.2 (deprecated) ─> P5.4-P5.6 (any sweep) ─> P5.7 + P5.8
                    │
         (parallel) │
```

P5.1 and P5.3 are independent and can run first (they reduce noise for later
tasks). P5.2 should follow because deprecated code removal may eliminate some
`any` sites. The `any` sweeps (P5.4-P5.6) are independent of each other. P5.7
and P5.8 are lowest priority, do last.

---

## Success Criteria

| Metric                                              | Before | Target                   |
| --------------------------------------------------- | ------ | ------------------------ |
| Undocumented quarantines                            | 28     | 0                        |
| @deprecated markers                                 | ~40    | 0                        |
| Dead stub files                                     | 4+     | 0                        |
| eslint-disable no-explicit-any (client charts)      | 9      | 0                        |
| eslint-disable no-explicit-any (client investments) | 8      | 0                        |
| eslint-disable no-explicit-any (server middleware)  | 6      | 0                        |
| Console.log in client (non-debug)                   | ~35    | 0                        |
| Tests passing                                       | 2,884  | >= 2,884 (no regression) |
| Tests skipped                                       | 213    | <= 213 (ideally lower)   |

## Risks

1. **Deprecated code may have hidden consumers** -- Grep thoroughly before
   deletion
2. **Chart typing may be complex** -- Recharts/Nivo have incomplete type
   exports; may need `unknown` + narrowing rather than specific types
3. **Quarantine triage may surface real bugs** -- budget time for investigation
4. **Dev dep updates may cascade** -- especially @eslint/js 10 could require
   config changes
