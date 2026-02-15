# Codex CLI - Common Workflows for Updog_restore

## Setup (once per session)

```powershell
. .\tools\maestro\env.ps1
```

## One-Shot Commands

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

## Iterative Collaboration

Use when the first answer is unlikely to be complete. Claude Code drives the
loop; Codex proposes; Claude critiques until consensus.

### Pattern

```
Claude:  codex exec "<task + context from round N-1>" --sandbox read-only
Codex:   [proposal]
Claude:  [critique: Feasibility/Efficiency/Sophistication/Correctness]
         [severity: blocking | important | minor]
         If blocking findings remain -> iterate
         If none blocking -> consensus reached
```

### Example: Architecture Decision

```
-- Round 1 --
Claude calls: codex exec "We need to add WebSocket support for real-time
  dashboard updates. Options: Socket.io, native ws, SSE. Evaluate tradeoffs
  for our Express + React + TanStack Query stack." --sandbox read-only

Codex proposes: Socket.io with rooms per fund...

Claude critiques:
  [blocking] Socket.io adds 45KB bundle weight - have you checked if SSE
    suffices for our uni-directional update pattern?
  [important] No mention of Redis adapter for multi-process workers
  [minor] Could use compression option

-- Round 2 --
Claude calls: codex exec "Revised: SSE vs Socket.io for uni-directional
  dashboard updates. Address Redis adapter for BullMQ workers. Our stack:
  Express, React, TanStack Query, Redis already in use." --sandbox read-only

Codex refines: SSE for dashboard, Socket.io reserved for bidirectional...

Claude critiques:
  [important] Good split. Add reconnection strategy for SSE drops.
  No blocking findings -> consensus reached.
```

### Example: Performance Optimization

```
-- Round 1 --
Claude calls: codex exec "Profile shows slow response on GET /api/funds/:id.
  Currently loads all investments eagerly. Database: PostgreSQL + Drizzle ORM.
  Suggest optimization strategy." --sandbox read-only

Claude critiques:
  [blocking] Suggested adding Redis cache but missed that we already have
    TanStack Query client-side caching. Quantify DB query time first.

-- Round 2 --
Claude calls: codex exec "Revised: GET /api/funds/:id slow. TanStack Query
  handles client cache. Issue is DB query joining investments + transactions.
  Drizzle ORM, PostgreSQL. Show query plan approach." --sandbox read-only

Claude critiques:
  No blocking findings -> implement with partial index suggestion.
```

## Forensic Engineer Workflow

Four mandatory phases for features, bugs, and refactors. Each phase gets a Codex
call + Claude critique before advancing.

### Pattern

```
PHASE 1 - ANALYZE
  Claude calls: codex exec "ANALYZE: <task>. Validate these assumptions:
    <assumptions>. Check files: <file list>." --sandbox read-only
  Claude critiques: accuracy of file references, assumption validity
  Output: validated assumptions, corrected findings

PHASE 2 - PLAN
  Claude calls: codex exec "PLAN: Based on analysis: <findings>.
    Create concrete steps. Requirements: <requirements>." --sandbox read-only
  Claude critiques: feasibility, specificity, missing steps
  Output: executable step list

PHASE 3 - EXECUTE
  Claude calls: codex exec "EXECUTE step N: <step detail>.
    Preconditions: <what must be true>." --sandbox read-only
  Claude implements each step, runs tests between steps
  Output: implemented changes with passing tests

PHASE 4 - VERIFY
  Claude calls: codex exec "VERIFY: Requirements were: <requirements>.
    Changes made: <summary>. Check for regressions." --sandbox read-only
  Claude critiques: coverage gaps, regression risks
  Output: confirmed requirements met OR issues to address
```

### Example: Bug Fix with Unknown Root Cause

```
ANALYZE:
  codex exec "ANALYZE: LP report PDF shows wrong capital account balance
    for multi-year transactions. Files: server/services/pdf-generation-service.ts,
    tests/fixtures/lp-report-fixtures.ts. Validate: is the builder receiving
    stale data or computing incorrectly?" --sandbox read-only

PLAN:
  codex exec "PLAN: Analysis confirmed builder receives correct data but
    applies transactions in insertion order, not date order. Requirements:
    1. Sort transactions by date before aggregation
    2. Existing 63 tests still pass
    3. Add test for multi-year ordering edge case" --sandbox read-only

EXECUTE:
  [Claude implements sort + new test, runs vitest]

VERIFY:
  codex exec "VERIFY: Added date-sort in buildCapitalAccountReportData.
    New test covers multi-year ordering. 64/64 tests pass. Any regression
    risk in report generation queue or prefetch layer?" --sandbox read-only
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

## Sandbox Modes

| Mode           | Use Case                        |
| -------------- | ------------------------------- |
| `read-only`    | Analysis, suggestions (default) |
| `network-only` | API testing                     |
| `full`         | Full implementation (careful!)  |

## Auth Management

```powershell
codex login status    # Check current auth
codex login           # Re-authenticate
codex logout          # Clear credentials
```
