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
  (overview, `6d8fb369...`)
- `docs/superpowers/plans/2026-09-03-current-forecast-activation-train.md`
  (Program A, `717c28cf...`)
- `docs/superpowers/plans/2026-09-03-internal-economics-v2-security-lineage.md`
  (Program B, `17bcdc54...`; prior Codex approval at `cc6ec381...92c8`)
- `docs/superpowers/plans/2026-09-03-decision-workspace-specification-gates.md`
  (Program C, `286a4fa3...`)
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
plan-review ran in parallel and its findings are remediated. Verdict: APPROVED
as revised, subject to the running Program C review reaching convergence before
any Program C specification is authored.

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
is running against `286a4fa3...`. Per Q9, this does not block Program A or
overview finalization; only Program C specification authoring waits for
convergence.

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
Round 4 is running against `717c28cf...`.

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
injected into an already-frozen one). Round 3 is running against `17bcdc54...`.

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

## Verdict

**APPROVED as revised.**

All three major and four minor findings are dispositioned: M1 fixed via the
additive ADR-097 amendment in Phase P, M2's premise verified against the
repository and retained, M3 fixed to merge Program B before candidate selection,
and m1-m4 folded into the plans. The parallel Codex plan-review findings on
Programs A and C are remediated in the committed revisions. This review and its
plans carry no merge, dispatch, schema, provider, deployment, promotion, or
activation authority; every such action remains a separate repository-owner
dispatch. Program C specification authoring remains gated on the running Codex
review reaching convergence (Q9).
