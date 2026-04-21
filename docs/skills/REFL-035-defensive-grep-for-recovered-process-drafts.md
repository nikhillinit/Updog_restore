---
id: REFL-035
title: Defensive Grep for Recovered Process Drafts Before Scoping Work
status: DRAFT
date: 2026-04-07
severity: medium
category: Process
discovered: 2026-04-07
tags:
  [
    process,
    recommendation-discipline,
    session-handoff-drift,
    scoping,
    bias-check,
    babysitter,
  ]
error_codes: []
last_updated: 2026-04-07
---

# REFL-035: Defensive Grep for Recovered Process Drafts Before Scoping Work

## Anti-Pattern

Running deep scoping analysis (thinking-framework passes, multi-round bias
audits, red-team sessions) on a question without first grepping the
`.a5c/processes/` directory (and other scope-artifact locations) for recovered
drafts from prior sessions. The failure mode compounds: each thinking-framework
pass adds confidence to the orchestrator's independent re-derivation without
surfacing the fact that the question was already settled in a prior session.

The specific babysitter variant: a prior session's `/babysitter:call` interview
locked a design decision, drafted process/diagram/inputs files, and stopped
before creating the `.js` process file or starting the run. The session was then
cleared (via `/clear` or auto-compaction), and the handoff prompt that was
generated did not enumerate the orphaned scope artifacts. A subsequent session,
receiving only the handoff, sees the scoping question as **open** and begins
fresh scoping work — unaware that the answer is sitting in
`.a5c/processes/<slice-name>.{process.md, inputs.json, diagram.md}` from hours
earlier.

## Trigger

Any time the orchestrator is about to invoke a thinking-framework skill
(systems-thinking-leverage, scout-mindset-bias-check,
deliberation-debate-red-teaming, planning-with-files, or similar) on a scoping
question whose phrasing matches any of:

- "Should we do X?"
- "How should we scope X?"
- "Is X still actionable / invalidated?"
- "What interpretation of X is correct?"

...where X is a slice, feature, or architectural decision that a prior session
might have touched.

## Symptoms

- Multiple thinking-framework passes on the same question without converging on
  a commitment
- Each pass surfaces new information that invalidates the prior pass's
  conclusion
- Wall-clock time on "scoping" exceeds the estimated implementation time for the
  slice
- The session handoff mentions the topic as "open" or "deferred" but does not
  reference any scope artifact
- `.a5c/processes/` contains files whose mtime is newer than the session handoff
  date

## Fix

Before invoking any thinking-framework skill on a scoping question, run a
30-second defensive grep sequence:

```bash
# 1. List .a5c/processes/ files matching the topic
ls .a5c/processes/ | grep -i <topic-slug>

# 2. Check mtimes against the handoff date
ls -la .a5c/processes/ | grep -i <topic-slug>

# 3. Grep docs/plans/ for recent drafts
ls docs/plans/ | grep -i <topic-slug>

# 4. Grep the memory index for recent references
grep -l <topic> .claude/memory/ -r 2>/dev/null
# or: cat .claude/memory/MEMORY.md | grep -i <topic>

# 5. Check git log for related commits landed since handoff
git log --oneline --since="<handoff-date>" | grep -i <topic>
```

If any of these return recovered artifacts newer than the session handoff date,
STOP the thinking-framework plan and read the artifacts FIRST. Deciding whether
to use the recovered draft as-is, update it, or discard it is a different kind
of decision than deciding the scoping question from scratch — and is usually
much cheaper.

The thinking-framework skills are expensive in both wall-clock time and in the
reasoning momentum they generate. Once you're three framework passes deep into a
scoping question, correcting course feels like "admitting defeat" even when the
correction is cheap. The defensive grep is a cheap precommit to avoid that
reasoning momentum trap.

## Example Failure Mode (2026-04-07)

The 2026-04-07 session opened with a research fork question about the
sensitivity stress tab. The orchestrator ran:

1. **systems-thinking-leverage** on fork (a) — produced a system map with
   feedback loops and Meadows leverage analysis
2. **scout-mindset-bias-check** on the result of pass 1 — surfaced confirmation
   bias in the pass 1 analysis and prompted deeper verification
3. **planning-with-files** — verified BacktestingService infrastructure and
   claimed the stress slice was achievable via Option (iii) scenario-comparison
   bridging
4. **deliberation-debate-red-teaming** on the pass 3 recommendation — caught the
   async lifecycle and user-intent ambiguity that pass 3 missed

Only AFTER the four-pass thinking-framework cycle — ~60 minutes of wall clock
time — did the orchestrator run `ls .a5c/processes/` and discover
`sensitivity-stress-panel.{process.md, inputs.json, diagram.md}` from the prior
session, dated 2026-04-06 18:32-18:34. The recovered draft:

- Already locked the β interpretation (pass 3 and 4 were still debating α/β)
- Already specified all 14 owned files (pass 3 estimated "1.5-2x two-way" in
  size; actual spec was exactly that)
- Already included a complete phase plan with verification gates
- Already recorded an informational finding about the α infrastructure's
  post-hoc scaling smell (which pass 3 missed entirely)

The four thinking-framework passes produced no information that wasn't already
in the recovered draft. A single `ls .a5c/processes/ | grep stress` at session
start would have saved all four passes.

## Related Reflections

- **REFL-033** (Defensive Grep Before Destructive Action): sibling lesson from
  2026-04-06. REFL-033 is about avoiding destructive actions on stale state.
  REFL-035 is about avoiding expensive scoping cycles on stale state. Both
  reduce to: **the `.a5c/` directory and the code are the truth; handoff prose
  is stale faster than you think.**

- If a third sibling lesson appears in a future session (e.g., defensive grep
  before architectural refactors), consider promoting the pair to a root-level
  "defensive-grep-before-X" methodology doc that unifies them.

## Operational Guidance

For session-start protocol:

1. Read the handoff prompt (existing step)
2. Read `.claude/memory/active-context.md` (existing step)
3. **Run `ls .a5c/processes/` and `ls docs/plans/` and note any files newer than
   the handoff date** (new step)
4. If the session's intended work overlaps with any recovered artifact, read the
   artifact BEFORE invoking thinking-framework skills

For thinking-framework skill invocation:

1. Before invoking the skill, ask: "Is this scoping question one that could have
   been touched in a prior session?"
2. If yes, run the defensive grep sequence above
3. Only after the grep returns clean should the thinking-framework pass proceed

## Cross-Reference to Memory

The `reference_dependabot_triage_flow.md` memory documents a similar "dashboard
lies, the authoritative state is elsewhere" pattern for dependabot alerts. Both
lessons share the core insight that point-in-time snapshots (dashboard counts,
handoff prose) drift from authoritative state (API responses, code, `.a5c/`
artifacts) faster than orchestrator expectations.
