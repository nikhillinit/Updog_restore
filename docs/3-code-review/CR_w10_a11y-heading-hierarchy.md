---
status: HISTORICAL
audience: both
last_updated: 2026-09-24
owner: '@nikhillinit'
---

# Code Review: Page heading hierarchy and browser accessibility checks

**Review Date**: 2026-09-24

**Version**: 1.6.0 (package unchanged). Reviewed object: PR #1566, merge commit
`c020e5a21`. Live behaviour verified against `main` at `bdbded543`.

**Files Reviewed**:

- `client/src/components/portfolio/tabs/OverviewTab.tsx`
- `client/src/components/ui/PremiumCard.tsx`
- `client/src/components/ui/SwipeableMetricCards.tsx`
- `client/src/pages/dashboard-modern.tsx`
- `client/src/pages/help.tsx`
- `tests/e2e/accessibility.spec.ts`
- `tests/e2e/fixtures/qa-audit-api.ts`
- `tests/e2e/ui-ux-visual-followup.spec.ts`

**Plan**: no plan — unplanned change (QA audit follow-up). Manual `/TRIP-review`
audit; the PR shipped without a `docs/3-code-review/` record.

---

## Executive Summary

Sections that sat directly under a page `h1` as `h3` or `h4` on the analytics
dashboard, the portfolio Companies tab and the help page now render as `h2`,
with `h3` for their children. Styling is untouched. `PremiumCard` and
`SwipeableMetricCards` gain an optional `headingLevel` prop that defaults to the
old level, so untouched callers keep their markup. The browser suite now runs
the axe `heading-order` and `page-has-heading-one` rules on every route, on the
dashboard Performance tab after switching to it, and on the portfolio empty,
unavailable and historical-empty states. Verdict: **APPROVED with
observations**.

---

## Changes Overview

Markup-only change in five client files plus e2e repairs. The `headingLevel`
prop is a `2 | 3` union resolved to a tag name once per render. The e2e fixture
adds a `FundStateReadV1` stub checked with `satisfies` and the two count fields
the portfolio-overview contract already requires. The accessibility spec now
pins the variance settings "Analysis Frequency" field as a disabled textbox
reading `Unavailable`, which matches the product state introduced by #1484 on
2026-09-06, not a regression. The PR body records two known gaps left in place:
the Cashflow tab still jumps from `h2` to `h4`, and `CardTitle` still renders a
`div`.

---

## Findings

### Critical Issues

None.

### Major Issues

None.

### Minor Issues

1. **`help.tsx` copies the `CardTitle` class string by hand.**
   `client/src/pages/help.tsx:82` and `:129` replace `CardTitle` with a raw `h2`
   carrying the same seven utility classes that `card.tsx:44` defines. The PR
   declares changing `CardTitle` a non-goal, so this is a deliberate stopgap,
   but the duplicate will drift the first time the card token set changes.
   Disposition: open. Root fix is an `as` or `asChild` prop on `CardTitle` so
   callers choose the element without restating the classes; that change needs
   its own heading-order pass across every card.

### Suggestions

1. **`requestFailures` is collected but never asserted.**
   `tests/e2e/ui-ux-visual-followup.spec.ts` attaches failed requests to the
   route evidence alongside `errors`, `warnings` and `failed`, but only `axe`
   and `headings` gate the test. Either assert it is empty like `failed`, or
   drop it; evidence nobody reads is noise in the report.

2. **Cashflow tab heading gap.** `CashflowDashboard.tsx` goes `h2` to `h4` per
   scenario and no route scan covers it. Already listed in the PR as a non-goal;
   recorded here so the next a11y pass picks it up.

---

## Checklist

Criteria: `.claude/skills/TRIP-review/checklist.md`.

- [x] 1. Functional Requirements — passed. Every `h3`/`h4` directly under an
      `h1` on the three surfaces is now `h2`; the new axe rules would fail on a
      revert (the PR verified this for the Performance tab).
- [ ] 2. Code Quality — passed with caveat. Duplicated class string in
      `help.tsx` (Minor 1).
- [x] 3. Architectural Compliance — passed. Design tokens and `presson.*`
      classes unchanged; `DESIGN.md` untouched because no visual change.
- [x] 4. Error Handling — not applicable. Markup and test changes only.
- [x] 5. Security — not applicable.
- [x] 6. Performance — passed. One string comparison per card render.

Approval gate:

- Functional requirements implemented: yes.
- No critical or major issues: yes.
- Build successful: `CI Gate Status` is `SUCCESS` on #1566. The `main` run for
  the merge commit (`c020e5a21`) failed in `Test integration` and
  `Test validate-core`; both failures are the wizard-to-results assertion that
  `main` had carried since #1562 and that #1570 repaired, not this change. The
  PR gate did not catch it because `test-full` did not yet run on ordinary pull
  requests.
- Affected unit tests pass: not applicable; the change has no unit tests. The
  browser specs were not run locally (they need Playwright browsers); the PR
  gate ran them.
- New logic has test coverage: yes. Heading order is scanned on every route, on
  the Performance tab, and on the three portfolio empty states.
- Documentation updated: not applicable. No user-facing or architecture document
  describes heading levels.

---

## Verdict

**APPROVED with observations**

Correct, minimal, and now guarded by explicit axe rules that fail on a revert.
The only debt is the hand-copied `CardTitle` classes in `help.tsx`, which should
go away when `CardTitle` learns to render a heading element. The merge-commit
`main` failure belongs to the pre-existing wizard-to-results break, closed by
#1570.
