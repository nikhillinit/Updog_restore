# Advanced Cohort Analysis - Implementation Plan

**Goal:** Implement cohort analysis to visualize portfolio performance by vintage/sector with company-level and investment-level views.

**Design Reference:** [docs/plans/2026-01-04-advanced-cohort-analysis-design.md](docs/plans/2026-01-04-advanced-cohort-analysis-design.md)

---

## Phase 1: Database Schema & Migration

### Task 1.1: Define Drizzle Schemas
**File:** `shared/schema.ts`

- [ ] Add enum definitions:
  - `vintageGranularityEnum` ("year", "quarter")
  - `cohortUnitEnum` ("company", "investment")
  - `mappingSourceEnum` ("seed_identity", "manual", "suggested", "imported")
- [ ] Define `sectorTaxonomy` table with:
  - PK: id (uuid)
  - Scoping: fundId, taxonomyVersion
  - Fields: name, slug, parentSectorId, sortOrder, isSystem
  - Unique index: (fundId, taxonomyVersion, slug)
- [ ] Define `sectorMappings` table with:
  - PK: id (uuid)
  - Fields: fundId, taxonomyVersion, rawValue, rawValueNormalized, canonicalSectorId, confidenceScore, source
  - Unique index: (fundId, taxonomyVersion, rawValueNormalized)
- [ ] Define `companyOverrides` table with:
  - PK: id (uuid)
  - Fields: fundId, taxonomyVersion, companyId, canonicalSectorId (nullable), excludeFromCohorts
  - Unique index: (fundId, taxonomyVersion, companyId)
- [ ] Define `investmentOverrides` table with:
  - PK: id (uuid)
  - Fields: fundId, investmentId, excludeFromCohorts, vintageYear, vintageQuarter
  - Unique index: (fundId, investmentId)
- [ ] Define `cohortDefinitions` table with:
  - PK: id (uuid)
  - Fields: fundId, name, vintageGranularity, sectorTaxonomyVersion, unit, isDefault, archivedAt
  - Unique index: (fundId, name)

**Success Criteria:** TypeScript types generated, schema compiles without errors

---

### Task 1.2: Create Database Migration
**File:** `shared/migrations/XXXX_cohort_normalization.sql`

- [ ] Create migration script with:
  - CREATE TABLE statements for all 5 tables
  - Indexes from design doc
  - Foreign key constraints to existing tables
  - Partial unique index for cohort_definitions.isDefault per fund
- [ ] Test migration rollback (down migration)

**Success Criteria:** Migration runs cleanly, all constraints enforced

---

### Task 1.3: Implement Seed Function
**File:** `server/utils/cohort-seeding.ts` (new file)

- [ ] Create `seedCohortTaxonomy(fundId)` function:
  - Query distinct sectors from portfolioCompanies
  - Create taxonomy version "v1"
  - Insert system "Unmapped" sector
  - Create identity canonical sectors
  - Create identity sector mappings
  - Insert default cohort definitions
- [ ] Make idempotent (check if already seeded)
- [ ] Add unit tests for seed logic

**Success Criteria:** Seed function populates all tables correctly, can run multiple times safely

---

## Phase 2: Core Helper Functions

### Task 2.1: Sector Normalization Helper
**File:** `shared/utils/sector-normalization.ts` (new file)

- [ ] Implement `normalizeSector(rawValue: string): string`:
  - Trim whitespace
  - Collapse multiple spaces
  - Lowercase
  - Handle null/empty as "(blank)"
- [ ] Add unit tests with edge cases

**Success Criteria:** Normalization is deterministic and handles all edge cases

---

### Task 2.2: Vintage Resolution Helper
**File:** `shared/utils/vintage-resolution.ts` (new file)

- [ ] Implement `resolveVintageKey()`:
  - Inputs: investmentDate, override year/quarter, granularity
  - Returns: { key: string, source: string }
  - Handle year granularity (YYYY)
  - Handle quarter granularity (YYYY-Q#)
  - Fallback logic for partial overrides
- [ ] Add unit tests for all precedence scenarios

**Success Criteria:** Vintage resolution follows 3-tier precedence correctly

---

### Task 2.3: Coverage Calculation Helper
**File:** `shared/utils/coverage-calculations.ts` (new file)

- [ ] Implement `calculateCoverage()`:
  - Count lots with acquisitionDate + costBasis (paid-in)
  - Count lots with disposalDate + disposalProceeds (distributions)
  - Count investments with investmentDate (vintage)
  - Return percentages and overall minimum
- [ ] Add unit tests

**Success Criteria:** Coverage percentages accurate, handles empty datasets

---

## Phase 3: CohortEngine Refactor

### Task 3.1: Define TypeScript Types
**File:** `shared/types.ts`

- [ ] Add types from design doc Section 3.1:
  - `CohortAnalyzeRequest`
  - `CohortAnalyzeResponse`
  - `CohortRow`
  - `CoverageSummary`
  - `ResolvedInvestment` (internal type)
- [ ] Export from shared module

**Success Criteria:** Types match design doc exactly, compile without errors

---

### Task 3.2: Resolved Investments Query
**File:** `client/src/core/cohorts/resolvers.ts` (new file)

- [ ] Implement `getResolvedInvestments()`:
  - Join portfolioCompanies + investments
  - Left join company_overrides
  - Left join investment_overrides
  - Left join sector_mappings
  - Compute resolved sector (4-tier precedence)
  - Compute resolved vintage (3-tier precedence)
  - Flag exclusions
  - Return provenance metadata
- [ ] Add unit tests with mock data

**Success Criteria:** Query returns correct resolved data, no N+1 queries

---

### Task 3.3: Company Cohort Key Computation
**File:** `client/src/core/cohorts/company-cohorts.ts` (new file)

- [ ] Implement `computeCompanyCohortKeys()`:
  - Group resolved investments by companyId
  - Filter to included investments only
  - Find MIN(resolvedVintageKey) per company
  - Track provenance (shifted vintage detection)
- [ ] Add unit tests for Option B exclusion semantics

**Success Criteria:** Company vintage equals earliest included investment

---

### Task 3.4: Cash-Flow Events Stream
**File:** `client/src/core/cohorts/cash-flows.ts` (new file)

- [ ] Implement `getCashFlowEvents()`:
  - Query lots table
  - Generate paid-in events (negative costBasis)
  - Generate distribution events (positive disposalProceeds)
  - Join to resolved investments
  - Assign cohortKey based on unit
  - Assign canonical sectorId
- [ ] Add unit tests for lots-based attribution

**Success Criteria:** Events mapped correctly, no double-counting

---

### Task 3.5: Metrics Calculation Engine
**File:** `client/src/core/cohorts/metrics.ts` (new file)

- [ ] Implement `calculateCohortMetrics()`:
  - Group events by (cohortKey, sectorId)
  - Sum paid-in (abs of negatives)
  - Sum distributions (positives)
  - Calculate DPI
  - Calculate TVPI (if residual value available)
  - Calculate IRR from aggregated cash flows (NOT averaged)
  - Pre-aggregate flows by date before XIRR
- [ ] Add unit tests against golden reference values

**Success Criteria:** IRR matches XIRR of aggregated flows, handles edge cases

---

### Task 3.6: Unit-Agnostic Pipeline
**File:** `client/src/core/cohorts/CohortEngine.ts`

- [ ] Extend existing CohortEngine with:
  - `analyzeCohorts(request: CohortAnalyzeRequest)` method
  - Load cohort definition (or default)
  - Call getResolvedInvestments()
  - If unit=company: call computeCompanyCohortKeys()
  - Call getCashFlowEvents()
  - Call calculateCohortMetrics()
  - Calculate coverage
  - Build response with provenance
- [ ] Maintain backward compatibility with existing methods
- [ ] Add integration tests

**Success Criteria:** Pipeline produces correct CohortAnalyzeResponse, backward compatible

---

## Phase 4: API Layer

### Task 4.1: Zod Validation Schemas
**File:** `shared/validation/cohort-schemas.ts` (new file)

- [ ] Define Zod schemas for:
  - `cohortAnalyzeRequestSchema`
  - `cohortAnalyzeResponseSchema`
  - `sectorMappingSchema`
  - `cohortDefinitionSchema`
- [ ] Export schemas

**Success Criteria:** Schemas validate correctly, match TypeScript types

---

### Task 4.2: Cohort Analysis Endpoint
**File:** `server/routes/cohort-analysis.ts` (new file)

- [ ] Implement `POST /api/cohorts/analyze`:
  - Zod validation of request body
  - Call CohortEngine.analyzeCohorts()
  - Return CohortAnalyzeResponse
  - Handle errors with proper status codes
- [ ] Add API integration tests

**Success Criteria:** Endpoint returns correct data, validates inputs

---

### Task 4.3: Sector Mapping Endpoints
**File:** `server/routes/cohort-mappings.ts` (new file)

- [ ] Implement `GET /api/cohorts/unmapped`:
  - Query for raw sectors resolving to "Unmapped"
  - Return counts and examples
- [ ] Implement `POST /api/cohorts/sector-mappings`:
  - Bulk upsert sector mappings
  - Zod validation
- [ ] Add API tests

**Success Criteria:** Bulk mapping works, unmapped query returns correct data

---

### Task 4.4: Cohort Definitions Endpoints
**File:** `server/routes/cohort-definitions.ts` (new file)

- [ ] Implement `GET /api/cohorts/definitions`:
  - List all definitions for fundId
  - Filter by unit if specified
- [ ] Implement `POST /api/cohorts/definitions`:
  - Create new cohort definition
  - Validate isDefault constraint
- [ ] Add API tests

**Success Criteria:** CRUD operations work correctly

---

## Phase 5: UI Components

### Task 5.1: Multi-View Chart Component (Line Chart)
**File:** `client/src/components/charts/cohort-analysis-chart.tsx`

- [ ] Replace existing placeholder with:
  - Recharts LineChart
  - X-axis: vintage years (cohortKey)
  - Y-axis: selected metric (IRR/TVPI/DPI)
  - One line per sector
  - Color mapping for sectors (max 8-10 colors)
  - Interactive legend (toggle sectors)
  - Fund average benchmark line
  - Lazy loading with Suspense
- [ ] Add metric selector toggle
- [ ] Add unit tests with React Testing Library

**Success Criteria:** Chart displays correctly, interactive legend works

---

### Task 5.2: Bar Chart View
**File:** Same as Task 5.1

- [ ] Add grouped bar chart option:
  - Bars grouped by vintage
  - Each bar = one sector
  - Same color mapping as line chart
- [ ] Add view toggle (Line/Bar)

**Success Criteria:** Bar chart displays correctly, toggle works

---

### Task 5.3: Heatmap View (Custom)
**File:** Same as Task 5.1

- [ ] Implement custom Recharts heatmap:
  - X-axis: vintage years
  - Y-axis: sectors
  - Color intensity: performance metric value
  - Tooltip showing exact values
- [ ] Add to view toggle (Line/Bar/Heatmap)

**Success Criteria:** Heatmap renders correctly, color scale intuitive

**Note:** This is higher effort - defer to later sprint if needed

---

### Task 5.4: Sector Mapping Management UI
**File:** `client/src/components/cohorts/sector-mapping-dialog.tsx` (new file)

- [ ] Create dialog/modal with:
  - List of raw sectors
  - Search/filter input
  - Dropdown to map raw → canonical sector
  - Confidence score display
  - Source indicator (override/mapping/unmapped)
  - Bulk apply button
- [ ] Use TanStack Query for data fetching
- [ ] Add unit tests

**Success Criteria:** Users can map sectors, changes persist

---

### Task 5.5: Unmapped Bucket Banner
**File:** `client/src/components/cohorts/unmapped-banner.tsx` (new file)

- [ ] Create prominent banner component:
  - Shows when unmapped count > 0
  - Displays count of unmapped sectors
  - Link to sector mapping dialog
  - Dismissible but reappears on refresh if still unmapped
- [ ] Add to analytics page

**Success Criteria:** Banner appears when needed, links to mapping UI

---

### Task 5.6: Cohort Definition Selector
**File:** `client/src/components/cohorts/cohort-selector.tsx` (new file)

- [ ] Create dropdown selector:
  - Lists available cohort definitions
  - Shows unit (Company/Investment) and granularity (Year/Quarter)
  - Default selected
  - onChange updates chart
- [ ] Integrate with TanStack Query

**Success Criteria:** Switching definitions updates chart correctly

---

### Task 5.7: Coverage Indicator
**File:** `client/src/components/cohorts/coverage-indicator.tsx` (new file)

- [ ] Create coverage bar component:
  - Progress bar showing overall coverage percentage
  - Breakdown tooltip (paid-in %, distributions %, vintage %, marks %)
  - Warning badge if < 90%
  - Always visible
- [ ] Add to chart container

**Success Criteria:** Coverage displays correctly, updates with data

---

### Task 5.8: Integration with Analytics Page
**File:** `client/src/pages/analytics.tsx`

- [ ] Add cohort analysis section:
  - Cohort selector dropdown
  - Multi-view chart component
  - Coverage indicator
  - Unmapped banner (conditional)
  - Link to sector mapping dialog
- [ ] Use TanStack Query for data fetching
- [ ] Handle loading and error states

**Success Criteria:** Full cohort analysis UI functional on analytics page

---

## Phase 6: Testing & Validation

### Task 6.1: Truth Cases - Single Company Single Lot
**File:** `tests/unit/engines/cohort-engine.test.ts`

- [ ] Test case: Single company with one lot
  - Paid-in event: -$100k on 2021-01-15
  - Distribution event: +$250k on 2023-06-30
  - Expected: DPI = 2.5, IRR = calculated XIRR
- [ ] Verify no double-counting
- [ ] Verify company vintage = 2021

**Success Criteria:** Test passes with golden reference values

---

### Task 6.2: Truth Cases - Multiple Lots (Follow-ons)
**File:** Same as Task 6.1

- [ ] Test case: Company with 3 investments (Seed, Series A, B)
  - All cash flows from lots table
  - Company vintage = earliest investment (Seed)
  - Verify aggregated IRR != averaged IRR
- [ ] Test exclusion propagation

**Success Criteria:** Company cohort key correct, metrics accurate

---

### Task 6.3: Truth Cases - Partial Sales
**File:** Same as Task 6.1

- [ ] Test case: Lot with partial sale
  - Acquisition: 100 shares at $10 = -$1000
  - Disposal: 40 shares at $50 = +$2000
  - Remaining: 60 shares at $50 = $3000 residual
  - Expected: DPI = 2.0, TVPI = 5.0 (if marks available)

**Success Criteria:** Remaining shares handled correctly

---

### Task 6.4: Truth Cases - Excluded First Check
**File:** Same as Task 6.1

- [ ] Test case: Company with first check excluded
  - First investment: 2020-Q4 (excluded via investment_overrides)
  - Second investment: 2021-Q2 (included)
  - Expected: Company vintage = 2021 (not 2020)
  - Provenance: "shifted_due_to_exclusion"

**Success Criteria:** Option B exclusion semantics verified

---

### Task 6.5: Truth Cases - Unmapped Sector Fallback
**File:** Same as Task 6.1

- [ ] Test case: Company with no sector mapping
  - portfolioCompanies.sector = "Blockchain" (not in taxonomy)
  - No company_override
  - No sector_mapping entry
  - Expected: Canonical sector = "Unmapped"
  - Provenance: sectorSource = "unmapped"

**Success Criteria:** Unmapped fallback works correctly

---

### Task 6.6: Invariant Tests - No Double Counting
**File:** `tests/unit/engines/cohort-invariants.test.ts` (new file)

- [ ] Test: Sum of all lot cash flows = fund-level total
- [ ] Test: Each lot contributes exactly once
- [ ] Test: Switching units doesn't change fund totals

**Success Criteria:** Invariants hold for all test datasets

---

### Task 6.7: Invariant Tests - Aggregated IRR
**File:** Same as Task 6.6

- [ ] Test: Cohort IRR = XIRR(aggregated cash flows)
- [ ] Test: Cohort IRR != average of investment IRRs
- [ ] Use golden reference implementation

**Success Criteria:** IRR calculation verified as correct

---

### Task 6.8: Integration Tests - API Endpoints
**File:** `tests/api/cohort-analysis.test.ts` (new file)

- [ ] Test `POST /api/cohorts/analyze`:
  - Happy path with valid request
  - Returns expected CohortAnalyzeResponse structure
  - Coverage calculations correct
  - Provenance metadata present
- [ ] Test error cases (invalid fundId, missing data)

**Success Criteria:** All API endpoints tested, edge cases covered

---

### Task 6.9: Coverage Threshold Tests (V2 Gating)
**File:** `tests/unit/engines/cohort-coverage.test.ts` (new file)

- [ ] Test: Coverage < 90% hides investment performance metrics
- [ ] Test: Coverage >= 90% shows investment performance
- [ ] Test: Coverage indicator always visible

**Success Criteria:** Dual gating logic verified

---

## Phase 7: V1 Deployment

### Task 7.1: Feature Flag Setup
**File:** Environment config / feature flag system

- [ ] Add feature flag: `cohorts.v2.checkLevelPerformance`
- [ ] Default: OFF (V2 gated)
- [ ] Document flag in deployment guide

**Success Criteria:** Feature flag toggles V2 functionality

---

### Task 7.2: Run Migration on Staging
**Deployment task**

- [ ] Run Drizzle migration on staging database
- [ ] Verify all tables created with correct constraints
- [ ] Run seed function for test fund
- [ ] Verify seed data correct

**Success Criteria:** Staging database ready for testing

---

### Task 7.3: Smoke Tests on Staging
**QA task**

- [ ] Load analytics page with cohort analysis
- [ ] Verify company-level chart displays
- [ ] Verify investment-level exposure displays
- [ ] Test sector mapping UI
- [ ] Verify coverage indicator shows
- [ ] Test unmapped bucket workflow

**Success Criteria:** All V1 features working on staging

---

### Task 7.4: Deploy to Production
**Deployment task**

- [ ] Run migration on production
- [ ] Deploy application code
- [ ] Run seed function for all funds
- [ ] Monitor for errors
- [ ] Verify analytics page loads

**Success Criteria:** V1 deployed successfully, no errors

---

### Task 7.5: Update Documentation
**File:** User-facing and engineering docs

- [ ] Write user guide: "How Cohort Analysis Works"
- [ ] Write admin guide: "How to Manage Sector Mappings"
- [ ] Write engineering doc: "Data Provenance & Gating"
- [ ] Update CHANGELOG.md

**Success Criteria:** Documentation complete and accurate

---

## Phase 8: V2 Preparation (Investment-Level Performance - Gated)

### Task 8.1: Lot-Based Attribution for Investment Cohorts
**File:** `client/src/core/cohorts/investment-performance.ts` (new file)

- [ ] Extend getCashFlowEvents() for investment-level:
  - Assign cohortKey based on investment's resolved vintage
  - Keep sectorId from company canonical sector
- [ ] Add calculateInvestmentMetrics():
  - Group by (investmentVintageKey, sectorId)
  - Compute DPI/TVPI/IRR per group
- [ ] Add unit tests with lots-based data

**Success Criteria:** Investment-level performance calculated correctly

---

### Task 8.2: Dual Gating Logic
**File:** `client/src/core/cohorts/CohortEngine.ts`

- [ ] Add gating checks:
  - Feature flag: check `cohorts.v2.checkLevelPerformance`
  - Coverage gate: check `overallCoveragePct >= 0.90`
- [ ] If gated: return null for investment performance metrics
- [ ] If ungated: return full metrics
- [ ] Update response to indicate gating status

**Success Criteria:** V2 metrics only shown when both gates pass

---

### Task 8.3: DPI-Only Fallback (No Marks)
**File:** Same as Task 8.2

- [ ] Check if marks are available (residualValue data)
- [ ] If no marks:
  - Show DPI (realized only)
  - Show realized-only IRR
  - Hide TVPI
  - Return null for tvpi field
- [ ] Add UI indicator: "TVPI unavailable (no marks)"

**Success Criteria:** Graceful degradation when marks missing

---

### Task 8.4: V2 Truth Cases
**File:** `tests/unit/engines/cohort-v2.test.ts` (new file)

- [ ] Test: Investment-level cohort with lots attribution
- [ ] Test: Check-level IRR matches aggregated flows
- [ ] Test: Coverage gating hides metrics when < 90%
- [ ] Test: DPI-only mode when no marks

**Success Criteria:** All V2 gating and attribution logic verified

---

### Task 8.5: V2 UI Updates
**File:** Various UI components

- [ ] Update coverage indicator to show V2 gate status
- [ ] Add tooltip: "Investment performance requires ≥90% coverage"
- [ ] Update chart to show/hide investment metrics based on gates
- [ ] Add "Enable V2" instructions for admins

**Success Criteria:** UI clearly indicates when V2 is gated

---

### Task 8.6: V2 Validation Checklist
**QA task**

- [ ] Verify truth cases pass
- [ ] Check data coverage on production dataset
- [ ] Verify coverage indicator correct
- [ ] Test feature flag toggle
- [ ] Verify DPI-only fallback works

**Success Criteria:** V2 ready for production enablement

---

### Task 8.7: V2 Deployment (When Ready)
**Deployment task**

- [ ] Verify coverage >= 90% on production
- [ ] Enable feature flag: `cohorts.v2.checkLevelPerformance = true`
- [ ] Monitor for errors
- [ ] Verify investment performance metrics display

**Success Criteria:** V2 enabled successfully

---

## Implementation Checklist Summary

**Phase 1: Database Schema** (3 tasks)
- Schema definitions, migration, seeding

**Phase 2: Core Helpers** (3 tasks)
- Normalization, vintage resolution, coverage

**Phase 3: CohortEngine Refactor** (6 tasks)
- Types, queries, company cohorts, cash flows, metrics, pipeline

**Phase 4: API Layer** (4 tasks)
- Validation schemas, endpoints

**Phase 5: UI Components** (8 tasks)
- Charts (line/bar/heatmap), sector mapping, selectors, integration

**Phase 6: Testing** (9 tasks)
- Truth cases, invariants, integration tests, coverage tests

**Phase 7: V1 Deployment** (5 tasks)
- Feature flags, migration, smoke tests, deployment, docs

**Phase 8: V2 Preparation** (7 tasks)
- Investment performance, dual gating, DPI fallback, validation

**Total: 45 bite-sized tasks**

---

## Risk Mitigation

**Risk 1: XIRR Performance**
- Mitigation: Pre-aggregate cash flows by date before XIRR
- Test with large datasets (1000+ companies)

**Risk 2: N+1 Query Performance**
- Mitigation: Single resolved investments query
- Add database indexes per design doc

**Risk 3: Data Quality (Coverage < 90%)**
- Mitigation: Coverage indicator always visible
- V2 gated until data quality improves

**Risk 4: Heatmap Complexity**
- Mitigation: Defer to later sprint if needed
- Line/Bar charts provide 80% of value

**Risk 5: Backward Compatibility**
- Mitigation: Maintain existing CohortEngine methods
- Add integration tests for legacy code paths

---

## Next Steps After Plan Approval

1. **Set up git worktree** (if using superpowers workflow)
2. **Start with Phase 1, Task 1.1** (Drizzle schemas)
3. **Execute tasks sequentially** within each phase
4. **Run tests after each task** before moving to next
5. **Commit frequently** with descriptive messages
6. **Review after each phase** before proceeding

---

**Estimated Total Effort:** 12-16 days for V1 + V2 (full-stack developer)

**V1 MVP Effort:** 9-12 days (excludes Phase 8)
