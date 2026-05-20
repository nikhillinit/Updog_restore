---
status: REFERENCE
last_updated: 2026-05-20
owner: Core Team
categories: [reviews, refactor, testing]
keywords: [testing, audit, vitest, quarantine, scripts]
source_of_truth: false
related:
  - docs/governance/2026-05-19-refactor-roadmap.md
---

# Testing Infrastructure Audit Report - Updog_restore

> Reference status: this raw audit is supporting evidence. Use
> `docs/governance/2026-05-19-refactor-roadmap.md` for the canonical execution
> order.

**Generated**: 2026-05-18 **Verification Update**: 2026-05-19 **Scope**: Full
testing infrastructure audit (config, organization, scripts, utilities,
conventions, quarantine, E2E)

---

## 2026-05-19 Verification Update

This audit has been aligned with the latest solo/internal refactor plan:

- `vitest.config.mjs` is the current `npm run test:unit` entry. Do not delete it
  first; extract shared aliases/setup and migrate consumers before deleting it
  last.
- There is no current root `vitest.config.ts` or `vitest.config.route-int.ts`.
  The current root Vitest config set is `vitest.config.mjs`,
  `vitest.config.base.ts`, `vitest.config.int.ts`,
  `vitest.config.phase0-dbproof.ts`, `vitest.config.quarantine.ts`, and
  `vitest.config.testcontainers.ts`.
- Avoid Vitest tag filtering until version/CLI support is explicitly verified.
  Prefer directory/project-based grouping for wave/phase script retirement.
- Keep package test config references until the package cleanup plan removes or
  extracts `packages/*`.
- Quarantine governance remains valid, but disabled tests should be brought
  under TTL, reason, and exit-condition tracking rather than hidden in config
  comments.

### 2026-05-19 Route-Test Execution Addendum

The following test work is branch-local in
`C:\dev\Updog_restore\.worktrees\refactor-plan-execution`, not yet merged into
this main workspace:

- Added `tests/unit/routes/deal-pipeline.contract.test.ts` for the deal-pipeline
  extraction gate. The test locks endpoint-level validation, request-id
  propagation for missing deals, fund-scope rejection, and idempotency replay
  behavior instead of inspecting middleware chains.
- Expanded `tests/unit/server/route-surface-inventory.test.ts` from mount smoke
  coverage into a typed route inventory covering auth posture, duplicate
  aliases, mount surfaces, and metrics/RUM ownership evidence.
- Focused route gate passed with 24 tests:
  `tests/unit/routes/deal-pipeline.contract.test.ts`,
  `tests/unit/server/route-error-contracts.test.ts`, and
  `tests/unit/server/route-surface-inventory.test.ts`.
- Full `npm test` remains sensitive to unrelated 5-second concurrency timeouts.
  The latest failed full-suite attempt timed out in
  `tests/unit/contract/cohort-analysis-boundary.test.ts` and
  `tests/unit/components/layout/sidebar-navigation.test.tsx`; rerunning those
  files directly passed 21 tests. Treat this as current test-infrastructure
  flake debt, not evidence against the route slice.

## Executive Summary

| Metric                           | Value                                 |
| -------------------------------- | ------------------------------------- |
| Total test files                 | 715                                   |
| Vitest configs (root)            | 6                                     |
| Vitest configs (packages/)       | 2                                     |
| Playwright configs               | 2                                     |
| Test-related package scripts     | 35                                    |
| Unit tests                       | 430                                   |
| Integration tests                | 60                                    |
| E2E tests                        | 54                                    |
| Tests mixed with source code     | 31 (client: 23, server: 7, shared: 1) |
| `.skip`/`.todo` occurrences      | 108 across 58 files                   |
| Quarantined tests (documented)   | 36                                    |
| Quarantined tests (undocumented) | 3                                     |

---

## P0 (Critical) Issues

### P0-1: Vitest Config Duplication - Active `.mjs` Entry with Shared-Alias Debt

- **Category**: ConfigSprawl
- **Severity**: P0
- **Evidence**: `vitest.config.mjs` is the current `test:unit` entry in
  `package.json`. The older root `vitest.config.ts` finding is stale in the
  current tree. Alias/setup duplication still exists across root
  integration/quarantine/testcontainer configs.
- **Impact**: Every alias change, setup file addition, or coverage rule update
  still risks config drift. Deleting `.mjs` first would break `test:unit`.
- **Recommendation**: Keep `vitest.config.mjs` until `test:unit` is migrated.
  First extract shared aliases/setup, then consolidate integration variants.
  Delete `.mjs` last, after package scripts and root scripts no longer reference
  it.

### P0-2: Test Script Bloat - 12 "Wave" Scripts Hardcode 50+ File Paths

- **Category**: ScriptBloat
- **Severity**: P0
- **Evidence**: Scripts `test:wave1b` through `test:wave6:packages` hardcode 50+
  individual test file paths in `package.json`. Many tests appear in MULTIPLE
  waves (e.g., `tests/unit/fund-calc-fee-horizon.test.ts` appears in both
  `test:wave4` and `test:phase4:server`;
  `tests/unit/websocket/websocket-index.test.ts` appears in
  `test:wave1b:runtime` and `test:wave6:ops`;
  `tests/integration/report-queue.test.ts` appears in `test:wave5:integration`,
  `test:wave5`, AND `test:wave6:ops`).
- **Impact**: Adding a new test requires updating multiple wave scripts.
  Removing/renaming a test breaks scripts silently. No way to run "all tests
  except wave N". CI maintenance nightmare.
- **Recommendation**: Replace wave scripts with canonical
  directory/project-based commands first. Avoid tag-based organization until the
  installed Vitest version and CLI support are verified. Consolidate overlapping
  wave memberships behind `test:unit`, `test:integration`, and explicitly named
  domain test commands.

### P0-3: 31 Tests Mixed with Source Code (Co-location Anti-pattern)

- **Category**: Organization
- **Severity**: P0
- **Evidence**: 23 tests in `client/src/` (e.g.,
  `client/src/pages/fund-setup.test.tsx`,
  `client/src/lib/chart-theme/__tests__/chart-theme.test.ts`), 7 in `server/`
  (e.g., `server/services/__tests__/xirr-golden-set.test.ts`), 1 in `shared/`
  (`shared/utils/__tests__/diff.test.ts`). The monorepo already has a dedicated
  `tests/` directory with 715 files.
- **Impact**: Tests are scattered across source trees. Vitest configs must
  include multiple root directories. Coverage boundaries are unclear. New
  developers cannot find tests reliably.
- **Recommendation**: Do not move all co-located tests now. Move a co-located
  test only if it blocks config consolidation, confuses coverage boundaries,
  requires duplicated setup, or is part of a broader feature test
  reorganization. Keep behavior coverage stable while cleanup proceeds.

---

## P1 (High) Issues

### P1-1: 6 Root-Level Vitest Configs with Massive Alias Duplication

- **Category**: ConfigSprawl
- **Severity**: P1
- **Evidence**: 6 current root configs (`vitest.config.mjs`,
  `vitest.config.base.ts`, `vitest.config.int.ts`,
  `vitest.config.quarantine.ts`, `vitest.config.phase0-dbproof.ts`,
  `vitest.config.testcontainers.ts`). Several independently define path aliases
  and setup behavior. `vitest.config.mjs` remains the unit entry.
- **Impact**: Adding a new alias requires updating 5+ configs. Risk of alias
  drift between configs. New developer onboarding confusion about which config
  to use.
- **Recommendation**: Extract all aliases to a shared module imported by every
  config. Consolidate integration configs (`int.ts`, `phase0-dbproof.ts`,
  `testcontainers.ts`) by migration, while keeping quarantine governance
  explicit. Delete configs only after script references are removed and targeted
  test commands pass.

### P1-2: 28 Near-Empty Test Directories (Single-File Directories)

- **Category**: Organization
- **Severity**: P1
- **Evidence**: 28 directories contain 0-1 files: `tests/agents/`,
  `tests/agents/fixtures/`, `tests/agents/snapshots/`, `tests/a11y/`,
  `tests/chaos/wasm-simulator/`, `tests/constants/`, `tests/e2e/configs/`,
  `tests/e2e/utils/`, `tests/eslint/`, `tests/factories/`,
  `tests/fixtures/golden-datasets/`, `tests/hooks/`, `tests/migrations/`,
  `tests/parallel/`, `tests/perf/baselines/`, `tests/rls/`, `tests/synthetics/`,
  `tests/types/`, `tests/unit/adapters/`, `tests/unit/contexts/`,
  `tests/unit/control-plane/`, `tests/unit/data/`, `tests/unit/economics/`,
  `tests/unit/flags/`, `tests/unit/helpers/`, `tests/unit/monitoring/`,
  `tests/unit/performance/`, `tests/unit/portfolio-optimization/`,
  `tests/unit/repo/`, `tests/unit/routing/`, `tests/unit/source/`,
  `tests/unit/storage/`, `tests/unit/tool-evaluation/`.
- **Impact**: `find` and IDE navigation are cluttered. Directories like
  `tests/rls/` (1 file), `tests/migrations/` (1 file), `tests/a11y/` (1 file),
  `tests/agents/` (0 files, only subdirs) waste cognitive overhead.
- **Recommendation**: Consolidate sparse directories. Move
  `tests/rls/isolation.test.ts` to `tests/integration/security/`. Move
  `tests/migrations/migration-verification.test.ts` to `tests/integration/`.
  Merge `tests/agents/` into `tests/unit/agents/`. Delete empty `tests/agents/`
  parent. Merge `tests/a11y/` into `tests/e2e/accessibility.spec.ts`.

### P1-3: 36 Quarantined Tests with 83+ Day Staleness

- **Category**: Quarantine
- **Severity**: P1
- **Evidence**: `tests/quarantine/REPORT.md` documents 36 quarantined tests. 26
  of 36 have no meaningful exit criteria (just "Temporarily skipped pending
  stabilization triage"). 3 quarantines are completely undocumented
  (`tests/integration/phase0-migrated-postgres.test.ts`,
  `tests/integration/lp-reporting-metric-run.test.ts`,
  `tests/integration/lp-reporting-foundation-migration.test.ts`). The oldest
  quarantine is 117 days (`tests/unit/api/time-travel-api.test.ts`).
- **Impact**: Quarantined tests rot. Without exit criteria, they never get
  re-enabled. The quarantine config (`vitest.config.quarantine.ts`) references
  non-existent setup files (`tests/test-infrastructure.ts`,
  `tests/unit/setup.ts`).
- **Recommendation**: Enforce a 30-day quarantine TTL. Auto-delete or escalate
  quarantines older than 30 days. Fix broken setup file paths in
  `vitest.config.quarantine.ts`. Add exit criteria to all 26 "stabilization
  triage" entries. Move undocumented quarantines into `tests/quarantine/` with
  proper documentation.

### P1-4: Duplicate Test Helper/Utility Files Across 3+ Locations

- **Category**: Utilities
- **Severity**: P1
- **Evidence**: `test-helpers.ts` exists at both
  `tests/e2e/utils/test-helpers.ts` and `tests/helpers/test-helpers.ts`.
  `database-mock` exists as both `tests/helpers/database-mock.ts` AND
  `tests/helpers/database-mock.cjs` (dual-format maintenance). `test-server.ts`
  exists at both `tests/helpers/test-server.ts` and
  `tests/utils/test-server.ts`. Setup files are scattered: `tests/setup/` (9
  files), `tests/integration/setup.ts`, `tests/integration/global-setup.ts`,
  `tests/setup-env.ts`, `tests/setup.ts`.
- **Impact**: Developers import from the wrong location. Changes to helpers may
  only update one copy. The `database-mock.cjs` vs `.ts` split is a code smell
  suggesting module resolution issues.
- **Recommendation**: Consolidate ALL test utilities into `tests/_support/` with
  subdirectories: `helpers/`, `mocks/`, `fixtures/`, `factories/`, `setup/`.
  Remove duplicates. Drop `.cjs` format - use ESM only. Create a barrel export
  (`tests/_support/index.ts`) for common imports.

### P1-5: Naming Convention Inconsistency - `.test.*` vs `.spec.*` vs `.quarantine.*`

- **Category**: Conventions
- **Severity**: P1
- **Evidence**: 533 files use `.test.*`, 58 use `.spec.*`, 5 use
  `.quarantine.*`. Some directories are inconsistent: `tests/e2e/` uses
  `.spec.ts` exclusively (39 files), `tests/integration/` uses both (`.test.ts`
  and `.spec.ts` mixed), `tests/unit/` is almost entirely `.test.*` but has
  `.spec.ts` outliers (`tests/unit/schema-helpers.spec.ts`). The
  `tests/regressions/` directory uses `REFL-NNN.test.ts` which is good.
- **Impact**: Developers cannot predict file extensions. Glob patterns in
  configs must account for both: `tests/unit/**/*.{test,spec}.ts?(x)`.
- **Recommendation**: Standardize on `.test.ts` for unit/integration, `.spec.ts`
  for E2E/Playwright. Rename 58 `.spec.*` files in non-E2E directories. Update
  all config glob patterns to use a single extension.

### P1-6: Playwright Config has 11 Projects with Complex Dependency Graph

- **Category**: Organization
- **Severity**: P1
- **Evidence**: `playwright.config.ts` defines 11 projects (smoke, core,
  pipeline, extended, performance, accessibility, gp-ux, gp-usability,
  production, mobile, firefox, webkit). Dependencies form a DAG: smoke -> core
  -> extended, smoke -> performance, etc. `playwright.config.simple.ts`
  duplicates base settings (retries, workers, timeout) for production-only runs.
- **Impact**: 11 projects x 3 browsers = 33+ potential job combinations. The
  dependency chain means a smoke failure blocks ALL other tests. Two separate
  playwright configs confuse CI.
- **Recommendation**: Consolidate `playwright.config.simple.ts` into
  `playwright.config.ts` as a conditional profile (use `process.env.PROD_ONLY`).
  Reduce projects to 3: `smoke`, `critical` (merged core+extended+pipeline),
  `cross-browser` (firefox+webkit+mobile). Keep accessibility and performance as
  explicit opt-in profiles or grep filters, not always-on projects.

---

## P2 (Medium) Issues

### P2-1: No Test Factories - Only 1 Factory File for 715 Tests

- **Category**: Utilities
- **Severity**: P2
- **Evidence**: `tests/factories/` contains only 1 file
  (`mock-data-factory.ts`). `tests/fixtures/` has 20 files. No central object
  mother or builder pattern for common entities (funds, portfolios, users,
  deals).
- **Impact**: Tests likely construct entities inline with repetitive
  boilerplate. Fixture files (`lp-data.ts`, `portfolio.json`,
  `monte-carlo-fixtures.ts`) are static data, not programmable factories.
- **Recommendation**: Expand `tests/factories/` with programmatic builders:
  `createFund(overrides)`, `createPortfolio(overrides)`,
  `createUser(overrides)`. Use `faker-js` for realistic data generation. Migrate
  static fixture JSON to factory functions.

### P2-2: `test:memory` Script is a Fragile Wrapper

- **Category**: ScriptBloat
- **Severity**: P2
- **Evidence**:
  `"test:memory": "cross-env REDIS_URL=memory:// npm run test:unit"`. The main
  `test:unit` already sets `REDIS_URL: 'memory://'` in `vitest.config.ts` env.
  This script is redundant.
- **Impact**: Maintenance burden. Developers may think `test:memory` does
  something different from `test:unit`.
- **Recommendation**: Remove `test:memory` script. If Redis URL override is
  needed, document it as an env var, not a separate script.

### P2-3: Packages Tests Use Inconsistent Config References

- **Category**: ConfigSprawl
- **Severity**: P2
- **Evidence**: `test:wave6:packages` runs 3 package tests with 3 different
  configs: `--config vitest.config.ts` (agent-core),
  `--config ../../vitest.config.base.ts` (test-repair-agent),
  `--config vitest.config.ts` (bundle-optimization). Two packages have their OWN
  `vitest.config.ts` but one doesn't.
- **Impact**: Package-level test configs are inconsistent. Running a single
  command for all packages is impossible.
- **Recommendation**: Create a `vitest.workspace.ts` file at root. Move all
  package configs to a consistent pattern. Or add package test scripts to each
  package's `package.json` and run via `npm workspaces`.

### P2-4: `test:quick` Excludes Pattern is Too Broad

- **Category**: ScriptBloat
- **Severity**: P2
- **Evidence**: `"test:quick": "vitest run --exclude='**/api/**'"`. This
  excludes ALL directories matching `api/` anywhere in the tree, not just
  `tests/api/`.
- **Impact**: Tests in `tests/unit/api/` AND `client/src/api/` (if any tests
  existed) would both be excluded. The intent was likely to skip slow API
  integration tests.
- **Recommendation**: Rename to `test:quick:unit` and use explicit path:
  `--exclude='tests/api/**'`. Use tag-based exclusion only after Vitest
  version/CLI support is verified.

### P2-5: `tests/regressions/` Has 24 Files Without Clear Purpose

- **Category**: Organization
- **Severity**: P2
- **Evidence**: `tests/regressions/` contains 24 files named `REFL-001.test.ts`
  through `REFL-029.test.ts` (with gaps). The directory is included in the main
  unit test config (`tests/regressions/**/*.test.ts`). No README or index
  explains what "REFL" means or how regression numbers are assigned.
- **Impact**: Unclear whether these are active tests or historical artifacts.
  The numbering gaps (no REFL-019, REFL-022-025) suggest deleted/merged tests.
- **Recommendation**: Add `tests/regressions/README.md` documenting the
  numbering scheme. Or rename files to descriptive names
  (`refl-server-crash-on-null-fund.test.ts`).

### P2-6: Testcontainers Config has Disabled Test Comments

- **Category**: ConfigSprawl
- **Severity**: P2
- **Evidence**: `vitest.config.testcontainers.ts` has 3 commented-out test
  includes with "pre-existing issues" notes. Tests are disabled via comments
  rather than quarantine patterns.
- **Impact**: Disabled tests are invisible to the quarantine tracking system.
  The config file becomes a secondary quarantine mechanism.
- **Recommendation**: Move disabled tests to `tests/quarantine/` or use
  `.quarantine.test.ts` suffix. Keep config files clean - they should not
  contain business logic about which tests to skip.

---

## P3 (Low) Issues

### P3-1: `.template.test.ts` Exclusion in Config Instead of Directory

- **Category**: Conventions
- **Severity**: P3
- **Evidence**: `vitest.config.ts` excludes `**/*.template.test.ts` and
  `**/*.template.{test,spec}.ts?(x)`. Only one template exists:
  `tests/fixtures/TEMPLATE.ts` (not even a test file).
- **Recommendation**: Remove template exclusions from config. If templates are
  needed, put them in `tests/templates/` outside the test search path.

### P3-2: `tests/e2e/configs/` Contains Only 1 File

- **Category**: Organization
- **Severity**: P3
- **Evidence**: `tests/e2e/configs/` has 1 file. Playwright config is at root.
  This directory appears unused.
- **Recommendation**: Remove `tests/e2e/configs/` or move Playwright config into
  it (but keep at root for Playwright CLI discovery).

### P3-3: `tests/visual/` Has Only 3 Files, Duplicates E2E Visual Tests

- **Category**: Organization
- **Severity**: P3
- **Evidence**: `tests/visual/` has 3 files.
  `tests/e2e/visual-audit-screenshots.spec.ts` and
  `tests/e2e/visual-regression.spec.ts` also exist. Purpose overlap.
- **Recommendation**: Merge `tests/visual/` into `tests/e2e/visual/` or delete
  if redundant.

### P3-4: `test:rls` Script Points to Almost-Empty Directory

- **Category**: ScriptBloat
- **Severity**: P3
- **Evidence**: `"test:rls": "vitest run tests/rls"`. Directory has only 1 file:
  `tests/rls/isolation.test.ts`.
- **Recommendation**: Move `tests/rls/isolation.test.ts` to
  `tests/integration/security/` and remove `test:rls` script. Or run RLS tests
  via the integration config.

### P3-5: `tests/load/` Contains Both k6 and Vitest Load Tests

- **Category**: Organization
- **Severity**: P3
- **Evidence**: `tests/load/` has `async-batch.bench.ts`,
  `metrics-performance.test.ts`, `reserves-load.js`. `tests/k6/` has 5 k6
  scripts. `tests/perf/` has 2 files. Load testing is spread across 3
  directories.
- **Recommendation**: Consolidate ALL load/perf tests into `tests/performance/`
  with subdirs: `k6/`, `benchmarks/`, `microbench/`.

### P3-6: Empty or Near-Empty Test Directories Should Be Pruned

- **Category**: Organization
- **Severity**: P3
- **Evidence**: `tests/chaos/` has 12 files but `tests/chaos/wasm-simulator/`
  has only 4. `tests/hooks/` has 1 file. `tests/types/` has 1 file.
  `tests/parallel/` has 1 file. `tests/constants/` has 1 file. `tests/eslint/`
  has 1 file.
- **Recommendation**: Merge single-file directories into their logical parent.
  `tests/types/` -> `tests/unit/types/`. `tests/constants/` ->
  `tests/unit/constants/`. `tests/hooks/` -> `tests/unit/hooks/`.

---

## Appendix A: Configuration Comparison Matrix

| Config File                       | Aliases (count) | Environment | Setup Files                              | Timeout | Pool                       | Purpose                                              |
| --------------------------------- | --------------- | ----------- | ---------------------------------------- | ------- | -------------------------- | ---------------------------------------------------- |
| `vitest.config.mjs`               | 10              | jsdom+node  | 4 (server), 2 (client)                   | 30s     | threads                    | Current main unit entry; delete last after migration |
| `vitest.config.ts`                | n/a             | n/a         | n/a                                      | n/a     | n/a                        | Stale audit row; not present in current root         |
| `vitest.config.base.ts`           | 0               | node        | 0                                        | default | default                    | Package base (GOOD)                                  |
| `vitest.config.int.ts`            | 11              | node        | 1 (`integration/setup.ts`) + globalSetup | 30s     | forks (singleFork)         | Integration                                          |
| `vitest.config.route-int.ts`      | 10              | node        | 1 (`integration/setup.ts`)               | 30s     | forks (singleFork)         | Route integration only                               |
| `vitest.config.phase0-dbproof.ts` | 10              | node        | 0                                        | 60s     | forks (singleFork)         | Single test only                                     |
| `vitest.config.testcontainers.ts` | 9               | node        | 1 (globalSetup)                          | 60s     | forks (singleFork)         | Docker integration                                   |
| `vitest.config.quarantine.ts`     | 5               | node        | 3 (broken paths)                         | 30s     | default (maxConcurrency:1) | Quarantined tests                                    |

**Key Finding**: Integration and specialized configs (`int`, `phase0-dbproof`,
`testcontainers`, `quarantine`) should be consolidated by migration. Do not use
tags as the plan of record until Vitest support is verified.

---

## Appendix B: Script Cross-Reference (Tests in Multiple Scripts)

| Test File                                           | Appears In                                               |
| --------------------------------------------------- | -------------------------------------------------------- |
| `tests/unit/fund-calc-fee-horizon.test.ts`          | `test:wave4`, `test:phase4:server`                       |
| `tests/unit/websocket/websocket-index.test.ts`      | `test:wave1b:runtime`, `test:wave6:ops`                  |
| `tests/unit/truth-cases/capital-allocation.test.ts` | `test:wave4`, `test:publish-orchestration` (implied)     |
| `tests/unit/queues/backtesting-queue.test.ts`       | `test:wave5:root`, `test:wave6:ops`                      |
| `tests/integration/report-queue.test.ts`            | `test:wave5:integration`, `test:wave5`, `test:wave6:ops` |

**13 tests appear in 2+ wave scripts**, creating maintenance overhead and
unclear ownership.

---

## Appendix C: Recommended Directory Restructure

```
tests/
  _support/                    # NEW: All helpers, mocks, factories, setup
    aliases.ts                 # NEW: Shared alias config
    helpers/                   # Consolidated from tests/helpers + tests/utils + tests/unit/helpers
    mocks/                     # From tests/mocks
    factories/                 # Expanded from 1 file
    fixtures/                  # From tests/fixtures
    setup/                     # From tests/setup + tests/integration/setup.ts
  unit/                        # Keep, merge in source-mixed tests
    client/                    # NEW: Migrated from client/src/**/__tests__/
    server/                    # NEW: Migrated from server/**/__tests__/
    shared/                    # NEW: Migrated from shared/**/__tests__/
    ...existing structure...
  integration/                 # Keep, consolidate configs
  e2e/                         # Keep, merge tests/visual/ + tests/a11y/
  performance/                 # NEW: Merge tests/load/ + tests/k6/ + tests/perf/
  quarantine/                  # Keep, enforce TTL
  smoke/                       # Keep or merge into e2e/
  regressions/                 # Keep, add README
```

---

## Appendix D: Files Referenced in Audit

### Config Files (10 total)

- `/mnt/agents/Updog_restore/vitest.config.mjs` - Current unit entry; delete
  last after migration
- `/mnt/agents/Updog_restore/vitest.config.ts` - Stale audit reference; not
  present in current root
- `/mnt/agents/Updog_restore/vitest.config.base.ts` - Package base config (GOOD)
- `/mnt/agents/Updog_restore/vitest.config.int.ts` - Integration config
- `/mnt/agents/Updog_restore/vitest.config.quarantine.ts` - Quarantine config
  (broken setup paths)
- `/mnt/agents/Updog_restore/vitest.config.phase0-dbproof.ts` - Single-test
  config
- `/mnt/agents/Updog_restore/vitest.config.route-int.ts` - Route integration
  config
- `/mnt/agents/Updog_restore/vitest.config.testcontainers.ts` - Docker
  integration config
- `/mnt/agents/Updog_restore/packages/agent-core/vitest.config.ts` - Package
  config
- `/mnt/agents/Updog_restore/packages/bundle-optimization-agent/vitest.config.ts` -
  Package config

### Key Test Files

- `/mnt/agents/Updog_restore/tests/quarantine/REPORT.md` - 36 quarantined tests,
  26 without exit criteria
- `/mnt/agents/Updog_restore/tests/quarantine/PROTOCOL.md` - Quarantine process
  documentation
- `/mnt/agents/Updog_restore/tests/setup/vitest.setup.ts` - Global setup
- `/mnt/agents/Updog_restore/tests/setup/node-setup.ts` - Node environment setup
- `/mnt/agents/Updog_restore/tests/setup/jsdom-setup.ts` - jsdom environment
  setup
- `/mnt/agents/Updog_restore/tests/helpers/test-helpers.ts` - Duplicate with
  tests/e2e/utils/test-helpers.ts
- `/mnt/agents/Updog_restore/tests/helpers/database-mock.ts` - Duplicate with
  .cjs version
- `/mnt/agents/Updog_restore/tests/factories/mock-data-factory.ts` - Only
  factory file

### Playwright Configs

- `/mnt/agents/Updog_restore/playwright.config.ts` - 11 projects (CONSOLIDATE)
- `/mnt/agents/Updog_restore/playwright.config.simple.ts` - Duplicates base
  settings (DELETE)

### Package.json Scripts (35 test-related)

- `/mnt/agents/Updog_restore/package.json` - Lines 60-95 contain all test
  scripts
