---
status: HISTORICAL
audience: both
last_updated: 2026-09-03
owner: '@nikhillinit'
---

# Code Review: Programs A-C Plan Alignment Audit (F_1.11.0 lineage)

**Review Date**: 2026-09-03
**Version**: pre-release plan audit; package `1.6.0`; Program A targets the
F_1.11.0 activation train, Program B targets Internal Economics V2 `2.4.0`
identities, Program C targets specification gates only
**Files Reviewed** (final SHA-256 after this disposition):

- `docs/superpowers/plans/2026-09-03-updog-reconciled-program-plan.md`
  (overview, `176af366...`)
- `docs/superpowers/plans/2026-09-03-current-forecast-activation-train.md`
  (Program A, `14177f9b...`)
- `docs/superpowers/plans/2026-09-03-internal-economics-v2-security-lineage.md`
  (Program B, `27c0efef...` after the pool-key fix, propagation P1s, construction-side fix, concrete collision test, and lot-ID refusal doc; Codex APPROVED at round 4 pre-fix; prior approval at `cc6ec381...92c8`)
- `docs/superpowers/plans/2026-09-03-decision-workspace-specification-gates.md`
  (Program C, `286a4fa3...` — Codex plan-review APPROVED at round 7)
- `/tmp/updog-program-a-c-plan-handoff-2026-09-03.md` (session handoff)

**Plan**: `docs/1-plans/F_1.11.0_isolated-activation-train.plan.md` (Program A
lineage); `docs/1-plans/F_2.0.7_v2-conformance-closure.plan.md` and issue
#1458 (Program B lineage); `docs/1-plans/F_1.7.0_daily-decision-workspace.plan.md`
and `docs/1-plans/F_1.4.0_post-activation-epics.plan.md` (Program C lineage)

---

## Executive Summary

Four planning documents reconcile the activation train, the V2 per-security
proceeds defect, and the remaining decision-workspace scope into three
independent programs. This review found three major and four minor alignment
issues; all are now dispositioned. Program A's ADR-095 contradiction is closed
by an additive ADR-097 amendment inside the Phase P admission unit; its Phase P
premise is verified against the repository; Program B's merge timing is fixed to
land before candidate selection; the minors are folded into the plans. Codex
plan-review ran in parallel and all its findings are remediated; Programs A and
C converged to Codex APPROVED, and Program B is in a re-review loop after two
external merge-reviews found a pool-key collision and its construction-side
propagation. Verdict: PENDING PROGRAM B RE-REVIEW at `27c0efef` (Programs A and C
APPROVED).

---

## Changes Overview

The overview splits work into Program A (release convergence: Phase P
capabilities, candidate freeze, certification, Neon rehearsal, migration,
binding, shadow, four soak windows, GO/NO-GO), Program B (exact
`dealId:securityId` proceeds routing from admitted relief-row lineage, version
tuple `2.4.0`), and Program C (five owner-approved, source-pinned
specifications with separate implementation plans; adds the
`reserve_intelligence_admission_receipts` surface and the shared
evidence-linked decision command at specification level). No code, migration,
provider, or production mutation is authorized by any of the four documents.

---

## Findings

### Critical Issues

None.

### Major Issues

**M1. Program A contradicted ADR-095 decision 1 without amending it.**
`DECISIONS.md:12048-12070` (ADR-095, merged with #1469) records "The candidate
is the P0b hardening merge SHA on top of `12af67a4e`" and binds #1294-#1298 to
it. That merge is `d2ed01971` (#1469); under ADR-095's own restart rule the
#1470 candidate-critical fix moves it to `6fd4ece89`, and #1294's candidate
field is still the unfilled placeholder. Program A reclassified both SHAs as
history and deferred the candidate to a post-Phase-P admission SHA, but no step
superseded ADR-095 §1. **Disposition: FIXED (Q2 — inside the Phase P admission
unit).** Program A Task 1's ADR-097 now states it amends ADR-095 decision 1
(candidate selected after complete Phase P admission; restart, hold-window, and
identity-binding rules unchanged), appends an additive "Amended by ADR-097" line
to ADR-095's decision and consequences rather than rewriting it, and the
governance-routing test asserts the amendment string. Keeping the amendment in
Phase P avoids an orphan governance commit that would move `main` on its own.

**M2. Program A reopens pre-candidate capability work that F_1.11.0 narrowed.**
F_1.11.0 and ADR-095 adopt "one narrow hardening change, then certify." Program A
Phase P (Tasks 1-5) adds two workflows, one workflow mode, four scripts, and six
test files before any candidate exists, justified by one premise: the existing
schema workflow cannot apply journaled `0054`-`0055`. **Disposition: PREMISE
VERIFIED; retained (Q4).** Quoted-line evidence:
`.github/workflows/prod-schema-reconcile.yml:118-122` accepts only `audit`,
`apply`, and `apply-catchup-0050-0053` and exits 1 on any other mode;
`scripts/reconcile-prod-schema.mjs:37-41` documents the single governed catch-up
capability as exactly the four G3 manifests 0050-0053; `:2234-2238` shows the
apply selector resolves only the G3-catchup or 0053-only capability; manifests 31
and 32 (0054, 0055) have no sanctioned apply path. Phase P Task 2 is a real
prerequisite, not scope drift. These lines are now folded into Program A Task 2
as a stated premise. Per Q8, this quoted-line evidence is the verdict of record
for M2 and supersedes the first Program A Codex lane that died on model capacity.

**M3. Program B merge timing was unsequenced against the ADR-095 hold window.**
ADR-095 §4 queues all source admission from certification through GO/NO-GO;
Program B changes `shared/lib/internal-economics/v2/*`, bundled into the API, so
it can never satisfy the exception-merge proof. **Disposition: FIXED (Q3 — merge
before candidate selection).** The overview ("Plan Set and Admission
Boundaries", "Dependency Order") and Program B's "Behavior Admission Boundary"
now state Program B merges into `main` before Program A candidate selection, so
the selected candidate includes the V2 proceeds fix and soaks it across the four
windows, and never lands inside the hold window.

### Minor Issues

**m1. F_1.11.0 P0a tracker reconciliation had no owner in Program A.**
**Disposition: FIXED.** Program A Task 7 gains Step 0: `READY_TO_CUT` now
requires every F_1.11.0 P0a GitHub-only correction (#1467 retirement wording,
#1171 body, #1294 gate rewrite, #1298 single-SHA contract and runbook, #1283
citation, #1295 binding fields, #1292 rubric, #1297 four-window audit) recorded
in #1171 first; any open item blocks readiness.

**m2. Overview cited "ADR-095 through ADR-097" as spec.** ADR-097 does not exist
until Program A Task 1 creates it. **Disposition: FIXED.** The overview now cites
ADR-095 and ADR-096 and names ADR-097 as created by Program A Task 1.

**m3. `docs/ARCHI.md` was stale and absent from Program A Task 5.** §1 states
Node `>=20.19.0 <23` / Volta `20.19.0` against `package.json` `22.x` / `22.23.2`;
§8 is keyed to `origin/main @ a3d0a6b6` and predates the F_1.11.0 candidate
identity. **Disposition: FIXED.** `docs/ARCHI.md` is added to Task 5's file list
and Step 4 now corrects §1's Node/npm contract and annotates §8's stale key.

**m4. Programs B and C had no anchor in `docs/1-plans`.** **Disposition: FIXED.**
`docs/1-plans/F_2.0.7_v2-conformance-closure.plan.md`'s #1458 row now names the
Program B path as its continuation, and
`docs/1-plans/F_1.7.0_daily-decision-workspace.plan.md` names the Program C path
for the C1/C2/C3a-c follow-ons (the C-labels are Program C's own; C1A shipped in
PR #1448). Both anchors ride this PR rather than a separate GitHub comment.

**m5. Program C Codex review (parallel lane).** Round 1 NEEDS_REWORK (six P1, two
P2), round 2 REQUEST_CHANGES (three new P1, one P2); all verified against the
repository and remediated: one exact digest algorithm; a guarded admin
admissions command with read-time receipt join and pre-insert hash
recomputation; `accepted_by` FK and actor/time in the receipt hash; save-time vs
decision-time verification entry points; successor `EXISTS` supersession under a
per-fund advisory lock with a two-session race test; a per-participation
`securityId` crosswalk with multi-participation and corrected-chain refusal; a
two-variant wire type; a `request_hash` preimage; the admission route joined to
the database-backed idempotency regex registry. Round 3 REQUEST_CHANGES (four
P1) also verified and fixed: the over-claimed lock invariant weakened to match
HEAD (decision links an immutable reference id; lock only serializes the
successor check with the insert); C3b fair value taken from the vehicle/company
aggregate only when a position maps to exactly one live participation, else
typed unavailable; an immutable build-stamped
`reserve-intelligence-admission-identity.ts` required for `sourceSha`/
`corpusRevision` equality at admission; deterministic marginal-ranking receipt
selection by exact basis tuple and all three hashes through the shared full-V2
projection producer. Round 4 REQUEST_CHANGES (two P1) also verified and fixed:
correction-draft save with a non-null `sourceReferenceId` must acquire the same
per-fund advisory lock before inserting its successor (the sole ordering
mechanism, since the evidence FK only restricts deletion); and the build-stamped
identity module is given an implementable fail-closed path (both build entry
scripts inject `sourceSha`/`corpusRevision` as esbuild defines, the module
throws on a placeholder, and the module plus both scripts join the Task 3
manifest). Round 5 REQUEST_CHANGES (one P1, one P2) also verified and fixed: the
build SHA comes from the platform build variables (`RAILWAY_GIT_COMMIT_SHA`,
`VERCEL_GIT_COMMIT_SHA`) rather than `git` (which `.dockerignore` excludes from
the Docker build), the corpus revision from a new tracked
`config/reserve-corpus-manifest.json`, and validation moved from import-time
throw (which would crash `dev:api`/Vitest) to lazy refusal at admission-command
execution with a dev/test env-override seam and stamped/unstamped tests. Round 6
REQUEST_CHANGES (one P1) also fixed: the dev/test env-override seam let a
production environment variable replace the stamped identity, so the module now
reads the override only when `NODE_ENV === 'test'` and otherwise reads the
stamped constant alone, with a test proving production cannot override. Round 7
returned **APPROVED** at `286a4fa3...` with no new findings: Program C's plan
review has converged. Per Q9 its specification authoring may now proceed under
the applicable Program A and Program B gates.

**m6. Program A Codex review (parallel lane).** Round 1 REQUEST_CHANGES (five P1,
two P2); all verified and remediated: recovery integration test moved to the
Testcontainers config and registry; raw catalog definitions fed to the sentinel
fence; orders 27-32 exact `SKIP` with 0054/0055 sentinels; bounded same-key
retry with DB/API reconciliation and a read-only `readback` action for ambiguous
outcomes; the additive ADR-095 amendment (closes M1); in-job rehearsal test
execution; rehearsal-branch cleanup or custody. Round 2 REQUEST_CHANGES (two new
P1) also verified and fixed: the rehearsal job sets `TEST_DATABASE_URL` (not
`DATABASE_URL`) to the ephemeral direct URL and registers the recovery and
reference suites in the Testcontainers path registry; `readback` is promoted from
prose to a real read-only member of the `CurrentForecastAction` union and route
mapping, with a workflow test proving fresh-key actions stay blocked until a
readback resolution is recorded. Round 3 REQUEST_CHANGES (two P1, one P2) was
right-sized rather than built out: `readback` had mapped to a nonexistent GET
route and implied a durable cross-run ambiguity state machine, over-built for a
solo-internal tool. Fixed by reusing the direct-database mode-row reads the
unsafe actions already perform plus `/api/health/db` (no new route), relying on
the existing mode-row optimistic lock for cross-run safety (a stale
`expectedVersion` after an applied mutation is refused 409, no new durable
record), and making `expected_version` conditional on the four unsafe actions.
Round 4 REQUEST_CHANGES (one P1, three P2) accepted the right-sizing and fixed
its consistency gaps: readback now authenticates the session before its
`/api/health/db` probe (that endpoint requires `requireHealthKeyOrAuth`) and
still sends no mutation request; the "mode API" references became direct-database
mode row plus serving resolver; the stale-version outcome is refused by the
item-6 pre-request fence with the service 409 kept as separately tested defense
in depth; and the action-mapping test asserts readback builds no request. Round
5 returned **APPROVED** at `14177f9b...` (existing optimistic-lock tests 57/57,
no new findings): Program A's plan review has converged.

**m7. Program B Codex review (parallel lane) — one finding held for owner
decision.** The lane returned REQUEST_CHANGES with two P1 and one P2. Two are
verified and fixed: a grouping test with two relief rows sharing one `securityId`
asserting a single summed proceeds lot (the base fixture used one lot per
security, leaving the group-by-`securityId` path untested; multiple deployments
create multiple lots per security), and `docs/ARCHI.md` added to Stage D so the
2.3.0 component identities move to the 2.4.0 tuple with the exact-routing note.
The third P1 asks to widen the merge window back to "before candidate selection
**or after recorded GO/NO-GO**." That reverses owner decision **Q3** (merge
before candidate selection so the candidate soaks the fix), which deliberately
traded Program B's post-GO independence for having the fix inside the soaked
candidate. The plan is left at the Q3 decision and this finding is surfaced to
the owner, not silently applied; the reviewer lacked the Q3 rationale. Round 2
accepted Q3 as intentional and raised three smaller items, all fixed: the
multi-lot grouping assertion changed from `toContainEqual` to a length-1
`toEqual` (proving exactly one lot), `docs/ARCHI.md` added to Stage D's staging
command, and the stale "keep Program B out of the candidate" boundary lines in
the Program B plan and the overview reconciled with Q3 (independently owned but
admitted before candidate selection and included in the frozen candidate, never
injected into an already-frozen one). Round 3 accepted findings 1-4 and raised
the final Q3-propagation P1: the overview Program Checklist still ran candidate
selection and soak before the Program B step. Fixed by reordering the checklist
so Program B is Step 2 (lands before candidate selection at Step 3) and
renumbering. Round 4 returned **APPROVED** (plan byte-identical at `17bcdc54...`,
diff check clean): Program B's plan review has converged.

### Suggestions

**s1. Adopted.** Program C's approval frontmatter is a new document schema.
Program C's Common Approval Contract now requires confirming that
`docs:routing:generate` / `docs:routing:check` accept those keys under
`docs/specs/` before Task 1 writes the first spec, extending the router schema in
that spec's implementation plan if needed.

**s2. Adopted.** The four plans, this CR, the two lineage anchors, and the
regenerated `docs/_generated/*` index are committed together in one PR toward
`main`, so the routing check never sees an index citing absent files.

**s3. Adopted.** Program C's Definition of Done now requires each generated
implementation plan that adds a route or persistence surface to carry the
`docs/ARCHI.md` section 9 rule verbatim.

---

## Session Disposition Log

- **Q1** Full disposition executed; revised documents produced.
- **Q2** M1 closed by the ADR-095 amendment inside Phase P Task 1 (no orphan
  governance commit).
- **Q3** Program B merges before candidate selection so the candidate soaks the
  fix.
- **Q4** m1-m4 accepted as written; full Phase P retained; the verified refusal
  lines folded into Task 2.
- **Q5** s1-s3 adopted; plans and regenerated index committed together.
- **Q6** Committed from the `nikhillinit/review-plan-updog-restore` worktree
  (the only tree holding these files, at `origin/main` 6fd4ece89) as one PR
  toward `main`; this CR committed alongside.
- **Q8** The quoted-line evidence is the M2 verdict of record and supersedes the
  Codex lane that died on model capacity.
- **Q9** Program A and overview finalized independently of the running Program C
  review; only Program C specification authoring waits for convergence.

---

## Checklist

Sections are read against planning documents, not code; each line names what was
checked.

- [x] 1. Functional Requirements — passed: program goals match F_1.11.0, #1458,
      and F_1.7.0 lineage; M1-M3 dispositioned.
- [x] 2. Code Quality — passed: frontmatter, fences, checkboxes, placeholders,
      trailing whitespace, and `git diff --check` clean on all four files; every
      missing referenced path is a planned-create.
- [x] 3. Architectural Compliance — passed: ARCHI section 3/4/9 rules restated
      correctly in A and C; ARCHI's own staleness folded into Task 5 (m3).
- [x] 4. Error Handling — passed: fail-closed refusals, stop conditions,
      `UNKNOWN` literal, typed blockers, no synthesized metrics.
- [x] 5. Security — passed: production credentials excluded from PR, Dependabot,
      and preview events; owner-dispatched action scope; direct non-pooled URL
      for schema and identity; evidence never grants authority.
- [x] 6. Performance — not applicable to planning documents; soak windows and the
      14-day decision expiry are the only time-bound controls and are explicit.

---

## Post-approval external merge-review (blocking P1, fixed)

After all three Codex lanes returned APPROVED, an external merge-review of PR
#1473 found one merge-blocking P1 that the internal lanes missed. **P1 — pool
key collision.** Program B keyed entitlement pools by the string
`` `${dealId}:${securityId}` ``; the input contract allows any non-empty string
in both fields, and Program C's crosswalk keys `securityId` as
`participation:<id>` (a value that contains a colon), so distinct pairs such as
`('a:b','c')` and `('a','b:c')` alias to the same key and could route realization
proceeds to the wrong security. Fixed at `62b7d5bb`: every `(dealId, securityId)`
map and receipt-object key now uses a collision-free JSON 2-tuple encoding
(`buildEntitlementPools` construction and lookup, and both `keyedPools` receipt
maps); and a colon-lineage regression case asserts per-security separation, no
proceeds crossing, conservation, and order invariance. (An initial attempt in
this fix to also restrict event IDs to colon-free was reverted at `b4662fc48`,
below, as a frozen-contract violation; the multi-security lot ID instead relies
on the existing duplicate-generated-lot-ID refusal for its narrow aliasing case,
leaving the normalizer unchanged.)
The same review confirmed **Q3: keep pre-candidate merge, do not widen** (post-GO
admission would place Program B outside the soaked candidate SHA), closing the
held owner decision. The Program B re-review of that fix (`62b7d5bb`) found three
propagation P1s, all fixed at `90b400b2`: the two `keyedPools` receipt-test
expectations now use computed `JSON.stringify(['deal-1','security-a'])` keys; the
colon-lineage regression moved from Stage A to Stage B (where the pool-key
replacement lands, so Stage A's green checkpoint is reachable); and the
`eventId` colon restriction was dropped as a violation of the frozen
normalizer/input contract — multi-security lot-ID collisions (only via a colon in
`eventId` that aliases another generated ID) instead fail closed through the
existing duplicate-generated-lot-ID refusal. That is an intentional trade, not a
preservation of every accepted input: the normalizer/input version is unchanged,
but such a pathological aliasing input is refused fail-closed (no misrouting)
rather than accepted, chosen over injective-encoding the lot ID and rewriting
every fixture. A both-order atomicity test proves the refusal leaves no partial
mutation. The Codex re-review then APPROVED `90b400b2`,
but a second external merge-review caught a gap that lane missed: the plan sketch
only *commented* that pool construction was re-keyed while HEAD's construction
(`waterfall-deal-by-deal-v2.ts:69`) still used the raw key, so an implementer
would build pools under the raw key and look them up under the JSON tuple — every
exact lookup would miss and refuse. Fixed at `85a58b9d`: the sketch now shows the
investment-lot construction loop using `poolKey` explicitly, naming the exact
HEAD line it replaces, so construction and lookup provably share the key. A
further external review then asked for (a) a concrete collision test tied to the
actual colon aliasing — added: two lots whose raw keys both collapse to `a:b:c`
resolve to two distinct tuple-keyed pools with proceeds credited to only one and
zero crossing to the other — and (b) explicit treatment of the non-injective
multi-security lot ID — documented as an intentional fail-closed refusal of the
pathological colon-in-`eventId` aliasing input with a both-order atomicity test,
rather than an injective re-encoding. Program B must pass a fresh Codex review and
CI at `27c0efef` before merge.

## Verdict

**APPROVED as revised, pending Program B re-review at `27c0efef`.**

All three major and four minor findings are dispositioned: M1 fixed via the
additive ADR-097 amendment in Phase P, M2's premise verified against the
repository and retained, M3 fixed to merge Program B before candidate selection,
and m1-m4 folded into the plans. All parallel Codex plan-review lanes converged
to APPROVED (Program A round 5 `14177f9b`, Program B round 4 `17bcdc54`, Program
C round 7 `286a4fa3`); the external merge-review then found and this session fixed
the pool-key collision P1 above and its three propagation P1s, so Program B is
now `90b400b2` and needs a fresh review pass. The merge-window finding that
conflicted with owner decision Q3 was held and Q3 is now owner-confirmed. This
review and its plans carry no merge, dispatch, schema, provider, deployment,
promotion, or activation authority; every such action remains a separate
repository-owner dispatch. Program C specification authoring may proceed under
the applicable Program A and Program B gates (Q9). PR #1473 is ready for owner
merge once Program B re-review at `27c0efef` is green.
