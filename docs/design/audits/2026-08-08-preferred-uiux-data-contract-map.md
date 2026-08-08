---
status: ACTIVE
audience: both
last_updated: 2026-08-08
owner: 'Product + Frontend'
review_cadence: P30D
categories: [design, architecture, audit]
keywords: [uiux, results, scenario, comparison, provenance, current-forecast]
related_code:
  - 'client/src/pages/fund-model-results.tsx'
  - 'client/src/pages/fund-scenario-workspace.tsx'
  - 'shared/contracts/fund-results-comparison-v1.contract.ts'
  - 'shared/contracts/current-forecast-v2.contract.ts'
source_of_truth: false
---

# Preferred UI/UX live-data contract map

## Purpose and fence

This audit maps the preferred fund-modeling and baseline-comparison references
to live repository contracts. It prevents later presentation batches from
turning attractive prototype data into unsupported production claims.

- Repository fence: `origin/main` at `12f024fc4fa30638528f9e819a4d6aa641fe72dd`.
- Reviewed: 2026-08-08.
- Direction authority: [`DESIGN.md`](../../../DESIGN.md).
- Reference inventory:
  [`../references/2026-08-08-preferred-uiux/README.md`](../references/2026-08-08-preferred-uiux/README.md).
- Issue gates:
  [#1284](https://github.com/nikhillinit/Updog_restore/issues/1284),
  [#1288](https://github.com/nikhillinit/Updog_restore/issues/1288), and
  [#1289](https://github.com/nikhillinit/Updog_restore/issues/1289).

Status vocabulary:

- **Available** — current mounted or server-owned contract supports the claim.
- **Partial** — a narrower or differently scoped contract exists.
- **Missing** — the production UI must not present the claim as recorded fact.
- **Gated** — designed work exists but a named dependency prevents use.

This document is evidence, not a schema or API authority. Revalidate file and
line references before implementation because the map is pinned to one SHA.

## Route and shell truth

| Reference concept            | Status                | Live evidence                                                                                                         | Contract boundary                                                                                                                                           |
| ---------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mounted fund-results route   | Available             | `client/src/app/app-routes.tsx:30,96`; authenticated layout in `client/src/app/app-router.tsx:135-138,230-233`        | Route existence does not prove every section has live evidence.                                                                                             |
| Mounted scenario workspace   | Available             | `client/src/app/app-routes.tsx:31,91`; `client/src/pages/fund-scenario-workspace.tsx:525-809`                         | Requires a numeric fund ID. Scenario comparison renders only when its response is comparable.                                                               |
| Current workspace navigation | Available, drifted    | `client/src/pages/fund-model-results/workspace-nav.tsx:44-75,119-162`                                                 | Seven route-local links form a wrapped row; this is not the target contextual hierarchy.                                                                    |
| Current global shell         | Available, drifted    | `client/src/app/app-layout.tsx:208-242`; `client/src/components/layout/sidebar.tsx:180-284`                           | Sidebar appears at Tailwind `md` and expands from 64px to 256px on hover. Target contract requires explicit pinning and no hover expansion.                 |
| Context-preserving panel     | Available             | `client/src/components/work-panel/WorkPanel.tsx:33-54`                                                                | Width and sheet behavior exist. Selection/filter/scroll preservation and unsaved-change protection require route-level proof.                               |
| Financial evidence panel     | Partial               | `client/src/components/fund-results/FinancialEvidenceDrawer.tsx:128-257`; wired from `fund-model-results.tsx:276-325` | Scenario results are the only fund-results section with the full interactive drawer contract today.                                                         |
| Responsive helper            | Partial / conflicting | `client/src/components/layout/ResponsiveLayout.tsx:17-74`; `tailwind.config.ts:387-395`; `app-layout.tsx:240`         | Helper treats desktop as `>=1024px`; mounted shell shows desktop sidebar from `>=768px`. Target behavior in `DESIGN.md` is future-state, not current truth. |

## Results, version, and comparison truth

| Reference claim                         | Status                            | Live evidence                                                                                                         | What may be shown now                                                                                                                                            |
| --------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Four summary comparison metrics         | Available                         | `shared/contracts/fund-results-comparison-v1.contract.ts:25-55`                                                       | `fundSize`, `reserveRatio`, `avgConfidence`, and `yearsToFullDeploy`, each nullable with a typed delta.                                                          |
| Results-comparison endpoint             | Available                         | `server/routes/fund-config.ts:545`; `server/services/fund-results-comparison-service.ts:93-188`                       | Current/previous summary, delta, run status/time, and correlation for the fixed metric allowlist.                                                                |
| Comparison basis                        | Available, narrow                 | `fund-results-comparison-service.ts:93-105`                                                                           | The two highest-version configs ever published. It does **not** compare an arbitrary baseline with the current draft.                                            |
| Draft and published heads               | Available                         | `shared/schema/fund.ts:63-80`; publish transaction in `server/services/fund-persistence-service.ts:217-268`           | A fund can identify one draft head and one published head. No existing endpoint in this audit produces the preferred per-field draft-versus-baseline ledger.     |
| Publication history                     | Partial                           | `server/services/fund-lifecycle-history-service.ts:36-76`                                                             | Historical published versions and a best-effort publisher. Publisher lookup is not correlated to each version, so it cannot support authoritative row ownership. |
| Per-field change owner, time, rationale | Missing for generic model changes | `shared/schema/fund.ts:63-80`; comparison contract above                                                              | Render `Not recorded` when an allowlisted field diff lacks audit metadata. Do not infer owner from the latest lifecycle event.                                   |
| Generic row review state                | Missing / gated                   | ADR-067 in `DECISIONS.md:9629-9665`; Wave H plan `docs/1-plans/F_1.1.0_wave-h-context-rail-decisions.plan.md:116-158` | Do not render Accepted/Rejected/Deferred as persisted decisions until #1289 and dependent routes land.                                                           |
| Generic decision-sourced evidence       | Missing / gated                   | `shared/schema/operating-objects.ts:41-96`                                                                            | Current evidence links attach to tasks and a narrow target set, not generic model-change decisions.                                                              |
| Domain-specific reserve IC decisions    | Available, separate domain        | `shared/schema/allocation-scenarios.ts:138-184`; `shared/contracts/reserve-ic-decision-v1.contract.ts:36-91`          | May support reserve-allocation review within its own contract. It is not a generic baseline-comparison decision ledger.                                          |

## Basis, freshness, and forecast truth

| Reference claim                                  | Status                                 | Live evidence                                                                                               | Boundary                                                                                                                                                                           |
| ------------------------------------------------ | -------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Calculation/run identity                         | Available                              | `shared/schema/fund.ts:100-183`                                                                             | Calc runs and snapshots retain config/run IDs, timestamps, hashes, and H9 provenance fields.                                                                                       |
| Comparison freshness and provenance              | Missing                                | `shared/contracts/fund-results-comparison-v1.contract.ts:40-99`                                             | Comparison response has no source-as-of, lineage, source age, or freshness field. Do not present a comparison-level freshness badge as server-owned truth.                         |
| Scenario stale-publish state                     | Available, separate contract           | `server/services/fund-scenario-calculation-service.ts:170-207`                                              | `STALE_PUBLISH` applies to scenario calculation reads; it does not fill the results-comparison gap.                                                                                |
| Current-Forecast V2 basis                        | Available                              | `shared/contracts/current-forecast-v2.contract.ts:50-72`                                                    | Fund ID, facts snapshot ID, current plan version, as-of date, status, hashes, warnings, and result metadata are contract-backed.                                                   |
| Uncalled-capital bridge                          | Available in Current-Forecast V2       | `current-forecast-v2.contract.ts:61-66`; calculation in `shared/core/cohorts/CohortProjectionV2.ts:602-617` | Committed, called-to-date, projected fees remaining, recallable distributions, and uncalled are server-owned forecast fields. They are not yet mounted in a shared workspace rail. |
| Recompute from latest accepted facts             | Gated                                  | #1288 acceptance criteria and Wave H plan                                                                   | Prototype the action and dependency states only. Production wiring waits for #1284 approval and #1288.                                                                             |
| Fund/vehicle/as-of/plan/preset workspace context | Missing / gated as one shared contract | #1288 acceptance criteria; current context-rail code documented in `docs/ARCHI.md:440-443`                  | Individual data exists, but the shared `FundWorkspaceContext` and `gp`, `analyst`, and `operations` preservation contract do not. Presets remain presentation-only.                |

## Prototype-to-production allowlist

The preferred references may be used immediately as **anatomy**, **density**,
**hierarchy**, **state-language**, and **interaction** references. Production
implementation may consume only fields its route contract owns.

### Safe from current contracts

- Four fixed published-version metrics and typed deltas.
- Current and previous published-version identity/status.
- One draft head and one published head as separate lifecycle facts.
- Current-Forecast V2 facts snapshot, plan version, as-of, hashes, warnings, and
  uncalled-capital bridge when the route is explicitly wired to that contract.
- Scenario evidence drawer data on the currently supported scenario section.
- Domain-specific reserve IC decisions within the reserve allocation contract.

### Must remain unavailable, `Not recorded`, or disabled-with-reason

- Per-field generic owner, rationale, decision, outcome, follow-up, or evidence
  links.
- Draft-versus-published field diffs beyond an explicitly reviewed allowlist.
- Comparison-level source freshness or provenance not carried by the response.
- Single-cause output attribution when several model inputs contribute.
- Generic Accept/Reject/Complete review actions before #1289/#1290 and the
  appropriate UI contract.
- Shared vehicle/preset context or recompute behavior before #1284 approval and
  #1288 implementation.

## Design authority and naming

| Area                      | Current authority                                                                                          | Batch 0 ruling                                                                                            |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Product name              | `client/src/config/branding.ts:2-15`; active sidebar at `client/src/components/layout/sidebar.tsx:190-203` | Customer-facing name is **Updog**. Press On Ventures is company attribution.                              |
| Tokens                    | `DESIGN.md`; `client/src/theme/presson.tokens.ts`; Tailwind export                                         | Token values win over prototype hardcoding. No new palette, font, spacing, or radius token in this batch. |
| Presentation doctrine     | `DESIGN.md`; `docs/design/updog-design-philosophy-v3.1.1.html`                                             | Preferred references refine conditional context, page archetypes, review anatomy, and responsive targets. |
| Legacy Press On v2 styles | `client/src/styles/presson-v2.css`                                                                         | Reference-only drift. Do not treat unmounted/mock-backed v2 pages as current product authority.           |

## Gates and revalidation triggers

| Gate                              | Current state at fence                  | Required evidence to change this map                                      |
| --------------------------------- | --------------------------------------- | ------------------------------------------------------------------------- |
| #1284 prototype approval          | Open; no approval comment               | Human decision recorded on #1284 with the reviewed artifact/commit.       |
| #1288 shared context rail         | Blocked by #1284                        | Merged implementation contract and route-level tests.                     |
| #1289 operating decisions         | Open; issue/ADR reconciliation required | ADR-067-aligned schema plus reviewed migration/contract.                  |
| #1290 decision routes             | Blocked by #1289(a)                     | Mounted, policy-registered routes and contract tests.                     |
| Generic comparison review actions | Not authorized                          | Decision lifecycle, evidence links, and UI action contract all available. |

Re-run this audit before implementing baseline comparison or scenario workspace
batches, after any of #1284/#1288/#1289/#1290 changes state, or when the
results-comparison/current-forecast contracts change.
