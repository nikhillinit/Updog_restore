# Phase 3 Spec Review: Codebase-Grounded Critique

Reviewed: `docs/plans/2026-03-22-phase-3-results-execution-spec.md` Date:
2026-03-22 Method: Two parallel exploration agents, direct file reads, Codex
consultation Codex session: `019d1739-85ff-73f1-9491-5d4f9bcfa4b6` (gpt-5.4,
xhigh reasoning)

**Codex independently confirmed all 7 findings with exact line references.** No
contradictions between Claude and Codex analysis. Codex added one additional
finding about `server/routes.ts` needing updates if route extraction is used.

**Post-review corrections applied:** A1 reclassified from "contradiction" to
"understated gap" (spec fact is accurate, issue is discarded invoke result). B1
hook claim corrected (hook already forwards context, no surface change needed).
B6 downgraded from missing step to recommendation (raw fetch is consistent with
existing pages). E2 redirect proposal narrowed (no server-side "latest fund"
resolution exists).

---

## A. Understated Gaps In The Spec

### A1. Spec Fact #3 is accurate but understates the implementation work

The spec's Fact #3 is correct: the machine submits to `POST /api/funds`
(`modeling-wizard.machine.ts:570`) and the route returns `data.id`
(`server/routes/funds.ts:102`). The gap is not a contradiction -- it's that the
invoke result is discarded on the `submitting.onDone` transition
(`modeling-wizard.machine.ts:1256`). The actions
`['clearProgress', 'clearSubmissionError']` run but neither captures
`event.output` into context.

The `onComplete` callback (`useModelingWizard.ts:135`) passes
`ModelingWizardContext` which does not include the API response fund ID. The
component then redirects to `/fund-model-results/latest`
(`ModelingWizard.tsx:132`) instead of using the created fund's ID.

**Impact on spec:** Batch 3B step 1 ("capture the created fund ID from the
existing POST /api/funds success payload") understates the work. It requires:

1. A new `assignCreatedFundId` action on `submitting.onDone` to persist
   `event.output.data.id` into machine context
2. The `onComplete` callback already forwards full context
   (`useModelingWizard.ts:135`), so adding `createdFundId` to
   `ModelingWizardContext` is sufficient -- the hook surface doesn't need
   changing
3. Update the redirect from `/fund-model-results/latest` to
   `/fund-model-results/${createdFundId}`

This is not a trivial "capture" -- it's an XState machine schema change.

### A2. Proposed DTO shows `source: 'snapshot' | 'projection'` for waterfall section (line 221)

**No waterfall snapshot writer exists anywhere in the codebase.** No worker
writes `type: 'WATERFALL'` to `fundSnapshots`. No projection service can produce
waterfall data without importing client engines (which the spec correctly marks
as out of scope). The `source: 'snapshot'` option for waterfall is unreachable
code in the contract.

**Fix:** Waterfall section should be typed as
`{ status: 'unavailable'; reason: string }` only -- no `available` variant in
Phase 3.

### A3. "Repo Fact #4: There is no server/routes/fund-results.ts yet"

**Correct** but the spec doesn't mention that `POST /api/funds` lives in
`server/routes/funds.ts`, not `fund-config.ts`. The spec says to mount the new
GET route "on the current authoritative runtime alongside the other fund-config
read routes" -- but the existing fund read routes are split across two files:

- `fund-config.ts`: draft/publish/reserves/state (Phase 1-2 canonical)
- `funds.ts`: POST create, GET list, calculate

The spec should explicitly state which file hosts `GET /api/funds/:id/results`.
Recommendation: `fund-config.ts` since it already owns the Phase 2B read
endpoints, maintaining the read-only route grouping pattern.

---

## B. Missing Steps The Spec Needs

### B1. XState Machine Schema Change (Batch 3B prerequisite)

The spec's Batch 3B assumes "capture the created fund ID" is a one-liner. It's
actually a machine schema change requiring:

1. Add `createdFundId: number | null` to `ModelingWizardContext` type
2. Add `assignCreatedFundId` action:
   `assign({ createdFundId: ({ event }) => event.output.data.id })`
3. Add action to `submitting.onDone.actions` array
4. Update `onComplete` callback signature or pass fund ID through separate
   channel

**Owned files not listed in Batch 3B:**

- Machine types need updating (context type definition)
- Note: the `useModelingWizard` hook already forwards full context via
  `onComplete?.(context)` at `useModelingWizard.ts:135`, so adding
  `createdFundId` to `ModelingWizardContext` is sufficient. No hook surface
  change needed.

### B2. Snapshot Payload-to-Section Transformation

The spec's DTO references `ReserveResultsSection` and `PacingResultsSection`
types but doesn't define them or acknowledge the shape mismatch.

**Actual snapshot payloads vs expected section shapes:**

| Field                   | Results Page Expects                | RESERVE Snapshot Has                           |
| ----------------------- | ----------------------------------- | ---------------------------------------------- |
| stage-level allocations | `{stage, engineAmount, userAmount}` | `{allocation, confidence, rationale}`          |
| totalReserves           | number                              | `totalAllocation` (similar but different name) |
| reserveRatio            | percentage                          | not present (needs fundSize for derivation)    |

| Field             | Results Page Expects | PACING Snapshot Has                       |
| ----------------- | -------------------- | ----------------------------------------- |
| deploymentRate    | number               | `avgQuarterlyDeployment`                  |
| yearsToFullDeploy | number               | `totalQuarters` (derivable: quarters / 4) |

Batch 3A must include defining these section types as explicit transformations
of the snapshot payloads, with mapping functions. This is non-trivial design
work that determines whether `ready` status can include reserve/pacing sections
at all.

### B3. Attribution-Filtered Snapshot Query

The spec says "loads latest attributed RESERVE and PACING snapshots for the
active published config version." The existing query pattern in
`fund-config.ts:297-300` does NOT filter by `configVersion`:

```ts
findFirst({
  where: and(
    eq(fundSnapshots.fundId, fundId),
    eq(fundSnapshots.type, 'RESERVE')
  ),
  orderBy: desc(fundSnapshots.createdAt),
});
```

Phase 3's read service needs a different query that filters by `configVersion`
to ensure snapshot freshness matches the published config. If no attributed
snapshot exists (legacy data where `configVersion` is null), the section should
fall back to `unavailable` or use `legacyEvidence: true` signaling consistent
with Phase 2B's pattern.

### B4. Page-Level Status Derivation Logic

The spec defines `status: 'pending' | 'calculating' | 'ready' | 'failed'` at the
top level but doesn't specify the derivation rules. Proposed:

- `failed` if lifecycle.calculationState.status === 'failed'
- `pending` if no calcRun exists (calculationState.status === 'not_requested')
- `calculating` if calcRun exists but snapshots incomplete
  (calculationState.status in ['submitted', 'calculating'])
- `ready` if at least one section has `status: 'available'`

The last rule is important: `ready` should not require ALL sections to be
available (the spec says this in the constraints but doesn't encode the rule).

### B5. Client Test File Placement

Batch 3B lists `tests/unit/pages/fund-model-results.test.tsx` as a new test
file. Per project memory, client tests MUST be in `tests/unit/**/*.test.tsx` --
this path is correct, but the spec should note this explicitly since the page
file itself is in `client/src/pages/`.

### B6. Data Fetching Strategy (recommendation, not validity defect)

The spec says "replace page bootstrapping with fetch from GET
/api/funds/:id/results." The codebase is mixed: some pages use TanStack Query
(e.g., `pipeline.tsx` wraps fetch inside `queryFn`), while others use raw
`fetch` directly (e.g., `shared-dashboard.tsx:91`, `ReviewStep.tsx:37`). There
is no universal convention.

TanStack Query would provide automatic refetch, loading/error states, and cache
invalidation, but raw `fetch` is consistent with existing page patterns. The
implementer should choose whichever fits the page's needs -- this is a
preference, not a spec gap.

---

## C. DTO Overclaims

### C1. `ready` Union Branch Over-Promises on Reserve and Pacing

The `ready` branch requires `reserve.status: 'available'` and
`pacing.status: 'available'`. This means `ready` can only be returned when BOTH
snapshots exist for the published config version.

But the spec also says "`ready` does not imply every section is available."
These two claims contradict each other in the type system. The `ready` branch as
typed forces reserve and pacing to be `available`.

**Fix:** Make reserve and pacing sections in the `ready` branch also support
`unavailable`:

```ts
reserve:
  | { status: 'available'; calculatedAt: string | null; source: 'fund_snapshots'; payload: ReserveResultsSection }
  | { status: 'unavailable'; reason: string };
```

Or collapse the union entirely -- a single shape where every section is a
discriminated union of available/unavailable/pending/failed, and `status` at the
top level just reflects lifecycle, not section completeness.

### C2. Scorecard and Scenarios Source Types Are Premature

The `ready` branch shows `scorecard.source: 'projection' | null` and
`scenarios.source: 'projection' | null`. Since Batch 3C (projection) is
conditional and may never ship, these fields overpromise. Phase 3 should type
scorecard and scenarios as `{ status: 'unavailable'; reason: string }` only and
defer the available variant to Batch 3C if triggered.

### C3. lifecycle Field Embeds Full FundStateReadV1

Embedding the entire `FundStateReadV1` object creates a tight coupling. If Phase
2B's contract changes, the results contract breaks. Consider embedding only the
fields the results page actually needs:

```ts
lifecycle: {
  configState: { hasPublished: boolean; publishedVersion: number | null };
  calculationState: { status: string; availableSnapshotTypes: string[] };
}
```

However, if the page needs the full lifecycle view, embedding is acceptable --
just document the coupling.

---

## D. Batch Ordering Critique

### Current Order: 3A (server) -> 3B (client) -> 3C (conditional) -> 3D (acceptance)

**This is correct in principle but has a dependency gap.**

### D1. Split 3B Into 3B-server and 3B-client

Batch 3B mixes XState machine changes (server-adjacent, pure TypeScript) with
page component changes (React, jsdom tests). These are independently testable
and should be split:

- **Batch 3B1: Fund ID Handoff** -- XState machine + wizard component changes
  only. Test: machine unit tests proving fund ID flows from API response to
  context to navigation.
- **Batch 3B2: Results Page Cutover** -- Page component + section rendering.
  Test: component tests with mocked fetch, no sessionStorage dependency.

This prevents a scenario where the machine change breaks the wizard but the page
work is already entangled.

### D2. 3A Should Define Section Payload Types Before Service Implementation

Batch 3A currently lists "create Zod contract" and "implement read service" in
the same batch. The service can't emit `ReserveResultsSection` until that type
exists. Suggest splitting:

- **Batch 3A1: Contract + Section Types** -- Zod schemas, TypeScript types,
  snapshot-to-section mappers. Pure types, no I/O.
- **Batch 3A2: Read Service + Route** -- Implementation consuming the types.

### D3. Recommended Revised Order

1. **3A1: Contract and section types** (types only, ~15 tests)
2. **3A2: Read service and route** (server I/O, ~15 tests)
3. **3B1: Fund ID handoff** (XState + wizard, ~8 tests)
4. **3B2: Results page cutover** (React page, ~12 tests)
5. **3C: Proven-gap projection** (conditional, triggered by product need)
6. **3D: Acceptance flow** (integration, ~6 tests)

---

## E. Additional Recommendations

### E1. Define the "Ready" Threshold Explicitly

The spec must answer: what makes the top-level status `ready`? Options:

- (a) At least one section is available (most permissive)
- (b) Reserve AND pacing are both available (matches typed `ready` branch)
- (c) Lifecycle calculation state is `ready` regardless of snapshots

Option (a) is the most honest and aligns with section-level truth. Option (b)
creates a chicken-and-egg problem where the page shows "pending" even when the
lifecycle says calculations are done but snapshots haven't landed. Option (c)
decouples page status from section availability, which is cleanest.

**Recommendation:** Option (c) -- derive top-level status purely from lifecycle.
Let sections speak for themselves.

### E2. Handle the `/latest` Route Gracefully

The spec says `/fund-model-results/latest` is unacceptable for routing truth.
The current code at `fund-model-results.tsx:255` falls back to `'latest'` when
no fundId param is present. No server-side "latest fund for user" resolution
exists in the codebase, so a 301 redirect is not feasible without new
infrastructure.

Practical options: if `fundId === 'latest'`, show an error state directing the
user back to the wizard, or redirect to `/fund-setup`. The fallback
`params?.fundId ?? 'latest'` must be removed either way.

### E3. Error States Need Design

The spec doesn't address:

- What the page shows while `GET /api/funds/:id/results` is loading (skeleton vs
  spinner vs nothing)
- What happens on network error (retry? offline banner?)
- What happens for a 404 (fund deleted? wrong ID?)

These aren't spec-level decisions, but Batch 3B's owned files should have test
cases for them.

### E4. Refetch Strategy for Calculating -> Ready Transition

When a fund moves from `calculating` to `ready` (snapshots land), the page needs
to refetch. The spec doesn't address this. Options:

- Polling: `setInterval` refetch when status is `pending` or `calculating`
- WebSocket: out of scope for Phase 3
- Manual refresh: acceptable MVP

Recommendation: conditional polling when the page detects a non-terminal status.
If TanStack Query is used, `refetchInterval` handles this; if raw fetch, a
`useEffect` timer works.

### E5. Snapshot Staleness

The spec says "latest attributed RESERVE/PACING snapshot for the active config
version." But what if a snapshot is old (e.g., calculated 30 days ago)? Should
`calculatedAt` carry a staleness warning? The existing reserve route in
fund-config.ts has a 24-hour staleness check. Phase 3 should replicate or
reference this pattern.

---

## F. Risk Assessment

| Risk                                                        | Severity | Mitigation                                                 |
| ----------------------------------------------------------- | -------- | ---------------------------------------------------------- |
| XState machine change breaks wizard flow                    | HIGH     | Unit test the machine transition independently (Batch 3B1) |
| Snapshot payload shape doesn't map to section types         | MEDIUM   | Define mappers in 3A1 before touching the service          |
| `ready` status logic disagrees with section availability    | MEDIUM   | Derive from lifecycle, not sections (E1 option c)          |
| projected-metrics-calculator can't be used (client imports) | LOW      | Spec already handles this; Batch 3C defers correctly       |
| `/latest` removal breaks bookmarks                          | LOW      | Show error state redirecting to wizard                     |
| No polling for calculating->ready transition                | MEDIUM   | Add conditional polling when status is non-terminal        |

---

## G. Summary Of Required Spec Amendments

1. **Add XState machine schema change** to Batch 3B's required work and owned
   files
2. **Define `ReserveResultsSection` and `PacingResultsSection`** as explicit
   snapshot-to-section mappers in Batch 3A
3. **Fix the `ready` branch DTO** so reserve/pacing sections can also be
   `unavailable` (or collapse the union)
4. **Remove `source: 'snapshot'` from waterfall** section -- it's unreachable
5. **Remove scorecard/scenarios available variants** from the initial contract
   (defer to Batch 3C)
6. **Specify top-level status derivation rules** (recommend: derive from
   lifecycle, not section availability)
7. **Add configVersion filter** to snapshot query specification
8. **Add polling/refetch strategy** for calculating->ready transition (framework
   choice is implementer preference)
9. **Split Batch 3B** into fund-ID-handoff (3B1) and page-cutover (3B2)
10. **Specify route file** for GET /api/funds/:id/results (recommend:
    fund-config.ts)
