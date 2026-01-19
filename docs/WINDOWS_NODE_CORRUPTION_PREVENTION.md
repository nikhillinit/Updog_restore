---
status: ACTIVE
last_updated: 2026-01-19
---

# Windows Node.js Corruption Prevention Guide

**Last Updated:** October 4, 2025
**Status:** Living Document
**Audience:** Developers working on Windows environments

---

## 🎯 Purpose

This guide documents everything learned from the October 2025 node_modules corruption incident to prevent future occurrences.

---

## 📋 What Happened (Summary)

**Timeline:**
- **Oct 3, 2025 (evening):** Multiple attempts to run `npm install` resulted in TAR extraction errors
- **Oct 3, 2025 (20:16):** Issue resolved with targeted fix (commit `94df987`)
- **Oct 4, 2025 (afternoon):** User consulted ChatGPT, discovered issue was already fixed

**Symptoms:**
- `npm install` reported success but packages were missing
- `npm ls vite` returned empty
- `npx vite --version` worked (from npx cache)
- Dev server failed with `ERR_MODULE_NOT_FOUND`

**Root Causes:**
1. Windows PATH not resolving `node_modules/.bin/vite`
2. Global `NODE_ENV=production` overriding `.env` files
3. Missing `dotenv` package dependency

---

## ✅ Permanent Fixes (Already in Codebase)

### 1. Use `npx` Instead of Direct Binary Calls

**File:** `package.json`

```json
{
  "scripts": {
    "dev:client": "npx vite"  // ✅ Uses npx (works)
    // NOT: "dev:client": "vite"  // ❌ Relies on PATH
  }
}
```

**Why this works:**
- `npx` explicitly resolves packages, bypassing Windows PATH issues
- Works even if `node_modules/.bin` isn't in PATH
- Cross-platform compatible

### 2. Force Environment Variable Overrides

**File:** `server/config/index.ts`

```typescript
import { config as loadDotenv } from 'dotenv';

// Load .env file and override any existing env vars (important for NODE_ENV)
loadDotenv({ override: true });
```

**Why this works:**
- Windows often has global `NODE_ENV` set from previous sessions
- Default dotenv **doesn't override** existing env vars
- `override: true` forces `.env` values to win

### 3. Declare All Used Dependencies

**File:** `package.json`

```json
{
  "dependencies": {
    "dotenv": "^17.2.3"  // ✅ Explicitly declared
  }
}
```

**Why this works:**
- Prevents "works on my machine" issues
- npm won't skip packages that are declared
- Lock file stays consistent

---

## 🛡️ Prevention Checklist

### Before Every `npm install`

- [ ] **Check Node version:** `node -v` (should be 20.17.0+)
- [ ] **Check npm version:** `npm -v` (should be 10.9.0+)
- [ ] **Verify clean state:** No stale `node_modules` from failed installs
- [ ] **Check PATH length:** Project path under 100 characters (Windows limit: 260)

### Environment Setup (One-Time)

- [ ] **Pin Node version:** Add `.nvmrc` with `20.17.0`
- [ ] **Configure npm for Windows:**
  ```bash
  npm config set longpaths true
  npm config set engine-strict false
  ```
- [ ] **Add antivirus exclusions:**
  - `C:\dev\` (or your projects folder)
  - `C:\Users\<username>\AppData\Roaming\npm\`
  - `C:\Users\<username>\AppData\Roaming\npm-cache\`

### Project Configuration

- [ ] **Lock toolchain in `package.json`:**
  ```json
  {
    "engines": {
      "node": ">=20.17.0 <21",
      "npm": ">=10.9.0"
    }
  }
  ```
- [ ] **Use `npx` for all binary calls** in scripts
- [ ] **Always use `loadDotenv({ override: true })`** in server config
- [ ] **Keep `package-lock.json` committed** to version control

---

## 🚨 What to Do If Corruption Happens

### Level 1: Quick Reset (2 minutes)

```bash
# Clean install
rm -rf node_modules package-lock.json
npm cache clean --force
npm install

# Verify
npm ls vite
npm run dev:client
```

### Level 2: Deep Clean (5 minutes)

```bash
# Clear all npm state
rm -rf node_modules package-lock.json
npm cache clean --force

# Reset npm config
npm config delete prefix
npm config set longpaths true
npm config set engine-strict false

# Reinstall
npm install

# Verify
npx vite --version
npm run dev
```

### Level 3: Nuclear Option (15 minutes)

```bash
# Switch to correct Node version
nvm install 20.17.0
nvm use 20.17.0

# Clear everything
rm -rf node_modules package-lock.json
del %USERPROFILE%\.npmrc  # Windows user config
npm cache verify

# Reinstall from scratch
npm install

# If still fails, check:
npm config list  # Look for weird settings
npm prefix      # Should be project root
```

---

## 🔍 Diagnostic Commands

### Check Installation Health

```bash
# 1. Verify Node/npm versions
node -v   # Should be v20.17.0 or higher
npm -v    # Should be 10.9.0 or higher

# 2. Check if vite is installed
npm ls vite
Test-Path node_modules\vite  # PowerShell
ls node_modules/vite         # Git Bash

# 3. Check package count (should be ~900+)
(Get-ChildItem node_modules -Directory).Count  # PowerShell
ls node_modules | wc -l                        # Git Bash

# 4. Verify npm is installing to correct location
npm prefix      # Should equal project root
npm prefix -g   # Should be Node installation dir, not project

# 5. Check for problematic config
npm config list
# Look for: engine-strict, prefix, ignore-scripts
```

### Check Environment Health

```bash
# 1. Check PATH length
echo $PWD | wc -c  # Should be < 100 characters

# 2. Check for global NODE_ENV
echo $env:NODE_ENV  # PowerShell
echo $NODE_ENV      # Git Bash
# Should be empty or "development"

# 3. Verify .env is being loaded
cat .env.local
# Check NODE_ENV is set to "development"

# 4. Check antivirus isn't blocking
# Windows Security → Virus & threat protection → Protection history
# Look for blocked actions in node_modules
```

---

## ❌ What NOT to Do

### Don't: Use Global Installs for Project Dependencies
```bash
# ❌ BAD
npm install -g vite
npm link vite

# ✅ GOOD
npm install vite --save-dev
```

### Don't: Mix Package Managers
```bash
# ❌ BAD - mixing npm and yarn
npm install
yarn add some-package

# ✅ GOOD - pick one and stick with it
npm install
npm install some-package
```

### Don't: Manually Edit node_modules
```bash
# ❌ BAD - editing files in node_modules
notepad node_modules\vite\package.json

# ✅ GOOD - use package.json overrides or patches
{
  "overrides": {
    "vite": "6.3.6"
  }
}
```

### Don't: Ignore Engine Warnings (Temporarily OK)
```bash
# ⚠️ TEMPORARILY OK (if you understand the risk)
npm install  # Shows EBADENGINE warnings
# These are dev dependencies that work on 20.17, just want 20.19+

# ✅ BETTER - silence non-critical warnings
npm config set engine-strict false
```

### Don't: Delete package-lock.json Without Reason
```bash
# ❌ BAD - deleting lock file for no reason
rm package-lock.json
npm install  # Gets different versions

# ✅ GOOD - only delete if truly corrupted
# And commit the new one immediately
```

---

## 📚 Reference: The Actual Fix (Commit 94df987)

### Files Changed

**1. `package.json`**
```diff
- "dev:client": "vite",
+ "dev:client": "npx vite",

  "dependencies": {
+   "dotenv": "^17.2.3",
  }
```

**2. `server/config/index.ts`**
```diff
+ import { config as loadDotenv } from 'dotenv';
  import { z } from 'zod';

+ // Load .env file and override any existing env vars (important for NODE_ENV)
+ loadDotenv({ override: true });
```

**3. `package-lock.json`**
- Locked dotenv and its dependencies

### Why This Fixed Everything

1. **`npx vite`** - Bypassed Windows PATH resolution issues
2. **`loadDotenv({ override: true })`** - Forced correct NODE_ENV from .env
3. **`dotenv` dependency** - Made implicit dependency explicit

**Total changes:** 3 lines of code + 1 dependency

**Resolution time:** ~1 hour from diagnosis to fix

---

## 🎓 Lessons Learned

### What We Thought vs. What It Was

| **Initial Diagnosis** | **Actual Issue** |
|----------------------|------------------|
| Windows 260-char path limit | Windows PATH resolution |
| Antivirus blocking file writes | Missing `npx` in script |
| TAR extraction failures | Global NODE_ENV override |
| Corrupt npm cache | Missing dependency declaration |
| Need WSL2/Docker | Need 3 lines of code |

### Why Complex Solutions Seemed Necessary

1. **TAR errors were red herrings** - Scary but not root cause
2. **Multiple symptoms masked simple fix** - Looked like deep corruption
3. **Windows has a reputation** - Biased toward infrastructure solutions
4. **ChatGPT amplified concerns** - "Critical corruption" diagnosis

### The Real Fix Was Simple

- Use `npx` for binary execution
- Force environment variable priority
- Declare all dependencies

**No infrastructure changes needed.**

---

## 🔄 For New Developers

### First-Time Setup Checklist

1. **Clone repository:**
   ```bash
   git clone <repo-url>
   cd <project>
   ```

2. **Install correct Node version:**
   ```bash
   nvm install
   nvm use
   ```

3. **Configure npm for Windows:**
   ```bash
   npm config set longpaths true
   npm config set engine-strict false
   ```

4. **Install dependencies:**
   ```bash
   npm install
   ```

5. **Verify installation:**
   ```bash
   npm ls vite
   npm run dev:client
   ```

6. **Add antivirus exclusions:**
   - Windows Security → Virus & threat protection
   - Exclusions → Add folder → `C:\dev\<project>`

### Daily Development

```bash
# Start dev environment
npm run dev

# If issues occur, clean reinstall
rm -rf node_modules package-lock.json
npm install
```

---

## 📞 Getting Help

### If You Encounter Issues

1. **Check this guide first** - Most issues documented here
2. **Run diagnostics** - Use commands from "Diagnostic Commands" section
3. **Try Level 1 reset** - Usually fixes 90% of issues
4. **Check incident log** - `INCIDENT_LOG_REDIS_DB_HARDENING.md`
5. **Create issue** - Document exact error messages and steps

### What to Include in Issue Reports

- [ ] Node version: `node -v`
- [ ] npm version: `npm -v`
- [ ] OS: Windows version
- [ ] Exact error message (copy/paste, not screenshot)
- [ ] Steps to reproduce
- [ ] Output of `npm config list`
- [ ] Output of `npm prefix`
- [ ] Contents of `.env.local` (redact secrets)

---

## 🔮 Future Improvements

### Short-Term (Next Sprint)
- [ ] Add automated environment validator script
- [ ] Create `setup-windows.ps1` one-click setup
- [ ] Add pre-install checks to `package.json`
- [ ] Document WSL2 alternative setup

### Long-Term (Next Quarter)
- [ ] Migrate to Docker dev containers (eliminate OS issues)
- [ ] Add CI/CD Windows runner (catch issues early)
- [ ] Create automated diagnostics script
- [ ] Add telemetry for silent failures

---

## 📖 Related Documentation

- **Incident Log:** `INCIDENT_LOG_REDIS_DB_HARDENING.md` - Full post-mortem
- **Dev Environment Reset:** `docs/dev-environment-reset.md` - Reset procedures
- **Bootstrap Guide:** `DEV_BOOTSTRAP_README.md` - Initial setup
- **Changelog:** `CHANGELOG.md` - All changes with timestamps

---

## ✅ Success Metrics

**Environment is healthy when:**
- ✅ `npm install` completes with zero errors
- ✅ `npm ls vite` shows installed version
- ✅ `npm run dev` starts both client and API
- ✅ Frontend accessible at `http://localhost:5173`
- ✅ Backend accessible at `http://localhost:5000`
- ✅ Hot reload works correctly
- ✅ No NODE_ENV warnings

**Time to fix (if corruption occurs):**
- Level 1 reset: ~2 minutes
- Level 2 reset: ~5 minutes
- Level 3 reset: ~15 minutes

---

*Last updated: October 4, 2025*
*Maintained by: Development Team*
*Status: Active prevention guide*
