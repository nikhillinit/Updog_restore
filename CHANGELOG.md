# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2025-10-13] TypeScript Config Unification (Day 0 - Critical Fix)

### Changed

- **BREAKING**: Unified TypeScript strictness across all build paths
  - Removed `strict: false`, `strictNullChecks: false`, and other relaxations
    from `tsconfig.server.json`
  - Removed `tsconfigRaw` strictness bypass from `vite.config.ts` esbuild
    configuration
  - Archived divergent tsconfigs to `.archive/tsconfigs-pre-unification/`:
    - `tsconfig.build.json`
    - `tsconfig.nocheck.json`
    - `tsconfig.ignore.json`
    - `tsconfig.fast.json`
  - Updated package.json scripts to use unified `tsconfig.json`
  - Added `type-check` script alias for CI compatibility

### Impact

- **Unified baseline: 298 TypeScript errors** (down from 539 due to corrected
  config chain)
- Build process now uses same strictness as type checking (no more hidden
  errors)
- Server code inherits strict settings from base (except
  `noPropertyAccessFromIndexSignature: false` for Express idioms)
- All environments (dev/build/CI) now see identical error counts

### Rationale

- Previous config had 3 competing type-checking realities:
  1. Base tsconfig: strict mode ON (showing some errors)
  2. Vite build: bypassed strict checks via tsconfigRaw (hiding errors)
  3. Server build: disabled strictNullChecks and other checks (hiding errors)
- Fixing errors under relaxed configs would create false progress
- Unification prevents "Week 4 explosion" scenario where hidden errors suddenly
  appear
- See DECISIONS.md ADR-001 for detailed analysis

---

## [Unreleased] – 2025‑10‑04

### Added

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

### 2025-10-12 17:45 UTC - OpenTelemetry Resource Import Fix

**Changed:**

- Fixed `server/otel.ts` to use `resourceFromAttributes()` factory function
  instead of `Resource` constructor
- Updated imports from `@opentelemetry/resources` to match OpenTelemetry v2.x
  API

**Technical Details:**

- OpenTelemetry v2.x no longer exports Resource as a constructor class
- Must use `resourceFromAttributes()` utility function for creating Resource
  instances
- Pattern confirmed by official OpenTelemetry documentation and npm package
  examples

**Files Modified:**

- `server/otel.ts` - Changed from `new Resource()` to `resourceFromAttributes()`

**Commit:** 5520994

### 2025-10-12 18:00 UTC - k6 Performance Testing Investigation

**Status:**

- k6 test files exist and are well-configured in `k6/scenarios/` and `tests/k6/`
- k6 binary not installed on Windows development machine
- npm script `test:baseline` exists but requires k6 installation

**Installation Options Researched:**

1. **WinGet (Recommended):** `winget install k6 --source winget` - Built into
   Windows 10/11
2. **MSI Installer:** Direct download from GitHub releases
3. **Standalone ZIP:** Portable installation option
4. **Docker:** For CI/CD and local testing without installation

**Next Steps:**

- User to choose installation method (WinGet recommended)
- After install: verify with `k6 version` and `npm run test:baseline`
- Consider adding Docker-based scripts for portable testing

**Related:** OpenTelemetry Resource fix (commit 5520994) completed - server
ready for instrumentation

### 2025-10-12 18:30 UTC - Performance Gates Workflow Security & Consistency Improvements

**Changed:**

- Updated `.github/workflows/performance-gates.yml` with comprehensive security
  and consistency fixes

**Security Improvements:**

- All GitHub Actions now use SHA-pinned versions instead of tags (prevents tag
  manipulation attacks)
- Fixed `github-script` action to use environment variables instead of direct
  variable interpolation (prevents script injection)
- Changed from `${{ vars.PERF_GATES_ENFORCE }}` to
  `process.env.PERF_GATES_ENFORCE` access pattern

**Consistency Improvements:**

- Standardized Node.js setup to use `.nvmrc` file consistently
- Added `retention-days` to artifact uploads (30 days for bundle metrics, 7 days
  for k6 results)
- Quoted cache parameter consistently: `cache: 'npm'`
- All Docker images use Alpine variants for smaller size

**Actions Updated:**

- `actions/checkout@v4` → SHA-pinned with comment
- `actions/setup-node@v5` → SHA-pinned with comment
- `actions/upload-artifact@v4` → SHA-pinned with comment
- `actions/download-artifact@v4` → SHA-pinned with comment
- `actions/github-script@v7` → SHA-pinned with comment

**Agent Analysis:**

- Ran comprehensive workflow consistency check across 57 workflow files
- Identified and fixed inconsistencies in action versions, Node.js setup, and
  security patterns
- Aligns with GitHub Actions security best practices and project conventions

**Commit:** d04e30c
