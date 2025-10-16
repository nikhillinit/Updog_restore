# WSL2 Build Test Guide - Docker Alternative

**Date**: October 16, 2025 **Purpose**: Validate Linux build compatibility using
WSL2 instead of Docker **Time**: 5-10 minutes

---

## Why WSL2 Instead of Docker?

| Aspect              | Docker Desktop             | WSL2                               |
| ------------------- | -------------------------- | ---------------------------------- |
| **Setup**           | 10-30 minutes              | Already installed ✅               |
| **Reliability**     | Frequent issues on Windows | Rock solid                         |
| **Performance**     | Virtualized (slower)       | Native Linux kernel (faster)       |
| **Resource Usage**  | 2-4GB RAM                  | Minimal (grows as needed)          |
| **CI Match**        | Good                       | Exact (GitHub Actions uses Ubuntu) |
| **User Experience** | "Consistently had trouble" | No reported issues                 |

**Verdict**: WSL2 is superior for this use case

---

## Your System Status

```
✅ WSL2 Installed: Ubuntu-22.04 (Version 2)
✅ Windows Node: 20.19.0, npm 10.9.2
⚠️ WSL2 Node: Unknown (need to check)
✅ Sidecar: Auto-disables in CI environment
```

---

## Quick Start (5-10 Minutes)

### Step 1: Check WSL2 Node.js (1 minute)

```bash
# From Windows PowerShell:
wsl node -v
wsl npm -v
```

**If Node.js NOT installed**:

```bash
wsl

# Install Node.js 20 in WSL2:
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify:
node -v  # Should show v20.x
npm -v   # Should show 10.x

exit
```

---

### Step 2: Run Build Test (5-10 minutes)

```bash
# Start WSL2
wsl

# Navigate to project (Windows drives are at /mnt/c)
cd /mnt/c/dev/Updog_restore

# IMPORTANT: Set CI flag to disable sidecar
export CI=true

# Verify sidecar is disabled
echo "Sidecar should be disabled with CI=true"

# Clean install (optional - use if you want fresh test)
# rm -rf node_modules package-lock.json

# Install dependencies
npm ci

# Check that sidecar didn't create junctions
ls -la node_modules/vite
# Should show: drwxr-xr-x (directory, not symlink)
# If shows: lrwxrwxrwx (symlink), CI flag didn't work

# Run full validation with timing
echo "=== Starting build validation ==="
time (npm run typecheck && npm run build && npm test)

# Record the "real" time from output
echo "=== Build validation complete ==="

# Exit WSL2
exit
```

---

### Step 3: Document Results

**If Successful** ✅:

```powershell
# From Windows PowerShell:
Add-Content -Path "docs\BUILD_READINESS.md" -Value @"

## WSL2 Build Test Results

**Date**: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
**Status**: ✅ PASSED
**Environment**: WSL2 Ubuntu-22.04
**Duration**: [copy "real" time from output]
**Node.js**: $(wsl node -v)
**npm**: $(wsl npm -v)

**Tests Performed**:
- ✅ npm ci (dependency installation)
- ✅ npm run typecheck (TypeScript compilation)
- ✅ npm run build (production build)
- ✅ npm test (test suite)

**Sidecar Status**: Correctly disabled via CI=true flag
**Conclusion**: Linux build compatibility CONFIRMED
"@
```

**If Failed** ❌:

```powershell
# Document failure:
Add-Content -Path "docs\BUILD_READINESS.md" -Value @"

## WSL2 Build Test Results

**Date**: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
**Status**: ❌ FAILED
**Environment**: WSL2 Ubuntu-22.04
**Error**: [paste error message]

**Investigation Needed**:
- Check if CI flag disabled sidecar (ls -la node_modules/vite)
- Check Node.js version compatibility
- Review error logs
- Add 1-2 days to timeline for debugging
"@
```

---

## Troubleshooting

### Issue 1: WSL2 Not Found

**Symptoms**: `wsl: command not found`

**Fix**:

```powershell
# Install WSL2:
wsl --install

# Restart computer
# Then install Ubuntu:
wsl --install -d Ubuntu-22.04
```

---

### Issue 2: Node.js Version Mismatch

**Symptoms**: Build fails with Node.js errors in WSL2

**Fix**:

```bash
wsl

# Remove old Node.js:
sudo apt-get remove nodejs npm

# Install Node.js 20:
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify:
node -v  # Should be v20.x

exit
```

---

### Issue 3: Sidecar Still Active in WSL2

**Symptoms**: `node_modules/vite` is a symlink instead of directory

**Fix**:

```bash
wsl
cd /mnt/c/dev/Updog_restore

# Ensure CI flag is set:
export CI=true
echo $CI  # Should show: true

# Clean and reinstall:
rm -rf node_modules
npm ci

# Verify sidecar disabled:
ls -la node_modules/vite  # Should be drwxr-xr-x (directory)

exit
```

---

### Issue 4: Permission Errors

**Symptoms**: `EACCES` or permission denied errors

**Fix**:

```bash
wsl
cd /mnt/c/dev/Updog_restore

# Fix ownership (if needed):
sudo chown -R $USER:$USER .

# Run test again:
export CI=true
npm ci

exit
```

---

### Issue 5: Slow npm ci in WSL2

**Symptoms**: `npm ci` takes 10+ minutes

**Cause**: WSL2 accessing Windows filesystem is slower than native Linux

**Optional Optimization** (not required for test):

```bash
wsl

# Copy project to Linux filesystem for faster access:
cp -r /mnt/c/dev/Updog_restore ~/Updog_restore
cd ~/Updog_restore

# Run test from Linux filesystem:
export CI=true
npm ci
npm run build

# This is faster but optional - test from /mnt/c works fine
```

---

## Alternative: GitHub Actions Test

If WSL2 has issues, use GitHub as your "Docker":

### Create Test Workflow

Create `.github/workflows/linux-build-test.yml`:

```yaml
name: Linux Build Validation

on:
  workflow_dispatch: # Manual trigger only

jobs:
  validate:
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Verify sidecar disabled
        run: |
          if [ -L "node_modules/vite" ]; then
            echo "❌ ERROR: Sidecar active (should be disabled in CI)"
            exit 1
          fi
          echo "✅ Sidecar correctly disabled"

      - name: TypeScript check
        run: npm run typecheck

      - name: Build
        run: npm run build

      - name: Test suite
        run: npm test

      - name: Report success
        run: |
          echo "✅ Linux build validation PASSED"
          echo "Node: $(node -v)"
          echo "npm: $(npm -v)"
```

### Run Test

```bash
# Commit workflow file
git add .github/workflows/linux-build-test.yml
git commit -m "test: Add Linux build validation workflow"
git push

# Trigger manually
gh workflow run linux-build-test.yml

# Watch progress
gh run watch

# View logs
gh run view --log
```

**Advantages**:

- ✅ Zero local setup
- ✅ Exact CI environment
- ✅ Can run repeatedly
- ✅ Free on GitHub

**Disadvantages**:

- Requires commit/push
- Takes 3-5 minutes (queue + execution)

---

## Comparison: All Options

| Method              | Time     | Reliability | CI Match | Notes                      |
| ------------------- | -------- | ----------- | -------- | -------------------------- |
| **Docker Desktop**  | 10+ min  | Low         | Good     | User has consistent issues |
| **WSL2 Native**     | 5-10 min | High ✅     | Exact ✅ | Recommended                |
| **GitHub Actions**  | 3-5 min  | High ✅     | Exact ✅ | Fallback option            |
| **Windows CI=true** | 1 min    | Medium      | Partial  | Quick smoke test only      |

---

## Quick Command Reference

### Check WSL2 Status

```bash
wsl --status
wsl -l -v
```

### Full Test (Copy-Paste)

```bash
wsl
cd /mnt/c/dev/Updog_restore
export CI=true
npm ci
time (npm run typecheck && npm run build && npm test)
exit
```

### Quick Smoke Test (Windows)

```powershell
$env:CI = "true"
npm run typecheck
Remove-Item Env:CI
```

---

## Success Criteria

Before marking validation complete:

- [ ] WSL2 Node.js installed (v20.x)
- [ ] CI flag disables sidecar (verified)
- [ ] `npm ci` completes without errors
- [ ] `npm run typecheck` passes
- [ ] `npm run build` succeeds
- [ ] `npm test` passes
- [ ] Results documented in BUILD_READINESS.md
- [ ] Duration recorded (for future reference)

---

## Next Steps After Validation

**If Passed** ✅:

1. Update BUILD_READINESS.md with results
2. Mark Docker validation as complete
3. Proceed with Phase -1 (PR review and CLI build)

**If Failed** ❌:

1. Document error in BUILD_READINESS.md
2. Investigate root cause
3. Consider GitHub Actions fallback
4. Add 1-2 days to timeline

---

**Last Updated**: October 16, 2025 **Recommended Method**: WSL2 Native Build
Test **Estimated Time**: 5-10 minutes
