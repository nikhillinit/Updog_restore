---
description: 'Initialize session context with package-free repo context'
allowed-tools: Read, Bash
last_updated: 2026-04-03
---

Initialize session context with package-free repo context.

## Your Task

Record a lightweight session context file and review current repo docs before
starting work.

## Process

### Step 1: Run Session Context Initialization

Execute the package-free session context initialization script:

```bash
npx tsx scripts/init-memory-manager.ts
```

This will:

- Record current session kickoff metadata
- Save session info to `.session-memory.json`

### Step 2: Review Loaded Context

Display the context that was loaded:

```bash
cat .session-memory.json
```

Review:

- `memoriesLoaded`: Expected to be `0` for the package-free context path
- `sessionId`: Current session identifier
- `startedAt`: Session start timestamp

### Step 3: Check for Stale Documentation

Run the documentation freshness checker:

```bash
node scripts/check-doc-freshness.mjs
```

This will warn about any documentation that's >7 days stale compared to git
modifications.

### Step 4: Verify Phase Status

Check current phase completion status:

```bash
cat docs/PHASE-STATUS.json 2>/dev/null || echo "No phase tracking data yet"
```

### Step 5: Ready State

Announce to the user:

```
[SESSION INITIALIZED]
- Session ID: <from .session-memory.json>
- Context file written: .session-memory.json
- Documentation status: <stale count> documents flagged
- Current phase: <from PHASE-STATUS.json or "unknown">
- Ready for work
```

## Notes

- Session context is package-free and does not load prior memories.
- Use repo docs and workspace memory for previous decisions.
- Documentation freshness check prevents working from stale information.

## Error Handling

If session context initialization fails:

1. Continue without `.session-memory.json`
2. Warn user that the lightweight context file was not written

If freshness checker fails:

1. Continue without check (non-blocking)
2. Log warning for manual review
