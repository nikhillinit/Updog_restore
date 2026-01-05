# Advanced Cohort Analysis — Design Document

**Date:** 2026-01-04 **Status:** Draft (architecture + data model + engine
refactor locked; API/UI/testing/rollout outlined for implementation)

## 0. Summary

This document specifies the architecture, data model, normalization layer, and
CohortEngine refactor required to visualize portfolio performance by **vintage**
and **sector** using **manually entered portfolio data**. It supports two cohort
views:

- **Company-level cohorts** (primary / V1): "companies first backed in 2021"
- **Investment-level cohorts** (secondary / V1 exposure; V2 performance):
  "checks deployed in 2021"

Core principle: **a thin normalization + filtering layer that references
existing portfolio data without duplicating it**.

---

## 1. Architecture Overview

### 1.1 Goal

Visualize portfolio performance by vintage/sector using manually entered
portfolio data, with support for both **company-level** and **investment-level**
cohort views.

### 1.2 Core Principle

A **thin normalization + filtering layer** references existing portfolio data
(source of truth) without copying it.

### 1.3 Tenancy Scoping (Decision)

All normalization tables are **scoped to `fundId`** to prevent cross-fund
contamination of sector mappings, overrides, and cohort definitions.

### 1.4 Data Flow

```
Portfolio Data (source of truth)
  ↓
Cohort Normalization Layer (scoped mappings + overrides)
  ↓
CohortEngine (unit-agnostic pipeline)
  ↓
API (Zod validation + coverage checks)
  ↓
React UI (multi-view charts)
```

### 1.5 Key Architectural Decisions

**Source of truth stays untouched**

- `portfolioCompanies.sector` remains raw (free-text)
- `investments.investmentDate` remains raw

**Normalization layer**

- New tables: taxonomy, mappings, overrides, cohort definitions
- Normalization affects analysis outputs only (not the underlying portfolio
  tables)

**Unit-agnostic engine**

- A single CohortEngine pipeline supports `unit: "company" | "investment"`

**Phased rollout**

- **V1:** company-level full metrics + investment-level exposure only
- **V2:** investment-level performance metrics (check-level) behind dual gating

### 1.6 Exclusion Semantics (Decision — Option B)

Company-level view uses **included investments only** (respects investment
exclusions).

- Company vintage = earliest included check's resolved vintage (after
  exclusions + overrides)
- UI shows provenance, e.g.:
  - "Company vintage shifted from 2021 → 2022 (first check excluded)"

### 1.7 Metric Contract (Decision)

- **Cohort IRR** = XIRR of **aggregated dated cash flows** (not the average of
  investment IRRs)
- **TVPI requires residual marks**:
  - investment-level performance degrades to **DPI-only** if marks are
    unavailable
- Attribution basis for check-level performance = **`lots` table** (share-level
  tracking; supports dilution and partial realizations)

### 1.8 Cohort Definition (First-Class Concept)

Cohort analysis is reproducible via persisted cohort definitions:

```typescript
cohort_definitions {
  id, fundId, name,
  vintageGranularity: "year" | "quarter",
  sectorTaxonomyVersion: string,
  unit: "company" | "investment",
  createdAt, createdByUserId
}
```

### 1.9 Scope

**V1 (MVP)**

- Company-level cohorts:
  - Full metrics (IRR/TVPI/DPI) with sector segmentation
- Investment-level cohorts:
  - Exposure metrics only (deployment, sector mix, stage mix)
- Charts:
  - Line (default) + Bar + Heatmap (custom Recharts implementation; higher
    effort)
- Sector mapping UI:
  - "unmapped bucket" workflow
- Feature flag infrastructure for V2

**V2 (Dual-Gated)**

- Gate 1: Feature flag enables code path
- Gate 2: Data completeness gate (≥ 90% coverage threshold) controls UI display
  of performance metrics
  - Coverage indicator always visible
- Investment-level performance:
  - IRR/TVPI/DPI (DPI-only fallback if no marks)

---

## 2. Data Model & Normalization Layer

### 2.1 Schema Design

All tables are scoped by `fundId`. `taxonomyVersion` is used to ensure cohort
reproducibility.

#### 2.1.1 `sector_taxonomy` (canonical sectors; scoped + versioned)

Purpose: canonical sector list used for segmentation; supports versioning (e.g.
`v1`, `v2`).

Minimum columns:

- `id` (PK)
- `fundId` (indexed)
- `taxonomyVersion` (indexed)
- `name` (display)
- `slug` (stable key)
- optional hierarchy: `parentSectorId`
- auditing: `createdAt`, `createdByUserId`, `updatedAt`, `updatedByUserId`
- optional: `isSystem`, `sortOrder`

Constraints / indexes:

- `UNIQUE(fundId, taxonomyVersion, slug)`
- Index `(fundId, taxonomyVersion)`

System requirement:

- Every taxonomy version must include a canonical "Unmapped" sector
  (`slug = "unmapped"`).

#### 2.1.2 `sector_mappings` (raw → canonical; confidence-scored)

Purpose: map messy raw sector strings to canonical sectors, without editing
`portfolioCompanies`.

Minimum columns:

- `id` (PK)
- `fundId` (indexed)
- `taxonomyVersion` (indexed)
- `rawValue` (original)
- `rawValueNormalized` (normalized for matching)
- `canonicalSectorId` (FK → sector_taxonomy.id)
- `confidenceScore` (0–1; default 1.0)
- `source` (e.g., manual / suggested / seeded)
- auditing

Constraints / indexes:

- `UNIQUE(fundId, taxonomyVersion, rawValueNormalized)`
- Index `(fundId, taxonomyVersion, canonicalSectorId)`

Normalization function (single backend implementation):

- trim
- collapse whitespace
- lowercase
- treat empty/null as a deterministic token (e.g., `(blank)`)

#### 2.1.3 `company_overrides` (per-company sector override + exclusion)

Purpose: override canonical sector at the company level and/or exclude company
from cohort analysis.

Minimum columns:

- `id` (PK)
- `fundId` (indexed)
- `taxonomyVersion` (indexed)
- `companyId` (FK → portfolioCompanies.id)
- `canonicalSectorId` (nullable FK → sector_taxonomy.id)
- `excludeFromCohorts` (bool)
- auditing

Constraint:

- `UNIQUE(fundId, taxonomyVersion, companyId)`

#### 2.1.4 `investment_overrides` (vintage override + exclusion)

Purpose: override vintage for a check and/or exclude it from cohort analysis.

Minimum columns:

- `id` (PK)
- `fundId` (indexed)
- `investmentId` (FK → investments.id)
- `excludeFromCohorts` (bool)
- `vintageYear` (int, nullable)
- `vintageQuarter` (int, nullable; 1–4)
- auditing

Constraint:

- `UNIQUE(fundId, investmentId)`

#### 2.1.5 `cohort_definitions` (reproducible config)

Purpose: allow multiple saved cohort views per fund (e.g., Company/Year,
Investment/Year, Company/Quarter).

Minimum columns (plus optional quality-of-life fields):

- `id` (PK)
- `fundId` (indexed)
- `name`
- `vintageGranularity` (`"year" | "quarter"`)
- `sectorTaxonomyVersion`
- `unit` (`"company" | "investment"`)
- optional: `isDefault` (single default per fund)
- optional: `archivedAt`
- auditing

---

### 2.2 Resolution Precedence Rules

All resolution runs within a given
`(fundId, taxonomyVersion, vintageGranularity)` from a `cohort_definition`.

#### 2.2.1 Sector resolution (4-tier precedence)

Resolve per company:

1. If `company_overrides.excludeFromCohorts = true` → exclude company (hard
   exclude)
2. Else if `company_overrides.canonicalSectorId != null` → use it
3. Else if `sector_mappings` contains `rawValueNormalized` → mapped canonical
   sector
4. Else → canonical sector = `Unmapped`

Return provenance:

- `sectorSource: "company_override" | "mapping" | "unmapped"`
- plus `rawSectorValue`, `rawSectorValueNormalized`

#### 2.2.2 Vintage resolution (3-tier precedence)

Resolve per investment:

1. If `investment_overrides.excludeFromCohorts = true` → exclude investment
2. Else if `investment_overrides.vintageYear != null`:
   - year granularity → `YYYY`
   - quarter granularity → `YYYY-Q#` (if quarter missing, fallback to derived
     quarter if `investmentDate` present; mark provenance)
3. Else derive from `investments.investmentDate`:
   - year → `YYYY`
   - quarter → `YYYY-Q#`

If `investmentDate` is missing and no override exists:

- exclude from vintage-based cohorting and surface as a coverage issue.

#### 2.2.3 Exclusion propagation & company vintage (Option B)

- Apply exclusions in this order:
  1. company exclusion (hard)
  2. investment exclusion (soft)
- Company-level cohort analysis includes only **included investments**
- Company is excluded if it has **zero included investments**
- Company vintage = **earliest included investment** by resolved vintage key

Provenance:

- If earliest any investment differs from earliest included investment, mark
  "shifted due to exclusion" and surface examples.

---

### 2.3 Drizzle ORM Schemas (TypeScript)

Drizzle definitions should implement:

- enums for cohort units and vintage granularity
- unique indexes for scoping guarantees
- foreign keys to existing `funds`, `portfolioCompanies`, `investments`
- raw SQL migration for partial unique index (one default cohort definition per
  fund)

(Implementation note: exact FK references depend on existing table names/IDs;
keep the semantic constraints above.)

---

### 2.4 Migration Strategy

#### 2.4.1 Seed taxonomy and mappings (idempotent)

For each `fundId`:

1. Create taxonomy version `"v1"`
2. Insert system sector: `Unmapped` (slug `"unmapped"`)
3. Auto-discover distinct raw sector strings from `portfolioCompanies.sector`
4. Seed canonical sectors as identity sectors (low friction)
5. Seed `sector_mappings` identity entries:
   - `rawValueNormalized → canonicalSectorId`, `confidenceScore=1.0`,
     `source="seed_identity"`

Outcome: users start with minimal unmapped values; can later consolidate
mappings into fewer canonical categories.

#### 2.4.2 Create default cohort definitions

Insert at least:

- `Default (Company / Year)` → unit=company, granularity=year,
  taxonomyVersion=v1, isDefault=true
- `Deployment (Investment / Year)` → unit=investment, granularity=year,
  taxonomyVersion=v1

#### 2.4.3 Backward compatibility

CohortEngine should accept optional `cohortDefinitionId`.

- If absent: use fund's default cohort definition
- If normalization tables are missing (early test env): fallback to legacy
  behavior (raw sector + derived vintage), but preserve response shape with
  provenance `"legacy"`.

---

### 2.5 Query Patterns & Performance

#### 2.5.1 Goals

- Build a single **resolved investments dataset** per request:
  - joins companies + investments
  - applies mappings + overrides
  - computes resolved vintage keys
  - flags exclusions
  - emits provenance fields needed by UI
- Avoid N+1 queries; no per-company loops
- Produce a normalized **cash-flow events stream** for IRR/TVPI/DPI computation
  (lots-based)

#### 2.5.2 Resolved Investments dataset (unit-agnostic base)

Inputs:

- `fundId`
- `cohortDefinition` (unit, taxonomyVersion, vintageGranularity)

Outputs per investment:

- investmentId, companyId
- rawSector, rawSectorNormalized
- canonicalSectorId + sectorSource
- companyExcluded, investmentExcluded
- resolvedVintageKey + vintageSource
- investmentDate
- optional: stage, checkSize

Implementation note:

- Prefer computing `normalizeSector` + `resolvedVintageKey/source` in Node/TS
  for a single source of truth.

#### 2.5.3 Company cohort key (only for unit=company)

Compute:

- `companyCohortKey = min(resolvedVintageKey)` across included investments only
- provenance fields:
  - earliest_any_key vs earliest_included_key

#### 2.5.4 Cash-flow events stream (authoritative = lots)

Use `lots` as the canonical source of cash flows:

- Paid-in event:
  - date = lot acquisition date
  - amount = `-costBasis`
- Distribution event:
  - date = lot disposal date
  - amount = `+disposalProceeds`
- Residual mark event (optional):
  - requires marks (pricing) and an "as of" date
  - used for TVPI and unrealized-inclusive IRR

Join events back to resolved investments via `investmentId` to assign:

- canonical sector (company-level)
- cohortKey (companyCohortKey or investment resolved vintage)

Perf note:

- Pre-aggregate cash flows by date per `(cohortKey, sectorId)` before XIRR to
  reduce input size without changing correctness.

#### 2.5.5 Exposure metrics (fast-path for V1 investment view)

Investment-level exposure metrics can be computed from the resolved investments
dataset directly:

- total checks, sum check sizes, sector mix, stage mix, pacing

No lots query required for V1 investment view.

#### 2.5.6 Unmapped bucket query

Support the mapping UI by returning:

- raw sector values that currently resolve to "Unmapped"
- counts (#companies, optionally #investments / total invested)

#### 2.5.7 Coverage / completeness queries

Compute and return coverage metrics:

- Paid-in completeness (lots with acquisitionDate + costBasis)
- Distribution completeness (lots with disposalDate + disposalProceeds)
- Vintage completeness (investments with investmentDate OR override)
- Marks coverage (if marks are implemented)

Used for:

- V2 gating (≥90% overall)
- UI indicators (always visible)

#### 2.5.8 Index recommendations (minimum viable)

- `portfolio_companies(fund_id)`
- `investments(fund_id, company_id, investment_date)`
- `lots(fund_id, investment_id)`
- `lots(fund_id, company_id)`
- `sector_mappings(fund_id, taxonomy_version, raw_value_normalized)` UNIQUE
- `company_overrides(fund_id, taxonomy_version, company_id)` UNIQUE
- `investment_overrides(fund_id, investment_id)` UNIQUE
- `cohort_definitions(fund_id) WHERE is_default = true` UNIQUE (partial index)

---

## 3. CohortEngine Refactor

### 3.1 Input / Output Contracts

#### 3.1.1 Analyze request

```typescript
export type CohortAnalyzeRequest = {
  fundId: string;
  cohortDefinitionId?: string; // defaults to fund's isDefault=true
  dateRange?: { start?: string; end?: string }; // ISO, optional
  sectorIds?: string[]; // canonical sectors, optional
  stages?: string[]; // optional if stage is tracked
};
```

#### 3.1.2 Analyze response (contract)

```typescript
export type CohortAnalyzeResponse = {
  cohortDefinition: {
    id: string;
    fundId: string;
    name: string;
    vintageGranularity: 'year' | 'quarter';
    sectorTaxonomyVersion: string;
    unit: 'company' | 'investment';
  };

  rows: CohortRow[];

  unmapped?: Array<{
    rawValue: string;
    rawValueNormalized: string;
    companyCount: number;
    investmentCount?: number;
    totalInvested?: number;
  }>;

  coverage: CoverageSummary;

  provenance?: {
    shiftedCompanyCount: number;
    examples?: Array<{
      companyId: string;
      from: string;
      to: string;
      reason: 'first_check_excluded' | 'override';
    }>;
  };
};

export type CohortRow = {
  cohortKey: string; // "2024" or "2024-Q3"
  sectorId: string;
  sectorName: string;

  counts: {
    companies: number;
    investments: number;
  };

  exposure: {
    paidIn: number;
    distributions: number;
    residualValue?: number;
  };

  performance?: {
    dpi?: number;
    tvpi?: number;
    irr?: number;
  };

  coverage: CoverageSummary;

  provenance: {
    sectorSourceBreakdown: Record<
      'company_override' | 'mapping' | 'unmapped',
      number
    >;
    vintageSourceBreakdown: Record<string, number>;
    shiftedCompanies?: number;
  };
};

export type CoverageSummary = {
  paidInPct: number; // 0..1
  distributionsPct: number; // 0..1
  vintagePct: number; // 0..1
  marksPct?: number; // 0..1
  overallPct: number; // min(relevant)
};
```

### 3.2 Pipeline Architecture (Unit-Agnostic Flow)

Single pipeline with unit switching at bucketing:

1. Load cohort definition (or default)
2. Resolve dataset:
   - resolved investments (sector + vintage + exclusions + provenance)
   - company cohort keys (only if unit=company)
   - cash-flow events stream (lots-based, for company metrics; and later for
     investment metrics V2)
   - coverage stats
3. Bucket events into `(cohortKey, sectorId)` groups based on `unit`
4. Aggregate counts + exposure
5. Compute metrics (DPI/TVPI/IRR) under gating rules
6. Return response including unmapped + provenance summaries

### 3.3 Company-Level Aggregation Logic (V1 full metrics)

- Company cohort membership:
  - `companyCohortKey = earliest included investment's resolved vintage key`
- All cash-flow events for that company inherit:
  - cohortKey = `companyCohortKey`
  - sectorId = company canonical sector
- Counts:
  - companies = unique companies with ≥ 1 included investment
  - investments = count of included investments (context)

### 3.4 Investment-Level Aggregation Logic

**V1 (exposure-only)**

- Cohort membership per check:
  - cohortKey = investment resolved vintage key
- Use resolved investments dataset to compute:
  - #checks, deployed capital, sector mix, stage mix, pacing
- No lots-based performance in V1 investment view.

**V2 (performance, gated)**

- Use lots-based events:
  - assign cohortKey based on the investment owning the lot
  - sectorId from company canonical sector
- Compute DPI/TVPI/IRR using aggregated events per cohort bucket

### 3.5 Metric Calculations (Contract)

Per bucket `(cohortKey, sectorId)`:

- Paid-in:
  - `paidIn = sum(abs(negative cash flows))`
- Distributions:
  - `distributions = sum(positive cash flows)`
- DPI:
  - `dpi = distributions / paidIn` (if `paidIn > 0`)
- Residual value:
  - from marks (if available) and remaining shares exposure
- TVPI:
  - `tvpi = (distributions + residualValue) / paidIn` (only if residualValue
    available)
- IRR:
  - `irr = XIRR(aggregatedCashFlowsByDate)`
  - requires at least one negative and one positive cash flow; otherwise
    `irr = null`

Numerical stability:

- Aggregate flows by date before XIRR (sums on same date)
- Return null rather than noisy values when insufficient data exists

### 3.6 Lot-Based Attribution & V2 Dual Gating

**Enablement**

- Feature flag ON
- Coverage gate:
  - `overallCoveragePct ≥ 0.90` (and optionally separate mark coverage threshold
    for TVPI)

**Attribution basis**

- `lots` table is authoritative:
  - acquisitionDate + costBasis (paid-in)
  - disposalDate + disposalProceeds (realized distributions)
  - remainingShares (unrealized exposure; requires marks)

**Fallback behavior**

- If marks are unavailable:
  - show DPI (realized) and realized-only IRR (if meaningful)
  - hide TVPI and residual-based metrics (or return null)

**Critical invariant**

- No double counting:
  - each lot contributes its flows exactly once
  - events belong to exactly one investment; investment belongs to exactly one
    cohortKey per analysis unit

---

## 4. Remaining Sections (Implementation-Facing Outline)

The following sections are intentionally outlined (not fully specified) because
Sections 1–3 lock the core architecture and data contract boundaries.

### 4. API Layer (Outline)

- Endpoints:
  - `GET /api/cohorts/analyze`
  - `POST /api/cohorts/sector-mappings` (bulk upsert)
  - likely helpers:
    - `GET /api/cohorts/unmapped`
    - `GET /api/cohorts/definitions`
    - `POST /api/cohorts/definitions`
- Zod schemas for:
  - request validation
  - response validation
  - coverage summaries
- Coverage checks:
  - compute and return coverage for every analyze call
- Response format:
  - `rows[]` plus `unmapped[]` and provenance summaries

### 5. UI Components (Outline)

- Multi-view chart component:
  - Line (default), Bar, Heatmap (custom)
- Sector mapping management UI:
  - search/filter raw sectors
  - bulk map raw → canonical
  - show confidence / source
- Unmapped bucket workflow:
  - prominent banner if unmapped > 0
- Cohort definition selector:
  - switch between Company vs Investment; Year vs Quarter
- Data quality indicators:
  - coverage bar + warnings when under thresholds

### 6. Testing & Validation (Outline)

- Truth cases:
  - single company single lot
  - multiple lots same company (follow-ons)
  - partial sale + remaining shares
  - excluded first check shifts company vintage
  - unmapped sector fallback
- Invariants:
  - no double counting of lot proceeds
  - cohort IRR equals XIRR of aggregated flows (golden reference)
  - unit switching changes bucketing but not total fund-level cash flow sums
    (given same inclusions)
- Coverage threshold tests for V2 gating
- Integration tests:
  - API endpoints return expected rows and provenance

### 7. Rollout Plan (Outline)

- Feature flags:
  - `cohorts.v2.checkLevelPerformance` (name TBD)
- V1 deployment:
  - Company cohorts full metrics
  - Investment cohorts exposure only
  - sector mapping UI
- V2 validation checklist:
  - truth cases passing
  - data coverage ≥ 90%
  - UI coverage indicator present and correct
- Documentation updates:
  - user-facing "how cohorts work"
  - admin "how sector mapping works"
  - engineering "data provenance + gating"

---

## 8. Implementation Readiness Checklist (Quick)

Before implementation begins, confirm:

- Table names/IDs for `funds`, `portfolioCompanies`, `investments`, `lots` (FK
  wiring)
- Existence (or plan) for residual marks source (needed for TVPI; otherwise
  DPI-only)
- Location of XIRR implementation and expected tolerance for tests
- Whether quarter granularity uses calendar quarters (default) vs fiscal
  quarters

---

## Appendix: Key Design Decisions Log

| Decision                          | Rationale                                                                                                                    |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Option B exclusion semantics      | More powerful: allows investment-level exclusions while still computing company-level metrics from included investments only |
| Aggregated cash-flow IRR          | Mathematically correct; prevents averaging IRRs which compounds errors                                                       |
| Lots table as attribution basis   | Already exists with share-level tracking; supports dilution and partial sales accurately                                     |
| Dual gating for V2                | Feature flag enables code; coverage gate ensures data quality before showing performance metrics                             |
| Hybrid sector normalization       | Auto-seed identity mappings (low friction) + allow consolidation later (flexibility)                                         |
| Cohort definitions as first-class | Enables reproducibility, auditability, and multiple saved views per fund                                                     |
| DPI-only fallback                 | Graceful degradation when marks unavailable; maintains user trust vs showing incorrect TVPI                                  |
