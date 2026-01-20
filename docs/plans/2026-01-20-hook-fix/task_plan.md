# Hook Fix Task Plan

**Date:** 2026-01-20
**Status:** IN_PROGRESS

## Problem Statement

The `complexity-checkpoint-hook.sh` doesn't execute on Windows/Git Bash. Multiple issues discovered:

1. `bash script.sh` produces no stdout on Windows (but `bash -c 'source script.sh'` works)
2. UserPromptSubmit hooks with ANY stdout cause errors (bug #13912)
3. Stdin piping doesn't work correctly in various Windows bash invocations

## Attempted Solutions

| Approach | Result |
|----------|--------|
| `bash scripts/hooks/...` | No output on Windows |
| `bash -c 'source ...'` | Works for output, but stdin not passed |
| JSON stdout format | Still triggers hook error (bug #13912) |
| Write to file instead of stdout | File not created - hook not running |
| Direct script path | Hook didn't execute |
| `bash "$CLAUDE_PROJECT_DIR/..."` | Untested |

## Current Blocker

Hook doesn't run at all when invoked by Claude Code on Windows.

## Next Steps

1. Consult Codex for Windows-specific hook execution patterns
2. Research Claude Code hook execution on Windows
3. Consider PowerShell wrapper as alternative

## Success Criteria

- Hook runs on user prompt submit
- Checkpoint file created at `.claude/complexity-checkpoint.md`
- No UserPromptSubmit hook errors
