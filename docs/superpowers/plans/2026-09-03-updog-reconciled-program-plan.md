---
status: PROPOSED
audience: agents
last_updated: 2026-09-12
owner: Repository Owner
categories: [release, current-forecast, economics, decision-workspace]
keywords:
  [F_1.11.0, current-forecast, internal-economics-v2, decision-workspace]
---

# Updog Restore Reconciled Program Implementation Plan

## September 12, 2026 owner-directed readiness boundary

The configured-pilot requirement is retired as a blocker for general product
readiness. Pilot nomination, F_1.12.0 Gate A, pilot publication-to-forecast
repair and pilot-specific reconciliation are optional pilot acceptance work, not
prerequisites for the general platform or Program A readiness path. This
decision supersedes earlier pilot-dependent sequencing and target-nomination
assumptions.

Product readiness must still be supported by a demonstrated compatible platform
path, including exact input/plan identity, permissions, automatic execution,
persistence, replay, containment and recovery. Synthetic or real inputs are
eligible subject to those predicates. Pilot setup or an existing real-investment
fund is not required; missing platform evidence still blocks readiness.

Keep pilot results separate: incomplete or failed pilot acceptance does not set
the general result to deferred, and a platform pass does not certify the pilot.
Source admission, production authority, candidate certification, qualifying
production topology, organic soak and activation gates remain unchanged. The
decision records no readiness pass and performs no runtime or provider action.

## Overview and current baseline

This is the current Programs A-C sequencing roadmap, refreshed September 7, 2026
against protected `origin/main@2a6372557a3dd1ba8a13e99c6867434ede3f9299`.
Remaining work has shifted from prerequisite implementation to operational
readiness, candidate certification, organic soak, and product-specification
decisions. This proposal reprioritizes that work without introducing a feature
version or authorizing implementation, GitHub writes, or production actions.

PR #1486 merged September 7 at 09:22:22 UTC. Its terminal PR head was
`6e7afdba643354f18b0d347d6a46b975d09344ab`; `CI Gate Status` succeeded at
09:19:33 UTC in run `34104059645`. The merge commit is the inspected main SHA
above. This establishes source admission, not activation-candidate certification
or deployed state. September 3/6 instructions to implement and admit Phase
P/Program B are historical.

| Area                         | Verified source state                                                                                                                                                       | Remaining gate                                                                                                                               |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| F_1.7.0-F_1.10.0 foundations | Source-pinned scenarios, construction reconciliation, operating decisions, context rail, operations workspace and durable recompute landed in the earlier roadmap sequence. | Reuse these surfaces; do not rebuild them as C.                                                                                              |
| F_1.11.0 / A Phase P         | #1469/#1470 supplied P0b. #1486 admitted journaled 0050-0055 schema controls, isolated rehearsal, guarded production-action runner and authenticated database identity.     | Target readiness, candidate certification, provider binding, organic soak and #1299.                                                         |
| F_1.12.0 pilot               | #1476 admitted plan/ADR-097; #1478/#1479 admitted publication; #1484 added tenant-context/RLS hardening; #1486 synchronized documentation.                                  | Optional pilot-only Gate A STOP/GO and selected pilot environment/grant/data evidence; no general-readiness dependency. Default-off remains. |
| B / #1458                    | #1486 admitted relief-row-derived security lineage, per-security proceeds, exact pool lookup, collision refusals, versions and changed-case manifest v3.                    | Include in A candidate; affected-consumer compatibility and release/serving evidence. #1458 remains open for tracker reconciliation.         |
| C                            | #1486 admitted five DRAFT specifications and five PROPOSED implementation plans. No C product workflow landed.                                                              | Exact-body/source review, named approval, A GO/final runtime identity and each workstream's predecessors.                                    |
| Maintenance                  | #1474/#1482 cleanup and #1484 auth/queue/ML/contract fixes landed.                                                                                                          | #1373 matrix/dependency work and deferred migrations remain separate.                                                                        |

B input/normalizer remains `2.0.1`; receipt, serializer, event engine and
composite implementation are `2.4.0`; deal-by-deal waterfall is `2.3.0`;
whole-fund remains `2.2.0`. These differ from future C3 reserve receipt V3. The
migration journal ends at `0055_current_forecast_recompute_commands`; F_1.12.0
added no DDL.

## Authority and architecture

Read `docs/governance/solo-internal-change-and-production-policy.md` from
protected main. `CI Gate Status` is the sole aggregate merge gate. Production
actions use `docs/workflows/PRODUCTION_SCRIPTS.md` and applicable workflows.
Reviews, issue state, ADR annotations, matrix records and plans never supply
action authority. Source admission neither proves nor authorizes deployment,
schema apply, trial, shadow entry, activation or kill/resume. Their current
state is `UNKNOWN` without authenticated readback.

Preserve existing React/Express/PostgreSQL/BullMQ architecture and contracts.
Reuse forecast, financial-facts, scenario/analysis references, operating
decisions and evidence links. Preserve idempotency, optimistic locking,
validated cursors, bounded jobs, same-fund authorization, Decimal arithmetic and
typed refusals. No parallel economics engine, generic framework, new dependency
or speculative command sweeper is needed.

The B source prerequisite before A candidate selection is satisfied by #1486.
Every selected candidate must include that correction. Once frozen, do not
inject B, C, fee changes or maintenance into the hold window; apply the existing
exception-merge rule only when its proof holds. Identity drift follows the
existing restart rules. C must not modify or delay the A candidate. The B plan's
Global Constraints carry the security-inference stop condition formerly listed
in this roadmap.

## Dependency order

```text
#1486 source admission: A Phase P Tasks 1-5 and B          [admitted 2026-09-07]
  -> A Task 6 admission-evidence reconciliation; ADR-098/ADR-099 status
  -> A Task 7 Steps 1-1b: #1283 readiness, #1287 target and organic producer
  -> A Task 7 freeze: new exact candidate containing #1486
  -> A Task 8 exact-SHA certification
  -> A Task 9 isolated Neon rehearsal; separately authorized 0050-0055 apply
  -> A Task 10 exact candidate deployment and provider binding, mode off
  -> A Task 11 separately authorized enter-shadow; deployed spine proof
  -> A Task 12 four qualifying seven-day windows (#1298)
  -> A Task 13 #1299 NO-GO, or GO -> activate -> kill-to-held -> resume

Optional F_1.12.0 pilot lane: Phase 8 Gate A and publication/trigger acceptance
  -> pilot-only result; no dependency into general product or A readiness

C specification approvals (parallel with A; product work waits A GO)
  -> C1 approval -> C1 implementation -> C2 (reuses C1's decision command)
  -> C3a approval -> C3b approval -> C3a -> C3b -> C3c (C3c also needs
     accepted reserve V3 and V2-to-V3 equivalence)

Fee/economics (separate lane): #1337 -> #1338/#1321 -> #1318/#1339/#1320
Waterfall (governance-blocked): #1305 -> (#1306, #1307); #1321 also gates #1307
```

### Proposed narrow C1 exception (inactive, September 9, 2026)

Proposed amendment to the C implementation entry rule: after exact-body review
of the revised C1 source/attribution specification and explicit approval of this
exception by the named repository owner, C1 Task 1 source-contract
implementation and isolated synthetic tests may proceed before Program A GO.
This is the exact proposed scope; it excludes Tasks 2-3 persistence, decision
commands and UI, C2/C3 implementation, canonical financial claims and all
production actions.

Exception approval is not recorded. Reviewer, owner identity, approval timestamp
and approved body digest remain unset; approval of F_1.14.0 does not activate
this text. Until those approvals exist, the existing rule above applies. Source
admission/merge, candidate freeze, deployment, serving, activation and
financial-claim requirements remain unchanged. Independent work cannot replace
or alter A's frozen candidate. C1 -> C2 and C3a -> C3b -> C3c dependencies
remain.

## Reprioritized remaining work

This is a proposed resource priority. Named policy/product gates remain
requirements; independent lanes are not new serial prerequisites.

| Priority              | Work and owner role                                               | Next result                                                                                                                                 | Dependency / stop condition                                                                                                             |
| --------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1                     | A readiness — release operator prepares, repository owner selects | A Task 7 Steps 1-1b: #1283 readiness and #1287 target decision, including organic fact source                                               | Resolve source, topology, database/queue, recovery and caller identity before candidate selection. UNKNOWN blocks its dependent action. |
| 2                     | A certification/binding — release operator                        | A Task 7 freeze, then Tasks 8-11 and #1294-#1297 exact-candidate evidence                                                                   | Fresh main candidate containing #1486; exact-SHA checks; applicable action-specific dispatches.                                         |
| 3                     | A soak/decision — operator and repository owner                   | Four qualifying seven-day windows, then #1299 NO-GO or verified GO and containment                                                          | One bound candidate/runtime/database/fact source; real organic activity and all evidence predicates.                                    |
| Parallel now          | C specification decisions — product/financial reviewers owner     | Revise/review C1 source contract to admit a distinct persisted comparable after-assumption source, then approve exact bodies when justified | Planning may proceed during A. C implementation/merge/deployment/serving waits A GO/final runtime identity.                             |
| Optional, independent | F_1.12.0 trial — pilot owner/operator                             | Phase 8 isolated Gate A STOP/GO                                                                                                             | Optional pilot acceptance only; excluded from general product and Program A readiness prerequisites.                                    |
| 4, after entry gates  | C1 then C2 — workspace owner                                      | Variance evidence and atomic linked-decision command, then scenario comparison reusing it                                                   | Approved specs/plans and A GO; C2 consumes C1's admitted command.                                                                       |
| 4, separate lane      | Fee/economics — fee owner/domain reviewers                        | #1337 production FeeProfile truth, then parity/fee-authority decisions and dependent consumers                                              | Preserve F_1.3.0 ratification, truth and G5 gates; no blanket promotion into A.                                                         |
| 5                     | C3a then C3b then C3c — reserve/financial owners                  | Metric admission, deployed reserve MOIC, then evidence-linked decisions                                                                     | A GO, approved specs, B lineage, accepted reserve V3 and equivalence evidence as applicable.                                            |
| Deferred              | Waterfall, broad construction/KPI work, dependency migrations     | Reassess when a concrete need appears or existing gate clears                                                                               | Preserve F_1.4.0 ADR conflicts/quarantine and dependency deferrals.                                                                     |

Priorities 1-3 lead because four seven-day windows require at least 28
qualifying days after valid entry, excluding preparation/resets. Calendar time
alone never satisfies the gate. During the hold, favor reviews, decisions and
read-only audits over source changes that alter the candidate.

### 1. Resolve target and organic source first

Use A Task 7, #1283 and #1287. Refresh source/tree, journal tail, provider
topology, callers, database/queue identity and recovery prerequisites. Inspect
any still-applicable G1 owner record; do not infer a generic open admission gate
from pre-merge pending prose. #1486's regenerated matrix remains evidence for
its named scope.

Prove which supported fact-commit path produces qualifying shadow comparisons.
F_1.12.0 publication currently returns its receipt with cache invalidation only.
Existing organic triggers run downstream of the legacy facts builder, which
rejects the configured pilot fund. Qualify a compatible platform target through
A Task 7 Step 1b using a source trace and retained non-production proof of
automatic shadow execution without manual recompute or a writer/policy refusal.
Synthetic input is eligible; its origin does not replace identity, facts/plan,
runtime or qualifying-soak evidence. Record pilot configuration only to classify
compatibility; an unset pilot does not create a setup prerequisite.

Record the unsupported pilot-publication path in the optional pilot lane. Its
Gate A, publication repair and pilot-specific reconciliation do not delay
general product readiness. A later shared pilot target must prove its own
compatible producer and applicable pilot controls; no result transfers between
targets, and a source change still requires fresh candidate certification.

Historically, the owner selected F1 / Fund One from the supplied ledger (10
companies and 11 transactions). Read-only inspection of the configured
Railway-bound database found only Phase 0 Integration Fund (ID 1, one company
and one transaction), not a verified F1 target. Vercel's database binding
remains unknown. Establish the serving API's actual database and fund context
before deciding whether import is necessary; import necessity is not established
by this inspection. Complete authenticated runtime/fund binding before choosing
the eligible organic producer. Business labels and supplied ledger rows do not
establish a configured soak source. Under the September 12 decision, this
historical nomination and its reconciliation gaps do not block a different
compatible platform target. Manual trial/recompute calls cannot substitute
organic activity; manual recompute during shadow remains a blocker.

The supplied capital totals also leave $1.6M unresolved: $19M consolidated minus
$15M F1 and $2.4M SPVs. Preserve this gap for any financial claim or
certification that relies on those totals; do not create a balancing entry. It
does not block a synthetic platform test or general readiness evidence
independent of that real-investment basis.

### 2. Certify and bind one new candidate

Reconcile Task 6 source-admission evidence with #1486, then resume at Task 7
readiness/selection/freeze and Task 8 certification. Tasks 1-6 are historical
implementation/admission procedure, not fresh backlog. Do not select a pre-B
SHA. Reconcile retained exact-head test evidence before deciding what must
rerun; historical PR checks do not certify the merge SHA or a later candidate.

Tasks 9-11 bind release to API, workers, database and queue. Rehearse/apply the
bounded journaled 0050-0055 path only through its existing procedure and
applicable authorization. Verify returned provider/database identity before
dependent actions. Shipped tools do not establish backup/PITR, restore custody,
preview isolation, grants or runtime state.

Tracker corrections for a later authorized sync cover #1283, #1287 and
#1296-#1299. #1283 and #1287 still cite `main@591f73f61`. #1287's checklist
decides only production-side versus synced-copy topology; it must also record
the platform target, input origin and organic producer proven in Task 7 Step 1b,
otherwise its closure leaves Priority 1 unresolved. #1296, #1297 and #1298 still
describe deployed spine/shadow activity with mode `off`. Follow A Tasks 10-11:
promote the exact candidate while mode is `off`, then separately dispatch
`enter-shadow` before the deployed decision spine and organic windows. Verify
the mode API returns `configuredMode=shadow` and `effectiveMode=shadow`, while
authoritative serving remains V1/unchanged. Configured/effective mode and served
behavior are separate observations.

#1299 also incorrectly says NO-GO keeps mode `off`. Task 13 instead preserves
current serving mode, records NO-GO and the smallest corrective program; it does
not reset configured/effective mode automatically. Any later mode or containment
change requires its own applicable dispatch. Issue wording cannot waive the
shadow transition or authorize a NO-GO reset.

### 3. Execute existing evidence loop

Task 12/#1298 requires four consecutive qualifying seven-day windows: non-empty
committed-corpus evaluation, exact-basis replay for every base, at least 90
percent availability, zero unexplained divergences, at least one organic
facts-triggered run per window, no prohibited manual rows, and unchanged bound
identity. Require at least two distinct accepted facts bases across the soak.
The tracker's 500-comparison wording is stale; it is not the Task 12 predicate.
Audit #1468 at entry and each window using existing stale-recovery/replay
behavior. Add cleanup/alerts only if observed orphan risk survives that
mechanism; otherwise close the conditional task with evidence and no new
mechanism.

Task 13/#1299 produces explicit NO-GO or GO within 14 days after Window 4.
Unchanged identity but missed deadline needs a fresh seven-day extension;
identity drift restarts Window 1. GO still requires separate activation,
kill-to-held and resume dispatches with verified final mode. NO-GO terminates
the attempt with blockers; it does not unlock C or post-activation work.

### 4. Finish specification decisions without rebuilding drafts

All five `docs/specs/C*.md` are DRAFT/unapproved, with unset reviewer, owner,
timestamp and approval-hash fields; their five plans are PROPOSED. All 116
source-manifest rows match the previous `38fa722d...` source and inspected main,
but the squash merge left that former pin outside main ancestry. Task 6 requires
ancestry as well as equal source bytes. This refresh therefore rebinds all five
draft `source_sha` values to `2a6372557a3dd1ba8a13e99c6867434ede3f9299`,
preserving unapproved fields. The source-pin refresh preserved bodies and
hashes; the later C3b admission clarification updates its body and hash without
granting approval. Recheck all predicates immediately before approval; matching
hashes alone do not establish approval eligibility. Pin `source_sha` only to a
commit reachable from protected `origin/main`, never to a branch head: a squash
merge orphans that head and fails Task 6 ancestry even when every source byte
matches.

- C1: the owner selected `After-assumption` on September 7, 2026. Revise and
  independently review a distinct persisted after-source contract; the existing
  empty-driver/twelve-omission response remains baseline characterization, not
  selected delivery. Resolve explicit historical source pairing, pinned
  production, comparable fields/horizons, atomic validation and attribution
  evidence with an explicit method, interaction treatment and reconciliation of
  attributed effects plus any disclosed residual to the total change. Possible
  changes in four plan-field categories are not an approved product limit or
  proof of forecast effects. Preserve exact-body approval and separate Program A
  GO/final-runtime gates. C1 owns the atomic evidence-linked decision command
  reused by C2.
- C2 next: preserve economics-only comparison, source/baseline identity and
  immutable saved-reference evidence. Reuse C1's `createEvidenceLinkedDecision`
  instead of adding a second decision/evidence transaction.
- C3a/C3b/C3c: approve metric identity and missing-data/refusal semantics first.
  B source is admitted, but does not supply reserve V3 admission/equivalence.
  C3c requires admitted C3a/C3b, accepted reserve receipt V3 and V2-to-V3 proof.
  Keep actuals and modeled evidence distinct.

Carry full `FinancialFactsBasisRef` through applicable input/result/request/
receipt/evidence identities. Preserve policy 1.4/payload 5 same-head/stale-basis
refusals, legacy behavior, periodic-analysis/economics payload-5 limits, and
absence of NAV/RVPI/TVPI merely from valuation marks. After approval, update
existing implementation plans rather than minting duplicates.

### 5. Keep wider backlog conditional

F_1.3.0 remains fee/economics design sequence: ratify #1337's production
FeeProfile scope, preserve legacy characterization, establish green truth, then
resolve #1338/#1321 parity/fee authority and dependent #1318/#1339 UI consumers
and #1320 capital-envelope semantics. Preserve its exception process; this
roadmap grants no G5 waiver. Refresh live paths and prior gate evidence before
child-plan dispatch; August snapshots are historical. #1317 regression work
remains conditional on observed drift.

F_1.4.0 waterfall remains governance-blocked. Preserve `#1305 -> (#1306, #1307)`
with #1321 also gating #1307; #1291/#1308 are parked, #1309 deferred. Do not
substitute an issue-comment linear chain. Reconcile #1022/#1023 against landed
F_1.7/F_1.12 capabilities before new construction work. Preserve KPI/backend
reuse and compatibility quarantine.

#1373 is maintenance if dependency-only matrix failures are reproduced, not an
automatic activation prerequisite. Defer #1375-#1379 migrations unless security,
support or an observed defect warrants advancement. Keep source-changing
maintenance outside the frozen candidate.

## Files and documentation impact

This candidate updates the existing roadmap and companion plans, shadow-soak
runbook, five C specifications, and source-admission annotations in
`CHANGELOG.md`, `DECISIONS.md`, `docs/ARCHI.md`, and
`docs/STABILIZATION-ROADMAP.md`. In addition to source/date metadata, it
corrects C3b's source-admission body and hash and adds the already-required
`basisRef` to C3a's named request interface.

The C1 draft and its companion
`docs/superpowers/plans/2026-09-03-forecast-variance-decision-workflow.md`
record the owner-selected after-assumption direction, source-admission
requirements and baseline-only omissions. This preparation does not approve or
implement C1.

The candidate also repairs `.gitleaks.toml`: one historical synthetic-fixture
exception is rebound from its orphan pre-squash commit to the admitted squash
commit. The exact rule, path, anchored fixture line and AND condition remain
unchanged. Verification includes the admitted-commit scan and negative controls
for other values, paths and commits; hosted full-history proof is outstanding.
No application code, specification approval or production configuration changes
are included. No new SemVer plan is needed for this reconciliation.

Non-TRIP follow-up synchronization:

- `CHANGELOG.md`: September 6 pending-source language is overtaken by #1486;
  record admission while preserving operational UNKNOWNs.
- `DECISIONS.md`: reconcile ADR-098/ADR-099 pre-merge annotations with the
  merged decision record. Preserve ADR-097; do not allocate new IDs or invent
  another source-admission/production-authorization gate.
- `docs/STABILIZATION-ROADMAP.md`: align milestone navigation with admitted A/B
  and remaining activation/product gates after review.
- `README.md`, `.env.example`, `docs/ARCHI.md`, `docs/INDEX.md` and
  `docs/workflows/PRODUCTION_SCRIPTS.md`: #1486 supplied capability/default-off
  documentation. Do not schedule repeat feature-doc implementation; future
  runtime changes synchronize their actual scope.
- `docs/runbooks/current-forecast-shadow-soak.md`: remains the window/mode
  procedure. This refresh adds the Task 12 organic-run, manual-row and
  two-distinct-bases predicates that its ADR-057 section omitted, so an operator
  following the runbook alone applies the full green predicate. Amend further
  only for an approved target/source or procedure change, and before candidate
  freeze; a post-freeze runbook edit changes the candidate SHA.

#1458 and #1296-#1299 need the factual status, mode and predicate corrections
above. No issue is closed/edited by this pass; reread state before separately
authorized writes.

## Test impact and verification

- Planning changes need diff/format, path/link, status/dependency and source-pin
  checks plus independent review. No product tests are added.
- Retain #1486 CI receipt for its terminal head. A Task 8 runs existing checks
  on the selected candidate tree with Node 22.23.2 and `TZ=UTC`, including
  applicable real-database, release-contract and truth checks; report actual
  results rather than historical counts.
- B compatibility uses existing multi-security truth tests, version tuple and
  changed-case manifest v3; reopen code only for a demonstrated gap.
- C implementation testing remains in each approved plan, including atomic
  same-key replay, stale-source denial and applicable real-database/UI proof.
  Approval work does not manufacture passing tests.

## Remaining checklist and exit criteria

- [x] Reconcile #1484/#1486 admission; remove repeated A/B implementation from
      forward backlog.
- [x] Check five C source manifests and repair post-squash ancestry by rebinding
      draft metadata to inspected main; keep approvals unset. The later C3b
      admission clarification has a refreshed body hash.
- [x] Reconcile A Task 6 admission evidence with #1486 and record
      ADR-098/ADR-099 status against the merged decision; allocate no new IDs.
- [ ] Complete #1283 readiness and #1287 target/organic-source binding.
- [ ] Optional pilot lane only: complete F_1.12.0 Gate A and publication/trigger
      acceptance if separately pursued; this item does not block general product
      or Program A readiness.
- [ ] Select, certify and bind A candidate through Tasks 7-11.
- [ ] Complete four qualifying windows and record #1299 NO-GO or verified GO,
      with separate activation/containment/resume evidence for GO.
- [ ] Review/approve each C specification and update its existing plan; after
      entry gates execute C1 -> C2 and C3a -> C3b -> C3c.
- [ ] Reconcile non-TRIP annotations and separately authorized tracker updates;
      administrative closeout does not mean source is missing.
- [ ] Reassess fee/economics and deferred lanes at their gates.

Roadmap review completes when statuses, evidence and dependency order pass
independent review. Program completion is separate: A requires a terminal
decision, affected B serving requires release evidence, and C requires approved
implementation and verification. This proposal records no runtime completion or
owner approval on their behalf.
