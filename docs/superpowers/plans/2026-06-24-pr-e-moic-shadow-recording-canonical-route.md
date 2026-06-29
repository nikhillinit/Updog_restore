# PR-E MOIC Shadow Recording And Canonical Route Implementation Plan

> Status: in execution on branch `feat/pr-e-moic-shadow-recording` (2026-06-24).
> Dispatch model: Hermes production lane (codex worker) per workflow contract;
> Claude does intake / context / planning / verification. Each chunk is verified
> with targeted Vitest (the `npm run check` postflight does NOT run vitest nor
> typecheck test files).

**Goal:** Extend the existing fund MOIC V1 surface with explicit
no-op/materiality proof, opt-in V2 metadata, admin-triggered reconciliation
recording, and canonical routing without shipping `on` mode activation.

**Architecture:** Default V1 stays exact and side-effect free. V2 GET is
side-effect free and reads the latest completed reconciliation only.
Reconciliation recording happens through an idempotent admin POST.
`fund_calculation_modes`, residency, kill switch, and `on` mode are deferred
until a candidate can actually move `reservesMoic`.

**Tech Stack:** TypeScript, Express, React/Wouter, TanStack Query, Zod strict
contracts, Drizzle migrations, Vitest, `canonicalSha256`.

---

## Scope

- PR-E includes: materiality/no-op characterization,
  `exitProbability = null -> 0` defect pinning, strict V2 read shape, idempotent
  admin reconciliation POST, canonical route, route-policy classifier fix,
  dual-surface proof.
- PR-E excludes: `fund_calculation_modes`, `modePreview`, seven-day residency,
  kill switch, `on`, visible "round-aware ranking" claims.
- Candidate stance: PR-E's candidate is a no-op candidate for reserves MOIC
  unless a future `exitProbability`, `plannedReserves`, or `reserveExitMultiple`
  source is introduced. The materiality service must detect such future changes.

## Key Interfaces

- `GET /api/funds/:fundId/moic/rankings`
  - Default / `?contract=v1`: existing strict V1.
  - `?contract=v2`: strict V2, no persistence.
  - Unknown contract: 400.

- `POST /api/admin/funds/:fundId/moic/reconciliations`
  - Implement inside `server/routes/fund-moic.ts` as router path
    `/admin/funds/:fundId/moic/reconciliations` (router mounted at `/api` in
    both active surfaces).
  - Missing `Idempotency-Key`: 428.
  - Same key + same `request_hash`: replay existing run.
  - Same key + different `request_hash`: 409.
  - Requires auth, fund access, and `admin` role.

- V2 schema (see plan body for full Zod). Reuses `FundMoicRankingItemV1Schema`.

## Data Model — `reconciliation_runs` only

- `id`, `fund_id`, `idempotency_key`, `request_hash`, `requested_by`,
  `requested_at`, `status`.
- `legacy_input_hash`, `candidate_input_hash`, `evidence_input_hash`,
  `assumptions_hash`.
- `legacy_output_hash`, `candidate_output_hash`.
- `candidate_material` boolean, fixed false in PR-E unless a material candidate
  is introduced.
- `materiality_epsilon`, fixed `1e-8`.
- `diff_summary jsonb`: counts only (`comparedInvestmentCount`,
  `rankChangeCount`, `reservesMoicValueChangeCount`, `materialChangeCount`).
- `round_evidence_summary jsonb`: counts and warning codes only.
- Do NOT persist raw ranking arrays, ranking values, monetary values, raw diffs,
  per-investment shadow comparisons, or per-round MOIC figures.

Use `canonicalSha256` for ranked-array hashes and evidence hashes. Evidence hash
uses the existing round-evidence snapshot path and live override enum values:
`initial`, `follow_on`, `amount_only`.

---

## Execution Refinements (verified against `main` @ 2026-06-24)

Ground-truth file map (all verified to exist unless noted):

| Concern                          | Location                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MOIC route                       | `server/routes/fund-moic.ts` — GET `/funds/:fundId/moic/rankings`, mounted `/api` in `server/app.ts:225` (makeApp) AND `server/routes.ts:87` (registerRoutes)                                                                                                                                                                                                      |
| Ranking service                  | `server/services/fund-moic-ranking-service.ts` — `getFundMoicRankings(fundId)`, `buildMoicRankingsFromInvestments(fundId, investments)`                                                                                                                                                                                                                            |
| MOIC calculator                  | `shared/core/moic/MOICCalculator.ts` — `rankByReservesMOIC` / `calculateReservesMOIC`                                                                                                                                                                                                                                                                              |
| `exitProbability` null->0 defect | `server/routes/moic.ts` `dbToMOICInvestment()` — `toNumber(null) => 0`, so `reservesMOIC.value` collapses to 0 for null `exitProbability`. PIN, do not fix.                                                                                                                                                                                                        |
| V1 contract                      | `shared/contracts/fund-moic-v1.contract.ts` — exports `FundMoicRankingItemV1Schema`, `FundMoicRankingsResponseV1Schema`                                                                                                                                                                                                                                            |
| Route-policy classifier          | `server/route-policy/api-route-policy-registry.ts` — `getFinancialSurfaceForGovernanceEntry` (the `moic_reserves` branch is at ~line 74, BEFORE the `startsWith('/fund-model-results')` -> `fund_modeling` branch at ~line 85). Registry stores paths as LITERAL templates (e.g. `'/fund-model-results/:fundId/scenarios'` line 248, `'/moic-analysis'` line 300). |
| `canonicalSha256`                | `shared/lib/canonical-hash.ts`                                                                                                                                                                                                                                                                                                                                     |
| `requireRole`                    | `server/lib/auth/jwt.ts:245` — `requireRole('admin')`, 403 on mismatch. `requireAuth()`, `requireFundAccess` also here.                                                                                                                                                                                                                                            |
| V1 hook                          | `client/src/hooks/use-moic.ts` — `useFundMoicRankings`, query key `['fund-moic-rankings', fundId]`                                                                                                                                                                                                                                                                 |
| `/moic-analysis` page            | `client/src/pages/moic-analysis.tsx`; route in `client/src/app/app-route-definitions.ts:21` + `client/src/app/app-routes.tsx:36,98`                                                                                                                                                                                                                                |
| Fund-model-results route family  | already present: `/fund-model-results/:fundId`, `/fund-model-results/:fundId/scenarios`                                                                                                                                                                                                                                                                            |
| `OLD_TO_NEW_REDIRECTS`           | `client/src/core/routes/ia.ts` — do NOT edit; `/moic-analysis` is asserted absent in `tests/unit/app/legacy-route-map.test.ts`                                                                                                                                                                                                                                     |
| Round-evidence enum              | `shared/contracts/rounds-to-model-evidence.contract.ts:13` — `RoundModelRoleSchema = z.enum(['initial','follow_on','ambiguous','amount_only'])`                                                                                                                                                                                                                    |
| Round-evidence snapshot          | `server/services/rounds-to-model-evidence-service.ts`                                                                                                                                                                                                                                                                                                              |
| Drizzle schema dir               | `shared/schema/` (canonical, `db:push` source); barrel `shared/schema.ts`; new table -> `shared/schema/reconciliation-runs.ts` + `export * from './schema/reconciliation-runs';`                                                                                                                                                                                   |
| Migration dir                    | `migrations/` (drizzle `out`); latest `0015_funds_base_currency.sql`; add `0016_reconciliation_runs.sql`                                                                                                                                                                                                                                                           |

Decisions locked in (resolve plan ambiguities flagged in review):

1. **`request_hash` composition:**
   `canonicalSha256({ kind: 'moic_reconciliation', fundId, contractVersion: '2.0.0' })`.
   With no request body, the natural 409 test is "same Idempotency-Key reused
   against a different `:fundId`" (different `request_hash`). Replay test = same
   key + same fundId.
2. **Missing Idempotency-Key -> 428** explicitly (NOT 400). Pin in test.
3. **Materiality service is a PURE injectable comparator**:
   `assessMoicMateriality(legacy: FundMoicRankingItemV1[], candidate: FundMoicRankingItemV1[], epsilon = MOIC_MATERIALITY_EPSILON)`.
   It does NOT read the live adapter. `candidateMaterial` true iff any rank
   changed OR any `reservesMoic.value` delta `> epsilon`. This makes the "future
   positive `exitProbability` candidate is material" test constructible.
4. **Route-policy needs BOTH edits** (plan only named the classifier): add the
   `getFinancialSurfaceForGovernanceEntry` exact-string branch for
   `/fund-model-results/:fundId/moic-analysis` -> `moic_reserves`, AND add a
   governance REGISTRY entry for that literal path (else `policy:verify` has no
   entry to classify). Keep both in the server chunk; gate with
   `npm run policy:verify`.
5. **Admin role:** POST uses `requireAuth()`, `requireFundAccess`,
   `requireRole('admin')`. No invented middleware.
6. **Migration is hand-written** `CREATE TABLE IF NOT EXISTS` (replay-safe). Do
   NOT `drizzle-kit generate` against the drifted journal. Drizzle schema
   columns and the SQL must agree exactly.
7. **V2 GET reads latest COMPLETED reconciliation** by
   `requested_at DESC, id DESC`; returns `latestReconciliation: null` +
   `materiality.status: "not_run"` when none exists.

Per-chunk verification protocol (because Hermes postflight = `npm run check`
only):

- After each codex dispatch: `git diff --name-only` to catch out-of-scope strays
  before committing.
- Run the chunk's targeted Vitest suites with
  `npx vitest run --config vitest.config.mjs --configLoader native --project=<server|client> <files>`.
- Review allowlist / idempotency / materiality tests line-by-line — they are the
  ones a vacuous pass defeats.
- Commit per chunk with a conventional message.

## Implementation Tasks (chunked dispatch order)

- **Chunk 1:** V2 contract (`shared/contracts/fund-moic-v2.contract.ts`, reuse
  `FundMoicRankingItemV1Schema`), `reconciliation_runs` Drizzle schema + barrel
  export + `0016` migration, structural allowlist tests
  (`tests/unit/contract/fund-moic-v2.contract.test.ts`) enumerating every V2
  object key set AND asserting `.strict()` rejects an injected forbidden field.
- **Chunk 2:** `server/services/fund-moic-materiality.ts`
  (`MOIC_MATERIALITY_EPSILON = 1e-8`), characterization tests appended to
  `tests/unit/services/fund-moic-ranking-service.test.ts`,
  `tests/unit/services/fund-moic-materiality.test.ts` (epsilon + future-material
  proof).
- **Chunk 3:** `reconciliation_runs` service (idempotent replay), V2 GET
  branch + admin POST branch in `server/routes/fund-moic.ts`, dual-surface tests
  through `registerRoutes()` and `makeApp()`.
- **Chunk 4 (client):** `useFundMoicRankingsV2` (distinct query key + V2
  `safeParse`, V1 hook unchanged), canonical page
  `/fund-model-results/:fundId/moic-analysis` (V2 hook, shows materiality
  status/warnings), thin `/moic-analysis?fundId=` redirect page, route
  registration, hook/page/legacy-route-map tests.
- **Chunk 4b (server route-policy):** classifier edit + registry entry + policy
  assertion that canonical MOIC route returns `moic_reserves`;
  `npm run policy:verify`.

## V2 Schema (strict)

```ts
export const FundMoicRankingsResponseV2Schema = z
  .object({
    contractVersion: z.literal('2.0.0'),
    fundId: z.number().int().positive(),
    rankings: z.array(FundMoicRankingItemV1Schema),
    provenance: z
      .object({ mode: z.literal('legacy'), warnings: z.array(z.string()) })
      .strict(),
    latestReconciliation: z
      .object({
        runId: z.string().nullable(),
        createdAt: z.string().datetime().nullable(),
      })
      .strict()
      .nullable(),
    materiality: z
      .object({
        status: z.enum(['not_run', 'recorded']),
        candidateMaterial: z.literal(false),
        epsilon: z.literal(1e-8),
      })
      .strict(),
    roundEvidenceSummary: z
      .object({
        activeRoundCount: z.number().int().nonnegative(),
        activeOverrideCount: z.number().int().nonnegative(),
        warningCodes: z.array(z.string()),
      })
      .strict(),
    generatedAt: z.string().datetime(),
  })
  .strict();
```

## Test Plan

- Targeted server:
  `npx vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/services/fund-moic-ranking-service.test.ts tests/unit/services/fund-moic-materiality.test.ts tests/unit/contract/fund-moic-v2.contract.test.ts`
- Targeted client:
  `npx vitest run --config vitest.config.mjs --configLoader native --project=client tests/unit/hooks/use-moic.test.tsx tests/unit/app/legacy-route-map.test.ts tests/unit/pages/moic-analysis.test.tsx`
- Policy + surfaces: assert canonical MOIC route returns `moic_reserves`;
  `npm run policy:verify`.
- Broad gates: `npx vitest run ... --project=server`, `... --project=client`,
  `npm run test:unit`, `npm run guard:round-derived-financial-claims:check`,
  `npm run release:check`.

## Assumptions

- `npm run check` is informational only for this work (does not run vitest, does
  not typecheck test files).
- V2 returns `latestReconciliation: null` and `materiality.status: "not_run"`
  when no completed reconciliation exists.
- The newest completed reconciliation is selected by
  `requested_at DESC, id DESC`.
