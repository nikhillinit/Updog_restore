---
status: ACTIVE
audience: both
last_updated: 2026-08-08
categories: [design, analytics, visualization, truthfulness]
keywords:
  [design, charts, dashboards, provenance, evidence, visual-truthfulness]
source_of_truth: false
agent_routing:
  priority: 2
  route_hint:
    'Start here for Updog presentation-layer doctrine for dashboards, charts,
    reports, and analytical displays.'
  use_cases:
    [
      chart_review,
      dashboard_design,
      report_design,
      fund_results_ui,
      lp_reporting,
    ]
maintenance:
  owner: 'Product + Frontend'
  review_cadence: 'P60D'
---

# Design Docs

This folder captures presentation-layer doctrine for Updog. It does not define
calculation semantics, database contracts, or worker behavior. Use it when
designing or reviewing dashboards, charts, analytical reports, LP-facing views,
and fund-model result screens.

## Current docs

| Document                                                                                                       | Purpose                                                                       | Use when                                                                               |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| [`../../DESIGN.md`](../../DESIGN.md)                                                                           | Canonical tokens, doctrine, and ratified preferred workspace baseline         | Making any production visual or interaction decision                                   |
| [analytics-visualization-principles.md](analytics-visualization-principles.md)                                 | House rules for truthful, comparison-rich, access-aware analytical displays   | Creating or reviewing charts, dashboards, fund results, LP reports, and scenario views |
| [analytics-visualization-rollout.md](analytics-visualization-rollout.md)                                       | Sequenced implementation plan for applying those rules inside `Updog_restore` | Planning PRs after the doctrine is accepted                                            |
| [audits/2026-08-08-preferred-uiux-data-contract-map.md](audits/2026-08-08-preferred-uiux-data-contract-map.md) | Preferred-workspace concept to live-contract availability/gap map             | Before implementing the scenario or baseline-comparison batches                        |
| [references/2026-08-08-preferred-uiux/README.md](references/2026-08-08-preferred-uiux/README.md)               | Preferred HTML, viewport captures, integrity hashes, and #1284 prototype      | Visual review and screenshot acceptance                                                |
| [../reviews/2026-08-08-issue-1284-prototype-review.md](../reviews/2026-08-08-issue-1284-prototype-review.md)   | Human-review packet and GitHub comment template for the #1284 gate            | Reviewing or recording the HITL decision                                               |

## Design stance

Updog should feel like a serious analytical operating system, not a collection
of attractive but disconnected dashboards. The presentation layer must make
model outputs easier to compare, audit, explain, and act on without racing ahead
of the data layer.

Use these docs alongside the broader Updog Design Philosophy v3.1.1:
dashboard-first, action-near, provenance-first, and role-aware.
