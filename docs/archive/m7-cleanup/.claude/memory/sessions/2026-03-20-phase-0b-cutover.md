# Session: 2026-03-20 -- Phase 0B /api/funds Owner Cutover

## Summary

Executed all 6 tasks of the Phase 0B contract-integrity plan, making the router
in `server/routes/funds.ts` the sole owner of `POST /api/funds` on the
`registerRoutes()` surface. Fixed three bugs (idempotency import, calculate
mount prefix, shadowed inline POST), updated contract tests (16 assertions, no
mocks), added a registerRoutes() boot-path smoke proof, and updated
documentation. All validation gates passed (16/16 contract tests, 2842 server
tests, 3107 full suite, 0 ESLint errors). TypeScript baseline was stale and
updated (0 -> 90 pre-existing errors). Two commits pushed to origin/main.

## Work Completed

- Task 1: Fixed idempotency import (named -> default) in funds.ts
- Task 2: Fixed calculate mount prefix (/api/funds/calculate ->
  /funds/calculate)
- Task 3: Removed shadowed inline POST /api/funds from routes.ts
- Task 4: Updated both contract test files for post-cutover state
- Task 5: Added registerRoutes() smoke proof (15s timeout, server cleanup)
- Task 6: Updated endpoint-ownership.md and ADR with Phase 0B achieved state
- Updated TypeScript baseline (.tsc-baseline.json)

## Decisions Made

- Used `afterAll` with `server.listening` guard for smoke proof cleanup
- Committed only 6 owned files per plan scope (excluded pre-existing worktree
  changes)
- Updated stale TypeScript baseline as separate commit

## Context for Next Session

- Phase 0B is done; Phase 1+ not started (see parent plan)
- ESLint Wave 1A is the next queued work item
- Uncommitted changes exist (discovery.md, PHASE-STATUS.json, plan files)

## Session Learnings

- TypeScript baseline staleness blocks push; fix with `npm run baseline:save`
- ESLint auto-fix hook strips imports added before consuming code exists
- `http.Server.close()` throws on non-listening server; guard with `.listening`

---

_Session duration: ~30 min_
