# WSL2 Quick Start - Linux Build Test

**Time**: 5-10 minutes | **No Docker needed** ✅

---

## ⚡ Copy-Paste Commands

### 1. Check if Node.js installed in WSL2 (1 minute)

```bash
wsl node -v
wsl npm -v
```

### 2. If Node.js NOT installed (skip if already installed)

```bash
wsl
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v  # Verify v20.x
exit
```

### 3. Run Full Build Test (5-10 minutes)

```bash
wsl
cd /mnt/c/dev/Updog_restore
export CI=true
npm ci
time (npm run typecheck && npm run build && npm test)
exit
```

### 4. Document Results (copy time from output)

```powershell
# If passed:
Add-Content -Path "docs\BUILD_READINESS.md" -Value "`n## WSL2 Build Test Results`n**Date**: $(Get-Date)`n**Status**: ✅ PASSED`n**Duration**: [paste time here]`n**Conclusion**: Linux build compatibility CONFIRMED`n"

# If failed:
Add-Content -Path "docs\BUILD_READINESS.md" -Value "`n## WSL2 Build Test Results`n**Date**: $(Get-Date)`n**Status**: ❌ FAILED`n**Error**: [paste error here]`n"
```

---

## Why WSL2?

- ✅ **Already installed** (Ubuntu-22.04)
- ✅ **No Docker Desktop** (avoided your reported issues)
- ✅ **Faster** (native Linux vs virtualized)
- ✅ **Exact CI match** (GitHub Actions = Ubuntu)

---

## Troubleshooting

**If Node.js version wrong**: See `docs/WSL2_BUILD_TEST.md` Issue 2 **If sidecar
still active**: See `docs/WSL2_BUILD_TEST.md` Issue 3 **If permission errors**:
See `docs/WSL2_BUILD_TEST.md` Issue 4

---

**Full Guide**: `docs/WSL2_BUILD_TEST.md`
