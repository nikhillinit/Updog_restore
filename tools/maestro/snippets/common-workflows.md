# Codex CLI - Common Workflows for Updog_restore

## Setup (once per session)
```powershell
. .\tools\maestro\env.ps1
```

## Basic Commands

### Quick consult (non-interactive)
```powershell
codex exec "How should I optimize the Express middleware chain?" --sandbox read-only
```

### Interactive session
```powershell
codex "Help me debug the authentication flow in server/auth.ts"
```

### Code review
```powershell
codex review server/routes/api.ts
codex review --diff HEAD~1  # Review last commit
```

## Project-Specific Examples

### API Performance
```powershell
codex exec "Review server/bootstrap.ts and suggest performance improvements" --sandbox read-only
```

### Debug failing tests
```powershell
codex "Debug the failing test in __tests__/api/reserves.test.ts"
```

### TypeScript errors
```powershell
codex exec "How to fix: 'Property X does not exist on type Y' errors in server/routes/" --sandbox read-only
```

### Vite build issues
```powershell
codex exec "Analyze vite.config.ts - is the Preact/React mode switching optimal?" --sandbox read-only
```

## From Claude Code (Orchestrator)

When working in Claude Code, I call Codex like this:
```bash
codex exec "Your analysis question" --sandbox read-only
```

Then I evaluate the suggestions and implement the solution.

**Flow**:
```
You: "Optimize the database queries"
Me: [calls codex exec for suggestions]
Me: [evaluates response, implements best approach]
Me: [runs tests to verify]
```

## Sandbox Modes

| Mode | Use Case |
|------|----------|
| `read-only` | Analysis, suggestions (default) |
| `network-only` | API testing |
| `full` | Full implementation (careful!) |

## Auth Management

```powershell
codex login status    # Check current auth
codex login           # Re-authenticate
codex logout          # Clear credentials
```
