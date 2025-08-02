# 🚀 PR Merge Quick Start Guide

## Overview
This guide helps you efficiently merge your 7 outstanding PRs using the lean automation system.

## Prerequisites
- GitHub CLI (`gh`) installed and authenticated
- Node.js and npm installed
- Git configured with push access

## Outstanding PRs
1. **PR #26** - `ci: test script fix + etag tuning` (High Priority)
2. **PR #25** - `ci: enhance test workflow with caching, concurrency & health-check` 
3. **PR #22** - `feat: enable autofix for async-array-method rule` (DRAFT)
4. **PR #21** - `feat: replace Slack notifications with ETag generation`
5. **PR #19** - `fix: async iteration hardening, tests + eslint rules`
6. **PR #18** - `Restore Sprint G2C docs`
7. **PR #17** - `Restore Sprint G2C Planning Documentation`

## 📅 Day 1 Execution (~2.5 hours active)

### Morning (1 hour)
```bash
# 1. Initialize status tracking
make init-status

# 2. Check current PR status
make pr-status

# 3. Test integration locally first
make test-integration

# 4. If tests pass, merge documentation PRs (safe, no code changes)
make merge-docs

# 5. Push the docs merge
git push origin main
```

### Afternoon (1.5 hours)
```bash
# 6. Merge PR #19 (async fixes - critical foundation)
gh pr merge 19 --merge

# 7. Commit the CI experimental flag we added
git add .github/workflows/test.yml
git commit -m "ci: add experimental flag (default: false)"
git push origin main

# 8. Merge CI PRs with flag OFF
gh pr merge 25 --merge  # Base workflow enhancements
gh pr merge 21 --merge  # Slack to ETag migration
gh pr merge 26 --merge  # ETag tuning

# 9. Watch CI run
make watch
```

## 📅 Day 2 Execution (~1.5 hours active)

### Morning (45 min)
```bash
# 1. Enable experimental features
gh secret set CI_EXPERIMENTAL --body="true"

# 2. Trigger a test run
gh workflow run "CI: enhance test workflow with caching, concurrency & health-check"

# 3. Monitor the run
make watch
```

### Afternoon (45 min)
```bash
# 4. Complete ESLint PR #22
gh pr checkout 22
git rebase main

# 5. Use ESLint's built-in cache for efficiency
npx eslint . --fix --cache --cache-location .eslintcache

# 6. Commit in chunks for reviewability
git add "client/**" && git commit -m "fix: ESLint autofix - client"
git add . && git commit -m "fix: ESLint autofix - server"

# 7. Push and merge
git push origin eslint-autofix
gh pr merge 22 --merge

# 8. Final smoke test
make smoke
```

## 🔍 Monitoring Commands

Open these in separate terminal tabs:

**Tab 1 - PR Status:**
```bash
watch -n 30 'gh pr list --limit 10 --json number,title,state'
```

**Tab 2 - CI Status:**
```bash
make watch
```

**Tab 3 - Progress Log:**
```bash
tail -f STATUS.md
```

## 🚨 Emergency Commands

If something breaks:
```bash
# Quick revert last commit
git revert HEAD --no-edit && git push

# Check CI performance
make perf

# Run smoke test
make smoke

# Disable experimental features
gh secret set CI_EXPERIMENTAL --body="false"
```

## ✅ Success Checklist

### Day 1:
- [ ] Docs PRs merged (#17, #18)
- [ ] PR #19 merged (async fixes)
- [ ] CI PRs merged with flag OFF (#25, #21, #26)
- [ ] One green CI run confirmed

### Day 2:
- [ ] CI experimental flag enabled
- [ ] ESLint PR completed and merged (#22)
- [ ] All tests passing
- [ ] Smoke test successful

## 📊 Expected Outcomes

- **Total PRs merged:** 7
- **CI pipeline time:** <15 minutes
- **Test coverage:** No decrease
- **Active keyboard time:** ~3 hours total

## 🎯 Next Steps

After all PRs are merged:
1. Update CHANGELOG.md
2. Plan Sprint G2C implementation
3. Add observability features to fund model
