---
status: PROPOSED
audience: agents
last_updated: 2026-09-06
owner: Repository Owner
categories: [release, current-forecast, economics, decision-workspace]
keywords:
  [F_1.11.0, current-forecast, internal-economics-v2, decision-workspace]
---

# Updog Restore Reconciled Program Implementation Plan

## September 6, 2026 local implementation status

Program A Phase P source work and Program B V2 security-lineage work are locally
implemented. Local tests and independent source review are recorded outside the
repository against exact commits and patch digests. Source admission remains
pending; these observations do not certify a release candidate or runtime state.
Program C has five drafted specifications and five proposed implementation
plans; owner approval remains pending. C1 currently has no distinct persisted
comparable after-assumption source, so its prepared contract returns no drivers
and records all 12 ordered typed omissions instead of inventing attribution.

The authenticated database-health correction requires fresh surface-matrix
provenance. Matrix regeneration and independent review may be prepared locally;
G1 owner closure remains pending. Candidate selection, provider operations,
actuals trial, shadow entry, activation, and kill/resume remain separate gates.

## September 6, 2026 source reconciliation

This remains the current Programs A-C sequencing roadmap. This update records
the local implementation baseline against
`origin/main@1cdef4f1bc24072742a2cd24349f04c6ec074f0f` (tree and GitHub evidence
retained outside the repository). The September 3 baseline and reviews below
remain historical evidence, not a frozen candidate. No new feature version is
introduced for this roadmap reconciliation.

| Workstream                  | Admitted source at this baseline                                                                                                                                                  | Remaining work                                                                                                                                              |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Earlier decision workspace  | F_1.7.0 S1/C1A, F_1.8.0 decisions, F_1.9.0 rail, F_1.10.0 operations; #1448, #1449, #1460, #1461, #1466                                                                           | Program C follow-ons and their specification gates; source admission does not establish deployment or user acceptance                                       |
| Current Forecast hardening  | F_1.11.0 P0b through #1469/#1470                                                                                                                                                  | Program A Phase P capabilities, fresh candidate certification, provider binding, four-window soak, owner decision and separately dispatched runtime actions |
| V2 conformance              | F_2.0.7 through #1459                                                                                                                                                             | Program B #1458 multi-security proceeds correction implemented and independently reviewed locally; source admission and serving authority remain pending    |
| Financial-facts publication | F_1.12.0 ratified by accepted ADR-097 and #1476; implementation through #1478 (`0e5cb896125f3d2c130d836ef85551758ad33370`) and #1479 (`ff234218538ade7486685348e37820e7b1161d36`) | Documentation closure, evidence reconciliation, separately authorized Phase 8 isolated trial and committed Gate A STOP/GO                                   |
| Maintenance                 | #1474, #1482, and #1484 admitted; #1484 merged as `1cdef4f1bc24072742a2cd24349f04c6ec074f0f` on September 6 at 22:13:44 UTC                                                       | Source admission includes actuals organization-context and RLS hardening; it does not establish a product milestone or runtime readiness                    |

GitHub readback on September 6, 2026 confirms #1479 merged September 5 at
23:50:07 UTC. Its tested PR head was `40e758c70d91ca162191fb90493a4f8474cc9fb8`;
historical green checks do not certify this newer main SHA or a future
activation candidate. PR #1484 terminal head was
`3bc2841c65464dae0de0947cdcd19ae83fa2e237`; its `CI Gate Status` succeeded on
September 6 at 22:03:02 UTC. Source inspection confirms organization-context
propagation and transaction-scoped RLS in the actuals publisher, with no new
organic shadow trigger or Program B/C contract change. These are historical
source receipts, not certification of this local work.

### Corrections that govern the next planning pass

1. **Preserve ADR-097 and serialize allocation.** It governs F_1.12.0. Before
   either A or B edits `DECISIONS.md`, one integration owner refreshes protected
   main and records two distinct unused ADR identifiers together in the
   execution handoff. Each lane consumes its assignment rather than choosing the
   next number independently. Recheck both assignments on rebase and before
   admission; reassign any collision before proceeding. Update the Phase P
   title, ADR-095 amendment and assertions consistently. This record coordinates
   identifiers, not source-admission authority.
2. **Close F_1.12.0 documentation before calling the plan complete.** Update its
   required `README.md`, `.env.example`, `docs/ARCHI.md`, `docs/INDEX.md`, and
   `docs/workflows/PRODUCTION_SCRIPTS.md` descriptions of the default-off pilot,
   policy 1.4/payload 5, basis references and separate activation route. The
   accepted ADR is already present. Keep the original architectural and planning
   snapshots dated; do not present August observations as live state.
3. **Keep two terminal decisions separate.** F_1.12.0 Gate A is the isolated
   actuals trial STOP/GO. Program A's #1299 is Current Forecast activation
   GO/NO-GO after its own evidence chain. Neither closes the other. Economics
   and periodic analysis still refuse payload 5; valuation marks do not prove
   fund NAV, RVPI or TVPI.
4. **Re-pin Program C to current contracts.** Its five specifications must
   explicitly handle `FinancialFactsBasisRef`, policy 1.4/payload 5, permitted
   consumers, unavailable measures and same-head refusal behavior before their
   result hashes, evidence links and admission contracts are approved. The
   September 3 sketches are inputs to specification work, not current-source
   certification. Keep C1 -> C2 and C3a -> C3b -> C3c dependencies.
5. **Retain the release prerequisites.** Program B and the complete Program A
   Phase P unit must land before selecting the activation candidate. F_1.12.0
   adds no DDL: the inspected journal still ends at
   `0055_current_forecast_recompute_commands`. Provider, database, grants,
   configuration, deployed source and soak state remain `UNKNOWN` until
   action-specific readback supplies evidence.
6. **Resolve the organic-event-source gap before sharing the pilot target.** The
   actuals publish route returns its receipt without a shadow trigger; its
   default after-commit effect only invalidates cache. Both existing organic
   trigger paths call the legacy facts builder, which rejects the configured
   pilot fund. Manual recompute during shadow blocks activation eligibility.
   Select a separately eligible non-pilot soak target, or first plan and admit a
   bounded organic-trigger change with compatible publication side-effect
   guarantees. Do not count the pilot trial's explicit runs as soak evidence.

### Updated next sequence

- Reconcile F_1.12.0 documentation and retained verification evidence; prepare
  its Phase 8 trial from one explicitly selected merged SHA. Any environment,
  grant or data action requires its own bounded authorization.
- Implement Program B and Program A Phase P in independent source lanes.
  Specification work for Program C may proceed in parallel against refreshed
  source; its product implementation remains behind the existing activation and
  applicable Program B gates. Do not add fee convergence or new V2 semantics to
  these lanes.
- Before candidate selection, account for admitted #1484 hardening, then freeze
  only after the required B/Phase P source is admitted. Record explicitly
  whether the actuals pilot is enabled and which fact producer supplies soak
  activity. A merged publisher alone proves no organic soak activity, and a
  trial or manual recompute cannot substitute for qualifying soak evidence.
- Execute candidate certification, provider/schema/runtime binding, organic soak
  and the separate #1299 decision through Program A's existing gates. Preserve
  the independent F_1.12.0 Gate A record and any outstanding STOPs.

### Review and documentation impact

This refresh changes planning text only. The companion Program A, Program C and
F_1.12.0 amendments below their headings resolve the current cross-plan
conflicts. Historical F_1.7-F_1.11 and F_2.0.7 source checklists, the w7 review,
`docs/STABILIZATION-ROADMAP.md` and F_1.4.0 remain dated context; the table
above is the current source disposition. Their original reviews are not
retroactively rewritten. Test impact for this refresh is document formatting,
reference and cross-plan consistency checks; no application test behavior
changes.

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement each admitted plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce one evidence-backed, repository-owner-authorized Current
Forecast activation, correct Internal Economics V2 multi-security proceeds
routing, and admit later decision-workspace work only through approved,
source-pinned specifications.

**Architecture:** Preserve the existing React/Express/PostgreSQL/BullMQ
architecture and its separation among source admission, immutable-candidate
certification, provider binding, soak evidence, and human activation. Split the
work into independent programs so a release-critical correction cannot silently
change the activation candidate and unresolved product choices cannot masquerade
as implementation instructions.

**Tech Stack:** Node 22.23.2, npm 10.9.2, TypeScript, React, Express,
PostgreSQL/Drizzle, BullMQ/Redis, Vitest, Playwright, Testcontainers, Vercel,
Railway, and Neon.

**Spec:** `docs/1-plans/F_1.11.0_isolated-activation-train.plan.md`,
`docs/governance/solo-internal-change-and-production-policy.md`,
`docs/workflows/PRODUCTION_SCRIPTS.md`,
`docs/runbooks/current-forecast-shadow-soak.md`, ADR-095 and ADR-096 in
`DECISIONS.md` (the new Phase P ADR will amend ADR-095 item 1; accepted ADR-097
remains the actuals-publication decision), and
`docs/adr/ADR-033-marginal-next-dollar-reserve-moic.md`.

## Global Constraints

- `origin/main@6fd4ece89215b64f5a4f6bec25a26c512040ff4d`, tree
  `07fbf4c42847b7b244f61e0f0496bf2c203ef6f8`, is the historical source baseline
  inspected on 2026-09-03 UTC. It is not the future activation candidate if
  prerequisite source changes are admitted.
- Re-fetch `origin/main` before each source-admission or candidate action. Never
  silently substitute a newer SHA.
- A plan, issue, CI result, review, receipt, provider observation, or agent does
  not grant merge, schema, provider, deployment, promotion, or activation
  authority.
- Each production mutation requires a separate action-scoped repository-owner
  dispatch through the canonical guarded procedure.
- Node is already pinned to 22.23.2 on controlled surfaces. Correct stale active
  prose only; do not perform another runtime migration.
- All mutations require idempotency. All updates require optimistic locking. All
  cursors require validation. All queue jobs require timeouts.
- Run all tests with `TZ=UTC`. Financial changes require `npm run phoenix:truth`
  and a named expected-output assertion.
- Advisory-lock-dependent Current Forecast operations require one session-bound
  PostgreSQL connection. Schema migrations require a direct, non-pooled
  connection.
- Current Forecast activation is a one-way database latch. Do not restore the
  retired `enable_current_forecast_v2` feature flag.
- Candidate, qualifying deployment, accepted source, migration state, database
  identity, corpus, or relevant environment drift invalidates current-action
  eligibility and restarts the four-window soak at Window 1.
- Production credentials must not be available to pull-request, Dependabot, or
  ordinary preview workflows.
- No new forecast, scenario, reserve, Monte Carlo, optimizer, report-builder,
  microservice, or evidence format enters Program A. Existing receipt and
  provider/workflow response families may be reused or narrowly extended.
- Tactyc remains a product reference, not a parity target or source of economic
  truth.

## Corrections Incorporated

| Prior gap                                                                                                  | Revised disposition                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `6fd4ece...` was treated as both immutable candidate and source that still needed release-control changes. | Treat it as inspected history. Admit prerequisite capabilities first, then select and freeze a new exact candidate.                                                                                 |
| Provider and database observations were carried forward as current facts.                                  | Start every provider, topology, credential, backup, branch, database, queue, deployment, and autodeploy claim as `UNKNOWN`; close it only through current authenticated readback.                   |
| The plan assumed migration 0054-0055 could use a workflow that does not support it.                        | Add one bounded journaled 0050-0055 mode to the existing schema workflow. It resumes only an exact contiguous Drizzle prefix and does not use or reinterpret the custom 0050-0053 reconcile ledger. |
| A private preview was expected to gather organic production facts.                                         | Promote the exact candidate to canonical ingress while database mode remains `off`, then enter `shadow` separately so qualifying facts writes reach the candidate without serving V2.               |
| Pre-activation kill/resume was required even though resume is post-activation-only.                        | Prove containment statically and on isolated data before cutover; perform real kill-to-held and resume only after activation.                                                                       |
| Green soak evidence could age indefinitely.                                                                | Require GO/NO-GO within 14 days after Window 4. If identity is unchanged but the deadline is missed, require one fresh seven-day extension window; identity drift restarts Window 1.                |
| Multi-security proceeds could be assigned by iteration order.                                              | Derive security from admitted `reliefRows[].investmentLotId`, create private per-security proceeds lots, and require exact `dealId:securityId` pool lookup or an existing typed refusal.            |
| Program C mixed unresolved product choices with implementation steps.                                      | Make Program C an executable specification-gate plan. Each approved specification receives its own later `superpowers:writing-plans` implementation plan.                                           |

## Plan Set and Admission Boundaries

| Program | Plan                                                                          | Entry gate                                                                                                                                    | Exit gate                                                                                                |
| ------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| A       | `docs/superpowers/plans/2026-09-03-current-forecast-activation-train.md`      | Begin with prerequisite release-capability work                                                                                               | Recorded NO-GO, or GO followed by verified activation, kill containment, resume, and final serving state |
| B       | `docs/superpowers/plans/2026-09-03-internal-economics-v2-security-lineage.md` | Independently owned; admitted before candidate selection and included in that candidate (Q3); never injected into an already-frozen candidate | Exact per-security routing or typed refusal with conservation, version, and Phoenix truth proof          |
| C       | `docs/superpowers/plans/2026-09-03-decision-workspace-specification-gates.md` | Specification work may start now; product implementation waits for Program A GO, and C3b also waits for Program B admission                   | Five owner-approved specifications and five separately generated implementation plans                    |

Program B merges into `main` before Program A candidate selection, so the
selected candidate includes the V2 proceeds fix and soaks it across the four
windows. It changes `shared/lib/internal-economics/v2`, which the API bundles,
so it can never satisfy the ADR-095 exception-merge proof and must not land
inside the hold window. It must be admitted before any deal-by-deal Internal
Economics V2 consumer serves a realization spanning multiple securities. Program
C must not modify or delay the Program A candidate.

## Evidence and Authority Contract

Use existing repository evidence contracts and immutable GitHub run/artifact
identifiers. Issue bodies remain navigation indexes, not evidence stores or
authority grants. Record:

| Claim             | Minimum evidence                                                                                               |
| ----------------- | -------------------------------------------------------------------------------------------------------------- |
| Source identity   | Commit SHA, tree SHA, migration journal tail, and clean or fully inventoried worktree state                    |
| Test identity     | Exact command, start/end UTC, exit code, candidate SHA/tree, and immutable CI URL or retained local-log digest |
| Provider identity | Project/environment/service/deployment IDs, source SHA, runtime, alias/autodeploy state, and UTC readback      |
| Database identity | Project/branch/database, direct-host fingerprint, migration tail, backup/restore identity, and UTC readback    |
| Operator decision | Named repository owner, exact action and scope, UTC timestamp, and post-state                                  |
| Unknown           | Literal `UNKNOWN`; blocks only actions that require the missing fact                                           |

Do not introduce a parallel evidence taxonomy or generic evidence document.

## Dependency Order

```text
Program A prerequisite capabilities
  -> source admission as one Phase P unit
  -> current read-only readiness
  -> new exact candidate selection and freeze
  -> exact-SHA certification
  -> isolated Neon rehearsal
  -> separately authorized production migration
  -> exact candidate deployment and provider binding
  -> separately authorized shadow entry
  -> deployed decision-spine proof
  -> four qualifying seven-day windows
  -> GO or NO-GO
  -> if GO: activate -> kill-to-held -> resume

Program B security-lineage correction
  -> independent source admission and release
     (merges before Program A candidate selection; never in the hold window)
  -> affected multi-security deal-by-deal consumers may serve

Program C specification gates may run before activation
  -> one implementation plan per approved specification
  -> product implementation waits for Program A GO and applicable Program B gate
```

## Program Checklist

- [ ] **Step 1: Complete Program A Phase P as one admission unit**

  Implement and review the schema/rehearsal/action capabilities plus tracked
  activation documentation in Program A Tasks 1-5. Do not merge a
  governance-only partial state. Record one Phase P PR and one owner
  source-admission decision.

- [ ] **Step 2: Execute Program B independently, before candidate selection**

  Run every task in the Program B plan and land it on `main` before Program A
  candidate selection (Step 3), so the frozen candidate includes the V2 proceeds
  fix and soaks it (Q3). Never inject it into an already-frozen candidate during
  the hold window. Preserve affected serving admission as blocked until Program
  B completes its own source-admission and release process. Program B may run in
  parallel with Phase P; only its `main` landing must precede candidate
  selection.

- [ ] **Step 3: Select, certify, deploy, and bind Program A candidate**

  Execute Program A Tasks 6-10. Result must bind one newly selected SHA/tree to
  the canonical API, both workers, one database, one queue environment, and
  migration tail 0055. The candidate includes any Program B landing from Step 2.

- [ ] **Step 4: Complete Program A evidence, soak, and terminal decision**

  Execute Program A Tasks 11-13. Program A ends only with explicit NO-GO or with
  separately dispatched activation, kill, resume, and verified final mode.

- [ ] **Step 5: Complete Program C specification gates**

  Run every task in the Program C plan. No Program C product code begins until
  the relevant specification is owner-approved at an exact source SHA and has a
  separate implementation plan.

## Stop Conditions

Stop the affected action when any condition holds:

- `origin/main` differs from the SHA selected for the current action.
- A required provider, service, branch, database, host, queue, deployment,
  source, or corpus identity is ambiguous.
- Railway autodeploy state cannot be read back for either worker.
- Backup/PITR, restore freshness, custody, or preview/restore isolation evidence
  is missing for a production schema or data action.
- A migration rehearsal shows unexpected drift or a non-additive operation.
- An advisory-lock path cannot retain one PostgreSQL session.
- Static certification has an unexplained failure.
- A soak window has empty evaluation, insufficient organic activity, manual
  recompute, unexplained divergence, or bound-identity drift.
- Multi-security proceeds lack exact relief-row lineage and the caller cannot
  accept typed refusal.
- A requested shortcut would infer security ownership, preference order,
  SAFE/convertible conversion, FX, terminal liquidation, or source-lot
  ownership.

## Definition of Done

1. Program A ends with recorded NO-GO or verified GO; never merely `READY`.
2. One candidate SHA/tree spans certification, provider binding, qualifying
   execution, soak, and final pre-action fence.
3. No production mutation occurs outside a separate repository-owner dispatch.
4. Program B preserves the public input schema and derives exact per-security
   proceeds from admitted relief-row evidence.
5. Program B is admitted before affected multi-security deal-by-deal V2 results
   serve.
6. Program C product work starts only after approved specifications and separate
   implementation plans exist.
7. Existing engines, contracts, receipts, and evidence families are reused; no
   duplicate engine or generic framework is introduced.

## Self-Review Record

- **Spec coverage:** Candidate generation, exact-SHA certification,
  provider/database binding, migration rehearsal/apply, decision-spine proof,
  soak, activation, containment, economics correction, and product specification
  gates each have an explicit program and exit gate.
- **Placeholder scan:** No deferred implementation placeholder remains. Program
  C uncertainty is represented as concrete specification work with required
  outputs and approval fields.
- **Boundary check:** Evidence, source admission, provider mutation, schema
  apply, deployment, promotion, and activation remain separate authorities.
