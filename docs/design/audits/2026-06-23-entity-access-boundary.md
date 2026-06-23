---
status: ACTIVE
audience: both
last_updated: 2026-06-23
owner: 'Platform Team'
review_cadence: P90D
categories: [design, audits, security, access-control]
keywords:
  [
    entity-access,
    fund-scope,
    investments,
    rounds,
    portfolio-companies,
    idor,
    bola,
  ]
---

# Entity access boundary: investments, rounds, and portfolio companies

**Purpose:** extend the PR-H1 investment access-boundary audit
(`docs/design/audits/2026-06-22-entity-access-boundary.md`) to cover the full
set of related entities — investments, investment rounds, and portfolio
companies — and record the state after the portfolio-companies scope fix.

**Method:** code trace of `server/routes/investments.ts`,
`server/routes/portfolio-companies.ts`, and
`server/services/investments/investment-round-service.ts`. All enforcement uses
the shared helper `enforceProvidedFundScope`
(`server/lib/auth/provided-fund-scope`).

---

## Scope audited

- `GET /api/investments` and `GET /api/investments/:id`
- `GET /api/investments/:id/rounds` and
  `GET /api/investments/:id/rounds/:roundId`
- `POST /api/investments/:id/rounds`
- `GET /api/portfolio-companies` and `GET /api/portfolio-companies/:id`
- Underlying storage functions in `server/storage.ts` and
  `server/services/investments/investment-round-service.ts`.

---

## Investments

| Path                       | Enforcement                                                                                                                                                        | Status         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| `GET /api/investments`     | Requires `?fundId=`; missing/empty returns `400 fund_scope_required`. Positive `fundId` validated then passed to `enforceProvidedFundScope`.                       | Fixed in PR-H1 |
| `GET /api/investments/:id` | Loads via `storage.getInvestment(id)`. Rejects `NULL fundId` (`400 invalid_investment_fund_scope`). Calls `enforceProvidedFundScope(req, res, investment.fundId)`. | Fixed in PR-H1 |
| `POST /api/investments`    | Validates body via `insertInvestmentSchema`; if `fundId` is numeric, calls `enforceProvidedFundScope` before create.                                               | OK             |

**Key invariant:** an investment row must have a non-null `fundId` to be
readable. A `NULL`-fund investment cannot be fund-scoped and is rejected with a
400 before any authorization check.

---

## Investment rounds

Rounds are accessed exclusively through the parent investment route prefix
`/api/investments/:id/...`. All round handlers delegate to
`resolveInvestmentRoundRouteScope` (`server/routes/investments.ts:227-266`).

`resolveInvestmentRoundRouteScope` performs:

1. Parse `:id` as positive integer; otherwise `400 Invalid investment ID`.
2. Load investment via `storage.getInvestment(investmentId)`; missing -> `404`.
3. Reject `NULL fundId` -> `400 invalid_investment_fund_scope`.
4. Call `enforceProvidedFundScope(req, res, investment.fundId)`; cross-fund ->
   `403 FUND_ACCESS_DENIED` (helper halts response).
5. Return `{ investmentId, fundId: investment.fundId }` to the handler.

| Path                                       | Enforcement                                                                       | Status |
| ------------------------------------------ | --------------------------------------------------------------------------------- | ------ |
| `POST /api/investments/:id/rounds`         | `resolveInvestmentRoundRouteScope`; also verifies `body.fundId === scope.fundId`  | OK     |
| `GET /api/investments/:id/rounds`          | `resolveInvestmentRoundRouteScope`; lists rounds for the resolved investment      | OK     |
| `GET /api/investments/:id/rounds/:roundId` | `resolveInvestmentRoundRouteScope`; then `loadRound(scope.investmentId, roundId)` | OK     |

**Cross-fund round access:** because the round is loaded only after the parent
investment's `fundId` has been authorized, requesting a round belonging to
fund-B while scoped to fund-A is blocked at the investment scope step. The
service-level `loadRound(scope.investmentId, roundId)` adds a second guard by
requiring the round to belong to the already-authorized investment.

**Cross-fund supersede:** the round creation service (`createRound` in
`server/services/investments/investment-round-service.ts`) validates that a
`supersedesRoundId` belongs to the same `investmentId` and `fundId`. A supersede
request scoped to fund-A with a target round in fund-B is therefore rejected
before any write occurs.

---

## Portfolio companies

### Pre-fix state (current `main`)

| Path                               | Enforcement                                                                                                                                                                                            | Status  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| `GET /api/portfolio-companies`     | `fundId` query optional. When provided, `enforceProvidedFundScope` runs. When absent, `portfolioTimeMachineReadService.listCompanies(undefined, ...)` is called, returning companies across all funds. | **GAP** |
| `GET /api/portfolio-companies/:id` | `fundId` query optional. Company loaded by ID. Ownership check `company.fundId !== fundId` runs only when `fundId` is provided; without it, any company is readable.                                   | **GAP** |
| `POST /api/portfolio-companies`    | Body validated via `insertPortfolioCompanySchema`; numeric `fundId` enforced with `enforceProvidedFundScope`.                                                                                          | OK      |

### Fix to be applied (this PR, T1)

- `GET /api/portfolio-companies`: require `?fundId=`; missing ->
  `400 fund_scope_required`. Then `enforceProvidedFundScope(req, res, fundId)`.
  The `asOf` time-machine branch already requires `fundId`, so this aligns the
  two list paths.
- `GET /api/portfolio-companies/:id`: require `?fundId=`; missing ->
  `400 fund_scope_required`. Then `enforceProvidedFundScope(req, res, fundId)`
  and verify `company.fundId === fundId`; mismatch -> `404 Company not found`.

### Post-fix invariant

Portfolio-company reads will follow the same model as investments: a positive
`fundId` is mandatory, and the caller must have access to that fund. Cross-fund
IDOR via missing `fundId` or mismatched `fundId` will be closed.

---

## Trust boundary summary

| Entity              | Direct-read list requires fundId? | Direct-read detail requires fundId? | Scope enforcement helper                                         | Cross-fund result                                |
| ------------------- | --------------------------------- | ----------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------ |
| Investments         | Yes (PR-H1)                       | Yes (PR-H1, derived from row)       | `enforceProvidedFundScope`                                       | 403                                              |
| Investment rounds   | N/A (parent-scoped)               | N/A (parent-scoped)                 | `resolveInvestmentRoundRouteScope` -> `enforceProvidedFundScope` | 403                                              |
| Portfolio companies | Yes (this PR)                     | Yes (this PR)                       | `enforceProvidedFundScope`                                       | 403 on scope mismatch, 404 on ownership mismatch |

---

## Residual risks and handoff notes

1. **RLS reconciliation remains open.** As noted in the PR-H1 audit, the
   production surface does not rely on Postgres RLS for these tables. The app
   layer is the authoritative enforcement point.
2. **403-vs-404 existence oracle:** returning `404` for an existing-but-out-of
   scope portfolio company matches the existing `portfolio-companies/:id`
   behavior and the round-route convention, but it does leak existence. PR-H2
   (route-policy registry) may standardize this.
3. **Client-derived math:**
   `client/src/components/portfolio/tabs/OverviewTab.tsx` still derives MOIC and
   return metrics on the client. See
   `docs/design/audits/client-derived-math-inventory.md`.
4. **Portfolio Intelligence prototype routes:** a separate set of
   `/api/portfolio/*` routes returns 501 for financial outputs. See
   `docs/design/audits/2026-06-23-trust-audit.md`.

---

## Cross-references

- `docs/design/audits/2026-06-22-entity-access-boundary.md` — prior PR-H1 audit.
- `docs/design/audits/2026-06-23-trust-audit.md` — route scope, 501 routes, and
  MOIC caller inventory.
- `docs/design/audits/client-derived-math-inventory.md` — client-side
  calculations in OverviewTab.
