# Claude Code Max Output Tokens Configuration

## Problem

Claude Code responses get truncated or cut off mid-answer due to output token
limits.

## Solution

### Quick Fix (Current Session Only)

Run in PowerShell before launching Claude Code:

```powershell
.\scripts\set-claude-max-tokens.ps1
```

### Permanent Fix (Recommended)

Run once to set permanently:

```powershell
.\scripts\set-claude-max-tokens.ps1 -Persistent
```

Then restart Claude Code.

### Manual Setup

**Option 1: Add to PowerShell Profile**

```powershell
# Open your profile
notepad $PROFILE

# Add this line:
$env:CLAUDE_CODE_MAX_OUTPUT_TOKENS = "32768"
```

**Option 2: System Environment Variable**

```powershell
[System.Environment]::SetEnvironmentVariable('CLAUDE_CODE_MAX_OUTPUT_TOKENS', '32768', 'User')
```

## Token Limits by Model

| Model             | Default | Maximum |
| ----------------- | ------- | ------- |
| Claude Sonnet 4.5 | 8,192   | 32,768  |
| Claude Opus       | 4,096   | 16,384  |

## Verification

Check current setting:

```powershell
echo $env:CLAUDE_CODE_MAX_OUTPUT_TOKENS
```

## Important Notes

1. **Must be set BEFORE launching Claude Code** - Changes don't apply to running
   sessions
2. **Restart required** - After setting permanently, restart Claude Code
3. **Session-scoped** - Without `-Persistent` flag, setting only lasts for
   current PowerShell session
4. **Not retroactive** - Won't fix truncation in already-started conversations

## Troubleshooting

**Still getting truncated responses?**

1. Verify the variable is set: `echo $env:CLAUDE_CODE_MAX_OUTPUT_TOKENS`
2. Restart Claude Code completely
3. Check you're using the correct PowerShell (not Git Bash or WSL)
4. Try starting a new conversation after setting the variable

**Variable not persisting?**

- Use the `-Persistent` flag
- Or add to your PowerShell profile (`$PROFILE`)
- Verify with:
  `[System.Environment]::GetEnvironmentVariable('CLAUDE_CODE_MAX_OUTPUT_TOKENS', 'User')`

## See Also

- [Claude Code Documentation](https://docs.claude.com/en/docs/claude-code)
- PowerShell profile location: `$PROFILE`
