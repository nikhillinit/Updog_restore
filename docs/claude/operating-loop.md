---
last_updated: 2026-05-11
---

# Claude Code Operating Loop

This document defines the canonical operating loop for Claude Code in this
repository.

## The Loop

```
Frame -> Verify -> Execute -> Reconcile -> Git Safety Audit -> Checkpoint/Handoff
```

### 1. Frame

Before starting work, create a frame brief:

- **Objective**: What are we trying to accomplish?
- **Audience/Scope**: Who/what is affected?
- **Top 3 Assumptions**: What must be true for this to work?
- **Riskiest Assumption**: Which assumption is most likely wrong?
- **Cheapest Verification**: How can we verify the risky assumption?

Use `/frame-brief` or invoke `.claude/skills/control-plane/SKILL.md`.

### 2. Verify

In full mode, perform at least one live verification before executing:

- Grep for existing implementations
- Check schema/DB state
- Run a focused test
- Inspect route/file structure

Emits: `verification_run` telemetry event

### 3. Execute

Perform the implementation work. Mode selection determines safeguards.

### 4. Reconcile

After 3+ file changes or parallel work, run reconciliation:

- Verify original problem is resolved
- Check for cross-file inconsistencies
- Detect partial cleanups
- Confirm style consistency

Use `/reconcile` command. Emits: `parallel_reconciler_completed`

### 5. Git Safety Audit

Before risky git operations:

- Large file scan (warn 5-10MB, block >10MB)
- Post-rewrite audit (after rebase/cherry-pick)
- Force push guard (requires acknowledgment)

See `.claude/artifacts/git-audits/` for audit artifacts.

### 6. Checkpoint/Handoff

Create checkpoints at:

- Before risky git operations
- At phase boundaries
- After major milestones
- Before large changes (20+ files)
- On session end

Use `/checkpoint` or `/handoff` commands.

---

## Mode Selection

### Lite Mode

Use when ALL conditions are true:

| Condition      | Description                            |
| -------------- | -------------------------------------- |
| Clear scope    | You can name the exact files to change |
| Small change   | 1-2 files modified                     |
| No risky git   | No rebase, reset, force-push           |
| Known state    | DB schema, API shapes are verified     |
| No parallelism | Single-threaded execution              |
| No claims      | Not producing audit/playbook content   |

### Full Mode

Use when ANY condition is true:

| Condition          | Description                             |
| ------------------ | --------------------------------------- |
| Ambiguous scope    | Discovery required                      |
| Large change       | 3+ files modified                       |
| Uncertain state    | DB/API shape unknown                    |
| Risky git          | Rebase, reset, cherry-pick, force-push  |
| Parallel execution | Multiple agents or large fan-out        |
| Claims-heavy       | Audit reports, playbooks, market claims |
| Long-running       | Token/context risk                      |

### Explore Mode

Non-executing discovery. Use `/explore` for:

- Codebase exploration
- Research questions
- Understanding flows
- Read-only analysis

---

## Gate Semantics

### Warn

Issue a warning but allow continuation:

- Large files 5-10MB
- Stale documentation detected
- Minor style inconsistencies

### Block

Prevent continuation until resolved:

- Large files >10MB
- Force push without acknowledgment
- Remote-only files dropped in rewrite
- Failed verification in full mode

### Checkpoint

Create checkpoint and allow continuation:

- Before risky git operations
- At phase boundaries
- Before large changes

---

## Checkpoint Triggers

| Trigger                         | Reason Code           |
| ------------------------------- | --------------------- |
| Before rebase/reset/cherry-pick | `before_risky_git`    |
| Before force-push               | `before_risky_git`    |
| Before parallel fan-out         | `before_long_run`     |
| At phase boundary               | `phase_boundary`      |
| After green test milestone      | `after_milestone`     |
| Before 20+ file change          | `before_large_change` |
| Manual request                  | `manual`              |
| Session end                     | `session_end`         |

---

## Git Safety Rules

### Large File Blocking

- **Warn**: 5-10MB files
- **Block**: >10MB files
- **Allowlist**: `.claude/large-file-allowlist.json`

### Force Push Protection

Blocked by default. To override:

```bash
CLAUDE_ACK_GIT_RISK=1 git push --force
```

All bypasses logged to telemetry.

### Post-Rewrite Audit

After rebase/cherry-pick, generates audit checking:

- Remote-only files that disappeared
- Files changed during conflict resolution
- Force push requirement
- New large files

---

## Telemetry Events

All events written to `.claude/artifacts/metrics.jsonl`:

| Event                           | Description                 |
| ------------------------------- | --------------------------- |
| `frame_brief_created`           | Frame brief generated       |
| `verification_run`              | Live verification performed |
| `checkpoint_written`            | Checkpoint artifact created |
| `handoff_written`               | Handoff artifact created    |
| `git_audit_generated`           | Git safety audit performed  |
| `large_file_warned`             | 5-10MB file detected        |
| `large_file_blocked`            | >10MB file blocked          |
| `force_push_blocked`            | Force push denied           |
| `bypass_logged`                 | Safety bypass recorded      |
| `parallel_reconciler_completed` | Reconcile check done        |
| `hooks_disabled`                | Kill switch activated       |
| `explore_mode_used`             | Explore mode entered        |
| `lite_mode_selected`            | Lite mode chosen            |
| `full_mode_selected`            | Full mode chosen            |
| `lock_contention`               | Worktree lock conflict      |
| `staleness_detected`            | Stale artifact found        |

---

## Usage Examples

### /frame-brief

```
/frame-brief objective="Add batch export endpoint" audience="API consumers" assumptions=["Schema supports batch", "No auth changes needed", "Existing serializer works"]
```

### /checkpoint

```
/checkpoint reason="before_risky_git" currentState="Completed rebase prep" nextTask="Execute rebase"
```

### /handoff

```
/handoff currentState="Phase 3 complete, all tests green" nextTask="Begin Phase 4 UI work" blockers=["Design review pending"]
```

### /reconcile

```
/reconcile filesChanged=["api.ts", "schema.ts", "types.ts"] verifierOutput="Endpoint returns correct data"
```

### /explore

```
/explore "How does the reserve calculation flow from API to UI?"
```

### /bias-audit

```
/bias-audit target="docs/competitive-analysis.md"
```

---

## Kill Switch

Disable all control plane hooks:

```bash
CLAUDE_HOOKS_DISABLE=1
```

All disables are logged to telemetry with `hooks_disabled` event.

---

## Staleness Detection

Checkpoint/handoff artifacts include resume metadata:

```json
{
  "resume": {
    "ttlMinutes": 240,
    "expiresAt": "ISO-8601",
    "staleIf": [
      "head_sha_changed",
      "branch_changed",
      "git_status_hash_changed",
      "ttl_expired"
    ],
    "onStale": "rederive_state_from_repo_then_refresh_artifact_before_continuing"
  }
}
```

On resume:

1. Check all staleness conditions
2. If stale, do NOT trust task fields
3. Re-derive state from live repo
4. Regenerate artifact before continuing
