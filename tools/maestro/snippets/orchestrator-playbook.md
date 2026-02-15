# Orchestrator Playbook - Claude Code + Codex

Operational manual for Claude Code as the orchestrator in iterative Codex
collaboration. Every critique round MUST apply these reasoning disciplines to
maximize feasibility and catch failure modes early.

## Core Principle

Claude Code is the **critic, not the audience**. Default posture is skeptical.
Codex proposals are treated as hypotheses to stress-test, not answers to accept.

## Mandatory Reasoning Skills

### 1. Defense in Depth (every critique round)

Validate at every layer data passes through. A proposal that works at one layer
but breaks at another is a `blocking` finding.

**Application checklist:**

- Does the proposal validate inputs at the system boundary (API, user input)?
- Does it maintain invariants through the middle layers (services, engines)?
- Does it produce correct output at the final layer (DB writes, UI renders)?
- If any layer is unguarded, mark `blocking` and specify which layer.

**Prompt injection for Codex:**

```
"For each change, trace the data path from entry point to storage/render.
Identify every layer that touches this data and confirm validation exists
at each boundary."
```

**Example critique:**

```
[blocking] Proposal adds Zod validation at the API route but the BullMQ
worker receives the same payload without validation. If a job is enqueued
directly (e.g., from a migration script), the worker processes unvalidated
data. Add Zod parse in the worker handler too.
```

### 2. Inversion Thinking (ANALYZE + PLAN phases)

Before evaluating "will this work?", first ask "how would this fail?" Enumerate
failure modes, then check whether the proposal addresses each one.

**Application checklist:**

- List 3-5 ways this proposal could fail (wrong assumptions, missing deps, race
  conditions, edge cases, breaking changes).
- For each failure mode, check if the proposal handles it.
- Unhandled failure modes with real probability are `blocking`.
- Unlikely but catastrophic failure modes are `important`.

**Prompt injection for Codex:**

```
"Before proposing a solution, list the top 5 ways this approach could fail.
For each failure mode, explain how your proposal prevents or mitigates it."
```

**Example critique:**

```
[blocking] Proposal assumes the fund always has at least one investment.
Inversion: what happens with a newly created empty fund? The reduce() call
on line 47 throws on empty array. Handle the zero-investment case.

[important] Proposal uses Date.now() for cache key. Inversion: two requests
within the same millisecond get the same key and race on cache write.
Use a monotonic counter or accept eventual consistency.
```

### 3. Root Cause Tracing (ANALYZE phase for bugs)

Never accept a proposed fix without tracing the causal chain backward from the
symptom to the root. Fixes that address symptoms recur.

**Application checklist:**

- What is the observable symptom?
- What is the immediate cause (the line/function that produces wrong output)?
- What upstream condition makes that line behave incorrectly?
- Is there a deeper cause (config, data shape, race condition)?
- Does the proposed fix address the deepest confirmed cause?

**Prompt injection for Codex:**

```
"Trace backward from the symptom: <symptom>. For each step, identify
what calls what and where the incorrect value originates. Do not propose
a fix until you identify the root cause with file:line evidence."
```

### 4. Systematic Debugging (EXECUTE phase)

Four sub-phases applied to each implementation step:

1. **Investigate** - Read the relevant code, confirm preconditions
2. **Hypothesize** - State what the change should accomplish and why
3. **Fix** - Make the minimal change
4. **Verify** - Run tests, confirm the hypothesis

**Application checklist:**

- Before implementing: have you read every file the change touches?
- After implementing: do tests pass? Does manual spot-check confirm behavior?
- If tests fail: do NOT retry the same approach. Re-enter ANALYZE.

### 5. Verification Before Completion (VERIFY phase)

Never declare "done" without running verification commands and confirming with
evidence. This is the final gate.

**Application checklist:**

- All tests pass (run them, paste output).
- Type checking passes (`npm run check`).
- Linting passes (`npm run lint`).
- The original requirements are met (check each one explicitly).
- No regressions introduced (diff review of unrelated files).

**Prompt injection for Codex:**

```
"Given these changes: <summary>. And these requirements: <requirements>.
Identify any requirement that is NOT covered by the current implementation
or test suite. Identify any regression risk in adjacent code."
```

## Critique Protocol

### Per-Round Procedure

1. **Receive** Codex proposal.
2. **Apply Defense in Depth**: trace data through all layers.
3. **Apply Inversion Thinking**: enumerate failure modes.
4. **Categorize findings** by severity (blocking / important / minor).
5. **Decision gate**:
   - Any `blocking` findings -> MUST iterate. Include findings in next prompt.
   - Only `important` or `minor` -> MAY accept. Document `important` items.
   - Zero findings -> consensus reached.

### Critique Format

```
-- Critique (Round N) --
[blocking] <category>: <description with file:line references>
[important] <category>: <description>
[minor] <category>: <description>

Verdict: ITERATE | ACCEPT
Next prompt context: <what to include in the next Codex call>
```

### Iteration Limits

| Workflow    | Default Max | Hard Cap | On Cap Hit                         |
| ----------- | ----------- | -------- | ---------------------------------- |
| Collaborate | 5 rounds    | 7        | Accept with documented open issues |
| Forensic    | 4 phases    | 6\*      | Escalate to user                   |

\*Forensic can exceed 4 if a phase fails critique and must repeat, but never
more than 6 total Codex calls per task.

## Phase-Specific Skill Application

| Phase   | Primary Skills                         | Secondary Skills   |
| ------- | -------------------------------------- | ------------------ |
| ANALYZE | Inversion Thinking, Root Cause Tracing | Defense in Depth   |
| PLAN    | Inversion Thinking, Defense in Depth   | --                 |
| EXECUTE | Systematic Debugging, Defense in Depth | --                 |
| VERIFY  | Verification Before Completion         | Inversion Thinking |

## Anti-Patterns

These are orchestrator mistakes to avoid:

| Anti-Pattern                    | Why It Fails                     | Instead                          |
| ------------------------------- | -------------------------------- | -------------------------------- |
| Accepting first proposal        | Skips failure mode analysis      | Always apply Inversion Thinking  |
| Critiquing style over substance | Wastes iterations on formatting  | Focus on Feasibility/Correctness |
| Repeating same critique         | Codex already addressed it       | Escalate severity or accept      |
| Over-iterating on `minor`       | Diminishing returns past round 3 | Accept and document              |
| Skipping VERIFY phase           | Declares done without evidence   | Always run tests + type check    |
| Guessing file contents          | Leads to phantom bugs            | Read the file first              |

## Integration with Claude Code Skills

When these Claude Code skills are available, invoke them during the appropriate
phase:

| Claude Code Skill                            | Invoke During      | Purpose                          |
| -------------------------------------------- | ------------------ | -------------------------------- |
| `superpowers:defense-in-depth`               | Every critique     | Layer-by-layer validation        |
| `superpowers:root-cause-tracing`             | ANALYZE (bugs)     | Backward causal chain            |
| `superpowers:systematic-debugging`           | EXECUTE            | 4-phase fix protocol             |
| `superpowers:verification-before-completion` | VERIFY             | Evidence-based completion        |
| `superpowers:testing-anti-patterns`          | EXECUTE + VERIFY   | Prevent mock-testing-mock cycles |
| `superpowers:condition-based-waiting`        | EXECUTE (async)    | Replace arbitrary timeouts       |
| `superpowers:dispatching-parallel-agents`    | ANALYZE (3+ files) | Parallel investigation           |

## Quick Reference Card

```
BEFORE EVERY CRITIQUE:
  1. How would this fail? (Inversion)
  2. Is every layer validated? (Defense in Depth)
  3. Is the root cause addressed, not the symptom? (Root Cause)
  4. Is severity correctly assigned? (blocking > important > minor)

BEFORE DECLARING DONE:
  1. Tests pass? (evidence)
  2. Types pass? (evidence)
  3. Lint passes? (evidence)
  4. Each requirement checked off? (explicit)
  5. No regressions? (diff review)
```
