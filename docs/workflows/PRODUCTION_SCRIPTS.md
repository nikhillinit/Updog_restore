---
status: ACTIVE
last_updated: 2026-08-21
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

Before first mutation, a retained entrypoint must validate all applicable
conditions in this order:

1. A refreshed exact SHA and current candidate head.
2. Separate action-scoped dispatch authority.
3. Intended provider scope and an existing target identity when one exists.
4. Required machine-checkable prerequisites.
5. Immediately before an apply, revalidated live source, target, and applicable
   restore reference or digest through restore-reference revalidation.

For target creation, validate intended scope before creation; validate exact
returned target ID immediately afterward; then allow no dependent mutation,
schema apply, deployment, or promotion before that validation succeeds.

For production schema/data action, current managed backup/PITR capability,
successful isolated restore freshness within an owner-defined window, named
custody roles, and preview/restore isolation from production data and
side-effect channels are mandatory. Missing, malformed, stale, mismatched, or
unresolved evidence means zero mutation dispatch. This procedure makes no claim
that these prerequisites are presently proven.

## Current blockers

Do not dispatch while any applicable blocker remains UNKNOWN, including:

- provider target scope/identity, source freshness, validator ordering, smoke,
  canary, residue, and containment evidence; or
- backup/PITR, restore freshness, custody-role, and preview/restore-isolation
  proof for a production schema/data action.

Retained entrypoints are not an authority or coverage claim. Any retained
entrypoint whose current targeted order proof or action evidence is absent,
stale, or mismatched remains blocked. Repository activation does not make an
entrypoint production-ready.

## Immutable certification and action-time eligibility

Preserve historical receipts and immutable candidate certification for their exact SHA. Do not age out valid CI evidence merely because time passed or `main` advanced; a new `main` head changes current-action eligibility, not historical truth.

The canonical route performs one final source/currentness fence immediately before the first production mutation. It evaluates only controls applicable to the requested action. Automated drift recovery may re-fence and retry once. If currentness drifts again, return `BLOCKED` for owner disposition; do not loop, reuse a stale fence, or dispatch a mutation.
## Provider observations, dated and revalidated

Observed on 2026-08-14 for this project only: a Vercel `main` push creates a
staged Git deployment and promotion to production is separate. Railway had
`main` configured as its production auto-deploy source; an observed `main`
deployment failed while the prior deployment remained active. Before relying on
either observation, require read-only revalidation at the exact candidate. An
observation may drift and remains non-authorizing; it is not approval,
readiness, target identity, or a general provider guarantee.

## Retained boundaries

Archive Gate, Phoenix truth and Phoenix protected paths, AGENTS/CLAUDE
idempotency and optimistic locking mandates, ADR-079 tracked proof, and the
promotion hard stop remain controlling in their named scopes. ADR-075 supplies
topology/identity context only. Rollback uses a separately authorized forward
correction; no down migration, force push, or local production mutation is
authorized by this guide.
