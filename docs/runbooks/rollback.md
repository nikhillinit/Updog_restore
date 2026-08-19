---
status: ACTIVE
last_updated: 2026-07-30
---

# Governed Production Forward Rollback

## Canonical production-action authority

Repository path: `docs/workflows/PRODUCTION_SCRIPTS.md`.

This guide routes production-action authority to the canonical route and
confers no authority by itself to mutate source, branch, environment, provider,
production, schema, data, deployment, promotion, or rollback. The canonical
route is active for repository governance only; it confers no production
readiness or authorization, and action-specific UNKNOWN prerequisites remain
blocking.

Production rollback uses a new revert commit on `main`, then the existing
`Release Production` workflow. It never deploys a detached historical commit,
runs a down migration, flushes caches, or mutates production from a local
script.

## Trigger and ownership

- Incident commander declares rollback when a critical user flow is unavailable
  or release health breaches its approved rollback threshold.
- Release owner coordinates revert review, merge, governed release, and evidence
  capture.
- Schema owner confirms compatibility before merge when reverted code touches
  persisted data.

## Required invariants

1. Revert faulty application changes with a reviewed PR and merge that revert to
   `main`.
2. Treat resulting live `main` commit as rollback target. Do not reuse faulty
   release's parent SHA or deploy from local checkout.
3. Preserve current production schema. Confirm reverted application is backward
   compatible with every already-applied migration and data shape.
4. Do not run migration-down SQL. If current schema is incompatible with
   reverted application, first merge a forward-compatible application repair;
   escalate any later schema cleanup as separate reviewed forward migration.
5. Use `.github/workflows/release-production.yml` as sole production mutation
   path. `scripts/rollback-verify.sh` verifies evidence only.
6. Treat `VERCEL_PRODUCTION_HOSTNAME` as canonical production identity. Do not
   use mutable `PRODUCTION_URL` for deployment identity or promote no-op proof.

## Execute

1. Open revert PR naming incident, faulty merge, affected application surfaces,
   and intended rollback behavior.
2. Record schema compatibility proof in PR:
   - reverted readers tolerate current columns, tables, constraints, and
     indexes;
   - reverted writers remain valid against current schema;
   - no migration-down or destructive DDL is required;
   - any irreversible data change and resulting limitation is stated.
3. Merge revert PR to `main`.
4. Resolve exact live `main` SHA:

   ```bash
   REPOSITORY="$(gh repo view --json nameWithOwner --jq '.nameWithOwner')"
   REVERT_MAIN_SHA="$(gh api "repos/${REPOSITORY}/commits/main" --jq '.sha')"
   ```

5. Dispatch `Release Production` from `main` through
   `scripts/deploy-production.ps1`, supplying the four redacted operator
   evidence files, schema-apply evidence, and the immutable pre-merge baseline
   identity for the exact live `main` SHA. In rollback mode the revert PR
   number and its final head SHA are mandatory; the workflow's
   `baseline-policy-preflight` job verifies the revert restores the baseline
   application tree. Do not use Vercel CLI, raw workflow dispatch, or another
   production mutation path. Use the exact PowerShell invocation in
   `scripts/DEPLOYMENT_AUTOMATION_README.md`.

   ```powershell
   .\scripts\deploy-production.ps1 `
     -ReleaseMode rollback `
     -FundHealthPath .\evidence\fund-health.json `
     -FundReadyPath .\evidence\fund-ready.json `
     -CapitalHealthPath .\evidence\capital-health.json `
     -CapitalReadyPath .\evidence\capital-ready.json `
     -SchemaApplyRunId <run-id> `
     -SchemaApplyRunAttempt 1 `
     -SchemaApplyArtifactId <artifact-id> `
     -SchemaApplyArtifactDigest sha256:<64-lowercase-hex> `
     -SchemaApplyReceiptFileSha256 <64-lowercase-hex> `
     -SchemaPrecursorSha <40-lowercase-hex> `
     -BaselineRunId <baseline-run-id> `
     -BaselineRunAttempt <baseline-run-attempt> `
     -BaselineArtifactId <baseline-artifact-id> `
     -BaselineArtifactDigest sha256:<64-lowercase-hex> `
     -BaselineFileSha256 <64-lowercase-hex> `
     -RollbackPrNumber <revert-pr-number> `
     -RollbackPrHeadSha <40-lowercase-hex>
   ```

6. Wait for governed workflow to complete. It must retain exact live-`main`
   fencing and pass release proof, clean production schema audit, staged
   deployment identity validation, authenticated staged smoke, provider identity
   verification, canonical Vercel promotion proof, and authenticated
   post-promotion smoke.
7. Record numeric GitHub Actions run ID, then verify exact evidence:

   ```bash
   scripts/rollback-verify.sh "$REVERT_MAIN_SHA" "$RELEASE_RUN_ID"
   ```

   Any missing, ambiguous, stale, skipped, incomplete, or failed evidence is a
   rollback verification failure.

## Abandoned release-canary run recovery

If a `Release Production` run is hard-cancelled after canary fund creation but
before its finalizer bound the run to a terminal state, recover on exactly one
authorized production surface: the `Release Canary Recovery` workflow. Never
run a local CLI against production, and never search for a "latest" run — the
recovery inputs come from the cancelled run's `RELEASE_CANARY_RECOVERY_V1` log
line (the recovery handle is written only to the runner's temp path and that
log line), and every input names the exact execution. If the log line is
unavailable, the recovery workflow's `resolve` mode reconstructs the handle
from the exact run ID and attempt alone.

```bash
gh workflow run release-canary-recovery.yml \
  --ref main \
  --field github_run_id=<cancelled-run-id> \
  --field github_run_attempt=<cancelled-run-attempt> \
  --field expected_sha=<40-lowercase-hex> \
  --field fund_id=<canary-fund-id> \
  --field canary_run_id=<canary-run-uuid>
```

The workflow resolves the exact workflow execution, performs the version-fenced
`created|running -> failed` transition, and then runs the post-recovery global
residue assertion in the same job; that assertion is required and any cap, TTL,
or active-run policy failure fails the recovery. The workflow is a database
state-transition surface only — it can never purge, release, or mutate a
provider.

## Closeout evidence

Attach following to incident:

- revert PR and merged revert commit;
- schema backward-compatibility review and explicit no-down-migration decision;
- exact live `main` SHA used as `expected_sha`;
- successful `Release Production` run URL;
- successful staged identity, authenticated staged smoke, promotion, and
  authenticated post-promotion smoke job URLs;
- canonical hostname, exact promoted deployment ID, protected project ID, and
  source SHA recorded by the promotion proof;
- remaining impact, irreversible data limitations, and follow-up owners.

Complete blameless postmortem within 48 hours. Track remediation owners and due
dates outside this runbook.
