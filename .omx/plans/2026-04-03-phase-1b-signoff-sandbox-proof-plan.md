# Phase 1B Sign-Off Sandbox Proof Plan

## Requirements Summary

Validate and revise `docs/plans/2026-04-03-phase-1b-single-owner-pr-queue.md`
for sign-off using proof-oriented sandbox work rather than broad production
delivery. The approval target is the **overall PR sequence**, but sign-off is
conditional on early evidence:

- prove the risky assumptions behind PR 1, PR 2, and PR 3
- integrate any surfaced revisions or overlooked improvements back into the plan
  document
- stop pre-signoff work at **proofs + plan updates**
- do not authorize broader production work beyond those proof slices
- keep `scenario-builder` behavior as an explicit later gate, not an inferred
  redirect/collapse decision
- once the gating item is completed, resume planning from the updated repo
  reality rather than the old sequence assumptions

## Repo-Grounded Evidence

- `client/src/components/dashboard/dual-forecast-dashboard.tsx:70` still uses
  `'/api/dashboard-summary/1'`
- `client/src/components/dashboard/dual-forecast-dashboard.tsx:75` still uses
  `'/api/fund-metrics/1'`
- `client/src/config/routes.ts:24-31` still maps multiple modeling routes to
  dead `/model`
- `client/src/config/routes.ts:24-31` currently maps these paths to `/model`:
  `/planning`, `/forecasting`, `/scenario-builder`, `/financial-modeling`,
  `/allocation-manager`, `/moic-analysis`, `/return-the-fund`, `/partial-sales`
- `server/routes/performance-metrics.ts:14-23` still contains a default-fund
  fallback path
- `server/routes/engine-summaries.ts:165` still falls back to
  `getConfig().DEFAULT_FUND_ID`
- `tests/integration/dashboard-summary-route.test.ts:16` already exercises
  dashboard summary route behavior
- `tests/setup/test-infrastructure.ts:241` exports `createSandbox()`
- `client/src/contexts/FundContext.tsx:23-152` provides the fund context needed
  to prove active-fund scoping behavior
- `tests/unit/app/route-governance-registry.test.tsx:54-55` and
  `tests/unit/app/route-perimeter-governance.test.tsx:71,121` show existing
  route-governance/perimeter test surfaces we can extend

## RALPLAN-DR Summary

### Principles

1. Prove risky sequencing assumptions before declaring the queue sign-off ready.
2. Prefer narrow evidence-producing slices over broad implementation.
3. Keep truthful behavior above placeholder continuity.
4. Preserve explicit gates where product decisions remain unresolved.
5. Use the existing test/sandbox harnesses before inventing new validation
   surfaces.

### Decision Drivers

1. **Sign-off confidence** — the plan needs evidence, not only plausible prose.
2. **Scope containment** — pre-signoff work must stop before broad production
   expansion.
3. **Resumability** — proof findings must flow back into the plan so later
   execution starts from updated assumptions.

### Viable Options

#### Option A — Document-only sign-off review

**Approach:** Review the queue as written, approve/reject it, and defer proofing
until later.

**Pros**

- fastest initial turnaround
- no code churn during planning

**Cons**

- weakest confidence in PR 1–3 ordering
- no pressure-test of dead `/model` perimeter or hardcoded fund `1`
- higher risk of approving a sequence that needs immediate rework

#### Option B — Sandbox-proof-first conditional sign-off

**Approach:** Execute proof-oriented slices for PR 1–3, revise the queue based
on findings, then sign off the overall sequence.

**Pros**

- evidence-backed sign-off
- surfaces overlooked blockers before broad implementation
- keeps work narrow and reviewable

**Cons**

- slower than a document-only review
- requires disciplined stop lines to avoid expanding into full implementation

### Rejected Alternative

**Broad implementation before sign-off** was rejected because it violates the
user-set stop line and would turn planning validation into partial delivery
without an approved updated queue.

## Acceptance Criteria

The queue is sign-off ready only when:

1. Proof artifacts exist for PR 1, PR 2, and PR 3 risks.
2. PR 1 proof demonstrates explicit route/perimeter expectations around dead
   `/model` mappings and canonical vs legacy surfaces.
3. PR 2 proof demonstrates deterministic forecast paths no longer silently
   depend on hardcoded fund `1`, and missing fund context yields a truthful
   blocked/empty state.
4. PR 3 proof demonstrates a narrow forecast-comparison contract shape or spike
   with no-data/provenance semantics using existing route/integration harnesses.
5. `docs/plans/2026-04-03-phase-1b-single-owner-pr-queue.md` is updated with all
   sequence changes, gating clarifications, or overlooked improvements surfaced
   by the proofs.
6. The revised plan explicitly preserves `scenario-builder` as a later product
   gate.
7. Pre-signoff work does **not** broaden into full PR 4 UI wiring, PR 6 route
   consolidation, or general production rollout beyond proof slices.
8. The revised plan names the resume trigger: after the gating item is complete,
   continue planning from the updated repo state.
9. Each proof lane produces a written artifact with: scope exercised, files
   touched, commands run, pass/fail evidence, blockers, and required queue
   revisions.

## Proof Execution Topology

The proof phase may use three parallel executor lanes, but architectural
sequencing still matters.

- **Parallelism allowed:** discovery, test-harness prep, and isolated proof
  slices for PR 1, PR 2, and PR 3.
- **Parallelism constrained:** PR 2 and PR 3 must not assume final
  route/perimeter semantics until PR 1 proof establishes the
  canonical/legacy/dead-surface baseline.
- **Pause rule:** if PR 1 has not yet established that baseline, PR 2 and PR 3
  may prepare harnesses and discovery notes but must pause any conclusion that
  depends on final route/perimeter semantics until PR 1 reports its findings.
- **Leader integration rule:** Ralph/leader owns the final synthesis. No proof
  lane may declare the queue sign-off ready on its own.
- **Merge/revision rule:** proof findings can be gathered in parallel, but the
  queue revision step happens only after the leader compares all three proof
  artifacts against the deep-interview stop lines.

## Implementation Steps

### Step 1 — PR 1 route/perimeter sandbox proof

**Goal:** prove the queue's perimeter assumptions before any deeper data work.

**Primary files**

- `client/src/config/routes.ts`
- `client/src/App.tsx`
- `client/src/core/routes/ia.ts`
- `client/src/components/LegacyRouteRedirector.tsx`
- `client/src/components/insights/data-driven-insights.tsx`
- `tests/unit/app/route-governance-registry.test.tsx`
- `tests/unit/app/route-perimeter-governance.test.tsx`

**Proof tasks**

- enumerate every current `/model`-mapped modeling route and assert one explicit
  disposition per route: canonical, legacy, hidden, redirect, or deprecated
- codify canonical vs legacy vs hidden route expectations
- prove dead `/model` mappings are identified and intentionally handled
- prove internal links do not accidentally send users into dead deterministic
  surfaces

**Allowed write scope**

- route/perimeter test files
- route-governance metadata / route registry files
- narrowly scoped route/perimeter wiring files needed to make assertions
  meaningful
- no data-contract work, no PR 2+ production UI cleanup, no Scenario Builder
  convergence decision

**Verification**

- targeted route-governance/perimeter tests
- `npm run check`

**Required proof artifact**

- `.omx/proofs/phase-1b-pr1-route-perimeter.md`
- must include: canonical vs legacy route matrix, dead-link findings, test
  evidence, and any queue revisions required before sign-off

### Step 2 — PR 2 active-fund scoping sandbox proof

**Goal:** prove deterministic forecast surfaces can operate truthfully without
hardcoded fund `1`.

**Primary files**

- `client/src/components/dashboard/dual-forecast-dashboard.tsx`
- `client/src/pages/financial-modeling.tsx`
- `client/src/pages/forecasting.tsx` only if still reachable after proofing
- `client/src/contexts/FundContext.tsx`
- new or existing focused client tests for deterministic surface behavior

**Proof tasks**

- remove proof-slice reliance on `/api/dashboard-summary/1`
- remove proof-slice reliance on `/api/fund-metrics/1`
- prove `FundContext` drives active fund selection
- prove missing fund context yields truthful blocked/empty behavior
- inspect server-side default-fund backdoors in
  `server/routes/performance-metrics.ts` and
  `server/routes/engine-summaries.ts`; either prove they are outside the active
  deterministic path for this proof or record them as a blocker requiring queue
  revision before sign-off

**Verification**

- targeted client tests with mocked `FundContext`
- `npm run check`

**Allowed write scope**

- `client/src/components/dashboard/dual-forecast-dashboard.tsx`
- `client/src/pages/financial-modeling.tsx`
- `client/src/pages/forecasting.tsx` only if still reachable after PR 1 proof
- focused client tests / mocks
- inspection-only notes for server default-fund routes unless a minimal proof
  adjustment is required to expose the blocker
- no new backend contract work, no PR 4 UI delivery

**Required proof artifact**

- `.omx/proofs/phase-1b-pr2-active-fund.md`
- must include: hardcoded-fund findings, missing-fund behavior evidence, touched
  files, and any queue revisions required before sign-off

### Step 3 — PR 3 forecast comparison contract spike

**Goal:** prove the queue can support a narrow dedicated read contract without
silently widening generic routes.

**Primary files**

- new shared contract file under `shared/`
- new server route/read-service proof slice under `server/`
- `tests/integration/dashboard-summary-route.test.ts` (reference only if reusing
  pattern)
- new focused integration test(s) using `tests/setup/test-infrastructure.ts`

**Proof tasks**

- define a narrow forecast comparison payload
- prove no-data / not-found / provenance semantics
- prove the spike composes from authoritative data sources rather than bloating
  `dashboard-summary`
- keep the spike read-side and proof-oriented; do not mount new UI consumers or
  treat the contract spike as approval for PR 4 delivery
- keep the spike unmounted and non-production-facing until sign-off is complete
- if proving the route would require resolving Scenario Builder semantics, stop
  the lane, write the blocker into the proof artifact, and revise the queue
  instead of widening the contract or inferring product behavior

**Verification**

- focused route integration tests using `createSandbox()`
- `npm run check`

**Allowed write scope**

- one new shared contract file under `shared/`
- one proof-only read-service / route slice under `server/`
- focused integration tests / harness files
- no mounted client consumers, no redirect behavior, no PR 4/PR 6 rollout work

**Required proof artifact**

- `.omx/proofs/phase-1b-pr3-forecast-contract.md`
- must include: contract shape, authoritative-source assumptions, no-data and
  provenance evidence, blockers, and any queue revisions required before
  sign-off

### Step 4 — Revise the queue from proof findings

**Goal:** fold reality back into the plan before sign-off.

**Primary files**

- `docs/plans/2026-04-03-phase-1b-single-owner-pr-queue.md`
- optionally linked roadmap docs if sequencing or gating notes need cross-links

**Required revisions**

- update sequence assumptions invalidated by proof work
- add missing gates or clarifying notes discovered in proofs
- tighten acceptance criteria and validation commands where gaps were exposed
- explicitly preserve the stop line and later resume trigger

**Verification**

- diff review against the proof findings
- ensure revised queue still keeps Scenario Builder as an explicit later gate

### Step 5 — Leader synthesis gate before sign-off

**Goal:** reconcile the three proof lanes into one sign-off recommendation.

**Required synthesis checks**

- confirm each lane stayed inside its allowed write scope
- confirm each lane produced the required `.omx/proofs/` artifact
- reconcile contradictions across PR 1 / PR 2 / PR 3 findings
- re-check the revised queue against
  `.omx/specs/deep-interview-validate-plan-sign-off.md`
- stop and withhold sign-off if any proof lane only succeeds by expanding into
  broader implementation or by implicitly deciding Scenario Builder behavior

**Verification**

- artifact review of all `.omx/proofs/phase-1b-pr*.md` outputs
- diff review of the revised queue document
- explicit sign-off checklist against the deep-interview spec

## Risks and Mitigations

- **Risk:** proof slices drift into broad implementation  
  **Mitigation:** enforce stop line at proofs + plan update only; defer broader
  production work to later approval.

- **Risk:** client-only PR 2 proof misses server-side fund-1 backdoors  
  **Mitigation:** explicitly inspect `server/routes/performance-metrics.ts` and
  `server/routes/engine-summaries.ts`; treat unresolved default-fund behavior as
  a blocker or queue-revision trigger instead of ignoring it.

- **Risk:** PR 3 proof widens `dashboard-summary` or invents a parallel
  aggregation stack  
  **Mitigation:** require a narrow dedicated contract/read-service spike and
  document any attempt to widen generic routes as a rejection reason.

- **Risk:** Scenario Builder is silently collapsed during route cleanup  
  **Mitigation:** keep any redirect/deprecation decision explicitly blocked on
  later product approval.

- **Risk:** proof findings invalidate the merge order  
  **Mitigation:** revise the queue before sign-off instead of preserving stale
  order for consistency.

## Verification Steps

1. Run the smallest relevant targeted proof tests for each slice.
2. Run `npm run check` after each proof slice.
3. Review changed files to confirm proof-only scope.
4. Confirm each lane produced its required `.omx/proofs/` artifact.
5. Reconcile any cross-lane contradictions, especially where PR 2/PR 3 findings
   depend on PR 1 perimeter conclusions.
6. Update the queue document from proof findings.
7. Re-read the revised queue against the deep-interview spec:
   `.omx/specs/deep-interview-validate-plan-sign-off.md`
8. Approve sign-off only if all acceptance criteria above are satisfied.

## ADR

### Decision

Use **sandbox-proof-first conditional sign-off** for the Phase 1B queue.

### Drivers

- evidence-backed sign-off
- strict pre-signoff scope containment
- explicit gating for unresolved product decisions

### Alternatives considered

- document-only sign-off review
- broad pre-signoff implementation

### Why chosen

It provides the highest confidence while preserving the user's stop line: proofs
first, plan revision second, broader execution later.

### Consequences

- sign-off takes longer than a document-only review
- early proof work must be carefully staffed to stay narrow
- final approval becomes more defensible and easier to resume from

### Follow-ups

1. Execute proof slices for PR 1–3.
2. Revise the queue from proof findings.
3. Re-run consensus sign-off review on the revised queue if needed.
4. Resume broader planning/execution only after the gating item is complete.
5. Treat completion of the proof-backed queue revision as the handoff point for
   any later Ralph/team production execution approval.

## Available-Agent-Types Roster

- `planner` — plan revision and sequencing adjustments
- `architect` — architectural/tradeoff review
- `critic` — quality gate / sign-off review
- `executor` / `worker` — proof-slice implementation
- `verifier` / `test-engineer` — regression and proof validation
- `code-reviewer` — review of proof slices before plan revision

## Follow-up Staffing Guidance

### Ralph follow-up

Ralph should own the loop as the persistence/verification lead:

- **Lane 1:** implementation owner for PR 1 proof slice
- **Lane 2:** implementation owner for PR 2 proof slice
- **Lane 3:** implementation owner for PR 3 proof slice
- **Lane 4:** verification + plan-revision integration

Suggested reasoning levels:

- proof-slice executors: medium/high
- verification lane: high
- architect sign-off lane: high

### Team follow-up

Recommended team split for the proof phase:

1. **Executor 1 — PR 1 perimeter proof**
   - owns route/perimeter tests and route-governance hardening
2. **Executor 2 — PR 2 active-fund proof**
   - owns hardcoded-fund removal proof and `FundContext`-based tests
3. **Executor 3 — PR 3 contract spike**
   - owns narrow forecast-contract spike and integration harness proof

Keep plan revision and final sign-off in the leader/Ralph lane after the three
proof lanes report findings.

## Launch Hints

Ralph handoff:

- `$ralph .omx/plans/2026-04-03-phase-1b-signoff-sandbox-proof-plan.md`

Team handoff (3 executor lanes):

- `$team 3:executor "Execute the PR1/PR2/PR3 sandbox proof lanes from .omx/plans/2026-04-03-phase-1b-signoff-sandbox-proof-plan.md, stay within proof-only scope, and report findings for plan revision"`

Programmatic fallback when tmux/team runtime is unavailable:

- launch three parallel executor subagents for:
  - PR 1 route/perimeter proof
  - PR 2 active-fund scoping proof
  - PR 3 contract spike proof
- require each subagent to emit the matching `.omx/proofs/` artifact before the
  leader integrates findings

## Team Verification Path

Before team shutdown, prove:

1. each proof lane completed its targeted verification
2. no lane widened into full PR 4+/production delivery
3. proof findings are summarized in a leader-consumable form
4. changed-file ownership is clear enough for integration/review
5. each lane produced its required proof artifact for leader synthesis

After team completion, Ralph verifies:

1. all targeted tests/checks actually passed
2. the queue document was revised from findings
3. revised queue still satisfies the deep-interview stop lines
4. final sign-off recommendation is evidence-backed

## Consensus Changelog

- Added explicit proof-first sign-off gate for PR 1–3
- Added hard stop against broad pre-signoff implementation
- Added explicit Scenario Builder gate preservation
- Added Ralph + Team staffing/verification guidance
- Tightened each proof lane into a bounded validation slice with allowed write
  scopes
- Added explicit `/model` route enumeration requirement for PR 1 proof
- Added server-side default-fund backdoor handling for PR 2 proof
- Added non-production-facing and blocker rules for PR 3 proof
- Added final leader synthesis gate before sign-off
