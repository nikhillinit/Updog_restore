Initialize session context with Memory Manager integration.

## Your Task

Load previous session context to eliminate temporal displacement and provide
continuity across Claude Code sessions.

## Process

### Step 1: Run Memory Manager Initialization

Execute the memory manager initialization script:

```bash
node scripts/init-memory-manager.mjs
```

This will:

- Load recent session context (last 10 entries)
- Display previous session memories
- Record current session kickoff
- Save session info to `.session-memory.json`

### Step 2: Review Loaded Context

Display the context that was loaded:

```bash
cat .session-memory.json
```

Review:

- `memoriesLoaded`: Number of context entries retrieved
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
- Context loaded: <memoriesLoaded> entries
- Documentation status: <stale count> documents flagged
- Current phase: <from PHASE-STATUS.json or "unknown">
- Ready for work
```

## Notes

- Memory Manager runs in in-memory mode by default (fast startup)
- Use `--use-database` flag for persistent cross-session storage
- Session context helps prevent repeating work or missing previous decisions
- Documentation freshness check prevents working from stale information

## Error Handling

If memory manager init fails:

1. Check if `packages/memory-manager` is installed
2. Verify DATABASE_URL if using --use-database mode
3. Fall back to session without memory (warn user about lack of context)

If freshness checker fails:

1. Continue without check (non-blocking)
2. Log warning for manual review
