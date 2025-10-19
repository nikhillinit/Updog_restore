# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] – 2025‑10‑19

### Fixed

#### Phase 3 - ESLint 9.x Migration & Cleanup (2025-10-19)

**ESLint Configuration Modernization:**

- Migrated ignore patterns from deprecated `.eslintignore` to `eslint.config.js`
- Added 4 missing ignore patterns: `drizzle.config.ts`, `*.config.ts`,
  `*.config.js`, `tools/eslint-plugin-rls/dist/**`
- Updated `lint-staged` configuration to support ESLint 9.x with
  `--no-warn-ignored` flag
- Removed deprecated `.eslintignore` file
- **Result:** Pre-commit hooks now work without `--no-verify` workaround

**Husky Hook Fixes:**

- Fixed `.husky/post-commit` integer comparison error at line 19
- Changed `LAST_SESSION` calculation from `|| echo "0"` to `${LAST_SESSION:-0}`
  pattern
- **Result:** No more "integer expression expected" errors on commits

**Repository Cleanup:**

- Removed temporary test file: `vscode-test.md`
- Removed malformed temp file: `C\357\200\272Tempanalyze_project.ps1`

**Related to Phase 1 & 2:**

- Phase 1 (commit d945d62): Stabilized dependencies, fixed VS Code crashes
- Phase 2 (commit d945d62): Pruned 296 unused packages, reduced extraneous
  packages 332 → 5

**Validation:**

- ESLint 9.x configuration validated
- Pre-commit hooks tested and working
- Sidecar junctions remain intact (26 packages)

## [Unreleased] – 2025‑10‑18

### Added

#### Official Claude Code Plugins Adoption - IN PROGRESS (2025-10-18)

**PR Review Toolkit Plugin**

- Installed official PR Review Toolkit plugin from Anthropic
- Provides 6 specialized review agents:
  - `comment-analyzer` - Comment accuracy vs code verification
  - `pr-test-analyzer` - Test coverage quality analysis (behavioral vs line)
  - `silent-failure-hunter` - Error handling and silent failure detection
  - `type-design-analyzer` - TypeScript type design quality (4 dimensions,
    scored 1-10)
  - `code-reviewer` - CLAUDE.md compliance and bug detection
  - `code-simplifier` - Code clarity and refactoring suggestions
- Created comprehensive workflow cheatsheet: `cheatsheets/pr-review-workflow.md`
- Integration with existing custom commands (`/test-smart`, `/fix-auto`,
  `/deploy-check`)
- Domain-specific usage patterns for VC fund platform (ReserveEngine,
  PacingEngine, Waterfall)

**Rationale:**

- Financial calculations require specialized review (error handling, test
  coverage quality)
- Type safety critical for fund modeling (Waterfall types, ReserveAllocation)
- Comment accuracy essential for complex calculations
- Official plugins maintained by Anthropic (no maintenance burden)

**Related Changes:**

- Archived BMad infrastructure (27 files) to
  `archive/2025-10-18/bmad-infrastructure/`
- Documented decision in `DECISIONS.md` (commit c4a2559)
- Created archive manifest: `archive/2025-10-18/ARCHIVE_MANIFEST.md`

**Next Steps:**

- Install Commit Commands plugin (`/commit`, `/commit-push-pr`, `/clean_gone`)
- Install Feature Development plugin (7-phase structured workflow)
- Test PR Review agents on existing code (ReserveEngine, Waterfall, API routes)

---

## [Unreleased] – 2025‑10‑16

### Enhanced

#### Badge Audit Filter Enhancement - COMPLETE ✅ (2025-10-16T18:00:36-05:00)

**Enhanced False Positive Filtering**

- Added wildcard glob filter (`/workflows\/\*[^\/\)]*\.yml/g`) to
  `IGNORE_PATTERNS`
- Eliminates table cell command patterns (e.g., `| `actionlint
  .github/workflows/\*.yml` |`)
- Synchronized filters across 2 touchpoints:
  - `scripts/badge-audit-validated.cjs` (production script)
  - `.github/workflows/ci-unified.yml` (CI inline validator at guards job)

**Empirical Results**:

- Before: 8 total badges, 4 broken (50% false positive rate)
- After: 7 total badges, 3 broken (43% false positive rate)
- ✅ Eliminated: `*.yml` wildcard false positive from
  CONSOLIDATION_FINAL_VALIDATED.md table cells
- ✅ Production docs (README.md, CONSOLIDATION_FINAL_VALIDATED.md): CLEAN
- Remaining 3 false positives: All in CONSOLIDATION_PLAN_FINAL.md (planning doc,
  acceptable)

**Validation Evidence**:

- Wildcard grep verification: 0 real badges use `workflows/*.yml` patterns
- Badge audit report: `badge-audit-report.json` @ 2025-10-16T22:33:06Z
- Pre-flight checks: All passed (no merge conflicts, target files exist)
- CI integration: Badge validator added to guards job for continuous validation

**Files Modified (2 total)**:

1. `scripts/badge-audit-validated.cjs` - Added wildcard filter to
   IGNORE_PATTERNS (line 30)
2. `.github/workflows/ci-unified.yml` - Added inline badge validator to guards
   job (lines 581-640)

---

## [Unreleased] – 2025‑10‑07

### Added

#### Fund Allocation Management - Phase 1b (Reallocation API) - COMPLETE ✅

**Reallocation Preview/Commit API**

- Preview endpoint (POST `/api/funds/:fundId/reallocation/preview`) for
  read-only change preview
- Commit endpoint (POST `/api/funds/:fundId/reallocation/commit`) with
  transaction safety
- Optimistic locking with version-based conflict detection
- Comprehensive warning system (cap exceeded, high concentration, unrealistic
  MOIC)
- Full audit trail with JSONB change tracking in `reallocation_audit` table
- Batch update optimization using SQL CASE statements
- 15+ comprehensive unit tests with 95%+ coverage
- Complete API documentation and quick start guide

**Database Schema**
(`server/migrations/20251007_fund_allocation_phase1b.up.sql`):

- `reallocation_audit` table with UUID primary key
- 4 performance indexes (fund, user, versions, JSONB GIN)
- Helper function `log_reallocation_audit()` for audit insertion
- Full rollback migration support

**Warning Detection**:

- **Blocking Errors**: Cap exceeded, negative allocation, invalid company ID,
  version conflict
- **Non-Blocking Warnings**: High concentration (>30%), unrealistic MOIC (>50%
  of fund)

**Performance**:

- Preview: ~150ms average (target: <300ms) ✅
- Commit: ~250ms average (target: <500ms) ✅
- Batch updates for optimal database performance

**Testing** (`tests/unit/reallocation-api.test.ts`):

- 15+ test cases covering all scenarios
- Preview with no changes, increases/decreases
- All warning types (cap, concentration, MOIC)
- Version conflict handling
- Transaction rollback verification
- Concurrent reallocation tests
- Full preview-commit workflow integration

**Documentation**:

- Comprehensive guide: `docs/fund-allocation-phase1b.md`
- Quick start: `docs/reallocation-api-quickstart.md`
- Implementation summary: `IMPLEMENTATION_SUMMARY_PHASE1B.md`
- API examples, React hooks, troubleshooting, monitoring queries

#### Capital Allocations Step (3/7) - COMPLETE ✅

**7-Step Modeling Wizard - Step 3: Capital Allocations**

- Complete wizard step for capital deployment modeling across fund lifecycle
- Initial investment strategy (amount-based / ownership-based entry modes)
- Per-stage follow-on allocation table with graduation flow
- Investment pacing horizon with dynamic period builder
- Real-time calculations with comprehensive validation
- Integration with DeterministicReserveEngine

**Calculation Library** (`client/src/lib/capital-allocation-calculations.ts`):

- `calculateInitialInvestments()` - Entry strategy calculations (amount-based /
  ownership-based)
- `calculateFollowOnAllocations()` - Follow-on cascade with ownership dilution
  math
- `calculatePacingSchedule()` - Pacing schedule generation
  (linear/front-loaded/back-loaded)
- `validateCapitalAllocation()` - Comprehensive validation (errors + warnings)
- 25+ test cases with full coverage

**React Hook** (`client/src/hooks/useCapitalAllocationCalculations.ts`):

- Real-time calculation updates with useMemo optimization
- Automatic validation on form changes
- Summary helper hook for metrics display

**UI Components** (14 components in `capital-allocation/` directory):

- `InitialInvestmentSection.tsx` - Entry strategy configuration
- `FollowOnStrategyTable.tsx` - Editable per-stage allocations with graduation
  flow
- `PacingHorizonBuilder.tsx` - Dynamic period management with deployment curves
- `CalculationSummaryCard.tsx` - Validation and metrics display
- `AllocationsTable.tsx`, `PortfolioTable.tsx`, `PortfolioSummary.tsx` -
  Portfolio views
- `CapitalHeader.tsx`, `ReserveMetricsDisplay.tsx`, `ValidationDisplay.tsx` -
  Metrics displays
- `CompanyDialog.tsx`, `PortfolioConfigForm.tsx` - Interactive configuration
- `CapitalAllocationStep.tsx` - Main orchestration component
- `index.ts`, `README.md` - Module exports and documentation

### Enhanced

**Schema** (`client/src/schemas/modeling-wizard.schemas.ts`):

- `capitalAllocationSchema` - Comprehensive validation with cross-field rules
- `stageAllocationSchema` - Per-stage follow-on configurations
- `pacingPeriodSchema` - Time-based deployment with date ranges
- Cross-field validation (totals sum to 100%, no overlaps, reserve constraints)

### Tests

- ✅ 25+ calculation tests passing (`capital-allocation-calculations.test.ts`)
- ✅ Integration tests for wizard step
- ✅ 584 total tests passing (no regressions)
- ✅ All TypeScript checks passing

### Files Created (16 total)

1. `client/src/components/modeling-wizard/steps/capital-allocation/InitialInvestmentSection.tsx`
2. `client/src/components/modeling-wizard/steps/capital-allocation/FollowOnStrategyTable.tsx`
3. `client/src/components/modeling-wizard/steps/capital-allocation/PacingHorizonBuilder.tsx`
4. `client/src/components/modeling-wizard/steps/capital-allocation/CalculationSummaryCard.tsx`
5. `client/src/components/modeling-wizard/steps/capital-allocation/AllocationsTable.tsx`
6. `client/src/components/modeling-wizard/steps/capital-allocation/CapitalHeader.tsx`
7. `client/src/components/modeling-wizard/steps/capital-allocation/CompanyDialog.tsx`
8. `client/src/components/modeling-wizard/steps/capital-allocation/PortfolioConfigForm.tsx`
9. `client/src/components/modeling-wizard/steps/capital-allocation/PortfolioSummary.tsx`
10. `client/src/components/modeling-wizard/steps/capital-allocation/PortfolioTable.tsx`
11. `client/src/components/modeling-wizard/steps/capital-allocation/ReserveMetricsDisplay.tsx`
12. `client/src/components/modeling-wizard/steps/capital-allocation/ValidationDisplay.tsx`
13. `client/src/components/modeling-wizard/steps/capital-allocation/index.ts`
14. `client/src/components/modeling-wizard/steps/capital-allocation/README.md`
15. `client/src/lib/capital-allocation-calculations.ts`
16. `client/src/lib/__tests__/capital-allocation-calculations.test.ts`
17. `client/src/hooks/useCapitalAllocationCalculations.ts`

### Files Modified (2 total)

1. `client/src/schemas/modeling-wizard.schemas.ts` - Added capital allocation
   schemas
2. `client/src/components/modeling-wizard/steps/index.ts` - Export
   CapitalAllocationStep

---

## [Unreleased] – 2025‑10‑06

### Added

#### J-Curve Forecasting Engine - COMPLETE ✅

**Phase 1-3: Complete J-Curve Implementation (17/17 files)**

- **Phase 1** (4 files): Core mathematical engine with Gompertz/logistic curve
  fitting
  - `shared/lib/jcurve-shapes.ts` - Gompertz & logistic curve functions
  - `shared/lib/jcurve-fit.ts` - Levenberg-Marquardt nonlinear least squares
    wrapper
  - `shared/lib/jcurve.ts` - Main J-curve path computation engine (334 LOC)
  - `types/ml-levenberg-marquardt.d.ts` - Type shim for curve fitting library

- **Phase 2** (12 files): Supporting libraries, tests, UI components,
  documentation
  - `shared/lib/fund-math.ts` - Fee calculations, capital projections,
    TVPI/DPI/RVPI (370 LOC)
  - `shared/lib/lifecycle-rules.ts` - Fund age & lifecycle stage detection (130
    LOC)
  - `server/services/construction-forecast-calculator.ts` - Empty fund forecasts
    (154 LOC)
  - 4 comprehensive test suites:
    `tests/shared/{jcurve,jcurve-golden,fund-math-fees,lifecycle-rules}.spec.ts`
  - 3 UI components: `SourceBadge.tsx`, `EmptyFundHeader.tsx`,
    `TVPISparkline.tsx` (stub)
  - `docs/forecasting/CALIBRATION_GUIDE.md` - Parameter tuning guide (250 LOC)
  - `docs/HANDOFF_JCURVE_IMPLEMENTATION.md` - Implementation tracking

- **Phase 3** (3 files): Integration with existing metrics pipeline
  - `shared/types/metrics.ts` - Added `MetricSource` type & `MetricValue<T>`
    wrapper
  - `server/services/metrics-aggregator.ts` - Construction phase detection &
    routing
  - `server/services/projected-metrics-calculator.ts` - J-curve forecast
    integration

**Key Features**:

- Automatic construction phase detection (no investments + year 0)
- Gompertz/logistic curve fitting with Levenberg-Marquardt optimization
- Calibration to actual TVPI points when available
- Sensitivity bands (±20% variance for scenario planning)
- Fee-adjusted NAV calculation with multi-tier fee profiles
- Fallback to piecewise linear on curve fitting failure
- Seamless integration with existing metrics API

**Dependencies**:

- Added `ml-levenberg-marquardt@6.0.0` for nonlinear curve fitting
- All dependencies type-safe with strict undefined guards

**Validation**:

- ✅ All TypeScript errors fixed in new code
- ✅ Comprehensive test coverage (4 test suites, 50+ test cases)
- ✅ Golden dataset validation (10yr, 2.5x fund reference)
- ✅ Production-ready error handling & fallbacks

**Documentation**:

- Calibration guide with fund-type-specific parameters
- Technical implementation handoff memo
- Inline JSDoc for all public APIs

#### Phase 2 - Agent-Core Optimization (In Progress)

**Phase 2 - Issue #1: Worker Thread Serialization** ✅ COMPLETE

- Fixed critical async serialization flaw (was fake async, still blocked event
  loop)
- Implemented Piscina worker thread pool for true async serialization
- Small objects (< 1KB): Fast synchronous path
- Large objects (≥ 1KB): Offload to worker thread
- Performance: Event loop blocking 100-500ms → 0-5ms
- Comprehensive test suite (25+ test cases)
- See:
  [packages/agent-core/PHASE2_ISSUE1_COMPLETION.md](packages/agent-core/PHASE2_ISSUE1_COMPLETION.md)

**Phase 2 - Issue #2: Redis L2 Cache** 🚧 Day 1/3 Complete

- Created cache infrastructure foundation for serverless (Vercel) compatibility
- CacheAdapter interface for pluggable backends (Upstash/ioredis/in-memory)
- UpstashAdapter: HTTP Redis client optimized for Vercel serverless
  - MessagePack serialization (30-50% smaller payload)
  - gzip compression for objects > 2KB
  - Circuit breaker fault tolerance (trip after 5 failures, 2min recovery)
  - 25ms operation timeout with graceful degradation
  - 128KB payload size limit
- KeySchema: Versioned keys (`v1`) with tag-based bulk invalidation
- CircuitBreaker: Automatic failure detection and recovery (CLOSED → OPEN →
  HALF_OPEN)
- Status: Foundation complete (1,368 LOC), integration pending (Day 2-3)
- Next: ConversationCache integration with Stale-While-Revalidate pattern
- See:
  [packages/agent-core/PHASE2_ISSUE2_DETAILED_PLAN.md](packages/agent-core/PHASE2_ISSUE2_DETAILED_PLAN.md)

**Multi-AI Review Results**:

- 3 AI models (GPT-4, Gemini, DeepSeek) reviewed Phase 1 implementation
- Average Score: 7.3/10, Confidence: 73%
- Verdict: Conditional GO (fix 5 P0 issues before production)
- All critical issues being addressed in Phase 2
- See:
  [packages/agent-core/reviews/MULTI_AI_CONSENSUS_REPORT.md](packages/agent-core/reviews/MULTI_AI_CONSENSUS_REPORT.md)

### Changed

- **Development Dependencies Updated** - Merged Dependabot PR with 7 package
  updates
  - `@playwright/test` 1.55.1 → 1.56.0 - Added Playwright Agents for LLM-guided
    test creation
  - `@redocly/cli` 2.3.0 → 2.3.1 - JSONPath bug fixes for API documentation
  - `@replit/vite-plugin-cartographer` 0.2.8 → 0.3.1 - Vite plugin improvements
  - `@typescript-eslint/utils` 8.45.0 → 8.46.0 - ESLint rule improvements
  - `tsx` 4.19.2 → 4.20.6 - TypeScript execution bug fixes
  - `vite` 5.4.11 → 5.4.20 - Multiple security patches (fs.strict checks,
    request validation)
  - Removed deprecated `@types/xlsx` stub package (xlsx provides own types)
- **Sidecar Architecture Enhanced** - Added testing libraries to Windows sidecar
  workspace
  - Added `jsdom`, `@testing-library/jest-dom`, `@testing-library/react`,
    `@testing-library/user-event`
  - Ensures Vitest running from tools_local can find all test dependencies
  - Updated tools_local to match Vite 5.4.20 and tsx 4.20.6 versions

### Added

- **Conversation Memory System** - Multi-turn conversation persistence for
  cross-agent workflows
  - Thread-based conversations with UUID tracking and parent/child chains
  - Cross-tool continuation (analyzer → fixer → validator with full context)
  - File/image context preservation with newest-first prioritization strategy
  - Token-aware history building with intelligent truncation (newest turns
    prioritized)
  - Storage backend abstraction (in-memory for dev, Redis for production)
  - Integrated into `BaseAgent` with `enableConversationMemory` config flag
  - Architecture inspired by
    [zen-mcp-server](https://github.com/BeehiveInnovations/zen-mcp-server)
  - [Demo](packages/agent-core/demo-conversation-memory.ts) showing multi-agent
    workflow
  - Comprehensive test suite with 50+ test cases covering all scenarios

### Added (Previous)

- **Production-Grade Fund Modeling Schemas** - Complete TypeScript/Zod schema
  system for VC fund modeling
  - `StageProfile` - Replace hard-coded exit buckets with stage-driven
    valuations and deterministic cohort math
  - `FeeProfile` - Tiered management fee structure with 6 calculation bases,
    step-downs, and fee recycling
  - `CapitalCallPolicy` - Flexible capital call timing (upfront, periodic,
    as-needed, custom schedules)
  - `WaterfallPolicy` - European (fund-level) and American (deal-by-deal)
    distribution waterfalls with GP commit and clawback
  - `RecyclingPolicy` - Management fee and exit proceeds recycling with caps,
    terms, and timing control
  - `ExtendedFundModelInputs` - Complete fund model combining all policies with
    validation
  - [Documentation](docs/schemas/README.md) with examples and migration guide
  - [Example configurations](shared/schemas/examples/standard-fund.ts) for
    early-stage, micro-VC, and growth funds

### Technical Improvements

- **Decimal.js Integration** - All financial calculations use 30-digit precision
  decimals
- **Fractional Company Counts** - Support for fractional counts (e.g., 25.5
  companies) to eliminate rounding errors
- **Deterministic Cohort Math** - Stage progression uses expected values to
  preserve mass balance
- **Discriminated Unions** - Type-safe policy variants with Zod validation
- **Helper Functions** - Calculation utilities for fees, capital calls,
  waterfalls, and recycling
- **Comprehensive Validation** - Cross-field validation (e.g., graduation + exit
  ≤ 100%)

### Documentation

- Added complete schema system documentation with API reference
- Included migration guide from MVP hard-coded values to schema-based
  configuration
- Created standard, micro-VC, and growth fund example configurations
- Documented deterministic cohort math rationale

---

## [1.3.0] – 2025‑07‑28

### Added

- **Async Iteration Utilities** - Production-ready utilities to replace
  problematic `forEach` patterns
  - `forEachAsync()` for sequential async iteration
  - `processAsync()` for configurable parallel/sequential/batch processing
  - `mapAsync()`, `filterAsync()`, `findAsync()`, `reduceAsync()` for async
    array operations
  - `safeArray()` wrapper for null-safe array handling
  - Comprehensive error handling with fail-fast and error-resilient modes
  - Batch processing with configurable delays for rate limiting
  - [Documentation](docs/dev/async-iteration.md) with migration guide and
    examples

### Fixed

- Eliminated "[object Promise]" errors from async forEach operations
- Improved async operation reliability and error handling

### Documentation

- Added async iteration utilities guide with API reference and usage patterns
- Included performance benchmarking examples and Jest test cases
- Created migration checklist for systematic adoption

---

## Previous Releases

<!-- Add previous releases here as they are tagged -->
