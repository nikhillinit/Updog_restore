# Codex CLI Integration - Updog_restore

Multi-LLM orchestration using official OpenAI Codex CLI with ChatGPT Pro
subscription (no API costs).

## Quick Start

```powershell
# 1. Check setup
.\tools\maestro\scripts\setup-maestro.ps1

# 2. Load environment
. .\tools\maestro\env.ps1

# 3. Use Codex
codex exec "Your prompt here" --sandbox read-only
```

## Configuration

| Setting   | Value           | Purpose                        |
| --------- | --------------- | ------------------------------ |
| Model     | `gpt-5.3-codex` | Automatic (CLI default)        |
| Reasoning | `xhigh`         | Highest reasoning capability   |
| Sandbox   | `read-only`     | Validates claims with evidence |
| Auth      | ChatGPT Pro     | No per-token API costs         |

## Commands

### Quick consult

```powershell
codex exec "How should I optimize the Express middleware chain?" --sandbox read-only
```

### Interactive session

```powershell
codex "Help me debug the auth flow"
```

### Code review

```powershell
codex review server/routes/api.ts
```

## Architecture

```
Claude Code (Orchestrator)
    │
    ├── codex exec "prompt" → GPT-5.3-codex suggestions
    │
    └── Implements solution (file edits, tests, etc.)
```

Codex provides **suggestions in sandbox**. Claude Code executes all actions.

## Files

- `env.ps1` - Environment setup + CLI verification
- `scripts/setup-maestro.ps1` - Diagnostic script
- `snippets/common-workflows.md` - Example commands

## Auth

Codex CLI uses your ChatGPT Pro subscription via OAuth. Check status:

```powershell
codex login status
```
