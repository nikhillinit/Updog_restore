---
status: ACTIVE
last_updated: 2026-07-30
---

# Governed Production Forward Rollback

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
   evidence files and schema-apply evidence for the exact live `main` SHA.
   Do not use Vercel CLI, raw workflow dispatch, or another production mutation
   path. Use the exact PowerShell invocation in
   `scripts/DEPLOYMENT_AUTOMATION_README.md`; rollback-only switches are owned
   by Task 8.

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
     -SchemaPrecursorSha <40-lowercase-hex>
   ```

6. Wait for governed workflow to complete. It must retain exact live-`main`
   fencing and pass release proof, clean production schema audit, staged
   deployment identity validation, authenticated staged smoke, promotion, and
   authenticated post-promotion smoke.
7. Record numeric GitHub Actions run ID, then verify exact evidence:

   ```bash
   scripts/rollback-verify.sh "$REVERT_MAIN_SHA" "$RELEASE_RUN_ID"
   ```

   Any missing, ambiguous, stale, skipped, incomplete, or failed evidence is a
   rollback verification failure.

## Closeout evidence

Attach following to incident:

- revert PR and merged revert commit;
- schema backward-compatibility review and explicit no-down-migration decision;
- exact live `main` SHA used as `expected_sha`;
- successful `Release Production` run URL;
- successful staged identity, authenticated staged smoke, promotion, and
  authenticated post-promotion smoke job URLs;
- remaining impact, irreversible data limitations, and follow-up owners.

Complete blameless postmortem within 48 hours. Track remediation owners and due
dates outside this runbook.
