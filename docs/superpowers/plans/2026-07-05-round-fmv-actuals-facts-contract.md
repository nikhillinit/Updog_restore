# Current Main Trust Freeze and Round/FMV Facts Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Freeze the completed PLAN(48) trust-activation lane and add a
read-only, fund-scoped Round/FMV-derived actuals facts contract that downstream
current forecast and reserve-ranking work can consume.

**Architecture:** Start from a clean worktree at current `origin/main`
(`ea9eef9be23141fa4bb7c251ed00c18cb3d6865c`, PR #1012). First update trust
documentation so PLAN(48) is historical, then build the model-input seam in
layers: shared Zod contract, server service, authenticated fund route,
route-policy registry entry, and client hook. Reuse existing
`ProvenanceEnvelopeSchema`, `canonicalSha256`, investment-round storage,
Planning FMV selectors, and route guard patterns. Do not add schema, exports, UI
claims, current forecast math, or reserve ranking in this slice.

**Tech Stack:** TypeScript, Express, Drizzle ORM, Zod, TanStack Query, Vitest,
Supertest, GitHub CLI.

---

## 2026-07-06 Execution Amendments (recorded at implementation time)

> **Status:** EXECUTED on branch `feat/round-fmv-actuals-facts` (six commits:
> docs freeze, contract, hook, service, route policy, route + makeApp mount),
> implemented via parallel Hermes/Codex lanes with independent Claude
> verification per lane. Gate evidence lives in the PR body.

- Head anchor: implementation runs from `origin/main = 34c9f1d7` (PR #1014,
  MOIC dead-surface closeout), one commit past the `ea9eef9b` anchor recorded
  below. Current Head Evidence was re-run at the new head: CI Unified
  `28782325296` success (lint, typecheck, unit, integration, e2e, production
  build, validate-core, and gate status all executed), Security Deep Scan
  `28782325330` success, CodeQL `28782325373` success. GitHub Pages run
  `28782324701` SUCCEEDED at this head, so the Pages-failure caveat in the
  original Current Head Evidence is historical and remains classified
  documentation-site-only.
- Composition decision (red-team requirement carried over from
  PLAN(50)-amended): the facts service REUSES the existing rounds-to-model
  seam instead of duplicating it. `buildRoundsToModelEvidenceFromRows` in
  `server/services/rounds-to-model-evidence-service.ts` remains the single
  owner of active-round selection, override lineage and role classification,
  initial/follow-on amount accumulation, non-equity amount-only handling, and
  currency-mismatch detection. The facts service composes that builder and
  layers only: Planning FMV mark selection (via the existing
  `selectActiveValuationMarks` helper), supersede lineage, latest-active-
  equity `preMoneyValuation`, per-company provenance envelopes, and
  per-company input hashes. The facts contract intentionally parallels
  `shared/contracts/rounds-to-model-evidence.contract.ts` at the company
  grain but is a distinct read-model contract because it adds Planning FMV
  and per-company hash-bound provenance semantics that the fund-level
  evidence contract does not carry.
- Planning FMV staleness policy: no repo-wide day-count staleness constant
  exists (verified by sweep on 2026-07-06; the only staleness artifact is a
  state-ordering map in `fund-scenario-calculation-service.ts`).
  `PLANNING_FMV_STALE_AFTER_DAYS = 120` is therefore introduced as a local
  exported constant in the facts service and is the policy source for the
  `PLANNING_FMV_STALE` warning.
- "Latest valuation" remains locked as the latest ACTIVE equity round's
  `preMoneyValuation` only (never `roundSize`).

## Current Head Evidence

- Current `origin/main`: `ea9eef9be23141fa4bb7c251ed00c18cb3d6865c`.
- Latest merge:
  `ea9eef9b chore(deps): prune 14 no-longer-load-bearing npm overrides (#1012)`.
- CI Unified push run: `28740800118`, success. Full jobs executed include
  typecheck, lint, unit, integration, e2e, validate-core, production build,
  bundle verify, security integration, and gate status.
- Security Deep Scan push run: `28740800119`, success. Jobs executed include
  OWASP Dependency-Check, Trivy filesystem scan, Trivy container scan, SBOM,
  license allowlist, and security-scan rollup.
- CodeQL push run: `28740800135`, success.
- Verify Strategic Documentation push run: `28740800113`, success.
- GitHub Pages run `28740799674` failed only at `Deploy to GitHub Pages`;
  classify before merge as product-blocking or documentation-site-only.
- `gh issue list --state open --limit 50` returned `[]` during plan writing.
- Security alert inventory API endpoints returned `404` from this local `gh`
  session despite repo admin metadata. Before merge, verify open code-scanning,
  Dependabot, and secret-scanning alerts through the GitHub Security UI or a
  token with the required security scopes.
- Local checkout at plan-writing time was not clean and was not on
  `origin/main`: branch `codex/code-scanning-backlog-20260705` had unrelated
  dirty test/config files. Implementation must start in a clean worktree or new
  worktree based on `origin/main`.

## Non-Goals

- Do not build Current Forecast, planned-reserves MOIC ranking, allocation-first
  construction, Scenario Builder, or Monte Carlo.
- Do not create LP exports or UI surfaces for the new facts route.
- Do not add database tables, migrations, columns, queues, workers, or
  dependencies.
- Do not mutate construction assumptions.
- Do not treat the failed GitHub Pages deploy as release-proof failure unless
  the project explicitly depends on Pages for production or release readiness.
- Do not absorb unrelated dirty files from the plan-writing checkout.

## File Structure

Create:

```text
shared/contracts/fund-actuals/fund-company-actuals-fact.contract.ts
server/services/fund-actuals/fund-company-actuals-facts-service.ts
server/routes/fund-actuals.ts
client/src/hooks/useFundActualsFacts.ts
tests/unit/contract/fund-company-actuals-fact.contract.test.ts
tests/unit/services/fund-actuals/fund-company-actuals-facts-service.test.ts
tests/unit/routes/fund-actuals-route.test.ts
tests/unit/hooks/useFundActualsFacts.test.tsx
```

Modify:

```text
README.md
docs/superpowers/plans/2026-07-03-trust-activation.md
shared/contracts/provenance-envelope.contract.ts
server/app.ts
server/route-policy/api-route-policy-registry.ts
tests/unit/route-policy/route-policy-coverage.test.ts
```

Only modify `shared/contracts/provenance-envelope.contract.ts` to add Planning
FMV-specific warning codes. If the implementation can satisfy the acceptance
criteria with existing warning codes, leave it unchanged.

## Implementation Tasks

### 0. Bootstrap a clean current-main worktree

- [ ] Preserve the existing dirty branch and create a clean implementation
      worktree.

```powershell
git fetch origin main
git worktree add ..\Updog_round_fmv_facts origin/main
Set-Location ..\Updog_round_fmv_facts
git status -sb
git rev-parse HEAD
```

Expected:

```text
## detached HEAD
ea9eef9be23141fa4bb7c251ed00c18cb3d6865c
nothing to commit, working tree clean
```

- [ ] If `origin/main` has advanced, stop using the SHA above and re-run the
      Current Head Evidence checks for the new head.
- [ ] Confirm `package.json` reflects the #1012 override prune before starting
      product work.

No commit for this task.

### 1. Freeze PLAN(48) and align README product truth

- [ ] Update `docs/superpowers/plans/2026-07-03-trust-activation.md` directly
      under the header with a closure block.

Use this wording unless live evidence changes:

```md
> **Status:** EXECUTED/CLOSED for the PLAN(48) trust-activation scope. **Closure
> update:** 2026-07-05 current-main rebaseline at
> `ea9eef9be23141fa4bb7c251ed00c18cb3d6865c` confirms the trust lane is
> historical. Do not execute further modeling work from this plan. New modeling
> work starts from the separate Round/FMV-derived actuals facts contract plan.
```

- [ ] Add a short "2026-07-05 Current-Main Rebaseline" subsection to the trust
      plan that records:
  - `origin/main` SHA `ea9eef9b`.
  - CI Unified run `28740800118` success and which full jobs executed.
  - Security Deep Scan run `28740800119` success with Trivy filesystem, Trivy
    container, and OWASP Dependency-Check jobs.
  - CodeQL run `28740800135` success.
  - Pages run `28740799674` failed at Deploy to GitHub Pages and is classified
    separately from product/API release proof.
  - Security alert inventory still needs UI or scoped-token confirmation because
    local `gh api` returned `404`.
- [ ] Update `README.md` under "Current Product Truth" so it no longer says LP
      Reporting export/download routes are not admin-only or unqualified.

Replace the stale LP export bullets with this shape:

```md
- LP dashboard/profile widget routes are mounted in both active server surfaces.
  LP Reporting Surface-A report-package JSON/CSV exports are
  production-trust-qualified for the PRD #996 Surface-A scope: partner/admin
  role gates, fund-scope checks, locked/exported workflow gates, H9/evidence
  blockers, `h9Stamp`, and `contentHash` provenance are enforced. ADR-027 scopes
  visual watermarking out for these machine-readable artifacts.
  `/api/lp/reports/*` remains a separate LP report-center path and any future
  PDF/report-center watermark requirement needs its own issue or PRD amendment.
```

- [ ] Verify docs alignment.

```powershell
rg -n "not yet admin-only|watermarked|production-trust-qualified|Surface-A|/api/lp/reports" README.md docs/BUILD_READINESS.md docs/superpowers/plans/2026-07-03-trust-activation.md
```

Expected:

```text
README.md and docs/BUILD_READINESS.md both state Surface-A report-package exports are production-trust-qualified.
No remaining "not yet admin-only" claim.
/api/lp/reports/* is still described as a separate report-center path.
```

- [ ] Commit.

```powershell
git add README.md docs/superpowers/plans/2026-07-03-trust-activation.md
git commit -m "Freeze executed trust lane before facts modeling" -m "PLAN(48) is now historical evidence rather than an executable backlog. README product truth now matches Build Readiness for Surface-A LP report-package exports while keeping the separate LP report-center path distinct." -m "Constraint: Current modeling work must not restart completed trust-activation gates.
Rejected: Add a standalone current-head readiness note | this is derivable from CI and would become a session artifact.
Confidence: high
Scope-risk: narrow
Directive: Do not execute new modeling work from the closed trust plan.
Tested: rg docs alignment check
Not-tested: GitHub Security UI alert inventory"
```

### 2. Add the shared facts contract and contract tests

- [ ] Add Planning FMV warning codes only if needed.

If missing/stale Planning FMV requires distinct downstream semantics, extend
`WarningCodeSchema` in `shared/contracts/provenance-envelope.contract.ts`:

```ts
export const WarningCodeSchema = z.enum([
  'ROUND_ADAPTER_FAILED',
  'CURRENCY_MISMATCH_BLOCK',
  'DATA_STALE',
  'PLANNING_FMV_MISSING',
  'PLANNING_FMV_STALE',
  'ROLE_CLASSIFICATION_AMBIGUOUS',
  'ROLE_TOLERANCE_OVERRIDDEN',
  'ROUND_MODEL_OVERRIDE_APPLIED',
  'INVALID_ROUND_AMOUNT',
  'NON_EQUITY_AMOUNT_ONLY',
  'EMPTY_FUND',
]);
```

- [ ] Create
      `shared/contracts/fund-actuals/fund-company-actuals-fact.contract.ts`.

Use this skeleton and keep the contract strict:

```ts
import { z } from 'zod';

import { DecimalStringSchema } from '../lp-reporting/cash-flow-event.contract';
import {
  ProvenanceEnvelopeSchema,
  StructuredWarningSchema,
} from '../provenance-envelope.contract';

const PositiveIdSchema = z.number().int().positive();
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const IsoDateSchema = z.string().date();
const CurrencyCodeSchema = z.string().regex(/^[A-Z]{3}$/);

export const FundCompanyActualsPlanningFmvStatusSchema = z.enum([
  'none',
  'active',
  'superseded',
  'stale',
  'blocked',
]);

export const FundCompanyActualsCurrencyStatusSchema = z.enum([
  'base_currency',
  'mismatch_blocked',
  'unknown',
]);

export const FundCompanyActualsSupersedeLineageSchema = z
  .object({
    roundId: PositiveIdSchema,
    supersedesRoundId: PositiveIdSchema.nullable(),
  })
  .strict();

export const FundCompanyActualsFactSchema = z
  .object({
    fundId: PositiveIdSchema,
    companyId: PositiveIdSchema,
    companyName: z.string().min(1),
    investmentIds: z.array(PositiveIdSchema),
    activeRoundIds: z.array(PositiveIdSchema),
    approvedPlanningFmvMarkId: PositiveIdSchema.nullable(),
    planningFmvStatus: FundCompanyActualsPlanningFmvStatusSchema,
    initialInvestmentAmount: DecimalStringSchema,
    followOnInvestmentAmount: DecimalStringSchema,
    amountOnlyNonEquityAmount: DecimalStringSchema,
    latestRoundDate: IsoDateSchema.nullable(),
    latestRoundValuation: DecimalStringSchema.nullable(),
    latestPlanningFmvDate: IsoDateSchema.nullable(),
    latestPlanningFmvValue: DecimalStringSchema.nullable(),
    currency: CurrencyCodeSchema,
    currencyStatus: FundCompanyActualsCurrencyStatusSchema,
    supersedeLineage: z.array(FundCompanyActualsSupersedeLineageSchema),
    warnings: z.array(StructuredWarningSchema),
    provenance: ProvenanceEnvelopeSchema,
    inputHash: Sha256Schema,
  })
  .strict();

export const FundCompanyActualsFactsQuerySchema = z
  .object({
    asOfDate: IsoDateSchema.optional(),
  })
  .strict();

export const FundCompanyActualsFactsResponseSchema = z
  .object({
    fundId: PositiveIdSchema,
    asOfDate: IsoDateSchema,
    facts: z.array(FundCompanyActualsFactSchema),
    inputHash: Sha256Schema,
    generatedAt: z.string().datetime(),
  })
  .strict();

export type FundCompanyActualsPlanningFmvStatus = z.infer<
  typeof FundCompanyActualsPlanningFmvStatusSchema
>;
export type FundCompanyActualsCurrencyStatus = z.infer<
  typeof FundCompanyActualsCurrencyStatusSchema
>;
export type FundCompanyActualsFact = z.infer<
  typeof FundCompanyActualsFactSchema
>;
export type FundCompanyActualsFactsResponse = z.infer<
  typeof FundCompanyActualsFactsResponseSchema
>;
```

- [ ] If this repo has a barrel export for shared contracts, add the new
      contract there. If no barrel is used for nearby contracts, import by
      direct path.
- [ ] Add `tests/unit/contract/fund-company-actuals-fact.contract.test.ts` with
      cases for:
  - Valid LIVE fact with only info warnings.
  - PARTIAL fact with `PLANNING_FMV_MISSING` or `DATA_STALE`.
  - UNAVAILABLE fact with `CURRENCY_MISMATCH_BLOCK`.
  - Rejects numeric money values.
  - Rejects malformed `inputHash`.

Targeted verification:

```powershell
cross-env TZ=UTC vitest run tests/unit/contract/fund-company-actuals-fact.contract.test.ts --project=server
```

Expected:

```text
PASS tests/unit/contract/fund-company-actuals-fact.contract.test.ts
```

- [ ] Commit.

```powershell
git add shared/contracts tests/unit/contract/fund-company-actuals-fact.contract.test.ts
git commit -m "Define hash-bound Round FMV actuals fact contract" -m "The contract exposes model inputs only: fund-scoped company actuals, Planning FMV selection state, currency actionability, warnings, provenance envelope, and stable input hashes." -m "Constraint: No schema or export surface belongs in this slice.
Rejected: Return raw FinancialProvenance | existing consumers need the stricter ProvenanceEnvelope trust states.
Confidence: high
Scope-risk: moderate
Directive: Keep money fields as decimal strings; never convert financial amounts to JS number in this contract.
Tested: contract vitest
Not-tested: server route/service integration"
```

### 3. Implement the fund actuals facts service behind tests

- [ ] Create
      `tests/unit/services/fund-actuals/fund-company-actuals-facts-service.test.ts`
      before the service implementation.
- [ ] Cover these service behaviors:
  - Fund-scoped query rejects or ignores cross-fund rounds, investments,
    companies, and Planning FMV marks.
  - Active non-superseded rounds are included.
  - Superseded rounds are excluded from active amounts but appear in
    `supersedeLineage`.
  - Latest approved or locked Planning FMV mark is selected by
    `markDate <= asOfDate`, using the existing latest-date and higher-id
    tie-break.
  - Draft and superseded Planning FMV marks are not selected.
  - Future marks are not selected.
  - Missing Planning FMV produces a warning and no fake value.
  - Stale Planning FMV produces a warning. Use a local constant such as
    `PLANNING_FMV_STALE_AFTER_DAYS = 120` unless an existing policy constant is
    found.
  - Currency mismatch sets `currencyStatus: 'mismatch_blocked'`, emits
    `CURRENCY_MISMATCH_BLOCK`, and returns UNAVAILABLE provenance.
  - `safe`, `convertible_note`, `warrant`, and `other` rounds contribute only to
    `amountOnlyNonEquityAmount` and emit `NON_EQUITY_AMOUNT_ONLY`.
  - `inputHash` changes when an active round changes.
  - `inputHash` changes when the selected Planning FMV mark changes.
- [ ] Implement
      `server/services/fund-actuals/fund-company-actuals-facts-service.ts`.

Use these existing sources:

```ts
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import Decimal from 'decimal.js';

import { db } from '../../db';
import {
  makeCurrencyBlockedProvenance,
  makeLiveRoundsProvenance,
  makePartialRoundsProvenance,
} from '../../lib/rounds-provenance';
import { canonicalSha256 } from '@shared/lib/canonical-hash';
import {
  FundCompanyActualsFactsResponseSchema,
  type FundCompanyActualsFact,
  type FundCompanyActualsFactsResponse,
} from '@shared/contracts/fund-actuals/fund-company-actuals-fact.contract';
import type { StructuredWarning } from '@shared/contracts/provenance-envelope.contract';
import { funds } from '@shared/schema/fund';
import { investmentRounds } from '@shared/schema/investment-rounds';
import { valuationMarks } from '@shared/schema/lp-reporting-evidence';
import { investments, portfolioCompanies } from '@shared/schema/portfolio';
```

- [ ] Prefer the existing Planning FMV active selection helper over rewriting
      selection rules.
      `server/services/lp-reporting/active-valuation-mark-selector.ts` already
      applies:
  - `markDate <= asOfDate`
  - excluded statuses
  - one mark per company
  - latest `markDate`, then higher `id`

- [ ] Add a narrow service error class for route mapping:

```ts
export class FundActualsFactsServiceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'FundActualsFactsServiceError';
  }
}
```

- [ ] Keep the service API small:

```ts
export interface BuildFundCompanyActualsFactsInput {
  fundId: number;
  asOfDate: string;
  now?: Date;
  database?: typeof db;
}

export async function buildFundCompanyActualsFacts(
  input: BuildFundCompanyActualsFactsInput
): Promise<FundCompanyActualsFactsResponse> {
  // query, group, compute, hash, and parse response
}
```

- [ ] Query only data for `input.fundId`. Do not rely on later filtering as the
      only cross-fund control.
- [ ] Use `funds.baseCurrency` as the output `currency`.
- [ ] Join or separately fetch:
  - `funds`
  - `portfolioCompanies` for `id`, `fundId`, `name`
  - `investments` for `id`, `fundId`, `companyId`, `amount`, `investmentDate`
  - `investmentRounds` for all rows in the fund, including superseded rows for
    lineage
  - `valuationMarks` where `fundId` matches,
    `importedFrom = 'planning_fmv_override'`, and status is `approved` or
    `locked`
- [ ] Derive active rounds with the same semantic as
      `InvestmentRoundService.listRoundsForInvestment`: a round is active when
      no other fund round supersedes it.
- [ ] Classify active equity amounts:
  - Earliest active equity round per company by `roundDate`, then `id`: initial.
  - Later active equity rounds: follow-on.
  - Non-equity rounds: amount-only, no conversion math.
- [ ] Set `latestRoundValuation` only from the latest active equity round's
      `preMoneyValuation`. Do not substitute `roundSize` as a valuation.
- [ ] Include one fact per company with any parent investment, active round, or
      selected Planning FMV mark. Sort by `companyName`, then `companyId`.
- [ ] Build company and response hashes from canonical source inputs, not from
      rendered output:

```ts
const factInputHash = canonicalSha256({
  fundId,
  companyId,
  asOfDate,
  baseCurrency,
  activeRounds: activeCompanyRounds,
  selectedPlanningFmvMark,
  parentInvestments: companyInvestments,
});
```

- [ ] Feed the same source inputs to `makeLiveRoundsProvenance`,
      `makePartialRoundsProvenance`, or `makeCurrencyBlockedProvenance`.
- [ ] Choose provenance state by actionability:
  - `LIVE`: base currency matches, no blocking warnings, no non-info warnings.
  - `PARTIAL`: missing/stale FMV or unsupported amount-only non-equity warning.
  - `UNAVAILABLE`: currency mismatch with `CURRENCY_MISMATCH_BLOCK`.
- [ ] Parse every fact and response through
      `FundCompanyActualsFactsResponseSchema` before returning.

Targeted verification:

```powershell
cross-env TZ=UTC vitest run tests/unit/services/fund-actuals/fund-company-actuals-facts-service.test.ts --project=server
```

Expected:

```text
PASS tests/unit/services/fund-actuals/fund-company-actuals-facts-service.test.ts
```

- [ ] Commit.

```powershell
git add server/services/fund-actuals tests/unit/services/fund-actuals
git commit -m "Build fund-scoped Round FMV actuals facts" -m "The service converts active investment rounds plus selected approved Planning FMV marks into hash-bound company facts for downstream model consumers." -m "Constraint: Current forecast and reserve ranking remain out of scope.
Rejected: Store facts in a new table | this slice can recompute from authoritative actuals without proving a storage gap.
Confidence: medium
Scope-risk: moderate
Directive: Do not add SAFE or convertible conversion math here; unsupported securities stay amount-only until a conversion PRD exists.
Tested: fund actuals facts service vitest
Not-tested: Express route integration"
```

### 4. Add the authenticated facts route

- [ ] Create `tests/unit/routes/fund-actuals-route.test.ts` first.
- [ ] Match the route test style from
      `tests/unit/routes/dual-forecast-route.test.ts`.
- [ ] Test:
  - `GET /api/funds/12/actuals/facts` calls `requireAuth`, validates `fundId`,
    calls `requireFundAccess`, and returns service output.
  - `?asOfDate=2026-07-01` is passed through.
  - Invalid `fundId` returns 400 before fund access and before service.
  - Invalid `asOfDate` returns 400 before service.
  - Fund access denial returns 403 and does not call the service.
  - Service `FundActualsFactsServiceError(404, 'fund_not_found', ...)` maps
    to 404.
- [ ] Create `server/routes/fund-actuals.ts`.

Use this route shape:

```ts
import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';

import { requireAuth, requireFundAccess } from '../lib/auth/jwt';
import { handleNumberParseError } from '../lib/number-parse-error';
import { createRouteLogger } from '../lib/route-logger.js';
import {
  buildFundCompanyActualsFacts,
  FundActualsFactsServiceError,
} from '../services/fund-actuals/fund-company-actuals-facts-service';
import { FundCompanyActualsFactsQuerySchema } from '@shared/contracts/fund-actuals/fund-company-actuals-fact.contract';
import { toNumber } from '@shared/number';

const routeLog = createRouteLogger('fund-actuals');
const router = Router();

function validateFundIdParam(req: Request, res: Response, next: NextFunction) {
  try {
    toNumber(req.params['fundId'], 'fundId', { integer: true, min: 1 });
    next();
  } catch (error) {
    if (handleNumberParseError(error, res, 'Invalid parameter')) return;
    throw error;
  }
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

router.get(
  '/funds/:fundId/actuals/facts',
  requireAuth(),
  validateFundIdParam,
  requireFundAccess,
  async (req: Request, res: Response) => {
    try {
      const fundId = toNumber(req.params['fundId'], 'fundId', {
        integer: true,
        min: 1,
      });
      const query = FundCompanyActualsFactsQuerySchema.parse(req.query);
      const result = await buildFundCompanyActualsFacts({
        fundId,
        asOfDate: query.asOfDate ?? todayUtc(),
      });

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'private, max-age=60');
      return res.json(result);
    } catch (error) {
      routeLog.error('Fund actuals facts API error:', error);

      if (handleNumberParseError(error, res, 'Invalid parameter')) return;

      if (error instanceof FundActualsFactsServiceError) {
        return res.status(error.status).json({
          error: error.code,
          message: error.message,
          details: error.details,
        });
      }

      if (error && typeof error === 'object' && 'issues' in error) {
        return res.status(400).json({
          error: 'invalid_actuals_facts_query',
          message: 'Invalid actuals facts query',
          details: error,
        });
      }

      return res.status(500).json({
        error: 'internal_error',
        message: 'Failed to build fund actuals facts',
      });
    }
  }
);

export default router;
```

- [ ] Mount the route in `server/app.ts` near the fund modeling routes:

```ts
import fundActualsRouter from './routes/fund-actuals.js';

app.use('/api', fundActualsRouter);
```

- [ ] If `server/routes.ts` is still used by tests or alternate app
      construction, check whether this route needs registration there too. Trace
      actual imports before modifying it.

Targeted verification:

```powershell
cross-env TZ=UTC vitest run tests/unit/routes/fund-actuals-route.test.ts --project=server
```

Expected:

```text
PASS tests/unit/routes/fund-actuals-route.test.ts
```

- [ ] Commit.

```powershell
git add server/routes/fund-actuals.ts server/app.ts tests/unit/routes/fund-actuals-route.test.ts
git commit -m "Expose actuals facts behind fund access" -m "The route is a read-only model-input API with auth, fund-scope enforcement, query validation, private caching, and explicit service-error mapping." -m "Constraint: No export or UI claim is introduced by this endpoint.
Rejected: Mount under LP reporting routes | the contract feeds fund modeling, not LP report artifacts.
Confidence: high
Scope-risk: moderate
Directive: Keep requireAuth and requireFundAccess on the route even though app-level auth exists.
Tested: fund actuals route vitest
Not-tested: full app startup inventory"
```

### 5. Register route policy and verify governance

- [ ] Add an explicit policy entry to `EXPLICIT_API_ROUTE_POLICY_ENTRIES` in
      `server/route-policy/api-route-policy-registry.ts`.

Use this entry, adjusting owner only if the registry has a stronger local
convention:

```ts
{
  id: 'api:get:/api/funds/:fundId/actuals/facts',
  method: 'GET',
  path: '/api/funds/:fundId/actuals/facts',
  lifecycle: 'durable_crud',
  governanceRef: '/fund-model-results/:fundId',
  surface: 'fund-company-actuals-facts-api',
  owner: ownerForFinancialSurface('fund_modeling'),
  telemetryKey: telemetryKeyForRoute('api.route', '/api/funds/:fundId/actuals/facts'),
  financialSurface: 'fund_modeling',
  apiAuthBoundary: 'require_auth_and_fund_access',
  fundScopeMode: 'route_param_fund_id',
  workflowRequirement: 'fund_scope_verified',
  exportPolicy: 'not_exportable',
  provenanceRequired: true,
  staleBlocksExport: false,
  humanReviewRequired: true,
  performanceBudgetMs: null,
  notes:
    'Read-only Round/FMV-derived model-input facts; no export or UI actionability claim is introduced in this slice.',
}
```

- [ ] Add route-policy coverage in
      `tests/unit/route-policy/route-policy-coverage.test.ts`.

```ts
it('classifies the Round FMV actuals facts route as non-exportable fund modeling input', () => {
  const policy = expectPolicy('GET /api/funds/:fundId/actuals/facts');

  expect(policy.financialSurface).toBe('fund_modeling');
  expect(policy.apiAuthBoundary).toBe('require_auth_and_fund_access');
  expect(policy.fundScopeMode).toBe('route_param_fund_id');
  expect(policy.exportPolicy).toBe('not_exportable');
  expect(policy.provenanceRequired).toBe(true);
});
```

Verification:

```powershell
npm run policy:verify
cross-env TZ=UTC vitest run tests/unit/route-policy/route-policy-coverage.test.ts --project=server
```

Expected:

```text
policy verifier returns no errors
PASS tests/unit/route-policy/route-policy-coverage.test.ts
```

- [ ] Commit.

```powershell
git add server/route-policy/api-route-policy-registry.ts tests/unit/route-policy/route-policy-coverage.test.ts
git commit -m "Classify actuals facts as governed model input" -m "The new Round/FMV facts API is recorded as fund-scoped, non-exportable fund modeling input with required provenance." -m "Constraint: Route policy must distinguish model inputs from exportable artifacts.
Rejected: Leave route covered only by app auth | route-policy consumers need explicit financial-surface classification.
Confidence: high
Scope-risk: narrow
Directive: Do not change exportPolicy without a separate export PRD and artifact-provenance tests.
Tested: npm run policy:verify; route-policy coverage vitest
Not-tested: full release check"
```

### 6. Add the client hook and hook tests

- [ ] Create `client/src/hooks/useFundActualsFacts.ts`.

Use the same pattern as `useInvestmentRounds`, with a stable query key:

```ts
import { useQuery } from '@tanstack/react-query';
import type { FundCompanyActualsFactsResponse } from '@shared/contracts/fund-actuals/fund-company-actuals-fact.contract';
import { apiRequest } from '@/lib/queryClient';

export const fundActualsFactsQueryKey = (
  fundId: number | undefined,
  asOfDate?: string
) => ['fund-actuals-facts', fundId ?? null, asOfDate ?? null] as const;

export function useFundActualsFacts(
  fundId: number | undefined,
  asOfDate?: string
) {
  const query = useQuery<FundCompanyActualsFactsResponse>({
    queryKey: fundActualsFactsQueryKey(fundId, asOfDate),
    enabled: fundId != null,
    queryFn: async () => {
      const suffix = asOfDate
        ? `?asOfDate=${encodeURIComponent(asOfDate)}`
        : '';
      return apiRequest<FundCompanyActualsFactsResponse>(
        'GET',
        `/api/funds/${fundId}/actuals/facts${suffix}`
      );
    },
  });

  return {
    facts: query.data?.facts ?? [],
    response: query.data,
    isLoading: query.isLoading,
    error: query.error as Error | null,
  };
}
```

- [ ] Create `tests/unit/hooks/useFundActualsFacts.test.tsx` using the
      `useInvestmentRounds` test pattern.
- [ ] Test:
  - Fetches `/api/funds/7/actuals/facts?asOfDate=2026-07-01`.
  - Returns `facts` from the response.
  - Uses `fundActualsFactsQueryKey(7, '2026-07-01')`.
  - Is disabled when `fundId` is `undefined`.

Targeted verification:

```powershell
cross-env TZ=UTC vitest run tests/unit/hooks/useFundActualsFacts.test.tsx --project=client
```

Expected:

```text
PASS tests/unit/hooks/useFundActualsFacts.test.tsx
```

- [ ] Commit.

```powershell
git add client/src/hooks/useFundActualsFacts.ts tests/unit/hooks/useFundActualsFacts.test.tsx
git commit -m "Add client hook for actuals facts" -m "The hook gives downstream model views a typed TanStack Query seam without adding a UI claim or export path." -m "Constraint: This slice exposes data plumbing only.
Rejected: Wire fund-model-results UI immediately | current forecast and reserve ranking need separate PRDs after this contract is proven.
Confidence: high
Scope-risk: narrow
Directive: Keep the hook disabled without fundId to avoid accidental broad fetches.
Tested: useFundActualsFacts hook vitest
Not-tested: browser UI"
```

### 7. Run focused and standard verification

- [ ] Run targeted tests together.

```powershell
cross-env TZ=UTC vitest run tests/unit/contract/fund-company-actuals-fact.contract.test.ts tests/unit/services/fund-actuals/fund-company-actuals-facts-service.test.ts tests/unit/routes/fund-actuals-route.test.ts tests/unit/route-policy/route-policy-coverage.test.ts --project=server
cross-env TZ=UTC vitest run tests/unit/hooks/useFundActualsFacts.test.tsx --project=client
```

- [ ] Run standard gates.

```powershell
npm run policy:verify
npm run check
npm run lint
npm run build
npm run build:verify
npm run test:unit
```

- [ ] Run local security/dependency proof.

```powershell
npm audit --omit=dev --audit-level=moderate --json
```

Expected:

```text
0 production vulnerabilities at moderate or higher severity.
```

- [ ] Run release proof only in an environment that can execute DB-backed
      stages.

```powershell
npm run release:check
```

Expected:

```text
All 12 release:check stages run with no skip flags.
Stage 5 fund-lifecycle DB proof executes.
Stage 7 production schema clone proof executes.
Stage 8 scenario release gate executes.
Exit code 0.
```

If Docker/WSL2/Testcontainers is unavailable locally, do not claim local release
proof. Record the environment gap and use CI or a Docker-capable environment for
non-skipped `release:check`.

- [ ] Re-check current GitHub evidence before opening or merging the PR.

```powershell
git rev-parse HEAD
gh issue list --state open --limit 50 --json number,title,state,labels
gh run list --commit HEAD --limit 20 --json databaseId,name,status,conclusion,event,createdAt,updatedAt,url
```

- [ ] Verify open Security alerts through GitHub Security UI or a token with
      scopes for code scanning, Dependabot, and secret scanning. Record results
      in the PR body.
- [ ] Classify Pages deployment run status in the PR body:
  - product blocker if Pages is a required production/release surface;
  - documentation-site-only if not required for API/product release;
  - new issue if it needs follow-up but should not block modeling contract work.

### 8. Final implementation self-review

- [ ] Contract review:
  - Money fields are decimal strings.
  - `inputHash` is SHA-256 and changes with active rounds or selected Planning
    FMV marks.
  - Warnings are structured and use existing `ProvenanceEnvelopeSchema`.
  - No UI/export actionability claim is introduced.
- [ ] Security review:
  - Route uses `requireAuth()` and `requireFundAccess`.
  - Service queries are fund-scoped at the database predicate level.
  - Cross-fund denial or non-leakage is tested.
- [ ] Product review:
  - Missing Planning FMV is warning/no-data, not zero.
  - Stale Planning FMV is disclosed and non-exportable by policy.
  - Currency mismatch blocks actionability.
  - SAFE/convertible/warrant/other are amount-only with warnings.
- [ ] Scope review:
  - No schema or migration files added.
  - No current forecast math added.
  - No reserve ranking added.
  - No LP export changes added.
- [ ] Placeholder scan:

```powershell
rg -n "TODO|FIXME|placeholder|mock|not implemented|fake" shared/contracts/fund-actuals server/services/fund-actuals server/routes/fund-actuals.ts client/src/hooks/useFundActualsFacts.ts tests/unit/contract/fund-company-actuals-fact.contract.test.ts tests/unit/services/fund-actuals tests/unit/routes/fund-actuals-route.test.ts tests/unit/hooks/useFundActualsFacts.test.tsx
```

Expected:

```text
No placeholder financial success paths.
Any intentional test mocks are in test files only.
```

- [ ] Final commit if verification or cleanup changed files.

## Acceptance Criteria

- PLAN(48) is clearly closed/executed and not an executable modeling backlog.
- README and Build Readiness agree that Surface-A report-package JSON/CSV
  exports are production-trust-qualified for PRD #996, with `/api/lp/reports/*`
  kept separate.
- `GET /api/funds/:fundId/actuals/facts?asOfDate=YYYY-MM-DD` exists and is
  read-only.
- The route requires auth and fund access.
- The route is registered in route policy as fund modeling, fund-scoped,
  provenance-required, and not exportable.
- Active non-superseded investment rounds are included.
- Superseded rounds are excluded from active amounts and visible in lineage.
- Approved or locked Planning FMV marks are selected as of the requested date.
- Missing/stale FMV produces structured warnings and no fake values.
- Currency mismatch blocks actionability.
- Non-equity rounds are amount-only unless a future conversion PRD models them.
- `inputHash` changes when active rounds or selected Planning FMV marks change.
- Shared contract is Zod-parsed on server and exercised by client hook tests.
- No database schema changes, new dependencies, exports, or UI claims are added.

## Verification Checklist

Run and record:

```powershell
cross-env TZ=UTC vitest run tests/unit/contract/fund-company-actuals-fact.contract.test.ts tests/unit/services/fund-actuals/fund-company-actuals-facts-service.test.ts tests/unit/routes/fund-actuals-route.test.ts tests/unit/route-policy/route-policy-coverage.test.ts --project=server
cross-env TZ=UTC vitest run tests/unit/hooks/useFundActualsFacts.test.tsx --project=client
npm run policy:verify
npm run check
npm run lint
npm run build
npm run build:verify
npm run test:unit
npm audit --omit=dev --audit-level=moderate --json
npm run release:check
```

If `npm run release:check` cannot run locally because Docker/WSL2/Testcontainers
is unavailable, record that as an environment gap and use a Docker-capable
environment or CI. Do not substitute `--skip-db` or
`UPDOG_RELEASE_CHECK_SKIP_DB=1` for release proof.

## Next PRD Placeholders

Create separate PRDs only after this contract is merged and verified:

- Current vs construction forecast.
- Planned-reserves MOIC ranking.
- Allocation-first construction hardening.
- Scenario Builder and Monte Carlo.

Those PRDs must consume this facts contract rather than re-querying raw rounds
and Planning FMV marks independently.
