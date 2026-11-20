---
status: ACTIVE
last_updated: 2026-11-20
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

Financial-change enforcement is classifier-driven.
`scripts/ci/classify-change-paths.mjs` sets financial relevance; a true result
or manual full-suite request requires `financial-truth`
(`npm run phoenix:truth`) as a `CI Gate Status` feeder. Missing or malformed
classification fails the aggregate instead of skipping truth validation.

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

## One-time Railway credential repair (ADR-110)

For the owner-approved Railway credential repair of October 21, 2026 only, this
amendment permits the owner to accept the concurrent-writer overwrite risk of
one replacement of this repository's GitHub environment `Production` secret
`RAILWAY_TOKEN`. GitHub's documented environment-secret API has no established
conditional-write contract. A metadata precheck and local exclusive lock are not
optimistic locking: another UI or API writer can overwrite the secret, or be
overwritten, between the check and the write. The owner must accept that
residual risk for this repair before execution. This exception does not apply to
application, database, deployment, other-secret, or other provider-configuration
updates.

The canonical procedure is "One-time Railway credential repair (ADR-110)" in
`docs/workflows/PRODUCTION_SCRIPTS.md`. It requires a fresh, independently
reviewed helper and durable receipt bound to the original terminal attempt,
protected source, exact target, and fixed action identifier
`railway-production-credential-repair-2026-10-21`. The old helper is not
replayed. For this route only, an explicit owner instruction may authorize one
delegated local executor to invoke that reviewed helper. This amends the
requirement for the owner's own local invocation only for this credential
action; the owner remains the sole issuer of its authority. The first
token-creation attempt consumes this action's creation budget; the same
execution may submit at most one GitHub secret write after validating the exact
returned token. A new label, receipt, process, or host does not replenish either
budget. Unknown outcomes stop for reconciliation; they never trigger automatic
recreation, rewrite, rollback, or revocation.

Before creation, require provider token-management recovery, complete token
inventory reconciliation, unchanged protected scope and secret metadata, no
active credential-consuming release, and the owner's exclusive operating window.
That window is an operator commitment, not server-enforced exclusion. Keep both
existing and newly created tokens. Bound the whole action to five minutes and
each request to thirty seconds, with no hidden write retries. Credential
plaintext stays in memory or stdin. Readback and independent review must
distinguish acknowledged submission from stored-value equality and workflow
consumption; neither of the latter is proven by secret metadata.

This paragraph explicitly replaces the optimistic-locking requirement only for
the single named GitHub secret write. It does not waive idempotency, executable
failure-path and secrecy tests, provider behavior evidence, exact identity
checks, or the other production-action requirements. Candidate text does not
self-activate: admission requires the policy/ADR pull request and required
current-head CI. Merge alone grants no credential-execution authority.

This action's budget is consumed; later replacements use ADR-118.

## Railway production token replacement (ADR-118)

ADR-118 admits a standing owner-run route, available only after ADR-118 and this
policy section are admitted to protected `main`. Each use is a separate owner
action and covers only the GitHub environment `Production` secret
`RAILWAY_TOKEN`, replaced with one Railway project token scoped to the
Production environment. The read-only provider check runs against the stored
token before any replacement; a `PASS` ends the use without a replacement.

The owner creates the token in the Railway dashboard and writes it from standard
input. Token plaintext never enters an agent session, file, shell history, or
the repository. For each use, the owner's explicit acceptance of the
concurrent-writer overwrite risk replaces optimistic locking only for that use's
`RAILWAY_TOKEN` writes, at most three. Each write is followed by metadata
readback; this exception covers no other secret, variable, or provider setting.

If a new token's plaintext is lost before writing, revoke it before another
creation. After a write, revoke a token before another creation only when the
check reports a confirmed token reason (`RAILWAY_TOKEN_REJECTED`,
`RAILWAY_TOKEN_SCOPE`, or `RAILWAY_TOKEN_VALUE`). `RAILWAY_TOKEN_UNCONFIRMED`,
`PROVIDER_UNREACHABLE`, and other ambiguous results never lead to revocation. A
use that stops after a write stays open until its private record and required
revocations are complete; it resumes at the check against the stored token.
Completion requires `PASS`. After `PASS`, revoke the token this use replaced; on
the first use, also revoke the original Production project token and any token
created by the 2026-11-02 ADR-110 attempt.

The provider check is evidence, not authorization. This route authorizes no
deployment, promotion, or other provider, database, or credential change.

## One-time Vercel Git-repository disconnect (ADR-112)

The fixed action `vercel-git-disconnect-2026-10-27` admits only removal of the
GitHub repository link from Vercel project `prj_z0tJGUCgjnmMOv5KG9cEP3ucJ7Xp`
(`updog-restore`), team `team_BzOixmLqQ9VA2mTvFvzBLRWw`, currently linked to
`nikhillinit/Updog_restore` with production branch `main`. Its sole entrypoint
is `scripts/release/disconnect-vercel-git.mjs --execute`, under the matching
procedure in `docs/workflows/PRODUCTION_SCRIPTS.md`. For this action only, the
owner's explicit instruction may appoint one delegated local executor. The owner
remains the authority issuer; command-line acknowledgements record that
instruction and cannot supply it. Authorization may precede admission and
remains valid for unchanged scope, but execution requires protected-main
admission and every applicable gate.

Vercel's official CLI implements this operation as an unconditional DELETE of
the project's Git link. No server-enforced conditional-delete contract is
established. A fresh GET, link digest, metadata comparison, and local ledger are
not optimistic locking: another administrator can replace the link between the
final read and DELETE, and that replacement could be removed. Execution requires
the owner's explicit acceptance of this exact concurrent-writer risk. Only after
that acceptance, this amendment replaces the optimistic-locking mandate for this
action's single DELETE. It does not waive idempotency or extend to any other
provider update. The executor must not infer acceptance from a generic
instruction to implement, admit, disconnect, merge, or deploy.

Require fresh protected source, a clean executing checkout at that exact SHA,
the admitted action and entrypoint, exact project/team/repository identity, the
owner-reviewed link digest, bounded transport with no hidden write retry, and a
final source and target recheck. Use the fixed durable action ledger outside the
repository; persist the consumed mutation budget before sending the request. One
local executor and ledger coordinate this action; they do not exclude other
hosts or provider administrators. An absent link is an idempotent readback,
never a reason to recreate it. An attempted or unknown outcome permits bounded
read-only reconciliation, never a second DELETE, automatic reconnection, or a
new receipt to replenish the budget. Bound the action to five minutes and each
request to thirty seconds.

Readback must distinguish request acknowledgement from observed disconnection
and require unchanged project identity and unrelated configuration metadata.
Source admission, tests, and a receipt do not prove undocumented provider
behavior. This action does not authorize deployment, promotion, credentials,
Neon integration changes, database changes, Railway changes, deploy-hook
changes, or reconnection. ADR-109's Preview prohibition and every other floor
remain in force. A later merge still requires fresh checks and verification that
no applicable Git, workflow, or deploy-hook path triggers deployment.

## One-time GitHub Pages publishing containment (ADR-113)

The fixed action `github-pages-publishing-containment-2026-10-27` scopes
`scripts/release/disable-pages-auto-publishing.mjs` to one
`PUT /repos/nikhillinit/Updog_restore/pages` with `{"build_type":"workflow"}`,
for repository ID `1023548405`. It changes only the publishing mode of the
existing public site. It excludes site deletion, source-branch/path or domain
changes, deployment, rollback, and Railway, Neon, or Vercel mutations. No custom
Pages publishing workflow is introduced.

Candidate text grants no authority before admission. Bootstrap execution
requires a separate explicit owner instruction prospectively overriding, for
this fixed action only, admission before execution, the already-admitted named
delegated-route requirement, and optimistic locking for this single PUT. The
owner must expressly accept that an administrator's intervening publishing-mode
change could be overwritten. Generic authorization to disable Pages through a
governed route does not supply these exceptions. Command-line acknowledgements,
tests, dry runs, and subsequent admission cannot supply that instruction or
authorize an earlier action retroactively.

Require a clean reviewed candidate and committed helper bytes, fresh protected
main, matching PR #1665 and successful current-head `CI Gate Status`, exact
repository/site identity and reviewed Pages digest, and final source/target
rechecks. Use fixed-origin bounded transport without write retries and a fixed
durable single-attempt ledger consumed before sending. An ambiguous response
permits one readback, never another PUT, DELETE, rollback, or replenished
budget. Already observed workflow mode is a zero-write observation, not proof
that an earlier action preserved unrelated state. Verify retained
site/source/domain metadata, observed workflow mode, and absence of pending
Pages publication.

Subsequent admission records the prospective owner instruction and observed
result with their actual chronology in the PR evidence. It creates no standing
bootstrap exception. Vercel's separate admission, risk acceptance, identity, and
execution gates remain unchanged; neither action authorizes the other.

## One-time Vercel Authentication coverage deviation (ADR-117)

**Scope.** This record covers one Vercel project PATCH on 2026-11-20 (UTC),
changing `ssoProtection.deploymentType` from `all_except_custom_domains` to
`all`. The previous mode did not cover the production project domain.

**Owner instruction.** An agent session executed the PATCH on the owner's
explicit instruction, through the Vercel API with the owner's CLI credentials,
after the Vercel MCP connector refused the write (403). No admitted route
covered that provider action.

**Observed result.** Afterwards, unauthenticated probes of every production
hostname returned a redirect to Vercel login. A later re-probe of the production
project domain on 2026-11-20 confirmed it.

**No standing exception.** This records chronology only. It does not authorize
the action retroactively or create a standing exception. Production mode stays
`all` under the release posture gate. The ADR-079 review and access-expansion
hold remain in force.

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

Routes admitted together under ADR-098 are `current-forecast-neon-rehearsal.yml`
for isolated branch rehearsal, `prod-schema-reconcile.yml` mode
`apply-current-forecast-0050-0055` for production schema work, and
`current-forecast-production-action.yml` for separately dispatched
`enter-shadow`, `activate`, `kill`, `resume`, or read-only `readback`. Evidence
never supplies dispatch authority.

Routes admitted together under ADR-103 are `prod-schema-reconcile.yml` mode
`apply-journaled-0050-0061` for production schema work and
`current-forecast-neon-rehearsal.yml` mode `journaled-0050-0061` for isolated
branch rehearsal. For this route, the restore reference is a Neon restore branch
that the owner creates and confirms immediately before dispatch. The workflow
does not verify it. The owner, as sole dispatch issuer, withholds dispatch when
it is absent. This paragraph is an explicit amendment for this route only. The
owner's confirmation alone satisfies the machine-checkable prerequisite floor
above for the restore reference, and the requirement below that a restore
reference is revalidated immediately before apply. The ADR-103 accepted risk
replaces, for this route, the managed backup/PITR, isolated-restore freshness,
custody-role, and preview/restore-isolation evidence floor below. Every other
floor applies unchanged.

**Journaled schema successor for migration 0062 (ADR-115).**

This amendment takes effect only after explicit owner ratification of this scope
and admission of the matching policy, ADR, and executable route to protected
`main` through required current-head CI. It supersedes the ADR-103 migration
freeze solely for the forward apply and release path for the already landed
`0062_vehicle_onboarding_commands` at journal index 63 and its manifest 39. It
does not lift the freeze for later migrations or manifests, ratify the order of
the earlier source merge, establish ADR-103 release completion, or change the
earlier route's tail guard, evidence, or recovery exception.

The only successor entrypoints are `prod-schema-reconcile.yml` mode
`apply-journaled-0062` for schema apply and
`current-forecast-neon-rehearsal.yml` mode `journaled-0062` for isolated
rehearsal. The owner separately dispatches each mode on exact current protected
`main`. The production route is bounded to the pinned 0062 SQL and manifest 39
with a complete ADR-074 and 0050-0061 predecessor ledger and catalog. It may
execute 0062 once when that migration is wholly absent, or record a zero-write
result when its ledger and catalog already match exactly. Earlier migrations,
partial or unknown states, later tails, and unverified sources or targets are
outside the admitted scope.

The existing production schema recovery floor applies in full. Require managed
backup/PITR, a fresh successful isolated restore, named custody, and
preview/restore isolation. Before apply, require a successful attempt-1 isolated
rehearsal at the exact current SHA and verification of its immutable artifact
digest by the apply route. Bind owner-reviewed and signed recovery evidence
(ADR-116) to that same candidate, the exact production target fingerprint, and
the intended apply run. Before that run may proceed, require the owner's
explicit approval of that exact run through the protected `production-schema`
environment and verification against the provisioned public key; keep the
signing key under owner custody outside the repository, GitHub, and any
CI-reachable store; one delegated local executor may sign only on the owner's
explicit instruction for that run (ADR-116). Under the reconcile lock,
revalidate live protected source, exact provider target, and the short-lived
restore reference immediately before DDL. Any unavailable, stale, or conflicting
proof blocks the action before mutation. An ADR-103-style owner confirmation
alone does not satisfy these checks. ADR-116 admits, for this route only, the
owner-performed `production-schema` protection writes at window open and close,
the create-only route variables and production-target secrets, and one
`SCHEMA_0062_ADMISSION` write per apply run; for the protection writes, the five
production-target secret writes, and the admission secret writes only, the
owner's explicit acceptance of the concurrent-writer risk replaces the
optimistic-locking requirement; each write is read back, and a production-target
secret write that reports an update instead of a creation stops for a separate
decision.

Admission grants source authority only. Neither rehearsal, apply receipt, nor
audit supplies release or pilot-activation authority. Full release and its
closeout keep their separate owner and verification gates.

The owner-run route `scripts/provision-prod-users.ts --apply` is admitted for
production user provisioning (ADR-105). The owner runs it locally, never from
CI, against the direct (non-pooler) endpoint. Before any write it refuses when
the checkout HEAD, live `main`, and `EXPECTED_SHA` differ or tracked changes
exist; when the target fingerprint differs from `EXPECTED_TARGET_FINGERPRINT`;
or when the plan digest of the owner-reviewed `--dry-run` no longer matches the
source, identity file, target, and locked target rows. For this route, the
restore reference is a Neon restore branch that the owner creates and confirms
immediately before `--apply`. The script does not verify it. The owner, as sole
dispatch issuer, withholds `--apply` when it is absent. This paragraph is an
explicit amendment for this route only, on the same terms as the ADR-103
paragraph above: the owner's confirmation satisfies the restore-reference
prerequisite and replaces, for this route, the managed backup/PITR,
isolated-restore freshness, custody-role, and preview/restore-isolation evidence
floor below. Every other floor applies unchanged.

The owner-run route
`scripts/release/purge-canary-runs.mjs --execute --run-id --fund-id` is admitted
for purging one release-canary run (ADR-108): it deletes the run's single canary
fund and that fund's rows in the reviewed scope, and keeps the run row as a
purged tombstone. The owner runs it locally, never from CI, against the direct
(non-pooler) endpoint. Before any write it refuses when the checkout HEAD, live
`main`, and `EXPECTED_SHA` differ or tracked changes exist; when the target
fingerprint differs from `EXPECTED_TARGET_FINGERPRINT`; when the run is not
terminal and expired, or the fund is not that run's single release-canary fund;
when any row outside the reviewed scope depends on or names the fund or run; or
when the plan digest of the owner-reviewed dry run no longer matches the source,
target, run, and rows to delete. It re-checks the source within a bounded
deadline immediately before the first write. For this route, the restore
reference is a Neon restore branch that the owner creates after reviewing the
dry run and confirms immediately before execute by passing its identifier in
`RESTORE_BRANCH_ID`. The script records that identifier in the purge receipt and
does not verify the branch. The owner, as sole dispatch issuer, withholds
`--execute` when it is absent. This paragraph is an explicit amendment for this
route only, on the same terms as the ADR-103 and ADR-105 paragraphs above: the
owner's confirmation satisfies the restore-reference prerequisite and replaces,
for this route, the managed backup/PITR, isolated-restore freshness,
custody-role, and preview/restore-isolation evidence floor below. No restore
producer, provider attestation, or isolation proof is required or claimed. Every
other floor applies unchanged.

Under ADR-109 no Preview-producing action is admitted on the original Vercel
project `prj_z0tJGUCgjnmMOv5KG9cEP3ucJ7Xp` (team
`team_BzOixmLqQ9VA2mTvFvzBLRWw`). No Git, CLI, API, or integration-created
Preview deployment of it is authorized, and Production reaches it only through
Release Production. Its non-main Git Previews have received Neon branches forked
with data from the production branch `br-cool-tree-advjpopv`. `vercel.json` sets
`git.deploymentEnabled: false`. Whether that setting covers every push is
UNDETERMINED: the provider does not document which commit's file gates a push,
and the setting does not cover deployments created through the CLI or API. The
Neon default branch stays `br-cool-tree-advjpopv`. This paragraph admits no
provider write. Each of the following needs separate owner authorization of that
exact action, and its own admitted route where it touches the original project,
the production branch, or production credentials: a Disconnect of the Neon
integration; a `previewDeploymentsDisabled` write; deletion of existing Preview
deployments or production-parented Neon branches; the isolated demonstration
resources that ADR-109 describes; and any production credential rotation. A
later amendment for Disconnect or `previewDeploymentsDisabled` requires
demonstrated behavior and recovery in an isolated equivalent setup. That
amendment may accept the concurrency risk of a write for which no
conditional-update contract is established. It cannot replace missing behavior
or recovery evidence, and passing documentation tests does not supply that
evidence. Before any branch of this repository is pushed,
`git show HEAD:vercel.json` must show `git.deploymentEnabled: false`; a branch
without it is rebased onto `origin/main` first. Every other floor applies
unchanged.

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

For classifier roles, `.github/path-filters.yml` supplies general path groups;
`scripts/ci/classify-change-paths.mjs` supplies financial and CI relevance. Both
are enforcement inputs, never authority.

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
  authority is the repository owner, via explicit dispatch of the named workflow
  or, for an owner-run route this policy admits by name, via the owner's own
  local invocation of that route (ADR-105). ADR-110 permits the owner's explicit
  instruction to one delegated local executor for the fixed action
  `railway-production-credential-repair-2026-10-21`, after explicit acceptance
  of that action's concurrent-writer risk and satisfaction of its admission
  gates. ADR-112 separately permits one delegated local executor for its exact
  Git-repository disconnect, after explicit concurrent-writer risk acceptance
  and satisfaction of that route's gates. These exceptions do not change the
  issuer: no agent, plan, or artifact self-authorizes. ADR-116 permits one
  delegated local executor to run only the 0062 admission signing step, on the
  owner's explicit instruction for one named apply run, without changing the
  issuer. ADR-118 permits one delegated local executor to dispatch only the
  read-only provider check workflow `production-provider-check.yml` on the
  owner's explicit instruction; approval of its `Production` environment gate
  stays with the owner, and the issuer does not change.
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
