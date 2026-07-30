---
type: reflection
id: REFL-041
title: Production Activation Requires Schema Provisioning Proof
status: VERIFIED
date: 2026-07-30
version: 2
severity: high
wizard_steps: []
error_codes: [ERR_SCHEMA_ACTIVATION_ORDER, ERR_UNPROVISIONED_DEPENDENCY]
components: [production, migrations, github-actions, vercel, internal-analysis]
keywords:
  [
    code-before-schema,
    schema-provisioning,
    production-drift,
    auto-promotion,
    exact-sha,
    manifest-apply,
    authenticated-smoke,
    governed-promotion,
  ]
test_file: tests/regressions/REFL-041.test.ts
superseded_by: null
---

# Reflection: Production Activation Requires Schema Provisioning Proof

**Scope:** Task 18 and Task 19 internal-analysis production incident,
2026-07-27/28 UTC.

**Prime Directive:** Everyone acted reasonably with available information,
tests, and repository controls. Migration 0044 was implemented, journaled,
manifested, and tested. Failure came from a delivery system that allowed
schema-dependent code to serve production before production schema state was
proven. Focus belongs on activation controls, not individuals.

This reflection is distinct from REFL-040. REFL-040 corrected false code
attribution caused by cross-worktree environment drift. This incident was real
production drift: application code and database schema were at different release
states.

## 1. The Anti-Pattern (The Trap)

**Context:** A feature PR contains both a migration and routes that immediately
read or write the new tables. CI proves migration correctness against clean or
ephemeral databases, then merge-triggered hosting deploys the application.
Production migration application remains a separate manual workflow.

That creates a code-before-schema window. Route mounting and authentication can
still work, so unauthenticated probes return the expected `401`. Authenticated
handlers cross the database boundary, discover missing relations, and return
`500`.

### Incident Timeline

1. Task 18 PR #1225 merged at `2026-07-27T20:57:27Z`. Its Vercel production
   deployment followed at approximately `21:01Z`.
2. Task 19 PR #1228 merged at `2026-07-28T01:37:04Z`. Its Vercel production
   deployment followed at `01:40:45Z`.
3. Production routes were mounted and auth-gated: unauthenticated internal
   analysis requests returned `401`. Authenticated requests returned `500`.
4. Governed audit run
   [30327256894](https://github.com/nikhillinit/Updog_restore/actions/runs/30327256894)
   started at `03:55:09Z` and failed its clean-audit gate as designed. It found
   exactly one applying manifest, `internal-analysis`, and exactly six
   `APPLY-MISSING-DDL` tables. The other 17 manifests were `SKIP`; none were
   `REFUSE`.
5. Governed conditional-apply run
   [30327357992](https://github.com/nikhillinit/Updog_restore/actions/runs/30327357992)
   started at `03:57:22Z` against exact live `main`
   `d2ba8729a282822bfa1516e5d4cca1a4dc28e666`. It transactionally applied only
   `migrations/0044_internal_analysis.sql` (14 statements).
6. Independent final audit run
   [30327532290](https://github.com/nikhillinit/Updog_restore/actions/runs/30327532290)
   started at `04:01:02Z`. All 18 manifests were `SKIP`; all six internal
   analysis tables were `shape-ok`.

### How to Recognize This Trap

1. **Runtime signal:** Public health is `200`, protected routes are mounted and
   return `401` without auth, but authenticated schema-backed calls return
   `500`.
2. **Release pattern:** A migration and its active consumers merge together
   while schema application is a separate manual action.
3. **False proof:** Clean-database, Testcontainers, journal, and manifest tests
   are treated as proof that production has the schema.
4. **Control gap:** Hosting can auto-promote a merge-created deployment before
   the governed release workflow runs. A correct fail-closed audit protects only
   releases that invoke it.
5. **Mental model:** "Migration ships with code" is equated with "migration ran
   before code served traffic."

**Impact:** Task 18 quarterly analysis and Task 19 narratives/notes were
unavailable to authenticated users. No financial misstatement or partial write
was proven; calls failed before the required relations existed. Availability
loss still matters: internal analysis cannot be generated, reviewed, or saved
during the drift window.

> **DANGER:** Do not activate a schema-backed reader or writer until the target
> production database proves the required manifest is fully `SKIP (shape-ok)`.

## 2. The Verified Fix (The Principle)

**Principle:** Schema provisioning is a runtime dependency and an activation
gate, not an artifact bundled with application code.

### Root Cause: Five Whys

1. **Why did authenticated internal-analysis requests return `500`?** The
   handlers queried relations that did not exist in production.
2. **Why did the relations not exist?** Migration 0044 had not been applied to
   the production database.
3. **Why was schema-dependent code already serving?** Vercel auto-promoted
   merge-created deployments from `main`.
4. **Why did the release gate not stop it?** `release-production.yml` runs a
   clean production schema audit, but the hosting auto-promotion path can serve
   the merge without that workflow being invoked.
5. **Why could one missed manual step create an outage?** The feature combined
   provisioning and activation in one delivery unit and relied on operator
   sequencing instead of a machine-enforced dependency.

**Systemic root cause:** Production schema compatibility was treated as release
procedure, not as a prerequisite enforced by every path that can activate
schema-dependent code.

### Durable Activation Gate

Use one of two safe release shapes:

1. **Governed-only promotion:** Disable uncontrolled hosting promotion. Stage
   exact `main`, run release proof, audit/apply the exact expected schema delta,
   prove a clean post-audit, run authenticated staged smoke, then promote.
2. **Schema-first activation:** If merge-to-production auto-promotion cannot be
   disabled, land the migration and manifest dormant. Apply and verify them in
   production. Merge route readers/writers only after the manifest is already
   `SKIP (shape-ok)`.

This repository uses governed-only promotion. `vercel.json` owns the invariant
`github.autoAlias=false`; do not replace it with a dashboard-only setting. The
required post-merge activation sequence is:

```text
schema apply when required -> clean audit -> stage production target -> validate identity -> staged smoke -> promote -> production smoke
```

`Release Production` requires the exact current `main` SHA at dispatch and
rechecks live `main` before staging, deployment validation, staged smoke, and
promotion. After a clean schema audit, the workflow checks out the exact SHA and
creates its own production-target Vercel deployment without assigning domains.
It then validates that deployment's project, SHA, branch, metadata, target,
host, and ready state before smoke. Caller-provided deployment URLs are ignored.
Post-promotion smoke validates the promoted deployment through the canonical
alias rather than rechecking `main`. Schema apply remains a separate, explicit
action when audit identifies an authorized missing forward migration. Release
dispatch follows only after a clean audit.

Both shapes require:

1. Pin exact application SHA and expected production database identity.
2. Audit before mutation.
3. Permit only the expected manifest and exact expected delta kinds/names.
4. Hold one advisory-lock/audit/mutation boundary through the apply decision.
5. Apply transactionally.
6. Require clean post-apply and independent final audits.
7. Run an authenticated, read-only canary through a real schema-backed handler.
8. State proof limits explicitly; route mount plus `401` does not prove the
   authenticated database path.

### Recovery Pattern Proven Here

The governed recovery minimized blast radius:

- Initial audit: 18 top-level decisions, 17 `SKIP`, one
  `internal-analysis: APPLY-MISSING-DDL`.
- Authorized delta: six named tables, no unrelated apply, no `REFUSE`, no drop.
- Mutation: only `migrations/0044_internal_analysis.sql`, 14 statements,
  transactionally.
- Postcondition: all 18 manifests `SKIP`; all six tables `shape-ok`.
- Verification honesty: health `200` and unauthenticated routes `401` were
  observed after recovery. Authenticated live `200` was not replayed because no
  production smoke credentials were available in the shell.

### What Went Well

- The `401`/`500` split localized failure past routing/auth and at the
  schema-backed handler boundary.
- Audit ran before mutation and produced a bounded, reviewable delta.
- Exact-SHA fencing prevented applying against a moving application target.
- Transactional apply plus two clean audits gave strong schema-state proof.
- Unavailable authenticated replay was reported as a proof gap, not inferred
  from schema success.
- Existing migration manifest made safe, narrow recovery possible.

### What Surprised Us

- Migration, journal, manifest, and ephemeral-PostgreSQL proof can all be green
  while production remains completely unprovisioned.
- A release workflow can be fail-closed yet still fail to govern production if
  another platform path activates code first.
- Current reconcile apply policy accepts a broader nonempty apply set than this
  incident intended. It does not yet pin database identity, exact manifest,
  exact table/delta tuple, or keep initial audit and mutation decision under one
  lock.

### Previous Actions Review

- **REFL-040:** Three actions completed (`3/3`, 100%). Environment parity was
  normalized, targeted/full proof ran, and false Task 19 code attribution was
  corrected. No recurrence here; this production incident had a different cause.
- **Task 11 production closeout:** Governed schema run `30294423925` and release
  run `30294773721` both completed. That sequence worked, but remained an
  incident-specific/operator-invoked practice. It did not become a mandatory
  dependency of all merge-triggered production activation.

### Start, Stop, Continue

**Start**

- Treat production manifest `SKIP (shape-ok)` as evidence required before
  activating any schema-backed consumer.
- Preserve `vercel.json.github.autoAlias=false` as the code-owned activation
  invariant.
- Record exact SHA, database identity, manifest, delta tuple, transaction
  result, final audit, and authenticated canary as one release proof chain.
- Split schema provisioning from feature activation when hosting auto-promotion
  cannot be governed.

**Stop**

- Calling migration presence in Git or passing Testcontainers "production
  migrated."
- Using unauthenticated `401` as proof that an authenticated handler works.
- Allowing a generic nonempty apply set when one exact production repair was
  authorized.
- Treating manual release order as equivalent to enforced release order.

**Continue**

- Audit before mutation; stop on unrelated drift or `REFUSE`.
- Fence production work to exact live `main`.
- Apply transactionally and independently re-audit.
- Report untested runtime boundaries plainly.

### SMART Actions

| Action                                                                                                                                                                                       | Owner                  | Due                                        | Binary success measure                                                                                                             | Status |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Make every production-serving path respect schema proof: disable Vercel merge auto-aliasing and require governed promotion after schema proof.                                               | Release owner          | Before next schema-backed route activation | `vercel.json.github.autoAlias=false`; governed exact-SHA release requires clean schema audit before staged smoke and promotion.    | DONE   |
| Harden `prod-schema-reconcile` apply authorization with expected database identity, expected manifest, exact allowed delta kinds/names, and one advisory-lock audit/apply decision boundary. | Schema/reconcile owner | Before next production schema apply        | Negative tests reject wrong database, extra manifest/table, shape repair, drop, or audit/apply drift; intended exact tuple passes. | OPEN   |
| Add authenticated read-only internal-analysis production canary and pin its manifest/migration mapping.                                                                                      | Feature owner          | This reflection closeout                   | `REFL-041.test.ts` passes and production smoke requires `200` plus JSON `drafts` from `/api/funds/1/internal-analysis/drafts`.     | DONE   |

**Follow-up:** Review at the next schema-backed release gate. Current
completion: `2/3` (67%). Production activation remains blocked until the
required sequence completes for the exact release SHA. Remaining reconcile
authorization hardening does not roll forward silently; schema/reconcile owner
must block any apply or explicitly re-scope it with new evidence.

## 3. Evidence

- **Production drift proof:** Audit run `30327256894` found only the six
  migration 0044 tables missing.
- **Mutation proof:** Apply run `30327357992` ran only
  `migrations/0044_internal_analysis.sql`, 14 statements, at exact live `main`
  `d2ba8729a282822bfa1516e5d4cca1a4dc28e666`.
- **Final schema proof:** Audit run `30327532290` returned 18/18 manifests
  `SKIP`; all six internal-analysis tables were `shape-ok`.
- **Runtime boundary proof:** Production health returned `200`; unauthenticated
  Task 18 drafts and Task 19 narratives routes returned `401`.
- **Runtime proof limit:** No authenticated post-recovery call was made from
  this session. Schema recovery is proven; authenticated feature behavior
  remains for credentialed production smoke.
- **Regression guard:** `tests/regressions/REFL-041.test.ts` pins migration 0044
  to the exact six-table production manifest and requires an authenticated
  read-only internal-analysis canary in
  `tests/smoke/production-boundaries.spec.ts`.
- **Activation guard:** `vercel.json.github.autoAlias=false` prevents the Git
  integration from automatically assigning production aliases; the governed
  workflow owns staged smoke, promotion, and production smoke.
- **Related:** REFL-040 (cross-worktree environment parity); Task 11 governed
  schema/release closeout.
