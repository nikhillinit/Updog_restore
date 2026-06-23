---
status: ACTIVE
audience: both
last_updated: 2026-06-23
owner: 'Platform Team'
review_cadence: P30D
categories: [design, audits, security, api, trust-boundary]
keywords:
  [
    fund-scope,
    trust-audit,
    portfolio-companies,
    investments,
    prototype-501,
    moic,
  ]
---

# Trust audit: fund-scoped routes, prototype 501s, and MOIC callers

**Purpose:** consolidated audit artifact for the H0/H1 trust-boundary work.
Documents which API routes are fund-scoped (and how), which routes were fixed in
recent PRs, which portfolio-intelligence routes return 501 under PR #910, and
the caller inventory for MOIC-analysis endpoints.

**Method:** code trace of `server/routes/investments.ts`,
`server/routes/portfolio-companies.ts`,
`server/routes/portfolio-intelligence.ts`, `server/routes/moic.ts`,
`server/routes/fund-moic.ts`, `client/src/hooks/use-moic.ts`,
`client/src/pages/moic-analysis.tsx`,
`client/src/components/portfolio/moic-analysis.tsx`,
`client/src/app/route-governance-registry.ts`, and
`tests/fixtures/portfolio-intelligence-route-classification.ts`.

---

## 1. Fund-scoped routes

### Investments (`server/routes/investments.ts`)

| Method | Path                                   | Scope enforcement                                                                                                                    | Notes          |
| ------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| GET    | `/api/investments`                     | Requires `?fundId=`; returns `400 fund_scope_required` if missing; then `enforceProvidedFundScope`                                   | Fixed in PR-H1 |
| GET    | `/api/investments/:id`                 | Loads row, rejects `NULL fundId` (`400 invalid_investment_fund_scope`), then `enforceProvidedFundScope(req, res, investment.fundId)` | Fixed in PR-H1 |
| POST   | `/api/investments`                     | `enforceProvidedFundScope(req, res, body.fundId)` when numeric                                                                       | Pre-existing   |
| POST   | `/api/investments/:id/rounds`          | `resolveInvestmentRoundRouteScope` loads investment and enforces scope on its `fundId`                                               | Pre-existing   |
| GET    | `/api/investments/:id/rounds`          | Same `resolveInvestmentRoundRouteScope`                                                                                              | Pre-existing   |
| GET    | `/api/investments/:id/rounds/:roundId` | Same `resolveInvestmentRoundRouteScope`; round is then loaded within investment scope                                                | Pre-existing   |
| POST   | `/api/investments/:id/cases`           | Returns 501 via `handleUnsupportedScenarioWrite`; no data read                                                                       | N/A            |

### Portfolio companies (`server/routes/portfolio-companies.ts`)

| Method | Path                           | Scope enforcement                                                                                                                                                     | Notes                                |
| ------ | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| GET    | `/api/portfolio-companies`     | `fundId` is optional; when provided it calls `enforceProvidedFundScope`, but absence falls through to `portfolioTimeMachineReadService.listCompanies(undefined, ...)` | **GAP** — target of this PR's T1 fix |
| GET    | `/api/portfolio-companies/:id` | `fundId` is optional; detail fetched by ID only; ownership check `company.fundId !== fundId` runs only when `fundId` is provided                                      | **GAP** — target of this PR's T1 fix |
| POST   | `/api/portfolio-companies`     | `enforceProvidedFundScope(req, res, body.fundId)` when numeric                                                                                                        | Pre-existing                         |

---

## 2. Routes fixed in recent PRs

### PR-H1 (#908) — `server/routes/investments.ts`

- **GET /api/investments**: closed the unscoped list path. Previously
  `storage.getInvestments(undefined)` returned every investment row across all
  funds/orgs. Now requires `?fundId=` and returns `400 fund_scope_required`.
- **GET /api/investments/:id**: added fund-scope check after load. Previously
  `storage.getInvestment(id)` returned the row with no fund-scope check,
  allowing cross-fund IDOR.

### This PR (H0) — `server/routes/portfolio-companies.ts`

- **GET /api/portfolio-companies**: to be fixed to require `?fundId=` and return
  `400 fund_scope_required` when missing (mirrors investments PR-H1).
- **GET /api/portfolio-companies/:id**: to be fixed to require `?fundId=`,
  enforce `enforceProvidedFundScope`, and verify `company.fundId === fundId`
  (returns 404 on mismatch).

---

## 3. Prototype routes returning 501 (PR #910)

These routes are classified as `prototype_501` in
`tests/fixtures/portfolio-intelligence-route-classification.ts` and return a 501
response built by `buildPrototypeFinancialBlockedError` in
`server/lib/portfolio-prototype-block.ts`.

| Method | Path                                    | Route ID                         | Replacement route (if declared) |
| ------ | --------------------------------------- | -------------------------------- | ------------------------------- |
| POST   | `/api/portfolio/scenarios/compare`      | `portfolio.scenarios.compare`    | —                               |
| POST   | `/api/portfolio/scenarios/:id/simulate` | `portfolio.scenario.simulate`    | `/api/monte-carlo/simulate`     |
| POST   | `/api/portfolio/reserves/optimize`      | `portfolio.reserves.optimize`    | —                               |
| POST   | `/api/portfolio/reserves/backtest`      | `portfolio.reserves.backtest`    | —                               |
| POST   | `/api/portfolio/forecasts`              | `portfolio.forecasts.create`     | `/api/events/fund/:fundId`      |
| POST   | `/api/portfolio/forecasts/validate`     | `portfolio.forecasts.validate`   | —                               |
| POST   | `/api/portfolio/quick-scenario`         | `portfolio.quickScenario.create` | —                               |
| GET    | `/api/portfolio/metrics/:scenarioId`    | `portfolio.metrics.read`         | `/api/events/fund/:fundId`      |

**Provenance contract:** every 501 response includes a `provenance` object
produced by `makePrototypeBlockedProvenance` with:

- `sourceKind: 'prototype_blocked'`
- `actionability: 'non_actionable'`
- `isFinanciallyActionable: false`
- `quarantineReason: 'prototype_financial_output_blocked'`
- `warnings: ['Prototype financial output route is disabled.']`

This satisfies `FinancialProvenanceSchema.parse()`.

**Static-template exception:** `GET /api/portfolio/templates` is classified as
`static_template`. It returns hard-coded strategy templates annotated with
provenance from `makeStaticTemplateProvenance`, which uses
`sourceKind: 'static_template'`, `actionability: 'non_actionable'`,
`isFinanciallyActionable: false`, and **no** `quarantineReason` (the v3.4
contract correction).

---

## 4. MOIC-analysis caller inventory

### Client callers

| Caller                     | File                                                | Endpoint used                          | Purpose                                                                      |
| -------------------------- | --------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------- |
| `useMOICCalculation`       | `client/src/hooks/use-moic.ts:49-66`                | `POST /api/moic/calculate`             | Mutation for portfolio MOIC summary from an `Investment[]` payload           |
| `useMOICRanking`           | `client/src/hooks/use-moic.ts:71-88`                | `POST /api/moic/rank`                  | Mutation to rank investments by reserves MOIC from an `Investment[]` payload |
| `useFundMoicRankings`      | `client/src/hooks/use-moic.ts:90-126`               | `GET /api/funds/:fundId/moic/rankings` | Live fund-scoped reserves-MOIC rankings                                      |
| `MOICAnalysisPage`         | `client/src/pages/moic-analysis.tsx:89-92`          | `useFundMoicRankings`                  | Renders live planned-reserves rankings with provenance                       |
| `MOICAnalysis` (component) | `client/src/components/portfolio/moic-analysis.tsx` | None                                   | Uses static `sampleMOICData`; no API calls                                   |

### Server endpoints

| Endpoint                               | File                               | Implementation                                                    | Scope/provenance                                         |
| -------------------------------------- | ---------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------- |
| `POST /api/moic/calculate`             | `server/routes/moic.ts:85-93`      | `MOICCalculator.generatePortfolioSummary(investments)`            | Request-scoped by caller-supplied payload; no fund scope |
| `POST /api/moic/rank`                  | `server/routes/moic.ts:99-107`     | `MOICCalculator.rankByReservesMOIC(investments)`                  | Request-scoped by caller-supplied payload; no fund scope |
| `GET /api/funds/:fundId/moic/rankings` | `server/routes/fund-moic.ts:29-40` | `requireAuth`, `requireFundAccess`, `getFundMoicRankings(fundId)` | Fund-scoped via JWT + explicit fund-access middleware    |

### Data flow for live fund rankings

`GET /api/funds/:fundId/moic/rankings` -> `server/routes/fund-moic.ts` ->
`server/services/fund-moic-ranking-service.ts:getFundMoicRankings` -> queries
`portfolioCompanies` where `fundId = $fundId` -> adapts rows via
`dbToMOICInvestment` (imported from `server/routes/moic.js`) ->
`MOICCalculator.rankByReservesMOIC` -> returns `FundMoicRankingsResponseV1` with
provenance: - `source: 'portfolio_companies'` -
`calculation: 'reserves_moic_rankings'` - `metricBasis: 'planned_reserves'`

### Client route governance

`client/src/app/route-governance-registry.ts` governs the mounted client
entrypoints. Relevant entries:

- `/portfolio` — `core-live`, protected (`APP_ROUTES`)
- `/portfolio/company/:id` — `core-live`, protected (`APP_ROUTES`)
- `/sensitivity-analysis` — `internal-live`, protected (`APP_ROUTES`)
- `/financial-modeling` — `internal-live`, protected (`APP_ROUTES`)
- `/investments` — `archived-placeholder`, redirects to `/portfolio`

There is no separate governed client path for the MOIC-analysis page; it is
reached from within `/portfolio` or other internal surfaces.

---

## Cross-references

- `docs/design/audits/client-derived-math-inventory.md` — client-side MOIC
  derivation violations in `OverviewTab.tsx`.
- `docs/design/audits/2026-06-23-entity-access-boundary.md` — entity access
  boundary for investments, rounds, and portfolio companies.
- `docs/design/audits/2026-06-22-entity-access-boundary.md` — prior PR-H1 audit
  focused on investments.
