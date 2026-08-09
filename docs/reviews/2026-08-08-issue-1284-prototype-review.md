---
status: ACTIVE
audience: humans
last_updated: 2026-08-08
owner: 'Product + Frontend'
review_cadence: P30D
categories: [design, review, governance]
keywords: [issue-1284, hitl, context-rail, view-presets, current-forecast]
---

# Issue #1284 context-rail prototype review packet

## Gate status

**AWAITING HUMAN REVIEW — NOT APPROVED — #1288 REMAINS BLOCKED**

The 2026-08-08 preferred-direction review ratifies the broader scenario and
baseline-comparison anatomy in [`DESIGN.md`](../../DESIGN.md). It is not the
GitHub comment required by
[issue #1284](https://github.com/nikhillinit/Updog_restore/issues/1284). No
approval comment existed when this packet was prepared.

| Item                                  | State                   |
| ------------------------------------- | ----------------------- |
| Directional design baseline           | Ratified in `DESIGN.md` |
| #1284 review prototype                | Prepared; non-shipping  |
| Human review                          | Pending                 |
| Human decision recorded on #1284      | Missing                 |
| #1288 shared rail                     | Blocked                 |
| Production code changed by this batch | No                      |

## Review fence and artifacts

- Repository: `nikhillinit/Updog_restore`.
- Base: `12f024fc4fa30638528f9e819a4d6aa641fe72dd`.
- Branch protection at the fence: strict; `CI Gate Status` required; enforced
  for administrators.
- Issue contract: #1284 body plus
  [amendment comment](https://github.com/nikhillinit/Updog_restore/issues/1284#issuecomment-5163555054).
- Directional review context:
  [shared UI/UX design review](https://chatgpt.com/share/6a777388-15ac-83e8-9173-6ab2bc77a9ac).
  This is context evidence, not the required GitHub approval record.
- Non-shipping prototype:
  [`issue-1284-context-rail-prototype.html`](../design/references/2026-08-08-preferred-uiux/issue-1284-context-rail-prototype.html).
- Directional references:
  [`fund-modeling-workspace.html`](../design/references/2026-08-08-preferred-uiux/preferred-prototypes/fund-modeling-workspace.html)
  and
  [`baseline-comparison.html`](../design/references/2026-08-08-preferred-uiux/preferred-prototypes/baseline-comparison.html).
- Reference integrity and viewport inventory:
  [`README.md`](../design/references/2026-08-08-preferred-uiux/README.md).
- Production-data boundary:
  [`2026-08-08-preferred-uiux-data-contract-map.md`](../design/audits/2026-08-08-preferred-uiux-data-contract-map.md).

All values in the #1284 HTML are synthetic. The prototype is review evidence,
not an application route, schema, API contract, or authorization decision.

## Acceptance matrix

| #1284 requirement                                           | Prototype evidence                                                                            | Review result                                                  |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Fund, vehicle, as-of, and plan context                      | Always-visible context band                                                                   | Ready for human review                                         |
| Active basis: as-of plus snapshot short hash                | Decision header and context band                                                              | Ready for human review                                         |
| `Recompute from latest accepted facts`                      | Action 2 in refresh workflow                                                                  | Ready for human review; production wiring remains #1288        |
| Uncalled-capital bridge                                     | Committed, called, projected fees remaining, recallable, and uncalled table                   | Ready for human review; fields map to Current-Forecast V2      |
| `gp`, `analyst`, `operations` presets                       | Interactive segmented control plus emphasis matrix                                            | Ready for human review; presentation-only statement is visible |
| Missing-context disabled state                              | `Show missing-vehicle state` toggles `vehicleId: null` multi-main example                     | Ready for human review                                         |
| At most two operator actions from mark to refreshed picture | System arrival, action 1 review evidence, action 2 recompute                                  | Ready for human review                                         |
| Operating question visible                                  | Primary decision heading                                                                      | Ready for human review                                         |
| Current state and as-of visible                             | Status chips and context band                                                                 | Ready for human review                                         |
| Next recommended action visible                             | Header and conditional review rail                                                            | Ready for human review                                         |
| Source/calculation basis visible                            | Current-Forecast V2 lineage block                                                             | Ready for human review                                         |
| Disabled state names dependency                             | Recompute reason and blocked rail state                                                       | Ready for human review                                         |
| `Reviewed with no change` distinct from `not reviewed`      | Visible review-state card                                                                     | Ready for human review                                         |
| No production wiring                                        | Final 25-path allowlist contains docs, generated discovery indexes, and reference assets only | Confirmed                                                      |
| Human decision recorded on issue                            | No matching comment yet                                                                       | **BLOCKED — human action required**                            |

## Browser verification evidence

The static artifact was exercised in a real browser on 2026-08-08. This proves
the review artifact's behavior; it does not prove production integration.

| Check                                     | Result                                                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1440x900, 1024x768, 820x1180, and 390x844 | Passed; document scroll width equaled viewport width at every size                                      |
| Browser console                           | Passed; zero errors and zero warnings                                                                   |
| GP / Analyst / Operations                 | Passed; pressed state and presentation copy changed while the invariant-data statement remained visible |
| Hidden / Peek / Pinned                    | Passed; each state was reversible from the persistent display control                                   |
| `vehicleId: null` state                   | Passed; vehicle dependency became explicit and recompute disabled with its reason                       |
| Recompute lifecycle                       | Passed; action moved through recomputing, `Picture refreshed · no change`, then reset                   |
| Review completion state                   | Passed; `Reviewed with no change` remained visibly distinct from not reviewed                           |
| Keyboard focus                            | Passed; next focused action rendered a 3px solid focus outline                                          |

The four responsive captures plus the explicit blocked-state capture are listed
in the
[reference inventory](../design/references/2026-08-08-preferred-uiux/README.md).

## Proposed decisions for the human reviewer

1. **Workspace anatomy:** approve the stable primary rail, optional context
   navigation, dominant decision canvas, and conditional right context.
2. **Rail utility:** approve hidden, peek, and pinned states. Do not make the
   right rail permanent on every route.
3. **Presets:** approve `gp|analyst|operations` as visual emphasis only. They do
   not change data fetches, fund scope, authorization, warnings, or actions.
4. **Context failure:** approve `vehicleId: null` plus disabled-with-reason when
   a fund cannot resolve exactly one main vehicle.
5. **Refresh loop:** approve review-evidence then recompute as the two maximum
   operator actions. Preserve the prior picture during refresh.
6. **Capital bridge:** approve the Current-Forecast V2 fields and arithmetic as
   a table, not a client-owned recalculation.
7. **Review completion:** approve `Reviewed with no change` as a visible state
   distinct from `not reviewed`.
8. **Naming:** approve **Updog** as product name and **Press On Ventures** as
   company attribution. Do not expose `Updog_restore` or `Updawg` as product
   copy.

## Manual review script

1. Open the #1284 HTML at 1440px wide. Confirm operating question, current
   state/as-of, next action, and basis are visible without opening a panel.
2. Select GP, Analyst, and Operations. Confirm only visual emphasis changes and
   the explanatory sentence keeps data/query/authorization invariant.
3. Select Hidden, Peek, and Pinned. Confirm the decision canvas remains usable
   and the right rail is not required to understand the primary view.
4. Choose `Show missing-vehicle state`. Confirm vehicle context becomes
   explicit, recompute disables, and the dependency reason is visible.
5. Restore valid vehicle state. Walk the mark workflow. Confirm the path is no
   more than two operator actions and the existing picture remains legible.
6. Inspect the bridge. Confirm the arithmetic is understandable and the page
   states that production consumes server-owned decimal strings.
7. Repeat at 1024x768, 820x1180, and 390x844. Confirm no page-level horizontal
   overflow, no hidden provenance/warnings, visible focus, and readable text.
8. Record approve/revise/reject as a comment on #1284 with the reviewed commit
   SHA and artifact path.

## GitHub approval-comment template

Paste only after completing the manual review. Replace every bracketed field.

```text
HITL REVIEW — issue #1284 context-rail prototype

Decision: [APPROVE | REVISE | REJECT]
Reviewed commit: [full commit SHA]
Reviewed artifact: docs/design/references/2026-08-08-preferred-uiux/issue-1284-context-rail-prototype.html
Viewports checked: 1440x900, 1024x768, 820x1180, 390x844

Decisions:
- Workspace anatomy: [accepted / requested change]
- Conditional rail states (hidden / peek / pinned): [accepted / requested change]
- Presentation-only presets (gp / analyst / operations): [accepted / requested change]
- vehicleId:null disabled-with-reason behavior: [accepted / requested change]
- <=2-action mark-to-refresh loop: [accepted / requested change]
- Current-Forecast V2 uncalled-capital bridge: [accepted / requested change]
- Reviewed-with-no-change state: [accepted / requested change]
- Product naming (Updog; Press On Ventures attribution): [accepted / requested change]

Required revisions before #1288: [none | list]

If Decision is APPROVE: this comment satisfies #1284's human-review record and unblocks #1288. It does not approve #1289/#1290 decision-lifecycle work or any production implementation beyond #1288's issue contract.
```

## Recorded decision

Complete after the GitHub comment exists.

| Field              | Value                                         |
| ------------------ | --------------------------------------------- |
| Reviewer           | Pending                                       |
| Review date        | Pending                                       |
| Reviewed commit    | Pending                                       |
| Decision           | Pending                                       |
| Required revisions | Pending                                       |
| GitHub comment URL | Pending                                       |
| #1288 gate         | Blocked until an approval comment is recorded |

## Explicit non-goals

- No change to `client/`, `server/`, `shared/`, migrations, route manifests, or
  authorization.
- No #1288 implementation or production context-rail wiring.
- No generic baseline row Accept/Reject/Complete Review actions. Those require
  #1289/#1290 and a reviewed UI contract.
- No claim that prototype owner, rationale, source age, or change metadata is
  persisted unless the live data map marks it available.
- No GitHub issue mutation from this documentation batch.
