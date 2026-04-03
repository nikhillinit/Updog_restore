---
last_updated: 2026-04-03
---

# Phase 3C Implementation Plan: Truthful Rich Results

## Purpose

Phase 3C is a **conditional** follow-on to Phase 3B2.

Trigger it only if the post-3B2 product review concludes that keeping
`scorecard`, `scenarios`, and `waterfall` permanently unavailable makes
`/fund-model-results/:fundId` unacceptable for users.

This plan assumes the Phase 3 constraints still hold:

- no session-backed results truth
- no fabricated client defaults
- no broad engine refactor hidden inside a read-model task
- every rendered field must name an authoritative persisted source

## Delivery Tracks

Phase 3C should be planned as two distinct tracks, not one blended stream.

### Track A: Default 3C

This is the recommended 3C target.

Deliver:

- a truthful scorecard summary backed by existing persisted evidence
- a `waterfall` API section rendered as a **Waterfall Setup** summary
- `scenarios` remaining explicitly unavailable

### Track B: Scenario-Enabled 3C Extension

This is a follow-on extension, not part of the default 3C acceptance target.

Run it only if product explicitly requires scenario cards after reviewing Track
A.

## Current Constraints From The Codebase

### 1. Current results contract intentionally forbids rich 3C sections

`shared/contracts/fund-results-v1.contract.ts` currently allows:

- `reserve`: available or unavailable
- `pacing`: available or unavailable
- `scorecard`: unavailable only
- `scenarios`: unavailable only
- `waterfall`: unavailable only

`server/services/fund-results-read-service.ts` matches that contract by
hard-coding:

- `scorecard: unavailable('No authoritative source')`
- `scenarios: unavailable('No authoritative source')`
- `waterfall: unavailable('No authoritative source')`

### 2. Scenario adjustments are not persisted in the authoritative draft schema

The wizard has a client-side scenarios step in:

- `client/src/schemas/modeling-wizard.schemas.ts`
- `client/src/lib/scenario-calculations.ts`

But the persisted draft contract in
`shared/contracts/fund-draft-write-v1.contract.ts` does **not** include:

- `enabled`
- `scenarios`
- `moicMultiplier`
- `exitTimingDelta`
- `lossRateDelta`
- `participationRateDelta`

That means a server-backed scenario section cannot be truthful until the
scenario configuration itself is persisted.

### 3. Wizard persistence path is still local-only

The current wizard still:

- auto-saves progress to `localStorage`
- reloads progress from `localStorage`
- does not continuously save canonical step data to `/api/funds/:id/draft`

That means "persist scenario settings" is not just a schema tweak. It requires a
write-path decision and a tested mapping from wizard state to canonical draft
payload.

### 4. Fund creation still starts from an empty initial draft

`fundPersistenceService.createFundWithInitialDraft()` inserts `config: {}`
whenever no explicit draft payload is provided, and the current
`POST /api/funds` route uses that path.

That means Track B cannot assume a truthful server draft exists immediately
after fund creation. The write path has to be designed explicitly.

### 5. Waterfall inputs are partly persisted, outputs are not

Published config can truthfully expose:

- `waterfallType`
- `waterfallTiers`
- recycling settings

But the current "Waterfall Distribution" UI shape expects payout outputs such
as:

- `gpCarry`
- `lpReturn`
- `totalDistributed`

No authoritative Phase 3 source currently writes those outputs to
`fund_snapshots`.

### 6. Scorecard metrics are only partially available today

Phase 3 can already prove:

- fund identity from `funds`
- lifecycle status from `fund-state-read-service`
- reserve ratio and confidence from `RESERVE` snapshots
- pacing timing from `PACING` snapshots

Phase 3 cannot yet prove the existing hero-card style metrics:

- expected MOIC
- net IRR
- concentration risk badge

Those fields are currently client-derived or tied to non-authoritative paths.

### 7. Cohort data is not yet an authoritative Phase 3 input

`workers/cohort-worker.ts` is still mock/scaffold code and does not provide a
trusted snapshot-backed source for results-page KPIs.

## Recommendation

Phase 3C should be implemented as a **truthful redesign batch first**, not as a
generic "projection everything" batch.

Recommended order:

1. Ship Track A as the default 3C target.
2. Rename the UI intent of `waterfall` from "distribution results" to
   **Waterfall Setup** unless a new authoritative payout source is approved.
3. Keep `scenarios` unavailable unless product explicitly approves the required
   persistence and server-calculation work.
4. Treat any new server projection as a narrowly scoped exception with explicit
   source ownership and a separate approval gate.
5. Make source ownership explicit in the contract layer before adding any new
   available sections.
6. Drive implementation from one explicit page-state matrix so the acceptance
   suite covers more than the happy path.

## Definitions And Evidence Resolution Rules

These rules should be treated as plan-level invariants, not implementation
details left for later.

### Authoritative Source

For Phase 3C, an authoritative source means server-owned persisted data that:

- survives reload and cross-device access
- can be traced to a concrete table or derived server read model
- has explicit version/freshness semantics
- is not reconstructed from browser-only state

Examples for Track A:

- `funds`
- published `fundconfigs`
- `fund-state-read-service` lifecycle output
- attributed `fund_snapshots`

Non-examples:

- `sessionStorage`
- `localStorage`
- client-only scenario helpers
- speculative projections without a persisted owner

### Resolution Precedence

The results page should resolve evidence in this order:

1. Determine the target config version from
   `lifecycle.configState.publishedVersion`
2. For snapshot-backed sections, prefer snapshots attributed to that exact
   published version
3. Use unattributed legacy snapshots only when lifecycle derivation explicitly
   marks `legacyEvidence=true`
4. Treat prior-version attributed snapshots as stale evidence, not as current
   truth for the latest published config
5. For config-backed sections, read only the published config row for the latest
   published version

### Current Truth vs Last Known Truth

The page should report truth for the latest published version, not "whatever was
true most recently."

- exact-version snapshot matches are current truth
- approved legacy unattributed snapshots are legacy truth
- prior-version attributed snapshots are stale and should not silently appear as
  current values

### Publish And Recalculation Semantics

Publishing a new config version changes the target truth immediately.

- once a new version is published, prior-version snapshots no longer count as
  current truth for `/fund-model-results/:fundId`
- the plan should not assume publish automatically dispatches recalculation
  unless the lifecycle implementation already guarantees it
- if the latest published version has no current-version snapshots yet, the page
  should reflect pending/stale evidence honestly and guide the user toward
  recalculation rather than silently showing old numbers as current

### Section Status Semantics

Use section statuses consistently:

- `available`: authoritative evidence exists and is valid for the section's
  target version/source
- `pending`: authoritative evidence is expected but has not been produced yet
- `unavailable`: no authoritative source exists, or the source exists but cannot
  truthfully answer that section today
- `failed`: production of the section's authoritative evidence failed for the
  current target state

### Status Ownership

Top-level status and section availability are separate concerns:

- top-level `status` comes from lifecycle state
- section status comes from source availability and freshness for that section
- a failed top-level lifecycle does not require every section to fail if
  truthful evidence already exists
- a ready top-level lifecycle does not allow fabricated section values when the
  needed evidence is missing

## Compatibility And Failure Policy

Phase 3C should remain an additive evolution of `FundResultsReadV1` unless the
product review explicitly approves a versioned contract change.

Compatibility rules:

- keep the existing route and top-level DTO shape
- add new section variants additively behind `status`
- do not remove or rename existing top-level fields in V1
- if the only clean implementation requires incompatible semantics, stop and
  propose `FundResultsReadV2` rather than smuggling a breaking change into V1

Failure-handling rules:

- missing section evidence should produce section-level `pending`,
  `unavailable`, or `failed`, not a route-level `500`
- malformed published config should fail only the affected config-backed section
  and emit structured server logging
- older published funds with missing waterfall inputs should degrade to truthful
  section-level unavailability or partial setup summaries; Track A does not
  require historical backfill/migration to fabricate completeness
- missing fund should remain `404`
- unexpected database or service failures that prevent constructing the base DTO
  may still return `500`

## Proposed 3C Scope

### In Scope By Default

#### A. Scorecard redesign from existing persisted evidence

Replace the old speculative scorecard with a narrower, truthful section built
from:

- `funds`: name, vintage year, fund size
- `lifecycle`: calculation status, last calculated timestamp
- `reserve` snapshot: total allocation, reserve ratio, average confidence
- `pacing` snapshot: deployment rate, years to full deploy

This should be a new scorecard contract and UI, not a revival of the old
`FundModelScorecard` props.

UI naming note:

- the contract key may remain `scorecard` for compatibility
- the user-facing label may be **Overview** or **Truthful Overview** if product
  wants to avoid implying revived hero-card projections

#### B. Waterfall setup summary from published config

Render a section that truthfully summarizes the published distribution setup:

- waterfall type
- tier count
- all persisted tier fields needed for a coherent setup summary
- recycling enabled state
- recycling type and cap when present

Source:

- published `fundconfigs.config`

This preserves the section without pretending payout math exists when it does
not.

Normalization rules:

- preserve tier order exactly as stored in published config
- keep numeric units aligned with the draft contract; do not rescale percentages
  or convert units inside the read model
- normalize absent optional tier/recycling inputs to explicit `null` inside the
  waterfall read DTO when a stable rendering shape is useful
- do not infer missing hurdles, conditions, or recycling fields from defaults
  that were never published

### Conditional Scope Requiring Explicit Approval

#### C. Scenario section backed by persisted scenario settings

Only implement if product specifically requires scenario cards on the results
page.

This requires:

1. Persisting scenario adjustments into the authoritative draft/write contract
2. Saving those values through a server-backed draft path
3. Publishing that config with the fund
4. Defining a server-owned base metric model
5. Running scenario derivation on persisted inputs only

Without those steps, the scenario section must remain unavailable.

#### D. Waterfall payout projection

Do **not** include payout metrics such as `gpCarry`, `lpReturn`, or
`totalDistributed` in the default 3C plan.

If product insists on those fields, record that as a separate gap because it
requires either:

- a new authoritative snapshot writer, or
- a dedicated persisted projection with clear ownership and tests

That is larger than the truthful redesign path above.

## Page State Matrix

The plan should drive one explicit state matrix for both the API and UI.

| Lifecycle / Evidence State                                     | Scorecard                                                  | Waterfall                  | Scenarios              | Expected UI Behavior                                                                                      |
| -------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------- |
| No published config                                            | unavailable                                                | unavailable                | unavailable            | page shell renders with plain-language setup guidance                                                     |
| Published, not requested                                       | unavailable or partial summary only                        | available if config exists | unavailable            | show pending lifecycle status without fabricated metrics                                                  |
| Calculating, partial snapshots                                 | available only if at least one snapshot-backed fact exists | available if config exists | unavailable            | show mixed ready/pending sections honestly                                                                |
| Published version advanced, only prior-version snapshots exist | pending unless approved legacy evidence exists             | available if config exists | unavailable            | treat older snapshots as stale rather than silently current and show recalculate/request-results guidance |
| Ready, reserve+pacing present                                  | available                                                  | available                  | unavailable by default | render full Track A experience                                                                            |
| Ready, snapshots missing                                       | unavailable                                                | available if config exists | unavailable            | remain honest even when lifecycle is ready                                                                |
| Failed, prior evidence exists                                  | available if backed by prior snapshots                     | available if config exists | unavailable            | show failure status with last known truthful sections                                                     |
| Failed, no prior evidence                                      | unavailable                                                | available if config exists | unavailable            | show failure state without backfilled numbers                                                             |

## Implementation Batches

### Batch 3C0: Server Draft Truth Path

Run this batch only if Track B is approved.

This is a prerequisite for scenario-enabled 3C.

Owned files:

- `shared/contracts/fund-draft-write-v1.contract.ts`
- wizard-to-draft mapping code
- `server/routes/fund-config.ts`
- `client/src/hooks/useModelingWizard.ts`
- `client/src/machines/modeling-wizard.machine.ts`
- draft roundtrip tests

Required work:

1. Decide whether canonical wizard data is saved continuously to the draft API
   or at explicit checkpoints.
2. Define one canonical mapping from wizard step state into `FundDraftWriteV1`.
3. Ensure scenario settings and waterfall settings survive reload through the
   draft API rather than only `localStorage`.
4. Document the publication boundary explicitly:
   - draft save supports editing continuity
   - published results pages read published config only
   - unpublished draft values never appear on `/fund-model-results/:fundId`
5. Add tests proving draft save -> load -> publish preserves those values.

Validation:

- scenario-related data survives reload without relying on `localStorage`
- published config contains the same scenario and waterfall values shown in the
  wizard
- Track B no longer depends on browser-only persistence
- published results remain isolated from draft-only values until publish occurs

### Batch 3C1: Gap Capture And Product Decision

Required output:

- a short gap note listing every currently requested 3C field
- whether each field is:
  - already provable
  - redesignable from persisted inputs
  - blocked on new persistence
  - blocked on new authoritative calculation output
- whether the Track A scorecard adds enough user value beyond reserve + pacing
  section summaries to justify its default inclusion
- whether `fund.size` should be treated as current fund truth or
  version-specific published truth for results-page purposes
- a short ADR / decision record capturing:
  - the selected 3C path
  - the publish -> stale evidence -> recalculation assumption
  - whether the user-facing label says **Scorecard** or **Overview**
- a consumer audit for current `FundResultsReadV1` readers, especially callers
  or tests that assume `sections.scorecard` and `sections.waterfall` are
  unavailable-only
- one annotated copy/wire note covering:
  - the Track A section labels
  - unavailable copy tone
  - whether the UI says **Scorecard** or **Overview**

Decision gate:

- approve the **minimal truthful redesign** path
- or explicitly authorize **Track B** starting with Batch 3C0
- or explicitly authorize a **new projection/snapshot** workstream

Success criteria:

- no ambiguous "restore the old cards" requirement remains
- each requested field has a named source or a recorded blocker
- any requirement that needs a new authoritative engine, snapshot writer, or
  historical backfill is explicitly split into a separate workstream
- an ADR / decision record exists before the implementation estimate is treated
  as committed
- the chosen path is explicitly one of:
  - Track A only
  - Track A + Track B
  - defer 3C entirely

### Batch 3C2: Contract Widening

Owned files:

- `shared/contracts/fund-results-v1.contract.ts`
- `tests/unit/phase3/fund-results-contract.test.ts`

Required work:

1. Introduce explicit available-section schemas whose `source` literals match
   the authoritative origin for that section.
2. Require every available section to declare its authoritative source at the
   type level.
3. Extend non-available section variants with a stable machine-readable
   `reasonCode` while keeping user-facing copy separate.
4. Add a typed `scorecard` section that supports:
   - `available`
   - `unavailable`
5. Add a typed `waterfall` section that supports:
   - `available`
   - `unavailable`
6. Keep `scenarios` as unavailable-only unless Track B is approved
7. Define field-presence semantics explicitly:
   - omit optional scorecard facts when the source fact is absent
   - use explicit `null` only where the read DTO intentionally normalizes an
     optional published config field
8. Add section-level freshness/version metadata only where it clarifies target
   version versus evidence version; avoid duplicating version tags onto every
   scorecard fact unless a concrete consumer actually needs them
9. Mark every available-section field with explicit source notes in comments or
   adjacent doc text

Acceptable implementations:

- parameterize `SectionAvailableSchema<TSource, TPayload>()`
- or add section-specific available helpers where the `source` literal is
  explicit

Rejected implementation:

- keeping a single `source: 'fund_snapshots'` helper and bypassing it ad hoc for
  config-backed sections

Suggested payload shapes:

```ts
scorecard: {
  fundSize: { value: number; source: 'funds' };
  reserveRatio?: { value: number; source: 'fund_snapshots' };
  avgConfidence?: { value: number; source: 'fund_snapshots' };
  yearsToFullDeploy?: { value: number; source: 'fund_snapshots' };
  lastCalculatedAt?: { value: string; source: 'fund_state' | 'fund_snapshots' };
}

waterfall: {
  view: 'setup-summary';
  type: 'american' | 'hybrid';
  tierCount: number;
  tiers: Array<{
    name: string;
    preferredReturn: number | null;
    catchUp: number | null;
    gpSplit: number;
    lpSplit: number;
    condition: 'irr' | 'moic' | 'none' | null;
    conditionValue: number | null;
    source: 'fund_config';
  }>;
  recyclingEnabled: boolean | null;
  recyclingType: 'exits' | 'fees' | 'both' | null;
  recyclingCap: number | null;
  recyclingPeriod: number | null;
  exitRecyclingRate: number | null;
  mgmtFeeRecyclingRate: number | null;
  allowFutureRecycling: boolean | null;
  source: 'fund_config';
}
```

Validation:

- unavailable/pending/failed sections expose stable `reasonCode` values such as
  `NO_PUBLISHED_CONFIG`, `CALCULATION_PENDING`, `STALE_EVIDENCE`,
  `INVALID_PUBLISHED_CONFIG`, or `NO_AUTHORITATIVE_SOURCE`
- schema tests reject speculative fields such as `expectedMOIC` or `gpCarry`
  unless a later approved batch adds them
- `scorecard.available` requires `fundSize` plus at least one snapshot-backed
  fact
- `waterfall.available` is explicitly a setup-summary variant, not a payout
  result variant
- config-backed freshness/version metadata should come from published config
  semantics, not snapshot-style `calculatedAt` semantics
- waterfall setup examples should include all persisted tier and recycling
  fields that materially affect the published distribution terms
- contract tests should verify omitted-vs-null behavior for missing optional
  fields
- contract tests should make status semantics explicit for `pending`,
  `unavailable`, and `failed`, not only `available`
- contract tests should fail if a config-backed section is incorrectly labeled
  `fund_snapshots`

### Testing Rules For 3C

These rules apply to Batch 3C3 and Batch 3C6.

1. Prefer assertions on returned DTO values and rendered UI output over
   assertions on mock call counts or query argument shape.
2. If a mocked published config fixture is used, construct it through
   `FundDraftWriteV1Schema.parse(...)` so the fixture cannot drift from the
   canonical draft contract.
3. If mock setup starts to exceed the test logic, introduce a small
   intent-revealing harness or fixture builders rather than expanding
   `beforeEach` noise.
4. If `engineResults` is guarded, use one focused negative regression test
   proving 3C output is unchanged when `funds.engineResults` is populated versus
   null. Do not turn that into a second truth source.
5. Drive API and UI coverage from one executable state matrix rather than
   hand-written one-off cases for each status combination.
6. Add explicit cases for malformed published config, missing published config,
   stale prior-version snapshots, and legacy unattributed snapshots.
7. Add a shared state-matrix fixture/source so contract, service, and UI tests
   stay aligned on the same lifecycle/evidence combinations.

Preferred fixture pattern:

```ts
function publishedConfig(overrides = {}) {
  return {
    version: 1,
    publishedAt: new Date(),
    config: FundDraftWriteV1Schema.parse({
      waterfallType: 'american',
      waterfallTiers: [
        { id: 'tier-1', name: 'Tier 1', gpSplit: 20, lpSplit: 80 },
      ],
      ...overrides,
    }),
  };
}
```

### Batch 3C3: Server Read Model Additions

Owned files:

- `server/services/fund-results-read-service.ts`
- `server/services/fund-results-mappers.ts`
- optional new `server/services/fund-results-rich-mappers.ts`
- `tests/unit/phase3/fund-results-read-service.test.ts`
- optional `tests/helpers/fund-results-test-harness.ts`

Required work:

1. Load the published config row alongside existing lifecycle and snapshot reads
2. Map reserve + pacing sections into a scorecard projection using persisted
   snapshot data only
3. Add a pure `mapPublishedConfigToWaterfallSetup()` mapper, or equivalent, that
   projects validated published config into the waterfall setup DTO
4. Test that mapper directly against optional tier and recycling-field
   combinations that affect rendered meaning
5. Implement one explicit evidence-resolution helper or decision tree so version
   precedence, legacy fallback, and stale evidence behavior are not duplicated
   ad hoc across sections
6. Return section-level `reasonCode` plus plain-language copy when a section's
   source is missing, stale, invalid, or not yet produced
7. Treat malformed published config as a section-level failure/unavailability
   with logging, not as a full-page crash, when the rest of the DTO can still be
   built
8. Emit structured observability for section resolution outcomes, including at
   minimum:
   - unavailable/failed section counts by `section` and `reasonCode`
   - invalid published config counts
   - stale evidence counts

Rules:

- do not read `sessionStorage`
- do not read client-only modules
- do not backfill from `funds.engineResults`
- do not infer scenario settings that were never persisted
- do not read from draft config or browser draft state when rendering published
  results
- a dedicated published-config read inside `fund-results-read-service` is an
  acceptable implementation; do not widen `fund-state-read-service` unless the
  lifecycle contract genuinely needs the full config payload
- unit tests should assert output values and shapes, not DB mock call counts
- mocked published config fixtures should be schema-validated through
  `FundDraftWriteV1Schema`

Validation:

- unit tests proving scorecard and waterfall output derive from published
  config, reserve snapshots, pacing snapshots, and lifecycle only
- unit tests should assert concrete payload values such as `tierCount`,
  `recyclingEnabled`, labeled tier rows, and condition/recycling fields when
  present
- unit tests should prove the precedence rule: exact-version snapshot > approved
  legacy snapshot > unavailable, and that prior-version attributed snapshots are
  treated as stale
- unit tests should prove publish invalidates prior-version snapshot truth for
  the latest results view even when those older snapshots still exist
- do not add query-mechanism assertions such as
  `toHaveBeenCalledWith(expect.objectContaining(...))` unless the test is
  explicitly about a branching rule
- add one focused regression proving populated `funds.engineResults` does not
  change 3C DTO output

### Batch 3C4: Optional Scenario Persistence And Projection

Run this batch only if product explicitly approves Track B.

Do not start this batch until Batch 3C0 is complete.

Owned files:

- `shared/contracts/fund-draft-write-v1.contract.ts`
- wizard-to-draft mapping code that saves published config
- `shared/contracts/fund-results-v1.contract.ts`
- server-side scenario projection code
- client results-page tests covering available scenarios

Required work:

1. Add persisted scenario configuration to the canonical draft contract
2. Ensure wizard save/publish flow writes those fields into `fundconfigs.config`
3. Define a server-side base metric source for scenario derivation
4. Port or reimplement scenario math on the server, independent of client-only
   imports
5. Keep scenario projection in a dedicated server helper/service rather than
   inlining browser-derived logic into the main read service
6. Add a `scenarios.available` contract variant with explicit source ownership

Hard constraints:

- no direct reuse of browser-only modules
- no dependence on unpersisted wizard state
- no dependence on `funds.engineResults`
- no rendering of draft-only or unpublished scenario values on the published
  results page

Rollback trigger:

- revert if scenario rendering depends on client-only data or unpublished inputs
- revert if the only working path still depends on `localStorage` draft state

### Batch 3C5: Results Page Rendering

Owned files:

- `client/src/pages/fund-model-results.tsx`
- optional typed components under `client/src/components/fund-results/`
- `tests/unit/pages/fund-model-results.test.tsx`

Required work:

1. Replace generic JSON rendering for new 3C sections with typed components
2. Keep unavailable copy explicit, non-alarmist, and user-facing rather than
   internal implementation jargon
3. Preserve existing loading, error, 404, and `/latest` handling
4. Continue polling while top-level status is non-terminal

UI guidance:

- scorecard should present only proven metrics
- the UI label may say **Overview** even if the contract key remains `scorecard`
- waterfall should be labeled **Waterfall Setup** or **Distribution Terms**, not
  "Waterfall Distribution"
- scenarios should either render from persisted data or remain clearly
  unavailable
- render user-friendly copy from `reasonCode` rather than dumping raw technical
  failure language into the section body
- when evidence is stale because a newer version was published, show a clear
  next-step message such as requesting or waiting for recalculation rather than
  leaving the section as a dead-end unavailable card

Validation:

- no `sessionStorage` result reads
- no fabricated fields appear in the DOM
- unavailable sections stay unavailable when sources are absent
- tests cover first render on one device plus reload/new session behavior
  without relying on browser storage carryover

### Batch 3C6: Acceptance And Regression

Owned files:

- `tests/integration/wizard-to-results-e2e.test.ts`
- `tests/integration/fund-results-config-readback.test.ts`
- contract and service tests added in earlier batches

Required work:

1. Publish a fund
2. Navigate to `/fund-model-results/:fundId`
3. Reload
4. Assert the same scorecard and waterfall truth is returned from persisted
   state
5. If scenarios were approved, assert scenario truth also survives reload
6. Assert behavior against every row of the page state matrix, not just the
   happy path
7. Add one real-DB integration test that seeds a published config with waterfall
   fields and proves the actual config query returns the expected waterfall
   setup DTO
8. Add at least one malformed-config case proving the route stays honest about
   affected sections instead of crashing the entire page when the base fund and
   lifecycle data remain available

Repo test-runner note:

- the existing wizard-to-results flow lives under the integration Vitest config,
  so run it through
  `npm run test:integration -- tests/integration/wizard-to-results-e2e.test.ts`
  rather than the default unit-test Vitest projects

Success criteria:

- first render and reload agree
- no result content depends on browser session state
- unavailable sections remain honest
- acceptance coverage is driven from the same state matrix / fixture table used
  to define the plan
- observability exists for stale evidence, invalid config, and section
  availability-by-reason so rollout issues are measurable
- at least one integration test proves config -> query -> mapper -> DTO without
  mocking the read service or DB layer

## Field-Level Truth Table

| Section   | Requested Legacy Shape                      | Smallest Truthful 3C Answer                                      | Source Today                         | Default Recommendation |
| --------- | ------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------ | ---------------------- |
| Scorecard | MOIC / IRR / reserve / risk hero card       | readiness + reserve + pacing fact summary                        | funds + lifecycle + RESERVE + PACING | Implement in Track A   |
| Scenarios | optimistic / base / pessimistic comparisons | unavailable until scenario config is persisted through draft API | none authoritative                   | Defer to Track B       |
| Waterfall | GP carry / LP return / total distributed    | published Waterfall Setup summary                                | published fund config                | Implement in Track A   |

## Estimated Effort

Track A:

- 3C1 Gap capture: 0.5 day
- 3C2 Contract widening: 0.5 to 1 day
- 3C3 Server read-model additions: 1.5 to 2 days
- 3C5 Client rendering: 1 to 1.5 days
- 3C6 Acceptance/regression: 0.5 to 1 day

Total recommended default: **4 to 6 days**

Track B additional cost:

- Batch 3C0 draft-truth path: **1 to 2 days**
- Batch 3C4 scenario projection: **3 to 5 days**

Total additional Track B cost: **4 to 7 days**

Notes:

- these estimates assume no new authoritative scenario engine or snapshot writer
- if product requires version-specific historical fund metadata, payout math, or
  a new scenario-calculation owner, re-scope before committing the estimate
- treat these estimates as provisional until Batch 3C1 produces the ADR /
  decision record and consumer audit above

## Explicit Non-Goals

- reviving the old speculative hero card unchanged
- reading from `funds.engineResults` for rendered truth
- importing client-only scenario helpers on the server
- introducing broad cohort normalization into Phase 3C
- adding waterfall payout math without a separately approved authoritative
  source
- broadening route authorization or visibility beyond the current results page

## Exit Criteria

Phase 3C is complete when:

1. product-approved rich sections are backed by persisted authoritative sources
2. every rendered 3C field has a named server-side source
3. reload behavior matches first render
4. `scenarios` is either truly supported from persisted config or explicitly
   unavailable
5. no 3C section depends on `sessionStorage` or `funds.engineResults`
6. acceptance coverage exists for every row in the page state matrix
7. stale, malformed, or missing evidence resolves to explicit section behavior
   rather than silent fallback or full-page ambiguity

## Post-Validation Next Steps

This section converts the validated Track A implementation slice into a
ship-ready execution plan.

### Step 1: Close Remaining Track A Technical Gaps

Goal:

- finish the last missing correctness and regression checks before broad merge

Owner:

- Engineering

Artifacts:

- one additional mixed-evidence read-service test
- a recorded regression run covering the Track A test surface

Required work:

1. add one read-service test covering mixed evidence inside `scorecard`
2. prove the `scorecard` omits stale legacy facts when one snapshot-backed
   section is legacy and the other is current-version evidence
3. run the broader publish -> state -> results regression set, not only the
   focused 3C slice tests

Execution commands:

- `npx vitest run tests/unit/phase3/fund-results-contract.test.ts tests/unit/phase3/fund-results-rich-mappers.test.ts tests/unit/phase3/fund-results-read-service.test.ts tests/unit/pages/fund-model-results.test.tsx tests/unit/contract/fund-results-route.test.ts`
- `npm run test:integration -- tests/integration/wizard-to-results-e2e.test.ts`

Done when:

- mixed-evidence behavior is covered explicitly
- broader regression coverage passes against the current Track A code path

### Step 2: Sync Docs And Decision Records To Implemented Semantics

Goal:

- make the written plan and project decisions match the actual validated
  behavior

Owner:

- Engineering

Artifacts:

- plan update in this document
- ADR update in `DECISIONS.md` under `ADR-018`

Required work:

1. update this plan and `ADR-018` in `DECISIONS.md` with the semantics now
   proven in code
2. document that `waterfall` must bind to
   `lifecycle.configState.publishedVersion`
3. document that prior-version attributed snapshots surface as `pending` with
   `STALE_EVIDENCE`, not silent current truth
4. document that invalid published config fails only the affected config-backed
   section rather than crashing the whole results route

Done when:

- a reviewer can read the docs and predict current Track A behavior without
  inferring from tests or code

### Step 3: Run Product And UI Sign-Off On The Track A Surface

Goal:

- confirm the current results-page surface is acceptable to ship as the default
  3C answer

Owner:

- Product
- Design
- Engineering

Artifacts:

- a written sign-off note or bounded follow-up list
- captured screenshots or short demo notes for the reviewed states

Review scope:

- `Overview`
- `Waterfall Setup`
- stale-evidence copy
- invalid-config copy

Required work:

1. demo the current page states using authoritative server-backed data
2. confirm the typed waterfall summary is sufficient for release or capture the
   exact polish work still needed
3. confirm `scenarios` remaining unavailable is acceptable for default Track A
4. run one manual publish -> stale evidence -> recalculation smoke path in the
   real UI so reviewers see the core truthfulness behavior, not only test output

Required smoke path:

1. publish a config version with existing results visible
2. publish a newer version without current-version snapshots yet
3. verify snapshot-backed sections surface stale/pending behavior rather than
   old results as current truth
4. run or wait for recalculation
5. verify the results page updates to current-version truth

Done when:

- product explicitly accepts the Track A UI, or returns a bounded follow-up list
  that does not reopen Track B by accident

### Step 4: Prepare The Branch For Merge

Goal:

- move from validated feature work to a merge-ready branch

Owner:

- Engineering

Artifacts:

- passing branch gate output
- PR summary with known residual test noise documented

Required work:

1. run the full relevant gate for the branch, including unit, integration, and
   any required lint checks
2. confirm the wizard-to-results integration flow still passes through the
   integration Vitest config
3. capture known residual test noise in the PR summary so reviewers are not
   surprised by it

Execution commands:

- `npm run test:unit`
- `npm run test:integration -- tests/integration/wizard-to-results-e2e.test.ts`
- `npm run lint:eslint`
- `npm run check:fast`

Residuals to call out:

- existing React `act(...)` warnings in the results-page error-state tests
- intentional mocked route-error logging in the `500` contract-path test

Done when:

- CI-relevant checks pass
- the PR summary accurately describes both completed work and known residual
  test noise

### Step 5: Make The Track B Decision Explicit

Decision recorded on 2026-03-26:

- NO-GO for Track B in the default Phase 3C release
- reopen only with a separate written Track B plan approved by Product and
  Engineering Lead by 2026-04-09
- absent that approval by 2026-04-09, Track B remains backlog work and must not
  proceed under the Phase 3C plan by assumption

Goal:

- prevent scenario work from sliding into Track A by assumption

Owner:

- Product
- Engineering lead

Artifacts:

- written go / no-go note for Track B
- if approved, a separate Track B execution plan

Required work:

1. after Track A sign-off, explicitly choose one of two paths:
   - close Phase 3C at Track A
   - open a separate Track B execution plan
2. if Track B is approved, start with server-owned scenario persistence and
   draft write-path ownership before any scenario UI expansion
3. treat scenario math, server read models, and persistence ownership as the
   first-class design problem, not a rendering follow-up

Release gate note:

- Track A may merge and close the default 3C scope without Track B
  implementation unless product explicitly makes scenario support a release
  blocker

Done when:

- there is a written go / no-go decision for Track B
- no implementation work proceeds on scenarios without that decision
