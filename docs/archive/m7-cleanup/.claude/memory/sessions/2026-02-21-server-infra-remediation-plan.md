# Session: 2026-02-21 (Server Infrastructure Remediation Planning)

## Summary

Conducted deep audit verification and multi-round plan review for 9 claimed
server infrastructure issues. Independently verified each claim against source
code. 7 confirmed as real bugs (4 High, 3 Medium), 2 downgraded. Three review
rounds refined the plan -- surfacing config field parity requirements, test env
marker needs, ETag user-scoping bug, health subroute prefix matching, Express 4
async constraints, and API shape preservation. Final plan has 7 steps (with 3
sub-steps for config), 9 verification gates.

## Work Completed

- Verified 9 audit claims against source code with 3 parallel Explore agents
- Confirmed: WS wiring, RLS setconfig typo, config split-brain, RS256 sync/async
  mismatch, path exemption bug, rollout TS2532, flag header spoofing
- Downgraded: response logging (truncated to ~35 chars, not verbatim), req.tx
  (dead code)
- Discovered: ETag user-scoping bug (global hash on per-user response), health
  subroute prefix needs
- Incorporated 3 rounds of user review/counterproposal feedback
- Wrote finalized plan to `.claude/plans/fluttering-roaming-marble.md`

## Decisions Made

- Config consolidation: merge legacy fields into canonical module FIRST, then
  shim (not reverse)
- Path matching: mixed strategy (prefix for /health subtree, exact for /flags)
- Express 4: explicit try/catch in all async middleware, no reliance on rejected
  promise propagation
- ETag: route-level hash of evaluated flags for authenticated users (Option A)
- Env preservation: markers for JWT_ALG and JWT_JWKS_URL needed (tests confirmed
  to override)

## Context for Next Session

- Plan is at `.claude/plans/fluttering-roaming-marble.md` -- ready for
  implementation
- Branch to create: `fix/server-infrastructure-remediation`
- Execution order: 1 -> 2 -> 3a -> 3b -> 3c -> 4 -> 5 -> 6 -> 7
- npm run check:fast currently fails with 12 TS2532 errors (Step 6 fixes this)

## Open Questions

- None -- plan approved through 3 review rounds

---

_Session duration: ~45 min (planning only, no code changes)_
