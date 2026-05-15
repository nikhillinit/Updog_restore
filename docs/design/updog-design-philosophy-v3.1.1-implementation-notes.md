# Updog Design Philosophy v3.1.1 — Implementation Notes

This revision converts v3.1 from a strong product manifesto into a more
implementation-ready doctrine for `Updog_restore`.

## What changed

- Removed the corrupted trailing content that appeared after `</html>` in the
  v3.1 paste.
- Renamed the operating mode from “Dashboard-first, action-second” to
  **Dashboard-first, action-near**.
- Added **Screen grammar**: persistent navigation, command header, decision
  canvas, and context rail.
- Added **Role modes**: GP decision mode, analyst proof mode, and ops execution
  mode.
- Added **Object hierarchy**: Entity → Surface → Object → Action.
- Added **Interaction model** for card drill-down, chart proof, local actions,
  and saved views.
- Added **Context-preserving work panels** for modals/drawers that keep
  dashboard context visible.
- Added **Motion grammar** with loading, overlay, hover, and reduced-motion
  rules.
- Added **Collaboration model** that turns comments, mentions, and attachments
  into ownership and audit artifacts.
- Expanded the acceptance rubric to include screen grammar and
  collaboration-to-ownership requirements.

## Suggested repo location

```text
docs/design/updog-design-philosophy-v3.1.1.html
```

## Product doctrine summary

Updog should feel like a quiet, expert-grade operating workspace for capital
teams. Its key distinction is not visual novelty; it is the continuity from live
truth to operational action across funds, SPVs, sidecars, assumptions, tasks,
and LP-facing outputs.

The interface should answer four questions in the first viewport:

1. What is true now?
2. What changed?
3. What is due?
4. What can I do next?

## Implementation notes for UI teams

Use the design philosophy as a guardrail when building or reviewing:

- App shell and dashboard chrome.
- Multi-entity navigation and saved views.
- KPI, project, activity, and chart cards.
- Task/SPV/company/assumption detail modals.
- Comment, mention, attachment, and collaborator flows.
- LP snapshot and share surfaces.
- Skeleton loading, tooltip, modal, and reduced-motion behavior.

## Validation checklist before merging a screen

A surface should not be treated as complete unless it satisfies the v3.1.1
acceptance rubric: truth-first hierarchy, accountable context, multi-entity
clarity, four-zone screen grammar, visible urgency, place-preserving drill-down,
keyboard parity, collaboration ownership, purposeful motion, and LP-safe
sharing.
