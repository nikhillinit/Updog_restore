---
status: DRAFT
last_updated: 2026-08-14
---

# Canonical Production-Action Procedure

## Status

This is the sole canonical operator route. It is a DRAFT procedure and does not
authorize a production action. Current UNKNOWN prerequisites block their
applicable action. The branch-protection writer is retired: its reachable
entrypoint is removed and ordinary branch-policy surfaces have static
reachability proof. Until final exact-head production-mutation corpus closure,
retained-entrypoint targeted validator-order evidence, and hosted exact-head CI
complete, this document specifies zero mutation dispatch.

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
unresolved evidence means zero mutation dispatch. This draft makes no claim that
these prerequisites are presently proven.

## Current blockers

Do not dispatch while any applicable blocker remains UNKNOWN, including:

- final exact-head production-mutation corpus closure;
- retained-entrypoint targeted validator-order evidence;
- hosted exact-head CI;
- provider target scope/identity, source freshness, validator ordering, smoke,
  canary, residue, and containment evidence; or
- backup/PITR, restore freshness, custody-role, and preview/restore-isolation
  proof for a production schema/data action.

Retained entrypoints are not an authority or coverage claim. Their targeted
validator order and final exact-head evidence must be established before any
activation.

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
