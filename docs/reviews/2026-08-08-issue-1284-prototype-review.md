---
status: ACTIVE
audience: humans
last_updated: 2026-08-10
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

The 2026-08-10 revision pass (below) cleared the reviewable prototype defects
that were blocking approval readiness. The remaining closure blocker is the
mandatory human decision, which must be posted as a comment on the issue. No
agent can satisfy that step.

| Item                                  | State                   |
| ------------------------------------- | ----------------------- |
| Directional design baseline           | Ratified in `DESIGN.md` |
| #1284 review prototype                | Prepared; non-shipping  |
| Human review                          | Pending                 |
| Human decision recorded on #1284      | Missing                 |
| #1288 shared rail                     | Blocked                 |
| Production code changed by this batch | No                      |
| Prototype revision defects            | Resolved 2026-08-10     |

## Revision log

### 2026-08-10a — closure blockers

A closure-blocker review of the prototype identified defects that a human
reviewer would have to reject. They are resolved in the artifact so the pending
approval is a clean yes/no on the design, not a request for rework. Only the
non-shipping prototype HTML changed; no `client/`, `server/`, `shared/`,
migration, route, or authorization path was touched.

| Defect                                                                                                         | Resolution                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Blocked state presented competing next actions (`Next · Review 2 gaps` and `Resolve vehicle context` together) | The `Next · …` status chip is now state-scoped: ready shows `Review 2 gaps`, blocked shows `Resolve vehicle context`. One authoritative next action per state.                                   |
| `$55.0M Remaining deployable` had no visible derivation                                                        | The metric now shows its arithmetic (`$64.0M uncalled − $9.0M reserved for signed follow-on`) with a link to the bridge.                                                                         |
| Preset de-emphasis used `opacity: 0.55`, degrading text below WCAG AA                                          | Replaced with a tinted background plus dashed border; text color is untouched and stays at full contrast.                                                                                        |
| Below 1024px the command bar dropped all primary controls and navigation                                       | A mobile command bar now exposes an off-canvas navigation toggle (`aria-expanded`, 5 links), and the primary action and vehicle-state controls remain reachable via the retained command header. |
| Focus ring was invisible on the dark primary rail                                                              | Added a light local focus outline (`rgba(255,255,255,0.9)`, 3px solid) scoped to the dark rail.                                                                                                  |
| Inconsistent as-of date formats (`August 6, 2026`, `Aug 6`, bare `Aug 9`)                                      | Standardized visible dates to `Mon D, YYYY`; machine `code` fields keep ISO `2026-08-06`.                                                                                                        |

### 2026-08-10b — minor UX revisions

Three lower-severity revisions raised the prototype to handoff quality. Same
non-shipping scope: only the prototype HTML and its review-only harness changed.

| Theme                                 | Revision                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Responsive rail behavior + hover      | Added `:hover` affordances (guarded by `@media (hover: hover)`) across rail links, nav links, buttons, segmented/rail-state controls, and preset cards, plus short reduced-motion-safe transitions so the rail's responsive state changes read as intentional. The mobile off-canvas nav item now carries `aria-current="page"`.                                                                               |
| Accessible state/focus communication  | Preset and context-rail controls are now true `radiogroup`s (`role="radio"` + `aria-checked`) with roving `tabindex` and Arrow/Home/End keyboard navigation. A polite `aria-live` status region announces preset, rail, context, and walkthrough changes. Controls carry `aria-describedby`; recompute uses focusable `aria-disabled` (not the `disabled` attribute) so its reason is reachable while blocked. |
| More explicit interactive walkthrough | The mark-to-refresh loop is now a walkable, stateful sequence: action 1 (review) marks itself done and activates action 2 (recompute); completion **persists** as a visible result plus a `Refreshed just now` chip instead of silently resetting after 900ms; a `Reset walkthrough` control replays the loop.                                                                                                 |

Rendered-browser verification of the keyboard/focus behavior was run and is
recorded in the evidence table below.

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

| #1284 requirement                                           | Prototype evidence                                                                                                                                                                                                                                  | Review result                                                  |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Fund, vehicle, as-of, and plan context                      | Always-visible context band                                                                                                                                                                                                                         | Ready for human review                                         |
| Active basis: as-of plus snapshot short hash                | Decision header and context band                                                                                                                                                                                                                    | Ready for human review                                         |
| `Recompute from latest accepted facts`                      | Action 2 in refresh workflow                                                                                                                                                                                                                        | Ready for human review; production wiring remains #1288        |
| Uncalled-capital bridge                                     | Committed, called, projected fees remaining, recallable, and uncalled table                                                                                                                                                                         | Ready for human review; fields map to Current-Forecast V2      |
| `gp`, `analyst`, `operations` presets                       | Interactive segmented control plus emphasis matrix                                                                                                                                                                                                  | Ready for human review; presentation-only statement is visible |
| Missing-context disabled state                              | `Show missing-vehicle state` toggles `vehicleId: null` multi-main example                                                                                                                                                                           | Ready for human review                                         |
| At most two operator actions from mark to refreshed picture | System arrival, action 1 review evidence, action 2 recompute                                                                                                                                                                                        | Ready for human review                                         |
| Operating question visible                                  | Primary decision heading                                                                                                                                                                                                                            | Ready for human review                                         |
| Current state and as-of visible                             | Status chips and context band                                                                                                                                                                                                                       | Ready for human review                                         |
| Next recommended action visible                             | Header and conditional review rail                                                                                                                                                                                                                  | Ready for human review                                         |
| Source/calculation basis visible                            | Current-Forecast V2 lineage block                                                                                                                                                                                                                   | Ready for human review                                         |
| Disabled state names dependency                             | Recompute reason and blocked rail state                                                                                                                                                                                                             | Ready for human review                                         |
| `Reviewed with no change` distinct from `not reviewed`      | Visible review-state card                                                                                                                                                                                                                           | Ready for human review                                         |
| No production wiring                                        | Changed paths are the non-shipping prototype HTML, its review docs, and a review-only verification harness (`scripts/reviews/verify-issue-1284-prototype.cjs`); no `client/`, `server/`, `shared/`, migration, route, or authorization path touched | Confirmed                                                      |
| Human decision recorded on issue                            | No matching comment yet                                                                                                                                                                                                                             | **BLOCKED — human action required**                            |

## Browser verification evidence

The static artifact was re-exercised in a real headless Chromium browser
(Playwright) on 2026-08-10 after both revision passes. All 30 assertions are
machine-checked, not visual impressions. This proves the review artifact's
behavior; it does not prove production integration.

| Check                                     | Result                                                                                                                                                                                                                           |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1440x900, 1024x768, 820x1180, and 390x844 | Passed; `documentElement.scrollWidth` equaled `clientWidth` at every size (1440, 1024, 820, 390) — no page-level horizontal overflow                                                                                             |
| Browser console                           | Passed; zero errors and zero warnings across all four viewports and the interaction pass                                                                                                                                         |
| Mobile controls below 1024px (820, 390)   | Passed; nav toggle, primary `Review 2 gaps` action, and vehicle-state toggle all visible; off-canvas nav opened with 5 links and `aria-expanded` flipped to `true`                                                               |
| GP / Analyst / Operations                 | Passed; checked state and presentation copy changed; de-emphasis applied via background/border, not opacity                                                                                                                      |
| Radiogroup semantics + keyboard           | Passed; preset and rail controls expose `role="radiogroup"`; Arrow key moved selection, focus, `aria-checked`, and roving `tabindex` together, and updated the view                                                              |
| Disabled-but-discoverable recompute       | Passed; while blocked, recompute is `aria-disabled="true"` yet focusable, keeps `aria-describedby="recomputeReason"` with the reason visible, and a direct activation was a no-op                                                |
| aria-live announcements                   | Passed; the polite status region carried the walkthrough progression (referenced the recompute step after action 1)                                                                                                              |
| Interactive walkthrough                   | Passed; action 1 marked itself done and activated action 2; completion persisted (visible result + `Refreshed just now` chip, step `done`) across a 1.2s wait with no auto-reset; `Reset walkthrough` restored the initial state |
| Keyboard focus on dark rail               | Passed; Tab landed on a `.rail-link`; computed outline was `rgb(255,255,255,0.9)` 3px solid — visible against the dark rail                                                                                                      |

Verification harness:
[`scripts/reviews/verify-issue-1284-prototype.cjs`](../../scripts/reviews/verify-issue-1284-prototype.cjs).
Run with `node scripts/reviews/verify-issue-1284-prototype.cjs` (requires a
Chromium-capable Playwright install). The four responsive captures plus the
explicit blocked-state capture are listed in the
[reference inventory](../design/references/2026-08-08-preferred-uiux/README.md);
those PNGs predate the 2026-08-10 revision and should be recaptured before final
sign-off.

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
