# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] – 2025‑10‑06

### Added

#### J-Curve Forecasting Engine - COMPLETE ✅

**Phase 1-3: Complete J-Curve Implementation (17/17 files)**
- **Phase 1** (4 files): Core mathematical engine with Gompertz/logistic curve fitting
  - `shared/lib/jcurve-shapes.ts` - Gompertz & logistic curve functions
  - `shared/lib/jcurve-fit.ts` - Levenberg-Marquardt nonlinear least squares wrapper
  - `shared/lib/jcurve.ts` - Main J-curve path computation engine (334 LOC)
  - `types/ml-levenberg-marquardt.d.ts` - Type shim for curve fitting library

- **Phase 2** (12 files): Supporting libraries, tests, UI components, documentation
  - `shared/lib/fund-math.ts` - Fee calculations, capital projections, TVPI/DPI/RVPI (370 LOC)
  - `shared/lib/lifecycle-rules.ts` - Fund age & lifecycle stage detection (130 LOC)
  - `server/services/construction-forecast-calculator.ts` - Empty fund forecasts (154 LOC)
  - 4 comprehensive test suites: `tests/shared/{jcurve,jcurve-golden,fund-math-fees,lifecycle-rules}.spec.ts`
  - 3 UI components: `SourceBadge.tsx`, `EmptyFundHeader.tsx`, `TVPISparkline.tsx` (stub)
  - `docs/forecasting/CALIBRATION_GUIDE.md` - Parameter tuning guide (250 LOC)
  - `docs/HANDOFF_JCURVE_IMPLEMENTATION.md` - Implementation tracking

- **Phase 3** (3 files): Integration with existing metrics pipeline
  - `shared/types/metrics.ts` - Added `MetricSource` type & `MetricValue<T>` wrapper
  - `server/services/metrics-aggregator.ts` - Construction phase detection & routing
  - `server/services/projected-metrics-calculator.ts` - J-curve forecast integration

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
- Fixed critical async serialization flaw (was fake async, still blocked event loop)
- Implemented Piscina worker thread pool for true async serialization
- Small objects (< 1KB): Fast synchronous path
- Large objects (≥ 1KB): Offload to worker thread
- Performance: Event loop blocking 100-500ms → 0-5ms
- Comprehensive test suite (25+ test cases)
- See: [packages/agent-core/PHASE2_ISSUE1_COMPLETION.md](packages/agent-core/PHASE2_ISSUE1_COMPLETION.md)

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
- CircuitBreaker: Automatic failure detection and recovery (CLOSED → OPEN → HALF_OPEN)
- Status: Foundation complete (1,368 LOC), integration pending (Day 2-3)
- Next: ConversationCache integration with Stale-While-Revalidate pattern
- See: [packages/agent-core/PHASE2_ISSUE2_DETAILED_PLAN.md](packages/agent-core/PHASE2_ISSUE2_DETAILED_PLAN.md)

**Multi-AI Review Results**:
- 3 AI models (GPT-4, Gemini, DeepSeek) reviewed Phase 1 implementation
- Average Score: 7.3/10, Confidence: 73%
- Verdict: Conditional GO (fix 5 P0 issues before production)
- All critical issues being addressed in Phase 2
- See: [packages/agent-core/reviews/MULTI_AI_CONSENSUS_REPORT.md](packages/agent-core/reviews/MULTI_AI_CONSENSUS_REPORT.md)

### Changed
- **Development Dependencies Updated** - Merged Dependabot PR with 7 package updates
  - `@playwright/test` 1.55.1 → 1.56.0 - Added Playwright Agents for LLM-guided test creation
  - `@redocly/cli` 2.3.0 → 2.3.1 - JSONPath bug fixes for API documentation
  - `@replit/vite-plugin-cartographer` 0.2.8 → 0.3.1 - Vite plugin improvements
  - `@typescript-eslint/utils` 8.45.0 → 8.46.0 - ESLint rule improvements
  - `tsx` 4.19.2 → 4.20.6 - TypeScript execution bug fixes
  - `vite` 5.4.11 → 5.4.20 - Multiple security patches (fs.strict checks, request validation)
  - Removed deprecated `@types/xlsx` stub package (xlsx provides own types)
- **Sidecar Architecture Enhanced** - Added testing libraries to Windows sidecar workspace
  - Added `jsdom`, `@testing-library/jest-dom`, `@testing-library/react`, `@testing-library/user-event`
  - Ensures Vitest running from tools_local can find all test dependencies
  - Updated tools_local to match Vite 5.4.20 and tsx 4.20.6 versions

### Added
- **Conversation Memory System** - Multi-turn conversation persistence for cross-agent workflows
  - Thread-based conversations with UUID tracking and parent/child chains
  - Cross-tool continuation (analyzer → fixer → validator with full context)
  - File/image context preservation with newest-first prioritization strategy
  - Token-aware history building with intelligent truncation (newest turns prioritized)
  - Storage backend abstraction (in-memory for dev, Redis for production)
  - Integrated into `BaseAgent` with `enableConversationMemory` config flag
  - Architecture inspired by [zen-mcp-server](https://github.com/BeehiveInnovations/zen-mcp-server)
  - [Demo](packages/agent-core/demo-conversation-memory.ts) showing multi-agent workflow
  - Comprehensive test suite with 50+ test cases covering all scenarios

### Added (Previous)
- **Production-Grade Fund Modeling Schemas** - Complete TypeScript/Zod schema system for VC fund modeling
  - `StageProfile` - Replace hard-coded exit buckets with stage-driven valuations and deterministic cohort math
  - `FeeProfile` - Tiered management fee structure with 6 calculation bases, step-downs, and fee recycling
  - `CapitalCallPolicy` - Flexible capital call timing (upfront, periodic, as-needed, custom schedules)
  - `WaterfallPolicy` - European (fund-level) and American (deal-by-deal) distribution waterfalls with GP commit and clawback
  - `RecyclingPolicy` - Management fee and exit proceeds recycling with caps, terms, and timing control
  - `ExtendedFundModelInputs` - Complete fund model combining all policies with validation
  - [Documentation](docs/schemas/README.md) with examples and migration guide
  - [Example configurations](shared/schemas/examples/standard-fund.ts) for early-stage, micro-VC, and growth funds

### Technical Improvements
- **Decimal.js Integration** - All financial calculations use 30-digit precision decimals
- **Fractional Company Counts** - Support for fractional counts (e.g., 25.5 companies) to eliminate rounding errors
- **Deterministic Cohort Math** - Stage progression uses expected values to preserve mass balance
- **Discriminated Unions** - Type-safe policy variants with Zod validation
- **Helper Functions** - Calculation utilities for fees, capital calls, waterfalls, and recycling
- **Comprehensive Validation** - Cross-field validation (e.g., graduation + exit ≤ 100%)

### Documentation
- Added complete schema system documentation with API reference
- Included migration guide from MVP hard-coded values to schema-based configuration
- Created standard, micro-VC, and growth fund example configurations
- Documented deterministic cohort math rationale

---

## [1.3.0] – 2025‑07‑28

### Added
- **Async Iteration Utilities** - Production-ready utilities to replace problematic `forEach` patterns
  - `forEachAsync()` for sequential async iteration
  - `processAsync()` for configurable parallel/sequential/batch processing
  - `mapAsync()`, `filterAsync()`, `findAsync()`, `reduceAsync()` for async array operations
  - `safeArray()` wrapper for null-safe array handling
  - Comprehensive error handling with fail-fast and error-resilient modes
  - Batch processing with configurable delays for rate limiting
  - [Documentation](docs/dev/async-iteration.md) with migration guide and examples

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
