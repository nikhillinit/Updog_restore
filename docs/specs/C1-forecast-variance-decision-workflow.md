---
status: DRAFT
audience: agents
last_updated: 2026-09-08
owner: Repository Owner
scope: forecast-variance-decision-workflow-v1
source_sha: c9361248a486a346f3b32b5212cad582373b3b3a
body_sha256: 27ab2ced6b38769450e89dd416b23a103fef7d0449629207cbc2ff683778774f
approval_sha256: null
reviewed_by: null
reviewed_at: null
approved_by: null
approved_at: null
approval:
  state: unapproved
source_paths:
  - client/src/app/app-routes.tsx
  - client/src/components/dashboard/dual-forecast-dashboard.tsx
  - client/src/hooks/useDecisions.ts
  - client/src/pages/forecasting.tsx
  - migrations/meta/_journal.json
  - server/lib/database-backed-idempotency-routes.ts
  - server/lib/idempotent-command.ts
  - server/route-policy/api-route-policy-registry.ts
  - server/routes/dual-forecast.ts
  - server/routes/internal-analysis.ts
  - server/routes/mount-common-routes.ts
  - server/routes/operating-object-decisions.ts
  - server/services/construction-forecast-calculator.ts
  - server/services/current-forecast-reference-service.ts
  - server/services/current-forecast-serving-seam.ts
  - server/services/current-forecast-v2-service.ts
  - server/services/current-plan-version-service.ts
  - server/services/financial-facts-snapshot-service.ts
  - server/services/financial-facts/financial-facts-basis-ref.ts
  - server/services/financial-facts/parse-persisted-facts-row.ts
  - server/services/internal-analysis/analysis-checkpoint-service.ts
  - server/services/metrics-aggregator.ts
  - server/services/operating-objects/decision-evidence-link-service.ts
  - server/services/operating-objects/decision-service.ts
  - shared/contracts/current-forecast-v2.contract.ts
  - shared/contracts/current-plan-version-v1.contract.ts
  - shared/contracts/dual-forecast/dual-forecast-response.contract.ts
  - shared/contracts/financial-facts-snapshot-v1.contract.ts
  - shared/contracts/internal-analysis/analysis-reference-snapshot-v1.contract.ts
  - shared/core/cohorts/CohortProjectionV2.ts
  - shared/lib/canonical-hash.ts
  - shared/lib/current-plan/derive-current-plan-v1.ts
  - shared/routes/api-route-manifest.ts
  - shared/schema/current-forecast-references.ts
  - shared/schema/current-plans.ts
  - shared/schema/fund.ts
  - shared/schema/internal-analysis.ts
---

# C1 Forecast Variance Decision Workflow

## Goal and Authority

Explain the forecast effect of an assumption change using two explicit persisted
sources, save immutable analysis evidence, and create a decision with its
evidence link atomically. The owner selected **After-assumption** on September
7, 2026. This document proposes the concrete source and attribution contract; it
does not record owner approval. Product implementation remains blocked on named
exact-body approval, Program A GO, and final runtime identity. No provider
action, activation, new forecast-reference table, or client financial
calculation is authorized here.

## Persisted Before and After Sources

The comparison request names `beforeReferenceId`, `beforePlanVersionId`,
`beforeFundSnapshotId`, `afterReferenceId`, `afterPlanVersionId`, and
`afterFundSnapshotId`, plus the expected plan versions, mode version, source
hashes, and full facts basis. All IDs are required; no omitted ID means
"latest". The server loads both plans by ID, each reference by ID, and each
same-fund `fund_snapshots` row with type `CURRENT_FORECAST_V2`. The reference's
`fundSnapshotId` is authoritative; the served wire block does not supply it.

An admitted pair meets all of these conditions:

1. Both reference/plan/snapshot/config/facts records belong to the authorized
   fund. Each reference's plan ID, snapshot ID, facts ID, `inputHash`,
   `resultHash`, `assumptionsHash`, engine version, and methodology version
   equal its persisted V2 payload and the request's expected identity. Result
   hashes must be non-null. Each plan's ID, version, source config ID/version,
   and assumptions hash match the pinned persisted rows; verify the plan
   derivation against that exact config and facts input, never a current config
   lookup.
2. Both payloads carry the same complete `FinancialFactsBasisRef`: `schemaId`,
   `fundId`, `snapshotId`, `snapshotInputHash`, `sourceFactsInputHash`,
   `policyVersion`, `asOfDate`, and `knowledgeCutoff`. Resolve and strict-parse
   that persisted facts row and verify the full identity. Both plans'
   `sourceFactsSnapshotId` and both references' facts IDs equal `snapshotId`. An
   absent legacy basis reference is `qualified_basis_unavailable`, not a basis
   inferred from a coincidentally matching integer ID. Newer facts do not
   silently replace the requested basis; a draft's other components must share
   it.
3. Before and after plans are distinct. Require
   `after.supersedesVersionId === before.id` and
   `before.supersededByVersionId === after.id`; after is the unique current plan
   head. Both references are non-candidates; before's `supersededByReferenceId`
   equals after's ID and after is the unique non-superseded accepted reference.
   The intended before plan/reference supersession is expected, not stale
   evidence. Skipped successors, branches, and unrelated pairs are refused.
4. At save, live serving resolves the accepted reference head and held serving
   resolves exactly `held.referenceId` through
   `getCurrentForecastReferenceById`. The resolved reference must be the
   requested after reference; also check the current mode version and cutover
   pointer. Verify every identity available in the served wire block against
   after. Never replace a requested source with the current head, a latest
   snapshot, or a construction forecast calculated on read.
5. Engine, methodology, and plan transformation versions must be equal and
   supported. Pin each snapshot's evaluation clock (`snapshotTime`) as well as
   the common facts as-of/cutoff. Input and result hashes can differ between
   sides; equality is required within each source, not between distinct
   assumptions. Compare only exact matching measures, units, and period
   boundaries.

Read-only display may report missing or stale sources. Saving actionable C1
analysis evidence and first-time decision creation require the complete pair to
pass again inside their write transaction. A historical saved reference remains
readable after a head change; a new decision action must refresh stale evidence.
Previously completed idempotent commands replay their original immutable result.

### Producer Prerequisites

The after plan, forecast snapshot, and accepted reference must already exist
before C1 comparison/save. C1 never mints assumptions or advances a served
pointer. `mintCurrentPlanVersion` currently reads the latest published config
and latest facts before its transaction; its API does not accept pinned
config/facts IDs or an expected predecessor. Its existing idempotency does not
establish the required pinned producer contract.
`runCurrentForecastV2WithReceipt` can select explicit plan/facts IDs, but that
alone does not prove atomic minting and acceptance.

If qualifying persisted sources do not exist, return `after_source_unavailable`.
A separate approved producer change would need exact config ID/version/hash,
full facts basis, expected predecessor/head, expected mode version, clock, and
canonical idempotency material; transactional head checks, duplicate replay,
conflicting-key refusal, and zero-write race/rollback proofs are prerequisites.
Reuse existing versioned persistence. No new table or producer mutation is
chosen by this document. The supplied F1 ledger is actuals context, not an
assumption source; unknown ledger fields cannot supply missing assumptions.

## Attribution Contract (Proposed)

Input differences and forecast-output differences are separate evidence. Neither
alone proves a driver caused a forecast change. The proposed methodology is
`forecast-variance-sequential-substitution/1.0.0`: deterministic model
sensitivity conditional on the pinned inputs, not empirical or order-independent
causality. Its implementation and persisted counterfactual evidence do not exist
at this source SHA and remain prerequisites for actionable delivery.

The canonical taxonomy order is `check_size`, `entry_valuation`, `ownership`,
`pace`, `allocation_mix`, `graduation_exit`, `follow_on_participation`,
`deployed_reserves`, `remaining_reserves`, `fees_expenses`, `recycling`,
`blockers`. There is no approved four-category delivery limit. Each category
appears exactly once as a category entry, in this order. An entry can contain
both verified effects and omissions for different measures or periods. Put
entries with at least one verified effect in `drivers`; put entries with no
verified effects in `omissions`. Separately show verified input/output/state
observations without labeling them attribution.

| Category                | Persisted evidence and proposed disjoint input group                                                                                                                 | Availability or prerequisite                                                                                                                                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| check_size              | `cohortAssumptions.averageInitialCheckUsd`; allocation check amounts are source observations                                                                         | The cohort engine consumes the average check. Attribute only through a verified counterfactual; a money effect may be exactly zero while company counts change.                                                                       |
| entry_valuation         | No entry-valuation leaf in `CurrentPlanVersionV1`                                                                                                                    | `assumption_field_unavailable`; requires a versioned producer and an engine input before attribution.                                                                                                                                 |
| ownership               | No target-ownership leaf; current plan derivation rejects ownership strategy                                                                                         | `assumption_field_unavailable`; requires supported persisted assumptions and engine behavior.                                                                                                                                         |
| pace                    | `pacingAssumptions.deploymentQuarters` and `pacingAssumptions.quarterlyDeploymentPcts` as one group                                                                  | Compare exact quarter keys. Different horizons omit unmatched periods; no interpolation or zero fill.                                                                                                                                 |
| allocation_mix          | `cohortAssumptions.stageDistribution` as one normalized group; allocation capital/stage rows are observations                                                        | Requires matching stable stage keys and valid normalized intermediate plans; changed key sets need a separately specified alignment rule.                                                                                             |
| graduation_exit         | `cohortAssumptions.graduationMatrix` and `cohortAssumptions.exitAssumptions` as one group                                                                            | Current derivation emits neutral self-graduation and exit placeholders. Richer assumptions require a persisted producer; do not describe those placeholders as owner-entered economics.                                               |
| follow_on_participation | `pacingAssumptions.followOnReservePct`; allocation `followOnStrategy`, `followOnParticipationPct`, and `followOnCapitalUsd` remain authenticated source observations | Fields are persisted; current cohort projection does not directly consume this group. Input differences are observations; an effect requires explicit engine support or a verified zero-effect counterfactual for the named measures. |
| deployed_reserves       | V2 `series.deployedUsd` is cumulative total deployment, not reserve-only deployment                                                                                  | `reserve_measure_unavailable`; requires reserve-specific persisted inputs/outputs. Total deployment may be an output observation, never a second causal contribution.                                                                 |
| remaining_reserves      | V2 `remainingDeployableCapitalUsd` is total deployable residual, not remaining reserves                                                                              | `reserve_measure_unavailable`; do not relabel it. Requires reserve-specific persisted measures.                                                                                                                                       |
| fees_expenses           | `pacingAssumptions.annualFeeDragPct`; projected fee dollars are an output                                                                                            | Fee drag is comparable, but expense assumptions are not separately persisted. Disclose that boundary; do not claim fee/expense coverage from one ratio.                                                                               |
| recycling               | Only `reservePolicyVersion` and facts-side recallable distributions exist                                                                                            | `assumption_field_unavailable`; a policy label or actual cash flow is not a before/after recycling setting.                                                                                                                           |
| blockers                | Both persisted V2 statuses, unavailable reasons, and warnings                                                                                                        | Compare as state observations; `non_numeric_state` for attribution. Never sum a blocker into financial effects.                                                                                                                       |

For this pinned method, the economic comparison projection contains exactly
`deployableCapitalUsd`, `pacingAssumptions`, `cohortAssumptions`, and
`reservePolicyVersion`. The pinned V2 engine does not consume `allocations` rows
for economic evaluation. Those rows remain authenticated source observations:
retain them in the full plan and assumptions hashes and reproduce them from the
pinned configuration when verifying each endpoint. Excluding them from
substitution and final economic equality never excludes them from source
integrity checks. A changed allocation check, pacing quarter, or capital weight
must not fail as `unmapped_input` merely because its observation row also
changes. Every affected aggregate inside the projection still participates in
substitution or unmapped-input refusal.

Category effects describe sensitivity to derived model inputs, not the causal
effect of a primitive configuration edit. For example, changing allocation
weights can change both stage distribution and the weighted average check. Do
not rederive intermediate projections from observation rows or count those rows
again as effects. Any engine change that consumes an excluded field requires a
revised, approved projection before attribution can be complete.

No projection leaf belongs to two substitution groups. All other economic
leaves, including `deployableCapitalUsd`, must remain unchanged for complete
attribution under this version. A changed unmapped leaf yields `unmapped_input`
and an explicit unattributed residual; it is not silently assigned to fees or
allocation mix. `deployableCapitalUsd` depends jointly on fund size, fee
compilation, and horizon. A fuller causal mapping needs an approved version of
the pinned transformation that regenerates dependent fields from disjoint
primitive assumptions. IDs, versions, hashes, creation timestamps, and successor
links are identity metadata, not economic driver groups. No path-based "changed
leaf" shortcut may ignore an engine-consumed input.

For each comparable measure/period, persist the following proof:

1. Re-evaluate the exact before and after endpoints with the pinned facts,
   engine, transformation, and their recorded clocks. Each endpoint must
   reproduce its persisted economic output and result hash using the existing
   hash convention. Legacy inputs whose derivation preimage cannot be
   reconstructed are omitted; never overwrite their stored hash to make them
   match.
2. Starting from the before economic inputs, substitute each changed supported
   group in taxonomy order. Hold facts, as-of/cutoff, engine, and all other
   inputs fixed. Record the complete intermediate economic projection,
   authenticated endpoint plan hashes, full facts basis, method/engine versions,
   clock, group paths, output, and output hash. `counterfactualInputHash` hashes
   all of that input material, not merely the V2 engine input hash (which
   identifies a plan/facts/clock tuple). These are analysis counterfactuals, not
   accepted plan/reference rows. An invalid intermediate, unsupported input,
   absent producer, or endpoint mismatch stops attribution; typed
   observations/omissions can still explain the refusal. The final hybrid must
   reproduce the after economic projection and output vector for complete
   attribution; identity-only hash differences are not economic effects.
3. For measure `m` on exact period `p`, each effect is
   `F_i(m,p) - F_(i-1)(m,p)`. Interactions are assigned to the group substituted
   later. Record that ordering limitation in the evidence and UI; do not report
   separate interaction amounts or add a derived reserve/fee output again as
   another driver.
4. Persist `totalDelta = after - before`, the ordered effects, their sum, and
   `residual = totalDelta - sum(effects)`, all at the named measure's canonical
   precision. Use Decimal arithmetic on canonical serialized values: USD 6
   places, ratios 12 places, counts integers. Require exact equality of effects
   plus residual to total delta; no epsilon or arbitrary residual tolerance. A
   nonzero residual is visibly unattributed with its reason; it cannot pass as
   complete attribution. A zero effect is available only with the same evidence
   as a nonzero effect, never as a substitute for unknown data.

The measure vector retains V2 period `deployedUsd`, `contributionsUsd`,
`distributionsUsd`, `navUsd`, `tvpi`, `dpi`, `activeCompanyCount`, and
`projectedCohortCount`, plus its named USD bridge fields and nullable `netIrr`.
Match series by `(periodStart, periodEnd, source)`. Flow, cumulative, and stock
measures are distinct; do not sum cumulative deployment or stock NAV across
periods. Compare bridge fields only at matching as-of/horizon, and net IRR only
when both complete cash-flow horizons match. Null IRR is an omission, not zero;
engine conventions such as zero-denominator ratios remain disclosed. Every
unmatched period or unavailable measure has its own omission. Exact
common-period comparisons may be available while whole-horizon attribution is
incomplete.

## Strict Wire and Persistence Shape

The implementation must define a strict `ForecastVarianceV1Schema` with:

- `contractVersion: 'forecast-variance-v1'`, `fundId`, and
  `comparisonKind: 'after_assumption'`.
- `sourceResolution: verified | refused` discriminates a verified pair from a
  refusal carrying the requested ID tuple and reason. Only the verified member
  contains complete sources and attribution; never fabricate missing identities.
- Verified `beforeSource` and `afterSource`: reference ID, plan ID/version,
  config ID/version and content hash, `fundSnapshotId`, full
  `FinancialFactsBasisRef`, evaluation clock, input/result/assumptions hashes,
  engine/methodology/transformation versions, and a canonical immutable-plan
  content hash excluding only the two successor links. Persist verified
  successor links and expected heads separately.
- `state`: independent `servingStatus: live | held`, engine status for each
  source, `basisStatus: current | stale | mixed_basis`, and
  `attributionStatus: complete | partial | unavailable`. Missing V2 means no
  variance object, not an invented `off` state. Missing pair evidence means a
  typed non-actionable object.
- Ordered `drivers`, `omissions`, `observations`, `forecastChanges`, and the
  versioned `attribution` proof described above. Each category entry has
  `category`, `effects`, and `measureOmissions`; it binds group paths and source
  identities. Each effect binds a measure, units, exact period or horizon, and
  persisted counterfactual evidence. Each measure omission names the same
  measure/period key, stage (`source | input | effect`), reason, resolvable
  source IDs, affected paths, and concrete prerequisite. If measures cannot be
  resolved, an optional `categoryOmission` carries that diagnostic and both
  arrays remain empty. Otherwise omit `categoryOmission`.
- Within an entry, `(measure, period)` keys are unique across both arrays.
  Series periods use `(periodStart, periodEnd, source)`; bridge and
  whole-horizon measures use their explicit common as-of/horizon identity. Order
  entries by taxonomy, then nested items by the declared measure vector and
  period key.
- `actionEligibility` and reason codes; `evidenceHash` is `canonicalSha256` of
  every other field. IDs and decimal strings are strict; unknown keys, duplicate
  category entries, duplicate nested measure/period keys, missing taxonomy
  coverage, or inconsistent hashes fail parse.

Reuse the analysis basis's `forecastFundSnapshotId` for the after snapshot.
Store both sources and the full proof in paired nullable `forecast_variance`
JSONB and `forecast_variance_hash char(64)` on existing analysis
drafts/references, with a both-null-or-both-present check. This is proposed
additive persistence, not an existing column claim; inspect dedicated columns
before choosing final mapping. Strict-parse and verify the complete evidence
hash before save and on every load. An input-only report or an
empty-driver/twelve-omission baseline does not satisfy selected C1 delivery.
Actionability requires live after serving, available or indicative endpoint
engines, a coherent pair, complete attribution for the named comparison horizon,
and no unattributed residual. Preserve all indicative warnings.

## Atomic Validation, Replay, and Recovery

`POST /api/funds/:fundId/evidence-linked-decisions` requires `Idempotency-Key`,
existing decision fields, and target `{ kind: 'analysis_reference', id }` with
its expected evidence hash. Hash the full canonical request, fund, contract
version, source identities, expected versions, and evidence target. Existing
`If-Match` and `xmin`/draft-version controls remain; no unconditional overwrite
is introduced.

After authorization, check for a completed same-key command before resolving
mutable heads. Same key/material returns its stored result even if a later head
exists; different material conflicts. For a new command, verify the full pair
and hashes within the same transaction as the relevant writes. Lock existing
mode, after-head, source, and draft rows in a documented deterministic order,
including rows mutated by pointer/plan writers, and validate expected versions
under those locks. Serializable isolation alone is not a head-change fence;
prove compatibility with existing writers. If serialization fails, retry the
complete transaction including the source-selection decisions. The final version
predicate and reference insert must share that transaction. A read-only precheck
outside it is insufficient. Use genuine transaction support on both production
surfaces, never a fallback to autocommit.

Analysis save, its evidence, draft close, and receipt commit together. Decision
creation and link creation commit together in their separate command; failure
must not delete a previously saved reference. A stale head/version/hash, key
conflict, parse failure, or insert failure leaves zero partial writes for the
failed command. Concurrent identical requests converge on one stored result;
conflicting requests cannot create orphan decisions, duplicate links, or partial
counterfactual evidence. Preserve existing fund authentication/write roles; do
not disclose inaccessible cross-fund IDs in errors.

| Condition                                                 | Typed result                                     | Writes from failed command |
| --------------------------------------------------------- | ------------------------------------------------ | -------------------------- |
| Inaccessible, cross-fund, or wrong snapshot type          | authorization/not-found refusal                  | 0                          |
| Missing source or full basis                              | `source_missing` / `qualified_basis_unavailable` | 0                          |
| Mixed full facts basis                                    | `mixed_basis`                                    | 0                          |
| Invalid successor, after-head or expected-version race    | `stale_reference`                                | 0                          |
| Payload, plan derivation, wire, or evidence hash mismatch | `snapshot_identity_mismatch`                     | 0                          |
| Missing/incomparable attribution evidence                 | typed omission; action disabled                  | 0                          |
| Same key, different canonical material                    | idempotency conflict                             | 0                          |
| Analysis, decision, link, or receipt insert failure       | transactional failure                            | 0                          |

Authorization precedes structural diagnostics. For visible sources, structural
refusal precedence is mixed basis, stale identity, missing source, ambiguity,
then snapshot/hash mismatch; report the first provable failure, never infer a
basis result from a missing row. Attribution omissions follow taxonomy order.
The generic mixed-basis acknowledgement path cannot override C1's pair checks.

## UI and Verification

Render server-authored source IDs, before/after values, units/horizons, driver
method, interaction limitation, omissions, residual, status, and eligibility.
Status cannot rely on color. Put an associated disabled-action explanation
before the action in keyboard order; announce live changes through a polite
status region. No browser-derived evidence, fresh client calculation, or
unsupported delta is accepted. Historical references display their recorded
source identity and state.

### Required Behavioral Cases

- Positive persisted direct-successor pair with identical full basis and
  distinct assumptions. Derive both complete plan payloads from pinned source
  configurations with `deriveCurrentPlanV1`; do not hand-edit only aggregate
  fields. Verify both endpoint reproductions, at least one measured effect,
  deterministic interaction assignment, and exact reconciliation.
- Independently vary an allocation's initial check, investment horizon, and
  capital weight. Verify changed observation rows stay authenticated without
  causing false `unmapped_input` refusals; all changed projected inputs must
  reconcile through their groups. Corrupt an observation row while retaining its
  old source hash and require source-integrity refusal.
- Same-plan legacy construction/current comparison produces the inspected empty
  driver/twelve-omission characterization only; it is never the shipping success
  fixture. Source gaps in every taxonomy category remain visible.
- Missing fields, neutral placeholders, unsupported ownership/recycling, unused
  follow-on inputs, invalid hybrid normalization, unmapped capital changes, null
  IRR, duplicate period keys, horizon mismatch, and zero versus unavailable
  effect.
- One category with a verified first-quarter effect and an unmatched
  second-quarter omission must parse; duplicate keys across its nested arrays
  must fail.
- Alter each full basis field, plan/ref/snapshot ID or hash, source config
  version, successor link, after head, mode version, or evidence hash
  independently; assert refusal and zero command writes. Intended before
  supersession must pass.
- Real PostgreSQL races for plan mint, pointer advance, draft version, and two
  concurrent saves/decision commands; exact replay after head movement,
  conflicting replay, and injected evidence/link/receipt insert failures with
  complete rollback.
- Client/E2E checks for no local math, textual status, keyboard order,
  omissions, residuals, historical evidence, and a disabled action for
  incomplete attribution.

## Exact File Manifest

These existing paths are pinned at `source_sha`. Prospective implementation/test
files in the companion plan have no baseline hash. Source observations above do
not establish production state or owner approval.

| Source path                                                                     | SHA-256 at `source_sha`                                            |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `client/src/app/app-routes.tsx`                                                 | `c074b27e602b21908e63ecf41df5aadb6615beb65df529d3c8ee79d4cc94612c` |
| `client/src/components/dashboard/dual-forecast-dashboard.tsx`                   | `9243e503d9784df8ca4d7c94ff8099396e8322b05ef55ca10f31335c1b1567ce` |
| `client/src/hooks/useDecisions.ts`                                              | `1ede4ffc07a385d0653c64f01a60d7f76bb44dcfb6e62c943cc25328ec4514dc` |
| `client/src/pages/forecasting.tsx`                                              | `f51c4964a7faf197a1da57d5861aa430e8aaa401ee55a2398940d445ae702b95` |
| `migrations/meta/_journal.json`                                                 | `b69d3827f712c6474738faa874c3bc0073e6fb444ef85a4a35ac2ea1867c82ef` |
| `server/lib/database-backed-idempotency-routes.ts`                              | `75e6a6f11aa71a16f35dbbbea7348572dbc097af46736813a8d27910a0e57743` |
| `server/lib/idempotent-command.ts`                                              | `f321fa969201209df0c661aa73b29fc73a4f4e505289444c30c18b475142c12c` |
| `server/route-policy/api-route-policy-registry.ts`                              | `f7df2fcc009e3748050c2907dbc82257baf66288b309d109b5f64a90600857d6` |
| `server/routes/dual-forecast.ts`                                                | `a70c7af05aa2bb9aff5c04ff589124d7b198216302c1e11d0fb95c9f26982289` |
| `server/routes/internal-analysis.ts`                                            | `884e6642e89bcaed6a1cfc86dd4e4ac8611c8a5f4b495ee337424954dc25e6d9` |
| `server/routes/mount-common-routes.ts`                                          | `ef578b006cfb7e8819d92a1d86948c5568f4a893236f46d926f7a2cb6ca67feb` |
| `server/routes/operating-object-decisions.ts`                                   | `b3e08e9e169cd9d40c055f518f83f7ebd96c52c3a8669c1d088e257fb964da6c` |
| `server/services/construction-forecast-calculator.ts`                           | `70c09e63729d4eb3c634e2075b7e6fc1c6fb1341803786e8de529ff8be0219c2` |
| `server/services/current-forecast-reference-service.ts`                         | `46f047d740834e9338bf65226470c203117394136cd98b99cb15bdf0e8cb5211` |
| `server/services/current-forecast-serving-seam.ts`                              | `40cdfe4c0c19afcb4e81249f230448ca7dced6e8afa1296be7c19c838a394e0b` |
| `server/services/current-forecast-v2-service.ts`                                | `ce5af51a8a2ba186d553a971e2bc9caf47e98c3d0ae2c0336f6d11bf875cc4c5` |
| `server/services/current-plan-version-service.ts`                               | `240100391f5bdfc2a429b3d0e2f4df7f69447f062aa994612c4877e8c6dc22da` |
| `server/services/financial-facts-snapshot-service.ts`                           | `d8027065073ab5ae5f331f8e301d3f9e3c0c675a1a80e1bbd0e19525aa4084d4` |
| `server/services/financial-facts/financial-facts-basis-ref.ts`                  | `0f59339137844a685634fb32d68115333481e09e6403a18c8f06ad5f69c133ae` |
| `server/services/financial-facts/parse-persisted-facts-row.ts`                  | `d1376295e520994cb28ba813096bc8492a34f75757837b1e8b91686ac766fc55` |
| `server/services/internal-analysis/analysis-checkpoint-service.ts`              | `a4c6cfec3a9d289c33eea5394163cac857464142b85f164c7c357d1eadb01b92` |
| `server/services/metrics-aggregator.ts`                                         | `5e0bb33bae27ce90f6f4b1f8b4fdfb9668bf35a3d57971039052b6687a4d9273` |
| `server/services/operating-objects/decision-evidence-link-service.ts`           | `a3e0c8407ed074bcac79e1bedd484454541f3a5528a8c4e6c72fac93bf775d1d` |
| `server/services/operating-objects/decision-service.ts`                         | `75cbe9387a3545a2b4cf14fd3a966413704c31d066e6b72e17ae7b087791ed4c` |
| `shared/contracts/current-forecast-v2.contract.ts`                              | `31cdc70c80ae2bc44dc14bafb22cb63d1c105636a54dc74fc27cfe43c71d079a` |
| `shared/contracts/current-plan-version-v1.contract.ts`                          | `6285a60f235f8746e0d033ca831284a0f9c5dd2c968e55537683bd5f40430783` |
| `shared/contracts/dual-forecast/dual-forecast-response.contract.ts`             | `3be6f63fbb01d16c67e17c3b6fb2c55f88d62c8d1b78f66f2e31539a5dbc165b` |
| `shared/contracts/financial-facts-snapshot-v1.contract.ts`                      | `bdb763daa8a9ab0e62dadd47df9b4d165fcb5021d0ad73b04c82166fb1032a9e` |
| `shared/contracts/internal-analysis/analysis-reference-snapshot-v1.contract.ts` | `172784d4420a642ea7fd1598f3bc94b94290ce078913fcfdf6f1957cbafb5c8a` |
| `shared/core/cohorts/CohortProjectionV2.ts`                                     | `f26413186d775215c4898173284e628db3d102fb2f468d2623103c211ab4ee7a` |
| `shared/lib/canonical-hash.ts`                                                  | `ffae213b1a263115525af0b0804acf7d8e71eaaeab3664bd7731b47688bbd203` |
| `shared/lib/current-plan/derive-current-plan-v1.ts`                             | `150eb9d2d7d16fd933279fefb721111afe3012ecb4840e5291fb00466910f330` |
| `shared/routes/api-route-manifest.ts`                                           | `ad48e3d01c876ba54850d47b8c5f9645c3ac80a16a7f86d4598a1ccbf7d604f0` |
| `shared/schema/current-forecast-references.ts`                                  | `5b99f2d81c0e296e011f10389dc086dcfff4e734848db1dcbf56e415c8c1811e` |
| `shared/schema/current-plans.ts`                                                | `bfb75d0bf6e7eaaec5b3bfeefbcdbdb019334faedc6801cd32a554a6ac3cb37b` |
| `shared/schema/fund.ts`                                                         | `d7be982c71e9b5155877599fc91d00f9a550f256d11082c31b76cfea88ffb42e` |
| `shared/schema/internal-analysis.ts`                                            | `cec76ded14bacadaed806859ebfc890902462e95dabb50c74b08ef900dd40b01` |
