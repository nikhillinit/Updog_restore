# Windows Development Guide

## Quick Start (Recommended)

**TL;DR:** Use GitHub Actions for validation, not local builds.

```bash
# 1. Make changes locally
code .

# 2. Commit and push
git add .
git commit -m "feat: my changes"
git push

# 3. Watch CI/CD
gh pr checks --watch
```

## Why?

- Local npm commands may fail due to Windows PATH issues with `cross-env`
- CI/CD (Linux) is the source of truth
- Faster iteration than debugging Windows PATH configuration

## What Works Locally

✅ **npm run dev** (Vite dev server)
✅ **Code editing** (VS Code, etc.)
✅ **Git operations** (commit, push, branch)
✅ **Docker Compose** (if Docker Desktop installed)

## What to Use CI/CD For

🤖 **npm test** (full test suite)
🤖 **npm run check** (TypeScript type checking)
🤖 **npm run build** (production build)
🤖 **npm run lint** (ESLint validation)

## Alternative: WSL2

If you need local validation:

```bash
# Install WSL2
wsl --install

# Then run all npm commands in WSL
wsl
cd /mnt/c/dev/Updog_restore
npm test
```

## Common Issues

### Issue: `'cross-env' is not recognized`

**Symptoms:**
```
'cross-env' is not recognized as an internal or external command
```

**Solution:**
Use CI/CD for validation instead of debugging PATH. Push your branch and let GitHub Actions validate.

### Issue: Pre-commit/pre-push hooks fail

**Symptoms:**
```
husky - pre-commit script failed (code 1)
'eslint' is not recognized
```

**Solution:**
Use `--no-verify` flag to bypass hooks:

```bash
git commit --no-verify -m "your message"
git push --no-verify
```

CI/CD will still validate everything before merge.

### Issue: TypeScript errors `Cannot find type definition file for 'vite/client'`

**Symptoms:**
```
error TS2688: Cannot find type definition file for 'vite/client'
```

**Solution:**
This is a Windows-specific PATH issue. The code will type-check fine in CI/CD. Push your changes and let GitHub Actions validate.

## Recommended Workflow

### 1. Local Development
```bash
# Start dev server (this works!)
npm run dev

# Make your changes in VS Code
# Preview in browser at http://localhost:5173
```

### 2. Commit & Push Early
```bash
git checkout -b feat/my-feature
git add .
git commit --no-verify -m "wip: initial implementation"
git push --no-verify -u origin feat/my-feature
```

### 3. Watch CI/CD
```bash
# Monitor via CLI
gh pr checks --watch

# Or via GitHub UI
# https://github.com/nikhillinit/Updog_restore/actions
```

### 4. Iterate Based on CI Feedback
```bash
# Fix issues identified by CI
git add .
git commit --no-verify -m "fix: address CI feedback"
git push --no-verify  # Auto-reruns CI
```

### 5. Merge When Green
```bash
# All checks pass → merge
gh pr merge --squash
```

## Benefits of CI/CD-First Development

✅ **No local environment setup frustration**
✅ **Consistent validation (Linux environment)**
✅ **Fast iteration cycle**
✅ **Early detection of issues**
✅ **Works on any platform (Windows, macOS, Linux)**

## When to Run Locally

| Task | Run Locally? | Notes |
|------|--------------|-------|
| Quick syntax checks | ✅ Yes | Use your IDE |
| Component preview | ✅ Yes | `npm run dev:client` |
| Database work | ✅ Yes | Docker Compose locally |
| Type checking | ❌ No | Use CI/CD |
| Full test suite | ❌ No | Use CI/CD |
| Production build | ❌ No | Use CI/CD |
| Bundle analysis | ❌ No | Use CI/CD |
| Performance testing | ❌ No | Use CI/CD (Lighthouse CI) |

## Support

If you encounter issues not covered here:
1. Check CI/CD logs for actual error
2. Ask in #updog-internal-test Slack channel
3. File issue with "windows-dev" label
4. Document solution in this guide

## References

- CI/CD Workflows: `.github/workflows/`
- Internal Test Strategy: `INTERNAL_TEST_READINESS_STRATEGY.md`
- Holistic Execution Plan: `HOLISTIC_EXECUTION_PLAN.md`
