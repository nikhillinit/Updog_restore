---
id: REFL-033
title:
  Defensive Grep Before Destructive Action (and "Plan Complete" ≠ "Plan
  Binding")
status: DRAFT
date: 2026-04-06
severity: high
category: Process
discovered: 2026-04-06
tags:
  [
    process,
    recommendation-discipline,
    planning-doc-drift,
    deletion-safety,
    bias-check,
  ]
error_codes: []
last_updated: 2026-05-11
---

# REFL-033: Defensive Grep Before Destructive Action (and "Plan Complete" ≠ "Plan Binding")

## Anti-Pattern

When making a non-trivial recommendation grounded in a planning document or
codebase state, terminating the search at the first match that ratifies the
working hypothesis. The mistake compounds across rounds: each "correction" reads
slightly more context but still stops short, ratifying a new hypothesis. The
final state is high confidence in a wrong answer because each round felt like
progress.

The specific destructive variant: executing a deletion or destructive action on
a file/route/feature without one final defensive grep across the entire codebase
AND planning corpus immediately before the action — even if the prior search
felt thorough.

A related sub-pattern: confusing **plan staleness**, **plan completion**, and
**plan binding**. A plan can be all of:

- Not stale (recent, untouched since last commit)
- Implemented end-to-end (status: complete)
- No longer binding for a specific constraint (because the constraint's
  prerequisite is now met)

simultaneously. Each property must be checked independently; "I read the most
recent plan" ≠ "I have current direction."

## Trigger

Any time the agent is about to:

1. Execute a deletion (`rm`, `git rm`, `rm -rf`)
2. Make an architectural recommendation that would reverse a recent decision
3. Cite a planning doc as authoritative without checking its implementation
   status and the gates on its constraints
4. Stop searching after finding the first match that supports the current
   working hypothesis

## Root Cause

Three failure modes compound:

1. **Shallow grep + early termination.** Reading the top N lines of a planning
   doc and missing constraint statements that live deeper in the file.
2. **Confirmation bias on the ratifying hypothesis.** When a search finds an
   answer that "fixes" a prior mistake, the search ends — instead of continuing
   to look for evidence that might invalidate the new answer too.
3. **Conflating "the doc exists" with "the doc binds."** Plans go through
   lifecycles: drafted → in-progress → implemented → historical. An implemented
   plan with a satisfied gate is not the same as an active plan with an unmet
   gate, but both look identical from the outside.

## Concrete Trace (2026-04-06 Sensitivity IA Discussion)

This anti-pattern played out in **three rounds** during a single conversation,
caught on the third round only by a defensive grep immediately before a
deletion:

**Round 1 — initial recommendation (Strategy A: split):**

- Read the current state of `/sensitivity-analysis` and `pages/monte-carlo.tsx`
- Recommended splitting Monte Carlo Backtesting onto its own route
- Missed: the `2026-04-03` consolidation commits (`00839853`, `62173d70`) had
  deliberately routed `/sensitivity-analysis` and reduced
  `pages/monte-carlo.tsx` from 517 lines to an 8-line wrapper as part of an
  explicit "ONE workspace, ONE route, MANY tabs" architectural decision
- Caught by: user asking for git alignment ("review the git activity over the
  past two weeks to confirm alignment")

**Round 2 — corrected verdict ("the wrapper is dead code, safe to delete"):**

- Read the parent plan
  `docs/plans/2026-04-02-phase-2-scenario-comparison-consolidation-plan.md`
- Read top 80 lines, found "ONE workspace, ONE route" framing, ratified Strategy
  B (rename only)
- Claimed `pages/monte-carlo.tsx` had "no in-tree justification for retention"
  and recommended deletion
- Missed: lines 387, 487, and 496 of the SAME plan explicitly say:
  - line 387: "keep `client/src/pages/monte-carlo.tsx` in place during this
    slice as the **extraction source and regression fallback**"
  - line 487-489: "decide whether `client/src/pages/monte-carlo.tsx` becomes: a
    redirect to `/sensitivity-analysis`, or an archived source file removed
    after equivalence is verified"
  - line 496: "**do not delete `client/src/pages/monte-carlo.tsx` until the
    shared workspace is verified by tests/build and manual parity checks**"
- Caught by: user invoking the scout-mindset bias check skill

**Round 3 — bias-check uncovered the same failure mode again:**

- Listed three claims that didn't survive scrutiny
- Calibrated recommendation downward
- Was about to execute the deletion based on user's "delete now" directive
- Caught by: one final defensive grep before action —
  `Grep "monte-carlo|MonteCarloPage"` across the entire repo turned up the lines
  387/487/496 references in the plan that I had previously missed

**Halt + 4th round:**

- Halted the deletion, surfaced the corrected facts to the user
- User asked "verify this is not stale" — separate question from "is the gate
  met?"
- Verified: plan was IMPLEMENTED (status: "Implemented through Slice 4"), the
  retention gate (slice 1b verification) was MET, deletion was authorized by the
  plan's lines 487-489
- Executed the deletion (commit `35b63a47`) compliantly

**Net cost of the three-round drift:** ~30 minutes of conversation, multiple
self-corrections, and eventually one defensive grep that prevented violating an
explicit "do not delete until X" instruction. **Net cost if the defensive grep
had been skipped:** unknowable but ≥ a force-revert plus team confusion.

## Fix

### Rule 1: Defensive grep immediately before destructive action

Regardless of how thorough the prior search felt, run ONE final grep across the
entire codebase + planning corpus immediately before executing any deletion or
destructive action. The cost is one tool call; the benefit is catching missed
constraints.

```bash
# Before any rm, git rm, or destructive edit:
Grep "<file_basename>|<related_class>|<related_export>" path=. output_mode=files_with_matches
# Then read each match to confirm no surviving references or constraints.
```

### Rule 2: Three-property plan check before citing a plan as authoritative

When citing a planning doc to justify an action or recommendation, separately
verify:

- **Recency:** What is the doc's `last_updated` and the most recent git commit
  touching it?
- **Implementation status:** What does the doc itself claim about its slices?
  ("Status: Implemented through Slice N", "Confirmed complete", "Open")
- **Constraint binding:** For any "do not X until Y" constraint, has Y been met?
  An implemented plan can have constraints that are no longer binding because
  their gates are now satisfied.

A plan can be FRESH AND COMPLETE AND no longer binding all at once.

### Rule 3: After correcting a recommendation, search HARDER, not the same

When a self-correction lands (e.g., "I missed the consolidation commit"), the
correction itself becomes a new working hypothesis that is equally susceptible
to the same failure mode. Treat the corrected answer as untrusted until it
survives a fresh, broader search — not the same search at slightly higher
resolution.

The empirical signal: if your "corrected" answer feels redemptive, you are
under-searching. Affect heuristic ratifies the wrong answer faster than evidence
does.

### Rule 4: Two orthogonal validation passes for non-trivial recommendations

Before acting on a non-trivial recommendation, run TWO orthogonal checks:

1. **Git alignment** — has anything in the past 2 weeks contradicted the
   recommendation?
2. **Bias check** — would the recommendation survive the reversal test? (Would I
   accept the opposite answer if the same evidence pointed there?)

Both checks must be done separately. Skipping either is how you ratify a wrong
answer through one round of "correction."

## Detection

- Multiple self-corrections in the same conversation thread on the same decision
- "I previously claimed X — that was wrong" appearing more than once per session
- A recommendation grounded in a doc you read only the top of
- About to execute a destructive action without one final defensive grep
- The corrected answer feels redemptive

## Validation

This pattern was caught and codified during the `sensitivity-two-way-panel`
session (2026-04-06). The failure case (deletion of `pages/monte-carlo.tsx`
based on three rounds of incomplete grep) was prevented by Rule 1 (defensive
grep before action). The fix was applied retroactively: REFL-033 was created
during the session-learnings extraction at the end of the same session.

## Related

- `feedback_plandoc_drift_verify.md` (user-level memory) — covers the "verify
  plans against current main" sub-pattern
- `feedback_grep_before_mock_changes.md` (user-level memory) — analogous
  defensive-grep pattern for mock changes
- REFL-016 — vitest include patterns miss new test directories (analogous
  failure: relying on a glob without verifying it covers the intended files)
- The scout-mindset-bias-check thinking framework — formalized version of Rule 4
  (reversal test, status quo bias, double standards)

## Severity Justification

**High** because:

- The failure mode is destructive (deletion based on wrong premise)
- The failure mode is recurrent (three rounds in a single conversation)
- The failure mode is cross-cutting (applies to ANY recommendation, not just one
  domain)
- The fix is cheap (one defensive grep per destructive action)
- The cost of NOT catching it is unknowable but at least a force-revert
