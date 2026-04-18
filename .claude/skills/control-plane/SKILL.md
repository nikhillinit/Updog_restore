---
name: control-plane
description:
  Core control plane operations - checkpoint, handoff, frame-brief, reconcile
---

# Control Plane Operations

This skill provides the core control plane loop: **Frame -> Verify -> Execute ->
Reconcile -> Git Safety -> Checkpoint/Handoff**

## Commands

### /checkpoint

Create a timestamped checkpoint before risky operations or at phase boundaries.

**Trigger conditions (automatic):**

- Before rebase/reset/cherry-pick/force-push
- Before large fan-out (3+ files or parallel agents)
- At named phase boundaries
- After major green-test milestones
- Before touching 20+ files

**Usage:**

```
/checkpoint reason="before_risky_git" currentState="..." nextTask="..."
```

**Output:**

- `.claude/artifacts/checkpoints/YYYYMMDD-HHMMSS--<reason>.json`
- `.claude/artifacts/checkpoints/YYYYMMDD-HHMMSS--<reason>.md`

### /handoff

Create a session handoff artifact at repo root for session transitions.

**Usage:**

```
/handoff currentState="Completed X, verified Y" nextTask="Implement Z" blockers=["DB migration pending"]
```

**Output:**

- `HANDOFF.json` at repo root
- `HANDOFF.md` at repo root

### /frame-brief

Create a frame brief before starting work in full mode.

**Required elements:**

1. Objective - what are we trying to accomplish
2. Audience / Scope - who is affected, what files/systems
3. Top 3 assumptions
4. Riskiest assumption identification
5. Cheapest verification for that assumption

**Usage:**

```
/frame-brief objective="Add X feature" audience="Users of Y" assumptions=["API exists", "Schema supports it", "No breaking changes"]
```

**Gate behavior:**

- In full mode: requires one live verification step before plan execution
- In lite mode: may bypass when scope is obvious

### /reconcile

Run after parallel work or 3+ file changes to verify consistency.

**Checks:**

1. Verifier output - confirms original problem is resolved
2. Cross-file inconsistencies - style, logic, naming
3. Partial cleanups - patterns that should be removed everywhere
4. Style drift - deviations from repo conventions

**Usage:**

```
/reconcile filesChanged=["file1.ts", "file2.ts"] verifierOutput="..."
```

### /explore

Non-executing discovery mode for research and exploration.

**Behavior:**

- Read-only operations only
- No file modifications
- No git operations
- Used for codebase exploration, research, understanding

**Usage:**

```
/explore "How does the authentication flow work?"
```

Emits telemetry: `explore_mode_used`

## Mode Selection

### Lite Mode

Use when ALL true:

- Scope is clear
- Change touches 1-2 files
- No risky git operation
- No unknown external state (DB/schema/API)
- No parallel agent fan-out
- No audit/claims-heavy content

### Full Mode

Use when ANY true:

- Scope is ambiguous
- Change spans 3+ files
- External state is uncertain
- Risky git operation involved
- Parallel execution planned
- Output includes audit/playbook/market claims
- Long-running or token-risk workflow

## Staleness Detection

All checkpoint/handoff artifacts include resume metadata. On resume:

1. Check TTL expiration
2. Compare HEAD SHA
3. Compare branch
4. Compare git status hash

If ANY condition indicates staleness:

- Do NOT trust pending task fields
- Re-derive current state from repo
- Regenerate artifact before continuing

## Kill Switch

Set `CLAUDE_HOOKS_DISABLE=1` to disable all control plane hooks. All bypasses
are logged to telemetry.
