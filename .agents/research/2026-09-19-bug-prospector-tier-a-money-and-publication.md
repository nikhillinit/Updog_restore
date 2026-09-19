# Bug Prospector Report: Tier A -- Money Paths and Publication Integrity

**Date:** 2026-09-19 **Scope:** Financial calculation, LP reporting publication,
deal pipeline, capital planning modal, BullMQ workers **Lenses Applied:** All 7
(Assumptions, State Machines, Boundaries, Data Lifecycle, Error Paths, Time,
Platform Divergence) **Files Analyzed:** 32 **Base Commit:** d9f32c0c1 (main)
**Platform:** TypeScript monorepo -- Vercel serverless (makeApp) +
Docker/Railway workers

## Summary

| Status       | Count |
| ------------ | ----- |
| Bugs Found   | 12    |
| Fragile Code | 5     |
| OK (Guarded) | 28    |
| Needs Review | 5     |

## Issue Rating Table

All BUG and FRAGILE findings rated and sorted by Urgency then ROI.

| #   | Finding                                                                                                                                                                                                                                          | Lens           | Urgency  | Risk: Fix | Risk: No Fix | ROI       | Blast Radius | Fix Effort |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- | -------- | --------- | ------------ | --------- | ------------ | ---------- |
| B1  | deal-pipeline-service.ts:641-656 -- import per-row try/catch inside request-scoped tx aborts cascade, idempotency caches fictitious 200                                                                                                          | Error Path     | CRITICAL | Low       | CRITICAL     | Excellent | 2 files      | Small      |
| B2  | deal-pipeline-service.ts:698-720,758-780 -- bulkUpdateStatus/bulkArchive same abort semantics as B1                                                                                                                                              | Error Path     | CRITICAL | Low       | CRITICAL     | Excellent | 1 file       | Small      |
| B3  | current-forecast-shadow-trigger.ts:452-565 -- pending recompute command with no terminal transition on worker crash blocks fund activation permanently                                                                                           | State Machine  | CRITICAL | Low       | CRITICAL     | Excellent | 2 files      | Small      |
| B4  | deal-pipeline.ts:634 / deal-pipeline-service.ts:565 -- import preview: fundId optional, no RLS on deal_opportunities, no requireTeamWrite. Cross-fund company-name/dealId oracle                                                                 | Boundary       | HIGH     | Low       | HIGH         | Excellent | 2 files      | Small      |
| B5  | performance-calculator.ts:36-67,231-343 -- timeseries grid exact-date Map matching; setMonth day overflow drifts grid dates; metrics on non-grid dates invisible                                                                                 | Time           | HIGH     | Low       | HIGH         | Excellent | 1 file       | Medium     |
| B6  | deal-pipeline-service.ts:164,345-361 -- PUT can change deal status without creating activity row. Audit trail bypass distinct from M5                                                                                                            | Data Lifecycle | HIGH     | Low       | HIGH         | Excellent | 1 file       | Trivial    |
| B7  | deal-pipeline.ts:317,378,417,529,725,764 -- six routes mount `idempotent` middleware but no client sends Idempotency-Key header; auto-gen covers only /api/funds,simulations,transactions,payments. Zero idempotency on 6 mutation routes        | Error Path     | HIGH     | Low       | HIGH         | Good      | 2 files      | Small      |
| B8  | deal-pipeline-service.ts:408-417 -- no stage-transition validation beyond enum membership. Impossible transitions (e.g. closed to screening) accepted silently                                                                                   | State Machine  | HIGH     | Low       | HIGH         | Good      | 1 file       | Small      |
| B9  | capital-plan-draft.ts:455-462 -- normalizeRaw treats array-typed strings as individual decimals. by-history eligibility path unusable when variant.input contains array fields                                                                   | Assumption     | HIGH     | Low       | HIGH         | Excellent | 1 file       | Trivial    |
| B10 | capital-plan-draft.ts:67-74,235,673 -- save intent locks modal permanently on ZodError; catch block sets "draft retained" message but intent.current stays truthy, blocking all subsequent save attempts until page reload                       | State Machine  | HIGH     | Low       | HIGH         | Excellent | 1 file       | Trivial    |
| B11 | capital-plan-draft.ts:202,235 -- "Draft retained" over-promises; reload creates new draft instead of restoring. replaceCapitalDraft returns false silently on conflict but caller does not check                                                 | Data Lifecycle | MEDIUM   | Low       | MEDIUM       | Good      | 2 files      | Small      |
| B12 | fund-scenario-workspace.tsx (replaceCapitalDraft callsite) -- return value discarded; conflict resolution path absent                                                                                                                            | Error Path     | MEDIUM   | Low       | MEDIUM       | Good      | 1 file       | Trivial    |
| F1  | capital-planning-v2.ts:127-134 -- v2 lifetimeFees recomputed as additive rate*months/12 vs admission quarterly engine. Step-down tiers or quarter-boundary rounding diverges, permanently refuses v2 calculation with SOURCE_BUNDLE_INCONSISTENT | Assumption     | MEDIUM   | Low       | MEDIUM       | Good      | 1 file       | Medium     |
| F2  | deal-pipeline-service.ts (bulkUpdateStatus) -- no optimistic lock; audit title uses stale prior status from SELECT before UPDATE                                                                                                                 | Assumption     | MEDIUM   | Low       | MEDIUM       | Good      | 1 file       | Small      |
| F3  | deal-pipeline-service.ts (importDeals) -- skip_duplicates blind to in-payload dupes; no unique index on (fund_id, company_name); TOCTOU between check and insert                                                                                 | Boundary       | MEDIUM   | Low       | MEDIUM       | Marginal  | 2 files      | Medium     |
| F4  | deal-pipeline-service.ts (listDeals) -- pagination with non-default sort: hasMore true but nextCursor null. Client loops page 1                                                                                                                  | Boundary       | MEDIUM   | Low       | MEDIUM       | Good      | 1 file       | Small      |
| F5  | capital-planning-v1.ts:1112 -- JSON.stringify key-order equality for resolvedBenchmarks. structuredClone preserves order today but resolver key reordering would reject valid saved benchmarks                                                   | Assumption     | LOW      | Low       | LOW          | Marginal  | 1 file       | Trivial    |

## Detailed Findings

### B1: Import abort cascade with cached fictitious success (CRITICAL)

**File:** server/services/deal-pipeline-service.ts:641-656 **Lens:** Error Path
(5)

`importDeals` wraps each row insert in a per-row try/catch inside the
request-scoped RLS transaction. When any row fails (constraint violation, type
error), Postgres aborts the entire transaction (error code 25P02 "in failed
transaction block"). Subsequent row inserts silently fail. The response reports
`imported: N` (N = rows attempted before the first error plus the errored row),
but the transaction is already aborted and will be rolled back by
`protectedRLSTransaction` in `server/middleware/with-rls-transaction.ts:67`.
However, `with-rls-transaction` only checks `res.statusCode >= 400` to decide
rollback; the handler returns 200 with the fictitious count. The idempotency
middleware at `server/middleware/idempotency.ts:398-417` then caches this 200
response for 5 minutes, making the fictitious success durable across retries.

**Trigger:** Import a CSV where row N has a constraint violation (e.g.,
duplicate company in same fund if a partial unique index existed, or a type
coercion failure). **Consequence:** Zero rows persisted, client shows "N
imported successfully," retries serve cached lie for 5 minutes. **Mitigant:**
None. No unique constraint on (fund_id, company_name) currently exists, reducing
constraint-violation likelihood but not type-error paths.

### B2: Bulk operation abort cascade (CRITICAL)

**File:** server/services/deal-pipeline-service.ts:698-720, 758-780 **Lens:**
Error Path (5)

`bulkUpdateStatus` and `bulkArchive` use the same per-item try/catch inside the
request-scoped transaction. Same 25P02 abort semantics as B1: first failing item
kills the tx, remaining items silently fail, response reports partial success.

**Trigger:** Bulk status update where one deal has been concurrently deleted or
modified. **Consequence:** Zero updates persisted, partial success reported,
activity rows for "successful" items orphaned.

### B3: Pending recompute command blocks fund activation permanently (CRITICAL)

**File:** server/services/current-forecast-shadow-trigger.ts:452-565,
server/services/current-forecast-reference-service.ts:566-591 **Lens:** State
Machine (2)

When a manual recompute command is created (status `pending` at :514), fund
activation is blocked by the contamination check at reference-service.ts:566-591
which queries for `status = 'pending'` commands. The stale_pending recovery path
at shadow-trigger.ts:549-565 only fires when a NEW claim attempt discovers the
stale row. If no new recompute is requested after the worker crashes or is
killed (Railway restart, BullMQ lockDuration exceeded), the pending row persists
indefinitely. No background sweep exists to transition orphaned pending commands
to failed.

**Trigger:** Worker process killed mid-recompute (Railway deploy, OOM,
lockDuration exceeded) with no subsequent manual recompute request for that
fund. **Consequence:** Fund activation permanently blocked. Only manual DB
intervention resolves it. **Mitigant:** 5-user internal tool; manual
intervention feasible but not discoverable without checking the table directly.

### B4: Import preview cross-fund data oracle (HIGH)

**File:** server/routes/deal-pipeline.ts:634,
server/services/deal-pipeline-service.ts:565 **Lens:** Boundary (3)

The import preview endpoint accepts `fundId` as optional. When omitted, no
`enforceProvidedFundScope` guard runs and no `requireTeamWrite` check applies.
The `deal_opportunities` table is NOT listed in the RLS migration policies. A
user authenticated to Fund A can preview-import a CSV and see duplicate-check
results against Fund B company names and deal IDs.

**Trigger:** Authenticated user calls import preview without fundId parameter.
**Consequence:** Cross-fund company name and deal ID disclosure. Not a write
path -- preview only -- but information leakage across fund boundaries.
**Mitigant:** 5-user internal tool; all users currently have access to all
funds. Risk increases if fund-scoped access control is added without revisiting
this endpoint.

### B5: Timeseries grid date matching and setMonth overflow (HIGH)

**File:** server/services/performance-calculator.ts:36-67, 231-343 **Lens:**
Time (6), Boundary (3)

`generateDatePoints` creates a date grid anchored at `startDate` (passed from
the dashboard as today-minus-N). `buildTimeseries` at :231-343 matches DB
`fundMetrics` rows to grid points via exact Map key lookup. Metrics whose
`metricDate` does not land exactly on a grid date are invisible -- shown as
"unavailable" or interpolated.

Additionally, `setMonth` on day 29-31 overflows into the next month (e.g., Jan
31 + 1 month = March 3 in non-leap years), causing grid dates to drift and
creating duplicate/missing months.

**Trigger:** `PerformanceDashboard.tsx` `getDateRange('3m')` on any day-of-month
that does not match metric snapshot dates. **Consequence:** Dashboard shows
empty or interpolated values where actual metrics exist in the database.
**Mitigant:** Prod `fund_metrics` table is currently empty. Bug becomes live
when metrics are populated. **Blast radius:**
server/services/performance-calculator.ts + client getDateRange. Callers:
performance-api.ts:299 via mount-common-routes.ts:83 (both Vercel and Docker
surfaces).

### B6: Status change without audit trail (HIGH)

**File:** server/services/deal-pipeline-service.ts:164, 345-361 **Lens:** Data
Lifecycle (4)

The PUT endpoint for deal updates can change `status` without creating an
activity row. Activity creation is a separate concern from the update path. A
user changing a deal from "screening" to "due_diligence" via the PUT endpoint
bypasses the activity log entirely. Distinct from the already-tracked M5 finding
which covers a different audit gap.

**Trigger:** Any deal status change via the PUT update endpoint.
**Consequence:** Status transitions not recorded in activity history. Audit
trail incomplete.

### B7: Idempotency middleware is a no-op on 6 mutation routes (HIGH)

**File:** server/routes/deal-pipeline.ts:317, 378, 417, 529, 725, 764 **Lens:**
Error Path (5)

Six deal-pipeline mutation routes mount the `idempotent` middleware. However,
`getIdempotencyKey` at server/middleware/idempotency.ts returns `undefined` when
the request lacks an `Idempotency-Key` header. The middleware then calls
`next()` without protection. `shouldAutoGenerateKey` only covers `/api/funds`,
`/api/simulations`, `/api/transactions`, and `/api/payments` -- deal-pipeline
routes are excluded. No client code sends the header.

**Trigger:** Every mutation request to these 6 routes. **Consequence:** Zero
idempotency protection despite middleware presence. Network retries or
double-clicks can create duplicate records. **Mitigant:** Internal 5-user tool
with low request volume.

### B8: No stage-transition validation (HIGH)

**File:** server/services/deal-pipeline-service.ts:408-417 **Lens:** State
Machine (2)

Stage transitions are validated only against enum membership (is the new stage a
valid enum value?) but not against transition rules (is the transition from
current stage to new stage valid?). Transitions like closed-to-screening or
due_diligence-to-lead are accepted.

**Trigger:** Bulk status update or direct PUT with an illogical stage
transition. **Consequence:** Deals can move to arbitrary pipeline stages,
bypassing intended workflow. Activity history records the transition faithfully
but the transition itself is invalid.

### B9: normalizeRaw treats array strings as decimals (HIGH)

**File:** client/src/components/scenarios/capital-plan-draft.ts:455-462
**Lens:** Assumption (1)

`normalizeRaw` recursively processes input values. When it encounters an array,
it maps each element through normalizeRaw. String elements in arrays are treated
as decimal candidates, matching the same coercion path as scalar string fields.
For `by-history` eligibility inputs that contain string arrays (e.g., lists of
round names), each string is passed to the decimal parser, producing NaN or 0,
making the eligibility path unusable.

**Trigger:** Capital plan variant using by-history eligibility with array-typed
input fields. **Consequence:** Eligibility calculation receives garbage numeric
values; plan produces incorrect results silently.

### B10: Save intent locks modal permanently on ZodError (HIGH)

**File:** client/src/components/scenarios/capital-plan-draft.ts:67-74, 235, 673
**Lens:** State Machine (2)

When a save attempt throws a ZodError (contract validation failure), the catch
block at :673 sets the "draft retained" message but does not clear
`intent.current`. The `saveIntents` Map retains the truthy entry, and subsequent
save attempts at :235 see `intent.current` as truthy and skip the save. The
modal is permanently locked until page reload.

**Trigger:** Invalid capital plan input that passes client-side form validation
but fails server contract validation. **Consequence:** Modal save button becomes
permanently non-functional. User must reload the page and re-enter data.

### B11: Draft retention over-promises (MEDIUM)

**File:** client/src/components/scenarios/capital-plan-draft.ts:202, 235
**Lens:** Data Lifecycle (4)

The error message "Your draft is retained" at :673 implies the draft will
survive a page reload. However, drafts are stored in an in-memory Map. On
reload, the draft is lost. If the user follows the implied guidance and reloads
to clear the locked state (B10), they lose their work.

**Trigger:** ZodError on save, followed by page reload as recovery.
**Consequence:** Data loss. User re-enters all draft data.

### B12: replaceCapitalDraft return value discarded (MEDIUM)

**File:** client/src/pages/fund-scenario-workspace.tsx (callsite),
client/src/components/scenarios/capital-plan-draft.ts:202 **Lens:** Error Path
(5)

`replaceCapitalDraft` returns a boolean indicating success or conflict. The
callsite in fund-scenario-workspace.tsx discards this return value. When the
function returns false (concurrent draft exists), the caller does not know the
replace failed.

**Trigger:** Two browser tabs editing capital plans for the same fund
simultaneously. **Consequence:** Second tab's draft silently lost. No user
feedback.

## Fragile Code

### F1: v2 fee recomputation divergence (MEDIUM)

**File:** shared/lib/capital-planning/capital-planning-v2.ts:127-134

V2 recomputes `lifetimeFees` as additive `rate * months / 12` and refuses
(`SOURCE_BUNDLE_INCONSISTENT`) if the result does not match the admission's
`computeFeeBasisTimeline` (quarterly engine) output. Any fee tier configuration
where the two methods produce different results (step-down tiers,
quarter-boundary rounding) makes v2 permanently uncalculable.

Fail-closed -- no wrong numbers produced. Contract tests exist. Monitor for
support tickets reporting v2 calculation refusals.

### F2: Bulk status no optimistic lock (MEDIUM)

**File:** server/services/deal-pipeline-service.ts (bulkUpdateStatus)

Bulk status update reads current status via SELECT, then UPDATEs without
checking the status has not changed. Audit activity title uses the stale prior
status from the read. Concurrent modifications produce incorrect audit entries.

### F3: Import duplicate detection TOCTOU (MEDIUM)

**File:** server/services/deal-pipeline-service.ts (importDeals)

`skip_duplicates` is blind to duplicates within the same import payload. No
unique index on `(fund_id, company_name)` exists to catch them at the DB level.
The existence check and insert are not atomic -- concurrent imports can both
pass the check.

### F4: Pagination cursor null on non-default sort (MEDIUM)

**File:** server/services/deal-pipeline-service.ts (listDeals)

When using a non-default sort order, `hasMore` can be true but `nextCursor`
null. Client enters an infinite loop re-requesting page 1.

### F5: JSON.stringify key-order equality for benchmarks (LOW)

**File:** shared/lib/capital-planning/capital-planning-v1.ts:1112

`JSON.stringify(resolvedBenchmarks.input) !== JSON.stringify(input)` uses
key-order-dependent string comparison. `structuredClone` preserves order today,
but any resolver refactor that reorders keys would reject valid saved
benchmarks. Benign currently.

## Already Guarded (OK)

Items verified as correctly guarded during analysis:

- **publish:996** -- `asOfDate` is drizzle date() string mode; string < string
  ISO comparison correct
- **publish:1213/1276** -- `canonicalEconomicFields!` guarded by status='valid'
  requiring non-null rowContentHash
- **publish:1082** -- PREFLIGHT_DATABASE_REACHED symbol identity preserved;
  preview service does not wrap thrown errors
- **publish:3061** -- COMMIT-time retry without oracle safe for serialization
  failures
- **publish:2929** -- reconciliation oracle correctly serializes via advisory
  xact lock
- **publish:2302** -- vehicles.length !== 1 rejection intentional pilot
  limitation
- **publish:2986** -- release(destroy) heuristic conservative; app errors have
  .code string
- **preview:329** -- moneyToCents negative sign unreachable;
  ACTUALS_PILOT_MONEY_PATTERN forbids sign
- **preview:73** -- isCentExactMoney fraction validation correct
- **core:682/698** -- rate() refuses > 1 and < 0 before commitmentPct used
- **core:1416-1423** -- find()! assertions safe; construction built from same
  inputs in same pipeline
- **v1:216** -- contract superRefine forces financing data for all rounds
- **v1:371** -- deploymentPeriodYears validated as int >= 1
- **v1:277** -- initialCheckUsd via CapitalPositiveMoneyV1Schema > 0
- **v2:642** -- refineInput forces pool share sum == 1; no div-by-zero
- **v2:302** -- poolOwnership >= 1 refused before division
- **portfolio-overview** -- null propagation clean; averageMOIC guards correct
- **attribution** -- totalValue null skips persist (NOT NULL column protection)
- **variance-alert-automation** -- leader election atomic; claim SKIP LOCKED;
  timers cleared on stop
- **terminal-head** -- supersedes_unique constraint prevents fork
- **pdf completeness** -- Number.isFinite treats null as missing correctly
- **position-value** -- null propagation post-#1549 correct

### Already Tracked (excluded from this report)

These findings are documented in prior bug-echo reports or the handoff plan and
are NOT re-reported:

- C1: CohortEngine Math.random() projections (fixed in #1544)
- M1-M5: Missing Idempotency-Key on various mutation routes (bug-echo CR_w9)
- m3: Minor findings from prior scans
- AddDealModal / ImportDealsModal missing Idempotency-Key header (bug-echo)
- Seven randomUUID client-side drift instances (bug-echo)
- Playwright pipeline project configuration (bug-echo)

## Needs Human Review

### R1: anyNullValuation includes exited companies

**File:** server/services/fund-metrics-calculator.ts:117

`anyNullValuation` spans ALL companies including exited/liquidated. One
written-off company with null `currentValuation` nulls totalValue/MOIC/TVPI/IRR
fund-wide permanently. PR #1549 chose fund-wide null propagation deliberately.
Whether exited-company residual should be treated as 0 instead of null is a
data-model decision for the fund owner.

Test coverage only covers the active-company case
(fund-metrics-calculator.test.ts:108-116).

### R2: Zero invested with positive value produces MOIC 0

**File:** server/services/fund-metrics-calculator.ts:149

`totalInvested == 0` with `totalValue > 0` produces `moic = 0` (0x shown instead
of "unavailable"). Minor; pre-existing convention. Owner should confirm whether
"unavailable" is more appropriate.

### R3: Policy 1.4 restatement purge ceiling

**File:**
server/services/lp-reporting/actuals-pilot-publish-service.ts:1731-1802

After `purge_after` (90 days), if a purge job nulls the payload, restatement of
v5-era basis permanently returns 409 EFFECTIVE_BASIS_INVALID. Likely intentional
evidence-retention rule but confirmation needed.

### R4: restoreRawFacts array holes

**File:** shared/lib/capital-planning/source-materialization-core.ts:1749

Elements with zero present leaves produce holes (undefined entries) in restored
arrays. Valid configurations cannot produce leafless elements per schema
requirements, but edge cases in corrupted saved data could trigger this. Low
risk.

### R5: Import preview duplicate-name Map collapse

**File:** server/services/deal-pipeline-service.ts (previewImport)

Preview duplicate detection uses a Map keyed by company name. Two CSV rows with
the same company name collapse to one Map entry, potentially hiding true
duplicates from the preview. Low impact -- preview only, not the import path.

## Phased Implementation Plan

### Phase 1: Data Integrity (CRITICAL) -- target: 1-2 days

| Finding | Fix                                                                                                                                                                                                                     | Effort |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| B1      | Move per-row error handling outside the transaction boundary. Validate all rows before beginning the transaction, or use savepoints for per-row isolation. Update idempotency to not cache error-masked 200s            | Small  |
| B2      | Same pattern as B1 for bulkUpdateStatus/bulkArchive                                                                                                                                                                     | Small  |
| B3      | Add a background sweep (cron or startup hook) that transitions pending commands older than 2x lockDuration to `failed` with failureCode `orphaned_pending`. Alternatively, have activation check use a staleness window | Small  |

### Phase 2: Security and Audit (HIGH) -- target: 1-2 days

| Finding | Fix                                                                                                                                  | Effort  |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| B4      | Make fundId required on import preview route. Add requireTeamWrite guard. Consider adding deal_opportunities to RLS policy migration | Small   |
| B6      | Create activity row on every status change in the PUT path, same pattern as the dedicated status-change endpoint                     | Trivial |
| B7      | Extend shouldAutoGenerateKey to cover /api/deal-pipeline routes, or have the client send the header                                  | Small   |
| B8      | Add a VALID_TRANSITIONS map and validate current-to-new stage transitions. Reject invalid transitions with 422                       | Small   |

### Phase 3: UX and Client Reliability (HIGH/MEDIUM) -- target: 1 day

| Finding | Fix                                                                                                                            | Effort  |
| ------- | ------------------------------------------------------------------------------------------------------------------------------ | ------- |
| B9      | Add Array.isArray guard in normalizeRaw before decimal coercion. Return arrays as-is or recurse elements only for object types | Trivial |
| B10     | Clear intent.current in the catch block at capital-plan-draft.ts:673                                                           | Trivial |
| B11     | Remove "draft retained" message or implement localStorage persistence for drafts                                               | Small   |
| B12     | Check replaceCapitalDraft return value and show conflict toast                                                                 | Trivial |

### Phase 4: Fragile Code Hardening (MEDIUM/LOW) -- target: optional, as bandwidth allows

| Finding | Fix                                                                                     | Effort  |
| ------- | --------------------------------------------------------------------------------------- | ------- |
| F1      | Document the divergence risk in ADR. Add a contract test with step-down fee tiers       | Medium  |
| F2      | Add optimistic locking (version column or WHERE status = prior_status) to bulk update   | Small   |
| F3      | Add unique index on (fund_id, company_name) or deduplicate within payload before insert | Medium  |
| F4      | Fix cursor generation for non-default sort orders                                       | Small   |
| F5      | Replace JSON.stringify comparison with deep-equal utility                               | Trivial |

### Phase 5: Human Review Items -- target: owner decisions

- R1: Decide exited-company null-valuation policy. Expand test coverage
  regardless of decision
- R2: Confirm zero-invested MOIC display convention
- R3: Confirm 90-day purge ceiling is intentional
- R4: Low risk, monitor only
- R5: Low impact, fix if import preview is expanded

## Methodology Notes

- All files read in full before analysis (no grep-only findings)
- Verification rule enforced: 30-line window, guard check, reachability, blast
  radius for every candidate
- Three subagents dispatched in parallel for files exceeding main-thread budget
  (deal-pipeline: 8 files, capital-plan modal: 3 files, BullMQ workers: 5 files)
- Subagent findings verified against source code via direct reads of
  with-rls-transaction.ts, idempotency.ts, deal-pipeline routes, RLS migration,
  and current-forecast services
- Platform context: web application (TypeScript), no platform-divergence lens
  findings (Lens 7 not applicable to this stack; translated per handoff plan to
  dual-surface Vercel/Docker divergence analysis)
