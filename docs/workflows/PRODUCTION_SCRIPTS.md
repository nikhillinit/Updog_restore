---
status: ACTIVE
last_updated: 2026-10-10
---

# Canonical Production-Action Procedure

## Status

This procedure is active solely as canonical repository routing and procedure.
ACTIVE is not executable-entrypoint proof, production readiness, or production
authorization. Current UNKNOWN prerequisites block their applicable action. The
branch-protection writer is retired: its reachable entrypoint is removed and
ordinary branch-policy surfaces have static reachability proof. Repository
activation supplies no mutation authority; applicable evidence gates continue to
require zero mutation dispatch until satisfied.

Merge and `CI Gate Status` authorize source admission only; neither authorizes
provider, schema, data, deployment, promotion, branch, or environment mutation.
An owner note, review, approval, receipt, operator prose, or action record
cannot override a machine failure.

## Guarded order

### Fixed-template actuals pilot configuration

`ACTUALS_PILOT_PUBLISH_ENABLED` independently defaults to disabled. Registering
the pilot for draft/preview access does not authorize new canonical publication.
Enable it only for the independently verified pilot fund through an admitted
configuration rollout. Missing/false allows authenticated committed-command
replay but refuses new writes; invalid values or enablement without a fund fail
startup. Changing this setting is not an atomic revocation of in-flight
commands.

`ACTUALS_PILOT_FUND_ID` is not set by any production script. Keep it unset on
Vercel until a separate action-scoped activation is authorized and validated.
Source admission of F_1.12.0, its isolated Gate A STOP/GO record, and Current
Forecast's #1299 GO/NO-GO are separate gates. The pilot publishes policy `1.4.0`
/ payload `5`; it does not enter shadow mode or trigger organic soak. Economics
and periodic analysis remain unavailable for that facts policy.

### F1 candidate schema and application order

F_1.13.0 is a local candidate. Source admission still requires current-head
`CI Gate Status`; local tests, this procedure, and a receipt do not grant
dispatch authority. Preserve existing 0050–0055 modes and receipts.

ADR-103 route note (2026-09-27): 0056 and 0057 DDL reach production only through
the linear mode `apply-journaled-0050-0061` (see "Linear journaled schema route
0050-0061" below). The actuals recovery prerequisites in this section attach to
actuals data actions and pilot enablement, not to empty-table DDL applied
through that mode. The standalone `apply-actuals-draft-0056` and
`apply-actuals-restatement-0057` modes stay blocked.

1. Prove the complete through-0055 ledger and catalog. If legacy recovery is
   needed, use its separately admitted procedure and authentic history; never
   synthesize journal rows or run a later source tree through an older boundary.
2. Rehearse unchanged 0056 SQL against an owned disposable database. Manifest 33
   and the bounded runner verify pristine apply, exact completed replay,
   rollback, predecessor history, and immutable catalog wiring. The new
   `apply-actuals-draft-0056` schema mode has its own dry-run/result contract;
   generic missing-DDL and all-SKIP checks are not its admission test.
3. Before any production apply through a standalone 0056 or 0057 mode, satisfy
   every canonical prerequisite below. Both actuals preflights collect
   authenticated protected-source/CI, exact owner-dispatch, and Neon/database
   identity observations. Their reports distinguish failed checks, missing live
   evidence, undefined owner criteria, and missing collector engineering.
   Immediately before either bounded apply, `actuals-migration-preapply.ts`
   compares the exact mode/source/run/target binding and freshly revalidates
   source, dispatch authority, then target identity, stopping on the first
   refusal. Prior report JSON supplies no authority. Read-only recovery
   reference/artifact-byte collection and immediate pre-apply revalidation
   exist. Qualifying backup/PITR, restore, custody,
   isolation/containment/residue producer proofs and final runtime admission
   remain incomplete. The owner-defined requirements below do not supply exact
   evidence bindings or live proof. Production apply through the standalone 0056
   and 0057 modes, and every actuals data action, remains blocked. Report JSON,
   a connection URL, an environment flag, local rehearsal, or a schema receipt
   cannot grant runtime admission.
4. A draft-feature application artifact requires admitted 0056 first. Keep
   `ACTUALS_PILOT_PUBLISH_ENABLED=false`; bind API, worker, database, queue, and
   configuration identities to the exact admitted release. Verify save, history,
   restore, fresh preview, and disabled-publication refusal on authorized
   fixtures.
5. The full correction artifact additionally requires separately admitted 0057
   and manifest 34 before exposing restatement endpoints. A 0056 receipt does
   not admit 0057. Use the separate `apply-actuals-restatement-0057` schema mode
   and `actuals-restatement-0057` rehearsal mode. The bounded runner pins its
   own SQL, journal and manifest identities, requires exact completed 0056, and
   produces a distinct 0057 apply/replay receipt. Its action-specific production
   preflight refuses missing authoritative prerequisite verifiers; its owned
   disposable test capability cannot authorize a production target. Corrections
   and subsequent appends emit policy 1.5/payload 6; old policy 1.4/payload 5
   remains immutable and readable. Schema/data history has no destructive down
   migration; containment requires a compatible reader and separately authorized
   configuration or release action.
6. Exact F1 identity and inception-to-cutoff actuals must independently pass
   reconciliation before canonical publication is enabled. Missing F1 inputs do
   not prevent synthetic feature validation. Plan acceptance, forecast
   recompute, shadow entry, and activation remain separate explicit actions.

### Actuals recovery evidence requirements

For a high-risk production actuals data or schema change, other than empty-table
0056 and 0057 DDL applied through the ADR-103 linear mode
`apply-journaled-0050-0061`, a successful isolated restore must have completed
during the preceding **72 hours**. The exact `actuals-isolated-restore-proof`
workflow run produces the evidence, stored in **GitHub Actions**, protected from
modification, and retained for the defined period. The repository owner is
accountable for custody; repository administrators hold administrative custody.
The production workflow independently retrieves the artifact by ID and verifies
its digest and bindings. That separately recorded verification must confirm
identity and integrity before production use.

The retention duration and exact execution, artifact, restore, and verification
bindings remain unresolved. Bind those identifiers and observations before
admission; missing bindings remain blocked. Naming the workflow and defining its
requirements does not prove successful recovery or authorize a production
action.

The actuals preflight collects explicitly selected recovery references through
read-only provider and GitHub requests and checks downloaded artifact bytes
against their SHA-256 digest. These observations do not establish successful
restore, exact PITR coverage, custody compliance, or migration containment and
residue. Missing references or live records remain missing live evidence;
authenticated records without an admitted producer/proof contract remain missing
collector engineering. Missing retention duration remains an owner-definition
blocker. Artifact metadata does not establish which rerun attempt produced the
bytes; that binding requires qualifying producer evidence. Neither a locator nor
a prior report grants admission. Pre-apply validation collects the references
again; the production apply guards remain closed pending qualifying proof
contracts and final runtime admission.

The named restore-proof workflow produces a fixed synthetic witness. It does not
restore a database or supply qualifying restore evidence, and the recovery
collector does not consume its attestation. The current forecast rehearsal's
actuals selectors still encounter production-prerequisite refusal before
provider creation; that rehearsal does not substitute for a successful actuals
restore producer. The remaining payload, authenticated producer-attempt/digest
binding, independent verifier and follow-on refusal tests are proposed in
[the F1 release plan](../1-plans/F_1.13.0_f1-publication-release-and-restatement.plan.md#remaining-recovery-producer-and-admission-specification).
Its design must establish restore completion time, the actual recovered source,
returned isolated target, exact migration and manifest hashes, target
fingerprint, containment/residue and custody evidence. A payload's own attempt
or timestamp cannot establish those facts. Retention duration still requires an
owner definition. Specification completion, producer/validator implementation,
synthetic validation, live qualified restore evidence and final runtime
admission remain separate; none supplies action-scoped production authority by
itself.

### Validation sequence

Before first mutation, a retained entrypoint must validate all applicable
conditions in this order:

1. A refreshed exact SHA and current candidate head.
2. Separate action-scoped dispatch authority.
3. Intended provider scope and an existing target identity when one exists.
4. Required machine-checkable prerequisites.
5. Immediately before an apply, revalidated live source, target, and applicable
   restore reference or digest through restore-reference revalidation. The
   ADR-103 route exception below applies to this step.

For target creation, validate intended scope before creation; validate exact
returned target ID immediately afterward; then allow no dependent mutation,
schema apply, deployment, or promotion before that validation succeeds.

For production schema/data action, current managed backup/PITR capability,
successful isolated restore freshness within an owner-defined window, named
custody roles, and preview/restore isolation from production data and
side-effect channels are mandatory. Missing, malformed, stale, mismatched, or
unresolved evidence means zero mutation dispatch. This procedure makes no claim
that these prerequisites are presently proven.

ADR-103 route exception: for `prod-schema-reconcile.yml` mode
`apply-journaled-0050-0061` only, the owner's confirmation of a Neon restore
branch created immediately before dispatch satisfies step 5 for the restore
reference. For that mode, the ADR-103 accepted risk replaces the backup/PITR,
restore-freshness, custody-role, and isolation evidence in the previous
paragraph. The workflow does not verify the branch, and the owner withholds
dispatch when it is absent. Every other step and condition applies. The
governing policy records this amendment under ADR-103.

## Current blockers

Do not dispatch while any applicable blocker remains UNKNOWN, including:

- provider target scope/identity, source freshness, validator ordering, smoke,
  canary, residue, and containment evidence; or
- backup/PITR, restore freshness, custody-role, and preview/restore-isolation
  proof for a production schema/data action, except as the ADR-103 route
  exception above states for `apply-journaled-0050-0061` and the governing
  policy states for `scripts/provision-prod-users.ts --apply` (see "Production
  user provisioning" below) and for
  `scripts/release/purge-canary-runs.mjs --execute --run-id --fund-id` (see
  "Release canary run purge" below).

Retained entrypoints are not an authority or coverage claim. Any retained
entrypoint whose current targeted order proof or action evidence is absent,
stale, or mismatched remains blocked. Repository activation does not make an
entrypoint production-ready.

## Current Forecast Phase P routes

These routes become canonical only after complete Phase P source admission.
`release-production.yml` remains the only deployment and promotion workflow.
`prod-schema-reconcile.yml` remains the only production schema workflow; mode
`apply-current-forecast-0050-0055` applies only the exact journaled range.
`current-forecast-neon-rehearsal.yml` validates one isolated Neon branch before
dependent action. `current-forecast-production-action.yml` wraps existing
authenticated routes for separate `enter-shadow`, `activate`, `kill`, and
`resume` dispatches. `readback` performs identity and state reads only. The
wrapper owns action-time source, release-manifest, provider, direct-database,
deployed API, protected-session, replay, conflict-probe, and post-state fences.
No workflow authorizes another dispatch.

## Linear journaled schema route 0050-0061 (ADR-103)

This route becomes canonical only after source admission of F_1.18.0 together
with the ADR-103 policy amendment. `prod-schema-reconcile.yml` mode
`apply-journaled-0050-0061` validates the exact production migration ledger. It
then applies every unapplied journaled migration from the validated tail through
`0061_durable_create_receipts`, in journal order, in one transaction. The runner
is `scripts/run-journaled-0050-0061-migrations.mjs`.
`current-forecast-neon-rehearsal.yml` mode `journaled-0050-0061` runs the same
runner against an isolated Neon branch. The route is valid only while the
repository ends at journal idx 62 and manifest 38. The runner refuses before any
database connection when the repository holds anything past idx 62 or manifest
38; the next range needs a successor route. Each step below is a separate owner
action. Merge, this procedure, and a receipt authorize none of them.

### Owner sequence

1. Before starting, confirm that the eleven canary cap variables and the TTL are
   set in the GitHub `Production` environment and the Vercel `Production`
   environment. `baseline-policy-preflight` in `release-production.yml` requires
   them. Release is blocked without them, and the receipt helps only until the
   next migration lands, so the apply-to-release window must be short.
2. Merge with `CI Gate Status` green.
3. Freeze: no merge that touches `migrations/` or
   `scripts/prod-schema-manifests/` until the release dispatch completes. A
   merge during the freeze makes the tail guard refuse the route (before
   mutation) or makes the release audit fail (after apply). It also moves `main`
   away from the rehearsed SHA.
4. Dispatch the rehearsal mode `journaled-0050-0061` at the `main` HEAD SHA.
   Record that SHA and the apply duration. Delete the rehearsal branch (the
   project has a low branch limit).
5. Derive the target fingerprint with the recipe below. Set it as the
   `production-schema` environment secret
   `PRODUCTION_SCHEMA_TARGET_FINGERPRINT`.
6. Pick a quiet window and stop the Railway worker. The apply holds ACCESS
   EXCLUSIVE locks on several app tables until commit, and a long app
   transaction can trip its 5 s `lock_timeout`.
7. Create a Neon restore branch of the production branch immediately before
   dispatch. Record its creation time and identifier privately, outside the
   repository.
8. Dispatch `apply-journaled-0050-0061` at the rehearsed SHA. If `main` has
   moved, stop and re-rehearse.
9. Act on the outcome. The `Read back journaled ledger` line decides the branch
   (see "Readback outcomes"). The committed marker line is diagnostic only.
   - **Success**: record the artifact ID, digest, and receipt SHA-256 from the
     step summary. Restart the worker.
   - **Failed; the readback reports `ready 0/12` or `refused-before-connect`**:
     nothing changed. Restart the worker. For a lock timeout
     (`failed-sqlstate 55P03` in the apply output), dispatch again fresh through
     steps 7-8, with a new restore branch first. A GitHub re-run is attempt 2
     and is refused. For any other refusal, stop and revise the plan.
   - **Failed; the readback reports `complete 12/12`**: the transaction
     committed and the catalog is clean. Restart the worker. Obtain the receipt
     with a fresh dispatch through steps 7-8. The runner classifies the ledger
     complete, performs no mutation, and emits an `applied: false` receipt.
   - **Failed; the readback reports `refused-ledger-or-catalog`**: unknown
     state. Stop. Treat it as an incident. Do not dispatch the apply mode again.
     Choose between a forward fix and a restore from the restore branch, which
     discards every write since its creation time.
   - **Failed before the apply step started** (the apply step shows as skipped,
     so no readback runs): nothing changed. Fix the refused gate or stop.
   - **The readback reports `failed-no-state` or `failed-sqlstate`, or prints no
     line after an apply step that started**: no state was read. Run the
     synchronized ledger query below and act on its result.
10. Read back every Vercel environment that points at the production database:
    `ACTUALS_PILOT_FUND_ID` is absent, and `ACTUALS_PILOT_PUBLISH_ENABLED` is
    absent or false.
11. Dispatch `release-production.yml` with the recorded values as schema apply
    identity. Lift the freeze after the release completes.

### Target fingerprint recipe

The apply compares the target with the `production-schema` environment secret
`PRODUCTION_SCHEMA_TARGET_FINGERPRINT` before it takes the lock. A missing or
different value refuses with `refused-target`. The owner derives the value
locally from values read in the provider console, never from workflow output:

- `directHost`: the hostname of the direct (non-pooler) endpoint in the
  production `DATABASE_URL` that the workflow uses.
- `port`: the port in that URL. Leave it empty when the URL has none; the
  serializer then uses `5432`.
- `database`: the database name in that URL (`current_database()`).
- `user`: the role that URL authenticates as (`current_user`).

The runner fingerprints the endpoint the driver connects to. A `host` or `port`
query parameter in the URL overrides the authority, so when one is present use
its value instead.

From a checkout of the rehearsed SHA, run `computeTargetFingerprint`, which the
runner exports. Read the values into the shell so they stay out of shell
history:

```bash
read -r FP_HOST; read -r FP_PORT; read -r FP_DATABASE; read -r FP_USER
export FP_HOST FP_PORT FP_DATABASE FP_USER
node --input-type=module -e "import { computeTargetFingerprint } from './scripts/run-journaled-0050-0061-migrations.mjs'; console.log(computeTargetFingerprint({ directHost: process.env.FP_HOST, port: process.env.FP_PORT, database: process.env.FP_DATABASE, user: process.env.FP_USER }))"
```

Store only the output, and only as the secret. Do not write the inputs or the
output to the repository, an issue, a pull request, or a log. The rehearsal
computes its own branch fingerprint with the same function and never reads this
secret.

### Readback outcomes

The workflow step `Read back journaled ledger` runs directly after
`Apply additive-safe reconciliation`. It has `if: always()` scoped to this mode
and to an apply step that started (it runs after apply success, failure, or
cancellation), and `continue-on-error: true`. It runs the runner read-only (no
`--apply`, no fingerprint, no result file, no mutation) with the same
`DATABASE_URL`. It is a reporting step: a readback failure never fails the job
and never blocks the receipt. When the apply step did not start (an earlier step
refused), the runner never ran, nothing changed, and the readback does not run.
A missing or failed readback after an apply step that started sends the owner to
the synchronized ledger query.

The runner prints one fixed success line,
`journaled-0050-0061: ledger readback <state> <n>/12`:

- `ready 0/12`: the production pre-dispatch count. Nothing changed.
- `complete 12/12`: the transaction committed and the catalog is clean, because
  read-only mode validates the catalog of a complete ledger.

Every failure line has the form
`journaled-0050-0061: <category>[ <SQLSTATE>]: <text>`
(`formatJournaledRangeFailure` in the runner). The categories are:

- `refused-before-connect`: tail guard, pin drift, argument error, manifest
  load, or direct-URL refusal. The runner made no connection. Nothing changed.
- `refused-target`: apply only. The expected fingerprint is missing or
  different. The runner refused before the lock. The read-only readback never
  prints it.
- `refused-ledger-or-catalog`: after the ledger read, the classifier, a catalog
  validator, the ADR-074 baseline check, or the audit refused. In the readback
  this means unknown state and is an incident.
- `failed-sqlstate`: a PostgreSQL error after connection, with its SQLSTATE (for
  example `55P03` for a lock timeout or `23514` for a CHECK violation).
- `failed-no-state`: every other error after connection, including advisory-lock
  contention, an identity-read failure, and a lost connection. No ledger or
  catalog state was read to a conclusion.

Treat a readback that this list does not name as an incident. The apply prints
`journaled-0050-0061: migration transaction committed` after `migrate()`
returns. That line is diagnostic only: a connection lost while awaiting `COMMIT`
can leave the transaction committed with no line printed. Branch on the
readback, never on this line.

### Synchronized ledger query

Use this query for owner sequence step 9 when the readback reports
`failed-no-state` or `failed-sqlstate`, or prints no line. It is a read-only
variant of the owner-approved ledger query. It takes a session advisory lock and
writes no data. Run all three statements in one session through the direct
(non-pooler) endpoint, because a transaction pooler does not keep a session lock
on one server connection. The lock key is `RECONCILE_LOCK_ID` in
`scripts/reconcile-prod-schema.mjs` (`20260628` when this section was written;
re-read it at the dispatched SHA).

```sql
SELECT pg_try_advisory_lock(20260628);
-- Repeat until the result is true, waiting between attempts.
SELECT hash, created_at FROM public.drizzle_migrations ORDER BY created_at;
SELECT pg_advisory_unlock(20260628);
```

While `pg_try_advisory_lock` returns false, another session holds the lock, and
that holder may still commit. Wait and retry. Do not read the ledger without the
lock. While the owner holds the lock, a queued workflow run refuses before
mutation. A lock not granted within 10 minutes (the apply's
`transaction_timeout`) is an incident. Read the rows as follows:

- The unchanged 14 rows, ending at `0049_kpi_observations`: nothing changed.
  Continue as for `ready 0/12`.
- 26 rows, the last with `created_at` `1790380800000` (the journal `when` of
  `0061_durable_create_receipts`) and the SQL hash that the runner pins for
  0061: handle as `complete 12/12`. The fresh dispatch re-validates the catalog
  before it emits a receipt.
- Anything else: an incident.

## Production user provisioning

`scripts/provision-prod-users.ts` creates, updates, or deactivates login users
and replaces their fund grants from an identity file. `--apply` against
production is admitted by the governing policy as an owner-run route. The owner
runs it locally, never from CI. Each run is a separate owner action.

### Identity file

A JSON array kept outside the repository and deleted after use. Each entry has
`username`, `password` (at least 16 characters, never a dev seed password),
`role`, and `fundIds`, plus optional `releaseCanaryPrincipal` and `active`.

- Release canary principal: role `partner` and `releaseCanaryPrincipal: true`.
  The file may hold at most one. The marker is set only at creation; a run that
  would change it on an existing user refuses.
- Canary reconciler: a dedicated non-human `admin` account, distinct from the
  canary principal and from every human account.
- Deactivation: `active: false` with a fresh password. `fundIds` replaces the
  user's grants, so list every grant to keep; `[]` removes them all.
- Issued sessions: a password, role, or grant change does not end sessions
  already issued. They keep their old role and grants until they expire.
  `active: false` is checked on every request, so it cuts off access at once.
  Reactivating a user revives its unexpired sessions from before deactivation.

### Owner sequence

1. Check out the exact live `main` SHA with no tracked changes.
2. Use the direct (non-pooler) production URL. Read it into the shell so it
   stays out of shell history:

   ```bash
   read -rs DATABASE_URL; export DATABASE_URL
   ```

3. Dry run, and review every `[PLAN]` line (before and after for each user, with
   the exact fund IDs in `grants=[...]`):

   ```bash
   NODE_ENV=production PROVISION_PROD=1 IDENTITY_FILE="<absolute path>" npx tsx scripts/provision-prod-users.ts --dry-run
   ```

   Record the `[PLAN] digest=` value. The digest binds the source SHA, the
   identity file, the target, and the current rows of every user in the file.

4. Derive the target fingerprint with the recipe above. For the same URL and
   role it equals `PRODUCTION_SCHEMA_TARGET_FINGERPRINT`.
5. Create a Neon restore branch of the production branch immediately before
   apply. Record its creation time and identifier privately, outside the
   repository.
6. Apply. Read the fingerprint into the shell like the URL, so it stays private:

   ```bash
   read -rs EXPECTED_TARGET_FINGERPRINT; export EXPECTED_TARGET_FINGERPRINT
   NODE_ENV=production PROVISION_PROD=1 IDENTITY_FILE="<absolute path>" EXPECTED_SHA="<main SHA>" npx tsx scripts/provision-prod-users.ts --apply --expected-plan-digest=<digest>
   ```

   Apply fingerprints the driver's effective endpoint, so a `?host=` or `?port=`
   override in the URL cannot redirect it. It locks the existing target rows,
   waiting at most 5 s for a conflicting transaction, recomputes the digest in
   the same transaction, re-checks the source just before the first write, and
   writes every user in that one transaction. A user reviewed as absent is
   inserted without overwrite, so a concurrent creation of the same username
   fails the whole apply.

7. Act on the outcome:
   - `[DONE]` lines: success. Delete the identity file. Delete the restore
     branch once the provisioned accounts are confirmed.
   - `Plan digest mismatch`, `Target fingerprint missing or mismatched`, a
     pooled-endpoint refusal, or a source refusal: nothing was written. Re-run
     the dry run and review again.
   - `COMMIT was not confirmed`: unknown state. The writes may have committed.
     Run the dry run and compare each `[PLAN]` before-state with the intended
     after-state before any retry.
   - Any other failure before `COMMIT`: the transaction rolled back. Run the dry
     run to confirm the current state before retrying.

## Release canary run purge

`scripts/release/purge-canary-runs.mjs --execute --run-id --fund-id` is admitted
by the governing policy as an owner-run route (ADR-108). It deletes one
terminal, expired release-canary run's single canary fund and that fund's rows
in the reviewed scope, and keeps the run row as a purged tombstone. The owner
runs it locally, never from CI. Each execute is a separate owner action. A bare
`--execute` without `--run-id` stays mechanically blocked.

1. Check out the exact live `main` SHA with no tracked changes.
2. Use the direct (non-pooler) production URL. Read it into the shell so it
   stays out of shell history:

   ```bash
   read -rs DATABASE_URL; export DATABASE_URL
   ```

3. Dry run, inside `BEGIN READ ONLY`:

   ```bash
   node scripts/release/purge-canary-runs.mjs --run-id=<run uuid> --fund-id=<fund id>
   ```

   The JSON shows `executingSha` (this checkout), which is distinct from
   `run.releaseSha` (the release the canary ran for); the workflow identity,
   status, version, and expiry; `storedResidue` against `liveResidue`; every
   `deleteOrder` count; the `writeExcludedTables` that execute would lock; and
   the `digest`. A refusal names its cause: not terminal, not expired, wrong
   fund, a dependent or fund-owned row outside the scope, a trigger or rule, or
   a missing `audit_log`. For a purged run it prints the stored receipt as
   `"outcome": "readback"`, and refuses if any row still names the fund or run.

4. Derive the target fingerprint with the recipe above. For the same URL and
   role it equals `PRODUCTION_SCHEMA_TARGET_FINGERPRINT`.
5. Create a Neon restore branch of the production branch after reviewing the dry
   run and immediately before execute. Record its identifier (`br-...`) and
   creation time privately, outside the repository.
6. Execute. Read the fingerprint into the shell like the URL, so it stays
   private:

   ```bash
   read -rs EXPECTED_TARGET_FINGERPRINT; export EXPECTED_TARGET_FINGERPRINT
   RELEASE_CANARY_PURGE_OPERATOR=1 EXPECTED_SHA="<main SHA>" RESTORE_BRANCH_ID="<restore branch id>" node scripts/release/purge-canary-runs.mjs --execute --run-id=<run uuid> --fund-id=<fund id> --expected-plan-digest=<digest>
   ```

   Before connecting it checks the inputs and that the checkout HEAD, live
   `main`, and `EXPECTED_SHA` are equal with no tracked changes. In one
   transaction it locks the run, the fund, and every row to delete (waiting at
   most 5 s for a conflicting transaction), share-locks the write-excluded
   tables, recomputes the digest, re-checks the source within 10 s, and then
   writes the receipt, the deletes, and the tombstone. The script records
   `RESTORE_BRANCH_ID` in the receipt and does not verify the branch. While it
   holds the locks, writes to `funds` and the other write-excluded tables wait
   for every fund; a client idle for 30 s inside the transaction loses its
   session and its locks.

7. Act on the outcome:
   - `"outcome": "purged"`: success. Run the dry run again: it must print
     `"outcome": "readback"`. Delete the restore branch only after that
     readback.
   - `Plan digest mismatch`, `Target fingerprint missing or mismatched`, a
     pooled-endpoint refusal, a source refusal, or a missing input: nothing was
     written. Re-run the dry run and review again.
   - `COMMIT was not confirmed`: unknown state. Run the dry run to read the run
     back before any retry.
   - Any other failure before `COMMIT`: the transaction rolled back. Run the dry
     run to confirm the current state before retrying.

## Original project Preview containment (ADR-109)

The governing policy admits no Preview-producing action on the original Vercel
project `prj_z0tJGUCgjnmMOv5KG9cEP3ucJ7Xp` (team
`team_BzOixmLqQ9VA2mTvFvzBLRWw`). Production reaches it only through Release
Production. The policy admits no provider write for this containment. Every
provider step below is owner-authorized, separately, for that exact action, and
none has been executed. The Neon default branch stays `br-cool-tree-advjpopv`.
UNDETERMINED marks what no official source or observation has settled.

Before any provider step, run the fence from a clean checkout of live `main`:

```bash
EXPECTED_SHA="<main SHA>"
fence() {
  git fetch -q origin main || return 1
  local live; live=$(gh api repos/nikhillinit/Updog_restore/commits/main --jq .sha) || return 1
  [[ "$live" =~ ^[0-9a-f]{40}$ && "$live" == "$EXPECTED_SHA" && "$(git rev-parse HEAD)" == "$EXPECTED_SHA" ]] || { echo "REFUSE: source identity"; return 1; }
  git diff --quiet HEAD || { echo "REFUSE: tracked changes"; return 1; }
  git show "$live:docs/governance/solo-internal-change-and-production-policy.md" | tr -s ' \n' ' ' \
    | grep -qF 'Under ADR-109 no Preview-producing action is admitted' || { echo "REFUSE: admitted policy"; return 1; }
  echo "fence ok"
}
fence
```

A step that touches the original project, the production branch, or production
credentials also needs its own admitted route; the fence does not supply one.

### Step 1: Git deployments off (source; admitted by merge)

`vercel.json` sets `git.deploymentEnabled: false`, a documented setting.
Coverage is UNDETERMINED. Vercel does not document whether the pushed commit's
`vercel.json` or the production branch's decides. If it is the pushed commit,
branches whose tree lacks the key (open Dependabot and agent branches) keep
deploying, and a branch could remove the key before CI rejects the change. The
setting does not cover CLI or API deployments, so it is not project-wide
containment. Release Production is expected to be unaffected, because the
documented scope is deployments upon commits and it deploys through the CLI
(`vercel deploy --prebuilt --prod --skip-domain`). That deploy also passes
`--meta githubDeployment=1 --meta githubCommitRef=main`, and how the setting
treats it is UNDETERMINED until the first Release Production dispatch after the
merge. A refusal fails closed before promote: the deploy step validates the
returned URL before any later step runs.

Verify each exact push, read-only. Do not create a push to probe containment.
Vercel creates no record when it declines a push, so coverage is read from a
bracket around the push, not from a provider receipt. Take the push time from
GitHub's repository activity, not from a committer date or a PR update time:

```bash
P=prj_z0tJGUCgjnmMOv5KG9cEP3ucJ7Xp; T=team_BzOixmLqQ9VA2mTvFvzBLRWw; R=nikhillinit/Updog_restore
REF="<ref>"
gh api "repos/$R/activity?ref=refs/heads/$REF&per_page=10" --jq '.[] | [.timestamp, .activity_type, .after] | @tsv'
SHA="<after SHA of that push>"; PUSHED="<its activity timestamp>"
git fetch -q origin "$REF" && git show "$SHA:vercel.json" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log("tree covered:", JSON.parse(s).git?.deploymentEnabled === false))'
```

A zero result for that exact push counts as covered only when all of these hold:

- (a) Before-control: Vercel was processing pushes just before. An earlier push
  to this repository, at most 1 hour before `PUSHED`, has a Git-created
  deployment on this project and a `Vercel` commit status. Record both latencies
  from that push's activity timestamp.
- (b) Gap: the query runs at least 30 minutes after `PUSHED`. On 2026-10-19 the
  before-control showed 4 s from push to status and to deployment, and the
  integration's replacement deployment has followed within about 5 s more. 30
  minutes exceeds that combined delay more than 100 times.
- (c) Zero deployments for `SHA`, all states, all pages.
- (d) No `Vercel` status on `SHA`.
- (e) No Neon branch for `REF`: no non-production branch of
  `bold-truth-07145433` whose name contains `REF` and was created after
  `PUSHED`, and no branch with parent `br-cool-tree-advjpopv` created after
  `PUSHED` except owner restore branches. The name match excludes production
  branch id `br-cool-tree-advjpopv` and applies the same created-after-`PUSHED`
  cutoff. This is a defect fix for `main` refs: the production branch is named
  `main`, so the prior name term always matched it. The cutoff is intentional;
  older name-matched branches no longer count. It preserves both recorded #1645
  PR-head readings.

```bash
# (a) for the earlier push: Vercel status time; its deployment appears in (c)'s listing
gh api "repos/$R/commits/<earlier SHA>/statuses?per_page=100" --jq '.[] | select(.context == "Vercel") | .created_at'
# (c)
SINCE=$(node -e 'console.log(Date.parse(process.argv[1]) - 3600000)' "$PUSHED")
vercel api "/v6/deployments?projectId=$P&teamId=$T&since=$SINCE&limit=100" --paginate --raw | node -e '
  let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
    const all = JSON.parse(s);
    for (const d of all) console.log(new Date(d.created).toISOString(), d.uid, d.state, d.target ?? "preview", d.meta?.githubCommitRef, d.source ?? "");
    console.log("deployments for SHA:", all.filter((d) => d.meta?.githubCommitSha === process.argv[1]).length);
  });' "$SHA"
# (d)
gh api "repos/$R/commits/$SHA/statuses?per_page=100" --jq '[.[] | select(.context == "Vercel")] | length'
# (e)
neonctl branches list --project-id bold-truth-07145433 --output json | node -e '
  let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
    const [ref, pushed] = process.argv.slice(1);
    const hits = JSON.parse(s).filter(
      (b) =>
        (b.id !== "br-cool-tree-advjpopv" && b.name.includes(ref)
          && Date.parse(b.created_at) > Date.parse(pushed))
        || (b.parent_id === "br-cool-tree-advjpopv"
          && Date.parse(b.created_at) > Date.parse(pushed)
          && !b.name.startsWith("restore/"))
    );
    for (const b of hits) console.log(b.created_at, b.id, b.name);
    console.log("Neon branches for ref:", hits.length);
  });' "$REF" "$PUSHED"
```

After-control: the next natural Git-created deployment on this project after
`PUSHED` confirms that the integration was live across the push. Once the key is
on `main`, that deployment may itself be an uncovered stale-branch fork, or may
never come. Never create one to confirm. Without it, the result stays "covered
(before-bracket only)". Record `REF`, `SHA`, `PUSHED`, the tree result, (a) to
(e) with their query times, and any after-control privately. For a stale tree
the reading assumes `main`'s file has the key at `PUSHED`.

| Tree covered | Bracket (a)-(e) | Deployments for SHA | Meaning                                                                                                                         |
| ------------ | --------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| yes          | met             | 0                   | Covered (before-bracket only) for this exact push; covered (bracketed) after the after-control.                                 |
| yes          | not met         | 0                   | UNDETERMINED. Recheck later; do not interpret.                                                                                  |
| no           | met             | 0                   | Covered for this exact push, consistent with `main`'s file deciding. Other stale branches and later pushes remain UNDETERMINED. |
| no           | not met         | 0                   | UNDETERMINED. Recheck later; do not interpret.                                                                                  |
| no           | any             | 1 or more           | Failed coverage: a deployment exists for this uncovered push. Stop and escalate.                                                |
| yes          | any             | 1 or more           | Setting ineffective: a deployment exists for this push. Stop and escalate.                                                      |

One reading settles one exact push, never another ref, SHA, or repeated push. On
2026-10-16 query (c) found both deployments (Git, canceled; API, READY) for
Dependabot SHA `baf098f073e1dcc501c18f588e6839eb1175a910`, so it detects a fork.

With zero deployments and a bracket that is not met, classify the result as a
_pending observation_ when (b), (c), (d), or (e) is not yet readable; recheck
those conditions later. Classify it as a _missing historical control_ when no
push at most 1 hour before `PUSHED` produced both a Git-created deployment on
this project and a `Vercel` commit status, making (a) permanently unmet for that
push. Waiting or an after-control cannot repair that missing historical control:
the result stays UNDETERMINED, retains the coverage gap, and blocks any action
requiring that proof. A later natural push needs its own bracket. Never create a
deployment to obtain a control. The table's "Recheck later" instruction applies
only to a pending observation.

Worked evidence (read-only; owner check 2026-10-19T02:45Z, re-read 02:53Z):

- Before-control: the #1639 merge `c64771fc4` was pushed at
  2026-10-19T01:11:49Z. Its `Vercel` status is from 01:11:53Z. Git deployment
  `dpl_Pguk6ntG2s71ba7b5EqwVehmRjTx` was created at 01:11:53.167Z (about 4 s),
  target null, no alias, READY.
- PR #1645 heads `1096a507f` (branch creation 01:20:38Z, 9 minutes later) and
  `0f07c4fc2` (push 01:45:58Z, 34 minutes later): both trees have the key. The
  queries ran 59 to 92 minutes after the pushes. Zero deployments for either SHA
  (528 scanned, all states, all pages; the only deployment since 2026-10-17 is
  `dpl_Pguk6ntG…`), zero statuses on either SHA, and six Neon branches, none for
  this ref. Both read covered (before-bracket only); no after-control yet.
- `main` push `42a3ac8a9` (2026-10-19T03:13:41Z, repository activity
  `pr_merge`): tree covered yes. (a) is not met: nearest processed push
  `c64771fc4` at 01:11:49Z was 2h01m52s earlier; the two #1645 branch pushes
  produced no deployment and are not controls. (b) is met, and (c) to (e) were
  read at 04:27:17Z, 73 minutes after `PUSHED`: zero deployments since 02:13:41Z
  across all states and pages (the 00:00Z cross-check found only `dpl_Pguk6ntG…`
  at 01:11:53Z), zero `Vercel` statuses, and six Neon branches with none created
  after `PUSHED`. The old (e) name term reports 1 because the production branch
  is named `main`; the amended predicate reports 0. Classification:
  UNDETERMINED, missing historical control.
- Conditional inference: `main` (`c64771fc4`) lacked the key at both pushes. If
  Vercel processed them, the pushed commit's `vercel.json` decides, so branches
  whose tree lacks the key still deploy and fork.

### Rebase before push

Before pushing any branch, confirm that `git show HEAD:vercel.json` has
`git.deploymentEnabled: false`. If it does not, rebase onto `origin/main` first.
This covers agent and human branches cut from an older `main`. New Dependabot
branches start from `main`, so they carry the key once #1645 merges; an open
Dependabot branch carries it only after Dependabot rebases or recreates it.
Until #1645 merges, `origin/main` lacks the key, so no rebase supplies it, and
new Dependabot branches (GitHub Actions updates run daily) still fork. An
earlier merge narrows that window.

### Step 2: isolated Disconnect demonstration (owner-authorized; not executed)

Goal: documented Disconnect behavior for Production bindings and its recovery,
without touching the original configuration. The original project's Production
`DATABASE_URL` (`yL4DAX9PN4E6TxGY`) and `DATABASE_URL_UNPOOLED`
(`veBjCROfACjkkGOX`) are integration-managed (`icfg_zEkOlbUTxKAqwTE8pQWxud8j`,
`projectSelection: all`). A test project in the same team would share that
configuration, so the test uses another Vercel scope.

Resources the owner creates for the test, and only these:

- A Vercel scope other than `team_BzOixmLqQ9VA2mTvFvzBLRWw`. Its Neon
  integration configuration id must differ from `icfg_zEkOlbUTxKAqwTE8pQWxud8j`;
  stop if it does not.
- A disposable private repository `updog-disconnect-probe` whose build only
  prints the names of database variables, never values.
- A Vercel project `updog-disconnect-probe` in that scope, linked to that
  repository.
- A Neon project `updog-disconnect-probe`, separate from `bold-truth-07145433`,
  with a dedicated production branch and a separate default branch. That mirrors
  the original: Production bound to a dedicated branch, Previews forking the
  default.

Sequence:

1. Baseline, read-only: record the two original variables (`id`, `key`,
   `target`, `configurationId`, `updatedAt`), the original configuration
   (`projectSelection`, `updatedAt`), and the `bold-truth-07145433` branch list.
2. Connect the probe Neon project to the probe Vercel project. Push a branch: a
   Preview and a Neon fork appear. Deploy Production: the Production variables
   appear.
3. Disconnect the probe Neon project from the probe Vercel project.
4. Observe on the probe: which Production variables survive; whether the next
   Production deployment still gets them (removed variables break the next
   deployment, not existing ones); whether the next branch push forks; whether
   existing deployments keep their snapshots.
5. Recovery: reconnect. Observe whether the Production variables return and
   whether their ids change.
6. Re-read the baseline items and require equality. Any difference stops the
   sequence and is reported.
7. Teardown: delete the probe Vercel project, remove the probe integration
   configuration, delete the probe Neon project, delete the probe repository.
   Record every created id and its deletion privately.

What transfers to the original configuration stays UNDETERMINED: same product,
different configuration.

### Step 3: existing exposure (each action owner-authorized; none executed)

Inventory, read-only, 2026-10-16T05:05Z to 06:30Z:

- Neon branches with parent `br-cool-tree-advjpopv` and `parent-data`:
  `br-round-band-ad34ggcp` (`restore/pre-canary-execute-20261012T181202Z`,
  ready), `br-lingering-sky-adzjiz8k`
  (`restore/pre-canary-c1e35889-20261012T173839Z`, ready),
  `br-curly-glade-adflx0xw` (`restore/pre-fund1-purge-20260914`, archived), and
  `br-lively-star-adj13yj1` (`dev`, archived). No integration-created branch was
  live. `include_deleted=true` did not list the cleaned-up ones.
- Neon-bound Preview deployments of the original project: 164 non-main
  deployments with `neon*` metadata, 2026-09-15T23:08Z to 2026-10-14T03:32Z (152
  READY, 12 ERROR). Selector: project `prj_z0tJGUCgjnmMOv5KG9cEP3ucJ7Xp`,
  `meta.githubCommitRef` not `main`, a `neon*` metadata key. The ids are kept
  outside this public repository. Each snapshot keeps its injected database
  variables.
- Integration-managed Development variables `O7D1sUXujvMx161I` and
  `u53FiARXOYqElTE1` (target branch UNDETERMINED), and manual branch-scoped
  Preview variables `NNAVak5aIq4Fs6fl` (`codex/preview-main-repair-20261010`),
  `xOcqCCFCO8vlvTvn`, and `zWtiwpFd5P9AJz6K`
  (`fix/vercel-fn-tsconfig-paths-esm`). Their targets are UNDETERMINED without
  decryption.

Credentials. Neon documents that a child branch inherits its parent's roles and
passwords, except children of protected branches. The production branch is not
protected. The 2026-10-15 review observed that the schema-only seed
`br-withered-sound-adzaoio1` has the production owner password. Treat "the
children and the 164 snapshots carry the production role password" as an
observation to confirm, UNDETERMINED. A password reset is branch-scoped.
Rotating the production role stops reuse of the old password against Production.
It neither revokes child-branch credentials nor removes copied data; deleting a
child branch does both. Rotation is a production credential change on its own
route, after Step 2 shows how integration-managed Production variables behave.

Handling, each needing separate owner authorization:

- Delete the four child branches when they no longer serve as restore
  references. For the 2026-10-12 restore branches, ADR-108 deletes only after
  its readback confirms the purge.
- Delete the Neon-bound Preview deployments, or accept them behind SSO
  (`all_except_custom_domains`) as a recorded risk.
- Review the Development and branch-scoped Preview variables above.
- Rotate the production role on its own route.

Neon auto-cleanup runs on the next Preview deployment, so suppressing Previews
stops it. Cleanup is explicit.

### Step 4: `previewDeploymentsDisabled` (not admitted)

Vercel documents the field in one OpenAPI request-body sentence. Absent, null,
`false` as rollback, the effect on `main` and CLI or API deployments, and the
interaction with `github.autoAlias:false` are UNDETERMINED. No
conditional-update contract is established for `updateProject`. Use it only
after an isolated equivalent project demonstrates its behavior for non-main
pushes, `main` pushes, CLI Preview and production deployments, and integration
redeploys, and demonstrates recovery with `false` and `null`. A later amendment
may then admit the write. That amendment may accept the concurrency risk, but
its procedure must use the fence above, an identity-only precondition (the field
is not documented on GET, so recovery cannot require any field value), a
post-read comparison, and the Step 1 positive control.

## Immutable certification and action-time eligibility

Preserve historical receipts and immutable candidate certification for their
exact SHA. Do not age out valid CI evidence merely because time passed or `main`
advanced; a new `main` head changes current-action eligibility, not historical
truth.

<!-- prettier-ignore -->
The canonical route performs one final source/currentness fence immediately before the first production mutation.
It evaluates only controls applicable to the requested action.
Automated drift recovery may re-fence and retry once; if currentness drifts again, return `BLOCKED`
for owner disposition. Do not loop, reuse a stale fence, or dispatch a mutation.

## Release baseline prerequisite (ADR-107)

Scope: a pull request whose raw diff touches
`docs/1-plans/F_1.21.1_production-release-reserve-delivery.plan.md`, on either
side of a rename or copy, including deletion and a copy of an unchanged plan.
Labels, titles, draft state, and comments do not change scope. Other pull
requests keep their existing merge requirements.

For a scoped pull request, `CI Gate Status` requires the
`Release Baseline Prerequisite` job to succeed. That job runs `verify-premerge`
from `scripts/release/capture-release-recovery-context.mjs` in a checkout of
protected `main`. It reads the candidate only as Git data and API evidence. It
selects the newest capture whose run attempt, capture job, artifact archive, and
context bind the exact PR number, PR head, live `main`, plan path, and plan
SHA-256. The gate then re-reads the PR head and live `main` before it turns
green. A manual `workflow_dispatch` run on a candidate branch cannot satisfy the
prerequisite.

### Owner sequence

1. Freeze the candidate after its ordinary feeders pass. The prerequisite and
   the gate may be red only because the capture is missing. Keep the PR in
   draft.
2. Dispatch `Capture Release Baseline` on current `main` with the exact PR
   number, frozen head, plan path, and plan SHA-256. Capture refuses a closed,
   merged, retargeted, or fork PR, a stale head, and a head that does not
   contain `main`.
3. Rerun the original `pull_request` CI run for the same frozen head. Re-running
   all jobs and re-running only the failed jobs both re-evaluate the
   prerequisite and the gate. A new `workflow_dispatch` run is not a substitute.
   Do not rerun a production release attempt.
4. Confirm the prerequisite summary in the new attempt, a green `CI Gate Status`
   on the current head, and live `main`. Then mark the PR ready and squash-merge
   it.
5. If `main` advances or the head changes, update the branch, capture again, and
   rerun CI. Earlier captures stay historical receipts, but they are not
   evidence for a new head.
6. Use the five-field binding from the prerequisite summary for the owner
   release dispatch. Release preflight rejects the binding before the first
   provider mutation unless all of these hold: the capture job completed
   strictly before the merge; the merge commit has the captured baseline as its
   only parent; the plan bytes match at both the PR head and the merge commit;
   and the downloaded archive bytes match the bound digest.

### Limits

- Strict branch protection, not this job, blocks a merge after `main` advances
  past a green check.
- Artifact deletion or expiry after a green check does not block source
  admission. Release preflight rejects unavailable evidence before mutation.
- Hosted staging acceptance passed on 2026-10-10 in the disposable repository
  `nikhillinit/updog-release-baseline-staging`, which uses a mock capture and
  production-equivalent protection. A missing capture kept the gate red and
  blocked both a direct merge and auto-merge. A capture plus a rerun of the same
  CI run turned the gate green. A `main` advance moved a green PR to `BEHIND`,
  and the updated head failed until a new capture. A manual dispatch on a
  candidate branch was refused. The required check came from App 15368.
- Not tested in staging: an administrator `--admin` merge and a spoofed commit
  status. This control does not claim to stop an administrator.

## One-time Railway credential repair (ADR-110)

This is a credential-only operator procedure for the owner-approved repair of
October 21, 2026. It is available only after the matching policy amendment and
ADR-110 are admitted to protected `main`. Before invocation, require recorded
explicit owner acceptance of the described concurrent-writer risk and explicit
delegation to one executor for the operating window. Acceptance and delegation
may be given for the exact reviewed amendment before admission and remain valid
for that unchanged scope; admission and all execution gates must still pass. A
delegate cannot issue or expand that authority. Existing approval for the token
replacement is retained but alone does not establish acceptance of this
exception. This procedure does not infer that the old token is invalid or
authorize release execution.

### Scope and admission

- Fixed action identifier: `railway-production-credential-repair-2026-10-21`.
  Bind it to the original terminal failed attempt, exact protected source,
  repository, `Production/RAILWAY_TOKEN`, intended Railway project/environment,
  and one successor token label. Keep provider identifiers in private operator
  evidence; do not embed them or credentials in source or portable reports.
- Re-read the admitted policy from protected `main`. Compare live `main` with
  the reviewed source; reconcile any advance before execution. Verify the
  protected project, environment, and service bindings, all environment-secret
  metadata, and release state. Refuse changed targets or metadata and any active
  release that may consume the credential; do not cancel it to clear the gate.
- Require the official Railway incident to be resolved, or an official update
  explicitly clearing token-management operations. Also require two successful
  read-only inventory/scope samples through the same CLI/account path, at least
  sixty seconds apart, with complete pagination, identical target identities,
  and thirty-second request deadlines. Browser or connector availability alone
  does not satisfy this predicate.
- Reconcile the original and successor token labels against complete provider
  inventory. Any existing matching record requires reconciliation before a new
  creation; absence in an incomplete or degraded inventory is inconclusive.
- The owner establishes a window with no other credential writers or release
  dispatchers and appoints one executor. This cannot exclude an uncoordinated
  GitHub UI/API writer. Record that accepted residual risk; a local lock or
  timestamp comparison must not be reported as server-side concurrency proof.

### Guarded execution and evidence

Prepare a new helper outside the repository's live working tree, with its digest
and an independent review bound into a create-only action receipt. Do not edit
or rerun the old helper. Before real mutation, test the fresh helper with
synthetic credentials and stubbed provider boundaries: duplicate runners,
incomplete pagination, target/source drift, wrong token scope, crash/restart at
each phase, provider acceptance followed by timeout, lost GitHub
acknowledgement, deadline exhaustion, and credential leakage. Verify zero
duplicate writes and zero secret material in stdout, stderr, argv, files, and
receipts. Mocked tests do not prove undocumented provider behavior or GitHub
conditional-write support.

1. Acquire the action's local exclusive lock and create its durable receipt
   atomically. All participating executors use the same receipt/lock location;
   another host is not an independent action. Persist phase transitions before
   their associated writes. Do not start if this action has an unresolved or
   consumed attempt marker. Pin the helper, policy, and parent receipt digests.
2. Recheck source, targets, complete inventory, secret metadata, and release
   quiescence immediately before creation. Persist `CREATE_ATTEMPTED`, then make
   one project/environment-scoped token-creation request. Disable write retries.
   Keep the returned value in memory and validate that exact value with a
   read-only scope query. Require agreement with one provider metadata record.
   No secret write follows an absent, malformed, mismatched, or lost value.
3. Recheck source, targets, release quiescence, and every environment-secret
   metadata entry immediately before the GitHub write. A change stops the action
   with the new token retained and GitHub untouched. Persist
   `SECRET_WRITE_ATTEMPTED` and submit the exact validated token once, using
   in-memory encryption or stdin, to the single named environment secret. This
   PUT is unconditional; the admitted exception accepts its overwrite risk.
4. Require an acknowledged successful write, unchanged secret `created_at`,
   advanced target `updated_at`, unchanged unrelated secret metadata, unchanged
   source/targets/release state, the original token still present, and exactly
   one expected new token record. Revalidate the exact in-memory token's scope.
   Independent review checks the sanitized receipt and target-only delta.

Use one five-minute action deadline after the recovery samples, including
preflight, both writes, validation, and any reconciliation. Individual requests
remain bounded to thirty seconds and the remaining action budget. Deadline
exhaustion forbids further writes. Reconcile at most once within the remaining
budget, then stop; an expired budget does not start a new reconciliation window.

### Failure, recovery, and stop

- A creation timeout or lost response records `CREATE_OUTCOME_UNKNOWN`. A
  read-only complete inventory reconciliation may identify the token, but cannot
  recover lost plaintext or prove absence during degraded consistency. Stop;
  never retry with a new label. A token whose value was lost remains in place.
- A GitHub timeout or lost acknowledgement records
  `SECRET_WRITE_OUTCOME_UNKNOWN`. Read metadata once if the deadline permits,
  then stop. A changed timestamp cannot prove that GitHub stored this
  execution's value. Do not rewrite it.
- Any failed postcondition records `PARTIAL_OR_UNKNOWN`. Do not undo another
  writer's update. Preserve both tokens and the receipt for a separately scoped
  recovery decision. The previous secret plaintext is unavailable, so automatic
  rollback is not possible. Retaining the old Railway token does not restore
  GitHub's previous secret value.
- Success records `CREDENTIAL_REPAIR_VERIFIED`: exact new-token scope verified,
  submitted value acknowledged, and metadata postconditions verified. Stored
  plaintext equality and workflow consumption remain unproven. Stop there.
- No workflow retry/dispatch, environment approval, deployment, promotion,
  runtime/Redis probe, token revocation/deletion, or Neon action is included. A
  fresh receipt cannot reset a consumed budget. Any further credential attempt
  requires a new owner-scoped recovery decision under the then-current policy.

## Railway worker deploy stage (release-production)

`release-production.yml` is the only tracked provider-mutating caller. Its
`railway-workers-deploy` job runs between `validate-deployment` and
`railway-workers-verify` and delegates to
`scripts/release/deploy-railway-workers.mjs`, which deploys exactly
`fund-scenario-calc` then `capital-call-status` serially at the exact candidate
SHA.

Before each service the helper re-fences live `refs/heads/main` against the
expected SHA and runs an authenticated preflight: project/environment scope,
each protected worker resolving exactly once by name and by ID, and the
`serviceInstanceAutoDeployStatus` readback, which must report
`enabled === false` for both services. Any absent, stale, or mismatched
prerequisite fails closed before any mutation.

One-time owner precondition: disable autodeploy for both worker services in the
Railway UI. The workflow never mutates the setting; if autodeploy is enabled,
the readback fails the run closed.

The entire helper run — preflight, both services, readbacks, reconciliation, and
recovery — shares one absolute run deadline computed once from `timeoutMs`
(default 35 minutes inside the job's 45-minute cap; the 10-minute difference is
gross reserve shared by checkout/setup and evidence emission, not guaranteed
finalization headroom). The live-main fence subprocess, every GraphQL request,
and every poll and reconciliation loop are bounded by that same deadline; no
phase mints its own budget.

The helper reuses an active successful exact-SHA deployment when one exists,
otherwise creates one and waits on the exact returned deployment ID for terminal
`SUCCESS` with matching `meta.commitHash`. Immediately before every deploy,
rollback, and redeploy mutation it snapshots the bounded deployment-ID set
(100-page/500-deployment discovery ceiling; exhaustion is typed `BLOCKED`, never
truncated success). A returned mutation ID already present in the snapshot is
rejected (`DEPLOYMENT_ID_NOT_NOVEL`). A lost or ambiguous deploy or redeploy
response is reconciled only against novel identity: resolution requires exactly
one novel deployment ID, fully verified (service/environment, expected SHA, not
stopped, terminal `SUCCESS`, running instance). An ambiguous rollback (lost
response, GraphQL error, or unconfirmed Boolean) accepts exactly one of two
proofs: the same intended prior deployment transitioning non-ready to fully
ready, or exactly one novel fully verified prior-commit deployment — and in both
cases the attempted deployment must read back terminally inactive before
recovery counts as resolved. Anything else stays `UNRESOLVED`/`BLOCKED`
(`RECONCILIATION_IDENTITY_UNRESOLVED` / `RECOVERY_RECONCILIATION_UNRESOLVED`)
with every observed handle recorded, and no later provider mutation (including
first-service recovery) starts while a preceding mutation's identity is
unresolved or its attempted deployment is not terminally inactive. Returned
deployment IDs flow as job outputs into `railway-workers-verify`, which verifies
the expected IDs. On second-service failure after first-service mutation, the
helper recovers the first service by rollback or redeploy as capabilities allow;
if recovery cannot be verified it returns `BLOCKED` with every deployment handle
and promotion stays blocked. Reruns are rejected (`GITHUB_RUN_ATTEMPT` must be
1); recovery continuation is always a fresh, separately authorized dispatch.

Two-phase operator route (required whenever the candidate SHA changes worker
code): dispatch phase A with `mode=railway-workers-only` — source-admission
fences plus the Railway deploy/verify lane only; the Vercel lane is skipped and
the evidence finalizer treats those skips as expected. After phase A verifies,
capture operator evidence (ADR-082 bundle) against the now-current worker fleet,
then dispatch phase B with `mode=full` (the default): the deploy job takes the
exact-SHA reuse path and G4 verifies the evidence against the unchanged active
deployments. Each phase is a separate owner-authorized dispatch; if `main`
advances between phases, re-fencing fails closed and both phases restart at the
new candidate.

This stage is capability, not authority. Merge establishes merge eligibility
only; every production dispatch remains a separate owner-authorized action under
the governing policy, and every applicable blocker above still applies.

## Reserve delivery exposure report (release-production)

The last step of `baseline-policy-preflight`, in both modes, runs
`scripts/release/report-reserve-delivery-exposure.mjs` (F_1.22.0, ADR-106
amendment). It classifies every `calculation_queued` event since the start of
the newest earlier release run whose canonical promotion proof succeeded
(fallback `2026-08-09T00:00:00Z`), using the F_1.21.0 reconciliation query in a
read-only transaction against the production database.

- Report only: `continue-on-error: true` and `timeout-minutes: 3`; a finding or
  a failure never changes the release outcome.
- Counts only: the log and step summary carry per-classification counts, the
  window, and its source. A `::warning::` names the counts of
  `no_run_drop_candidate`, `repeat_job_id`, `stuck`,
  `completed_without_snapshot`, and `calculated_event_only` for non-canary
  funds.
- For the rows to resubmit, the owner runs the appendix SQL in
  `docs/1-plans/F_1.21.0_reserve-delivery-contract-visibility.plan.md` locally.
  Zero findings are a lower bound, not proof of no exposure.

## Provider observations, dated and revalidated

Observed on 2026-08-14 for this project only: a Vercel `main` push creates a
staged Git deployment and promotion to production is separate. Railway had
`main` configured as its production auto-deploy source; an observed `main`
deployment failed while the prior deployment remained active. Before relying on
either observation, require read-only revalidation at the exact candidate. An
observation may drift and remains non-authorizing; it is not approval,
readiness, target identity, or a general provider guarantee. Since ADR-109,
`vercel.json` sets `git.deploymentEnabled: false`; whether a `main` push still
creates a Git deployment is UNDETERMINED until observed.

Recorded on 2026-08-28: schema-existence evidence for every Railway operation,
field, and status value the deploy helper uses, including the
`serviceInstanceAutoDeployStatus` readback, lives in
`docs/workflows/railway-provider-contract-evidence-f132.md`. Schema existence is
not runtime proof; authenticated preflight re-proves each field at every
dispatch, and runtime semantics remain owner-accepted external prerequisites
until first authorized dispatch.

## Retained boundaries

Archive Gate, Phoenix truth and Phoenix protected paths, AGENTS/CLAUDE
idempotency and optimistic locking mandates, ADR-079 tracked proof, and the
promotion hard stop remain controlling in their named scopes. ADR-075 supplies
topology/identity context only. Rollback uses a separately authorized forward
correction; no down migration, force push, or local production mutation is
authorized by this guide.
