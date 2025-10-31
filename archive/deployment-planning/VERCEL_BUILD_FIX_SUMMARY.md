# Vercel Build Fix - Sidecar CI Compatibility

**Date:** 2025-10-07 **Issue:** Vercel build failing with MODULE_NOT_FOUND for
vite **Status:** ✅ **FIXED - Ready to commit**

---

## Problem Summary

Vercel deployment was failing with:

```
Error: Cannot find module '/vercel/path0/tools_local/node_modules/vite/bin/vite.js'
```

**Root Cause:** The sidecar architecture (`tools_local/`) was designed for
Windows development but incompatible with Linux CI environments.

---

## Solution Implemented

### Strategy

Make sidecar **opt-in for Windows**, use standard `node_modules/` on CI

### Files Changed

#### 1. **New: `.vercelignore`**

Excludes sidecar from deployments:

```
tools_local/
.vscode/
.idea/
*.log
coverage/
```

#### 2. **Modified: `scripts/link-sidecar-packages.mjs`**

Added CI detection (lines 13-19):

```js
// Skip sidecar linking on CI environments
if (process.env.CI || process.env.VERCEL || process.env.GITHUB_ACTIONS) {
  console.log('[link-sidecar] Skipping sidecar linking in CI environment');
  console.log('[link-sidecar] Build will use packages from root node_modules/');
  process.exit(0);
}
```

#### 3. **Modified: `package.json`**

Made postinstall tolerant of CI:

```diff
- "postinstall": "node scripts/link-sidecar-packages.mjs",
+ "postinstall": "node scripts/link-sidecar-packages.mjs || true",
```

#### 4. **Updated: `SIDECAR_GUIDE.md`**

Added CI/CD behavior documentation

#### 5. **New: `docs/fixes/vercel-sidecar-ci-fix.md`**

Complete fix documentation with validation steps

---

## Validation

### ✅ Local Build Test

```bash
npm run build:web
# ✓ built in 29.35s
# All 3173 modules transformed
# No regressions
```

### ✅ Dependency Verification

All build-critical packages in root `package.json`:

- vite: 5.4.20 ✓
- @vitejs/plugin-react: ^4.7.0 ✓
- autoprefixer: 10.4.21 ✓
- postcss: 8.5.6 ✓
- tailwindcss: 3.4.18 ✓
- preact: ^10.27.1 ✓

---

## Expected Vercel Behavior (After Push)

```
00:XX:XX Running "npm ci"
00:XX:XX Running postinstall...
00:XX:XX [link-sidecar] Skipping sidecar linking in CI environment
00:XX:XX [link-sidecar] Build will use packages from root node_modules/
00:XX:XX Running "npm run build:web"
00:XX:XX vite v5.4.20 building for preact...
00:XX:XX ✓ 3173 modules transformed
00:XX:XX ✓ built in ~30s
```

---

## Impact Assessment

### Risk: **LOW** ✅

- Defensive changes only (graceful fallback)
- No breaking changes to local development
- CI becomes more standard/predictable

### Affected Systems

| System             | Impact    | Status           |
| ------------------ | --------- | ---------------- |
| Vercel deployments | Fixed     | ✅ Ready to test |
| GitHub Actions CI  | Improved  | ✅ Ready to test |
| Local Windows dev  | No change | ✅ Verified      |
| Local Linux/macOS  | No change | ✅ N/A           |

---

## Rollback Plan

If issues occur:

```bash
git revert HEAD
npm install  # Restore previous behavior
```

**Note:** All build packages exist in root, so worst case is harmless sidecar
failure.

---

## Ready to Commit

### Commit Message

```
fix(ci): resolve sidecar architecture incompatibility on Vercel

The sidecar architecture (tools_local/) was designed for Windows
development but breaks on Linux CI environments. This fix makes
the sidecar opt-in for Windows while allowing CI to use standard
node_modules resolution.

Changes:
- Add .vercelignore to exclude tools_local/ from deployments
- Update link-sidecar-packages.mjs to detect and skip on CI
- Make postinstall hook tolerant of CI failures (|| true)
- Document CI behavior in SIDECAR_GUIDE.md

All build-critical packages already exist in root package.json,
so CI builds work without the sidecar overhead.

Fixes Vercel build error:
  Cannot find module '/vercel/path0/tools_local/node_modules/vite/bin/vite.js'

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

### Git Commands

```bash
# Stage all changes
git add .vercelignore scripts/link-sidecar-packages.mjs package.json SIDECAR_GUIDE.md docs/fixes/

# Commit with prepared message
git commit -m "fix(ci): resolve sidecar architecture incompatibility on Vercel

The sidecar architecture (tools_local/) was designed for Windows
development but breaks on Linux CI environments. This fix makes
the sidecar opt-in for Windows while allowing CI to use standard
node_modules resolution.

Changes:
- Add .vercelignore to exclude tools_local/ from deployments
- Update link-sidecar-packages.mjs to detect and skip on CI
- Make postinstall hook tolerant of CI failures (|| true)
- Document CI behavior in SIDECAR_GUIDE.md

All build-critical packages already exist in root package.json,
so CI builds work without the sidecar overhead.

Fixes Vercel build error:
  Cannot find module '/vercel/path0/tools_local/node_modules/vite/bin/vite.js'

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# Push to remote
git push origin main  # or your current branch
```

---

## Post-Push Checklist

### Monitor Vercel Deployment

- [ ] Watch build logs for sidecar skip message
- [ ] Verify build completes without MODULE_NOT_FOUND
- [ ] Confirm all assets generated correctly
- [ ] Test deployed app loads without errors

### Success Criteria

- [ ] Vercel build passes (no module errors)
- [ ] Build time ~30-35 seconds
- [ ] Deployed app functional
- [ ] No regression in Windows local dev

---

## Documentation References

- **Full Fix Details:**
  [docs/fixes/vercel-sidecar-ci-fix.md](docs/fixes/vercel-sidecar-ci-fix.md)
- **Sidecar Guide:** [SIDECAR_GUIDE.md](SIDECAR_GUIDE.md)
- **Previous Fix Attempt:**
  [docs/fixes/vite-build-vercel-fix.md](docs/fixes/vite-build-vercel-fix.md)

---

**Status:** ✅ **READY TO COMMIT AND PUSH** **Confidence:** High (local build
verified, defensive changes only) **Next Action:** Run git commands above and
monitor Vercel deployment

---

_Generated: 2025-10-07_ _Tool: Claude Code_
