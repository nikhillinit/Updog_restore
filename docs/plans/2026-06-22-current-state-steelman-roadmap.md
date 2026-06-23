---
status: DRAFT
last_updated: 2026-06-22
reviewed_sha: 20eef5c9
owner: Platform Team
review_cadence: P14D
audience: both
categories: [roadmap, governance, trust, product-strategy]
keywords:
  [
    current-state,
    steelman,
    secondary-surface,
    investment-rounds,
    moic,
    lp-reporting,
    provenance,
  ]
---

# Current-State Steelman Roadmap v2

**DRAFT** — pending the enforcement PRs (PR-H0 through PR-H8) below; not yet
authoritative. Reviewed against `main` at `20eef5c9`. This document consolidates
stale roadmap snapshots and replaces the first current-state steelman draft,
anchored to the June 18-22 secondary-surface, MOIC, LP-dashboard, and
investment-rounds work, and incorporates the synthesized review comments from
2026-06-22. Where it disagrees with current `main` code, the code wins (see
Decision rule).

## What changed from v1

The first roadmap had the right strategic spine but overstated readiness in a
few places. This revision accepts the material review objections:

- **Route-policy registry must precede LP Reporting qualification.** LP
  role/workflow/export policy should not be invented ad hoc inside an LP-only
  PR.
- **Investment-round flag readiness is blocked by access-boundary proof.**
  `GET /api/investments/:id` and similar entity reads must be audited before any
  non-prod flag ramp.
- **MOIC compatibility routing must not become a bypass.** A query-param
  compatibility route may remain only if active references are documented and
  API-level fund access is regression-tested.
- **LP Reporting is not fully trust-qualified yet.** Until
  role/workflow/provenance/export gates are accepted, any LP export path must be
  admin-only and watermarked `PRE-PRODUCTION / NOT AUDITED`; if no export path
  exists, a test or grep proof must say so.
- **Governance claims need enforcement.** The roadmap now assigns CI/lint/script
  owners for bundle quarantine, route policy, LP mount parity, stale-doc
  hygiene, and production flag posture.
- **Weasel words were removed.** Scope and acceptance criteria now use testable
  outcomes rather than “consider,” “if needed,” or “where possible.”

## Review method

The review used a structured multi-pass method:

1. **Literal pass:** what the current code, flags, routes, and merged PRs
   actually say.
2. **Stakeholder pass:** what GPs, LP viewers, operators, maintainers, and
   future agents need protected.
3. **Failure pass:** what could externalize fabricated data, bypass fund scope,
   or create false confidence.
4. **Temporal pass:** what became stale after the recent PR stack.
5. **Product-domain pass:** what the Tactyc reference model implies about
   reserves, rounds, MOIC, actuals, and reporting.
6. **Adversarial pass:** the strongest case for the repo’s current architecture,
   followed by the strongest objections.
7. **Integration pass:** accepted, modified, or rejected each review comment and
   rewrote the execution sequence accordingly.

## Steelman thesis

The strongest version of `Updog_restore` is a **trust-first venture fund
platform**. The repo has already made the key product-trust pivot: mock/sample
financial surfaces were deleted, production bundle verification guards
reintroduction, MOIC no longer renders static sample rankings as primary
content, LP dashboard widgets no longer depend on fixture-only routes, and
investment rounds now have a real persistence backbone plus a flag-gated UI.

The next best path is **not** a broad rewrite. The next best path is to harden
the new spine:

- keep the canonical modeling flow truthful;
- close direct entity access-boundary gaps;
- convert route governance into policy governance;
- promote investment rounds only after access, flag, workflow, and support
  proof;
- define how persisted rounds feed reserve/MOIC calculations before changing
  engines;
- generalize provenance beyond MOIC;
- place MOIC/reserve ranking where fund context is canonical;
- qualify LP Reporting with role, workflow, provenance, export, and watermark
  policy.

## Current state map

| Area                        | Current state                                                                                                                                                                                      | Strongest interpretation                                                                          | Remaining pressure                                                                                                                                                      |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production mock surfaces    | `/reserves-demo`, `/allocation-manager`, `/cash-management`, `/portfolio-analytics`, and `/cap-tables` are deleted; `scripts/check-prod-bundle.mjs` (`QUARANTINED_MODULES`) guards reintroduction. | The repo chose deletion over dev-only ambiguity, which is the cleanest trust posture.             | Keep decision docs and build docs aligned; add a negative test that proves a renamed mock surface is caught by the governance layer, not just by substring coincidence. |
| Tear Sheet / Reports        | Mock Tear Sheet production chunk was build-excluded; Active Alerts no longer collapses failure into fake zero.                                                                                     | The first false-financial-fact class is now guarded by build and UI logic.                        | Authoritative exports still need a server-side artifact policy before any replacement Tear Sheet returns.                                                               |
| MOIC                        | `/moic-analysis` is live-primary, fund-id driven, Zod-parsed, and provenance-gated.                                                                                                                | The page now fails closed instead of showing sample companies.                                    | The route is still compatibility-shaped; canonical placement should be fund-results-native, and compatibility must be API-access tested or removed.                     |
| Investment rounds           | ADR-023 L3b persistence landed with `investment_rounds`, idempotent create, list/read, fund enforcement on round routes, supersede correction, and UI v2 behind `enable_investment_rounds`.        | This is the first real investment-event persistence backbone needed for reserve/MOIC correctness. | The flag remains off in every environment; direct investment reads still require access-boundary audit before any flag ramp.                                            |
| LP dashboard / LP Reporting | LP dashboard/profile widget routers are mounted in both `makeApp` and `registerRoutes`; dashboard hooks use runtime contracts.                                                                     | The fixture-only dashboard gap was closed without a new aggregate API.                            | LP Reporting remains unqualified until role, workflow, provenance, export, and watermark gates land.                                                                    |
| Route governance            | The registry imports executable route objects and guards path/exposure coverage.                                                                                                                   | The route perimeter is no longer regex-only or doc-only.                                          | The registry still needs policy fields: financial tag, API auth boundary, fund-scope mode, role/workflow requirements, export eligibility, telemetry key, and owner.    |
| Server dead surfaces        | Portfolio snapshot/version-history dead code was archived; verified orphans were removed.                                                                                                          | The repo is deleting implied capabilities that were never mounted.                                | Continue distinguishing docs-only, unmounted, mounted-placeholder, and live-mounted states.                                                                             |
| Tasks operating object      | Backend/list hook landed; readiness audit was partially corrected.                                                                                                                                 | Useful precedent for backend-first operating objects.                                             | It is not on the immediate product spine; do not displace investment rounds, MOIC, or LP Reporting.                                                                     |

## Product-domain anchor

The domain logic reinforces the sequence:

- Capital-allocation-first construction is more stable than fixed deal-count
  construction because changing check sizes, follow-ons, fees, expenses, or
  recycling otherwise breaks the model.
- Current Forecast should account for actual investments and remaining capital,
  while Construction Forecast is the original plan before investments.
- Follow-on reserves depend on round sizes, valuations, graduation rates, exit
  rates, failure rates, and later-stage assumptions.
- Exit MOIC on Planned Reserves is the reserve-ranking metric: expected return
  on the next dollar into each company.
- Therefore, **investment rounds and actuals are upstream of durable
  reserve/MOIC/reporting trust**.

## Temporary trust measures

These measures apply until the relevant hardening PR lands:

1. **LP exports:** any active LP export route before PR-H7b completion must be
   admin-only and include `WATERMARK: PRE-PRODUCTION / NOT AUDITED` in the
   generated artifact and UI preview. If no LP export route exists, PR-H0 must
   add a grep/test proof that no export path is active.
2. **Investment rounds:** `enable_investment_rounds` remains `false` in
   production until PR-H1, PR-H2, PR-H3, and the support playbook are accepted.
3. **MOIC compatibility:** `/moic-analysis?fundId=` remains compatibility-only.
   It may survive PR-H6 only if active references are documented and API-level
   cross-fund denial is covered by tests.
4. **Deleted mock surfaces:** reintroducing a deleted surface requires a new
   owned implementation, route decision, and production-bundle negative test.

## Enforcement baseline

The roadmap is executable only if enforcement moves from documentation to
checks:

- **Bundle quarantine:** CI must run `npm run build:verify` after
  `npm run build`; `scripts/check-prod-bundle.mjs` and its `QUARANTINED_MODULES`
  list must be CODEOWNERS-protected.
- **Route policy:** PR-H2 adds policy-registry tests that fail if a route tagged
  `financial: true` lacks auth boundary, fund-scope mode, owner, and export
  policy.
- **`isProtected` guard:** PR-H2 adds a lint/test assertion that `isProtected`
  alone never counts as API auth or fund-scope enforcement.
- **LP mount parity:** PR-H2 adds a regression test proving LP dashboard/widget
  routes are mounted in both `makeApp` and `registerRoutes`.
- **Flag posture:** PR-H3 adds a production-like flag test proving
  `enable_investment_rounds` cannot be on in production until the acceptance
  gate is updated.
- **Doc cadence:** PR-H8 adds or wires the existing discovery/staleness
  generator so active docs past cadence fail a scheduled hygiene check or
  generate a review artifact.

## What to stop doing

- Do not recreate deleted mock/demo pages to solve navigation gaps.
- Do not promote a client-only report/export path for authoritative financial
  documents.
- Do not treat `isProtected` as identity auth or fund access.
- Do not promote investment rounds to production because the UI exists behind a
  flag.
- Do not add performance cases, valuation events, ownership, or cap-table events
  until their persistence and correction models are explicit.
- Do not rebuild auth from scratch inside route-policy work.
- Do not implement reserve/MOIC calculation engine changes inside the
  rounds-to-model contract bridge.
- Do not let old docs with execution claims guide work unless they are marked
  `ACTIVE`, current by cadence, and consistent with current code.

## Revised PR sequence

### PR-H0 — Adversarial trust audit

**Goal:** add failing or proving checks for the highest-risk assumptions before
implementation PRs begin.

Scope:

- attempt cross-fund access through `GET /api/investments/:id` and record the
  result;
- attempt round list/read across fund boundaries and prove current denial
  remains intact;
- attempt to reintroduce a deleted mock surface under a new page name and
  document whether bundle/policy checks catch it;
- attempt to flip `enable_investment_rounds` in a production-like flag
  environment and record the result;
- detect whether LP export routes exist; if they exist, prove admin-only +
  watermark or open a blocker for PR-H7b.

Acceptance:

- creates `docs/design/audits/2026-06-22-trust-adversarial-audit.md` with
  pass/fail findings and exact follow-up owners;
- no production behavior changes except tests/audit artifacts;
- findings are linked from PR-H1 and PR-H2 implementation plans.

### PR-H1 — Direct entity access-boundary hardening

**Goal:** make direct investment read paths match the rigor already applied to
round routes.

Scope:

- audit `GET /api/investments/:id` and other direct entity reads for fund-scope
  enforcement;
- close the unscoped `GET /api/investments` list path: with no `fundId` it skips
  `enforceProvidedFundScope` and `storage.getInvestments(undefined)` issues a
  query with no fund predicate — require an explicit fund scope or scope to the
  caller's funds;
- confirm whether Postgres RLS (`investments_isolation_policy`, org-keyed on
  `app.current_org`) actually enforces on the non-transactional GET path in
  production before rating severity — the app-layer query is unscoped, but under
  FORCE RLS with an unset GUC the policy fails closed; fix the app layer
  regardless as defense-in-depth;
- add route tests proving cross-fund reads cannot leak investment detail;
- preserve list-by-fund behavior for `GET /api/investments?fundId=...`;
- produce `docs/design/audits/2026-06-22-entity-access-boundary.md` as a raw
  audit artifact for PR-H2 ingestion;
- keep this PR independent of the future route-policy registry.

Acceptance:

- direct investment reads are fund-scoped or explicitly return no sensitive fund
  data;
- regression tests fail if cross-fund investment detail is returned;
- round routes keep investment-derived fund enforcement on create/list/read;
- no UI relies on an unscoped direct investment read.

### PR-H2 — Route policy registry and governance enforcement

**Goal:** extend route governance from path/exposure coverage into
product-policy coverage.

Scope:

- add route-policy metadata for auth boundary, fund-scope mode, role/workflow
  policy, export policy, telemetry key, owner, and `financial: true` tag;
- ingest PR-H1 raw access-boundary findings;
- add tests that every `financial: true` route has policy coverage;
- add tests that `isProtected` does not satisfy API auth or fund scope;
- add CI assertion that `npm run build:verify` fails on quarantined module
  reintroduction;
- add LP mount parity tests for `makeApp` and `registerRoutes`;
- CODEOWNERS-protect `scripts/check-prod-bundle.mjs`, active route-policy files,
  and current-state docs.

Acceptance:

- every mounted SPA route has route/exposure coverage;
- every route tagged `financial: true` has policy coverage;
- public contracts and archived redirects remain explicitly classified;
- LP dashboard/widget route removal fails tests;
- `scripts/check-prod-bundle.mjs` remains a blocking build-verification
  primitive.

### PR-H3 — Investment rounds flag-readiness proof

**Goal:** make `enable_investment_rounds` eligible for non-prod proof without
production exposure.

Prerequisites:

- blocked until PR-H1 and PR-H2 are accepted and merged.

Scope:

- keep production default off;
- enable development only after route access, flag-off invisibility, and
  production-off checks pass;
- add a feature-flag readiness checklist covering create, replay, key reuse,
  supersede, double-supersede, empty state, access denial, and flag-off
  invisibility;
- add flag-on route-rendering telemetry/test hooks;
- draft `docs/runbooks/investment-round-supersede-support.md` for
  supersede/correction edge cases;
- keep cases, valuation, ownership, and cap-table events outside scope.

Acceptance:

- flag-on behavior is demonstrably safe in development/non-prod tests;
- flag-off behavior is invisible in UI and route tests;
- production flag remains false;
- support playbook exists and covers idempotency conflict, missing supersede
  target, double supersede, and rollback communication.

### PR-H4 — Rounds-to-model contract bridge

**Goal:** define how persisted rounds feed reserve/MOIC calculations before
building more event types.

Scope:

- document whether `investment_rounds` are source-of-truth, evidence inputs, or
  UI-only event records for current calculations;
- define field-level mapping from rounds to planned reserves, valuation,
  ownership, and MOIC inputs;
- reserve a provenance hook in the contract shape so PR-H5 can populate it
  without structural change;
- keep `/cases` 501 until performance-case persistence has its own ADR;
- define migration sequencing for future valuation/ownership/cap-table tranches;
- do not implement calculation engine changes in this PR.

Acceptance:

- produces a contract/spec with explicit enum references and docstrings for each
  mapping state;
- every calculation consumer is classified as `uses_rounds`, `ignores_rounds`,
  or `blocked_until_modeling_pr`;
- no UI copy claims that rounds affect calculations unless the consumer is
  `uses_rounds`;
- future event types have a sequenced dependency map.

### PR-H5 — Shared provenance envelope

**Goal:** generalize the MOIC provenance win without forcing an all-endpoints
rewrite.

Scope:

- introduce `shared/contracts/provenance.contract.ts` with source authority,
  calculation mode, freshness, warnings, and export eligibility;
- adapt MOIC as the mandatory phase-one consumer;
- if MOIC adaptation is blocked, document the exact blocker and open a named
  follow-up ticket before merging;
- make missing/invalid provenance fail closed for phase-one material financial
  responses;
- define `LIVE`, `PARTIAL`, `FALLBACK`, `DEMO`, `UNAVAILABLE`, and `FAILED`
  semantics.

Acceptance:

- MOIC parses the shared provenance envelope or has a documented blocker and
  follow-up;
- financial UI can distinguish provenance states without inference;
- export eligibility is contract-level, not component convention;
- contract parse failure never renders stale/sample values.

### PR-H6 — MOIC canonical placement and compatibility hardening

**Goal:** move MOIC from query-param compatibility to fund-context-native
product placement.

Scope:

- add a fund-results child route or tab such as
  `/fund-model-results/:fundId/moic-analysis`;
- keep `/moic-analysis?fundId=` only if an active integration/bookmark reference
  is documented; otherwise remove it;
- if compatibility remains, add API-level fund-scope regression tests proving
  the route cannot access another fund’s MOIC data;
- render 401/403 as auth/access denied, not generic unavailable;
- add no-data and stale/provenance states;
- preserve planned-reserves MOIC as the reserve deployment ranking metric.

Acceptance:

- MOIC has canonical fund context without query dependency;
- retained compatibility route has documented callers and access-denial tests;
- empty live ranking is a valid no-data state;
- stale/missing provenance fails closed.

### PR-H7a — LP Reporting role and access qualification

**Goal:** qualify LP surfaces at the role/access layer using the route-policy
registry.

Prerequisites:

- blocked until PR-H2 is accepted and merged.

Scope:

- audit role vocabulary and `requireRole` callers;
- define GP/LP/admin access for ledger, valuations, metrics, imports, reports,
  exports, and evidence;
- implement basic access gates for the highest-risk LP surfaces first: reports,
  exports, imports, and evidence;
- keep workflow-state machine and export provenance for PR-H7b;
- add at least one route or component test per new access gate.

Acceptance:

- LP access failures render explicit role/access states;
- admin-only pre-qualification export posture is enforced if export routes
  exist;
- no LP surface relies on route mount alone as qualification.

### PR-H7b — LP Reporting workflow, provenance, and export qualification

**Goal:** qualify LP reporting outputs with workflow state, provenance, and
export policy.

Prerequisites:

- blocked until PR-H5 and PR-H7a are accepted and merged.

Scope:

- add workflow-state gates for draft, approved, locked, report-package-ready,
  export-ready, and export-blocked states;
- attach shared provenance/export eligibility to report package and export
  paths;
- add watermark behavior for any pre-production or not-audited export path;
- use existing LP Reporting Playwright infrastructure and add at least one test
  per new workflow-state gate;
- update route-policy metadata for each qualified LP surface.

Acceptance:

- LP exports cannot be produced from `DEMO`, `FALLBACK`, `UNAVAILABLE`, or
  `FAILED` provenance;
- role, workflow, and provenance failures render explicit UI states;
- every active LP export artifact is either qualified or visibly watermarked and
  admin-only;
- dashboard widgets and route mounts no longer hide missing policy.

### PR-H8 — Mechanical documentation hygiene

**Goal:** prevent old execution claims from misleading future agents.

Scope:

- add frontmatter to high-priority active superpowers plans/specs;
- mark superseded execution plans `HISTORICAL` and add `superseded_by` links;
- regenerate discovery/staleness artifacts through the repo generator;
- add or document the scheduled review mechanism for P14D docs.

Acceptance:

- H8 does not replace documentation acceptance criteria in H1, H2, H4, H7a, or
  H7b;
- product-policy documentation remains in the PR that changes policy;
- generated staleness report lists zero active stale docs for the
  roadmap-critical set;
- README and Build Readiness point to current-state references.

## Roadmap acceptance criteria

The roadmap remains current only while all of the following are true:

1. Deleted mock surfaces stay absent from routes and production bundles.
2. `scripts/check-prod-bundle.mjs` remains a hard production-build verifier in
   CI.
3. MOIC uses live Zod-parsed data and does not render sample rankings.
4. Investment rounds stay flag-gated until access, route-policy, flag, workflow,
   and support proof are complete.
5. Round routes enforce fund scope on create/list/read.
6. Direct investment read paths are audited and hardened.
7. LP dashboard/widget routes stay mounted in both active server surfaces.
8. LP Reporting promotion has role, workflow, provenance, export, and watermark
   gates.
9. Route governance distinguishes client fund-context guards from API auth and
   fund scope.
10. Older execution-claim docs are marked historical or revalidated.

## Decision rule

When code facts, merged PR descriptions, and old roadmap docs disagree, trust in
this order:

1. current `main` code and generated artifacts;
2. accepted ADRs and active decision docs updated after the code landed;
3. merged PR descriptions from the relevant feature/fix;
4. old plans/specs only as historical context.

## Decision-rule enforcement

- PR-H2 adds route-policy tests and `isProtected` guardrails.
- PR-H2 protects bundle quarantine and LP mount parity in CI.
- PR-H8 adds the doc-cadence/staleness mechanism.
- Every future roadmap PR must state whether it changes one of the ten
  acceptance criteria above.
