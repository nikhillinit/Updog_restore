# Session: 2026-02-20 (Session 2 - CI Recovery Continuation)

## Summary

Continued PR #522 CI unblock work from previous session. Discovered that the
initial hypothesis (fund-idempotency cascade) was only partially correct. After
quarantining fund-idempotency, 8 different integration tests still fail. Root
cause analysis revealed that `setupFiles` in vitest.config.int.ts spawns a new
Express server per test file in singleFork mode. After ~31 spawn/kill cycles, CI
runners can no longer start new servers within the 30s healthz timeout.
Attempted process group kill fix (detached + kill(-pid)) which is technically
correct but doesn't solve the resource ceiling. The strategic fix is migrating
from `setupFiles` to `globalSetup` for shared server lifecycle.

## Work Completed

- Committed fund-idempotency quarantine (2a18a571)
- Committed process group kill for test teardown (9068d6de)
- Diagnosed true root cause: setupFiles per-file server spawning (~31 cycle CI
  limit)
- Identified 8 consistently-failing test files (last in execution order)
- Staged 8-file quarantine in vitest.config.int.ts (commit not yet made, user
  paused)
- Generated session learnings report

## Commits This Session

- `2a18a571` - fix: quarantine fund-idempotency.spec.ts
- `9068d6de` - fix: kill entire process group in integration test teardown

## Decisions Made

- fund-idempotency quarantined as Fallback B (from prior session decision)
- Process group kill kept as correctness improvement even though it doesn't fix
  the ceiling
- User paused before committing 8-file quarantine to reassess strategy

## Key Technical Findings

1. **setupFiles runs per test file, not once globally** -- this is the root
   cause
2. Server DOES start (port detected in ~3.5s) but healthz never responds after
   cycle ~31
3. The server uses a database MOCK in test mode -- Postgres connection
   exhaustion ruled out
4. /healthz is a simple sync 200 handler -- no middleware/DB blocking
5. Same 8 files fail regardless of process cleanup strategy
6. The 8 failing files are simply the LAST in execution order (no bugs of their
   own)

## CI Gate Status (as of session end)

- CodeQL: PASS
- validate-reflections: PASS
- Test unit: PASS
- Test e2e: PASS
- Build Production: PASS
- **Test integration: FAIL** (8 files, server startup timeout)
- **CI Gate Status: FAIL** (depends on Test integration)

## Open Questions

- Should we quarantine the 8 files (tactical) or migrate to globalSetup
  (strategic)?
- If globalSetup: how to handle test isolation (shared server state between
  files)?
- Some quarantined files (funds.contract.spec.ts, forbidden-tokens.test.ts)
  don't use HTTP at all -- could be moved to unit tests instead

## Files Modified (uncommitted)

- `vitest.config.int.ts` -- 8 additional quarantine excludes (STAGED, not
  committed)

---

_Session duration: ~45 min_
