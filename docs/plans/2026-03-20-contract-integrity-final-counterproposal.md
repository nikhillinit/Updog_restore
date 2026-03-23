---
status: ACCEPTED
last_updated: 2026-03-20
base_commit: 7fbf1977e5fca6718dc71159b5142ce9d78cb0e3
works_with:
  - docs/plans/2026-03-18-eslint-execution-counterproposal.md
supersedes:
  - docs/plans/2026-03-20-contract-integrity-counterproposal.md
  - C:\Users\nikhi\.claude\plans\fluttering-yawning-pretzel.md
---

# Contract-Integrity Final Counterproposal

## Purpose

This document replaces the layered audit trail with one execution handoff.

It has two jobs:

1. capture the best integrated comments from all reviews
2. turn those comments into one unambiguous execution plan

The main body is intentionally operational. Earlier forensic reasoning,
scorecards, bias audits, and red-team analysis are treated as supporting
history, not as the plan itself.

## Integrated Review Comments

### 1. Final Thesis Must Supersede Earlier Narratives

Do not preserve the earlier "register `funds.ts` in `app.ts`" framing as the
lead diagnosis.

The primary runtime already mounts `routes/funds.ts` on the
`main.ts -> bootstrap -> server.ts -> registerRoutes()` path. The current
problem is not "the route does not exist" on the primary path. The real blockers
are:

- duplicate endpoint ownership
- mismatched public write DTOs
- incomplete persistence of full wizard state
- fabricated results hydration
- unresolved server/client boundary imports

### 2. Runtime Authority Is A P0 Decision

The repo does not have one server surface.

Current runtime/deployment paths include:

- `server/main.ts -> bootstrap -> server.ts -> registerRoutes()`
- `server/index.ts -> makeApp() -> server/app.ts`
- `api/[[...slug]].ts -> server/app.js` on Vercel
- `api/funds.ts` stub on Vercel, which can own `/api/funds` directly
- Docker and Railway startup paths

This must end with one ADR, not an open investigation.

### 3. Endpoint Ownership Must Be Explicit

`/api/funds` currently has competing owners:

- mounted `routes/funds.ts` via `server/routes.ts`
- inline `app.post('/api/funds')` in `server/routes.ts`
- Vercel `api/funds.ts` stub

This is a P0 architectural conflict. The plan must require:

- one canonical owner per endpoint per supported runtime surface
- one canonical contract source per endpoint version
- one mount convention on the authoritative runtime
- one runtime-specific ownership table

### 4. Use One Public Write DTO, Not One Universal Shared Type

The safe pattern is:

- one canonical public write DTO for `POST /api/funds` version `v1`
- explicit adapter from wizard state to that DTO
- explicit adapter from the DTO to persistence
- explicit read-model contract for results hydration

Do not collapse wizard form state, API write DTO, persistence shape, engine
input, and results read model into one universal type.

### 5. DTO And Persistence Mapping Must Be Coupled

A DTO adapter alone is insufficient.

The server can successfully parse the request and still lose most of the wizard
state if persistence remains limited to the base `funds` row plus optional
`engineResults`.

The plan must treat "public write DTO + storage mapping" as one coupled design
deliverable, even if implementation is split across phases.

### 6. Synthetic Results Are A Data-Integrity Blocker

The current results page is not merely "not API-backed." It fabricates financial
outputs. That is a truthfulness problem, not just a UX problem.

The plan must explicitly ban:

- placeholder MOIC
- placeholder reserve ratio
- synthetic optimistic/pessimistic scenarios

If real engine results are unavailable, the UI must show an explicit incomplete
state instead.

### 7. Router Rewrite Needs A Safety Harness

Before deleting or reconciling inline `/api/funds` handlers:

- capture HTTP request/response snapshots
- add contract tests around the affected endpoints
- prove the replacement surface preserves the intended payload contract

Do not perform route dedupe based only on code inspection.

### 8. Core Execution Is Sequential, Not Parallel

The prior "tracks" framing risked implying parallel execution where the work is
actually dependent.

The core path must be linear:

1. Phase 0A: runtime evidence, ADR, and contract snapshots
2. Phase 0B: endpoint owner cutover on supported runtime surfaces
3. Phase 1: public write DTO and storage mapping
4. Phase 2A: authoritative write home and atomic persistence
5. Phase 2B: lifecycle and authoritative read fields
6. Phase 3: results read model
7. Phase 4: funds route normalization and boundary cleanup

Boundary-import replacement runs in its designated sequential phase (Phase 4),
not independently.

### 9. Lifecycle Model Must Respect Existing Axes

The repo already has multiple state axes:

- `funds.status`
- `fundConfigs.version`
- `fundConfigs.isDraft`
- `fundConfigs.isPublished`

Do not flatten config publication state and calculation state into one new
string enum.

The plan must define either:

- an explicit two-axis model
- or a real state machine with illegal transitions documented

For this short track, the safer design is:

- config lifecycle from persisted config state
- calculation lifecycle from calculation/snapshot state
- explicit read-model fields such as `configVersion` and `lastCalculatedAt`

### 10. Compatibility Policy Must Be Explicit

The current route already tries to accept multiple payload shapes while the
wizard still emits legacy field names such as `fundName` and `fundSize`.

The plan must say whether transition uses:

- hard cutover
- temporary dual-acceptance adapter
- or read-old/write-new bridging

This should not be left implicit.

### 11. Field Ownership And Migration Must Be Designed

The plan needs:

- a field-ownership table
- a versioning story for existing funds and fund configs
- a migration or compatibility path for already persisted records

Without this, contract drift will return as soon as read and write models start
evolving independently.

### 12. Gates Should Split By Batch Versus Integration Checkpoint

Per-batch gates should stay narrow:

- touched-file lint
- targeted contract tests
- guardrails
- boot-path smoke tests where relevant

Broader repo gates should run at integration checkpoints:

- `npm run test:unit --changed`
- `npm run baseline:progress`
- `npm run lint:eslint`

This keeps the contract track strict without turning every batch into a full
repo-quality sweep.

### 13. Endpoint Ownership Manifest Should Start Early

Do not wait until the final CI guard phase to model ownership.

Seed a minimal endpoint ownership table in the runtime-authority phase:

- endpoint
- owner module
- runtime surface
- mount path
- request/response contract source

Then promote it into a CI-enforced manifest later.

### 14. Phase 0 Must Split Discovery From Enforcement

Do not mix evidence gathering and runtime cutover in one batch.

Phase 0 should be split into:

- Phase 0A: audit, ADR, ownership table, snapshots, smoke harness
- Phase 0B: enforce the chosen owner model on supported runtime surfaces

This reduces thrash and gives the cutover a real rollback point.

### 15. Results Read-Model Decision Must Be Binary

Do not leave the results source as a preference.

Default rule:

- use persisted config plus the latest relevant persisted snapshot on the
  authoritative runtime surface
- only add a dedicated results projection if a concrete missing-field or
  performance requirement is proven during implementation

### 16. Every Phase Needs One Business Acceptance Check And One Rollback Rule

The plan is strong on technical gates, but it also needs:

- one user-visible acceptance check per phase
- one rollback trigger per phase

This is especially important for runtime ownership and router cutover work.

### 17. Evidence Should Be Appendix-Level And Audit-Ready

The plan should separate:

- code-verified facts
- deployment assumptions pending validation

And it should keep a compact evidence appendix so future reviewers can tell what
was verified versus inferred.

### 18. Auth Remains Conditional

Frontend auth is still correctly deferred unless:

- the chosen authoritative create/read path is JWT-protected
- the release scope requires protected access immediately

If either is true, minimal frontend auth moves into the critical path.

## Resulting Counterproposal

## Executive Decision

On the authoritative runtime surface only, make `POST /api/funds` persist a
canonical draft/config and make the results page render only persisted or
explicitly pending data.

Any non-authoritative surface must either proxy to that path or be declared out
of scope for this release.

"Done" means submit, refresh, and read-back all agree, with no fabricated
financial outputs.

Do not replace the ESLint execution plan as the repo's quality framework.
Instead:

1. pause discretionary Wave 3 lint cleanup
2. run this contract-integrity plan under touched-file lint, targeted tests,
   guardrails, and runtime smoke tests
3. resume lint cleanup after the wizard-to-results flow is truthful and
   functional

## Confirmed Repo Facts

1. `dev:api` runs `server/main.ts`.
2. `server/main.ts` bootstraps `server.ts`.
3. `server.ts` uses `registerRoutes()` from `server/routes.ts`.
4. `server/routes.ts` already mounts `routes/funds.ts` under `/api`.
5. `server/routes.ts` also defines inline `GET /api/funds`,
   `GET /api/funds/:id`, and `POST /api/funds`.
6. `server/routes/funds.ts` defines `POST /funds` and
   `POST /api/funds/calculate` in the same router, which creates a mount-prefix
   inconsistency.
7. `server/index.ts` separately uses `makeApp()` from `server/app.ts`.
8. `server/app.ts` is also exported as the Vercel-compatible app surface.
9. `api/[[...slug]].ts` imports `server/app.js` directly.
10. `api/funds.ts` is a direct Vercel function stub for `/api/funds`.
11. The wizard submits `fundName` and `fundSize`, while current server-side fund
    creation contracts expect `name` and `size`.
12. Current persistence stores only the basic `funds` row plus optional
    `engineResults`, while `fundConfigs.config` already exists for full config
    storage.
13. The results page still reads session storage and fabricates financial
    outputs.
14. `shared/schema/fund.ts` already models config publication state separately
    from snapshot persistence, so lifecycle work must not collapse those axes.

## Non-Negotiables

1. One canonical owner per endpoint per supported runtime surface.
2. One public write DTO per public write endpoint version.
3. No fabricated financial outputs in the results flow.
4. No acceptance of rich wizard input without an explicit persistence target.
5. No entrypoint or adapter removal before deployment audit and ADR.
6. No route dedupe without contract snapshots and smoke tests.
7. No server/client boundary cleanup task without a named shared replacement.
8. Keep touched-file non-regression rules from the ESLint plan active.
9. Non-authoritative runtime surfaces must proxy to the canonical owner or be
   explicitly out of scope for the release.
10. No monetary or percentage field crosses a boundary without explicit units,
    scale, precision, and conversion ownership.
11. No runtime or route-topology batch is release-ready without a
    release-support matrix that marks each surface as supported, proxied, or
    intentionally out of scope.

## Phase Dependencies

The core path is linear:

1. Phase 0A: runtime evidence, ADR, and snapshot harness
2. Phase 0B: runtime owner cutover
3. Phase 1: public write DTO and storage mapping
4. Phase 2A: authoritative write home and atomic persistence
5. Phase 2B: lifecycle and authoritative read fields
6. Phase 3: results read model and truthfulness
7. Phase 4: funds route normalization and boundary cleanup

Follow-on hardening, including secondary route rollout and generalized CI drift
guards, happens only after the core funds flow is truthful end to end.

## Multi-Phase Ownership

| File                                             | First owner | Later touch allowed for                                                                                            |
| ------------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------ |
| `server/routes.ts`                               | Phase 0A/0B | Phase 3 results route wiring; Phase 4 dedupe; inline GET handlers remain load-bearing until deliberately relocated |
| `server/routes/funds.ts`                         | Phase 0B    | Phase 1, Phase 2A, and Phase 4                                                                                     |
| `server/routes/fund-config.ts`                   | Phase 2A    | Phase 2B and Phase 3 read-model wiring                                                                             |
| `server/routes/fund-results.ts`                  | Phase 3     | Phase 4 validation only                                                                                            |
| `server/app.ts`                                  | Phase 0A    | adapter-only parity follow-up                                                                                      |
| `api/[[...slug]].ts`                             | Phase 0A    | adapter-only parity follow-up                                                                                      |
| `api/funds.ts`                                   | Phase 0A    | stub removal or quarantine only                                                                                    |
| `client/src/machines/modeling-wizard.machine.ts` | Phase 1     | Phase 4 end-to-end validation                                                                                      |
| `client/src/pages/fund-model-results.tsx`        | Phase 3     | Phase 4 validation only                                                                                            |
| `workers/reserve-worker.ts`                      | Phase 4     | none                                                                                                               |
| `workers/pacing-worker.ts`                       | Phase 4     | none                                                                                                               |

## Phase 0A: Runtime Evidence, ADR, And Snapshot Harness

### Goal

Capture evidence and make runtime ownership explicit before any router rewrite,
dedupe, owner cutover, or entrypoint removal. Phase 0A is documentation,
snapshot, and harness work only; no runtime behavior changes belong here.

### Primary files

- `[read]` `package.json`
- `[read]` `server/main.ts`
- `[read]` `server/bootstrap.ts`
- `[read]` `server/server.ts`
- `[read]` `server/routes.ts`
- `[read]` `server/index.ts`
- `[read]` `server/app.ts`
- `[read]` `api/[[...slug]].ts`
- `[read]` `api/index.ts`
- `[read]` `api/funds.ts`
- `[read]` `vercel.json`
- `[read]` `railway.toml`
- `[read]` `Dockerfile`
- `[read]` `Dockerfile.railway`
- `[modify]` ADR document under `docs/`
- `[modify]` endpoint-ownership evidence under `docs/`
- `[modify]` `/api/funds` snapshot and smoke-test harness under `tests/`

### Required work

1. Confirm the already observed runtime topology and audit only the remaining
   deployment assumptions.
2. Write an ADR that declares:
   - authoritative local runtime
   - authoritative primary server path
   - release-support matrix for each runtime surface:
     - supported for this release
     - proxied to the canonical owner
     - intentionally out of scope
   - supported deployment adapters
   - status of `server/index.ts` + `server/app.ts`
   - status of `api/funds.ts`
3. Seed an endpoint ownership table for:
   - `/api/funds`
   - `/api/funds/:id`
   - `/api/funds/calculate`
4. Mark the target canonical owner for each supported runtime surface and record
   whether non-authoritative surfaces will proxy or be declared out of scope.
5. Capture HTTP request/response snapshots for affected fund endpoints before
   rewriting handlers.
6. Make the target Phase 0B success contract explicit for `POST /api/funds` on
   release-supported surfaces:
   - router-owned 201 wrapper shape: `{ success, data, message }`
   - router error surface as captured by snapshot coverage
7. Add a smoke test proving which runtime surface owns `/api/funds`.

### Exit criteria

- runtime ADR exists
- release-support matrix exists and marks each surface as supported, proxied, or
  out of scope
- deployment audit exists
- endpoint ownership table exists
- target `/api/funds` owner is explicit on each supported surface
- canonical `POST /api/funds` response contract is explicit and snapshot-locked
- router rewrite has snapshot coverage
- no supported deployment path is unintentionally orphaned by planned cutover
- no runtime behavior changes were made outside docs/tests/harness assets

## Phase 0B: Runtime Owner Cutover

### Goal

Enforce the Phase 0A runtime decisions so endpoint ownership is no longer
ambiguous on supported surfaces.

### Primary files

- `server/routes.ts`
- `server/routes/funds.ts`
- `tests/unit/contract/funds-endpoint-snapshots.test.ts`
- `tests/unit/contract/funds-route-ownership.test.ts`
- `docs/evidence/endpoint-ownership.md`

### Explicit non-goals

- do not start DTO, persistence, or results-read-model work
- do not move or replace the inline `GET /api/funds` and `GET /api/funds/:id`
  handlers in this phase
- do not add Vercel parity or rewrite `server/app.ts`
- do not change `api/[[...slug]].ts`, `api/index.ts`, or `api/funds.ts` unless a
  Phase 0A assumption is disproven and the ADR is amended first

### Required work

1. Fix the authoritative-runtime mount bug so the calculate route is owned at
   `POST /api/funds/calculate`, not `POST /api/api/funds/calculate`.
2. Remove or quarantine the shadowed inline `POST /api/funds` in
   `server/routes.ts` after preserving its Phase 0A evidence in tests/docs.
3. Preserve the inline `GET /api/funds` and `GET /api/funds/:id` handlers until
   Phase 4, because they are still the canonical read owners on the
   authoritative surface.
4. Update the ownership evidence and contract tests so they assert the
   post-cutover target state rather than just documenting ambiguity.
5. Preserve the router-owned `POST /api/funds` success contract selected in
   Phase 0A:
   - 201 wrapper shape `{ success, data, message }`
   - router error behavior remains the canonical contract unless an intentional
     delta is documented before cutover
6. Keep non-authoritative surfaces unchanged and explicitly out of scope for
   this batch.

### Exit criteria

- `POST /api/funds` has exactly one owner on the authoritative runtime:
  `server/routes/funds.ts`
- `POST /api/funds` preserves the router-owned wrapper contract captured in
  Phase 0A snapshots
- `POST /api/funds/calculate` is reachable at the single-prefix path and not at
  the double-prefix path
- inline `GET /api/funds` and `GET /api/funds/:id` still pass their contract
  tests unchanged
- Phase 0A docs/tests remain a valid audit trail of what changed and why
- release-supported surfaces are still explicitly marked as supported, proxied,
  or out of scope
- no non-authoritative runtime surface was changed as part of the cutover

### Rollback trigger

Rollback this batch if any of the following occur:

- `POST /api/funds` no longer returns the router-owned wrapper shape
- `POST /api/funds/calculate` becomes unreachable on the authoritative runtime
- either inline read endpoint changes contract or ownership unexpectedly
- the cutover requires touching DTO/persistence/client-submit code to complete

## Phase 1: Public Write DTO And Storage Mapping

### Goal

Define one canonical public write DTO for `POST /api/funds` version `v1` and one
explicit mapping from that DTO into persistence targets.

### Primary files

- `shared/contracts/fund-write-v1.ts` (CREATE: boundary-specific versioned write
  DTO)
- `shared/dto.ts` (READ ONLY: audit existing `FundInputDTOSchema` for
  consolidation or deprecation)
- `server/validators/fundSchema.ts`
- `server/routes/funds.ts`
- `client/src/machines/modeling-wizard.machine.ts`
- `client/src/schemas/modeling-wizard.schemas.ts`

### Repo-Reality Drift To Resolve First

Current code paths disagree on the write contract in materially different ways:

- `client/src/machines/modeling-wizard.machine.ts` currently `POST`s a rich
  step-shaped payload built by spreading `generalInfo` and then nesting:
  - `sectorProfiles`
  - `capitalAllocation`
  - `fees`
  - `exitRecycling`
  - `waterfall`
  - `scenarios`
- `server/routes/funds.ts` currently accepts a much narrower `CreateFundSchema`
  with:
  - flat `name`, `size`, `managementFee`, `carryPercentage`, `vintageYear`
  - optional `engineResults`
  - optional legacy `basics` / `strategy`
- `shared/dto.ts` exposes `FundInputDTOSchema`, which models the narrow flat
  payload, not the wizard submit payload.
- `server/validators/fundSchema.ts` still validates against
  `CompleteFundSetupSchema` from `shared/types.ts`, which is a third shape with:
  - `investmentStrategy` instead of separate `sectorProfiles` +
    `capitalAllocation`
  - `exitRecycling.recyclePercentage` instead of `exitRecyclingRate`
  - waterfall `type: "AMERICAN"` instead of wizard `american | hybrid`
- `shared/database-helpers.ts` already defines a placeholder
  `FundConfigPayload`; treat that as non-authoritative until Phase 1 replaces or
  narrows it explicitly.
- `client/src/lib/wizard-reserve-bridge.ts` documents mixed unit conventions
  already in play:
  - money values treated as dollars in engine bridges
  - some percentage fields expressed as `0-100`
  - some ratio fields expressed as `0-1`
  - several schema comments still describe values as `$M`

Phase 1 cannot freeze a truthful public DTO until these competing shapes are
named explicitly and either reconciled or isolated behind adapters.

### Required work

1. Choose the canonical public write DTO for `POST /api/funds` version `v1`.
   Place the canonical DTO in a boundary-specific, versioned contract module
   (`shared/contracts/fund-write-v1.ts`), not in the existing `shared/dto.ts` or
   `shared/types.ts` grab-bags. This reinforces the non-negotiable against
   collapsing wizard state, API contracts, persistence, and read models into one
   universal shared type.
2. Adopt an explicit compatibility policy for the transition:
   - temporary dual-acceptance adapter at the authoritative endpoint
   - normalize legacy payloads into the canonical DTO
   - instrument legacy payload usage
   - set a sunset date for legacy acceptance
   - remove legacy acceptance only after 14 consecutive calendar days with zero
     observed legacy-format writes, measured by:
     - telemetry source: structured log line emitted by the dual-acceptance
       adapter on every legacy-format normalization (e.g.,
       `{ event: "legacy_fund_write", format: "v0", endpoint: "/api/funds" }`)
     - environments that count: all authoritative runtime surfaces (local dev
       excluded unless it shares the telemetry sink)
     - "observed" means: at least one telemetry record exists for that calendar
       day; zero records = zero legacy writes for the day
     - verification method: query the telemetry sink for
       `event=legacy_fund_write` in the trailing 14-day window; if count = 0,
       sunset is eligible
3. Produce a pre-implementation wizard-to-DTO-to-storage field-diff appendix.
   Each row must include:
   - wizard step/group and field path
   - source shape
   - canonical DTO field
   - persistence target
   - units / scale / precision
   - defaulting rule
   - authoritative / derived / deferred classification
   - conversion owner
   - read-model consumer Required minimum coverage includes:
   - `generalInfo`
   - `sectorProfiles`
   - `capitalAllocation`
   - `feesExpenses`
   - `exitRecycling`
   - `waterfall`
   - `scenarios`
4. Add one explicit adapter from wizard state to the public write DTO.
5. Audit and reconcile step-contract drift:
   - waterfall casing
   - scenario shape drift
6. Consolidate or deprecate overlapping server-local write schemas.
7. Define a `FundConfigPayload` schema that `fundConfigs.config` must satisfy on
   write and can be trusted on read.
8. Produce the storage-mapping table for that DTO: Each row must include:
   - field name
   - source shape
   - canonical DTO field
   - persistence target
   - units / scale / precision
   - defaulting rule
   - authoritative / derived / deferred classification
   - conversion owner
   - read-model consumer Required coverage includes:
   - fields owned by `funds`
   - fields owned by `fundConfigs.config`
   - fields needed by the results read model
   - fields needed by engine invocation
9. Add contract tests proving the wizard submit payload maps cleanly into the
   public write DTO.

### Mandatory Decisions Before DTO Freeze

- percentage-scale policy: define per field whether `v1` accepts `0-100` or
  `0-1`; do not carry the current mixed conventions across the public write
  boundary without explicit field-by-field documentation
- monetary-unit policy: resolve dollars versus `$M` for at least:
  - `generalInfo.fundSize`
  - stage round sizes / valuations
  - `capitalAllocation.initialCheckSize`
  - `feesExpenses.adminExpenses.annualAmount`
  - recycling caps or max amounts
- waterfall policy: resolve casing and surface-area drift between:
  - wizard `waterfall.type`: `american | hybrid`
  - shared `WaterfallSchema`: `AMERICAN`
  - carried-interest economics currently split across `feesExpenses` and
    `waterfall`
- scenario policy: decide whether the canonical DTO keeps
  `{ enabled, scenarios[] }` as-is or normalizes to a different shape; document
  the base-case rule and whether scenarios are config-only
- config split policy: decide exactly which values are duplicated into the base
  `funds` row for query/read convenience and which values live only inside
  `fundConfigs.config`
- legacy-system field policy: classify `engineResults` explicitly as:
  - forbidden in new user-authored `v1` writes, or
  - transitional compatibility-only input with an explicit sunset plan

### Suggested Execution Order

1. Freeze the current inputs before changing them:
   - one representative wizard-submit payload from the machine
   - one flat legacy payload matching `FundInputDTOSchema`
   - one legacy `basics` / `strategy` payload if still reachable
2. Define `FundWriteV1` in `shared/contracts/fund-write-v1.ts`:
   - exact field names
   - exact units / scales
   - exact enum casing
   - no persistence-only fields
3. Add server-side normalization at the authoritative `POST /api/funds`
   boundary:
   - detect legacy flat payload
   - detect legacy `basics` / `strategy` payload
   - normalize all accepted inputs into one canonical `FundWriteV1`
   - emit `legacy_fund_write` telemetry on any non-canonical input path
4. Extract one explicit client submit adapter so `modeling-wizard.machine.ts`
   stops constructing the request body inline.
5. Define `FundConfigPayload` from the canonical DTO after removing any fields
   intentionally owned by the base `funds` row.
6. Write the wizard-to-DTO-to-storage appendix before implementing persistence
   mapping, so unresolved unit or ownership gaps are caught while changes are
   still cheap.
7. Add focused tests for:
   - canonical `v1` validation
   - wizard-to-`v1` mapping
   - legacy flat-to-`v1` normalization
   - legacy `basics` / `strategy` normalization
   - unit and casing conversion edges for fees, waterfall, and recycling

### Minimum Appendix Coverage Seed

Use this as the minimum starting inventory for the Phase 1 field-diff appendix.
It is not the full table, but it names the highest-risk drift already visible in
the repo.

| Wizard source                                                                                                         | Current competing shapes                                                                                                                                                                     | Phase 1 decision required                                                                                                             | Likely authoritative home                                                                                |
| --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `generalInfo.fundName`, `fundSize`, `vintageYear`, `establishmentDate`, `isEvergreen`, `fundLife`, `investmentPeriod` | flat `FundInputDTOSchema`; flat `CreateFundSchema`; `funds` row columns only partially overlap                                                                                               | settle money units for `fundSize`; decide which general-info fields belong in base row versus config payload                          | split between `funds` and `fundConfigs.config.generalInfo`                                               |
| `sectorProfiles.sectorProfiles[]`                                                                                     | no current public write schema; older `shared/types.ts` only has simplified `investmentStrategy.sectorProfiles[].targetPercentage`                                                           | reconcile `allocation` versus `targetPercentage` and preserve stage cohorts                                                           | `fundConfigs.config`                                                                                     |
| `capitalAllocation.*`                                                                                                 | no current public write schema; reserve bridge already consumes current wizard shape                                                                                                         | freeze `reserveRatio`/participation scale and pacing structure without leaking engine-only assumptions into the public DTO            | `fundConfigs.config`                                                                                     |
| `feesExpenses.managementFee`                                                                                          | current server top-level `managementFee` is decimal `0-1`; wizard fee rate is percentage `0-5` with basis and optional step-down                                                             | choose the single authoritative source and conversion owner                                                                           | summary fields in `funds`, full detail in `fundConfigs.config.feesExpenses`                              |
| `feesExpenses.carriedInterest` plus `waterfall.*`                                                                     | current server top-level `carryPercentage`; shared `WaterfallSchema` only supports uppercase `AMERICAN` + carry vesting; wizard supports `american                                           | hybrid`, preferred return, catch-up, carried interest, and optional tiers                                                             | decide whether `v1` separates economics from distribution policy or codifies both as one nested contract | mostly `fundConfigs.config` with any query-critical summary duplicated intentionally |
| `exitRecycling.*`                                                                                                     | shared `ExitRecyclingSchema` uses `recyclePercentage`, `maxRecycleAmount`, `recycleWindowMonths`; wizard uses `recyclingCap`, `recyclingPeriod`, `exitRecyclingRate`, `mgmtFeeRecyclingRate` | reconcile naming, optionality, and units                                                                                              | `fundConfigs.config`                                                                                     |
| `scenarios.enabled` plus `scenarios[]`                                                                                | no current authoritative write schema                                                                                                                                                        | define whether scenarios are persisted verbatim, normalized, or versioned separately; do not let this remain an untyped JSON grab-bag | `fundConfigs.config`                                                                                     |
| `engineResults`                                                                                                       | accepted today by `CreateFundSchema` but not authored by the wizard                                                                                                                          | classify as legacy/system-owned only; exclude from canonical user-write DTO unless explicitly justified                               | not part of user-authored `FundWriteV1`                                                                  |

### Validation

Phase 1 should not rely on broad end-to-end behavior as its first signal.
Require narrow proof first:

- schema tests for `shared/contracts/fund-write-v1.ts`
- adapter tests for wizard-to-DTO and legacy-to-DTO normalization
- contract tests proving canonical and legacy payloads normalize into the same
  `FundWriteV1`
- one explicit audit result showing which overlapping server-local schemas were
  deprecated, retained, or fenced off

### Exit criteria

- one canonical public write DTO exists for the endpoint version
- legacy compatibility policy is explicit and bounded
- legacy-retirement instrumentation and sunset criteria are explicit
- wizard-to-DTO-to-storage field-diff appendix exists before implementation
- `FundConfigPayload` is explicit and validated at the application boundary
- wizard-to-write adapter exists
- storage mapping is explicit
- overlapping write schemas are reconciled or deprecated
- waterfall/scenario drift is resolved or isolated behind adapters

## Phase 2A: Authoritative Write Home And Atomic Persistence

### Goal

Choose the authoritative persisted home for the full wizard payload and make
that write path atomic before adding lifecycle or results-read truth on top.

### Primary files

- `server/routes/funds.ts`
- `server/storage.ts`
- `shared/schema/fund.ts`
- `server/routes/fund-config.ts`

### Required work

1. Implement the storage mapping from Phase 1.
2. Decide and implement the initial write behavior:
   - fund + initial draft config
   - or fund + initial published config
3. Make the authoritative write-home explicit for every persisted field:
   - base fund row fields owned by `funds`
   - full wizard configuration owned by `fundConfigs.config`
   - any temporary compatibility write-through fields retained during cutover
4. Require transactional atomicity for multi-table writes:
   - the `funds` row and `fundConfigs` row must be written in one database
     transaction (or the storage abstraction equivalent for MemStorage)
   - if any part of the write fails, no partial state is visible to reads
   - if transactional guarantees are not achievable, define an explicit
     compensating rollback and a visibility rule for half-written drafts (e.g.,
     a `funds.status = "draft_incomplete"` sentinel that the read model filters
     out)
5. Add compatibility or migration handling for existing persisted rows/configs,
   including `MemStorage` parity if schema changes are introduced.
6. Remove any remaining code path that validates rich wizard input and discards
   it.

### Exit criteria

- the full wizard payload has an authoritative persisted home
- `funds` versus `fundConfigs.config` ownership is explicit
- multi-table writes are transactional or have explicit compensating rollback
  and visibility rules for partial-write states
- migration/compatibility handling is defined for existing rows/configs
- no rich wizard input is accepted and then discarded on write

## Phase 2B: Lifecycle And Authoritative Read Fields

### Goal

Define truthful lifecycle and authoritative read fields after the write-home is
stable, without collapsing config publication state into calculation state.

### Primary files

- `server/storage.ts`
- `shared/schema/fund.ts`
- `server/routes/fund-config.ts`

### Required work

1. Define the config lifecycle axis using persisted config state:
   - `version`
   - `isDraft`
   - `isPublished`
   - `publishedAt` where applicable
2. Default calculation lifecycle to a derived model based on the authoritative
   snapshot store and explicit incomplete states exposed by the read model.
3. Only if a concrete gap is demonstrated, elevate calculation lifecycle to
   persisted explicit state and define:
   - `not_requested`
   - `submitted`
   - `calculating`
   - `ready`
   - `failed`
   - `lastCalculatedAt` and specify the migration plus storage owner.
4. Define the derivation contract and the authoritative read-model fields
   exposed to API/UI.
5. Classify `funds.engineResults` explicitly as a legacy compatibility field:
   - forbidden for new authoritative reads
   - optionally retained as transitional write-through only if needed during
     cutover
   - not the source of truth for the Phase 3 results read model
6. Document illegal transitions and which store owns each state field.
7. Create a field-ownership table.
8. Ensure memory and database storage expose the same lifecycle/read-field
   contract closely enough for the batch tests to be meaningful.

### Exit criteria

- config lifecycle and calculation lifecycle are explicit and non-conflated
- derived calculation lifecycle is the default and any persisted alternative is
  justified explicitly
- authoritative read fields are explicit
- `funds.engineResults` is demoted from authoritative read source
- field ownership is explicit
- memory and database storage behave consistently enough for the contract

## Phase 3: Results Read Model And Truthfulness

### Goal

Replace session-storage reconstruction and fabricated outputs with one explicit
server-backed read model at `GET /api/funds/:id/results`, derived from persisted
config and the authoritative `fund_snapshots` store unless a dedicated
projection is proven necessary.

### Primary files

- `client/src/pages/fund-model-results.tsx`
- `server/routes.ts`
- `server/routes/fund-results.ts` if extracted during this phase
- `server/routes/fund-config.ts`
- `tests/integration/wizard-to-results-e2e.test.ts`

### Required work

1. Implement `GET /api/funds/:id/results` as the canonical results read-back
   path.
2. Define a versioned public response DTO for `GET /api/funds/:id/results` v1:
   - complete response shape with field names, types, units, and precision
   - explicit incomplete-state shape when authoritative results are not ready
     (e.g., `{ status: "pending", configVersion: number, submittedAt: string }`)
   - error contract: 400 (invalid ID), 404 (fund not found), 500 (internal)
   - place in `shared/contracts/fund-results-v1.ts` (boundary-specific module)
3. Use persisted config plus the latest relevant row(s) from `fund_snapshots` as
   the default authoritative read source behind that endpoint.
4. Add a dedicated results projection only if a concrete missing-field or
   performance requirement is demonstrated and recorded.
5. Remove placeholder financial values and synthetic scenarios.
6. Render config lifecycle and calculation lifecycle truthfully.
7. If authoritative snapshots are not ready or no authoritative snapshot writer
   is available yet, return truthful pending/config-only state rather than
   inventing a snapshot-backed result model on the fly.
8. Do not serve Phase 3 results from `funds.engineResults`; use snapshots as the
   authoritative new-read source.
9. Commit a named integration acceptance test for the truthful wizard-to-results
   path at `tests/integration/wizard-to-results-e2e.test.ts`.

### Exit criteria

- the results page no longer depends on session storage for truth
- the page no longer fabricates financial outputs
- `GET /api/funds/:id/results` exists as the canonical server-backed read model
- `fund_snapshots` is the default authoritative snapshot store for Phase 3
  reads, or the endpoint returns truthful pending/config-only state instead
- no new results projection exists without a demonstrated need
- `funds.engineResults` is not used as the authoritative Phase 3 read source
- a versioned public response DTO exists for the results endpoint with explicit
  incomplete-state and error shapes
- the wizard-to-results acceptance test exists as a committed runnable test

## Phase 4: Funds Route Normalization And Boundary Cleanup

### Goal

Normalize fund-route conventions and clean server/client boundary violations
after write and read contracts are stable.

### Note

On the primary `registerRoutes()` path, `funds` is already mounted. This phase
is not about pretending the route is absent. It is about deduplication,
normalization, and truthful end-to-end behavior.

If a release-supported surface identified in Phase 0A cannot truthfully proxy or
share the canonical owner without a minimal shared extraction, amend the ADR and
pull forward only that minimum extraction. Do not broaden that exception into
general boundary cleanup ahead of Phase 4.

### Primary files

- `server/routes.ts`
- `server/routes/funds.ts`
- `server/routes/calculations.ts`
- `server/services/projected-metrics-calculator.ts`
- `workers/reserve-worker.ts`
- `workers/pacing-worker.ts`
- any shared replacement modules

### Required work

1. Resolve inline versus mounted fund-route duplication.
2. Normalize route path conventions in `routes/funds.ts`.
3. Keep the canonical funds ownership table as a machine-checked manifest. For a
   single maintainer, a checked TypeScript manifest plus contract tests is
   sufficient; a broader CI system can remain follow-on hardening.
4. Remove client-import violations using an explicit replacement table:
   - current import
   - target shared module
   - missing extraction work
   - validation required after replacement
5. Add a focused boundary regression guard for the normalized Phase 4 files if
   full-repo lint remains too noisy to act as the primary signal.
6. Prove that wizard submission now succeeds end to end on the authoritative
   runtime path.
7. Prove that persisted data reads back through the chosen results model.
8. Keep any temporary compatibility adapter on an explicit removal condition.
   For the current funds create flow, the legacy `basics` acceptance path must
   be deleted once the wizard emits canonical `FundCreateV1` directly and before
   a second public write DTO revision is introduced.

### Exit criteria

- duplicate fund-route ownership is removed
- route ownership manifest exists for the canonical funds surface and remains
  aligned with contract tests
- route prefixes are internally consistent
- boundary imports have named shared replacements
- focused boundary regression protection exists for the normalized Phase 4 files
- wizard submit and readback work end to end

## Follow-On Hardening (Out Of Critical Path)

### Goal

After the core `funds` flow is truthful end to end, extend route reachability
and harden ownership drift prevention if still needed.

### Primary files

- `server/routes/liquidity.ts`
- `server/routes/capital-allocation.ts`
- route ownership manifest
- CI workflow files if needed

### Required work

1. Extend the existing route ownership manifest into broader CI/runtime-surface
   drift checks.
2. Add CI checks for ownership and runtime-surface drift.
3. Register `liquidity` and `capital-allocation` only after `funds` is proven
   working.
4. Roll them out in separate rollback-friendly batches with contract tests.

### Exit criteria

- route ownership manifest covers the hardened surfaces
- CI drift protection exists
- `funds` is already working before secondary route rollout

## Explicitly Deferred

- broad Wave 3 lint cleanup beyond touched files
- frontend auth unless the chosen create/read path is JWT-protected or release
  scope demands it
- broad route-registration expansion beyond the named endpoints
- secondary route rollout and generalized CI drift guards until the core funds
  flow is shipped or explicitly stabilized

## Phase Acceptance And Rollback

| Phase | Business acceptance check                                                                                                                            | Rollback trigger                                                                                                                                                                                                                                             |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `0A`  | ADR, release-support matrix, ownership table, and snapshots make the supported `/api/funds` path and contract explicit without behavior change.      | Stop before cutover if deployment targets, supported surfaces, or the canonical POST contract cannot be stated unambiguously.                                                                                                                                |
| `0B`  | Supported runtime surfaces resolve `POST /api/funds` through the chosen owner or explicit proxy path and preserve the router-owned wrapper contract. | Revert the cutover if smoke tests fail, the wrapper contract drifts, or a release-supported surface remains ambiguous.                                                                                                                                       |
| `1`   | Current wizard submit payload and canonical DTO both normalize into the same write contract.                                                         | Stop before client cutover if legacy acceptance requires unbounded shapes, schema overlap remains ambiguous, or field ownership is unclear.                                                                                                                  |
| `2A`  | A created fund round-trips with the full intended payload persisted at its authoritative write-home with no dropped fields.                          | Revert persistence changes if rich wizard fields still drop on write or multi-table writes cannot be made atomic or explicitly compensating.                                                                                                                 |
| `2B`  | Persisted config state and calculation/read state are truthful, explicit, and non-conflated.                                                         | Revert lifecycle/read-field changes if state ownership cannot be made explicit or authoritative reads still depend on `engineResults`.                                                                                                                       |
| `3`   | Submit, refresh, and results reload show the same persisted state with no fabricated financial outputs.                                              | Revert results cutover if session storage remains the truth source, refreshed results diverge from initial load, or pending/config-only fallback is not truthful.                                                                                            |
| `4`   | Normalized routes and shared replacements preserve submit and read-back behavior end to end.                                                         | Revert the affected checkpoint if canonical endpoint snapshots drift, the ownership manifest no longer matches the supported runtime, a normalized file reimports `client/` runtime logic, or create -> readback stops returning the authored fund identity. |

## Validation And Gates

### Global Business Acceptance Test

On the authoritative runtime surface:

1. submit the wizard
2. refresh or revisit the results route
3. confirm the same persisted state reads back
4. confirm the page shows either authoritative persisted results or truthful
   pending/config-only state
5. confirm no financial outputs come from `sessionStorage` or fabricated
   placeholders

This acceptance flow should be enforced by
`tests/integration/wizard-to-results-e2e.test.ts`.

### Per-Batch Gates

1. targeted tests for the touched contract or route
2. targeted no-cache ESLint on touched files where feasible
3. `npm run guardrails:check`
4. boot-path smoke test if endpoint ownership, route topology, or entrypoint
   surface changed

### Integration Checkpoint Gates

1. `npm run test:unit --changed`
2. `npm run baseline:progress`
3. `npm run lint:eslint`
4. broader integration or smoke tests required by the batch bundle

Do not merge any batch that changes runtime or route topology without the
corresponding smoke test across supported surfaces.

Do not ship any runtime or route-topology batch unless the release-support
matrix still marks each touched surface as supported, proxied, or intentionally
out of scope.

## Recommended Next Batch

Phase 0A is complete. The next batch should be Phase 0B only.

### Batch name

`Phase 0B: Authoritative /api/funds owner cutover`

### Owned files

- `server/routes.ts`
- `server/routes/funds.ts`
- `tests/unit/contract/funds-endpoint-snapshots.test.ts`
- `tests/unit/contract/funds-route-ownership.test.ts`
- `docs/evidence/endpoint-ownership.md`

### Out of scope

- `server/app.ts`
- `server/index.ts`
- `api/[[...slug]].ts`
- `api/index.ts`
- `api/funds.ts`
- any DTO, persistence, wizard-submit, or results-page edits

### Concrete edits

1. Change the calculate-route declaration in `server/routes/funds.ts` so the
   mounted path resolves to `POST /api/funds/calculate`.
2. Remove or quarantine the shadowed inline `POST /api/funds` handler from
   `server/routes.ts`.
3. Leave the inline `GET /api/funds` and `GET /api/funds/:id` handlers
   untouched.
4. Convert the Phase 0A route-ownership and snapshot tests from observational
   documentation into post-cutover assertions:
   - `POST /api/funds` is router-owned
   - `POST /api/funds` preserves the router-owned
     `201 { success, data, message }` contract
   - `POST /api/funds/calculate` is reachable at `/api/funds/calculate`
   - `POST /api/api/funds/calculate` is not the canonical path
   - inline `GET` handlers remain reachable
5. Update `docs/evidence/endpoint-ownership.md` to reflect the post-cutover
   state and record that Vercel surfaces remain out of scope.

### Batch exit criteria

- authoritative `POST /api/funds` ownership is singular and documented
- authoritative `POST /api/funds/calculate` path is corrected
- inline fund GET ownership is preserved
- all 0B-owned tests pass
- no non-authoritative runtime files were modified

### Per-batch validation

- targeted no-cache ESLint on the owned files
- `npx vitest run tests/unit/contract/funds-endpoint-snapshots.test.ts tests/unit/contract/funds-route-ownership.test.ts`
- one boot-path smoke proof against the authoritative runtime assembly used by
  the contract tests

### Integration checkpoint after merge

- `npm run test:unit --changed`
- `npm run baseline:progress`
- `npm run lint:eslint`

### Rollback rule

Revert the batch if the authoritative runtime no longer provides all four
documented contracts:

- `GET /api/funds`
- `GET /api/funds/:id`
- `POST /api/funds`
- `POST /api/funds/calculate`

Do not proceed to Phase 1 until this batch is green.

## Appendix A: Evidence Map

### Code-Verified Facts

- `package.json:47` `dev:api` script runs `npx tsx server/main.ts`.
- `server/main.ts:8-10` bootstraps `server.ts` via `bootstrap()`.
- `server/server.ts:299` calls `registerRoutes()` from `server/routes.ts`.
- `scripts/build-server.mjs:20` compiles `server/bootstrap.ts` to
  `dist/index.js`.
- `package.json:66` `start` script runs `node dist/index.js`.
- `Dockerfile:63` runs `node dist/index.js` via CMD.
- `Dockerfile.railway:45` runs `node dist/index.js` via CMD.
- `server/routes.ts:47-48` mounts `routes/funds.ts` under `/api`.
- `server/routes.ts:138-149` defines inline `GET /api/funds`.
- `server/routes.ts:151-187` defines inline `GET /api/funds/:id`.
- `server/routes.ts:189-232` defines inline `POST /api/funds` (shadowed by
  router).
- `server/routes/funds.ts:63` defines `POST /funds` (mounted as `/api/funds`).
- `server/routes/funds.ts:114` defines `POST /api/funds/calculate` (BUG:
  resolves to `/api/api/funds/calculate` due to mount prefix).
- `api/[[...slug]].ts:17` imports `server/app.js` via dynamic import.
- `api/funds.ts:26-41` is a Vercel stub gated by `ENABLE_API_STUB=true`.
- `client/src/machines/modeling-wizard.machine.ts:570-603` posts to `/api/funds`
  using `fundName`/`fundSize` field names.
- `client/src/pages/fund-model-results.tsx:113-217` reads `sessionStorage` and
  fabricates financial outputs.
- `shared/schema/fund.ts:30-43` separates `funds.status` from `fundConfigs`
  version/draft/published state.

### Deployment Assumptions Pending Validation

- whether Vercel preview or production traffic can hit `api/funds.ts` directly
- whether `server/app.ts` must remain release-supported or only
  adapter-compatible
- whether the mounted `POST /api/funds` handler is shadowed in every supported
  runtime exactly as expected by the Phase 0A/0B smoke harness

### Working Hypotheses Pending Runtime Validation

- on the authoritative runtime path, the mounted `POST /funds` route is likely
  to shadow the later inline `POST /api/funds`

## Appendix B: Optional Execution Assets

These assets are operator aids, not new phases or new sources of truth.

Use them only where they simplify execution without changing the plan's linear
dependency structure.

### Structural Search

- `ast-grep 0.40.0` on PATH
- plugin skill path:
  `C:\Users\nikhi\.claude\plugins\cache\ast-grep-marketplace\ast-grep\1.0.0\skills\ast-grep\SKILL.md`

Recommended use:

- structurally enumerate `/api/funds` owners
- find mount-prefix inconsistencies
- find server/client boundary-import violations
- later promote stable queries into CI drift guards if needed

### ADR Shape

- ADR template:
  `C:\Users\nikhi\.claude\plugins\cache\thinking-frameworks-marketplace\thinking-frameworks-skills\1.0.0\skills\adr-architecture\resources\template.md`

Recommended use:

- keep the runtime-authority ADR consistent
- force alternatives, consequences, rollout, rollback, and success criteria into
  one fixed deliverable

### Contract And Schema Guards

- repo agent: `C:\dev\Updog_restore\.claude\agents\schema-drift-checker.md`
- repo skill: `C:\dev\Updog_restore\.claude\skills\database-schema-evolution.md`
- repo agent: `C:\dev\Updog_restore\.claude\agents\db-migration.md`

Recommended use:

- run schema-drift review at Phase 1, Phase 2A, and Phase 2B exits
- require migration-planning review before any explicit schema change to
  `funds`, `fundConfigs`, or related read-model storage
- keep DTO, validator, storage, fixture, and migration layers aligned

### Test Assets

- repo agent: `C:\dev\Updog_restore\.claude\agents\test-scaffolder.md`
- repo agent: `C:\dev\Updog_restore\.claude\agents\test-automator.md`
- repo agent: `C:\dev\Updog_restore\.claude\agents\pr-test-analyzer.md`
- repo skill:
  `C:\dev\Updog_restore\.claude\skills\test-fixture-generator\SKILL.md`
- repo skill: `C:\dev\Updog_restore\.claude\skills\test-pyramid\SKILL.md`

Recommended use:

- scaffold the `/api/funds` snapshot/contract harness in Phase 0A
- extend that harness through Phase 3/4 readback validation
- keep one high-value wizard-to-results acceptance flow and avoid unnecessary
  E2E sprawl
- review legacy-field bridging, validation failures, negative route paths, and
  refresh/readback behavior explicitly

### API Consistency

- repo skill: `C:\dev\Updog_restore\.claude\skills\api-design-principles.md`

Recommended use:

- harden `POST /api/funds` DTO/error/idempotency behavior
- normalize route shapes and error contracts during Phase 4

### Wizard Stability

- repo skill:
  `C:\dev\Updog_restore\.claude\skills\react-hook-form-stability\SKILL.md`
- repo agent: `C:\dev\Updog_restore\.claude\agents\silent-failure-hunter.md`

Recommended use:

- avoid autosave/reset/watch regressions during wizard submit adapter work
- explicitly review Phase 3 for silent fallbacks, placeholder metrics, and
  `sessionStorage` truth leaks

### Post-Batch Validation Aid

- repo agent: `C:\dev\Updog_restore\.claude\agents\workflow-orchestrator.md`

Recommended use:

- after Phases 0B-4, run a touched-file-driven validation pass so route, schema,
  and test follow-up is not tracked manually

### Not Required For This Plan

- hook-driven or event-sourced orchestration plugins
- Phoenix truth-case assets that depend on a runner/harness not currently active
  in this track
- generic code-review or bugfix wrappers that do not materially change the
  contract-integrity workflow
