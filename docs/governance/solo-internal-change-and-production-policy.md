---
status: ACTIVE
last_updated: 2026-08-21
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

## Proportional release-governance applicability

Release governance separates source admission, immutable candidate
certification, and production action. `CI Gate Status` remains the sole
aggregate merge gate; Release Proof is never generic merge authority. Controls
are conditional and independently applicable; every entered risk domain applies:
provider, schema, recovery, canary, and residue controls activate when an action
enters their material-risk domain.

Immutable evidence remains historically valid for its exact SHA. A later `main`
advance expires current-action eligibility only; it does not invalidate a prior
receipt or certification. A production-coupled merge must take the canonical
production-action route before the coupled action, even when the merge itself
has completed source admission.

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

## Document roles and precedence

Load order and precedence are separate concerns: entry loaders are read first,
but this policy prevails on any conflict. Roles, without ordinal authority:

| Surface                                                            | Role                                                                                                                 |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md` / `CLAUDE.md`                                          | Entry loaders only: load this policy and route by action; no independent authority.                                  |
| This policy                                                        | Governing constitution: authority boundaries, roles, and precedence.                                                 |
| `CI Gate Status` (required by branch protection; `ci-unified.yml`) | Sole aggregate merge gate. `.github/path-filters.yml` is its changed-path classifier, not an authority.              |
| `docs/workflows/PRODUCTION_SCRIPTS.md` + production workflows      | Only action-specific production procedure and enforcement.                                                           |
| Surface matrix artifacts, G1 records, reviews, receipts, plans     | Evidence and diagnostics; they satisfy only explicitly named predicates and never grant approval or merge authority. |
| ADRs and architecture reviews                                      | Durable rationale only; never live workflow authority.                                                               |

Precedence rules:

- On conflict, this policy prevails; missing, stale, conflicting, or UNKNOWN
  authority fails closed.
- More-specific rules may add restrictions; they may not relax a floor without
  explicit amendment.
- Enforcement may block an action; it cannot create authority beyond named
  policy scope.
- Catch-all: an artifact not named above (skills, agent profiles, cheatsheets,
  prompts, task plans) is procedure or reference at most and can never grant
  authority.
- Resolve this policy from the protected target branch (`origin/main`), never
  from a working branch; a stale checkout does not excuse a stale rule.
- Amendment: this policy amends only by a pull request that modifies this file
  together with an ADR entry; plans, reviews, matrices, and generated artifacts
  cannot amend it. This rule is prospective from adoption; the founding
  amendment is ratified by owner approval recorded in its PR description, with
  its ADR following in the next governance PR.
- Production-dispatch issuer: the sole issuer of action-scoped production
  authority is the repository owner, via explicit dispatch of the named
  workflow; no agent, plan, or artifact self-authorizes.
- Provider coupling: merge to `main` may causally trigger provider deployment
  under current topology (ADR-075). That coupling is a topology fact, not an
  authorization; a merge that would mutate production is production-affecting
  and takes the canonical production-action route.

### Surface-contract matrix component roles

- Matrix data and inventories (`audit/surface-contract-matrix/*.json`, rendered
  matrix) are evidence.
- The validator suite in `tests/unit/audit/surface-contract-matrix.test.ts`
  (exact-set, source-hash, closed-phase downgrade protection) is retained scoped
  merge enforcement and the named pre-merge provenance control.
- The G1 review record is scoped review evidence, invoked only by explicit owner
  directive for a named high-risk migration or audit program; it is not generic
  merge or release approval.

## Documentation governance

**PRUNE by default** - do not create session artifacts (progress logs, handoff
docs, session summaries), navigation docs, or capability inventories derivable
from code and active docs. **PRESERVE and CREATE** institutional memory: REFLs
(`docs/skills/REFL-NNN-*.md`), ADR entries in `DECISIONS.md`, memory entries for
non-derivable gotchas, and domain docs when business logic cannot be inferred
from code. Derivability test: could a future session reconstruct this from code
and git log alone? If NO, write it down; if YES, do not create a file.

### Archive Gate

Session artifacts (handoff memos, checkpoints, session summaries) violate the
prune policy but may contain non-derivable implementation details. Do not
mass-delete. Archive only after all three checks pass:

1. `git log --all --oneline -- <path>` confirms the referenced work landed or
   became obsolete.
2. `grep -r <named-feature> client/ server/ shared/` confirms the named
   feature/code path exists or is no longer referenced anywhere.
3. The file is not serving as an active handoff (not referenced by a current
   `HANDOFF.json`, open checkpoint, or in-flight PR).

Cite the evidence from these checks in the PR description that archives the
file. Git history is the archive; `.archive/` directories are not required.

### Phoenix protected paths

Phoenix routing and validation docs are domain-locked. Do not edit, archive,
delete, merge, or deprecate the following without specialist sign-off:

- `.claude/PHOENIX-AGENTS-REGISTRY.md`
- `.claude/PHOENIX-TOOL-ROUTING.md`
- Phoenix-specific sections of `.claude/DISCOVERY-MAP.md`

Required reviewers depend on content touched: waterfall, carry, clawback, LP/GP
distribution -> `waterfall-specialist`; precision, rounding, Decimal.js, numeric
drift -> `phoenix-precision-guardian`; XIRR, IRR, fees, cash-flow timing ->
`xirr-fees-validator`. A cleanup PR may update metadata or route pointers
outside these protected sections, but any Phoenix content consolidation must
include a content matrix classifying touched sections as `LOAD_BEARING`,
`DUPLICATE`, or `OBSOLETE`.

Cleanup tiers: archive-candidate files (`.omx/`, session summaries, handoff
memos) gate on archive-after-evidence (git log + grep + active-reference check);
domain-locked files (Phoenix routing surfaces) gate on specialist review before
edit/merge/delete/deprecate.

## Revisit

Revisit this policy when authority structure changes, third parties gain
production write access, external or regulated use begins, a material incident
exposes a control gap, or recurring friction shows a rule lacks value. Any
narrowing of durable-write requirements requires a separate ADR and complete
affected-surface evidence.
