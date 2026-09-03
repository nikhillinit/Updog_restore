---
status: PROPOSED
audience: agents
last_updated: 2026-09-03
owner: Repository Owner
categories: [release, current-forecast, economics, decision-workspace]
keywords:
  [F_1.11.0, current-forecast, internal-economics-v2, decision-workspace]
---

# Updog Restore Reconciled Program Implementation Plan

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
`DECISIONS.md` (ADR-097 is created by Program A Task 1 and amends ADR-095
decision 1), and
`docs/adr/ADR-033-marginal-next-dollar-reserve-moic.md`.

## Global Constraints

- `origin/main@6fd4ece89215b64f5a4f6bec25a26c512040ff4d`, tree
  `07fbf4c42847b7b244f61e0f0496bf2c203ef6f8`, is the historical source
  baseline inspected on 2026-09-03 UTC. It is not the future activation
  candidate if prerequisite source changes are admitted.
- Re-fetch `origin/main` before each source-admission or candidate action.
  Never silently substitute a newer SHA.
- A plan, issue, CI result, review, receipt, provider observation, or agent does
  not grant merge, schema, provider, deployment, promotion, or activation
  authority.
- Each production mutation requires a separate action-scoped repository-owner
  dispatch through the canonical guarded procedure.
- Node is already pinned to 22.23.2 on controlled surfaces. Correct stale active
  prose only; do not perform another runtime migration.
- All mutations require idempotency. All updates require optimistic locking.
  All cursors require validation. All queue jobs require timeouts.
- Run all tests with `TZ=UTC`. Financial changes require
  `npm run phoenix:truth` and a named expected-output assertion.
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

| Prior gap | Revised disposition |
| --- | --- |
| `6fd4ece...` was treated as both immutable candidate and source that still needed release-control changes. | Treat it as inspected history. Admit prerequisite capabilities first, then select and freeze a new exact candidate. |
| Provider and database observations were carried forward as current facts. | Start every provider, topology, credential, backup, branch, database, queue, deployment, and autodeploy claim as `UNKNOWN`; close it only through current authenticated readback. |
| The plan assumed migration 0054-0055 could use a workflow that does not support it. | Add one bounded journaled 0050-0055 mode to the existing schema workflow. It resumes only an exact contiguous Drizzle prefix and does not use or reinterpret the custom 0050-0053 reconcile ledger. |
| A private preview was expected to gather organic production facts. | Promote the exact candidate to canonical ingress while database mode remains `off`, then enter `shadow` separately so qualifying facts writes reach the candidate without serving V2. |
| Pre-activation kill/resume was required even though resume is post-activation-only. | Prove containment statically and on isolated data before cutover; perform real kill-to-held and resume only after activation. |
| Green soak evidence could age indefinitely. | Require GO/NO-GO within 14 days after Window 4. If identity is unchanged but the deadline is missed, require one fresh seven-day extension window; identity drift restarts Window 1. |
| Multi-security proceeds could be assigned by iteration order. | Derive security from admitted `reliefRows[].investmentLotId`, create private per-security proceeds lots, and require exact `dealId:securityId` pool lookup or an existing typed refusal. |
| Program C mixed unresolved product choices with implementation steps. | Make Program C an executable specification-gate plan. Each approved specification receives its own later `superpowers:writing-plans` implementation plan. |

## Plan Set and Admission Boundaries

| Program | Plan | Entry gate | Exit gate |
| --- | --- | --- | --- |
| A | `docs/superpowers/plans/2026-09-03-current-forecast-activation-train.md` | Begin with prerequisite release-capability work | Recorded NO-GO, or GO followed by verified activation, kill containment, resume, and final serving state |
| B | `docs/superpowers/plans/2026-09-03-internal-economics-v2-security-lineage.md` | May be implemented independently; must not enter Program A candidate | Exact per-security routing or typed refusal with conservation, version, and Phoenix truth proof |
| C | `docs/superpowers/plans/2026-09-03-decision-workspace-specification-gates.md` | Specification work may start now; product implementation waits for Program A GO, and C3b also waits for Program B admission | Five owner-approved specifications and five separately generated implementation plans |

Program B merges into `main` before Program A candidate selection, so the
selected candidate includes the V2 proceeds fix and soaks it across the four
windows. It changes `shared/lib/internal-economics/v2`, which the API bundles,
so it can never satisfy the ADR-095 exception-merge proof and must not land
inside the hold window. It must be admitted before any deal-by-deal Internal
Economics V2 consumer serves a realization spanning multiple securities. Program C must not modify or delay the
Program A candidate.

## Evidence and Authority Contract

Use existing repository evidence contracts and immutable GitHub run/artifact
identifiers. Issue bodies remain navigation indexes, not evidence stores or
authority grants. Record:

| Claim | Minimum evidence |
| --- | --- |
| Source identity | Commit SHA, tree SHA, migration journal tail, and clean or fully inventoried worktree state |
| Test identity | Exact command, start/end UTC, exit code, candidate SHA/tree, and immutable CI URL or retained local-log digest |
| Provider identity | Project/environment/service/deployment IDs, source SHA, runtime, alias/autodeploy state, and UTC readback |
| Database identity | Project/branch/database, direct-host fingerprint, migration tail, backup/restore identity, and UTC readback |
| Operator decision | Named repository owner, exact action and scope, UTC timestamp, and post-state |
| Unknown | Literal `UNKNOWN`; blocks only actions that require the missing fact |

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
  governance-only partial
  state. Record one Phase P PR and one owner source-admission decision.

- [ ] **Step 2: Select, certify, deploy, and bind Program A candidate**

  Execute Program A Tasks 6-10. Result must bind one newly selected SHA/tree to
  the canonical API, both workers, one database, one queue environment, and
  migration tail 0055.

- [ ] **Step 3: Complete Program A evidence, soak, and terminal decision**

  Execute Program A Tasks 11-13. Program A ends only with explicit NO-GO or with
  separately dispatched activation, kill, resume, and verified final mode.

- [ ] **Step 4: Execute Program B independently**

  Run every task in the Program B plan. Keep its commits out of the Program A
  candidate and preserve affected serving admission as blocked until Program B
  completes its own source-admission and release process.

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
  soak, activation, containment, economics correction, and product
  specification gates each have an explicit program and exit gate.
- **Placeholder scan:** No deferred implementation placeholder remains. Program
  C uncertainty is represented as concrete specification work with required
  outputs and approval fields.
- **Boundary check:** Evidence, source admission, provider mutation, schema
  apply, deployment, promotion, and activation remain separate authorities.
