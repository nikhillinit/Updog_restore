---
status: REFERENCE
audience: both
last_updated: 2026-08-08
owner: 'Product + Frontend'
review_cadence: P365D
categories: [design, reference, ui, ux]
keywords: [preferred-prototype, screenshot, integrity, issue-1284]
---

# Preferred UI/UX reference package

## Authority and use

These files preserve the two preferred page-anatomy references, their four
review viewport captures, and the standalone issue #1284 context-rail review
prototype.

- [`DESIGN.md`](../../../../DESIGN.md) governs production design decisions.
- The preferred prototypes are directional references, not production code or
  API contracts.
- The #1284 artifact is a synthetic, non-shipping prototype. Human approval must
  still be recorded on the GitHub issue.
- The
  [live-data map](../../audits/2026-08-08-preferred-uiux-data-contract-map.md)
  governs whether a reference field may be shown as available production truth.

The two preferred HTML files and eight PNGs were copied byte-for-byte from the
locally supplied export. The #1284 HTML was authored in Batch 0 to cover the
issue-specific context, preset, disabled-state, bridge, and operator-loop
requirements that the broader references do not cover.

## Open first

1. [`preferred-prototypes/fund-modeling-workspace.html`](preferred-prototypes/fund-modeling-workspace.html)
2. [`preferred-prototypes/baseline-comparison.html`](preferred-prototypes/baseline-comparison.html)
3. [`issue-1284-context-rail-prototype.html`](issue-1284-context-rail-prototype.html)
4. [Issue #1284 review packet](../../../reviews/2026-08-08-issue-1284-prototype-review.md)

All HTML is standalone and can be opened directly in a modern browser.

## Source export integrity

- Original archive name: `updog-uiux-export-2026-08-08.zip`.
- Original archive SHA-256:
  `DBC549E360729185081CA649B01D5FDF65DF2EAA904289F3F686F3D4DA3C10EB`.
- Extraction verification performed 2026-08-08: 56 files checked, 56 matched, 0
  mismatches.
- The supplied archive contained no checksum manifest; the table below is the
  repository integrity inventory for the curated references.

## File inventory

| File                                                |      Dimensions |   Bytes | SHA-256                                                            |
| --------------------------------------------------- | --------------: | ------: | ------------------------------------------------------------------ |
| `issue-1284-context-rail-prototype.html`            | Responsive HTML |  62,037 | `42ED72E28705C30DCBA2EDEF93CAF6CD961BB2431B0376AE35EBD8DB73AD8F65` |
| `preferred-prototypes/baseline-comparison.html`     | Responsive HTML |  38,067 | `539AC36E508718DC1241D15BDE76E1819095FE7075A82C8582D946BD1E5B2353` |
| `preferred-prototypes/fund-modeling-workspace.html` | Responsive HTML | 148,550 | `BAFAA3352EEA3667B6D72A4257C2426AB484741239BDE537A432FFF6349E0216` |
| `previews/updog_workspace_direct_1440.png`          |        1440x900 | 165,053 | `B47F7882C61BA52467D88C9EBDD0FEF610F933471BBFB0BF62506F99B889038E` |
| `previews/workspace_direct_1024.png`                |        1024x768 | 102,988 | `61F6F057554AA5E5F946C6D000576B2DC19C3D39E73EF609FAEC110C8CD1D832` |
| `previews/workspace_direct_820.png`                 |        820x1180 | 107,406 | `BF88938AA33A93A756A12FB510056F0F1CC0E97CF3742EE50C245C201418A4BB` |
| `previews/workspace_direct_390.png`                 |         390x844 |  54,880 | `946B18B8E4AF4CD3D473462B5F4BED1946055C86CB92B5EDE188062D0F91DA5C` |
| `previews/updog_baseline_direct_1440.png`           |        1440x900 | 145,759 | `5366BB59F7F5D78B3CFA55ECA9DCA6E81E0D87D2EA3BF9C5018E3ABC0E255727` |
| `previews/baseline_direct_1024.png`                 |        1024x768 |  73,878 | `809A1B4A0492A9E68D0441279B970A0A9A479ED5AD2B312BCAE3055BAF94CC27` |
| `previews/baseline_direct_820.png`                  |        820x1180 |  81,176 | `FAEC3D4C4A6D6334A869BC76D8697A1E89CAC57181AA6957C5806B8323AFA3A6` |
| `previews/baseline_direct_390.png`                  |         390x844 |  46,999 | `38E1D225949C2E6366C6316F809702B44801943EC5A860C64E0398AAD8F8A137` |
| `previews/issue-1284-1440x900.png`                  |        1440x900 | 107,450 | `5C6ADCCDD192599B5E577A3CA33CE8D39CEFF070220EBFF2FDEB1D5D5A20BACE` |
| `previews/issue-1284-1024x768.png`                  |        1024x768 |  69,088 | `51A2B77811AEC9B361A432F372B642AFC2AA28413177115DD5BB420AD11360FE` |
| `previews/issue-1284-820x1180.png`                  |        820x1180 |  67,037 | `AD1F88C432B1E5A663ED0AADA4B92D5AA09EAD29A94897D8755C0FC97FCC3784` |
| `previews/issue-1284-390x844.png`                   |         390x844 |  39,506 | `E4160C9C795EF739B75C40528F36247D60B6B0D1609F891956B9AEBD55C24B92` |
| `previews/issue-1284-blocked-1440x900.png`          |        1440x900 | 109,748 | `CF14D8A031E7AF01499AD608B06E4C20C00DD6A3EA87F48CF962973270E73C54` |

## Viewport acceptance set

| Viewport | Workspace capture                 | Baseline capture                 | #1284 capture             | Review purpose                                              |
| -------- | --------------------------------- | -------------------------------- | ------------------------- | ----------------------------------------------------------- |
| 1440x900 | `updog_workspace_direct_1440.png` | `updog_baseline_direct_1440.png` | `issue-1284-1440x900.png` | Full desktop shell, hierarchy, conditional context capacity |
| 1024x768 | `workspace_direct_1024.png`       | `baseline_direct_1024.png`       | `issue-1284-1024x768.png` | Compact desktop/tablet landscape behavior                   |
| 820x1180 | `workspace_direct_820.png`        | `baseline_direct_820.png`        | `issue-1284-820x1180.png` | Tablet portrait reflow and table containment                |
| 390x844  | `workspace_direct_390.png`        | `baseline_direct_390.png`        | `issue-1284-390x844.png`  | Mobile command bar, provenance retention, no page overflow  |

The #1284 prototype was browser-checked at all four viewports with zero
page-level horizontal overflow. The separate `issue-1284-blocked-1440x900.png`
capture records the explicit missing-vehicle dependency state.

## Fidelity notes

- The byte-preserved preferred HTML contains legacy `Updog Restore` copy in
  titles or visible labels. This is source-reference drift, not naming
  authority. Production copy must use **Updog** with **Press On Ventures**
  attribution as defined in `DESIGN.md`.
- The source export includes `colors_and_type.css` and the Press On logo under
  its design-system and generated-kit folders. The two preferred HTML files are
  self-contained and do not depend on those files at runtime.
- Prototype values, owners, reasons, hashes, and dates are illustrative unless
  the live-data map explicitly identifies a production contract.
- The baseline prototype currently repeats some changes across summary, table,
  and timeline and uses a large reserve step chart. `DESIGN.md` preserves the
  anatomy while directing production toward distinct layer jobs and more honest
  compact comparisons.
- The #1284 prototype deliberately omits generic Accept/Reject decision actions.
  Those remain gated by #1289/#1290.
- The #1284 HTML was revised on 2026-08-10 to clear pre-approval review defects
  (single blocked-state next action, visible `$55.0M` derivation, WCAG-safe
  preset de-emphasis, mobile controls/navigation below 1024px, dark-rail focus
  ring, and consistent date formats). A second 2026-08-10 pass added hover
  feedback and responsive-rail transitions, radiogroup semantics with
  arrow-key/roving-tabindex keyboard support, a polite `aria-live` status region
  and `aria-describedby` wiring, an `aria-disabled` (focusable) recompute
  control, and an explicit interactive walkthrough with persistent completion
  state. A third 2026-08-10 pass added the contracted responsive slide-over
  review rail (modal dialog at 1024-1279px and behind a mobile info button below
  1024px, with open/close, focus trap, Escape, and preserved rail state),
  strengthened the focus ring to solid charcoal accent for WCAG 3:1 contrast,
  and raised core touch targets to 44px. The byte count and SHA-256 above
  reflect the latest post-revision file. The PNG captures predate these
  revisions and should be recaptured before final sign-off. See the
  [review packet revision log](../../../reviews/2026-08-08-issue-1284-prototype-review.md#revision-log).
