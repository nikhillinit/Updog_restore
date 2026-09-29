---
status: ACTIVE
last_updated: 2026-09-27
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
  user provisioning" below).

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

3. Dry run, and review every `[PLAN]` line (before and after for each user):

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
   recomputes the digest in the same transaction, re-checks the source just
   before the first write, and writes every user in that one transaction. A user
   reviewed as absent is inserted without overwrite, so a concurrent creation of
   the same username fails the whole apply.

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

## Provider observations, dated and revalidated

Observed on 2026-08-14 for this project only: a Vercel `main` push creates a
staged Git deployment and promotion to production is separate. Railway had
`main` configured as its production auto-deploy source; an observed `main`
deployment failed while the prior deployment remained active. Before relying on
either observation, require read-only revalidation at the exact candidate. An
observation may drift and remains non-authorizing; it is not approval,
readiness, target identity, or a general provider guarantee.

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
