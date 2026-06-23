---
status: ACTIVE
audience: both
last_updated: 2026-06-22
owner: 'Platform Team'
review_cadence: P90D
categories: [design, audits, security, access-control]
keywords: [entity-access, fund-scope, investments, rls, idor, bola, pr-h1]
---

# Direct entity access-boundary audit (PR-H1)

**Purpose:** raw audit artifact for the roadmap's PR-H1
(`docs/plans/2026-06-22-current-state-steelman-roadmap.md`). Records which
direct investment read paths enforced fund scope before this PR, the empirical
state of Postgres RLS on `investments` in production, and the exact fix applied.
Intended for PR-H2 (route-policy registry) ingestion.

**Method:** code trace against `main` at `10f38987` plus the prod build/deploy
topology recorded in session memory (Vercel build runs `db:push`, not the raw
SQL policy migrations). No production data was read; the RLS conclusion is a
code-level proof, with a narrow user-runnable confirmation query provided below.

## Scope audited

`server/routes/investments.ts` mounted on `makeApp` (`server/app.ts:215`), the
canonical production (Vercel) surface, behind the global `/api` auth guard
(`server/app.ts:184`, `requireAuth`). `/api/investments` and
`/api/investments/:id` are **not** in `isPublicApiPath`
(`server/lib/public-api-boundary.ts`), so both require a valid bearer token.

## Findings (pre-PR-H1)

| Path                                        | Pre-PR-H1 behavior                                                                                                                  | Verdict |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `GET /api/investments/:id`                  | `storage.getInvestment(id)` returned the row with **no fund-scope check**.                                                          | **GAP** |
| `GET /api/investments` (no `fundId`)        | Skipped `enforceProvidedFundScope`; `storage.getInvestments(undefined)` (`storage.ts:582`) returned **all rows** across funds/orgs. | **GAP** |
| `GET /api/investments?fundId=`              | Parsed `fundId`, called `enforceProvidedFundScope`. Already scoped.                                                                 | OK      |
| `POST /api/investments`                     | Enforces scope on body `fundId` when numeric.                                                                                       | OK      |
| `POST/GET /api/investments/:id/rounds[...]` | `resolveInvestmentRoundRouteScope` (`:236`) loads the investment and enforces scope on its `fundId`.                                | OK      |
| `POST /api/investments/:id/cases`           | Returns 501 (unsupported); no data read.                                                                                            | N/A     |

Net: any authenticated principal — including a lower-trust LP viewer scoped to a
single fund — could read **any** fund's/org's investment detail by id, or dump
the entire `investments` table via the bare list. This is a cross-fund /
cross-org broken-object-level-authorization (BOLA) gap at the application layer.

## Is RLS a mitigating control in production?

**No.** Severity is therefore a live gap, not defense-in-depth.

Proof (code-level):

1. **Production schema is built by `db:push` from the Drizzle schema
   (`shared/schema`).** `shared/**` contains **zero** `org_id` /
   `organization_id` columns, so production `investments` has no org column and
   `db:push` never emits RLS policies. The two raw-SQL RLS migrations are
   mutually incompatible — `migrations/0002_add_organizations.sql` uses INTEGER
   `org_id` + GUC `app.current_org_id`;
   `migrations/0002_multi_tenant_rls_setup.sql` uses UUID `organization_id` +
   GUC `app.current_org` and redefines `current_org_id()` with a different
   return type (a `CREATE OR REPLACE` cannot change INTEGER↔UUID). They cannot
   both have applied, and **neither runs in the Vercel build**.
2. **The production surface (`makeApp`) does not mount `withRLSTransaction`**
   (referenced only by `server/server.ts`, the Docker path). The investment read
   handlers use the global `db` pool and never call
   `set_config('app.current_org', …)`.
3. **Decisive step:** if `FORCE ROW LEVEL SECURITY` were active on `investments`
   for the app role, then — because the GUC is never set on this connection —
   the fail-closed policy would return **0 rows for every** investments query,
   including the scoped `GET /api/investments?fundId=` that the live
   investment-rounds UI (`client/src/hooks/useCompanyInvestments.ts:21`) depends
   on. That feature returns real rows in production. Therefore RLS is not
   enforcing on this path. ∎

### Narrow production confirmation (optional, read-only)

```sql
SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'investments';
SELECT polname FROM pg_policies WHERE tablename = 'investments';
SELECT column_name FROM information_schema.columns
  WHERE table_name = 'investments' AND column_name IN ('org_id','organization_id');
```

Expected if the proof holds: `relrowsecurity = false` (or no policies) and
**no** org column. If this ever returns enforcing RLS + an org column + an app
role without `BYPASSRLS`, re-rate the residual app-layer fix as
defense-in-depth, but keep it — the app layer must not depend on an out-of-band
policy migration.

## Fix applied in this PR

- `GET /api/investments/:id`: after load + 404, reject `NULL`-fund rows
  (`invalid_investment_fund_scope`, 400) and enforce
  `enforceProvidedFundScope(req, res, investment.fundId)` (mirrors
  `resolveInvestmentRoundRouteScope`). Cross-fund → 403 `FUND_ACCESS_DENIED`.
- `GET /api/investments`: require an explicit `fundId`
  (`fund_scope_required`, 400) before any data read, closing the unscoped list.
  The only caller (`useCompanyInvestments`) already passes `?fundId=`, so this
  is behavior-preserving. An admin/service token with unrestricted scope can
  still query any specific fund via `?fundId=`.
- Regression tests: `tests/unit/routes/investments-access-boundary.test.ts`
  exercise the **real** `enforceProvidedFundScope` with signed bearer tokens and
  assert: cross-fund `:id` → 403 (no detail leak), in-scope `:id` → 200, missing
  → 404, NULL-fund → 400, unscoped list → 400, cross-fund list → 403, scoped
  list → 200.

## Residual / handoff to PR-H2

- The app layer is now the enforcement point. RLS reconciliation against prod
  (apply a single coherent policy set, or formally drop RLS as the control and
  document the app layer as authoritative) remains a separate, tracked decision
  — it is not required for this fix to hold.
- The 403-vs-404 distinction for an existing-but-out-of-scope `:id` is an
  existence oracle, but it matches the established round-route convention. PR-H2
  may standardize this across `financial: true` routes.
