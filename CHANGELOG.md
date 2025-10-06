# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] – 2025‑10‑06

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
