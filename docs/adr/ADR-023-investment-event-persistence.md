---
status: ACCEPTED
last_updated: 2026-06-17
---

# ADR-023: Investment Event Persistence Backbone (Rounds First Tranche)

**Date:** 2026-06-17 **Status:** ACCEPTED (architect +
`phoenix-precision-guardian` sign-off received 2026-06-17 — L3 hard architecture
gate SATISFIED; L3b rounds-only is conditionally authorized for a future pass)
**Decision Makers:** Fund-roadmap L3 architect review (human), with
`phoenix-precision-guardian` sign-off required on the money/precision section
**Tags:** #investments #rounds #persistence #idempotency #optimistic-locking
#money #precision #fund-scope

**Related:**
[ADR-011 (Decimal-String API Convention)](./ADR-011-decimal-string-api-convention.md),
[ADR-022 (Fund Scenario Architecture)](./ADR-022-fund-scenario-architecture.md);
operating-object precedents `cash_event` (PR-C5 lifecycle) and `task`
(PR-T1/T2).

**Authority:** Answers the Tier-1/2/3 blockers in the L3 Hard Architecture Gate
of `prd-fund-management-roadmap-execution-20260617` (amendment-3), with the R7
Tier-1 promotions (aggregate boundary, fund-local-vs-shared, money/precision,
effective-date/as-of). **No code lands under this ADR.** L3b is conditionally
authorized only after this ADR is reviewed and accepted.

---

## Context

The investments surface implies operations the repo cannot persist. Today
`server/routes/investments.ts` exposes:

- `POST /api/investments/:id/rounds` (`:143`) and
  `POST /api/investments/:id/cases` (`:181`), both of which delegate to
  `storage.addInvestmentRound` / `storage.addPerformanceCase`, which throw
  `UnsupportedStorageOperationError` → **HTTP 501**
  `{ error: 'Storage operation is not supported for this route', code: 'UNSUPPORTED_STORAGE_OPERATION' }`
  (`:116-141`).
- The router is mounted at `/api` on **both** the makeApp surface
  (`server/app.ts:210`) and `registerRoutes` (`server/routes.ts:65`).
- `tests/integration/investment-scenario-capability.test.ts:15-25` asserts the
  501 for rounds; `:27-37` asserts it for cases.

This is the highest-leverage product unlock after operating objects: backed
investment rounds are upstream of reserve follow-on modeling, valuation
analysis, and cap-table behaviour (PRD critical path L3 → L4b/L8/L9).

### Evidence gathered (re-anchored on head `e8441c74`)

**Data model.** `investments` (`shared/schema/portfolio.ts:62`) is
**fund-local**: it carries `fundId` (`:65`, FK → `funds.id`) and `companyId`
(`:66`). There is **no** existing rounds/financing/cap-table table. The money
convention is ADR-011: `NUMERIC(20,6)` columns + `DecimalString` on the wire;
legacy portfolio columns use `decimal(15,2)`.

**Concurrency precedent.** The current canonical optimistic-lock pattern is
**Postgres `xmin` + If-Match**, proven on two services:
`cash-flow-event-service.ts` and `task-service.ts` select
`sql<string>\`xmin::text\``, update with `WHERE … AND xmin =
${expectedXmin}::xid`, derive the ETag via `rowVersionETag(xmin)` (`server/lib/http-preconditions.ts:156`), return **428** when If-Match is absent, **412** on mismatch, and reload-disambiguate to **404/409/412** on a zero-row update. (Older `version:integer`columns exist on`investments`/ `investmentLots`
but are NOT the pattern new lifecycle work uses.)

**Idempotency precedent.** `server/routes/fund-scenario-sets.ts:120-201` reads
`Idempotency-Key`/`x-idempotency-key` and passes it to a service that stores
key→result (DB-backed). A separate Redis middleware exists
(`server/middleware/idempotency.ts`, 422 on key-reuse-with-different-body).
Cash-flow-event create-dedup uses a `source_hash` (import-specific, not for
direct POST). Money validation:
`DecimalStringSchema = z.string().regex(/^-?\d+(\.\d{1,6})?$/)`
(`shared/contracts/lp-reporting/cash-flow-event.contract.ts`), Decimal.js config
in `shared/lib/decimal-config.ts` (precision 28, ROUND_HALF_UP).

**Client/integration surface.** `new-round-dialog.tsx` has a persistence TODO
(`:53`), no API wired, and collects round name/security type/date/currency/
investment amount/round size/pre-money valuation (+ optional share mechanics).
No investment/round TanStack hook exists. **Critical:** `/investments` is an
**archived route** (`client/src/app/app-routes.tsx` ARCHIVED_PLACEHOLDER_ROUTES
→ redirects to `/portfolio`); `new-round-dialog` is mounted on **no live
route**.

---

## Decision

### Tier 1 — must answer before any code

1. **First-tranche scope: rounds only.** Performance cases, valuation/ownership/
   liquidation-preference updates, cap-table events, and bulk ops stay **501/
   unsupported**. The case 501 test (`:27-37`) remains green; the rounds 501
   test (`:15-25`) flips to `201` in L3b.

2. **Persistence model: a normalized first-class `investment_rounds` table.**
   Not a JSONB-only blob, not an event ledger. Rounds are first-class domain
   objects (the PRD "hybrid" default reserves the event-ledger for the later
   valuation/ ownership/liq-pref tranche). Enforces the repo gotcha "before
   writing structured data to JSONB, check for dedicated columns."

3. **Dedicated columns for all financial fields** (`NUMERIC(20,6)`), not typed
   payloads. Proposed tranche-1 columns:

   | column                      | type                                                                                   | notes                                                                                                                                                                                             |
   | --------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `id`                        | `serial` PK                                                                            | mirror `tasks`/`cashFlowEvents`                                                                                                                                                                   |
   | `investment_id`             | `integer NOT NULL` FK→`investments.id` ON DELETE CASCADE                               | aggregate parent                                                                                                                                                                                  |
   | `fund_id`                   | `integer NOT NULL` FK→`funds.id`                                                       | denormalized for fund-scope index; MUST equal `investments.fund_id` (enforced at create)                                                                                                          |
   | `round_name`                | `varchar(120) NOT NULL`                                                                |                                                                                                                                                                                                   |
   | `security_type`             | `varchar(32) NOT NULL` CHECK in (`equity`,`convertible_note`,`safe`,`warrant`,`other`) |                                                                                                                                                                                                   |
   | `round_date`                | `date NOT NULL`                                                                        | the financing-event effective date                                                                                                                                                                |
   | `currency`                  | `varchar(3) NOT NULL DEFAULT 'USD'`                                                    | `varchar` (not `char`) per the repo-wide convention — `cashFlowEvents`/`valuationMarks`/`vehicles` all use `varchar(3)`; `char` pads with spaces and breaks equality (phoenix-precision-guardian) |
   | `investment_amount`         | `numeric(20,6) NOT NULL`                                                               | this fund's investment                                                                                                                                                                            |
   | `round_size`                | `numeric(20,6)`                                                                        | nullable                                                                                                                                                                                          |
   | `pre_money_valuation`       | `numeric(20,6)`                                                                        | nullable                                                                                                                                                                                          |
   | `idempotency_key`           | `varchar(255)`                                                                         | create-idempotency (see 4)                                                                                                                                                                        |
   | `created_by`                | `integer` FK→`users.id`                                                                | nullable, best-effort actor                                                                                                                                                                       |
   | `created_at` / `updated_at` | `timestamptz DEFAULT now()`                                                            |                                                                                                                                                                                                   |

   Indexes: `(fund_id, investment_id)`, `(investment_id, round_date DESC)`, and
   a **UNIQUE `(fund_id, idempotency_key)`** (see 4). **Share-mechanics fields**
   (`sharePrice`, `newSharesPurchased`, …) and **`graduation_rate`** are
   **deferred** to a follow-up tranche (optional in the dialog; additive
   nullable columns later). `graduation_rate` is deferred specifically to avoid
   a unit ambiguity flagged by `phoenix-precision-guardian`: the repo stores
   ratios 0..1 as `decimal(5,4)` (`conversionProbability`, `carryPercentage`,
   `ownershipAtExit`), but the existing
   `client/src/types/investment-rounds.ts:42` `graduation_rate` is a 0..100
   percentage. When added, store as a **0..1 ratio `numeric(5,4)`** with
   `CHECK (BETWEEN 0 AND 1)` and convert the client's percentage at the service
   boundary (do NOT introduce a 0..100 column).

4. **Create idempotency: REQUIRED `Idempotency-Key` header.** Round create is a
   financial write; per the cross-lane "every mutation idempotent" rule it
   requires a client key. Missing key → **428** `precondition_required` (mirrors
   the If-Match 428 shape). Mechanism = DB-level UNIQUE
   `(fund_id, idempotency_key)` with `ON CONFLICT … RETURNING`: a **replay**
   (same key) returns the stored row (stable response); a **conflicting reuse**
   (same key, materially different body) → **409** `idempotency_key_reused`.
   This is simpler than the Redis middleware and durable across restarts
   (extends the fund-scenario-sets service-level precedent).

5. **Update model: append-only first tranche — NO update/delete route.** A
   recorded round is an immutable financing event. Corrections are a future
   **supersede** tranche (a nullable `supersedes_round_id` self-FK added
   additively later, mirroring `cashFlowEvents.supersedesEventId`). The table
   inherits `xmin` automatically, so a future If-Match update route is a clean
   add. Tranche-1 routes = **create + list + read** only. The PRD permits
   "append-only/immutable → no update mutation."

6. **Route shape: keep investment-scoped
   `/api/investments/:investmentId/rounds`, add mandatory route-level fund
   enforcement.** Rationale: preserves the existing 501 route + integration test
   as the TDD flip target and the client dialog path; investments are fund-local
   so fund-scope is reliably derivable; PRD explicitly sanctions this with the
   requirement to "load the investment and prove fund-access before mutation."
   Enforcement: load investment by `:investmentId` → 404 if absent → derive
   `investment.fund_id` → `enforceProvidedFundScope(req, res, fundId)` → 403 on
   denial → then mutate. (Fund-scoped `/api/funds/:fundId/…` is the consistency
   "north star" but is rejected for tranche 1 as higher churn; revisit if the
   investment surface is broadly refactored.)

#### R7 Tier-1 promotions

7. **Aggregate boundary.** `Round` is a child of `Investment`; the fund-scope
   aggregate root is the `Investment` (carries `fund_id`). Investments are
   **fund-local** (not shared across funds) — no multi-fund investment
   complication. `fund_id` is denormalized onto `investment_rounds` for indexed
   fund-scope queries and MUST equal the parent's `fund_id` (enforced at
   create).

8. **Money & precision (`phoenix-precision-guardian` APPROVED — corrections
   incorporated).** All money columns `NUMERIC(20,6)`; the API contract
   **imports** `DecimalStringSchema`/`MoneyStringSchema` from
   `shared/contracts/lp-reporting/cash-flow-event.contract.ts` (regex
   `^-?\d+(\.\d{1,6})?$`) — it does **NOT** redeclare them (ADR-011's body text
   shows an older uncapped regex; only the implementation caps at 6 dp, so
   redeclaring from the ADR text would silently drop the cap). Any computation
   uses `shared/lib/decimal-config.ts` (Decimal.js, precision 28,
   ROUND_HALF_UP). `currency` is `varchar(3)` ISO-4217, default `USD` (NOT
   `char(3)` — see column table). **No JS-number money fields** (ADR-011 gate).
   No new money utility is introduced.

9. **Effective-date / as-of.** Tranche 1 is **current-state only**. `round_date`
   is the financing-event effective date (a stored attribute, not a bitemporal
   axis). No `valid_from`/`valid_to`, no time-machine restore. Corrections
   arrive via the future supersede edge, not row mutation.

### Tier 2 — answered before the first PR

- **Which paths stay 501:** performance cases, valuation/ownership/liq-pref
  updates, cap-table events, bulk import/update/delete/tag. Each keeps an
  explicit unsupported test.
- **Scoping proof (route + service tests):** caller without fund access → 403
  before any write; unknown `:investmentId` → 404; body-supplied `fund_id` (if
  any) must match the derived fund or → 400.
- **Route loads investment + proves fund-access before mutation:** yes (decision
  6).
- **Service seam:** L3b adds
  `server/services/investments/investment-round-service.ts` (the route
  delegates; `server/routes/*.ts` may not import `../db`/`../storage` — enforced
  by `guard:route-imports` in `npm run lint`). The route stays thin.

### Tier 3 — deferrable (recorded, finalized in L3b)

- **Migration & back-out:** journaled `up`/`down` SQL mirroring
  `server/migrations/20260616_operating_object_tasks_v1.{up,down}.sql`; `down`
  drops `investment_rounds`. Post-rollback validation = the integration test
  reverts to expecting 501. Gate the UI behind a new `enable_investment_rounds`
  flag (off by default) via the registry/generation path, with `expiresAt`
  (R10).
- **Contract-first parallelism:** the shared Zod contract
  (`shared/contracts/investments/investment-round.contract.ts`) may be drafted
  after this ADR is accepted; client tests reuse the existing harness. **No new
  MSW/mocking dependency.**

---

## Consequences

**Positive.** One 501 path becomes a backed, fund-scoped, idempotent,
contract-tested create; reuses every proven precedent (xmin-ready, DecimalString
money, service seam, journaled up/down migration); minimal, additive,
reversible.

**Negative / risks.**

- **L3b "wire one UI path end-to-end" is blocked at the client.** `/investments`
  is archived and `new-round-dialog` is mounted on no live route.
  **Recommendation:** L3b's first PR ships backend (contract + route + service +
  migration + the 501→201 integration flip) **plus a `useCreateRound` hook with
  a focused unit test**, and **defers live UI mounting** (mounting the round
  dialog into `/portfolio` behind `enable_investment_rounds`) to an
  explicitly-scoped follow-up. The architect must accept this split, or expand
  L3b to include the `/portfolio` integration.
- Keeping investment-scoped routes diverges from the fund-scoped
  operating-object convention; accepted as a tranche-1 churn trade-off (decision
  6).
- Append-only (no update route) means an erroneous round needs the future
  supersede tranche to correct; acceptable for a financing-event record.

---

## Sign-off log (the L3 hard gate)

**Architect sign-off — RECEIVED 2026-06-17:**

1. **Route shape (decision 6):** ACCEPTED — investment-scoped
   `/api/investments/:investmentId/rounds` with mandatory route-level fund
   enforcement (over fund-scoped).
2. **Idempotency strictness (decision 4):** ACCEPTED — REQUIRED
   `Idempotency-Key`, **428** if missing; replay returns the stored row;
   conflicting reuse → 409.
3. **Update model (decision 5):** ACCEPTED — append-only / no update route in
   tranche 1 (corrections via a future supersede tranche).
4. **L3b UI sequencing:** ACCEPTED — backend + `useCreateRound` hook (with the
   501→201 integration flip) in the first L3b PR; **defer** live `/portfolio` UI
   mounting (behind `enable_investment_rounds`) to a scoped follow-up.

**Specialist sign-off — `phoenix-precision-guardian` APPROVED (2026-06-17), with
three corrections incorporated into this ADR:**

5a. `graduation_rate` **deferred** out of tranche 1 (was `numeric(9,6)`); when
added, store as a 0..1 ratio `numeric(5,4)` + `CHECK BETWEEN 0 AND 1`,
converting the existing client 0..100 percentage at the service boundary. 5b.
`currency` corrected `char(3)` → **`varchar(3)`** (repo-wide convention; `char`
space-padding breaks equality). 5c. §8 now requires the L3b contract to
**import** `DecimalStringSchema`/ `MoneyStringSchema` from the canonical
contract, never redeclare the regex. APPROVED unchanged: `NUMERIC(20,6)` money
columns, Decimal.js config, no JS-number money, DecimalString reuse.

**Gate status: SATISFIED.** L3b (rounds-only first tranche) is now conditionally
authorized for a future planning pass. Per the standing stop condition, **no L3b
code is written in this batch** — this pass delivers the accepted ADR only.
