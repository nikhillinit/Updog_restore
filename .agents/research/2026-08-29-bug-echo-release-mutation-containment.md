# bug-echo Report: Release Mutation Containment

**Date:** 2026-08-29
**Pattern source:** User-described review findings, confirmed against current staged remediation
**Scan tool:** Regex recon plus manual control-flow review; Railway connector used read-only for current deployment-shape evidence
**Files scanned:** 47 (`.github/workflows/**`, `scripts/release/**`)
**Pattern validated against pre-fix file:** n/a for user-described pattern
**Build manifest:** `package.json` present
**Output directory:** `.agents/research/`
**Dirty baseline:** User accepted risk; foreign untracked paths preserved
**Baseline HEAD:** `c9606170c2e15dd4188f1bf53a89dfc671b49310`
**Baseline source diff digest:** `f9038dd5e35920ec5c808db049f60fe00f064b6ddc96ddc230682f0a3f4513bd`
**Candidate implementation diff digest (excluding this evidence report):** `465b881994330df88d499685f00752f2bdabadc6f094ba533704a9286af91774`
**Plan SHA-256:** `6d7b0f8ef9d8dc767de8f0d66225063f19324448ba23fce65bfc46d4dd28fa22`
**Review binding:** Fresh review must match baseline HEAD, plan digest, and final staged patch digest recorded outside this file. This report intentionally does not embed its own SHA-256.
**Recon:** 13 raw candidate sites across 8 files; 0 prior `bug-echo:` commits; 0 swept sites excluded
**Cross-agent reconciliations:** 3 classification conflicts resolved by direct read and independent verification

## Pattern

**Condition 1:** Production/provider mutation is reachable before required target, evidence, or policy validation.
**Condition 2:** A provider mutation can succeed while its response or handle is lost, but recovery proceeds without bounded identity reconciliation.
**Condition 3:** Network, polling, or reconciliation work resets budgets or lacks an abort tied to one absolute deadline.
**Consumer impact:** A job can end without explicit containment evidence while provider state has already changed, allowing split state, duplicate mutation, or unsafe operator retry.

**Anti-pattern:** Fail-open mutation ordering, response-dependent mutation identity, and phase-local or unbounded timeouts.
**Correct pattern:** Validate before mutation; reconcile ambiguous outcomes using exact novel identity; carry one absolute deadline through transport, subprocess, polling, and recovery.
**Search probes:** Provider mutation commands and GraphQL mutations; `fetch`/body reads; `execFile` network commands; timeout/deadline construction; polling loops; pagination; recovery gates; workflow `needs` and in-step prerequisites.

## Summary

- BUG findings: 6
- WATCH findings: 4
- OK findings: 7
- REVIEW findings: 0
- Release impact: the six BUG findings and WATCH #2/#3 are remediated on branch `codex/pr-1451-post-merge-remediation` (plan F_1.3.4); WATCH #1/#4 remain Open by decision; production dispatch remains HOLD.

## BUG Findings

### Issue Rating Table

| # | Finding | Urgency | Risk: Fix | Risk: No Fix | ROI | Blast Radius | Fix Effort | Status |
|---|---|---|---|---|---|---|---|---|
| 1 | Run-level Railway deadline resets across services and recovery | CRITICAL | High | Critical | Excellent | 2 files | Medium | Fixed |
| 2 | Second-service live-main fence has no subprocess timeout | CRITICAL | Low | Critical | Excellent | 2 files | Small | Fixed |
| 3 | Ambiguous Railway rollback response is not reconciled | HIGH | High | Critical | Good | 2 files | Medium | Fixed |
| 4 | Ambiguous Railway redeploy response or missing ID is not reconciled | HIGH | High | Critical | Good | 2 files | Medium | Fixed |
| 5 | Railway verification poll can block beyond its absolute deadline | HIGH | Low | High | Excellent | 2 files | Small | Fixed |
| 6 | Ambiguous Railway deploy can bind to a pre-existing exact-SHA deployment | HIGH | High | Critical | Good | 2 files | Medium | Fixed |

**Reference implementations:**

- `scripts/release/verify-vercel-promotion.mjs:192` carries one overall deadline through request aborts, response reads, and clipped sleeps.
- `scripts/release/railway-graphql-transport.mjs:31` converts an absolute deadline into remaining request time and uses the signal through response parsing.

### Detailed findings

**1. Run-level Railway deadline resets across services and recovery**

`scripts/release/deploy-railway-workers.mjs:368`, `:725`, `:810`, `:1014`; `.github/workflows/release-production.yml:624`

```js
const deadlineAt = config.now() + config.timeoutMs;
```

**Why this is a bug:** Preflight, each service deployment, and recovery create separate ten-minute budgets. A two-service failure path can consume about fifty minutes before setup and live-main fences, exceeding the workflow's forty-five-minute job timeout. Job cancellation can occur after provider mutation but before structured recovery evidence is emitted.

**Suggested fix:** Establish one run-level deadline below the workflow timeout with finalization margin. Mirror the absolute-deadline propagation in `scripts/release/verify-vercel-promotion.mjs:192` and pass the remaining budget through both services, preflight, deployment, and recovery. Add a multi-phase budget-exhaustion regression test.

**2. Second-service live-main fence has no subprocess timeout**

`scripts/release/deploy-railway-workers.mjs:102`, `:327`, `:1017`

```js
await execFileImpl('git', ['ls-remote', 'origin', 'refs/heads/main'], { encoding: 'utf8' });
```

**Why this is a bug:** The network-backed fence runs before each service. If the second fence hangs, service A may already be on the candidate SHA; the process reaches the workflow kill boundary without entering catch/recovery, leaving no explicit containment result.

**Suggested fix:** Derive `execFile` timeout or abort from the run-level deadline. Preserve typed failure data so recovery can decide whether service A must be contained. Add a never-resolving second-fence regression test.

**3. Ambiguous Railway rollback response is not reconciled**

`scripts/release/deploy-railway-workers.mjs:835`

```js
const rollback = await request(config, { query: ROLLBACK_MUTATION, deadlineAt });
if (rollback.data?.deploymentRollback !== true) throw new DeployFailure(...);
```

**Why this is a bug:** Railway can accept rollback while the transport or response fails. Current code only enters `waitForRollbackRecovery` after a confirmed Boolean response, so an accepted rollback remains unknown and the result can describe mixed or failed recovery inaccurately.

**Suggested fix:** On transport, GraphQL, missing-response, or unconfirmed-Boolean outcomes, mirror the bounded reconciliation shape at `scripts/release/deploy-railway-workers.mjs:754`. Discover and verify the prior commit under the existing deadline before returning resolved or explicitly unresolved. Add accepted-but-response-lost and unresolved-deadline tests.

**4. Ambiguous Railway redeploy response or missing ID is not reconciled**

`scripts/release/deploy-railway-workers.mjs:862`

```js
const redeploy = await request(config, { query: REDEPLOY_MUTATION, deadlineAt });
const recoveryDeploymentId = redeploy.data?.deploymentRedeploy?.id;
```

**Why this is a bug:** Redeploy can create recovery work while its response or deployment ID is lost. Current code returns blocked without discovering the new handle or proving its terminal state.

**Suggested fix:** Snapshot deployment IDs before redeploy, then use paginated bounded discovery for a novel deployment of the prior commit. Verify service/environment identity and readiness under the same deadline. Add transport-loss, missing-ID, pagination, and unresolved-budget tests.

**5. Railway verification poll can block beyond its absolute deadline**

`scripts/release/wait-railway-workers.mjs:252`, `:262`, `:310`, `:325`

```js
const deadline = startedAt + timeoutMs;
await fetchEvidence();
```

**Why this is a bug:** The poll checks its deadline only after `fetchEvidence` returns. Both GraphQL requests omit `deadlineAt`, so a hung fetch or response body can exceed the ten-minute poll budget and reach the twelve-minute workflow kill boundary.

**Suggested fix:** Pass the poll deadline into `fetchRailwayEvidence` and both `postRailwayGraphql` calls, mirroring `scripts/release/railway-graphql-transport.mjs:31`. Add a never-resolving fetch test proving abort at the shared deadline.

**6. Ambiguous Railway deploy can bind to a pre-existing exact-SHA deployment**

`scripts/release/deploy-railway-workers.mjs:533`, `:725`, `:754`

```js
const exactSha = deployments.filter(
  (deployment) => deployment.meta?.commitHash === config.expectedSha
);
```

**Why this is a bug:** Reconciliation does not snapshot deployment IDs before mutation. After a lost deploy response, it can accept a ready historical deployment with the expected SHA, report the mutation resolved, and leave the newly created deployment unidentified and uncontained. Read-only Railway sampling showed no current duplicate successful service/environment/SHA groups, but that current state is not a provider contract and does not prove mutation identity.

**Suggested fix:** Snapshot deployment IDs immediately before mutation and reconcile only newly observed exact-SHA candidates. Add a regression where an older exact-SHA deployment exists and the new mutation response is lost; resolution must not bind to the older ID.

## WATCH Findings

### Issue Rating Table

| # | Finding | Urgency | Risk: Fix | Risk: No Fix | ROI | Blast Radius | Fix Effort | Status |
|---|---|---|---|---|---|---|---|---|
| 1 | Ambiguous staged Vercel deployment is not discovered | MEDIUM | High | Medium | Marginal | 2 files | Medium | Open |
| 2 | Provider-evidence collection lacks an internal shared deadline | MEDIUM | Low | Medium | Good | 2 files | Small | Fixed |
| 3 | Baseline Git fetch lacks a subprocess timeout | LOW | Low | Medium | Good | 2 files | Small | Fixed |
| 4 | Rollback recovery discovery reads only first successful deployment | LOW | Low | Medium | Good | 2 files | Small | Open |

### Detailed findings

**1. Ambiguous staged Vercel deployment is not discovered**

`.github/workflows/release-production.yml:468`

```yaml
DEPLOYMENT_URL="$(npx --yes vercel@55.0.0 deploy --prebuilt --prod --skip-domain ...)"
```

**Why this is WATCH not BUG:** CLI or output failure can leave an undiscovered staged deployment and a retry can create a duplicate. `--skip-domain` prevents automatic canonical traffic assignment, so the current path contains production traffic impact.

**Suggested fix (defensive, not urgent):** Snapshot project deployment IDs and bounded-discover a novel exact SHA/ref/metadata match after ambiguous CLI failure.

**2. Provider-evidence collection lacks an internal shared deadline**

`scripts/release/collect-provider-evidence.mjs:81`, `:141`, `:157`

```js
response = await fetchImpl(url, options);
```

**Why this is WATCH not BUG:** Four sequential read-only requests lack internal abort/deadline propagation. Two callers rely on workflow job timeouts and the promotion caller has a two-minute shell timeout; all fail closed before further mutation.

**Suggested fix (defensive, not urgent):** Give the script one absolute collection deadline. Clip Vercel requests to remaining time and pass the same `deadlineAt` into both Railway requests.

**3. Baseline Git fetch lacks a subprocess timeout**

`scripts/release/capture-release-recovery-context.mjs:528`, `:597`, `:889`

```js
await execFileImpl('git', ['fetch', '--no-tags', 'origin', ...], { encoding: 'utf8' });
```

**Why this is WATCH not BUG:** Network Git can run until the surrounding ten/fifteen-minute workflow timeout, but these verification paths precede provider mutation and fail closed.

**Suggested fix (defensive, not urgent):** Add an `execFile` timeout or abort derived from one verification deadline.

**4. Rollback recovery discovery reads only first successful deployment**

`scripts/release/deploy-railway-workers.mjs:59`, `:510`, `:579`

```graphql
deployments(input: $input, first: 1)
```

**Why this is WATCH not BUG:** A matching prior-commit recovery hidden behind another successful deployment can produce a false blocked result. The path fails closed, and current Railway results are newest-first with one current SUCCESS per service, so no unsafe success was demonstrated.

**Suggested fix (defensive, not urgent):** Reuse paginated deployment listing under the recovery deadline or reconcile through a returned mutation identity.

## OK Findings

- `.github/workflows/release-production.yml:109` - Full-mode checkout, Node setup, and operator-evidence decoding now run in `validate-target` before provider-mutating jobs can run.
- `.github/workflows/release-production.yml:400` - Staging requires release proof, schema audit, baseline policy preflight, and live-main re-fence before Vercel mutation.
- `.github/workflows/release-production.yml:614` - Railway deployment requires target, baseline, proof, schema, and staged-deployment gates.
- `.github/workflows/release-production.yml:1569` and `scripts/release/verify-vercel-promotion.mjs:186` - Promotion reconciles ambiguous CLI outcome with bounded exact canonical identity proof. `OK (CANON)`.
- `scripts/release/railway-graphql-transport.mjs:31` - Supplied absolute deadlines abort fetch and response-body reads. `OK (CANON)`.
- `.github/workflows/prod-schema-reconcile.yml:597` - Apply mutation follows exact-target, evidence, additive-only, and policy validation in the same job.
- `scripts/release/recover-canary-run.mjs:378` - Exact run/workflow identity and optimistic version fence make repeated terminal transition idempotent.

## REVIEW Findings

None.

## Original Missing Regression Coverage (pre-remediation)

- Run-level budget exhaustion across preflight, both services, and recovery.
- Never-resolving second-service `git ls-remote` after service A mutation.
- Rollback accepted with lost response; resolved and unresolved discovery outcomes.
- Redeploy accepted with lost response or missing ID; pagination and shared-budget exhaustion.
- Lost deploy response with a pre-existing ready exact-SHA deployment; reconciliation must identify only a novel deployment ID.
- Railway verification scope/topology fetch that never resolves.
- Optional defensive coverage for Vercel staged-deploy response loss and provider-evidence shared deadline.

## Remediation (F_1.3.4, 2026-08-29)

Implemented under `docs/1-plans/F_1.3.4_release-mutation-containment-remediation.plan.md` on branch `codex/pr-1451-post-merge-remediation`. Final anchor map below is authoritative; inline numeric references in detailed findings and remediation bullets preserve earlier review layouts.

- **Final anchor map:** run deadline `scripts/release/deploy-railway-workers.mjs:1753`; default timeout `:36`; live-main fence `:113`; deployment snapshot/reconciliation `:604,647`; rollback snapshot/reconciliation `:1049,1199`; redeploy reconciliation `:1069`; failed-service inactivity proof/recovery eligibility `:1662,1694`; instance predicate `:896`; positive/negative instance matrices `tests/unit/scripts/deploy-railway-workers.test.mjs:2089,2150`.

- **BUG 1 (Fixed):** One run-level budget: `deployRailwayWorkers` computes a single `runDeadlineAt` (`scripts/release/deploy-railway-workers.mjs:1747`) threaded through preflight, both services, readbacks, reconciliation, and recovery; the three phase-local resets are deleted and `DEFAULT_DEPLOYMENT_TIMEOUT_MS` is now 35 minutes (`:29`) inside the unchanged 45-minute job cap. Tests: `deploy-railway-workers.test.mjs` "uses one absolute run deadline across preflight, both services, and recovery", "does not start any provider mutation after the run deadline expires before mutation", "permits only bounded reconciliation after an ambiguous mutation exhausts the run deadline"; `ci-fail-closed.test.ts` "keeps the 35-minute Railway helper default inside the 45-minute job with gross reserve".
- **BUG 2 (Fixed):** `fetchLiveMainSha` derives an `execFile` timeout from remaining run time, rejects before spawn when expired, and emits fixed typed failures (`scripts/release/deploy-railway-workers.mjs:106`). Test: "bounds a never-resolving second-service git ls-remote after service A mutation".
- **BUG 3 (Fixed):** Ambiguous rollback outcomes (transport failure, GraphQL error, missing or false Boolean) enter bounded reconciliation (`reconcileAmbiguousRollback`, `scripts/release/deploy-railway-workers.mjs:1193`; pre-mutation snapshot `snapshotRollbackState` `:1043`) accepting only a same-prior non-ready-to-ready transition or exactly one novel prior-commit deployment, in both cases requiring the attempted deployment read back terminally inactive. Confirmed-`true` keeps the existing `waitForRollbackRecovery` path. Tests: the four "reconciles ambiguous rollback ... same-ID non-ready-to-ready transition" cases, "keeps ambiguous rollback unresolved when the attempted deployment remains active", "rejects an already-ready historical deployment as ambiguous rollback proof", "reconciles an ambiguous rollback to one novel prior-commit deployment".
- **BUG 4 (Fixed):** Redeploy snapshots deployment IDs before mutation, rejects a returned ID present in the snapshot (`DEPLOYMENT_ID_NOT_NOVEL`), and reconciles response loss/missing ID to exactly one fully verified novel recovery deployment (`reconcileNovelRecoveryDeployment`, `scripts/release/deploy-railway-workers.mjs:1063`). Tests: "reconciles ambiguous redeploy transport/missing to one novel prior-commit deployment", "keeps ambiguous redeploy unresolved when multiple novel prior-commit candidates remain", "rejects a returned redeploy ID already present in the pre-mutation snapshot".
- **BUG 5 (Fixed):** `pollRailwayWorkers` passes its absolute poll deadline into `fetchEvidence(deadlineAt)` and `fetchRailwayEvidence` forwards it to both `postRailwayGraphql` calls (`scripts/release/wait-railway-workers.mjs:230,302`). Tests: `wait-railway-workers.test.mjs` "passes one absolute poll deadline into each evidence fetch", "forwards one absolute deadline into both Railway GraphQL requests", "aborts a never-resolving response body at the poll deadline".
- **BUG 6 (Fixed):** `snapshotDeploymentIds` (`scripts/release/deploy-railway-workers.mjs:597`) captures the bounded pre-mutation ID set (100-page/500-deployment ceiling in `listRecentDeployments`, exhaustion typed `DEPLOYMENT_DISCOVERY_LIMIT`); a returned deploy ID in the snapshot is `DEPLOYMENT_ID_NOT_NOVEL`; `reconcileAmbiguousDeployment` (`:640`) resolves only when the cumulative novel-ID set contains exactly one fully verified candidate; recovery ordering is gated on the new outcomes (`canRecoverPreviousService`, `:1688`; first-service recovery additionally requires the failed service's attempted deployment read back terminally inactive, `assertFailedServiceInactive`, `:1656`). Tests: "does not resolve a lost deploy response to a historical exact-SHA deployment", "rejects a returned deploy ID already present in the pre-mutation snapshot", zero/multiple-novel fail-closed cases, ceiling and mid-scan-expiry cases.
- **WATCH 2 (Fixed):** One absolute collection deadline (default `DEFAULT_COLLECTION_TIMEOUT_MS = 90_000`, `scripts/release/collect-provider-evidence.mjs:26`, injectable) clips all four fetches with abort signals and is forwarded to both Railway requests; a contract test binds the default below the promotion caller timeout parsed from the workflow. Tests: three deadline cases in `collect-provider-evidence.test.mjs`.
- **WATCH 3 (Fixed):** Network `git fetch` calls get an `execFile` timeout from `DEFAULT_GIT_FETCH_TIMEOUT_MS = 2 * 60_000` (`scripts/release/capture-release-recovery-context.mjs:28`, injectable, pre-spawn deadline rejection, fixed typed failure messages with no stderr/URL leakage); local git commands unchanged; a contract test asserts two git budgets plus the provider-capture cap fit the capture job cap. Tests: five cases in `capture-release-recovery-context.test.mjs`.
- **WATCH 1 and WATCH 4 remain Open by decision (2026-08-28).**

## Confirmed Review Corrections (2026-08-29)

- Stopped `SUCCESS` with exact deployment ID can reach `assertFailedServiceInactive`; recovery requires exact-ID readback whose top-level status remains stopped `SUCCESS` or is an explicit terminal failure, plus a well-formed `instances` array proving zero running instances. Missing, transitional, or unknown top-level status fails closed before recovery (`scripts/release/deploy-railway-workers.mjs:896`).
- Instance-level containment additionally requires every read-back instance to have a nonempty ID and a terminal-inactive status (`CRASHED`, `EXITED`, `REMOVED`, `SKIPPED`, or `STOPPED`; `scripts/release/deploy-railway-workers.mjs:14`). Empty-array plus all five allowlisted statuses recover (`tests/unit/scripts/deploy-railway-workers.test.mjs:2089`); invalid instance evidence and invalid top-level status cases fail closed (`:2150`).
- `validate-target` has `timeout-minutes: 15`, pinned by workflow-contract test.
- Deployment-history pagination rejects malformed `pageInfo`, missing `endCursor`, and repeated cursor before that service's deploy mutation; mutation-check proof confirmed each regression fails when its guard is removed.
- Post-mutation reconciliation retains every already-observed novel deployment handle when a later page is malformed, so ambiguous provider work remains explicitly identified and containable. Regression: "retains an observed novel deployment handle when later reconciliation pagination is malformed" (RED: empty handles; GREEN: exact `novel-fund` handle).
- Ambiguous deploy reconciliation preserves the sanitized causal candidate-readback error under `reconciliationError`.
- Evidence status and implementation digest are refreshed in this report; report file is explicitly staged.
- Fresh review is bound externally to plan SHA-256 `6d7b0f8ef9d8dc767de8f0d66225063f19324448ba23fce65bfc46d4dd28fa22` and final staged patch digest. Report SHA-256 remains external to avoid self-reference.

## Verification Evidence (2026-08-29)

- Focused release suite: 430 passed across seven affected files; deploy helper 84/84.
- `node --check`: five release scripts passed.
- `npm run check`: 0 TypeScript errors and 0 new baseline errors.
- `npm run lint`: ESLint and all guardrails passed.
- `git diff --cached --check`: passed.
- Final corrected-candidate `TZ=UTC npm test`: 13,868 passed, 81 skipped, 0 failed. The superseded candidate's prior full run had two nondeterministic route failures (`sensitivity-routes.test.ts` and `metric-runs-routes.test.ts`) that passed in clean isolation; no unrelated route or auth changes were made.

## Delivery Status

- Original scan was report-only. Remediation for all six BUG findings, WATCH #2/#3, and the six confirmed follow-up review corrections has been applied under plan F_1.3.4; WATCH #1/#4 remain Open.
- Fresh review evidence must remain outside this report and bind the final staged patch digest plus plan digest, so recording review completion does not invalidate the reviewed candidate.
- No commit, push, PR, GitHub message, Railway mutation, Vercel mutation, or production action performed.
- Production dispatch remains HOLD until fresh verification/review covers the resulting candidate and dispatch is separately authorized.
