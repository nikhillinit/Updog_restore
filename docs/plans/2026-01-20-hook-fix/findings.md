# Hook Fix Findings

## Research Phase

### Known Issues (from GitHub)

1. **Bug #13912**: UserPromptSubmit hooks cannot output to stdout without error
2. **Bug #8810**: Hooks not working from subdirectories on Windows (closed as fixed)
3. **Bug #12151**: Plugin hooks don't pass output to context

### Windows-Specific Behavior Discovered

Testing with Claude Code's Bash tool:
- `bash script.sh` - no output
- `bash -c 'source script.sh'` - output works
- `bash -c 'cat'` with pipe - no stdin received
- Heredocs to bash - only first line processed

### Hook Configuration Tested

```json
{
  "command": "bash scripts/hooks/complexity-checkpoint-hook.sh"
}
```
Result: No output, no log file created

```json
{
  "command": "bash -c 'source \"$CLAUDE_PROJECT_DIR/scripts/hooks/...\"'"
}
```
Result: Source works but stdin not passed

## Codex Consultation

**Session ID:** 019bda78-5123-7980-a017-0073d7d570bc

### Root Cause Analysis

1. **Claude Code on Windows executes hooks via PowerShell**, not bash directly
2. **stdin isn't reliably forwarded** from PowerShell to Git Bash
3. The script's `INPUT=$(cat)` blocks or reads nothing because stdin never arrives

### Why `bash script.sh` appears silent

- The script waits on `cat` for stdin that never comes
- Script hangs or exits early with empty input
- No log file created because early exit conditions triggered

### Recommended Fix

Use `bash -lc 'source ...'` format:
```json
"command": "bash -lc 'source \"$CLAUDE_PROJECT_DIR/scripts/hooks/complexity-checkpoint-hook.sh\"'"
```

Or create a PowerShell wrapper that:
1. Reads stdin in PowerShell
2. Sets `HOOK_INPUT` environment variable
3. Calls bash with the hook script

## Implementation

### PowerShell Wrapper Created

`scripts/hooks/hook-wrapper.ps1`:
- Uses `$args[0]` instead of `param()` to avoid pipeline binding issues
- Reads stdin via `[Console]::In.ReadToEnd()`
- Sets `$env:HOOK_INPUT` for bash scripts
- Invokes bash with `source` workaround

### Settings.json Updated

```json
"command": "powershell -ExecutionPolicy Bypass -File \"$CLAUDE_PROJECT_DIR/scripts/hooks/hook-wrapper.ps1\" \"$CLAUDE_PROJECT_DIR/scripts/hooks/complexity-checkpoint-hook.sh\""
```

### Local Test Result

SUCCESS - checkpoint file created with correct content:
- Hook receives JSON input (62 chars)
- Pattern matching works ("breaking changes" triggers both PLANNING and CODEX)
- File written to `.claude/complexity-checkpoint.md`

## Issue 2: Discovery Hook Also Outputs to Stdout

**Discovered:** After fixing complexity hook, still got 2 errors - one per hook.

**Root Cause:** `discovery-hook.sh` was never updated to use file-based output.

**Fix Applied:** Updated discovery hook to write to `.claude/discovery.md` instead of stdout.

## Final Test Results

Both hooks now:
- Produce zero stdout (verified)
- Write to files in `.claude/` directory
- Exit cleanly with code 0

**Files created:**
- `.claude/discovery.md` - tool/agent recommendations
- `.claude/complexity-checkpoint.md` - planning/Codex reminders

## Codex Review (Session 2)

**Session ID:** 019bda9b-4a61-73f3-b26a-0aec58e56761

### Issues Identified

| Severity | Issue | Fix |
|----------|-------|-----|
| High | `bash -lc` can emit stdout from login rc files | Use `bash --noprofile --norc -c` |
| Medium | `set -e` + unguarded jq causes non-zero exit | Changed to `set +e` |
| Medium | `PROJECT_ROOT=$(pwd)` drifts if rc changes cwd | Use `CLAUDE_PROJECT_DIR` |
| Low | Logging to `/tmp` may not exist on Windows | Acceptable for debug |

### Fixes Applied

1. **settings.json**: Changed both hooks to use `bash --noprofile --norc -c`
2. **discovery-hook.sh**:
   - Changed `set -e` to `set +e`
   - Changed `PROJECT_ROOT=$(pwd)` to `PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"`
3. **complexity-checkpoint-hook.sh**: Already had `set +e`

### Codex Questions Answered

> Is Claude Code wired to read the .md files automatically?

No - files are a workaround. Claude reads them if instructed. Future: when bug #13912 is fixed, can use direct context injection.

> Does PowerShell wrapper always populate HOOK_INPUT?

PowerShell wrapper was abandoned in favor of `bash --noprofile --norc -c 'source ...'` approach per Codex recommendation.

## Isolation Test Results

**Test:** Minimal hook `bash -c 'exit 0'` for UserPromptSubmit

**Result:**
- SessionStart: ERROR (still using `bash script.sh` format)
- UserPromptSubmit: NO ERROR (minimal hook worked!)

**Conclusion:** The issue is the command format, not Claude Code's hook runner.
- `bash script.sh` → FAILS on Windows
- `bash -c 'exit 0'` → WORKS on Windows

**Root Cause Confirmed:** Direct script execution doesn't work; inline commands do.

## Codex Session 3: Variable Expansion Issue

**Session ID:** 019bdad3-c6d1-7510-8f49-690d34fb7423

**Root Cause:** `$CLAUDE_PROJECT_DIR` either:
1. Isn't set in the hook's environment, OR
2. Is a Windows path (e.g., `C:\dev\...`) that bash can't use with `source`

**Why single quotes don't help:** Single quotes prevent PowerShell expansion, but bash still tries to expand `$CLAUDE_PROJECT_DIR` inside the `-c` string. If the var is empty or a Windows path, `source` fails.

**Solution:** Use relative paths (hooks run from repo root):
```json
"command": "bash --noprofile --norc -c 'source scripts/hooks/discovery-hook.sh'"
```

Alternative (if relative paths don't work): Convert with cygpath:
```json
"command": "bash --noprofile --norc -c 'source \"$(cygpath -u \"$CLAUDE_PROJECT_DIR\")/scripts/hooks/...\"'"
```

## Final Implementation

### All Hooks Fixed

| Hook | Command | Output File |
|------|---------|-------------|
| SessionStart | `bash --noprofile --norc -c 'source scripts/hooks/session-start-hook.sh'` | `.claude/session-context.md` |
| UserPromptSubmit (discovery) | `bash --noprofile --norc -c 'source scripts/hooks/discovery-hook.sh'` | `.claude/discovery.md` |
| UserPromptSubmit (complexity) | `bash --noprofile --norc -c 'source scripts/hooks/complexity-checkpoint-hook.sh'` | `.claude/complexity-checkpoint.md` |

### Local Verification Results

All 3 hooks:
- Zero stdout (bug #13912 workaround)
- Exit code 0
- Output files created correctly

### Key Fixes Applied

1. **Relative paths** instead of `$CLAUDE_PROJECT_DIR` (variable may not be set or may be Windows path)
2. **`bash --noprofile --norc -c 'source ...'`** (avoids login shell output, uses source workaround)
3. **File-based output** instead of stdout (bug #13912 workaround)
4. **`set +e`** in all hooks (non-fatal errors)
5. **`CLAUDE_PROJECT_DIR` fallback** for internal path resolution

## Codex Session 4: SessionStart Directory Issue

**Session ID:** 019bdc0a-6182-7a40-af8e-ecc7349c0699

**Problem:** SessionStart still fails even with relative paths.

**Root Cause:** SessionStart runs BEFORE Claude Code sets cwd to project root. Relative paths resolve from arbitrary directory (home or launch dir).

**Solution:** Use absolute path for SessionStart hook:
```json
"command": "bash --noprofile --norc -c 'source \"C:/dev/Updog_restore/scripts/hooks/session-start-hook.sh\"'"
```

**Why UserPromptSubmit works:** It runs AFTER cwd is set to project root, so relative paths work.

## Final Fix: cd to PROJECT_ROOT

**Session ID:** N/A (direct fix based on Codex Session 4 insight)

**Problem:** Even with BASH_SOURCE detection, the script's internal commands (find, git) still used relative paths or ran from arbitrary cwd.

**Solution:** Add `cd "$PROJECT_ROOT" || exit 1` immediately after detecting PROJECT_ROOT.

**Verification:**
```bash
cd /tmp && bash --noprofile --norc -c 'source "C:/dev/Updog_restore/scripts/hooks/session-start-hook.sh"'
# Result: Exit code 0, file shows correct counts (37 agents, 72 skills, 21 commands, 41 cheatsheets)
```

## Summary of All Fixes

| Hook | Issue | Fix |
|------|-------|-----|
| All hooks | stdout causes error (bug #13912) | Write to `.claude/*.md` files |
| All hooks | `bash script.sh` no output | Use `bash -c 'source ...'` |
| All hooks | Login shell may emit output | Use `--noprofile --norc` flags |
| UserPromptSubmit | `$CLAUDE_PROJECT_DIR` not set/Windows path | Use relative paths |
| SessionStart | Runs before cwd set | Use absolute path in command |
| SessionStart | Internal commands use wrong cwd | `cd "$PROJECT_ROOT"` after detection |

---

## FINAL SOLUTION: .cmd Wrapper Approach

**Date:** 2026-01-20
**Codex Sessions:** 019bdc49-3d81-7833-bb1e-bb9992a6cc13, 019bdc5f-97ec-73c0-a20a-bc86f40e895c

### Root Cause Confirmed

Claude Code on Windows:
1. Wraps hook commands with `cd /d C:\path && <command>`
2. Passes the ENTIRE string to bash
3. Bash fails on `/d` flag: "cd: too many arguments"

### Isolation Test Results

| Test | Command Type | Result |
|------|--------------|--------|
| T1 | cmd /c "echo..." | PASSED |
| T2 | powershell -Command | FAILED |
| T3 | bash -c "..." | FAILED |
| T4 | .cmd wrapper file | PASSED |

### Solution: .cmd Wrappers

Since .cmd files execute natively via cmd.exe, use .cmd wrappers that invoke bash:

**Pattern:**
```cmd
@echo off
setlocal
set "BASH=C:\Program Files\Git\bin\bash.exe"
set "SCRIPT=C:/dev/Updog_restore/scripts/hooks/<hook-name>.sh"
"%BASH%" --noprofile --norc -c "source '%SCRIPT%'"
exit /b 0
```

**Files Created:**
- `scripts/hooks/session-start-hook.cmd`
- `scripts/hooks/discovery-hook.cmd`
- `scripts/hooks/complexity-checkpoint-hook.cmd`

**settings.json Configuration:**
```json
"SessionStart": [{
  "matcher": "*",
  "hooks": [{
    "type": "command",
    "command": "C:\\dev\\Updog_restore\\scripts\\hooks\\session-start-hook.cmd",
    "timeout": 10
  }]
}],
"UserPromptSubmit": [{
  "matcher": "*",
  "hooks": [
    {"type": "command", "command": "C:\\dev\\Updog_restore\\scripts\\hooks\\discovery-hook.cmd", "timeout": 10},
    {"type": "command", "command": "C:\\dev\\Updog_restore\\scripts\\hooks\\complexity-checkpoint-hook.cmd", "timeout": 5}
  ]
}]
```

### Why This Works

1. Claude Code sees `.cmd` file → executes via cmd.exe (NOT bash)
2. cmd.exe handles `cd /d` correctly (it's cmd syntax)
3. cmd.exe then invokes bash with our script
4. Bash runs without the problematic `cd /d` prefix
