---
status: HISTORICAL
last_updated: 2026-01-19
---

# PR #113 Split Instructions

## Overview

PR #113 currently contains two unrelated features:
1. **RS256 JWT Authentication** (P0 security fix)
2. **Deterministic Fund Calculation Engine** (new feature)

These must be split into separate PRs for proper review.

---

## Option A: Interactive Cherry-Pick (RECOMMENDED)

This method preserves commit history and is cleanest for review.

### Step 1: Identify Commits

```bash
# View commits in PR #113
git log --oneline origin/main..HEAD

# Example output:
# 7eff676 feat: PR #3 - Full deterministic fund calculation engine
# 272745e feat: PR #2 (partial) - Deterministic fund calc stub + CSV export routes
# <auth-commit-hash> auth(rs256): restore RS256 + JWKS
```

### Step 2: Create Auth Branch

```bash
# Start from main
git checkout main
git pull origin main

# Create new auth branch
git checkout -b fix/rs256-jwt-auth

# Cherry-pick only auth commits
git cherry-pick <auth-commit-hash>

# Push and create PR
git push -u origin fix/rs256-jwt-auth
gh pr create --title "HOTFIX: Restore RS256 JWT authentication (P0)" \
             --body "See docs/observability/pr-113-auth-comment.md for review"
```

### Step 3: Create Fund Calc Branch

```bash
# Start from main
git checkout main

# Create new fund calc branch
git checkout -b feat/deterministic-fund-engine

# Cherry-pick fund calc commits IN ORDER
git cherry-pick 272745e  # PR #2 stub
git cherry-pick 7eff676  # PR #3 full implementation

# Push and create PR
git push -u origin feat/deterministic-fund-engine
gh pr create --title "feat(calc): Deterministic fund modeling engine" \
             --body "See docs/observability/pr-113-fundcalc-comment.md for review"
```

### Step 4: Close Original PR

```bash
# Close PR #113
gh pr close 113 --comment "Split into separate PRs: #<auth-pr-number> (P0 auth fix) and #<calc-pr-number> (fund calc feature)"
```

---

## Option B: Manual File Splitting

If commits are too tangled, split by files manually.

### Step 1: Create Auth Branch

```bash
# Start from PR #113 branch
git checkout <pr-113-branch-name>
git checkout -b fix/rs256-jwt-auth

# Reset to main but keep working directory
git reset --soft $(git merge-base fix/rs256-jwt-auth origin/main)

# Unstage everything
git restore --staged .

# Re-stage ONLY auth files
git add server/config/auth.ts \
        server/lib/auth/jwt.ts \
        server/lib/auth/__tests__/jwt.test.ts \
        server/lib/secure-context.ts \
        server/lib/headers-helper.ts \
        docs/auth/RS256-SETUP.md \
        .env.example

# Check what's staged
git status

# Commit
git commit -m "auth(rs256): restore RS256 + JWKS with hardened middleware

- Add RS256 + JWKS support using jose library
- Implement JWKS client with automatic key rotation
- Add fail-fast configuration validation
- Make extractUserContext async for JWKS fetching
- Add comprehensive error handling with reason codes
- Maintain HS256 backward compatibility

Security improvements:
- Algorithm whitelist enforcement
- Clock skew tolerance (±5 minutes)
- Required claim validation (sub, iss, aud)
- JWKS caching with rotation support

BREAKING: extractUserContext is now async
"

# Push
git push -u origin fix/rs256-jwt-auth
```

### Step 2: Create Fund Calc Branch

```bash
# Go back to original PR branch
git checkout <pr-113-branch-name>
git checkout -b feat/deterministic-fund-engine

# Reset to main but keep working directory
git reset --soft $(git merge-base feat/deterministic-fund-engine origin/main)

# Unstage everything
git restore --staged .

# Re-stage ONLY fund calc files
git add client/src/lib/fund-calc.ts \
        client/src/lib/decimal-utils.ts \
        client/src/lib/xirr.ts \
        server/routes/calculations.ts \
        server/app.ts \
        tests/fund-calc/**

# Check what's staged
git status

# Commit
git commit -m "feat(calc): deterministic fund modeling engine + CSV export

Core Algorithm:
- Sequential company deployment by stage (deterministic IDs)
- Period-by-period simulation with exact exit timing
- Policy A: immediate distribution (distributions = exitProceeds)
- Management fees with horizon limit (10 years default)

Implementation:
- 100% deterministic (no RNG)
- Decimal.js for financial precision
- Complete period-by-period tracking
- CSV export endpoints for Excel parity

Routes:
- POST /api/calculations/run - JSON output
- POST /api/calculations/export-csv - CSV download

Status: Ready for golden fixture testing
"

# Push
git push -u origin feat/deterministic-fund-engine
```

### Step 3: Create PRs

```bash
# Auth PR (P0)
gh pr create --base main \
             --head fix/rs256-jwt-auth \
             --title "HOTFIX: Restore RS256 JWT authentication (P0 - Production Blocker)" \
             --body-file docs/observability/pr-113-auth-comment.md

# Fund Calc PR (Feature)
gh pr create --base main \
             --head feat/deterministic-fund-engine \
             --title "feat(calc): Deterministic fund modeling engine with CSV export" \
             --body-file docs/observability/pr-113-fundcalc-comment.md

# Close original
gh pr close 113 --comment "Split into separate PRs for clearer review: #<auth-pr> (P0 auth) and #<calc-pr> (fund calc)"
```

---

## Option C: Rebase Interactive (Advanced)

If you're comfortable with git rebase, you can reorganize commits:

```bash
# Start from PR branch
git checkout <pr-113-branch-name>

# Interactive rebase from main
git rebase -i origin/main

# In the editor, reorder commits:
# - Move all auth commits to top
# - Move all fund calc commits to bottom
# - Save and exit

# Create auth branch from first N commits
git checkout -b fix/rs256-jwt-auth HEAD~<num-calc-commits>
git push -u origin fix/rs256-jwt-auth

# Create fund calc branch from remaining commits
git checkout <pr-113-branch-name>
git checkout -b feat/deterministic-fund-engine
git rebase --onto origin/main fix/rs256-jwt-auth
git push -u origin feat/deterministic-fund-engine
```

---

## Verification Checklist

After splitting, verify each PR contains ONLY its files:

### Auth PR Should Contain:
- ✅ `server/config/auth.ts`
- ✅ `server/lib/auth/jwt.ts`
- ✅ `server/lib/auth/__tests__/jwt.test.ts`
- ✅ `server/lib/secure-context.ts`
- ✅ `docs/auth/RS256-SETUP.md`
- ✅ `.env.example` (auth section only)
- ❌ NO fund-calc.ts
- ❌ NO calculations.ts

### Fund Calc PR Should Contain:
- ✅ `client/src/lib/fund-calc.ts`
- ✅ `server/routes/calculations.ts`
- ✅ `server/app.ts` (calculations route wiring)
- ✅ `tests/fund-calc/**`
- ❌ NO auth files
- ❌ NO jwt.ts

---

## Build & Test Verification

After splitting, verify each PR builds and tests pass independently:

```bash
# Test auth branch
git checkout fix/rs256-jwt-auth
npm install
npm run build
npm test server/lib/auth/__tests__/

# Test fund calc branch
git checkout feat/deterministic-fund-engine
npm install
npm run build
npm test tests/fund-calc/
```

---

## Troubleshooting

### "Files have conflicts during cherry-pick"

```bash
# Abort and use Option B (manual file splitting)
git cherry-pick --abort
```

### "Commit affects both auth and calc files"

```bash
# Use interactive rebase to split the commit:
git rebase -i HEAD~1
# Change 'pick' to 'edit'
# Save and exit

# Unstage all files
git reset HEAD^

# Stage and commit auth files
git add server/lib/auth/**
git commit -m "auth: <description>"

# Stage and commit calc files
git add client/src/lib/fund-calc.ts
git commit -m "feat(calc): <description>"

# Continue rebase
git rebase --continue
```

### "Lost track of original PR branch"

```bash
# Fetch original PR
git fetch origin pull/113/head:pr-113-backup

# Now you can reference pr-113-backup for files
```

---

## Post-Split Workflow

1. **Review Auth PR first** (P0 blocker)
   - Address blocking security issues
   - Get tests passing
   - Merge to main

2. **Review Fund Calc PR** (feature)
   - Address configuration issues
   - Add golden fixtures
   - Merge to main

3. **Clean up branches**
   ```bash
   git branch -D <pr-113-branch-name>
   git push origin --delete <pr-113-branch-name>
   ```

---

## Questions?

- Auth PR review comments: [docs/observability/pr-113-auth-comment.md](./pr-113-auth-comment.md)
- Fund Calc PR review comments: [docs/observability/pr-113-fundcalc-comment.md](./pr-113-fundcalc-comment.md)
- Full review: [docs/observability/pr-113-review.md](./pr-113-review.md)
