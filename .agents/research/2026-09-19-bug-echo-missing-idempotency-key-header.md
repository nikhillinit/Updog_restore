# bug-echo Report: client caller omits the Idempotency-Key a server route now requires

**Date:** 2026-09-19

**Pattern source:** user-described. Derived from the verified Critical finding
C1 in `docs/3-code-review/CR_w9_v1.6.0_codebase-audit.md` (the Add Company
dialog posts without the header that #1535 made mandatory). No fix commit exists
yet, so inferred-from-diff mode did not apply; the pattern was written out from
the verified site instead.

**Scan tool:** regex via Grep, plus a small Node join script run through Bash
that paired every server header-read site with every client mutation call site
(the pattern is a two-sided join, not a single substring).

**Files scanned:** all `*.ts` under `server/routes/` (82 files) and all non-test
`*.ts` / `*.tsx` under `client/src/` (822 files).

**Pattern validated against pre-fix file:** n/a for user-described. The pattern
was independently confirmed against the original site
(`client/src/components/portfolio/tabs/AddCompanyDialog.tsx:89` versus
`server/routes/portfolio-companies.ts:293`) and against the CI failure signature
on `main` (`400 IDEMPOTENCY_KEY_REQUIRED` at
`tests/integration/portfolio-activity-routes.test.ts:103`).

**Recon scout:** 30 client production call sites target a key-required route
(bucket: 6+, full report). 0 already-swept (no prior `bug-echo:` commits in
history, gate closed). The count is above the 25-site tighten threshold, but the
pattern is an exact route join rather than a name match, so the breadth is the
real sweep and no tightening was applied.

**Scan strategy note:** the tree exceeds the 500-file sub-agent threshold, but
the join resolves with three targeted greps plus one script, so it ran in the
main agent; batching by file would have added nothing.

**Rating glyphs:** this repository forbids emoji in committed files
(`CLAUDE.md`, pre-commit hook), so the six rating dimensions use their text
labels only. Semantics are unchanged.

**Output directory:** `.agents/research/` (default; tracked in git).

---

## Pattern

**Condition 1:** a server route rejects the request before its handler when
`Idempotency-Key` is absent. Two enforcement shapes exist: the
`requireIdempotencyKey` middleware (`server/middleware/idempotency.ts:481-494`,
`400 IDEMPOTENCY_KEY_REQUIRED`) and an inline read of the header followed by a
400 or 428 when it is missing (for example `portfolio-companies.ts:170-174`,
`operating-object-tasks.ts:57-61`, `internal-analysis.ts:219-226`).

**Condition 2:** a client call site sends a mutating request (POST, PUT, PATCH,
DELETE) to that route through `apiRequest`, `fetch`, or `contractFetch`.

**Condition 3:** the call site passes no `Idempotency-Key` (or
`X-Idempotency-Key`) header, and nothing on the path injects one
(`client/src/lib/queryClient.ts:94-107` adds only `Content-Type` plus caller
headers).

**Consumer impact:** the request never reaches the handler. The UI action fails
with a generic 400, and because the failure is on the server contract rather
than in the form, no client-side validation explains it.

**Anti-pattern:** `apiRequest('POST', '/api/<key-required route>', payload)`
with no fourth argument.

**Correct pattern:** derive a key per logical operation and send it:
`apiRequest('POST', url, payload, { headers: { 'Idempotency-Key': key } })`,
where `key` comes from the shared `useIdempotencyKey()` hook so a retry of the
same payload reuses the key and a changed payload mints a new one.

**Search scope:** `server/routes/**/*.ts` for Condition 1;
`client/src/**/*.{ts,tsx}` (non-test) for Conditions 2 and 3; `tests/**` was
also swept for test-code echoes and reported separately.

---

## Summary

- BUG findings: 3 production call sites, plus 1 test-code echo (3 posts in one
  file) reported in its own table
- WATCH findings: 3
- OK findings: 27 client sites that send the key correctly, plus 12 key-required
  routes that have no client caller
- REVIEW findings: 2 generic request wrappers that cannot be resolved statically

**Reference implementation:** `client/src/hooks/useIdempotencyKey.ts:20`
(`useIdempotencyKey().keyFor(payload)`), used exactly as the BUG sites should
use it at `client/src/hooks/useTasks.ts:56-66` (create) and
`client/src/hooks/useDecisions.ts:96-102` (create). This codebase already solves
the pattern here: a stable key per logical operation, a fresh key when the
payload changes, `reset()` on success. The findings below should converge on it
rather than each inventing a key generator.

All three production BUG sites are call sites whose server route gained
`requireIdempotencyKey` in `08cf1e8` (#1535, merged 2026-09-17 08:38 UTC)
without the matching client change. The two other client sites hardened in the
same PR (`company-metadata-drawer.tsx:135` and the task and decision hooks) were
updated; these three were missed.

---

## BUG Findings

### Issue Rating Table

| #   | Finding                                                                                                                                     | Urgency | Risk: Fix | Risk: No Fix | ROI       | Blast Radius | Fix Effort | Status |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------- | --------- | ------------ | --------- | ------------ | ---------- | ------ |
| 1   | Add Deal modal posts to `POST /api/deals/opportunities` with no key; the route requires one, so creating a deal from the pipeline page 400s | HIGH    | Low       | High         | Excellent | 1 file       | Trivial    | Open   |
| 2   | Import Deals modal confirm step posts to `POST /api/deals/opportunities/import` with no key; preview succeeds, then the import 400s         | HIGH    | Low       | High         | Excellent | 1 file       | Trivial    | Open   |
| 3   | Add Company dialog posts to `POST /api/portfolio-companies` with no key (the original C1 site; listed for completeness)                     | HIGH    | Low       | High         | Excellent | 1 file       | Trivial    | Open   |

Confidence for all three is `verified`: the remedy is the shared hook already
running in production in sibling hooks, so each fix is propagation, not design.
Risk of fixing and fix effort are rated against copying the reference.

### Detailed findings

**1. Add Deal modal sends no Idempotency-Key**

`client/src/components/pipeline/AddDealModal.tsx:131`

```ts
return apiRequest<{ success: boolean; data: unknown }>(
  'POST',
  '/api/deals/opportunities',
  payload
);
```

Server side, `server/routes/deal-pipeline.ts:153-157`:

```ts
router['post'](
  '/opportunities',
  requireTeamWrite,
  requireIdempotencyKey,
  idempotent,
```

**Why this is a bug:** `requireIdempotencyKey` returns
`400 IDEMPOTENCY_KEY_REQUIRED` before the handler runs, so every submit of the
Add Deal form fails on any deployment of `main` at or after `08cf1e8`. The
router is mounted at `/api/deals` on both assemblies
(`server/routes/mount-common-routes.ts:103`), so the Vercel `makeApp` surface
and the Docker `createServer` surface are both affected. The unit test
`tests/unit/components/pipeline/add-deal-modal.test.tsx:100` mocks `apiRequest`
and asserts only method, URL and body, so it cannot see the missing header. The
Playwright `pipeline` project (`pipeline-management.spec.ts` "add deal modal
opens and submits successfully") submits the real form against a real server and
would catch this, but CI runs only the `smoke` project
(`.github/workflows/ci-unified.yml:367-368`).

**Suggested fix:** mirror `client/src/hooks/useTasks.ts:56-66`: call
`useIdempotencyKey()` in the component, pass
`{ headers: { 'Idempotency-Key': idempotencyKey.keyFor(payload) } }` as the
fourth `apiRequest` argument, and call `reset()` in `onSuccess`. Extend the unit
test to assert the fourth argument carries the header.

---

**2. Import Deals modal confirm step sends no Idempotency-Key**

`client/src/components/pipeline/ImportDealsModal.tsx:159`

```ts
return apiRequest<{ success: boolean; data: ImportResult }>(
  'POST',
  '/api/deals/opportunities/import',
  { rows: parsedRows, fundId, mode }
);
```

Server side, `server/routes/deal-pipeline.ts:677-681` registers
`/opportunities/import` with `requireIdempotencyKey`.

**Why this is a bug:** the preview call two mutations earlier
(`ImportDealsModal.tsx:137`, `POST /opportunities/import/preview`,
`deal-pipeline.ts:623`) has no key requirement and succeeds, so the user sees a
valid preview and then a failed import with no field-level explanation. Same
merge, same surfaces, same missing test coverage as finding 1.

**Suggested fix:** same as finding 1, keyed on `{ parsedRows, fundId, mode }` so
a retry of the same import reuses the key and the server's `idempotent` replay
engages instead of re-inserting rows.

---

**3. Add Company dialog sends no Idempotency-Key (original site)**

`client/src/components/portfolio/tabs/AddCompanyDialog.tsx:89`

```ts
      apiRequest('POST', '/api/portfolio-companies', {
        fundId,
        name: values.name,
```

Server side, `server/routes/portfolio-companies.ts:289-293`.

**Why this is a bug:** recorded as C1 in the w9 audit; included here so the
three fixes land as one shape.
`tests/unit/components/portfolio/add-company-dialog.test.tsx:107` has the same
blind spot as the deal modal test.

**Suggested fix:** same as finding 1.

---

### Test-code echo (same shape, keeps CI red)

| #   | Finding                                                                                                                                | Urgency | Risk: Fix | Risk: No Fix | ROI       | Blast Radius | Fix Effort | Status |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ------- | --------- | ------------ | --------- | ------------ | ---------- | ------ |
| 4   | `tests/integration/portfolio-activity-routes.test.ts` posts to `/api/portfolio-companies` three times with no key (lines 95, 127, 141) | HIGH    | Low       | High         | Excellent | 1 file       | Trivial    | Open   |

**Why this matters:** line 95 is the assertion currently failing on every `main`
push (expects 201, receives 400). Lines 127 and 141 expect a 400 with
`error: 'Invalid company data'`; today they would receive
`IDEMPOTENCY_KEY_REQUIRED` instead, so they fail as soon as line 95 is fixed.
All three need `.set('Idempotency-Key', ...)` in the same change, or the CI lane
turns red again one assertion later.

---

## WATCH Findings (near-threshold, defensive only)

### Issue Rating Table

| #   | Finding                                                                                                                                                 | Urgency | Risk: Fix | Risk: No Fix | ROI  | Blast Radius | Fix Effort | Status |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | --------- | ------------ | ---- | ------------ | ---------- | ------ |
| 5   | The only end-to-end test that submits the Add Deal form (`pipeline` Playwright project) is not part of the CI e2e job, which runs `smoke` only          | MEDIUM  | Low       | Medium       | Good | 1 file       | Small      | Open   |
| 6   | Seven local key generators exist beside the shared hook; new call sites copy whichever one is nearest, which is how the three BUG sites were missed     | LOW     | Low       | Low          | Good | 7 files      | Small      | Open   |
| 7   | `portfolio-companies-makeapp-surface.contract.test.ts:140` posts without a key and asserts only "not 401 or 404", so a key rejection reads as reachable | LOW     | Low       | Low          | Good | 1 file       | Trivial    | Open   |

### Detailed findings

**5. The catching test exists but does not run in CI**

`.github/workflows/ci-unified.yml:367-368` runs `npm run test:e2e:smoke`, which
is `playwright test --project=smoke` (`playwright.config.ts:66-75`). The
`pipeline` project (`playwright.config.ts:93-99`) contains
`tests/e2e/pipeline-management.spec.ts:32-50`, which fills and submits the Add
Deal form against a real server with no route mocks
(`tests/e2e/page-objects/PipelinePage.ts` has no `page.route`).

**Why this is WATCH not BUG:** the test is correct; the gap is that the CI
selection excludes it, so a client-server contract break on the pipeline page is
invisible until a human clicks. **Suggested fix (defensive):** add the
`pipeline` project to the CI e2e step, or add an `apiRequest` header assertion
to the unit tests of every component that targets a key-required route.

**6. Seven drifted copies of the key generator**

Local generators: `usePlanningFmvOverrides.ts:16`,
`CreateAllocationScenarioModal.tsx:200`,
`CreateMethodologyScenarioModal.tsx:93`, `ActualsPublicationPanel.tsx:118`,
`pages/lp-reporting/imports.tsx:96`, `company-metadata-drawer.tsx:47`, and the
inline `withIdempotency` closure at `useInternalNarratives.ts:68`. Each is a
one-line `crypto.randomUUID()` wrapper; none reuses the key across a retry of
the same payload the way the shared hook does.

**Why this is WATCH not BUG:** every one of them does send a key, so the server
contract holds. The risk is drift: a retry after a network error mints a new key
at these sites, so the server's duplicate protection does not engage, and the
next author who copies a nearby pattern has a one-in-eight chance of copying the
shared hook. **Suggested fix (defensive):** migrate the seven to
`useIdempotencyKey()` when their files are next touched, and add a one-line
comment at `useIdempotencyKey.ts:20` naming it as the reference.

**7. A reachability test that cannot distinguish key rejection**

`tests/unit/routes/portfolio-companies-makeapp-surface.contract.test.ts:137-146`
sends `{}` with no key and asserts the status is not 401 or 404. It passes today
because the 400 from `requireIdempotencyKey` satisfies that predicate.
**Suggested fix (defensive):** either send the key and assert the body
validation 400, or assert the `IDEMPOTENCY_KEY_REQUIRED` code explicitly so the
test documents the contract it is passing through.

---

## OK Findings (intentional, no action needed)

Client sites that target a key-required route and send the header:

- `client/src/components/portfolio/company-metadata-drawer.tsx:115-135` - PATCH
  `/api/portfolio-companies/:id`; local `randomIdempotencyKey()` held in a ref
  across retries
- `client/src/components/portfolio/tabs/hooks/usePlanningFmvOverrides.ts:63` -
  POST `/planning/fmv-overrides`; local generator
- `client/src/hooks/useDecisions.ts:100`, `:177`, `:203` - decisions create,
  supersede, evidence-links; shared hook (`OK (CANON)` usage shape)
- `client/src/hooks/useTasks.ts:62`, `:106`, `:140` - tasks create, update,
  evidence-links; shared hook (`OK (CANON)` usage shape)
- `client/src/components/fund-results/WorkspaceContextRail.tsx:646-650` - POST
  `/current-forecast/recompute`; shared hook
- `client/src/hooks/useCurrentPlanVersions.ts:36` - POST
  `/current-plan-versions`
- `client/src/hooks/useCreateRound.ts:24` - POST `/investments/:id/rounds`
- `client/src/hooks/useVarianceData.ts:53` - POST
  `/construction-reconciliation/runs`
- `client/src/lib/fund-scenario-reserve-command.ts:68` - POST
  `/scenario-sets/:id/calculate-reserve`; durable command runner
- `client/src/lib/fund-scenario-workspace-api.ts:89` - POST
  `/companies/:id/scenarios`
- `client/src/components/scenarios/ScenarioFactsSeedPicker.tsx:408-415` - POST
  `/cases/from-seed`
- `client/src/hooks/useInternalAnalysis.ts:72`, `:98` - refresh and
  economics-reference; `commandHeaders()` at `:45` supplies key and `If-Match`
- `client/src/hooks/useQuarterlyReview.ts:169`, `:243`, `:287` - items, waiver,
  save; `commandHeaders()` at `:137`
- `client/src/hooks/lp-reporting/useActualsPublish.ts:34`,
  `useActualsRestatement.ts:314`, `useImportBatchReconciliation.ts:86`,
  `client/src/components/lp-reporting/ActualsDraftHistory.tsx:155-160` - actuals
  publish, restatement publish, batches, draft-revisions

Client sites that omit the header on routes where the key is optional (not
matches of Condition 1; listed because the first pass flagged them):

- `client/src/pages/fund-scenario-workspace.tsx:124` (calculate) and `:158`
  (reserve-optimization), `client/src/lib/fund-scenario-workspace-api.ts:214`
  (archive) - `fund-scenario-sets.ts:135-140` reads the key as optional and
  calculate and archive never read it
- `client/src/hooks/useDealDragDrop.ts:78` (`/deals/:id/stage`),
  `client/src/pages/pipeline.tsx:503`, `:521` (bulk status, bulk archive) -
  `idempotent` middleware only, key optional (`deal-pipeline.ts:417`, `:721`)
- `client/src/hooks/useDecisions.ts:122` (PATCH) and `:149` (outcome) -
  `operating-object-decisions.ts:229`, `:275` do not read the key
- `client/src/hooks/useInternalNarratives.ts:99`, `:114` - send a key, but
  `internal-analysis.ts:829`, `:872` do not require one
- `client/src/components/pipeline/ImportDealsModal.tsx:137` - preview route
  (`deal-pipeline.ts:623`) has no key requirement

Key-required routes with no client caller at all (server-only or admin; no echo
possible today, but any future client caller must send the key):

- `server/routes/fund-moic.ts:181`, `:485`, `:534`, `:615`
- `server/routes/financial-facts.ts:104`
- `server/routes/kpi-observations.ts:209`, `:254`
- `server/routes/internal-economics.ts:143`
- `server/routes/investment-ledger.ts:261-455` (seven routes through
  `parseIdempotencyKey`)
- `server/routes/current-forecast.ts:305`, `:382`, `:439`, `:485`
- `server/routes/lp-reporting/imports.ts:668` (mapping-profiles)

Test code that posts without a key on purpose:

- `tests/unit/routes/deal-pipeline.contract.test.ts:684-705` - asserts
  `IDEMPOTENCY_KEY_REQUIRED`; this is the contract test for the guard
- `tests/api/deal-pipeline.test.ts` - every post sets the header

---

## REVIEW Findings (need human judgment)

- `client/src/lib/index.ts:23` and `client/src/lib/resilient-api-client.ts:187`
  - generic POST wrappers that take the URL as a parameter; whether any caller
    routes a key-required path through them cannot be decided statically. No
    caller found in this sweep does, so they are listed only so the next sweep
    knows they were considered.

---

## Cross-cutting observations

1. **The three BUG sites and the one green sibling came from the same PR.**
   `08cf1e8` (#1535) added `requireIdempotencyKey` to four routes and updated
   one client caller (`company-metadata-drawer.tsx`). The failing integration
   test on `main` is the only automated signal, and the pull-request gate does
   not run that lane (audit finding M2).
2. **The codebase has two idempotency-key idioms.** Command-style hooks (tasks,
   decisions, recompute) use `useIdempotencyKey()`; dialog-style components use
   a local `crypto.randomUUID()` wrapper. Only the first reuses the key across a
   retry. The three fixes should adopt the first, and finding 6 lists where the
   second still lives.
3. **An executable invariant would have prevented all three.** A unit test that
   walks every client `apiRequest` mutation and asserts a header for every route
   the server manifest marks as key-required is the durable fix; the w9 audit
   already lists the server half of that invariant as Suggestion 1.

---

## Why no changes were made automatically

The invoking request asked for the search, not the fixes, and the three
production fixes plus the test fix belong in one small pull request with a
header assertion in each affected unit test. A guided fix session is offered in
the conversation.
