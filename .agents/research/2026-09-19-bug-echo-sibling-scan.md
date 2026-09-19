# Bug-echo sibling scan: patterns B1-B12 from Tier A money-path report

Date: 2026-09-19; tree scanned: `docs/bug-prospector-tier-a` at 71f23cb84.
Output: `.agents/research/2026-09-19-bug-echo-sibling-scan.md`. Build manifest:
`package.json`. Seed report:
`.agents/research/2026-09-19-bug-prospector-tier-a-money-and-publication.md`.

Scan method: eight anti-patterns from the Tier A report used as grep templates
across `server/`, `shared/`, `client/src/`. Each candidate site read with its
callers and the request-scoped transaction middleware
(`server/middleware/with-rls-transaction.ts`). Classification: BUG (real,
reachable), REVIEW (needs owner context or deeper trace), WATCH (same shape,
cosmetic or low-probability), OK (correct, reason given).

Scale context: internal tool, ~5 users, testing. Ratings right-sized
accordingly.

## Summary

| Pattern                                       | BUG           | REVIEW | WATCH | OK     |
| --------------------------------------------- | ------------- | ------ | ----- | ------ |
| B1/B2: try-catch in request-scoped tx (25P02) | 3             | 6      | 0     | 7      |
| B3: pending status with no exit path          | 4             | 3      | 0     | 6      |
| B4: cross-fund data access (missing auth)     | 2             | 1      | 0     | 8      |
| B5: setMonth day overflow                     | 4             | 0      | 2     | 7      |
| B6: status change without audit row           | 0             | 1      | 0     | -      |
| B7: idempotent middleware no-op               | 0             | 0      | 0     | -      |
| B8: no stage-transition validation            | 0             | 0      | 0     | -      |
| B9-B12: saveIntents/normalizeRaw              | 0 (localized) | 0      | 0     | -      |
| **Total**                                     | **13**        | **11** | **2** | **28** |

Rating dimensions (every BUG rated):

| Dimension          | Scale                               |
| ------------------ | ----------------------------------- |
| Urgency            | 1 (low) - 5 (fix now)               |
| Risk of Fixing     | 1 (safe) - 5 (high regression risk) |
| Risk of Not Fixing | 1 (cosmetic) - 5 (data corruption)  |
| ROI                | 1 (low payoff) - 5 (high payoff)    |
| Blast Radius       | 1 (one field) - 5 (system-wide)     |
| Fix Effort         | 1 (one-liner) - 5 (multi-week)      |

---

## B1/B2: try-catch inside request-scoped Postgres transaction (25P02)

Root pattern: `protectedRLSTransaction()` wraps all `/api/*` routes in one DB
transaction. A per-row try-catch that swallows a SQL error puts the transaction
into 25P02 (aborted state). All subsequent SQL in that request silently returns
nothing. The handler returns 200. Idempotency middleware caches the empty
response.

Canon (correct form): `server/middleware/with-rls-transaction.ts` rolls back
only when `res.statusCode >= 400`. Catches that re-throw or call `next(err)` are
safe. Catches that swallow and continue are the anti-pattern.

### BUG B1.1: reserve-calculation-service.ts:319

`buildRankedReserveAllocation` runs 3 parallel `db.select` queries via
`loadReserveEnvelopeSources`. A swallowed SQL error on any of the three aborts
the transaction. Subsequent `db.insert(fundSnapshots)` at line 329 and
`markCalcRunCompletedIfReady` at line 358 silently fail.
`fund-persistence-service` `db.update(calcRuns)` at line 833 also silently
fails. Route-reachable via fund-persistence-service inline execution path.

| Urgency | Risk of Fixing | Risk of Not Fixing | ROI | Blast Radius | Fix Effort |
| ------- | -------------- | ------------------ | --- | ------------ | ---------- |
| 2       | 1              | 4                  | 4   | 3            | 1          |

Rationale: silent data loss on reserve snapshots, but trigger requires a SQL
error on a SELECT (rare with ~5 users). Fix is re-throw from the catch block.

### BUG B1.2: actual-metrics-calculator.ts:366

`getDistributions` swallows a SQL error from `db.select(fundDistributions)`.
Called from metrics-aggregator, serving-seam, fund-metrics route. After this
catch, `calculateActualMetrics` continues with empty distributions.
metrics-aggregator does further SQL (snapshot writes, facts queries) which all
silently fail under 25P02.

| Urgency | Risk of Fixing | Risk of Not Fixing | ROI | Blast Radius | Fix Effort |
| ------- | -------------- | ------------------ | --- | ------------ | ---------- |
| 2       | 1              | 4                  | 4   | 3            | 1          |

Rationale: metrics-aggregator writes snapshots downstream. A poisoned
transaction produces an empty snapshot cached as the real one.

### BUG B1.3: rounds-to-model-evidence-service.ts:506

`buildRoundsToModelEvidence` swallows SQL errors from `db.select(funds)`,
`db.select(portfolioCompanies)`, `db.select(investments)`. Returns degraded
result. Called from fund-moic route at line 304. Handler calls
`resolveMoicActionability` and `buildMarginalReserveMoicInputs` (both do SQL)
which silently fail under 25P02. Produces wrong MOIC rankings in a 200 response.

| Urgency | Risk of Fixing | Risk of Not Fixing | ROI | Blast Radius | Fix Effort |
| ------- | -------------- | ------------------ | --- | ------------ | ---------- |
| 2       | 1              | 4                  | 4   | 2            | 1          |

Rationale: wrong MOIC rankings served with a 200. Fix is re-throw.

### REVIEW B1.4: fund-metrics-calculator.ts:93

Swallows SQL from `db.select(fundDistributions)`. Currently only timer-based
caller. Verify pdf-generation is not route-reachable.

### REVIEW B1.5: fund-persistence-service.ts:798

Inline execution fallback swallows errors. Production impact depends on whether
BullMQ unavailability triggers the inline path. In prod (Vercel), BullMQ is not
available, so inline path may be the default.

### REVIEW B1.6: constrained-reserve-substrate-shadow.ts:320

Shadow persist SQL fail causes misleading 500 even though the reserve
calculation was correct. Error message conflates shadow failure with primary
failure.

### REVIEW B1.7: constrained-reserve-substrate-shadow.ts:333

Outer shadow catch, same route-reachable path as :320.

### REVIEW B1.8: current-forecast-shadow-service.ts:337

Catches SQL from `runV2()`, stores as metadata. Route handler
(`financial-facts.ts:147`) wraps in its own try-catch. Transaction COMMIT may
still fail if the inner catch poisoned the transaction.

### REVIEW B1.9: metrics-aggregator.ts:778

`fetchActualsFactsBlock` catches SQL, returns null. Intentional per ADR-028 but
may not account for 25P02 poisoning subsequent SQL in the same request
transaction.

---

## B3: pending status with no exit path

Root pattern: service creates a `status='pending'` row. Worker crash or process
exit leaves the row permanently pending. No background sweep, no TTL, no lease
expiry.

Canon (correct patterns): `fund-scenario-calculation-command-service.ts` has
`lease_token + lease_expires_at` (crash recovery).
`variance-alert-automation.ts` has `recoverStaleProcessingJobs()`.
`CacheWarmingService.ts` uses BullMQ with `attempts:3`.

### BUG B3.1: sensitivity-run-service.ts:95

Creates pending `sensitivityRuns` row. Processing is synchronous in the route
handler. Hard crash leaves the row pending forever. No sweep, no TTL, no lease
expiry.

| Urgency | Risk of Fixing | Risk of Not Fixing | ROI | Blast Radius | Fix Effort |
| ------- | -------------- | ------------------ | --- | ------------ | ---------- |
| 1       | 1              | 2                  | 2   | 1            | 2          |

Rationale: stuck row only visible in the database; user can retry with a new
request. Fix needs a TTL column or a periodic sweep.

### BUG B3.2: portfolio-optimization-service.ts:348

Inserts pending `job_outbox` row with `maxAttempts:3`. No `claimNext` or
`processOptimization` worker exists anywhere. Jobs sit pending forever. Likely
unfinished feature.

| Urgency | Risk of Fixing | Risk of Not Fixing | ROI | Blast Radius | Fix Effort |
| ------- | -------------- | ------------------ | --- | ------------ | ---------- |
| 1       | 1              | 1                  | 2   | 1            | 1          |

Rationale: dead feature. No consumer means no work is lost. Fix is either build
the consumer or delete the insertion.

### BUG B3.3: portfolio-optimization-service.ts:392

`scheduleMatrixGeneration` inserts a pending `job_outbox` row. Same as B3.2: no
consumer exists.

| Urgency | Risk of Fixing | Risk of Not Fixing | ROI | Blast Radius | Fix Effort |
| ------- | -------------- | ------------------ | --- | ------------ | ---------- |
| 1       | 1              | 1                  | 2   | 1            | 1          |

Rationale: same dead feature as B3.2. Likely fix together.

### BUG B3.4: planning-fmv-override-service.ts:227

Inserts pending `planningFmvOverrideRequests` row then processes synchronously.
Crash between insert (line 219) and completion (line 385) leaves the row pending
forever. Subsequent requests with same idempotency key get 409 "still pending"
(line 291). No sweep or TTL to unstick.

| Urgency | Risk of Fixing | Risk of Not Fixing | ROI | Blast Radius | Fix Effort |
| ------- | -------------- | ------------------ | --- | ------------ | ---------- |
| 2       | 2              | 3                  | 3   | 1            | 2          |

Rationale: a stuck row blocks the idempotency key permanently. User cannot retry
without changing the key. FMV overrides are a financial operation. Fix needs
either a TTL with sweep or a manual "unstick" endpoint.

### REVIEW B3.5: snapshot-service.ts:164

Pending `forecastSnapshots` row, no sweep. Timeline route returns 503 in prod.
`create()` appears unused.

### REVIEW B3.6: analysis-checkpoint-service.ts:1919

Pending `job_outbox` row. Claim uses `FOR UPDATE SKIP LOCKED` with catch, but no
background sweep for rows stuck in 'processing' after hard crash (SIGKILL/OOM).

### REVIEW B3.7: artifact-retention-service.ts:503

Same gap as analysis-checkpoint-service: no sweep for stuck 'processing' rows
after hard crash.

---

## B4: cross-fund data access (missing auth/scope)

Root pattern: route where `fundId` is taken from the request AND no auth
middleware is present. No `requireAuth()`, no `requireFundAccess`, no
`enforceProvidedFundScope`.

Canon: most routes use `enforceProvidedFundScope` or `requireFundAccess`. LP
routes scope by `lpId`.

### BUG B4.1: fund-metrics-legacy.ts:12

`GET /api/fund-metrics/:fundId` has zero auth middleware. Directly queries
`fund_metrics` table by fundId via `storage.getFundMetrics(fundId)`. Any
unauthenticated caller can read fund financial metrics (IRR, MOIC, DPI, TVPI).

Mitigating: `fund_metrics` table is empty in production.

| Urgency | Risk of Fixing | Risk of Not Fixing | ROI | Blast Radius | Fix Effort |
| ------- | -------------- | ------------------ | --- | ------------ | ---------- |
| 1       | 1              | 2                  | 3   | 1            | 1          |

Rationale: table empty in prod, so no data exposure today. Fix is add
`requireAuth` middleware. Risk of not fixing increases if table gets populated.

### BUG B4.2: portfolio-intelligence.ts:337 (and :211, :542, :619, :775, :831, :925)

All `/api/portfolio/*` routes (strategies, scenarios, reserves) have zero auth.
Read fund-scoped data by fundId from path/query params.

Mitigating: behind `ENABLE_PORTFOLIO_INTELLIGENCE` feature flag (default false).

| Urgency | Risk of Fixing | Risk of Not Fixing | ROI | Blast Radius | Fix Effort |
| ------- | -------------- | ------------------ | --- | ------------ | ---------- |
| 1       | 1              | 2                  | 3   | 2            | 1          |

Rationale: feature flag is off. When turned on, all 7 routes expose fund data
without auth. Fix is add `requireAuth` to the router-level middleware chain.

### REVIEW B4.3: portfolio-optimization.ts:243 (and :342, :400, :526, :578)

Zero auth, takes fundId from request body. NOT mounted in `server/routes.ts`.
Dead code. Would be BUG if mounted.

---

## B5: setMonth day overflow

Root pattern: `Date.setMonth()` called on a date whose day can exceed the target
month's length, without an overflow guard. Jan 31 + 1 month = Mar 2-3.

Canon (correct pattern): `shared/lib/fund-calc.ts:80-81` uses `setDate(0)` after
`setMonth` to clamp to the last day of the intended month.

### BUG B5.1: PerformanceDashboard.tsx:92

`setMonth(getMonth() - 3)` and `setMonth(getMonth() - 6)` on `new Date()` which
can have day 29-31. July 31 minus 3 months targeting April (30 days) overflows
to May 1. Affects which financial data points are included in performance range
query.

| Urgency | Risk of Fixing | Risk of Not Fixing | ROI | Blast Radius | Fix Effort |
| ------- | -------------- | ------------------ | --- | ------------ | ---------- |
| 2       | 1              | 2                  | 3   | 1            | 1          |

Rationale: date range filter shifts by 1-3 days on certain calendar dates.
Affects data selection for performance charts. Fix is add `setDate(1)` before
`setMonth` or use the canon `setDate(0)` pattern.

### BUG B5.2: investment-editor.tsx:286

`currentDate.setMonth(currentDate.getMonth() + 18)` in a loop. `currentDate`
comes from user input (`config.nextRoundDate`). Mutated in-place across
iterations. Day-31 drift compounds: first overflow loses the day, subsequent
iterations compound. Projected future round dates shift incorrectly.

| Urgency | Risk of Fixing | Risk of Not Fixing | ROI | Blast Radius | Fix Effort |
| ------- | -------------- | ------------------ | --- | ------------ | ---------- |
| 2       | 1              | 3                  | 3   | 1            | 1          |

Rationale: compounding drift across loop iterations produces visibly wrong
projected dates. Fix is clone the date per iteration and clamp.

### BUG B5.3: cashflow/generate.ts:75

`dt.setMonth(dt.getMonth() + e.monthOffset)` on user-provided fund `startDate`.
Can have day > 28. Overflow produces incorrect cash flow dates used in XIRR/IRR
financial calculations.

| Urgency | Risk of Fixing | Risk of Not Fixing | ROI | Blast Radius | Fix Effort |
| ------- | -------------- | ------------------ | --- | ------------ | ---------- |
| 3       | 1              | 4                  | 4   | 2            | 1          |

Rationale: affects XIRR/IRR calculations. Incorrect dates shift financial
returns. Higher urgency because financial output is directly affected. Fix is
add the `setDate(0)` clamp.

### BUG B5.4: fund-calc.ts:76

`periodStart.setMonth(baseDate.getMonth() + index * periodLengthMonths)` on
user-provided `startDate`. Day-31 base overflows when target month is shorter.
Period start dates shift into next month, corrupting fund period boundaries used
across the model.

| Urgency | Risk of Fixing | Risk of Not Fixing | ROI | Blast Radius | Fix Effort |
| ------- | -------------- | ------------------ | --- | ------------ | ---------- |
| 3       | 2              | 4                  | 4   | 4            | 1          |

Rationale: `fund-calc.ts` is a shared library. Period boundaries propagate
across the entire model. The canon fix exists at lines 80-81 of the same file
but is not applied to line 76. Higher risk-of-fixing because period boundary
changes affect downstream consumers. Fix is apply the existing `setDate(0)`
pattern from lines 80-81.

### WATCH B5.5: CashflowDashboard.tsx:168

Cosmetic chart x-axis label drift. Month labels shift 1-3 days on day 29-31.
Display-only.

### WATCH B5.6: PerformanceDashboard.tsx:98

`setFullYear(getFullYear() - N)` only overflows on Feb 29 of a leap year
targeting a non-leap year. Low probability.

---

## B6: status change without activity/audit row

Root pattern: mutation endpoint changes a status-like field without creating an
audit or activity record.

Known B6 (excluded): `deal-pipeline-service.ts:164` (updateDeal sets status
without activity row). Bulk status (:701) and bulk archive (:761) DO create
activity rows.

### REVIEW B6.1: cash-flow-event-service.ts:176

Sets `status: 'approved'` on LP capital call event with xmin optimistic locking.
Valid transition guard (`WHERE` pins `status: 'draft'`). But no `approvedBy`
column exists in schema. For a financial record (LP capital call), not tracking
WHO approved is an audit gap.

---

## B7: idempotent middleware no-op

Root pattern: routes mounting `idempotent` middleware outside the 4
`shouldAutoGenerateKey` prefixes without `requireIdempotencyKey` guard.

No new echoes. `portfolio-companies.ts` has `requireIdempotencyKey` on its POST.
All other routes mounting `idempotent` are either within auto-generate prefixes
or have explicit key requirements.

---

## B8: no stage-transition validation

Root pattern: status/stage enum field accepts arbitrary valid enum values
without transition validation.

No new echoes. Other status transitions are system-driven (not user-facing), use
WHERE-pinned transitions, or use transition maps.

---

## B9-B12: saveIntents/normalizeRaw

Eliminated. `saveIntents` and `normalizeRaw` exist only in
`capital-plan-draft.ts`. No siblings. Pattern localized.

---

## Tier A seed findings (origin patterns, already tracked)

These are the 12 BUG + 5 FRAGILE + 5 REVIEW findings from the Tier A money-path
report that seeded this sibling scan. Full detail in
`.agents/research/2026-09-19-bug-prospector-tier-a-money-and-publication.md`.
NOT re-reported here; listed for cross-reference.

| #   | Finding (Tier A)                                | Urgency  | Fix Effort | Sibling pattern    |
| --- | ----------------------------------------------- | -------- | ---------- | ------------------ |
| B1  | Import abort cascade + cached fictitious 200    | CRITICAL | Small      | B1/B2 (3 siblings) |
| B2  | Bulk ops same abort pattern                     | CRITICAL | Small      | B1/B2 (shared)     |
| B3  | Pending recompute blocks activation permanently | CRITICAL | Small      | B3 (4 siblings)    |
| B4  | Import preview cross-fund oracle (no RLS)       | HIGH     | Small      | B4 (2 siblings)    |
| B5  | Timeseries grid exact-date + setMonth overflow  | HIGH     | Medium     | B5 (4 siblings)    |
| B6  | PUT status change bypasses audit trail          | HIGH     | Trivial    | B6 (0 new)         |
| B7  | 6 routes: idempotent middleware is no-op        | HIGH     | Small      | B7 (0 new)         |
| B8  | No stage-transition validation                  | HIGH     | Small      | B8 (0 new)         |
| B9  | normalizeRaw coerces arrays to decimals         | HIGH     | Trivial    | B9-B12 (localized) |
| B10 | Save intent permanent lock on ZodError          | HIGH     | Trivial    | B9-B12 (localized) |
| B11 | "Draft retained" lies; reload loses data        | MEDIUM   | Small      | B9-B12 (localized) |
| B12 | replaceCapitalDraft return value discarded      | MEDIUM   | Trivial    | B9-B12 (localized) |

Combined count: 12 Tier A BUGs + 13 sibling BUGs = **25 total BUGs** across the
scanned surface.

---

## Architecture context

- Dual server: Vercel serverless (`makeApp`) and Docker/Railway. Prod = Vercel.
- Request-scoped tx: `protectedRLSTransaction()` on all `/api/*` routes.
- BullMQ workers: Railway only, `lockDuration: 300_000`.
- RLS: not all tables have policies. `deal_opportunities` lacks one.
- Scale: internal tool, ~5 users, testing.

## Priority triage (by composite score)

Tier 1 (highest composite ROI, financial output affected):

- **B5.4** fund-calc.ts:76 -- period boundary corruption, shared library,
  model-wide blast
- **B5.3** cashflow/generate.ts:75 -- XIRR/IRR date corruption
- **B1.1** reserve-calculation-service.ts:319 -- silent snapshot loss
- **B1.2** actual-metrics-calculator.ts:366 -- empty snapshot cached as real
- **B1.3** rounds-to-model-evidence-service.ts:506 -- wrong MOIC rankings

Tier 2 (real but lower urgency or mitigated):

- **B3.4** planning-fmv-override-service.ts:227 -- permanent idempotency block
- **B5.1** PerformanceDashboard.tsx:92 -- date range filter drift
- **B5.2** investment-editor.tsx:286 -- compounding date drift
- **B4.1** fund-metrics-legacy.ts:12 -- unauthed route, table empty
- **B4.2** portfolio-intelligence.ts:337 -- unauthed routes, flag off

Tier 3 (dead features or low impact):

- **B3.1** sensitivity-run-service.ts:95 -- stuck row, user can retry
- **B3.2** portfolio-optimization-service.ts:348 -- dead consumer
- **B3.3** portfolio-optimization-service.ts:392 -- dead consumer
