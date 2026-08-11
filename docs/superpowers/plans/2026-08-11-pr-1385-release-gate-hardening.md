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
  that binds plan SHA-256, live PR head SHA, exact-head `CI Gate Status` check
  run, and exact-body read-only review record. Task 0 is the only pre-approval
  bootstrap lane: it may change the plan, verifier, verifier tests, generated
  routing outputs caused by those tracked files, and review/request comments.
  Any plan change or non-descendant PR-head rewrite/rebase invalidates approval
  and requires a new review record; ordinary implementation commits may descend
  from approved head.
- Repository currently has one write-authorized collaborator. Do not claim a
  two-GitHub-login approval rule that repository membership cannot satisfy.
  `PLAN-APPROVAL-V2` uses the repository-admin login as durable decision author
  under `single-maintainer-owner-attestation`. Fresh read-only review context,
  no Tasks 1 through 12 in approval context, separate implementation contexts,
  and fresh pre-merge review (scheduled concretely as Task 12 Step 1's final
  criterion, at the frozen final head) are procedural controls attested by
  owner; GitHub
  identity cannot prove context separation. Machine-enforced facts are exact
  bodies, comment identities, plan/head hashes, exact-head CI result, owner and
  permission, timestamps, uniqueness, and ancestry. Do not describe procedural
  context separation as a security boundary.
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
    untracked. Release proof builds an owned minimal route projection
    ephemerally at exact checked-out SHA and deletes it on every outcome; it
    does not claim to recreate missing vendor knowledge-graph tooling.
11. Bind infrastructure-release evidence to exact plan approval and exact
    release-proof workflow run/artifact lineage.

## Stress-Test Verdict

PR direction is sound, but present head is not merge-ready. Current failure and
hidden gaps:

| Finding                                                | Why current plan is insufficient                                                                                                        | Approved correction                                                                                                                                                  |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CI lint failure (closed at `4529a0e8`)                 | Attachment said `process` import was missing; reviewed head instead had unused import.                                                  | Unused import removed; exact-head lint and required CI gate re-proved before approval.                                                                               |
| Required operator evidence has no supported caller     | Workflow requires `operator_evidence_b64`; PowerShell helper sends only SHA.                                                            | One evidence codec plus mandatory four-file dispatcher arguments.                                                                                                    |
| Historic Task 11 workflow still dispatches production  | Its issue is closed and hard fence can no longer pass, but static surface remains second caller.                                        | Delete workflow after archive-gate proof.                                                                                                                            |
| Vercel promotion success is not independently verified | Successful CLI exit immediately passes; failure-only path compares mutable `PRODUCTION_URL`.                                            | Resolve protected canonical hostname through Vercel API after every promote attempt and compare exact deployment ID/project/SHA/alias.                               |
| Railway topology is name-pinned, not identity-pinned   | Same names in wrong project/environment/service IDs can pass.                                                                           | Exact protected project, environment, and two service IDs.                                                                                                           |
| Production variables are not provisioned               | Live GitHub Production variable inventory lacks canary caps, TTL, canonical hostname, and Railway IDs.                                  | Provision provider identity values before precursor proof and canary policy/secrets before runtime release.                                                          |
| Provider evidence can age during approval              | Staged and G4 jobs run before final promotion approval.                                                                                 | Fetch and verify fresh provider evidence inside promotion job after approval. Revalidate operator evidence freshness there.                                          |
| Canary completion is SHA-wide                          | Old same-SHA run can satisfy completion while current fund is ordinary or unbound.                                                      | Persist current execution handle and verify workflow run/attempt/fund/canary-run/principal/grant/start/SHA linkage.                                                  |
| Residue totals omit rows already written               | Grants, calculation rows, snapshots, receipts, scenarios, and reporting artifacts are not counted.                                      | Five additive residue groups plus exact total equality.                                                                                                              |
| Creation preflight reserves only initial rows          | Concurrent or unfinished canaries can pass preflight, then exceed caps during later scenario/report writes.                             | Characterize and reserve exact 33-row canary footprint; allow only one nonterminal run.                                                                              |
| Purged rows bypass structural validation               | Invalid timestamps or counts are ignored once `purged`.                                                                                 | Validate full row before excluding it from caps and TTL.                                                                                                             |
| Portfolio canary does not test claimed controls        | It performs one successful PATCH only.                                                                                                  | Same-key replay plus stale-version 409 and unchanged state.                                                                                                          |
| Results canary is too shallow                          | Response has no snapshot ID; non-empty object assertion proves little.                                                                  | Parse `FundResultsReadV1Schema` and compare stable lifecycle/config/correlation/section evidence across reload.                                                      |
| Reserve calculation canary is not idempotent           | Endpoint has no durable client key and emits new correlation/event on replay.                                                           | Durable command ledger, canonical stored response, deterministic recovery, and replay canary.                                                                        |
| “Report/export” is absent from live smoke              | Current suite stops after scenario success.                                                                                             | Full metric/evidence/lock/narrative/package/stored-JSON lifecycle with H9 actionability.                                                                             |
| H9 write authority conflicts with canary role          | Planning-FMV approval and MOIC reconciliation are admin-only; report writes are partner-scoped.                                         | Separate admin client for planning-mark replay plus reconciliation; partner canary owns remaining lifecycle.                                                         |
| Artifact hash helper is server-coupled                 | Importing it into Playwright can initialize database/service modules during collection.                                                 | Extract behavior-identical pure helper into `shared/lib` and retain server re-export compatibility.                                                                  |
| PR sequencing claims too much                          | Infrastructure commit precedes Wave H.                                                                                                  | Merge only as reusable release infrastructure. Cut candidate later.                                                                                                  |
| Reserve UI would break                                 | Workspace and integration callers omit newly mandatory `Idempotency-Key`; UI has no retry/error state.                                  | Add one intent key per click, retain it across ambiguous retries, and migrate every production/test caller.                                                          |
| Fund-event budget is false                             | Create, draft-save, publish, and calculate each write a fund event; plan reserved one.                                                  | Characterize deployed path and reserve four fund events, 33 total rows, and 99 rows across three retained runs.                                                      |
| Schema rollout is unordered                            | Runtime merge before `0053` apply can expose new code to old schema.                                                                    | Merge schema-only precursor, apply/audit it, prove old-code compatibility, then rebase and merge runtime PR.                                                         |
| Evidence redaction is late                             | Arbitrary nested JSON can be encoded and written before verifier redaction.                                                             | Strict schemas, size/depth limits, pre-encode secret rejection, private files, and unconditional cleanup.                                                            |
| H9 can prove an empty model                            | Empty source mark/event lists can yield no company financial fact.                                                                      | Seed approved planning FMV, require exact actuals fact, and use explicit source mark ID.                                                                             |
| Cancellation recovery is ambiguous                     | Result file and finalizer do not survive hard runner cancellation.                                                                      | Capture pre-merge provider baseline, persist execution identity, emit recovery handle, and use exact recovery CLI.                                                   |
| Job budgets cannot fit inner waits                     | Current outer timeouts are smaller than declared poll/retry paths.                                                                      | Declare step and job budgets with positive cleanup margin and static regression checks.                                                                              |
| Approval can drift or self-match                       | Request comment embeds a syntactically approved record; substring matching and editable comments can manufacture or duplicate approval. | Separate review/request/approval markers; exact-body verifier binds plan/head, exact-head CI, linked review, owner permission, edit state, uniqueness, and ancestry. |
| Railway topology remains discretionary                 | “Keep two unless unrelated services appear” leaves behavior to implementer.                                                             | Validate exact protected ID/name pairs, reject duplicates/cross-maps, and ignore unrelated services only after collision checks.                                     |
| Evidence manifest is deferred                          | Later candidate could invent incompatible semantics.                                                                                    | Define and validate versioned manifest now; PR #1385 is explicitly infrastructure-only and non-candidate.                                                            |
| Knowledge-graph snapshot is tracked and stale          | Generated inventory claims coding authority for unrelated non-ancestor SHA; documented full-KG generator does not exist.                | Remove tracked snapshot/review artifact; build owned route-only projection at exact release-proof SHA, validate independently, and always delete it.                 |
| Release evidence omits approval/certification lineage  | Manifest cannot prove which approval and exact release-proof attempt certified source SHA.                                              | Bind approval/review/check identities plus attempt-qualified certification payload and post-upload lineage artifact metadata.                                        |
| Worker negative paths are unproved                     | Happy-path reserve completion cannot detect terminal worker failure, bounded-poll timeout, or stale-run substitution.                   | Add explicit runner/clock/processor injection seams plus deterministic exact-run integration truth cases and no-duplicate assertions.                                |

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
- Inspect only: PR #1385 head, issue comments, collaborator permission, and
  exact-head check runs

**Interfaces:**

```text
PLAN_PATH=docs/superpowers/plans/2026-08-11-pr-1385-release-gate-hardening.md
PLAN_SHA256=<64 lowercase hex>
APPROVED_BASE_HEAD_SHA=<40 lowercase hex>
APPROVER_LOGIN=nikhillinit
REVIEW_COMMENT_ID=<positive integer>
REVIEW_BODY_SHA256=<64 lowercase hex>
CI_GATE_CHECK_RUN_ID=<positive integer>
SEPARATION_MODEL=single-maintainer-owner-attestation
```

- [x] **Step 1: Commit every revised plan before verifier implementation**

  Commit and push each review-driven plan revision alone before writing the
  verifier. The verifier is governance bootstrap, not authorization to begin
  Tasks 1 through 12. Do not approve a staged-only or untracked plan. A reviewer
  rejection followed by a plan edit resets this step and requires a new digest,
  head, CI run, and read-only review.

  Run:

  ```bash
  git add docs/superpowers/plans/2026-08-11-pr-1385-release-gate-hardening.md
  git commit -m "docs(plan): close PR 1385 hardening review gaps"
  git push origin HEAD
  git ls-files --error-unmatch docs/superpowers/plans/2026-08-11-pr-1385-release-gate-hardening.md
  ```

  Expected: final command prints exact plan path.

- [x] **Step 2: Write failing approval-verifier tests**

  Export pure evaluator plus CLI:

  ```js
  export function buildPlanReviewBody(input);
  export function buildPlanApprovalBody(input);
  export function evaluatePlanApproval(input);
  ```

  Require tests for:

  - exact trimmed whole-comment body only; Markdown fences, prefixes, suffixes,
    and embedded blocks do not match;
  - marker must be `PLAN-APPROVAL-V2`; request marker `PLAN-REVIEW-REQUEST-V2`
    can never qualify;
  - exact plan path, current plan SHA-256, approved base head, approver login,
    linked review comment ID/body hash, exact-head CI check-run ID, separation
    model, `decision: approved`, and `accepted_exceptions: none`;
  - linked `PLAN-REVIEW-V2` comment is one exact unedited whole-comment body,
    binds same plan path/digest/head and CI check-run ID, records
    `reviewer_kind: independent-read-only-agent`, `review_verdict: approved`,
    and `blocking_findings: none`, and matches referenced body SHA-256;
  - referenced check run is named `CI Gate Status`, targets approved base head,
    is completed with `conclusion: success`, and belongs to repository Actions;
  - the check run resolves (via the Actions jobs API — an Actions job ID is its
    check-run ID) to a workflow run whose `workflow_id` equals the ID resolved
    from `.github/workflows/ci-unified.yml` (never a string comparison on the
    run's `path`, which GitHub may return with an `@<ref>` suffix), whose
    event is `pull_request`, whose
    run `head_sha` equals the approved base head, and whose pull-request
    association contains the plan-approval PR; a same-SHA `workflow_dispatch`
    or `push` run of the same workflow never qualifies, because gate-job
    expectations are event-conditional and a manual dispatch can go vacuously
    green at the same SHA;
  - only under an explicit `--require-final-head-ci` flag, the verifier
    performs the same gate resolution at the live final PR head and emits a
    normalized `finalHeadCiGate` object (`checkRunId`, `workflowRunId`,
    `runAttempt`, `headSha`); in that mode a missing, failed, or
    non-`pull_request` final-head gate run fails closed. Without the flag no
    final-head gate lookup runs and no `finalHeadCiGate` is emitted — the
    label-scoped in-CI `plan-approval` job MUST NOT pass the flag, because it
    executes inside the same head's `CI Gate Status` dependency graph and a
    final-head gate requirement there is self-referential (the first CI run
    of every descendant head could never pass). The flag is for post-CI
    consumers only: the release finalizer and the pre-merge check, both of
    which run after the final head's gate has already completed
    successfully;
  - comment author login equals declared approver and repository owner;
  - live collaborator permission is `admin`, `maintain`, or `write`;
  - review and approval each have `created_at === updated_at`; edited comments
    are invalid even when body is restored later;
  - exactly one applicable unedited review and approval; zero or multiple fail
    closed;
  - before first Task 1 edit, approved base equals live head; after ordinary
    descendant implementation commits, approved base must be an ancestor;
  - rebase, non-descendant force-push, unrelated head, plan digest change,
    referenced review/approval deletion, permission loss, author mismatch, any
    non-`none` exception, stale/failed CI, a gate check run whose resolved
    workflow run is `workflow_dispatch`/`push`, wrong-path, wrong-head, or
    missing the plan-approval PR association, and API pagination/error all fail
    closed;
  - deleting the sole approval yields zero approvals; a later exact unedited
    repost is a new approval with a new comment identity, not continuity of the
    deleted record;
  - output contains only normalized review/approval comment IDs, URLs, authors,
    permission, timestamps, body SHA-256 values, check-run ID/name/conclusion,
    resolved gate workflow run ID/attempt/event/workflow ID, the
    `finalHeadCiGate` object, repository, plan-approval
    PR number, plan path/SHA-256, approved base, live head, decision, and
    separation model.

  Run and confirm failure:

  ```bash
  TZ=UTC npx vitest run \
    tests/unit/scripts/verify-plan-approval.test.mjs \
    --config vitest.config.mjs --configLoader native --project=server
  ```

- [x] **Step 3: Implement exact-body verifier**

  CLI:

  ```bash
  node scripts/release/verify-plan-approval.mjs \
    --repo nikhillinit/Updog_restore \
    --pr 1385 \
    --plan-path docs/superpowers/plans/2026-08-11-pr-1385-release-gate-hardening.md \
    --approver-login nikhillinit \
    --require-exact-head
  ```

  Use GitHub REST issue-comment pagination, exact check-run retrieval,
  repository-owner lookup, and collaborator-permission endpoint. Fetch live PR
  head independently. Resolve the bound `ci_gate_check_run_id` through the
  Actions jobs API to its workflow run and reject unless the run's
  `workflow_id` equals the ID resolved from
  `.github/workflows/ci-unified.yml` (no string comparison on run `path`,
  which may carry an `@<ref>` suffix), run event is `pull_request`, run
  `head_sha` equals the approved base head, and the run's pull-request
  association contains the plan-approval PR; record the resolved run ID and
  attempt in normalized output. Behind the explicit `--require-final-head-ci`
  flag only, perform the identical resolution against the
  live final PR head and emit
  `finalHeadCiGate` (`checkRunId`, `workflowRunId`, `runAttempt`, `headSha`)
  in the same normalized output; this flagged mode is the sole producer of
  the manifest's `approval.finalHeadCiGate` and is invoked only by post-CI
  consumers (release finalizer, pre-merge check), never by the in-CI
  `plan-approval` job. Strict-parse fixed-order V2 fields, build expected review
  and approval bodies internally from exact local plan digest plus linked IDs,
  and compare each body byte-for-byte after one outer `.trim()`. Do not accept
  caller-supplied body text. Query commit comparison to prove ancestry for later
  batches. Reject truncated pagination and any API uncertainty. Print one
  compact normalized JSON record; never print token, arbitrary comment body, or
  unrelated comments.

  Task 0 cannot machine-intercept a local edit. Its pre-batch verifier call is
  operator procedure until Task 1 wires the same CLI into required
  `CI Gate Status`. Tests here prove verifier behavior, not source-text presence
  or an impossible claim that every local batch invocation is observable.

- [x] **Step 4: Verify and commit governance bootstrap**

  ```bash
  TZ=UTC npx vitest run \
    tests/unit/scripts/verify-plan-approval.test.mjs \
    tests/regressions/ci-fail-closed.test.ts \
    --config vitest.config.mjs --configLoader native --project=server
  npx eslint --no-ignore \
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

- [ ] **Step 5: Freeze exact head behind CI and read-only review**

  Wait for required `CI Gate Status` to complete successfully at exact live
  head on the PR's own `pull_request`-event `ci-unified.yml` run. Record the
  gate job's immutable check-run ID together with its workflow run ID and
  attempt. At that same SHA, request a fresh
  read-only review of this plan, verifier, tests, and exact PR diff. Reviewer
  must execute no Task 1 through Task 12 edits. Any blocker returns to Step 1.

  Run:

  ```bash
  PLAN_PATH=docs/superpowers/plans/2026-08-11-pr-1385-release-gate-hardening.md
  PLAN_SHA256="$(shasum -a 256 "$PLAN_PATH" | awk '{print $1}')"
  APPROVED_BASE_HEAD_SHA="$(gh pr view 1385 --json headRefOid --jq .headRefOid)"
  test "$(git rev-parse HEAD)" = "$APPROVED_BASE_HEAD_SHA"
  CI_WORKFLOW_ID="$(gh api -X GET \
    "repos/nikhillinit/Updog_restore/actions/workflows/ci-unified.yml" \
    --jq .id)"
  CI_GATE_RUN_ID="$(gh api -X GET \
    "repos/nikhillinit/Updog_restore/actions/workflows/$CI_WORKFLOW_ID/runs?head_sha=$APPROVED_BASE_HEAD_SHA&event=pull_request" \
    --jq '[.workflow_runs[] | select(.status == "completed" and .conclusion == "success" and ([.pull_requests[].number] | index(1385)))] | if length == 1 then .[0].id else error("expected one successful pull_request ci-unified run") end')"
  CI_GATE_RUN_ATTEMPT="$(gh api -X GET \
    "repos/nikhillinit/Updog_restore/actions/runs/$CI_GATE_RUN_ID" \
    --jq .run_attempt)"
  CI_GATE_CHECK_RUN_ID="$(gh api -X GET \
    "repos/nikhillinit/Updog_restore/actions/runs/$CI_GATE_RUN_ID/attempts/$CI_GATE_RUN_ATTEMPT/jobs?per_page=100" \
    --jq '[.jobs[] | select(.name == "CI Gate Status" and .status == "completed" and .conclusion == "success")] | if length == 1 then .[0].id else error("expected one successful CI Gate Status job") end')"
  test "${#PLAN_SHA256}" -eq 64
  test "$CI_GATE_CHECK_RUN_ID" -gt 0
  ```

  After read-only reviewer returns no blockers, repository owner posts this
  exact plain-text attestation. GitHub proves body, author, time, head, and CI
  identity; `reviewer_kind` remains a procedural owner attestation, not proof of
  process isolation:

  ```text
  PLAN-REVIEW-V2
  plan_path: docs/superpowers/plans/2026-08-11-pr-1385-release-gate-hardening.md
  plan_sha256: <PLAN_SHA256>
  reviewed_head_sha: <APPROVED_BASE_HEAD_SHA>
  reviewer_kind: independent-read-only-agent
  review_verdict: approved
  ci_gate_check_run_id: <CI_GATE_CHECK_RUN_ID>
  blocking_findings: none
  ```

  Read the created comment back through GitHub API, require
  `created_at == updated_at`, and compute `REVIEW_BODY_SHA256` from exact body
  bytes after one outer trim. Record positive `REVIEW_COMMENT_ID`.

- [ ] **Step 6: Bind plan digest to live PR head and post request marker**

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
  review_comment_id: <REVIEW_COMMENT_ID>
  review_body_sha256: <REVIEW_BODY_SHA256>
  ci_gate_check_run_id: <CI_GATE_CHECK_RUN_ID>
  separation_model: single-maintainer-owner-attestation
  decision: review_requested
  ```

  Request comment must not contain `PLAN-APPROVAL-V2`, `decision: approved`, or
  a fenced approval template.

- [ ] **Step 7: Obtain exact owner approval**

  From fresh coordination/review context that performs no Tasks 1 through 12,
  post this exact plain-text body with no Markdown fence, prefix, or suffix:

  ```text
  PLAN-APPROVAL-V2
  plan_path: docs/superpowers/plans/2026-08-11-pr-1385-release-gate-hardening.md
  plan_sha256: <PLAN_SHA256>
  approved_base_head_sha: <APPROVED_BASE_HEAD_SHA>
  approver_login: nikhillinit
  review_comment_id: <REVIEW_COMMENT_ID>
  review_body_sha256: <REVIEW_BODY_SHA256>
  ci_gate_check_run_id: <CI_GATE_CHECK_RUN_ID>
  separation_model: single-maintainer-owner-attestation
  decision: approved
  accepted_exceptions: none
  ```

  Repository owner login must author record and retain current admin/write
  permission. Comment is edit-detected rather than called immutable:
  `updated_at != created_at` invalidates that record, deletion leaves no
  approval, and duplicates fail closed. Deletion followed by one exact unedited
  repost is a fresh approval with a new ID and timestamps; it must be re-read
  and re-recorded everywhere, never treated as continuation. Reactions, request
  comments, local notes, fenced templates, and approvals bound only to PR number
  are insufficient.

- [ ] **Step 8: Verify approval and arm required CI before implementation**

  Run verifier with `--require-exact-head` immediately before first Task 1 edit.
  Apply PR label `requires-plan-approval`; Task 1 adds a label-scoped verifier
  job to required `CI Gate Status`. Until that job lands, each pre-batch check
  is explicit operator procedure. Thereafter every pushed implementation head
  and final merge-ready head is machine-gated. Run locally without
  `--require-exact-head` before each later batch and require approved base
  remains ancestor of live head. Fail on any verifier error. Plan edits,
  non-descendant force-pushes, and Task 5 rebase require a new V2
  review/request/ approval sequence; ordinary descendant commits do not. Never
  carry approval across rebase by inference.

  Record approval comment URL, ID, created timestamp, author, and body SHA-256
  in PR description and later strict evidence manifest. Do not create repository
  session artifacts.

  For any later invalidating plan edit or non-descendant head rewrite, avoid a
  CI/approval cycle with this owner-audited gate-refresh protocol:

  1. run current verifier and record why refresh is required;
  2. remove `requires-plan-approval` before invalidating push; PR timeline is
     transition audit record;
  3. push exact new head and require `CI Gate Status` success with
     `plan-approval` skipped because label is absent;
  4. repeat Steps 5 through 7, binding new review/request/approval to that exact
     successful bootstrap check-run ID;
  5. reapply `requires-plan-approval`; Task 1's `labeled` trigger reruns CI at
     same head and now requires `plan-approval=success`;
  6. require second exact-head `CI Gate Status` success, then rerun verifier
     with `--require-exact-head` before any implementation edit.

  Approval records bind bootstrap check ID; current required check supplies
  independent post-approval enforcement. If head changes between either run,
  restart protocol. Never remove label to merge or execute implementation.

---

## Task 1: Reconfirm Facts, Wire Required CI, and Remove Audit Residue

**Files:**

- Modify: `.github/workflows/ci-unified.yml`
- Modify: `.github/workflows/release-proof.yml`
- Modify: `.gitignore`
- Create: `audit/knowledge-graph/scripts/rebuild-knowledge-graph.mjs`
- Modify: `audit/surface-contract-matrix/README.md`
- Regenerate and reapprove: `audit/surface-contract-matrix/MATRIX.md`,
  `audit/surface-contract-matrix/boot-proofs.json`,
  `audit/surface-contract-matrix/condition-overrides.json`,
  `audit/surface-contract-matrix/definition-overrides.json`,
  `audit/surface-contract-matrix/dormant-candidates.json`,
  `audit/surface-contract-matrix/dormant-inventory.json`,
  `audit/surface-contract-matrix/g1-review.json`,
  `audit/surface-contract-matrix/listener-dispositions.json`,
  `audit/surface-contract-matrix/matrix.json`,
  `audit/surface-contract-matrix/orphans.json`,
  `audit/surface-contract-matrix/requirements.json`,
  `audit/surface-contract-matrix/runtime-exclusions.json`, and
  `audit/surface-contract-matrix/source-inventory.json`
- Create: `tests/unit/audit/rebuild-knowledge-graph.test.mjs`
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

- [ ] **Step 2: Reconcile live CI without replaying closed fixes**

  At reviewed head `300de739`, stale `process` import is already absent and
  exact-head lint passes. Do not manufacture another lint edit. That head's
  later `unit-fast` run failed only because
  `surface-contract-matrix-approve.test.ts` rollback case exceeded its 60-second
  per-test limit under full-suite load; exact isolated rerun passed all 21 tests
  in 13.38 seconds, with rollback case at 9.88 seconds.

  Treat these numbers as historical diagnosis, not proof for current head. Task
  0 Step 5 requires fresh exact-head CI. If same timeout recurs at current head,
  reproduce isolated and under unit-fast scheduling before editing. A repeated
  deterministic test-infrastructure failure requires another plan-only revision
  naming exact root-cause fix, test, and bootstrap scope, then returns to Task 0
  Step 1; never approve with a failing required check or merely raise timeout
  without evidence.

- [ ] **Step 3: Verify no obsolete lint delta exists**

  ```bash
  git diff -- tests/unit/scripts/assert-canary-residue.test.mjs
  gh pr checks 1385
  ```

  Expected: no Task 1 diff for residue unit test; current checks are read from
  live head.

- [ ] **Step 4: Remove prohibited tracked artifacts and build exact-SHA route
      projection**

  Replace the `.gitignore` knowledge-graph block exactly:

  ```gitignore
  !audit/knowledge-graph/
  audit/knowledge-graph/*
  !audit/knowledge-graph/scripts/
  !audit/knowledge-graph/scripts/**
  ```

  This keeps all generated `out/` content ignored while allowing owned generator
  source to be tracked. Delete both newly tracked generated files. Delete the
  new bounded code-review report; it is a session artifact, and its
  read-only/no-production-caller claims are stale. Do not archive or replace
  either artifact in repository.

  The documented `audit/knowledge-graph/scripts/rebuild-knowledge-graph.mjs`
  does not exist in current tree or history. Create that owned script as a
  route-only adapter for the existing `seed-matrix.mjs`/`validate-matrix.mjs`
  input contract; do not claim it recreates full vendor knowledge graph.

  Export `buildRouteKnowledgeGraph({ repoRoot, outputDir, expectedSha, mode })`
  and write exactly these ignored files under caller-supplied `outputDir` (CLI
  default `audit/knowledge-graph/out`):

  - `manifest.json` with schema `surface-route-projection-v1`, exact snake-case
    fields consumed by existing tools (`snapshot_id`, `repo_head`,
    `fresh_for_checkout=true`, mode-dependent `valid_for_release_proof`, and
    `node_type_counts` containing exact `APIEndpoint`, `ClientRoute`, and
    `WorkerJob` counts), deterministic source hashes, and `artifacts` entries
    for `nodes-routes.jsonl`/`edges-routes.jsonl` containing `snapshot_id`,
    SHA-256, and byte length; omit `valid_for_coding`, full-graph completeness,
    and coding-authority claims. `valid_for_release_proof` is true only in
    `mode='release'` after strict count validation; seed output sets it false;
  - `nodes-routes.jsonl` containing only current `APIEndpoint`, `ClientRoute`,
    and `WorkerJob` records. Derive APIs from existing runtime-inspection
    profiles. Do **not** use `extractProductRoutes` for client routes: that
    helper parses backend product-listener graphs and emits `api:`/`listener:`
    IDs. Export a new owned `extractClientRouteProjection({ repoRoot })` helper
    from the generator. It imports the route values from
    `shared/routes/app-route-definitions.ts` and `ROUTE_GOVERNANCE_REGISTRY`,
    then uses the TypeScript compiler AST to prove the component maps in
    `client/src/app/app-routes.tsx` and the mount sites in
    `client/src/app/app-router.tsx`. The mounted set is exactly the union of
    `/`, `/login`, `APP_ROUTE_DEFINITIONS`, `ARCHIVED_PLACEHOLDER_ROUTES`,
    `LP_ROUTE_DEFINITIONS`, `LP_INDEX_REDIRECT_PATH`, and the values of
    `LEGACY_REDIRECT_ROUTES`, `PUBLIC_ENTRY_ROUTES`, and `ADMIN_GATED_ROUTES`.
    Every app/LP definition must have exactly one component-map entry, every
    dynamic collection must have a matching `.map` mount, and literal
    entry/redirect routes must have one JSX mount. The governance set must equal
    the mounted set after removing only the explicit bootstrap exceptions
    `/login` and `LP_INDEX_REDIRECT_PATH`; any other missing, extra, duplicate,
    or unresolved route fails closed. Each client record carries path,
    component/redirect identity, definition site, and mount site.

    Derive workers by grouping `scanBullmqConstructors` findings by unique
    `queue_name`, with every constructor site retained as evidence, then
    reconcile each discovered name against `QUEUE_CATALOG`. Do not synthesize a
    `WorkerJob` node for catalog-only queues with no BullMQ constructor; current
    scanner result is nineteen constructor sites grouped into ten unique queue
    names, while the matrix separately retains eleven catalog/governance rows.
    The stale tracked KG count of eight is a Task 1 rebaseline input, not a
    target to preserve. Every record binds exact commit SHA and source location.
    Every JSONL item has `record: 'node'` and preserves existing consumer keys:
    API IDs are `api:<METHOD> <path>` with `method`/`path`; client IDs are
    `croute:<path>` with `path` plus component or redirect; worker IDs are
    `worker:<queue_name>` with `name`/`queue`;

  - `edges-routes.jsonl` containing `record: 'edge'` items with deterministic
    IDs plus `from`, `to`, `source_path`, and `line_start` for `DEFINES`,
    `EXPOSES`, and `MOUNTS` structural fallback edges derived from discovered
    source sites. It may be empty only when current runtime/registry discovery
    supplies every node and both seed plus validation still pass.

  `mode='release'` fails on dirty tracked inputs, HEAD/`expectedSha` mismatch,
  duplicate IDs, missing source locations, source-inspection error, count
  mismatch against `source-inventory.json.kg_counts` for these three types, or
  writes outside output directory. `mode='seed'` permits expected count drift so
  existing seed can regenerate tracked matrix/inventory after an intentional
  route change; it never weakens discovery or duplicate/source checks. Use exact
  commit timestamp rather than wall clock so identical tree/SHA yields identical
  bytes. Run script through `npx tsx` because current discovery registries are
  TypeScript.

  Leave `seed-matrix.mjs` and `validate-matrix.mjs` unchanged so their tracked
  source hashes remain valid. Update README regeneration sequence to call new
  generator through
  `npx tsx audit/knowledge-graph/scripts/rebuild-knowledge-graph.mjs --mode seed --expected-sha <committed-source-sha>`
  and state that `--fresh` requires the full independent G1 review plus owner
  closure in Step 9; it is never a mechanical reset-and-carry operation. Release
  proof uses strict release mode. Existing validator independently checks matrix
  source hashes, runtime registrations, policy/governance registries, and BullMQ
  discovery after consuming projection.

  In `release-proof.yml`, rebuild ignored route projection at exact checked-out
  candidate SHA immediately before strict matrix validation:

  ```bash
  cleanup_kg() {
    rm -rf audit/knowledge-graph/out
  }
  trap cleanup_kg EXIT HUP INT TERM
  npx tsx audit/knowledge-graph/scripts/rebuild-knowledge-graph.mjs \
    --mode release \
    --expected-sha "$CANDIDATE_SHA"
  node -e 'const m=require("./audit/knowledge-graph/out/manifest.json"); if (!m.fresh_for_checkout || !m.valid_for_release_proof || m.repo_head !== process.env.CANDIDATE_SHA) process.exit(1)'
  npx tsx audit/surface-contract-matrix/scripts/validate-matrix.mjs
  ```

  Keep output ignored and runner-local. Cleanup must run on success and failure;
  no generated route projection or other generated knowledge-graph output may be
  uploaded or committed. Generator source remains tracked.

  Add regressions requiring:

  - `git ls-files audit/knowledge-graph/out` is empty;
  - the removed code-review path is absent;
  - generator RED tests cover release-vs-seed count behavior, exact SHA,
    deterministic bytes, dirty tracked input, duplicate/missing records, source
    inspection failure, output confinement, and artifact hashes;
  - generator output lets unchanged `seed-matrix.mjs` and `validate-matrix.mjs`
    complete against a controlled fixture;
  - real-repository client projection has exact definition/component/mount
    parity, accepts only `/login` plus `/lp` as explicit governance exceptions,
    and fails when any AST anchor or governance record is removed;
  - worker projection groups nineteen current constructor sites into ten unique
    queue nodes, reconciles every discovered queue with `QUEUE_CATALOG`, and
    does not manufacture the catalog-only `economics-calc` node;
  - release proof rebuilds before `validate-matrix` and checks manifest
    `repo_head` against `CANDIDATE_SHA`;
  - an unconditional cleanup trap exists;
  - no workflow uploads `audit/knowledge-graph/out` or route projection.

- [ ] **Step 5: Wire approval into required CI**

  Add `plan-approval` job to `ci-unified.yml`. It runs only for pull requests
  labeled `requires-plan-approval`, checks out full history, and invokes:

  ```bash
  node scripts/release/verify-plan-approval.mjs \
    --repo "$GITHUB_REPOSITORY" \
    --pr "${{ github.event.pull_request.number }}" \
    --plan-path docs/superpowers/plans/2026-08-11-pr-1385-release-gate-hardening.md \
    --approver-login nikhillinit
  ```

  Give job only `actions: read`, `contents: read`, `checks: read`,
  `issues: read`, and `pull-requests: read`; pass built-in `GITHUB_TOKEN` as
  `GH_TOKEN`. Any API denial fails job closed. Expand `pull_request.types` to exact
  `[opened, synchronize, reopened, labeled, unlabeled]` so gate-transition label
  changes rerun same-head CI. Add job to `CI Gate Status.needs`. Gate logic
  requires `success` when label is present and accepts only `skipped` when
  absent. Update pinned gate-feeder and trigger regressions; execute
  workflow/evaluator tests proving failed/missing/edited/descendant-invalid
  approval makes required gate fail. No `continue-on-error`, substring/grep
  parser, or reporting-only downgrade.

- [ ] **Step 6: Preserve two unresolved review requirements**

  Record these as acceptance tests in Task 9:

  - same-key portfolio PATCH replay returns identical response and unchanged
    state;
  - stale original `expectedVersion` returns `409 VERSION_CONFLICT` and state
    remains unchanged.

  Do not resolve threads until deployed-canary test code and targeted tests
  exist.

- [ ] **Step 7: Verify cleanup, projection, and required approval gate**

  ```bash
  test ! -e audit/knowledge-graph/out/manifest.json
  test ! -e audit/knowledge-graph/out/nodes-routes.jsonl
  git check-ignore --no-index -q audit/knowledge-graph/out/manifest.json
  test ! -e docs/3-code-review/CR_w2_v1.6.0-child-f-batch6-residue.md
  TZ=UTC npx vitest run \
    tests/unit/audit/rebuild-knowledge-graph.test.mjs \
    tests/regressions/ci-fail-closed.test.ts \
    --config vitest.config.mjs --configLoader native --project=server
  npx eslint --no-ignore \
    audit/knowledge-graph/scripts/rebuild-knowledge-graph.mjs \
    tests/unit/audit/rebuild-knowledge-graph.test.mjs \
    tests/regressions/ci-fail-closed.test.ts \
    --max-warnings 0
  ```

- [ ] **Step 8: Commit**

  ```bash
  git add \
    .github/workflows/ci-unified.yml \
    .github/workflows/release-proof.yml \
    .gitignore \
    audit/knowledge-graph/scripts/rebuild-knowledge-graph.mjs \
    audit/surface-contract-matrix/README.md \
    tests/unit/audit/rebuild-knowledge-graph.test.mjs \
    tests/regressions/ci-fail-closed.test.ts
  git add -u \
    audit/knowledge-graph/out/manifest.json \
    audit/knowledge-graph/out/nodes-routes.jsonl \
    docs/3-code-review/CR_w2_v1.6.0-child-f-batch6-residue.md
  test -z "$(git ls-files audit/knowledge-graph/out)"
  git commit -m "fix(release): keep exact-sha audit evidence ephemeral"
  ```

- [ ] **Step 9: Rebuild and independently reapprove governed matrix**

  Current `source-inventory.json.kg_counts.WorkerJob` is 8, while current
  scanner truth is 19 constructor sites across 10 unique queue names. Do not
  weaken discovery or preserve stale count. After Step 8's source commit, use
  the repository's reset-safe authoring path and perform a fresh full G1 review.
  This is deliberate full reapproval, not blind decision carry-forward.

  ```bash
  set -eu
  test -z "$(git status --porcelain)"
  SOURCE_SHA="$(git rev-parse HEAD)"
  MATRIX_SNAPSHOT="$(mktemp -d)"
  cleanup_matrix_seed() {
    rm -rf "$MATRIX_SNAPSHOT" audit/knowledge-graph/out
  }
  trap cleanup_matrix_seed EXIT HUP INT TERM

  npx tsx audit/surface-contract-matrix/scripts/approve-matrix.mjs \
    --fresh \
    --review-file audit/surface-contract-matrix/g1-review.json
  npx tsx audit/knowledge-graph/scripts/rebuild-knowledge-graph.mjs \
    --mode seed \
    --expected-sha "$SOURCE_SHA"
  node audit/surface-contract-matrix/scripts/boot-proof.mjs
  npx tsx audit/surface-contract-matrix/scripts/seed-matrix.mjs
  for artifact in matrix.json source-inventory.json listener-dispositions.json dormant-candidates.json dormant-inventory.json runtime-exclusions.json condition-overrides.json definition-overrides.json orphans.json; do
    cp "audit/surface-contract-matrix/$artifact" "$MATRIX_SNAPSHOT/$artifact"
  done
  npx tsx audit/surface-contract-matrix/scripts/seed-matrix.mjs
  for artifact in matrix.json source-inventory.json listener-dispositions.json dormant-candidates.json dormant-inventory.json runtime-exclusions.json condition-overrides.json definition-overrides.json orphans.json; do
    cmp "$MATRIX_SNAPSHOT/$artifact" "audit/surface-contract-matrix/$artifact"
  done
  npx tsx audit/surface-contract-matrix/scripts/classify-pass.mjs
  npx tsx audit/surface-contract-matrix/scripts/approve-matrix.mjs \
    init-review \
    --review-file audit/surface-contract-matrix/g1-review.json
  ```

  A fresh read-only G1 reviewer must inspect every row, exposure obligation,
  listener, dormant candidate, runtime exclusion, orphan, requirement-family
  absence claim, and diff against prior closed matrix. Reviewer supplies exact
  immutable evidence reference. Release owner—not implementation actor—sets
  `approver_id: nikhillinit`, exact `evidence_ref`, reviewed fields, closure
  fields, and no blanket approval for an uninspected entry. Then run:

  ```bash
  set -eu
  SOURCE_SHA="$(git rev-parse HEAD)"
  cleanup_matrix_seed() {
    rm -rf audit/knowledge-graph/out
  }
  trap cleanup_matrix_seed EXIT HUP INT TERM
  npx tsx audit/knowledge-graph/scripts/rebuild-knowledge-graph.mjs \
    --mode seed \
    --expected-sha "$SOURCE_SHA"
  G1_EVIDENCE='<exact immutable review evidence reference>'
  npx tsx audit/surface-contract-matrix/scripts/approve-matrix.mjs \
    --review-file audit/surface-contract-matrix/g1-review.json \
    --approver nikhillinit \
    --evidence "$G1_EVIDENCE" \
    --dry-run
  npx tsx audit/surface-contract-matrix/scripts/approve-matrix.mjs \
    --review-file audit/surface-contract-matrix/g1-review.json \
    --approver nikhillinit \
    --evidence "$G1_EVIDENCE" \
    --close-g1
  npx tsx audit/surface-contract-matrix/scripts/validate-matrix.mjs
  npx tsx audit/surface-contract-matrix/scripts/render-matrix.mjs
  cleanup_matrix_seed
  trap - EXIT HUP INT TERM
  git diff --check
  git add -A audit/surface-contract-matrix
  git commit -m "chore(audit): rebuild governed surface matrix"
  ```

  `--close-g1` may delete the temporary tracked review manifest by design; stage
  that deletion. Commit no ignored KG output. Review `git diff --cached` before
  commit and reject changes outside declared matrix artifacts.

- [ ] **Step 10: Prove strict projection against clean committed repository**

  Run only after Step 9 leaves a clean tracked worktree. Fixture success is not
  sufficient.

  ```bash
  set -eu
  test -z "$(git status --porcelain)"
  CANDIDATE_SHA="$(git rev-parse HEAD)"
  cleanup_kg() {
    rm -rf audit/knowledge-graph/out
  }
  trap cleanup_kg EXIT HUP INT TERM
  npx tsx audit/knowledge-graph/scripts/rebuild-knowledge-graph.mjs \
    --mode release \
    --expected-sha "$CANDIDATE_SHA"
  CANDIDATE_SHA="$CANDIDATE_SHA" node -e 'const m=require("./audit/knowledge-graph/out/manifest.json"); if (!m.fresh_for_checkout || !m.valid_for_release_proof || m.repo_head !== process.env.CANDIDATE_SHA) process.exit(1)'
  npx tsx audit/surface-contract-matrix/scripts/validate-matrix.mjs
  cleanup_kg
  trap - EXIT HUP INT TERM
  test -z "$(git status --porcelain)"
  ```

  Require API/client/unique-worker counts equal freshly reapproved
  `source-inventory.json.kg_counts`; current client count is 43 and unique
  discovered worker count is 10. Any drift stops Task 1 and repeats Step 9;
  never trim truthful projection to stale counts.

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
      [string] $CapitalReadyPath,

      [Parameter(Mandatory = $true)]
      [ValidatePattern('^[1-9][0-9]{0,31}$')]
      [string] $SchemaApplyRunId,

      [Parameter(Mandatory = $true)]
      [ValidatePattern('^1$')]
      [string] $SchemaApplyRunAttempt,

      [Parameter(Mandatory = $true)]
      [ValidatePattern('^[1-9][0-9]{0,31}$')]
      [string] $SchemaApplyArtifactId,

      [Parameter(Mandatory = $true)]
      [ValidatePattern('^sha256:[a-f0-9]{64}$')]
      [string] $SchemaApplyArtifactDigest,

      [Parameter(Mandatory = $true)]
      [ValidatePattern('^[a-f0-9]{64}$')]
      [string] $SchemaApplyReceiptFileSha256,

      [Parameter(Mandatory = $true)]
      [ValidatePattern('^[a-f0-9]{40}$')]
      [string] $SchemaPrecursorSha,

      [Parameter(Mandatory = $true)]
      [ValidateSet('primary', 'rollback')]
      [string] $ReleaseMode
  )
  ```

  `-ReleaseMode` lands here so the dispatcher invocation contract, operator
  docs, and dispatcher regressions in this task are internally consistent at
  this task's verify step. Task 8 adds the rollback-only parameters
  (`-RollbackPrNumber`/`-RollbackPrHeadSha`), the workflow-side consumption of
  `release_mode`, and the cross-mode parameter rules.

  Dispatcher sequence:

  1. Require `gh` and `node`.
  2. Resolve repository and exact live `main` SHA.
  3. Run codec `encode` with four file paths.
  4. Reject empty/multiline codec output.
  5. Build ordered JSON with `expected_sha`, `operator_evidence_b64`,
     `release_mode`, `schema_apply_run_id`, `schema_apply_run_attempt`,
     `schema_apply_artifact_id`, `schema_apply_artifact_digest`,
     `schema_apply_receipt_file_sha256`, and `schema_precursor_sha`.
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
  - `release-production.yml` requires a `release_mode` input (`primary` or
    `rollback`, no default; consumed by Task 8's preflight);
  - `release-production.yml` requires exact schema apply
    run/attempt/artifact/digest/receipt-file-hash/precursor inputs, including
    literal `schema_apply_receipt_file_sha256`, and accepts only attempt 1;
  - `scripts/deploy-production.ps1` supplies `expected_sha`,
    `operator_evidence_b64`, `release_mode`, and all schema evidence fields
    through `--json`;
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
    -ReleaseMode primary `
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

  Remove raw `gh workflow run` example for the release dispatcher (the
  canary-recovery workflow keeps its own documented `gh workflow run`
  invocation — it is not a release dispatch). Dispatcher regression coverage
  in this task must assert `-ReleaseMode` is mandatory with no default and
  validated set `primary`/`rollback`. The rollback runbook invocation
  (`-ReleaseMode rollback -RollbackPrNumber <n> -RollbackPrHeadSha <40-hex>`)
  and the cross-mode regressions (`primary` forbids rollback-only parameters,
  `rollback` requires both) are documented and tested in Task 8, where those
  parameters exist.

- [ ] **Step 8: Verify**

  ```bash
  TZ=UTC npx vitest run \
    tests/unit/scripts/operator-evidence-bundle.test.mjs \
    tests/regressions/ci-fail-closed.test.ts \
    --config vitest.config.mjs --configLoader native --project=server
  npx eslint --no-ignore \
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
    services: {
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
- Inspect only: `shared/routes/api-route-manifest.ts`
- Modify: `tests/unit/schema/g3-foundations-schema.test.ts`
- Modify: `tests/unit/migration-ledger.test.ts`
- Modify: `tests/unit/prod-schema-manifest-coverage.test.ts`
- Modify: `tests/integration/prod-schema-clone.test.ts`
- Create: `tests/integration/g3-schema-forward-compatibility.test.ts`
- Modify: `.github/workflows/prod-schema-reconcile.yml`
- Create: `shared/contracts/schema-reconcile-receipt-v1.contract.ts`
- Create: `scripts/release/build-schema-reconcile-receipt.ts`
- Create: `tests/unit/contracts/schema-reconcile-receipt-v1.contract.test.ts`
- Create: `tests/unit/scripts/build-schema-reconcile-receipt.test.ts`
- Modify: `tests/regressions/ci-fail-closed.test.ts`
- Modify: `scripts/DEPLOYMENT_AUTOMATION_README.md`
- Inspect only: `docs/1-plans/F_1.2.0_v1.4-release-proof-activation.plan.md`

**Delivery split:**

- Schema precursor branch/PR `codex/pr-1385-schema-expand`: schema modules,
  migration, journal, production schema manifest, schema/clone/compatibility
  tests, and read-only schema-evidence receipt/retention hardening required
  before first apply.
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

  Before verification, harden schema evidence workflow that will perform first
  and only `0053` apply. Add strict `schema-reconcile-receipt-v1` contract and
  builder. Successful apply receipt contains only repository, workflow path,
  exact run ID/attempt, mode `apply`, source SHA, manifest
  `30-g3-release-gate-hardening`, migration `0053`, predecision
  `APPLY-MISSING-DDL`, postdecision `SKIP`, bounded build time, and literal
  `result='applied_and_clean'`. It contains no database identifiers, report
  body, connection data, arbitrary metadata, or future artifact ID/digest.

  Build receipt only after apply and clean post-audit both succeed. Upload
  redacted reports plus receipt as one immutable artifact named
  `prod-schema-reconcile-<runId>-<runAttempt>-<mode>-<expectedSha>` with
  `retention-days: 90`. Require repository artifact-retention policy permits 90
  days before apply; shorter policy blocks dispatch. Apply must use attempt 1,
  so its exact name ends `-1-apply-<schemaPrecursorSha>`. Capture upload
  action's artifact ID/digest and recompute receipt-file SHA-256 separately.
  Regression rejects fixed/run-only names, retention below 90, apply success
  without strict receipt, report/receipt upload on a different artifact, unknown
  receipt fields, secrets, and rerun attempt reuse.

  Before first apply, repository owner provisions `production-schema` secret
  `SCHEMA_EVIDENCE_RETENTION_READ_TOKEN`: fine-grained token scoped only to this
  repository with Administration read and no write permission. First apply-mode
  workflow step uses token only for
  `GET /repos/{owner}/{repo}/actions/permissions/artifact-and-log-retention`,
  requires configured artifact retention at least 90 days, masks token, and
  emits no response body. Missing token, 403/404, malformed response, or shorter
  retention fails before database connection or mutation. Audit mode does not
  require token. Regression fixes step ordering and forbids token use in argv,
  logs, artifacts, later steps, or any write API. Revoke/rotate credential after
  first governed release under normal secret policy; retained artifact access
  uses ordinary `actions: read`.

  Document exact secret scope, preflight endpoint, 90-day window, attempt-1
  rule, post-apply evidence-loss stop condition, and rotation in deployment
  automation README before precursor merge.

  Ninety days is governed precursor-to-first-release window. If exact artifact
  expires before runtime release, stop and write a new schema-evidence recovery
  decision; do not rerun apply against already-clean schema or infer historical
  transition from current audit.

  ```bash
  TZ=UTC npx vitest run \
    tests/unit/schema/g3-foundations-schema.test.ts \
    tests/unit/migration-ledger.test.ts \
    tests/unit/prod-schema-manifest-coverage.test.ts \
    tests/unit/contracts/schema-reconcile-receipt-v1.contract.test.ts \
    tests/unit/scripts/build-schema-reconcile-receipt.test.ts \
    tests/integration/prod-schema-clone.test.ts \
    tests/integration/g3-schema-forward-compatibility.test.ts \
    tests/regressions/ci-fail-closed.test.ts \
    --config vitest.config.mjs --configLoader native --project=server
  npm run validate:schema-drift
  npx eslint --no-ignore \
    scripts/release/build-schema-reconcile-receipt.ts \
    tests/unit/contracts/schema-reconcile-receipt-v1.contract.test.ts \
    tests/unit/scripts/build-schema-reconcile-receipt.test.ts \
    tests/regressions/ci-fail-closed.test.ts \
    --max-warnings 0
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
    .github/workflows/prod-schema-reconcile.yml \
    shared/contracts/schema-reconcile-receipt-v1.contract.ts \
    scripts/release/build-schema-reconcile-receipt.ts \
    tests/unit/schema/g3-foundations-schema.test.ts \
    tests/unit/migration-ledger.test.ts \
    tests/unit/prod-schema-manifest-coverage.test.ts \
    tests/unit/contracts/schema-reconcile-receipt-v1.contract.test.ts \
    tests/unit/scripts/build-schema-reconcile-receipt.test.ts \
    tests/integration/prod-schema-clone.test.ts \
    tests/integration/g3-schema-forward-compatibility.test.ts \
    tests/regressions/ci-fail-closed.test.ts \
    scripts/DEPLOYMENT_AUTOMATION_README.md
  git commit -m "feat(schema): expand PR 1385 release gate schema"
  ```

  Open schema-only PR, pass protected checks, and merge through normal branch
  protection. Resolve exact resulting `main` SHA. Run
  `prod-schema-reconcile.yml` in apply mode against that exact default-branch
  SHA, then audit mode against same SHA. Require clean audit and retain redacted
  apply/audit run URLs plus migration ID; never retain connection data. Apply
  must succeed on run attempt 1. A fresh apply run is allowed only when exact
  Actions job/step evidence proves mutation step never started. If apply step
  started, its outcome is unknown, current schema is already clean, or receipt
  build/upload fails after successful mutation, stop for explicit
  schema-evidence recovery decision; never dispatch another apply merely to
  recreate missing evidence. Do not rerun apply under same run ID. Regression
  executes successful apply followed by receipt/upload failure and requires
  stop, not fresh apply.

  Before dispatch, verify protected retention-read secret exists without
  printing it. Release owner approval of `production-schema` environment grants
  this read credential to exact apply run; workflow API preflight is
  authoritative, not unverified caller-supplied retention number.

  Read exact successful apply run and its sole unexpired
  `prod-schema-reconcile-<runId>-1-apply-<schemaPrecursorSha>` artifact through
  GitHub API. Record apply run ID, `run_attempt=1`, artifact ID, API/upload
  digest, receipt-file SHA-256, and precursor SHA. Download by artifact ID,
  verify archive digest plus receipt-file hash, parse strict receipt, and
  require migration `0053`, apply-to-clean transition, and matching precursor
  SHA. These values become mandatory Task 2 dispatcher inputs after runtime
  rebase. Never select latest run or artifact by name alone; duplicate artifact,
  absent digest/receipt, or less than 30 days remaining before planned release
  blocks runtime release.

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

  Rebase is a non-descendant head rewrite. Before rebasing, run current
  verifier, remove `requires-plan-approval`, and confirm PR timeline records
  transition. Rebase PR #1385 onto precursor merge without adding Task 6 edits,
  then push. Rerun schema tests, clone/compatibility test,
  `npm run validate:schema-drift`, and production audit. Require migration
  `0053` already applied and audit clean.

  Complete Task 0 gate-refresh protocol: exact rebased head first earns green
  `CI Gate Status` with approval job skipped; new read-only review/request/owner
  approval binds that bootstrap check; reapply label; same head then earns
  second green `CI Gate Status` with approval job successful; finally run
  verifier with `--require-exact-head`. Old pre-rebase review/approval records
  are historical only. No Task 6 file may change until second CI and verifier
  both pass. Add command table to scenario-set route manifest only in first
  approved Task 6 runtime commit.

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
- Modify: `.github/workflows/release-proof.yml`
- Create:
  `shared/contracts/release-canary-residue-characterization-v1.contract.ts`
- Create:
  `tests/unit/contracts/release-canary-residue-characterization-v1.contract.test.ts`
- Modify: `tests/regressions/ci-fail-closed.test.ts`

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

  Make characterization immutable and exact-SHA bound. When
  `RELEASE_CANARY_CHARACTERIZATION_RESULT_PATH` and
  `RELEASE_CANARY_CHARACTERIZATION_SOURCE_SHA` are both present, integration
  test writes one strict, sanitized `release-canary-residue-characterization-v1`
  record only after every success and injected-failure assertion passes. Record
  contains source SHA, reserved vector, ordered named phase vectors, final
  vector, test contract version, and literal `result='passed'`; it contains no
  database IDs, row bodies, local paths, credentials, or arbitrary metadata.
  Write mode `0600` through temp file plus atomic rename. Contract rejects
  unknown fields, non-monotonic phases, vector sums, source mismatch, missing
  failure-boundary coverage, and any phase exceeding reservation.

  Add dedicated `canary-residue-characterization` job to reusable
  `release-proof.yml`. It checks out exact `expected_sha`, runs only this
  Testcontainers characterization with result-path/source-SHA environment,
  validates resulting contract, recomputes file SHA-256, and uploads immutable
  artifact
  `release-canary-residue-characterization-v1-<runId>-<runAttempt>-<sourceSha>`
  with 30-day retention. Capture artifact ID, exact name, upload digest, file
  SHA-256, and source SHA as job and `workflow_call` outputs named exactly
  `characterization_artifact_id`, `characterization_artifact_name`,
  `characterization_artifact_digest`, `characterization_file_sha256`, and
  `characterization_source_sha`; delete local file under `if: always()`. Add
  this job to `g3-exact-sha-verdict.needs` and require success. A rerun gets a
  distinct attempt-qualified artifact; missing file, prior-attempt substitution,
  or name/digest/source mismatch fails closed.

- [ ] **Step 8: Verify**

  ```bash
  TZ=UTC npx vitest run \
    tests/unit/services/canary-residue-service.test.ts \
    tests/unit/phase2a/fund-persistence-service.behavior.test.ts \
    tests/unit/scripts/assert-canary-residue.test.mjs \
    tests/unit/scripts/purge-canary-runs.test.ts \
    tests/unit/contracts/release-canary-residue-characterization-v1.contract.test.ts \
    tests/integration/release-canary-lifecycle.test.ts \
    tests/integration/canary-exclusion-differential.test.ts \
    tests/integration/release-canary-residue-characterization.test.ts \
    tests/regressions/ci-fail-closed.test.ts \
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
    shared/contracts/release-canary-residue-characterization-v1.contract.ts \
    tests/unit/contracts/release-canary-residue-characterization-v1.contract.test.ts \
    tests/integration/release-canary-lifecycle.test.ts \
    tests/integration/canary-exclusion-differential.test.ts \
    tests/integration/release-canary-residue-characterization.test.ts \
    .github/workflows/release-proof.yml \
    tests/regressions/ci-fail-closed.test.ts
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
- Create: `.github/workflows/release-canary-recovery.yml`
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
  secret-shaped keys/values. Upload immutable sanitized artifact named
  `release-baseline-v1-<runId>-<runAttempt>-<plannedPrHeadSha>` with fixed
  `retention-days: 30` before runtime merge. Capture upload action's artifact
  ID/digest and recompute file SHA-256 separately. File mode `0600`; workflow
  deletes local copy under `if: always()`. A rerun produces a distinct
  attempt-qualified artifact; capture failure blocks merge.

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
  commit. This is a non-descendant rewrite and invalidates the prior plan gate.
  Before rebase, run current verifier, remove `requires-plan-approval`, and
  confirm the owner-audited label transition in PR timeline. Push the rebased
  head with no Step 6 runtime edits, obtain exact-head green bootstrap CI with
  `plan-approval` skipped, then complete the full Task 0 gate-refresh protocol:
  new read-only review, review request, owner approval, label reapplication,
  second exact-head green CI with `plan-approval=success`, and
  `verify-plan-approval --require-exact-head`. No Step 6 file may change until
  that second CI and verifier both pass. Dispatcher integration and runtime
  workflow consumption remain in PR #1385.

  Extend sole mutation dispatcher and `release-production.yml` inputs with exact
  `baseline_run_id`, `baseline_run_attempt`, `baseline_artifact_id`,
  `baseline_artifact_digest`, and `baseline_file_sha256`, and, in rollback mode
  only, exact `rollback_pr_number` and `rollback_pr_head_sha` (the required
  `release_mode` input and mandatory `-ReleaseMode` parameter, validated set
  `primary`/`rollback` with no default, already exist from Task 2; this task
  adds their workflow-side consumption). PowerShell exposes
  mandatory `-BaselineRunId`, `-BaselineRunAttempt`, `-BaselineArtifactId`,
  `-BaselineArtifactDigest`, and `-BaselineFileSha256` with decimal-positive,
  positive-attempt, `sha256:<64-lowercase-hex>`, and 64-hex validation, plus
  rollback-only `-RollbackPrNumber`/`-RollbackPrHeadSha` (decimal-positive and
  40-hex validation; forbidden in primary mode, both required in rollback
  mode — cross-mode dispatcher regressions land here). All
  enter compact stdin dispatch JSON, never heuristic lookup.

  Post-merge `baseline-policy-preflight` downloads by exact artifact ID and
  exact successful `capture-release-baseline.yml` run ID; it rejects wrong
  workflow, repository, actor/owner, run attempt, artifact name/ID/digest/file
  hash, expired/duplicate artifact, or edited plan binding. It proves baseline
  `main` is ancestor of release SHA and plan digest still matches, then proves
  release lineage in exactly one of two explicit modes selected by a required
  `release_mode` dispatch input (dispatcher parameter, validated, defaulting
  to nothing — an unset or unknown mode fails closed):
  - `release_mode=primary`: GitHub PR #1385 head equals planned final head and
    PR #1385 merge commit (`pr.mergeCommitSha`) is the release SHA;
  - `release_mode=rollback`: the release SHA is the merge commit of a
    human-reviewed forward-revert PR whose number, final head SHA, and merge
    metadata are supplied as exact dispatch inputs (`rollback_pr_number`,
    `rollback_pr_head_sha`) and verified against GitHub PR API
    (`pr.headRefOid` equals the supplied head, `pr.mergeCommitSha` equals the
    release SHA, PR is merged into `main`); the baseline artifact consumed is
    still the ORIGINAL pre-runtime-merge baseline, which remains the rollback
    target, and the revert release runs the same schema audit, provider,
    operator-evidence, and canary gates. PR lineage alone does not prove
    revert semantics, so rollback mode additionally proves application-tree
    restoration machine-verifiably: the preflight job explicitly fetches both
    the baseline application SHA recorded in the baseline artifact and the
    rollback release SHA (never assuming either is present in a shallow
    checkout), runs `git diff --name-only <baseline_application_sha>
    <release_sha>`, and requires every differing path to fall inside an
    allowlist enumerated as a constant in the preflight script and limited to
    release control-plane paths (`.github/workflows/`, `scripts/release/`,
    `scripts/deploy-production.ps1`, their tests under
    `tests/unit/scripts/` and `tests/regressions/`, and `docs/`) — these must
    survive the revert or the hardened release/recovery workflows themselves
    would be reverted. Any differing path outside the allowlist fails closed;
    an empty diff also passes. Regression tests cover a revert that misses an
    application file, a revert that sneaks a non-control-plane change, and a
    clean revert.

  Never select latest artifact/run or a name-only match in either mode.

  Declare `environment: Production` on `baseline-policy-preflight` so only this
  read-only job can read protected provider IDs and residue policy variables. It
  performs no provider, database, or repository mutation. Task 11 extends its
  validated normalized outputs into `baseline` and `policy-config` fragments;
  `validate-target` remains an unprivileged SHA fence and is never a fragment
  producer.

  Give only `baseline-policy-preflight` in `release-production.yml`
  `contents: read`, `actions: read`, and `pull-requests: read`; the latter
  proves exact PR head/merge metadata. Add static regression proving permissions
  are present on that job, no write permission exists, and no repository-wide
  permission broadening substitutes for it.

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

  If hard cancellation prevents finalizer, recovery executes on exactly one
  authorized production surface: a manual `workflow_dispatch` workflow
  `.github/workflows/release-canary-recovery.yml`, gated by the
  `environment: Production` approval, receiving the same `DATABASE_URL`
  secret delivery as the release workflow's canary jobs (no GitHub-stored SSH,
  no direct production SSH, no local-machine database credentials). Its typed
  inputs mirror the CLI flags exactly (`github_run_id`, `github_run_attempt`,
  `expected_sha`, and for `mark-failed` additionally `fund_id`,
  `canary_run_id`); it runs `resolve` then `mark-failed`, runs the
  post-recovery global residue assertion in the same job, uploads only a
  sanitized outcome summary, and can never purge, release, or mutate a
  provider. The workflow is hardened like the release workflow it recovers:
  a main-ref fence (job-level `if: github.ref == 'refs/heads/main'`, so a
  modified branch copy of the workflow cannot run with environment secrets);
  top-level least-privilege `permissions: contents: read` and nothing else;
  a `concurrency` group shared with `release-production.yml` using
  `cancel-in-progress: false` (recovery queues behind a running release and
  can never cancel one mid-provider-mutation, and vice versa); an explicit
  job `timeout-minutes`; `DATABASE_URL` scoped to exactly the three
  database-consuming steps — `resolve`, `mark-failed`, and the residue
  assertion, which itself requires `DATABASE_URL` — never workflow-level
  `env`; and command allowlisting —
  the job executes only the fixed `resolve`, `mark-failed`, and residue
  assertion CLI invocations, with every typed input passed as a validated
  argument value and no input ever interpolated into arbitrary shell. Static
  regressions assert each of these properties on the workflow file. It is a
  database state-transition surface, not a second
  production release dispatcher; static caller-inventory regressions assert
  `release-production.yml` remains the sole provider-mutating workflow and
  this recovery workflow contains no provider credentials. Rollback runbook
  includes the copy-pasteable `gh workflow run release-canary-recovery.yml`
  invocation (never a raw local CLI invocation against production) and
  requires the post-recovery global residue assertion.
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
    .github/workflows/release-canary-recovery.yml \
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
- Create: `tests/smoke/support/release-canary-polling.ts`
- Modify: `tests/unit/contract/fund-results-route.test.ts`
- Modify: `tests/integration/fund-scenario-reserve-worker.test.ts`
- Modify:
  `tests/integration/scenarios/scenario-release-gate.integration.test.ts`
- Modify: `workers/fund-scenario-calc-handler.ts`
- Modify: `workers/fund-scenario-calc-worker.ts`
- Modify: `workers/fund-scenario-calc-worker-harness.ts`
- Modify: `server/services/fund-scenario-reserve-calculation-service.ts`
- Modify: `tests/unit/workers/fund-scenario-calc-worker.test.ts`
- Modify:
  `tests/unit/services/fund-scenario-reserve-calculation-service.test.ts`
- Modify: `tests/unit/queues/fund-scenario-calc-queue-service-lifecycle.test.ts`
- Create: `tests/unit/smoke/release-canary-polling.test.ts`
- Modify: `.github/workflows/release-production.yml`
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

  Add explicit dependency-injection surfaces; do not rely on table renames,
  environment flags, timing luck, or a production request flag:

  ```ts
  export function createReserveScenarioCalculationRunner(deps?: {
    executeClaimedCalculation?: ExecuteClaimedReserveScenarioCalculation;
    clock?: { now(): number; setTimeout; clearTimeout };
  }): typeof runReserveScenarioCalculation;

  export function createFundScenarioCalcJobHandler(deps?: {
    runCalculation?: typeof runReserveScenarioCalculation;
  }): typeof handleFundScenarioCalcJob;

  export type ReserveScenarioAttempt = {
    number: number;
    limit: number;
  };

  export type ReserveWorkerFailureCode =
    | 'TRANSIENT_WORKER_FAILURE'
    | 'PERMANENT_WORKER_FAILURE'
    | 'WORKER_EXECUTION_FAILED';
  ```

  Production exports remain factories invoked with default real dependencies.
  `createFundScenarioCalcWorker`, `startFundScenarioCalcWorker`, and
  `startInProcessFundScenarioCalcWorkerHarness` accept only an optional
  `calculationHandler: typeof handleFundScenarioCalcJob`, not a whole queue
  processor. Worker processor must branch on `fund-scenario-deadline-sweep`
  first and always call the real `sweepFundScenarioCalculationRunDeadlines`;
  injection is applied only after that branch to calculation jobs. Production
  initializers never supply the injection.

  Handler derives `attempt.number = job.attemptsMade + 1` and
  `attempt.limit = job.opts.attempts ?? 1`, validates both positive and
  `number <= limit`, and passes the pair through
  `RunReserveScenarioCalculationInput`. `isFinalAttempt` derives from that pair
  rather than being a second source of truth. Both `calculation_started` and
  terminal `calculation_failed` event summaries persist `attempt_number` and
  `attempt_limit`; no other delivery can claim the attempt identity.

  Replace arbitrary `error.code`/raw-message persistence with one owned
  normalizer. Only branded test/worker errors may retain
  `TRANSIENT_WORKER_FAILURE` or `PERMANENT_WORKER_FAILURE`; every other ordinary
  error maps to `WORKER_EXECUTION_FAILED`. Hard deadline logic remains the sole
  writer of `HARD_TIMEOUT`. Persist fixed public text selected by the normalized
  code; never persist original message, stack, constructor/class name, database
  code, or arbitrary error property in the run row or event. Event
  `failure_code` and run `failure_code` must match. Unit tests inject an error
  carrying an unapproved code and secret-shaped message and require fallback
  code plus absence of both values from stored row/event JSON.

  Polling moves to `release-canary-polling.ts`, whose HTTP fetch, monotonic
  clock, and sleep are injectable and whose public result is a strict success or
  typed `RELEASE_CANARY_WORKER_TIMEOUT` failure retaining run/job/correlation
  IDs.

  Add deterministic integration truth cases without faulting production:

  - one injected transient worker failure retries the same deterministic BullMQ
    job ID and persisted correlation ID, then succeeds on configured attempt two
    with one command receipt, one calculation run, one `calculation_queued`
    event, `calculation_started` events bound to attempts 1/2 and 2/2, one
    `calculated` event, and one snapshot set;
  - one injected permanent worker failure exhausts configured attempts and
    persists terminal `failed` status with allowlisted sanitized failure code,
    no snapshot, no active lease, one failed event, and no duplicate
    receipt/run/job/queued event;
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

  Queue lifecycle tests assert deterministic job identity contains fund,
  scenario set, source config/version, hash kind/input hash/model date/lineage,
  and run ID. A prior failed same-SHA BullMQ job/run cannot satisfy or replace a
  newer command identity. Unit tests assert production constructors use real
  handler/clock defaults, injected calculation handlers remain harness-local,
  and deadline-sweep jobs bypass the injected calculation handler.

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
    tests/unit/workers/fund-scenario-calc-worker.test.ts \
    tests/unit/services/fund-scenario-reserve-calculation-service.test.ts \
    tests/unit/queues/fund-scenario-calc-queue-service-lifecycle.test.ts \
    tests/unit/smoke/release-canary-polling.test.ts \
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
    tests/smoke/support/release-canary-polling.ts \
    tests/unit/contract/fund-results-route.test.ts \
    workers/fund-scenario-calc-handler.ts \
    workers/fund-scenario-calc-worker.ts \
    workers/fund-scenario-calc-worker-harness.ts \
    server/services/fund-scenario-reserve-calculation-service.ts \
    tests/unit/workers/fund-scenario-calc-worker.test.ts \
    tests/unit/services/fund-scenario-reserve-calculation-service.test.ts \
    tests/unit/queues/fund-scenario-calc-queue-service-lifecycle.test.ts \
    tests/unit/smoke/release-canary-polling.test.ts \
    tests/integration/fund-scenario-reserve-worker.test.ts \
    tests/integration/scenarios/scenario-release-gate.integration.test.ts \
    .github/workflows/release-production.yml \
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
- Modify: `.github/workflows/prod-schema-reconcile.yml`
- Create: `shared/contracts/release-proof-certification-v1.contract.ts`
- Create: `shared/contracts/release-proof-lineage-v1.contract.ts`
- Create: `shared/contracts/release-evidence-fragment-v1.contract.ts`
- Create: `shared/contracts/release-evidence-manifest-v1.contract.ts`
- Create: `scripts/release/build-release-proof-certification.ts`
- Create: `scripts/release/build-release-proof-lineage.ts`
- Create: `scripts/release/build-release-evidence-fragment.ts`
- Create: `scripts/release/build-release-evidence-manifest.ts`
- Create: `scripts/release/verify-policy-ratification.mjs`
- Create: `tests/unit/contracts/release-proof-certification-v1.contract.test.ts`
- Create: `tests/unit/contracts/release-proof-lineage-v1.contract.test.ts`
- Create: `tests/unit/contracts/release-evidence-fragment-v1.contract.test.ts`
- Create: `tests/unit/contracts/release-evidence-manifest-v1.contract.test.ts`
- Create: `tests/unit/scripts/build-release-proof-certification.test.ts`
- Create: `tests/unit/scripts/build-release-proof-lineage.test.ts`
- Create: `tests/unit/scripts/build-release-evidence-fragment.test.ts`
- Create: `tests/unit/scripts/build-release-evidence-manifest.test.ts`
- Create: `tests/unit/scripts/verify-policy-ratification.test.mjs`
- Modify: `tests/regressions/ci-fail-closed.test.ts`
- Modify: `CHANGELOG.md`
- Regenerate and reapprove after all runtime/source commits:
  `audit/surface-contract-matrix/MATRIX.md`,
  `audit/surface-contract-matrix/boot-proofs.json`,
  `audit/surface-contract-matrix/condition-overrides.json`,
  `audit/surface-contract-matrix/definition-overrides.json`,
  `audit/surface-contract-matrix/dormant-candidates.json`,
  `audit/surface-contract-matrix/dormant-inventory.json`,
  `audit/surface-contract-matrix/g1-review.json`,
  `audit/surface-contract-matrix/listener-dispositions.json`,
  `audit/surface-contract-matrix/matrix.json`,
  `audit/surface-contract-matrix/orphans.json`,
  `audit/surface-contract-matrix/requirements.json`,
  `audit/surface-contract-matrix/runtime-exclusions.json`, and
  `audit/surface-contract-matrix/source-inventory.json`
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

  Create separate protected environment `Production Policy Ratification` before
  first governed release. Required reviewer is current repository owner; admin
  bypass is disabled. Repository currently has one owner/implementation actor,
  so `prevent_self_review` must remain disabled or gate is impossible. This is
  same single-maintainer owner-attestation limitation declared in Task 0, not
  independent-person separation. Environment contains no secrets or policy
  values. Its job becomes reviewable only after exact staged measurement and
  characterization artifacts exist.

- [ ] **Step 2: Define release-evidence-manifest-v1 now**

  Create strict Zod contract with these top-level keys only:

  ```ts
  {
    schemaVersion: 'release-evidence-manifest-v1',
    designation: 'infrastructure_only' | 'activation_candidate',
    candidate: boolean,
    source: {
      repository,
      sha,
      releaseMode: 'primary' | 'rollback',
      pullRequest,           // release-source PR: the approved-plan PR in
                             // primary mode, the forward-revert PR in
                             // rollback mode
      pullRequestHeadSha,    // recorded final head of that release-source PR
      planApprovalPullRequest, // PR carrying the governing plan approval —
                               // generic in schema; the current workflow pins
                               // it to 1385 by configuration, later
                               // candidates bind their own approved PR
      planPath,
      planSha256,
    },
    approval: {
      schemaVersion: 'plan-approval-v2',
      repository,             // repository carrying the approval comments
      pullRequest,            // plan-approval PR number the comments live on
      verifiedPrHeadSha,      // live final head of that PR from GitHub API
                              // at verification time
      commentId,
      commentUrl,
      authorLogin,
      authorPermission,
      createdAt,
      bodySha256,
      planPath,
      planSha256,
      approvedBaseHeadSha,
      reviewCommentId,
      reviewCommentUrl,
      reviewAuthorLogin,
      reviewCreatedAt,
      reviewBodySha256,
      ciGateCheckRunId,
      ciGateWorkflowRunId,    // resolved pull_request-event ci-unified run
      ciGateRunAttempt,
      finalHeadCiGate: {      // gate identity at the verified final head
        checkRunId,
        workflowRunId,
        runAttempt,
        headSha,
      },
      separationModel: 'single-maintainer-owner-attestation',
    },
    certification: {
      schemaVersion: 'release-proof-lineage-v1',
      callerWorkflowRef,
      proofWorkflowRef,
      runId,
      runAttempt,
      sourceSha,
      conclusion,
      certificationArtifact: {
        artifactId,
        artifactName,
        artifactArchiveSha256,
        certificationFileSha256,
      },
      lineageArtifact: {
        artifactId,
        artifactName,
        artifactArchiveSha256,
        lineageFileSha256,
      },
    },
    workflow: {
      runId,
      runAttempt,
      startedAt,
      manifestBuiltAt,
      preManifestOutcome,
      failureStage,
      manifestArtifactName,
    },
    schema: {
      migration,
      precursorSha,
      apply: {
        runId,
        runAttempt,
        workflowPath,
        sourceSha,
        runUrl,
        artifactId,
        artifactName,
        artifactArchiveSha256,
        receiptFileSha256,
      },
      audit: { runId, runAttempt, workflowPath, sourceSha, runUrl, result },
    } | null,
    policy: {
      reservedPerRun,
      stagedMeasuredResidue: residue | null,
      configuredCaps,
      retainedRunBudget,
      ttlHours,
      characterizationEvidence: {
        artifactId,
        artifactName,
        artifactArchiveSha256,
        fileSha256,
        sourceSha,
      } | null,
      ratification: {
        environmentId,
        environmentName,
        reviewerLogin,
        reviewerPermission,
        approvalState,
        commentSha256,
        policyConfigPayloadSha256,
        policyMeasurementPayloadSha256,
        characterizationFileSha256,
        canaryResultPayloadSha256,
        verifiedAt,
      } | null,
    },
    prechange: {
      baseline: {
        runId,
        runAttempt,
        workflowPath,
        baselineMainSha,
        plannedPrHeadSha,
        artifactId,
        artifactName,
        artifactArchiveSha256,
        contextFileSha256,
      },
      vercel,
      railway,
    },
    release: { vercel, railway } | null,
    operatorEvidence: { bundleSha256, capturedAt, verifiedAt } | null,
    canary: { execution, status, residue } | null,
    h9Artifact: { recordId, packageId, contentHash, fingerprint, sizeBytes } | null,
    fragmentLineage: {
      baseline: fragmentLineage,
      schema: fragmentLineage | null,
      policyConfig: fragmentLineage,
      policyMeasurement: fragmentLineage | null,
      policyRatification: fragmentLineage | null,
      operatorEvidence: fragmentLineage | null,
      releaseProvider: fragmentLineage | null,
      canaryResult: fragmentLineage | null,
    },
    rollback: { mode, recoveryContextSha256, targetMainSha },
  }
  ```

  Nested provider shapes contain canonical host/project/deployment/service IDs
  and source SHAs only. `residue` contains exact ten groups plus total. No raw
  evidence, response body, artifact body, token, credential, cookie, connection
  string, local path, or arbitrary metadata map is permitted.

  `fragmentLineage` has exact closed shape
  `{ kind, runId, runAttempt, sourceSha, artifactId, artifactName, artifactArchiveSha256, fileSha256, payloadSha256, producerJob }`.
  It preserves verified current-run transport identities without embedding
  fragment bodies. Historical schema apply and premerge baseline lineage remain
  in their domain sections because those artifacts come from earlier workflow
  runs, not current fragment transport.

  Cross-field rules:

  - `candidate=false` iff `designation='infrastructure_only'`;
  - `candidate=true` iff `designation='activation_candidate'`;
  - success requires nonnull clean schema proof, verified operator evidence,
    release, completed canary, exact 33-row residue, and H9 metadata;
  - plan-approval lineage and release-source lineage are separate and both
    mandatory. Plan approval binds to `source.planApprovalPullRequest` — a
    generic schema field; the CURRENT `release-production.yml` pins it to
    `1385` by workflow configuration (a constant in the workflow, not the
    contract), and a later activation candidate binds its own approved plan
    PR without a contract change. The approval rules are PR-generic: approval
    `planPath` equals `source.planPath`; approval `planSha256` equals
    `source.planSha256`; approver permission is `admin`, `maintain`, or
    `write`; approval ancestry is squash-aware — approved base is an ancestor
    of the plan-approval PR's final head (never of any squash commit
    directly, which descends from no PR-branch commit); approval and linked
    review comment/body identities plus exact CI gate identity (check-run ID,
    workflow run ID/attempt) equal fresh
    Task 0 verifier output and cannot be supplied from arbitrary workflow
    input;
  - the manifest independently proves the approval belongs to
    `source.planApprovalPullRequest` and its final head:
    `approval.repository` equals `source.repository`; `approval.pullRequest`
    equals `source.planApprovalPullRequest`; `approval.verifiedPrHeadSha`
    equals that PR's live `pr.headRefOid` from normalized API evidence and,
    in `releaseMode='primary'`, equals `source.pullRequestHeadSha`;
    `approval.approvedBaseHeadSha` is an ancestor of
    `approval.verifiedPrHeadSha`; `finalHeadCiGate.headSha` equals
    `approval.verifiedPrHeadSha`; every CI gate identity (approved-base and
    final-head) must resolve via normalized API evidence to a completed
    successful `CI Gate Status` job of a `.github/workflows/ci-unified.yml`
    run with `event: pull_request`, run head SHA equal to the bound head, and
    the plan-approval PR in its pull-request association — same-SHA
    `workflow_dispatch`/`push` runs never qualify;
  - release-source lineage is mode-specific: GitHub PR metadata for
    `source.pullRequest` must show `pr.headRefOid` equal to
    `source.pullRequestHeadSha` and `pr.mergeCommitSha` equal to `source.sha`
    for a PR merged into `main`. In `releaseMode='primary'`,
    `source.pullRequest` equals `source.planApprovalPullRequest` (the
    approved-plan PR itself — 1385 in the current workflow configuration). In
    `releaseMode='rollback'`, `source.pullRequest` is the human-reviewed
    forward-revert PR whose number/head were supplied and verified by
    `baseline-policy-preflight` (`rollback_pr_number`/`rollback_pr_head_sha`),
    and the plan-approval PR's own merge commit must already be reachable
    from `main` (the runtime release being reverted happened);
  - certification source SHA equals `source.sha`; run ID/attempt equal current
    release workflow execution; success requires `conclusion='success'`, exact
    attempt-qualified artifact names, positive artifact IDs, distinct verified
    archive and file SHA-256 fields, and exact caller/proof workflow refs;
    selecting latest workflow run or artifact is forbidden;
  - workflow run ID/attempt equal current execution; `manifestArtifactName`
    equals `release-evidence-manifest-v1-<runId>-<runAttempt>-<sourceSha>`
    exactly; `manifestBuiltAt >= startedAt`; and `preManifestOutcome` is derived
    only from completed prerequisite/job outcomes available before manifest
    build;
  - nonnull schema apply lineage equals exact dispatcher run/attempt/artifact
    ID/API digest/receipt-file hash/precursor inputs, uses workflow path
    `.github/workflows/prod-schema-reconcile.yml`, attempt 1, and exact
    qualified artifact name; audit lineage uses same workflow path and current
    release run ID/attempt/source SHA with `result='clean'`;
  - prechange baseline lineage equals exact dispatcher baseline
    run/attempt/artifact ID/API digest/file hash, capture workflow path, planned
    PR head, and baseline main SHA; `rollback.recoveryContextSha256` equals
    `prechange.baseline.contextFileSha256` and target main equals baseline main;
  - every nonnull `fragmentLineage` entry exactly equals verified producer
    outputs/envelope hashes for current run/attempt/source and expected
    producer; baseline plus policy-config are always present, success requires
    all eight, and failure nullability mirrors producer outcomes;
  - successful policy requires measured residue equal reserved vector, each cap
    equal three times reserved value, total cap 99, retained-run budget three,
    TTL 24, exact current-run characterization artifact ID/name/archive/file
    hashes and source SHA matching certification's characterization object, and
    nonnull release-owner ratification. Ratification
    environment/reviewer/state/comment/hash fields equal policy-ratification
    fragment and its four bound evidence hashes, with `approvalState='approved'`
    and `verifiedAt` after staged evidence exists;
  - failure/cancelled permits null schema, characterization/ratification,
    operator-evidence, release, canary, and H9 sections but requires allowlisted
    failure stage and recovery-context hash; any nonnull section must still
    validate completely;
  - source SHA, post-change release-provider SHAs, and canary SHA must agree;
    prechange provider SHAs remain immutable recorded rollback evidence and may
    differ from baseline `main` after behavior-compatible precursor merges;
  - all hashes are lowercase 64-hex; run IDs, timestamps, URLs, IDs, and
    integers have strict bounds;
  - recursive unknown or secret-shaped key/value scan runs before Zod parse.

  Define strict cross-job transport instead of assuming job-local `RUNNER_TEMP`
  files survive. `release-evidence-fragment-v1` is a closed discriminated union:

  ```ts
  {
    schemaVersion: 'release-evidence-fragment-v1',
    kind:
      | 'baseline'
      | 'schema'
      | 'policy-config'
      | 'policy-measurement'
      | 'policy-ratification'
      | 'operator-evidence'
      | 'release-provider'
      | 'canary-result',
    runId,
    runAttempt,
    sourceSha,
    producerJob,
    createdAt,
    payloadSha256,
    payload,
  }
  ```

  `payloadSha256` hashes stable JSON of payload only. Each `kind` has one strict
  producer and payload shape:

  | Kind                  | Producer job                | Payload                                                                                                                       |
  | --------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
  | `baseline`            | `baseline-policy-preflight` | strict prechange Vercel/Railway identity, rollback target/main SHA, recovery-context hash, exact baseline artifact lineage    |
  | `schema`              | `schema-audit`              | migration `0053`, precursor SHA, exact apply/audit run URLs and identities, allowlisted audit result                          |
  | `policy-config`       | `baseline-policy-preflight` | reserved vector, configured caps, retained-run budget, and TTL only                                                           |
  | `policy-measurement`  | `staged-smoke`              | exact staged measured residue vector                                                                                          |
  | `policy-ratification` | `policy-ratification`       | exact config/measurement/characterization hashes, environment review identity/comment hash, reviewer login, verification time |
  | `operator-evidence`   | `g4-operator-evidence`      | bundle SHA-256 plus capture/verification times                                                                                |
  | `release-provider`    | `promote`                   | post-promotion canonical Vercel/Railway identity and source SHAs                                                              |
  | `canary-result`       | `staged-smoke`              | exact staged execution/status/residue plus strict H9 record/package/hash/fingerprint/size metadata                            |

  `policy-config` deliberately contains no characterization claim or human
  ratification: those do not exist at preflight time. `canary-result` belongs to
  `staged-smoke`, where mutation and H9 retrieval occur; post-promotion smoke
  must not rerun or substitute that execution.

  Make historical schema apply proof executable. Pass Task 2's exact
  `schema_apply_run_id`, `schema_apply_run_attempt`, `schema_apply_artifact_id`,
  `schema_apply_artifact_digest`, `schema_apply_receipt_file_sha256`, and
  `schema_precursor_sha` inputs from `release-production.yml` to
  `prod-schema-reconcile.yml`'s `workflow_call` audit invocation. Grant only
  `contents: read` and `actions: read` to caller `schema-audit` job and called
  reconcile job; add regression forbidding write permissions or broader caller
  permissions. Before touching database, called workflow:

  1. validates attempt is exactly `1` and every ID/hash has canonical shape;
  2. fetches exact Actions run by ID and requires same repository,
     `workflow_dispatch`, workflow path
     `.github/workflows/prod-schema-reconcile.yml`, `conclusion='success'`,
     `run_attempt=1`, and `head_sha=schema_precursor_sha`;
  3. fetches exact artifact by ID and requires its `workflow_run.id`, nonexpired
     state, API digest, and exact historical name
     `prod-schema-reconcile-<runId>-1-apply-<schemaPrecursorSha>`; no
     latest/name search;
  4. downloads exact artifact ID into new mode-`0700` directory, rejects zip
     traversal/symlinks/unknown files, recomputes archive and extracted-file
     hashes, requires recomputed archive SHA-256 equal both fetched API digest
     and `schema_apply_artifact_digest`, requires receipt hash equal
     `schema_apply_receipt_file_sha256`, parses strict
     `schema-reconcile-receipt-v1`, and requires checked-out
     `30-g3-release-gate-hardening` manifest, migration `0053`, exact precursor,
     and `APPLY-MISSING-DDL -> SKIP` transition;
  5. derives `applyRunUrl` only from fetched run `html_url`, derives
     `auditRunUrl` only from current GitHub server/repository/run ID, and emits
     compact normalized evidence without report bodies.

  Any 403/404, missing digest, duplicate report, mismatched precursor,
  unrecognized decision, or download/parse failure blocks current audit. Only
  after this historical proof and current clean audit succeed may reusable job
  build `schema` fragment and expose artifact outputs. Caller-supplied URLs or
  prose references are never accepted as schema proof.

  Builder rejects unknown fields, secret-shaped values, wrong producer, and
  source/run mismatch. Every producer writes each fragment mode `0600`, uploads
  immutable artifact
  `release-evidence-fragment-v1-<kind>-<runId>-<runAttempt>-<sourceSha>`, and
  exposes exact artifact ID, name, upload digest, and recomputed file SHA-256 as
  distinct job outputs. Jobs producing two kinds expose two disjoint output
  groups; no output is overloaded. `prod-schema-reconcile.yml` exposes same four
  schema outputs through `workflow_call.outputs`; schema fragment name also
  includes current attempt and source SHA. Producers delete local fragments
  under `if: always()`. No fragment contains logs, raw provider responses,
  credentials, connection strings, local paths, arbitrary metadata, or another
  artifact body.

  Freeze executable caller DAG:

  - `validate-target` requires `github.run_attempt == 1`; every job from
    `stage-production` through `post-promotion-smoke`, including
    `policy-ratification`, has job-level `if` requiring attempt 1 before
    environment approval/credential release, and each mutation-capable
    `stage-production`, `staged-smoke`, and `promote` job repeats same guard as
    first step before mutation. Regression requires all guards.
    `release-production.yml` supports fresh dispatch only, never any UI rerun;
  - `release-proof` and `baseline-policy-preflight` both need `validate-target`;
    caller `release-proof` grants exactly `actions: read`, `checks: read`,
    `contents: read`, and `statuses: read` so reusable workflow cannot be
    permission-downgraded below its exact-SHA checks; no write or global
    permission broadening is allowed;
  - `schema-audit` needs successful `release-proof`;
  - `stage-production` needs all three of `release-proof`, `schema-audit`, and
    `baseline-policy-preflight`, and has an explicit `if` requiring all three
    results equal `success` before any provider mutation;
  - `staged-smoke` directly needs `baseline-policy-preflight`, `release-proof`,
    `validate-deployment`, and `railway-workers-verify` so its approval template
    can consume exact config/characterization outputs rather than inaccessible
    transitive `needs`; require all four results equal `success`;
  - `policy-ratification` needs successful `release-proof`,
    `baseline-policy-preflight`, and `staged-smoke`;
  - `promote` directly needs `staged-smoke`, `validate-deployment`,
    `staged-provider-identity`, `g4-operator-evidence`, and
    `policy-ratification`; require all five results equal `success` and retain
    direct access to staged deployment outputs.

  This retains current proof-before-schema ordering. If release proof fails,
  schema audit is skipped and failure manifest records `schema=null`; no
  deployment job can run.

  `policy-ratification` uses environment `Production Policy Ratification` and
  job-scoped `contents: read` plus `actions: read`. Before environment becomes
  reviewable, `baseline-policy-preflight`, `release-proof`, and `staged-smoke`
  have exposed exact config, characterization, measurement, and canary-result
  artifact outputs. `staged-smoke` writes one sanitized approval template to job
  summary:

  ```text
  RELEASE-POLICY-RATIFICATION-V1
  run_id: <current-run-id>
  run_attempt: <current-run-attempt>
  source_sha: <current-source-sha>
  policy_config_payload_sha256: <hash>
  policy_measurement_payload_sha256: <hash>
  characterization_file_sha256: <hash>
  canary_result_payload_sha256: <hash>
  decision: approved
  ```

  Reviewer pastes exact block as environment approval comment after inspecting
  staged measurement. Job downloads config, measurement, canary-result, and
  characterization artifacts only by exact current-run output IDs; verifies
  attempt-qualified names, API/upload digests, recomputed file hashes, strict
  contracts, source SHA, and vector equality; then
  `verify-policy-ratification.mjs` calls both
  `GET /repos/{owner}/{repo}/environments/{environment_name}` and
  `GET /repos/{owner}/{repo}/actions/runs/{run_id}/approvals`. Require exact
  environment name/ID, `can_admins_bypass=false`, one required-reviewers rule
  containing only repository owner with `prevent_self_review=false`, and exactly
  one `state='approved'` review record for same environment ID/name whose
  comment equals template byte-for-byte. Reviewer login must equal repository
  owner and current collaborator permission must be `admin`, `maintain`, or
  `write`. Release workflow accepts attempt 1 only. Filter review-history
  entries to those whose environments contain exact policy environment ID/name,
  require exactly one, and require its exact comment binds `run_attempt: 1`.
  Earlier `Production` environment review records are expected and ignored only
  when they do not include policy environment. Reject zero/multiple policy
  matches, any nonapproved policy match, match spanning unexpected environment,
  bypass-capable configuration, empty/edited/duplicate match, unexpected
  reviewer/environment configuration, or dispatch-actor inference. GitHub
  review-history response has no approval timestamp, so contract does not invent
  one: `ratification.verifiedAt` is verifier's bounded UTC time after successful
  API fetch, and DAG plus exact run-attempt comment prove review occurred after
  staged evidence. Fragment stores normalized environment ID/name, reviewer
  login/permission, approval state, comment SHA-256, four bound evidence
  hashes/IDs, and verification time.

  Caller `evidence-finalizer` has exact:

  ```yaml
  needs:
    - validate-target
    - baseline-policy-preflight
    - release-proof
    - schema-audit
    - stage-production
    - validate-deployment
    - railway-workers-verify
    - staged-smoke
    - staged-provider-identity
    - g4-operator-evidence
    - policy-ratification
    - promote
    - post-promotion-smoke
  if: always()
  ```

  It computes earliest failure stage from this fixed DAG and never converts a
  failure/skipped producer into success. It downloads fragments only through
  corresponding `needs.<job>.outputs.<kind>_artifact_id` and current
  `github.run_id`; for each REST artifact record it requires current run,
  non-expired state, exact attempt-qualified name, positive ID, upload digest,
  recomputed file hash, strict envelope, current run attempt/source SHA, and
  expected producer. Latest/name searches are forbidden.

  Successful manifest requires all eight fragments plus exact current-run
  characterization artifact. Failure manifest requires `baseline` and
  `policy-config`; `schema` and every later fragment are required iff their
  producer concluded success, otherwise corresponding nullable manifest section
  remains null. Proof-stage failure therefore remains representable without
  claiming schema audit ran. A successful producer with missing, duplicate,
  mismatched, expired, or prior-attempt fragment fails finalizer. Hard
  cancellation before required base fragments exist yields no manifest and
  routes to Task 8 recovery; it can never produce success record. Tests cover
  every missing fragment, proof failure with schema null, upstream success with
  missing artifact, downstream skip, producer failure, duplicate, prior attempt,
  wrong source, wrong producer, artifact/file digest mismatch, approval comment
  mismatch, dropped/mismatched fragment lineage projection, historical
  schema/baseline lineage loss, and attempted substitution from older run.

  Split evidence so no artifact claims its own not-yet-created ID/digest:

  1. A dedicated reusable-workflow finalizer job with
     `needs: [full-release-proof, provider-identity, canary-residue-characterization, g3-exact-sha-verdict]`
     and `if: always()` emits pre-upload `release-proof-certification-v1.json`.
     Payload contains exact current caller run ID/attempt, source SHA, explicit
     caller workflow ref, literal proof-workflow ref
     `<repo>/.github/workflows/release-proof.yml@<sourceSha>`, allowlisted job
     conclusions, hashes of strict matrix/release-check summaries, and a closed
     `characterizationArtifact` object containing exact artifact ID/name/archive
     digest/file hash/source SHA. That object may be null only when
     characterization job did not succeed; overall certification success
     requires it nonnull and fully matching current execution. Reusable `github`
     context is caller context and must not be mislabeled as called-workflow
     identity. Because jobs do not share `RUNNER_TEMP`, each prerequisite
     exposes only its normalized summary SHA-256 and allowlisted conclusion as
     explicit job outputs; finalizer never reads another job's filesystem or
     logs.
  2. Upload payload as
     `release-proof-certification-v1-<runId>-<runAttempt>-<sourceSha>` with
     `retention-days: 30`. Capture action-returned artifact ID and archive
     digest separately from recomputed certification-file SHA-256.
  3. Build `release-proof-lineage-v1.json` after that upload. It binds exact
     payload artifact ID/name/archive digest, certification-file hash, run
     ID/attempt, source SHA, caller/proof refs, and conclusion. It cannot
     contain its own future artifact metadata.
  4. Upload lineage as
     `release-proof-lineage-v1-<runId>-<runAttempt>-<sourceSha>`. Capture its
     action-returned artifact ID/archive digest plus recomputed lineage-file
     hash. Expose both artifacts' IDs, exact names, archive digests, file
     hashes, run ID/attempt, source SHA, refs, and conclusion as exact
     reusable-workflow outputs: `certification_artifact_id`,
     `certification_artifact_name`, `certification_artifact_digest`,
     `certification_file_sha256`, `lineage_artifact_id`,
     `lineage_artifact_name`, `lineage_artifact_digest`, `lineage_file_sha256`,
     `proof_run_id`, `proof_run_attempt`, `proof_source_sha`,
     `caller_workflow_ref`, `proof_workflow_ref`, and `proof_conclusion`.

  Do not include logs, provider responses, environment values, or arbitrary
  metadata. `release-production.yml` uses an `if: always()` evidence-finalizer
  job even when reusable proof fails. Grant that caller job only
  `contents: read`, `actions: read`, `checks: read`, `issues: read`, and
  `pull-requests: read`; the latter three are required for a fresh
  `verify-plan-approval.mjs` call inside finalizer. Add regression proving each
  read permission is declared and no write permission or repository-wide
  broadening appears. It downloads payload and lineage by exact
  `certification_artifact_id` and `lineage_artifact_id` outputs plus current
  `github.run_id`; never by latest or name search. It fetches each REST artifact
  record by ID and requires `workflow_run.id == github.run_id`, non-expired
  status, exact attempt-qualified name, and expected source SHA encoded in name.
  It verifies upload-provided archive digests separately from recomputed
  downloaded file hashes, parses both strict contracts, requires current
  `github.run_attempt`, and rejects any prior attempt artifact even when run ID
  and SHA match.

  All GitHub reruns are intentionally unsupported. “Re-run failed jobs” can
  retain prior-attempt upstream artifacts, while “Re-run all jobs” shares
  run-scoped approval history that cannot be isolated by API attempt. Both must
  fail through attempt-1 guards and exact-attempt validation. After any failed
  run, recover exact active canary first, refresh operator evidence, re-fence
  main/baseline/schema inputs, and issue fresh governed dispatch with new run
  ID. Never stitch prior-attempt artifacts or approval history. Add regressions
  for failed-jobs and all-jobs rerun rejection plus fresh-dispatch success;
  document operator action in rollback runbook.

  Caller deployment jobs remain blocked unless reusable proof result is success.
  Evidence finalizer may build a failure manifest after proof failure; its DAG
  cannot authorize promotion. Hard runner cancellation that prevents
  `if: always()` execution uses Task 8 recovery CLI and cannot be represented as
  successful manifest.

  Finalizer reruns Task 0 verifier against the configured plan-approval PR
  (the same PR in both release modes; pinned to #1385 in the current workflow
  configuration, rebindable for a later candidate) and current plan path, with
  approved base allowed to be an ancestor of that PR's final head, and
  captures only verifier's compact normalized JSON. The finalizer invokes the
  verifier with `--require-final-head-ci` — safe here because it runs after
  the final head's gate completed successfully, outside any `CI Gate Status`
  dependency graph. That output supplies every
  `approval` field — repository, PR number, verified live final head, review
  comment metadata, and resolved CI gate identities for approved base and
  final head — so no approval field can enter the manifest from workflow
  input. Release-source lineage (`source.pullRequest` /
  `source.pullRequestHeadSha` / `source.sha`, mode-specific per the manifest
  cross-field rules) is validated separately from the normalized preflight
  outputs; in rollback mode the finalizer records the revert PR identity and
  never substitutes it into the plan-approval verification. Builder consumes that output, strict current-run
  certification/lineage files, verified fragment files, and exact artifact
  outputs; it never consumes another job's temp path. It validates contract,
  writes mode `0600`, then prints output path and manifest SHA-256 only. Tests
  reject unknown nested fields, designation/candidate mismatch, success with
  missing proof, inconsistent approval/plan ancestry, stale/latest/prior-attempt
  artifact, artifact ID/name/archive/file-digest mismatch, caller/proof-ref
  confusion, inconsistent SHA/residue, edited-comment metadata, oversized
  values, and secret-shaped content.

  Manifest is built inside still-running `release-production.yml`, so it must
  not claim actual workflow completion time or final workflow conclusion.
  `manifestBuiltAt` and `preManifestOutcome` describe evidence available before
  manifest upload only. Upload/cleanup failures after build remain failures and
  cannot be retroactively represented as success; a true completed-workflow
  attestation would require a separate `workflow_run: completed` finalizer and
  is outside this PR. Manifest may bind its deterministic future artifact name,
  but never its own not-yet-created artifact ID or digest.

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
  sanitized artifact named
  `release-evidence-manifest-v1-<runId>-<runAttempt>-<sourceSha>` with
  `retention-days: 30`; delete local file under `if: always()`. Tests rerun the
  same run ID with a higher attempt and prove contract names would differ, while
  workflow regression rejects every `release-production` attempt above one and
  any prior-attempt name/content. Manifest becomes first governed infrastructure
  release record, not deferred future work.

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

- [ ] **Step 4: Run targeted verification for manifest-policy source**

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
    tests/unit/contracts/release-proof-lineage-v1.contract.test.ts \
    tests/unit/contracts/release-evidence-fragment-v1.contract.test.ts \
    tests/unit/contracts/release-evidence-manifest-v1.contract.test.ts \
    tests/unit/scripts/build-release-proof-certification.test.ts \
    tests/unit/scripts/build-release-proof-lineage.test.ts \
    tests/unit/scripts/build-release-evidence-fragment.test.ts \
    tests/unit/scripts/build-release-evidence-manifest.test.ts \
    tests/unit/scripts/verify-policy-ratification.test.mjs \
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

- [ ] **Step 5: Commit manifest policy source before governed regeneration**

  Matrix provenance and boot proof must bind a committed source SHA. Commit Task
  11 workflow/contracts/builders/tests before regenerating matrix; do not push
  this intermediate commit alone.

  ```bash
  git diff --check
  git add \
    .github/workflows/release-proof.yml \
    .github/workflows/release-production.yml \
    .github/workflows/prod-schema-reconcile.yml \
    shared/contracts/release-proof-certification-v1.contract.ts \
    shared/contracts/release-proof-lineage-v1.contract.ts \
    shared/contracts/release-evidence-fragment-v1.contract.ts \
    shared/contracts/release-evidence-manifest-v1.contract.ts \
    scripts/release/build-release-proof-certification.ts \
    scripts/release/build-release-proof-lineage.ts \
    scripts/release/build-release-evidence-fragment.ts \
    scripts/release/build-release-evidence-manifest.ts \
    scripts/release/verify-policy-ratification.mjs \
    tests/unit/contracts/release-proof-certification-v1.contract.test.ts \
    tests/unit/contracts/release-proof-lineage-v1.contract.test.ts \
    tests/unit/contracts/release-evidence-fragment-v1.contract.test.ts \
    tests/unit/contracts/release-evidence-manifest-v1.contract.test.ts \
    tests/unit/scripts/build-release-proof-certification.test.ts \
    tests/unit/scripts/build-release-proof-lineage.test.ts \
    tests/unit/scripts/build-release-evidence-fragment.test.ts \
    tests/unit/scripts/build-release-evidence-manifest.test.ts \
    tests/unit/scripts/verify-policy-ratification.test.mjs \
    tests/regressions/ci-fail-closed.test.ts
  git commit -m "feat(release): emit infrastructure evidence manifest"
  ```

- [ ] **Step 6: Refresh governed matrix after final source changes**

  This refresh is mandatory. Tasks 6 and 9 modify fingerprinted inputs,
  including `shared/routes/api-route-manifest.ts`,
  `server/routes/fund-scenario-sets.ts`, and the fund-scenario worker files.
  Leaving prior `source-inventory.json` or approvals in place guarantees source
  hash failure.

  With Step 5's clean committed SHA, repeat Task 1 Step 9 only through the
  successful `--close-g1` command: fresh authoring reset, seed-mode route
  projection at exact SHA, boot proof, byte-identical double seed,
  classification, `init-review`, full fresh read-only G1 review of every
  row/off-row obligation, and release-owner dry-run/closure. Do not repeat Task
  1's cleanup/stage/commit tail; the Task 11 block below owns those actions. Use
  a new immutable review evidence reference bound to this source SHA; Task 1
  review evidence cannot be reused. Do not mechanically copy old approval fields
  or use `--fresh` without the full review that follows it.

  Then:

  ```bash
  set -eu
  SOURCE_SHA="$(git rev-parse HEAD)"
  cleanup_seed_kg() {
    rm -rf audit/knowledge-graph/out
  }
  trap cleanup_seed_kg EXIT HUP INT TERM
  npx tsx audit/knowledge-graph/scripts/rebuild-knowledge-graph.mjs \
    --mode seed \
    --expected-sha "$SOURCE_SHA"
  npx tsx audit/surface-contract-matrix/scripts/validate-matrix.mjs
  npx tsx audit/surface-contract-matrix/scripts/render-matrix.mjs
  cleanup_seed_kg
  trap - EXIT HUP INT TERM
  git diff --check
  git add -A audit/surface-contract-matrix
  git commit -m "chore(audit): refresh matrix after release hardening"

  set -eu
  test -z "$(git status --porcelain)"
  CANDIDATE_SHA="$(git rev-parse HEAD)"
  cleanup_kg() {
    rm -rf audit/knowledge-graph/out
  }
  trap cleanup_kg EXIT HUP INT TERM
  npx tsx audit/knowledge-graph/scripts/rebuild-knowledge-graph.mjs \
    --mode release \
    --expected-sha "$CANDIDATE_SHA"
  CANDIDATE_SHA="$CANDIDATE_SHA" node -e 'const m=require("./audit/knowledge-graph/out/manifest.json"); if (!m.fresh_for_checkout || !m.valid_for_release_proof || m.repo_head !== process.env.CANDIDATE_SHA) process.exit(1)'
  npx tsx audit/surface-contract-matrix/scripts/validate-matrix.mjs
  cleanup_kg
  trap - EXIT HUP INT TERM
  test -z "$(git status --porcelain)"
  ```

  Require no tracked KG output and no unreviewed/proposed row, stale source
  hash, stale off-row fingerprint, or closure gap.

- [ ] **Step 7: Regenerate routing docs**

  ```bash
  npm run docs:routing:generate
  npm run docs:routing:check
  ```

  Review generated diff. Include only files changed by route/schema manifest.
  After matrix regeneration is committed, add one concise `CHANGELOG.md` entry
  describing infrastructure-only release hardening, exact-execution canary
  evidence, and explicit no-candidate/no-freeze meaning. Deferring changelog
  until here keeps Step 6's source tree clean for governed matrix provenance.

- [ ] **Step 8: Run repository gates**

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

- [ ] **Step 9: Inspect final diff**

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

- [ ] **Step 10: Commit final documentation**

  ```bash
  git add \
    CHANGELOG.md \
    docs/_generated/router-index.json \
    docs/_generated/router-fast.json \
    docs/_generated/staleness-report.md
  git diff --cached --check
  git commit -m "docs(release): record hardened interim release gates"
  ```

  Changelog entry is required, so this commit must not be empty. Omit unchanged
  generated paths from `git add` if generator produced no diff. Require clean
  worktree afterward.

- [ ] **Step 11: Re-run live PR checks**

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

- [ ] **Step 12: Resolve reviews and update PR meaning**

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
  - exact release-proof certification payload and post-upload lineage artifacts
    are bound to current run/attempt/source SHA and no tracked
    knowledge-graph/session-review residue remains;
  - named release owner holds bounded merge-to-release change window so no
    unrelated `main` merge can invalidate provider baseline before release;
  - as the final criterion, evaluated only after every other criterion above
    is green: a fresh frozen-final-head read-only review record exists —
    obtained after required CI is green at the frozen final head, covering
    the plan plus the full PR diff at that head, with the reviewer executing
    no edits, recorded as a review comment identity bound to final head SHA
    and plan digest, and carrying no blocking findings. Head/digest binding
    and drift-voiding are machine-verified; review context remains the
    owner-attested procedural control declared by the Task 0 separation
    model, not an independent-person boundary. Any later push or plan edit
    mechanically voids the record and repeats this criterion;
  - PR description has no final-candidate/freeze claim.

- [ ] **Step 2: Capture immutable baseline, then merge through protection**

  After Step 1 is satisfied, freeze final PR head and approved plan digest.
  Before merge:

  1. confirm the Step 1 frozen-final-head review record is still valid at the
     current PR head and plan digest (unvoided by any intervening push or
     plan edit), then run the pre-merge verifier invocation — this is the
     "pre-merge check" consumer of the flagged mode, safe here because the
     frozen head's `CI Gate Status` already completed successfully:

     ```bash
     node scripts/release/verify-plan-approval.mjs \
       --repo nikhillinit/Updog_restore \
       --pr 1385 \
       --plan-path docs/superpowers/plans/2026-08-11-pr-1385-release-gate-hardening.md \
       --approver-login nikhillinit \
       --require-final-head-ci
     ```

     Require exit success and record its compact normalized JSON output,
     including `finalHeadCiGate`, in the merge record; any verifier failure
     blocks merge;
  2. resolve current live `main` SHA;
  3. dispatch `capture-release-baseline.yml` with exact baseline main, final PR
     head, and plan digest;
  4. wait for success, download exact-run artifact, validate strict context, and
     compute its SHA-256;
  5. record exact baseline workflow run ID/attempt, artifact ID/API digest, file
     SHA-256, and exact artifact name in merge record;
  6. re-read live `main`, PR head, and plan digest; any drift invalidates
     capture and the frozen-head review record and requires a new exact run.

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
  2. invoke only `scripts/deploy-production.ps1` with `-ReleaseMode primary`
     against exact live `main` SHA;
     baseline run/attempt/artifact ID/API digest/file SHA-256; and schema-apply
     run/attempt/artifact ID/API digest/receipt-file SHA-256/precursor SHA;
  3. require prechange recovery context artifact exists before staged provider
     mutation;
  4. complete GitHub Production staging approval, inspect exact staged
     characterization/measurement/canary hashes, then post exact
     `RELEASE-POLICY-RATIFICATION-V1` comment through separate protected
     `Production Policy Ratification` approval;
  5. require workflow provider, policy ratification, promotion, current-run,
     residue, portfolio, results, reserve replay, and H9 stored-JSON gates to
     pass;
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
  5. create a human-reviewed forward-revert PR targeting recorded baseline
     application SHA; the revert must restore the baseline application tree —
     Task 8's preflight diff proof rejects any change outside the enumerated
     release-control-plane allowlist; merge it to `main` through normal review
     (its merge commit becomes the rollback release SHA);
  6. release revert through same dispatcher with fresh operator evidence and
     same schema audit/provider/canary gates, dispatched with
     `release_mode=rollback` plus exact `rollback_pr_number` and
     `rollback_pr_head_sha` inputs so `baseline-policy-preflight` verifies the
     revert PR's own head/merge lineage against the GitHub PR API while
     consuming the original pre-runtime-merge baseline artifact (Task 8
     rollback mode).

  When failure occurs before canonical Vercel promotion, first prove canonical
  Vercel still equals baseline deployment; then forward revert restores Railway.
  When failure occurs after promotion, same forward revert plus governed
  dispatcher reconverges all providers. Do not move only Vercel alias, manually
  redeploy one Railway service, or run down migration. `0053` stays applied;
  Task 5 compatibility test proves reverted application can run on expanded
  schema.

---

## Acceptance Matrix

| Area                   | Passing evidence                                                                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Current CI             | Lint green; exact-SHA strict matrix builds owned route projection ephemerally; no tracked audit residue.                                       |
| Plan approval          | Exact unedited review/approval bodies bind plan, ancestor head, successful pull_request-event ci-unified gate run (resolved run ID/attempt), owner permission, and identities. |
| Schema ordering        | `0053` precursor merged/applied/audited; 90-day strict apply receipt retained; old code and protected Railway services run on expanded schema. |
| Caller                 | PowerShell stdin JSON supplies exact SHA, four-object evidence, baseline lineage, and schema-apply lineage including archive/file hashes.      |
| Caller inventory       | Historic Task 11 workflow deleted; no second dispatch path.                                                                                    |
| Vercel staged identity | READY production-target, no aliases, expected project/SHA/main metadata.                                                                       |
| Railway identity       | Exact protected ID/name pairs and SHA; duplicates/cross-maps fail; unrelated services cannot collide.                                          |
| Promotion              | Canonical hostname resolves to exact staged deployment after every promote attempt.                                                            |
| Freshness              | Operator/provider evidence rechecked; exact staged vector and characterization receive separate comment-bound policy approval before promote.  |
| Canary origin          | Exact result fund links workflow run/attempt, run/principal/grant/window/SHA; recovery uses same tuple.                                        |
| Residue                | Characterized 33-row maximum reserved; one nonterminal run; all ten groups counted; purged rows validated.                                     |
| Portfolio              | Same-key replay stable; stale version rejected; persisted state unchanged.                                                                     |
| Results                | Shared schema parses; stable lifecycle evidence survives reload; worker retry/failure/timeout paths fail closed.                               |
| Reserve command        | Same key returns exact 202 response with one receipt/run/job/event; crash recovery deterministic.                                              |
| Reserve UI             | One key per user intent; 409/503/network retry reuses key; 422 reloads inputs; errors remain visible.                                          |
| Reporting              | Approved nonzero planning mark produces actuals fact, locked package, and H9-actionable stored JSON.                                           |
| Evidence manifest      | Infrastructure-only manifest binds exact approval/review/check, eight fragments, characterization, and current-attempt proof lineage.          |
| Time budgets           | Every outer job exceeds bounded inner waits and retains finalizer/cleanup margin.                                                              |
| Security               | No secret/evidence body in argv, logs, summaries, artifacts, or tracked files.                                                                 |
| Rollback lineage       | Revert PR head/merge verified via PR API; application tree equals baseline outside enumerated release-control-plane allowlist; recovery workflow ref-fenced, least-privilege, queued concurrency. |
| Governance             | PR merges as infrastructure, not final candidate or freeze; frozen-final-head review recorded before merge.                                   |

## Rollback and Failure Semantics

- Any missing, edited, duplicate, permission-invalid, digest-mismatched,
  review/CI-invalid, or non-ancestor plan approval blocks implementation and
  merge.
- Any missing, latest-selected, wrong-ID, wrong-run, wrong-attempt, wrong-SHA,
  wrong-workflow-ref, archive-digest-mismatched, or file-digest-mismatched
  release-proof payload/lineage evidence blocks manifest success.
- Any failed-jobs or all-jobs rerun fails closed; recover exact canary, refresh
  evidence, and use fresh governed dispatch with new run ID.
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
- Any rollback release whose tree differs from recorded baseline application
  SHA outside the enumerated release-control-plane allowlist fails preflight;
  PR lineage alone never proves revert semantics.

## Source Evidence

- Live PR: [PR #1385](https://github.com/nikhillinit/Updog_restore/pull/1385)
- Open Redis operational blocker:
  [issue #1346](https://github.com/nikhillinit/Updog_restore/issues/1346)
- Historical lint failure, closed by `4529a0e8` before current head:
  [GitHub Actions job 93686828674](https://github.com/nikhillinit/Updog_restore/actions/runs/31461857041/job/93686828674)
- Open portfolio replay review:
  [discussion 3755392960](https://github.com/nikhillinit/Updog_restore/pull/1385#discussion_r3755392960)
- Open optimistic-lock review:
  [discussion 3755392965](https://github.com/nikhillinit/Updog_restore/pull/1385#discussion_r3755392965)
- GitHub CLI stdin JSON dispatch:
  [`gh workflow run` manual](https://cli.github.com/manual/gh_workflow_run)
- GitHub workflow-dispatch input ceiling:
  [Triggering a workflow](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)
- GitHub workflow-run environment approval history:
  [REST workflow-run approvals](https://docs.github.com/en/rest/actions/workflow-runs#get-the-review-history-for-a-workflow-run)
- GitHub protected environment configuration:
  [REST deployment environments](https://docs.github.com/en/rest/deployments/environments#get-an-environment)
- GitHub artifact-retention setting and required Administration-read scope:
  [REST Actions retention settings](https://docs.github.com/en/rest/actions/permissions#get-artifact-and-log-retention-settings-for-a-repository)
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
