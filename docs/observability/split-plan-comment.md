---
status: ACTIVE
last_updated: 2026-01-19
---

# PR #113 — Split Plan (housekeeping)

To reduce risk and speed review, let's split the current mixed PR into two focused PRs.

## What goes where

**PR-A (Auth - P0):**
- `server/config/auth.ts`
- `server/lib/auth/**`
- `server/lib/secure-context.ts`
- `server/lib/helpers/asyncHandler.ts`
- `server/routes/admin/auth.ts` (JWKS invalidate)
- `.env.example` (auth section)
- `docs/auth/RS256-SETUP.md`
- Auth tests only

**PR-B (Fund Calc - Feature):**
- `client/src/lib/fund-calc.ts` (+ any local utils)
- `server/routes/calculations.ts` (+ CSV helpers)
- Tests for calc engine (goldens, CSV header, fee accrual)

## Minimal split steps (manual file split)
```bash
# Start from the PR branch
git checkout -b fix/rs256-jwt-auth
git reset --soft $(git merge-base HEAD origin/main)
git restore --staged . && git checkout -- .

# Stage ONLY auth files
git add server/config/auth.ts server/lib/auth server/lib/secure-context.ts \
        server/lib/helpers/asyncHandler.ts server/routes/admin/auth.ts \
        .env.example docs/auth/RS256-SETUP.md
git commit -m "auth(rs256): restore RS256 + JWKS with hardened middleware"

# Push PR-A
git push -u origin fix/rs256-jwt-auth

# Fund calc branch
git checkout -b feat/deterministic-fund-engine origin/<pr-branch>
git reset --soft $(git merge-base HEAD origin/main)
git restore --staged . && git checkout -- .

# Stage ONLY fund calc files
git add client/src/lib/fund-calc.ts server/routes/calculations.ts tests/fund-calc
git commit -m "feat(calc): deterministic fund engine + CSV export tests"

# Push PR-B
git push -u origin feat/deterministic-fund-engine
```

## Verification before opening PRs

**Auth PR contains only:** auth config, verify/middleware, async handler, admin invalidate route, docs & env, auth tests.
**Fund Calc PR contains only:** calc engine, calc routes, calc tests.

After both are open, close #113 with a note linking PR-A and PR-B.
