# PR #1385 Release Gate Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make PR #1385 a trustworthy, reusable production-release
infrastructure change by closing its caller, provider-identity, promotion,
canary-correlation, residue-accounting, H9-export, and reserve-command
idempotency gaps without treating it as the final Current Forecast activation
candidate.

**Architecture:** Keep `release-production.yml` as sole production mutation
workflow and `scripts/deploy-production.ps1` as sole supported dispatcher.
Supply operator evidence through one validated codec, collect provider evidence
through one implementation, pin Vercel and Railway identity to protected values,
prove canonical alias movement after promotion, bind every passing canary
assertion to exact fund created by current workflow execution, and record all
canary writes in expanded residue groups. Add one durable database command
ledger around `calculate-reserve` while preserving deterministic BullMQ job
identity and existing financial calculations. Deliver migration `0053` through
an additive schema-only precursor before runtime changes can merge, then require
the existing Railway GitHub integration to auto-deploy exact protected `main`
SHAs. Produce one strict, immutable evidence-manifest schema now; PR #1385 emits
an `infrastructure_only`, non-candidate manifest.

**Tech Stack:** GitHub Actions, PowerShell, Node.js ESM, TypeScript, Express,
Zod, PostgreSQL/Drizzle, BullMQ/Redis, Playwright, Vitest, Testcontainers,
Vercel REST/CLI, Railway GraphQL.

## Global Constraints

- Plan was authored against PR #1385 head
  `379a3d264ed31cba8a33c803b3eca8579bd21230` and re-reviewed after head
  `dd04b9bde2ac9d9c3baecdbfdd58aba4dd094c66`. Neither historical SHA is approval
  authority. Re-read live head before every batch; Task 0 binds approval to the
  then-current head.
- Tasks 1 through 12 may start only after this tracked plan and the Task 0
  approval verifier are approved by one exact-body `PLAN-APPROVAL-V2` PR comment
  that binds plan SHA-256 and live PR head SHA. Task 0 is the only pre-approval
  bootstrap lane: it may change the plan, verifier, verifier tests, generated
  routing outputs caused by those tracked files, and review-request comments.
  Any plan change or non-descendant PR-head rewrite/rebase invalidates approval
  and requires a new review record; ordinary implementation commits may descend
  from approved head.
- Repository currently has one write-authorized collaborator. Do not claim a
  two-GitHub-login approval rule that repository membership cannot satisfy.
  `PLAN-APPROVAL-V2` uses the repository-admin login as durable decision author
  and enforces separation by context and responsibility: approval is recorded
  from a fresh coordination/review context that performs no Tasks 1 through 12;
  implementation runs in separate agent contexts and receives fresh independent
  review before merge. This single-maintainer separation model is explicit, not
  an inferred exception.
- PR #1385 is interim release infrastructure. Merging it must not mint final
  Current Forecast activation candidate, freeze `main`, start Wave I, or start
  four-window soak.
- Final activation candidate is cut only after minimum Wave H operator work is
  complete. One fixed candidate SHA must then survive four consecutive seven-day
  windows before human activation.
- Use migration `0053`. Never edit already-applied migrations `0050` through
  `0052`.
- Use expand-first delivery. Merge and apply `0053` through a schema-only
  precursor before PR #1385 runtime code. Prove old code against new schema;
  never run new runtime code against old schema and never down-migrate `0053`.
- Preserve ADR-081: operator probes originate outside GitHub Actions, enter as
  redacted data-plane evidence, and are checked against independently fetched
  provider control-plane evidence.
- Do not add GitHub-stored SSH credentials, direct production SSH, Vercel alias
  mutation outside `release-production.yml`, or a second production dispatcher.
- Never log or upload passwords, connection strings, tokens, raw/unvalidated
  operator probe bodies, report artifact bodies, or unredacted provider
  responses. Only strict normalized operator evidence fields may enter encoded
  workflow input.
- Operator evidence accepts only four strict, allowlisted health/readiness
  schemas. Reject unknown fields and secret-shaped keys or values before any
  encoded bundle, decoded file, log, summary, or artifact can be produced.
- Keep OpenAI, DeepSeek-compatible providers, and all LLMs outside release
  decisions and authoritative financial arithmetic.
- No new dependency. Use existing Node, Zod, Drizzle, BullMQ, Playwright,
  Vitest, and Testcontainers facilities.
- All new writes require durable idempotency. All state transitions require a
  version, lease, or equivalent optimistic fence.
- Run tests with `TZ=UTC`. Keep code, docs, logs, and test names emoji-free.
- Do not edit Phoenix protected paths.
- Preserve unrelated worktree changes. Implement on PR branch/worktree, not
  dirty planning checkout.
- Railway rollout model is fixed: protected services auto-deploy from `main`
  through existing GitHub integration. Release workflow waits for and verifies
  exact expected deployment SHA; it has no implementation-time choice between
  trigger models.
- Because runtime merge itself triggers Railway mutation, PR #1385 runtime may
  merge only after Redis incident #1346 is closed, production release is
  authorized, immutable baseline is captured, and a bounded merge-to-release
  change window is active. This operational transaction lock is not activation
  candidate freeze or Wave I repository freeze.
- Application rollback is a human-governed forward revert on `main`, released
  through the same dispatcher. Do not use Vercel alias-only rollback because it
  would create Vercel/Railway SHA skew.

---

## Approved Decisions

1. Delete `.github/workflows/task11-prod-closeout-once.yml`. Git history remains
   audit record. `scripts/deploy-production.ps1` becomes sole supported caller
   of `release-production.yml`.
2. Fix `calculate-reserve` idempotency inside PR #1385 using durable PostgreSQL
   command receipts in migration `0053`.
3. Require full H9-qualified stored JSON export from newly created
   release-canary fund.
4. Use separate protected admin automation identity only to seed one approved
   planning FMV mark and perform MOIC reconciliation. Do not grant
   release-canary principal admin role and do not add H9 bypass.
5. Expand residue accounting to include every table written by current and new
   canaries.
6. Remove final-candidate and repository-freeze meaning from PR #1385.
7. Treat H9 as a financial-truth canary: seed one nonzero approved planning FMV
   mark, require one company actuals fact, and bind the metric run to that mark.
8. Emit `release-evidence-manifest-v1` during the first infrastructure release
   with `candidate=false` and `designation='infrastructure_only'`.
9. Recover cancelled or abandoned canaries by exact workflow run, attempt, fund,
   canary-run, and SHA identity. Never use a latest-run search.
10. Keep generated knowledge-graph output and bounded code-review reports
    untracked. Release proof rebuilds knowledge-graph evidence ephemerally at
    the exact checked-out SHA and deletes it on every outcome.
11. Bind infrastructure-release evidence to exact plan approval and exact
    release-proof workflow run/artifact lineage.

## Stress-Test Verdict

PR direction is sound, but present head is not merge-ready. Current failure and
hidden gaps:

| Finding                                                | Why current plan is insufficient                                                                                                        | Approved correction                                                                                                                     |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| CI lint failure (closed at `4529a0e8`)                 | Attachment said `process` import was missing; reviewed head instead had unused import.                                                  | Unused import removed; exact-head lint and required CI gate re-proved before approval.                                                  |
| Required operator evidence has no supported caller     | Workflow requires `operator_evidence_b64`; PowerShell helper sends only SHA.                                                            | One evidence codec plus mandatory four-file dispatcher arguments.                                                                       |
| Historic Task 11 workflow still dispatches production  | Its issue is closed and hard fence can no longer pass, but static surface remains second caller.                                        | Delete workflow after archive-gate proof.                                                                                               |
| Vercel promotion success is not independently verified | Successful CLI exit immediately passes; failure-only path compares mutable `PRODUCTION_URL`.                                            | Resolve protected canonical hostname through Vercel API after every promote attempt and compare exact deployment ID/project/SHA/alias.  |
| Railway topology is name-pinned, not identity-pinned   | Same names in wrong project/environment/service IDs can pass.                                                                           | Exact protected project, environment, and two service IDs.                                                                              |
| Production variables are not provisioned               | Live GitHub Production variable inventory lacks canary caps, TTL, canonical hostname, and Railway IDs.                                  | Provision provider identity values before precursor proof and canary policy/secrets before runtime release.                             |
| Provider evidence can age during approval              | Staged and G4 jobs run before final promotion approval.                                                                                 | Fetch and verify fresh provider evidence inside promotion job after approval. Revalidate operator evidence freshness there.             |
| Canary completion is SHA-wide                          | Old same-SHA run can satisfy completion while current fund is ordinary or unbound.                                                      | Persist current execution handle and verify workflow run/attempt/fund/canary-run/principal/grant/start/SHA linkage.                     |
| Residue totals omit rows already written               | Grants, calculation rows, snapshots, receipts, scenarios, and reporting artifacts are not counted.                                      | Five additive residue groups plus exact total equality.                                                                                 |
| Creation preflight reserves only initial rows          | Concurrent or unfinished canaries can pass preflight, then exceed caps during later scenario/report writes.                             | Characterize and reserve exact 33-row canary footprint; allow only one nonterminal run.                                                 |
| Purged rows bypass structural validation               | Invalid timestamps or counts are ignored once `purged`.                                                                                 | Validate full row before excluding it from caps and TTL.                                                                                |
| Portfolio canary does not test claimed controls        | It performs one successful PATCH only.                                                                                                  | Same-key replay plus stale-version 409 and unchanged state.                                                                             |
| Results canary is too shallow                          | Response has no snapshot ID; non-empty object assertion proves little.                                                                  | Parse `FundResultsReadV1Schema` and compare stable lifecycle/config/correlation/section evidence across reload.                         |
| Reserve calculation canary is not idempotent           | Endpoint has no durable client key and emits new correlation/event on replay.                                                           | Durable command ledger, canonical stored response, deterministic recovery, and replay canary.                                           |
| “Report/export” is absent from live smoke              | Current suite stops after scenario success.                                                                                             | Full metric/evidence/lock/narrative/package/stored-JSON lifecycle with H9 actionability.                                                |
| H9 write authority conflicts with canary role          | Planning-FMV approval and MOIC reconciliation are admin-only; report writes are partner-scoped.                                         | Separate admin client for planning-mark replay plus reconciliation; partner canary owns remaining lifecycle.                            |
| Artifact hash helper is server-coupled                 | Importing it into Playwright can initialize database/service modules during collection.                                                 | Extract behavior-identical pure helper into `shared/lib` and retain server re-export compatibility.                                     |
| PR sequencing claims too much                          | Infrastructure commit precedes Wave H.                                                                                                  | Merge only as reusable release infrastructure. Cut candidate later.                                                                     |
| Reserve UI would break                                 | Workspace and integration callers omit newly mandatory `Idempotency-Key`; UI has no retry/error state.                                  | Add one intent key per click, retain it across ambiguous retries, and migrate every production/test caller.                             |
| Fund-event budget is false                             | Create, draft-save, publish, and calculate each write a fund event; plan reserved one.                                                  | Characterize deployed path and reserve four fund events, 33 total rows, and 99 rows across three retained runs.                         |
| Schema rollout is unordered                            | Runtime merge before `0053` apply can expose new code to old schema.                                                                    | Merge schema-only precursor, apply/audit it, prove old-code compatibility, then rebase and merge runtime PR.                            |
| Evidence redaction is late                             | Arbitrary nested JSON can be encoded and written before verifier redaction.                                                             | Strict schemas, size/depth limits, pre-encode secret rejection, private files, and unconditional cleanup.                               |
| H9 can prove an empty model                            | Empty source mark/event lists can yield no company financial fact.                                                                      | Seed approved planning FMV, require exact actuals fact, and use explicit source mark ID.                                                |
| Cancellation recovery is ambiguous                     | Result file and finalizer do not survive hard runner cancellation.                                                                      | Capture pre-merge provider baseline, persist execution identity, emit recovery handle, and use exact recovery CLI.                      |
| Job budgets cannot fit inner waits                     | Current outer timeouts are smaller than declared poll/retry paths.                                                                      | Declare step and job budgets with positive cleanup margin and static regression checks.                                                 |
| Approval can drift or self-match                       | Request comment embeds a syntactically approved record; substring matching and editable comments can manufacture or duplicate approval. | Separate request/approval markers; exact-body verifier checks plan/head, admin permission, edit state, duplicates, and full field set.  |
| Railway topology remains discretionary                 | “Keep two unless unrelated services appear” leaves behavior to implementer.                                                             | Validate exact protected ID/name pairs, reject duplicates/cross-maps, and ignore unrelated services only after collision checks.        |
| Evidence manifest is deferred                          | Later candidate could invent incompatible semantics.                                                                                    | Define and validate versioned manifest now; PR #1385 is explicitly infrastructure-only and non-candidate.                               |
| Knowledge-graph snapshot is tracked and stale          | Generated inventory claims coding authority for unrelated non-ancestor SHA and violates repository documentation governance.            | Remove tracked snapshot/review artifact; rebuild KG ephemerally at exact release-proof SHA and delete it on every outcome.              |
| Release evidence omits approval/certification lineage  | Manifest cannot prove which approval and exact release-proof execution certified source SHA.                                            | Bind approval comment identity/body hash plus release-proof run/attempt/artifact/digest to strict manifest fields.                      |
| Worker negative paths are unproved                     | Happy-path reserve completion cannot detect terminal worker failure, bounded-poll timeout, or stale-run substitution.                   | Add deterministic worker-failure and poll-timeout integration/regression truth cases with exact-run finalization and no duplicate work. |

## Domain Model and Terms

- **Release infrastructure commit:** Commit containing reusable release
  workflow, verifiers, schema, and canaries. It may be merged before Wave H and
  is not activation candidate.
- **Activation candidate:** Later exact SHA cut after Wave H, frozen through
  Wave I and four green seven-day windows.
- **Staged deployment:** Production-target Vercel deployment created with no
  production alias.
- **Canonical production hostname:** Bare protected hostname in
  `VERCEL_PRODUCTION_HOSTNAME`. It is identity input, not a mutable display URL.
- **Provider evidence:** Fresh Vercel deployment/version response plus Railway
  token scope/topology response.
- **Operator evidence bundle:** Exactly four redacted objects: `fundHealth`,
  `fundReady`, `capitalHealth`, and `capitalReady`.
- **Current canary execution:** Exact workflow attempt beginning at recorded UTC
  timestamp and producing one known release-canary fund ID.
- **Execution identity:** Exact GitHub workflow run ID and run attempt persisted
  with canary run, coupled to fund ID, canary-run ID, release SHA, and
  principal.
- **Release-canary fund:** Fund with `data_origin='release_canary'` and
  `canary_run_id` linked to run owned by release-canary principal.
- **Durable calculation command:** Database row binding one idempotency key and
  current input lineage to one canonical queue acknowledgement.
- **Stored JSON artifact:** Row-backed JSON report package returned by
  stored-artifact route, not direct recomputation or unauthenticated CSV.
- **H9-qualified:** Stored package fingerprint is `actionable` and still matches
  current MOIC/round-evidence fingerprint at artifact retrieval.
- **Residue:** Every unpurged database row written for release-canary funds,
  grouped and capped.
- **Schema precursor:** Additive migration-only PR merged and applied before
  runtime PR, with old-code/new-schema compatibility evidence.
- **Release evidence manifest:** Strict `release-evidence-manifest-v1` metadata
  document containing hashes and provider/canary identities, never raw evidence
  or artifact bodies.

## Implementation Order

0. Bind approval to tracked plan digest and live PR head.
1. Unblock current CI and remove prohibited tracked audit/review artifacts.
2. Close operator evidence caller gap and retire historic caller.
3. Centralize and pin provider identity.
4. Prove canonical promotion.
5. Deliver, merge, apply, and audit additive migration `0053` through a
   schema-only precursor; prove old code against new schema; rebase PR #1385.
6. Add durable reserve-calculation command and migrate every caller, including
   workspace retry/error UX.
7. Characterize full deployed canary path and enforce exact residue accounting.
8. Bind canary lifecycle and recovery to exact workflow execution.
9. Strengthen portfolio/results/reserve canaries.
10. Add financial-truth H9 stored-JSON canary.
11. Add evidence manifest, integrate policy/time budgets, and run full
    verification.
12. Merge runtime PR and run first governed infrastructure release.

## Delivery Graph

| Delivery unit                        | Contents                                                                                             | Must land before                                      |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Schema precursor                     | Migration `0053`, schema declarations/manifests, compatibility tests                                 | Any runtime code using new columns/table              |
| Read-only baseline-capture precursor | Provider collector/contract plus capture script/workflow/tests; no app, worker, or provider mutation | Final pre-merge baseline capture for runtime PR #1385 |
| Runtime PR #1385                     | Dispatcher, verifiers, command service, canaries, manifest, policy                                   | First governed infrastructure release                 |

Required sequence:

    schema precursor merge/apply/audit
      -> baseline-capture precursor merge
      -> rebase and freeze final PR #1385 head
      -> capture immutable provider baseline
      -> merge PR #1385 (Railway auto-deploy begins)
      -> schema audit-only release workflow

The two precursors are behavior-compatible. Runtime merge is first provider
mutation that changes application/worker behavior and therefore requires exact
pre-merge baseline artifact.

---

## Task 0: Bind Approval to Plan and Head with Edit Detection

**Files:**

- Track: `docs/superpowers/plans/2026-08-11-pr-1385-release-gate-hardening.md`
- Create: `scripts/release/verify-plan-approval.mjs`
- Create: `tests/unit/scripts/verify-plan-approval.test.mjs`
- Modify: `tests/regressions/ci-fail-closed.test.ts`
- Inspect only: PR #1385 head, issue comments, and collaborator permission

**Interfaces:**

```text
PLAN_PATH=docs/superpowers/plans/2026-08-11-pr-1385-release-gate-hardening.md
PLAN_SHA256=<64 lowercase hex>
APPROVED_BASE_HEAD_SHA=<40 lowercase hex>
APPROVER_LOGIN=nikhillinit
SEPARATION_MODEL=single-maintainer-independent-context
```

- [ ] **Step 1: Commit revised plan before verifier implementation**

  Commit and push this review-driven plan revision alone before writing the
  verifier. The verifier is governance bootstrap, not authorization to begin
  Tasks 1 through 12. Do not approve a staged-only or untracked plan.

  Run:

  ```bash
  git add docs/superpowers/plans/2026-08-11-pr-1385-release-gate-hardening.md
  git commit -m "docs(plan): harden PR 1385 approval and evidence scope"
  git push origin HEAD
  git ls-files --error-unmatch docs/superpowers/plans/2026-08-11-pr-1385-release-gate-hardening.md
  ```

  Expected: final command prints exact plan path.

- [ ] **Step 2: Write failing approval-verifier tests**

  Export pure evaluator plus CLI:

  ```js
  export function buildPlanApprovalBody(input);
  export function evaluatePlanApproval(input);
  ```

  Require tests for:

  - exact trimmed whole-comment body only; Markdown fences, prefixes, suffixes,
    and embedded blocks do not match;
  - marker must be `PLAN-APPROVAL-V2`; request marker `PLAN-REVIEW-REQUEST-V2`
    can never qualify;
  - exact plan path, current plan SHA-256, approved base head, approver login,
    separation model, `decision: approved`, and `accepted_exceptions: none`;
  - comment author login equals declared approver and repository owner;
  - live collaborator permission is `admin`, `maintain`, or `write`;
  - `created_at === updated_at`; edited comments are invalid even when body is
    restored later;
  - exactly one applicable unedited approval; zero or multiple fail closed;
  - before first Task 1 edit, approved base equals live head; after ordinary
    descendant implementation commits, approved base must be an ancestor;
  - rebase, force-push, unrelated head, plan digest change, comment deletion,
    permission loss, author mismatch, any non-`none` exception, and API
    pagination/error all fail closed;
  - output contains only normalized comment ID/URL/author/permission/timestamps,
    body SHA-256, plan SHA-256, approved base, live head, decision, and
    separation model.

  Run and confirm failure:

  ```bash
  TZ=UTC npx vitest run \
    tests/unit/scripts/verify-plan-approval.test.mjs \
    --config vitest.config.mjs --configLoader native --project=server
  ```

- [ ] **Step 3: Implement exact-body verifier and CI inventory guard**

  CLI:

  ```bash
  node scripts/release/verify-plan-approval.mjs \
    --repo nikhillinit/Updog_restore \
    --pr 1385 \
    --plan-path docs/superpowers/plans/2026-08-11-pr-1385-release-gate-hardening.md \
    --approver-login nikhillinit \
    --require-exact-head
  ```

  Use GitHub REST issue-comment pagination and collaborator-permission endpoint.
  Fetch live PR head independently. Build expected approval body internally from
  exact local plan digest and live/approved head; do not accept caller-supplied
  body text. Compare normalized body by byte-for-byte string equality after one
  outer `.trim()`. Query commit comparison to prove ancestry for later batches.
  Reject truncated pagination and API uncertainty. Print one compact normalized
  JSON record; never print token, arbitrary comment body, or unrelated comments.

  Add workflow/static regression requiring every implementation batch and final
  merge-readiness check to invoke this verifier. No grep/substr-based
  `PLAN-APPROVAL` acceptance is allowed.

- [ ] **Step 4: Verify and commit governance bootstrap**

  ```bash
  TZ=UTC npx vitest run \
    tests/unit/scripts/verify-plan-approval.test.mjs \
    tests/regressions/ci-fail-closed.test.ts \
    --config vitest.config.mjs --configLoader native --project=server
  npx eslint \
    scripts/release/verify-plan-approval.mjs \
    tests/unit/scripts/verify-plan-approval.test.mjs \
    tests/regressions/ci-fail-closed.test.ts \
    --max-warnings 0
  git add \
    scripts/release/verify-plan-approval.mjs \
    tests/unit/scripts/verify-plan-approval.test.mjs \
    tests/regressions/ci-fail-closed.test.ts
  git commit -m "fix(release): verify exact plan approval record"
  git push origin HEAD
  ```

- [ ] **Step 5: Bind plan digest to live PR head and post request marker**

  Run:

  ```bash
  PLAN_PATH=docs/superpowers/plans/2026-08-11-pr-1385-release-gate-hardening.md
  PLAN_SHA256="$(shasum -a 256 "$PLAN_PATH" | awk '{print $1}')"
  APPROVED_BASE_HEAD_SHA="$(gh pr view 1385 --json headRefOid --jq .headRefOid)"
  test "$(git rev-parse HEAD)" = "$APPROVED_BASE_HEAD_SHA"
  test "${#PLAN_SHA256}" -eq 64
  test "${#APPROVED_BASE_HEAD_SHA}" -eq 40
  ```

  Store neither value inside this plan: embedding plan hash in hashed plan is
  self-referential. Supersede the earlier V1 request comment so it cannot be
  mistaken for approval, then post this exact request body only:

  ```text
  PLAN-REVIEW-REQUEST-V2
  plan_path: docs/superpowers/plans/2026-08-11-pr-1385-release-gate-hardening.md
  plan_sha256: <PLAN_SHA256>
  requested_head_sha: <APPROVED_BASE_HEAD_SHA>
  approver_login: nikhillinit
  separation_model: single-maintainer-independent-context
  decision: review_requested
  ```

  Request comment must not contain `PLAN-APPROVAL-V2`, `decision: approved`, or
  a fenced approval template.

- [ ] **Step 6: Obtain exact durable approval**

  From fresh coordination/review context that performs no Tasks 1 through 12,
  post this exact plain-text body with no Markdown fence, prefix, or suffix:

  ```text
  PLAN-APPROVAL-V2
  plan_path: docs/superpowers/plans/2026-08-11-pr-1385-release-gate-hardening.md
  plan_sha256: <PLAN_SHA256>
  approved_base_head_sha: <APPROVED_BASE_HEAD_SHA>
  approver_login: nikhillinit
  separation_model: single-maintainer-independent-context
  decision: approved
  accepted_exceptions: none
  ```

  Repository owner login must author record and retain current admin/write
  permission. Comment is edit-detected rather than called immutable: any
  `updated_at != created_at`, deletion, replacement, or duplicate invalidates
  approval. Reactions, request comments, local notes, fenced templates, and
  approvals bound only to PR number are insufficient.

- [ ] **Step 7: Verify approval before every implementation batch**

  Run verifier with `--require-exact-head` immediately before first Task 1 edit.
  Run without that flag before each later batch and require approved base
  remains ancestor of live head. Fail on any verifier error. Plan edits,
  force-pushes, and Task 5 rebase require a new V2 request and approval;
  ordinary descendant commits do not. Never carry approval across rebase by
  inference.

  Record approval comment URL, ID, created timestamp, author, and body SHA-256
  in PR description and later strict evidence manifest. Do not create repository
  session artifacts.

---

## Task 1: Rebase Facts, Unblock CI, and Remove Tracked Audit Residue

**Files:**

- Modify: `tests/unit/scripts/assert-canary-residue.test.mjs`
- Modify: `.github/workflows/release-proof.yml`
- Modify: `.gitignore`
- Delete: `audit/knowledge-graph/out/manifest.json`
- Delete: `audit/knowledge-graph/out/nodes-routes.jsonl`
- Delete: `docs/3-code-review/CR_w2_v1.6.0-child-f-batch6-residue.md`
- Modify: `tests/regressions/ci-fail-closed.test.ts`
- Inspect only: PR #1385 live checks and unresolved review threads

- [ ] **Step 1: Reconfirm live head**

  Run:

  ```bash
  gh pr view 1385 --json headRefOid,baseRefOid,state,mergeable,mergeStateStatus,updatedAt,url
  gh pr checks 1385
  ```

  Expected at approved baseline: live head equals approval-bound head or its
  ordinary descendant; PR remains merge-blocked; all completed checks are read
  from current head rather than copied from this plan.

  If head changed, inspect new diff and CI before continuing. Do not blindly
  apply line-based edits.

- [ ] **Step 2: Remove stale lint import**

  Delete:

  ```js
  import process from 'node:process';
  ```

  from `tests/unit/scripts/assert-canary-residue.test.mjs`. Current test no
  longer spawns child process and does not reference imported binding.

- [ ] **Step 3: Verify exact failure is gone**

  Run:

  ```bash
  npx eslint tests/unit/scripts/assert-canary-residue.test.mjs --max-warnings 0
  TZ=UTC npx vitest run tests/unit/scripts/assert-canary-residue.test.mjs --config vitest.config.mjs --configLoader native --project=server
  ```

  Expected: both pass.

- [ ] **Step 4: Remove prohibited tracked artifacts and restore ephemeral KG
      proof**

  Remove the `.gitignore` negation chain for `audit/knowledge-graph/out` and
  delete both newly tracked generated files. Delete the new bounded code-review
  report; it is a session artifact, and its read-only/no-production-caller
  claims are stale. Do not archive or replace either artifact in the repository.

  In `release-proof.yml`, rebuild knowledge graph at exact checked-out candidate
  SHA immediately before strict matrix validation:

  ```bash
  cleanup_kg() {
    rm -rf audit/knowledge-graph/out
  }
  trap cleanup_kg EXIT HUP INT TERM
  node audit/knowledge-graph/scripts/rebuild-knowledge-graph.mjs
  node -e 'const m=require("./audit/knowledge-graph/out/manifest.json"); if (!m.fresh_for_checkout || !m.valid_for_coding || m.repo_head !== process.env.CANDIDATE_SHA) process.exit(1)'
  npx tsx audit/surface-contract-matrix/scripts/validate-matrix.mjs
  ```

  Keep output ignored and runner-local. Cleanup must run on success and failure;
  no knowledge-graph file may be uploaded or committed. The ordinary CI matrix
  test continues to use tracked sources only; strict release proof owns the
  ephemeral rebuild.

  Add regressions requiring:

  - `git ls-files audit/knowledge-graph/out` is empty;
  - the removed code-review path is absent;
  - release proof rebuilds before `validate-matrix` and checks manifest
    `repo_head` against `CANDIDATE_SHA`;
  - an unconditional cleanup trap exists;
  - no workflow uploads `audit/knowledge-graph/out`.

- [ ] **Step 5: Preserve two unresolved review requirements**

  Record these as acceptance tests in Task 9:

  - same-key portfolio PATCH replay returns identical response and unchanged
    state;
  - stale original `expectedVersion` returns `409 VERSION_CONFLICT` and state
    remains unchanged.

  Do not resolve threads until deployed-canary test code and targeted tests
  exist.

- [ ] **Step 6: Verify cleanup and exact-head proof**

  ```bash
  test -z "$(git ls-files audit/knowledge-graph/out)"
  test ! -e docs/3-code-review/CR_w2_v1.6.0-child-f-batch6-residue.md
  TZ=UTC npx vitest run \
    tests/regressions/ci-fail-closed.test.ts \
    --config vitest.config.mjs --configLoader native --project=server
  npx eslint tests/regressions/ci-fail-closed.test.ts --max-warnings 0
  ```

- [ ] **Step 7: Commit**

  ```bash
  git add tests/unit/scripts/assert-canary-residue.test.mjs
  git add .github/workflows/release-proof.yml .gitignore tests/regressions/ci-fail-closed.test.ts
  git add -u \
    audit/knowledge-graph/out/manifest.json \
    audit/knowledge-graph/out/nodes-routes.jsonl \
    docs/3-code-review/CR_w2_v1.6.0-child-f-batch6-residue.md
  git commit -m "fix(release): keep exact-sha audit evidence ephemeral"
  ```

---

## Task 2: Create Operator Evidence Codec and Sole Dispatcher

**Files:**

- Create: `scripts/release/operator-evidence-bundle.mjs`
- Create: `tests/unit/scripts/operator-evidence-bundle.test.mjs`
- Modify: `scripts/deploy-production.ps1`
- Modify: `.github/workflows/release-production.yml`
- Delete: `.github/workflows/task11-prod-closeout-once.yml`
- Modify: `tests/regressions/ci-fail-closed.test.ts`
- Modify: `scripts/DEPLOYMENT_AUTOMATION_README.md`
- Modify: `docs/runbooks/rollback.md`
- Inspect only: `workers/health-server.ts`

**Interfaces:**

```ts
type OperatorEvidenceBundleV1 = {
  fundHealth: FundWorkerHealthV1;
  fundReady: FundWorkerReadyV1;
  capitalHealth: CapitalWorkerHealthV1;
  capitalReady: CapitalWorkerReadyV1;
};

export function encodeOperatorEvidenceBundle(input: unknown): string;
export function decodeOperatorEvidenceBundle(
  encoded: string
): OperatorEvidenceBundleV1;
```

- [ ] **Step 1: Write failing codec tests**

  Test exported API:

  ```js
  export const OPERATOR_EVIDENCE_FIELDS = Object.freeze([
    'fundHealth',
    'fundReady',
    'capitalHealth',
    'capitalReady',
  ]);
  export const MAX_OPERATOR_EVIDENCE_B64_CHARS = 60_000;

  export function encodeOperatorEvidenceBundle(input);
  export function decodeOperatorEvidenceBundle(encoded);
  ```

  Define four `.strict()` Zod schemas in codec. Health schema allows only:

  - `status='healthy'`;
  - ISO timestamp, nonnegative finite uptime, version string 1-64 characters,
    and `environment='production'`;
  - lowercase 40-hex commit and deployment ID matching `^[A-Za-z0-9_-]{1,128}$`;
  - exact expected `workerType`;
  - exactly one worker with matching `name`, `status='healthy'`,
    `isRunning=true`, safe nonnegative `jobsProcessed`, optional ISO
    `lastJobTime`, and optional safe nonnegative `exhaustedOutboxCount` only for
    capital-call worker;
  - metrics with safe nonnegative `totalJobsProcessed` and `totalErrors`.

  Ready schema allows only `status='ready'`, ISO timestamp, exact worker type,
  same 40-hex commit, and same bounded deployment ID. Bundle validation must
  also require health/readiness commit and deployment ID equality for each
  worker, same commit across both workers, and distinct deployment IDs.

  Cases:

  - accepts exactly four objects matching their strict production schemas;
  - rejects missing/extra bundle keys, unknown nested keys, wrong worker
    pairing, arrays, primitives, empty/malformed JSON, malformed base64,
    non-canonical padding, unhealthy/not-ready state, invalid timestamps, unsafe
    numbers, and mismatched commit/deployment identity;
  - rejects any recursive key matching, case-insensitively, `authorization`,
    `cookie`, `password`, `passwd`, `secret`, `token`, `api[-_]?key`,
    `database_url`, `redis_url`, or `connection[-_]?string`;
  - rejects any string matching Bearer/Basic authorization, PostgreSQL/Redis
    URI, URL userinfo, private-key PEM, or known GitHub token prefixes;
  - rejects source file above 12,000 bytes, aggregate raw input above 44,000
    bytes, object depth above four, string above its schema bound, encoded
    bundle above 60,000 characters, and aggregate decoded output above 44,000
    bytes;
  - encode then decode returns normalized schema output, not arbitrary source
    JSON;
  - CLI `encode` emits one base64 line only;
  - CLI `decode` writes exactly four known filenames with mode `0600` inside a
    newly created `0700` directory;
  - decode rejects preexisting output, symlinks, non-exclusive writes, and reads
    `OPERATOR_EVIDENCE_B64` from environment, never command arguments;
  - CLI never prints source, decoded body, secret-shaped match, or raw parse
    value.

  Run and confirm failure:

  ```bash
  TZ=UTC npx vitest run tests/unit/scripts/operator-evidence-bundle.test.mjs --config vitest.config.mjs --configLoader native --project=server
  ```

- [ ] **Step 2: Implement codec and CLI**

  CLI contract:

  ```bash
  node scripts/release/operator-evidence-bundle.mjs encode \
    --fund-health "$FUND_HEALTH_PATH" \
    --fund-ready "$FUND_READY_PATH" \
    --capital-health "$CAPITAL_HEALTH_PATH" \
    --capital-ready "$CAPITAL_READY_PATH"

  OPERATOR_EVIDENCE_B64="$OPERATOR_EVIDENCE_B64" \
    node scripts/release/operator-evidence-bundle.mjs decode \
    --output-dir "$RUNNER_TEMP/operator-evidence"
  ```

  Encode rules, in order:

  1. `lstat` four leaf paths; reject symlinks and files above 12,000 bytes
     before reading;
  2. enforce aggregate 44,000-byte limit;
  3. parse JSON and recursively enforce depth plus secret-shaped key/value
     denylist;
  4. parse with strict field schema and cross-object identity checks;
  5. serialize normalized parsed bundle once with `JSON.stringify`;
  6. reject encoded output longer than 60,000 ASCII characters;
  7. emit base64 only to stdout.

  Decode rules, in order:

  1. strip ASCII whitespace and reject above 60,000 characters before decode;
  2. validate base64 syntax/round-trip and decoded bytes at or below 44,000;
  3. parse JSON, rerun secret/depth checks, strict schemas, and cross-object
     identity checks;
  4. reject existing/symlink output path; create directory mode `0700`;
  5. write four known files exclusively with `wx`, mode `0600`, and normalized
     JSON only;
  6. print only `operator evidence decoded`.

  On partial write, remove output directory before returning error. Do not rely
  on downstream verifier redaction: forbidden content must never survive encode.

- [ ] **Step 3: Make PowerShell evidence inputs mandatory**

  Add mandatory parameters:

  ```powershell
  param(
      [Parameter(Mandatory = $true)]
      [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
      [string] $FundHealthPath,

      [Parameter(Mandatory = $true)]
      [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
      [string] $FundReadyPath,

      [Parameter(Mandatory = $true)]
      [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
      [string] $CapitalHealthPath,

      [Parameter(Mandatory = $true)]
      [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
      [string] $CapitalReadyPath
  )
  ```

  Dispatcher sequence:

  1. Require `gh` and `node`.
  2. Resolve repository and exact live `main` SHA.
  3. Run codec `encode` with four file paths.
  4. Reject empty/multiline codec output.
  5. Build ordered JSON with `expected_sha` and `operator_evidence_b64`.
  6. Serialize compact full `inputs` JSON and reject it when character count
     exceeds GitHub's 65,535-character `workflow_dispatch` payload limit.
  7. Pipe JSON to
     `gh workflow run release-production.yml --ref main --repo $repository --json`.
  8. Never echo base64.

  Use stdin because GitHub CLI officially supports workflow input JSON from
  stdin. Do not place evidence in `--field` argv.

- [ ] **Step 4: Reuse codec in workflow**

  Replace inline G4 base64/JSON decoder with:

  ```bash
  OPERATOR_EVIDENCE_B64="$OPERATOR_EVIDENCE_B64" \
    node scripts/release/operator-evidence-bundle.mjs decode \
    --output-dir "$RUNNER_TEMP/operator-evidence"
  ```

  Point provider verifier arguments to files in that directory.

  Call same decoder again inside `promote` after Production approval. This makes
  freshness revalidation use identical bundle semantics.

  Every workflow consumer must create a unique directory under `RUNNER_TEMP` and
  install `if: always()` cleanup that removes decoded files on success, failure,
  or verifier rejection. Regression tests inspect every decode call and require
  a matching cleanup step. Hard runner cancellation is covered by ephemeral
  runner storage; no evidence directory may be uploaded.

- [ ] **Step 5: Prove historic workflow is safe to delete**

  Before deletion, run:

  ```bash
  gh issue view 1174 --json state,closedAt,url
  git log --oneline -- .github/workflows/task11-prod-closeout-once.yml
  rg -n "task11-prod-closeout-once|Task 11 Production Closeout Once" . \
    --glob '!.git/**'
  ```

  Required evidence:

  - issue #1174 closed;
  - git history retains workflow and closeout commits;
  - every match outside workflow itself is classified as historical evidence or
    this active implementation plan, never an executable caller;
  - workflow fence requires historic title/base/issue-open state and cannot be
    reused.

  Then delete `.github/workflows/task11-prod-closeout-once.yml`. Do not create
  archive copy.

  After deletion require no active caller reference:

  ```bash
  rg -n "task11-prod-closeout-once|Task 11 Production Closeout Once" \
    .github scripts package.json docs/runbooks
  ```

  Expected exit code: 1, meaning no match.

- [ ] **Step 6: Strengthen CI caller inventory**

  Add regression assertions:

  - `release-production.yml` requires `operator_evidence_b64`;
  - `scripts/deploy-production.ps1` supplies `expected_sha` and
    `operator_evidence_b64` through `--json`;
  - dispatcher accepts no skip/force switch;
  - Task 11 workflow is absent;
  - no other workflow, script, package script, hook, or runbook dispatches
    `release-production.yml`;
  - direct production Vercel mutation remains confined to
    `release-production.yml`.

- [ ] **Step 7: Update operator docs**

  Document exact invocation:

  ```powershell
  .\scripts\deploy-production.ps1 `
    -FundHealthPath .\evidence\fund-health.json `
    -FundReadyPath .\evidence\fund-ready.json `
    -CapitalHealthPath .\evidence\capital-health.json `
    -CapitalReadyPath .\evidence\capital-ready.json
  ```

  Rollback runbook must use same dispatcher after fresh evidence capture. Remove
  raw `gh workflow run` example.

- [ ] **Step 8: Verify**

  ```bash
  TZ=UTC npx vitest run \
    tests/unit/scripts/operator-evidence-bundle.test.mjs \
    tests/regressions/ci-fail-closed.test.ts \
    --config vitest.config.mjs --configLoader native --project=server
  npx eslint \
    scripts/release/operator-evidence-bundle.mjs \
    tests/unit/scripts/operator-evidence-bundle.test.mjs \
    tests/regressions/ci-fail-closed.test.ts \
    --max-warnings 0
  ```

- [ ] **Step 9: Commit**

  ```bash
  git add \
    scripts/release/operator-evidence-bundle.mjs \
    tests/unit/scripts/operator-evidence-bundle.test.mjs \
    scripts/deploy-production.ps1 \
    .github/workflows/release-production.yml \
    tests/regressions/ci-fail-closed.test.ts \
    scripts/DEPLOYMENT_AUTOMATION_README.md \
    docs/runbooks/rollback.md
  git add -u .github/workflows/task11-prod-closeout-once.yml
  git commit -m "fix(release): require attested operator evidence at sole dispatcher"
  ```

---

## Task 3: Centralize Provider Collection and Pin Railway Identity

**Files:**

- Create: `scripts/release/collect-provider-evidence.mjs`
- Create: `scripts/release/provider-evidence-contract.mjs`
- Create: `tests/unit/scripts/collect-provider-evidence.test.mjs`
- Create: `tests/unit/scripts/provider-evidence-contract.test.mjs`
- Modify: `scripts/release/verify-provider-identity.mjs`
- Modify: `scripts/release/wait-railway-workers.mjs`
- Create: `tests/unit/scripts/verify-provider-identity.test.mjs`
- Modify: `tests/unit/scripts/wait-railway-workers.test.mjs`
- Modify: `.github/workflows/release-production.yml`
- Modify: `tests/regressions/ci-fail-closed.test.ts`

**Interfaces:**

```ts
type ProtectedRailwayTopology = {
  projectId: string;
  environmentId: string;
  services: {
    'fund-scenario-calc': string;
    'capital-call-status': string;
  };
};

type VercelEvidenceMode =
  | { kind: 'staged_candidate'; expectedSha: string }
  | { kind: 'canonical_baseline'; canonicalHostname: string };

export function verifyVercelEvidence(
  vercel: unknown,
  expectedProjectId: string,
  mode: VercelEvidenceMode
): VerifiedVercelEvidence;

export function verifyRailwayTopology(
  railway: unknown,
  expectedSha: string,
  protectedTopology: ProtectedRailwayTopology
): VerifiedRailwayTopology;
```

- [ ] **Step 1: Write failing collector tests**

  Export:

  ```js
  export async function collectProviderEvidence({
    deploymentUrl,
    outputDirectory,
    fetchImpl,
    writeFileImpl,
  });
  ```

  Tests with injected `fetchImpl`:

  - strict bare HTTPS `vercel.app` staged URL;
  - Vercel deployment request uses `/v13/deployments/{hostname}?teamId=...`;
  - version request uses staged `/api/version` and bypass header;
  - Railway token query obtains project/environment IDs;
  - topology query uses those IDs;
  - partial/malformed/error/paginated responses fail closed;
  - files contain normalized evidence only;
  - tokens never appear in return value, filenames, errors, stdout, or stderr.

- [ ] **Step 2: Implement collector**

  Required environment:

  - `VERCEL_TOKEN`
  - `VERCEL_ORG_ID`
  - `VERCEL_PROJECT_ID`
  - `RAILWAY_TOKEN`
  - `VERCEL_AUTOMATION_BYPASS_SECRET`

  CLI:

  ```bash
  node scripts/release/collect-provider-evidence.mjs \
    --deployment-url "$DEPLOYMENT_URL" \
    --output-dir "$RUNNER_TEMP/provider-evidence"
  ```

  Output:

  - `vercel-evidence.json` containing expected Vercel project ID, normalized
    deployment, and version response;
  - `railway-evidence.json` containing normalized token project/environment IDs
    and full untruncated service topology.

  Do not print raw response content.

- [ ] **Step 3: Create pure provider contract and adapt verifier**

  Change:

  ```js
  verifyRailwayTopology(railway, expectedSha);
  ```

  to:

  ```js
  verifyRailwayTopology(railway, expectedSha, {
    projectId,
    environmentId,
    serviceIds: {
      'fund-scenario-calc': fundScenarioCalcServiceId,
      'capital-call-status': capitalCallStatusServiceId,
    },
  });
  ```

  CLI flags:

  ```text
  --expected-railway-project-id
  --expected-railway-environment-id
  --expected-fund-scenario-service-id
  --expected-capital-call-service-id
  ```

  Put Vercel/Railway selection and normalization in new pure
  `scripts/release/provider-evidence-contract.mjs`. `staged_candidate` Vercel
  mode requires protected project, exact SHA, READY production target, and no
  alias. `canonical_baseline` mode requires protected project, READY production
  target, exact canonical alias, and returns current source SHA/deployment ID.
  Make CLI verifier, waiter, and baseline capture delegate to this module; none
  keeps a second provider topology algorithm.

  For Railway, select protected services by exact ID/name pair. Fail when:

  - project or environment differs;
  - required IDs missing, equal each other, duplicated in topology, or mapped to
    wrong names;
  - required service missing;
  - additional worker service with either protected name appears under different
    ID;
  - any service reuses a protected ID under another name;
  - duplicate protected names, duplicate protected IDs, or cross-mapped pairs
    appear anywhere in returned topology;
  - replica/domain/deployment/SHA/instance invariants fail.

  Do not require `services.length === 2` at verifier boundary. Unrelated
  services may exist in token scope and pass only after full topology scan
  proves they use neither protected name nor protected ID. This is fixed
  behavior, not an implementation-time choice.

- [ ] **Step 4: Pin waiter to same IDs**

  `wait-railway-workers.mjs` must accept same four expected values and use
  shared verifier logic on every poll. It must not maintain separate name-only
  acceptance criteria.

  Add tests:

  - right names/wrong IDs never converge;
  - right IDs/wrong project never converge;
  - exact protected pairs plus unrelated service converge;
  - duplicate protected name, duplicate protected ID, and cross-map never
    converge;
  - exact topology converges;
  - timeout remains fail closed;
  - no token/raw GraphQL output.

- [ ] **Step 5: Replace duplicated workflow fetch blocks**

  Use collector in:

  - `staged-provider-identity`;
  - `g4-operator-evidence`;
  - `promote` before promotion.

  Supply protected GitHub Production variables:

  - `RAILWAY_PROJECT_ID`
  - `RAILWAY_ENVIRONMENT_ID`
  - `RAILWAY_FUND_SCENARIO_CALC_SERVICE_ID`
  - `RAILWAY_CAPITAL_CALL_STATUS_SERVICE_ID`

  Pass exact flags to verifier and waiter.

  Railway deployment trigger contract is fixed: both protected services use
  existing GitHub integration auto-deploy from `main`. Workflow does not call a
  Railway redeploy mutation. It waits for each exact protected ID to report a
  successful deployment of expected SHA and fails after bounded timeout when
  auto-deploy does not occur.

- [ ] **Step 6: Verify**

  ```bash
  TZ=UTC npx vitest run \
    tests/unit/scripts/collect-provider-evidence.test.mjs \
    tests/unit/scripts/provider-evidence-contract.test.mjs \
    tests/unit/scripts/verify-provider-identity.test.mjs \
    tests/unit/scripts/wait-railway-workers.test.mjs \
    tests/regressions/ci-fail-closed.test.ts \
    --config vitest.config.mjs --configLoader native --project=server
  ```

- [ ] **Step 7: Commit**

  Create read-only provider primitive commit first:

  ```bash
  git add \
    scripts/release/collect-provider-evidence.mjs \
    scripts/release/provider-evidence-contract.mjs \
    tests/unit/scripts/collect-provider-evidence.test.mjs \
    tests/unit/scripts/provider-evidence-contract.test.mjs
  git commit -m "refactor(release): centralize protected provider evidence"
  ```

  Task 8 lands this commit in read-only baseline precursor. After rebase, commit
  runtime waiter/workflow integration separately:

  ```bash
  git add \
    scripts/release/verify-provider-identity.mjs \
    scripts/release/wait-railway-workers.mjs \
    tests/unit/scripts/verify-provider-identity.test.mjs \
    tests/unit/scripts/wait-railway-workers.test.mjs \
    .github/workflows/release-production.yml \
    tests/regressions/ci-fail-closed.test.ts
  git commit -m "fix(release): enforce protected provider identities"
  ```

---

## Task 4: Prove Canonical Vercel Promotion

**Files:**

- Create: `scripts/release/verify-vercel-promotion.mjs`
- Create: `tests/unit/scripts/verify-vercel-promotion.test.mjs`
- Modify: `.github/workflows/release-production.yml`
- Modify: `tests/regressions/ci-fail-closed.test.ts`
- Modify: `scripts/DEPLOYMENT_AUTOMATION_README.md`
- Modify: `docs/runbooks/rollback.md`

**Interfaces:**

```ts
export function normalizeCanonicalHostname(value: unknown): string;
export function verifyCanonicalPromotion(input: CanonicalPromotionInput): void;
```

- [ ] **Step 1: Write failing pure-verifier tests**

  Export:

  ```js
  export function normalizeCanonicalHostname(value);

  export function verifyCanonicalPromotion({
    canonicalHostname,
    deployment,
    expectedDeploymentId,
    expectedProjectId,
    expectedSha,
  });
  ```

  Accept only when:

  - canonical value is bare lowercase hostname with no scheme, port, path,
    query, fragment, wildcard, or credentials;
  - response deployment ID equals staged deployment ID;
  - project ID equals protected Vercel project ID;
  - `readyState === 'READY'`;
  - `target === 'production'`;
  - Git commit SHA equals expected SHA;
  - aliases include canonical hostname exactly.

  Tests must reject every individual mismatch, malformed response, missing
  aliases, duplicate conflicting alias fields, and API error.

- [ ] **Step 2: Implement bounded canonical resolver**

  CLI:

  ```bash
  node scripts/release/verify-vercel-promotion.mjs \
    --canonical-hostname "$VERCEL_PRODUCTION_HOSTNAME" \
    --expected-deployment-id "$STAGED_DEPLOYMENT_ID" \
    --expected-project-id "$VERCEL_PROJECT_ID" \
    --expected-sha "$EXPECTED_SHA"
  ```

  The CLI:

  1. validates arguments;
  2. polls `GET /v13/deployments/{canonicalHostname}?teamId={VERCEL_ORG_ID}`;
  3. uses monotonic five-minute overall deadline and four-second per-request
     abort timeout;
  4. waits at most five seconds between attempts, clipped to remaining deadline,
     and allows at most 60 attempts;
  5. succeeds only on pure verifier match;
  6. writes production URL and deployment ID to optional `--github-output` path;
  7. never prints token or response body.

  Resolver budget is exactly five elapsed minutes including request latency and
  sleeps. Wrap resolver step with six-minute timeout. `promote` job gets 20
  minutes total: two minutes fresh evidence/verification, five minutes Vercel
  CLI, six minutes resolver wrapper, and seven minutes setup/output/cleanup
  margin. Static workflow tests require outer budget to exceed declared inner
  budgets.

- [ ] **Step 3: Add staged deployment ID output**

  `validate-deployment` must output:

  - `deployment_url`;
  - `deployment_id`.

  Use Vercel API response ID, not hostname-derived value.

- [ ] **Step 4: Rebuild promotion job in exact order**

  Inside `promote`, after Production environment approval:

  1. checkout exact `expected_sha`;
  2. setup Node;
  3. re-fence live `main`;
  4. decode operator bundle with shared codec;
  5. collect fresh provider evidence;
  6. verify exact Vercel and Railway protected IDs/SHA;
  7. run operator-mode verification again so evidence age/future/skew rules
     apply at promotion time;
  8. run `vercel promote` and capture exit code without exiting early;
  9. resolve canonical hostname through Vercel API;
  10. require canonical hostname to resolve to exact staged deployment;
  11. accept CLI failure only when canonical proof establishes verified no-op;
  12. output `production_url` and `deployment_id`.

  Do not use `vars.PRODUCTION_URL` for identity or no-op proof.

- [ ] **Step 5: Route all post-promotion consumers to proved output**

  Use `needs.promote.outputs.production_url` for:

  - post-promotion smoke;
  - Vercel runtime log scan;
  - any post-promotion origin check.

  Use `VERCEL_PRODUCTION_HOSTNAME` to derive canonical `RUM_ALLOWED_ORIGIN`. Do
  not use mutable `PRODUCTION_URL` as proof.

- [ ] **Step 6: Add workflow regressions**

  Assert:

  - successful promote path cannot exit before canonical proof;
  - failed promote path cannot pass without canonical proof;
  - canonical resolver uses protected hostname and `teamId`;
  - exact staged deployment ID is compared;
  - post-promotion jobs consume promote output;
  - fresh provider and operator verification run inside `promote` after
    environment gate;
  - mutable `vars.PRODUCTION_URL` is absent from release identity decisions.

- [ ] **Step 7: Verify**

  ```bash
  TZ=UTC npx vitest run \
    tests/unit/scripts/verify-vercel-promotion.test.mjs \
    tests/regressions/ci-fail-closed.test.ts \
    --config vitest.config.mjs --configLoader native --project=server
  ```

- [ ] **Step 8: Commit**

  ```bash
  git add \
    scripts/release/verify-vercel-promotion.mjs \
    tests/unit/scripts/verify-vercel-promotion.test.mjs \
    .github/workflows/release-production.yml \
    tests/regressions/ci-fail-closed.test.ts \
    scripts/DEPLOYMENT_AUTOMATION_README.md \
    docs/runbooks/rollback.md
  git commit -m "fix(release): prove canonical alias movement after promotion"
  ```

---

## Task 5: Deliver Migration 0053 Through Expand-First Schema Precursor

**Files:**

- Create: `shared/schema/fund-scenario-calculation-commands.ts`
- Modify: `shared/schema.ts`
- Modify: `shared/schema/fund.ts`
- Modify: `shared/schema/release-canary.ts`
- Create: `migrations/0053_g3_release_gate_hardening.sql`
- Modify: `migrations/meta/_journal.json`
- Create: `scripts/prod-schema-manifests/30-g3-release-gate-hardening.json`
- Modify: `shared/routes/api-route-manifest.ts`
- Modify: `tests/unit/schema/g3-foundations-schema.test.ts`
- Modify: `tests/unit/migration-ledger.test.ts`
- Modify: `tests/unit/prod-schema-manifest-coverage.test.ts`
- Modify: `tests/integration/prod-schema-clone.test.ts`
- Create: `tests/integration/g3-schema-forward-compatibility.test.ts`
- Inspect only: `.github/workflows/prod-schema-reconcile.yml`
- Inspect only: `docs/1-plans/F_1.2.0_v1.4-release-proof-activation.plan.md`

**Delivery split:**

- Schema precursor branch/PR `codex/pr-1385-schema-expand`: schema modules,
  migration, journal, production schema manifest, schema/clone/compatibility
  tests only.
- Runtime PR #1385 after precursor merge/apply: route manifest dependency and
  Tasks 6 through 12.

Do not combine precursor and runtime merge. Production schema reconciler is
default-branch and exact-SHA fenced; it cannot safely apply unapplied migration
from unmerged PR #1385.

- [ ] **Step 1: Write failing schema tests**

  Require:

  - new table `fund_scenario_calculation_commands`;
  - unique scope `(fund_id, scenario_set_id, idempotency_key)`;
  - command status/lease/response/hash/version checks;
  - nullable `queued_event_recorded_at` on `fund_scenario_calculation_runs`;
  - migration backfills that marker from a matching existing
    `calculation_queued` event before new code can emit events;
  - five new residue columns;
  - nullable `workflow_run_id` and `workflow_run_attempt` with coupling and
    partial uniqueness on `release_canary_runs`;
  - residue total equality across all ten residue fields;
  - manifest order 30 and migration `0053`;
  - journal entry index 54 after `0052`;
  - old application code can create/finalize ordinary and canary funds and run
    existing reserve flow against schema containing `0053`.

  Run:

  ```bash
  TZ=UTC npx vitest run \
    tests/unit/schema/g3-foundations-schema.test.ts \
    tests/unit/migration-ledger.test.ts \
    tests/unit/prod-schema-manifest-coverage.test.ts \
    --config vitest.config.mjs --configLoader native --project=server
  ```

  Expected: fail before schema implementation.

- [ ] **Step 2: Define calculation command table**

  Use exact columns:

  | Column               | Type                 | Rules                                    |
  | -------------------- | -------------------- | ---------------------------------------- |
  | `id`                 | uuid                 | primary key, generated                   |
  | `fund_id`            | integer              | FK funds, cascade                        |
  | `scenario_set_id`    | uuid                 | FK scenario sets, cascade                |
  | `idempotency_key`    | varchar(128)         | not null                                 |
  | `request_hash`       | varchar(64)          | lowercase SHA-256                        |
  | `status`             | varchar(16)          | `pending`, `completed`, `failed`         |
  | `run_id`             | uuid nullable        | FK calculation runs, cascade             |
  | `correlation_id`     | varchar(36) nullable | canonical run UUID after run binding     |
  | `response_status`    | integer nullable     | completed requires 202                   |
  | `response_body`      | jsonb nullable       | completed requires exact queued contract |
  | `attempt_count`      | integer              | not null, default 1, at least 1          |
  | `lease_token`        | uuid nullable        | pending owner fence                      |
  | `lease_expires_at`   | timestamptz nullable | coupled with lease token                 |
  | `failure_code`       | varchar(80) nullable | no raw error text                        |
  | `created_by_user_id` | integer nullable     | FK users, restrict                       |
  | `created_by_label`   | text                 | not null normalized actor label          |
  | `version`            | integer              | not null, default 1, at least 1          |
  | `created_at`         | timestamptz          | not null                                 |
  | `updated_at`         | timestamptz          | not null                                 |

  Constraints:

  - `fund_scenario_calc_commands_scope_unique`;
  - `fund_scenario_calc_commands_status_check`;
  - `fund_scenario_calc_commands_hash_check`;
  - `fund_scenario_calc_commands_response_check`;
  - `fund_scenario_calc_commands_lease_check`;
  - `fund_scenario_calc_commands_attempt_check`;
  - `fund_scenario_calc_commands_version_check`;
  - index `fund_scenario_calc_commands_status_idx` on status/lease expiry.

  Response coupling:

  - completed: run ID and correlation ID present, response status 202, response
    body present, no lease;
  - pending: response fields null, lease fields both present or both null, and
    run ID/correlation ID are either both null or both present;
  - failed: response fields null, no active lease, failure code present, and run
    ID/correlation ID are either both null or both present.

- [ ] **Step 3: Add run-level event fence**

  Add nullable `queuedEventRecordedAt` / `queued_event_recorded_at` to
  `fund_scenario_calculation_runs`. This marker owns exactly-once
  `calculation_queued` event insertion for one run.

  Migration must backfill marker with earliest matching event timestamp where
  `fund_scenario_set_events` has same fund, same scenario set, event type
  `calculation_queued`, and `change_summary.correlation_id` equal to run
  correlation ID. Do not delete or rewrite historical events; marker prevents
  new duplicates.

- [ ] **Step 4: Add execution identity and residue columns**

  Add nullable execution identity columns to `release_canary_runs`:

  | Column                 | Type          | Rules                           |
  | ---------------------- | ------------- | ------------------------------- |
  | `workflow_run_id`      | `varchar(32)` | decimal GitHub run ID or null   |
  | `workflow_run_attempt` | `integer`     | positive attempt number or null |

  Add named coupling check requiring both null or both present. When present,
  run ID must match `^[1-9][0-9]{0,31}$` and attempt must be at least one. Add
  partial unique index on `(workflow_run_id, workflow_run_attempt)` where run ID
  is not null. Existing rows remain null/null; Task 8 requires both values for
  new production release-canary creation.

  Add nonnegative default-zero columns:

  - `grant_residue_count`;
  - `calculation_residue_count`;
  - `mutation_receipt_residue_count`;
  - `scenario_residue_count`;
  - `reporting_residue_count`.

  Replace `release_canary_runs_residue_count_check` so:

  1. all ten fields and total are nonnegative;
  2. `total_residue_count` equals sum of:
     - portfolio company;
     - fund;
     - fund config;
     - fund event;
     - notification;
     - grant;
     - calculation;
     - mutation receipt;
     - scenario;
     - reporting.

  Existing rows remain valid because additive columns default to zero.

- [ ] **Step 5: Write replay-safe migration**

  `0053_g3_release_gate_hardening.sql` must:

  - carry `-- @drift-patch` rationale;
  - use additive `IF NOT EXISTS` operations;
  - create command table and indexes;
  - add run marker;
  - backfill run marker from matching historic queued events;
  - add nullable workflow run/attempt fields, coupling check, and partial unique
    index without rewriting historical rows;
  - add residue columns;
  - drop and recreate named residue check safely;
  - avoid down migration;
  - remain compatible with Drizzle-owned transaction.

  Add journal entry:

  ```json
  {
    "idx": 54,
    "version": "7",
    "when": 1786059600000,
    "tag": "0053_g3_release_gate_hardening",
    "breakpoints": true
  }
  ```

- [ ] **Step 6: Add production schema manifest**

  Create order 30 manifest with:

  - allowed create table `fund_scenario_calculation_commands`;
  - shared changes for `fund_scenario_calculation_runs` and
    `release_canary_runs`;
  - all columns, named constraints, and index;
  - `allowNonNullColumnAdds` for new defaulted residue columns and command-table
    columns only where reconciler requires declaration;
  - nullable execution identity columns, named coupling check, and partial
    unique index.

  Defer scenario-set route manifest dependency to rebased runtime PR; precursor
  must not claim route behavior before command service exists.

- [ ] **Step 7: Prove old-code/new-schema compatibility**

  Create Testcontainers characterization that starts from migration `0052`,
  applies `0053`, then exercises existing pre-PR-1385 application paths without
  setting any new runtime field:

  1. create ordinary fund;
  2. create release-canary fund through current persistence service;
  3. save draft and publish;
  4. create scenario set and run current reserve calculation path;
  5. query results and reconcile existing canary row;
  6. restart application services against same database and repeat reads.

  Require existing writes succeed, new residue columns default to zero,
  execution identity remains null/null for legacy caller, and no old query
  depends on exact column projection. Also run clone test from production-like
  schema snapshot. This test is rollback proof: old code remains safe after
  `0053` and forward revert does not need down migration.

- [ ] **Step 8: Verify precursor locally**

  ```bash
  TZ=UTC npx vitest run \
    tests/unit/schema/g3-foundations-schema.test.ts \
    tests/unit/migration-ledger.test.ts \
    tests/unit/prod-schema-manifest-coverage.test.ts \
    tests/integration/prod-schema-clone.test.ts \
    tests/integration/g3-schema-forward-compatibility.test.ts \
    --config vitest.config.mjs --configLoader native --project=server
  npm run validate:schema-drift
  ```

- [ ] **Step 9: Merge and apply schema precursor**

  On `codex/pr-1385-schema-expand`, commit only precursor-owned files:

  ```bash
  git add \
    shared/schema/fund-scenario-calculation-commands.ts \
    shared/schema.ts \
    shared/schema/fund.ts \
    shared/schema/release-canary.ts \
    migrations/0053_g3_release_gate_hardening.sql \
    migrations/meta/_journal.json \
    scripts/prod-schema-manifests/30-g3-release-gate-hardening.json \
    tests/unit/schema/g3-foundations-schema.test.ts \
    tests/unit/migration-ledger.test.ts \
    tests/unit/prod-schema-manifest-coverage.test.ts \
    tests/integration/prod-schema-clone.test.ts \
    tests/integration/g3-schema-forward-compatibility.test.ts
  git commit -m "feat(schema): expand PR 1385 release gate schema"
  ```

  Open schema-only PR, pass protected checks, and merge through normal branch
  protection. Resolve exact resulting `main` SHA. Run
  `prod-schema-reconcile.yml` in apply mode against that exact default-branch
  SHA, then audit mode against same SHA. Require clean audit and retain redacted
  apply/audit run URLs plus migration ID; never retain connection data.

  Before merge, execute Task 11 Step 1 identity-variable provisioning slice for
  Vercel canonical hostname and four Railway IDs. Residue caps and reconciler
  secrets may remain pending until runtime release.

  Observe Railway GitHub integration after precursor merge. Require each exact
  protected service ID to auto-deploy the precursor `main` SHA and pass worker
  identity/health checks. This both proves selected auto-deploy model and proves
  old runtime code can start on new schema. If either service does not
  auto-deploy within ten minutes, stop: no manual trigger fallback and no
  runtime merge.

- [ ] **Step 10: Rebase runtime PR and re-prove schema state**

  Rebase PR #1385 onto precursor merge. Add command table to scenario-set route
  manifest in runtime commit. Rerun schema tests, clone/compatibility test,
  `npm run validate:schema-drift`, and production audit. Require migration
  `0053` already applied and audit clean before Task 6 runtime work proceeds.

---

## Task 6: Make Calculate-Reserve Durably Idempotent

**Files:**

- Create: `server/services/fund-scenario-calculation-command-service.ts`
- Modify: `server/services/fund-scenario-calc-queue-service.ts`
- Modify: `server/services/fund-scenario-calculation-run-service.ts`
- Modify: `server/routes/fund-scenario-sets.ts`
- Modify: `server/lib/database-backed-idempotency-routes.ts`
- Modify: `shared/routes/api-route-manifest.ts`
- Create: `client/src/lib/fund-scenario-reserve-command.ts`
- Modify: `client/src/lib/queryClient.ts`
- Modify: `client/src/pages/fund-scenario-workspace.tsx`
- Create:
  `tests/unit/services/fund-scenario-calculation-command-service.test.ts`
- Create:
  `tests/unit/routes/fund-scenario-sets-calculate-reserve.behavior.test.ts`
- Modify: `tests/unit/routes/fund-scenario-sets-route-contract.test.ts`
- Modify: `tests/unit/pages/fund-scenario-workspace.test.tsx`
- Create: `tests/integration/fund-scenario-calculation-command.test.ts`
- Modify: `tests/integration/fund-scenario-reserve-worker.test.ts`
- Modify:
  `tests/integration/scenarios/scenario-release-gate.integration.test.ts`

**Interfaces:**

```ts
type ReserveCalculationIntent = {
  idempotencyKey: string;
  body: { calculationMode: 'async_reserve_allocation' };
};

export function createReserveCalculationIntent(
  randomUUID?: () => string
): ReserveCalculationIntent;

export class ApiError extends Error {
  status: number;
  errorCode?: string;
  retryAfterMs?: number;
}
```

- [ ] **Step 1: Lock HTTP contract with failing route tests**

  For:

  ```http
  POST /api/funds/:fundId/scenario-sets/:scenarioSetId/calculate-reserve
  ```

  Require:

  | Condition                                                    | Status | Body                                                   |
  | ------------------------------------------------------------ | ------ | ------------------------------------------------------ |
  | missing `Idempotency-Key`                                    | 428    | `idempotency_key_required`                             |
  | present but blank or not RFC-token-safe                      | 400    | `validation_error`                                     |
  | key longer than 128                                          | 400    | `validation_error`                                     |
  | invalid request body                                         | 400    | existing validation body                               |
  | same key, same body, same lineage, completed receipt         | 202    | exact stored response                                  |
  | same key, changed body or current lineage                    | 422    | `idempotency_key_reused`                               |
  | same key while active owner lease remains after bounded wait | 409    | `idempotency_request_in_progress` and `Retry-After: 1` |
  | queue unavailable                                            | 503    | existing queue-unavailable contract                    |

  Do not add `replayed` to successful response. Replay must be byte-equivalent
  after JSON serialization.

  Reuse `parseInternalEconomicsIdempotencyKey` for its established 1-to-128
  ASCII RFC-token contract. Accept only standard `Idempotency-Key`; do not
  revive generic middleware alias headers or auto-generated keys.

- [ ] **Step 2: Migrate workspace and every existing caller**

  Before enabling server requirement, update every caller found by repository
  search. At reviewed head this includes:

  ```bash
  rg -n "calculate-reserve" client server tests shared \
    --glob '*.{ts,tsx,mjs}'
  ```

  - `client/src/pages/fund-scenario-workspace.tsx`;
  - `tests/integration/fund-scenario-reserve-worker.test.ts`;
  - `tests/integration/scenarios/scenario-release-gate.integration.test.ts`;
  - `tests/smoke/release-canaries.spec.ts` in Task 9.

  Create one `ReserveCalculationIntent` on initial user click using
  `crypto.randomUUID()`. Keep that same object until request reaches known
  success or is deterministically invalidated. Prevent double-click from
  creating a second intent while one is active.

  Send `Idempotency-Key` through `apiRequest` request headers. Extend `ApiError`
  to parse integer-seconds `Retry-After` into bounded `retryAfterMs`; malformed,
  negative, or above 30 seconds is ignored. UI state machine is exact:

  | Result                                       | UI behavior                                                                                     |
  | -------------------------------------------- | ----------------------------------------------------------------------------------------------- |
  | `202`                                        | clear intent, invalidate scenario/results queries, show queued state                            |
  | `409 idempotency_request_in_progress`        | retry same intent at most twice using bounded `Retry-After`; then show “still processing” Retry |
  | `422 idempotency_key_reused`                 | clear intent, invalidate/reload scenario inputs, show “inputs changed; review and submit again” |
  | `503 scenario_calculation_queue_unavailable` | show queue-unavailable Retry; retain same intent/key                                            |
  | `408`, `429`, network error, unknown status  | show retryable ambiguous-outcome error; retain same intent/key                                  |
  | allowlisted validation/auth/not-found `4xx`  | show server error; clear only when error contract proves failure occurred before command claim  |

  User-visible Retry reuses retained intent. Only a new explicit click after
  success, deterministic rejection, or “inputs changed” creates a new key.
  Mutation-level automatic retry remains disabled except the bounded 409 loop
  inside this focused command module.

  Tests use injected UUID and timer. Prove header presence, one key per intent,
  same key across 409/503/network retry, 422 invalidation/new explicit key,
  double-click suppression, visible error text, and success invalidation. Update
  all integration helpers to pass stable per-test keys; retain explicit
  missing-key test only where 428 is asserted.

- [ ] **Step 3: Define command envelope and hash**

  Use:

  ```ts
  {
    contractVersion: 'fund-scenario-reserve-calculation-command-v1',
    operation: 'calculate-reserve',
    fundId,
    scenarioSetId,
    request: parsedBody,
    inputLineage: {
      sourceConfigId,
      sourceConfigVersion,
      hashKind,
      inputHash,
      modelInputsAsOfDate,
      comparisonLineageVersion,
    },
  }
  ```

  Hash with existing `canonicalSha256`. A same key after lineage change must
  conflict, even when JSON body is unchanged.

- [ ] **Step 4: Implement claim/replay state machine**

  Export:

  ```ts
  export async function executeReserveCalculationCommand(input, options?);
  ```

  Use 30-second lease and version fence:

  1. Resolve current reserve calculation identity.
  2. Compute request hash.
  3. Insert pending command with null run/correlation identity, lease token, and
     lease expiry.
  4. On unique conflict, load row:
     - hash mismatch: throw 422;
     - completed: parse stored response with
       `FundScenarioReserveCalculationQueuedV1Schema` and return;
     - unexpired pending: poll receipt every 100 ms for at most 2 seconds, then
       409 if still pending;
     - failed or expired pending: compare-and-swap status/version/lease and
       become owner.
  5. Every owner mutation includes command ID, lease token, and expected
     version.

  Never trust response JSON without Zod parsing.

- [ ] **Step 5: Acquire canonical run identity**

  Refactor queue service so command owner:

  1. acquires or finds run using resolved input lineage;
  2. uses persisted `run.correlationId` and `run.jobId` as canonical response
     identity;
  3. atomically binds command `run_id` and canonical run `correlation_id` under
     lease;
  4. creates deterministic BullMQ job only when run is queued and job absent or
     failed;
  5. does not requeue running or completed run;
  6. uses persisted run correlation ID in job payload.

  Different idempotency key on same unchanged lineage may create new command
  receipt but must reuse same active or completed run identity.

- [ ] **Step 6: Make queue event exactly once per run**

  In one database transaction:

  1. update calculation run `queued_event_recorded_at` only when null;
  2. insert `calculation_queued` event only from successful marker update;
  3. include `run_id`, canonical correlation, job ID, input hash, hash kind,
     source config version, and variant count in change summary.

  Retries and different command keys must not add another queued event for same
  run.

- [ ] **Step 7: Finalize receipt after queue certainty**

  After deterministic queue add succeeds or existing job/run makes add
  unnecessary:

  - build queued response from persisted run;
  - parse response;
  - update command to `completed` with status 202 and exact JSON;
  - clear lease;
  - increment version.

  Reload completed receipt and pass both first response and every replay through
  `FundScenarioReserveCalculationQueuedV1Schema` before returning. This ensures
  initial 202 and replay serialize from same stored projection with no
  replay-only field or key-order drift.

  On ambiguous queue error:

  - do not create second nondeterministic job;
  - store `failure_code='QUEUE_ENQUEUE_UNCERTAIN'`;
  - move receipt to `failed` and clear lease;
  - leave deterministic run/job identity intact;
  - retry same key reacquires command, checks existing BullMQ job by ID, and
    either finalizes or re-adds same ID.

  Every caught owner-path error must release lease with compare-and-swap:

  - deterministic queue configuration outage stores `QUEUE_UNAVAILABLE` and
    preserves existing 503 route contract;
  - queue/event outcome that may have committed stores `QUEUE_ENQUEUE_UNCERTAIN`
    and recovers by deterministic job/run lookup;
  - other sanitized failures store `COMMAND_FAILED` and rethrow through existing
    error mapper;
  - raw exception text, Redis arguments, URLs, and credentials never enter
    receipt.

  Only process death may leave `pending`; lease expiry owns that recovery path.

  If run has since become terminal `failed`, acquire a new run for same lineage
  and update receipt `run_id` plus `correlation_id` under lease before retry.

- [ ] **Step 8: Bypass generic in-memory middleware**

  Add calculate-reserve path to `isDatabaseBackedIdempotencyRoute`. Unit test
  exact route, query-string variant, unrelated paths, and wrong methods.

- [ ] **Step 9: Write integration truth cases**

  With real PostgreSQL and Redis:

  - sequential same-key replay returns identical 202;
  - request receipt count is one;
  - active or completed run count is one;
  - BullMQ job ID is one;
  - `calculation_queued` event count is one;
  - correlation ID equals persisted run correlation;
  - same key/different body conflicts;
  - same key after input lineage change conflicts;
  - two concurrent same-key requests converge to identical 202 responses;
  - different keys/same lineage reuse run and do not duplicate event/job;
  - simulated failure after queue add but before receipt completion recovers on
    retry;
  - deterministic queue outage returns 503 with failed receipt and no active
    lease;
  - stored failure code is allowlisted and contains no raw exception text;
  - failed/expired lease can be reclaimed;
  - stale lease token cannot finalize command.

- [ ] **Step 10: Verify**

  ```bash
  TZ=UTC npx vitest run \
    tests/unit/services/fund-scenario-calculation-command-service.test.ts \
    tests/unit/routes/fund-scenario-sets-calculate-reserve.behavior.test.ts \
    tests/unit/routes/fund-scenario-sets-route-contract.test.ts \
    tests/integration/fund-scenario-calculation-command.test.ts \
    tests/integration/fund-scenario-reserve-worker.test.ts \
    tests/integration/scenarios/scenario-release-gate.integration.test.ts \
    --config vitest.config.mjs --configLoader native --project=server
  TZ=UTC npx vitest run \
    tests/unit/pages/fund-scenario-workspace.test.tsx \
    --config vitest.config.mjs --configLoader native --project=client
  TZ=UTC npm run phoenix:truth
  ```

- [ ] **Step 11: Commit**

  ```bash
  git add \
    server/services/fund-scenario-calculation-command-service.ts \
    server/services/fund-scenario-calc-queue-service.ts \
    server/services/fund-scenario-calculation-run-service.ts \
    server/routes/fund-scenario-sets.ts \
    server/lib/database-backed-idempotency-routes.ts \
    shared/routes/api-route-manifest.ts \
    client/src/lib/fund-scenario-reserve-command.ts \
    client/src/lib/queryClient.ts \
    client/src/pages/fund-scenario-workspace.tsx \
    tests/unit/services/fund-scenario-calculation-command-service.test.ts \
    tests/unit/routes/fund-scenario-sets-calculate-reserve.behavior.test.ts \
    tests/unit/routes/fund-scenario-sets-route-contract.test.ts \
    tests/unit/pages/fund-scenario-workspace.test.tsx \
    tests/integration/fund-scenario-calculation-command.test.ts \
    tests/integration/fund-scenario-reserve-worker.test.ts \
    tests/integration/scenarios/scenario-release-gate.integration.test.ts
  git commit -m "fix(scenarios): make reserve calculation command durably idempotent"
  ```

---

## Task 7: Count All Canary Residue and Validate Purged Rows

**Files:**

- Modify: `server/services/canary-residue-service.ts`
- Modify: `scripts/release/assert-canary-residue.mjs`
- Modify: `scripts/release/purge-canary-runs.mjs`
- Modify: `tests/unit/services/canary-residue-service.test.ts`
- Modify: `tests/unit/phase2a/fund-persistence-service.behavior.test.ts`
- Modify: `tests/unit/scripts/assert-canary-residue.test.mjs`
- Modify: `tests/unit/scripts/purge-canary-runs.test.ts`
- Modify: `tests/integration/release-canary-lifecycle.test.ts`
- Modify: `tests/integration/canary-exclusion-differential.test.ts`
- Create: `tests/integration/release-canary-residue-characterization.test.ts`

**Interfaces:**

```ts
export const RELEASE_CANARY_RESERVED_RESIDUE = Object.freeze({
  portfolioCompany: 1,
  fund: 1,
  fundConfig: 1,
  fundEvent: 4,
  notification: 0,
  grant: 1,
  calculation: 5,
  mutationReceipt: 2,
  scenario: 7,
  reporting: 11,
  total: 33,
});
```

- [ ] **Step 1: Define complete residue groups**

  Retain existing keys and add:

  ```ts
  type CanaryResidueCounts = {
    portfolioCompany: number;
    fund: number;
    fundConfig: number;
    fundEvent: number;
    notification: number;
    grant: number;
    calculation: number;
    mutationReceipt: number;
    scenario: number;
    reporting: number;
    total: number;
  };
  ```

  Group membership:

  | Group             | Tables                                                                                                                                                                                |
  | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `grant`           | `user_fund_grants`                                                                                                                                                                    |
  | `calculation`     | `calc_runs`, `fund_snapshots`                                                                                                                                                         |
  | `mutationReceipt` | `portfolio_company_update_receipts`, `fund_scenario_calculation_commands`                                                                                                             |
  | `scenario`        | `fund_scenario_sets`, `fund_scenario_variants`, `fund_scenario_set_events`, `fund_scenario_calculation_runs`                                                                          |
  | `reporting`       | `planning_fmv_override_requests`, `valuation_marks`, `reconciliation_runs`, `lp_metric_runs`, `evidence_records`, `narrative_runs`, `lp_report_packages`, `lp_report_package_exports` |

  Every count must be fund-scoped through direct `fund_id` or parent join and
  must include only `data_origin='release_canary'` funds.

- [ ] **Step 2: Add exact policy variables**

  - `RELEASE_CANARY_MAX_GRANT_RESIDUE`
  - `RELEASE_CANARY_MAX_CALCULATION_RESIDUE`
  - `RELEASE_CANARY_MAX_MUTATION_RECEIPT_RESIDUE`
  - `RELEASE_CANARY_MAX_SCENARIO_RESIDUE`
  - `RELEASE_CANARY_MAX_REPORTING_RESIDUE`

  Retain current five group caps, total cap, and TTL. Require configured total
  cap to equal sum of ten group caps; inconsistent policy is invalid
  configuration, not a warning.

  Freeze successful-run reservation contract:

  ```ts
  export const RELEASE_CANARY_RESERVED_RESIDUE = Object.freeze({
    portfolioCompany: 1,
    fund: 1,
    fundConfig: 1,
    fundEvent: 4,
    notification: 0,
    grant: 1,
    calculation: 5,
    mutationReceipt: 2,
    scenario: 7,
    reporting: 11,
    total: 33,
  });
  ```

  This vector is not an estimate. It represents one company; one
  fund/config/grant; four fund events (`FUND_CREATED`, `DRAFT_SAVED`,
  `PUBLISHED`, `CALC_TRIGGERED`); one `calc_runs` row plus up to three base and
  one scenario `fund_snapshots` rows; two durable mutation receipts; one set,
  one variant, four set events, and one scenario calculation run; one
  planning-FMV request and approved mark; and nine later report rows. Replays
  add zero.

  Do not ratify constants from prose alone. Step 7 full-path characterization
  and preview database measurement must both equal this vector. Any drift
  changes code, policy table, and approval record together before release.

- [ ] **Step 3: Reserve full run and reject concurrent active run**

  Fund creation transaction immediately creates:

  - one run;
  - one fund;
  - one draft config;
  - one fund event;
  - one creator grant.

  Under existing `release_canary_creation` advisory lock:

  1. reject creation when any run is `created` or `running`; an expired
     timestamp on a nonterminal run is a TTL failure requiring reconciliation,
     not a bypass;
  2. add full `RELEASE_CANARY_RESERVED_RESIDUE` vector to current actual counts;
  3. require every projected group and total remain within configured cap;
  4. only then insert run/fund/config/event/grant transaction.

  Do not reserve only immediate four rows. One-active-run rule makes in-memory
  reservation safe across later writes without a second reservation table.

  Run row itself is lifecycle metadata, not fund residue and remains governed by
  status and TTL checks.

- [ ] **Step 4: Make service, assertion, and purge share group semantics**

  Avoid three divergent hand-maintained SQL definitions. Export a query
  fragment/builder or shared table-group descriptor from
  `canary-residue-service.ts` and consume it from TypeScript service plus
  `tsx/esm/api` in Node scripts.

  If raw SQL must remain in purge script, add parity test comparing all group
  names/table tokens across service, assertion, and purge implementations.

- [ ] **Step 5: Validate purged rows before exclusion**

  In `normalizeCanaryRow`:

  1. validate SHA;
  2. validate status/purge marker coupling;
  3. validate `createdAt`, `expiresAt`, and optional `purgedAt`;
  4. validate every residue field as safe nonnegative integer;
  5. validate total equals all group fields;
  6. only then mark row purged and exclude from caps, active-run checks, and
     TTL.

  Replace prior permissive test with:

  - valid purged row excluded;
  - malformed `createdAt` rejected;
  - malformed `expiresAt` rejected;
  - malformed `purgedAt` rejected;
  - null, string, boolean, array, object, negative, or unsafe integer in each
    count rejected;
  - inconsistent total rejected.

- [ ] **Step 6: Expand purge dry-run and reconciliation**

  `buildPurgePlan` and expired-run reconciliation must expose all groups.
  Dynamic FK deletion remains authoritative cleanup mechanism; group counts are
  evidence and caps, not deletion allowlist.

  Before marking purged or deleting:

  - reconcile all group counts per run;
  - write exact total;
  - preserve fail-closed production-origin predicate;
  - require no unaccounted direct child table in integration test.

- [ ] **Step 7: Characterize exact deployed path with Testcontainers**

  Build one integration harness around same application route/service sequence
  as production Playwright canary; do not hand-insert a smaller synthetic
  fixture. Execute fund creation, draft save, publish, portfolio
  mutation/replay/stale rejection, base calculation, scenario
  creation/calculation/replay, planning FMV override/replay, actuals read,
  reconciliation, metric/evidence lifecycle, four narratives, package assembly,
  and stored JSON export/replay.

  At each named phase, query every table through authoritative residue service
  and record monotonic group vector. Final successful path must equal exactly:

  ```text
  1 + 1 + 1 + 4 + 0 + 1 + 5 + 2 + 7 + 11 = 33
  ```

  Also inject failure after each mutation boundary and assert each partial
  vector is component-wise less than or equal to reserved success vector. A
  failure path that writes more than successful reservation blocks release and
  requires vector redesign; do not hide it under total cap.

  Assert:

  - service count equals direct database truth for all ten groups at every
    phase;
  - named fund-event sequence contains exactly create, draft-save, publish, and
    calculation-trigger rows expected by deployed path;
  - reservation vector total equals sum of group maxima;
  - preflight rejects when any active run exists, including one past expiry;
  - preflight accepts after same run becomes terminal when full vector fits;
  - each group fails independently when current plus reserved maximum exceeds
    cap;
  - run reconciliation stores all groups;
  - total equals group sum;
  - ordinary production fund rows are excluded;
  - purge plan reports same values;
  - purge removes all direct fund children and run;
  - malformed stored run cannot pass assertion.

  Run same characterization against schema clone. During staged production
  deployment, execute one disposable canary and compare measured vector to
  fixture before Production approval. Release owner records ratification of
  exact `33` vector in workflow summary/manifest; mismatch fails before
  promotion.

- [ ] **Step 8: Verify**

  ```bash
  TZ=UTC npx vitest run \
    tests/unit/services/canary-residue-service.test.ts \
    tests/unit/phase2a/fund-persistence-service.behavior.test.ts \
    tests/unit/scripts/assert-canary-residue.test.mjs \
    tests/unit/scripts/purge-canary-runs.test.ts \
    tests/integration/release-canary-lifecycle.test.ts \
    tests/integration/canary-exclusion-differential.test.ts \
    tests/integration/release-canary-residue-characterization.test.ts \
    --config vitest.config.mjs --configLoader native --project=server
  ```

- [ ] **Step 9: Commit**

  ```bash
  git add \
    server/services/canary-residue-service.ts \
    scripts/release/assert-canary-residue.mjs \
    scripts/release/purge-canary-runs.mjs \
    tests/unit/services/canary-residue-service.test.ts \
    tests/unit/phase2a/fund-persistence-service.behavior.test.ts \
    tests/unit/scripts/assert-canary-residue.test.mjs \
    tests/unit/scripts/purge-canary-runs.test.ts \
    tests/integration/release-canary-lifecycle.test.ts \
    tests/integration/canary-exclusion-differential.test.ts \
    tests/integration/release-canary-residue-characterization.test.ts
  git commit -m "fix(release): account for complete canary residue"
  ```

---

## Task 8: Bind Canary Completion and Recovery to Exact Workflow Execution

**Files:**

- Modify: `tests/smoke/release-canaries.spec.ts`
- Modify: `server/routes/funds.ts`
- Modify: `server/services/fund-persistence-service.ts`
- Modify: `scripts/release/assert-canary-residue.mjs`
- Create: `scripts/release/recover-canary-run.mjs`
- Create: `scripts/release/capture-release-recovery-context.mjs`
- Create: `.github/workflows/capture-release-baseline.yml`
- Modify: `scripts/deploy-production.ps1`
- Modify: `server/services/canary-residue-service.ts`
- Modify: `.github/workflows/release-production.yml`
- Modify: `tests/unit/scripts/assert-canary-residue.test.mjs`
- Create: `tests/unit/scripts/recover-canary-run.test.mjs`
- Create: `tests/unit/scripts/capture-release-recovery-context.test.mjs`
- Modify: `tests/unit/phase2a/fund-persistence-service.behavior.test.ts`
- Modify: `tests/integration/release-canary-lifecycle.test.ts`
- Modify: `tests/regressions/ci-fail-closed.test.ts`
- Modify: `scripts/DEPLOYMENT_AUTOMATION_README.md`
- Modify: `docs/runbooks/rollback.md`

**Interfaces:**

```text
Release-Canary-Workflow-Run-Id: <decimal GitHub run ID>
Release-Canary-Workflow-Run-Attempt: <positive integer>
Release-Canary-Run-Id: <UUID response header>
```

```ts
type ReleaseCanaryRecoveryHandleV1 = {
  schemaVersion: 'release-canary-recovery-handle-v1';
  githubRunId: string;
  githubRunAttempt: number;
  fundId: number;
  canaryRunId: string;
  releaseSha: string;
};
```

- [ ] **Step 1: Persist exact current execution handle from Playwright**

  Require `RELEASE_CANARY_RESULT_PATH` whenever `PRODUCTION_URL` is set.

  Send exact `GITHUB_RUN_ID` and `GITHUB_RUN_ATTEMPT` through two custom headers
  on fund creation. Server behavior:

  1. paired headers are accepted only for authenticated release-canary
     principal;
  2. release-canary principal in production requires both headers; one/missing
     or malformed pair fails before database write;
  3. ordinary principal supplying either header receives
     `403 release_canary_execution_identity_forbidden`;
  4. persistence inserts run with exact pair under partial unique index;
  5. create response body remains unchanged and response adds
     `Release-Canary-Run-Id` only for release-canary creation.

  Immediately after successful fund creation response and before finalize:

  1. validate positive fund ID, response run UUID, exact workflow run/attempt,
     and lowercase 40-hex expected SHA;
  2. construct `ReleaseCanaryRecoveryHandleV1`;
  3. write temporary JSON mode `0600`, atomically rename to result path, and
     print one compact `RELEASE_CANARY_RECOVERY_V1` line containing same
     non-secret handle so cancellation logs remain actionable;
  4. never include user, cookie, CSRF token, credentials, evidence, or report
     data.

  Use `node:fs/promises` and `node:path`.

- [ ] **Step 2: Add exact current-execution query**

  Add CLI arguments:

  ```text
  --expected-fund-id "$RELEASE_CANARY_FUND_ID"
  --expected-canary-run-id "$RELEASE_CANARY_RUN_ID"
  --github-run-id "$GITHUB_RUN_ID"
  --github-run-attempt "$GITHUB_RUN_ATTEMPT"
  --started-at "$CANARY_STARTED_AT"
  --max-clock-skew-seconds 300
  --complete-current-run
  --fail-current-run
  ```

  Completion/failure flags are mutually exclusive.

  Query exact fund ID and join:

  - `funds`;
  - `release_canary_runs` through `funds.canary_run_id`;
  - `users` through run principal;
  - `user_fund_grants` for same principal/fund.

  Require exactly one row and prove:

  - fund ID equals input;
  - fund origin is `release_canary`;
  - fund `canary_run_id` equals run ID;
  - run ID equals exact input canary-run ID;
  - run workflow ID and attempt equal exact current GitHub execution;
  - run release SHA equals expected SHA;
  - run creation is no earlier than workflow `started-at` minus configured
    five-minute clock skew and no later than verifier time plus same skew;
  - principal has `is_release_canary_principal=true`;
  - same principal has creator grant for fund;
  - run source status is `created` or `running` before transition;
  - transition updates only exact run with expected version.

  After transition, reload exact row and require requested terminal status. Fund
  ID remains primary selector; timestamp window is corroborating evidence and
  must never become a latest-run search.

- [ ] **Step 3: Separate exact-run proof from global cap proof**

  CLI order:

  1. validate arguments and policy;
  2. prove exact current execution;
  3. transition exact run only;
  4. require each exact-run residue count is no greater than
     `RELEASE_CANARY_RESERVED_RESIDUE` and its total equals group sum;
  5. query every run for global cap, TTL, and active-state policy;
  6. require current exact run terminal;
  7. produce summary without sensitive rows.

  Remove production use of `--reconcile-expected-sha`. A SHA-wide update is
  forbidden.

- [ ] **Step 4: Add exact abandoned-run recovery CLI**

  CLI supports two explicit modes:

  ```bash
  node scripts/release/recover-canary-run.mjs resolve \
    --github-run-id "$RUN_ID" \
    --github-run-attempt "$RUN_ATTEMPT" \
    --expected-sha "$EXPECTED_SHA"

  node scripts/release/recover-canary-run.mjs mark-failed \
    --github-run-id "$RUN_ID" \
    --github-run-attempt "$RUN_ATTEMPT" \
    --fund-id "$FUND_ID" \
    --canary-run-id "$CANARY_RUN_ID" \
    --expected-sha "$EXPECTED_SHA"
  ```

  `resolve` queries unique workflow execution identity and outputs only exact
  recovery-handle JSON. It is allowed when hard cancellation occurred before
  result-file upload; it is not a latest-run search. `mark-failed` joins
  workflow run/attempt, fund ID, canary-run ID, SHA, release-canary principal,
  creator grant, and fund origin. It performs version-fenced
  `created|running -> failed`. Already-failed is verified idempotent success;
  already-completed is verified no-op with distinct status. CLI can never mark
  completed, purge, or select by SHA/time alone.

  Tests cover wrong value in every identity component, duplicate/corrupt join,
  stale version, idempotent repeat, completed no-op, and absence of raw database
  errors or credentials.

- [ ] **Step 5: Land read-only pre-merge baseline capture**

  Railway auto-deploy begins when runtime PR merges, before post-merge release
  workflow can capture old deployment IDs. Therefore add a separate read-only
  workflow, `capture-release-baseline.yml`, and land it on `main` in a small
  scripts/workflow-only precursor before runtime PR #1385 merges. This workflow
  is not a production mutation dispatcher and regression tests forbid provider
  mutation commands, Vercel deploy/promote/alias calls, and Railway deployment
  mutations.

  Dispatch inputs are exact:

  ```yaml
  baseline_main_sha: <current 40-hex main SHA>
  planned_pr_head_sha: <final 40-hex PR #1385 head>
  plan_sha256: <approved 64-hex plan digest>
  ```

  Workflow uses Production environment read credentials, references live `main`
  and PR #1385, verifies approved plan exists at planned head with exact hash,
  then resolves and strictly validates:

  - current canonical Vercel deployment ID, project ID, canonical hostname, and
    source SHA;
  - Railway project/environment IDs and exact protected service/deployment IDs
    plus source SHAs;
  - baseline `main`, planned PR head, plan digest, workflow run ID/attempt, and
    capture timestamp.

  `capture-release-recovery-context.mjs` writes normalized
  `release-recovery-context-v1.json` containing these fields only. Reject
  response bodies, URLs with credentials/query secrets, unknown fields, and
  secret-shaped keys/values. Upload immutable sanitized artifact with fixed
  `retention-days: 30` before runtime merge. File mode `0600`; workflow deletes
  local copy under `if: always()`. Capture failure blocks merge.

  Implement these capture-only files on branch `codex/pr-1385-baseline-capture`,
  created from updated `main`. Cherry-pick Task 3 read-only provider primitive
  commit, add capture files, commit as
  `feat(release): capture immutable pre-merge provider baseline`, pass protected
  checks, and merge before final PR #1385 rebase. Capture precursor owns only:

  - `scripts/release/collect-provider-evidence.mjs`;
  - `scripts/release/provider-evidence-contract.mjs`;
  - `tests/unit/scripts/collect-provider-evidence.test.mjs`;
  - `tests/unit/scripts/provider-evidence-contract.test.mjs`;
  - `.github/workflows/capture-release-baseline.yml`;
  - `scripts/release/capture-release-recovery-context.mjs`;
  - `tests/unit/scripts/capture-release-recovery-context.test.mjs`;
  - capture-only assertions in `tests/regressions/ci-fail-closed.test.ts`.

  Rebase runtime PR after precursor merge; do not retain duplicate file-add
  commit. Dispatcher integration and runtime workflow consumption remain in PR
  #1385.

  Extend sole mutation dispatcher and `release-production.yml` inputs with exact
  `baseline_run_id` and `baseline_manifest_sha256`. PowerShell exposes mandatory
  `-BaselineRunId` matching `^[1-9][0-9]{0,31}$` and `-BaselineManifestSha256`
  matching `^[a-f0-9]{64}$`; both enter compact stdin dispatch JSON, never
  heuristic lookup.

  Post-merge release downloads fixed-name `release-baseline-v1` artifact from
  exact successful `capture-release-baseline.yml` run, rejects wrong workflow,
  repository, actor/owner, attempt, artifact count/name, or edited plan binding,
  verifies artifact hash, proves baseline `main` is ancestor of release SHA,
  GitHub PR head equals planned head, PR merge commit is release SHA, and plan
  digest still matches. Never select latest artifact/run.

  Schema precursor and baseline-tool precursor contain no worker behavior
  change; old-code/new-schema compatibility covers their Railway auto-deploys.
  Baseline capture immediately before runtime merge is rollback target for first
  behavior-changing provider mutation. Context supports diagnosis/forward
  revert; it does not authorize Vercel alias-only rollback.

- [ ] **Step 6: Wire workflow start, result, and finalization**

  Before Playwright:

  - record `CANARY_STARTED_AT` in UTC;
  - set result path under `RUNNER_TEMP`;
  - delete any preexisting file;
  - expose both as step outputs/environment.

  Run Playwright with `continue-on-error: true` so finalizer executes.

  Finalizer with `if: always()`:

  - validate result file shape;
  - require handle workflow run/attempt/SHA equal current environment;
  - choose `--complete-current-run` only when Playwright outcome is success;
  - choose `--fail-current-run` when Playwright failed after result file
    creation;
  - run exact transition and global residue assertion;
  - fail job after finalization when Playwright outcome was failure.

  If Playwright fails before result file exists, fail closed. Do not search for
  “latest” run to make release pass.

  If hard cancellation prevents finalizer, operator uses logged handle or exact
  `resolve` command, then `mark-failed`. Rollback runbook includes
  copy-pasteable commands and requires post-recovery global residue assertion.
  Workflow emits sanitized outcome/recovery manifest under `if: always()`
  whenever runner is still alive; prechange recovery-context artifact remains
  independently stored.

- [ ] **Step 7: Add masking and cancellation regressions**

  Integration scenario:

  1. create old completed canary run for expected SHA;
  2. create ordinary production-origin fund during current window;
  3. pass ordinary fund ID as expected current fund;
  4. assert exact proof fails even though old same-SHA run is completed.

  Also reject:

  - wrong SHA;
  - run older than allowed lower skew bound;
  - run later than allowed upper skew bound;
  - both exact clock-skew boundaries remain accepted;
  - principal flag false;
  - missing grant;
  - run/fund link mismatch;
  - duplicate join;
  - stale version;
  - terminal status mismatch;
  - same workflow run with different attempt;
  - correct SHA/fund but wrong workflow run or canary run;
  - cancellation after fund creation but before Playwright result upload can be
    resolved by exact workflow run/attempt and failed by full handle;
  - no finalizer path selects latest run or updates every run sharing SHA.

- [ ] **Step 8: Verify**

  ```bash
  TZ=UTC npx vitest run \
    tests/unit/scripts/assert-canary-residue.test.mjs \
    tests/unit/scripts/recover-canary-run.test.mjs \
    tests/unit/scripts/capture-release-recovery-context.test.mjs \
    tests/unit/phase2a/fund-persistence-service.behavior.test.ts \
    tests/integration/release-canary-lifecycle.test.ts \
    tests/regressions/ci-fail-closed.test.ts \
    --config vitest.config.mjs --configLoader native --project=server
  ```

- [ ] **Step 9: Commit**

  ```bash
  git add \
    tests/smoke/release-canaries.spec.ts \
    server/routes/funds.ts \
    server/services/fund-persistence-service.ts \
    scripts/release/assert-canary-residue.mjs \
    scripts/release/recover-canary-run.mjs \
    scripts/deploy-production.ps1 \
    server/services/canary-residue-service.ts \
    .github/workflows/release-production.yml \
    tests/unit/scripts/assert-canary-residue.test.mjs \
    tests/unit/scripts/recover-canary-run.test.mjs \
    tests/unit/phase2a/fund-persistence-service.behavior.test.ts \
    tests/integration/release-canary-lifecycle.test.ts \
    tests/regressions/ci-fail-closed.test.ts \
    scripts/DEPLOYMENT_AUTOMATION_README.md \
    docs/runbooks/rollback.md
  git commit -m "fix(release): bind canary proof to current execution"
  ```

---

## Task 9: Strengthen Portfolio, Results, and Reserve Canaries

**Files:**

- Modify: `tests/smoke/release-canaries.spec.ts`
- Modify: `tests/unit/contract/fund-results-route.test.ts`
- Modify: `tests/integration/fund-scenario-reserve-worker.test.ts`
- Modify:
  `tests/integration/scenarios/scenario-release-gate.integration.test.ts`
- Modify: `tests/regressions/ci-fail-closed.test.ts`

- [ ] **Step 1: Add portfolio idempotent replay**

  Store patch idempotency key and request body.

  After first 200:

  1. send identical PATCH with same key/body;
  2. require 200;
  3. require replay body deep-equals first body;
  4. GET company;
  5. require description and row version unchanged from first response.

- [ ] **Step 2: Add stale optimistic-lock rejection**

  Send same semantic patch with:

  - new idempotency key;
  - original stale `expectedVersion`;
  - distinct description value.

  Require:

  - status 409;
  - JSON error code `VERSION_CONFLICT`;
  - subsequent GET still matches successful replay state exactly.

  This closes both unresolved review threads.

- [ ] **Step 3: Parse authoritative results contract**

  Import `FundResultsReadV1Schema` from owning shared contract. Replace ad hoc
  object checks with schema parse.

  Require:

  - top-level `fundId` and `status='ready'`;
  - lifecycle calculation state has status, positive config version, run ID,
    UUID correlation ID, dispatch state, expected snapshot types, available
    snapshot types, ISO `lastCalculatedAt`, and `legacyEvidence=false`;
  - reserve and pacing are `available`;
  - both sources are `fund_snapshots`;
  - both `legacyEvidence=false`;
  - typed payloads contain contract-required fields.

  Do not invent snapshot ID/hash absent from response contract.

- [ ] **Step 4: Compare stable reload evidence**

  Capture parsed canary 3 response. Canary 4 reloads same route and requires
  equality for:

  - fund ID/status;
  - full lifecycle calculation state;
  - reserve section;
  - pacing section.

  If response contains intentionally volatile field, compare explicit stable
  projection and document field exclusion in test.

- [ ] **Step 5: Replay reserve calculation command**

  Use one idempotency key:

  1. first `calculate-reserve` sends standard `Idempotency-Key` and returns 202;
  2. identical second POST sends same header/body and returns 202;
  3. response bodies deep-equal;
  4. job ID and correlation ID equal;
  5. poll status once using canonical correlation;
  6. require durable success and same job/correlation/snapshot;
  7. GET status again and require stable terminal evidence.

- [ ] **Step 6: Prove worker retry, terminal failure, and poll timeout**

  Add deterministic integration truth cases without faulting production:

  - one injected transient worker failure retries the same deterministic BullMQ
    job ID and persisted correlation ID, then succeeds with one command receipt,
    one calculation run, one queued event, and one snapshot set;
  - one injected permanent worker failure exhausts configured attempts and
    persists terminal `failed` status with allowlisted sanitized failure code,
    no snapshot, no active lease, and no duplicate receipt/job/event;
  - replaying original command key after terminal worker failure returns exact
    stored 202 queue acknowledgement and does not manufacture another run; a new
    explicit intent follows Task 6's failed-run recovery contract;
  - bounded status polling timeout returns typed
    `RELEASE_CANARY_WORKER_TIMEOUT`, preserves exact run/correlation identity,
    and cannot substitute an older successful same-SHA run;
  - workflow finalizer classifies permanent failure or timeout as current-run
    failure and terminalizes only exact workflow attempt/fund/canary-run tuple;
  - test clocks and worker hooks are injected; production code gains no
    force-failure header, query flag, or bypass.

  Static regressions require worker poll deadline to fit inside Playwright step
  budget with finalizer margin and forbid a latest-run/SHA-wide success
  fallback.

- [ ] **Step 7: Add collection-time route guards**

  Require route manifest entries for:

  - fund results;
  - portfolio companies;
  - fund scenario sets.

  Keep exact mount and probe checks so SPA rewrites or remounts fail before
  canaries run.

- [ ] **Step 8: Verify**

  ```bash
  TZ=UTC npx playwright test tests/smoke/release-canaries.spec.ts \
    --project=production --list
  TZ=UTC npx vitest run \
    tests/unit/contract/fund-results-route.test.ts \
    tests/integration/fund-scenario-reserve-worker.test.ts \
    tests/integration/scenarios/scenario-release-gate.integration.test.ts \
    tests/regressions/ci-fail-closed.test.ts \
    --config vitest.config.mjs --configLoader native --project=server
  ```

  Local `--list` must collect successfully without deployed target; deployed
  execution remains workflow-only.

- [ ] **Step 9: Commit**

  ```bash
  git add \
    tests/smoke/release-canaries.spec.ts \
    tests/unit/contract/fund-results-route.test.ts \
    tests/integration/fund-scenario-reserve-worker.test.ts \
    tests/integration/scenarios/scenario-release-gate.integration.test.ts \
    tests/regressions/ci-fail-closed.test.ts
  git commit -m "test(release): prove replay locking and authoritative results"
  ```

---

## Task 10: Add Financial-Truth H9 Stored-JSON Report Canary

**Files:**

- Modify: `tests/smoke/release-canaries.spec.ts`
- Create: `shared/lib/canonical-json.ts`
- Modify: `server/services/lp-reporting/report-package-json-export-service.ts`
- Create: `tests/unit/lib/canonical-json.test.ts`
- Modify: `.github/workflows/release-production.yml`
- Modify: `tests/regressions/ci-fail-closed.test.ts`
- Modify: `scripts/DEPLOYMENT_AUTOMATION_README.md`
- Inspect only:
  `shared/contracts/lp-reporting/planning-fmv-override.contract.ts`
- Inspect only:
  `shared/contracts/fund-actuals/fund-company-actuals-fact.contract.ts`
- Inspect only: `shared/routes/api-route-manifest.ts`

- [ ] **Step 1: Add separate admin automation credentials**

  Require when `PRODUCTION_URL` is set:

  - `CANARY_RECONCILER_USERNAME`;
  - `CANARY_RECONCILER_PASSWORD`.

  Refactor `ReleaseCanaryClient.login` to accept explicit username/password.
  Maintain:

  - partner client authenticated as release-canary principal;
  - admin client uses dedicated nonhuman account, distinct from release-canary
    principal and all human accounts;
  - admin account has `role='admin'` and `is_release_canary_principal=false`;
  - admin client is authenticated only around planning-FMV creation/replay and
    reconciliation calls;
  - separate cookie jars and CSRF tokens;
  - both contexts closed in `afterAll`;
  - no credential values in logs/errors.

  Do not change route authorization or user roles.

- [ ] **Step 2: Add route-manifest-backed report paths**

  Require manifest entries:

  - `fund-moic`;
  - `lp-reporting-metric-runs`;
  - `planning-fmv-overrides`;
  - `fund-actuals`.

  Add paths:

  - `POST /api/funds/:fundId/planning/fmv-overrides`;
  - `GET /api/funds/:fundId/actuals/facts`;
  - `POST /api/admin/funds/:fundId/moic/reconciliations`;
  - metric dry-run and commit;
  - metric evidence;
  - metric approve and lock;
  - narrative create, edit, review, and approve;
  - report package assemble;
  - stored JSON create;
  - stored JSON artifact GET.

  Do not call `/api/calculations/export-csv` and do not add unauthenticated
  export route.

- [ ] **Step 3: Seed and prove one nonzero financial fact**

  Run report canary after:

  - fund finalization;
  - portfolio create/update/replay/stale rejection;
  - authoritative results;
  - scenario calculation completion.

  Derive one pinned `asOfDate` from `CANARY_STARTED_AT`. Admin client creates
  one approved planning FMV mark for exact canary company with standard
  `Idempotency-Key` and exact body:

  ```ts
  {
    companyId,
    markDate: asOfDate,
    asOfDate,
    fairValue: '1250000.000000',
    currency: 'USD',
    confidenceLevel: 'medium',
    reason: 'Release canary financial-truth basis',
    methodologyNotes: 'Deterministic approved planning FMV for release canary',
    source: {},
  }
  ```

  Parse `PlanningFmvOverrideCreateResponseSchema`. Replay identical key/body;
  require same request ID and valuation-mark ID, first response
  `replayed=false`, second `replayed=true`, approved status, nonzero value, and
  no additive residue.

  Partner client calls
  `GET /api/funds/:fundId/actuals/facts?asOfDate=<asOfDate>` and parses
  `FundCompanyActualsFactsResponseSchema`. Require exactly one fact for canary
  company, `approvedPlanningFmvMarkId` equals created mark,
  `planningFmvStatus='active'`, `latestPlanningFmvValue='1250000.000000'`, USD
  `currencyStatus='base_currency'`, and nonempty provenance/input hash. Empty
  facts or a fact unbound to exact mark fails H9 canary.

  Then admin client sends one MOIC reconciliation POST with unique idempotency
  key for exact in-memory canary fund ID. Require 201 and valid run
  ID/timestamp. Stop using admin client immediately afterward.

  No later canary step may mutate portfolio, rounds, valuation marks, or MOIC
  inputs. Admin client may call only planning-FMV POST/replay and
  reconciliation.

- [ ] **Step 4: Execute partner-owned report lifecycle**

  Use current workflow run ID plus operation name for every request-body
  idempotency key exposed by existing contracts. For metric commit, narrative
  create, package assemble, and stored export, preserve existing natural-key or
  preview-hash replay contracts and assert replay returns same row. Send
  returned row version through each lifecycle route's required body field. Do
  not invent headers or change report API contracts solely for canary use.

  Derive `asOfDate` from `CANARY_STARTED_AT` so retries within one workflow
  attempt use one pinned date. Use exact request:

  ```ts
  {
    asOfDate,
    runType: 'quarterly_report',
    perspective: 'lp_net',
    sourceEventIds: [],
    sourceMarkIds: [planningMarkId],
    sourceMarkSelection: 'explicit',
  }
  ```

  Sequence:

  1. dry-run; parse `MetricRunDryRunResponseSchema`; require preview financial
     sections contain canary company/mark-derived, nonzero content rather than
     actionability metadata alone;
  2. commit with returned `previewHash`; parse response;
  3. create one `internal`, non-redaction-required metric evidence record;
  4. approve using current version;
  5. lock using returned version;
  6. create narratives `no_dpi`, `methodology`, `portfolio_update`, and
     `risk_disclosure`;
  7. edit each with nonempty deterministic canary text;
  8. review each using current version;
  9. approve each using returned version;
  10. assemble with locked metric-run version and exactly four approved
      narrative IDs/versions;
  11. require package H9 metadata `actionabilityStatus='actionable'` and 64-hex
      fingerprint;
  12. POST stored JSON export;
  13. GET stored JSON artifact.

  Immediately replay metric commit, evidence create, each narrative create,
  package assemble, and stored JSON export with identical contract inputs before
  advancing that object's lifecycle. Require same IDs, same persisted versions,
  and no additive residue from replay.

  Parse every response with existing shared contract schema. Do not hand-roll
  success shapes.

- [ ] **Step 5: Extract pure canonical JSON hash helper**

  Move `canonicalJson` and `sha256CanonicalJson` unchanged from
  `report-package-json-export-service.ts` to `shared/lib/canonical-json.ts`.
  Keep named re-exports from original service so existing imports do not break.

  Characterization tests must prove:

  - prior key ordering and SHA-256 vectors remain identical;
  - arrays and primitives remain supported;
  - non-finite numbers, undefined fields, and non-plain objects remain rejected;
  - importing shared helper performs no database, environment, network, or file
    access.

  Smoke test imports only shared helper. Do not import server service graph.

- [ ] **Step 6: Validate authoritative artifact**

  Parse `ReportPackageJsonStoredArtifactResponseSchema` and require:

  - record fund ID, metric run ID, and report package ID match current canary;
  - format `json`, status `ready`, hash algorithm `sha256`;
  - positive artifact size;
  - record content hash equals export content hash;
  - recomputed `sha256CanonicalJson` over exact
    `{ exportVersion, format, source, renderModel }` artifact equals content
    hash;
  - source H9 stamp is actionable and fingerprint is 64 lowercase hex;
  - report package source status is assembled;
  - render model fund ID and metric run ID match;
  - metric sections are nonempty and contain meaningful nonzero financial
    content attributable to exact source mark;
  - narrative sections contain exactly four approved narrative types and IDs;
  - evidence references include created evidence record;
  - stored artifact GET succeeds without latest-database substitution.

  Import `sha256CanonicalJson` from new pure shared module; do not duplicate
  canonicalization logic.

  Do not create CSV in release canary. One authoritative stored JSON artifact is
  sufficient.

- [ ] **Step 7: Add workflow credential guards**

  `staged-smoke` must require both reconciler secrets before any mutation canary
  starts. Tests assert:

  - missing either secret cannot skip report canary;
  - reconciler username must differ from release-canary username;
  - secrets are present only in release-canary step;
  - secrets are not forwarded to provider scripts, logs, summaries, artifacts,
    or post-promotion smoke;
  - admin client calls only planning-FMV create/replay and reconciliation
    routes;
  - metric request includes exact approved mark ID and never uses empty
    `sourceMarkIds` for this canary;
  - actuals facts must be nonempty before metric dry-run can begin.

- [ ] **Step 8: Verify**

  ```bash
  TZ=UTC npx playwright test tests/smoke/release-canaries.spec.ts \
    --project=production --list
  TZ=UTC npx vitest run \
    tests/unit/lib/canonical-json.test.ts \
    tests/unit/services/lp-reporting/report-package-json-export-service.test.ts \
    tests/unit/services/lp-reporting/h9-export-gate.test.ts \
    tests/unit/services/lp-reporting/report-package-json-stored-export-service.test.ts \
    tests/regressions/ci-fail-closed.test.ts \
    --config vitest.config.mjs --configLoader native --project=server
  ```

- [ ] **Step 9: Commit**

  ```bash
  git add \
    tests/smoke/release-canaries.spec.ts \
    shared/lib/canonical-json.ts \
    server/services/lp-reporting/report-package-json-export-service.ts \
    tests/unit/lib/canonical-json.test.ts \
    .github/workflows/release-production.yml \
    tests/regressions/ci-fail-closed.test.ts \
    scripts/DEPLOYMENT_AUTOMATION_README.md
  git commit -m "test(release): require H9-qualified stored JSON canary"
  ```

---

## Task 11: Integrate Production Policy and Verify Entire PR

**Files:**

- Modify: `.github/workflows/release-proof.yml`
- Modify: `.github/workflows/release-production.yml`
- Create: `shared/contracts/release-proof-certification-v1.contract.ts`
- Create: `shared/contracts/release-evidence-manifest-v1.contract.ts`
- Create: `scripts/release/build-release-proof-certification.ts`
- Create: `scripts/release/build-release-evidence-manifest.ts`
- Create: `tests/unit/contracts/release-proof-certification-v1.contract.test.ts`
- Create: `tests/unit/contracts/release-evidence-manifest-v1.contract.test.ts`
- Create: `tests/unit/scripts/build-release-proof-certification.test.ts`
- Create: `tests/unit/scripts/build-release-evidence-manifest.test.ts`
- Modify: `CHANGELOG.md`
- Modify: PR #1385 description only after code verification
- Regenerate if route/schema inputs changed:
  `docs/_generated/router-index.json`, `docs/_generated/router-fast.json`,
  `docs/_generated/staleness-report.md`

- [ ] **Step 1: Provision protected Production values before first new-code
      release**

  GitHub Production variables:

  - `VERCEL_PRODUCTION_HOSTNAME`;
  - `RAILWAY_PROJECT_ID`;
  - `RAILWAY_ENVIRONMENT_ID`;
  - `RAILWAY_FUND_SCENARIO_CALC_SERVICE_ID`;
  - `RAILWAY_CAPITAL_CALL_STATUS_SERVICE_ID`;
  - existing five group caps, total cap, and TTL;
  - five new residue caps.

  GitHub Production secrets:

  - existing release/provider/smoke/canary secrets;
  - `CANARY_RECONCILER_USERNAME`;
  - `CANARY_RECONCILER_PASSWORD`.

  Vercel Production environment:

  - mirror all eleven residue cap values and TTL because application preflight
    reads runtime environment;
  - do not add admin reconciler credentials to Vercel.

  Use three total full-run budgets (at most two retained terminal runs plus one
  active run) and 24-hour TTL:

  | Variable                                       | Value |
  | ---------------------------------------------- | ----: |
  | `RELEASE_CANARY_MAX_PORTFOLIO_COMPANY_RESIDUE` |     3 |
  | `RELEASE_CANARY_MAX_FUND_RESIDUE`              |     3 |
  | `RELEASE_CANARY_MAX_FUND_CONFIG_RESIDUE`       |     3 |
  | `RELEASE_CANARY_MAX_FUND_EVENT_RESIDUE`        |    12 |
  | `RELEASE_CANARY_MAX_NOTIFICATION_RESIDUE`      |     0 |
  | `RELEASE_CANARY_MAX_GRANT_RESIDUE`             |     3 |
  | `RELEASE_CANARY_MAX_CALCULATION_RESIDUE`       |    15 |
  | `RELEASE_CANARY_MAX_MUTATION_RECEIPT_RESIDUE`  |     6 |
  | `RELEASE_CANARY_MAX_SCENARIO_RESIDUE`          |    21 |
  | `RELEASE_CANARY_MAX_REPORTING_RESIDUE`         |    33 |
  | `RELEASE_CANARY_MAX_TOTAL_RESIDUE`             |    99 |
  | `RELEASE_CANARY_TTL_HOURS`                     |    24 |

  These values equal three times characterized 33-row per-run maximum. Fourth
  unpurged run requires governed purge or expiry; do not raise caps to force
  release through.

  Fail closed when any required value is missing. Workflow may confirm key
  presence but must not print values.

  Identity variables must exist before Task 5 precursor deploy observation.
  Residue caps and reconciler secrets must exist before first runtime canary.

- [ ] **Step 2: Define release-evidence-manifest-v1 now**

  Create strict Zod contract with these top-level keys only:

  ```ts
  {
    schemaVersion: 'release-evidence-manifest-v1',
    designation: 'infrastructure_only' | 'activation_candidate',
    candidate: boolean,
    source: { repository, sha, pullRequest, planSha256 },
    approval: {
      schemaVersion: 'plan-approval-v2',
      commentId,
      commentUrl,
      authorLogin,
      authorPermission,
      createdAt,
      bodySha256,
      planSha256,
      approvedBaseHeadSha,
      separationModel: 'single-maintainer-independent-context',
    },
    certification: {
      schemaVersion: 'release-proof-certification-v1',
      workflowRef,
      runId,
      runAttempt,
      sourceSha,
      conclusion,
      artifactId,
      artifactName: 'release-proof-certification-v1',
      artifactSha256,
    },
    workflow: { runId, runAttempt, startedAt, completedAt, outcome, failureStage },
    schema: { migration, precursorSha, applyRunUrl, auditRunUrl, auditResult },
    policy: {
      reservedPerRun,
      stagedMeasuredResidue: residue | null,
      configuredCaps,
      retainedRunBudget,
      ttlHours,
      characterizationEvidenceSha256,
      ratifiedBy: string | null,
      ratifiedAt: string | null,
    },
    prechange: { vercel, railway },
    release: { vercel, railway } | null,
    operatorEvidence: { bundleSha256, capturedAt, verifiedAt } | null,
    canary: { execution, status, residue } | null,
    h9Artifact: { recordId, packageId, contentHash, fingerprint, sizeBytes } | null,
    rollback: { mode, recoveryContextSha256, targetMainSha },
  }
  ```

  Nested provider shapes contain canonical host/project/deployment/service IDs
  and source SHAs only. `residue` contains exact ten groups plus total. No raw
  evidence, response body, artifact body, token, credential, cookie, connection
  string, local path, or arbitrary metadata map is permitted.

  Cross-field rules:

  - `candidate=false` iff `designation='infrastructure_only'`;
  - `candidate=true` iff `designation='activation_candidate'`;
  - success requires verified operator evidence, release, completed canary,
    exact 33-row residue, and H9 metadata;
  - approval path/digest equal `source.planSha256`; approver permission is
    `admin`, `maintain`, or `write`; approved base is an ancestor of source SHA;
    comment/body identity equals fresh Task 0 verifier output and cannot be
    supplied from arbitrary workflow input;
  - certification source SHA equals `source.sha`; run ID/attempt equal current
    release workflow execution; success requires `conclusion='success'`, exact
    fixed artifact name, positive artifact ID, and verified lowercase SHA-256;
    selecting latest workflow run or artifact is forbidden;
  - successful policy requires measured residue equal reserved vector, each cap
    equal three times reserved value, total cap 99, retained-run budget three,
    TTL 24, characterization hash, and explicit release-owner ratification;
  - failure/cancelled permits null operator-evidence, release, canary, and H9
    sections but requires allowlisted failure stage and recovery-context hash;
  - source SHA, post-change release-provider SHAs, and canary SHA must agree;
    prechange provider SHAs remain immutable recorded rollback evidence and may
    differ from baseline `main` after behavior-compatible precursor merges;
  - all hashes are lowercase 64-hex; run IDs, timestamps, URLs, IDs, and
    integers have strict bounds;
  - recursive unknown or secret-shaped key/value scan runs before Zod parse.

  `release-proof.yml` emits `release-proof-certification-v1.json` under
  `if: always()` with exact current run ID/attempt, reusable workflow ref,
  source SHA, allowlisted job conclusions, and hashes of strict
  matrix/release-check summaries only. Upload fixed artifact name
  `release-proof-certification-v1` with `retention-days: 30`; expose upload
  artifact ID/digest as reusable workflow outputs. Do not include logs, provider
  responses, environment values, or arbitrary metadata. Release workflow
  downloads only this current-run artifact, verifies action-provided digest plus
  recomputed file SHA-256, and supplies normalized certification JSON to
  builder.

  Builder consumes Task 0 verifier output, exact current-run certification, and
  only normalized JSON files produced by earlier steps, validates contract,
  writes mode `0600`, then prints output path and manifest SHA-256 only. Tests
  reject unknown nested fields, designation/candidate mismatch, success with
  missing proof, inconsistent approval/plan ancestry, stale or latest-run
  certification, inconsistent SHA/residue, edited-comment metadata, oversized
  values, and secret-shaped content.

  For PR #1385 workflow invocation is fixed:

  ```bash
  npx tsx scripts/release/build-release-evidence-manifest.ts \
    --designation infrastructure_only \
    --candidate false \
    --output "$RUNNER_TEMP/release-evidence-manifest-v1.json"
  ```

  Do not expose flags that allow `activation_candidate` in this PR's workflow
  path. Contract supports later candidate builder reuse, but current workflow
  regression must require `candidate=false` and `infrastructure_only`.

  Build and validate manifest for success and recoverable failure paths. Upload
  sanitized artifact named `release-evidence-manifest-v1` with
  `retention-days: 30`; delete local file under `if: always()`. Manifest becomes
  first governed infrastructure release record, not deferred future work.

- [ ] **Step 3: Set coherent job and step time budgets**

  Use explicit budgets:

  | Path                   | Declared inner budget                                                                | Outer job budget | Required margin |
  | ---------------------- | ------------------------------------------------------------------------------------ | ---------------: | --------------: |
  | Pre-merge baseline     | 4-minute provider capture/validation + 1-minute artifact upload                      |       10 minutes |       5 minutes |
  | Railway exact-SHA wait | 10-minute poll loop                                                                  |       15 minutes |       5 minutes |
  | Promotion              | 2-minute evidence verify + 5-minute Vercel CLI + 6-minute canonical resolver wrapper |       20 minutes |       7 minutes |
  | Staged mutation smoke  | 3 setup + 3 boundary + 22 Playwright + 4 finalizer + 2 cleanup                       |       40 minutes |       6 minutes |

  Set step-level timeouts below outer job timeout. Run mutation Playwright with
  `continue-on-error: true`; exact-run finalizer and manifest steps use
  `if: always()`. Configure release-canary serial suite with `retries: 0`;
  unsafe whole-suite retries are forbidden. Request-level retries remain bounded
  and idempotent. Inside 22-minute Playwright step, set per-test caps: fund
  create/finalize two minutes, portfolio two, first results two, results reload
  one, scenario/reserve four, and H9 eight. Declared test maxima total 19
  minutes, leaving three-minute Playwright setup/poll margin.

  Add static regression that parses workflow and rejects any outer budget less
  than or equal to sum of declared inner budgets, any mutation step without time
  left for finalizer, release-canary retries above zero, or Railway/promotion
  wait that can outlive job. Apply same assertion to baseline-capture workflow.
  Hard runner cancellation uses Task 8 recovery CLI.

- [ ] **Step 4: Regenerate routing docs**

  ```bash
  npm run docs:routing:generate
  npm run docs:routing:check
  ```

  Review generated diff. Include only files changed by route/schema manifest.

- [ ] **Step 5: Run targeted verification**

  ```bash
  TZ=UTC npx vitest run \
    tests/unit/scripts/operator-evidence-bundle.test.mjs \
    tests/unit/scripts/collect-provider-evidence.test.mjs \
    tests/unit/scripts/provider-evidence-contract.test.mjs \
    tests/unit/scripts/verify-provider-identity.test.mjs \
    tests/unit/scripts/verify-vercel-promotion.test.mjs \
    tests/unit/scripts/verify-plan-approval.test.mjs \
    tests/unit/scripts/assert-canary-residue.test.mjs \
    tests/unit/scripts/purge-canary-runs.test.ts \
    tests/unit/contracts/release-proof-certification-v1.contract.test.ts \
    tests/unit/contracts/release-evidence-manifest-v1.contract.test.ts \
    tests/unit/scripts/build-release-proof-certification.test.ts \
    tests/unit/scripts/build-release-evidence-manifest.test.ts \
    tests/unit/services/fund-scenario-calculation-command-service.test.ts \
    tests/unit/routes/fund-scenario-sets-calculate-reserve.behavior.test.ts \
    tests/unit/routes/fund-scenario-sets-route-contract.test.ts \
    tests/unit/contract/fund-results-route.test.ts \
    tests/unit/lib/canonical-json.test.ts \
    tests/unit/services/lp-reporting/report-package-json-export-service.test.ts \
    tests/unit/services/canary-residue-service.test.ts \
    tests/unit/phase2a/fund-persistence-service.behavior.test.ts \
    tests/integration/fund-scenario-calculation-command.test.ts \
    tests/integration/fund-scenario-reserve-worker.test.ts \
    tests/integration/scenarios/scenario-release-gate.integration.test.ts \
    tests/integration/release-canary-lifecycle.test.ts \
    tests/regressions/ci-fail-closed.test.ts \
    --config vitest.config.mjs --configLoader native --project=server
  ```

  Expected: zero failures, zero skipped required cases.

- [ ] **Step 6: Run repository gates**

  ```bash
  npm run lint
  npm run check
  npm run validate:schema-drift
  TZ=UTC npm run phoenix:truth
  TZ=UTC npm test
  npm run build
  npm run build:verify
  TZ=UTC npm run release:check
  npm run docs:routing:check
  ```

  Because schema, shared test infrastructure, workflow guards, and queue
  behavior changed, full suite is mandatory.

- [ ] **Step 7: Inspect final diff**

  ```bash
  git status --short
  git diff --check
  git diff --stat
  PR_BASE_SHA="$(gh pr view 1385 --json baseRefOid --jq .baseRefOid)"
  git diff --name-only "$PR_BASE_SHA"...HEAD
  ```

  Confirm:

  - no files outside plan scope except regenerated routing outputs;
  - no evidence files, temp JSON, Playwright downloads, credentials, or provider
    responses tracked;
  - no tracked `audit/knowledge-graph/out` file and no bounded session review
    artifact from this PR;
  - no raw production identifiers embedded in code/tests;
  - no stale Task 11 caller;
  - no final-candidate/freeze language;
  - no Phoenix protected path changes.

- [ ] **Step 8: Re-run live PR checks**

  Push branch, then:

  ```bash
  gh pr checks 1385 --watch
  ```

  Require:

  - lint;
  - typecheck;
  - unit-fast;
  - Testcontainers;
  - build/bundle;
  - governance/docs;
  - security/CodeQL;
  - Vercel preview.

  Do not quote prior 12,358-test claim as current evidence. Report fresh totals
  from this head.

- [ ] **Step 9: Resolve reviews and update PR meaning**

  After green evidence:

  - resolve two portfolio canary threads;
  - update PR description to “interim release infrastructure”;
  - explicitly state it does not mint activation candidate or freeze `main`;
  - list migration `0053` and production variable/secret prerequisites;
  - link schema precursor merge/apply/audit evidence and exact edit-detected
    plan approval;
  - state manifest designation `infrastructure_only`, `candidate=false`;
  - list exact test run IDs and candidate-independent artifacts;
  - retain verification limitation for any production step not yet executed.

- [ ] **Step 10: Commit manifest policy, then final docs**

  ```bash
  git add \
    .github/workflows/release-proof.yml \
    .github/workflows/release-production.yml \
    shared/contracts/release-proof-certification-v1.contract.ts \
    shared/contracts/release-evidence-manifest-v1.contract.ts \
    scripts/release/build-release-proof-certification.ts \
    scripts/release/build-release-evidence-manifest.ts \
    tests/unit/contracts/release-proof-certification-v1.contract.test.ts \
    tests/unit/contracts/release-evidence-manifest-v1.contract.test.ts \
    tests/unit/scripts/build-release-proof-certification.test.ts \
    tests/unit/scripts/build-release-evidence-manifest.test.ts \
    tests/regressions/ci-fail-closed.test.ts
  git commit -m "feat(release): emit infrastructure evidence manifest"
  ```

  Then commit documentation/generated changes when present:

  ```bash
  git add \
    CHANGELOG.md \
    docs/_generated/router-index.json \
    docs/_generated/router-fast.json \
    docs/_generated/staleness-report.md
  git commit -m "docs(release): record hardened interim release gates"
  ```

  Skip second commit if no generated or changelog diff remains.

---

## Task 12: Merge and Roadmap Handoff

- [ ] **Step 1: Merge criterion for PR #1385**

  PR may merge only when:

  - all code and CI gates above are green;
  - Redis incident #1346 is operationally closed and first infrastructure
    release is authorized;
  - schema precursor is merged, migration `0053` is applied and audited clean in
    production, old-code/new-schema test passes, and both Railway services
    proved precursor exact-SHA auto-deploy;
  - post-rebase plan approval binds unchanged plan digest and approved ancestor
    head, exact unedited comment identity, and current repository-owner
    permission;
  - required protected values have named owners;
  - release dispatcher accepts all required evidence;
  - exact provider and canonical alias proof are enforced;
  - current-execution canary, full residue, reserve replay, worker
    retry/failure/timeout, and H9 artifact tests exist;
  - exact release-proof certification artifact is bound to source SHA and no
    tracked knowledge-graph/session-review residue remains;
  - named release owner holds bounded merge-to-release change window so no
    unrelated `main` merge can invalidate provider baseline before release;
  - PR description has no final-candidate/freeze claim.

- [ ] **Step 2: Capture immutable baseline, then merge through protection**

  After Step 1 is satisfied, freeze final PR head and approved plan digest.
  Before merge:

  1. resolve current live `main` SHA;
  2. dispatch `capture-release-baseline.yml` with exact baseline main, final PR
     head, and plan digest;
  3. wait for success, download exact-run artifact, validate strict context, and
     compute its SHA-256;
  4. record exact baseline workflow run ID and artifact hash in merge record;
  5. re-read live `main`, PR head, and plan digest; any drift invalidates
     capture and requires a new exact run.

  Only then merge through protected branch process. Record merge commit SHA and
  prove it matches GitHub PR merge metadata while prior baseline main remains an
  ancestor. Railway auto-deploy may now begin; runtime release waiter must prove
  both exact services converge to merge SHA. Do not label merge activation
  candidate and do not begin repository freeze.

  Keep transaction window only through first governed release or forward-revert
  completion. If `main`, PR head, approval, or provider baseline drifts before
  merge, discard capture and restart. If `main` advances after runtime merge but
  before release, stop and execute failure semantics; do not silently release a
  different SHA.

- [ ] **Step 3: Re-audit already-applied schema before first runtime release**

  After PR merges to `main`, reassert Redis closure and release authorization:

  1. resolve exact live `main` SHA and require it contains PR #1385 merge
     commit;
  2. require Task 5 precursor apply evidence for migration `0053`;
  3. run production schema reconcile in audit mode only and require clean;
  4. retain redacted precursor apply and current audit references.

  Do not apply `0053` here and do not let `release-production.yml` auto-create
  missing schema. Runtime release remains audit-only. Missing migration or drift
  blocks release and returns to schema governance; it is not repaired inline. If
  Redis closure or production authorization is pending, leave this step pending
  and state that post-merge production proof is not complete.

- [ ] **Step 4: Run first governed infrastructure release**

  After schema audit is clean:

  1. collect fresh four-file operator evidence outside GitHub Actions;
  2. invoke only `scripts/deploy-production.ps1` against exact live `main` SHA,
     exact baseline workflow run ID, and exact baseline artifact hash;
  3. require prechange recovery context artifact exists before staged provider
     mutation;
  4. complete normal GitHub Production environment approval;
  5. require workflow provider, promotion, current-run, residue, portfolio,
     results, reserve replay, and H9 stored-JSON gates to pass;
  6. require `release-evidence-manifest-v1` validates with
     `designation='infrastructure_only'` and `candidate=false`;
  7. retain only sanitized manifest, recovery context, redacted references, and
     hashes, never evidence/artifact bodies;
  8. record rollback target and workflow execution identity.

  This run validates reusable infrastructure. It does not designate activation
  candidate, start Wave I, or start soak.

- [ ] **Step 5: Post-merge meaning**

  Merge produces reusable release infrastructure only.

  Next product sequence remains:

  ```text
  Redis operational closure
    -> minimum Wave H operator experience
    -> cut exact activation candidate
    -> Wave I proof
    -> four consecutive seven-day windows
    -> human activation
  ```

  No soak starts from PR #1385 merge SHA unless that same later SHA also
  contains completed Wave H and is explicitly designated activation candidate.

- [ ] **Step 6: Preserve manifest semantics for later candidate**

  Validate and retain first infrastructure-only manifest now. When later
  candidate is cut, reuse exact `release-evidence-manifest-v1` contract and
  builder with `designation='activation_candidate'` and `candidate=true`; do not
  invent parallel fields or evidence semantics. Wave I issues consume validated
  manifest.

- [ ] **Step 7: Handle any post-merge release failure by forward revert**

  On any Railway convergence, staged smoke, promotion, residue, H9, or manifest
  failure after runtime merge:

  1. stop further release work;
  2. preserve prechange provider IDs, failing workflow run/attempt, exact canary
     recovery handle, and sanitized failure manifest;
  3. terminalize exact canary run with Task 8 finalizer or recovery CLI;
  4. verify global residue and decide purge separately under existing
     governance;
  5. create human-reviewed forward-revert commit on `main` targeting recorded
     baseline application SHA;
  6. release revert through same dispatcher with fresh operator evidence and
     same schema audit/provider/canary gates.

  When failure occurs before canonical Vercel promotion, first prove canonical
  Vercel still equals baseline deployment; then forward revert restores Railway.
  When failure occurs after promotion, same forward revert plus governed
  dispatcher reconverges all providers. Do not move only Vercel alias, manually
  redeploy one Railway service, or run down migration. `0053` stays applied;
  Task 5 compatibility test proves reverted application can run on expanded
  schema.

---

## Acceptance Matrix

| Area                   | Passing evidence                                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Current CI             | Lint green; exact-SHA strict matrix proof rebuilds ignored KG output ephemerally; no tracked audit residue.           |
| Plan approval          | Exact unedited V2 body, plan hash, ancestor head, owner permission, comment identity, and single-match verifier pass. |
| Schema ordering        | `0053` precursor merged/applied/audited; old code and protected Railway services run on expanded schema.              |
| Caller                 | PowerShell dispatcher supplies exact SHA plus validated four-object evidence through stdin JSON.                      |
| Caller inventory       | Historic Task 11 workflow deleted; no second dispatch path.                                                           |
| Vercel staged identity | READY production-target, no aliases, expected project/SHA/main metadata.                                              |
| Railway identity       | Exact protected ID/name pairs and SHA; duplicates/cross-maps fail; unrelated services cannot collide.                 |
| Promotion              | Canonical hostname resolves to exact staged deployment after every promote attempt.                                   |
| Freshness              | Operator and provider evidence rechecked after final approval.                                                        |
| Canary origin          | Exact result fund links workflow run/attempt, run/principal/grant/window/SHA; recovery uses same tuple.               |
| Residue                | Characterized 33-row maximum reserved; one nonterminal run; all ten groups counted; purged rows validated.            |
| Portfolio              | Same-key replay stable; stale version rejected; persisted state unchanged.                                            |
| Results                | Shared schema parses; stable lifecycle evidence survives reload; worker retry/failure/timeout paths fail closed.      |
| Reserve command        | Same key returns exact 202 response with one receipt/run/job/event; crash recovery deterministic.                     |
| Reserve UI             | One key per user intent; 409/503/network retry reuses key; 422 reloads inputs; errors remain visible.                 |
| Reporting              | Approved nonzero planning mark produces actuals fact, locked package, and H9-actionable stored JSON.                  |
| Evidence manifest      | Manifest is infrastructure-only/non-candidate and binds exact approval plus current-run release-proof certification.  |
| Time budgets           | Every outer job exceeds bounded inner waits and retains finalizer/cleanup margin.                                     |
| Security               | No secret/evidence body in argv, logs, summaries, artifacts, or tracked files.                                        |
| Governance             | PR merges as infrastructure, not final candidate or freeze.                                                           |

## Rollback and Failure Semantics

- Any missing, edited, duplicate, permission-invalid, digest-mismatched, or
  non-ancestor plan approval blocks implementation and merge.
- Any missing, latest-selected, wrong-run, wrong-attempt, wrong-SHA, or
  digest-mismatched release-proof certification blocks manifest success.
- Any missing protected value fails before mutation.
- Any stale or malformed operator bundle requires new dispatch; workflow does
  not weaken freshness.
- Any provider mismatch blocks promotion.
- Any promote error with canonical mismatch is fatal.
- Verified canonical match may classify promote error as no-op success.
- Any canary failure terminalizes exact known run as failed when result file
  exists.
- Worker terminal failure or bounded poll timeout cannot reuse prior success and
  terminalizes only current exact canary execution.
- Missing current result file cannot be replaced by old same-SHA run.
- Any residue accounting/query error is invalid configuration/query failure,
  never pass.
- Any reserve command ambiguity reuses deterministic run/job identity; it never
  creates random second job.
- Any H9 fingerprint drift blocks stored artifact retrieval.
- Hard cancellation is recovered only by exact workflow run/attempt and exact
  fund/canary-run/SHA handle; never latest run or SHA-wide mutation.
- Post-promotion failure preserves sanitized prechange/outcome metadata,
  terminalizes exact canary, and stops pending human forward-revert decision.
- Application rollback remains human-governed forward revert on `main` plus same
  dispatcher. No Vercel alias-only rollback, one-service Railway redeploy, or
  down migration.

## Source Evidence

- Live PR: [PR #1385](https://github.com/nikhillinit/Updog_restore/pull/1385)
- Open Redis operational blocker:
  [issue #1346](https://github.com/nikhillinit/Updog_restore/issues/1346)
- Failing lint job at approved head:
  [GitHub Actions job 93686828674](https://github.com/nikhillinit/Updog_restore/actions/runs/31461857041/job/93686828674)
- Open portfolio replay review:
  [discussion 3755392960](https://github.com/nikhillinit/Updog_restore/pull/1385#discussion_r3755392960)
- Open optimistic-lock review:
  [discussion 3755392965](https://github.com/nikhillinit/Updog_restore/pull/1385#discussion_r3755392965)
- GitHub CLI stdin JSON dispatch:
  [`gh workflow run` manual](https://cli.github.com/manual/gh_workflow_run)
- GitHub workflow-dispatch input ceiling:
  [Triggering a workflow](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)
- Vercel staged production workflow:
  [Deploying a staged production build](https://vercel.com/docs/cli/deploying-from-cli)
- Vercel promotion semantics:
  [`vercel promote`](https://vercel.com/docs/cli/promote)
- Vercel deployment lookup by ID or URL:
  [Deployment integration actions](https://vercel.com/docs/integrations/create-integration/deployment-integration-action)

## Completion Condition

Merge-ready completion means Tasks 0 through 11 are green, schema precursor is
already applied/audited, reviews are resolved, and PR meaning is
infrastructure-only. Operational completion means Task 12's post-merge schema
re-audit and first governed infrastructure release also pass and independently
prove:

    fresh operator evidence
      + exact provider identity
      + canonical alias movement
      + exact current canary fund/run
      + complete characterized 33-row bounded residue
      + portfolio replay/version fences
      + stable authoritative results
      + durable reserve command replay
      + nonzero planning-FMV financial fact
      + H9-qualified stored JSON artifact
      + validated infrastructure-only evidence manifest

Completion does not authorize Current Forecast activation, candidate freeze,
Wave I, or soak.
