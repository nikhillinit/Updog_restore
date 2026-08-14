---
status: ACTIVE
last_updated: 2026-08-14
---

# Solo Internal Change and Production Policy

## Status and scope

This policy is active repository-governance authority after admission to `main`
through required current-head CI. It neither authorizes a production action nor
establishes production readiness. Candidate text on an unmerged pull request
does not self-activate.

The branch-protection writer is retired: its reachable entrypoint is removed and
ordinary branch-policy surfaces have static reachability proof. Activation of
this repository-governance policy does not activate a production route. Steps
4–7 and all action-specific UNKNOWNs remain separate; their status never
supplies production authority here.

## Authority boundaries

| Surface             | Meaning                                                                            |
| ------------------- | ---------------------------------------------------------------------------------- |
| Policy              | Stable rule and authority boundary.                                                |
| Enforcement         | Machine gate that may block an action.                                             |
| Evidence            | Observation; never authorization by itself.                                        |
| Owner note          | Accountability and explicit intent; not correctness proof or independent approval. |
| Review              | Defect-finding observation; not independent approval or authority.                 |
| Receipt             | Action/result record; neither preventive control nor authorization.                |
| Action record       | Bounded record; neither authorization nor a machine-failure override.              |
| Merge               | Source admission after required evidence.                                          |
| Production dispatch | Separate, action-scoped authorization after required validation.                   |

Merge authorizes source admission only. It never authorizes a schema apply,
production data action, provider mutation, deployment, promotion, branch or
environment mutation, or emergency production command. One required aggregate
merge authority remains `CI Gate Status`; it is not a production-action gate.

An owner note, review, receipt, or action record cannot override a machine
failure. Reviews, agents, and skills help find defects unless separately
delegated; none is human-equivalent approval under this policy.

## Retained controls

This policy supplements and does not weaken:

- Archive Gate;
- Phoenix protected paths and `phoenix:truth` requirements;
- `AGENTS.md` and `CLAUDE.md` idempotency and optimistic-locking mandates;
- ADR-079 tracked frozen-SHA proof for Vercel-reachable durable-write gaps; and
- current promotion hard stops, exact-SHA, provider-identity, schema, recovery,
  smoke, canary, and residue controls.

ADR-075 remains a topology and identity decision only. It is not generic proof
for an unreviewed target, provider, or mutation.

## Consequence-specific proof

| Material-risk domain                            | Minimum direct proof                                                                                                                                                                                                                                                   |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Financial calculation or fund output            | Current `phoenix:truth` requirement plus a named expected-output/truth assertion affected by the change; `calc-gate` only when deliberately adopted or already appropriate to the touched path.                                                                        |
| Auth, permission, or confidential-data exposure | Denial test plus zero mutation/zero leak assertion.                                                                                                                                                                                                                    |
| Durable write or schema                         | Retry/duplicate-harm control, concurrency control where concurrent overwrite is plausible, real-database or production-equivalent test, and containment/recovery posture.                                                                                              |
| Queue, worker, or retry behavior                | Duplicate-safe behavior, timeout/bounds, failure semantics, and production worker identity when production-bound.                                                                                                                                                      |
| Release, provider, or governance enforcement    | Refreshed exact candidate; intended provider target scope before creation; exact returned target identity immediately after creation before dependent mutation or promotion; workflow-contract tests, staged validation, smoke/canary/residue, and containment handle. |

These outcome rules supplement and do not supersede the current `AGENTS.md` and
`CLAUDE.md` idempotency and optimistic-locking mandates. Narrowing a
durable-write rule requires a separate ADR/PR with complete affected-surface,
retry/duplicate/concurrency, executable-invariant, independent-verification, and
rollback evidence.

## Production-action rule

The canonical operator route is
[`docs/workflows/PRODUCTION_SCRIPTS.md`](../workflows/PRODUCTION_SCRIPTS.md). It
must fail closed before the first mutation on absent, malformed, stale, or
mismatched refreshed source identity; applicable dispatch authority; target
scope; existing target identity; or machine-checkable prerequisite. A
target-creating action validates intended scope before creation and validates
the exact returned target ID before any dependent mutation or promotion.

For production schema or data action, missing, malformed, stale, mismatched, or
unresolved managed backup/PITR, isolated-restore freshness, custody-role, or
preview/restore-isolation evidence yields zero dispatch. A restore reference or
digest is revalidated immediately before apply. This policy does not claim that
those controls are currently proven.

Current UNKNOWN prerequisites block their applicable action. Subordinate
deployment, release, rollback, and script guides are non-authorizing pointers;
they cannot broaden or bypass canonical authority.

## Revisit

Revisit this policy when authority structure changes, third parties gain
production write access, external or regulated use begins, a material incident
exposes a control gap, or recurring friction shows a rule lacks value. Any
narrowing of durable-write requirements requires a separate ADR and complete
affected-surface evidence.
